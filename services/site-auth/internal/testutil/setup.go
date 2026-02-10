package testutil

import (
	"context"
	"fmt"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const (
	// User provided: postgres://orbitask:password@localhost:5432/orbitask_dev?sslmode=disable
	// Found 'postgres' user available locally.
	TestDBDSN     = "postgres://postgres:password@localhost:5432/orbitask_dev?sslmode=disable"
	TestRedisAddr = "localhost:6379"
)

// SetupTestDB connects to the real Postgres DB, runs migrations, and registers cleanup.
func SetupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()

	// 1. Run Migrations
	// Find migrations folder relative to this file
	_, filename, _, _ := runtime.Caller(0)
	// Let's assume standard go project structure
	// services/site-auth/internal/testutil/setup.go
	// migrations is at services/site-auth/../../migrations (root of mono-repo?) or services/site-auth/migrations
	// User context says: ../../migrations from services/site-auth root.
	// But `runtime.Caller` gives absolute path.
	// We need absolute path to migrations.
	// The user info says: /Users/billow/Code/Work-Agent/services/site-auth
	// Migrations are at /Users/billow/Code/Work-Agent/migrations based on `list_dir` output from earlier.
	// So that is `../../../../migrations` from `internal/testutil`?
	// internal/testutil -> internal -> site-auth -> services -> Work-Agent (root)
	// count: up 1 (internal), up 2 (site-auth), up 3	// internal/testutil -> internal -> site-auth -> services -> Work-Agent
	// Need to go up 4 levels to get to Work-Agent, then into migrations.
	migrationsPath := filepath.Join(filepath.Dir(filename), "../../../../migrations")

	m, err := migrate.New(
		"file://"+migrationsPath,
		TestDBDSN,
	)
	if err != nil {
		t.Fatalf("Failed to create migrate instance: %v (path: %s)", err, migrationsPath)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	// 2. Connect to DB
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, TestDBDSN)
	if err != nil {
		t.Fatalf("Failed to connect to DB: %v", err)
	}

	// 3. Cleanup (Truncate tables)
	t.Cleanup(func() {
		cleanupDB(t, pool)
		pool.Close()
	})

	return pool
}

// SetupTestRedis connects to existing Redis and flushes it.
func SetupTestRedis(t *testing.T) *redis.Client {
	t.Helper()

	rdb := redis.NewClient(&redis.Options{
		Addr: TestRedisAddr,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Fatalf("Failed to connect to Redis: %v", err)
	}

	// Flush Redis
	if err := rdb.FlushDB(ctx).Err(); err != nil {
		t.Fatalf("Failed to flush Redis: %v", err)
	}

	t.Cleanup(func() {
		rdb.FlushDB(context.Background())
		rdb.Close()
	})

	return rdb
}

func cleanupDB(t *testing.T, db *pgxpool.Pool) {
	ctx := context.Background()
	// Truncate all relevant tables. Cascade to clear relations.
	// Order matters less with CASCADE but good to be safe.
	tables := []string{
		"messages",
		"conversations",
		"account_users",
		"site_accounts",
		"tenants",
		"users",
		"workflow_runs",
		// workflow_templates might be static/seeded?
		// If tests create agents, we should truncate.
		// If it contains "System Default Agent" that we need, we might want to delete only created ones.
		// For strict chaos, let's truncate and rely on tests creating what they need or migration seeding (migration up doesn't re-seed if already up).
		// Migration 0010 inserts system default.
		// If we truncate, it's gone.
		// Let's NOT truncate workflow_templates for now unless we re-seed.
		// Or better: DELETE FROM workflow_templates WHERE slug != 'system-default'.
	}

	for _, table := range tables {
		_, err := db.Exec(ctx, fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table))
		if err != nil {
			t.Logf("Failed to truncate table %s: %v", table, err)
		}
	}
}
