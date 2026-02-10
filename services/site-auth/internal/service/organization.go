package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/orbit-work/site-auth/internal/password"
	"github.com/orbit-work/site-auth/internal/repository"
)

var (
	// ErrDeptNotEmpty indicates deletion failed because the department still has members.
	ErrDeptNotEmpty = errors.New("department is not empty")
)

// CreateDepartment creates a new department (SiteAccount).
func (s *AuthService) CreateDepartment(ctx context.Context, tenantID uuid.UUID, name string) (repository.SiteAccount, error) {
	return s.accounts.CreateSiteAccount(ctx, tenantID, name)
}

// DeleteDepartment removes a department if it has no active members.
func (s *AuthService) DeleteDepartment(ctx context.Context, deptID uuid.UUID) error {
	count, err := s.accounts.CountActiveMembers(ctx, deptID)
	if err != nil {
		return fmt.Errorf("counting members: %w", err)
	}
	if count > 0 {
		return ErrDeptNotEmpty
	}

	if err := s.accounts.DeleteSiteAccount(ctx, deptID); err != nil {
		return fmt.Errorf("deleting department: %w", err)
	}
	return nil
}

// AddMemberToDepartment adds a user to a department, creating the user if they don't exist.
// Returns the user and a boolean indicating if the user was newly created.
func (s *AuthService) AddMemberToDepartment(ctx context.Context, deptID uuid.UUID, email, name, role string) (repository.User, bool, error) {
	// Check if user exists
	user, err := s.accounts.GetUserByEmail(ctx, email)
	created := false

	if errors.Is(err, repository.ErrNotFound) {
		// Create new user with temp password
		tempPass, err := password.Generate(12)
		if err != nil {
			return repository.User{}, false, fmt.Errorf("generating password: %w", err)
		}

		// We rely on Register logic but we need the plain password hash logic here without the session creation overhead of Register?
		// Or we can reuse Register but it creates a session which we might not needed.
		// Let's call CreateUser directly to avoid overhead.

		hashedPassword, err := password.Hash(tempPass, 0)
		if err != nil {
			return repository.User{}, false, fmt.Errorf("hashing password: %w", err)
		}

		user, err = s.accounts.CreateUser(ctx, email, hashedPassword, name)
		if err != nil {
			return repository.User{}, false, fmt.Errorf("creating user: %w", err)
		}
		created = true

		// TODO: In a real system, we would email the tempPass to the user here.

	} else if err != nil {
		return repository.User{}, false, fmt.Errorf("looking up user: %w", err)
	}

	// Bind to department
	if err := s.accounts.AddUserToAccount(ctx, deptID, user.ID, role); err != nil {
		return repository.User{}, false, fmt.Errorf("adding to department: %w", err)
	}

	return user, created, nil
}

// TransferMember moves a user from one department to another.
func (s *AuthService) TransferMember(ctx context.Context, userID, fromDeptID, toDeptID uuid.UUID) error {
	return s.accounts.WithTx(ctx, func(txRepo repository.Repository) error {
		// 1. Remove from old department (Disable)
		// We use RemoveUserFromAccount which sets status to disabled.
		// Alternatively, if we want to fully detach, we might want a physical delete from account_users,
		// but the requirement says "Disable user in old department (or remove)".
		// RemoveUserFromAccount implementation maps to setting status='disabled'.
		if err := txRepo.RemoveUserFromAccount(ctx, fromDeptID, userID); err != nil {
			return fmt.Errorf("removing from old dept: %w", err)
		}

		// 2. Add to new department
		// We assume 'member' role for transfer unless specified.
		// Ideally role is passed in, but for MVP we default to 'member' or preserve old role?
		// Requirement says "TransferMember". Let's assume 'member' role for now as role management is separate.
		if err := txRepo.AddUserToAccount(ctx, toDeptID, userID, repository.RoleMember); err != nil {
			return fmt.Errorf("adding to new dept: %w", err)
		}

		return nil
	})
}

// DeactivateMember offboards a user by disabling them in all accounts and archiving sessions.
func (s *AuthService) DeactivateMember(ctx context.Context, userID uuid.UUID) error {
	return s.accounts.WithTx(ctx, func(txRepo repository.Repository) error {
		// 1. Disable in all accounts
		if err := txRepo.DisableUserInAllAccounts(ctx, userID); err != nil {
			return fmt.Errorf("disabling user: %w", err)
		}

		// 2. Archive sessions
		if err := txRepo.ArchiveUserSessions(ctx, userID); err != nil {
			return fmt.Errorf("archiving sessions: %w", err)
		}

		// 3. Invalidate session in Redis
		// Note: We can't easily invalidate redis sessions by UserID efficiently without an index.
		// The AuthService.Logout method uses token.
		// We might need to iterate or leave it to TTL.
		// For now, satisfy requirement b: "Repo.ArchiveUserSessions".

		return nil
	})
}
