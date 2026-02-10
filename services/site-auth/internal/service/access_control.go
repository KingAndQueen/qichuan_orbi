package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/orbit-work/site-auth/internal/repository"
)

var (
	ErrPermissionDenied = errors.New("permission denied")
)

// CheckAgentPermission verifies if the user has permission to perform an action on an agent (PRD 2.2.A).
// L1 (Viewer): Read-only
// L3 (Editor): Execute/Edit
func (s *AuthService) CheckAgentPermission(ctx context.Context, userID, siteAccountID uuid.UUID, action string) (bool, error) {
	// Implements PRD 2.2.A
	roles, err := s.accounts.GetUserRoles(ctx, siteAccountID, userID)
	if err != nil {
		return false, fmt.Errorf("getting user roles: %w", err)
	}

	for _, role := range roles {
		if role == repository.RoleOwner || role == "editor" { // Editor/Owner (L3)
			return true, nil
		}
		if role == repository.RoleMember || role == "viewer" { // Viewer (L1)
			if action == "execute" {
				return false, nil // L1 cannot execute
			}
			return true, nil // L1 can view
		}
	}

	return false, nil // No role
}

// PublishSession makes a session visible to the team (PRD 2.2.B).
func (s *AuthService) PublishSession(ctx context.Context, userID, sessionID uuid.UUID) error {
	sess, err := s.accounts.GetSessionByID(ctx, sessionID)
	if err != nil {
		return err
	}

	if sess.UserID != userID {
		return ErrPermissionDenied
	}

	// Update visibility to 'team_public'
	return s.accounts.UpdateSessionVisibility(ctx, sessionID, "team_public")
}
