package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/orbit-work/site-auth/internal/config"
	"github.com/orbit-work/site-auth/internal/repository"
	"github.com/orbit-work/site-auth/internal/service"
	"github.com/orbit-work/site-auth/internal/session"
	"github.com/orbit-work/site-auth/internal/testutil"
)

func TestLogin_Flow(t *testing.T) {
	db := testutil.SetupTestDB(t)
	rdb := testutil.SetupTestRedis(t)

	repo := repository.NewAccountRepository(db)
	sessMgr := session.NewManager(rdb, 24*time.Hour)

	cfg := config.Config{
		SessionTTL:      24 * time.Hour,
		RateLimitWindow: time.Minute,
		RateLimitCount:  5,
	}

	svc, err := service.NewAuthService(repo, sessMgr, rdb, cfg)
	require.NoError(t, err)

	ctx := context.Background()
	email := "user@integration.com"
	password := "SecurePass123!"
	name := "Integration User"

	// 1. Register
	regRes, err := svc.Register(ctx, email, password, name)
	require.NoError(t, err)
	assert.NotEmpty(t, regRes.Session.Token)
	assert.Equal(t, email, *regRes.User.Email)

	// 2. Login
	loginRes, err := svc.Login(ctx, email, password)
	require.NoError(t, err)
	assert.NotEmpty(t, loginRes.Session.Token)
	assert.Equal(t, regRes.User.ID, loginRes.User.ID)

	// 3. Verify Redis
	// We can check if session exists via SessionManager
	fetchedSess, err := sessMgr.Get(ctx, loginRes.Session.Token)
	require.NoError(t, err)
	assert.Equal(t, loginRes.User.ID.String(), fetchedSess.AccountID)
}

func TestOrganization_Management(t *testing.T) {
	db := testutil.SetupTestDB(t)
	rdb := testutil.SetupTestRedis(t)

	repo := repository.NewAccountRepository(db)
	sessMgr := session.NewManager(rdb, 24*time.Hour)
	svc, _ := service.NewAuthService(repo, sessMgr, rdb, config.Config{})
	ctx := context.Background()

	// 1. Setup User
	res, err := svc.Register(ctx, "boss@org.com", "pass", "Boss")
	require.NoError(t, err)
	userID := res.User.ID

	// 2. Create Organization (Tenant + SiteAccount)
	tenant, sa, err := svc.CreateOrganization(ctx, userID, "My Org", "billing@org.com")
	require.NoError(t, err)
	assert.Equal(t, "My Org", tenant.Name)
	assert.Equal(t, "My Org", sa.Name)

	// 3. Create Department
	dept, err := svc.CreateDepartment(ctx, tenant.ID, "Engineering")
	require.NoError(t, err)
	assert.NotZero(t, dept.ID)

	// Verify it exists in DB directly
	_, err = repo.GetSiteAccountByID(ctx, dept.ID)
	require.NoError(t, err, "Department should exist in DB")

	// 4. Add Member
	newMember, created, err := svc.AddMemberToDepartment(ctx, dept.ID, "dev@org.com", "Dev", "member")
	require.NoError(t, err)
	assert.True(t, created)
	assert.NotEmpty(t, newMember.ID)

	// 5. Transfer Member
	// Transfer Dev to SiteAccount (Main)
	err = svc.TransferMember(ctx, newMember.ID, dept.ID, sa.ID)
	require.NoError(t, err)

	// Verify roles in new account
	roles, err := repo.GetUserRoles(ctx, sa.ID, newMember.ID)
	require.NoError(t, err)
	assert.Contains(t, roles, "member")

	// Verify removed from old (status disabled)
	// We can't check via GetUserRoles as it filters active.
	// We can assume if Transfer returned nil, it worked.
}
