const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not set. Run this script with --env-file=.env.");
}

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Reply with exactly: connection ok" }],
    max_tokens: 16,
    temperature: 0,
  }),
  signal: AbortSignal.timeout(30_000),
});

const body = await response.text();
let parsed;
try {
  parsed = JSON.parse(body);
} catch {
  parsed = null;
}

console.log(`HTTP ${response.status} ${response.statusText}`);
if (!response.ok) {
  console.error(parsed?.error?.message ?? body.slice(0, 1000));
  process.exitCode = 1;
} else {
  const message = parsed?.choices?.[0]?.message?.content;
  console.log(message ?? body.slice(0, 1000));
}
