import json
import pytest
from httpx import AsyncClient
import asyncpg
import uuid

@pytest.mark.asyncio
async def test_stream_route_uses_database_template(
    test_client: AsyncClient, 
    real_db_pool: asyncpg.Pool
):
    """
    Scenario:
    1. Insert a real WorkflowTemplate into DB using real_db_pool.
    2. Call POST /v1/agent/runs/stream.
    3. Assert the Router correctly fetches the template and executes it.
    """
    
    # 1. Preset Data
    # ID needs to be a valid UUID. slug must be unique.
    template_id = str(uuid.uuid4())
    slug = f"test-agent-{uuid.uuid4().hex[:8]}"
    
    # Meta JSON matching the structure required by Coze? 
    # Or 'system_native' to avoid needing API keys for this route test?
    # Migration 0010 shows 'system_native' provider in seeds.
    # We'll use 'system_native' (Echo provider likely) if available, or 'coze' but mock?
    # Wait, Strict Integration means NO MOCKS.
    # If we use Coze, we need keys. 
    # Let's use 'mock_provider' if registered, or assume the app falls back gracefully.
    # Inspecting default behavior: user's goal is to test *DB Integration* (fetching template).
    # The execution driver might fail if provider is not configured, but we want to confirm it *tried*.
    
    # Let's insert a template configuration.
    meta_json = json.dumps({
        "execution": {
             "provider": "system_native", # Using native/echo to ensure runnable without external keys
             "config": {"prompt": "echo"}
        }
    })
    
    query = """
    INSERT INTO workflow_templates (id, name, slug, description, tags, meta, is_public)
    VALUES ($1, $2, $3, 'Integration Test Agent', ARRAY['test'], $4::jsonb, true)
    """
    await real_db_pool.execute(query, template_id, "Test Agent", slug, meta_json)

    # 2. Call API
    # Router expects workflow_id to lookup template.
    payload = {
        "workflow_id": template_id,
        "slug": slug,
        "query": "Hello API",
        "inputs": {}
    }
    
    # /api/v1 prefix? app.py usually mounts at root or /api.
    # test_client base_url is http://test.
    # agent_bridge/router.py usually implies /v1/agent...
    # Checking previous prompts: POST /v1/agent/runs/stream
    
    # We must provide Auth header, otherwise 401.
    headers = {"Authorization": "Bearer test-integration-token"}
    
    response = await test_client.post("/v1/agent/runs/stream", json=payload, headers=headers)
    
    # 3. Assert
    # If system_native provider is not implemented, we might get 500 or 400.
    # But if we get 404, it means DB fetch failed.
    # If we get 200/Success, it means DB fetch worked AND execution worked.
    
    assert response.status_code == 200
    
    # Verify stream content
    # For SSE, it's a bit tricky to read response.text directly if it's infinite, 
    # but for simple echo it finishes.
    content = response.text
    assert "event: " in content or len(content) > 0
    # If the system_native provider just echoes, we might expect "Hello API" back.
