"""
Database Schema Consistency Test Suite

This module validates that the actual database schema matches the expected
schema defined as a static constant (Source of Truth for tests).

The expected schema is derived from: docs/technical/data/database-design.md
Last synced: 2026-02-02

Reference:
- Design Doc: docs/technical/data/database-design.md
- Test Spec: docs/test/backend-testing.md
- QA Master: docs/test/qa-master-plan.md
"""

import os
import re
from typing import NamedTuple

import pytest


# =============================================================================
# EXPECTED SCHEMA DEFINITION (Source of Truth)
# =============================================================================
# This schema is manually transcribed from docs/technical/data/database-design.md
# When the design document changes, update this dictionary accordingly.
#
# Format: {"table_name": ["column1", "column2", ...]}
# =============================================================================

EXPECTED_SCHEMA: dict[str, list[str]] = {
    # =========================================================================
    # Section 3.1: Identity & Master Account Isolation Module
    # =========================================================================
    "master_accounts": [
        "id",
        "name",
        "slug",
        "plan_tier",
        "created_at",
    ],
    "master_account_quotas": [
        "id",
        "master_account_id",
        "resource_type",
        "limit_value",
        "used_value",
        "reset_period",
        "last_reset_at",
        "updated_at",
    ],
    "employee_accounts": [
        "id",
        "email",
        "password_hash",
        "full_name",
        "avatar_url",
        "settings",
        "is_password_reset_required",
        "last_active_master_account_id",
        "created_at",
    ],
    "sub_accounts": [
        "id",
        "master_account_id",
        "name",
        "created_at",
    ],
    "employee_sub_account_bindings": [
        "id",
        "master_account_id",
        "employee_account_id",
        "sub_account_id",
        "role",
        "status",
        "created_at",
    ],
    "invitations": [
        "token",
        "master_account_id",
        "email",
        "role",
        "inviter_employee_account_id",
        "status",
        "expires_at",
        "created_at",
    ],
    "system_audit_logs": [
        "id",
        "master_account_id",
        "actor_employee_account_id",
        "action",
        "target_resource",
        "changes",
        "ip_address",
        "created_at",
    ],

    # =========================================================================
    # Section 3.2: Assets & Licensing Module
    # =========================================================================
    "workflow_templates": [
        "id",
        "slug",
        "name",
        "description",
        "avatar_url",
        "provider",
        "is_public",
        "price_per_seat",
        "category",
        "tags",
        "rating_avg",
        "rating_count",
        "meta",
        "io_schema",
        "created_at",
    ],
    "reviews": [
        "id",
        "workflow_template_id",
        "employee_account_id",
        "rating",
        "comment",
        "created_at",
    ],
    "subscriptions": [
        "id",
        "master_account_id",
        "provider",
        "external_id",
        "external_customer_id",
        "status",
        "collection_method",
        "current_period_start",
        "current_period_end",
        "cancel_at_period_end",
        "cancel_at",
        "canceled_at",
        "raw_payload",
        "created_at",
        "updated_at",
    ],
    "seat_pools": [
        "id",
        "master_account_id",
        "total_seats",
        "updated_at",
    ],
    "workflow_plans": [
        "id",
        "workflow_template_id",
        "plan_code",
        "pricing_meta",
        "created_at",
    ],
    "subscription_instances": [
        "id",
        "master_account_id",
        "workflow_plan_id",
        "subscription_id",
        "status",
        "started_at",
        "ended_at",
        "created_at",
    ],
    "entitlements": [
        "id",
        "master_account_id",
        "subscription_instance_id",
        "resource_type",
        "limit_value",
        "period",
        "status",
        "created_at",
    ],
    "entitlement_assignments": [
        "id",
        "master_account_id",
        "entitlement_id",
        "scope",
        "sub_account_id",
        "assigned_value",
        "status",
        "created_at",
    ],
    "workflow_authorization_toggles": [
        "id",
        "master_account_id",
        "sub_account_id",
        "workflow_plan_id",
        "is_enabled",
        "updated_at",
    ],

    # =========================================================================
    # Section 3.3: Core Interaction Module
    # =========================================================================
    "conversations": [
        "id",
        "master_account_id",
        "sub_account_id",
        "employee_account_id",
        "workflow_template_id",
        "title",
        "mode",
        "visibility",
        "last_message_at",
        "archived_at",
        "created_at",
    ],
    "messages": [
        "id",
        "master_account_id",
        "sub_account_id",
        "conversation_id",
        "role",
        "content",
        "ui_intent",
        "metadata",
        "feedback",
        "safety_status",
        "safety_reasons",
        "pinned_at",
        "created_at",
    ],
    "files": [
        "id",
        "master_account_id",
        "sub_account_id",
        "uploader_employee_account_id",
        "conversation_id",
        "filename",
        "storage_key",
        "mime_type",
        "size_bytes",
        "status",
        "created_at",
    ],
    "notifications": [
        "id",
        "master_account_id",
        "employee_account_id",
        "type",
        "data",
        "is_read",
        "created_at",
    ],
    "editor_snapshots": [
        "id",
        "master_account_id",
        "sub_account_id",
        "conversation_id",
        "version",
        "content",
        "patch",
        "modified_by",
        "created_at",
    ],
    "work_sessions": [
        "id",
        "master_account_id",
        "sub_account_id",
        "employee_account_id",
        "status",
        "created_at",
        "archived_at",
    ],
    "processes": [
        "id",
        "master_account_id",
        "sub_account_id",
        "work_session_id",
        "type",
        "status",
        "created_at",
        "finished_at",
    ],

    # =========================================================================
    # Section 3.4: Analytics & Audit Module
    # =========================================================================
    "workflow_runs": [
        "id",
        "master_account_id",
        "sub_account_id",
        "work_session_id",
        "process_id",
        "employee_account_id",
        "workflow_template_id",
        "workflow_plan_id",
        "subscription_instance_id",
        "status",
        "duration_ms",
        "time_saved_seconds",
        "cost_usd",
        "usage_metrics",
        "error_message",
        "inputs",
        "outputs",
        "workflow_snapshot",
        "created_at",
        "finished_at",
    ],
    "async_tasks": [
        "id",
        "job_id",
        "master_account_id",
        "created_by",
        "type",
        "status",
        "progress",
        "payload",
        "result",
        "error",
        "created_at",
        "started_at",
        "finished_at",
    ],
    "analytics_daily_usage": [
        "id",
        "master_account_id",
        "sub_account_id",
        "workflow_template_id",
        "date",
        "total_runs",
        "total_duration_seconds",
        "estimated_time_saved",
        "total_cost_usd",
    ],
    "receipts": [
        "id",
        "master_account_id",
        "sub_account_id",
        "job_id",
        "workflow_run_id",
        "trace_id",
        "status",
        "reason_code",
        "result_summary",
        "metering_hint",
        "created_at",
    ],
    "audit_events": [
        "id",
        "master_account_id",
        "sub_account_id",
        "actor_principal_id",
        "action",
        "target_resource",
        "decision",
        "policy_ref",
        "trace_id",
        "receipt_id",
        "created_at",
    ],
    "metering_events": [
        "id",
        "master_account_id",
        "sub_account_id",
        "subscription_instance_id",
        "resource_type",
        "quantity",
        "trace_id",
        "receipt_id",
        "created_at",
    ],

    # =========================================================================
    # Section 3.5: Ontology / SOR (Semantic Object Registry)
    # =========================================================================
    "sor_object_types": [
        "id",
        "master_account_id",
        "type_key",
        "version",
        "status",
        "schema",
        "etag",
        "created_by",
        "created_at",
    ],
    "sor_action_types": [
        "id",
        "master_account_id",
        "action_key",
        "version",
        "status",
        "input_schema",
        "output_schema",
        "side_effect_profile_key",
        "etag",
        "created_by",
        "created_at",
    ],
    "sor_link_types": [
        "id",
        "master_account_id",
        "link_key",
        "version",
        "status",
        "src_type_key",
        "dst_type_key",
        "cardinality",
        "edge_schema",
        "etag",
        "created_by",
        "created_at",
    ],
    "sor_side_effect_profiles": [
        "id",
        "master_account_id",
        "profile_key",
        "risk_level",
        "requires_human_review",
        "requires_idempotency_key",
        "obligations",
        "created_by",
        "created_at",
    ],

    # =========================================================================
    # Section 3.6: Infrastructure Module
    # =========================================================================
    "sessions": [
        "token",
        "employee_account_id",
        "master_account_id",
        "data",
        "expires_at",
        "created_at",
    ],
    "system_locks": [
        "key",
        "holder_id",
        "expires_at",
        "created_at",
    ],
}


