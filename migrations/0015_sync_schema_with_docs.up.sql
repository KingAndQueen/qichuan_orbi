-- ============================================================================
-- Migration: 0015_sync_schema_with_docs.up.sql
-- Description: Sync database schema with SSOT (docs/technical/data/database-design.md)
-- Author: Database Architecture Team
-- Date: 2026-02-02
--
-- This migration aligns the database structure with the design documentation,
-- adding missing tables, columns, and constraints for the multi-tenant
-- architecture and commerce modules.
-- ============================================================================

-- ============================================================================
-- SECTION 1: Identity & Master Account Isolation Module (身份与主账号隔离模块)
-- Reference: database-design.md Section 3.1
-- ============================================================================

-- 1.1 master_accounts (主账号表)
-- Represents an enterprise or organization entity
CREATE TABLE IF NOT EXISTS master_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    plan_tier VARCHAR(20) NOT NULL DEFAULT 'free'
        CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE master_accounts IS 'Represents an enterprise or organization entity (主账号表)';
COMMENT ON COLUMN master_accounts.slug IS 'Unique URL-safe identifier for subdomain or URL path';
COMMENT ON COLUMN master_accounts.plan_tier IS 'Controls platform-level capabilities (storage, member limits, SSO)';

-- 1.2 master_account_quotas (主账号配额表)
-- Resource governance for master accounts
CREATE TABLE IF NOT EXISTS master_account_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL
        CHECK (resource_type IN ('llm_tokens_monthly', 'storage_gb', 'seat_count')),
    limit_value BIGINT NOT NULL DEFAULT -1,
    used_value BIGINT NOT NULL DEFAULT 0,
    reset_period VARCHAR(20) NOT NULL DEFAULT 'monthly'
        CHECK (reset_period IN ('monthly', 'never', 'daily')),
    last_reset_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_master_account_quotas UNIQUE (master_account_id, resource_type)
);

COMMENT ON TABLE master_account_quotas IS 'Resource governance for master accounts (主账号配额表)';
COMMENT ON COLUMN master_account_quotas.limit_value IS '-1=Unlimited, 0=Blocked, >0=Specific limit';

CREATE INDEX IF NOT EXISTS idx_master_account_quotas_lookup
    ON master_account_quotas (master_account_id, resource_type);

-- 1.3 employee_accounts (自然人表)
-- Global unique login credentials, not tied to any specific master account
CREATE TABLE IF NOT EXISTS employee_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_password_reset_required BOOLEAN NOT NULL DEFAULT false,
    last_active_master_account_id UUID REFERENCES master_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE employee_accounts IS 'Global unique login credentials for natural persons (自然人表)';
COMMENT ON COLUMN employee_accounts.settings IS 'User preferences (theme, locale, notifications)';
COMMENT ON COLUMN employee_accounts.is_password_reset_required IS 'Forces password reset on next login';

-- 1.4 sub_accounts (部门表/子账号)
-- Flat business units within a master account ("digital workstation")
CREATE TABLE IF NOT EXISTS sub_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sub_accounts IS 'Flat business units within a master account (部门表/子账号)';

CREATE INDEX IF NOT EXISTS idx_sub_accounts_master_account_id
    ON sub_accounts (master_account_id);

-- 1.5 employee_sub_account_bindings (成员关系表)
-- Links employees to master accounts and sub accounts with roles
CREATE TABLE IF NOT EXISTS employee_sub_account_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member')),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_sub_account_bindings
        UNIQUE (master_account_id, employee_account_id, sub_account_id)
);

COMMENT ON TABLE employee_sub_account_bindings IS 'Links employees to master/sub accounts with roles (成员关系表)';

CREATE INDEX IF NOT EXISTS idx_employee_bindings_master
    ON employee_sub_account_bindings (master_account_id);
CREATE INDEX IF NOT EXISTS idx_employee_bindings_employee
    ON employee_sub_account_bindings (employee_account_id);

