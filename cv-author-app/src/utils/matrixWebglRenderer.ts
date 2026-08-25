import type { ChartPlotArea } from "../types";

/** Keep small matrices in SVG; switch to WebGL once the logical grid exceeds 5x5. */
export const MATRIX_WEBGL_CELL_BUDGET = 25 * 25;

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
  canvas.width = columns;
  canvas.height = rows;
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
  } catch {
    return null;
  }
  if (!gl) return null;
  const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if (columns > maxTextureSize || rows > maxTextureSize) return null;

  const vertex = shader(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec2 a_position;
    in vec2 a_texcoord;
    out vec2 v_texcoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texcoord = a_texcoord;
    }
  `);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    uniform sampler2D u_texture;
    in vec2 v_texcoord;
    out vec4 outColor;
    void main() { outColor = texture(u_texture, v_texcoord); }
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

  const positions = gl.createBuffer();
  const texcoords = gl.createBuffer();
  const texture = gl.createTexture();
  if (!positions || !texcoords || !texture) return null;

  const pixels = new Uint8Array(cellCount * 4);
  const xReversed = input.xRange[0] > input.xRange[1];
  const yReversed = input.yRange[0] > input.yRange[1];
  input.cells.forEach((cell) => {
    if (cell.rowIndex < 0 || cell.rowIndex >= rows || cell.columnIndex < 0 || cell.columnIndex >= columns) return;
    const pixelX = xReversed ? columns - 1 - cell.columnIndex : cell.columnIndex;
    const pixelY = yReversed ? cell.rowIndex : rows - 1 - cell.rowIndex;
    const offset = (pixelY * columns + pixelX) * 4;
    const rgba = colorToRgba(cell.color, cell.opacity);
    pixels[offset] = rgba[0]!;
    pixels[offset + 1] = rgba[1]!;
    pixels[offset + 2] = rgba[2]!;
    pixels[offset + 3] = rgba[3]!;
  });

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoords);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const texcoordLocation = gl.getAttribLocation(program, "a_texcoord");
  gl.enableVertexAttribArray(texcoordLocation);
  gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, columns, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  gl.viewport(0, 0, columns, rows);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const src = canvas.toDataURL("image/png");
  gl.deleteTexture(texture);
  gl.deleteBuffer(positions);
  gl.deleteBuffer(texcoords);
  gl.deleteProgram(program);

  return `<g data-chart-id="${escapeXml(input.chartId)}" data-chart-type="matrix" data-mark-role="cell" data-mark-group-id="mark-group:${escapeXml(input.chartId)}:cell" data-renderer="webgl-matrix@1" data-matrix-webgl="true" data-matrix-row-values="${escapeXml(JSON.stringify(input.rowValues))}" data-matrix-column-values="${escapeXml(JSON.stringify(input.columnValues))}"><image href="${escapeXml(src)}" x="${input.plotArea.x}" y="${input.plotArea.y}" width="${input.plotArea.width}" height="${input.plotArea.height}" preserveAspectRatio="none"/></g>`;
}
