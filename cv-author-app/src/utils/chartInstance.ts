import type {
  Bounds,
  CanvasNode,
  ChartInstance,
  ChartInstanceBounds,
  ChartInstanceCoordinateSystem,
  ChartInstanceDocument,
  ChartInstanceId,
  ChartInstanceSpec,
  CompositeCompositionConfig,
  CompositeLayerConfig,
  CompositeNestedConfig,
  Point,
} from "../types";
import {
  collectNodeSelectionBounds,
  getPolarOccupiedGeometry,
} from "./canvasUtils";

type InstanceTransform = {
  parentX: number;
  parentY: number;
  parentScaleX: number;
  parentScaleY: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

function transformForNode(
  node: CanvasNode,
  parentX: number,
  parentY: number,
  parentScaleX: number,
  parentScaleY: number,
): InstanceTransform {
  return {
    parentX,
    parentY,
    parentScaleX,
    parentScaleY,
    x: parentX + node.x * parentScaleX,
    y: parentY + node.y * parentScaleY,
    scaleX: parentScaleX * node.scaleX,
    scaleY: parentScaleY * node.scaleY,
  };
}

function nodeLocalOrigin(node: CanvasNode, point: Point): Point {
  const minX = node.kind === "leaf" ? node.contentMinX : 0;
  const minY = node.kind === "leaf" ? node.contentMinY : 0;
  return { x: point.x - minX, y: point.y - minY };
}

function transformedPoint(node: CanvasNode, point: Point, transform: InstanceTransform): Point {
  const local = nodeLocalOrigin(node, point);
  const x = transform.x + local.x * transform.scaleX;
  const y = transform.y + local.y * transform.scaleY;
  const center = {
    x: transform.x + node.width * transform.scaleX / 2,
    y: transform.y + node.height * transform.scaleY / 2,
  };
  if (node.rotation === 0) return { x, y };
  const radians = node.rotation * Math.PI / 180;
  const dx = x - center.x;
  const dy = y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function transformedBounds(node: CanvasNode, localBounds: Bounds, transform: InstanceTransform): Bounds {
  const min = transformedPoint(node, { x: localBounds.minX, y: localBounds.minY }, transform);
  const max = transformedPoint(node, { x: localBounds.maxX, y: localBounds.maxY }, transform);
  const other = [
    transformedPoint(node, { x: localBounds.minX, y: localBounds.maxY }, transform),
    transformedPoint(node, { x: localBounds.maxX, y: localBounds.minY }, transform),
  ];
  const points = [min, max, ...other];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function angleWithinSpan(angle: number, startAngle: number, angleSpan: number) {
  if (angleSpan >= 360) return true;
  const normalized = ((angle - startAngle) % 360 + 360) % 360;
  return normalized <= angleSpan;
}

function polarPoint(origin: Point, radius: number, angle: number): Point {
  const radians = angle * Math.PI / 180;
  return {
    x: origin.x + Math.cos(radians) * radius,
    y: origin.y + Math.sin(radians) * radius,
  };
}

function polarEnvelope(
  node: CanvasNode,
  polar: NonNullable<ReturnType<typeof getPolarOccupiedGeometry>>,
  transform: InstanceTransform,
): Bounds {
  const angles = [polar.startAngle, polar.endAngle, 0, 90, 180, 270]
    .filter((angle, index, values) =>
      angleWithinSpan(angle, polar.startAngle, polar.angleSpan)
      && values.indexOf(angle) === index,
    );
  const points = angles.flatMap((angle) => [
    transformedPoint(node, polarPoint(polar.origin, polar.outerRadius, angle), transform),
    ...(polar.innerRadius > 0
      ? [transformedPoint(node, polarPoint(polar.origin, polar.innerRadius, angle), transform)]
      : []),
  ]);
  if (polar.innerRadius <= 0) points.push(transformedPoint(node, polar.origin, transform));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function coordinateSystemFor(node: CanvasNode): ChartInstanceCoordinateSystem {
  return node.coordinateGuide?.type === "Polar" || node.coordinateSystem?.type === "Polar"
    ? "Polar"
    : "Cartesian";
}

function defaultComposition(node: CanvasNode): CompositeCompositionConfig {
  return {
    id: `composition:${node.id}`,
    type: "layer",
    sharedChannels: [],
  };
}

function compositionConfig(node: CanvasNode): CompositeCompositionConfig {
  if (!node.compositionSpec) return defaultComposition(node);
  const { members: _members, ...config } = node.compositionSpec;
  return config;
}

function layerConfig(node: CanvasNode): CompositeLayerConfig | undefined {
  if (!node.layerSpec) return undefined;
  const { children: _children, ...config } = node.layerSpec;
  return config;
}

function nestedConfig(node: CanvasNode, parentInstanceId?: ChartInstanceId): CompositeNestedConfig | undefined {
  if (!node.nestedSpec) return undefined;
  const { parentChartNodeId: _parentChartNodeId, ...config } = node.nestedSpec;
  return { ...config, ...(parentInstanceId ? { parentInstanceId } : {}) };
}

function isCompositeNode(node: CanvasNode) {
  return !!node.layerSpec
    || !!node.compositionSpec
    || !!node.nestedSpec
    || (node.kind === "group" && node.children.some(isChartInstanceNode));
}

function isChartInstanceNode(node: CanvasNode) {
  return isCompositeNode(node) || !!node.chartSpec;
}

function renderNodeSnapshot(node: CanvasNode): CanvasNode {
  if (node.kind === "group") return { ...node, children: [] };
  return { ...node };
}

function instanceBounds(node: CanvasNode, transform: InstanceTransform): ChartInstanceBounds {
  // This is the same selection-box calculation used by the canvas object.
  // Its leaf geometry is backed by `.canvas-object-hit-target` bounds.
  const outer = collectNodeSelectionBounds(
    node,
    transform.parentX,
    transform.parentY,
    transform.parentScaleX,
    transform.parentScaleY,
  );
  const polar = getPolarOccupiedGeometry(node);
  if (polar) {
    const polarOuter = polarEnvelope(node, polar, transform);
    return {
      space: "canvas",
      outer: polarOuter,
      coordinate: {
        type: "Polar",
        origin: transformedPoint(node, polar.origin, transform),
        innerRadius: polar.innerRadius * Math.min(Math.abs(transform.scaleX), Math.abs(transform.scaleY)),
        outerRadius: polar.outerRadius * Math.min(Math.abs(transform.scaleX), Math.abs(transform.scaleY)),
        startAngle: polar.startAngle + node.rotation,
        endAngle: polar.endAngle + node.rotation,
        angleSpan: polar.angleSpan,
        envelope: polarOuter,
      },
      inner: { marks: polarOuter },
    };
  }
  const plotArea = node.chartSpec?.plotArea;
  const plot = plotArea
    ? transformedBounds(node, {
      minX: plotArea.x,
      minY: plotArea.y,
      maxX: plotArea.x + plotArea.width,
      maxY: plotArea.y + plotArea.height,
      width: plotArea.width,
      height: plotArea.height,
    }, transform)
    : outer;
  return {
    space: "canvas",
    outer,
    coordinate: { type: "Cartesian", plot },
    inner: { marks: outer },
  };
}

function instanceSpec(node: CanvasNode, memberInstanceIds: ChartInstanceId[], parentInstanceId?: ChartInstanceId): ChartInstanceSpec {
  if (!isCompositeNode(node)) {
    if (!node.chartSpec) {
      throw new Error(`Chart node ${node.id} has no ChartSpec`);
    }
    return { kind: "chart", chart: node.chartSpec };
  }
  const nested = nestedConfig(node, parentInstanceId);
  if (nested) {
    return {
      kind: "composite",
      composite: {
        type: "nested",
        composition: node.compositionSpec ? compositionConfig(node) : undefined,
        nested,
        memberInstanceIds,
      },
    };
  }
  const composition = compositionConfig(node);
  return {
    kind: "composite",
    composite: {
      type: composition.type === "nested" ? "layer" : composition.type,
      composition,
      layer: layerConfig(node),
      memberInstanceIds,
    },
  };
}

export type ChartInstanceBuildOptions = {
  parentInstanceId?: ChartInstanceId;
  parentX?: number;
  parentY?: number;
  parentScaleX?: number;
  parentScaleY?: number;
  revision?: number;
};

export function createChartInstance(node: CanvasNode, options: ChartInstanceBuildOptions = {}): ChartInstance {
  const parentInstanceId = options.parentInstanceId;
  const transform = transformForNode(
    node,
    options.parentX ?? 0,
    options.parentY ?? 0,
    options.parentScaleX ?? 1,
    options.parentScaleY ?? 1,
  );
  const memberInstanceIds = node.kind === "group"
    ? node.children.filter(isChartInstanceNode).map((child) => child.id)
    : [];
  const composite = isCompositeNode(node);
  return {
    id: node.id,
    nodeId: node.id,
    kind: node.nestedSpec
      ? "nested-child"
      : composite
        ? (parentInstanceId ? "composite-member" : "composite-root")
        : parentInstanceId ? "composite-member" : "single",
    datasetId: node.layerSpec?.datasetId ?? node.chartSpec?.datasetId ?? null,
    coordinateSystem: coordinateSystemFor(node),
    spec: instanceSpec(node, memberInstanceIds, parentInstanceId),
    renderNode: renderNodeSnapshot(node),
    bounds: instanceBounds(node, transform),
    ...(parentInstanceId ? { parentInstanceId } : {}),
    ...(node.compositionSpec?.id ? { compositionId: node.compositionSpec.id } : {}),
    revision: options.revision ?? 0,
  };
}

export function createChartInstanceDocument(nodes: CanvasNode[], revision = 0): ChartInstanceDocument {
  const instances: ChartInstance[] = [];
  const visit = (
    node: CanvasNode,
    options: ChartInstanceBuildOptions = {},
  ) => {
    if (!isChartInstanceNode(node)) return;
    instances.push(createChartInstance(node, { ...options, revision }));
    if (node.kind !== "group") return;
    const transform = transformForNode(
      node,
      options.parentX ?? 0,
      options.parentY ?? 0,
      options.parentScaleX ?? 1,
      options.parentScaleY ?? 1,
    );
    node.children.filter(isChartInstanceNode).forEach((child) => visit(child, {
      parentInstanceId: node.id,
      parentX: transform.x,
      parentY: transform.y,
      parentScaleX: transform.scaleX,
      parentScaleY: transform.scaleY,
    }));
  };
  nodes.forEach((node) => visit(node));
  return {
    version: 1,
    coordinateSpace: "canvas",
    rootInstanceIds: nodes.filter(isChartInstanceNode).map((node) => node.id),
    instances,
  };
}

/** Reconstructs the CanvasNode renderer projection from the canonical instance list. */
export function restoreCanvasNodesFromChartInstanceDocument(document: ChartInstanceDocument): CanvasNode[] {
  const instancesById = new Map(document.instances.map((instance) => [instance.id, instance]));
  const nodesById = new Map<string, CanvasNode>();
  document.instances.forEach((instance) => {
    const node = instance.renderNode;
    nodesById.set(instance.id, node.kind === "group" ? { ...node, children: [] } : { ...node });
  });
  document.instances.forEach((instance) => {
    const node = nodesById.get(instance.id);
    if (!node || node.kind !== "group" || instance.spec.kind !== "composite") return;
    const childIds = instance.spec.composite.memberInstanceIds;
    node.children = childIds
      .map((childId) => {
        if (!instancesById.has(childId)) return null;
        return nodesById.get(childId) ?? null;
      })
      .filter((child): child is CanvasNode => !!child);
  });
  return document.rootInstanceIds
    .map((rootId) => nodesById.get(rootId) ?? null)
    .filter((node): node is CanvasNode => !!node);
}
