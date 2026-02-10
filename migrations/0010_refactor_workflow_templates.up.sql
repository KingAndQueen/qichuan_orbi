-- Add slug column and enforce uniqueness for workflow templates
ALTER TABLE workflow_templates
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing records with deterministic slugs when missing
UPDATE workflow_templates
SET slug = COALESCE(slug, CONCAT('template-', LEFT(id::TEXT, 8)));

-- Ensure slug is not null for uniqueness constraint
ALTER TABLE workflow_templates
ALTER COLUMN slug SET NOT NULL;

-- Create a unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_templates_slug_unique
ON workflow_templates (slug);

-- Seed the system default agent configuration
INSERT INTO workflow_templates (name, description, tags, meta, is_public, slug)
VALUES (
  'System Default Agent',
  'Built-in Orbit system helper powered by unified prompt configuration.',
  ARRAY['system','default'],
  '{
    "execution": {
      "provider": "system_native",
      "config": {
        "prompt": "你好！我是 Orbit 系统助手。目前系统运行正常。我可以帮你：\n1. 介绍工作流\n2. 查询账户状态"
      }
    },
    "ui": {
      "icon": "https://assets.orbitaskflow.com/icons/system-avatar.png",
      "color": "#3B82F6"
    }
  }'::jsonb,
  TRUE,
  'system-default'
)
ON CONFLICT (slug) DO NOTHING;
