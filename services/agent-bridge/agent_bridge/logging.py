"""Logging utilities for Agent Bridge./Agent Bridge 的日志工具。"""

from __future__ import annotations

import logging
from typing import Optional

from .config import Settings, get_settings


_LEVEL_ALIASES = {
    "CRITICAL": logging.CRITICAL,
    "ERROR": logging.ERROR,
    "WARNING": logging.WARNING,
    "INFO": logging.INFO,
    "DEBUG": logging.DEBUG,
    "NOTSET": logging.NOTSET,
}


def _resolve_level(value: Optional[str]) -> int:
    """Normalize textual log levels to integers./将日志级别文本标准化为整数值。"""

    if not value:
        return logging.INFO

    normalized = value.strip().upper()
    return _LEVEL_ALIASES.get(normalized, logging.INFO)


def configure_logging(settings: Optional[Settings] = None) -> logging.Logger:
    """Set up global logging based on Settings values./根据设置配置全局日志。
    
    Unified format: <timestamp> [<level>] agent-bridge <component> <message>
    统一格式：<timestamp> [<level>] agent-bridge <component> <message>
    """

    settings = settings or get_settings()
    level = _resolve_level(settings.log_level)
    
    # Unified log format: <timestamp> [<level>] agent-bridge <component> <message>
    # 统一日志格式：<timestamp> [<level>] agent-bridge <component> <message>
    log_format = "%(asctime)s [%(levelname)s] agent-bridge %(name)s %(message)s"
    date_format = "%Y-%m-%dT%H:%M:%S.%fZ"
    
    logging.basicConfig(
        level=level,
        format=log_format,
        datefmt=date_format,
    )
    logging.getLogger().setLevel(level)
    logger = logging.getLogger("agent_bridge")
    # Ensure the dedicated logger inherits the resolved level./确保专用 logger 使用解析后的级别。
    logger.setLevel(level)
    return logger
