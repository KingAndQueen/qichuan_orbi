#!/bin/bash

set -euo pipefail

# Sync environment variables to .env files
services/agent-bridge/.venv/bin/python3 scripts/sync_envs.py

# Optional: Initialize Local DB
if [ "${INIT_DB:-false}" = "true" ]; then
    echo "🛠️  INIT_DB=true detected. Running DB Setup..."
    bash scripts/setup_local_db.sh
fi

echo "🤖 Starting Agent Bridge (API & Worker)..."

cd services/agent-bridge

# Start worker in background
.venv/bin/arq agent_bridge.worker.WorkerSettings &
WORKER_PID=$!

# Start API server in foreground
.venv/bin/python3 -m uvicorn agent_bridge.app:app --reload --env-file .env --port 8050 &
API_PID=$!

# Cleanup on exit
trap "kill -9 $WORKER_PID $API_PID 2>/dev/null" EXIT

# Wait for all background processes
wait
