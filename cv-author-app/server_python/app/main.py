"""HTTP API for generating browser-sandboxed D3 renderer programs."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from openai import APIStatusError
from pydantic import BaseModel

from .config import get_settings
from .provider import OpenAICompatibleProvider

REQUEST_VERSION = "d3-render-request@2"
PROMPT_VERSION = "d3-renderer@5"
# Keep runtime cache outside the Vite project so cache writes do not trigger a full reload.
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cv-author-llm-cache.json"


class RenderRequest(BaseModel):
    requestId: str
    input: dict[str, Any]


def validate_request(payload: RenderRequest) -> str | None:
    if not payload.requestId or len(payload.requestId) > 200:
        return "requestId is required."
    value = payload.input
    if not isinstance(value.get("width"), (int, float)) or not isinstance(value.get("height"), (int, float)):
        return "input.width and input.height are required."
    if not isinstance(value.get("svg"), str) or len(value["svg"]) > 1_000_000:
        return "input.svg is required and must be at most 1MB."
    for field in ("xColumn", "yColumn"):
        if not isinstance(value.get(field), str) or not value[field].strip() or len(value[field]) > 200:
            return f"input.{field} is required and must be a non-empty column name."
    schema = value.get("schema")
    if not isinstance(schema, list) or len(schema) > 200:
        return "input.schema is required and must be an array of at most 200 columns."
    for column in schema:
        if not isinstance(column, dict) or not isinstance(column.get("name"), str) or column.get("type") not in {"nominal", "temporal", "quantitative"}:
            return "input.schema contains an invalid column."
    if "data" in value:
        return "input.data must not be sent; data is supplied locally to the browser Worker."
    return None


def parse_program(content: str) -> dict[str, str]:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("Model response was not valid JSON.") from exc
    program = parsed.get("program", parsed) if isinstance(parsed, dict) else None
    code = program.get("code", "").strip() if isinstance(program, dict) else ""
    if not 30 <= len(code) <= 100_000:
        raise ValueError("Generated code length is outside the allowed range.")
    if not re.search(r"(?:function\s+render|(?:const|let|var)\s+render\s*=)", code):
        raise ValueError("Generated code must define render().")
    return {"code": code}


def stable(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def system_prompt() -> str:
    return "\n".join([
        "You generate a deterministic, reusable D3-compatible chart renderer program.",
        'Return JSON only: {"program":{"code":"..."}}.',
        "The code must define render({ d3, data, width, height, chartSpec }) and return { svg: string, marks: array }.",
        "svg must be a serialized SVG markup string, preferably a <g> fragment without an outer <svg> element.",
        "marks must be an array of plain objects; every mark must include string role and markType fields, and may include dataIndex.",
        "Render against runtime data passed to render(); do not embed data from the request input.",
        "Use input.svg as the visual style and layout baseline, plus input.chartSpec, input.xColumn, input.yColumn, and input.schema.",
        "The supplied d3 object is D3 v7. Use its scales, extents, grouping, and path/line calculations, but do not use d3.create, d3.select, d3.selectAll, or any DOM API.",
        "Build SVG markup with plain strings and escape all data-derived text and attributes. Do not use imports, network, DOM, globals, or browser APIs.",
        "Keep output deterministic and return only serializable strings and objects.",
    ])


settings = get_settings()
app = FastAPI()
cache: dict[str, dict[str, Any]] = {}
provider: OpenAICompatibleProvider | None = None


@app.exception_handler(HTTPException)
async def api_error(_: Request, exc: HTTPException) -> JSONResponse:
    """Keep the error envelope compatible with the original Node API."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "error": str(exc.detail)},
    )


@app.on_event("startup")
async def load_cache() -> None:
    global provider
    if CACHE_PATH.exists():
        try:
            cache.update(json.loads(CACHE_PATH.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    if settings.api_key:
        provider = OpenAICompatibleProvider(settings)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.model, "upstream": settings.base_url}


@app.post("/api/llm/render")
async def render(request: RenderRequest) -> dict[str, Any]:
    error = validate_request(request)
    if error:
        raise HTTPException(400, error)
    key_payload = {"version": REQUEST_VERSION, "promptVersion": PROMPT_VERSION, "model": settings.model, "request": {"input": request.input}}
    key = sha256(stable(key_payload).encode()).hexdigest()
    cache_hit = key in cache
    if cache_hit:
        payload = cache[key]
    else:
        if provider is None:
            raise HTTPException(503, "Server API key is not configured.")
        try:
            program = parse_program(await provider.generate(stable({"input": request.input}), system_prompt(), settings.max_tokens))
        except asyncio.TimeoutError as exc:
            raise HTTPException(504, f"The model request exceeded the {int(settings.timeout_seconds)} second timeout.") from exc
        except APIStatusError as exc:
            raise HTTPException(exc.status_code, exc.message) from exc
        except Exception as exc:
            raise HTTPException(502, str(exc) or "Unable to generate a renderer.") from exc
        payload = {"status": "ready", "program": program, "metadata": {"markSchema": ["role", "markType", "dataIndex"], "sandbox": "worker-v1"}}
        cache[key] = payload
        CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    return {**payload, "provenance": {"requestId": request.requestId or str(uuid4()), "cacheKey": key, "promptVersion": PROMPT_VERSION, "requestVersion": REQUEST_VERSION, "model": settings.model, "generatedAt": datetime.now(timezone.utc).isoformat(), "cacheHit": cache_hit}}
