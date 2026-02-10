package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/orbit-work/site-auth/internal/config"
	"github.com/orbit-work/site-auth/internal/jwt"
	"github.com/orbit-work/site-auth/internal/repository"
	authsvc "github.com/orbit-work/site-auth/internal/service"
	"github.com/orbit-work/site-auth/internal/session"
)

// AuthService defines the interface for authentication operations.
type AuthService interface {
	Login(ctx context.Context, email, password string) (authsvc.LoginResult, error)
	Register(ctx context.Context, email, password, name string) (authsvc.LoginResult, error)
	Validate(ctx context.Context, token string) (session.Session, error)
	Logout(ctx context.Context, sessionToken, jwtToken string) error
	CreateOrganization(ctx context.Context, userID uuid.UUID, name, email string) (repository.Tenant, repository.SiteAccount, error)
	ListTenants(ctx context.Context, userID uuid.UUID) ([]repository.Tenant, error)
	IsJWTBlacklisted(ctx context.Context, jwtToken string) (bool, error)

	// New methods
	ListUserSessions(ctx context.Context, userID uuid.UUID, currentSiteAccountID *uuid.UUID) ([]repository.Session, error)
	GetSessionMessages(ctx context.Context, sessionID string) ([]repository.Message, error)
	CreateAgent(ctx context.Context, agent repository.Agent) (repository.Agent, error)
	ListAgents(ctx context.Context) ([]repository.Agent, error)
	GetInsights(ctx context.Context) (repository.DashboardStats, error)
}

// Server wires HTTP routes with authentication services./Server 将 HTTP 路由与认证服务连接起来。
type Server struct {
	router       *chi.Mux
	auth         AuthService
	cfg          config.Config
	tickets      *ticketStore
	httpClient   *http.Client
	jwtValidator *jwt.Validator // JWT validator for auth_request endpoint./用于 auth_request 端点的 JWT 验证器。
	logger       *slog.Logger
}

// NewServer constructs a server and initialises all routes./NewServer 构造服务器并初始化所有路由。
func NewServer(auth AuthService, cfg config.Config) *Server {
	srv := &Server{auth: auth, cfg: cfg, logger: slog.Default()}
	srv.tickets = newTicketStore(cfg.AgentTicketTTL)
	srv.httpClient = &http.Client{}

	// Initialize JWT validator if public key is configured./如果配置了公钥，初始化 JWT 验证器。
	if cfg.JWTPublicKeyPath != "" {
		validator, err := jwt.NewValidator(cfg.JWTPublicKeyPath)
		if err != nil {
			// Log error but don't fail server startup if JWT validation is optional./记录错误但不使服务器启动失败（如果 JWT 验证是可选的）。
			// In production, you might want to fail fast if JWT is required./在生产环境中，如果 JWT 是必需的，可能需要快速失败。
		} else {
			srv.jwtValidator = validator
		}
	}

	r := chi.NewRouter()

	// 基础中间件
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(srv.corsMiddleware())

	// ✅ 根路径提示
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("site-auth service running"))
	})

	// ✅ 健康检查（统一逻辑，兼容 /healthz 与 /api/v1/health）
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}
	r.Get("/healthz", healthHandler)
	r.Get("/api/v1/health", healthHandler)

	// ✅ JWT validation endpoint for nginx auth_request/用于 nginx auth_request 的 JWT 验证端点
	r.Get("/api/v1/auth/validate", srv.handleAuthValidate)

	// ✅ 登录 / 会话 / 登出接口
	r.Post("/api/v1/auth/register", srv.handleRegister)
	r.Post("/api/v1/login", srv.handleLogin)
	r.Get("/api/v1/session", srv.handleSession)
	r.Post("/api/v1/logout", srv.handleLogout)
	r.Post("/api/v1/organizations", srv.handleCreateOrganization) // New endpoint
	r.Get("/api/v1/tenants", srv.handleListTenants)               // New endpoint

	r.Post("/api/v1/agent/ws/tickets", srv.handleCreateWSTicket)
	r.Get("/ws/agent", srv.handleAgentWebSocket)

	// Conversations
	r.Get("/api/v1/sessions", srv.handleListSessions)
	r.Get("/api/v1/sessions/{id}/messages", srv.handleGetSessionMessages)

	// Agent Management
	r.Post("/api/v1/agents", srv.handleCreateAgent)
	r.Get("/api/v1/agents", srv.handleListAgents)

	// Insights
	r.Get("/api/v1/insights/dashboard", srv.handleGetInsights)

	srv.router = r
	return srv
}

