import type {
  CanvasNode,
  CanvasLeafNode,
  Bounds,
  Point,
  AbsoluteNodeFrame,
  ChartSpec,
} from "../types";
import { getChartEncodingSchema } from "./chartEncodingSchemas";

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
  if (current.minX === next.minX
    && current.minY === next.minY
    && current.maxX === next.maxX
    && current.maxY === next.maxY) return current;
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

export function getNodeVisualBounds(node: CanvasNode) {
  const baseMinX = node.kind === "leaf" ? node.contentMinX : 0;
  const baseMinY = node.kind === "leaf" ? node.contentMinY : 0;
  const baseMaxX = baseMinX + node.width;
  const baseMaxY = baseMinY + node.height;
  const plotArea = node.coordinateGuide?.type === "Cartesian"
    ? node.chartSpec?.plotArea
    : undefined;
  if (node.renderedContent && plotArea) {
    return {
      minX: plotArea.x - 48,
      minY: plotArea.y - 32,
      maxX: plotArea.x + plotArea.width + 16,
      maxY: plotArea.y + plotArea.height + 48,
    };
  }
  return {
    minX: Math.min(baseMinX, plotArea?.x ?? baseMinX),
    minY: Math.min(baseMinY, plotArea?.y ?? baseMinY),
    maxX: Math.max(baseMaxX, (plotArea?.x ?? baseMinX) + (plotArea?.width ?? 0)),
    maxY: Math.max(baseMaxY, (plotArea?.y ?? baseMinY) + (plotArea?.height ?? 0)),
  };
}

