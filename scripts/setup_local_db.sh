#!/bin/bash
set -euo pipefail

# Configuration
DB_USER="orbitask"
DB_PASS="password"
DB_NAME="orbitask_dev"

echo "🐘 Setting up Local Postgres..."

# 1. Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: 'psql' is not installed. Please install PostgreSQL client tools."
    exit 1
fi

# 2. Idempotent User Creation
# We utilize the 'postgres' user to perform admin actions.
# DO block ensures we don't fail if role exists.
echo "👤 Checking/Creating User '$DB_USER'..."
psql -U postgres -d postgres -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS' SUPERUSER;
        RAISE NOTICE 'Created user $DB_USER';
    ELSE
        RAISE NOTICE 'User $DB_USER already exists';
    END IF;
END
\$\$;"

# 3. Idempotent DB Creation
# We can't use DO block for CREATE DATABASE comfortably as it can't run inside transaction block.
# Instead, check pg_database and execute conditional shell command?
# Or use `\gexec` trick in psql.
# Let's use simple shell check.
echo "📦 Checking/Creating Database '$DB_NAME'..."

if psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    echo "✅ Database '$DB_NAME' already exists."
else
    echo "🆕 Creating Database '$DB_NAME'..."
    createdb -U postgres -O "$DB_USER" "$DB_NAME"
    echo "✅ Database '$DB_NAME' created."
fi

echo "✨ Local DB Setup Complete!"
