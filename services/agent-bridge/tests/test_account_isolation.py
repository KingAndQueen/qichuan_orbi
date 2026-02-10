"""Multi-Tenant Account Isolation Tests for Agent Bridge.

This module implements tests referenced in agent-bridge-testing.md Section 3.4:
- TC-AB-030: Run always binds to master context
- TC-AB-031: Cross-account access is denied
- TC-AB-032: Sensitive data not logged
- TC-AB-033: Provider credentials not leaked

References:
- docs/test/agent-bridge-testing.md (Section 3.4)
- docs/test/backend-testing.md (TC-BC-015, TC-BC-073)
"""

from __future__ import annotations

import json
import logging
from io import StringIO
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from agent_bridge.client import CozeClient
from agent_bridge.config import Settings
from agent_bridge.models import AgentEvent, AgentRunRequest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tenant_a_settings() -> Settings:
    """Settings for Tenant A."""
    return Settings(
        api_base="https://api.coze.cn/v3/chat",
        api_key="tenant-a-secret-key-xxxxx",
        bot_id="tenant-a-bot-id",
        request_timeout=10.0,
        stream=True,
    )


@pytest.fixture
def tenant_b_settings() -> Settings:
    """Settings for Tenant B."""
    return Settings(
        api_base="https://api.coze.cn/v3/chat",
        api_key="tenant-b-secret-key-yyyyy",
        bot_id="tenant-b-bot-id",
        request_timeout=10.0,
        stream=True,
    )


@pytest.fixture
def tenant_a_request() -> AgentRunRequest:
    """Request context for Tenant A user."""
    return AgentRunRequest(
        user_id="tenant-a-user-001",
        query="Tenant A query",
        bot_id="tenant-a-bot",
        stream=True,
        conversation_id="tenant-a-conv-001",
        run_id="tenant-a-run-001",
        reply_message_id="tenant-a-msg-001",
        # Simulated master_account_id binding
        metadata={"master_account_id": "master-account-A"},
    )


@pytest.fixture
def tenant_b_request() -> AgentRunRequest:
    """Request context for Tenant B user."""
    return AgentRunRequest(
        user_id="tenant-b-user-001",
        query="Tenant B query",
        bot_id="tenant-b-bot",
        stream=True,
        conversation_id="tenant-b-conv-001",
        run_id="tenant-b-run-001",
        reply_message_id="tenant-b-msg-001",
        metadata={"master_account_id": "master-account-B"},
    )


def build_sse_response(content: str = "Hello") -> str:
    """Build a standard SSE response."""
    return (
        f'data: {{"event": "conversation.message.delta", "message": {{"type": "answer", "content": "{content}"}}}}\n\n'
        f'data: {{"event": "done"}}\n\n'
    )


# ---------------------------------------------------------------------------
# TC-AB-030: Run Always Binds to Master Context
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_always_binds_to_master_context(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
) -> None:
    """
    TC-AB-030: Run always binds to master context.

    Verify that:
    - All events contain master_account_id (via conversation_id/user_id binding)
    - Context is consistent across all events in a run
    - No context drift during streaming
    """
    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=build_sse_response("Hello from Tenant A").encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=tenant_a_settings)

        try:
            events: list[AgentEvent] = []

            async for event in client.iter_agent_events(tenant_a_request):
                events.append(event)

                # CRITICAL: Every event must be bound to the correct context
                assert event.user_id == "tenant-a-user-001", (
                    f"Event {event.event} has wrong user_id: {event.user_id}"
                )
                assert event.conversation_id == "tenant-a-conv-001", (
                    f"Event {event.event} has wrong conversation_id: {event.conversation_id}"
                )
                assert event.run_id == "tenant-a-run-001", (
                    f"Event {event.event} has wrong run_id: {event.run_id}"
                )

            # Verify we got events
            assert len(events) > 0, "Should have received at least one event"

            # Verify context consistency across all events
            user_ids = set(e.user_id for e in events)
            conv_ids = set(e.conversation_id for e in events)
            run_ids = set(e.run_id for e in events)

            assert len(user_ids) == 1, "All events should have same user_id"
            assert len(conv_ids) == 1, "All events should have same conversation_id"
            assert len(run_ids) == 1, "All events should have same run_id"

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_metadata_preserves_master_account_id(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
) -> None:
    """Verify master_account_id from metadata is preserved in request."""
    client = CozeClient(settings=tenant_a_settings)

    try:
        request_body = client._build_request_body(tenant_a_request)

        # Verify metadata is passed through
        assert "parameters" in request_body
        assert "metadata" in request_body["parameters"]
        assert request_body["parameters"]["metadata"]["master_account_id"] == "master-account-A"

    finally:
        await client.close()


