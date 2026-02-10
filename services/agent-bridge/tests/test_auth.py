import pytest
from httpx import AsyncClient
import redis.asyncio as redis
import uuid
import json

@pytest.mark.asyncio
async def test_valid_token_allows_request(
    test_client: AsyncClient, 
    real_redis: redis.Redis
):
    """
    Scenario:
    1. Use a token that is NOT in the blacklist.
    2. Make a request with Authorization Header.
    3. Verify access allowed.
    """
    token = str(uuid.uuid4())
    # No need to seed session if bridge doesn't check it. 
    # Just ensure it's not blacklisted.
    # But to be safe, we ensure blacklist is clean for this token.
    # (By default it is).
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # We call a route. Expecting 200 or 422 (Body validation error), NOT 401.
    request_payload = {
        "slug": "non-existent-but-auth-passes", 
        "query": "hi",
        "inputs": {}
    }
    # Note: test_routes uses /v1/agent/runs/stream. Check compatibility.
    # If route logic checks DB, we might get 404 (Template not found).
    # 404 is also acceptable as "Auth Passed".
    
    response = await test_client.post("/v1/agent/runs/stream", json=request_payload, headers=headers)
    
    assert response.status_code != 401, f"Should be accepted. Got: {response.status_code}"

@pytest.mark.asyncio
async def test_invalid_token_returns_unauthorized(test_client: AsyncClient):
    """
    Scenario:
    1. Use invalid header format.
    2. Verify 401.
    """
    # Missing Bearer
    headers = {"Authorization": "Basic 123"}
    response = await test_client.post("/v1/agent/runs/stream", json={}, headers=headers)
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_blacklisted_token_blocked(
    test_client: AsyncClient,
    real_redis: redis.Redis
):
    """
    Scenario:
    1. Add token to agent_bridge:blacklist.
    2. Use that token.
    3. Verify 401.
    """
    token = str(uuid.uuid4())
    # Dependencies.py uses sismember("agent_bridge:blacklist", token)
    await real_redis.sadd("agent_bridge:blacklist", token)
    
    headers = {"Authorization": f"Bearer {token}"}
    response = await test_client.post("/v1/agent/runs/stream", json={}, headers=headers)
    
    assert response.status_code == 401
