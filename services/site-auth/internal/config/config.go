// Package config loads environment-driven configuration values./config 包用于加载基于环境变量的配置。
package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config captures runtime settings for the authentication service./Config 描述认证服务的运行时设置。
type Config struct {
        ListenAddr        string        // HTTP bind address./HTTP 监听地址。
        PostgresURL       string        // PostgreSQL connection string./PostgreSQL 连接串。
        RedisAddr         string        // Redis server address./Redis 服务地址。
        RedisPassword     string        // Redis password if required./Redis 密码（如需）。
        SessionTTL        time.Duration // Session lifetime./会话有效期。
        BcryptCost        int           // Bcrypt cost factor./Bcrypt 成本因子。
        AllowedOrigins    []string      // Allowed CORS origins./允许的 CORS 源。
        RateLimitWindow   time.Duration // Rate limiting window./限流时间窗口。
        RateLimitCount    int           // Maximum requests within window./窗口内最大请求数。
        LogLevel          string        // Log verbosity./日志级别。
        AgentBridgeURL    string        // Agent bridge endpoint./Agent bridge 端点。
        AgentTicketTTL    time.Duration // Agent ticket lifetime./Agent 凭证有效期。
        DefaultWorkflowID string        // Default workflow identifier./默认工作流 ID。
        JWTPrivateKeyPath string        // JWT private key path (RS256 PEM)./JWT 私钥路径（RS256 PEM）。
        JWTPublicKeyPath  string        // JWT public key path (RS256 PEM)./JWT 公钥路径（RS256 PEM）。
        InternalToken     string        // Internal token for service-to-service communication./内部服务通信 Token。
}

// FromEnv constructs Config by reading environment variables./FromEnv 通过读取环境变量构建配置。
func FromEnv() (Config, error) {
	cfg := Config{
		ListenAddr:        getEnv("SITE_AUTH_LISTEN_ADDR", ":8080"),
		PostgresURL:       os.Getenv("SITE_AUTH_DATABASE_URL"),
		RedisAddr:         getEnv("SITE_AUTH_REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:     os.Getenv("SITE_AUTH_REDIS_PASSWORD"),
		SessionTTL:        durationFromEnv("SITE_AUTH_SESSION_TTL", 24*time.Hour),
		BcryptCost:        intFromEnv("SITE_AUTH_BCRYPT_COST", 12),
		AllowedOrigins:    splitAndTrim(os.Getenv("SITE_AUTH_ALLOWED_ORIGINS")),
		RateLimitWindow:   durationFromEnv("SITE_AUTH_RATELIMIT_WINDOW", 15*time.Minute),
		RateLimitCount:    intFromEnv("SITE_AUTH_RATELIMIT_COUNT", 10),
		LogLevel:          getEnv("SITE_AUTH_LOG_LEVEL", "info"),
		AgentBridgeURL:    getEnv("SITE_AUTH_AGENT_BRIDGE_URL", "http://127.0.0.1:9000"),
		AgentTicketTTL:    durationFromEnv("SITE_AUTH_AGENT_TICKET_TTL", 30*time.Second),
		DefaultWorkflowID: strings.TrimSpace(os.Getenv("SITE_AUTH_DEFAULT_WORKFLOW_ID")),
		JWTPrivateKeyPath: os.Getenv("JWT_PRIVATE_KEY_PATH"),
		JWTPublicKeyPath:  os.Getenv("JWT_PUBLIC_KEY_PATH"),
		InternalToken:     os.Getenv("AGENT_BRIDGE_INTERNAL_TOKEN"),
	}

	if cfg.PostgresURL == "" {
		return Config{}, errors.New("SITE_AUTH_DATABASE_URL 未配置")
	}

	if cfg.SessionTTL <= 0 {
		cfg.SessionTTL = 24 * time.Hour
	}

	if cfg.RateLimitWindow <= 0 {
		cfg.RateLimitWindow = 15 * time.Minute
	}

	if cfg.RateLimitCount <= 0 {
		cfg.RateLimitCount = 10
	}

	return cfg, nil
}

// getEnv returns the value of key or fallback when unset./getEnv 返回环境变量值或回退值。
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// intFromEnv parses an integer or returns fallback on failure./intFromEnv 解析整数，失败时返回回退值。
func intFromEnv(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			return parsed
		}
	}
	return fallback
}

// durationFromEnv parses a duration string or returns fallback./durationFromEnv 解析持续时间字符串或返回回退值。
func durationFromEnv(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

// splitAndTrim splits comma-separated values into trimmed slices./splitAndTrim 将逗号分隔值拆分为裁剪后的切片。
func splitAndTrim(input string) []string {
	if input == "" {
		return nil
	}
	parts := strings.Split(input, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
