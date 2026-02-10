"""Async client wrapper around the Coze API./Coze API 的异步客户端封装。"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from .config import Settings, get_settings
from .models import AgentEvent, AgentRunRequest, AgentRunResponse, CozeEvent


logger = logging.getLogger(__name__)


class CozeAPIError(Exception):
    """Raised when Coze API requests fail."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class CozeClient:
    """Asynchronous Coze Open API v3 client./面向 Coze Open API V3 的异步客户端。"""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        """Initialise the client with optional settings./使用可选配置初始化客户端。"""
        self._settings = settings or get_settings()
        self._client = httpx.AsyncClient(timeout=self._settings.request_timeout)

    @property
    def settings(self) -> Settings:
        """Expose the settings used by this client./返回当前客户端使用的设置。"""

        return self._settings

    async def close(self) -> None:
        """Close the underlying HTTP client./显式关闭底层 HTTP 客户端。"""

        await self._client.aclose()

    async def iter_agent_events(
        self, payload: AgentRunRequest
    ) -> AsyncIterator[AgentEvent]:
        """Yield protocol events by streaming from Coze./调用 Coze 接口并逐条产出协议化事件。"""

        request_body = self._build_request_body(payload)
        headers = self._build_headers()

        api_url = f"{self._settings.api_base}"
        auth_state = "Authorization: Bearer [MASKED]" if headers.get("Authorization") else "Authorization: <missing>"
        logger.debug(
            "准备 Coze HTTP 请求", extra={"url": api_url, "authorization": auth_state}
        )

        conversation_id = payload.conversation_id
        user_id = payload.user_id
        run_id = payload.run_id
        reply_message_id = payload.reply_message_id

        # Signal state transitions from preparation to running./标记运行态从准备到执行。
        yield AgentEvent(
            event="run_update",
            conversation_id=conversation_id,
            user_id=user_id,
            run_id=run_id,
            payload={
                "runId": run_id,
                "stepId": "coze.prepare",
                "stepName": "准备中",
                "status": "pending",
            },
        )
        yield AgentEvent(
            event="run_update",
            conversation_id=conversation_id,
            user_id=user_id,
            run_id=run_id,
            payload={
                "runId": run_id,
                "stepId": "coze.generate",
                "stepName": "生成回复",
                "status": "running",
            },
        )

        content_parts: List[str] = []

        try:
            async with self._client.stream(
                "POST",
                api_url,  # [V3 FIX] Remove hard-coded /v3/chat./移除硬编码的 /v3/chat
                json=request_body,
                headers=headers,
            ) as response:
                response.raise_for_status()
                logger.info(
                    "Coze 流式连接已建立",
                    extra={"conversation_id": conversation_id, "workflow_id": payload.workflow_id},
                )

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        # Skip keep-alive or comment lines in the SSE stream./跳过 SSE 流中的保活或注释行。
                        continue

                    data_str = line.split("data:", 1)[1].strip()

                    if data_str == "[DONE]":
                        yield AgentEvent(
                            event="stream_chunk",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "messageId": reply_message_id,
                                "delta": "",
                                "final": True,
                            },
                        )
                        yield AgentEvent(
                            event="run_update",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "runId": run_id,
                                "stepId": "coze.generate",
                                "stepName": "生成回复",
                                "status": "succeeded",
                            },
                        )
                        yield AgentEvent(
                            event="suggestion_chips",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "messageId": reply_message_id,
                                "chips": [
                                    {
                                        "id": "sum",
                                        "label": "总结此页",
                                        "action": {
                                            "type": "send_prompt",
                                            "payload": "总结一下我们刚才的对话",
                                        },
                                    }
                                ],
                            },
                        )
                        logger.info(
                            "Coze 流式连接完成",
                            extra={"conversation_id": conversation_id, "workflow_id": payload.workflow_id},
                        )
                        break

                    try:
                        event_payload = json.loads(data_str)
                    except json.JSONDecodeError:
                        logger.warning("无法解析的 Coze JSON 流数据: %s", data_str)
                        continue

                    if not isinstance(event_payload, dict):
                        logger.warning(
                            "收到未知的 Coze 流数据类型: %s", type(event_payload).__name__
                        )
                        continue

                    if "code" in event_payload and event_payload.get("code") != 0:
                        logger.error(
                            "Coze API 在流中返回错误: %s payload=%s",
                            event_payload.get("msg", "未知错误"),
                            event_payload,
                        )
                        yield AgentEvent(
                            event="error",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "code": event_payload.get("code", "coze_error"),
                                "message": event_payload.get("msg", "Coze 返回错误"),
                                "details": event_payload,
                            },
                        )
                        continue

                    event_type = event_payload.get("event")
                    if event_type is None:
                        # Provide visibility into unexpected payload structures./为意外的负载结构提供可观测性。
                        logger.warning("收到一个没有 'event' 键的 Coze 字典: %s", event_payload)
                        yield AgentEvent(
                            event="unknown",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={"raw": event_payload},
                        )
                        continue

                    coze_event = CozeEvent(event=event_type, data=event_payload)

                    if event_type == "conversation.message.delta":
                        message_data = event_payload.get("message")
                        if (
                            message_data
                            and message_data.get("type") == "answer"
                            and message_data.get("content")
                        ):
                            # Accumulate assistant output for later aggregation./累计助手输出以便后续聚合。
                            content = message_data.get("content", "")
                            content_parts.append(content)
                            yield AgentEvent(
                                event="stream_chunk",
                                conversation_id=conversation_id,
                                user_id=user_id,
                                run_id=run_id,
                                payload={
                                    "messageId": reply_message_id,
                                    "delta": content,
                                    "final": False,
                                },
                            )

                    elif event_type == "done":
                        yield AgentEvent(
                            event="stream_chunk",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "messageId": reply_message_id,
                                "delta": "",
                                "final": True,
                            },
                        )
                        yield AgentEvent(
                            event="run_update",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "runId": run_id,
                                "stepId": "coze.generate",
                                "stepName": "生成回复",
                                "status": "succeeded",
                            },
                        )
                        yield AgentEvent(
                            event="suggestion_chips",
                            conversation_id=conversation_id,
                            user_id=user_id,
                            run_id=run_id,
                            payload={
                                "messageId": reply_message_id,
                                "chips": [
                                    {
                                        "id": "sum",
                                        "label": "总结此页",
                                        "action": {
                                            "type": "send_prompt",
                                            "payload": "总结一下我们刚才的对话",
                                        },
                                    }
                                ],
                            },
                        )
                        break

                    # Emit raw events for auditing or debugging downstream./回放原始事件以便审计或调试。
                    yield AgentEvent(
                        event="coze_event",
                        conversation_id=conversation_id,
                        user_id=user_id,
                        run_id=run_id,
                        payload={"raw": coze_event.model_dump(mode="python")},
                    )
        except httpx.HTTPStatusError as exc:
            body_preview = exc.response.text[:200]
            logger.error(
                "Coze API 返回非 2xx 响应",
                extra={
                    "status_code": exc.response.status_code,
                    "body_preview": body_preview,
                },
                exc_info=exc,
            )
            raise CozeAPIError(
                f"Coze API 返回非 2xx 状态码: {exc.response.status_code}",
                status_code=exc.response.status_code,
            ) from exc
        except httpx.RequestError as exc:
            logger.critical(
                "Coze 网络请求失败",
                extra={"error": str(exc)},
                exc_info=exc,
            )
            raise CozeAPIError("与 Coze API 通讯失败") from exc

        # Emit a completion event even if Coze did not send a final chunk./若 Coze 未自然结束，也需要标记完成。
        if content_parts:
            yield AgentEvent(
                event="stream_result",
                conversation_id=conversation_id,
                user_id=user_id,
                run_id=run_id,
                payload={
                    "messageId": reply_message_id,
                    "content": "".join(content_parts),
                },
            )

    async def stream_chat(self, payload: AgentRunRequest) -> AgentRunResponse:
        """Collect streamed events into a legacy response./兼容旧接口：收集事件并返回汇总结果。"""

        events: List[CozeEvent] = []
        messages: List[Dict[str, Any]] = []
        aggregated_chunks: List[str] = []

        async for event in self.iter_agent_events(payload):
            if event.event == "stream_chunk":
                delta = event.payload.get("delta") or ""
                aggregated_chunks.append(delta)
            elif event.event == "stream_result":
                aggregated_chunks = [event.payload.get("content", "")]
            elif event.event == "error":
                events.append(
                    CozeEvent(event="error", data=event.payload.get("details", {}))
                )
                continue

            events.append(CozeEvent(event=event.event, data=event.payload))

        if aggregated_chunks:
            messages.append(
                {
                    "role": "assistant",
                    "type": "answer",
                    "content": "".join(aggregated_chunks),
                    "content_type": "text",
                }
            )

        request_body = self._build_request_body(payload)

        return AgentRunResponse(
            bot_id=request_body["bot_id"],
            stream=request_body.get("stream", False),
            messages=messages,
            raw_events=events,
        )

    def _build_headers(self) -> Dict[str, str]:
        """组装请求头，包含鉴权信息。"""

        headers = {
            "Content-Type": "application/json",
        }
        
        # [KEY FIX] Ensure ``settings.api_key`` is present./确认 settings.api_key 存在。
        if self._settings.api_key:
            headers["Authorization"] = f"Bearer {self._settings.api_key}"
        else:
            # Log missing credentials to help operators diagnose issues./记录缺失的凭据，帮助运维排查问题。
            logger.error("AGENT_BRIDGE_API_KEY 未设置，请配置后再发起请求。")

        return headers

    def _build_request_body(self, payload: AgentRunRequest) -> Dict[str, Any]:
        """Combine payload and config into Coze v3 JSON./根据上游请求与全局配置拼装 Coze V3 所需 JSON。"""

        workflow_id = payload.workflow_id
        mapped_bot_id: Optional[str] = None
        if not payload.bot_id and workflow_id:
            # Resolve workflow specific bot overrides when configured./如配置了工作流特定 Bot，则优先使用。
            mapped_bot_id = self._settings.workflow_bot_mapping.get(workflow_id)

        bot_id = payload.bot_id or mapped_bot_id or self._settings.bot_id
        stream = payload.stream if payload.stream is not None else self._settings.stream

        # Build the Coze v3 ``additional_messages`` structure./构建 Coze v3 的 ``additional_messages`` 结构。
        messages_list = []

        # (1) Add historical messages when present./(1) 如有历史消息则添加。
        if payload.messages:
            for msg in payload.messages:
                # [FIX] Filter out system messages to prevent context pollution
                if msg.role == "system":
                    continue

                messages_list.append({
                    "content": msg.content,
                    "content_type": "text", 
                    "role": msg.role,
                    "type": "question" if msg.role == "user" else "answer"
                })

        # (2) Include the current query as the most recent user input./(2) 将当前 query 作为最近的用户输入。
        if payload.query:
            messages_list.append({
                "content": payload.query,
                "content_type": "text",
                "role": "user",
                "type": "question"
            })

        parameters: Dict[str, Any] = {}

        if workflow_id:
            parameters["workflow_id"] = workflow_id

        if payload.metadata:
            parameters["metadata"] = payload.metadata

        request_body: Dict[str, Any] = {
            "bot_id": bot_id,
            "user_id": payload.user_id,
            "stream": stream,
            "additional_messages": messages_list,  # V3 structure./V3 结构。
            "parameters": parameters,  # Required in V3 samples./V3 样例需要。
        }

        return request_body


async def stream_chat(
    request: AgentRunRequest, settings: Optional[Settings] = None
) -> AgentRunResponse:
    """Convenience helper to stream chat results and close client./便捷函数：创建客户端、调用并在结束后关闭。"""

    client = CozeClient(settings=settings)
    try:
        return await client.stream_chat(request)
    finally:
        # Ensure network resources are released./确保释放网络资源。
        await client.close()


def agent_event_stream(
    request: AgentRunRequest, settings: Optional[Settings] = None
) -> AsyncIterator[AgentEvent]:
    """Convenience helper returning protocol event iterator./便捷函数：返回协议事件的异步生成器。"""

    client = CozeClient(settings=settings)

    async def _generator() -> AsyncIterator[AgentEvent]:
        try:
            async for event in client.iter_agent_events(request):
                yield event
        finally:
            # Ensure the underlying HTTP client is closed./确保底层 HTTP 客户端被关闭。
            await client.close()

    return _generator()