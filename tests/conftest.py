"""
Pytest Configuration for Work-Agent Tests

This conftest.py provides shared fixtures and configurations
for all tests in the tests/ directory.

Reference: docs/test/qa-master-plan.md
"""

import os

import pytest


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers",
        "infrastructure: marks tests as infrastructure tests (database, etc.)"
    )
    config.addinivalue_line(
        "markers",
        "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers",
        "requires_db: marks tests that require a database connection"
    )


@pytest.fixture(scope="session")
def database_url():
    """
    Provide database URL from environment or default.

    This fixture centralizes database URL configuration for all tests.
    """
    default_url = "postgresql://postgres:postgres@localhost:5432/work_agent"
    return os.environ.get("DATABASE_URL", default_url)


@pytest.fixture(scope="session")
def project_root():
    """
    Provide the project root path.

    Useful for locating documentation and configuration files.
    """
    from pathlib import Path
    return Path(__file__).parent.parent
