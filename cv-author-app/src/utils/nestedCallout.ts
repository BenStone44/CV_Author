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
  outlinePath: string;
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
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const radius = Math.min(8, halfWidth / 2, halfHeight / 2);
  const outside = Math.abs(towardParent.x) > halfWidth || Math.abs(towardParent.y) > halfHeight;
  const horizontal = Math.abs(towardParent.x) / halfWidth > Math.abs(towardParent.y) / halfHeight;
  const tailSide = !outside ? -1 : horizontal ? (towardParent.x > 0 ? 1 : 3) : (towardParent.y > 0 ? 2 : 0);
  const edgeFactor = outside ? Math.min(
    towardParent.x ? halfWidth / Math.abs(towardParent.x) : Infinity,
    towardParent.y ? halfHeight / Math.abs(towardParent.y) : Infinity,
  ) : 0;
  const edgePoint = { x: towardParent.x * edgeFactor, y: towardParent.y * edgeFactor };
  const absolute = (point: Point) => {
    const rotated = rotate(point, child.rotation);
    return pathPoint({ x: center.x + rotated.x, y: center.y + rotated.y });
  };
  const path = [`M ${absolute({ x: -halfWidth + radius, y: -halfHeight })}`];
  // Traverse the rounded rectangle clockwise. Replace one segment of its
  // perimeter with the two sides of the tail, leaving no internal base seam.
  const edge = (side: number, start: Point, end: Point) => {
    if (side === tailSide) {
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const unit = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
      const halfBase = Math.min(10, Math.min(width, height) * 0.08, length / 4);
      const projection = (edgePoint.x - start.x) * unit.x + (edgePoint.y - start.y) * unit.y;
      const position = Math.max(halfBase, Math.min(length - halfBase, projection));
      const at = (distance: number) => absolute({ x: start.x + unit.x * distance, y: start.y + unit.y * distance });
      path.push(`L ${at(position - halfBase)} L ${pathPoint(parentAnchor)} L ${at(position + halfBase)}`);
    }
    path.push(`L ${absolute(end)}`);
  };
  const corner = (control: Point, end: Point) => path.push(`Q ${absolute(control)} ${absolute(end)}`);
  edge(0, { x: -halfWidth + radius, y: -halfHeight }, { x: halfWidth - radius, y: -halfHeight });
  corner({ x: halfWidth, y: -halfHeight }, { x: halfWidth, y: -halfHeight + radius });
  edge(1, { x: halfWidth, y: -halfHeight + radius }, { x: halfWidth, y: halfHeight - radius });
  corner({ x: halfWidth, y: halfHeight }, { x: halfWidth - radius, y: halfHeight });
  edge(2, { x: halfWidth - radius, y: halfHeight }, { x: -halfWidth + radius, y: halfHeight });
  corner({ x: -halfWidth, y: halfHeight }, { x: -halfWidth, y: halfHeight - radius });
  edge(3, { x: -halfWidth, y: halfHeight - radius }, { x: -halfWidth, y: -halfHeight + radius });
  corner({ x: -halfWidth, y: -halfHeight }, { x: -halfWidth + radius, y: -halfHeight });
  path.push("Z");
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
    outlinePath: path.join(" "),
  };
}
