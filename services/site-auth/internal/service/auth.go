// Package service contains business logic for authentication flows.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"log/slog"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/orbit-work/site-auth/internal/config"
	"github.com/orbit-work/site-auth/internal/jwt"
	"github.com/orbit-work/site-auth/internal/password"
	"github.com/orbit-work/site-auth/internal/repository"
	"github.com/orbit-work/site-auth/internal/session"
)

var (
	// ErrInvalidCredentials indicates the identifier/password is incorrect.
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrAccountDisabled signals that the account is disabled.
	ErrAccountDisabled = errors.New("account disabled")
	// ErrAccountLocked shows rate limiting has locked the account.
	ErrAccountLocked = errors.New("account locked due to repeated failures")
	// ErrUserAlreadyExists indicates registration failed due to duplicate email.
	ErrUserAlreadyExists = errors.New("user already exists")
)

// AuthService orchestrates authentication and session behaviour.
type AuthService struct {
	accounts  repository.Repository
	sessions  session.SessionManager
	redis     *redis.Client
	cfg       config.Config
	jwtIssuer *jwt.Issuer // JWT issuer for token generation.
}

// NewAuthService constructs an AuthService from its dependencies.
func NewAuthService(accounts repository.Repository, sessions session.SessionManager, redis *redis.Client, cfg config.Config) (
	*AuthService, error) {
	var jwtIssuer *jwt.Issuer
	if cfg.JWTPrivateKeyPath != "" {
		var err error
		jwtIssuer, err = jwt.NewIssuer(cfg.JWTPrivateKeyPath, "orbitaskflow-site-auth")
		if err != nil {
			return nil, fmt.Errorf("initialize JWT issuer: %w", err)
		}
	}
	return &AuthService{
		accounts:  accounts,
		sessions:  sessions,
		redis:     redis,
		cfg:       cfg,
		jwtIssuer: jwtIssuer,
	}, nil
}

// LoginResult contains session, user, and JWT token.
type LoginResult struct {
	Session  session.Session
	User     repository.User
	JWTToken string // JWT token for gateway authentication.
}

// Login validates credentials, applies rate limiting, and creates sessions.
// Now authenticates against the global `users` table.
func (s *AuthService) Login(ctx context.Context, email, plainPassword string) (LoginResult, error) {
	logger := slog.Default()
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" || strings.TrimSpace(plainPassword) == "" {
		return LoginResult{}, ErrInvalidCredentials
	}

	// Rate Limiting
	rateLimitKey := fmt.Sprintf("auth:login:%s", normalizedEmail)
	if locked, err := s.isLocked(ctx, rateLimitKey); err != nil {
		return LoginResult{}, err
	} else if locked {
		logger.Warn("login failed", "email", normalizedEmail, "reason", "account_locked")
		return LoginResult{}, ErrAccountLocked
	}

	// Retrieve User
	user, err := s.accounts.GetUserByEmail(ctx, normalizedEmail)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			_ = s.registerFailure(ctx, rateLimitKey)
			logger.Warn("login failed", "email", normalizedEmail, "reason", "user_not_found")
			return LoginResult{}, ErrInvalidCredentials
		}
		return LoginResult{}, err
	}

	// Verify Password
	if err := password.Compare(user.PasswordHash, plainPassword); err != nil {
		logger.Warn("login failed", "email", normalizedEmail, "reason", "invalid_password")
		_ = s.registerFailure(ctx, rateLimitKey)
		return LoginResult{}, ErrInvalidCredentials
	}

	_ = s.clearFailures(ctx, rateLimitKey)

	// Create Session
	// Note: We use User.Name as DisplayName. Username concept is deprecated in V7 for global users.
	sess, err := s.sessions.Create(ctx, user.ID, normalizedEmail, user.Name)
	if err != nil {
		return LoginResult{}, err
	}

	// Issue JWT Token
	var jwtToken string
	if s.jwtIssuer != nil {
		// Use User ID as subject
		jwtToken, err = s.jwtIssuer.IssueToken(user.ID.String(), user.Name, s.cfg.SessionTTL)
		if err != nil {
			logger.Warn("failed to issue JWT token", "error", err)
		}
	}

	logger.Info("login succeeded", "user_id", user.ID.String(), "email", normalizedEmail)

	return LoginResult{
		Session:  sess,
		User:     user,
		JWTToken: jwtToken,
	}, nil
}

