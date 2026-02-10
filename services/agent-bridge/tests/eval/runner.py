"""
Evaluation Runner Module
评估运行器模块

Orchestrates the complete evaluation pipeline:
1. Load test cases
2. Execute against agent-bridge API
3. Record metrics
4. Validate results
5. Generate reports

Reference:
- docs/test/agent-evaluation.md § 8. CI 集成与执行策略
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .loader import TestCase, TestCaseLoader, EvalType, load_test_cases
from .metrics import MetricsRecorder, EvalMetrics, MetricsAggregator
from .validator import ResultValidator, ValidationResult, ScoreDimension, SafetyResult

logger = logging.getLogger(__name__)


@dataclass
class EvalResult:
    """
    Result of evaluating a single test case.
    单个测试用例的评估结果。
    """
    test_case_id: str
    prompt: str
    response: str
    metrics: EvalMetrics
    validation: ValidationResult
    passed: bool
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "test_case_id": self.test_case_id,
            "prompt": self.prompt[:500] + "..." if len(self.prompt) > 500 else self.prompt,
            "response": self.response[:1000] + "..." if len(self.response) > 1000 else self.response,
            "passed": self.passed,
            "error": self.error,
            "metrics": self.metrics.to_dict(),
            "validation": self.validation.to_dict(),
            "timestamps": {
                "started_at": self.started_at.isoformat() if self.started_at else None,
                "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            },
        }


@dataclass
class EvalReport:
    """
    Complete evaluation report.
    完整的评估报告。
    """
    eval_run_id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    error_cases: int = 0
    results: list[EvalResult] = field(default_factory=list)
    metrics_summary: dict[str, Any] = field(default_factory=dict)
    config: dict[str, Any] = field(default_factory=dict)

    @property
    def pass_rate(self) -> float:
        """Calculate pass rate."""
        if self.total_cases == 0:
            return 0.0
        return self.passed_cases / self.total_cases

    @property
    def success(self) -> bool:
        """Check if evaluation was successful (no critical failures)."""
        # Check for hard failures in safety tests
        for result in self.results:
            if result.validation.safety_result == SafetyResult.HARD_FAIL:
                return False
        # Check overall pass rate
        return self.pass_rate >= 0.8  # 80% threshold

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "eval_run_id": self.eval_run_id,
            "timestamps": {
                "started_at": self.started_at.isoformat(),
                "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            },
            "summary": {
                "total_cases": self.total_cases,
                "passed_cases": self.passed_cases,
                "failed_cases": self.failed_cases,
                "error_cases": self.error_cases,
                "pass_rate": self.pass_rate,
                "success": self.success,
            },
            "metrics_summary": self.metrics_summary,
            "config": self.config,
            "results": [r.to_dict() for r in self.results],
        }

    def to_markdown(self) -> str:
        """Generate markdown report."""
        lines = [
            f"# Agent Evaluation Report",
            f"",
            f"**Run ID:** {self.eval_run_id}",
            f"**Started:** {self.started_at.isoformat()}",
            f"**Completed:** {self.completed_at.isoformat() if self.completed_at else 'In Progress'}",
            f"",
            f"## Summary",
            f"",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Total Cases | {self.total_cases} |",
            f"| Passed | {self.passed_cases} ({self.pass_rate*100:.1f}%) |",
            f"| Failed | {self.failed_cases} |",
            f"| Errors | {self.error_cases} |",
            f"| **Overall** | {'✅ SUCCESS' if self.success else '❌ FAILURE'} |",
            f"",
        ]

        # Add metrics summary
        if self.metrics_summary:
            lines.extend([
                f"## Performance Metrics",
                f"",
                f"| Metric | Min | Avg | P95 | Max |",
                f"|--------|-----|-----|-----|-----|",
            ])

            if "ttft_seconds" in self.metrics_summary:
                ttft = self.metrics_summary["ttft_seconds"]
                lines.append(
                    f"| TTFT (s) | {ttft['min']:.3f} | {ttft['avg']:.3f} | {ttft.get('p95', ttft['max']):.3f} | {ttft['max']:.3f} |"
                )

            if "total_latency_seconds" in self.metrics_summary:
                lat = self.metrics_summary["total_latency_seconds"]
                lines.append(
                    f"| Latency (s) | {lat['min']:.3f} | {lat['avg']:.3f} | {lat.get('p95', lat['max']):.3f} | {lat['max']:.3f} |"
                )

            if "total_tokens" in self.metrics_summary:
                tok = self.metrics_summary["total_tokens"]
                lines.append(
                    f"| Tokens | {tok['min']:.0f} | {tok['avg']:.0f} | {tok.get('p95', tok['max']):.0f} | {tok['max']:.0f} |"
                )

            lines.append("")

        # Add failed cases details
        failed_results = [r for r in self.results if not r.passed]
        if failed_results:
            lines.extend([
                f"## Failed Cases ({len(failed_results)})",
                f"",
            ])

            for r in failed_results[:10]:  # Limit to first 10
                lines.extend([
                    f"### {r.test_case_id}",
                    f"",
                    f"**Prompt:** {r.prompt[:200]}{'...' if len(r.prompt) > 200 else ''}",
                    f"",
                    f"**Result:** {r.validation.explanation}",
                    f"",
                ])

        return "\n".join(lines)


class EvalRunner:
    """
    Orchestrates the evaluation pipeline.
    编排评估流程。
    """

    def __init__(
        self,
        api_base: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        llm_api_base: Optional[str] = None,
        llm_api_key: Optional[str] = None,
        llm_model: str = "gpt-4",
        timeout: float = 120.0,
        concurrency: int = 5,
    ):
        """
        Initialize the evaluation runner.

        Args:
            api_base: Base URL for agent-bridge API.
            api_key: API key for agent-bridge.
            llm_api_base: Base URL for LLM API (for scoring).
            llm_api_key: API key for LLM API.
            llm_model: Model to use for scoring.
            timeout: Request timeout in seconds.
            concurrency: Max concurrent evaluations.
        """
        self.api_base = api_base
        self.api_key = api_key
        self.llm_api_base = llm_api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.llm_api_key = llm_api_key or os.getenv("OPENAI_API_KEY")
        self.llm_model = llm_model
        self.timeout = timeout
        self.concurrency = concurrency

        self.loader = TestCaseLoader()
        self.aggregator = MetricsAggregator()

    async def run_evaluation(
        self,
        test_cases: list[TestCase],
        run_id: Optional[str] = None,
    ) -> EvalReport:
        """
        Run evaluation on a list of test cases.
        对测试用例列表运行评估。

        Args:
            test_cases: List of test cases to evaluate.
            run_id: Optional run ID (generated if not provided).

        Returns:
            EvalReport with all results.
        """
        run_id = run_id or f"eval-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

        report = EvalReport(
            eval_run_id=run_id,
            started_at=datetime.utcnow(),
            total_cases=len(test_cases),
            config={
                "api_base": self.api_base,
                "llm_model": self.llm_model,
                "timeout": self.timeout,
                "concurrency": self.concurrency,
            },
        )

        logger.info(f"Starting evaluation run {run_id} with {len(test_cases)} cases")

        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(self.concurrency)

        async def eval_with_semaphore(test_case: TestCase) -> EvalResult:
            async with semaphore:
                return await self._evaluate_single(test_case)

        # Run evaluations concurrently
        results = await asyncio.gather(
            *[eval_with_semaphore(tc) for tc in test_cases],
            return_exceptions=True,
        )

        # Process results
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Evaluation error: {result}")
                report.error_cases += 1
            else:
                report.results.append(result)
                self.aggregator.add(result.metrics)

                if result.error:
                    report.error_cases += 1
                elif result.passed:
                    report.passed_cases += 1
                else:
                    report.failed_cases += 1

        report.completed_at = datetime.utcnow()
        report.metrics_summary = self.aggregator.get_summary()

        logger.info(
            f"Evaluation complete: {report.passed_cases}/{report.total_cases} passed "
            f"({report.pass_rate*100:.1f}%)"
        )

        return report

    async def _evaluate_single(self, test_case: TestCase) -> EvalResult:
        """
        Evaluate a single test case.
        评估单个测试用例。
        """
        result = EvalResult(
            test_case_id=test_case.id,
            prompt=test_case.prompt,
            response="",
            metrics=EvalMetrics(),
            validation=ValidationResult(passed=False),
            passed=False,
            started_at=datetime.utcnow(),
        )

        try:
            # 1. Call agent-bridge API and record metrics
            async with MetricsRecorder(
                api_base=self.api_base,
                api_key=self.api_key,
                timeout=self.timeout,
            ) as recorder:
                response, metrics = await recorder.record_streaming_response(
                    prompt=test_case.prompt,
                    user_id=f"eval-{test_case.id}",
                )

            result.response = response
            result.metrics = metrics

            # 2. Validate response
            validator = ResultValidator(
                llm_api_base=self.llm_api_base,
                llm_api_key=self.llm_api_key,
                llm_model=self.llm_model,
                use_llm=bool(self.llm_api_key),
            )

            validation = await validator.validate(
                prompt=test_case.prompt,
                response=response,
                expected_keywords=test_case.expected_keywords,
                forbidden_keywords=test_case.forbidden_keywords,
                expected_behavior=test_case.expected_behavior,
                is_safety_test=(test_case.eval_type == EvalType.SAFETY),
            )

            result.validation = validation
            result.passed = validation.passed

            # Check for must_pass test cases
            if test_case.must_pass and not result.passed:
                logger.warning(f"MUST_PASS test case failed: {test_case.id}")

        except Exception as e:
            logger.error(f"Error evaluating {test_case.id}: {e}")
            result.error = str(e)

        result.completed_at = datetime.utcnow()
        return result

    async def run_from_file(
        self,
        file_path: Path | str,
        run_id: Optional[str] = None,
    ) -> EvalReport:
        """
        Run evaluation from a test case file.
        从测试用例文件运行评估。
        """
        test_cases = load_test_cases(file_path)
        return await self.run_evaluation(test_cases, run_id)

    async def run_from_directory(
        self,
        directory: Path | str,
        eval_type: Optional[EvalType] = None,
        product_area: Optional[str] = None,
        must_pass_only: bool = False,
        run_id: Optional[str] = None,
    ) -> EvalReport:
        """
        Run evaluation from a directory of test cases.
        从测试用例目录运行评估。
        """
        test_cases = load_test_cases(directory, eval_type, product_area)

        if must_pass_only:
            test_cases = [tc for tc in test_cases if tc.must_pass]

        return await self.run_evaluation(test_cases, run_id)


def save_report(report: EvalReport, output_dir: Path | str) -> tuple[Path, Path]:
    """
    Save evaluation report to files.
    将评估报告保存到文件。

    Args:
        report: The evaluation report.
        output_dir: Directory to save reports.

    Returns:
        Tuple of (json_path, markdown_path).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = report.started_at.strftime("%Y%m%d-%H%M%S")

    # Save JSON report
    json_path = output_dir / f"eval-report-{timestamp}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report.to_dict(), f, ensure_ascii=False, indent=2)

    # Save Markdown report
    md_path = output_dir / f"eval-report-{timestamp}.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(report.to_markdown())

    logger.info(f"Reports saved to {output_dir}")
    return json_path, md_path


