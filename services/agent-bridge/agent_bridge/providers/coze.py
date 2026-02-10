"""Coze provider implementation."""

from __future__ import annotations

from typing import Any, AsyncIterator

from ..client import CozeClient
from ..config import Settings
from ..models import AgentEvent, AgentRunRequest
from .base import BaseProvider


class CozeProvider(BaseProvider):
    """Provider that routes requests to the Coze API."""

    name = "coze_api"

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__(config)
        self.config = config or {}
        self.bot_id = self.config.get("bot_id")
        self.prompt = self.config.get("prompt", "")

    async def stream(
        self, request: AgentRunRequest, settings: Settings
    ) -> AsyncIterator[AgentEvent]:
        """Stream events from Coze API."""
        # [FIX 1] Settings 是扁平结构，直接访问 api_key，而不是 settings.coze.api_key
        client = CozeClient(settings=settings)

        # [FIX 2] 优先使用 Provider 配置的 bot_id
        if self.bot_id:
            request.bot_id = self.bot_id

        # [FIX 3] 修正字段名：AgentRunRequest 使用 query 而非 input_message
        if self.prompt and request.query:
            request.query = f"{self.prompt}\n\n{request.query}"

        try:
            # [FIX 4] 使用 iter_agent_events 获取流式事件
            # chat_stream 是非流式的一次性接口，且参数签名不同
            async for event in client.iter_agent_events(request):
                yield event
        finally:
            # 确保释放 HTTP 资源
            await client.close()