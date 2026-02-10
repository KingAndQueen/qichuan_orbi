"""Shared FastAPI dependencies for the Agent Bridge service."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request, status


async def verify_token(
    request: Request, authorization: str | None = Header(default=None)
) -> str:
    """Validate the bearer token against the Redis blacklist."""

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

    is_blacklisted = await redis_client.sismember("agent_bridge:blacklist", token)
    if is_blacklisted:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    return token


# Expose dependency for route declarations
TokenDependency = Depends(verify_token)
