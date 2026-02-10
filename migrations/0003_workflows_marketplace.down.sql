DROP TRIGGER IF EXISTS trg_user_trials_updated_at ON user_trials;
DROP TABLE IF EXISTS user_trials;
DROP INDEX IF EXISTS idx_wt_tags_gin;
DROP TABLE IF EXISTS workflow_templates;