DROP INDEX IF EXISTS idx_upm_user_id;
DROP TABLE IF EXISTS user_provider_mappings;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TABLE IF EXISTS users;