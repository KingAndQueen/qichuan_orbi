// Package repository contains data-access logic for site-auth.
package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Common errors.
var (
	ErrNotFound = errors.New("entity not found")
)

// Constants for well-known roles and statuses.
const (
	RoleOwner  = "owner"
	RoleMember = "member"

	StatusActive   = "active"
	StatusDisabled = "disabled"
)

// User represents a global identity (natural person).
type User struct {
	ID                 uuid.UUID  `json:"id" db:"id"`
	Name               string     `json:"name" db:"name"`
	Email              *string    `json:"email" db:"email"`
	PasswordHash       string     `json:"-" db:"password_hash"` // Stored bcrypt hash, never returned in JSON
	AvatarURL          *string    `json:"avatar_url" db:"avatar_url"`
	LastActiveTenantID *uuid.UUID `json:"last_active_tenant_id" db:"last_active_tenant_id"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`
}

// Tenant represents a top-level organization/enterprise.
type Tenant struct {
	ID           uuid.UUID              `json:"id" db:"id"`
	Name         string                 `json:"name" db:"name"`
	BillingEmail *string                `json:"billing_email" db:"billing_email"`
	Tier         string                 `json:"tier" db:"tier"`
	Settings     map[string]interface{} `json:"settings" db:"settings"`
	CreatedAt    time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at" db:"updated_at"`
}

// SiteAccount represents a business unit or department within a Tenant.
type SiteAccount struct {
	ID          uuid.UUID              `json:"id" db:"id"`
	TenantID    uuid.UUID              `json:"tenant_id" db:"tenant_id"`
	Name        string                 `json:"name" db:"name"`
	Description *string                `json:"description" db:"description"`
	Settings    map[string]interface{} `json:"settings" db:"settings"`
	CreatedAt   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at" db:"updated_at"`
}

// AccountUser represents the binding between a User and a SiteAccount.
type AccountUser struct {
	ID            uuid.UUID `json:"id" db:"id"`
	SiteAccountID uuid.UUID `json:"site_account_id" db:"site_account_id"`
	UserID        uuid.UUID `json:"user_id" db:"user_id"`
	Role          string    `json:"role" db:"role"`     // e.g. 'owner', 'member'
	Status        string    `json:"status" db:"status"` // 'active', 'disabled'
	JoinedAt      time.Time `json:"joined_at" db:"joined_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// Session represents a chat session.
type Session struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	UserID        uuid.UUID  `json:"userId" db:"user_id"`
	SiteAccountID *uuid.UUID `json:"siteAccountId" db:"site_account_id"`
	Title         string     `json:"title" db:"title"`
	Visibility    string     `json:"visibility" db:"visibility"` // 'private', 'team_public', 'archived'
	CreatedAt     time.Time  `json:"createdAt" db:"created_at"`
}

// Message represents a chat message within a session.
type Message struct {
	ID        uuid.UUID `json:"id" db:"id"`
	SessionID uuid.UUID `json:"sessionId" db:"conversation_id"`
	Role      string    `json:"role" db:"role"` // 'user' or 'assistant'
	Content   string    `json:"content" db:"content"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
}

// Agent represents a custom agent in the marketplace.
type Agent struct {
	ID          uuid.UUID `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	// AuthorStr matches the schema? No, 'workflow_templates' has no explicit author. Maybe 'is_public'?
	// The mock had AuthorStr, but schema for workflow_templates doesn't seem to have author.
	// We'll map what we can from workflow_templates.
	Tags      []string  `json:"tags" db:"tags"`
	IsPublic  bool      `json:"isPublic" db:"is_public"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
}

// DashboardStats represents insights data.
type DashboardStats struct {
	TasksCompleted int     `json:"tasksCompleted"`
	HoursSaved     float64 `json:"hoursSaved"`
}

