-- Create table to store site login accounts
CREATE TABLE IF NOT EXISTS site_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username CITEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_site_accounts_set_updated_at ON site_accounts;
CREATE TRIGGER trg_site_accounts_set_updated_at
BEFORE UPDATE ON site_accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Helpful index for login lookups (case insensitive handled by citext)
CREATE INDEX IF NOT EXISTS idx_site_accounts_status ON site_accounts (status);
