"""Shared integration test fixtures for Agent Bridge."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import AsyncGenerator

import asyncpg
import pytest
import pytest_asyncio
import redis.asyncio as redis
from httpx import AsyncClient, ASGITransport

# Ensure the agent_bridge package is importable from the repo checkout.
SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

# Delayed import to avoid issues before path fix
from agent_bridge.app import app  # noqa: E402


POSTGRES_DSN = os.environ.get(
    "SITE_AUTH_DATABASE_URL",
    "postgresql://orbitask:password@localhost:5432/orbitask_dev",
)
REDIS_URL = os.environ.get("AGENT_BRIDGE_REDIS_URL", "redis://localhost:6379/0")


@pytest_asyncio.fixture
async def real_db_pool() -> AsyncGenerator[asyncpg.Pool, None]:
    """Provide a real asyncpg connection pool against the configured Postgres."""
    pool = None
    try:
        pool = await asyncpg.create_pool(POSTGRES_DSN)
        yield pool
    except Exception as exc: 
        pytest.fail(f"Postgres unavailable: {exc}")
    finally:
        if pool:
            await pool.close()


@pytest_asyncio.fixture
async def real_redis() -> AsyncGenerator[redis.Redis, None]:
    """Provide a Redis client backed by the real Redis instance."""
    client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        await client.ping()
        yield client
    except Exception as exc:
        pytest.fail(f"Redis unavailable: {exc}")
    finally:
        await client.aclose()


@pytest_asyncio.fixture(autouse=True)
async def clean_db(real_db_pool: asyncpg.Pool) -> AsyncGenerator[None, None]:
    """Truncate mutable tables between tests to keep isolation.
    
    We assume 'workflow_templates' is the main table we mutate or read.
    """
    # Use execute directly on pool. 
    # Warning: If Agent Bridge has background tasks holding connections, this might deadlock.
    # But for tests, we should be fine if we await properly.
    try:
        await real_db_pool.execute("TRUNCATE TABLE workflow_templates CASCADE;")
    except asyncpg.UndefinedTableError:
        # Table might not exist if migration didn't run.
        # Check setup_local_db.sh output - it created DB but migration runs in Site-Auth service?
        # Agent Bridge tests rely on Site-Auth migrations being applied.
        # We assume they are applied. If not, this fails meaningfully.
        pass
        
    yield


@pytest_asyncio.fixture()
async def test_client(real_db_pool: asyncpg.Pool, real_redis: redis.Redis) -> AsyncGenerator[AsyncClient, None]:
    """HTTPX client wired to the FastAPI app for integration testing."""
    transport = ASGITransport(app=app)
    
    # Inject shared fixtures into app state so dependencies can find them.
    # This bypasses 'lifespan' startup but ensures tests control the connections.
    app.state.pool = real_db_pool
    app.state.redis = real_redis
    
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
        
    # Cleanup
    app.state.pool = None
    app.state.redis = None
