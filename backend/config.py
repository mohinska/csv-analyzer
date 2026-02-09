from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

class Settings(BaseSettings):
    """Application settings."""

    # API Keys
    anthropic_api_key: str = ""

    # LLM Settings
    classifier_model: str = "claude-sonnet-4-5-20250929"
    use_mock_llm: bool = False  # Set to True for testing without API

    # LLM Judge Settings
    judge_enabled: bool = True
    judge_model: str = "claude-sonnet-4-5-20250929"

    # Server Settings
    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = True

    # Data Settings
    data_dir: Path = Path("data/sessions")

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",  # local dev
        "http://frontend:3000",  # inside Docker network
        "http://161.35.159.20:3000"  # external access
    ]
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def should_use_mock(self) -> bool:
        """Use mock if explicitly set or if no API key provided."""
        return self.use_mock_llm or not self.anthropic_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
