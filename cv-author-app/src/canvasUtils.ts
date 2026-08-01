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
  x: number, y: number, width: number, height: number, scaleX: number, scaleY: number,
): Bounds {
  return {
    minX: x,
    minY: y,
    maxX: x + width * scaleX,
    maxY: y + height * scaleY,
    width: width * scaleX,
    height: height * scaleY,
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
  return `translate(${node.x} ${node.y}) scale(${node.scaleX} ${node.scaleY})`;
}

export function getLeafNodeTransform(node: CanvasLeafNode) {
  return `translate(${node.x - node.contentMinX * node.scaleX} ${node.y - node.contentMinY * node.scaleY}) scale(${node.scaleX} ${node.scaleY})`;
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
  return { node, x, y, scaleX, scaleY, bounds: boundsFromNodeFrame(x, y, node.width, node.height, scaleX, scaleY) };
}

export function cloneCanvasNode(node: CanvasNode): CanvasNode {
  if (node.kind === "leaf") return { ...node };
  return { ...node, children: node.children.map((child) => cloneCanvasNode(child)) };
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
  let bounds = boundsFromNodeFrame(x, y, node.width, node.height, scaleX, scaleY);
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