// Repository exposes the persistence contract used by services.
type Repository interface {
	WithTx(ctx context.Context, fn func(Repository) error) error

	CreateUser(ctx context.Context, email, passwordHash, name string) (User, error)
	GetUserByEmail(ctx context.Context, email string) (User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (User, error)
	UpdateLastLoginContext(ctx context.Context, userID, tenantID uuid.UUID) error

	CreateTenant(ctx context.Context, name string, billingEmail *string) (Tenant, error)
	CreateSiteAccount(ctx context.Context, tenantID uuid.UUID, name string) (SiteAccount, error)
	GetSiteAccountByID(ctx context.Context, id uuid.UUID) (SiteAccount, error)
	UpdateSiteAccount(ctx context.Context, account SiteAccount) error

	AddUserToAccount(ctx context.Context, accountID, userID uuid.UUID, role string) error
	RemoveUserFromAccount(ctx context.Context, accountID, userID uuid.UUID) error
	GetUserRoles(ctx context.Context, accountID, userID uuid.UUID) ([]string, error)
	ListTenants(ctx context.Context, userID uuid.UUID) ([]Tenant, error)

	// Conversations
	CreateSession(ctx context.Context, session Session) (Session, error)
	GetSessionByID(ctx context.Context, sessionID uuid.UUID) (Session, error)
	ListSessions(ctx context.Context, userID uuid.UUID, currentSiteAccountID *uuid.UUID) ([]Session, error)
	GetSessionMessages(ctx context.Context, sessionID uuid.UUID) ([]Message, error)
	UpdateSessionVisibility(ctx context.Context, sessionID uuid.UUID, visibility string) error
	ArchiveUserSessions(ctx context.Context, userID uuid.UUID) error

	// Agent Management
	CreateAgent(ctx context.Context, agent Agent) (Agent, error)
	ListAgents(ctx context.Context) ([]Agent, error)

	// Insights
	GetDashboardStats(ctx context.Context) (DashboardStats, error)

	// Organization Management
	CountActiveMembers(ctx context.Context, accountID uuid.UUID) (int, error)
	DeleteSiteAccount(ctx context.Context, accountID uuid.UUID) error
	DisableUserInAllAccounts(ctx context.Context, userID uuid.UUID) error
}

// DBTX is an interface that abstracts pgxpool.Pool and pgx.Tx.
type DBTX interface {
	Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error)
	Query(context.Context, string, ...interface{}) (pgx.Rows, error)
	QueryRow(context.Context, string, ...interface{}) pgx.Row
}

// TxStarter abstracts the Begin method for starting transactions.
type TxStarter interface {
	Begin(context.Context) (pgx.Tx, error)
}

// AccountRepository provides persistence helpers for the Identity V7 schema.
type AccountRepository struct {
	pool TxStarter // Abstracted for testing (was *pgxpool.Pool)
	db   DBTX      // Use db for executing queries (pool or tx)
}

// NewAccountRepository constructs a repository backed by a pgx pool.
func NewAccountRepository(pool *pgxpool.Pool) *AccountRepository {
	return &AccountRepository{
		pool: pool,
		db:   pool,
	}
}

// NewAccountRepositoryWithStarter constructs a repository with a custom starter (for testing).
func NewAccountRepositoryWithStarter(starter TxStarter, db DBTX) *AccountRepository {
	return &AccountRepository{
		pool: starter,
		db:   db,
	}
}

// withExecutor clones the repository with a different query executor.
func (r *AccountRepository) withExecutor(executor DBTX) *AccountRepository {
	return &AccountRepository{
		pool: r.pool,
		db:   executor,
	}
}