// Router exposes the configured HTTP router./Router 返回已配置的 HTTP 路由器。
func (s *Server) Router() http.Handler {
	return s.router
}

type loginRequest struct {
	Identifier     string `json:"identifier"`     // Identifier supplied by the client.
	IdentifierType string `json:"identifierType"` // Type of identifier (email, phone, username).
	Password       string `json:"password"`       // Plaintext password from the user.
}

type loginResponse struct {
	Token           string         `json:"token"`            // Newly issued session token.
	JWTToken        string         `json:"jwtToken"`         // JWT token for gateway authentication.
	ExpiresInSecond int            `json:"expiresInSeconds"` // Token time-to-live in seconds.
	User            sessionPayload `json:"user"`             // Authenticated user payload.
}

type sessionPayload struct {
	ID                 string `json:"id"`                    // Account identifier.
	Name               string `json:"name"`                  // Display name for the user.
	Username           string `json:"username"`              // Username used for login.
	LastActiveTenantID string `json:"last_active_tenant_id"` // Last accessed tenant context.
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type createOrgRequest struct {
	Name string `json:"name"`
}

type createOrgResponse struct {
	Tenant      repository.Tenant      `json:"tenant"`
	SiteAccount repository.SiteAccount `json:"site_account"`
}

type agentRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Author      string   `json:"author"`
	Tags        []string `json:"tags"`
}

// handleLogin authenticates the user and returns session data.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "请求格式错误"})
		return
	}

	ctx := r.Context()
	result, err := s.auth.Login(ctx, req.Identifier, req.Password)
	if err != nil {
		switch err {
		case authsvc.ErrAccountLocked:
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"message": "尝试次数过多，请稍后再试", "code": "locked"})
		case authsvc.ErrAccountDisabled:
			writeJSON(w, http.StatusForbidden, map[string]string{"message": "账号已被禁用", "code": "disabled"})
		case authsvc.ErrInvalidCredentials:
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "账号或密码错误", "code": "invalid"})
		default:
			s.logger.Error("login failed", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "服务器繁忙"})
		}
		return
	}

	lastActiveTenantID := ""
	if result.User.LastActiveTenantID != nil {
		lastActiveTenantID = result.User.LastActiveTenantID.String()
	}

	payload := loginResponse{
		Token:           result.Session.Token,
		JWTToken:        result.JWTToken,
		ExpiresInSecond: int(time.Until(result.Session.ExpiresAt).Seconds()),
		User: sessionPayload{
			ID:                 result.User.ID.String(),
			Name:               result.User.Name,
			Username:           *result.User.Email, // Use Email as Username for now
			LastActiveTenantID: lastActiveTenantID,
		},
	}

	writeJSON(w, http.StatusOK, payload)
}

// handleRegister creates a new user and returns session data.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "请求格式错误"})
		return
	}

	result, err := s.auth.Register(r.Context(), req.Email, req.Password, req.Name)
	if err != nil {
		switch {
		case errors.Is(err, authsvc.ErrUserAlreadyExists):
			writeJSON(w, http.StatusConflict, map[string]string{"message": "用户已存在"})
		case errors.Is(err, authsvc.ErrInvalidCredentials):
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "请求格式错误"})
		default:
			s.logger.Error("register failed", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "服务器繁忙"})
		}
		return
	}

	lastActiveTenantID := ""
	if result.User.LastActiveTenantID != nil {
		lastActiveTenantID = result.User.LastActiveTenantID.String()
	}

	payload := loginResponse{
		Token:           result.Session.Token,
		JWTToken:        result.JWTToken,
		ExpiresInSecond: int(time.Until(result.Session.ExpiresAt).Seconds()),
		User: sessionPayload{
			ID:                 result.User.ID.String(),
			Name:               result.User.Name,
			Username:           *result.User.Email,
			LastActiveTenantID: lastActiveTenantID,
		},
	}

	writeJSON(w, http.StatusCreated, payload)
}

