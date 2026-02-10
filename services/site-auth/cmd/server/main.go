// Package main bootstraps the site-auth HTTP server./main 包负责启动 site-auth HTTP 服务器。
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"github.com/orbit-work/site-auth/internal/config"
	httpserver "github.com/orbit-work/site-auth/internal/http"
	"github.com/orbit-work/site-auth/internal/logging"
	"github.com/orbit-work/site-auth/internal/repository"
	"github.com/orbit-work/site-auth/internal/service"
	"github.com/orbit-work/site-auth/internal/session"
)

// main configures dependencies and runs the HTTP server./main 函数配置依赖并运行 HTTP 服务器。
func main() {
	// Load .env file if present
	_ = godotenv.Load()

	logger := logging.Setup(os.Getenv("SITE_AUTH_LOG_LEVEL"))

        cfg, err := config.FromEnv()
        if err != nil {
                logger.Error("failed to load config", "err", err)
		os.Exit(1)
	}

	logger = logging.Setup(cfg.LogLevel)

	ctx := context.Background()

        // Establish pooled PostgreSQL connection./建立 PostgreSQL 连接池。
        pool, err := pgxpool.New(ctx, cfg.PostgresURL)
        if err != nil {
                logger.Error("failed to connect to postgres", "err", err)
                os.Exit(1)
        }
        defer pool.Close()

        // Prepare Redis client for sessions./初始化用于会话的 Redis 客户端。
        redisClient := redis.NewClient(&redis.Options{
                Addr:     cfg.RedisAddr,
                Password: cfg.RedisPassword,
        })
        defer redisClient.Close()

        if err := redisClient.Ping(ctx).Err(); err != nil {
                logger.Error("failed to connect to redis", "err", err)
                os.Exit(1)
        }

        // Construct repositories, services, and HTTP router./构建仓储、服务以及 HTTP 路由。
        accounts := repository.NewAccountRepository(pool)
        sessions := session.NewManager(redisClient, cfg.SessionTTL)
        authService, err := service.NewAuthService(accounts, sessions, redisClient, cfg)
        if err != nil {
                logger.Error("failed to create auth service", "err", err)
                os.Exit(1)
        }
        server := httpserver.NewServer(authService, cfg)

        srv := &http.Server{
                Addr:    cfg.ListenAddr,
                Handler: server.Router(),
        }

        go func() {
                // Start the HTTP server and log fatal errors./启动 HTTP 服务器并记录致命错误。
                logger.Info("site-auth service listening", "addr", cfg.ListenAddr)
                if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
                        logger.Error("http server error", "err", err)
                        os.Exit(1)
                }
        }()

        stop := make(chan os.Signal, 1)
        // Watch for termination signals for graceful shutdown./监听终止信号以便优雅关闭。
        signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

        <-stop
        logger.Info("shutting down site-auth service")

        // Attempt graceful shutdown with timeout./在超时时间内尝试优雅关闭。
        ctxShutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()

        if err := srv.Shutdown(ctxShutdown); err != nil {
                logger.Error("graceful shutdown failed", "err", err)
	}
}
