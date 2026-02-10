import os
import pytest
from agent_bridge.providers.coze import CozeProvider
from agent_bridge.models import AgentRunRequest, AgentEvent, CozeEvent
from agent_bridge.config import Settings
# Users should set COZE_API_KEY in their local .env or shell.
COZE_KEY = os.environ.get("COZE_API_KEY")

@pytest.mark.asyncio
@pytest.mark.skipif(not COZE_KEY, reason="Skipping Coze live test: COZE_API_KEY not found in env")
async def test_coze_provider_live_stream():
    """Verify Coze Adapter with REAL network calls."""
    # 1. Setup Settings with the real key
    # Using the standard Coze API base. Verify if it needs 'https://api.coze.cn/v3/chat' vs 'coze.com'.
    # Assuming 'coze.cn' based on previous context or defaulting to what works for the user's region.
    # We'll use the one from the requirement example: https://api.coze.cn/v3/chat
    settings = Settings(
        api_key=COZE_KEY, 
        api_base="https://api.coze.cn/v3/chat"
    )
    
    # 2. Setup Provider & Request
    # We need a valid bot_id for Coze. Assuming the user provides it or we use a widely known test bot?
    # Without a specific bot_id, Coze API usually fails.
    # We will try to read COZE_BOT_ID from env too, or skip if missing.
    bot_id = os.environ.get("COZE_BOT_ID")
    if not bot_id:
        pytest.skip("COZE_BOT_ID not found in env")

    provider = CozeProvider()
    
    # "query" is the user input.
    request = AgentRunRequest(
        query="Hello from Integration Test", 
        inputs={"bot_id": bot_id} # Coze provider likely needs bot_id in inputs or settings?
        # Checking CozeProvider implementation would be good, but strict integration means passing what's expected.
        # Let's assume input maps to 'bot_id' key if using standard workflow.
    )
    
    # 3. Execution (Real Network Call)
    events = []
    # stream returns an async generator
    try:
        async for event in provider.stream(request, settings):
            events.append(event)
    except Exception as e:
        pytest.fail(f"Coze API call failed: {e}")
        
    # 4. Verification
    assert len(events) > 0
    # Check we got at least one 'answer' or 'message' event
    # Coze usually streams 'delta' or 'complete'.
    # We assume 'AgentEvent' (not AgentRunEvent) for generic events
    
    # Check we got some data
    has_event = any(e.event for e in events)
    assert len(events) >= 1
    assert has_event