// WithTx executes the given function within a transaction.
func (r *AccountRepository) WithTx(ctx context.Context, fn func(Repository) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	repo := r.withExecutor(tx)
	if err := fn(repo); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// --- User Methods ---

// CreateUser creates a new global user.
func (r *AccountRepository) CreateUser(ctx context.Context, email, passwordHash, name string) (User, error) {
	const query = `
        INSERT INTO users (name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, password_hash, avatar_url, last_active_tenant_id, created_at, updated_at
    `
	row := r.db.QueryRow(ctx, query, name, email, passwordHash)
	return scanUser(row)
}

// GetUserByEmail retrieves a user by their email address.
func (r *AccountRepository) GetUserByEmail(ctx context.Context, email string) (User, error) {
	const query = `
        SELECT id, name, email, password_hash, avatar_url, last_active_tenant_id, created_at, updated_at
        FROM users
        WHERE email = $1
        LIMIT 1
    `
	row := r.db.QueryRow(ctx, query, email)
	return scanUser(row)
}

// GetUserByID retrieves a user by their UUID.
func (r *AccountRepository) GetUserByID(ctx context.Context, id uuid.UUID) (User, error) {
	const query = `
        SELECT id, name, email, password_hash, avatar_url, last_active_tenant_id, created_at, updated_at
        FROM users
        WHERE id = $1
    `
	row := r.db.QueryRow(ctx, query, id)
	return scanUser(row)
}

// UpdateLastLoginContext updates the user's last active tenant.
func (r *AccountRepository) UpdateLastLoginContext(ctx context.Context, userID, tenantID uuid.UUID) error {
	const query = `
		UPDATE users
		SET last_active_tenant_id = $2, updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, userID, tenantID)
	return err
}

// --- Tenant & SiteAccount Methods ---

// CreateTenant creates a new top-level tenant.
func (r *AccountRepository) CreateTenant(ctx context.Context, name string, billingEmail *string) (Tenant, error) {
	const query = `
        INSERT INTO tenants (name, billing_email)
        VALUES ($1, $2)
        RETURNING id, name, billing_email, tier, settings, created_at, updated_at
    `
	row := r.db.QueryRow(ctx, query, name, billingEmail)
	return scanTenant(row)
}

// CreateSiteAccount creates a new site account under a tenant.
func (r *AccountRepository) CreateSiteAccount(ctx context.Context, tenantID uuid.UUID, name string) (SiteAccount, error) {
	const query = `
        INSERT INTO site_accounts (tenant_id, name, settings)
        VALUES ($1, $2, '{}'::jsonb)
        RETURNING id, tenant_id, name, description, settings, created_at, updated_at
    `
	row := r.db.QueryRow(ctx, query, tenantID, name)
	return scanSiteAccount(row)
}

// GetSiteAccountByID retrieves a site account by its ID.
func (r *AccountRepository) GetSiteAccountByID(ctx context.Context, id uuid.UUID) (SiteAccount, error) {
	const query = `
		SELECT id, tenant_id, name, description, settings, created_at, updated_at
		FROM site_accounts
		WHERE id = $1
	`
	row := r.db.QueryRow(ctx, query, id)
	return scanSiteAccount(row)
}

// UpdateSiteAccount updates an existing site account.
func (r *AccountRepository) UpdateSiteAccount(ctx context.Context, account SiteAccount) error {
	const query = `
		UPDATE site_accounts
		SET name = $2, description = $3, settings = $4, updated_at = NOW()
		WHERE id = $1
	`
	tag, err := r.db.Exec(ctx, query, account.ID, account.Name, account.Description, account.Settings)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AddUserToAccount binds a user to a site account with a specific role.
func (r *AccountRepository) AddUserToAccount(ctx context.Context, accountID, userID uuid.UUID, role string) error {
	const query = `
        INSERT INTO account_users (site_account_id, user_id, role, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (site_account_id, user_id) DO UPDATE
        SET role = EXCLUDED.role, status = $4, updated_at = NOW()
    `
	_, err := r.db.Exec(ctx, query, accountID, userID, role, StatusActive)
	return err
}

// RemoveUserFromAccount soft-deletes a user from a site account by setting status to disabled.
func (r *AccountRepository) RemoveUserFromAccount(ctx context.Context, accountID, userID uuid.UUID) error {
	const query = `
		UPDATE account_users
		SET status = $3, updated_at = NOW()
		WHERE site_account_id = $1 AND user_id = $2
	`
	tag, err := r.db.Exec(ctx, query, accountID, userID, StatusDisabled)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetUserRoles returns the roles a user has in a specific site account.
func (r *AccountRepository) GetUserRoles(ctx context.Context, accountID, userID uuid.UUID) ([]string, error) {
	const query = `
		SELECT role
		FROM account_users
		WHERE site_account_id = $1 AND user_id = $2 AND status = $3
	`
	rows, err := r.db.Query(ctx, query, accountID, userID, StatusActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []string
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, nil
}

// ListTenants returns all tenants the user belongs to.
func (r *AccountRepository) ListTenants(ctx context.Context, userID uuid.UUID) ([]Tenant, error) {
	const query = `
		SELECT t.id, t.name, t.billing_email, t.tier, t.settings, t.created_at, t.updated_at
		FROM tenants t
		JOIN site_accounts sa ON sa.tenant_id = t.id
		JOIN account_users au ON au.site_account_id = sa.id
		WHERE au.user_id = $1 AND au.status = $2
		GROUP BY t.id
	`
	rows, err := r.db.Query(ctx, query, userID, StatusActive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []Tenant
	for rows.Next() {
		t, err := scanTenant(rows)
		if err != nil {
			return nil, err
		}
		tenants = append(tenants, t)
	}
	return tenants, nil

}

// --- Conversations ---

// CreateSession creates a new chat session.
func (r *AccountRepository) CreateSession(ctx context.Context, session Session) (Session, error) {
	const query = `
		INSERT INTO conversations (user_id, site_account_id, title, visibility)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, site_account_id, title, visibility, created_at
	`
	// Default visibility to 'private' if not set
	visibility := session.Visibility
	if visibility == "" {
		visibility = "private"
	}

	row := r.db.QueryRow(ctx, query, session.UserID, session.SiteAccountID, session.Title, visibility)
	var s Session
	if err := row.Scan(&s.ID, &s.UserID, &s.SiteAccountID, &s.Title, &s.Visibility, &s.CreatedAt); err != nil {
		return Session{}, err
	}
	return s, nil
}

// GetSessionByID retrieves a session by ID.
func (r *AccountRepository) GetSessionByID(ctx context.Context, sessionID uuid.UUID) (Session, error) {
	const query = `
		SELECT id, user_id, site_account_id, title, visibility, created_at
		FROM conversations
		WHERE id = $1
	`
	row := r.db.QueryRow(ctx, query, sessionID)
	var s Session
	if err := row.Scan(&s.ID, &s.UserID, &s.SiteAccountID, &s.Title, &s.Visibility, &s.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, ErrNotFound
		}
		return Session{}, err
	}
	return s, nil
}

// ListSessions returns a list of chat sessions based on visibility rules (PRD 2.2.B).
func (r *AccountRepository) ListSessions(ctx context.Context, userID uuid.UUID, currentSiteAccountID *uuid.UUID) ([]Session, error) {
	// Logic:
	// 1. Owner: user_id = $1 (All own sessions)
	// 2. Team Public: site_account_id = $2 AND visibility = 'team_public'
	// 3. Archived: site_account_id = $2 AND visibility = 'archived'

	const query = `
		SELECT id, user_id, site_account_id, title, visibility, created_at
		FROM conversations
		WHERE 
			(user_id = $1)
			OR
			($2::uuid IS NOT NULL AND site_account_id = $2 AND visibility IN ('team_public', 'archived'))
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query, userID, currentSiteAccountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.UserID, &s.SiteAccountID, &s.Title, &s.Visibility, &s.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

// UpdateSessionVisibility updates the visibility of a session.
func (r *AccountRepository) UpdateSessionVisibility(ctx context.Context, sessionID uuid.UUID, visibility string) error {
	const query = `
		UPDATE conversations
		SET visibility = $2, updated_at = NOW()
		WHERE id = $1
	`
	// Note: conversations table might not have updated_at according to schema 0004,
	// but schema 0013 didn't add it. Let's check 0004 content in my memory or task view.
	// 0004 schema: id, user_id, title, created_at, archived_at. No updated_at.
	// So I should remove updated_at = NOW().
	// Wait, schema 0007 added last_message_at.
	// If I can't update updated_at, I won't.

	const queryNoUpdate = `
		UPDATE conversations
		SET visibility = $2
		WHERE id = $1
	`

	tag, err := r.db.Exec(ctx, queryNoUpdate, sessionID, visibility)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetSessionMessages returns messages for a session.
func (r *AccountRepository) GetSessionMessages(ctx context.Context, sessionID uuid.UUID) ([]Message, error) {
	const query = `
		SELECT id, conversation_id, role, content, created_at
		FROM messages
		WHERE conversation_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.Query(ctx, query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, nil
}

// ArchiveUserSessions archives all active sessions for a user.
func (r *AccountRepository) ArchiveUserSessions(ctx context.Context, userID uuid.UUID) error {
	const query = `
		UPDATE conversations
		SET archived_at = NOW()
		WHERE user_id = $1 AND archived_at IS NULL
	`
	_, err := r.db.Exec(ctx, query, userID)
	return err
}

// --- Agent Management ---

// CreateAgent creates a new custom agent template.
func (r *AccountRepository) CreateAgent(ctx context.Context, agent Agent) (Agent, error) {
	const query = `
		INSERT INTO workflow_templates (name, description, tags, is_public)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, description, tags, is_public, created_at
	`
	row := r.db.QueryRow(ctx, query, agent.Name, agent.Description, agent.Tags, agent.IsPublic)
	var a Agent
	if err := row.Scan(&a.ID, &a.Name, &a.Description, &a.Tags, &a.IsPublic, &a.CreatedAt); err != nil {
		return Agent{}, err
	}
	return a, nil
}

// ListAgents returns available public agents.
func (r *AccountRepository) ListAgents(ctx context.Context) ([]Agent, error) {
	const query = `
		SELECT id, name, description, tags, is_public, created_at
		FROM workflow_templates
		WHERE is_public = TRUE
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		if err := rows.Scan(&a.ID, &a.Name, &a.Description, &a.Tags, &a.IsPublic, &a.CreatedAt); err != nil {
			return nil, err
		}
		agents = append(agents, a)
	}
	return agents, nil
}

// --- Insights ---

// GetDashboardStats returns dashboard statistics.
func (r *AccountRepository) GetDashboardStats(ctx context.Context) (DashboardStats, error) {
	// For actual stats, we might count completed workflow runs.
	// Assuming 'status' in workflow_runs table.
	const query = `
		SELECT COUNT(*)
		FROM workflow_runs
		WHERE status = 'succeeded'
	`
	var stats DashboardStats
	err := r.db.QueryRow(ctx, query).Scan(&stats.TasksCompleted)
	if err != nil {
		return DashboardStats{}, err
	}

	// 'HoursSaved' is a bit arbitrary without a real metric, maybe standard * run counts?
	// For now, let's estimate 15 mins (0.25h) saved per task.
	stats.HoursSaved = float64(stats.TasksCompleted) * 0.25

	return stats, nil
}

// --- Organization Management ---

// CountActiveMembers returns the number of active members in a site account.
func (r *AccountRepository) CountActiveMembers(ctx context.Context, accountID uuid.UUID) (int, error) {
	const query = `
		SELECT COUNT(*)
		FROM account_users
		WHERE site_account_id = $1 AND status = $2
	`
	var count int
	err := r.db.QueryRow(ctx, query, accountID, StatusActive).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// DeleteSiteAccount permanently deletes a site account.
// WARNING: This should only be called if the account is empty or force delete is requested.
func (r *AccountRepository) DeleteSiteAccount(ctx context.Context, accountID uuid.UUID) error {
	const query = `
		DELETE FROM site_accounts
		WHERE id = $1
	`
	tag, err := r.db.Exec(ctx, query, accountID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DisableUserInAllAccounts sets the user's status to 'disabled' in all site accounts they belong to.
func (r *AccountRepository) DisableUserInAllAccounts(ctx context.Context, userID uuid.UUID) error {
	const query = `
		UPDATE account_users
		SET status = $2, updated_at = NOW()
		WHERE user_id = $1
	`
	_, err := r.db.Exec(ctx, query, userID, StatusDisabled)
	return err
}

// --- Helpers ---

func scanUser(row pgx.Row) (User, error) {
	var u User
	if err := row.Scan(
		&u.ID,
		&u.Name,
		&u.Email,
		&u.PasswordHash,
		&u.AvatarURL,
		&u.LastActiveTenantID,
		&u.CreatedAt,
		&u.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	return u, nil
}

func scanTenant(row pgx.Row) (Tenant, error) {
	var t Tenant
	if err := row.Scan(
		&t.ID,
		&t.Name,
		&t.BillingEmail,
		&t.Tier,
		&t.Settings,
		&t.CreatedAt,
		&t.UpdatedAt,
	); err != nil {
		return Tenant{}, err
	}
	return t, nil
}

func scanSiteAccount(row pgx.Row) (SiteAccount, error) {
	var s SiteAccount
	if err := row.Scan(
		&s.ID,
		&s.TenantID,
		&s.Name,
		&s.Description,
		&s.Settings,
		&s.CreatedAt,
		&s.UpdatedAt,
	); err != nil {
		return SiteAccount{}, err
	}
	return s, nil
}
