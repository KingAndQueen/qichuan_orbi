-- ============================================================================
-- Migration: 0015_sync_schema_with_docs.down.sql
-- Description: Rollback sync with SSOT (docs/technical/data/database-design.md)
-- Author: Database Architecture Team
-- Date: 2026-02-02
--
-- WARNING: This rollback will drop all new tables and remove added columns.
-- Data in these tables will be permanently lost!
-- ============================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS trg_workflow_toggles_updated_at ON workflow_authorization_toggles;
DROP TRIGGER IF EXISTS trg_seat_pools_updated_at ON seat_pools;
DROP TRIGGER IF EXISTS trg_master_account_quotas_updated_at ON master_account_quotas;

-- Section 6: Infrastructure Module
DROP TABLE IF EXISTS system_locks CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- Section 5: Ontology / SOR
DROP TABLE IF EXISTS sor_side_effect_profiles CASCADE;
DROP TABLE IF EXISTS sor_link_types CASCADE;
DROP TABLE IF EXISTS sor_action_types CASCADE;
DROP TABLE IF EXISTS sor_object_types CASCADE;

-- Section 4: Analytics & Audit Module
DROP TABLE IF EXISTS metering_events CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS analytics_daily_usage CASCADE;
DROP TABLE IF EXISTS async_tasks CASCADE;

-- Remove added columns from workflow_runs
ALTER TABLE workflow_runs
    DROP COLUMN IF EXISTS master_account_id,
    DROP COLUMN IF EXISTS sub_account_id,
    DROP COLUMN IF EXISTS work_session_id,
    DROP COLUMN IF EXISTS process_id,
    DROP COLUMN IF EXISTS employee_account_id,
    DROP COLUMN IF EXISTS workflow_plan_id,
    DROP COLUMN IF EXISTS subscription_instance_id,
    DROP COLUMN IF EXISTS duration_ms,
    DROP COLUMN IF EXISTS time_saved_seconds,
    DROP COLUMN IF EXISTS cost_usd,
    DROP COLUMN IF EXISTS usage_metrics,
    DROP COLUMN IF EXISTS error_message,
    DROP COLUMN IF EXISTS workflow_snapshot;

-- Section 3: Core Interaction Module
DROP TABLE IF EXISTS processes CASCADE;
DROP TABLE IF EXISTS work_sessions CASCADE;
DROP TABLE IF EXISTS editor_snapshots CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

-- Remove added columns from files
ALTER TABLE files
    DROP COLUMN IF EXISTS master_account_id,
    DROP COLUMN IF EXISTS sub_account_id,
    DROP COLUMN IF EXISTS uploader_employee_account_id,
    DROP COLUMN IF EXISTS conversation_id,
    DROP COLUMN IF EXISTS storage_key;

-- Remove added columns from messages
ALTER TABLE messages
    DROP COLUMN IF EXISTS master_account_id,
    DROP COLUMN IF EXISTS sub_account_id,
    DROP COLUMN IF EXISTS ui_intent,
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS feedback,
    DROP COLUMN IF EXISTS safety_status,
    DROP COLUMN IF EXISTS safety_reasons,
    DROP COLUMN IF EXISTS pinned_at;

-- Remove added columns from conversations
ALTER TABLE conversations
    DROP COLUMN IF EXISTS master_account_id,
    DROP COLUMN IF EXISTS sub_account_id,
    DROP COLUMN IF EXISTS employee_account_id,
    DROP COLUMN IF EXISTS workflow_template_id,
    DROP COLUMN IF EXISTS mode;

-- Section 2: Assets & Licensing Module
DROP TABLE IF EXISTS workflow_authorization_toggles CASCADE;
DROP TABLE IF EXISTS entitlement_assignments CASCADE;
DROP TABLE IF EXISTS entitlements CASCADE;
DROP TABLE IF EXISTS subscription_instances CASCADE;

-- Remove added columns from subscriptions
ALTER TABLE subscriptions
    DROP COLUMN IF EXISTS master_account_id,
    DROP COLUMN IF EXISTS provider,
    DROP COLUMN IF EXISTS external_id,
    DROP COLUMN IF EXISTS external_customer_id,
    DROP COLUMN IF EXISTS collection_method,
    DROP COLUMN IF EXISTS current_period_start,
    DROP COLUMN IF EXISTS current_period_end,
    DROP COLUMN IF EXISTS cancel_at_period_end,
    DROP COLUMN IF EXISTS cancel_at,
    DROP COLUMN IF EXISTS canceled_at,
    DROP COLUMN IF EXISTS raw_payload,
    DROP COLUMN IF EXISTS updated_at;

DROP TABLE IF EXISTS workflow_plans CASCADE;
DROP TABLE IF EXISTS seat_pools CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;

-- Remove added columns from workflow_templates
ALTER TABLE workflow_templates
    DROP COLUMN IF EXISTS avatar_url,
    DROP COLUMN IF EXISTS provider,
    DROP COLUMN IF EXISTS price_per_seat,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS rating_avg,
    DROP COLUMN IF EXISTS rating_count,
    DROP COLUMN IF EXISTS io_schema;

-- Section 1: Identity & Master Account Isolation Module
DROP TABLE IF EXISTS system_audit_logs CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS employee_sub_account_bindings CASCADE;
DROP TABLE IF EXISTS sub_accounts CASCADE;
DROP TABLE IF EXISTS employee_accounts CASCADE;
DROP TABLE IF EXISTS master_account_quotas CASCADE;
DROP TABLE IF EXISTS master_accounts CASCADE;

-- ============================================================================
-- END OF ROLLBACK
-- ============================================================================
