import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PROMPT_VERSION, REQUEST_VERSION, parseModelProgram, validateRenderRequest } from "./llm-schema.mjs";

const port = Number(process.env.LLM_API_PORT ?? 8787);
const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const model = process.env.OPENAI_MODEL ?? "gpt-5.4";
const apiKey = process.env.OPENAI_API_KEY;
const upstreamTimeoutMs = Number(process.env.LLM_API_TIMEOUT_MS ?? 90_000);
const cachePath = resolve(process.cwd(), ".llm-cache.json");
const cache = new Map();

if (!apiKey) console.warn("OPENAI_API_KEY is not set; /api/llm/render will return 503.");

async function loadCache() {
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) cache.set(key, value);
  } catch {
    // A missing or malformed cache is equivalent to an empty cache.
  }
}

async function saveCache() {
  await writeFile(cachePath, JSON.stringify(Object.fromEntries(cache), null, 2), "utf8");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function cacheKey(request) {
  const { requestId: _requestId, ...cacheableRequest } = request;
  return createHash("sha256").update(stable({ version: REQUEST_VERSION, promptVersion: PROMPT_VERSION, model, request: cacheableRequest })).digest("hex");
}

function provenance(requestId, key, cacheHit) {
  return {
    requestId,
    cacheKey: key,
    promptVersion: PROMPT_VERSION,
    requestVersion: REQUEST_VERSION,
    model,
    generatedAt: new Date().toISOString(),
    cacheHit,
  };
}

function systemPrompt() {
  return [
    "You generate a deterministic, reusable D3-compatible chart renderer program.",
    "Return JSON only: {\"program\":{\"code\":\"...\"}}.",
    "The code must define render({ d3, data, width, height, chartSpec }) and return { svg, marks }.",
    "Return the renderer code as the artifact, not a pre-rendered SVG and not raw data.",
    "The renderer will receive the current data later in a browser Worker; never expect data in the request input.",
    "svg must be an SVG fragment string with no script tags. marks must be an array where every visual mark has role, markType, and dataIndex when applicable.",
    "Use input.svg as the visual style and layout baseline, input.chartSpec.chartType as the chart type, input.xColumn and input.yColumn as the axis columns, and input.schema as the data schema and column statistics. Use examples only to infer formatting; render against runtime data passed to render().",
    "x and y are required positional encodings. For linegraph, input.chartSpec.series is optional: when absent, render all rows as one line; when present, group lines by that nominal field. For scatterplot, optional encodings are input.chartSpec.encodings.color (nominal or temporal), size (quantitative), and shape (nominal). Apply optional encodings only when present and keep sensible defaults when absent.",
    "The supplied d3 object is the complete D3 v7 API, including array, axis, time-format, scale, shape, and color helpers. Use only that d3 object and plain JavaScript. Do not import, fetch, access DOM, globals, or browser APIs.",
    "Keep output deterministic and escape data-derived text.",
  ].join("\n");
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function callModel(request) {
  if (!apiKey) throw Object.assign(new Error("Server API key is not configured."), { statusCode: 503 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 12_000,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: JSON.stringify({ input: request.input }) },
        ],
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body?.error?.message ?? `Upstream returned HTTP ${response.status}.`), { statusCode: 502 });
    const content = body?.choices?.[0]?.message?.content;
    return parseModelProgram(content);
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(
        new Error(`The model request exceeded the ${Math.ceil(upstreamTimeoutMs / 1000)} second timeout.`),
        { statusCode: 504 },
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function send(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function handleRender(request, response) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    send(response, 400, { error: error instanceof Error ? error.message : "Invalid JSON." });
    return;
  }
  const validationError = validateRenderRequest(body);
  if (validationError) {
    send(response, 400, { error: validationError });
    return;
  }
  const key = cacheKey(body);
  const cached = cache.get(key);
  if (cached) {
    send(response, 200, { ...cached, provenance: provenance(body.requestId, key, true) });
    return;
  }
  try {
    const program = await callModel(body);
    const payload = {
      status: "ready",
      program,
      metadata: { markSchema: ["role", "markType", "dataIndex"], sandbox: "worker-v1" },
      provenance: provenance(body.requestId, key, false),
    };
    cache.set(key, payload);
    await saveCache();
    send(response, 200, payload);
  } catch (error) {
    const status = Number(error?.statusCode) || 502;
    send(response, status, { status: "error", error: error instanceof Error ? error.message : "Unable to generate a renderer." });
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" });
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    send(response, 200, { status: "ok", model, upstream: baseUrl });
    return;
  }
  if (request.method === "POST" && request.url === "/api/llm/render") {
    await handleRender(request, response);
    return;
  }
  send(response, 404, { error: "Not found." });
});

await loadCache();
server.listen(port, "127.0.0.1", () => console.log(`LLM renderer API listening on http://127.0.0.1:${port}`));

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