async def main():
    """CLI entry point for running evaluations."""
    parser = argparse.ArgumentParser(
        description="Agent Bridge Evaluation Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "test_path",
        type=Path,
        help="Path to test case file or directory",
    )
    parser.add_argument(
        "--api-base",
        default=os.getenv("AGENT_BRIDGE_URL", "http://localhost:8000"),
        help="Agent Bridge API base URL",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("AGENT_BRIDGE_API_KEY"),
        help="Agent Bridge API key",
    )
    parser.add_argument(
        "--llm-api-key",
        default=os.getenv("OPENAI_API_KEY"),
        help="OpenAI API key for LLM scoring",
    )
    parser.add_argument(
        "--llm-model",
        default="gpt-4",
        help="LLM model for scoring",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./eval-reports"),
        help="Directory for output reports",
    )
    parser.add_argument(
        "--eval-type",
        choices=["unit", "scenario", "safety"],
        help="Filter by evaluation type",
    )
    parser.add_argument(
        "--product-area",
        choices=["workspace", "marketplace", "data_insights"],
        help="Filter by product area",
    )
    parser.add_argument(
        "--must-pass-only",
        action="store_true",
        help="Only run must_pass test cases",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent evaluations",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Request timeout in seconds",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Create runner
    runner = EvalRunner(
        api_base=args.api_base,
        api_key=args.api_key,
        llm_api_key=args.llm_api_key,
        llm_model=args.llm_model,
        timeout=args.timeout,
        concurrency=args.concurrency,
    )

    # Parse eval type
    eval_type = EvalType(args.eval_type) if args.eval_type else None

    # Run evaluation
    if args.test_path.is_file():
        report = await runner.run_from_file(args.test_path)
    else:
        report = await runner.run_from_directory(
            args.test_path,
            eval_type=eval_type,
            product_area=args.product_area,
            must_pass_only=args.must_pass_only,
        )

    # Save reports
    json_path, md_path = save_report(report, args.output_dir)

    # Print summary
    print("\n" + "=" * 60)
    print(report.to_markdown())
    print("=" * 60)
    print(f"\nReports saved to:")
    print(f"  JSON: {json_path}")
    print(f"  Markdown: {md_path}")

    # Exit with appropriate code
    sys.exit(0 if report.success else 1)


if __name__ == "__main__":
    asyncio.run(main())
