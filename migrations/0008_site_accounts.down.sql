-- Drop index, trigger and table for site accounts
DROP INDEX IF EXISTS idx_site_accounts_status;
DROP TRIGGER IF EXISTS trg_site_accounts_set_updated_at ON site_accounts;
DROP TABLE IF EXISTS site_accounts;