-- 1.6 invitations (邀请表)
-- Manages B2B member invitation flow
CREATE TABLE IF NOT EXISTS invitations (
    token VARCHAR(64) PRIMARY KEY,
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    email CITEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('admin', 'member')),
    inviter_employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE invitations IS 'Manages B2B member invitation flow (邀请表)';

CREATE INDEX IF NOT EXISTS idx_invitations_master_account
    ON invitations (master_account_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email
    ON invitations (email);

-- 1.7 system_audit_logs (系统审计日志表)
-- Records critical management operations for compliance
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    actor_employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    target_resource VARCHAR(100),
    changes JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE system_audit_logs IS 'Records critical management operations (系统审计日志表)';

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_master
    ON system_audit_logs (master_account_id, created_at DESC);

-- ============================================================================
-- SECTION 2: Assets & Licensing Module (资产与许可模块)
-- Reference: database-design.md Section 3.2
-- ============================================================================

-- 2.1 Update workflow_templates with missing columns
ALTER TABLE workflow_templates
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS price_per_seat DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS category VARCHAR(50),
    ADD COLUMN IF NOT EXISTS rating_avg DECIMAL(3, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS io_schema JSONB;

COMMENT ON COLUMN workflow_templates.provider IS 'Provider identifier (e.g., system, coze)';
COMMENT ON COLUMN workflow_templates.category IS 'Market category (e.g., legal, marketing, coding)';
COMMENT ON COLUMN workflow_templates.io_schema IS 'Input/output JSON schema for form generation and validation';

CREATE INDEX IF NOT EXISTS idx_workflow_templates_category
    ON workflow_templates (category);

-- 2.2 reviews (市场评价表)
-- User reviews for workflow templates
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reviews_user_template UNIQUE (workflow_template_id, employee_account_id)
);

COMMENT ON TABLE reviews IS 'User reviews for workflow templates (市场评价表)';

CREATE INDEX IF NOT EXISTS idx_reviews_workflow_template
    ON reviews (workflow_template_id);
CREATE INDEX IF NOT EXISTS idx_reviews_employee
    ON reviews (employee_account_id);

-- 2.3 seat_pools (席位名额池表)
-- Manages seat allocation at master account level
CREATE TABLE IF NOT EXISTS seat_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    total_seats INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_seat_pools_master UNIQUE (master_account_id)
);

COMMENT ON TABLE seat_pools IS 'Seat allocation pool at master account level (席位名额池表)';

-- 2.4 workflow_plans (工作流方案表)
-- Defines subscribable plans for workflows
CREATE TABLE IF NOT EXISTS workflow_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    plan_code VARCHAR(50) UNIQUE NOT NULL,
    pricing_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflow_plans IS 'Subscribable plans for workflows (工作流方案表)';

CREATE INDEX IF NOT EXISTS idx_workflow_plans_template
    ON workflow_plans (workflow_template_id);

