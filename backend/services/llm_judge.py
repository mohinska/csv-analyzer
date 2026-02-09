"""
LLM-as-a-Judge — evaluates quality of Planner agent responses using a secondary LLM call.

Evaluates:
- relevance: Does the response address the user's question?
- accuracy: Are numbers/claims grounded in the query result?
- completeness: Did it fully answer, or is there more to say?
- verdict: "pass" | "retry" | "warn"
- feedback: Explanation for the planner to self-correct on retry
"""
from typing import Optional
from pydantic import BaseModel

from backend.llm.base import BaseLLM


class JudgeVerdict(BaseModel):
    """Result of an LLM judge evaluation."""
    relevance: int  # 0-10
    accuracy: int  # 0-10
    completeness: int  # 0-10
    verdict: str  # "pass" | "retry" | "warn"
    feedback: str  # explanation


JUDGE_SYSTEM_PROMPT = """You are a strict quality evaluator for a data analysis assistant.

Your job: given a user's question, the raw query result from pandas, and the assistant's response — evaluate whether the response is accurate, relevant, and complete.

## Scoring (0-10 each)

**relevance**: Does the response directly address what the user asked?
- 10: Perfectly on-topic, answers exactly what was asked
- 7-9: Addresses the question but includes tangential info
- 4-6: Partially relevant, misses the core question
- 0-3: Off-topic or answers a different question

**accuracy**: Are the numbers, statistics, and claims grounded in the query result?
- 10: Every number matches the data, no fabrication
- 7-9: Minor rounding differences, but fundamentally correct
- 4-6: Some numbers correct, some appear fabricated or misinterpreted
- 0-3: Major fabrication or misrepresentation of data

**completeness**: Did the response fully answer the question?
- 10: Comprehensive answer with context and interpretation
- 7-9: Answers the main question, could add more depth
- 4-6: Partial answer, misses important aspects
- 0-3: Barely addresses the question

## Verdict Rules

- **"pass"**: All scores >= 7. Response is good.
- **"warn"**: Any score 5-6. Response has issues but is usable.
- **"retry"**: Any score < 5. Response needs to be redone.

## Output Format

Return ONLY valid JSON:
{
  "relevance": <int 0-10>,
  "accuracy": <int 0-10>,
  "completeness": <int 0-10>,
  "verdict": "<pass|warn|retry>",
  "feedback": "<1-2 sentences explaining the verdict, focused on what to fix if retry/warn>"
}

## Important

- If there is no query result (null), only evaluate relevance and completeness. Set accuracy to 10.
- Be strict on accuracy — fabricated numbers are unacceptable.
- Be lenient on completeness — a concise correct answer is better than a verbose incorrect one.
- Derived numbers (totals, averages, percentages calculated from data) count as accurate even if they don't appear verbatim in the query result.
"""


TURN_JUDGE_SYSTEM_PROMPT = """You are a quality evaluator for a data analysis assistant's complete turn.

Given: the user's original question, all messages sent to the user, all query results, and any plots created — evaluate the overall quality of the turn.

## Scoring (0-10 each)

**relevance**: Did the turn address the user's question?
**accuracy**: Were all numbers and claims grounded in data?
**completeness**: Was the question fully answered? Were appropriate visualizations created when warranted?

## Verdict Rules
- **"pass"**: All scores >= 7
- **"warn"**: Any score 5-6
- **"retry"**: Any score < 5

Return ONLY valid JSON:
{
  "relevance": <int 0-10>,
  "accuracy": <int 0-10>,
  "completeness": <int 0-10>,
  "verdict": "<pass|warn|retry>",
  "feedback": "<1-2 sentences>"
}
"""


def _safe_print(msg: str) -> None:
    """Print safely, handling Unicode on Windows."""
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode('ascii', errors='replace').decode('ascii'), flush=True)


class LLMJudge:
    """Uses a secondary LLM call to evaluate response quality."""

    def __init__(self, llm: BaseLLM):
        self.llm = llm

    async def evaluate_response(
        self,
        user_question: str,
        query_result: Optional[str],
        assistant_response: str,
        data_context: str,
    ) -> JudgeVerdict:
        """
        Evaluate a single assistant response after a query.

        Called after write_to_chat that follows generate_query.
        """
        prompt = f"""## User Question
{user_question}

## Data Context
{data_context[:500]}

## Query Result (raw pandas output)
{query_result[:1000] if query_result else "No query was executed."}

## Assistant Response
{assistant_response}

Evaluate this response."""

        try:
            _safe_print(f"[Judge] Evaluating response quality...")
            result = await self.llm.generate_json(prompt, JUDGE_SYSTEM_PROMPT)
            verdict = JudgeVerdict(
                relevance=max(0, min(10, int(result.get("relevance", 5)))),
                accuracy=max(0, min(10, int(result.get("accuracy", 5)))),
                completeness=max(0, min(10, int(result.get("completeness", 5)))),
                verdict=result.get("verdict", "pass") if result.get("verdict") in ("pass", "warn", "retry") else "pass",
                feedback=str(result.get("feedback", "")),
            )
            _safe_print(f"[Judge] Verdict: {verdict.verdict} (rel={verdict.relevance}, acc={verdict.accuracy}, comp={verdict.completeness})")
            return verdict

        except Exception as e:
            _safe_print(f"[Judge] Evaluation failed: {e}")
            # On failure, return a pass to not block the main flow
            return JudgeVerdict(
                relevance=5,
                accuracy=5,
                completeness=5,
                verdict="pass",
                feedback=f"Judge evaluation failed: {str(e)}",
            )

    async def evaluate_turn(
        self,
        user_question: str,
        all_messages: list[str],
        all_query_results: list[str],
        plots_created: list[str],
    ) -> JudgeVerdict:
        """
        Evaluate the complete turn after finish() is called.

        Provides an overall quality score for the entire interaction.
        """
        messages_text = "\n---\n".join(all_messages) if all_messages else "No messages sent."
        results_text = "\n---\n".join(r[:500] for r in all_query_results) if all_query_results else "No queries executed."
        plots_text = ", ".join(plots_created) if plots_created else "No plots created."

        prompt = f"""## User Question
{user_question}

## All Messages Sent to User
{messages_text}

## All Query Results
{results_text}

## Plots Created
{plots_text}

Evaluate the overall quality of this turn."""

        try:
            _safe_print(f"[Judge] Evaluating turn quality...")
            result = await self.llm.generate_json(prompt, TURN_JUDGE_SYSTEM_PROMPT)
            verdict = JudgeVerdict(
                relevance=max(0, min(10, int(result.get("relevance", 5)))),
                accuracy=max(0, min(10, int(result.get("accuracy", 5)))),
                completeness=max(0, min(10, int(result.get("completeness", 5)))),
                verdict=result.get("verdict", "pass") if result.get("verdict") in ("pass", "warn", "retry") else "pass",
                feedback=str(result.get("feedback", "")),
            )
            _safe_print(f"[Judge] Turn verdict: {verdict.verdict} (rel={verdict.relevance}, acc={verdict.accuracy}, comp={verdict.completeness})")
            return verdict

        except Exception as e:
            _safe_print(f"[Judge] Turn evaluation failed: {e}")
            return JudgeVerdict(
                relevance=5,
                accuracy=5,
                completeness=5,
                verdict="pass",
                feedback=f"Judge turn evaluation failed: {str(e)}",
            )
