"""
Metrics Recorder Module
指标记录模块

Records evaluation metrics including TTFT (Time To First Token),
total latency, and token consumption via agent-bridge API.
通过 agent-bridge API 记录每个 Response 的 TTFT、总延迟以及 Token 消耗。

Reference:
- docs/test/agent-evaluation.md § 8.2 报告与可观测性
- docs/test/nonfunctional-testing.md
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, AsyncIterator, Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class EvalMetrics:
    """
    Metrics collected during a single evaluation run.
    单次评估运行中收集的指标。
    """
    # Timing metrics (in seconds)
    ttft: float = 0.0               # Time To First Token
    total_latency: float = 0.0      # Total response time
    connection_time: float = 0.0    # Time to establish connection

    # Token metrics
    input_tokens: int = 0           # Tokens in the prompt
    output_tokens: int = 0          # Tokens in the response
    total_tokens: int = 0           # Total tokens consumed

    # Streaming metrics
    chunk_count: int = 0            # Number of stream chunks received
    avg_chunk_interval: float = 0.0 # Average time between chunks

    # Response metrics
    response_length: int = 0        # Length of final response (chars)
    error_count: int = 0            # Number of errors encountered

    # Timestamps
    started_at: Optional[datetime] = None
    first_token_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Raw data for debugging
    raw_chunks: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert metrics to dictionary for serialization."""
        return {
            "timing": {
                "ttft_seconds": self.ttft,
                "total_latency_seconds": self.total_latency,
                "connection_time_seconds": self.connection_time,
            },
            "tokens": {
                "input": self.input_tokens,
                "output": self.output_tokens,
                "total": self.total_tokens,
            },
            "streaming": {
                "chunk_count": self.chunk_count,
                "avg_chunk_interval_seconds": self.avg_chunk_interval,
            },
            "response": {
                "length_chars": self.response_length,
                "error_count": self.error_count,
            },
            "timestamps": {
                "started_at": self.started_at.isoformat() if self.started_at else None,
                "first_token_at": self.first_token_at.isoformat() if self.first_token_at else None,
                "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            },
        }


class MetricsRecorder:
    """
    Records metrics by calling the agent-bridge API.
    通过调用 agent-bridge API 记录指标。
    """

    def __init__(
        self,
        api_base: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        timeout: float = 120.0,
    ):
        """
        Initialize the metrics recorder.

        Args:
            api_base: Base URL for the agent-bridge API.
            api_key: API key for authentication.
            timeout: Request timeout in seconds.
        """
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> MetricsRecorder:
        """Async context manager entry."""
        self._client = httpx.AsyncClient(
            base_url=self.api_base,
            timeout=httpx.Timeout(self.timeout),
        )
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _build_headers(self) -> dict[str, str]:
        """Build request headers."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def record_streaming_response(
        self,
        prompt: str,
        conversation_id: Optional[str] = None,
        user_id: str = "eval-user",
        bot_id: Optional[str] = None,
        collect_raw_chunks: bool = False,
    ) -> tuple[str, EvalMetrics]:
        """
        Send a prompt and record metrics from the streaming response.
        发送 Prompt 并记录流式响应的指标。

        Args:
            prompt: The user prompt to send.
            conversation_id: Optional conversation ID.
            user_id: User ID for the request.
            bot_id: Optional bot ID override.
            collect_raw_chunks: Whether to collect raw chunk data.

        Returns:
            Tuple of (response_content, metrics).
        """
        if not self._client:
            raise RuntimeError("MetricsRecorder not initialized. Use async context manager.")

        metrics = EvalMetrics()
        metrics.started_at = datetime.utcnow()

        # Build request payload
        payload = {
            "query": prompt,
            "user_id": user_id,
            "stream": True,
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id
        if bot_id:
            payload["bot_id"] = bot_id

        content_parts: list[str] = []
        chunk_times: list[float] = []
        last_chunk_time = time.perf_counter()

        try:
            connection_start = time.perf_counter()

            async with self._client.stream(
                "POST",
                "/api/v1/agent/chat",
                json=payload,
                headers=self._build_headers(),
            ) as response:
                metrics.connection_time = time.perf_counter() - connection_start

                if response.status_code != 200:
                    metrics.error_count += 1
                    error_text = await response.aread()
                    logger.error(f"API error: {response.status_code} - {error_text}")
                    metrics.completed_at = datetime.utcnow()
                    metrics.total_latency = time.perf_counter() - connection_start
                    return "", metrics

                # Process SSE stream
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue

                    current_time = time.perf_counter()

                    # Parse SSE data line
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix

                        if data_str == "[DONE]":
                            break

                        try:
                            event_data = json.loads(data_str)
                            chunk_content = self._extract_content(event_data)

                            if chunk_content:
                                # Record first token time
                                if metrics.first_token_at is None:
                                    metrics.first_token_at = datetime.utcnow()
                                    metrics.ttft = current_time - connection_start

                                content_parts.append(chunk_content)
                                metrics.chunk_count += 1

                                # Track chunk interval
                                chunk_interval = current_time - last_chunk_time
                                chunk_times.append(chunk_interval)
                                last_chunk_time = current_time

                                if collect_raw_chunks:
                                    metrics.raw_chunks.append(data_str)

                            # Extract token usage if available
                            self._extract_token_usage(event_data, metrics)

                        except json.JSONDecodeError:
                            logger.debug(f"Non-JSON SSE line: {data_str[:100]}")

            metrics.completed_at = datetime.utcnow()
            metrics.total_latency = time.perf_counter() - connection_start

        except httpx.TimeoutException:
            metrics.error_count += 1
            logger.error("Request timed out")
            metrics.completed_at = datetime.utcnow()

        except Exception as e:
            metrics.error_count += 1
            logger.error(f"Request failed: {e}")
            metrics.completed_at = datetime.utcnow()

        # Calculate final metrics
        final_content = "".join(content_parts)
        metrics.response_length = len(final_content)

        if chunk_times:
            metrics.avg_chunk_interval = sum(chunk_times) / len(chunk_times)

        # Estimate tokens if not provided by API
        if metrics.input_tokens == 0:
            metrics.input_tokens = self._estimate_tokens(prompt)
        if metrics.output_tokens == 0:
            metrics.output_tokens = self._estimate_tokens(final_content)
        metrics.total_tokens = metrics.input_tokens + metrics.output_tokens

        return final_content, metrics

    def _extract_content(self, event_data: dict[str, Any]) -> str:
        """
        Extract content from an SSE event.
        从 SSE 事件中提取内容。
        """
        # Handle different event formats
        # Format 1: Direct content in payload
        if "payload" in event_data:
            payload = event_data["payload"]
            if isinstance(payload, dict):
                # Check for delta content
                delta = payload.get("delta", "")
                if delta:
                    return str(delta)
                # Check for content field
                content = payload.get("content", "")
                if content:
                    return str(content)

        # Format 2: Coze-style message format
        if "message" in event_data:
            message = event_data["message"]
            if isinstance(message, dict):
                content = message.get("content", "")
                if content:
                    return str(content)

        # Format 3: Direct content field
        if "content" in event_data:
            return str(event_data["content"])

        # Format 4: Delta field
        if "delta" in event_data:
            return str(event_data["delta"])

        return ""

    def _extract_token_usage(self, event_data: dict[str, Any], metrics: EvalMetrics) -> None:
        """
        Extract token usage from event data if available.
        如果可用，从事件数据中提取 Token 使用量。
        """
        # Check for usage field (OpenAI-style)
        usage = event_data.get("usage")
        if usage and isinstance(usage, dict):
            metrics.input_tokens = usage.get("prompt_tokens", metrics.input_tokens)
            metrics.output_tokens = usage.get("completion_tokens", metrics.output_tokens)
            metrics.total_tokens = usage.get("total_tokens", metrics.total_tokens)
            return

        # Check in payload
        payload = event_data.get("payload", {})
        if isinstance(payload, dict):
            usage = payload.get("usage")
            if usage and isinstance(usage, dict):
                metrics.input_tokens = usage.get("prompt_tokens", metrics.input_tokens)
                metrics.output_tokens = usage.get("completion_tokens", metrics.output_tokens)
                metrics.total_tokens = usage.get("total_tokens", metrics.total_tokens)

    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate token count from text.
        从文本估算 Token 数量。

        Uses a simple heuristic: ~4 chars per token for English,
        ~2 chars per token for Chinese.
        """
        if not text:
            return 0

        # Count Chinese characters
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        non_chinese_chars = len(text) - chinese_chars

        # Estimate tokens
        chinese_tokens = chinese_chars // 2
        english_tokens = non_chinese_chars // 4

        return max(1, chinese_tokens + english_tokens)

    async def record_non_streaming_response(
        self,
        prompt: str,
        conversation_id: Optional[str] = None,
        user_id: str = "eval-user",
        bot_id: Optional[str] = None,
    ) -> tuple[str, EvalMetrics]:
        """
        Send a prompt and record metrics from a non-streaming response.
        发送 Prompt 并记录非流式响应的指标。

        Args:
            prompt: The user prompt to send.
            conversation_id: Optional conversation ID.
            user_id: User ID for the request.
            bot_id: Optional bot ID override.

        Returns:
            Tuple of (response_content, metrics).
        """
        if not self._client:
            raise RuntimeError("MetricsRecorder not initialized. Use async context manager.")

        metrics = EvalMetrics()
        metrics.started_at = datetime.utcnow()

        payload = {
            "query": prompt,
            "user_id": user_id,
            "stream": False,
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id
        if bot_id:
            payload["bot_id"] = bot_id

        start_time = time.perf_counter()

        try:
            response = await self._client.post(
                "/api/v1/agent/chat",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    **({"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}),
                },
            )

            metrics.connection_time = time.perf_counter() - start_time

            if response.status_code != 200:
                metrics.error_count += 1
                metrics.completed_at = datetime.utcnow()
                metrics.total_latency = time.perf_counter() - start_time
                return "", metrics

            data = response.json()
            content = data.get("content", data.get("response", ""))

            metrics.first_token_at = datetime.utcnow()
            metrics.completed_at = datetime.utcnow()
            metrics.ttft = metrics.total_latency = time.perf_counter() - start_time
            metrics.response_length = len(content)
            metrics.chunk_count = 1

            # Extract token usage
            self._extract_token_usage(data, metrics)

            if metrics.input_tokens == 0:
                metrics.input_tokens = self._estimate_tokens(prompt)
            if metrics.output_tokens == 0:
                metrics.output_tokens = self._estimate_tokens(content)
            metrics.total_tokens = metrics.input_tokens + metrics.output_tokens

            return content, metrics

        except Exception as e:
            metrics.error_count += 1
            logger.error(f"Request failed: {e}")
            metrics.completed_at = datetime.utcnow()
            metrics.total_latency = time.perf_counter() - start_time
            return "", metrics


class MetricsAggregator:
    """
    Aggregates metrics from multiple evaluation runs.
    聚合多次评估运行的指标。
    """

    def __init__(self):
        self.metrics_list: list[EvalMetrics] = []

    def add(self, metrics: EvalMetrics) -> None:
        """Add metrics from a single run."""
        self.metrics_list.append(metrics)

    def get_summary(self) -> dict[str, Any]:
        """
        Get aggregated summary statistics.
        获取聚合摘要统计信息。
        """
        if not self.metrics_list:
            return {"error": "No metrics recorded"}

        n = len(self.metrics_list)
        ttft_values = [m.ttft for m in self.metrics_list if m.ttft > 0]
        latency_values = [m.total_latency for m in self.metrics_list if m.total_latency > 0]
        token_values = [m.total_tokens for m in self.metrics_list if m.total_tokens > 0]

        def stats(values: list[float]) -> dict[str, float]:
            if not values:
                return {"min": 0, "max": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0}
            sorted_v = sorted(values)
            return {
                "min": min(values),
                "max": max(values),
                "avg": sum(values) / len(values),
                "p50": sorted_v[int(len(sorted_v) * 0.5)],
                "p95": sorted_v[int(len(sorted_v) * 0.95)] if len(sorted_v) >= 20 else sorted_v[-1],
                "p99": sorted_v[int(len(sorted_v) * 0.99)] if len(sorted_v) >= 100 else sorted_v[-1],
            }

        error_count = sum(1 for m in self.metrics_list if m.error_count > 0)

        return {
            "total_runs": n,
            "successful_runs": n - error_count,
            "error_rate": error_count / n if n > 0 else 0,
            "ttft_seconds": stats(ttft_values),
            "total_latency_seconds": stats(latency_values),
            "total_tokens": stats(token_values),
        }
