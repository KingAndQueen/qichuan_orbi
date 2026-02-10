package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbit-work/site-auth/internal/config"
	"github.com/orbit-work/site-auth/internal/repository"
	"github.com/orbit-work/site-auth/internal/service"
)

// =============================================================================
// Mock Repository Implementation
// =============================================================================

// MockRepository implements repository.Repository for unit testing.
// It allows fine-grained control over returned data without database access.
type MockRepository struct {
	// User data
	users map[uuid.UUID]repository.User

	// Tenant data
	tenants map[uuid.UUID]repository.Tenant

	// Site account data with tenant association
	siteAccounts map[uuid.UUID]repository.SiteAccount

	// AccountUser bindings: siteAccountID -> userID -> roles
	accountUsers map[uuid.UUID]map[uuid.UUID][]string

	// Session data
	sessions map[uuid.UUID]repository.Session

	// Error injection for testing error paths
	errorToReturn error
}

// NewMockRepository creates a new mock repository for testing.
func NewMockRepository() *MockRepository {
	return &MockRepository{
		users:        make(map[uuid.UUID]repository.User),
		tenants:      make(map[uuid.UUID]repository.Tenant),
		siteAccounts: make(map[uuid.UUID]repository.SiteAccount),
		accountUsers: make(map[uuid.UUID]map[uuid.UUID][]string),
		sessions:     make(map[uuid.UUID]repository.Session),
	}
}

// --- Helper methods for setting up test data ---

// AddUser adds a user to the mock.
func (m *MockRepository) AddUser(user repository.User) {
	m.users[user.ID] = user
}

// AddTenant adds a tenant (master account) to the mock.
func (m *MockRepository) AddTenant(tenant repository.Tenant) {
	m.tenants[tenant.ID] = tenant
}

// AddSiteAccount adds a site account (sub account) to the mock.
func (m *MockRepository) AddSiteAccount(sa repository.SiteAccount) {
	m.siteAccounts[sa.ID] = sa
}

// AddUserToSiteAccount binds a user to a site account with specific roles.
func (m *MockRepository) AddUserToSiteAccount(siteAccountID, userID uuid.UUID, roles []string) {
	if m.accountUsers[siteAccountID] == nil {
		m.accountUsers[siteAccountID] = make(map[uuid.UUID][]string)
	}
	m.accountUsers[siteAccountID][userID] = roles
}

// AddSession adds a session to the mock.
func (m *MockRepository) AddSession(session repository.Session) {
	m.sessions[session.ID] = session
}

// SetError sets an error to be returned by the next call.
func (m *MockRepository) SetError(err error) {
	m.errorToReturn = err
}

// --- Repository interface implementation ---

func (m *MockRepository) WithTx(ctx context.Context, fn func(repository.Repository) error) error {
	return fn(m)
}

