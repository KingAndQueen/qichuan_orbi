<<<<<<< HEAD
"""
SSE Stream Handling Tests for Agent Bridge.

This module tests the streaming functionality of the Agent Bridge service,
specifically focusing on:
1. Correct SSE event formatting and forwarding
2. Error handling when upstream LLM APIs fail

These are unit tests that mock the external HTTP calls using respx,
ensuring no real network requests are made.

Reference:
- Provider interface: agent_bridge/providers/base.py
- Coze client: agent_bridge/client.py
- Router: agent_bridge/router.py
=======
"""SSE Stream Handling Tests for Agent Bridge.

This module tests the Server-Sent Events (SSE) stream forwarding logic,
ensuring upstream LLM responses are correctly parsed and formatted.
>>>>>>> claude/setup-work-agent-tdd-MAtzW
"""

from __future__ import annotations

<<<<<<< HEAD
import asyncio
=======
>>>>>>> claude/setup-work-agent-tdd-MAtzW
import json
from typing import AsyncIterator
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

from agent_bridge.client import CozeClient, CozeAPIError
from agent_bridge.config import Settings
from agent_bridge.models import AgentEvent, AgentRunRequest


<<<<<<< HEAD
# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_settings() -> Settings:
    """Provide a minimal Settings instance for testing."""
    return Settings(
        api_key="test-api-key-12345",
        api_base="https://api.coze.mock/v3/chat",
        bot_id="test-bot-id",
        stream=True,
        request_timeout=30.0,
=======
# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_settings() -> Settings:
    """Provide a test Settings instance with mocked values."""
    return Settings(
        api_base="https://api.coze.cn/v3/chat",
        api_key="test-api-key-12345",
        bot_id="test-bot-id",
        request_timeout=10.0,
        stream=True,
>>>>>>> claude/setup-work-agent-tdd-MAtzW
    )


@pytest.fixture
<<<<<<< HEAD
def mock_api_url() -> str:
    """Provide the API URL as a plain string for respx matching."""
    return "https://api.coze.mock/v3/chat"



@pytest.fixture
def sample_request() -> AgentRunRequest:
    """Provide a sample AgentRunRequest for testing."""
    return AgentRunRequest(
        user_id="user-123",
        query="Hello, how are you?",
        bot_id="test-bot-id",
        stream=True,
        conversation_id="conv-456",
        run_id="run-789",
=======
def sample_request() -> AgentRunRequest:
    """Provide a sample AgentRunRequest for testing."""
    return AgentRunRequest(
        user_id="test-user-001",
        query="Hello, how are you?",
        bot_id="test-bot-id",
        stream=True,
        conversation_id="conv-001",
        run_id="run-001",
>>>>>>> claude/setup-work-agent-tdd-MAtzW
        reply_message_id="msg-001",
    )


<<<<<<< HEAD
# =============================================================================
# Test Case 1: SSE Stream Forwarding Success
# =============================================================================

class TestSSEStreamForwardingSuccess:
    """
    Test that the Agent Bridge correctly forwards SSE stream data from upstream.
    
    Scenario: Upstream LLM API returns a normal streaming response with chunks:
    ["Hello", " ", "World", "!"]
    
    Expected:
    - Output data stream conforms to SSE spec (event + data fields)
    - All chunks concatenated equal "Hello World!"
    """

    @pytest.mark.asyncio
    async def test_sse_stream_forwarding_success(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """
        Verify that stream chunks are correctly parsed and forwarded as AgentEvents.
        
        Arrange: Mock upstream to return SSE chunks for "Hello", " ", "World", "!"
        Act: Call iter_agent_events and collect all events
        Assert: 
            - stream_chunk events contain correct deltas
            - Final concatenation equals "Hello World!"
        """
        # Arrange: Build the mock SSE response body
        # Coze SSE format: data: {"event": "conversation.message.delta", "message": {...}}
        mock_chunks = ["Hello", " ", "World", "!"]
        sse_lines = []
        
        for chunk in mock_chunks:
            event_data = {
                "event": "conversation.message.delta",
                "message": {
                    "type": "answer",
                    "content": chunk,
                }
            }
            sse_lines.append(f"data: {json.dumps(event_data)}\n\n")
        
        # Add the final [DONE] marker
        sse_lines.append("data: [DONE]\n\n")
        
        mock_response_body = "".join(sse_lines)

        # Act: Mock the HTTP stream response
        with respx.mock:
            respx.post(mock_api_url).mock(
                return_value=httpx.Response(
                    status_code=200,
                    content=mock_response_body.encode("utf-8"),
                    headers={"Content-Type": "text/event-stream"},
                )
            )

            client = CozeClient(settings=mock_settings)
            events: list[AgentEvent] = []
            
            try:
                async for event in client.iter_agent_events(sample_request):
                    events.append(event)
            finally:
                await client.close()

        # Assert: Check we got the expected events
        # Filter for stream_chunk events only
        stream_chunks = [e for e in events if e.event == "stream_chunk"]
        
        # Should have 4 content chunks + 1 final chunk (delta="", final=True)
        assert len(stream_chunks) >= 4, (
            f"Expected at least 4 stream_chunk events, got {len(stream_chunks)}"
        )
        
        # Extract deltas and concatenate
        content_parts = [
            e.payload.get("delta", "") 
            for e in stream_chunks 
            if not e.payload.get("final", False)
        ]
        full_content = "".join(content_parts)
        
        assert full_content == "Hello World!", (
            f"Expected 'Hello World!', got '{full_content}'"
        )

        # Verify SSE structure - each event should have proper fields
        for event in events:
            assert hasattr(event, "event"), "AgentEvent must have 'event' field"
            assert hasattr(event, "payload"), "AgentEvent must have 'payload' field"
            assert isinstance(event.payload, dict), "payload must be a dict"

    @pytest.mark.asyncio
    async def test_sse_event_format_compliance(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """
        Verify that AgentEvent objects can be serialized to SSE-compliant format.
        
        Expected SSE format: 
            event: <event_type>
            data: {"content": "..."}
        """
        # Arrange: Create a sample AgentEvent
        event = AgentEvent(
            event="stream_chunk",
            conversation_id="conv-123",
            user_id="user-456",
            run_id="run-789",
            payload={"delta": "Hello", "final": False},
        )

        # Act: Serialize to JSON (as router.py does)
        serialized = json.dumps(
            event.model_dump(by_alias=True, mode="json"),
            ensure_ascii=False,
        )

        # Assert: The serialized data should be valid JSON
        parsed = json.loads(serialized)
        
        assert parsed["event"] == "stream_chunk"
        assert "payload" in parsed
        assert parsed["payload"]["delta"] == "Hello"


# =============================================================================
# Test Case 2: Upstream Error Handling
# =============================================================================

class TestUpstreamErrorHandling:
    """
    Test that the Agent Bridge gracefully handles upstream LLM API errors.
    
    Scenarios:
    1. Upstream returns HTTP 500 status code
    2. Upstream connection drops mid-stream
    3. Upstream returns error payload in SSE stream
    
    Expected:
    - Service does not crash with unhandled exception
    - Client receives a specific SSE error event
    - Connection is closed gracefully
    """

    @pytest.mark.asyncio
    async def test_upstream_http_500_error(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """
        Verify handling when upstream returns HTTP 500.
        
        Arrange: Mock upstream to return 500 Internal Server Error
        Act: Call iter_agent_events
        Assert: CozeAPIError is raised with status code info
        """
        with respx.mock:
            respx.post(mock_api_url).mock(
                return_value=httpx.Response(
                    status_code=500,
                    content=b'{"error": "Internal Server Error"}',
                    headers={"Content-Type": "application/json"},
                )
            )

            client = CozeClient(settings=mock_settings)
            
            with pytest.raises(CozeAPIError) as exc_info:
                try:
                    async for _ in client.iter_agent_events(sample_request):
                        pass  # Should not reach here
                finally:
                    await client.close()

            # Assert: Error contains status code information
            assert exc_info.value.status_code == 500
            assert "500" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_upstream_connection_error(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """
        Verify handling when upstream connection fails entirely.
        
        Arrange: Mock upstream to raise connection error
        Act: Call iter_agent_events
        Assert: CozeAPIError is raised
        """
        with respx.mock:
            respx.post(mock_api_url).mock(
                side_effect=httpx.ConnectError("Connection refused")
            )

            client = CozeClient(settings=mock_settings)
            
            with pytest.raises(CozeAPIError) as exc_info:
                try:
                    async for _ in client.iter_agent_events(sample_request):
                        pass
                finally:
                    await client.close()

            assert "通讯失败" in str(exc_info.value) or "Coze" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_upstream_error_in_stream(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """
        Verify handling when upstream returns error event in SSE stream.
        
        Scenario: Upstream sends some valid chunks, then an error event
        
        Arrange: Mock response with partial success then error
        Act: Collect all events
        Assert: An error event should be emitted, not an exception
        """
        # Arrange: Build mock response with error in stream
        sse_lines = [
            # First, a valid chunk
            'data: {"event": "conversation.message.delta", "message": {"type": "answer", "content": "Starting..."}}\n\n',
            # Then an error from Coze
            'data: {"code": 4000, "msg": "Rate limit exceeded"}\n\n',
            # Stream ends
            'data: [DONE]\n\n',
        ]
        mock_response_body = "".join(sse_lines)

        with respx.mock:
            respx.post(mock_api_url).mock(
                return_value=httpx.Response(
                    status_code=200,
                    content=mock_response_body.encode("utf-8"),
                    headers={"Content-Type": "text/event-stream"},
                )
            )

            client = CozeClient(settings=mock_settings)
            events: list[AgentEvent] = []
            
            try:
                async for event in client.iter_agent_events(sample_request):
                    events.append(event)
            finally:
                await client.close()

        # Assert: Should have received an error event
        error_events = [e for e in events if e.event == "error"]
        
        assert len(error_events) >= 1, "Expected at least one error event"
        
        error_event = error_events[0]
        assert error_event.payload.get("code") == 4000
        assert "Rate limit" in error_event.payload.get("message", "")

    @pytest.mark.asyncio
    async def test_graceful_handling_no_crash(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """
        Verify that even with errors, resources are cleaned up properly.
        
        This ensures no unclosed connections or leaked resources.
        """
        with respx.mock:
            respx.post(mock_api_url).mock(
                return_value=httpx.Response(
                    status_code=503,
                    content=b"Service Unavailable",
                )
            )

            client = CozeClient(settings=mock_settings)
            
            # Even with error, close() should be callable
            try:
                async for _ in client.iter_agent_events(sample_request):
                    pass
            except CozeAPIError:
                pass  # Expected
            finally:
                # This should not raise
                await client.close()
            
            # If we get here without exception, test passes


# =============================================================================
# Additional Edge Case Tests
# =============================================================================

class TestEdgeCases:
    """Additional tests for edge cases and robustness."""

    @pytest.mark.asyncio
    async def test_empty_stream_response(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """Verify handling of empty stream (immediate [DONE])."""
        mock_response_body = "data: [DONE]\n\n"

        with respx.mock:
            respx.post(mock_api_url).mock(
                return_value=httpx.Response(
                    status_code=200,
                    content=mock_response_body.encode("utf-8"),
                    headers={"Content-Type": "text/event-stream"},
                )
            )

            client = CozeClient(settings=mock_settings)
            events: list[AgentEvent] = []
            
            try:
                async for event in client.iter_agent_events(sample_request):
                    events.append(event)
            finally:
                await client.close()

        # Should still have run_update events at minimum
        assert len(events) >= 2, "Expected at least the preparation events"

    @pytest.mark.asyncio
    async def test_malformed_json_in_stream(
        self,
        mock_settings: Settings,
        mock_api_url: str,
        sample_request: AgentRunRequest,
    ) -> None:
        """Verify handling of malformed JSON in stream (should skip, not crash)."""
        sse_lines = [
            "data: {invalid json}\n\n",
            'data: {"event": "conversation.message.delta", "message": {"type": "answer", "content": "OK"}}\n\n',
            "data: [DONE]\n\n",
        ]
        mock_response_body = "".join(sse_lines)

        with respx.mock:
            respx.post(mock_api_url).mock(
                return_value=httpx.Response(
                    status_code=200,
                    content=mock_response_body.encode("utf-8"),
                    headers={"Content-Type": "text/event-stream"},
                )
            )

            client = CozeClient(settings=mock_settings)
            events: list[AgentEvent] = []
            
            # Should NOT raise, should skip malformed line
            try:
                async for event in client.iter_agent_events(sample_request):
                    events.append(event)
            finally:
                await client.close()

        # Should have processed the valid line
        stream_chunks = [e for e in events if e.event == "stream_chunk"]
        assert any(
            e.payload.get("delta") == "OK" for e in stream_chunks
        ), "Should have processed the valid chunk"
=======
# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def build_sse_chunk(event_type: str, content: str, is_answer: bool = True) -> str:
    """Build an SSE data line simulating Coze response format."""
    message_type = "answer" if is_answer else "function_call"
    payload = {
        "event": event_type,
        "message": {
            "type": message_type,
            "content": content,
        },
    }
    return f"data: {json.dumps(payload)}\n\n"


def build_done_chunk() -> str:
    """Build the final done event for Coze stream."""
    payload = {"event": "done"}
    return f"data: {json.dumps(payload)}\n\n"


def build_error_chunk(code: int, msg: str) -> str:
    """Build an error chunk from Coze API."""
    payload = {"code": code, "msg": msg}
    return f"data: {json.dumps(payload)}\n\n"


async def mock_sse_response(chunks: list[str]) -> AsyncIterator[str]:
    """Create an async iterator yielding SSE chunks."""
    for chunk in chunks:
        # Strip trailing newlines as aiter_lines() removes them
        for line in chunk.strip().split("\n"):
            yield line


# ---------------------------------------------------------------------------
# Test Case 1: SSE Stream Forwarding Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sse_stream_forwarding_success(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Test Case 1: test_sse_stream_forwarding_success

    Scenario: Mock upstream LLM API returning a normal streaming response.
    Mock Data: Simulate LLM returning chunks: ["Hello", " ", "World", "!"]

    Expectations:
    - Output stream conforms to SSE specification (event: xxx, data: {...})
    - All chunks concatenated equal "Hello World!"
    """
    # Build mock SSE response chunks from upstream
    sse_chunks = [
        build_sse_chunk("conversation.message.delta", "Hello"),
        build_sse_chunk("conversation.message.delta", " "),
        build_sse_chunk("conversation.message.delta", "World"),
        build_sse_chunk("conversation.message.delta", "!"),
        build_done_chunk(),
    ]

    # Create mock HTTP response
    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        # Mock the Coze API endpoint
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            collected_events: list[AgentEvent] = []
            content_deltas: list[str] = []

            async for event in client.iter_agent_events(sample_request):
                collected_events.append(event)

                # Collect stream_chunk deltas for content verification
                if event.event == "stream_chunk":
                    delta = event.payload.get("delta", "")
                    if delta:
                        content_deltas.append(delta)

            # Verify we received events
            assert len(collected_events) > 0, "Should receive at least one event"

            # Verify event types conform to SSE protocol
            event_types = [e.event for e in collected_events]
            assert "run_update" in event_types, "Should contain run_update events"
            assert "stream_chunk" in event_types, "Should contain stream_chunk events"

            # Verify concatenated content equals "Hello World!"
            full_content = "".join(content_deltas)
            assert full_content == "Hello World!", (
                f"Expected 'Hello World!' but got '{full_content}'"
            )

            # Verify SSE event structure
            for event in collected_events:
                assert event.event is not None, "Event must have an event type"
                assert hasattr(event, "payload"), "Event must have payload"
                assert event.conversation_id == "conv-001", "Event must preserve conversation_id"
                assert event.user_id == "test-user-001", "Event must preserve user_id"

            # Verify final chunk has final=True
            final_chunks = [
                e for e in collected_events
                if e.event == "stream_chunk" and e.payload.get("final") is True
            ]
            assert len(final_chunks) >= 1, "Should have at least one final stream_chunk"

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_sse_stream_partial_chunks(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Test streaming with various chunk sizes and content types.

    Verifies that the stream handler correctly processes:
    - Empty deltas (keep-alive)
    - Unicode content
    - Multiple consecutive chunks
    """
    sse_chunks = [
        build_sse_chunk("conversation.message.delta", "你好"),
        build_sse_chunk("conversation.message.delta", "世界"),
        build_sse_chunk("conversation.message.delta", "!"),
        build_done_chunk(),
    ]

    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            content_deltas: list[str] = []

            async for event in client.iter_agent_events(sample_request):
                if event.event == "stream_chunk":
                    delta = event.payload.get("delta", "")
                    if delta:
                        content_deltas.append(delta)

            full_content = "".join(content_deltas)
            assert full_content == "你好世界!", (
                f"Expected '你好世界!' but got '{full_content}'"
            )

        finally:
            await client.close()


# ---------------------------------------------------------------------------
# Test Case 2: Upstream Error Handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upstream_error_handling_http_500(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Test Case 2a: Upstream returns HTTP 500 status code.

    Scenario: Upstream LLM API returns 500 Internal Server Error.

    Expectations:
    - Service should NOT crash with unhandled exception
    - Should raise CozeAPIError with appropriate status code
    """
    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=500,
                content=b'{"error": "Internal Server Error"}',
                headers={"Content-Type": "application/json"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            with pytest.raises(CozeAPIError) as exc_info:
                events = []
                async for event in client.iter_agent_events(sample_request):
                    events.append(event)

            # Verify error details
            assert exc_info.value.status_code == 500
            assert "500" in str(exc_info.value)

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_upstream_error_handling_connection_error(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Test Case 2b: Upstream connection fails (network error).

    Scenario: Network error occurs when connecting to upstream.

    Expectations:
    - Service should NOT crash with unhandled exception
    - Should raise CozeAPIError wrapping the connection error
    """
    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        client = CozeClient(settings=mock_settings)

        try:
            with pytest.raises(CozeAPIError) as exc_info:
                async for event in client.iter_agent_events(sample_request):
                    pass

            # Verify it's a connection error
            assert "通讯失败" in str(exc_info.value) or "Coze" in str(exc_info.value)

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_upstream_error_in_stream(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Test Case 2c: Upstream returns error event within the stream.

    Scenario: Coze API returns an error code within the SSE stream
    (e.g., rate limit or quota exceeded mid-conversation).

    Expectations:
    - Should emit an error event to downstream
    - Should NOT crash the service
    - Error event should contain error details
    """
    # Start normal, then error mid-stream
    sse_chunks = [
        build_sse_chunk("conversation.message.delta", "Starting"),
        build_error_chunk(429, "Rate limit exceeded"),
        build_done_chunk(),
    ]

    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            collected_events: list[AgentEvent] = []

            async for event in client.iter_agent_events(sample_request):
                collected_events.append(event)

            # Verify we received events without crashing
            assert len(collected_events) > 0

            # Check for error event in output
            error_events = [e for e in collected_events if e.event == "error"]
            assert len(error_events) >= 1, "Should emit at least one error event"

            # Verify error event structure
            error_event = error_events[0]
            assert "code" in error_event.payload or "message" in error_event.payload

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_upstream_disconnect_mid_stream(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Test Case 2d: Upstream disconnects mid-stream.

    Scenario: Connection drops after partial data received.

    Expectations:
    - Should handle gracefully (either error event or clean termination)
    - Partial content should still be accessible
    """
    # Only partial response without done event
    sse_chunks = [
        build_sse_chunk("conversation.message.delta", "Partial"),
        build_sse_chunk("conversation.message.delta", " content"),
        # No done chunk - simulates disconnect
    ]

    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            collected_events: list[AgentEvent] = []
            content_deltas: list[str] = []

            async for event in client.iter_agent_events(sample_request):
                collected_events.append(event)
                if event.event == "stream_chunk":
                    delta = event.payload.get("delta", "")
                    if delta:
                        content_deltas.append(delta)

            # Should have received partial content
            full_content = "".join(content_deltas)
            assert "Partial" in full_content, "Should have received partial content"

            # Should emit stream_result with accumulated content
            result_events = [e for e in collected_events if e.event == "stream_result"]
            if result_events:
                result_content = result_events[0].payload.get("content", "")
                assert "Partial" in result_content

        finally:
            await client.close()


# ---------------------------------------------------------------------------
# Test Case 3: SSE Format Validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sse_output_format_compliance(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """
    Verify output events can be serialized to valid SSE format.

    SSE format requirements:
    - event: <event_type>\n
    - data: <json_payload>\n\n
    """
    sse_chunks = [
        build_sse_chunk("conversation.message.delta", "Test"),
        build_done_chunk(),
    ]

    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            async for event in client.iter_agent_events(sample_request):
                # Verify event can be serialized to SSE format
                sse_event_line = f"event: {event.event}"
                sse_data_line = f"data: {json.dumps(event.model_dump(by_alias=True, mode='json'), ensure_ascii=False)}"

                # SSE format validation
                assert event.event is not None and len(event.event) > 0
                assert isinstance(event.payload, dict)

                # Verify JSON serialization works
                try:
                    json.loads(sse_data_line.split("data: ", 1)[1])
                except json.JSONDecodeError as e:
                    pytest.fail(f"Event payload is not valid JSON: {e}")

        finally:
            await client.close()


# ---------------------------------------------------------------------------
# Test Case 4: Edge Cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_stream_response(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """Test handling of empty stream response (only done event)."""
    sse_chunks = [build_done_chunk()]
    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            events = []
            async for event in client.iter_agent_events(sample_request):
                events.append(event)

            # Should complete without error
            assert len(events) > 0, "Should have at least run_update events"

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_malformed_json_in_stream(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """Test handling of malformed JSON in stream data."""
    sse_chunks = [
        "data: {invalid json}\n\n",
        build_sse_chunk("conversation.message.delta", "Valid"),
        build_done_chunk(),
    ]

    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            content_deltas: list[str] = []

            # Should not crash, should skip malformed data
            async for event in client.iter_agent_events(sample_request):
                if event.event == "stream_chunk":
                    delta = event.payload.get("delta", "")
                    if delta:
                        content_deltas.append(delta)

            # Should still get valid content
            full_content = "".join(content_deltas)
            assert "Valid" in full_content

        finally:
            await client.close()


@pytest.mark.asyncio
async def test_keepalive_lines_ignored(
    mock_settings: Settings,
    sample_request: AgentRunRequest,
) -> None:
    """Test that keep-alive/comment lines are properly ignored."""
    sse_chunks = [
        ": keep-alive\n\n",
        "\n",
        build_sse_chunk("conversation.message.delta", "Content"),
        ": another comment\n\n",
        build_done_chunk(),
    ]

    mock_response_content = "".join(sse_chunks)

    with respx.mock:
        respx.post("https://api.coze.cn/v3/chat").mock(
            return_value=httpx.Response(
                status_code=200,
                content=mock_response_content.encode(),
                headers={"Content-Type": "text/event-stream"},
            )
        )

        client = CozeClient(settings=mock_settings)

        try:
            content_deltas: list[str] = []

            async for event in client.iter_agent_events(sample_request):
                if event.event == "stream_chunk":
                    delta = event.payload.get("delta", "")
                    if delta:
                        content_deltas.append(delta)

            full_content = "".join(content_deltas)
            assert full_content == "Content"

        finally:
            await client.close()
>>>>>>> claude/setup-work-agent-tdd-MAtzW
