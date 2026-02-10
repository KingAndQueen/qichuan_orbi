"""Pydantic 数据模型定义。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from pydantic import BaseModel, Field, field_validator


class Message(BaseModel):
    """描述一条用户或系统消息。"""
    role: str = Field(description="消息角色，如 user、assistant 或 system")
    content: str = Field(description="消息正文内容")


class AgentRunRequest(BaseModel):
    """创建 Coze 对话所需的入参。"""
    user_id: str | None = Field(default=None, description="调用方为用户生成的唯一 ID")
    query: Optional[str] = Field(default=None)
    messages: List[Message] = Field(default_factory=list)
    bot_id: Optional[str] = Field(default=None)
    stream: Optional[bool] = Field(default=None)
    conversation_id: Optional[str] = Field(default=None)
    run_id: Optional[str] = Field(default=None)
    reply_message_id: Optional[str] = Field(default=None)
    workflow_id: Optional[str] = Field(default=None)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("metadata", mode="before")
    @classmethod
    def _ensure_metadata_dict(cls, value: Any) -> Dict[str, Any]:
        if value is None:
            return {}
        return value


class CozeEvent(BaseModel):
    """封装从 Coze 流式接口中解析出的事件。"""
    event: str
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(
        # [FIX] 使用 timezone-aware UTC 时间
        default_factory=lambda: datetime.now(timezone.utc)
    )


class AgentRunResponse(BaseModel):
    """将 Coze 结果汇总后返回给上游。"""
    bot_id: str
    stream: bool
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    raw_events: List[CozeEvent] = Field(default_factory=list)


class AgentEvent(BaseModel):
    """面向 Go 网关/前端的统一事件包络。"""
    event: str
    version: str = "2.0"
    ts: datetime = Field(
        # [FIX] 使用 timezone-aware UTC 时间
        default_factory=lambda: datetime.now(timezone.utc)
    )
    conversation_id: Optional[str] = Field(default=None, alias="conversationId")
    user_id: Optional[str] = Field(default=None, alias="userId")
    run_id: Optional[str] = Field(default=None, alias="runId")
    payload: Dict[str, Any] = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,
        "alias_generator": lambda s: s,
    }


def flatten_messages(messages: Iterable[Message]) -> str:
    parts: List[str] = []
    for item in messages:
        parts.append(f"{item.role}: {item.content}")
    return "\n".join(parts)