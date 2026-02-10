"""Routing layer that resolves workflow templates and streams events."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, Type

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from sse_starlette.sse import EventSourceResponse

from .config import Settings, get_settings
from .dependencies import verify_token
from .models import AgentRunRequest
from .providers.coze import CozeProvider
from .providers.system import SystemProvider
from .providers.base import BaseProvider
from .utils.db import get_db_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/agent")


ProviderRegistry: Dict[str, Type[BaseProvider]] = {
    "system_native": SystemProvider,
    "coze": CozeProvider,
}


async def _fetch_template(
    pool: asyncpg.Pool, workflow_id: str | None
) -> Dict[str, Any]:
    if not workflow_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    query = "SELECT meta, is_public FROM workflow_templates WHERE id = $1"
    try:
        record = await pool.fetchrow(query, workflow_id)
    except Exception as exc:  # pragma: no cover - infrastructure issues
        logger.exception("Database query failed", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    data = dict(record)
    meta = data.get("meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}

    return {"meta": meta, "is_public": data.get("is_public")}


def _build_provider(template_meta: Dict[str, Any]) -> BaseProvider:
    execution = template_meta.get("execution", {}) if template_meta else {}
    provider_name = execution.get("provider")
    config = execution.get("config", {}) or {}

    provider_cls = ProviderRegistry.get(provider_name)
    if provider_cls is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)

    return provider_cls(config)


async def _event_iterator(
    provider: BaseProvider, request: AgentRunRequest, settings: Settings
) -> AsyncIterator[dict[str, str]]:
    async for event in provider.stream(request, settings):
        yield {
            "event": event.event,
            "data": json.dumps(
                event.model_dump(by_alias=True, mode="json"), ensure_ascii=False
            ),
        }


@router.post("/runs/stream")
async def stream_runs(
    request: AgentRunRequest | None = None,
    _: str = Depends(verify_token),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> EventSourceResponse:
    """Stream events from a provider built via workflow template metadata."""

    if request is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)

    template = await _fetch_template(pool, request.workflow_id)
    provider = _build_provider(template.get("meta", {}))

    return EventSourceResponse(_event_iterator(provider, request, settings))
