import type {
  CanvasNode,
  CanvasLeafNode,
  Bounds,
  Point,
  AbsoluteNodeFrame,
} from "./types";

export function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function normalizeBounds(firstPoint: Point, secondPoint: Point): Bounds {
  const minX = Math.min(firstPoint.x, secondPoint.x);
  const minY = Math.min(firstPoint.y, secondPoint.y);
  const maxX = Math.max(firstPoint.x, secondPoint.x);
  const maxY = Math.max(firstPoint.y, secondPoint.y);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function boundsFromNodeFrame(
  x: number, y: number, width: number, height: number, scaleX: number, scaleY: number, rotation = 0,
): Bounds {
  if (rotation === 0) {
    return {
      minX: x,
      minY: y,
      maxX: x + width * scaleX,
      maxY: y + height * scaleY,
      width: width * scaleX,
      height: height * scaleY,
    };
  }
  const radians = rotation * Math.PI / 180;
  const cx = x + width * scaleX / 2;
  const cy = y + height * scaleY / 2;
  const corners: Array<{ x: number; y: number }> = [
    { x, y }, { x: x + width * scaleX, y },
    { x, y: y + height * scaleY }, { x: x + width * scaleX, y: y + height * scaleY },
  ].map(({ x: px, y: py }) => {
    const dx = px - cx; const dy = py - cy;
    return { x: cx + dx * Math.cos(radians) - dy * Math.sin(radians), y: cy + dx * Math.sin(radians) + dy * Math.cos(radians) };
  });
  const minX = Math.min(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxX = Math.max(...corners.map((p) => p.x));
  const maxY = Math.max(...corners.map((p) => p.y));
  return {
    minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY,
  };
}

export function mergeBounds(current: Bounds | null, next: Bounds): Bounds {
  if (!current) return next;
  const minX = Math.min(current.minX, next.minX);
  const minY = Math.min(current.minY, next.minY);
  const maxX = Math.max(current.maxX, next.maxX);
  const maxY = Math.max(current.maxY, next.maxY);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function getNodeTransform(node: CanvasNode) {
  const cx = node.width / 2;
  const cy = node.height / 2;
  return `translate(${node.x + cx * node.scaleX} ${node.y + cy * node.scaleY}) rotate(${node.rotation}) scale(${node.scaleX} ${node.scaleY}) translate(${-cx} ${-cy})`;
}

export function getLeafNodeTransform(node: CanvasLeafNode) {
  const cx = node.contentMinX + node.width / 2;
  const cy = node.contentMinY + node.height / 2;
  return `translate(${node.x + node.width * node.scaleX / 2} ${node.y + node.height * node.scaleY / 2}) rotate(${node.rotation}) scale(${node.scaleX} ${node.scaleY}) translate(${-cx} ${-cy})`;
}

export function computeAbsoluteFrame(
  node: CanvasNode,
  parentX = 0,
  parentY = 0,
  parentScaleX = 1,
  parentScaleY = 1,
): AbsoluteNodeFrame {
  const x = parentX + node.x * parentScaleX;
  const y = parentY + node.y * parentScaleY;
  const scaleX = parentScaleX * node.scaleX;
  const scaleY = parentScaleY * node.scaleY;
  return { node, x, y, scaleX, scaleY, bounds: boundsFromNodeFrame(x, y, node.width, node.height, scaleX, scaleY, node.rotation) };
}

export function cloneCanvasNode(node: CanvasNode): CanvasNode {
  const coordinateGuide = node.coordinateGuide
    ? { ...node.coordinateGuide, origin: { ...node.coordinateGuide.origin } }
    : node.coordinateGuide;
  if (node.kind === "leaf") return { ...node, coordinateGuide };
  return {
    ...node,
    coordinateGuide,
    children: node.children.map((child) => cloneCanvasNode(child)),
  };
}

export function collectNodeBounds(
  node: CanvasNode,
  parentX = 0,
  parentY = 0,
  parentScaleX = 1,
  parentScaleY = 1,
): Bounds {
  const x = parentX + node.x * parentScaleX;
  const y = parentY + node.y * parentScaleY;
  const scaleX = parentScaleX * node.scaleX;
  const scaleY = parentScaleY * node.scaleY;
  let bounds = boundsFromNodeFrame(x, y, node.width, node.height, scaleX, scaleY, node.rotation);
  if (node.kind === "group") {
    let merged: Bounds | null = null;
    node.children.forEach((child) => {
      merged = mergeBounds(merged, collectNodeBounds(child, x, y, scaleX, scaleY));
    });
    if (merged) bounds = merged;
  }
  return bounds;
}

export function computeBounds(nodes: CanvasNode[], ids: string[]): Bounds | null {
  if (ids.length === 0) return null;
  let merged: Bounds | null = null;
  ids.forEach((id) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    merged = mergeBounds(merged, collectNodeBounds(node));
  });
  return merged;
}

function serializeCanvasNode(node: CanvasNode): string {
  const transform = node.kind === "leaf"
    ? getLeafNodeTransform(node)
    : getNodeTransform(node);
  const content = node.kind === "leaf"
    ? node.content
    : node.children.map((child) => serializeCanvasNode(child)).join("");
  return `<g transform="${transform}">${content}</g>`;
}

export function createCanvasNodesSvgMarkup(nodes: CanvasNode[], bounds: Bounds): string {
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const normalizedNodes = nodes.map((node) => {
    const clone = cloneCanvasNode(node);
    clone.x -= bounds.minX;
    clone.y -= bounds.minY;
    return clone;
  });
  const content = normalizedNodes.map((node) => serializeCanvasNode(node)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${content}</svg>`;
}
