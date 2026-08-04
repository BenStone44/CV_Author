"""Verify that the configured provider can return a renderer program."""

import asyncio

from dotenv import load_dotenv

from app.config import get_settings
from app.provider import OpenAICompatibleProvider


async def main() -> None:
    load_dotenv()
    provider = OpenAICompatibleProvider(get_settings())
    content = await provider.generate(
        prompt=(
            'Return JSON only: {"program":{"code":"function render(){ '
            'return { svg: \\"\\", marks: [] }; }"}}.'
        ),
        system_prompt="You return JSON only.",
        max_tokens=100,
    )
    print(content)


asyncio.run(main())
