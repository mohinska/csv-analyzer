"""
QueryMaker - LLM-based agent that generates all pandas and visualization code.

Responsibilities:
1. Generate pandas queries for data transformations and aggregations
2. Generate matplotlib/seaborn code for visualizations
"""
import re
from typing import Optional
from pydantic import BaseModel
from backend.llm.base import BaseLLM


class GeneratedQuery(BaseModel):
    """Result of query generation."""
    code: str
    explanation: str
    is_aggregation: bool = False  # True if returns a single value/summary
    is_transformation: bool = False  # True if modifies the DataFrame


class GeneratedPlotCode(BaseModel):
    """Result of plot code generation."""
    code: str
    title: str
    columns_used: list[str]
    summary: str


class QueryMaker:
    """
    LLM-based code generator for pandas operations and visualizations.

    The Planner delegates all code generation to QueryMaker:
    - Data queries (filter, aggregate, transform)
    - Visualization code (matplotlib/seaborn)
    """

    QUERY_SYSTEM_PROMPT = """You are a pandas code generator. Your job is to translate natural language
requests into valid pandas code.

IMPORTANT RULES:
1. The DataFrame is already loaded as `df`
2. Generate ONLY the code, no markdown, no explanations in the code block
3. Use pandas best practices
4. Handle potential errors (e.g., missing columns)
5. For aggregations, assign result to `result` variable
6. For transformations, modify `df` in place or assign to `df`
7. Never use exec(), eval(), or import dangerous modules
8. Keep code simple and readable

AVAILABLE LIBRARIES (already imported):
- `pd` / `pandas` — pandas
- `np` / `numpy` — numpy
- `scipy` — scipy (for statistical tests)
- `stats` — scipy.stats (for distributions, tests, regression)

STATISTICAL CAPABILITIES:
- Distributions: stats.norm, stats.t, stats.f, stats.chi2, stats.expon, stats.poisson, stats.binom, stats.uniform, stats.gamma, stats.beta, etc.
- Tests: stats.ttest_ind, stats.ttest_1samp, stats.chi2_contingency, stats.f_oneway, stats.mannwhitneyu, stats.kruskal, stats.shapiro, stats.kstest, stats.pearsonr, stats.spearmanr
- Regression: stats.linregress (simple), np.polyfit/np.polyval (polynomial)
- For more complex regression, use numpy: np.linalg.lstsq

REGRESSION EXAMPLES:
- Simple linear regression:
  slope, intercept, r_value, p_value, std_err = stats.linregress(df['x'], df['y'])
  result = f"y = {slope:.4f}*x + {intercept:.4f}, R² = {r_value**2:.4f}, p = {p_value:.4e}"

- Polynomial regression:
  coeffs = np.polyfit(df['x'].values, df['y'].values, deg=2)
  result = f"Coefficients: {coeffs}"

RESPONSE FORMAT (JSON):
{
    "code": "result = df['column'].mean()",
    "explanation": "Calculates the average of the 'column'",
    "is_aggregation": true,
    "is_transformation": false
}"""

    PLOT_SYSTEM_PROMPT = """You are a matplotlib/seaborn code generator. Your job is to create
beautiful, informative visualizations from data.

IMPORTANT RULES:
1. The DataFrame is available as `df`
2. You MUST assign the figure to `fig` variable
3. DO NOT include import statements - plt, sns, pd, np are already available
4. Always include clear titles, labels, and legends where appropriate
5. Use figsize=(10, 6) or similar appropriate size
6. Call plt.tight_layout() at the end
7. Use professional color schemes
8. Handle edge cases (empty data, NaN values)

RESPONSE FORMAT (JSON):
{
    "code": "fig, ax = plt.subplots(figsize=(10, 6))\\nax.bar(df['x'], df['y'])\\nplt.tight_layout()",
    "title": "Distribution of Sales",
    "columns_used": ["sales", "category"],
    "summary": "Bar chart showing sales distribution across categories"
}

Examples of good visualizations:
- Histogram: fig, ax = plt.subplots(); ax.hist(df['column'], bins=30, edgecolor='black')
- Bar chart: fig, ax = plt.subplots(); ax.bar(df['x'], df['y'])
- Line chart: fig, ax = plt.subplots(); ax.plot(df['x'], df['y'])
- Scatter: fig, ax = plt.subplots(); ax.scatter(df['x'], df['y'])
- Box plot: fig, ax = plt.subplots(); sns.boxplot(data=df, x='category', y='value', ax=ax)
- Heatmap: fig, ax = plt.subplots(); sns.heatmap(df.corr(), annot=True, ax=ax)
- Pie chart: fig, ax = plt.subplots(); ax.pie(df['values'], labels=df['labels'], autopct='%1.1f%%')"""

    def __init__(self, llm: BaseLLM):
        self.llm = llm

    async def generate_query(
        self,
        intent: str,
        data_summary: str,
        context: Optional[str] = None,
    ) -> GeneratedQuery:
        """
        Generate pandas code from intent description.

        Args:
            intent: What the user wants to do with the data
            data_summary: Summary of the DataFrame schema and stats
            context: Optional additional context (e.g., previous results)

        Returns:
            GeneratedQuery with code, explanation, and type flags
        """
        prompt = f"""Data available:
{data_summary}

User request: {intent}

{f"Additional context: {context}" if context else ""}

Generate pandas code to fulfill this request. Respond with JSON."""

        try:
            response = await self.llm.generate_json(prompt, self.QUERY_SYSTEM_PROMPT)

            # Validate and clean the code
            code = self._sanitize_code(response.get("code", ""))

            return GeneratedQuery(
                code=code,
                explanation=response.get("explanation", ""),
                is_aggregation=response.get("is_aggregation", False),
                is_transformation=response.get("is_transformation", False),
            )
        except Exception as e:
            print(f"[QueryMaker] Query generation error: {e}")
            raise ValueError(f"Failed to generate query: {e}")

    async def generate_plot_code(
        self,
        plot_type: str,
        data_summary: str,
        title: Optional[str] = None,
        x_column: Optional[str] = None,
        y_column: Optional[str] = None,
        color_column: Optional[str] = None,
        aggregation: Optional[str] = None,
        custom_instructions: Optional[str] = None,
    ) -> GeneratedPlotCode:
        """
        Generate matplotlib/seaborn code for visualization.

        Args:
            plot_type: Type of plot (bar, line, scatter, histogram, pie, box, heatmap)
            data_summary: Data context from summarizer
            title: Optional plot title
            x_column: X axis column
            y_column: Y axis column
            color_column: Color grouping column
            aggregation: Aggregation type (sum, mean, count, etc.)
            custom_instructions: Any additional instructions

        Returns:
            GeneratedPlotCode with executable matplotlib code
        """
        # Build plot specification
        spec_parts = [f"Plot type: {plot_type}"]
        if title:
            spec_parts.append(f"Title: {title}")
        if x_column:
            spec_parts.append(f"X axis: {x_column}")
        if y_column:
            spec_parts.append(f"Y axis: {y_column}")
        if color_column:
            spec_parts.append(f"Color by: {color_column}")
        if aggregation:
            spec_parts.append(f"Aggregation: {aggregation}")
        if custom_instructions:
            spec_parts.append(f"Additional: {custom_instructions}")

        prompt = f"""Data available:
{data_summary}

Create a visualization with the following specification:
{chr(10).join(spec_parts)}

Generate matplotlib/seaborn code that:
1. Creates the specified visualization
2. Assigns figure to `fig` variable
3. Uses professional styling
4. Handles edge cases gracefully

Respond with JSON."""

        try:
            response = await self.llm.generate_json(prompt, self.PLOT_SYSTEM_PROMPT)

            # Validate and clean the code
            code = self._sanitize_plot_code(response.get("code", ""))

            return GeneratedPlotCode(
                code=code,
                title=response.get("title", title or "Plot"),
                columns_used=response.get("columns_used", []),
                summary=response.get("summary", ""),
            )
        except Exception as e:
            print(f"[QueryMaker] Plot generation error: {e}")
            raise ValueError(f"Failed to generate plot code: {e}")

    def _sanitize_code(self, code: str) -> str:
        """
        Basic sanitization of generated pandas code.
        Removes dangerous patterns.
        """
        lines = code.strip().split('\n')
        safe_lines = []

        dangerous_patterns = [
            r'import\s+os\b',
            r'import\s+sys\b',
            r'import\s+subprocess',
            r'from\s+os\b',
            r'from\s+sys\b',
            r'exec\s*\(',
            r'eval\s*\(',
            r'open\s*\(',
            r'__import__',
            r'globals\s*\(',
            r'locals\s*\(',
            r'compile\s*\(',
        ]

        for line in lines:
            is_safe = True
            for pattern in dangerous_patterns:
                if re.search(pattern, line, re.IGNORECASE):
                    is_safe = False
                    print(f"[QueryMaker] Removed dangerous line: {line}")
                    break
            if is_safe:
                safe_lines.append(line)

        return '\n'.join(safe_lines)

    def _sanitize_plot_code(self, code: str) -> str:
        """
        Sanitization for plot code.
        Removes ALL import statements since modules are pre-loaded in executor namespace.
        Available: plt, sns, pd, np, matplotlib, seaborn, pandas, numpy
        """
        lines = code.strip().split('\n')
        safe_lines = []

        # Patterns that are always dangerous
        dangerous_patterns = [
            r'exec\s*\(',
            r'eval\s*\(',
            r'open\s*\(',
            r'__import__',
            r'globals\s*\(',
            r'locals\s*\(',
            r'compile\s*\(',
        ]

        # Skip ALL import/from lines - modules are pre-loaded
        import_pattern = r'^\s*(import\s+|from\s+\w+\s+import)'

        for line in lines:
            # Skip import lines
            if re.search(import_pattern, line):
                continue

            is_safe = True
            for pattern in dangerous_patterns:
                if re.search(pattern, line, re.IGNORECASE):
                    is_safe = False
                    print(f"[QueryMaker] Removed dangerous line: {line}")
                    break

            if is_safe:
                safe_lines.append(line)

        return '\n'.join(safe_lines)


def create_query_maker(llm: BaseLLM) -> QueryMaker:
    """Create a QueryMaker instance."""
    return QueryMaker(llm)