func (m *MockRepository) CreateUser(ctx context.Context, email, passwordHash, name string) (repository.User, error) {
	if m.errorToReturn != nil {
		return repository.User{}, m.errorToReturn
	}
	user := repository.User{
		ID:        uuid.New(),
		Name:      name,
		Email:     &email,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	m.users[user.ID] = user
	return user, nil
}

func (m *MockRepository) GetUserByEmail(ctx context.Context, email string) (repository.User, error) {
	if m.errorToReturn != nil {
		return repository.User{}, m.errorToReturn
	}
	for _, u := range m.users {
		if u.Email != nil && *u.Email == email {
			return u, nil
		}
	}
	return repository.User{}, repository.ErrNotFound
}

func (m *MockRepository) GetUserByID(ctx context.Context, id uuid.UUID) (repository.User, error) {
	if m.errorToReturn != nil {
		return repository.User{}, m.errorToReturn
	}
	user, ok := m.users[id]
	if !ok {
		return repository.User{}, repository.ErrNotFound
	}
	return user, nil
}

func (m *MockRepository) UpdateLastLoginContext(ctx context.Context, userID, tenantID uuid.UUID) error {
	return m.errorToReturn
}

func (m *MockRepository) CreateTenant(ctx context.Context, name string, billingEmail *string) (repository.Tenant, error) {
	if m.errorToReturn != nil {
		return repository.Tenant{}, m.errorToReturn
	}
	tenant := repository.Tenant{
		ID:           uuid.New(),
		Name:         name,
		BillingEmail: billingEmail,
		Tier:         "free",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	m.tenants[tenant.ID] = tenant
	return tenant, nil
}

func (m *MockRepository) CreateSiteAccount(ctx context.Context, tenantID uuid.UUID, name string) (repository.SiteAccount, error) {
	if m.errorToReturn != nil {
		return repository.SiteAccount{}, m.errorToReturn
	}
	sa := repository.SiteAccount{
		ID:        uuid.New(),
		TenantID:  tenantID,
		Name:      name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	m.siteAccounts[sa.ID] = sa
	return sa, nil
}

func (m *MockRepository) GetSiteAccountByID(ctx context.Context, id uuid.UUID) (repository.SiteAccount, error) {
	if m.errorToReturn != nil {
		return repository.SiteAccount{}, m.errorToReturn
	}
	sa, ok := m.siteAccounts[id]
	if !ok {
		return repository.SiteAccount{}, repository.ErrNotFound
	}
	return sa, nil
}

func (m *MockRepository) UpdateSiteAccount(ctx context.Context, account repository.SiteAccount) error {
	if m.errorToReturn != nil {
		return m.errorToReturn
	}
	m.siteAccounts[account.ID] = account
	return nil
}

func (m *MockRepository) AddUserToAccount(ctx context.Context, accountID, userID uuid.UUID, role string) error {
	if m.errorToReturn != nil {
		return m.errorToReturn
	}
	if m.accountUsers[accountID] == nil {
		m.accountUsers[accountID] = make(map[uuid.UUID][]string)
	}
	m.accountUsers[accountID][userID] = append(m.accountUsers[accountID][userID], role)
	return nil
}

func (m *MockRepository) RemoveUserFromAccount(ctx context.Context, accountID, userID uuid.UUID) error {
	if m.errorToReturn != nil {
		return m.errorToReturn
	}
	if m.accountUsers[accountID] != nil {
		delete(m.accountUsers[accountID], userID)
	}
	return nil
}

// GetUserRoles returns the roles a user has in a specific site account.
// This is the key method for access control - returns empty slice if user has no access.
func (m *MockRepository) GetUserRoles(ctx context.Context, accountID, userID uuid.UUID) ([]string, error) {
	if m.errorToReturn != nil {
		return nil, m.errorToReturn
	}
	if users, ok := m.accountUsers[accountID]; ok {
		if roles, ok := users[userID]; ok {
			return roles, nil
		}
	}
	return []string{}, nil // No roles = no access
}

func (m *MockRepository) ListTenants(ctx context.Context, userID uuid.UUID) ([]repository.Tenant, error) {
	if m.errorToReturn != nil {
		return nil, m.errorToReturn
	}
	var tenants []repository.Tenant
	seenTenants := make(map[uuid.UUID]bool)

	for saID, users := range m.accountUsers {
		if _, ok := users[userID]; ok {
			if sa, ok := m.siteAccounts[saID]; ok {
				if !seenTenants[sa.TenantID] {
					if tenant, ok := m.tenants[sa.TenantID]; ok {
						tenants = append(tenants, tenant)
						seenTenants[sa.TenantID] = true
					}
				}
			}
		}
	}
	return tenants, nil
}

func (m *MockRepository) CreateSession(ctx context.Context, session repository.Session) (repository.Session, error) {
	if m.errorToReturn != nil {
		return repository.Session{}, m.errorToReturn
	}
	session.ID = uuid.New()
	session.CreatedAt = time.Now()
	m.sessions[session.ID] = session
	return session, nil
}

func (m *MockRepository) GetSessionByID(ctx context.Context, sessionID uuid.UUID) (repository.Session, error) {
	if m.errorToReturn != nil {
		return repository.Session{}, m.errorToReturn
	}
	session, ok := m.sessions[sessionID]
	if !ok {
		return repository.Session{}, repository.ErrNotFound
	}
	return session, nil
}

func (m *MockRepository) ListSessions(ctx context.Context, userID uuid.UUID, currentSiteAccountID *uuid.UUID) ([]repository.Session, error) {
	if m.errorToReturn != nil {
		return nil, m.errorToReturn
	}
	var sessions []repository.Session
	for _, s := range m.sessions {
		if s.UserID == userID {
			sessions = append(sessions, s)
		}
	}
	return sessions, nil
}

func (m *MockRepository) GetSessionMessages(ctx context.Context, sessionID uuid.UUID) ([]repository.Message, error) {
	return nil, m.errorToReturn
}

func (m *MockRepository) UpdateSessionVisibility(ctx context.Context, sessionID uuid.UUID, visibility string) error {
	if m.errorToReturn != nil {
		return m.errorToReturn
	}
	if session, ok := m.sessions[sessionID]; ok {
		session.Visibility = visibility
		m.sessions[sessionID] = session
		return nil
	}
	return repository.ErrNotFound
}

func (m *MockRepository) ArchiveUserSessions(ctx context.Context, userID uuid.UUID) error {
	return m.errorToReturn
}

func (m *MockRepository) CreateAgent(ctx context.Context, agent repository.Agent) (repository.Agent, error) {
	return repository.Agent{}, m.errorToReturn
}

func (m *MockRepository) ListAgents(ctx context.Context) ([]repository.Agent, error) {
	return nil, m.errorToReturn
}

func (m *MockRepository) GetDashboardStats(ctx context.Context) (repository.DashboardStats, error) {
	return repository.DashboardStats{}, m.errorToReturn
}

func (m *MockRepository) CountActiveMembers(ctx context.Context, accountID uuid.UUID) (int, error) {
	if m.errorToReturn != nil {
		return 0, m.errorToReturn
	}
	if users, ok := m.accountUsers[accountID]; ok {
		return len(users), nil
	}
	return 0, nil
}

func (m *MockRepository) DeleteSiteAccount(ctx context.Context, accountID uuid.UUID) error {
	if m.errorToReturn != nil {
		return m.errorToReturn
	}
	delete(m.siteAccounts, accountID)
	delete(m.accountUsers, accountID)
	return nil
}

func (m *MockRepository) DisableUserInAllAccounts(ctx context.Context, userID uuid.UUID) error {
	if m.errorToReturn != nil {
		return m.errorToReturn
	}
	for saID := range m.accountUsers {
		delete(m.accountUsers[saID], userID)
	}
	return nil
}

// =============================================================================
// Mock Session Manager
// =============================================================================

// MockSessionManager implements session.SessionManager for testing.
type MockSessionManager struct{}

func (m *MockSessionManager) Create(ctx context.Context, accountID uuid.UUID, username, name string) (mockSession, error) {
	return mockSession{
		Token:     uuid.New().String(),
		AccountID: accountID.String(),
		Username:  username,
		Name:      name,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}, nil
}

func (m *MockSessionManager) Get(ctx context.Context, token string) (mockSession, error) {
	return mockSession{}, nil
}

func (m *MockSessionManager) Delete(ctx context.Context, token string) error {
	return nil
}

func (m *MockSessionManager) Refresh(ctx context.Context, token string) error {
	return nil
}

type mockSession struct {
	Token     string
	AccountID string
	Username  string
	Name      string
	ExpiresAt time.Time
}

// =============================================================================
// Access Control Tests
// =============================================================================

// TestCheckAccess_SameTenant verifies that a user CAN access resources
// within their own tenant (master account).
//
// Scenario:
//   - User A belongs to Tenant X (via SiteAccount X)
//   - User A attempts to access a resource in SiteAccount X
//
// Expected: Access should be ALLOWED
func TestCheckAccess_SameTenant(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	// Create Tenant X (Master Account X)
	tenantX := repository.Tenant{
		ID:   uuid.New(),
		Name: "Acme Corp",
		Tier: "pro",
	}
	mockRepo.AddTenant(tenantX)

	// Create SiteAccount X under Tenant X
	siteAccountX := repository.SiteAccount{
		ID:       uuid.New(),
		TenantID: tenantX.ID,
		Name:     "Engineering",
	}
	mockRepo.AddSiteAccount(siteAccountX)

	// Create User A
	userA := repository.User{
		ID:   uuid.New(),
		Name: "Alice",
	}
	mockRepo.AddUser(userA)

	// Bind User A to SiteAccount X with "member" role
	mockRepo.AddUserToSiteAccount(siteAccountX.ID, userA.ID, []string{repository.RoleMember})

	// Create AuthService with mock repository
	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act: Check if User A can access resources in SiteAccount X
	// Using CheckAgentPermission as the access control method
	canAccess, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountX.ID, "view")

	// Assert
	require.NoError(t, err, "Should not return error for same-tenant access check")
	assert.True(t, canAccess, "User should have access to resources in their own tenant")
}

// TestCheckAccess_SameTenant_OwnerRole verifies that an owner has full access.
func TestCheckAccess_SameTenant_OwnerRole(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	tenantX := repository.Tenant{ID: uuid.New(), Name: "Acme Corp", Tier: "enterprise"}
	mockRepo.AddTenant(tenantX)

	siteAccountX := repository.SiteAccount{ID: uuid.New(), TenantID: tenantX.ID, Name: "Headquarters"}
	mockRepo.AddSiteAccount(siteAccountX)

	userA := repository.User{ID: uuid.New(), Name: "Alice Owner"}
	mockRepo.AddUser(userA)

	// Owner role should have full permissions including execute
	mockRepo.AddUserToSiteAccount(siteAccountX.ID, userA.ID, []string{repository.RoleOwner})

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act & Assert: Owner can execute
	canExecute, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountX.ID, "execute")
	require.NoError(t, err)
	assert.True(t, canExecute, "Owner should be able to execute agents")

	// Owner can also view
	canView, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountX.ID, "view")
	require.NoError(t, err)
	assert.True(t, canView, "Owner should be able to view agents")
}