-- 2.5 Update subscriptions table to match SSOT
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS master_account_id UUID REFERENCES master_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'stripe'
        CHECK (provider IN ('stripe')),
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS external_customer_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS collection_method VARCHAR(20)
        CHECK (collection_method IN ('charge_automatically', 'send_invoice')),
    ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancel_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS raw_payload JSONB,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Drop old constraint and add new one
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active',
                      'past_due', 'canceled', 'unpaid', 'paused'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_master
    ON subscriptions (master_account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_external
    ON subscriptions (external_id);

-- 2.6 subscription_instances (订阅实例表)
-- Records active subscription instances for workflow plans
CREATE TABLE IF NOT EXISTS subscription_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    workflow_plan_id UUID NOT NULL REFERENCES workflow_plans(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'canceled', 'expired')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscription_instances IS 'Active subscription instances for workflow plans (订阅实例表)';

CREATE INDEX IF NOT EXISTS idx_subscription_instances_master
    ON subscription_instances (master_account_id);
CREATE INDEX IF NOT EXISTS idx_subscription_instances_plan
    ON subscription_instances (workflow_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_instances_active
    ON subscription_instances (master_account_id, workflow_plan_id)
    WHERE status = 'active';

-- 2.7 entitlements (授权额度表)
-- Capabilities granted by subscriptions
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    subscription_instance_id UUID NOT NULL REFERENCES subscription_instances(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    limit_value BIGINT NOT NULL DEFAULT -1,
    period VARCHAR(20) NOT NULL DEFAULT 'never'
        CHECK (period IN ('monthly', 'never', 'daily')),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE entitlements IS 'Capabilities granted by subscriptions (授权额度表)';

CREATE INDEX IF NOT EXISTS idx_entitlements_master
    ON entitlements (master_account_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_subscription
    ON entitlements (subscription_instance_id);

-- 2.8 entitlement_assignments (授权分发表)
-- Distributes entitlements to master or sub account scope
CREATE TABLE IF NOT EXISTS entitlement_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    entitlement_id UUID NOT NULL REFERENCES entitlements(id) ON DELETE CASCADE,
    scope VARCHAR(20) NOT NULL DEFAULT 'master'
        CHECK (scope IN ('master', 'sub_account')),
    sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE CASCADE,
    assigned_value BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_entitlement_assignments
        UNIQUE (entitlement_id, scope, sub_account_id)
);

COMMENT ON TABLE entitlement_assignments IS 'Distributes entitlements to scope (授权分发表)';

CREATE INDEX IF NOT EXISTS idx_entitlement_assignments_master
    ON entitlement_assignments (master_account_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_assignments_audit
    ON entitlement_assignments (entitlement_id, created_at DESC);

-- 2.9 workflow_authorization_toggles (工作流授权开关表)
-- Enables/disables workflow plans for sub accounts
CREATE TABLE IF NOT EXISTS workflow_authorization_toggles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID NOT NULL REFERENCES sub_accounts(id) ON DELETE CASCADE,
    workflow_plan_id UUID NOT NULL REFERENCES workflow_plans(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workflow_toggles
        UNIQUE (master_account_id, sub_account_id, workflow_plan_id)
);

COMMENT ON TABLE workflow_authorization_toggles IS 'Enables/disables workflow plans for sub accounts (工作流授权开关表)';

CREATE INDEX IF NOT EXISTS idx_workflow_toggles_lookup
    ON workflow_authorization_toggles (master_account_id, sub_account_id, workflow_plan_id)
    WHERE is_enabled = true;

-- ============================================================================
-- SECTION 3: Core Interaction Module (核心交互模块)
-- Reference: database-design.md Section 3.3
-- ============================================================================

-- 3.1 Update conversations table with missing columns
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS master_account_id UUID REFERENCES master_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS employee_account_id UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS workflow_template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'standard'
        CHECK (mode IN ('standard', 'temporary'));

CREATE INDEX IF NOT EXISTS idx_conversations_master_last_msg
    ON conversations (master_account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_sub_account
    ON conversations (sub_account_id);

-- 3.2 Update messages table with missing columns
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS master_account_id UUID REFERENCES master_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ui_intent JSONB,
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS feedback JSONB,
    ADD COLUMN IF NOT EXISTS safety_status VARCHAR(20) DEFAULT 'pass'
        CHECK (safety_status IN ('pass', 'blocked', 'flagged')),
    ADD COLUMN IF NOT EXISTS safety_reasons TEXT[],
    ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

COMMENT ON COLUMN messages.ui_intent IS 'Generative UI component instructions';
COMMENT ON COLUMN messages.metadata IS 'Thoughts, citations, and other structured data';
COMMENT ON COLUMN messages.safety_status IS 'Content safety status from guardrails';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at ASC);

-- 3.3 Update files table with missing columns
ALTER TABLE files
    ADD COLUMN IF NOT EXISTS master_account_id UUID REFERENCES master_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS uploader_employee_account_id UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS storage_key TEXT;

-- Migrate storage_path to storage_key if needed
UPDATE files SET storage_key = storage_path WHERE storage_key IS NULL AND storage_path IS NOT NULL;

-- 3.4 notifications (异步通知表)
-- Stores async notifications for users
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'Async notifications for users (异步通知表)';

CREATE INDEX IF NOT EXISTS idx_notifications_employee
    ON notifications (employee_account_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_master
    ON notifications (master_account_id);

-- 3.5 editor_snapshots (智能编辑器快照表)
-- Supports document collaboration versioning
CREATE TABLE IF NOT EXISTS editor_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    patch JSONB,
    modified_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE editor_snapshots IS 'Document collaboration versioning (智能编辑器快照表)';

CREATE INDEX IF NOT EXISTS idx_editor_snapshots_conversation
    ON editor_snapshots (conversation_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_editor_snapshots_master
    ON editor_snapshots (master_account_id);

-- 3.6 work_sessions (工作会话表)
-- Top-level container for conversation assets and execution chains
CREATE TABLE IF NOT EXISTS work_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID NOT NULL REFERENCES sub_accounts(id) ON DELETE CASCADE,
    employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE work_sessions IS 'Top-level container for conversation assets (工作会话表)';

CREATE INDEX IF NOT EXISTS idx_work_sessions_master
    ON work_sessions (master_account_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_employee
    ON work_sessions (employee_account_id);

-- 3.7 processes (进程表)
-- Steps within a work session (parallel/sequential)
CREATE TABLE IF NOT EXISTS processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID NOT NULL REFERENCES sub_accounts(id) ON DELETE CASCADE,
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'chat',
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'running', 'suspended', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

COMMENT ON TABLE processes IS 'Steps within a work session (进程表)';

CREATE INDEX IF NOT EXISTS idx_processes_work_session
    ON processes (work_session_id);
CREATE INDEX IF NOT EXISTS idx_processes_master
    ON processes (master_account_id);

-- ============================================================================
-- SECTION 4: Analytics & Audit Module (统计与审计模块)
-- Reference: database-design.md Section 3.4
-- ============================================================================

-- 4.1 Update workflow_runs table with missing columns
ALTER TABLE workflow_runs
    ADD COLUMN IF NOT EXISTS master_account_id UUID REFERENCES master_accounts(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS work_session_id UUID REFERENCES work_sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES processes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS employee_account_id UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS workflow_plan_id UUID REFERENCES workflow_plans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS subscription_instance_id UUID REFERENCES subscription_instances(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS duration_ms INT,
    ADD COLUMN IF NOT EXISTS time_saved_seconds DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS cost_usd DECIMAL(10, 4),
    ADD COLUMN IF NOT EXISTS usage_metrics JSONB,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS workflow_snapshot JSONB;

-- Update status constraint to match SSOT
ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_status_check;
ALTER TABLE workflow_runs
    ADD CONSTRAINT workflow_runs_status_check
    CHECK (status IN ('created', 'running', 'suspended', 'completed', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_workflow_runs_master
    ON workflow_runs (master_account_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_process
    ON workflow_runs (process_id);

-- 4.2 async_tasks (异步任务审计表)
-- Persistent records for long-running tasks
CREATE TABLE IF NOT EXISTS async_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) UNIQUE NOT NULL,
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    created_by UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'suspended')),
    progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

COMMENT ON TABLE async_tasks IS 'Persistent records for long-running tasks (异步任务审计表)';

CREATE INDEX IF NOT EXISTS idx_async_tasks_master_status
    ON async_tasks (master_account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_tasks_job_id
    ON async_tasks (job_id);

-- 4.3 analytics_daily_usage (每日用量聚合表)
-- Pre-aggregated ROI data for fast reporting
CREATE TABLE IF NOT EXISTS analytics_daily_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID REFERENCES sub_accounts(id) ON DELETE SET NULL,
    workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_runs INT NOT NULL DEFAULT 0,
    total_duration_seconds BIGINT NOT NULL DEFAULT 0,
    estimated_time_saved DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_cost_usd DECIMAL(10, 4) NOT NULL DEFAULT 0,
    CONSTRAINT uq_analytics_daily_usage
        UNIQUE (master_account_id, sub_account_id, workflow_template_id, date)
);

COMMENT ON TABLE analytics_daily_usage IS 'Pre-aggregated ROI data for fast reporting (每日用量聚合表)';

CREATE INDEX IF NOT EXISTS idx_analytics_master_date
    ON analytics_daily_usage (master_account_id, date);

-- 4.4 receipts (副作用回执表)
-- Records side-effects for traceability (append-only)
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID,
    job_id VARCHAR(64),
    workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
    trace_id VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started'
        CHECK (status IN ('started', 'succeeded', 'failed', 'denied', 'cancelled')),
    reason_code VARCHAR(50),
    result_summary TEXT,
    metering_hint JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE receipts IS 'Side-effect receipts for traceability (副作用回执表)';

CREATE INDEX IF NOT EXISTS idx_receipts_master_trace
    ON receipts (master_account_id, trace_id);
CREATE INDEX IF NOT EXISTS idx_receipts_run
    ON receipts (workflow_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_master_sub_time
    ON receipts (master_account_id, sub_account_id, created_at DESC);

-- 4.5 audit_events (审计事件表)
-- Records who did what, when, and policy decisions
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID,
    actor_principal_id UUID,
    action VARCHAR(100) NOT NULL,
    target_resource VARCHAR(200),
    decision VARCHAR(10) NOT NULL DEFAULT 'allow'
        CHECK (decision IN ('allow', 'deny')),
    policy_ref VARCHAR(200),
    trace_id VARCHAR(64) NOT NULL,
    receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_events IS 'Audit trail for compliance (审计事件表)';

CREATE INDEX IF NOT EXISTS idx_audit_events_master_time
    ON audit_events (master_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_trace
    ON audit_events (trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_master_sub_time
    ON audit_events (master_account_id, sub_account_id, created_at DESC);

-- 4.6 metering_events (计量事件表)
-- Records billable resource consumption
CREATE TABLE IF NOT EXISTS metering_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    sub_account_id UUID,
    subscription_instance_id UUID REFERENCES subscription_instances(id) ON DELETE SET NULL,
    resource_type VARCHAR(50) NOT NULL,
    quantity BIGINT NOT NULL,
    trace_id VARCHAR(64) NOT NULL,
    receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE metering_events IS 'Billable resource consumption records (计量事件表)';

CREATE INDEX IF NOT EXISTS idx_metering_events_master_time
    ON metering_events (master_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metering_events_trace
    ON metering_events (trace_id);
CREATE INDEX IF NOT EXISTS idx_metering_events_master_sub_time
    ON metering_events (master_account_id, sub_account_id, created_at DESC);

-- ============================================================================
-- SECTION 5: Ontology / SOR (最小语义对象模型)
-- Reference: database-design.md Section 3.5
-- ============================================================================

-- 5.1 sor_object_types (SOR: 对象类型)
-- Registers and versions object types
CREATE TABLE IF NOT EXISTS sor_object_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    type_key VARCHAR(100) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated', 'disabled')),
    schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    etag VARCHAR(64),
    created_by UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sor_object_types UNIQUE (master_account_id, type_key, version)
);

COMMENT ON TABLE sor_object_types IS 'SOR: Object type registry (对象类型注册表)';

CREATE INDEX IF NOT EXISTS idx_sor_object_types_lookup
    ON sor_object_types (master_account_id, type_key, status, version DESC);

-- 5.2 sor_action_types (SOR: 动作类型)
-- Registers and versions action types with side-effect profiles
CREATE TABLE IF NOT EXISTS sor_action_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    action_key VARCHAR(100) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated', 'disabled')),
    input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_schema JSONB,
    side_effect_profile_key VARCHAR(100),
    etag VARCHAR(64),
    created_by UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sor_action_types UNIQUE (master_account_id, action_key, version)
);

COMMENT ON TABLE sor_action_types IS 'SOR: Action type registry (动作类型注册表)';

CREATE INDEX IF NOT EXISTS idx_sor_action_types_lookup
    ON sor_action_types (master_account_id, action_key, status, version DESC);

-- 5.3 sor_link_types (SOR: 关系类型)
-- Registers and versions link types between objects
CREATE TABLE IF NOT EXISTS sor_link_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    link_key VARCHAR(100) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated', 'disabled')),
    src_type_key VARCHAR(100) NOT NULL,
    dst_type_key VARCHAR(100) NOT NULL,
    cardinality VARCHAR(20),
    edge_schema JSONB,
    etag VARCHAR(64),
    created_by UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sor_link_types UNIQUE (master_account_id, link_key, version)
);

COMMENT ON TABLE sor_link_types IS 'SOR: Link type registry (关系类型注册表)';

-- 5.4 sor_side_effect_profiles (副作用档案)
-- Side-effect governance profiles for action types
CREATE TABLE IF NOT EXISTS sor_side_effect_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    profile_key VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'low'
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    requires_human_review BOOLEAN NOT NULL DEFAULT false,
    requires_idempotency_key BOOLEAN NOT NULL DEFAULT true,
    obligations JSONB,
    created_by UUID REFERENCES employee_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sor_side_effect_profiles UNIQUE (master_account_id, profile_key)
);

COMMENT ON TABLE sor_side_effect_profiles IS 'Side-effect governance profiles (副作用档案)';

-- ============================================================================
-- SECTION 6: Infrastructure Module (基础设施模块)
-- Reference: database-design.md Section 3.6
-- ============================================================================

-- 6.1 sessions (会话持久化表)
-- Session storage for Redis fallback or Lite mode
CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) PRIMARY KEY,
    employee_account_id UUID NOT NULL REFERENCES employee_accounts(id) ON DELETE CASCADE,
    master_account_id UUID NOT NULL REFERENCES master_accounts(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sessions IS 'Session storage for Redis fallback (会话持久化表)';

CREATE INDEX IF NOT EXISTS idx_sessions_expires
    ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_employee
    ON sessions (employee_account_id);

-- 6.2 system_locks (分布式锁表)
-- Distributed locks for coordination
CREATE TABLE IF NOT EXISTS system_locks (
    key VARCHAR(255) PRIMARY KEY,
    holder_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE system_locks IS 'Distributed locks for coordination (分布式锁表)';

CREATE INDEX IF NOT EXISTS idx_system_locks_expires
    ON system_locks (expires_at);

-- ============================================================================
-- SECTION 7: Trigger Functions for updated_at
-- ============================================================================

-- Create trigger for master_account_quotas
DROP TRIGGER IF EXISTS trg_master_account_quotas_updated_at ON master_account_quotas;
CREATE TRIGGER trg_master_account_quotas_updated_at
    BEFORE UPDATE ON master_account_quotas
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Create trigger for seat_pools
DROP TRIGGER IF EXISTS trg_seat_pools_updated_at ON seat_pools;
CREATE TRIGGER trg_seat_pools_updated_at
    BEFORE UPDATE ON seat_pools
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Create trigger for workflow_authorization_toggles
DROP TRIGGER IF EXISTS trg_workflow_toggles_updated_at ON workflow_authorization_toggles;
CREATE TRIGGER trg_workflow_toggles_updated_at
    BEFORE UPDATE ON workflow_authorization_toggles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Create trigger for subscriptions
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
