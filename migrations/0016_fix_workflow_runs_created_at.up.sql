-- Fix missing created_at column in workflow_runs
ALTER TABLE workflow_runs
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
