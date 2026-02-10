// Package http hosts HTTP and WebSocket handlers for site-auth./http 包承载 site-auth 的 HTTP 与 WebSocket 处理器。
package http

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ticketStore tracks short-lived WebSocket upgrade tickets./ticketStore 追踪短期有效的 WebSocket 升级凭证。
type ticketStore struct {
	mu   sync.Mutex
	ttl  time.Duration
	data map[string]ticketItem
}

// ticketItem stores metadata for a single ticket./ticketItem 存储单个凭证的元数据。
type ticketItem struct {
	userID    string
	expiresAt time.Time
}

// newTicketStore constructs an in-memory ticket store with TTL enforcement./newTicketStore 构造带 TTL 控制的内存凭证存储。
func newTicketStore(ttl time.Duration) *ticketStore {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	return &ticketStore{
		ttl:  ttl,
		data: make(map[string]ticketItem),
	}
}

// create issues a ticket linked to the provided user ID./create 签发与指定用户 ID 关联的凭证。
func (s *ticketStore) create(userID string) string {
	token := uuid.NewString()
	s.mu.Lock()
	s.data[token] = ticketItem{userID: userID, expiresAt: time.Now().Add(s.ttl)}
	s.mu.Unlock()
	return token
}

// consume invalidates the ticket and returns the owning user ID if valid./consume 使凭证失效并返回所属用户 ID（若有效）。
func (s *ticketStore) consume(token string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	info, ok := s.data[token]
	if !ok {
		return "", false
	}
	delete(s.data, token)
	if time.Now().After(info.expiresAt) {
		return "", false
	}
	return info.userID, true
}

// wsEnvelope represents events exchanged over the WebSocket./wsEnvelope 表示在 WebSocket 上传递的事件。
type wsEnvelope struct {
	Event          string          `json:"event"`
	Version        string          `json:"version"`
	ConversationID string          `json:"conversationId"`
	Payload        json.RawMessage `json:"payload"`
}

// historyMessage captures a past conversation turn./historyMessage 表示历史对话轮次。
type historyMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// userMessagePayload describes inbound user messages./userMessagePayload 描述用户发来的消息负载。
type userMessagePayload struct {
	MessageID      string           `json:"messageId"`
	Text           string           `json:"text"`
	WorkflowID     string           `json:"workflowId"`
	ReplyMessageID string           `json:"replyMessageId"`
	RunID          string           `json:"runId"`
	History        []historyMessage `json:"history"`
	Metadata       map[string]any   `json:"meta"`
}

// cancelPayload requests cancellation for a running conversation./cancelPayload 请求取消正在运行的会话。
type cancelPayload struct {
	RunID string `json:"runId"`
}

// handleCreateWSTicket exchanges a session token for a short-lived ticket./handleCreateWSTicket 将会话令牌兑换为短期凭证。
func (s *Server) handleCreateWSTicket(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		s.logger.Error("failed to issue ticket: missing session token", "status", http.StatusUnauthorized)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}

	sess, err := s.auth.Validate(r.Context(), token)
	if err != nil {
		s.logger.Error("failed to issue ticket: session invalid", "status", http.StatusUnauthorized, "error", err)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}

	// Issue a ticket tied to the authenticated account./签发与认证账号关联的凭证。
	t := s.tickets.create(sess.AccountID)
	s.logger.Info(
		"websocket ticket issued",
		"user_id", sess.AccountID,
		"session_id", maskToken(sess.Token),
		"expires_in", int(s.cfg.AgentTicketTTL.Seconds()),
	)
	writeJSON(w, http.StatusOK, map[string]any{
		"ticket":    t,
		"expiresIn": int(s.cfg.AgentTicketTTL.Seconds()),
		"issuedAt":  time.Now().UTC().Format(time.RFC3339Nano),
	})
}

// handleAgentWebSocket upgrades the client and streams agent responses./handleAgentWebSocket 升级客户端并流式传输智能体响应。
func (s *Server) handleAgentWebSocket(w http.ResponseWriter, r *http.Request) {
	ticket := r.URL.Query().Get("ticket")
	if strings.TrimSpace(ticket) == "" {
		http.Error(w, "missing ticket", http.StatusUnauthorized)
		return
	}

	userID, ok := s.tickets.consume(ticket)
	if !ok {
		http.Error(w, "invalid ticket", http.StatusUnauthorized)
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" || len(s.cfg.AllowedOrigins) == 0 {
				return true
			}
			for _, allowed := range s.cfg.AllowedOrigins {
				if allowed == origin {
					return true
				}
			}
			return false
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	writeMu := &sync.Mutex{}
	runMu := &sync.Mutex{}
	runCancels := make(map[string]context.CancelFunc)

	ctx, cancelAll := context.WithCancel(context.Background())
	defer func() {
		// Cancel active runs and release resources on disconnect./断开连接时取消运行并释放资源。
		cancelAll()
		runMu.Lock()
		for _, cancel := range runCancels {
			cancel()
		}
		runMu.Unlock()
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var env wsEnvelope
		if err := json.Unmarshal(message, &env); err != nil {
			s.writeErrorEvent(writeMu, conn, "", "", "invalid_payload", "无法解析事件")
			continue
		}

		switch env.Event {
		case "user_message":
			var payload userMessagePayload
			if err := json.Unmarshal(env.Payload, &payload); err != nil {
				s.writeErrorEvent(writeMu, conn, env.ConversationID, payload.RunID, "invalid_payload", "payload 无法解析")
				continue
			}
			conversationID := strings.TrimSpace(env.ConversationID)
			if conversationID == "" {
				newID := uuid.NewString()
				ack := map[string]any{
					"event":          "conversation_created",
					"version":        "2.0",
					"conversationId": newID,
					"runId":          payload.RunID,
					"payload": map[string]any{
						"conversationId": newID,
						"previousId":     env.ConversationID,
					},
				}
				s.writeEnvelope(writeMu, conn, ack)
				conversationID = newID
			}

			if payload.RunID == "" {
				payload.RunID = uuid.NewString()
			}
			if payload.ReplyMessageID == "" {
				payload.ReplyMessageID = uuid.NewString()
			}

			runCtx, cancelRun := context.WithCancel(ctx)
			runMu.Lock()
			runCancels[payload.RunID] = cancelRun
			runMu.Unlock()

			go func(p userMessagePayload, convID string) {
				defer func() {
					runMu.Lock()
					delete(runCancels, p.RunID)
					runMu.Unlock()
				}()

				if err := s.forwardToAgent(runCtx, writeMu, conn, userID, convID, p); err != nil {
					if !errors.Is(err, context.Canceled) {
						s.writeErrorEvent(writeMu, conn, convID, p.RunID, "bridge_error", err.Error())
					}
				}
			}(payload, conversationID)

		case "cancel_run":
			var payload cancelPayload
			if err := json.Unmarshal(env.Payload, &payload); err != nil {
				continue
			}
			runMu.Lock()
			cancel, ok := runCancels[payload.RunID]
			if ok {
				cancel()
				delete(runCancels, payload.RunID)
			}
			runMu.Unlock()
		default:
			// Ignore unknown events to remain forward compatible./忽略未知事件以保持向前兼容。
		}
	}
}

