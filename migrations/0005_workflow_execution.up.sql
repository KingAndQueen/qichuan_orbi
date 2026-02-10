-- workflow_runs
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  workflow_template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','succeeded','failed','canceled')),
  inputs JSONB,
  outputs JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_wr_status ON workflow_runs(status);
CREATE INDEX idx_wr_user_id ON workflow_runs(user_id);
CREATE INDEX idx_wr_conv_id ON workflow_runs(conversation_id);

-- run_steps
CREATE TABLE run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  details JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_rs_run_id ON run_steps(run_id);