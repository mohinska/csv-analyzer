"""SQL sanitization — only allow SELECT/WITH queries, block everything else."""

import re


# Statements that are never allowed
_BLOCKED_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|COPY|ATTACH|DETACH|GRANT|REVOKE|PRAGMA|LOAD|INSTALL)\b",
    re.IGNORECASE,
)


def validate_sql(query: str) -> None:
    """Validate that a SQL query is a read-only SELECT or WITH...SELECT.

    Raises ValueError if the query is empty, contains multiple statements,
    or uses any blocked keyword.
    """
    stripped = query.strip()
    if not stripped:
        raise ValueError("Empty query is not allowed")

    # Block multiple statements (semicolons)
    # Remove string literals first to avoid false positives on semicolons inside strings
    no_strings = re.sub(r"'[^']*'", "", stripped)
    if ";" in no_strings:
        raise ValueError("Multiple statements are not allowed")

    # Block dangerous keywords
    match = _BLOCKED_KEYWORDS.search(no_strings)
    if match:
        raise ValueError(f"Statement type '{match.group().upper()}' is not allowed. Only SELECT queries are permitted.")

    # Must start with SELECT or WITH (after stripping comments)
    no_comments = re.sub(r"--[^\n]*", "", no_strings)
    no_comments = re.sub(r"/\*.*?\*/", "", no_comments, flags=re.DOTALL)
    first_word = no_comments.strip().split()[0].upper() if no_comments.strip() else ""

    if first_word not in ("SELECT", "WITH"):
        raise ValueError(f"Statement type '{first_word}' is not allowed. Only SELECT queries are permitted.")
