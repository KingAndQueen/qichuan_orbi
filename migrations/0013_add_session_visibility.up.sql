-- Add visibility and site_account_id to conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) NOT NULL DEFAULT 'private',
ADD COLUMN IF NOT EXISTS site_account_id UUID REFERENCES site_accounts(id) ON DELETE SET NULL;

-- Create index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_conv_visibility ON conversations(visibility);
CREATE INDEX IF NOT EXISTS idx_conv_site_account_id ON conversations(site_account_id);
