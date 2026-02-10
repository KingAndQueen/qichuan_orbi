"""System provider rendering prompts from workflow configuration."""

from __future__ import annotations

import uuid
import logging
from typing import Any, AsyncIterator

from jinja2 import Template

from ..config import Settings
from ..models import AgentEvent, AgentRunRequest
from .base import BaseProvider

logger = logging.getLogger(__name__)

class SystemProvider(BaseProvider):
    """Render prompt via Jinja2 and emit it as SSE-like events."""

    name = "system_native"

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.prompt = (config or {}).get("prompt", "")

    async def stream(
        self, request: AgentRunRequest, settings: Settings
    ) -> AsyncIterator[AgentEvent]:
        message_id = request.reply_message_id or f"system-{uuid.uuid4().hex}"
        
        # 1. 渲染模版逻辑 (保持原样)
        try:
            metadata = getattr(request, "metadata", {}) or {}
            rendered = Template(self.prompt).render(
                request=request.model_dump(), metadata=metadata
            )
        except Exception as e:
            logger.error(f"Prompt rendering failed: {e}")
            rendered = f"System Error: Failed to render prompt. ({e})"

        # 2. 发送开始信号 (保持原样)
        yield AgentEvent(
            event="run_update",
            conversation_id=request.conversation_id,
            user_id=request.user_id,
            run_id=request.run_id,
            payload={
                "runId": request.run_id,
                "stepId": "system.prepare",
                "stepName": "准备中",
                "status": "running",
            },
        )

        # 3. 发送内容 (保持原样)
        yield AgentEvent(
            event="stream_chunk",
            conversation_id=request.conversation_id,
            user_id=request.user_id,
            run_id=request.run_id,
            payload={
                "messageId": message_id,
                "delta": rendered,
                "final": True,
            },
        )
        yield AgentEvent(
            event="stream_result",
            conversation_id=request.conversation_id,
            user_id=request.user_id,
            run_id=request.run_id,
            payload={
                "messageId": message_id,
                "content": rendered,
            },
        )

        # [FIX] 4. 关键修复：发送结束信号
        # 告诉前端这次运行已经成功完成，可以停止 Loading 动画了
        yield AgentEvent(
            event="run_update",
            conversation_id=request.conversation_id,
            user_id=request.user_id,
            run_id=request.run_id,
            payload={
                "runId": request.run_id,
                "stepId": "system.finish",
                "stepName": "完成",
                "status": "succeeded", 
            },
        )

# Backwards compatibility alias
SystemMessageProvider = SystemProvider