// TestCheckAccess_SameTenant_ViewerCannotExecute verifies L1 permission restrictions.
func TestCheckAccess_SameTenant_ViewerCannotExecute(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	tenantX := repository.Tenant{ID: uuid.New(), Name: "Corp X"}
	mockRepo.AddTenant(tenantX)

	siteAccountX := repository.SiteAccount{ID: uuid.New(), TenantID: tenantX.ID, Name: "ReadOnly Team"}
	mockRepo.AddSiteAccount(siteAccountX)

	viewer := repository.User{ID: uuid.New(), Name: "Viewer User"}
	mockRepo.AddUser(viewer)

	// Viewer (L1) role - read-only
	mockRepo.AddUserToSiteAccount(siteAccountX.ID, viewer.ID, []string{"viewer"})

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act: Viewer can view but cannot execute
	canView, err := svc.CheckAgentPermission(ctx, viewer.ID, siteAccountX.ID, "view")
	require.NoError(t, err)
	assert.True(t, canView, "Viewer should be able to view")

	canExecute, err := svc.CheckAgentPermission(ctx, viewer.ID, siteAccountX.ID, "execute")
	require.NoError(t, err)
	assert.False(t, canExecute, "Viewer should NOT be able to execute")
}

// TestCheckAccess_CrossTenant verifies that a user CANNOT access resources
// from a different tenant (master account).
//
// Scenario:
//   - User A belongs to Tenant X
//   - User A attempts to access a resource in Tenant Y's SiteAccount
//
// Expected: Access should be DENIED (no roles returned)
func TestCheckAccess_CrossTenant(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	// Create Tenant X
	tenantX := repository.Tenant{
		ID:   uuid.New(),
		Name: "Acme Corp",
		Tier: "pro",
	}
	mockRepo.AddTenant(tenantX)

	// Create Tenant Y (different organization)
	tenantY := repository.Tenant{
		ID:   uuid.New(),
		Name: "Globex Inc",
		Tier: "enterprise",
	}
	mockRepo.AddTenant(tenantY)

	// Create SiteAccount X under Tenant X
	siteAccountX := repository.SiteAccount{
		ID:       uuid.New(),
		TenantID: tenantX.ID,
		Name:     "Acme Engineering",
	}
	mockRepo.AddSiteAccount(siteAccountX)

	// Create SiteAccount Y under Tenant Y
	siteAccountY := repository.SiteAccount{
		ID:       uuid.New(),
		TenantID: tenantY.ID,
		Name:     "Globex Research",
	}
	mockRepo.AddSiteAccount(siteAccountY)

	// Create User A (belongs to Tenant X only)
	userA := repository.User{
		ID:   uuid.New(),
		Name: "Alice",
	}
	mockRepo.AddUser(userA)

	// Bind User A to SiteAccount X (Tenant X) ONLY
	mockRepo.AddUserToSiteAccount(siteAccountX.ID, userA.ID, []string{repository.RoleMember})
	// Note: User A is NOT added to SiteAccount Y

	// Create AuthService
	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act: User A tries to access resources in SiteAccount Y (Tenant Y)
	canAccess, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountY.ID, "view")

	// Assert: Access should be DENIED
	require.NoError(t, err, "Should not return error, just deny access")
	assert.False(t, canAccess, "User should NOT have access to resources in a different tenant")
}

