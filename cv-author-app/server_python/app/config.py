"""Runtime configuration loaded from environment variables."""

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    base_url: str
    model: str
    port: int
    timeout_seconds: float
    proxy_url: str | None
    max_tokens: int


def get_settings() -> Settings:
    return Settings(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        model=os.getenv("OPENAI_MODEL", "gpt-5.4"),
        port=int(os.getenv("LLM_API_PORT", "8787")),
        timeout_seconds=float(os.getenv("LLM_API_TIMEOUT_MS", "90000")) / 1000,
        proxy_url=os.getenv("LLM_PROXY_URL"),
        max_tokens=int(os.getenv("LLM_MAX_TOKENS", "4096")),
    )
