import re
import uuid
from typing import Any
from dataclasses import dataclass
from .base import BaseLLM


@dataclass
class MockContentBlock:
    """Mock content block to simulate Anthropic response."""
    type: str
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict = None

    def __post_init__(self):
        if self.input is None:
            self.input = {}


@dataclass
class MockMessage:
    """Mock message to simulate Anthropic response."""
    content: list
    stop_reason: str = "end_turn"


class MockLLM(BaseLLM):
    """
    Mock LLM for testing without API keys.
    Uses simple keyword matching to simulate classification.
    Replace with real LLM when API keys are available.
    """

    # Keywords that suggest each type
    PLOT_KEYWORDS = [
        "plot", "chart", "graph", "visualize", "visualization", "show me",
        "distribution", "histogram", "bar chart", "pie chart", "scatter",
        "trend", "over time", "compare", "correlation", "діаграма", "графік",
        "покажи", "візуалізуй"
    ]

    TRANSFORMATION_KEYWORDS = [
        "filter", "remove", "delete", "drop", "keep only", "where",
        "group by", "aggregate", "sum", "average", "merge", "join",
        "create column", "new column", "rename", "sort", "order by",
        "фільтр", "видали", "залиш", "згрупуй", "сортуй", "додай колонку"
    ]

    QUESTION_KEYWORDS = [
        "what", "how many", "which", "who", "when", "why", "is there",
        "count", "average", "mean", "max", "min", "total", "summarize",
        "explain", "describe", "що", "скільки", "який", "хто", "коли",
        "порахуй", "опиши"
    ]

    async def generate(self, prompt: str, system: str = None) -> str:
        """Generate a mock response."""
        return "Mock response"

    async def generate_json(self, prompt: str, system: str = None) -> dict[str, Any]:
        """
        Classify based on keyword matching.
        This is a placeholder - replace with real LLM for production.
        """
        text = prompt.lower()

        # Check for plot keywords
        plot_score = sum(1 for kw in self.PLOT_KEYWORDS if kw in text)
        transform_score = sum(1 for kw in self.TRANSFORMATION_KEYWORDS if kw in text)
        question_score = sum(1 for kw in self.QUESTION_KEYWORDS if kw in text)

        # Determine type based on scores
        if plot_score > transform_score and plot_score > 0:
            return {
                "request_type": "question_plot",
                "confidence": min(0.5 + plot_score * 0.1, 0.85),
                "reasoning": f"[MOCK] Detected plot-related keywords. Found {plot_score} matches."
            }
        elif transform_score > question_score and transform_score > 0:
            return {
                "request_type": "transformation",
                "confidence": min(0.5 + transform_score * 0.1, 0.85),
                "reasoning": f"[MOCK] Detected transformation keywords. Found {transform_score} matches."
            }
        elif question_score > 0:
            return {
                "request_type": "question_text",
                "confidence": min(0.5 + question_score * 0.1, 0.85),
                "reasoning": f"[MOCK] Detected question keywords. Found {question_score} matches."
            }
        else:
            # Default to question_text for unrecognized input
            return {
                "request_type": "question_text",
                "confidence": 0.4,
                "reasoning": "[MOCK] No specific keywords detected. Defaulting to text question."
            }

    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict] = None,
        system: str = None,
        max_tokens: int = 4096
    ) -> MockMessage:
        """
        Mock tool-use response for testing.
        Parses the user message and generates appropriate tool calls.
        """
        # Extract user message from messages
        user_message = ""
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    user_message = content
                elif isinstance(content, list):
                    # Handle tool_result messages - extract the original request
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            # This is a tool result, check if we should finish
                            result_content = block.get("content", "")
                            if "Plot created" in result_content or "Message sent" in result_content:
                                # Tool executed successfully, call finish
                                return MockMessage(
                                    content=[
                                        MockContentBlock(
                                            type="tool_use",
                                            id=f"mock_{uuid.uuid4().hex[:8]}",
                                            name="finish",
                                            input={}
                                        )
                                    ],
                                    stop_reason="tool_use"
                                )
                break

        text = user_message.lower()
        print(f"[MockLLM] generate_with_tools called with message: '{text[:100]}...'", flush=True)

        # Check for plot keywords
        plot_score = sum(1 for kw in self.PLOT_KEYWORDS if kw in text)

        if plot_score > 0:
            # Extract column names from the message
            # Try to find column references like "hours of sleep", "study hours", etc.
            x_column = None
            y_column = None

            # Look for patterns like "X and Y", "X vs Y", "X, Y"
            # This is a simple heuristic for mock purposes
            words = text.split()

            # Find numeric column candidates from DATA CONTEXT section
            if "DATA CONTEXT:" in user_message:
                context_section = user_message.split("USER REQUEST:")[0]
                # Extract column names from context
                import re
                column_matches = re.findall(r'-\s+(\w+)\s+\(', context_section)
                if len(column_matches) >= 2:
                    # Use first two columns as x and y
                    x_column = column_matches[0]
                    y_column = column_matches[1] if len(column_matches) > 1 else column_matches[0]

            print(f"[MockLLM] Detected plot request. x_column={x_column}, y_column={y_column}", flush=True)

            # Generate create_plot tool call
            tool_calls = [
                MockContentBlock(
                    type="tool_use",
                    id=f"mock_{uuid.uuid4().hex[:8]}",
                    name="create_plot",
                    input={
                        "plot_type": "bar",
                        "title": "Data Visualization",
                        "x_column": x_column,
                        "y_column": y_column,
                    }
                )
            ]

            return MockMessage(
                content=tool_calls,
                stop_reason="tool_use"
            )
        else:
            # Default: send a text message and finish
            return MockMessage(
                content=[
                    MockContentBlock(
                        type="tool_use",
                        id=f"mock_{uuid.uuid4().hex[:8]}",
                        name="write_to_chat",
                        input={"text": "[MOCK] This is a mock response. Configure an API key for real LLM responses."}
                    ),
                    MockContentBlock(
                        type="tool_use",
                        id=f"mock_{uuid.uuid4().hex[:8]}",
                        name="finish",
                        input={}
                    )
                ],
                stop_reason="tool_use"
            )