// Register creates a new global user.
func (s *AuthService) Register(ctx context.Context, email, plainPassword, name string) (LoginResult, error) {
	logger := slog.Default()
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" || plainPassword == "" || name == "" {
		return LoginResult{}, errors.New("missing required fields")
	}

	// Check if user exists
	_, err := s.accounts.GetUserByEmail(ctx, normalizedEmail)
	if err == nil {
		return LoginResult{}, ErrUserAlreadyExists
	} else if !errors.Is(err, repository.ErrNotFound) {
		return LoginResult{}, err
	}

	// Hash Password
	// Use 0 to let the password package use its default cost
	hashedPassword, err := password.Hash(plainPassword, 0)
	if err != nil {
		return LoginResult{}, fmt.Errorf("hashing password: %w", err)
	}

	// Create User
	user, err := s.accounts.CreateUser(ctx, normalizedEmail, hashedPassword, name)
	if err != nil {
		logger.Error("failed to create user", "error", err)
		return LoginResult{}, fmt.Errorf("create user: %w", err)
	}

	// Auto-login after registration
	sess, err := s.sessions.Create(ctx, user.ID, normalizedEmail, user.Name)
	if err != nil {
		return LoginResult{}, err
	}

	var jwtToken string
	if s.jwtIssuer != nil {
		jwtToken, err = s.jwtIssuer.IssueToken(user.ID.String(), user.Name, s.cfg.SessionTTL)
		if err != nil {
			logger.Warn("failed to issue JWT token", "error", err)
		}
	}

	return LoginResult{
		Session:  sess,
		User:     user,
		JWTToken: jwtToken,
	}, nil
}

