-- Add last_active_tenant_id to users table
ALTER TABLE users
ADD COLUMN last_active_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_users_last_active_tenant ON users(last_active_tenant_id);
