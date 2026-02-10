#!/bin/bash

set -euo pipefail

# Sync environment variables to .env files
python3 scripts/sync_envs.py

# Optional: Initialize Local DB
if [ "${INIT_DB:-false}" = "true" ]; then
    echo "🛠️  INIT_DB=true detected. Running DB Setup..."
    bash scripts/setup_local_db.sh
fi

echo "🚀 Starting Site-Auth Backend..."
# Enter directory and run. Config loading in Go should handle .env or we rely on it.
# The user instruction says: "Then just: cd services/site-auth && go run cmd/server/main.go"
cd services/site-auth && go run cmd/server/main.go