// forwardToAgent posts user messages to the agent bridge and streams SSE back./forwardToAgent 将用户消息发送至桥接服务并回传 SSE。
func (s *Server) forwardToAgent(
	ctx context.Context,
	writeMu *sync.Mutex,
	conn *websocket.Conn,
	userID string,
	conversationID string,
	payload userMessagePayload,
) error {
	metadata := payload.Metadata
	if metadata == nil {
		// Use an empty map to simplify downstream merging./使用空映射以简化后续合并。
		metadata = map[string]any{}
	}

	workflowID := strings.TrimSpace(payload.WorkflowID)
	if workflowID == "" {
		workflowID = strings.TrimSpace(s.cfg.DefaultWorkflowID)
	}

	body := map[string]any{
		"user_id":          userID,
		"query":            payload.Text,
		"messages":         s.convertHistory(payload.History),
		"conversation_id":  conversationID,
		"run_id":           payload.RunID,
		"reply_message_id": payload.ReplyMessageID,
		"workflow_id":      workflowID,
		"metadata":         metadata,
		"stream":           true,
	}

	raw, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/v1/agent/runs/stream", strings.TrimRight(s.cfg.AgentBridgeURL, "/")), bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// Add internal token for service-to-service authentication./添加内部令牌用于服务间认证。
	if s.cfg.InternalToken != "" {
		req.Header.Set("X-Internal-Token", s.cfg.InternalToken)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("bridge request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bridge error status=%d body=%s", resp.StatusCode, string(data))
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payloadStr := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payloadStr == "" {
			continue
		}
		var envelope map[string]any
		if err := json.Unmarshal([]byte(payloadStr), &envelope); err != nil {
			continue
		}
		if _, ok := envelope["conversationId"]; !ok {
			envelope["conversationId"] = conversationID
		}
		if _, ok := envelope["runId"]; !ok {
			envelope["runId"] = payload.RunID
		}
		if _, ok := envelope["userId"]; !ok {
			envelope["userId"] = userID
		}

		b, err := json.Marshal(envelope)
		if err != nil {
			continue
		}

		writeMu.Lock()
		err = conn.WriteMessage(websocket.TextMessage, b)
		writeMu.Unlock()
		if err != nil {
			return err
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	return nil
}

// convertHistory transforms typed history into bridge-compatible maps./convertHistory 将类型化历史转换为桥接兼容的映射。
func (s *Server) convertHistory(items []historyMessage) []map[string]string {
	// FIX: Initialize with make to ensure it marshals to [] instead of null
	out := make([]map[string]string, 0, len(items))

	if len(items) == 0 {
		return out // Returns [] in JSON
	}

	for _, item := range items {
		if strings.TrimSpace(item.Content) == "" {
			continue
		}
		out = append(out, map[string]string{
			"role":    item.Role,
			"content": item.Content,
		})
	}
	return out
}

func maskToken(token string) string {
	trimmed := strings.TrimSpace(token)
	if len(trimmed) <= 8 {
		return "***"
	}
	return fmt.Sprintf("%s***%s", trimmed[:4], trimmed[len(trimmed)-4:])
}

// writeErrorEvent sends a structured error envelope to the client./writeErrorEvent 向客户端发送结构化错误事件。
func (s *Server) writeErrorEvent(writeMu *sync.Mutex, conn *websocket.Conn, conversationID, runID, code, message string) {
	payload := map[string]any{
		"event":          "error",
		"version":        "2.0",
		"conversationId": conversationID,
		"runId":          runID,
		"payload": map[string]any{
			"code":    code,
			"message": message,
		},
	}
	s.writeEnvelope(writeMu, conn, payload)
}

// writeEnvelope marshals an envelope and writes it under lock./writeEnvelope 在锁保护下序列化并写入事件。
func (s *Server) writeEnvelope(writeMu *sync.Mutex, conn *websocket.Conn, envelope map[string]any) {
	data, err := json.Marshal(envelope)
	if err != nil {
		return
	}
	writeMu.Lock()
	_ = conn.WriteMessage(websocket.TextMessage, data)
	writeMu.Unlock()
}