export function getNodeVisualSize(node: CanvasNode) {
  const bounds = getNodeVisualBounds(node);
  return { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

export type PolarOccupiedGeometry = {
  origin: Point;
  startAngle: number;
  endAngle: number;
  angleSpan: number;
  innerRadius: number;
  outerRadius: number;
  bounds: Bounds;
  path: string;
};

function polarPoint(origin: Point, radius: number, angle: number): Point {
  const radians = angle * Math.PI / 180;
  return {
    x: origin.x + Math.cos(radians) * radius,
    y: origin.y + Math.sin(radians) * radius,
  };
}

function angleWithinClockwiseSpan(angle: number, startAngle: number, angleSpan: number) {
  if (angleSpan >= 360 - 0.0001) return true;
  const offset = ((angle - startAngle) % 360 + 360) % 360;
  return offset <= angleSpan + 0.0001;
}

function polarOccupiedPath(
  origin: Point,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  angleSpan: number,
) {
  const startOuter = polarPoint(origin, outerRadius, startAngle);
  if (angleSpan >= 360 - 0.0001) {
    const oppositeOuter = polarPoint(origin, outerRadius, startAngle + 180);
    const outer = `M ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 1 1 ${oppositeOuter.x} ${oppositeOuter.y} A ${outerRadius} ${outerRadius} 0 1 1 ${startOuter.x} ${startOuter.y} Z`;
    if (innerRadius <= 0.0001) return outer;
    const startInner = polarPoint(origin, innerRadius, startAngle);
    const oppositeInner = polarPoint(origin, innerRadius, startAngle + 180);
    return `${outer} M ${startInner.x} ${startInner.y} A ${innerRadius} ${innerRadius} 0 1 0 ${oppositeInner.x} ${oppositeInner.y} A ${innerRadius} ${innerRadius} 0 1 0 ${startInner.x} ${startInner.y} Z`;
  }

  const endAngle = startAngle + angleSpan;
  const endOuter = polarPoint(origin, outerRadius, endAngle);
  const largeArc = angleSpan > 180 ? 1 : 0;
  if (innerRadius <= 0.0001) {
    return `M ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y} L ${origin.x} ${origin.y} Z`;
  }
  const endInner = polarPoint(origin, innerRadius, endAngle);
  const startInner = polarPoint(origin, innerRadius, startAngle);
  return `M ${startOuter.x} ${startOuter.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y} L ${endInner.x} ${endInner.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y} Z`;
}

/**
 * Resolves the occupied polar region in node-local coordinates. Prefer the
 * renderer's final radii (including Donut holes and ring gaps); older nodes
 * fall back to reversing the radial-concat ratio from the saved plot area.
 */
export function getPolarOccupiedGeometry(node: CanvasNode): PolarOccupiedGeometry | null {
  const guide = node.coordinateGuide;
  const plotArea = node.chartSpec?.plotArea;
  const polarGuide = guide?.type === "Polar" ? guide : null;
  const chartSchema = node.chartSpec ? getChartEncodingSchema(node.chartSpec.chartType) : null;
  const declaredPolar = node.coordinateSystem?.type === "Polar"
    || chartSchema?.coordinateSystem === "Polar";
  if ((!polarGuide && !declaredPolar) || !plotArea) return null;
  const origin = polarGuide?.origin ?? {
    x: plotArea.x + plotArea.width / 2,
    y: plotArea.y + plotArea.height / 2,
  };
  const composition = node.compositionSpec?.type === "concat" ? node.compositionSpec : null;
  const memberCount = Math.max(composition?.members.length ?? 0, 1);
  const memberIndex = Math.max(
    composition?.members.findIndex((member) => member.nodeId === node.id) ?? 0,
    0,
  );
  const radialInnerRatio = composition?.direction === "radial" ? memberIndex / memberCount : 0;
  const radialOuterRatio = composition?.direction === "radial" ? (memberIndex + 1) / memberCount : 1;
  const fallbackInnerRatio = chartSchema?.renderer === "donut"
    ? (radialInnerRatio + radialOuterRatio) / 2
    : radialInnerRatio;
  const angularSpan = composition?.direction === "angular"
    ? (composition.polarAngleSpan ?? 360) / memberCount
    : composition?.polarAngleSpan;
  const angularOffset = composition?.direction === "angular"
    ? (composition.polarAngleOffset ?? 0) + angularSpan! * memberIndex
    : composition?.polarAngleOffset;

  const renderedPolarArea = node.chartSpec?.polarArea;
  const hasRenderedRadii = !!renderedPolarArea
    && Number.isFinite(renderedPolarArea.innerRadius)
    && Number.isFinite(renderedPolarArea.outerRadius)
    && renderedPolarArea.outerRadius > 0;
  const outerRatio = Math.max(0.01, Math.min(polarGuide?.outerRadiusRatio ?? radialOuterRatio, 1));
  const innerRatio = Math.max(0, Math.min(polarGuide?.innerRadiusRatio ?? fallbackInnerRatio, outerRatio));
  const renderedOuterRadius = Math.max(0, Math.min(plotArea.width, plotArea.height) / 2);
  if (!hasRenderedRadii && renderedOuterRadius <= 0) return null;
  const baseRadius = renderedOuterRadius / outerRatio;
  const innerRadius = hasRenderedRadii
    ? Math.max(0, renderedPolarArea!.innerRadius)
    : baseRadius * innerRatio;
  const outerRadius = hasRenderedRadii
    ? Math.max(innerRadius, renderedPolarArea!.outerRadius)
    : baseRadius * outerRatio;
  const configuredStartAngle = hasRenderedRadii && Number.isFinite(renderedPolarArea!.startAngle)
    ? renderedPolarArea!.startAngle
    : polarGuide?.angleOffset ?? angularOffset ?? 0;
  const configuredAngleSpan = hasRenderedRadii && Number.isFinite(renderedPolarArea!.angleSpan)
    ? renderedPolarArea!.angleSpan
    : polarGuide?.angleSpan ?? angularSpan;
  const startAngle = ((configuredStartAngle % 360) + 360) % 360;
  const angleSpan = Number.isFinite(configuredAngleSpan)
    ? Math.max(1, Math.min(configuredAngleSpan!, 360))
    : 360;
  const endAngle = startAngle + angleSpan;

  const angles = [startAngle, endAngle, 0, 90, 180, 270]
    .filter((angle, index, values) =>
      angleWithinClockwiseSpan(angle, startAngle, angleSpan)
      && values.indexOf(angle) === index,
    );
  const points = angles.flatMap((angle) => [
    polarPoint(origin, outerRadius, angle),
    ...(innerRadius > 0 ? [polarPoint(origin, innerRadius, angle)] : []),
  ]);
  if (innerRadius <= 0) points.push(origin);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    origin,
    startAngle,
    endAngle,
    angleSpan,
    innerRadius,
    outerRadius,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    path: polarOccupiedPath(origin, innerRadius, outerRadius, startAngle, angleSpan),
  };
}

// Selection geometry intentionally excludes Cartesian axis decorations. Axis
// labels and tick marks are rendered outside the chart plot area, but they are
// not part of the Chart's resize/rotate frame.
export function getNodeSelectionBounds(node: CanvasNode): Bounds {
  const baseMinX = node.kind === "leaf" ? node.contentMinX : 0;
  const baseMinY = node.kind === "leaf" ? node.contentMinY : 0;
  const plotArea = node.chartSpec?.plotArea;
  if (node.renderedContent && plotArea) {
    return {
      minX: plotArea.x,
      minY: plotArea.y,
      maxX: plotArea.x + plotArea.width,
      maxY: plotArea.y + plotArea.height,
      width: plotArea.width,
      height: plotArea.height,
    };
  }
  return {
    minX: baseMinX,
    minY: baseMinY,
    maxX: baseMinX + node.width,
    maxY: baseMinY + node.height,
    width: node.width,
    height: node.height,
  };
}

/**
 * Returns the local bounds represented by CanvasNodeView's
 * `.canvas-object-hit-target` element.
 */
export function getCanvasObjectHitTargetBounds(node: CanvasNode): Bounds {
  return getPolarOccupiedGeometry(node)?.bounds ?? getNodeSelectionBounds(node);
}

/**
 * Resolves the hit-target bounds into canvas coordinates using the same
 * ancestor transform convention as collectNodeSelectionBounds.
 */
export function getCanvasObjectHitTargetBoundsInCanvas(
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
  const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
  const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
  const polar = getPolarOccupiedGeometry(node);
  if (!polar) {
    const hitTarget = getCanvasObjectHitTargetBounds(node);
    return boundsFromNodeFrame(
      x + (hitTarget.minX - localMinX) * scaleX,
      y + (hitTarget.minY - localMinY) * scaleY,
      hitTarget.width,
      hitTarget.height,
      scaleX,
      scaleY,
      node.rotation,
    );
  }
  const transformPoint = (point: Point): Point => {
    const px = x + (point.x - localMinX) * scaleX;
    const py = y + (point.y - localMinY) * scaleY;
    const center = { x: x + node.width * scaleX / 2, y: y + node.height * scaleY / 2 };
    if (node.rotation === 0) return { x: px, y: py };
    const radians = node.rotation * Math.PI / 180;
    const dx = px - center.x;
    const dy = py - center.y;
    return {
      x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  };
  const angles = [polar.startAngle, polar.endAngle, 0, 90, 180, 270]
    .filter((angle, index, values) =>
      angleWithinClockwiseSpan(angle, polar.startAngle, polar.angleSpan)
      && values.indexOf(angle) === index,
    );
  const points = angles.flatMap((angle) => [
    transformPoint(polarPoint(polar.origin, polar.outerRadius, angle)),
    ...(polar.innerRadius > 0 ? [transformPoint(polarPoint(polar.origin, polar.innerRadius, angle))] : []),
  ]);
  if (polar.innerRadius <= 0) points.push(transformPoint(polar.origin));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
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

export function cloneChartSpec(chartSpec: ChartSpec | null | undefined) {
  if (!chartSpec) return chartSpec;
  return {
    ...chartSpec,
    encodings: Object.fromEntries(
      Object.entries(chartSpec.encodings).map(([channel, encoding]) => [
        channel,
        encoding ? { ...encoding } : encoding,
      ]),
    ) as ChartSpec["encodings"],
    aggregations: chartSpec.aggregations ? { ...chartSpec.aggregations } : undefined,
    autoAggregations: chartSpec.autoAggregations ? { ...chartSpec.autoAggregations } : undefined,
    angleFields: chartSpec.angleFields?.map((encoding) => ({ ...encoding })),
    flattenFields: chartSpec.flattenFields ? [...chartSpec.flattenFields] : undefined,
    componentRadiusFields: chartSpec.componentRadiusFields
      ? Object.fromEntries(Object.entries(chartSpec.componentRadiusFields).map(([field, encoding]) => [field, { ...encoding }]))
      : undefined,
    series: chartSpec.series ? { ...chartSpec.series } : undefined,
    scales: chartSpec.scales
      ? {
        ...(chartSpec.scales.x
          ? { x: { ...chartSpec.scales.x, domain: [...chartSpec.scales.x.domain] as [string, string] | [number, number], range: [...chartSpec.scales.x.range] as [number, number] } }
          : {}),
        ...(chartSpec.scales.y
          ? { y: { ...chartSpec.scales.y, domain: [...chartSpec.scales.y.domain] as [string, string] | [number, number], range: [...chartSpec.scales.y.range] as [number, number] } }
          : {}),
      }
      : undefined,
    plotArea: chartSpec.plotArea ? { ...chartSpec.plotArea } : undefined,
    polarArea: chartSpec.polarArea ? { ...chartSpec.polarArea } : undefined,
    styleTokens: chartSpec.styleTokens
      ? { ...chartSpec.styleTokens, palette: [...chartSpec.styleTokens.palette] }
      : undefined,
    renderer: chartSpec.renderer ? { ...chartSpec.renderer } : undefined,
    filters: chartSpec.filters ? { ...chartSpec.filters } : undefined,
    valueFilters: chartSpec.valueFilters
      ? Object.fromEntries(Object.entries(chartSpec.valueFilters).map(([field, values]) => [field, [...values]]))
      : undefined,
    numericFilters: chartSpec.numericFilters
      ? Object.fromEntries(Object.entries(chartSpec.numericFilters).map(([field, filter]) => [field, { ...filter }]))
      : undefined,
    dataTransforms: chartSpec.dataTransforms?.map((transform) => transform.mode === "values"
      ? { ...transform, values: [...transform.values] }
      : { ...transform }),
    markGroups: chartSpec.markGroups?.map((group) => ({
      ...group,
      memberKeys: [...group.memberKeys],
      sharedConfig: { ...group.sharedConfig },
    })),
    dimensionRecommendations: chartSpec.dimensionRecommendations?.map((recommendation) => ({
      ...recommendation,
      sharedChannels: [...recommendation.sharedChannels],
      flattenFields: recommendation.flattenFields ? [...recommendation.flattenFields] : undefined,
      facetGrid: recommendation.facetGrid
        ? { ...recommendation.facetGrid, rowValues: [...recommendation.facetGrid.rowValues], columnValues: [...recommendation.facetGrid.columnValues] }
        : undefined,
    })),
    dimensionDecisions: chartSpec.dimensionDecisions ? { ...chartSpec.dimensionDecisions } : undefined,
  };
}

export function cloneCanvasNode(node: CanvasNode): CanvasNode {
  const coordinateGuide = node.coordinateGuide
    ? { ...node.coordinateGuide, origin: { ...node.coordinateGuide.origin } }
    : node.coordinateGuide;
  const chartSpec = cloneChartSpec(node.chartSpec);
  const coordinateSystem = node.coordinateSystem
    ? {
      ...node.coordinateSystem,
      members: node.coordinateSystem.members.map((member) => ({ ...member, channels: [...member.channels] })),
      sharedChannels: [...node.coordinateSystem.sharedChannels],
    }
    : node.coordinateSystem;
  const llmRenderer = node.llmRenderer
    ? { ...node.llmRenderer, marks: node.llmRenderer.marks.map((mark) => ({ ...mark })), provenance: { ...node.llmRenderer.provenance } }
    : node.llmRenderer;
  const layerSpec = node.layerSpec
    ? { ...node.layerSpec, x: node.layerSpec.x ? { ...node.layerSpec.x } : undefined, y: node.layerSpec.y ? { ...node.layerSpec.y } : undefined, children: node.layerSpec.children.map((child) => ({ ...child, chartSpec: cloneChartSpec(child.chartSpec)! })) }
    : node.layerSpec;
  const nestedSpec = node.nestedSpec
    ? {
      ...node.nestedSpec,
      parentRowKeys: node.nestedSpec.parentRowKeys ? [...node.nestedSpec.parentRowKeys] : undefined,
      valueFields: [...node.nestedSpec.valueFields],
    }
    : node.nestedSpec;
  const compositionSpec = node.compositionSpec
    ? {
      ...node.compositionSpec,
      members: node.compositionSpec.members.map((member) => ({ ...member, sharedChannels: [...member.sharedChannels] })),
      sharedChannels: [...node.compositionSpec.sharedChannels],
      facetValues: node.compositionSpec.facetValues ? [...node.compositionSpec.facetValues] : undefined,
      facetGrid: node.compositionSpec.facetGrid
        ? { ...node.compositionSpec.facetGrid, rowValues: [...node.compositionSpec.facetGrid.rowValues], columnValues: [...node.compositionSpec.facetGrid.columnValues] }
        : undefined,
    }
    : node.compositionSpec;
  const deckglConfig = node.deckglConfig ? { ...node.deckglConfig } : node.deckglConfig;
  const deckglBinding = node.deckglBinding ? { ...node.deckglBinding } : node.deckglBinding;
  const mapViewState = node.mapViewState ? { ...node.mapViewState } : node.mapViewState;
  if (node.kind === "leaf") return { ...node, coordinateGuide, coordinateSystem, chartSpec, layerSpec, nestedSpec, compositionSpec, llmRenderer, deckglConfig, deckglBinding, mapViewState };
  return {
    ...node,
    coordinateGuide,
    coordinateSystem,
    chartSpec,
    llmRenderer,
    layerSpec,
    nestedSpec,
    compositionSpec,
    deckglConfig,
    deckglBinding,
    mapViewState,
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
  const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
  const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
  const visualBounds = getNodeVisualBounds(node);
  let bounds = boundsFromNodeFrame(
    x + (visualBounds.minX - localMinX) * scaleX,
    y + (visualBounds.minY - localMinY) * scaleY,
    visualBounds.maxX - visualBounds.minX,
    visualBounds.maxY - visualBounds.minY,
    scaleX,
    scaleY,
    node.rotation,
  );
  if (node.kind === "group") {
    let merged: Bounds | null = null;
    node.children.forEach((child) => {
      merged = mergeBounds(merged, collectNodeBounds(child, x, y, scaleX, scaleY));
    });
    if (merged) bounds = merged;
  }
  return bounds;
}

export function collectNodeSelectionBounds(
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
  let bounds = getCanvasObjectHitTargetBoundsInCanvas(node, parentX, parentY, parentScaleX, parentScaleY);
  // Configured charts can retain their original template children after the
  // deterministic renderer takes over. Their selection is the live plotArea;
  // stale template geometry must not replace it during multi-selection.
  if (node.kind === "group" && !node.chartSpec) {
    let merged: Bounds | null = null;
    node.children.forEach((child) => {
      merged = mergeBounds(merged, collectNodeSelectionBounds(child, x, y, scaleX, scaleY));
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

export function computeSelectionBounds(nodes: CanvasNode[], ids: string[]): Bounds | null {
  if (ids.length === 0) return null;
  let merged: Bounds | null = null;
  ids.forEach((id) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    merged = mergeBounds(merged, collectNodeSelectionBounds(node));
  });
  return merged;
}

function serializeCanvasNode(node: CanvasNode): string {
  const transform = node.kind === "leaf"
    ? getLeafNodeTransform(node)
    : getNodeTransform(node);
  const content = node.renderedContent ?? (node.kind === "leaf"
    ? node.content
    : node.children.map((child) => serializeCanvasNode(child)).join(""));
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