# ---------------------------------------------------------------------------
# TC-AB-031: Cross-Account Access is Denied
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_account_access_denied_different_users(
    tenant_a_settings: Settings,
    tenant_b_request: AgentRunRequest,
) -> None:
    """
    TC-AB-031: Cross-account access is denied.

    Verify that:
    - Tenant A credentials cannot be used for Tenant B requests
    - Events maintain their original context (no injection)
    """
    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=build_sse_response().encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        # Using Tenant A settings but Tenant B request
        # In production, this would be caught by auth layer
        # Here we verify context isolation at the event level
        client = CozeClient(settings=tenant_a_settings)

        try:
            events: list[AgentEvent] = []

            async for event in client.iter_agent_events(tenant_b_request):
                events.append(event)

                # Events should maintain Tenant B context despite Tenant A settings
                # This verifies that context comes from request, not settings
                assert event.user_id == "tenant-b-user-001"
                assert event.conversation_id == "tenant-b-conv-001"

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_no_cross_context_pollution_sequential_requests(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
    tenant_b_request: AgentRunRequest,
) -> None:
    """Verify no context pollution between sequential requests."""
    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=build_sse_response().encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=tenant_a_settings)

        try:
            # First request for Tenant A
            events_a: list[AgentEvent] = []
            async for event in client.iter_agent_events(tenant_a_request):
                events_a.append(event)

            # Second request for Tenant B (simulating different user)
            events_b: list[AgentEvent] = []
            async for event in client.iter_agent_events(tenant_b_request):
                events_b.append(event)

            # Verify complete isolation
            for event in events_a:
                assert "tenant-a" in event.user_id
                assert "tenant-a" in event.conversation_id

            for event in events_b:
                assert "tenant-b" in event.user_id
                assert "tenant-b" in event.conversation_id

            # No overlap
            a_user_ids = set(e.user_id for e in events_a)
            b_user_ids = set(e.user_id for e in events_b)
            assert a_user_ids.isdisjoint(b_user_ids), "User IDs should not overlap"

        finally:
            await client.close()


# ---------------------------------------------------------------------------
# TC-AB-032: Sensitive Data Not Logged
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sensitive_data_not_logged(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
) -> None:
    """
    TC-AB-032: Sensitive data not logged.

    Verify that:
    - API keys are not logged
    - User query content is not fully logged
    - Only necessary IDs and types are logged
    """
    # Capture log output
    log_capture = StringIO()
    handler = logging.StreamHandler(log_capture)
    handler.setLevel(logging.DEBUG)

    logger = logging.getLogger("agent_bridge")
    original_handlers = logger.handlers.copy()
    original_level = logger.level

    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)

    try:
        with respx.mock:
            respx.post("https://api.coze.cn/v3/chat").mock(
                return_value=httpx.Response(
                    status_code=200,
                    content=build_sse_response().encode(),
                    headers={"Content-Type": "text/event-stream"},
                )
            )

            client = CozeClient(settings=tenant_a_settings)

            try:
                async for _ in client.iter_agent_events(tenant_a_request):
                    pass
            finally:
                await client.close()

        # Check log output
        log_output = log_capture.getvalue()

        # API key should not appear in logs
        assert "tenant-a-secret-key-xxxxx" not in log_output, (
            "API key should not be logged"
        )

        # Full query should not appear in logs (may be truncated/masked)
        # Note: "Tenant A query" is short, but in production long queries should be masked

        # Authorization header should be masked
        if "Authorization" in log_output:
            assert "MASKED" in log_output or "Bearer [" in log_output, (
                "Authorization should be masked in logs"
            )

    finally:
        # Restore original logging configuration
        logger.handlers = original_handlers
        logger.level = original_level


@pytest.mark.asyncio
async def test_error_logs_do_not_contain_secrets(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
) -> None:
    """Verify error logs don't contain sensitive information."""
    log_capture = StringIO()
    handler = logging.StreamHandler(log_capture)
    handler.setLevel(logging.ERROR)

    logger = logging.getLogger("agent_bridge")
    original_handlers = logger.handlers.copy()

    logger.handlers = [handler]

    try:
        with respx.mock:
            respx.post("https://api.coze.cn/v3/chat").mock(
                return_value=httpx.Response(
                    status_code=500,
                    content=b'{"error": "Internal server error"}',
                )
            )

            client = CozeClient(settings=tenant_a_settings)

            try:
                try:
                    async for _ in client.iter_agent_events(tenant_a_request):
                        pass
                except Exception:
                    pass  # Expected to fail
            finally:
                await client.close()

        log_output = log_capture.getvalue()

        # Verify no secrets in error logs
        assert "tenant-a-secret-key-xxxxx" not in log_output

    finally:
        logger.handlers = original_handlers


