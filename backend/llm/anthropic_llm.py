import json
import anthropic
from typing import Any
from .base import BaseLLM


# Tool definitions for Planner Agent
PLANNER_TOOLS = [
    {
        "name": "write_to_chat",
        "description": "Send a text message to the user. Use this to communicate results, explanations, or ask clarifying questions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The text message to send to the user"
                }
            },
            "required": ["text"]
        }
    },
    {
        "name": "generate_query",
        "description": "Generate and execute a SQL query (DuckDB) to analyze the data. Returns the execution result.",
        "input_schema": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "description": "What you want to do with the data (e.g., 'calculate average of salary column', 'filter rows where age > 30')"
                }
            },
            "required": ["intent"]
        }
    },
    {
        "name": "create_plot",
        "description": "Create a visualization. ALWAYS specify x_column and y_column explicitly — pick the columns that best answer the user's question. Choose plot_type to match the data: line for time series / trends, bar for category comparisons, scatter for relationships between two numeric variables, histogram for distributions, pie for proportions, box for spread/outliers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "plot_type": {
                    "type": "string",
                    "enum": ["bar", "line", "scatter", "histogram", "pie", "box", "heatmap"],
                    "description": "Type of visualization to create"
                },
                "title": {
                    "type": "string",
                    "description": "Title for the plot"
                },
                "x_column": {
                    "type": "string",
                    "description": "Column to use for X axis (optional for histogram, pie)"
                },
                "y_column": {
                    "type": "string",
                    "description": "Column to use for Y axis (optional for histogram, pie)"
                },
                "color_column": {
                    "type": "string",
                    "description": "Column to use for color grouping (optional)"
                },
                "aggregation": {
                    "type": "string",
                    "enum": ["sum", "mean", "count", "min", "max", "median"],
                    "description": "Aggregation to apply when grouping data (optional)"
                },
                "instructions": {
                    "type": "string",
                    "description": "Additional instructions for the plot (e.g., 'sort by value descending', 'top 10 only', 'bin by 0.05'). For histograms, pass the user's bin size here."
                },
                "bins": {
                    "type": "integer",
                    "description": "Number of bins for histograms (default 20). Use this for explicit bin count control."
                },
                "color": {
                    "type": "string",
                    "description": "Main color for the chart (CSS hex, e.g. '#3b82f6' for blue, '#ef4444' for red, '#22c55e' for green). Default is purple."
                }
            },
            "required": ["plot_type", "title"]
        }
    },
    {
        "name": "finish",
        "description": "Signal that you have completed responding to the user's request. Always call this when done.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]


class AnthropicLLM(BaseLLM):
    """Anthropic Claude LLM implementation."""

    def __init__(self, model: str = "claude-haiku-4-5-20251001", api_key: str = None):
        self.model = model
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def generate(self, prompt: str, system: str = None) -> str:
        messages = [{"role": "user", "content": prompt}]

        kwargs = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system

        response = await self.client.messages.create(**kwargs)
        return response.content[0].text

    async def generate_json(self, prompt: str, system: str = None) -> dict[str, Any]:
        # Add JSON instruction to prompt
        json_prompt = f"{prompt}\n\nRespond ONLY with valid JSON, no other text."

        response = await self.generate(json_prompt, system)

        # Clean response - remove markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        return json.loads(cleaned.strip())

    async def generate_with_tools(
        self,
        messages: list[dict],
        tools: list[dict] = None,
        system: str = None,
        max_tokens: int = 4096
    ) -> anthropic.types.Message:
        """
        Generate response with tool-use support.

        Args:
            messages: Conversation history in Anthropic format
            tools: Tool definitions (defaults to PLANNER_TOOLS)
            system: System prompt
            max_tokens: Maximum tokens for response

        Returns:
            Full Anthropic Message response with content blocks
        """
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": messages,
            "tools": tools or PLANNER_TOOLS,
        }
        if system:
            kwargs["system"] = system

        response = await self.client.messages.create(**kwargs)
        return response
