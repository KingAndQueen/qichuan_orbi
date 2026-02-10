"""Database helper utilities."""

from __future__ import annotations

import asyncpg
from fastapi import HTTPException, Request, status


async def get_db_pool(request: Request) -> asyncpg.Pool:
    """Return the shared asyncpg pool stored on the application state."""

    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    return pool
