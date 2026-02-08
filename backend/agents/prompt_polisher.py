"""
PromptPolisher - Agent that validates and refines user prompts before passing to Planner.

Responsibilities:
1. Validate if the prompt is meaningful (not bullshit)
2. Classify the prompt type (analysis, visualization, transformation, question)
3. Refine the prompt to be clear and actionable
4. Return polished prompt or rejection reason
"""
from typing import Optional
from pydantic import BaseModel
from enum import Enum
from backend.llm.base import BaseLLM


class PromptType(str, Enum):
    """Types of user prompts."""
    ANALYSIS = "analysis"           # Questions about data (means, counts, correlations)
    VISUALIZATION = "visualization"  # Requests for charts/plots
    TRANSFORMATION = "transformation"  # Data modifications (filter, sort, add column)
    QUESTION = "question"           # General questions about the dataset
    INVALID = "invalid"             # Not a valid data-related request


class PolishedPrompt(BaseModel):
    """Result of prompt polishing."""
    is_valid: bool
    prompt_type: PromptType
    original_prompt: str
    polished_prompt: str
    rejection_reason: Optional[str] = None
    confidence: float = 1.0


class PromptPolisher:
    """
    Agent that validates and refines user prompts.

    Sits before the Planner to ensure:
    - Prompt is relevant to data analysis
    - Prompt is clear and actionable
    - Prompt type is identified for better handling
    """

    SYSTEM_PROMPT = """You are a prompt validation and refinement assistant for a data analysis tool.

Your job is to:
1. Validate if the user's prompt is relevant to data analysis
2. Classify the prompt type
3. Refine the prompt to be clear and actionable
4. Fix column name typos (use the AVAILABLE DATA section to match correct names)

PROMPT TYPES:
- "analysis": Questions about data (calculating means, counts, finding patterns, correlations)
- "visualization": Requests for charts, plots, graphs, heatmaps
- "transformation": Data modifications (filtering, sorting, adding columns, cleaning, removing rows)
- "question": General questions about the dataset structure or content
- "invalid": Not related to data analysis (off-topic, gibberish, inappropriate)

VALIDATION RULES:
- Reject prompts that are completely unrelated to data analysis
- Reject prompts that are gibberish or nonsensical
- Accept even simple prompts if they relate to data in some way
- Be lenient - if there's any reasonable interpretation for data analysis, accept it

COLUMN NAME CORRECTION:
- If the user mentions a column that doesn't exist but is close to an existing one, correct it in the polished prompt
- Example: user says "sallary" but data has "Salary" → use "Salary" in polished prompt
- Example: user says "show me age" but data has "Age (years)" → use "Age (years)"

REFINEMENT GUIDELINES:
- Keep the user's intent intact
- Make the prompt specific and actionable
- Add clarity where needed without changing meaning
- If the prompt is already clear, keep it mostly unchanged
- Use proper technical terminology

COMMON VAGUE PROMPTS — interpret them as:
- "what's interesting" / "anything interesting" → "Perform exploratory analysis: compute key statistics for all numeric columns, identify notable patterns, outliers, and correlations"
- "show me trends" / "trends" → "Show line chart of the main numeric metric over the temporal column (date/time/week/month)"
- "clean this" / "clean data" / "clean" → "Clean the data: fix column types, remove duplicates, handle missing values, fix anomalies"
- "compare X and Y" → "Compare X and Y using grouped statistics and a bar chart"
- "overview" / "summary" / "describe" → "Provide a comprehensive overview: shape, column types, key statistics, missing values, and notable patterns"
- "correlations" / "what's related" → "Show correlation heatmap and highlight the strongest correlations"

RESPONSE FORMAT (JSON):
{
    "is_valid": true,
    "prompt_type": "analysis",
    "polished_prompt": "Calculate the average value of the 'Salary' column",
    "rejection_reason": null,
    "confidence": 0.95
}

If rejecting:
{
    "is_valid": false,
    "prompt_type": "invalid",
    "polished_prompt": "",
    "rejection_reason": "This prompt is not related to data analysis. Try asking about your data — for example: 'show me a summary', 'what are the trends', or 'clean the data'.",
    "confidence": 0.9
}"""

    def __init__(self, llm: BaseLLM):
        self.llm = llm

    async def polish(
        self,
        user_prompt: str,
        data_context: Optional[str] = None,
    ) -> PolishedPrompt:
        """
        Validate and polish a user prompt.

        Args:
            user_prompt: The original user prompt
            data_context: Optional summary of available data

        Returns:
            PolishedPrompt with validation result and refined prompt
        """
        context_section = ""
        if data_context:
            context_section = f"\n\nAVAILABLE DATA:\n{data_context}\n"

        prompt = f"""Analyze this user prompt and respond with JSON:

USER PROMPT: "{user_prompt}"{context_section}

Validate, classify, and refine this prompt. Respond with JSON only."""

        try:
            response = await self.llm.generate_json(prompt, self.SYSTEM_PROMPT)

            is_valid = response.get("is_valid", True)
            prompt_type_str = response.get("prompt_type", "question")

            # Map string to enum
            try:
                prompt_type = PromptType(prompt_type_str)
            except ValueError:
                prompt_type = PromptType.QUESTION

            return PolishedPrompt(
                is_valid=is_valid,
                prompt_type=prompt_type,
                original_prompt=user_prompt,
                polished_prompt=response.get("polished_prompt", user_prompt),
                rejection_reason=response.get("rejection_reason"),
                confidence=response.get("confidence", 0.8),
            )

        except Exception as e:
            print(f"[PromptPolisher] Error: {e}")
            # On error, pass through the original prompt
            return PolishedPrompt(
                is_valid=True,
                prompt_type=PromptType.QUESTION,
                original_prompt=user_prompt,
                polished_prompt=user_prompt,
                confidence=0.5,
            )


def create_prompt_polisher(llm: BaseLLM) -> PromptPolisher:
    """Create a PromptPolisher instance."""
    return PromptPolisher(llm)
