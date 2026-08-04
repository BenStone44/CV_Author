export const REQUEST_VERSION = "d3-render-request@2";
export const PROMPT_VERSION = "d3-renderer@3";

export function validateRenderRequest(value) {
  if (!value || typeof value !== "object") return "Request body must be an object.";
  if (typeof value.requestId !== "string" || value.requestId.length > 200) return "requestId is required.";
  const input = value.input;
  if (!input || typeof input !== "object") return "input is required.";
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height)) return "input.width and input.height are required.";
  if (typeof input.svg !== "string" || input.svg.length > 1_000_000) return "input.svg is required and must be at most 1MB.";
  for (const field of ["xColumn", "yColumn"]) {
    if (typeof input[field] !== "string" || input[field].trim().length === 0 || input[field].length > 200) return `input.${field} is required and must be a non-empty column name.`;
  }
  if (!Array.isArray(input.schema) || input.schema.length > 200) return "input.schema is required and must be an array of at most 200 columns.";
  for (const column of input.schema) {
    if (!column || typeof column !== "object" || typeof column.name !== "string" || !["nominal", "temporal", "quantitative"].includes(column.type)) return "input.schema contains an invalid column.";
    if (column.examples !== undefined && (!Array.isArray(column.examples) || column.examples.length > 5 || column.examples.some((example) => typeof example !== "string" || example.length > 200))) return "input.schema examples are invalid.";
    for (const field of ["rowCount", "nonEmptyCount", "distinctCount"]) {
      if (column[field] !== undefined && (!Number.isInteger(column[field]) || column[field] < 0 || column[field] > 1_000_000)) return "input.schema statistics are invalid.";
    }
    for (const field of ["min", "max"]) {
      if (column[field] !== undefined && !Number.isFinite(column[field])) return "input.schema numeric range is invalid.";
    }
  }
  if (input.data !== undefined) return "input.data must not be sent; data is supplied locally to the browser Worker.";
  return null;
}

export function validateProgram(program) {
  if (!program || typeof program !== "object" || typeof program.code !== "string") return "Model output must contain a code string.";
  const code = program.code.trim();
  if (code.length < 30 || code.length > 100_000) return "Generated code length is outside the allowed range.";
  if (!/(?:function\s+render|(?:const|let|var)\s+render\s*=)/.test(code)) return "Generated code must define render().";
  const forbidden = [
    /\b(?:import|export|require)\b/,
    /\b(?:eval|Function|AsyncFunction|GeneratorFunction)\s*\(/,
    /\b(?:fetch|XMLHttpRequest|WebSocket)\b/,
    /\b(?:document|window|globalThis|process|location|navigator|crypto|self)\b/,
    /\b(?:constructor|prototype|__proto__|WebAssembly|SharedArrayBuffer|Atomics)\b/,
    /\bd3\.(?:csv|json|text|xml|html|image|blob|select|selectAll|create)\b/,
    /<\s*script\b/i,
  ];
  if (forbidden.some((pattern) => pattern.test(code))) return "Generated code uses a forbidden browser or runtime API.";
  return null;
}

export function parseModelProgram(content) {
  const text = String(content ?? "").trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new Error("Model response was not valid JSON.");
  }
  const program = parsed?.program ?? parsed;
  const error = validateProgram(program);
  if (error) throw new Error(error);
  return { code: program.code.trim() };
}
