"""Helpers to load deployment configuration TOML files./部署配置 TOML 文件的加载辅助工具。"""

from __future__ import annotations

import importlib
import importlib.util
import os
from configparser import NoOptionError, NoSectionError
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable


def _import_toml_module():
    """Lazy import tomllib or tomli for TOML parsing./按需导入 tomllib 或 tomli 以解析 TOML。"""
    try:
        import tomllib
        return tomllib
    except ImportError:
        pass
    try:
        import tomli
        return tomli
    except ImportError:
        pass

    raise ModuleNotFoundError(
        "未找到 TOML 解析器。请使用 Python 3.11+ (内置 tomllib) 或先安装 tomli。"
    )


_TOML_MODULE = None


_MISSING = object()


@dataclass
class DeployConfig:
    """Config wrapper exposing subset of ConfigParser APIs./轻量级封装，提供 ConfigParser API 的子集。"""

    _data: Dict[str, Dict[str, Any]]
    path: str

    @staticmethod
    def _stringify(value: Any) -> str:
        """Convert values to strings following ConfigParser behaviour./按 ConfigParser 行为将值转换为字符串。"""

        if isinstance(value, bool):
            return "true" if value else "false"
        return "" if value is None else str(value)

    def get(self, section: str, option: str, fallback: Any = _MISSING) -> str:
        """Read a value while mimicking ConfigParser semantics./读取值并模拟 ConfigParser 的语义。"""

        section_data = self._data.get(section)
        if section_data is None:
            if fallback is not _MISSING:
                return fallback
            raise NoSectionError(section)

        value = section_data.get(option, _MISSING)
        if value is _MISSING:
            if fallback is not _MISSING:
                return fallback
            raise NoOptionError(option, section)
        return self._stringify(value)

    def has_section(self, section: str) -> bool:
        """Check whether a section exists in the config./检查配置中是否存在指定节。"""

        value = self._data.get(section)
        return isinstance(value, dict)

    def has_option(self, section: str, option: str) -> bool:
        """Determine whether an option exists in a section./判断节内是否存在指定项。"""

        return option in self._data.get(section, {})

    def sections(self) -> Iterable[str]:
        """List available sections filtered to dictionaries./列出所有有效的配置节（仅包含字典类型）。"""

        return [key for key in self._data.keys() if self.has_section(key)]


def load_deploy_config(path: str) -> DeployConfig:
    """Load and normalise deploy configuration from TOML file./从 TOML 文件加载并规范化部署配置。"""

    global _TOML_MODULE
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"未找到配置文件: {path}")

    if config_path.suffix.lower() != ".toml":
        raise ValueError("部署配置必须为 TOML 格式 (*.toml)。")

    if _TOML_MODULE is None:
        _TOML_MODULE = _import_toml_module()

    with config_path.open("rb") as handle:
        data = _TOML_MODULE.load(handle)

    normalized: Dict[str, Dict[str, Any]] = {}
    for section, values in data.items():
        if isinstance(values, dict):
            normalized[section] = values
        else:
            normalized[section] = {"value": values}

    return DeployConfig(normalized, os.fspath(config_path))
