// Package session manages Redis-backed authentication sessions./session 包管理基于 Redis 的认证会话。
package session

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Session models persisted session data./Session 表示持久化的会话数据。
type Session struct {
	Token     string    `json:"token"`      // Token uniquely identifies the session./Token 唯一标识会话。
	AccountID string    `json:"account_id"` // AccountID references the user./AccountID 关联用户。
	Username  string    `json:"username"`   // Username of the account./用户名。
	Name      string    `json:"name"`       // Name displayed to clients./用于展示的名称。
	ExpiresAt time.Time `json:"expires_at"` // Expiration timestamp./过期时间。
}

// SessionManager defines the behavior for session management.
type SessionManager interface {
	Create(ctx context.Context, accountID uuid.UUID, username, name string) (Session, error)
	Get(ctx context.Context, token string) (Session, error)
	Delete(ctx context.Context, token string) error
	Refresh(ctx context.Context, token string) error
}

// Manager encapsulates session lifecycle operations./Manager 封装会话生命周期操作。
type Manager struct {
	client *redis.Client
	ttl    time.Duration
}

// Ensure Manager implements SessionManager.
var _ SessionManager = (*Manager)(nil)

// NewManager builds a Manager with the provided Redis client and TTL./NewManager 使用 Redis 客户端和 TTL 构造管理器。
func NewManager(client *redis.Client, ttl time.Duration) *Manager {
	return &Manager{client: client, ttl: ttl}
}

// key constructs the Redis storage key for a session token./key 构建会话令牌的 Redis 存储键。
func (m *Manager) key(token string) string {
	return fmt.Sprintf("site_auth:session:%s", token)
}

// Create issues a new session token and persists it to Redis./Create 颁发新的会话令牌并写入 Redis。
func (m *Manager) Create(ctx context.Context, accountID uuid.UUID, username, name string) (Session, error) {
	token := uuid.NewString()
	expiresAt := time.Now().UTC().Add(m.ttl)
	session := Session{
		Token:     token,
		AccountID: accountID.String(),
		Username:  username,
		Name:      name,
		ExpiresAt: expiresAt,
	}

	payload, err := json.Marshal(session)
	if err != nil {
		return Session{}, err
	}

	if err := m.client.Set(ctx, m.key(token), payload, m.ttl).Err(); err != nil {
		return Session{}, err
	}

	return session, nil
}

// Get retrieves a session payload from Redis./Get 从 Redis 获取会话数据。
func (m *Manager) Get(ctx context.Context, token string) (Session, error) {
	result, err := m.client.Get(ctx, m.key(token)).Result()
	if err != nil {
		return Session{}, err
	}

	var session Session
	if err := json.Unmarshal([]byte(result), &session); err != nil {
		return Session{}, err
	}

	return session, nil
}

// Delete removes the session entry from Redis./Delete 从 Redis 中移除会话。
func (m *Manager) Delete(ctx context.Context, token string) error {
	return m.client.Del(ctx, m.key(token)).Err()
}

// Refresh extends the TTL for an active session./Refresh 为活动会话延长 TTL。
func (m *Manager) Refresh(ctx context.Context, token string) error {
	return m.client.Expire(ctx, m.key(token), m.ttl).Err()
}
