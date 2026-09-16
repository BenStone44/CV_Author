import type { Bounds } from "../types";
import { invertMatrix, multiplyMatrix, transformPoint, type Matrix } from "../stores/canvas/coordinates";

export type WordCloudMask = {
  width: number;
  height: number;
  rows: string;
  coverage: number;
};

export function encodeWordCloudMask(mask: ArrayLike<number>, width: number, height: number) {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const runs: string[] = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const allowed = x < width && Number(mask[y * width + x]) > 0;
      if (allowed && start < 0) start = x;
      if (!allowed && start >= 0) {
        runs.push(`${start}-${x}`);
        start = -1;
      }
    }
    rows.push(runs.join(","));
  }
  return rows.join(";");
}

export function decodeWordCloudMask(rows: string, width: number, height: number) {
  const mask = new Uint8Array(width * height);
  rows.split(";").slice(0, height).forEach((row, y) => {
    row.split(",").forEach((run) => {
      if (!run) return;
      const [rawStart, rawEnd] = run.split("-").map(Number);
      const start = Math.max(0, Math.min(width, Math.floor(rawStart ?? 0)));
      const end = Math.max(start, Math.min(width, Math.ceil(rawEnd ?? start)));
      for (let x = start; x < end; x += 1) mask[y * width + x] = 1;
    });
  });
  return mask;
}

function domMatrix(matrix: DOMMatrix): Matrix {
  return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
}

function geometryContains(element: SVGGraphicsElement, point: { x: number; y: number }) {
  const geometry = element as SVGGraphicsElement & {
    isPointInFill?: (point: DOMPoint) => boolean;
    isPointInStroke?: (point: DOMPoint) => boolean;
  };
  if (typeof DOMPoint === "undefined") return false;
  const localPoint = new DOMPoint(point.x, point.y);
  try {
    if (geometry.isPointInFill?.(localPoint)) return true;
  } catch {
    // Some SVG elements expose the method but do not implement fill hit testing.
  }
  try {
    if (geometry.isPointInStroke?.(localPoint)) return true;
  } catch {
    // Fall through when stroke hit testing is unavailable.
  }
  return false;
}

export function sampleSvgWordCloudMask(
  elements: SVGGraphicsElement[],
  bounds: Bounds,
  scopeElement: SVGGraphicsElement,
  maximumDimension = 240,
): WordCloudMask | null {
  if (!elements.length || bounds.width <= 0 || bounds.height <= 0) return null;
  const scopeMatrix = scopeElement.getScreenCTM();
  if (!scopeMatrix) return null;
  const inverseScope = invertMatrix(domMatrix(scopeMatrix));
  if (!inverseScope) return null;
  const transforms = elements.flatMap((element) => {
    const screenMatrix = element.getScreenCTM();
    if (!screenMatrix) return [];
    const relative = multiplyMatrix(inverseScope, domMatrix(screenMatrix));
    const inverse = invertMatrix(relative);
    return inverse ? [{ element, inverse }] : [];
  });
  if (!transforms.length) return null;
  const scale = Math.min(1, maximumDimension / Math.max(bounds.width, bounds.height));
  const width = Math.max(8, Math.round(bounds.width * scale));
  const height = Math.max(8, Math.round(bounds.height * scale));
  const mask = new Uint8Array(width * height);
  let allowedCount = 0;
  for (let y = 0; y < height; y += 1) {
    const scopeY = bounds.minY + (y + 0.5) / height * bounds.height;
    for (let x = 0; x < width; x += 1) {
      const scopeX = bounds.minX + (x + 0.5) / width * bounds.width;
      const allowed = transforms.some(({ element, inverse }) =>
        geometryContains(element, transformPoint(inverse, { x: scopeX, y: scopeY })));
      if (!allowed) continue;
      mask[y * width + x] = 1;
      allowedCount += 1;
    }
  }
  if (!allowedCount) return null;
  return {
    width,
    height,
    rows: encodeWordCloudMask(mask, width, height),
    coverage: allowedCount / mask.length,
  };
}
