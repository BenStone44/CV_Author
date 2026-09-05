import type { NestedCalloutSpec, Point, RelativeNestedParameters } from "../types";

export const defaultNestedCallout: NestedCalloutSpec = {
  enabled: false,
  scale: 1.2,
};

export type NestedCalloutChildFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export type NestedCalloutGeometry = {
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    center: Point;
    rotation: number;
  };
  parentAnchor: Point;
  arrowPath: string;
};

export function normalizeNestedCallout(value: Partial<NestedCalloutSpec> | null | undefined): NestedCalloutSpec {
  const scale = Number(value?.scale);
  return {
    enabled: value?.enabled === true,
    scale: Number.isFinite(scale) ? Math.max(1.05, Math.min(scale, 3)) : defaultNestedCallout.scale,
  };
}

function rotate(point: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function pathPoint(point: Point) {
  return `${point.x} ${point.y}`;
}

/**
 * Resolve a relationship-owned message frame in the same coordinate space as
 * the already positioned child. The frame expands around the child center,
 * while the arrow tip removes the relationship offset to recover the actual
 * parent anchor.
 */
export function nestedCalloutGeometry(
  child: NestedCalloutChildFrame,
  parameters: RelativeNestedParameters,
): NestedCalloutGeometry | null {
  const callout = normalizeNestedCallout(parameters.callout);
  if (!callout.enabled) return null;
  const childWidth = Math.abs(child.width * child.scaleX);
  const childHeight = Math.abs(child.height * child.scaleY);
  if (!(childWidth > 0 && childHeight > 0)) return null;
  const center = {
    x: child.x + childWidth / 2,
    y: child.y + childHeight / 2,
  };
  const width = childWidth * callout.scale;
  const height = childHeight * callout.scale;
  const childAnchorVector = rotate({
    x: (parameters.childAnchor.x - 0.5) * childWidth,
    y: (parameters.childAnchor.y - 0.5) * childHeight,
  }, child.rotation);
  const resolvedChildAnchor = {
    x: center.x + childAnchorVector.x,
    y: center.y + childAnchorVector.y,
  };
  const parentRotation = child.rotation - parameters.rotation;
  const offset = rotate(parameters.offset, parentRotation);
  const parentAnchor = {
    x: resolvedChildAnchor.x - offset.x,
    y: resolvedChildAnchor.y - offset.y,
  };

  const towardParent = rotate({
    x: parentAnchor.x - center.x,
    y: parentAnchor.y - center.y,
  }, -child.rotation);
  const dx = Math.abs(towardParent.x) < 0.0001 && Math.abs(towardParent.y) < 0.0001
    ? 0
    : towardParent.x;
  const dy = Math.abs(towardParent.x) < 0.0001 && Math.abs(towardParent.y) < 0.0001
    ? -1
    : towardParent.y;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const edgeFactor = Math.min(
    Math.abs(dx) > 0.0001 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY,
    Math.abs(dy) > 0.0001 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );
  const edgeLocal = { x: dx * edgeFactor, y: dy * edgeFactor };
  const edgeVector = rotate(edgeLocal, child.rotation);
  const edge = { x: center.x + edgeVector.x, y: center.y + edgeVector.y };
  const length = Math.max(Math.hypot(parentAnchor.x - center.x, parentAnchor.y - center.y), 0.0001);
  const tangent = {
    x: -(parentAnchor.y - center.y) / length,
    y: (parentAnchor.x - center.x) / length,
  };
  const halfBase = Math.max(4, Math.min(10, Math.min(width, height) * 0.08));
  const first = { x: edge.x + tangent.x * halfBase, y: edge.y + tangent.y * halfBase };
  const second = { x: edge.x - tangent.x * halfBase, y: edge.y - tangent.y * halfBase };
  return {
    frame: {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      center,
      rotation: child.rotation,
    },
    parentAnchor,
    arrowPath: `M ${pathPoint(first)} L ${pathPoint(parentAnchor)} L ${pathPoint(second)} Z`,
  };
}
