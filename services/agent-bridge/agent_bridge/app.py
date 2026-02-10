"""FastAPI entry point for the Agent Bridge service."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as redis
from fastapi import FastAPI

from .logging import configure_logging
from .router import router

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: N802
    """Create shared infrastructure resources for the application."""

    database_url = os.environ.get(
        "SITE_AUTH_DATABASE_URL",
        "postgresql://orbitask:password@localhost:5432/orbitask_dev",
    )
    redis_url = os.environ.get("AGENT_BRIDGE_REDIS_URL", "redis://localhost:6379/0")

    logger.info("Initializing database pool and redis client")
    pool = await asyncpg.create_pool(database_url)
    redis_client = redis.from_url(redis_url, decode_responses=True)

    # Touch redis to ensure connectivity early
    await redis_client.ping()

    app.state.pool = pool
    app.state.redis = redis_client

    try:
        yield
    finally:
        logger.info("Shutting down Agent Bridge service, closing resources")
        if hasattr(app.state, "pool"):
            await app.state.pool.close()
        if hasattr(app.state, "redis"):
            await app.state.redis.aclose()


app = FastAPI(title="Agent Bridge Service", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""

    return {"status": "ok"}