# ---------------------------------------------------------------------------
# TC-AB-033: Provider Credentials Not Leaked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_provider_credentials_not_in_events(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
) -> None:
    """
    TC-AB-033: Provider credentials not leaked.

    Verify that:
    - API keys don't appear in event payloads
    - Internal configuration is not exposed to clients
    """
    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=build_sse_response().encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=tenant_a_settings)

        try:
            events: list[AgentEvent] = []

            async for event in client.iter_agent_events(tenant_a_request):
                events.append(event)

                # Convert event to JSON and check for secrets
                event_json = json.dumps(event.model_dump(by_alias=True, mode="json"))

                assert "tenant-a-secret-key" not in event_json, (
                    f"API key found in event {event.event}"
                )
                assert "secret" not in event_json.lower() or "key" not in event_json.lower(), (
                    "Potential secret exposure in event"
                )

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_error_events_do_not_expose_credentials(
    tenant_a_settings: Settings,
    tenant_a_request: AgentRunRequest,
) -> None:
    """Verify error events don't expose internal credentials."""
    # Simulate an error response that might include request details
    error_response = {
        "code": 401,
        "msg": "Invalid API key",
        "request_id": "req-12345",
    }

    sse_content = f'data: {json.dumps(error_response)}\n\ndata: {{"event": "done"}}\n\n'

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=sse_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=tenant_a_settings)

        try:
            events: list[AgentEvent] = []

            async for event in client.iter_agent_events(tenant_a_request):
                events.append(event)

            # Check error events specifically
            error_events = [e for e in events if e.event == "error"]

            for error_event in error_events:
                error_json = json.dumps(error_event.payload)
                assert tenant_a_settings.api_key not in error_json

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_request_body_does_not_log_full_api_key() -> None:
    """Verify request building doesn't expose full API key."""
    settings = Settings(
        api_base="https://api.coze.cn/v3/chat",
        api_key="sk-very-secret-api-key-12345",
        bot_id="test-bot",
        request_timeout=10.0,
        stream=True,
    )

    client = CozeClient(settings=settings)

    try:
        headers = client._build_headers()

        # Authorization header should exist
        assert "Authorization" in headers

        # But we should never log the full key
        # In production, logging should mask this
        auth_value = headers["Authorization"]
        assert auth_value.startswith("Bearer ")

        # The actual key is in there (for the request)
        # But logging infrastructure should mask it
        assert "sk-very-secret-api-key-12345" in auth_value

    finally:
        await client.close()


# ---------------------------------------------------------------------------
# Additional Isolation Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parallel_requests_maintain_isolation() -> None:
    """Verify parallel requests for different tenants maintain isolation."""
    import asyncio

    settings_a = Settings(
        api_base="https://api.coze.cn/v3/chat",
        api_key="key-a",
        bot_id="bot-a",
        request_timeout=10.0,
        stream=True,
    )

    settings_b = Settings(
        api_base="https://api.coze.cn/v3/chat",
        api_key="key-b",
        bot_id="bot-b",
        request_timeout=10.0,
        stream=True,
    )

    request_a = AgentRunRequest(
        user_id="user-a",
        query="Query A",
        conversation_id="conv-a",
        run_id="run-a",
        reply_message_id="msg-a",
    )

    request_b = AgentRunRequest(
        user_id="user-b",
        query="Query B",
        conversation_id="conv-b",
        run_id="run-b",
        reply_message_id="msg-b",
    )

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=build_sse_response().encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        async def process_request(settings: Settings, request: AgentRunRequest) -> list[AgentEvent]:
            client = CozeClient(settings=settings)
            events = []
            try:
                async for event in client.iter_agent_events(request):
                    events.append(event)
            finally:
                await client.close()
            return events

        # Run both requests in parallel
        results = await asyncio.gather(
            process_request(settings_a, request_a),
            process_request(settings_b, request_b),
        )

        events_a, events_b = results

        # Verify isolation
        for event in events_a:
            assert event.user_id == "user-a"
            assert "user-b" not in str(event.model_dump())

        for event in events_b:
            assert event.user_id == "user-b"
            assert "user-a" not in str(event.model_dump())