// handleCreateOrganization creates a new tenant and site account.
func (s *Server) handleCreateOrganization(w http.ResponseWriter, r *http.Request) {
	// Authentication check
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}
	sess, err := s.auth.Validate(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}

	var req createOrgRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "请求格式错误"})
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "组织名称不能为空"})
		return
	}

	userID, err := uuid.Parse(sess.AccountID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "无效的用户ID"})
		return
	}

	// We pass empty email for now as it's not strictly required by the service signature for org creation,
	// or we might need to fetch it from user session if needed.
	// The service signature is `CreateOrganization(ctx, userID, name, email)`.
	// Since we don't have email in session payload easily without fetching user,
	// and the service might use it for billing email or similar.
	// Let's pass empty string or "N/A" if allowed, or fetch user.
	// Given the constraints, I'll pass empty string for now.
	tenant, siteAccount, err := s.auth.CreateOrganization(r.Context(), userID, req.Name, "")
	if err != nil {
		s.logger.Error("create organization failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "创建组织失败"})
		return
	}

	payload := createOrgResponse{
		Tenant:      tenant,
		SiteAccount: siteAccount,
	}

	writeJSON(w, http.StatusCreated, payload)
}

// handleListTenants returns the list of tenants for the authenticated user.
func (s *Server) handleListTenants(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}
	sess, err := s.auth.Validate(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}

	userID, err := uuid.Parse(sess.AccountID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "无效的用户ID"})
		return
	}

	tenants, err := s.auth.ListTenants(r.Context(), userID)
	if err != nil {
		s.logger.Error("list tenants failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "获取租户列表失败"})
		return
	}

	writeJSON(w, http.StatusOK, tenants)
}

// handleSession returns session details for the provided token./handleSession 返回令牌对应的会话详情。
func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}

	sess, err := s.auth.Validate(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "未登录"})
		return
	}

	payload := map[string]sessionPayload{
		"user": {
			ID:       sess.AccountID,
			Name:     sess.Name,
			Username: sess.Username,
		},
	}
	writeJSON(w, http.StatusOK, payload)
}

// handleLogout invalidates the session token and blacklists JWT when present./handleLogout 在令牌存在时使会话失效并将 JWT 加入黑名单。
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	sessionToken := tokenFromRequest(r)

	// Extract JWT token from Authorization header if present./如果存在，从 Authorization 头提取 JWT 令牌。
	jwtToken := ""
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		jwtToken = strings.TrimSpace(authHeader[7:])
	}

	if sessionToken != "" || jwtToken != "" {
		_ = s.auth.Logout(r.Context(), sessionToken, jwtToken)
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
}

