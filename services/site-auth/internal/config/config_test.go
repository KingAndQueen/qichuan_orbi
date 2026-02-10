package config

import "testing"

func TestFromEnvLoadsDefaultWorkflowID(t *testing.T) {
	t.Setenv("SITE_AUTH_DATABASE_URL", "postgres://localhost/test")
	t.Setenv("SITE_AUTH_DEFAULT_WORKFLOW_ID", "wf-system")

	cfg, err := FromEnv()
	if err != nil {
		t.Fatalf("FromEnv returned error: %v", err)
	}

	if cfg.DefaultWorkflowID != "wf-system" {
		t.Fatalf("expected DefaultWorkflowID to be wf-system, got %q", cfg.DefaultWorkflowID)
	}

}
