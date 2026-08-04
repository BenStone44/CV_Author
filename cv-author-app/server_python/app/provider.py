"""OpenAI-compatible LLM provider interface."""

from abc import ABC, abstractmethod
import asyncio
from typing import Any

import httpx
from openai import AsyncOpenAI

from .config import Settings


async def await_with_timeout(coro: Any, timeout_seconds: float) -> Any:
    return await asyncio.wait_for(coro, timeout=timeout_seconds)


class LLMProvider(ABC):
    """Abstract base class for model providers."""

    @abstractmethod
    async def generate(self, prompt: str, system_prompt: str, max_tokens: int) -> str:
        """Generate text from a model."""


class OpenAICompatibleProvider(LLMProvider):
    """Provider for OpenAI-compatible chat completion APIs."""

    def __init__(self, settings: Settings):
        if not settings.api_key:
            raise ValueError("Server API key is not configured.")
        self.settings = settings
        # Do not inherit environment proxy settings for direct LLM requests.
        http_client = httpx.AsyncClient(trust_env=False)
        self.client = AsyncOpenAI(
            api_key=settings.api_key,
            base_url=settings.base_url,
            http_client=http_client,
        )

    async def generate(self, prompt: str, system_prompt: str, max_tokens: int) -> str:
        response = await await_with_timeout(
            self.client.chat.completions.create(
                model=self.settings.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                max_tokens=max_tokens,
            ),
            self.settings.timeout_seconds,
        )
        return response.choices[0].message.content or ""
