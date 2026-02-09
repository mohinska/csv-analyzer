from abc import ABC, abstractmethod
from typing import Any


class BaseLLM(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(self, prompt: str, system: str = None) -> str:
        """Generate a response from the LLM."""
        pass

    @abstractmethod
    async def generate_json(self, prompt: str, system: str = None) -> dict[str, Any]:
        """Generate a JSON response from the LLM."""
        pass
