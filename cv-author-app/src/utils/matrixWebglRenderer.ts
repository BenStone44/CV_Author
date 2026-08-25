import type { ChartPlotArea } from "../types";

/** Matrix cells are submitted as two triangles per cell in one WebGL draw call. */
export const MATRIX_WEBGL_CELL_BUDGET = 0;

export type MatrixWebglCell = {
  rowIndex: number;
  columnIndex: number;
  color: string;
  opacity: number;
};

export type MatrixWebglInput = {
  chartId: string;
  plotArea: ChartPlotArea;
  rowValues: string[];
  columnValues: string[];
  xRange: [number, number];
  yRange: [number, number];
  cells: MatrixWebglCell[];
  /** Transparent SVG marks retain semantic hit targets over the WebGL image. */
  overlayMarkup?: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function colorToRgba(color: string, opacity: number) {
  const normalized = color.trim().toLowerCase();
  const hex = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3
      ? hex.split("").map((value) => `${value}${value}`).join("")
      : hex;
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
      Math.round(Math.max(0, Math.min(1, opacity)) * 255),
    ];
  }
  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/)?.[1]?.split(",").map((value) => Number.parseFloat(value.trim()));
  if (rgb && rgb.length >= 3 && rgb.every((value, index) => index > 2 || Number.isFinite(value))) {
    const sourceAlpha = rgb[3] === undefined || !Number.isFinite(rgb[3]) ? 1 : rgb[3];
    return [
      Math.round(Math.max(0, Math.min(255, rgb[0] ?? 0))),
      Math.round(Math.max(0, Math.min(255, rgb[1] ?? 0))),
      Math.round(Math.max(0, Math.min(255, rgb[2] ?? 0))),
      Math.round(Math.max(0, Math.min(1, opacity * sourceAlpha)) * 255),
    ];
  }
  return [37, 99, 235, Math.round(Math.max(0, Math.min(1, opacity)) * 255)];
}

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const value = gl.createShader(type);
  if (!value) return null;
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    gl.deleteShader(value);
    return null;
  }
  return value;
}

export function renderMatrixWebgl(input: MatrixWebglInput): string | null {
  if (typeof document === "undefined") return null;
  const rows = input.rowValues.length;
  const columns = input.columnValues.length;
  const cellCount = rows * columns;
  if (rows === 0 || columns === 0 || cellCount <= MATRIX_WEBGL_CELL_BUDGET) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(input.plotArea.width));
  canvas.height = Math.max(1, Math.ceil(input.plotArea.height));
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
  } catch {
    return null;
  }
  if (!gl) return null;
  const vertex = shader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec2 a_position;
    in vec4 a_color;
    out vec4 v_color;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_color = a_color;
    }
  `);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    in vec4 v_color;
    out vec4 outColor;
    void main() { outColor = v_color; }
  `);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const vertices: number[] = [];
  const xReversed = input.xRange[0] > input.xRange[1];
  const yReversed = input.yRange[0] > input.yRange[1];
  const width = canvas.width;
  const height = canvas.height;
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  const appendVertex = (x: number, y: number, rgba: number[]) => {
    vertices.push(
      (x / width) * 2 - 1,
      1 - (y / height) * 2,
      (rgba[0] ?? 0) / 255,
      (rgba[1] ?? 0) / 255,
      (rgba[2] ?? 0) / 255,
      (rgba[3] ?? 0) / 255,
    );
  };

  input.cells.forEach((cell) => {
    if (cell.rowIndex < 0 || cell.rowIndex >= rows || cell.columnIndex < 0 || cell.columnIndex >= columns) return;
    const pixelX = xReversed ? columns - 1 - cell.columnIndex : cell.columnIndex;
    const pixelY = yReversed ? cell.rowIndex : rows - 1 - cell.rowIndex;
    const rgba = colorToRgba(cell.color, cell.opacity);
    const left = pixelX * cellWidth;
    const right = (pixelX + 1) * cellWidth;
    const top = pixelY * cellHeight;
    const bottom = (pixelY + 1) * cellHeight;
    // A rectangle is two triangles. The interleaved position/color buffer lets
    // the GPU rasterize every populated cell in a single drawArrays call.
    appendVertex(left, top, rgba);
    appendVertex(right, top, rgba);
    appendVertex(left, bottom, rgba);
    appendVertex(left, bottom, rgba);
    appendVertex(right, top, rgba);
    appendVertex(right, bottom, rgba);
  });

  const buffer = gl.createBuffer();
  if (!buffer || vertices.length === 0) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const colorLocation = gl.getAttribLocation(program, "a_color");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 24, 8);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  const src = canvas.toDataURL("image/png");
  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);

  return `<g data-chart-id="${escapeXml(input.chartId)}" data-chart-type="matrix" data-mark-group-id="mark-group:${escapeXml(input.chartId)}:cell" data-renderer="webgl-matrix@2" data-matrix-webgl="true" data-matrix-row-values="${escapeXml(JSON.stringify(input.rowValues))}" data-matrix-column-values="${escapeXml(JSON.stringify(input.columnValues))}"><image href="${escapeXml(src)}" x="${input.plotArea.x}" y="${input.plotArea.y}" width="${input.plotArea.width}" height="${input.plotArea.height}" preserveAspectRatio="none"/>${input.overlayMarkup ?? ""}</g>`;
}