// TestCheckAccess_CrossTenant_WithMultipleSiteAccounts verifies isolation
// when user has access to multiple site accounts in their own tenant.
func TestCheckAccess_CrossTenant_WithMultipleSiteAccounts(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	// Tenant X with multiple site accounts
	tenantX := repository.Tenant{ID: uuid.New(), Name: "Acme Corp"}
	mockRepo.AddTenant(tenantX)

	siteAccountX1 := repository.SiteAccount{ID: uuid.New(), TenantID: tenantX.ID, Name: "Acme Dept 1"}
	siteAccountX2 := repository.SiteAccount{ID: uuid.New(), TenantID: tenantX.ID, Name: "Acme Dept 2"}
	mockRepo.AddSiteAccount(siteAccountX1)
	mockRepo.AddSiteAccount(siteAccountX2)

	// Tenant Y (different organization)
	tenantY := repository.Tenant{ID: uuid.New(), Name: "Evil Corp"}
	mockRepo.AddTenant(tenantY)

	siteAccountY := repository.SiteAccount{ID: uuid.New(), TenantID: tenantY.ID, Name: "Evil Dept"}
	mockRepo.AddSiteAccount(siteAccountY)

	// User A has access to both departments in Tenant X
	userA := repository.User{ID: uuid.New(), Name: "Multi-Dept User"}
	mockRepo.AddUser(userA)
	mockRepo.AddUserToSiteAccount(siteAccountX1.ID, userA.ID, []string{repository.RoleOwner})
	mockRepo.AddUserToSiteAccount(siteAccountX2.ID, userA.ID, []string{repository.RoleMember})

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act & Assert: User can access both X1 and X2
	canAccessX1, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountX1.ID, "execute")
	require.NoError(t, err)
	assert.True(t, canAccessX1, "User should have owner access to X1")

	canAccessX2, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountX2.ID, "view")
	require.NoError(t, err)
	assert.True(t, canAccessX2, "User should have member access to X2")

	// But CANNOT access Tenant Y's site account
	canAccessY, err := svc.CheckAgentPermission(ctx, userA.ID, siteAccountY.ID, "view")
	require.NoError(t, err)
	assert.False(t, canAccessY, "User should NOT have access to Tenant Y")
}

