-- 0011_refactor_identity_v7.up.sql
-- Description: Refactor identity model to Tenant -> Site Account -> User (V7)
-- Author: Senior Database Architect

-- 1. Table `tenants` (Main Account / Enterprise)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  billing_email CITEXT,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for tenants.updated_at
DROP TRIGGER IF EXISTS trg_tenants_set_updated_at ON tenants;
CREATE TRIGGER trg_tenants_set_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2. Table `site_accounts` (Sub-account / Business Department)
-- Note: Dropping existing table from migration 0008 as schema is completely redefined
DROP TABLE IF EXISTS site_accounts CASCADE;

CREATE TABLE site_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tenant lookup
CREATE INDEX idx_site_accounts_tenant_id ON site_accounts(tenant_id);

-- Trigger for site_accounts.updated_at
DROP TRIGGER IF EXISTS trg_site_accounts_set_updated_at ON site_accounts;
CREATE TRIGGER trg_site_accounts_set_updated_at
BEFORE UPDATE ON site_accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 3. Table `account_users` (User-SiteAccount Association)
CREATE TABLE account_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_account_id UUID NOT NULL REFERENCES site_accounts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'invited')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ensure a user has only one role per site account
  UNIQUE(site_account_id, user_id)
);

-- Partial index for fast lookup of active members
CREATE INDEX idx_account_users_active_lookup ON account_users(site_account_id, user_id) WHERE status = 'active';

-- Trigger for account_users.updated_at
DROP TRIGGER IF EXISTS trg_account_users_set_updated_at ON account_users;
CREATE TRIGGER trg_account_users_set_updated_at
BEFORE UPDATE ON account_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
