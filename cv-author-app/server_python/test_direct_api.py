"""Send a minimal AIHubMix request without using any proxy."""

import json
import os

import requests
from dotenv import load_dotenv


load_dotenv()
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise SystemExit("OPENAI_API_KEY is not configured.")

endpoint = "https://hone.vvvv.ee/v1/chat/completions"
payload = {
    "model": os.environ.get("OPENAI_MODEL", "gpt-5.6-sol"),
    "messages": [{"role": "user", "content": "Reply with exactly: connection ok"}],
    "max_tokens": 16,
    "temperature": 0,
}

try:
    session = requests.Session()
    session.trust_env = False
    response = session.post(
        url=endpoint,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=30,
    )
except requests.RequestException as exc:
    raise SystemExit(f"Direct request failed: {exc}") from exc

print(f"HTTP {response.status_code}")
print(response.text[:1000])