// TestCheckAccess_NoRolesReturnsNoAccess verifies that users without
// any roles in a site account are denied access.
func TestCheckAccess_NoRolesReturnsNoAccess(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	tenant := repository.Tenant{ID: uuid.New(), Name: "Test Corp"}
	mockRepo.AddTenant(tenant)

	siteAccount := repository.SiteAccount{ID: uuid.New(), TenantID: tenant.ID, Name: "Test Dept"}
	mockRepo.AddSiteAccount(siteAccount)

	// User exists but has NO bindings to any site account
	orphanUser := repository.User{ID: uuid.New(), Name: "Orphan User"}
	mockRepo.AddUser(orphanUser)
	// Note: NOT calling AddUserToSiteAccount

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act
	canAccess, err := svc.CheckAgentPermission(ctx, orphanUser.ID, siteAccount.ID, "view")

	// Assert
	require.NoError(t, err)
	assert.False(t, canAccess, "User with no roles should not have access")
}

// TestCheckAccess_RepositoryError verifies error handling when repository fails.
func TestCheckAccess_RepositoryError(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	// Set error to be returned
	expectedErr := errors.New("database connection failed")
	mockRepo.SetError(expectedErr)

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act
	_, err = svc.CheckAgentPermission(ctx, uuid.New(), uuid.New(), "view")

	// Assert: Error should be propagated
	require.Error(t, err)
	assert.Contains(t, err.Error(), "database connection failed")
}

