import * as d3 from "d3";
import type { ChartSpec, GeneratedMarkMetadata } from "../types";

const forbidden = [
  /\b(?:import|export|require)\b/,
  /\b(?:eval|Function|AsyncFunction|GeneratorFunction)\s*\(/,
  /\b(?:fetch|XMLHttpRequest|WebSocket|importScripts|setTimeout|setInterval)\b/,
  /\b(?:document|window|globalThis|process|location|navigator|crypto|self|postMessage)\b/,
  /\b(?:constructor|prototype|__proto__|WebAssembly|SharedArrayBuffer|Atomics)\b/,
  /\bd3\.(?:csv|json|text|xml|html|image|blob|select|selectAll|create)\b/,
  /<\s*script\b/i,
];

function validateCode(code: string) {
  if (code.length < 30 || code.length > 100_000) throw new Error("Generated code length is outside the allowed range.");
  if (!/(?:function\s+render|(?:const|let|var)\s+render\s*=)/.test(code)) throw new Error("Generated code must define render().");
  if (forbidden.some((pattern) => pattern.test(code))) throw new Error("Generated code uses a forbidden API.");
}

function validateResult(value: unknown): { svg: string; marks: GeneratedMarkMetadata[] } {
  if (!value || typeof value !== "object") throw new Error("Renderer did not return an object.");
  const output = value as { svg?: unknown; marks?: unknown };
  if (typeof output.svg !== "string" || output.svg.length > 1_000_000 || !isSafeSvg(output.svg)) throw new Error("Renderer returned invalid or unsafe SVG.");
  if (!Array.isArray(output.marks)) throw new Error("Renderer must return mark metadata.");
  const marks = output.marks.filter((mark): mark is GeneratedMarkMetadata => !!mark && typeof mark === "object")
    .map((mark) => ({ ...mark }))
    .filter((mark) => typeof mark.role === "string" && typeof mark.markType === "string");
  if (marks.length !== output.marks.length) throw new Error("Every mark must include role and markType metadata.");
  return { svg: output.svg, marks };
}

function isSafeSvg(svg: string) {
  // The content is later inserted with innerHTML, so reject active or embedded content
  // before it leaves the worker. Normal SVG presentation attributes remain allowed.
  if (/<\s*(?:script|foreignObject|iframe|object|embed|audio|video|link)\b/i.test(svg)) return false;
  if (/\bon[a-z][\w:-]*\s*=\s*(?:["'][^"']*["']|[^\s>]+)/i.test(svg)) return false;
  if (/(?:javascript|vbscript)\s*:/i.test(svg)) return false;
  if (/(?:href|xlink:href|src)\s*=\s*["']\s*(?:data:|https?:|\/\/)/i.test(svg)) return false;
  return true;
}

self.onmessage = (event: MessageEvent<{ code: string; data: Record<string, string>[]; width: number; height: number; chartSpec?: ChartSpec }>) => {
  try {
    const { code, data, width, height, chartSpec } = event.data;
    validateCode(code);
    const factory = new Function("d3", "data", "width", "height", "chartSpec", `"use strict";${code};return render;`);
    const render = factory(d3, data, width, height, chartSpec);
    if (typeof render !== "function") throw new Error("Generated code did not define render().");
    const result = render({ d3, data, width, height, chartSpec });
    self.postMessage({ ok: true, result: validateResult(result) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Renderer execution failed." });
  }
};
