"""Configuration helpers for Agent Bridge runtime settings./配置模块：用于加载 Agent Bridge 所需的运行参数。"""

from __future__ import annotations

import os
import logging
from functools import lru_cache
from typing import Dict, Optional

from pydantic import AnyHttpUrl, BaseModel, Field


def _parse_mapping(raw: Optional[str]) -> Dict[str, str]:
    """Turn an ``a:b,c:d`` string into a dictionary./将形如 ``a:b,c:d`` 的环境变量配置解析为字典。"""

    mapping: Dict[str, str] = {}
    if not raw:
        return mapping

    for item in raw.split(","):
        pair = item.strip()
        if not pair or ":" not in pair:
            continue
        workflow, bot = pair.split(":", 1)
        workflow = workflow.strip()
        bot = bot.strip()
        if workflow and bot:
            # Persist only valid workflow/bot mappings./仅保存有效的工作流和 Bot 映射。
            mapping[workflow] = bot
    return mapping


class Settings(BaseModel):
    """Application configuration populated from the environment./项目设置，支持从环境变量加载。"""

    api_base: AnyHttpUrl = Field(
        default="https://api.coze.cn/v3/chat",  # [V3 修复] 指向完整的 chat 路径
        description="Coze Open API 的完整 chat URL (例如 https://api.coze.cn/v3/chat)",
    )
    api_key: Optional[str] = Field(
        default_factory=lambda: os.environ.get("AGENT_BRIDGE_API_KEY"),  # [KEY 修复]
        description="调用 Coze 接口所需的 API Key，必须以 Bearer Token 方式设置。",
    )
    bot_id: str = Field(
        default="7559780859004960831",
        description="默认绑定的 Coze Bot ID，可通过请求覆盖。",
    )
    request_timeout: float = Field(
        default=30.0,
        description="调用 Coze 接口的超时时间（秒）。",
    )
    stream: bool = Field(
        default=True,
        description="是否默认开启 Coze 的流式输出能力。",
    )
    log_level: str = Field(
        default_factory=lambda: os.environ.get("AGENT_BRIDGE_LOG_LEVEL", "INFO"),
        description="服务日志等级，支持 DEBUG/INFO/WARNING/ERROR/CRITICAL。",
    )
    workflow_bot_mapping: Dict[str, str] = Field(
        default_factory=lambda: _parse_mapping(
            os.environ.get("AGENT_BRIDGE_WORKFLOW_BOT_MAPPING")
        ),
        description="workflow ID 到 Bot ID 的映射配置，格式 workflow:bot,workflow2:bot2。",
    )
    workflow_provider_mapping: Dict[str, str] = Field(
        default_factory=lambda: _parse_mapping(
            os.environ.get("AGENT_BRIDGE_WORKFLOW_PROVIDER_MAPPING")
        )
        or {"crisis_public_workflow": "coze"},
        description="workflow ID 到 Provider 名称的映射，用于路由选择。",
    )
    default_provider: str = Field(
        default_factory=lambda: os.environ.get(
            "AGENT_BRIDGE_DEFAULT_PROVIDER", "system_default"
        ),
        description="当无法根据请求选择 Provider 时所使用的默认 Provider 名称。",
    )
    system_prompt: str = Field(
        default_factory=lambda: os.environ.get(
            "AGENT_BRIDGE_SYSTEM_PROMPT", "请选择具体工作流"
        ),
        description="系统默认智能体返回的提示消息。",
    )
    internal_token: Optional[str] = Field(
        default_factory=lambda: os.environ.get("AGENT_BRIDGE_INTERNAL_TOKEN"),
        description="内部服务通信 Token，用于验证来自 site-auth 的请求。",
    )

    class Config:
        """Pydantic configuration for environment loading./Pydantic 配置。"""

        env_file = ".env"
        env_prefix = "AGENT_BRIDGE_"
        populate_by_name = True


logger = logging.getLogger(__name__)


@lru_cache()
def get_settings() -> Settings:
    """Return a cached Settings instance to avoid recomputation./提供 Settings 的单例实例，避免重复解析环境变量。"""

    # Pydantic 2+ BaseModel does not auto-load environment variables by default./Pydantic 2+ BaseModel 默认不加载环境变量。
    # default_factory hooks ensure the values are pulled from os.environ./default_factory 确保从 os.environ 获取值。
    settings = Settings()

    logger.debug(
        "Internal token status: %s",
        "Loaded" if settings.internal_token else "Missing",
    )

    if not settings.api_key:
        logger.error("Coze API Key 缺失，默认智能体功能将不可用")

    logger.info(
        "配置加载完成: base_url=%s 默认 bot_id=%s",
        settings.api_base,
        settings.bot_id,
    )

    return settings