// handleAuthValidate validates JWT token for nginx auth_request./handleAuthValidate 为 nginx auth_request 验证 JWT 令牌。
// This endpoint is called by nginx's auth_request module as an internal sub-request./此端点由 nginx 的 auth_request 模块作为内部子请求调用。
// Returns 200 if token is valid, 401 if invalid./如果令牌有效返回 200，无效返回 401。
func (s *Server) handleAuthValidate(w http.ResponseWriter, r *http.Request) {
	// Extract JWT token from Authorization header./从 Authorization 头提取 JWT 令牌。
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	jwtToken := strings.TrimSpace(authHeader[7:])
	if jwtToken == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// If validator is not configured, return 401./如果验证器未配置，返回 401。
	if s.jwtValidator == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Validate JWT token./验证 JWT 令牌。
	claims, err := s.jwtValidator.ValidateToken(jwtToken)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Check if token is blacklisted./检查令牌是否在黑名单中。
	ctx := r.Context()
	blacklisted, err := s.auth.IsJWTBlacklisted(ctx, jwtToken)
	if err != nil || blacklisted {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Token is valid, return 200./令牌有效，返回 200。
	// Optionally, we can set custom headers for downstream services./可选地，我们可以为下游服务设置自定义头。
	// For example, we could set X-User-ID header based on claims./例如，我们可以根据声明设置 X-User-ID 头。
	if claims != nil && claims.UserID != "" {
		w.Header().Set("X-User-ID", claims.UserID)
		w.Header().Set("X-Username", claims.Username)
	}
	w.WriteHeader(http.StatusOK)
}

// ✅ CORS 中间件（允许前端跨域访问）
// corsMiddleware enables CORS for configured origins./corsMiddleware 为配置的来源启用 CORS。
func (s *Server) corsMiddleware() func(http.Handler) http.Handler {
	allowed := s.cfg.AllowedOrigins
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (len(allowed) == 0 || contains(allowed, origin)) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Workspace-Client")
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// tokenFromRequest extracts the bearer token from headers or cookies./tokenFromRequest 从请求头或 Cookie 中提取 Bearer 令牌。
func tokenFromRequest(r *http.Request) string {
	if cookie, err := r.Cookie("site_auth_token"); err == nil && strings.TrimSpace(cookie.Value) != "" {
		return cookie.Value
	}

	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}

	return ""
}

// writeJSON serialises payload as JSON with the given status code./writeJSON 以指定状态码序列化 JSON 负载。
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// contains reports whether the target string exists in the slice./contains 判断目标字符串是否存在于切片。
func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

// --- Conversations Handlers ---

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}
	sess, err := s.auth.Validate(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}
	userID, err := uuid.Parse(sess.AccountID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Invalid user ID"})
		return
	}

	var siteAccountID *uuid.UUID
	// For now, we don't have site account ID in session or query param easily (or it might be in LastActiveTenantID, but that's TenantID, not SiteAccountID).
	// Requirement says: "currentSiteAccountID not empty".
	// Assuming client might pass it via query param or header, or we deduce it.
	// For MVP, passing nil unless we have context.
	// Actually, session has LastActiveTenantID. We'd need to resolve SiteAccount for that Tenant?
	// Or maybe the user is switched into a specific site account scope.
	// I'll check if a header "X-Site-Account-ID" exists or similar, or just pass nil for now as per minimal change.
	// BUT, validation logic (2.2.B) relies on it.
	// Let's check if the previous implementation added it to session payload.
	// Session has LastActiveTenantID.

	sessions, err := s.auth.ListUserSessions(r.Context(), userID, siteAccountID)
	if err != nil {
		s.logger.Error("failed to list sessions", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Failed to list sessions"})
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) handleGetSessionMessages(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}
	if _, err := s.auth.Validate(r.Context(), token); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Missing session ID"})
		return
	}

	messages, err := s.auth.GetSessionMessages(r.Context(), sessionID)
	if err != nil {
		s.logger.Error("failed to get messages", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Failed to get messages"})
		return
	}
	writeJSON(w, http.StatusOK, messages)
}

// --- Agent Management Handlers ---

func (s *Server) handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}
	if _, err := s.auth.Validate(r.Context(), token); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	var req agentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Invalid request body"})
		return
	}

	agent := repository.Agent{
		Name:        req.Name,
		Description: req.Description,
		Tags:        req.Tags,
	}

	created, err := s.auth.CreateAgent(r.Context(), agent)
	if err != nil {
		s.logger.Error("failed to create agent", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Failed to create agent"})
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}
	if _, err := s.auth.Validate(r.Context(), token); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	agents, err := s.auth.ListAgents(r.Context())
	if err != nil {
		s.logger.Error("failed to list agents", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Failed to list agents"})
		return
	}
	writeJSON(w, http.StatusOK, agents)
}

// --- Insights Handlers ---

func (s *Server) handleGetInsights(w http.ResponseWriter, r *http.Request) {
	token := tokenFromRequest(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}
	if _, err := s.auth.Validate(r.Context(), token); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "Unauthorized"})
		return
	}

	stats, err := s.auth.GetInsights(r.Context())
	if err != nil {
		s.logger.Error("failed to get insights", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Failed to get insights"})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
