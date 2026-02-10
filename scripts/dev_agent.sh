#!/bin/bash

set -euo pipefail

# Sync environment variables to .env files
python3 scripts/sync_envs.py

# Optional: Initialize Local DB
if [ "${INIT_DB:-false}" = "true" ]; then
    echo "🛠️  INIT_DB=true detected. Running DB Setup..."
    bash scripts/setup_local_db.sh
fi

echo "🤖 Starting Agent Bridge..."
# uvicorn needs --env-file if it doesn't auto-load, but standard python-dotenv might be used in app.
# User instruction explicitly says: "--env-file .env"
cd services/agent-bridge && poetry run uvicorn agent_bridge.app:app --reload --env-file .env
