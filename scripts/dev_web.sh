#!/bin/bash

set -euo pipefail

# Sync environment variables to .env files
services/agent-bridge/.venv/bin/python3 scripts/sync_envs.py

echo "🎨 Starting Workspace Web..."
# Next.js loads .env.local automatically
cd apps/workspace-web && pnpm dev
