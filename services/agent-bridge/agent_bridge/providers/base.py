"""Base interfaces for dynamically configured providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from ..config import Settings
from ..models import AgentEvent, AgentRunRequest


class BaseProvider(ABC):
    """Abstract provider that can stream agent events."""

    name: str

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config: dict[str, Any] = config or {}

    @abstractmethod
    async def stream(
        self, request: AgentRunRequest, settings: Settings
    ) -> AsyncIterator[AgentEvent]:
        """Produce a stream of events for the given request."""

    async def run(
        self, request: AgentRunRequest, settings: Settings
    ) -> list[AgentEvent]:
        """Optional helper to collect stream output eagerly."""

        events = []
        async for event in self.stream(request, settings):
            events.append(event)
        return events
