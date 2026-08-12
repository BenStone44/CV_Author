import type {
  CanvasNode,
  CanvasLeafNode,
  Bounds,
  Point,
  AbsoluteNodeFrame,
  ChartSpec,
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
    dimensionAggregations: chartSpec.dimensionAggregations ? { ...chartSpec.dimensionAggregations } : undefined,
    angleFields: chartSpec.angleFields?.map((encoding) => ({ ...encoding })),
    flattenFields: chartSpec.flattenFields ? [...chartSpec.flattenFields] : undefined,
    componentRadiusFields: chartSpec.componentRadiusFields
      ? Object.fromEntries(Object.entries(chartSpec.componentRadiusFields).map(([field, encoding]) => [field, { ...encoding }]))
      : undefined,
    series: chartSpec.series ? { ...chartSpec.series } : undefined,
    seriesFields: chartSpec.seriesFields?.map((encoding) => ({ ...encoding })),
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
    styleTokens: chartSpec.styleTokens
      ? { ...chartSpec.styleTokens, palette: [...chartSpec.styleTokens.palette] }
      : undefined,
    renderer: chartSpec.renderer ? { ...chartSpec.renderer } : undefined,
    filters: chartSpec.filters ? { ...chartSpec.filters } : undefined,
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
  if (node.kind === "leaf") return { ...node, coordinateGuide, coordinateSystem, chartSpec, layerSpec, nestedSpec, compositionSpec, llmRenderer };
  return {
    ...node,
    coordinateGuide,
    coordinateSystem,
    chartSpec,
    llmRenderer,
    layerSpec,
    nestedSpec,
    compositionSpec,
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
  const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
  const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
  const selectionBounds = getNodeSelectionBounds(node);
  let bounds = boundsFromNodeFrame(
    x + (selectionBounds.minX - localMinX) * scaleX,
    y + (selectionBounds.minY - localMinY) * scaleY,
    selectionBounds.width,
    selectionBounds.height,
    scaleX,
    scaleY,
    node.rotation,
  );
  if (node.kind === "group") {
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
