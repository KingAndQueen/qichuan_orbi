"""
Agent Evaluation Framework - Package Initialization
Agent 评估框架 - 包初始化

This package provides automated evaluation tools for the Agent Bridge service,
including test case loading, metrics recording, and result validation.

Reference:
- docs/test/agent-evaluation.md
- docs/technical/protocols/interaction-protocol.md
"""

from .loader import TestCaseLoader, TestCase, EvalType
from .metrics import MetricsRecorder, EvalMetrics
from .validator import ResultValidator, EvalScore, ScoreDimension
from .runner import EvalRunner, EvalResult, EvalReport

__all__ = [
    # Loader
    "TestCaseLoader",
    "TestCase",
    "EvalType",
    # Metrics
    "MetricsRecorder",
    "EvalMetrics",
    # Validator
    "ResultValidator",
    "EvalScore",
    "ScoreDimension",
    # Runner
    "EvalRunner",
    "EvalResult",
    "EvalReport",
]

__version__ = "0.1.0"