// TestPublishSession_SameTenant verifies session publishing within same tenant.
func TestPublishSession_SameTenant(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	tenant := repository.Tenant{ID: uuid.New(), Name: "Acme Corp"}
	mockRepo.AddTenant(tenant)

	siteAccount := repository.SiteAccount{ID: uuid.New(), TenantID: tenant.ID, Name: "Engineering"}
	mockRepo.AddSiteAccount(siteAccount)

	user := repository.User{ID: uuid.New(), Name: "Session Owner"}
	mockRepo.AddUser(user)

	// Create a session owned by the user
	session := repository.Session{
		ID:            uuid.New(),
		UserID:        user.ID,
		SiteAccountID: &siteAccount.ID,
		Title:         "My Private Chat",
		Visibility:    "private",
	}
	mockRepo.AddSession(session)

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act: Owner publishes their session
	err = svc.PublishSession(ctx, user.ID, session.ID)

	// Assert
	require.NoError(t, err, "Owner should be able to publish their own session")

	// Verify visibility was updated
	updatedSession, err := mockRepo.GetSessionByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, "team_public", updatedSession.Visibility)
}

// TestPublishSession_CrossUser verifies that users cannot publish
// sessions owned by other users (even in the same tenant).
func TestPublishSession_CrossUser(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	tenant := repository.Tenant{ID: uuid.New(), Name: "Acme Corp"}
	mockRepo.AddTenant(tenant)

	siteAccount := repository.SiteAccount{ID: uuid.New(), TenantID: tenant.ID, Name: "Team"}
	mockRepo.AddSiteAccount(siteAccount)

	// Two users in the same tenant
	userA := repository.User{ID: uuid.New(), Name: "Alice"}
	userB := repository.User{ID: uuid.New(), Name: "Bob"}
	mockRepo.AddUser(userA)
	mockRepo.AddUser(userB)

	// Session owned by User A
	sessionA := repository.Session{
		ID:            uuid.New(),
		UserID:        userA.ID,
		SiteAccountID: &siteAccount.ID,
		Title:         "Alice's Private Chat",
		Visibility:    "private",
	}
	mockRepo.AddSession(sessionA)

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act: User B tries to publish User A's session
	err = svc.PublishSession(ctx, userB.ID, sessionA.ID)

	// Assert: Should be denied
	require.Error(t, err)
	assert.Equal(t, service.ErrPermissionDenied, err, "Should return permission denied error")
}

// TestCheckAccess_EditorRole verifies that editor role can execute.
func TestCheckAccess_EditorRole(t *testing.T) {
	// Arrange
	ctx := context.Background()
	mockRepo := NewMockRepository()

	tenant := repository.Tenant{ID: uuid.New(), Name: "Corp"}
	mockRepo.AddTenant(tenant)

	siteAccount := repository.SiteAccount{ID: uuid.New(), TenantID: tenant.ID, Name: "Dev Team"}
	mockRepo.AddSiteAccount(siteAccount)

	editor := repository.User{ID: uuid.New(), Name: "Editor User"}
	mockRepo.AddUser(editor)

	// Editor role (L3) - can execute
	mockRepo.AddUserToSiteAccount(siteAccount.ID, editor.ID, []string{"editor"})

	svc, err := service.NewAuthService(mockRepo, nil, nil, config.Config{})
	require.NoError(t, err)

	// Act & Assert: Editor can execute
	canExecute, err := svc.CheckAgentPermission(ctx, editor.ID, siteAccount.ID, "execute")
	require.NoError(t, err)
	assert.True(t, canExecute, "Editor should be able to execute agents")
}