# =============================================================================
# Data Structures
# =============================================================================

class SchemaDiscrepancy(NamedTuple):
    """Represents a discrepancy between expected and actual schema."""
    table_name: str
    discrepancy_type: str  # 'missing_table' or 'missing_column'
    column_name: str | None = None


# =============================================================================
# Database Inspector
# =============================================================================

def get_database_url() -> str:
    """
    Get database connection URL from environment or use default.

    Priority:
        1. DATABASE_URL environment variable
        2. Default local development URL

    Returns:
        PostgreSQL connection URL
    """
    default_url = "postgresql://postgres:postgres@localhost:5432/work_agent"
    return os.environ.get("DATABASE_URL", default_url)


def get_actual_schema_from_database() -> dict[str, list[str]]:
    """
    Query the database to get actual table and column information.

    Uses information_schema.columns to retrieve the current database structure.

    Returns:
        Dictionary mapping table names to lists of column names

    Raises:
        ConnectionError: If unable to connect to the database
    """
    try:
        import psycopg2
    except ImportError:
        pytest.skip("psycopg2 not installed. Install with: pip install psycopg2-binary")

    db_url = get_database_url()

    # Parse connection URL for psycopg2
    # Format: postgresql://user:password@host:port/database
    url_pattern = re.compile(
        r"postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)"
    )
    match = url_pattern.match(db_url)

    if not match:
        raise ValueError(f"Invalid DATABASE_URL format: {db_url}")

    user, password, host, port, database = match.groups()

    try:
        conn = psycopg2.connect(
            host=host,
            port=int(port),
            database=database,
            user=user,
            password=password,
            connect_timeout=10
        )
    except psycopg2.OperationalError as e:
        raise ConnectionError(
            f"Failed to connect to database at {host}:{port}/{database}. "
            f"Error: {e}. "
            f"Ensure the database is running and accessible."
        ) from e

    try:
        cursor = conn.cursor()

        # Query information_schema for all tables and columns in public schema
        query = """
            SELECT
                table_name,
                column_name
            FROM
                information_schema.columns
            WHERE
                table_schema = 'public'
            ORDER BY
                table_name,
                ordinal_position
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        # Build schema dictionary
        schema: dict[str, list[str]] = {}
        for table_name, column_name in rows:
            table_name_lower = table_name.lower()
            column_name_lower = column_name.lower()

            if table_name_lower not in schema:
                schema[table_name_lower] = []

            schema[table_name_lower].append(column_name_lower)

        return schema

    finally:
        cursor.close()
        conn.close()


# =============================================================================
# Schema Comparison Utilities
# =============================================================================

def find_missing_tables(
    expected: dict[str, list[str]],
    actual: dict[str, list[str]]
) -> list[str]:
    """
    Find tables that are expected but missing from the actual schema.

    Args:
        expected: Expected schema (from EXPECTED_SCHEMA constant)
        actual: Actual schema (from database)

    Returns:
        List of missing table names
    """
    expected_tables = set(expected.keys())
    actual_tables = set(actual.keys())
    return sorted(expected_tables - actual_tables)


def find_missing_columns(
    expected: dict[str, list[str]],
    actual: dict[str, list[str]]
) -> list[tuple[str, str]]:
    """
    Find columns that are expected but missing from the actual schema.

    Args:
        expected: Expected schema (from EXPECTED_SCHEMA constant)
        actual: Actual schema (from database)

    Returns:
        List of (table_name, column_name) tuples for missing columns
    """
    missing: list[tuple[str, str]] = []

    for table_name, expected_columns in expected.items():
        if table_name not in actual:
            # Table is missing entirely, skip column check
            continue

        actual_columns = set(actual[table_name])
        for column_name in expected_columns:
            if column_name not in actual_columns:
                missing.append((table_name, column_name))

    return sorted(missing)


def format_error_report(
    missing_tables: list[str],
    missing_columns: list[tuple[str, str]]
) -> str:
    """
    Format a comprehensive error report for schema discrepancies.

    Args:
        missing_tables: List of missing table names
        missing_columns: List of (table, column) tuples for missing columns

    Returns:
        Formatted error message string
    """
    lines = [
        "",
        "=" * 70,
        "SCHEMA CONSISTENCY CHECK FAILED",
        "=" * 70,
    ]

    total_issues = len(missing_tables) + len(missing_columns)
    lines.append(f"Found {total_issues} discrepancy(ies):")
    lines.append("")

    if missing_tables:
        lines.append(f"MISSING TABLES ({len(missing_tables)}):")
        for table in missing_tables:
            lines.append(f"  - {table}")
        lines.append("")

    if missing_columns:
        lines.append(f"MISSING COLUMNS ({len(missing_columns)}):")
        # Group by table for readability
        by_table: dict[str, list[str]] = {}
        for table, column in missing_columns:
            if table not in by_table:
                by_table[table] = []
            by_table[table].append(column)

        for table in sorted(by_table.keys()):
            columns = by_table[table]
            lines.append(f"  [{table}]")
            for col in columns:
                lines.append(f"    - {col}")
        lines.append("")

    lines.extend([
        "=" * 70,
        "ACTION REQUIRED:",
        "  1. Run migrations to create missing tables/columns, OR",
        "  2. Update EXPECTED_SCHEMA in this test file if schema changed intentionally",
        "=" * 70,
    ])

    return "\n".join(lines)


# =============================================================================
# Test Cases
# =============================================================================

class TestDatabaseSchemaConsistency:
    """
    Test suite for validating database schema consistency.

    These tests ensure that the database implementation matches
    the expected schema defined in EXPECTED_SCHEMA.

    Reference: docs/test/backend-testing.md - Section 3 (Test Layers)
    """

    @pytest.fixture(scope="class")
    def actual_schema(self) -> dict[str, list[str]]:
        """Load the actual schema from database."""
        return get_actual_schema_from_database()

    def test_expected_schema_is_defined(self):
        """
        Verify that EXPECTED_SCHEMA constant is properly defined.

        Arrange: Access EXPECTED_SCHEMA constant
        Act: Check if it contains expected core tables
        Assert: Core tables should be present
        """
        # Arrange & Act
        table_count = len(EXPECTED_SCHEMA)

        # Assert - sanity check that schema is properly defined
        assert table_count >= 30, (
            f"EXPECTED_SCHEMA seems incomplete. Found only {table_count} tables, "
            "expected at least 30 based on database-design.md"
        )

        # Verify core tables are defined
        core_tables = [
            "master_accounts",
            "employee_accounts",
            "sub_accounts",
            "conversations",
            "messages",
            "workflow_runs",
            "subscriptions",
        ]

        for table in core_tables:
            assert table in EXPECTED_SCHEMA, (
                f"Core table '{table}' missing from EXPECTED_SCHEMA. "
                "Please update the schema definition."
            )

    def test_tables_exist(self, actual_schema: dict[str, list[str]]):
        """
        [INFRA-DB-001] Verify all expected tables exist in the database.

        This test checks that every table defined in EXPECTED_SCHEMA
        exists in the actual database. All missing tables are reported
        at once (soft assertion pattern).

        Arrange: Load actual schema from database
        Act: Compare against EXPECTED_SCHEMA
        Assert: All expected tables should exist
        """
        # Act
        missing_tables = find_missing_tables(EXPECTED_SCHEMA, actual_schema)

        # Assert - report all missing tables at once
        if missing_tables:
            error_lines = [
                "",
                f"MISSING TABLES ({len(missing_tables)}):",
                "The following tables are defined in EXPECTED_SCHEMA but not in database:",
                "",
            ]
            for table in missing_tables:
                columns = EXPECTED_SCHEMA[table]
                error_lines.append(f"  - {table} ({len(columns)} columns)")

            error_lines.extend([
                "",
                "Run migrations or update EXPECTED_SCHEMA to fix this.",
            ])

            pytest.fail("\n".join(error_lines))

    def test_columns_exist(self, actual_schema: dict[str, list[str]]):
        """
        [INFRA-DB-002] Verify all expected columns exist in their tables.

        This test checks that every column defined in EXPECTED_SCHEMA
        exists in the corresponding database table. All missing columns
        are reported at once (soft assertion pattern).

        Arrange: Load actual schema from database
        Act: Compare columns against EXPECTED_SCHEMA
        Assert: All expected columns should exist
        """
        # Act
        missing_columns = find_missing_columns(EXPECTED_SCHEMA, actual_schema)

        # Assert - report all missing columns at once
        if missing_columns:
            # Group by table for readable output
            by_table: dict[str, list[str]] = {}
            for table, column in missing_columns:
                if table not in by_table:
                    by_table[table] = []
                by_table[table].append(column)

            error_lines = [
                "",
                f"MISSING COLUMNS ({len(missing_columns)} total):",
                "",
            ]

            for table in sorted(by_table.keys()):
                columns = by_table[table]
                error_lines.append(f"  Table: {table}")
                for col in columns:
                    error_lines.append(f"    - {col}")
                error_lines.append("")

            error_lines.append("Run migrations or update EXPECTED_SCHEMA to fix this.")

            pytest.fail("\n".join(error_lines))

    def test_schema_matches_expected(self, actual_schema: dict[str, list[str]]):
        """
        [INFRA-DB-003] Comprehensive schema consistency check.

        This is the main consistency test that validates both tables
        and columns exist. It provides a complete error report with
        all discrepancies found.

        Arrange: Load actual schema from database
        Act: Find all missing tables and columns
        Assert: No discrepancies should exist
        """
        # Act
        missing_tables = find_missing_tables(EXPECTED_SCHEMA, actual_schema)
        missing_columns = find_missing_columns(EXPECTED_SCHEMA, actual_schema)

        # Assert
        if missing_tables or missing_columns:
            pytest.fail(format_error_report(missing_tables, missing_columns))

    def test_critical_isolation_columns(self, actual_schema: dict[str, list[str]]):
        """
        [INFRA-DB-004] Verify critical data isolation columns exist.

        This test focuses on the mandatory invariant from database-design.md
        Section 4.1: all business tables must have master_account_id for
        data isolation (RLS).

        Arrange: Define tables that require isolation columns
        Act: Check each table has required columns
        Assert: All isolation columns should exist
        """
        # Tables that MUST have master_account_id per Section 4.1
        # (excludes employee_accounts and platform-level tables like workflow_templates)
        isolation_required_tables = [
            "master_account_quotas",
            "sub_accounts",
            "employee_sub_account_bindings",
            "invitations",
            "system_audit_logs",
            "subscriptions",
            "seat_pools",
            "subscription_instances",
            "entitlements",
            "entitlement_assignments",
            "workflow_authorization_toggles",
            "conversations",
            "messages",
            "files",
            "notifications",
            "editor_snapshots",
            "work_sessions",
            "processes",
            "workflow_runs",
            "async_tasks",
            "analytics_daily_usage",
            "receipts",
            "audit_events",
            "metering_events",
            "sor_object_types",
            "sor_action_types",
            "sor_link_types",
            "sor_side_effect_profiles",
            "sessions",
        ]

        missing_isolation: list[str] = []

        for table in isolation_required_tables:
            if table not in actual_schema:
                missing_isolation.append(f"{table} (table missing)")
            elif "master_account_id" not in actual_schema[table]:
                missing_isolation.append(f"{table}.master_account_id")

        if missing_isolation:
            error_lines = [
                "",
                "CRITICAL: Data Isolation Columns Missing",
                "Per database-design.md Section 4.1, these tables require master_account_id:",
                "",
            ]
            for item in missing_isolation:
                error_lines.append(f"  - {item}")

            error_lines.extend([
                "",
                "This is a P0 issue - data isolation is compromised!",
            ])

            pytest.fail("\n".join(error_lines))


# =============================================================================
# Standalone Execution (for debugging)
# =============================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("Database Schema Consistency Check")
    print("=" * 70)

    print(f"\n[1/3] Expected schema: {len(EXPECTED_SCHEMA)} tables defined")

    print("\n[2/3] Querying database...")
    try:
        actual = get_actual_schema_from_database()
        print(f"      Found {len(actual)} tables in database")
    except Exception as e:
        print(f"      ERROR: {e}")
        print("      Make sure the database is running and accessible.")
        exit(1)

    print("\n[3/3] Comparing schemas...")
    missing_tables = find_missing_tables(EXPECTED_SCHEMA, actual)
    missing_columns = find_missing_columns(EXPECTED_SCHEMA, actual)

    if missing_tables or missing_columns:
        print(format_error_report(missing_tables, missing_columns))
        exit(1)
    else:
        print("      SUCCESS: All expected tables and columns exist in database!")
        exit(0)
