"""
Test Case Loader Module
测试用例加载模块

Loads JSON/YAML test cases containing prompts and expected result keywords.
从 JSON/YAML 文件加载测试用例（包含 Prompt 和期望结果关键词）。

Reference:
- docs/test/agent-evaluation.md § 4.2 样本格式
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class EvalType(str, Enum):
    """
    Evaluation type enumeration.
    评估类型枚举。

    Reference: docs/test/agent-evaluation.md § 3. 评估分层
    """
    UNIT = "unit"           # Prompt-level unit evaluation
    SCENARIO = "scenario"   # Multi-turn scenario evaluation
    SAFETY = "safety"       # Safety & red-teaming evaluation


@dataclass
class ConversationTurn:
    """
    Single turn in a conversation.
    对话中的单个轮次。
    """
    role: str  # "user" or "agent"
    content: Optional[str] = None
    expected_behavior: Optional[str] = None  # For agent turns


@dataclass
class TestCase:
    """
    Test case data structure.
    测试用例数据结构。

    Reference: docs/test/agent-evaluation.md § 4.2 样本格式
    """
    id: str
    version: int = 1
    eval_type: EvalType = EvalType.UNIT
    product_area: str = "workspace"
    title: str = ""
    tags: list[str] = field(default_factory=list)
    prd_refs: list[str] = field(default_factory=list)
    description: str = ""

    # Conversation flow
    conversation: list[ConversationTurn] = field(default_factory=list)

    # Expected keywords for fuzzy matching
    expected_keywords: list[str] = field(default_factory=list)

    # Keywords that should NOT appear (for safety tests)
    forbidden_keywords: list[str] = field(default_factory=list)

    # Evaluation configuration
    eval_method: str = "llm_judge"  # llm_judge | rule_based | human_only
    rubric_id: str = "RUBRIC-DEFAULT"

    # Timeout for this test case (seconds)
    timeout_seconds: float = 60.0

    # Whether this test must pass for release
    must_pass: bool = False

    # Additional metadata
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def prompt(self) -> str:
        """Get the user prompt from the conversation."""
        for turn in self.conversation:
            if turn.role == "user" and turn.content:
                return turn.content
        return ""

    @property
    def expected_behavior(self) -> Optional[str]:
        """Get the expected agent behavior description."""
        for turn in self.conversation:
            if turn.role == "agent" and turn.expected_behavior:
                return turn.expected_behavior
        return None


class TestCaseLoader:
    """
    Loads test cases from JSON files.
    从 JSON 文件加载测试用例。
    """

    def __init__(self, base_path: Optional[Path] = None):
        """
        Initialize loader with optional base path.

        Args:
            base_path: Base directory for test case files.
        """
        self.base_path = base_path or Path(__file__).parent / "cases"

    def load_file(self, file_path: Path | str) -> list[TestCase]:
        """
        Load test cases from a single JSON file.
        从单个 JSON 文件加载测试用例。

        Args:
            file_path: Path to the JSON file.

        Returns:
            List of TestCase objects.
        """
        path = Path(file_path)
        if not path.is_absolute():
            path = self.base_path / path

        if not path.exists():
            logger.warning(f"Test case file not found: {path}")
            return []

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON file {path}: {e}")
            return []

        return self._parse_test_cases(data)

    def load_directory(
        self,
        directory: Optional[Path | str] = None,
        pattern: str = "*.json",
        recursive: bool = True,
    ) -> list[TestCase]:
        """
        Load all test cases from a directory.
        从目录加载所有测试用例。

        Args:
            directory: Directory path (defaults to base_path).
            pattern: Glob pattern for files.
            recursive: Whether to search recursively.

        Returns:
            List of TestCase objects.
        """
        dir_path = Path(directory) if directory else self.base_path

        if not dir_path.exists():
            logger.warning(f"Test case directory not found: {dir_path}")
            return []

        test_cases: list[TestCase] = []
        glob_method = dir_path.rglob if recursive else dir_path.glob

        for file_path in glob_method(pattern):
            test_cases.extend(self.load_file(file_path))

        logger.info(f"Loaded {len(test_cases)} test cases from {dir_path}")
        return test_cases

    def load_by_type(
        self,
        eval_type: EvalType,
        directory: Optional[Path | str] = None,
    ) -> list[TestCase]:
        """
        Load test cases filtered by evaluation type.
        按评估类型筛选加载测试用例。

        Args:
            eval_type: The evaluation type to filter by.
            directory: Directory path (defaults to base_path).

        Returns:
            List of TestCase objects matching the type.
        """
        all_cases = self.load_directory(directory)
        return [tc for tc in all_cases if tc.eval_type == eval_type]

    def load_by_product_area(
        self,
        product_area: str,
        directory: Optional[Path | str] = None,
    ) -> list[TestCase]:
        """
        Load test cases filtered by product area.
        按产品域筛选加载测试用例。

        Args:
            product_area: Product area (workspace, marketplace, data_insights).
            directory: Directory path (defaults to base_path).

        Returns:
            List of TestCase objects matching the area.
        """
        all_cases = self.load_directory(directory)
        return [tc for tc in all_cases if tc.product_area == product_area]

    def load_must_pass(
        self,
        directory: Optional[Path | str] = None,
    ) -> list[TestCase]:
        """
        Load only test cases marked as must_pass.
        仅加载标记为 must_pass 的测试用例。

        Args:
            directory: Directory path (defaults to base_path).

        Returns:
            List of must-pass TestCase objects.
        """
        all_cases = self.load_directory(directory)
        return [tc for tc in all_cases if tc.must_pass]

    def _parse_test_cases(self, data: Any) -> list[TestCase]:
        """
        Parse raw JSON data into TestCase objects.
        将原始 JSON 数据解析为 TestCase 对象。
        """
        if isinstance(data, dict):
            # Single test case or wrapped in {"test_cases": [...]}
            if "test_cases" in data:
                return self._parse_test_cases(data["test_cases"])
            return [self._parse_single_case(data)]

        if isinstance(data, list):
            return [self._parse_single_case(item) for item in data]

        return []

    def _parse_single_case(self, data: dict[str, Any]) -> TestCase:
        """
        Parse a single test case from dict.
        从字典解析单个测试用例。
        """
        # Parse conversation turns
        conversation: list[ConversationTurn] = []
        raw_conversation = data.get("conversation", [])

        for turn_data in raw_conversation:
            turn = ConversationTurn(
                role=turn_data.get("role", "user"),
                content=turn_data.get("content"),
                expected_behavior=turn_data.get("expected_behavior"),
            )
            conversation.append(turn)

        # Parse eval_type
        eval_type_str = data.get("eval_type", "unit")
        try:
            eval_type = EvalType(eval_type_str)
        except ValueError:
            logger.warning(f"Unknown eval_type '{eval_type_str}', defaulting to UNIT")
            eval_type = EvalType.UNIT

        return TestCase(
            id=data.get("id", "unknown"),
            version=data.get("version", 1),
            eval_type=eval_type,
            product_area=data.get("product_area", "workspace"),
            title=data.get("title", ""),
            tags=data.get("tags", []),
            prd_refs=data.get("prd_refs", []),
            description=data.get("description", ""),
            conversation=conversation,
            expected_keywords=data.get("expected_keywords", []),
            forbidden_keywords=data.get("forbidden_keywords", []),
            eval_method=data.get("eval_method", "llm_judge"),
            rubric_id=data.get("rubric_id", "RUBRIC-DEFAULT"),
            timeout_seconds=data.get("timeout_seconds", 60.0),
            must_pass=data.get("must_pass", False),
            metadata=data.get("metadata", {}),
        )


def load_test_cases(
    path: Path | str,
    eval_type: Optional[EvalType] = None,
    product_area: Optional[str] = None,
) -> list[TestCase]:
    """
    Convenience function to load test cases.
    便捷函数，用于加载测试用例。

    Args:
        path: Path to file or directory.
        eval_type: Optional filter by evaluation type.
        product_area: Optional filter by product area.

    Returns:
        List of TestCase objects.
    """
    loader = TestCaseLoader()
    path = Path(path)

    if path.is_file():
        cases = loader.load_file(path)
    else:
        cases = loader.load_directory(path)

    if eval_type:
        cases = [c for c in cases if c.eval_type == eval_type]

    if product_area:
        cases = [c for c in cases if c.product_area == product_area]

    return cases
