-- Add optional login identifiers for site accounts
ALTER TABLE site_accounts
  ADD COLUMN IF NOT EXISTS email CITEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;