// CreateOrganization initializes a Tenant and a default Site Account for a user.
// This is usually called after Register to set up the user's own workspace.
// CreateOrganization initializes a Tenant and a default Site Account for a user.
// This is usually called after Register to set up the user's own workspace.
func (s *AuthService) CreateOrganization(ctx context.Context, userID uuid.UUID, name, email string) (repository.Tenant, repository.SiteAccount, error) {
	var tenant repository.Tenant
	var siteAccount repository.SiteAccount

	// Normalize email; allow empty string to be treated as nil
	var billingEmail *string
	trimmedEmail := strings.TrimSpace(email)
	if trimmedEmail != "" {
		billingEmail = &trimmedEmail
	}

	err := s.accounts.WithTx(ctx, func(txRepo repository.Repository) error {
		var err error
		tenant, err = txRepo.CreateTenant(ctx, name, billingEmail)
		if err != nil {
			return err
		}

		siteAccount, err = txRepo.CreateSiteAccount(ctx, tenant.ID, name)
		if err != nil {
			return err
		}

		if err := txRepo.AddUserToAccount(ctx, siteAccount.ID, userID, repository.RoleOwner); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return repository.Tenant{}, repository.SiteAccount{}, err
	}

	return tenant, siteAccount, nil
}

// ListTenants returns the list of tenants for the given user.
func (s *AuthService) ListTenants(ctx context.Context, userID uuid.UUID) ([]repository.Tenant, error) {
	return s.accounts.ListTenants(ctx, userID)

}

// ListUserSessions returns sessions for the user with visibility rules.
func (s *AuthService) ListUserSessions(ctx context.Context, userID uuid.UUID, currentSiteAccountID *uuid.UUID) ([]repository.Session, error) {
	return s.accounts.ListSessions(ctx, userID, currentSiteAccountID)
}

// GetSessionMessages returns messages for a session.
func (s *AuthService) GetSessionMessages(ctx context.Context, sessionID string) ([]repository.Message, error) {
	id, err := uuid.Parse(sessionID)
	if err != nil {
		return nil, fmt.Errorf("invalid session id: %w", err)
	}
	return s.accounts.GetSessionMessages(ctx, id)
}

// CreateAgent creates a new agent.
func (s *AuthService) CreateAgent(ctx context.Context, agent repository.Agent) (repository.Agent, error) {
	return s.accounts.CreateAgent(ctx, agent)
}

// ListAgents returns all agents.
func (s *AuthService) ListAgents(ctx context.Context) ([]repository.Agent, error) {
	return s.accounts.ListAgents(ctx)
}

// GetInsights returns dashboard stats.
func (s *AuthService) GetInsights(ctx context.Context) (repository.DashboardStats, error) {
	return s.accounts.GetDashboardStats(ctx)
}

// Validate retrieves session information for a token.
func (s *AuthService) Validate(ctx context.Context, token string) (session.Session, error) {
	logger := slog.Default()
	if strings.TrimSpace(token) == "" {
		return session.Session{}, ErrInvalidCredentials
	}
	sess, err := s.sessions.Get(ctx, token)
	if err != nil {
		return session.Session{}, err
	}
	if err := s.sessions.Refresh(ctx, token); err != nil {
		logger.Warn("session refresh failed", "sessionId", maskToken(token), "error", err)
	}
	return sess, nil
}

// Logout removes the session and blacklists the JWT token.
func (s *AuthService) Logout(ctx context.Context, sessionToken, jwtToken string) error {
	logger := slog.Default()
	if strings.TrimSpace(sessionToken) != "" {
		_ = s.sessions.Delete(ctx, sessionToken)
	}

	if strings.TrimSpace(jwtToken) != "" {
		jti, err := jwt.GetJTI(jwtToken)
		if err != nil {
			logger.Warn("failed to extract JTI from JWT token", "error", err)
			return nil
		}

		ttl := s.cfg.SessionTTL
		if ttl <= 0 {
			ttl = 24 * time.Hour
		}

		blacklistKey := s.jwtBlacklistKey(jti)
		if err := s.redis.Set(ctx, blacklistKey, "1", ttl).Err(); err != nil {
			logger.Warn("failed to blacklist JWT token", "error", err)
		}
	}

	return nil
}

// IsJWTBlacklisted checks if a JWT token is blacklisted.
func (s *AuthService) IsJWTBlacklisted(ctx context.Context, jwtToken string) (bool, error) {
	if strings.TrimSpace(jwtToken) == "" {
		return false, nil
	}

	jti, err := jwt.GetJTI(jwtToken)
	if err != nil {
		return false, err
	}

	blacklistKey := s.jwtBlacklistKey(jti)
	exists, err := s.redis.Exists(ctx, blacklistKey).Result()
	if err != nil && err != redis.Nil {
		return false, err
	}

	return exists > 0, nil
}

// jwtBlacklistKey builds the Redis key for JWT blacklist.
func (s *AuthService) jwtBlacklistKey(jti string) string {
	return fmt.Sprintf("site_auth:jwt_blacklist:%s", jti)
}

func maskToken(token string) string {
	trimmed := strings.TrimSpace(token)
	if len(trimmed) <= 8 {
		return "***"
	}
	return fmt.Sprintf("%s***%s", trimmed[:4], trimmed[len(trimmed)-4:])
}

// isLocked returns true when the identifier is currently locked.
func (s *AuthService) isLocked(ctx context.Context, key string) (bool, error) {
	ttl, err := s.redis.TTL(ctx, key).Result()
	if err != nil && err != redis.Nil {
		return false, err
	}
	if ttl > 0 {
		return true, nil
	}
	return false, nil
}

// registerFailure increments counters and may lock the account.
func (s *AuthService) registerFailure(ctx context.Context, key string) error {
	attemptsKey := fmt.Sprintf("%s:attempts", key)
	lockKey := fmt.Sprintf("%s:locked", key)

	attempts, err := s.redis.Incr(ctx, attemptsKey).Result()
	if err != nil {
		return err
	}

	if attempts == 1 {
		_ = s.redis.Expire(ctx, attemptsKey, s.cfg.RateLimitWindow).Err()
	}

	if int(attempts) >= s.cfg.RateLimitCount {
		if err := s.redis.Set(ctx, lockKey, "1", s.cfg.RateLimitWindow).Err(); err != nil {
			return err
		}
		_ = s.redis.Del(ctx, attemptsKey).Err()
	}
	return nil
}

// clearFailures removes attempt tracking after successful authentication.
func (s *AuthService) clearFailures(ctx context.Context, key string) error {
	attemptsKey := fmt.Sprintf("%s:attempts", key)
	lockKey := fmt.Sprintf("%s:locked", key)
	if err := s.redis.Del(ctx, attemptsKey, lockKey).Err(); err != nil && err != redis.Nil {
		return err
	}
	return nil
}
