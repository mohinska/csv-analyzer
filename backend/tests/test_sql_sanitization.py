"""Tests for SQL sanitization — only SELECT/WITH allowed, all DML/DDL blocked."""

import pytest

from backend.app.agent.sql_sanitizer import validate_sql


class TestAllowedQueries:
    def test_allows_simple_select(self):
        validate_sql("SELECT * FROM data")

    def test_allows_select_with_where(self):
        validate_sql("SELECT name, age FROM data WHERE age > 30")

    def test_allows_select_with_group_by(self):
        validate_sql("SELECT category, COUNT(*) FROM data GROUP BY category")

    def test_allows_select_with_order_by_limit(self):
        validate_sql("SELECT * FROM data ORDER BY score DESC LIMIT 10")

    def test_allows_cte_with_select(self):
        validate_sql(
            "WITH top AS (SELECT * FROM data WHERE score > 90) "
            "SELECT * FROM top"
        )

    def test_allows_nested_subquery(self):
        validate_sql(
            "SELECT * FROM (SELECT name, age FROM data WHERE age > 25) sub"
        )

    def test_allows_aggregate_functions(self):
        validate_sql("SELECT AVG(score), MIN(age), MAX(age) FROM data")

    def test_allows_window_functions(self):
        validate_sql(
            "SELECT name, score, ROW_NUMBER() OVER (ORDER BY score DESC) FROM data"
        )

    def test_allows_case_insensitive_select(self):
        validate_sql("select * from data")

    def test_allows_select_with_join(self):
        validate_sql(
            "SELECT a.name, b.value FROM data a JOIN data b ON a.id = b.id"
        )


class TestBlockedQueries:
    def test_blocks_insert(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("INSERT INTO data VALUES (1, 'x', 20, 50)")

    def test_blocks_update(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("UPDATE data SET age = 99 WHERE name = 'Alice'")

    def test_blocks_delete(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("DELETE FROM data WHERE id = 1")

    def test_blocks_drop_table(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("DROP TABLE data")

    def test_blocks_alter_table(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("ALTER TABLE data ADD COLUMN new_col INTEGER")

    def test_blocks_create_table(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("CREATE TABLE evil (id INTEGER)")

    def test_blocks_multiple_statements_semicolon(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("SELECT * FROM data; DROP TABLE data")

    def test_blocks_dml_after_comment(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("-- just a select\nDROP TABLE data")

    def test_blocks_truncate(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("TRUNCATE TABLE data")

    def test_blocks_copy(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("COPY data TO '/tmp/out.csv'")

    def test_blocks_attach(self):
        with pytest.raises(ValueError, match="(?i)not allowed"):
            validate_sql("ATTACH DATABASE '/tmp/evil.db' AS evil")

    def test_blocks_empty_query(self):
        with pytest.raises(ValueError):
            validate_sql("")

    def test_blocks_whitespace_only(self):
        with pytest.raises(ValueError):
            validate_sql("   ")
