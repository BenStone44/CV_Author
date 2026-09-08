import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import type { CanvasGroupNode, CanvasLeafNode, CanvasNode, Dataset, GeometrySource, PolarCoordinateGuide, RelativeNestedParameters } from "../types";
import { deckglPointNestHoverEvent } from "../types";
import { collectNodeSelectionBounds, getPolarOccupiedGeometry } from "../utils/canvasUtils";
import { csvColumnDragMime, encodeCsvColumnDragPayload } from "../utils/csvColumnDrag";
import { inferColumnIntents } from "../utils/dimensionInference";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

type WindowListener = (event: any) => void;
const listeners = new Map<string, WindowListener>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    addEventListener: (type: string, listener: WindowListener) => listeners.set(type, listener),
    removeEventListener: (type: string, listener: WindowListener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setTimeout,
    clearTimeout,
  },
});

class SvgMarkStub {
  dataset: Record<string, string>;
  children: SvgMarkStub[];

  constructor(
    private readonly attributes: Record<string, string>,
    private readonly bounds: { left: number; top: number; right: number; bottom: number },
    children: SvgMarkStub[] = [],
    private readonly geometry: SvgMarkStub | null = null,
  ) {
    this.dataset = attributes["data-node-id"] ? { nodeId: attributes["data-node-id"] } : {};
    this.children = children;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name: string) {
    return this.attributes[name] !== undefined;
  }

  querySelectorAll() {
    return this.children;
  }

  querySelector() {
    return this.geometry;
  }

  closest(selector: string) {
    return selector === "[data-row-key]" && this.hasAttribute("data-row-key") ? this : null;
  }

  getScreenCTM() {
    return null;
  }

  getBoundingClientRect() {
    return {
      ...this.bounds,
      x: this.bounds.left,
      y: this.bounds.top,
      width: this.bounds.right - this.bounds.left,
      height: this.bounds.bottom - this.bounds.top,
      toJSON: () => ({}),
    };
  }
}

Object.defineProperty(globalThis, "Element", { configurable: true, value: SvgMarkStub });
Object.defineProperty(globalThis, "SVGGraphicsElement", { configurable: true, value: SvgMarkStub });

const {
  canResolveNestedParentField,
  getDimensionChartUpgradeOptions,
  getNestedParentContextFields,
  isDeckglPointNestedChartCandidate,
  useCanvasStore,
} = await import("../stores/useCanvasStore");
const { useDatasetStore } = await import("../stores/useDatasetStore");

const layerDataset: Dataset = {
  id: "layer-dataset",
  name: "layer.csv",
  columns: [
    { name: "series", type: "nominal" },
    { name: "time", type: "temporal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { series: "A", time: "2026-01-01", value: "10" },
    { series: "A", time: "2026-02-01", value: "18" },
    { series: "B", time: "2026-01-01", value: "14" },
    { series: "B", time: "2026-02-01", value: "22" },
  ],
  primaryKey: ["series", "time"],
};

function polarGuide(node: CanvasNode): PolarCoordinateGuide | undefined {
  return node.coordinateGuide?.type === "Polar" ? node.coordinateGuide : undefined;
}

function coordinateCanvasRef() {
  return ref({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
    querySelectorAll: () => [],
  } as unknown as HTMLElement);
}

function leaf(id: string, x: number, y: number): CanvasLeafNode {
  return {
    kind: "leaf",
    id,
    candidateId: `test:${id}`,
    name: id,
    content: '<rect x="0" y="0" width="40" height="30" />',
    viewBox: "0 0 40 30",
    width: 40,
    height: 30,
    x,
    y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    contentMinX: 0,
    contentMinY: 0,
  };
}

function createNodes(): CanvasNode[] {
  const nested: CanvasGroupNode = {
    kind: "group",
    id: "nested",
    name: "nested",
    x: 100,
    y: 20,
    width: 80,
    height: 70,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    children: [leaf("nested-child", 10, 10)],
  };
  return [
    {
      kind: "group",
      id: "root-group",
      name: "root-group",
      x: 200,
      y: 150,
      width: 240,
      height: 140,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      children: [leaf("child", 20, 40), nested],
    },
    leaf("outside", 520, 180),
  ];
}

function firstChartNodeForTest(node: CanvasNode): CanvasNode {
  if (node.chartSpec) return node;
  if (node.kind === "group") {
    for (const child of node.children) {
      const chart = firstChartNodeForTest(child);
      if (chart.chartSpec) return chart;
    }
  }
  throw new Error(`No chart found below ${node.id}.`);
}

function lineChart(id: string, x: number, withSeries: boolean): CanvasGroupNode {
  return {
    kind: "group",
    id,
    name: id,
    x,
    y: 100,
    width: 800,
    height: 400,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    coordinateGuide: {
      type: "Cartesian",
      origin: { x: 0, y: 400 },
      xDirection: 1,
      yDirection: -1,
    },
    chartSpec: {
      chartType: "LineGraph",
      datasetId: layerDataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
      series: withSeries ? { field: "series", type: "nominal" } : undefined,
    },
    children: [],
  };
}

describe("nested parent grain", () => {
  it("inherits the complete multiline structural grain without the measure", () => {
    const parent = lineChart("nested-grain-parent", 100, true);
    parent.chartSpec = {
      ...parent.chartSpec!,
      chartType: "MultiLineChart",
      aggregations: { y: "sum" },
    };

    expect(getNestedParentContextFields(parent.chartSpec!)).toEqual(["time", "series"]);
  });

  it("keeps record-mode scatter identity out of chart-only structural fields", () => {
    const parent = lineChart("nested-row-parent", 100, false);
    parent.chartSpec = { ...parent.chartSpec!, chartType: "Scatterplot" };

    expect(getNestedParentContextFields(parent.chartSpec!)).toEqual([]);
  });

  it("expands a record-mode scatter row key into relationship-owned primary-key filters", () => {
    const dataset: Dataset = {
      id: "scatter-row-key-context",
      name: "academic_scores.csv",
      columns: [
        { name: "university_id", type: "nominal" },
        { name: "academic_level", type: "quantitative" },
        { name: "university_size", type: "quantitative" },
        { name: "Literature", type: "quantitative" },
      ],
      rows: [
        { university_id: "u001", academic_level: "0.59", university_size: "0.85", Literature: "20" },
        { university_id: "u002", academic_level: "0.64", university_size: "0.56", Literature: "21" },
      ],
      primaryKey: ["university_id"],
    };
    const parent = lineChart("scatter-row-key-parent", 100, false);
    parent.chartSpec = {
      ...parent.chartSpec!,
      chartType: "Scatterplot",
      datasetId: dataset.id,
      encodings: {
        x: { field: "academic_level", type: "quantitative" },
        y: { field: "university_size", type: "quantitative" },
      },
    };
    const child = polarChart("scatter-row-key-child", 950);
    child.chartSpec = { ...child.chartSpec!, datasetId: dataset.id };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];

    const result = store.resolveNestedFilterContexts(
      parent,
      child,
      JSON.stringify({ rowKey: "u002" }),
    );

    expect(result).toEqual({
      contexts: [{
        parentChartId: parent.id,
        parentDataKey: JSON.stringify({ rowKey: "u002" }),
        parentField: "university_id",
        childField: "university_id",
        value: "u002",
        filterMode: "values",
        source: "parent-row",
      }],
      unresolvedFields: [],
    });
  });

  it("expands every field of a composite scatter row key", () => {
    const dataset: Dataset = {
      id: "scatter-composite-row-key-context",
      name: "observations.csv",
      columns: [
        { name: "university_id", type: "nominal" },
        { name: "term", type: "ordinal" },
        { name: "x", type: "quantitative" },
        { name: "y", type: "quantitative" },
      ],
      rows: [
        { university_id: "u001", term: "1", x: "10", y: "20" },
        { university_id: "u001", term: "2", x: "11", y: "21" },
      ],
      primaryKey: ["university_id", "term"],
    };
    const parent = lineChart("scatter-composite-key-parent", 100, false);
    parent.chartSpec = {
      ...parent.chartSpec!,
      chartType: "Scatterplot",
      datasetId: dataset.id,
      encodings: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    };
    const child = polarChart("scatter-composite-key-child", 950);
    child.chartSpec = { ...child.chartSpec!, datasetId: dataset.id };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];

    const result = store.resolveNestedFilterContexts(
      parent,
      child,
      JSON.stringify({ rowKey: "u001|2" }),
    );

    expect(result.contexts.map((context) => [context.childField, context.value])).toEqual([
      ["university_id", "u001"],
      ["term", "2"],
    ]);
    expect(result.unresolvedFields).toEqual([]);
  });

  it("uses the graph node ID as the default nested context", () => {
    const graph = {
      chartType: "ForceDirectedGraph",
      datasetId: "graph",
      encodings: {
        key: { field: "node_id", type: "nominal" as const },
        source: { field: "source", type: "nominal" as const },
        target: { field: "target", type: "nominal" as const },
      },
    };

    expect(getNestedParentContextFields(graph)).toEqual(["node_id"]);
  });

  it("inherits every stacked-bar dimension rather than its visual appearance", () => {
    const stacked = lineChart("nested-stacked-parent", 100, false);
    stacked.chartSpec = {
      ...stacked.chartSpec!,
      chartType: "StackedBarChart",
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "value", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
    };

    expect(getNestedParentContextFields(stacked.chartSpec!)).toEqual(["time", "series"]);
  });

  it("allows a concrete scatter row to supply an unbound nested clue", () => {
    const parent = lineChart("nested-row-clue-parent", 100, false);
    parent.chartSpec = { ...parent.chartSpec!, chartType: "Scatterplot" };
    const row = { ...layerDataset.rows[0]!, university_id: "u01" };

    expect(canResolveNestedParentField(parent.chartSpec!, "university_id", row)).toBe(true);
    expect(canResolveNestedParentField(parent.chartSpec!, "university_id", undefined)).toBe(false);

    const lineParent = lineChart("nested-line-clue-parent", 100, false);
    expect(canResolveNestedParentField(lineParent.chartSpec!, "university_id", row)).toBe(false);
  });
});

function cartesianChart(id: string, x: number, chartType: "AreaChart" | "LineGraph" | "Scatterplot" | "SingleBarChart") {
  const chart = lineChart(id, x, false);
  chart.chartSpec = {
    ...chart.chartSpec!,
    chartType,
    plotArea: { x: 80, y: 40, width: 640, height: 320 },
  };
  chart.renderedContent = `<g data-chart-type="${chartType}"/>`;
  return chart;
}

function polarChart(id: string, x: number, angleSpan = 120): CanvasGroupNode {
  return {
    kind: "group",
    id,
    name: id,
    x,
    y: 100,
    width: 400,
    height: 400,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    coordinateGuide: {
      type: "Polar",
      origin: { x: 200, y: 200 },
      angleSpan,
      angleOffset: 0,
    },
    chartSpec: {
      chartType: "PieChart",
      datasetId: layerDataset.id,
      encodings: {
        segment: { field: "series", type: "nominal" },
        theta: { field: "value", type: "quantitative" },
      },
      plotArea: { x: 0, y: 0, width: 400, height: 400 },
    },
    children: [],
  };
}

function worldPlotArea(node: CanvasNode) {
  const plotArea = node.chartSpec!.plotArea!;
  const minX = node.kind === "leaf" ? node.contentMinX : 0;
  const minY = node.kind === "leaf" ? node.contentMinY : 0;
  const left = node.x + (plotArea.x - minX) * node.scaleX;
  const top = node.y + (plotArea.y - minY) * node.scaleY;
  return {
    left,
    top,
    right: left + plotArea.width * node.scaleX,
    bottom: top + plotArea.height * node.scaleY,
  };
}

function worldScaleRange(node: CanvasNode, channel: "x" | "y") {
  const scale = node.chartSpec!.scales![channel]!;
  const min = node.kind === "leaf"
    ? channel === "x" ? node.contentMinX : node.contentMinY
    : 0;
  const offset = channel === "x" ? node.x : node.y;
  const factor = channel === "x" ? node.scaleX : node.scaleY;
  return scale.range.map((value) => offset + (value - min) * factor);
}

function lineLeafChart(id: string, x: number, contentMinX: number, contentMinY: number): CanvasLeafNode {
  const group = lineChart(id, x, false);
  const { children: _children, ...node } = group;
  return {
    ...node,
    kind: "leaf",
    candidateId: `test:${id}`,
    content: '<path d="M 0 0" />',
    viewBox: `${contentMinX} ${contentMinY} 640 300`,
    width: 640,
    height: 300,
    contentMinX,
    contentMinY,
  };
}

function pointerEvent(clientX: number, clientY: number) {
  return {
    button: 0,
    clientX,
    clientY,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault() {},
    stopPropagation() {},
  } as unknown as PointerEvent;
}

function columnDragEvent(datasetId: string, field: string, type: "nominal" | "temporal" | "quantitative", clientX: number, clientY: number) {
  const data = new Map([
    [csvColumnDragMime, encodeCsvColumnDragPayload({ datasetId, field, type })],
    ["text/plain", field],
  ]);
  return {
    clientX,
    clientY,
    preventDefault() {},
    relatedTarget: null,
    dataTransfer: {
      files: [],
      types: Array.from(data.keys()),
      dropEffect: "none",
      getData: (format: string) => data.get(format) ?? "",
    },
  } as unknown as DragEvent;
}

describe("implemented chart template cards", () => {
  it("uses shared default data while area encodings are incomplete", () => {
    const dataset: Dataset = {
      id: "area-placeholder-data",
      name: "area-placeholder.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", weight_kg: "82" },
        { time: "2026-02-01", weight_kg: "79" },
      ],
    };
    const canvasRef = ref<HTMLElement | null>(null);
    const store = useCanvasStore(canvasRef);
    const candidate = store.implementedTemplateCandidates.value.find(
      (item) => item.chartType === "AreaChart",
    );
    expect(candidate?.src).toMatch(/^data:image\/svg\+xml/);
    expect(candidate?.svgMarkup).toContain("<path");
    expect(candidate?.svgMarkup).not.toContain("<image");

    const chart = leaf("area-placeholder", 120, 80);
    chart.name = "Area Chart";
    chart.candidateId = candidate!.id;
    chart.content = candidate!.svgMarkup!;
    chart.viewBox = "0 0 320 180";
    chart.width = 320;
    chart.height = 180;
    chart.coordinateGuide = {
      type: "Cartesian",
      origin: { x: 0, y: 180 },
      xDirection: 1,
      yDirection: -1,
    };
    chart.chartSpec = {
      chartType: "AreaChart",
      datasetId: dataset.id,
      encodings: {},
    };
    chart.renderedContent = null;
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    store.setChartEncoding("x", "time");
    expect(chart.renderedContent).toContain('data-renderer="deterministic-area@1"');
    expect(chart.content).toBe(candidate!.svgMarkup);

    store.setChartEncoding("y", "weight_kg");
    expect(chart.renderedContent).toContain('data-renderer="deterministic-area@1"');
    expect(chart.renderedContent).not.toContain("<image");
  });

  it("exposes one independent card for every Bar variant", () => {
    const canvasRef = ref(null);
    const store = useCanvasStore(canvasRef);
    const barCards = store.implementedTemplateCandidates.value.filter((candidate) =>
      candidate.id.startsWith("builtin-template:") && candidate.id.includes("bar"),
    );

    expect(barCards.map(({ id, name, chartType }) => ({ id, name, chartType }))).toEqual([
      { id: "builtin-template:single-bar", name: "Single Bar", chartType: "SingleBarChart" },
      { id: "builtin-template:grouped-bar", name: "Grouped Bar", chartType: "GroupedBarChart" },
      { id: "builtin-template:stacked-bar", name: "Stacked Bar", chartType: "StackedBarChart" },
      { id: "builtin-template:divergent-bar", name: "Divergent Bar", chartType: "DivergentBarChart" },
      { id: "builtin-template:divergent-stacked-bar", name: "Divergent Stacked Bar", chartType: "DivergentStackedBarChart" },
      { id: "builtin-template:radial-bar-chart", name: "Radial Bar (Sector)", chartType: "RadialBarChart" },
      { id: "builtin-template:radial-stacked-bar-chart", name: "Radial Stacked Bar (Sector)", chartType: "RadialStackedBarChart" },
      { id: "builtin-template:radial-rect-bar-chart", name: "Radial Bar (Rectangle)", chartType: "RadialRectBarChart" },
      { id: "builtin-template:radial-rect-stacked-bar-chart", name: "Radial Stacked Bar (Rectangle)", chartType: "RadialRectStackedBarChart" },
      { id: "builtin-template:circular-bar-chart", name: "Circular Bar", chartType: "CircularBarChart" },
      { id: "builtin-template:circular-stacked-bar-chart", name: "Circular Stacked Bar", chartType: "CircularStackedBarChart" },
    ]);
  });

  it("exposes Single Line and Multi-Line as independent SVG cards", () => {
    const store = useCanvasStore(coordinateCanvasRef());
    const lineCandidates = store.implementedTemplateCandidates.value
      .filter((candidate) => candidate.chartType === "LineGraph" || candidate.chartType === "MultiLineChart");
    const lineCards = lineCandidates.map(({ id, name, chartType, src }) => ({ id, name, chartType, src }));

    expect(lineCards).toEqual([
      expect.objectContaining({ id: "builtin-template:line", name: "Single Line", chartType: "LineGraph" }),
      expect.objectContaining({ id: "builtin-template:multi-line", name: "Multi-Line Chart", chartType: "MultiLineChart" }),
    ]);
    expect(lineCards.every((candidate) => candidate.src.startsWith("data:image/svg+xml"))).toBe(true);
    const singleLine = lineCandidates.find((candidate) => candidate.chartType === "LineGraph");
    const multiLine = lineCandidates.find((candidate) => candidate.chartType === "MultiLineChart");
    expect(singleLine?.svgMarkup).toContain("<path");
    expect(singleLine?.svgMarkup).not.toContain("<circle");
    expect((multiLine?.svgMarkup?.match(/<path/g) ?? []).length).toBe(3);
  });

  it("uses data-rendered SVGs for bar, line, parallel, area, point, and matrix templates", () => {
    const store = useCanvasStore(ref(null));
    const nativeSvgChartTypes = new Set([
      "SingleBarChart",
      "GroupedBarChart",
      "StackedBarChart",
      "DivergentBarChart",
      "DivergentStackedBarChart",
      "LineGraph",
      "MultiLineChart",
      "AreaChart",
      "StackedAreaChart",
      "Streamgraph",
      "HorizonChart",
      "ParallelCoordinatesPlot",
      "Scatterplot",
      "MatrixDiagram",
    ]);
    const candidates = store.implementedTemplateCandidates.value.filter((candidate) =>
      nativeSvgChartTypes.has(candidate.chartType),
    );

    expect(candidates).toHaveLength(nativeSvgChartTypes.size);
    expect(candidates.every((candidate) => candidate.src.startsWith("data:image/svg+xml"))).toBe(true);
    expect(candidates.every((candidate) => candidate.svgMarkup?.startsWith("<svg"))).toBe(true);
    expect(candidates.every((candidate) => candidate.svgMarkup?.includes("data-default-dataset-id"))).toBe(true);
    expect(candidates.every((candidate) => !candidate.svgMarkup?.includes("<image"))).toBe(true);
  });

  it("keeps case1 person and time as parallel coordinate dimensions", () => {
    const dataset: Dataset = {
      id: "case1-parallel-data",
      name: "case1.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: [
        { person: "Person_A", time: "2025-01-01", weight_kg: "88.0" },
        { person: "Person_B", time: "2025-02-01", weight_kg: "84.2" },
      ],
      primaryKey: ["person", "time"],
    };
    const chart = leaf("case1-parallel", 0, 0);
    chart.chartSpec = {
      chartType: "ParallelCoordinatesPlot",
      datasetId: dataset.id,
      encodings: { color: { field: "person", type: "nominal" } },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    store.setParallelFields(["time", "person"]);

    expect(chart.chartSpec?.parallelFields).toEqual([
      { field: "time", type: "temporal" },
      { field: "person", type: "nominal" },
    ]);
    expect(chart.chartSpec?.renderer?.status).not.toBe("error");
    expect(chart.renderedContent).toContain('data-axis-scale="utc"');
    expect(chart.renderedContent).toContain('data-axis-scale="point"');
  });

  it("binds Matrix value through the generic encoding API", () => {
    const dataset: Dataset = {
      id: "generic-encoding-data",
      name: "generic-encoding.csv",
      columns: [
        { name: "row", type: "nominal" },
        { name: "column", type: "nominal" },
        { name: "category", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { row: "North", column: "Q1", category: "A", value: "12" },
        { row: "South", column: "Q2", category: "B", value: "18" },
      ],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];

    const matrix = lineChart("generic-matrix", 120, false);
    matrix.chartSpec = {
      chartType: "MatrixDiagram",
      datasetId: dataset.id,
      encodings: {
        row: { field: "row", type: "nominal" },
        column: { field: "column", type: "nominal" },
        x: { field: "column", type: "nominal" },
        y: { field: "row", type: "nominal" },
      },
    };
    store.canvasNodes.value = [matrix];
    store.selectedIds.value = [matrix.id];
    store.axisBindingTarget.value = { nodeId: matrix.id, channel: "x" };
    store.setChartEncoding("color", "value");
    expect(matrix.chartSpec.encodings.color?.field).toBe("value");
    expect(matrix.renderedContent).toContain('data-chart-type="matrix"');

  });

  it("keeps static encoding config before required channels are complete", () => {
    const dataset: Dataset = {
      id: "preconfigured-bar-data",
      name: "preconfigured-bar.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [{ category: "A", value: "12" }],
    };
    const chart = lineChart("preconfigured-bar", 120, false);
    chart.chartSpec = { chartType: "SingleBarChart", datasetId: dataset.id, encodings: {} };
    const canvasRef = ref(null);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    store.updateAxisBindingMarkGroupConfig({ color: "#123456", size: 18 });
    expect(chart.chartSpec.markGroups?.[0]?.sharedConfig).toMatchObject({ color: "#123456", size: 18 });

    store.setChartEncoding("x", "category");
    store.setChartEncoding("y", "value");
    expect(chart.renderedContent).toContain('fill="#123456"');
    expect(chart.renderedContent).toContain('width="18"');
  });

  it("renders a line chart vertically when Cartesian axes are swapped", () => {
    const chart = lineChart("swapped-line-chart", 120, false);
    chart.chartSpec = {
      ...chart.chartSpec!,
      chartType: "MultiLineChart",
      valueFields: [{ field: "value", type: "quantitative" }],
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    store.setAxisSwap(true);

    expect(chart.chartSpec?.axisSwapped).toBe(true);
    expect(chart.chartSpec?.scales?.x?.type).toBe("linear");
    expect(chart.chartSpec?.scales?.y?.type).toBe("utc");
  });

  it("resolves the field occupying each physical axis after a swap", () => {
    const chart = lineChart("swapped-axis-binding", 120, false);
    chart.chartSpec = {
      ...chart.chartSpec!,
      chartType: "SingleBarChart",
      encodings: {
        x: { field: "series", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.axisBindingValue.value).toBe("series");
    store.setAxisSwap(true);
    expect(store.axisBindingValue.value).toBe("value");
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };
    expect(store.axisBindingValue.value).toBe("series");
  });

  it("keeps native encodings and Series synchronized after panel edits", () => {
    const dataset: Dataset = {
      id: "channel-resolution-line",
      name: "channel-resolution-line.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01", weight: "80", water: "45" },
        { person: "B", time: "2026-01", weight: "76", water: "42" },
      ],
    };
    const chart = lineChart("channel-resolution-line-node", 120, true);
    chart.chartSpec = {
      chartType: "MultiLineChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight", type: "quantitative" },
      },
      series: { field: "person", type: "nominal" },
      seriesFields: [{ field: "person", type: "nominal" }],
      aggregations: { y: "sum" },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };

    store.setChartEncoding("y", "water");
    expect(chart.chartSpec?.encodings.y?.field).toBe("water");
    expect(chart.chartSpec?.aggregations).toBeUndefined();

    store.setChartEncoding("y", "time");
    expect(chart.chartSpec?.encodings.y?.field).toBe("water");
    expect(store.importNotice.value).toContain("multiple data channels");

    store.setChartEncoding("x", "person");
    expect(chart.chartSpec?.encodings.x?.field).toBe("person");
    expect(chart.chartSpec?.series).toBeUndefined();
    expect(chart.chartSpec?.seriesFields).toBeUndefined();
    expect(chart.renderedContent).toBeNull();

    store.setValueFilters({
      person: { field: "person", values: ["A"] },
    });
    expect(chart.chartSpec?.valueFilters?.person).toEqual(["A"]);
  });

  it("binds one CSV field to the visible Cartesian axis", () => {
    const dataset: Dataset = {
      id: "axis-measure-set",
      name: "axis-measure-set.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
      ],
      rows: [{ time: "2026-01", weight: "80", water: "45" }],
    };
    const chart = lineChart("axis-measure-set-node", 120, false);
    chart.chartSpec = {
      chartType: "LineGraph",
      datasetId: dataset.id,
      encodings: { x: { field: "time", type: "temporal" } },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };

    store.bindMarkField("weight", "sum");

    expect(chart.chartSpec?.encodings.y?.field).toBe("weight");
    expect(chart.chartSpec?.aggregations).toEqual({ y: "sum" });
  });

  it("binds multiple Y measures atomically as a derived Multi-Line series", () => {
    const dataset: Dataset = {
      id: "multi-measure-series",
      name: "multi-measure-series.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
        { name: "fat", type: "quantitative" },
        { name: "muscle", type: "quantitative" },
      ],
      rows: [
        { person: "P1", time: "2026-01", weight: "80", water: "45", fat: "18", muscle: "32" },
        { person: "P2", time: "2026-02", weight: "79", water: "44", fat: "17", muscle: "33" },
      ],
      primaryKey: ["person", "time"],
    };
    const chart = lineChart("multi-measure-node", 120, false);
    chart.chartSpec = {
      chartType: "MultiLineChart",
      datasetId: dataset.id,
      encodings: { x: { field: "time", type: "temporal" } },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };

    store.setValueSeriesFields(["weight", "water", "fat", "muscle"]);

    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual([
      "weight", "water", "fat", "muscle",
    ]);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
    expect(chart.chartSpec?.series).toBeUndefined();
    expect(chart.chartSpec?.dimensionRecommendations).toBeUndefined();
    expect(chart.renderedContent).toContain('data-series-key="weight"');
    expect(chart.renderedContent).toContain('data-series-key="muscle"');
  });

  it("binds multiple quantitative columns as Stacked Bar segments", () => {
    const dataset: Dataset = {
      id: "stacked-segments",
      name: "stacked-segments.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "planned", type: "quantitative" },
        { name: "actual", type: "quantitative" },
      ],
      rows: [
        { category: "A", planned: "8", actual: "3" },
        { category: "B", planned: "5", actual: "4" },
      ],
      primaryKey: ["category"],
    };
    const chart = lineChart("stacked-segment-node", 120, false);
    chart.chartSpec = {
      chartType: "StackedBarChart",
      datasetId: dataset.id,
      encodings: { x: { field: "category", type: "nominal" } },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };

    store.setValueSeriesFields(["planned", "actual"]);

    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["planned", "actual"]);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "planned", type: "quantitative" });
    expect(chart.chartSpec?.encodings.color).toBeUndefined();
    expect(chart.renderedContent).toContain('data-bar-variant="stacked"');
    expect(chart.renderedContent?.match(/data-mark-role="bar"/g)).toHaveLength(4);
  });

  it("binds Circular Stacked Bar as Theta, R, and quantitative Segment items", () => {
    const dataset: Dataset = {
      id: "circular-stacked-segments",
      name: "circular-stacked-segments.csv",
      columns: [
        { name: "month", type: "ordinal" },
        { name: "planned", type: "quantitative" },
        { name: "actual", type: "quantitative" },
      ],
      rows: [
        { month: "Jan", planned: "8", actual: "3" },
        { month: "Feb", planned: "5", actual: "4" },
      ],
      primaryKey: ["month"],
    };
    const chart = polarChart("circular-stacked-segment-node", 120);
    chart.chartSpec = {
      chartType: "CircularStackedBarChart",
      datasetId: dataset.id,
      encodings: {},
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "angle" };

    store.setChartEncoding("radius", "month");
    store.setValueSeriesFields(["planned", "actual"]);

    expect(chart.chartSpec?.encodings.radius).toEqual({ field: "month", type: "ordinal" });
    expect(chart.chartSpec?.encodings.theta).toEqual({ field: "planned", type: "quantitative" });
    expect(chart.chartSpec?.encodings.segment).toBeUndefined();
    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["planned", "actual"]);
    expect(store.barItemAxisBinding(chart)).toEqual({ label: "Segment item", fields: ["planned", "actual"] });
    expect(chart.renderedContent).toContain('data-polar-orientation="angular"');
    expect(chart.renderedContent).toContain('data-category-field="month"');
    expect(chart.renderedContent).toContain('data-value-field="__csv_value__"');
    expect(chart.renderedContent?.match(/data-mark-role="bar"/g)).toHaveLength(4);
  });

  it("replaces the polar Theta source from the encoding panel", () => {
    const dataset: Dataset = {
      id: "polar-channel-resolution",
      name: "polar-channel-resolution.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "component", type: "nominal" },
        { name: "weight", type: "quantitative" },
        { name: "fat", type: "quantitative" },
      ],
      rows: [
        { person: "A", component: "water", weight: "80", fat: "18" },
        { person: "B", component: "fat", weight: "76", fat: "16" },
      ],
    };
    const chart: CanvasGroupNode = {
      kind: "group",
      id: "polar-channel-resolution-node",
      name: "Pie",
      x: 120,
      y: 80,
      width: 320,
      height: 180,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 90 } },
      chartSpec: {
        chartType: "PieChart",
        datasetId: dataset.id,
        encodings: {
          theta: { field: "weight", type: "quantitative" },
          segment: { field: "component", type: "nominal" },
        },
      },
      children: [],
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "angle" };

    store.setChartEncoding("theta", "fat");
    expect(chart.chartSpec?.angleFields).toBeUndefined();
    expect(chart.chartSpec?.encodings.theta).toEqual({ field: "fat", type: "quantitative" });
    expect(chart.chartSpec?.encodings.segment).toEqual({ field: "component", type: "nominal" });
    expect(chart.renderedContent).toContain('data-category-key="water"');

  });
});

describe("group editing scope", () => {
  it("moves and deletes group children while a reactive Nested relationship is present", () => {
    listeners.clear();
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    store.relationshipStore.dispatch({
      type: "register-chart",
      chart: {
        id: "parent-chart",
        nodeId: "parent-chart",
        chartType: "Scatterplot",
        datasetId: "dataset",
        instanceKind: "canvas",
      },
    });
    store.relationshipStore.dispatch({
      type: "register-chart",
      chart: {
        id: "nested-chart",
        nodeId: null,
        chartType: "PieChart",
        datasetId: "dataset",
        instanceKind: "nested-child",
      },
    });
    store.relationshipStore.dispatch({
      type: "begin-nested",
      relationship: {
        id: "nested-relationship",
        parentChartId: "parent-chart",
        parentElementId: "point:1",
        childChartId: "nested-chart",
        relationType: "relative-position",
        parameters: store.relationshipStore.defaultRelativeParameters(),
        resolverVersion: 1,
      },
    });
    store.canvasNodes.value = createNodes();

    const root = store.canvasNodes.value[0] as CanvasGroupNode;
    store.selectedIds.value = [root.id];
    store.enterSelection();
    expect(store.editingGroupPath.value).toEqual(["root-group"]);
    expect(store.selectedIds.value).toEqual([]);

    const child = root.children[0] as CanvasLeafNode;
    store.onCanvasNodePointerDown(child, pointerEvent(40, 60));
    listeners.get("pointermove")?.(pointerEvent(70, 80));
    listeners.get("pointerup")?.(pointerEvent(70, 80));
    expect(store.selectedIds.value).toEqual(["child"]);
    expect(child.x).toBe(50);
    expect(child.y).toBe(60);
    expect(root.children).toHaveLength(2);

    store.undoCanvasChange();
    expect(store.editingGroupPath.value).toEqual(["root-group"]);
    expect((store.canvasNodes.value[0] as CanvasGroupNode).children[0]!.x).toBe(20);
    store.redoCanvasChange();
    expect((store.canvasNodes.value[0] as CanvasGroupNode).children[0]!.x).toBe(50);

    const restoredRoot = store.canvasNodes.value[0] as CanvasGroupNode;
    const nested = restoredRoot.children[1] as CanvasGroupNode;
    store.selectedIds.value = [nested.id];
    store.enterSelection();
    expect(store.editingGroupPath.value).toEqual(["root-group", "nested"]);
    store.exitGroupEditing();
    expect(store.editingGroupPath.value).toEqual(["root-group"]);
    expect(store.selectedIds.value).toEqual(["nested"]);

    const restoredChild = restoredRoot.children[0] as CanvasLeafNode;
    store.onCanvasNodePointerDown(restoredChild, pointerEvent(50, 60));
    listeners.get("pointerup")?.(pointerEvent(50, 60));
    store.deleteSelectedNodes();
    expect(restoredRoot.children.map((node) => node.id)).toEqual(["nested"]);
    store.undoCanvasChange();
    expect((store.canvasNodes.value[0] as CanvasGroupNode).children.map((node) => node.id)).toEqual(["child", "nested"]);
    expect(store.editingGroupPath.value).toEqual(["root-group"]);

    const outside = store.canvasNodes.value[1] as CanvasLeafNode;
    store.onCanvasNodePointerDown(outside, pointerEvent(540, 200));
    listeners.get("pointerup")?.(pointerEvent(540, 200));
    expect(store.editingGroupPath.value).toEqual([]);
    expect(store.selectedIds.value).toEqual(["outside"]);
  });
});

describe("composition selection hierarchy", () => {
  it.each(["row", "column"] as const)("uses the rendered occupancy of a %s facet root", (direction) => {
    let occupancies: any[] = [];
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: (selector: string) => selector === "[data-selection-occupancy-node-id]"
        ? occupancies
        : [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [{
      ...layerDataset,
      id: `rendered-${direction}-facet-dataset`,
      rows: [
        { series: "A", time: "2026-01-01", value: "10" },
        { series: "B", time: "2026-01-01", value: "14" },
      ],
    }];
    const chart = lineChart(`rendered-${direction}-facet`, 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: `rendered-${direction}-facet-dataset` };
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];

    expect(store.applyDimensionFacet("series", direction)).toBe(true);
    const root = store.canvasNodes.value[0]!;
    const children = root.kind === "group" ? root.children : [];
    const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const owner = {
      dataset: { nodeId: root.id },
      querySelectorAll: () => occupancies,
    };
    const marker = {
      dataset: { selectionOccupancyNodeId: root.id, selectionOccupancyComposite: "true" },
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      getCTM: () => identity,
      closest: () => owner,
    };
    const childOccupancy = (nodeId: string, e: number, f: number) => ({
      dataset: { selectionOccupancyNodeId: nodeId },
      getBBox: () => ({ x: 0, y: 0, width: 800, height: 400 }),
      getCTM: () => ({ ...identity, e, f }),
    });
    const secondOffset = direction === "row" ? { e: -24, f: 428 } : { e: 836, f: -18 };
    occupancies = [
      marker,
      childOccupancy(children[0]?.id ?? "facet-child-a", -24, -18),
      childOccupancy(children[1]?.id ?? "facet-child-b", secondOffset.e, secondOffset.f),
    ];
    expect(store.syncRenderedNodeSelectionBounds()).toBe(true);

    const width = direction === "row" ? 800 : 1660;
    const height = direction === "row" ? 846 : 400;
    expect(store.selectionBounds.value?.minX).toBeCloseTo(root.x - 24);
    expect(store.selectionBounds.value?.minY).toBeCloseTo(root.y - 18);
    expect(store.selectionBounds.value?.maxX).toBeCloseTo(root.x - 24 + width);
    expect(store.selectionBounds.value?.maxY).toBeCloseTo(root.y - 18 + height);
    expect(store.selectionBounds.value?.width).toBeCloseTo(width);
    expect(store.selectionBounds.value?.height).toBeCloseTo(height);
    expect(store.selectionFrame.value).toMatchObject({
      width,
      height,
      rotation: 0,
    });
    expect(store.selectionFrame.value?.x).toBeCloseTo(root.x - 24);
    expect(store.selectionFrame.value?.y).toBeCloseTo(root.y - 18);
  });

  it.each([
    ["right", { x: -40, y: -10, width: 850, height: 420 }],
    ["left", { x: -15, y: -10, width: 840, height: 420 }],
    ["down", { x: -30, y: -20, width: 900, height: 460 }],
    ["up", { x: -30, y: -25, width: 900, height: 455 }],
  ] as const)("uses browser-measured %s tree marks and labels instead of estimated plot bounds", (direction, box) => {
    const occupancy = {
      dataset: { selectionOccupancyNodeId: "rendered-tree-selection" },
      getBBox: () => box,
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: (selector: string) => selector === "[data-selection-occupancy-node-id]"
        ? [occupancy]
        : [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    const tree = lineChart("rendered-tree-selection", 100, false);
    tree.chartSpec = {
      ...tree.chartSpec!,
      chartType: "Dendrogram",
      selectionBounds: { x: 0, y: 0, width: 40, height: 30 },
      markGroups: [{
        id: "rendered-tree-selection-nodes",
        chartId: tree.id,
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection: direction },
      }],
    };
    tree.renderedContent = '<g data-chart-type="dendrogram" />';
    store.canvasNodes.value = [tree];
    store.selectedIds.value = [tree.id];

    expect(store.syncRenderedNodeSelectionBounds()).toBe(true);

    expect(store.selectionFrame.value).toEqual({
      x: tree.x + box.x,
      y: tree.y + box.y,
      width: box.width,
      height: box.height,
      rotation: 0,
    });
  });

  it("selects a composite without side effects and uses only DOM transforms while dragging", () => {
    listeners.clear();
    const transformWrites: string[] = [];
    const svgElement = (id: string, transform: string) => {
      const attributes = new Map([["transform", transform]]);
      return {
        dataset: id ? { nodeId: id } : {},
        parentElement: null,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => {
          attributes.set(name, value);
          if (name === "transform") transformWrites.push(`${id || "selection"}:${value}`);
        },
      };
    };
    const firstElement = svgElement("composite-member-a", "translate(100 100)");
    const secondElement = svgElement("composite-member-b", "translate(950 100)");
    const selectionElement = svgElement("", "");
    const elements = [firstElement, secondElement, selectionElement];
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: (selector: string) => selector === "[data-transform-only-base]"
        ? elements.filter((element) => "transformOnlyBase" in element.dataset)
        : [firstElement, secondElement],
      querySelector: (selector: string) => selector === ".selection-overlay" ? selectionElement : null,
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    const first = lineChart("composite-member-a", 100, false);
    const second = lineChart("composite-member-b", 950, false);
    const composition = {
      id: "composition:deferred-selection",
      type: "facet" as const,
      members: [first, second].map((node) => ({
        nodeId: node.id,
        sourceNodeId: first.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels: [],
      })),
      sharedChannels: [],
    };
    first.compositionSpec = composition;
    second.compositionSpec = composition;
    store.canvasNodes.value = [first, second];
    store.axisBindingTarget.value = { nodeId: first.id, channel: "x" };
    const relationshipStateBefore = JSON.stringify(store.chartRelationships.value);
    const storageBefore = Array.from(storage.entries());

    store.onCanvasNodePointerDown(first, pointerEvent(140, 140));

    expect(store.selectedIds.value).toEqual([first.id, second.id]);
    expect(store.passiveCompositeSelection.value).toBe(true);
    expect(store.selectionBounds.value).toEqual({
      minX: 100,
      minY: 100,
      maxX: 1750,
      maxY: 500,
      width: 1650,
      height: 400,
    });
    expect(store.interaction.value).toMatchObject({ type: "move", deferred: true });
    expect(store.axisBindingTarget.value).toBeNull();
    expect(store.selectedRelationshipEntity.value).toBeNull();
    expect(store.compositionDragSourceId.value).toBeNull();
    expect(store.activeDropZone.value).toBeNull();

    listeners.get("pointermove")?.(pointerEvent(190, 180));

    expect([first.x, first.y, second.x, second.y]).toEqual([100, 100, 950, 100]);
    expect(store.canUndo.value).toBe(false);
    expect(JSON.stringify(store.chartRelationships.value)).toBe(relationshipStateBefore);
    expect(Array.from(storage.entries())).toEqual(storageBefore);

    listeners.get("pointerup")?.(pointerEvent(190, 180));

    expect(transformWrites.some((value) => value.includes("translate(50 40)"))).toBe(true);
    expect([first.x, first.y, second.x, second.y]).toEqual([150, 140, 1000, 140]);
    expect(store.canUndo.value).toBe(true);
    expect(JSON.stringify(store.chartRelationships.value)).toBe(relationshipStateBefore);
    expect(Array.from(storage.entries())).toEqual(storageBefore);
  });

  it("keeps resize handles active for one direct Concat member", () => {
    listeners.clear();
    const canvasRef = coordinateCanvasRef();
    Object.assign(canvasRef.value!, { clientWidth: 1800, clientHeight: 1000 });
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    const first = lineChart("concat-resize-a", 100, false);
    const second = lineChart("concat-resize-b", 920, false);
    const composition = {
      id: "composition:concat-resize",
      type: "concat" as const,
      direction: "horizontal" as const,
      members: [first, second].map((node) => ({
        nodeId: node.id,
        sourceNodeId: first.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels: ["y" as const],
      })),
      sharedChannels: ["y" as const],
      concatLinks: [{
        targetNodeId: first.id,
        sourceNodeId: second.id,
        direction: "horizontal" as const,
        position: "after" as const,
        sharedChannels: ["y" as const],
      }],
    };
    const coordinateSystem = {
      id: "coordinate:concat-resize",
      type: "Cartesian" as const,
      ownerNodeId: first.id,
      members: [first, second].map((node) => ({ nodeId: node.id, channels: ["x" as const, "y" as const] })),
      sharedChannels: ["y" as const],
    };
    first.compositionSpec = composition;
    second.compositionSpec = composition;
    first.coordinateSystem = coordinateSystem;
    second.coordinateSystem = coordinateSystem;
    store.canvasNodes.value = [first, second];

    store.onCanvasNodePointerDown(first, pointerEvent(140, 140));
    listeners.get("pointerup")?.(pointerEvent(140, 140));

    expect(store.selectedIds.value).toEqual([first.id]);
    expect(store.passiveCompositeSelection.value).toBe(false);
    expect(store.scaleHandles.value).toHaveLength(4);
    const handle = store.scaleHandles.value.find((candidate) => candidate.key === "se")!;
    const secondWidth = second.width;
    store.onScaleHandlePointerDown("se", pointerEvent(handle.x, handle.y));

    expect(store.interaction.value).toMatchObject({
      type: "scale",
      itemIds: [first.id],
    });
    listeners.get("pointermove")?.(pointerEvent(handle.x + 80, handle.y));
    listeners.get("pointerup")?.(pointerEvent(handle.x + 80, handle.y));

    expect(first.width).toBeGreaterThan(800);
    expect(second.width).toBe(secondWidth);
  });

  it("defers geographic node position updates until the drag ends", () => {
    listeners.clear();
    const mapElement = {
      namespaceURI: "http://www.w3.org/1999/xhtml",
      dataset: { nodeId: "geographic-drag-node" },
      style: { transform: "translate(100px, 100px)" },
      parentElement: null,
      getAttribute: () => null,
      setAttribute: () => undefined,
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: (selector: string) => selector === "[data-transform-only-base]"
        ? ("transformOnlyBase" in mapElement.dataset ? [mapElement] : [])
        : [mapElement],
      querySelector: () => null,
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    const geographicNode = lineChart("geographic-drag-node", 100, false);
    geographicNode.layerKind = "deckgl";
    geographicNode.deckglLayerType = "ScatterplotLayer";
    store.canvasNodes.value = [geographicNode];

    store.onCanvasNodePointerDown(geographicNode, pointerEvent(140, 140));
    listeners.get("pointermove")?.(pointerEvent(190, 180));

    expect([geographicNode.x, geographicNode.y]).toEqual([100, 100]);
    expect(mapElement.style.transform).toContain("translate(50px, 40px)");

    listeners.get("pointerup")?.(pointerEvent(190, 180));

    expect([geographicNode.x, geographicNode.y]).toEqual([150, 140]);
    expect(mapElement.style.transform).toBe("translate(100px, 100px)");
  });

  it("nests an existing chart on a picked geographic scatterplot point", () => {
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    const map = lineChart("map-scatter", 100, false);
    map.layerKind = "deckgl";
    map.deckglLayerType = "ScatterplotLayer";
    map.renderedContent = null;
    const child = cartesianChart("bar-for-map", 960, "SingleBarChart");
    store.canvasNodes.value = [map, child];

    const target = {
      layerId: map.id,
      rowKey: "geo-17",
      position: [12.4, 48.8],
      radius: 9,
      clientX: 320,
      clientY: 240,
    } as const;
    store.onCanvasNodePointerDown(child, pointerEvent(1000, 140));
    listeners.get("pointermove")?.(pointerEvent(320, 240));
    listeners.get(deckglPointNestHoverEvent)?.({ detail: target });
    listeners.get("pointerup")?.(pointerEvent(320, 240));

    const relationship = Object.values(store.chartRelationships.value.nestedRelationships)[0];
    expect(relationship).toMatchObject({
      status: "active",
      parentChartId: map.id,
      parentDataKey: "geo-17",
      childChartId: child.id,
    });
    expect(store.nestedRenderedChildIds.value.has(child.id)).toBe(true);

    store.undoCanvasChange();
    expect(Object.keys(store.chartRelationships.value.nestedRelationships)).toHaveLength(0);
    expect(store.nestedRenderedChildIds.value.has(child.id)).toBe(false);
  });

  it("allows Pie templates to nest on geographic scatterplot points", () => {
    const store = useCanvasStore(coordinateCanvasRef());
    const pieCandidate = store.implementedTemplateCandidates.value.find((item) =>
      item.chartType === "PieChart" && !item.unavailable);
    const mapCandidate = store.implementedTemplateCandidates.value.find((item) =>
      item.renderMode === "static-layer");
    expect(pieCandidate).toBeDefined();
    expect(mapCandidate).toBeDefined();
    expect(isDeckglPointNestedChartCandidate(pieCandidate!)).toBe(true);
    expect(isDeckglPointNestedChartCandidate(mapCandidate!)).toBe(false);
  });

  it("nests one chart instance on every visible geographic scatterplot point", () => {
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    const dataset: Dataset = {
      id: "map-monthly-data",
      name: "map-monthly-data",
      columns: [],
      rows: [],
      graph: {
        nodes: {
          columns: [
            { name: "id", type: "nominal" },
            { name: "point", type: "nominal" },
            { name: "month", type: "ordinal" },
            { name: "value", type: "quantitative" },
          ],
          rows: [
            { id: "point-a", point: "geo-a", month: "1", value: "10" },
            { id: "point-a", point: "geo-a", month: "2", value: "20" },
            { id: "point-b", point: "geo-b", month: "1", value: "30" },
            { id: "point-b", point: "geo-b", month: "2", value: "40" },
          ],
        },
        edges: { columns: [], rows: [] },
      },
    };
    const geometry: GeometrySource = {
      id: "map-monthly-geometry",
      name: "map-monthly-geometry",
      features: ["geo-a", "geo-b"].map((id) => ({
        type: "Feature" as const,
        id,
        properties: { id },
        geometry: { type: "Point" as const, coordinates: [0, 0] },
      })),
    };
    useDatasetStore().datasets.value = [dataset];
    useDatasetStore().geometrySources.value = [geometry];

    const map = lineChart("map-every-point", 100, false);
    map.layerKind = "deckgl";
    map.deckglLayerType = "ScatterplotLayer";
    map.renderedContent = null;
    map.deckglBinding = {
      datasetId: dataset.id,
      geometrySourceId: geometry.id,
      idField: "point",
      aggregation: "sum",
    };
    const child = cartesianChart("bar-every-point", 960, "SingleBarChart");
    child.chartSpec = { ...child.chartSpec!, datasetId: dataset.id };
    store.canvasNodes.value = [map, child];

    const target = {
      layerId: map.id,
      rowKey: "point-a",
      position: [0, 0],
      radius: 9,
      clientX: 320,
      clientY: 240,
    } as const;
    store.onCanvasNodePointerDown(child, pointerEvent(1000, 140));
    listeners.get("pointermove")?.(pointerEvent(320, 240));
    listeners.get(deckglPointNestHoverEvent)?.({ detail: target });
    listeners.get("pointerup")?.(pointerEvent(320, 240));

    const relationships = Object.values(store.chartRelationships.value.nestedRelationships);
    expect(relationships).toHaveLength(2);
    expect(relationships.map((relationship) => relationship.parentDataKey).sort()).toEqual(["point-a", "point-b"]);
    expect(new Set(relationships.map((relationship) => relationship.childChartId)).size).toBe(2);
    expect(relationships.every((relationship) => relationship.inheritedFilterContexts?.[0])).toBe(true);
    expect(relationships.map((relationship) => relationship.inheritedFilterContexts?.[0]?.value).sort()).toEqual(["geo-a", "geo-b"]);
    expect(store.nestedPositionEditor.value?.relationshipIds).toHaveLength(2);
    expect(store.updateNestedCallout({ enabled: true, scale: 1.4 })).toBe(true);
    expect(relationships.every((relationship) =>
      (relationship.parameters as RelativeNestedParameters).callout?.enabled === true
      && (relationship.parameters as RelativeNestedParameters).callout?.scale === 1.4)).toBe(true);

    store.axisBindingTarget.value = { nodeId: relationships[0]!.childChartId, channel: "x" };
    store.setChartEncoding("x", "month");
    store.axisBindingTarget.value = { nodeId: relationships[0]!.childChartId, channel: "y" };
    store.setChartEncoding("y", "value");
    const renderedValues = relationships.map((relationship) => {
      const nestedChild = store.canvasNodes.value.find((node) => node.id === relationship.childChartId);
      return Array.from(nestedChild?.renderedContent?.matchAll(/data-value="([^"]+)"/g) ?? [], (match) => Number(match[1]))
        .sort((left, right) => left - right);
    }).sort((left, right) => left[0]! - right[0]!);
    expect(renderedValues).toEqual([[10, 20], [30, 40]]);
  });

  it("selects and drags every member until the composition is entered", () => {
    const store = useCanvasStore(ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement));
    store.relationshipStore.dispatch({ type: "clear" });
    const first = lineChart("facet-member-a", 100, false);
    const second = lineChart("facet-member-b", 950, false);
    const composition = {
      id: "composition:facet-selection",
      type: "facet" as const,
      members: [first, second].map((node) => ({
        nodeId: node.id,
        sourceNodeId: first.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels: [],
      })),
      sharedChannels: [],
    };
    first.compositionSpec = composition;
    second.compositionSpec = composition;
    store.canvasNodes.value = [first, second];

    store.onCanvasNodePointerDown(first, pointerEvent(140, 140));
    expect(store.selectedIds.value).toEqual([first.id, second.id]);
    expect(store.selectionBounds.value).toEqual({
      minX: 100,
      minY: 100,
      maxX: 1750,
      maxY: 500,
      width: 1650,
      height: 400,
    });
    listeners.get("pointermove")?.(pointerEvent(190, 180));
    listeners.get("pointerup")?.(pointerEvent(190, 180));
    expect([first.x, first.y, second.x, second.y]).toEqual([150, 140, 1000, 140]);

    expect(store.canConfigureSelectionComposition.value).toBe(true);
    expect(store.configureSelectionComposition()).toBe(false);
    expect(store.nestedPositionEditor.value).toBeNull();
    expect(store.canEnterSelection.value).toBe(true);
    expect(store.enterSelection()).toBe(true);
    expect(store.editingCompositionId.value).toBe(composition.id);
    expect(store.selectedIds.value).toEqual([]);

    store.onCanvasNodePointerDown(first, pointerEvent(190, 180));
    listeners.get("pointermove")?.(pointerEvent(220, 200));
    listeners.get("pointerup")?.(pointerEvent(220, 200));
    expect(store.selectedIds.value).toEqual([first.id]);
    expect([first.x, first.y]).toEqual([180, 160]);
    expect([second.x, second.y]).toEqual([1000, 140]);
  });

  it("removes a selected composition while preserving its member charts", () => {
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    const first = lineChart("facet-member-a", 100, false);
    const second = lineChart("facet-member-b", 950, false);
    const composition = {
      id: "composition:facet-removal",
      type: "facet" as const,
      members: [first, second].map((node) => ({
        nodeId: node.id,
        sourceNodeId: first.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels: [],
      })),
      sharedChannels: [],
    };
    first.compositionSpec = composition;
    second.compositionSpec = composition;
    store.canvasNodes.value = [first, second];
    store.relationshipStore.reconcileCanvasNodes(store.canvasNodes.value);
    store.onCanvasNodePointerDown(first, pointerEvent(140, 140));

    expect(store.canRemoveSelectionComposition.value).toBe(true);
    expect(store.removeSelectionComposition()).toBe(true);
    expect(store.canvasNodes.value).toHaveLength(2);
    expect(store.canvasNodes.value.every((node) => node.compositionSpec == null)).toBe(true);
    expect(store.canvasNodes.value.map((node) => node.coordinateSystem?.id)).toEqual([
      `coordinate:${first.id}`,
      `coordinate:${second.id}`,
    ]);
    expect(store.relationshipStore.state.value.compositions[composition.id]).toBeUndefined();
    expect(store.selectedIds.value).toEqual([first.id, second.id]);
    expect(store.canRemoveSelectionComposition.value).toBe(false);

    store.undoCanvasChange();
    expect(store.canvasNodes.value.every((node) => node.compositionSpec?.id === composition.id)).toBe(true);
  });

  it("unwraps a closed Layer root when its composition is removed", () => {
    const first = cartesianChart("closed-layer-removal-a", 100, "LineGraph");
    const second = cartesianChart("closed-layer-removal-b", 950, "AreaChart");
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("layer", true, ["y"])).toBe(true);
    expect(store.canvasNodes.value).toHaveLength(1);
    expect(store.canvasNodes.value[0]?.kind).toBe("group");
    expect(store.canRemoveSelectionComposition.value).toBe(true);

    expect(store.removeSelectionComposition()).toBe(true);
    expect(store.canvasNodes.value.map((node) => node.id).sort()).toEqual([first.id, second.id].sort());
    expect(store.canvasNodes.value.every((node) => node.compositionSpec == null)).toBe(true);
    expect(store.selectedIds.value.sort()).toEqual([first.id, second.id].sort());
  });

  it("keeps concat visual scales unchanged when removing the composition", () => {
    const first = cartesianChart("concat-removal-a", 100, "LineGraph");
    const second = cartesianChart("concat-removal-b", 950, "SingleBarChart");
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("concat", true, ["y"], "horizontal")).toBe(true);
    const visualState = store.canvasNodes.value.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      scaleX: node.scaleX,
      scaleY: node.scaleY,
      scales: node.chartSpec?.scales,
      plotArea: node.chartSpec?.plotArea,
      renderedContent: node.renderedContent,
    }));

    expect(store.removeSelectionComposition()).toBe(true);
    expect(store.canvasNodes.value.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      scaleX: node.scaleX,
      scaleY: node.scaleY,
      scales: node.chartSpec?.scales,
      plotArea: node.chartSpec?.plotArea,
      renderedContent: node.renderedContent,
    }))).toEqual(visualState);
  });

  it("reflows a nested child after Concat moves its scatter parent", async () => {
    const dataset: Dataset = {
      id: "concat-nested-scatter-layout",
      name: "concat-nested-scatter-layout.csv",
      columns: [
        { name: "id", type: "nominal" },
        { name: "category", type: "nominal" },
        { name: "x", type: "quantitative" },
        { name: "y", type: "quantitative" },
      ],
      rows: [{ id: "point-a", category: "A", x: "10", y: "20" }],
      primaryKey: ["id"],
    };
    const companion = cartesianChart("concat-nested-companion", 100, "SingleBarChart");
    companion.chartSpec = {
      ...companion.chartSpec!,
      datasetId: dataset.id,
      encodings: {
        x: { field: "category", type: "nominal" },
        y: { field: "y", type: "quantitative" },
      },
    };
    const parent = cartesianChart("concat-nested-scatter", 1100, "Scatterplot");
    parent.chartSpec = {
      ...parent.chartSpec!,
      datasetId: dataset.id,
      encodings: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    };
    const child = polarChart("concat-nested-pie", 1500, 360);
    child.chartSpec = { ...child.chartSpec!, datasetId: dataset.id };
    const markCenter = () => ({ x: parent.x + 260, y: parent.y + 180 });
    const pointMark = new SvgMarkStub({
      "data-chart-id": parent.id,
      "data-mark-role": "point",
      "data-mark-group-id": `mark-group:${parent.id}:point`,
      "data-row-key": "point-a",
    }, { left: 0, top: 0, right: 12, bottom: 12 });
    pointMark.getBoundingClientRect = () => {
      const center = markCenter();
      return {
        left: center.x - 6,
        top: center.y - 6,
        right: center.x + 6,
        bottom: center.y + 6,
        x: center.x - 6,
        y: center.y - 6,
        width: 12,
        height: 12,
        toJSON: () => ({}),
      };
    };
    const parentElement = new SvgMarkStub(
      { "data-node-id": parent.id },
      { left: parent.x, top: parent.y, right: parent.x + parent.width, bottom: parent.y + parent.height },
      [pointMark],
    );
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 2200, height: 1200 }),
      querySelectorAll: () => [parentElement],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [companion, parent, child];
    [parent, child].forEach((node, index) => store.relationshipStore.dispatch({
      type: "register-chart",
      chart: {
        id: node.id,
        nodeId: node.id,
        chartType: node.chartSpec!.chartType,
        datasetId: node.chartSpec!.datasetId,
        instanceKind: index === 0 ? "canvas" : "nested-child",
      },
    }));
    const nestedScale = 0.12;
    const initialCenter = markCenter();
    child.scaleX = nestedScale;
    child.scaleY = nestedScale;
    child.x = initialCenter.x - child.width * nestedScale / 2;
    child.y = initialCenter.y - child.height * nestedScale / 2;
    store.relationshipStore.dispatch({
      type: "begin-nested",
      relationship: {
        id: "nested:concat-scatter-point",
        parentChartId: parent.id,
        parentElementId: `mark:${parent.id}:point:point-a`,
        parentMarkGroupId: `mark-group:${parent.id}:point`,
        parentDataKey: JSON.stringify({ rowKey: "point-a" }),
        childChartId: child.id,
        relationType: "relative-position",
        parameters: {
          ...store.relationshipStore.defaultRelativeParameters(),
          scale: { x: nestedScale, y: nestedScale },
        },
        resolverVersion: 1,
      },
    });
    store.relationshipStore.dispatch({ type: "commit-nested", relationshipId: "nested:concat-scatter-point" });
    store.selectedIds.value = [companion.id, parent.id];
    const parentXBeforeConcat = parent.x;

    expect(store.executeComposition("concat", true, ["y"], "horizontal")).toBe(true);
    expect(parent.x).not.toBe(parentXBeforeConcat);
    await nextTick();

    const resolvedCenter = markCenter();
    expect(child.x + child.width * child.scaleX / 2).toBeCloseTo(resolvedCenter.x);
    expect(child.y + child.height * child.scaleY / 2).toBeCloseTo(resolvedCenter.y);
  });

  it("opens the position editor when configuring a Nested composition", async () => {
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    const parent = lineChart("nested-parent", 100, false);
    const child = lineChart("nested-child", 950, false);
    store.canvasNodes.value = [parent, child];
    [parent, child].forEach((node, index) => {
      store.relationshipStore.dispatch({
        type: "register-chart",
        chart: {
          id: node.id,
          nodeId: node.id,
          chartType: node.chartSpec!.chartType,
          datasetId: node.chartSpec!.datasetId,
          instanceKind: index === 0 ? "canvas" : "nested-child",
        },
      });
    });
    store.relationshipStore.dispatch({
      type: "begin-nested",
      relationship: {
        id: "nested:configure",
        parentChartId: parent.id,
        parentElementId: "mark:nested-parent:point:1",
        childChartId: child.id,
        relationType: "relative-position",
        parameters: store.relationshipStore.defaultRelativeParameters(),
        resolverVersion: 1,
      },
    });
    store.relationshipStore.dispatch({ type: "commit-nested", relationshipId: "nested:configure" });
    await nextTick();

    store.onCanvasNodePointerDown(child, pointerEvent(990, 140));
    listeners.get("pointerup")?.(pointerEvent(990, 140));

    expect(store.canConfigureSelectionComposition.value).toBe(true);
    expect(store.nestedPositionEditor.value).toBeNull();
    expect(store.configureSelectionComposition()).toBe(true);
    expect(store.nestedPositionEditor.value?.relationshipIds).toEqual(["nested:configure"]);
    expect(store.nestedPositionEditor.value?.parent.id).toBe(parent.id);
    expect(store.nestedPositionEditor.value?.child.id).toBe(child.id);
    expect(store.nestedPositionEditor.value?.parameters.retainParent).toBe(false);
    expect(store.nestedPositionEditor.value?.parameters.callout).toEqual({ enabled: false, scale: 1.2 });

    expect(store.updateNestedCallout({ enabled: true, scale: 1.6 })).toBe(true);
    expect(store.relationshipStore.state.value.nestedRelationships["nested:configure"]?.parameters).toMatchObject({
      callout: { enabled: true, scale: 1.6 },
    });
    expect(store.nestedPositionEditor.value?.parameters.callout).toEqual({ enabled: true, scale: 1.6 });
  });
});

describe("generic Layer composition", () => {
  it("requires completed atomic units before composition", () => {
    const canvasRef = ref(null);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    const ready = lineChart("ready-unit", 100, false);
    const incomplete = lineChart("incomplete-unit", 950, false);
    incomplete.chartSpec = {
      ...incomplete.chartSpec!,
      encodings: { x: { field: "time", type: "temporal" } },
    };
    store.canvasNodes.value = [ready, incomplete];
    store.selectedIds.value = [ready.id, incomplete.id];

    expect(store.canCompose.value).toBe(false);
    expect(store.executeComposition("layer")).toBe(false);

    store.axisBindingTarget.value = { nodeId: incomplete.id, channel: "y" };
    store.setChartEncoding("y", "value");
    store.selectedIds.value = [ready.id, incomplete.id];
    expect(store.canCompose.value).toBe(true);
  });

  it("layers compatible chart-local views without requiring identical datasets or filters", () => {
    const alternateDataset: Dataset = {
      ...layerDataset,
      id: "alternate-layer-dataset",
      rows: layerDataset.rows.map((row) => ({ ...row })),
    };
    const source = lineChart("independent-layer-source", 100, false);
    const target = lineChart("independent-layer-target", 950, false);
    source.chartSpec = { ...source.chartSpec!, filters: { series: "A" } };
    target.chartSpec = {
      ...target.chartSpec!,
      datasetId: alternateDataset.id,
      filters: { series: "B" },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset, alternateDataset];
    store.canvasNodes.value = [source, target];
    store.selectedIds.value = [source.id, target.id];

    expect(store.executeComposition("layer", true, ["x", "y"], undefined, undefined, target.id)).toBe(true);
    expect(source.coordinateSystem).toBe(target.coordinateSystem);
    expect(source.coordinateSystem?.ownerNodeId).toBe(target.id);
    expect(source.coordinateGuide).toEqual(target.coordinateGuide);
  });

  it("shares categorical axes by their ordered name lists instead of column identity", () => {
    const sourceDataset: Dataset = {
      id: "categorical-axis-source",
      name: "categorical-axis-source.csv",
      columns: [
        { name: "region", type: "nominal" },
        { name: "amount", type: "quantitative" },
      ],
      rows: [
        { region: "East", amount: "10" },
        { region: "West", amount: "20" },
      ],
    };
    const targetDataset: Dataset = {
      id: "categorical-axis-target",
      name: "categorical-axis-target.csv",
      columns: [
        { name: "area", type: "ordinal" },
        { name: "score", type: "quantitative" },
      ],
      rows: [
        { area: "East", score: "3" },
        { area: "West", score: "7" },
      ],
    };
    const source = cartesianChart("categorical-axis-source-chart", 100, "LineGraph");
    source.chartSpec = {
      ...source.chartSpec!,
      datasetId: sourceDataset.id,
      encodings: {
        x: { field: "region", type: "nominal" },
        y: { field: "amount", type: "quantitative" },
      },
    };
    const target = cartesianChart("categorical-axis-target-chart", 950, "LineGraph");
    target.chartSpec = {
      ...target.chartSpec!,
      datasetId: targetDataset.id,
      encodings: {
        x: { field: "area", type: "ordinal" },
        y: { field: "score", type: "quantitative" },
      },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [sourceDataset, targetDataset];
    store.canvasNodes.value = [source, target];
    store.selectedIds.value = [source.id, target.id];

    expect(store.concatNodesAreCompatible([source, target], "vertical", "x")).toBe(true);
    expect(store.executeComposition("layer", true, ["x"])).toBe(true);
    expect(source.compositionSpec?.sharedChannels).toEqual(["x"]);
  });

  it("rejects categorical axes whose ordered name lists differ", () => {
    const sourceDataset: Dataset = {
      id: "categorical-list-source",
      name: "categorical-list-source.csv",
      columns: [
        { name: "region", type: "nominal" },
        { name: "amount", type: "quantitative" },
      ],
      rows: [
        { region: "East", amount: "10" },
        { region: "West", amount: "20" },
      ],
    };
    const targetDataset: Dataset = {
      id: "categorical-list-target",
      name: "categorical-list-target.csv",
      columns: [
        { name: "area", type: "nominal" },
        { name: "score", type: "quantitative" },
      ],
      rows: [
        { area: "West", score: "3" },
        { area: "East", score: "7" },
      ],
    };
    const source = cartesianChart("categorical-list-source-chart", 100, "LineGraph");
    source.chartSpec = {
      ...source.chartSpec!,
      datasetId: sourceDataset.id,
      encodings: {
        x: { field: "region", type: "nominal" },
        y: { field: "amount", type: "quantitative" },
      },
    };
    const target = cartesianChart("categorical-list-target-chart", 950, "LineGraph");
    target.chartSpec = {
      ...target.chartSpec!,
      datasetId: targetDataset.id,
      encodings: {
        x: { field: "area", type: "nominal" },
        y: { field: "score", type: "quantitative" },
      },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [sourceDataset, targetDataset];

    expect(store.concatNodesAreCompatible([source, target], "vertical", "x")).toBe(false);
    expect(store.concatNodesAreCompatible([source, target], "horizontal", "y")).toBe(true);
  });

  it("enumerates every legal top-level composition portal during a drag", () => {
    const source = cartesianChart("all-zones-source", 100, "LineGraph");
    const target = cartesianChart("all-zones-target", 950, "AreaChart");
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [source, target];

    const zones = store.compositionDropZones(source.id);
    expect(zones.filter((zone) => zone.type === "concat").map((zone) => [
      zone.direction,
      zone.concatPosition,
      zone.sharedChannels,
    ])).toEqual(expect.arrayContaining([
      ["horizontal", "before", ["y"]],
      ["horizontal", "after", ["y"]],
      ["vertical", "before", ["x"]],
      ["vertical", "after", ["x"]],
    ]));
    const layerZones = zones.filter((zone) => zone.type === "layer" && !zone.enterCompositionId);
    expect(layerZones.map((zone) => zone.sharedChannels)).toEqual([
      ["x", "y"],
    ]);
    const layerBounds = layerZones[0]!.bounds;
    const plot = target.chartSpec!.plotArea!;
    expect(layerBounds.minX).toBeGreaterThan(target.x + plot.x);
    expect(layerBounds.minY).toBeGreaterThan(target.y + plot.y);
    expect(layerBounds.maxX).toBeLessThan(target.x + plot.x + plot.width);
    expect(layerBounds.maxY).toBeLessThan(target.y + plot.y + plot.height);
    zones.filter((zone) => zone.type === "concat").forEach((zone) => {
      const separation = zone.direction === "horizontal"
        ? zone.concatPosition === "before"
          ? layerBounds.minX - zone.bounds.maxX
          : zone.bounds.minX - layerBounds.maxX
        : zone.concatPosition === "before"
          ? layerBounds.minY - zone.bounds.maxY
          : zone.bounds.minY - layerBounds.maxY;
      expect(separation).toBeGreaterThanOrEqual(10);
    });
    expect(zones.some((zone) => zone.type === "nested" && zone.nestedAction === "enter")).toBe(true);

    const layerPoint = (verticalFraction: number) => ({
      x: target.x + plot.x + plot.width * 0.18,
      y: target.y + plot.y + plot.height * verticalFraction,
    });
    expect(store.compositionDropZoneAtPoint(layerPoint(1 / 6), source.id)?.sharedChannels).toEqual(["x", "y"]);
    expect(store.compositionDropZoneAtPoint(layerPoint(1 / 2), source.id)?.sharedChannels).toEqual(["x", "y"]);
    expect(store.compositionDropZoneAtPoint(layerPoint(5 / 6), source.id)?.sharedChannels).toEqual(["x", "y"]);
    expect(store.compositionDropZoneAtPoint({
      x: target.x + plot.x + 1,
      y: target.y + plot.y + plot.height / 2,
    }, source.id)).toBeNull();

    listeners.clear();
    store.onCanvasNodePointerDown(source, pointerEvent(source.x + 20, source.y + 20));
    expect(store.availableDropZones.value.length).toBeGreaterThan(0);
    expect(store.availableDropZones.value.filter((zone) => zone.type === "layer")).toHaveLength(1);
    listeners.get("pointerup")?.(pointerEvent(source.x + 20, source.y + 20));
  });

  it("keeps a Layer root intact when it becomes a direct Concat member", () => {
    const first = cartesianChart("closed-layer-first", 100, "LineGraph");
    const second = cartesianChart("closed-layer-second", 850, "AreaChart");
    const third = cartesianChart("closed-layer-third", 1600, "LineGraph");
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second, third];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("layer", true, ["x", "y"])).toBe(true);
    const layerRoot = store.canvasNodes.value.find((node) => node.compositionSpec?.type === "layer");
    expect(layerRoot?.kind).toBe("group");
    const layerCompositionId = layerRoot?.compositionSpec?.id;
    const rootDropZones = store.compositionDropZones(layerRoot!.id);
    expect(rootDropZones.length).toBeGreaterThan(0);
    expect(rootDropZones.every((zone) => zone.targetNodeId === third.id)).toBe(true);

    expect(store.executeComposition(
      "concat",
      true,
      ["y"],
      "horizontal",
      "after",
      layerRoot!.id,
      third.id,
    )).toBe(true);

    expect(store.canvasNodes.value).toHaveLength(2);
    expect(layerRoot?.compositionSpec?.id).toBe(layerCompositionId);
    expect(layerRoot?.compositionSpec?.type).toBe("layer");
    expect(layerRoot?.parentCompositionSpec?.type).toBe("concat");
    expect(layerRoot?.parentCompositionSpec?.members.map((member) => member.nodeId)).toEqual([
      layerRoot?.id,
      third.id,
    ]);
    expect(layerRoot?.kind === "group" ? layerRoot.children : []).toHaveLength(2);
  });

  it("layers independent line and point marks under one shared coordinate system", () => {
    const atomicDataset: Dataset = {
      ...layerDataset,
      id: "atomic-layer-dataset",
      columns: [
        ...layerDataset.columns.filter((column) => column.name !== "value"),
        { name: "weight_kg", type: "quantitative" },
        { name: "water_kg", type: "quantitative" },
        { name: "fat_kg", type: "quantitative" },
      ],
      rows: layerDataset.rows.map((row, index) => ({
        ...row,
        weight_kg: row.value ?? "",
        water_kg: String(5 + index * 2),
        fat_kg: String(2 + index),
      })),
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [atomicDataset];
    const ownerChart = lineChart("owner", 100, true);
    ownerChart.chartSpec = {
      ...ownerChart.chartSpec!,
      datasetId: atomicDataset.id,
      encodings: {
        ...ownerChart.chartSpec!.encodings,
        y: { field: "weight_kg", type: "quantitative" },
      },
    };
    const memberChart = lineLeafChart("member", 1000, 120, 45);
    memberChart.chartSpec = {
      ...memberChart.chartSpec!,
      chartType: "Scatterplot",
      datasetId: atomicDataset.id,
      encodings: {
        ...memberChart.chartSpec!.encodings,
        x: { field: "series", type: "nominal" },
        y: { field: "water_kg", type: "quantitative" },
      },
    };
    store.canvasNodes.value = [ownerChart, memberChart];
    store.selectedIds.value = ["owner", "member"];

    expect(store.executeComposition("layer")).toBe(true);
    expect(store.canvasNodes.value).toHaveLength(1);
    const layerRoot = store.canvasNodes.value[0]!;
    expect(layerRoot.kind).toBe("group");
    expect(layerRoot.compositionSpec?.type).toBe("layer");
    const layerMembers = layerRoot.kind === "group" ? layerRoot.children : [];
    const owner = layerMembers.find((node) => node.coordinateSystem?.ownerNodeId === node.id)!;
    const member = layerMembers.find((node) => node.id !== owner.id)!;
    expect(owner.renderedContent).not.toContain('data-mark-role="x-axis"');
    expect(owner.renderedContent).not.toContain('data-mark-role="y-axis"');
    expect(owner.renderedContent).not.toContain("<text");
    expect(member.renderedContent).not.toContain('data-mark-role="x-axis"');
    expect(member.renderedContent).not.toContain('data-mark-role="y-axis"');
    expect(member.renderedContent).not.toContain("<text");
    expect(owner.renderedContent).toContain('data-mark-role="line"');
    expect(member.renderedContent).toContain('data-mark-role="point"');
    expect(owner.coordinateSystem?.ownerNodeId).toBe(owner.id);
    expect(owner.coordinateSystem?.sharedChannels).toEqual(["y"]);
    expect(member.chartSpec?.encodings.x).toEqual({ field: "series", type: "nominal" });
    expect(member.chartSpec?.encodings.y).toEqual({ field: "water_kg", type: "quantitative" });
    expect(owner.chartSpec?.encodings.y).toEqual({ field: "weight_kg", type: "quantitative" });
    expect(member.chartSpec?.plotArea?.x).toBe((owner.chartSpec?.plotArea?.x ?? 0) + 120);
    expect(member.chartSpec?.plotArea?.y).toBe((owner.chartSpec?.plotArea?.y ?? 0) + 45);
    expect(member.chartSpec?.scales?.x?.type).toBe("point");
    expect(member.chartSpec?.scales?.y?.range).toEqual(owner.chartSpec?.scales?.y?.range.map((value) => value + 45));
    expect(member.chartSpec?.scales?.y?.domain).toEqual(owner.chartSpec?.scales?.y?.domain);
    const initialSharedYDomain = owner.chartSpec?.scales?.y?.domain as [number, number];
    expect(initialSharedYDomain[0]).toBeLessThanOrEqual(5);
    expect(initialSharedYDomain[1]).toBeGreaterThanOrEqual(22);
    store.axisBindingTarget.value = { nodeId: member.id, channel: "y" };
    store.setChartEncoding("y", "fat_kg");
    expect(member.chartSpec?.encodings.y).toEqual({ field: "fat_kg", type: "quantitative" });
    expect(owner.chartSpec?.encodings.y).toEqual({ field: "weight_kg", type: "quantitative" });
    expect(member.chartSpec?.scales?.y?.domain).toEqual(owner.chartSpec?.scales?.y?.domain);
    const reboundSharedYDomain = owner.chartSpec?.scales?.y?.domain as [number, number];
    expect(reboundSharedYDomain[0]).toBeLessThanOrEqual(2);
    expect(reboundSharedYDomain[1]).toBeGreaterThanOrEqual(22);
    store.setAxisBindingAggregation("y", "sum");
    expect(member.chartSpec?.aggregations?.y).toBe("sum");
    expect(owner.chartSpec?.aggregations?.y).toBeUndefined();
    const ownerBounds = collectNodeSelectionBounds(owner);
    const memberBounds = collectNodeSelectionBounds(member);
    expect(memberBounds.minX).toBeCloseTo(ownerBounds.minX);
    expect(memberBounds.minY).toBeCloseTo(ownerBounds.minY);
    expect(memberBounds.maxX).toBeCloseTo(ownerBounds.maxX);
    expect(memberBounds.maxY).toBeCloseTo(ownerBounds.maxY);
    expect(store.selectionBounds.value).toEqual(collectNodeSelectionBounds(layerRoot));
    expect(member.x).toBe(owner.x);
    expect(member.y).toBe(owner.y);

    const startRoot = { x: layerRoot.x, y: layerRoot.y };
    const startOwner = { x: owner.x, y: owner.y };
    const startMember = { x: member.x, y: member.y };
    store.onCanvasNodePointerDown(member, pointerEvent(400, 300));
    listeners.get("pointermove")?.(pointerEvent(480, 360));
    listeners.get("pointerup")?.(pointerEvent(480, 360));

    expect(layerRoot.x).toBe(startRoot.x + 80);
    expect(layerRoot.y).toBe(startRoot.y + 60);
    expect(owner.x).toBe(startOwner.x);
    expect(owner.y).toBe(startOwner.y);
    expect(member.x).toBe(startMember.x);
    expect(member.y).toBe(startMember.y);
    expect(owner.coordinateSystem?.ownerNodeId).toBe(owner.id);
    expect(member.compositionSpec?.type).toBe("layer");

    const beforeUnrestrictedDrag = { rootX: layerRoot.x, ownerX: owner.x, memberX: member.x };
    store.onCanvasNodePointerDown(member, pointerEvent(400, 300));
    listeners.get("pointermove")?.(pointerEvent(-1000, 300));
    listeners.get("pointerup")?.(pointerEvent(-1000, 300));
    expect(layerRoot.x).toBe(beforeUnrestrictedDrag.rootX - 1400);
    expect(owner.x).toBe(beforeUnrestrictedDrag.ownerX);
    expect(member.x).toBe(beforeUnrestrictedDrag.memberX);

    store.reverseCoordinateAxis(member, "x");
    expect(owner.coordinateGuide?.type === "Cartesian" && owner.coordinateGuide.xDirection).toBe(1);
    expect(member.coordinateGuide?.type === "Cartesian" && member.coordinateGuide.xDirection).toBe(-1);
    expect(member.chartSpec?.scales?.x?.type).toBe("point");
  });
});

describe("CSV to Pie binding", () => {
  it("binds CSV fields to independent Theta and R channels", () => {
    const dataset: Dataset = {
      id: "csv-pie-dataset",
      name: "csv-pie.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "component", type: "nominal" },
        { name: "weight", type: "quantitative" },
        { name: "radius", type: "quantitative" },
      ],
      rows: [
        { person: "person1", time: "2025-01-01", component: "water", weight: "38.4", radius: "10" },
        { person: "person1", time: "2025-01-01", component: "fat", weight: "18.6", radius: "20" },
        { person: "person1", time: "2025-01-01", component: "muscle", weight: "27.8", radius: "30" },
        { person: "person1", time: "2025-01-01", component: "minerals", weight: "3.2", radius: "40" },
      ],
    };
    const pieNode: CanvasGroupNode = {
      kind: "group",
      id: "csv-pie",
      name: "Pie Chart",
      x: 120,
      y: 80,
      width: 320,
      height: 180,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      coordinateGuide: {
        type: "Polar",
        origin: { x: 160, y: 90 },
      },
      chartSpec: {
        chartType: "PieChart",
        datasetId: dataset.id,
        encodings: {},
      },
      children: [],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [pieNode];
    store.selectedIds.value = [pieNode.id];
    store.axisBindingTarget.value = { nodeId: pieNode.id, channel: "angle" };
    store.setPolarSegmentFields(["component"]);
    store.setPieAngleFields(["weight"]);
    store.bindPolarRadiusField("radius");

    expect(pieNode.chartSpec?.angleFields).toBeUndefined();
    expect(pieNode.chartSpec?.encodings.theta).toEqual({ field: "weight", type: "quantitative" });
    expect(pieNode.chartSpec?.encodings.radius).toEqual({ field: "radius", type: "quantitative" });
    expect(pieNode.renderedContent).toContain('data-category-key="water"');
    expect(pieNode.renderedContent).toContain('data-radius-field="radius"');
    expect(pieNode.renderedContent).toContain('data-radius-value="10"');
    expect(pieNode.renderedContent).toContain('data-radius-value="40"');
    expect(pieNode.renderedContent?.match(/data-mark-role="arc"/g)).toHaveLength(4);
  });

  it("adds and removes Donut Segment fields through the measure-set drop area", async () => {
    const dataset: Dataset = {
      id: "pie-radius-store",
      name: "pie-radius-store.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "water", type: "quantitative" },
        { name: "fat", type: "quantitative" },
        { name: "radius", type: "quantitative" },
      ],
      rows: [{ person: "A", time: "2025-01-01", water: "40", fat: "20", radius: "10" }],
    };
    const pieNode: CanvasGroupNode = {
      kind: "group",
      id: "pie-radius-store-node",
      name: "Pie radius",
      x: 120,
      y: 80,
      width: 320,
      height: 180,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 90 } },
      chartSpec: {
        chartType: "DonutChart",
        datasetId: dataset.id,
        encodings: {},
        angleFields: [
          { field: "water", type: "quantitative" },
          { field: "fat", type: "quantitative" },
        ],
      },
      children: [],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [pieNode];
    store.selectedIds.value = [pieNode.id];
    store.axisBindingTarget.value = { nodeId: pieNode.id, channel: "x" };

    expect(store.barItemAxisBinding(pieNode)).toEqual({
      label: "Segment",
      fields: ["water", "fat"],
    });
    expect(store.addBarItemField("person")).toBe(false);
    store.removeBarItemField(pieNode.id, "water");
    expect(pieNode.chartSpec?.angleFields).toEqual([{ field: "fat", type: "quantitative" }]);
    expect(pieNode.chartSpec?.encodings.theta).toBeUndefined();

    const thetaBounds = store.seriesItemDropBounds(pieNode);
    await store.onCanvasDrop(columnDragEvent(
      dataset.id,
      "water",
      "quantitative",
      thetaBounds.minX + thetaBounds.width / 2,
      thetaBounds.minY + thetaBounds.height / 2,
    ));
    expect(pieNode.chartSpec?.encodings.theta).toBeUndefined();
    expect(pieNode.chartSpec?.angleFields?.map((encoding) => encoding.field)).toEqual(["fat", "water"]);

    store.bindPolarRadiusField("radius");
    expect(pieNode.chartSpec?.encodings.radius).toEqual({ field: "radius", type: "quantitative" });

    store.clearPolarRadiusField();
    expect(pieNode.chartSpec?.encodings.radius).toBeUndefined();

    store.setPolarSegmentFields(["person"]);
    store.setPieAngleFields(["water"]);
    expect(pieNode.chartSpec?.encodings.segment).toEqual({ field: "person", type: "nominal" });
    expect(store.seriesItemMemberIds(pieNode)).toEqual(["A"]);
    expect(pieNode.chartSpec?.encodings.theta).toEqual({ field: "water", type: "quantitative" });
    expect(pieNode.chartSpec?.angleFields).toBeUndefined();
    expect(store.addBarItemField("fat")).toBe(false);

    store.bindPolarRadiusField("water");
    expect(pieNode.chartSpec?.encodings.radius).toEqual({ field: "water", type: "quantitative" });
    expect(pieNode.chartSpec?.renderer?.status).toBe("ready");
    expect(pieNode.renderedContent).toContain('data-radius-field="water"');

    store.setPolarSegmentFields(["time"]);
    expect(pieNode.chartSpec?.encodings.segment).toEqual({ field: "time", type: "temporal" });
  });

  it("expands a Radial Bar Segment binding into distinct dataset members", () => {
    const dataset: Dataset = {
      id: "radial-segment-members",
      name: "radial-segment-members.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { person: "Alice", value: "10" },
        { person: "Bob", value: "20" },
        { person: "Alice", value: "30" },
      ],
    };
    const radialNode: CanvasGroupNode = {
      kind: "group",
      id: "radial-segment-members-node",
      name: "Radial segment members",
      x: 120,
      y: 80,
      width: 320,
      height: 180,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 90 } },
      chartSpec: {
        chartType: "RadialBarChart",
        datasetId: dataset.id,
        encodings: {
          segment: { field: "person", type: "nominal" },
          radius: { field: "value", type: "quantitative" },
        },
      },
      children: [],
    };
    const canvasRef = ref(null);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];

    expect(store.seriesItemMemberIds(radialNode)).toEqual(["Alice", "Bob"]);
  });
});

describe("CSV field binding", () => {
  it("upgrades Single and Divergent Bar charts with a category dimension", () => {
    const dataset: Dataset = {
      id: "bar-upgrade-dataset",
      name: "bar-upgrade.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "group", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { category: "A", group: "One", value: "8" },
        { category: "A", group: "Two", value: "-3" },
        { category: "B", group: "One", value: "5" },
        { category: "B", group: "Two", value: "-6" },
      ],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const cases = [
      ["SingleBarChart", "GroupedBarChart", "grouped"],
      ["DivergentBarChart", "DivergentStackedBarChart", "divergent-stacked"],
    ] as const;

    cases.forEach(([sourceType, targetType, variant], index) => {
      const store = useCanvasStore(canvasRef);
      store.relationshipStore.dispatch({ type: "clear" });
      useDatasetStore().datasets.value = [dataset];
      const chart = lineChart(`bar-upgrade-${index}`, 120, false);
      chart.chartSpec = {
        chartType: sourceType,
        datasetId: dataset.id,
        encodings: {
          x: { field: "category", type: "nominal" },
          y: { field: "value", type: "quantitative" },
        },
      };
      store.canvasNodes.value = [chart];
      store.selectedIds.value = [chart.id];
      store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

      expect(store.applyDimensionChartUpgrade("group")).toBe(true);
      expect(chart.chartSpec?.chartType).toBe(targetType);
      expect(chart.chartSpec?.encodings.color).toBeUndefined();
      expect(chart.chartSpec?.seriesFields).toEqual([{ field: "group", type: "nominal" }]);
      expect(chart.renderedContent).toContain(`data-bar-variant="${variant}"`);
      expect(chart.renderedContent?.match(/data-mark-role="bar"/g)).toHaveLength(4);
    });
  });

  it("clears an old person filter when Line Chart upgrades to the person dimension", () => {
    const dataset: Dataset = {
      id: "line-upgrade-dataset",
      name: "line-upgrade.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: [
        { person: "P1", time: "2025-01-01", weight_kg: "88" },
        { person: "P2", time: "2025-01-01", weight_kg: "84" },
        { person: "P3", time: "2025-01-01", weight_kg: "86" },
      ],
    };
    const chart = lineChart("line-upgrade", 120, false);
    chart.chartSpec = {
      ...chart.chartSpec!,
      datasetId: dataset.id,
      valueFilters: { person: ["P1"] },
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionChartUpgrade("person")).toBe(true);
    expect(chart.chartSpec?.series?.field).toBe("person");
    expect(chart.chartSpec?.seriesFields?.map((encoding) => encoding.field)).toContain("person");
    expect(chart.chartSpec?.valueFilters?.person).toBeUndefined();
  });

  it("offers explicit bar upgrade targets and stops at terminal chart variants", () => {
    expect(getDimensionChartUpgradeOptions("SingleBarChart")).toEqual([
      { chartType: "GroupedBarChart", label: "Grouped bar" },
      { chartType: "StackedBarChart", label: "Stacked bar" },
    ]);
    expect(getDimensionChartUpgradeOptions("GroupedBarChart")).toEqual([]);
    expect(getDimensionChartUpgradeOptions("StackedBarChart")).toEqual([]);
    expect(getDimensionChartUpgradeOptions("MultiLineChart")).toEqual([]);
    expect(getDimensionChartUpgradeOptions("AreaChart")).toEqual([
      { chartType: "StackedAreaChart", label: "Stacked area" },
    ]);
    expect(getDimensionChartUpgradeOptions("StackedAreaChart")).toEqual([]);

    const dataset: Dataset = {
      id: "stacked-upgrade-dataset",
      name: "stacked-upgrade.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "group", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { category: "A", group: "One", value: "8" },
        { category: "A", group: "Two", value: "3" },
      ],
    };
    const chart = lineChart("stacked-upgrade", 120, false);
    chart.chartSpec = {
      chartType: "SingleBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "category", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionChartUpgrade("group", "StackedBarChart")).toBe(true);
    expect(chart.chartSpec?.chartType).toBe("StackedBarChart");
    expect(chart.renderedContent).toContain('data-bar-variant="stacked"');
    expect(store.applyDimensionChartUpgrade("group", "GroupedBarChart")).toBe(false);
  });

  it("filters Line, Scatterplot, Bar, and Matrix by partial person/date selections", () => {
    const dataset: Dataset = {
      id: "csv-filter-dataset",
      name: "csv-filter.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: Array.from({ length: 5 }, (_, personIndex) =>
        Array.from({ length: 5 }, (_, dateIndex) => ({
          person: `P${personIndex + 1}`,
          time: `2025-${String(dateIndex + 1).padStart(2, "0")}-01`,
          weight_kg: String(80 + personIndex + dateIndex),
        })),
      ).flat(),
      primaryKey: ["person", "time"],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const selectedPeople = ["P1", "P2", "P3"];
    const selectedDates = ["2025-01-01", "2025-02-01", "2025-03-01"];
    const cases = [
      { chartType: "LineGraph", expectedRole: "line", expectedCount: 3 },
      { chartType: "Scatterplot", expectedRole: "point", expectedCount: 9 },
      { chartType: "GroupedBarChart", expectedRole: "bar", expectedCount: 9 },
      { chartType: "MatrixDiagram", expectedRole: "cell", expectedCount: 9 },
    ];

    cases.forEach(({ chartType, expectedRole, expectedCount }, index) => {
      const store = useCanvasStore(canvasRef);
      store.relationshipStore.dispatch({ type: "clear" });
      useDatasetStore().datasets.value = [dataset];
      const chart = lineChart(`filtered-${index}`, 120, chartType === "LineGraph");
      chart.chartSpec = {
        chartType,
        datasetId: dataset.id,
        encodings: chartType === "MatrixDiagram"
          ? {
            x: { field: "time", type: "temporal" },
            y: { field: "person", type: "nominal" },
            column: { field: "time", type: "temporal" },
            row: { field: "person", type: "nominal" },
          }
          : {
            x: { field: "time", type: "temporal" },
            y: { field: "weight_kg", type: "quantitative" },
            ...(chartType === "GroupedBarChart"
              ? { color: { field: "person", type: "nominal" as const } }
              : {}),
          },
        series: chartType === "LineGraph" ? { field: "person", type: "nominal" } : undefined,
      };
      store.canvasNodes.value = [chart];
      store.selectedIds.value = [chart.id];
      store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

      store.setValueFilters({
        person: { field: "person", values: selectedPeople },
        date: { field: "time", values: selectedDates },
      });

      expect(chart.chartSpec?.valueFilters).toEqual({
        person: selectedPeople,
        time: selectedDates,
      });
      expect(chart.renderedContent?.match(new RegExp(`data-mark-role="${expectedRole}"`, "g"))).toHaveLength(expectedCount);
    });
  });

});

describe("dimension overflow decisions", () => {
  it("facets into charts with independent coordinate systems", () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "facet-dataset",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01-01", value: "10" },
        { person: "B", time: "2026-01-01", value: "14" },
      ],
    };
    const chart = lineChart("facet-source", 100, false);
    chart.chartSpec = {
      ...chart.chartSpec!,
      datasetId: dataset.id,
      dimensionRecommendations: [{
        id: "facet-source:person:facet",
        strategy: "facet",
        field: "person",
        valueCount: 2,
        estimatedMarkCount: 2,
        sharedChannels: ["x", "y"],
        label: "Facet by person",
      }],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    store.applyDimensionRecommendation("facet-source:person:facet");

    expect(store.canvasNodes.value).toHaveLength(1);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const [left, right] = facetRoot.kind === "group" ? facetRoot.children : [];
    expect(new Set(facetRoot.kind === "group" ? facetRoot.children.map((node) => node.coordinateSystem?.id) : []).size).toBe(2);
    expect(facetRoot.kind === "group" && facetRoot.children.every((node) => node.coordinateSystem?.ownerNodeId === node.id)).toBe(true);
    expect(facetRoot.compositionSpec?.sharedChannels.length).toBe(0);
    expect(facetRoot.compositionSpec?.facetDirection).toBe("column");
    expect(right?.y).toBe(left?.y);
    expect((right?.x ?? 0) - (left?.x ?? 0)).toBe((left?.width ?? 0) * (left?.scaleX ?? 1) + 4);
    expect(store.selectedIds.value).toEqual([facetRoot.id]);
    expect(store.selectionBounds.value).toEqual(collectNodeSelectionBounds(facetRoot));
  });

  it("projects a line facet into donut sectors around one Polar frame", async () => {
    listeners.clear();
    const dataset: Dataset = {
      id: "polar-line-facet-dataset",
      name: "polar-line-facet.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: ["A", "B"].flatMap((person, personIndex) => [1, 2, 3].map((month) => ({
        person,
        time: `2026-0${month}-01`,
        value: String(10 + personIndex * 4 + month),
      }))),
      primaryKey: ["person", "time"],
    };
    const chart = lineChart("polar-line-facet-source", 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: dataset.id };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionFacet("person", "column")).toBe(true);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const facetCells = facetRoot.kind === "group" ? facetRoot.children : [];
    store.axisBindingTarget.value = { nodeId: facetCells[0]!.id, channel: "x" };
    store.setCompositionEncoding({
      facetCoordinateSystem: "Polar",
      facetThetaField: "person",
      facetDirection: "column",
    });

    expect(facetRoot.compositionSpec?.facetCoordinateSystem).toBe("Polar");
    expect(facetRoot.coordinateSystem?.type).toBe("Polar");
    expect(facetCells.map((cell) => cell.coordinateGuide?.type)).toEqual(["Polar", "Polar"]);
    expect(facetCells.every((cell) => cell.coordinateGuide?.type === "Polar"
      && cell.coordinateGuide.showThetaLine === false
      && cell.coordinateGuide.showRadiusLine === false)).toBe(true);
    expect(facetRoot.coordinateGuide?.type === "Polar" && facetRoot.coordinateGuide.showThetaLine).toBeUndefined();
    expect(facetCells.map((cell) => [cell.x, cell.y])).toEqual([
      [facetCells[0]!.x, facetCells[0]!.y],
      [facetCells[0]!.x, facetCells[0]!.y],
    ]);
    expect(facetCells.map((cell) => cell.renderedContent?.match(/data-chart-type="[^"]+"/)?.[0]), JSON.stringify(facetCells.map((cell) => cell.chartSpec?.renderer))).toEqual([
      'data-chart-type="polar-facet-line"',
      'data-chart-type="polar-facet-line"',
    ]);
    expect(facetCells.map((cell) => cell.chartSpec?.polarArea?.angleSpan)).toEqual([180, 180]);
    expect(facetCells.map((cell) => cell.chartSpec?.polarArea?.startAngle)).toEqual([0, 180]);
    expect(facetCells.every((cell) => cell.renderedContent?.includes('data-mark-role="facet-cell-frame"'))).toBe(true);

    store.selectedIds.value = [facetRoot.id];
    const rootGeometry = getPolarOccupiedGeometry(facetRoot)!;
    expect(rootGeometry.outerRadius).toBeCloseTo(
      facetCells[0]!.chartSpec!.polarArea!.outerRadius
        * Math.min(Math.abs(facetCells[0]!.scaleX), Math.abs(facetCells[0]!.scaleY)),
    );
    expect(store.selectionFrame.value).toMatchObject({
      x: facetRoot.x + rootGeometry.bounds.minX,
      y: facetRoot.y + rootGeometry.bounds.minY,
      width: rootGeometry.bounds.width,
      height: rootGeometry.bounds.height,
    });

    const rootGuide = facetRoot.coordinateGuide?.type === "Polar" ? facetRoot.coordinateGuide : null;
    expect(rootGuide).toBeTruthy();
    const targetInnerRatio = 0.34;
    const baseRadius = rootGeometry.outerRadius / (rootGuide!.outerRadiusRatio ?? 1);
    const innerStart = {
      x: facetRoot.x + rootGuide!.origin.x + rootGeometry.innerRadius,
      y: facetRoot.y + rootGuide!.origin.y,
    };
    store.onPolarInnerRadiusPointerDown(facetRoot, pointerEvent(innerStart.x, innerStart.y));
    listeners.get("pointermove")?.(pointerEvent(
      facetRoot.x + rootGuide!.origin.x + baseRadius * targetInnerRatio,
      facetRoot.y + rootGuide!.origin.y,
    ));
    listeners.get("pointerup")?.(pointerEvent(innerStart.x, innerStart.y));
    expect(rootGuide!.innerRadiusRatio).toBeCloseTo(targetInnerRatio);
    expect(facetCells.every((cell) => cell.coordinateGuide?.type === "Polar"
      && Math.abs((cell.coordinateGuide.innerRadiusRatio ?? 0) - targetInnerRatio) < 1e-6)).toBe(true);
    expect(facetCells.every((cell) => (cell.chartSpec?.polarArea?.innerRadius ?? 0) > rootGeometry.innerRadius)).toBe(true);

    const outerScaleStart = rootGuide!.radiusScale ?? 1;
    const outerStart = {
      x: facetRoot.x + rootGuide!.origin.x + getPolarOccupiedGeometry(facetRoot)!.outerRadius,
      y: facetRoot.y + rootGuide!.origin.y,
    };
    store.onCoordinateAxisScalePointerDown(facetRoot, "radius", pointerEvent(outerStart.x, outerStart.y));
    listeners.get("pointermove")?.(pointerEvent(outerStart.x + 40, outerStart.y));
    listeners.get("pointerup")?.(pointerEvent(outerStart.x + 40, outerStart.y));
    const expectedOuterScale = outerScaleStart + 40 / facetRoot.width;
    expect(rootGuide!.radiusScale).toBeCloseTo(expectedOuterScale);
    expect(facetCells.every((cell) => cell.coordinateGuide?.type === "Polar"
      && Math.abs((cell.coordinateGuide.radiusScale ?? 0) - expectedOuterScale) < 1e-6)).toBe(true);

    const source = polarChart("polar-line-facet-concat-source", 1200, 360);
    source.chartSpec = {
      ...source.chartSpec!,
      chartType: "RadialBarChart",
      datasetId: dataset.id,
      encodings: {
        segment: { field: "person", type: "nominal" },
        radius: { field: "value", type: "quantitative" },
      },
    };
    store.canvasNodes.value = [facetRoot, source];
    const concatZones = store.compositionDropZones(source.id)
      .filter((zone) => zone.targetNodeId === facetRoot.id && zone.type === "concat");
    expect(concatZones.map((zone) => [zone.direction, zone.concatPosition, zone.sharedChannels])).toEqual(expect.arrayContaining([
      ["radial", "after", ["angle"]],
    ]));
    const outerRadialZone = concatZones.find((zone) => zone.direction === "radial" && zone.concatPosition === "after");
    expect(outerRadialZone).toMatchObject({ compatible: true });
    let dropPoint: { x: number; y: number } | undefined;
    for (let y = outerRadialZone!.bounds.minY + 2; y < outerRadialZone!.bounds.maxY && !dropPoint; y += 8) {
      for (let x = outerRadialZone!.bounds.minX + 2; x < outerRadialZone!.bounds.maxX; x += 8) {
        const hit = store.compositionDropZoneAtPoint({ x, y }, source.id);
        if (hit?.targetNodeId === facetRoot.id && hit.type === "concat"
          && hit.direction === "radial" && hit.concatPosition === "after") {
          dropPoint = { x, y };
          break;
        }
      }
    }
    expect(dropPoint).toBeDefined();
    expect(store.compositionDropZoneAtPoint(dropPoint!, source.id)).toMatchObject({
      targetNodeId: facetRoot.id,
      type: "concat",
      direction: "radial",
      concatPosition: "after",
      compatible: true,
    });
    store.selectedIds.value = [source.id];
    store.onCanvasNodePointerDown(source, pointerEvent(source.x + 20, source.y + 20));
    listeners.get("pointermove")?.(pointerEvent(dropPoint!.x, dropPoint!.y));
    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: facetRoot.id,
      type: "concat",
      direction: "radial",
      concatPosition: "after",
      compatible: true,
    });
    listeners.get("pointerup")?.(pointerEvent(dropPoint!.x, dropPoint!.y));
    await nextTick();
    expect(facetRoot.compositionSpec?.type).toBe("facet");
    expect(facetRoot.parentCompositionSpec?.type).toBe("concat");
    expect(source.compositionSpec?.type).toBe("concat");
  });

  it("keeps a Chord inside a Polar Line Facet radial concat", () => {
    const dataset: Dataset = {
      id: "chord-polar-line-facet",
      name: "chord graph",
      columns: [],
      rows: [],
      graph: {
        nodes: {
          columns: [
            { name: "node_id", type: "nominal" },
            { name: "month", type: "ordinal" },
            { name: "share", type: "quantitative" },
          ],
          rows: ["North", "South", "West"].flatMap((nodeId, nodeIndex) => [1, 2, 3].map((month) => ({
            node_id: nodeId,
            month: `2025-0${month}-01`,
            share: String(40 + nodeIndex * 8 + month * 2),
          }))),
        },
        edges: {
          columns: [
            { name: "source", type: "nominal" },
            { name: "target", type: "nominal" },
            { name: "flow", type: "quantitative" },
          ],
          rows: [
            { source: "North", target: "South", flow: "80" },
            { source: "North", target: "West", flow: "40" },
            { source: "South", target: "North", flow: "35" },
            { source: "South", target: "West", flow: "25" },
            { source: "West", target: "North", flow: "20" },
            { source: "West", target: "South", flow: "20" },
          ],
        },
      },
    };
    const line = lineChart("polar-line-facet-unit", 700, false);
    line.chartSpec = {
      ...line.chartSpec!,
      datasetId: dataset.id,
      encodings: {
        x: { field: "month", type: "ordinal" },
        y: { field: "share", type: "quantitative" },
      },
    };
    const chord = polarChart("inner-chord-unit", 100, 360);
    chord.chartSpec = {
      chartType: "Chord",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "flow", type: "quantitative" },
      },
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [line, chord];
    store.axisBindingTarget.value = { nodeId: chord.id, channel: "angle" };
    expect(store.axisBindingColumns.value.map((column) => column.name)).toEqual(["source", "target", "flow"]);
    expect(store.axisBindingChannelColumns.value?.key?.map((column) => column.name)).toEqual([
      "node_id",
      "month",
      "share",
    ]);
    store.setChartEncoding("key", "node_id");
    expect(chord.chartSpec?.encodings.key).toEqual({ field: "node_id", type: "nominal" });
    store.selectedIds.value = [line.id];

    expect(store.createFacetFromFields(line.id, {
      coordinateSystem: "Polar",
      thetaField: "node_id",
    })).toBe(true);
    const facetRoot = store.canvasNodes.value.find((node) => node.compositionSpec?.type === "facet")!;
    expect(store.concatNodesAreCompatible([chord, facetRoot], "radial", "angle")).toBe(true);

    store.selectedIds.value = [chord.id];
    store.onCanvasNodePointerDown(chord, pointerEvent(chord.x + 20, chord.y + 20));
    expect(store.availableDropZones.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetNodeId: facetRoot.id,
        type: "concat",
        direction: "radial",
        concatPosition: "before",
        compatible: true,
      }),
    ]));
    store.interaction.value = null;
    store.compositionDragSourceId.value = null;
    store.activeDropZone.value = null;
    store.availableDropZones.value = [];

    store.canvasNodes.value = [chord, facetRoot];
    store.selectedIds.value = [chord.id, facetRoot.id];
    expect(store.executeComposition("concat", true, ["angle"], "radial")).toBe(true);
    expect(chord.coordinateGuide?.type === "Polar" && chord.coordinateGuide.outerRadiusRatio).toBe(0.5);
    expect(facetRoot.coordinateGuide?.type === "Polar" && facetRoot.coordinateGuide.innerRadiusRatio).toBe(0.5);
    expect(facetRoot.compositionSpec?.type).toBe("facet");
    expect(facetRoot.parentCompositionSpec?.type).toBe("concat");
    expect(facetRoot.kind === "group"
      ? facetRoot.children.filter((child) => child.renderedContent?.includes('data-chart-type="polar-facet-line"')).length
      : 0).toBe(3);
    const bands = chord.chartSpec?.polarArea?.angleBands ?? [];
    expect(bands.map((band) => band.value)).toEqual(["North", "South", "West"]);
    expect(new Set(bands.map((band) => band.angleSpan)).size).toBe(3);
    if (facetRoot.kind === "group") {
      facetRoot.children.forEach((child) => {
        const nodeId = child.chartSpec?.filters?.node_id;
        const band = bands.find((candidate) => candidate.value === nodeId);
        expect(band).toBeDefined();
        expect(child.renderedContent).toContain(`data-facet-angle-start="${band!.startAngle}"`);
        expect(child.renderedContent).toContain(`data-facet-angle-span="${band!.angleSpan}"`);
      });
    }
  });

  it("exposes a facet cell filter as relationship-owned nested context", () => {
    const dataset: Dataset = {
      id: "facet-nested-context-dataset",
      name: "facet-nested-context.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01-01", value: "10" },
        { person: "B", time: "2026-01-01", value: "14" },
      ],
    };
    const parent = lineChart("facet-nested-context-parent", 100, false);
    parent.chartSpec = { ...parent.chartSpec!, datasetId: dataset.id };
    const child = lineChart("facet-nested-context-child", 950, false);
    child.chartSpec = {
      ...child.chartSpec!,
      datasetId: dataset.id,
      dataTransforms: [{
        id: "facet-nested-context-clue",
        kind: "filter",
        mode: "values",
        field: "person",
        values: ["A"],
        single: true,
        purpose: "nest-clue",
      }],
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [parent];
    store.selectedIds.value = [parent.id];

    expect(store.applyDimensionFacet("person", "column")).toBe(true);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const facetCell = facetRoot.kind === "group" ? facetRoot.children[0]! : facetRoot;
    const result = store.resolveNestedFilterContexts(
      facetCell,
      child,
      JSON.stringify({ categoryKey: "A" }),
    );

    expect(result).toEqual({
      contexts: [{
        parentChartId: facetCell.id,
        parentDataKey: JSON.stringify({ categoryKey: "A" }),
        parentField: "person",
        childField: "person",
        value: "A",
        filterMode: "values",
        source: "facet-cell",
      }],
      unresolvedFields: [],
    });
    expect(child.chartSpec?.dataTransforms?.[0]).toMatchObject({
      field: "person",
      values: ["A"],
      purpose: "nest-clue",
    });
  });

  it("keeps each Layer intact inside a Facet and resolves the cell context for its charts", () => {
    const dataset: Dataset = {
      id: "layer-facet-context-dataset",
      name: "layer-facet-context.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "series", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { person: "A", series: "One", value: "10" },
        { person: "B", series: "Two", value: "14" },
      ],
    };
    const first = cartesianChart("layer-facet-first", 100, "LineGraph");
    const second = cartesianChart("layer-facet-second", 950, "AreaChart");
    [first, second].forEach((chart) => {
      chart.chartSpec = {
        ...chart.chartSpec!,
        datasetId: dataset.id,
        encodings: {
          x: { field: "series", type: "nominal" },
          y: { field: "value", type: "quantitative" },
        },
      };
    });
    const nestedChild = cartesianChart("layer-facet-nested-child", 1800, "SingleBarChart");
    nestedChild.chartSpec = {
      ...nestedChild.chartSpec!,
      datasetId: dataset.id,
      dataTransforms: [{
        id: "layer-facet-nest-clue",
        kind: "filter",
        mode: "values",
        field: "person",
        values: ["A"],
        single: true,
        purpose: "nest-clue",
      }],
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [first, second];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("layer", true, ["x", "y"])).toBe(true);
    expect(store.applyDimensionFacet("person", "column")).toBe(true);

    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    expect(facetRoot.compositionSpec?.type).toBe("facet");
    const layerCells = facetRoot.kind === "group" ? facetRoot.children : [];
    expect(layerCells).toHaveLength(2);
    expect(layerCells.every((cell) => cell.kind === "group" && cell.compositionSpec?.type === "layer")).toBe(true);
    expect(layerCells.every((cell) => cell.parentCompositionSpec?.id === facetRoot.compositionSpec?.id)).toBe(true);

    const firstCellChart = firstChartNodeForTest(layerCells[0]!);
    const result = store.resolveNestedFilterContexts(
      firstCellChart,
      nestedChild,
      JSON.stringify({ categoryKey: "A" }),
    );
    expect(result.contexts).toContainEqual(expect.objectContaining({
      parentChartId: firstCellChart.id,
      parentField: "person",
      childField: "person",
      value: "A",
      source: "facet-cell",
    }));
    expect(result.unresolvedFields).toEqual([]);
  });

  it("lays out row facets vertically with a tight gap", () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "row-facet-dataset",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01-01", value: "10" },
        { person: "B", time: "2026-01-01", value: "14" },
      ],
    };
    const chart = lineChart("row-facet-source", 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: dataset.id };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionFacet("person", "row")).toBe(true);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const [top, bottom] = facetRoot.kind === "group" ? facetRoot.children : [];
    expect(facetRoot.compositionSpec?.facetDirection).toBe("row");
    expect(bottom?.x).toBe(top?.x);
    expect((bottom?.y ?? 0) - (top?.y ?? 0)).toBe((top?.height ?? 0) * (top?.scaleY ?? 1) + 4);

    expect(store.canConfigureSelectionComposition.value).toBe(true);
    expect(store.configureSelectionComposition()).toBe(true);
    store.setCompositionEncoding({ facetRowGap: 28, facetColumnGap: 16 });

    expect(facetRoot.compositionSpec?.facetRowGap).toBe(28);
    expect(facetRoot.compositionSpec?.facetColumnGap).toBe(16);
    expect((bottom?.y ?? 0) - (top?.y ?? 0)).toBe((top?.height ?? 0) * (top?.scaleY ?? 1) + 28);
  });

  it("uses the remaining facet direction for a second repair field", () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "facet-grid-repair-dataset",
      columns: [
        { name: "person", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: ["A", "B"].flatMap((person) => ["East", "West"].map((region, index) => ({
        person,
        region,
        time: "2026-01-01",
        value: String(10 + index),
      }))),
    };
    const chart = lineChart("facet-grid-repair-source", 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: dataset.id };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionFacet("person", "row")).toBe(true);
    expect(store.applyDimensionFacet("region", "row")).toBe(false);
    expect(store.applyDimensionFacet("region", "column")).toBe(true);
    expect(store.canvasNodes.value).toHaveLength(1);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    expect(facetRoot.kind === "group" ? facetRoot.children : []).toHaveLength(4);
    expect(facetRoot.compositionSpec?.facetGrid).toMatchObject({
      rowField: "person",
      columnField: "region",
      rowValues: ["A", "B"],
      columnValues: ["East", "West"],
    });

    expect(store.configureSelectionComposition()).toBe(true);
    store.setCompositionEncoding({ facetRowGap: 18, facetColumnGap: 26 });
    const [topLeft, topRight, bottomLeft] = facetRoot.kind === "group" ? facetRoot.children : [];
    expect((topRight?.x ?? 0) - (topLeft?.x ?? 0)).toBe((topLeft?.width ?? 0) * (topLeft?.scaleX ?? 1) + 26);
    expect((bottomLeft?.y ?? 0) - (topLeft?.y ?? 0)).toBe((topLeft?.height ?? 0) * (topLeft?.scaleY ?? 1) + 18);
  });

  it("consumes single-value filter clues when creating a two-dimensional facet", () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "facet-filter-clue-dataset",
      columns: [
        { name: "person", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: ["A", "B"].flatMap((person) => ["East", "West"].map((region, index) => ({
        person,
        region,
        time: "2026-01-01",
        value: String(10 + index),
      }))),
    };
    const chart = lineChart("facet-filter-clue-source", 100, false);
    chart.chartSpec = {
      ...chart.chartSpec!,
      datasetId: dataset.id,
      dataTransforms: [
        {
          id: "person-clue",
          kind: "filter",
          mode: "values",
          field: "person",
          values: ["A"],
          single: true,
        },
        {
          id: "region-clue",
          kind: "filter",
          mode: "values",
          field: "region",
          values: ["East"],
          single: true,
        },
      ],
    };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];

    expect(store.createFacetFromFields(chart.id, {
      rowField: "person",
      columnField: "region",
    })).toBe(true);

    expect(store.canvasNodes.value).toHaveLength(1);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const facetCells = facetRoot.kind === "group" ? facetRoot.children : [];
    expect(facetCells).toHaveLength(4);
    expect(facetRoot.compositionSpec?.facetGrid).toMatchObject({
      rowField: "person",
      columnField: "region",
      rowValues: ["A", "B"],
      columnValues: ["East", "West"],
    });
    expect(facetCells.every((node) => node.chartSpec?.dataTransforms === undefined)).toBe(true);
    expect(new Set(facetCells.map((node) => JSON.stringify(node.chartSpec?.filters))).size).toBe(4);
    expect(dataset.rows).toHaveLength(4);
  });

  it("synchronizes facet fields and resolve channels across the composition", () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "facet-encoding-sync-dataset",
      columns: [
        { name: "person", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { person: "A", region: "East", time: "2026-01-01", value: "10" },
        { person: "B", region: "West", time: "2026-01-01", value: "14" },
      ],
    };
    const chart = lineChart("facet-encoding-sync-source", 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: dataset.id };
    const store = useCanvasStore(ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionFacet("person", "column")).toBe(true);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const facetCells = facetRoot.kind === "group" ? facetRoot.children : [];
    const firstMember = facetCells[0];
    expect(firstMember).toBeTruthy();
    store.axisBindingTarget.value = { nodeId: firstMember!.id, channel: "x" };
    store.setCompositionEncoding({ facetField: "region", facetDirection: "column", sharedChannels: ["x"] });

    expect(facetRoot.compositionSpec?.facetField).toBe("region");
    expect(facetCells.map((node) => node.chartSpec?.filters?.region)).toEqual(["East", "West"]);
    expect(facetRoot.compositionSpec?.sharedChannels.includes("x")).toBe(true);
    const compositionId = facetRoot.compositionSpec?.id;
    expect(compositionId).toBeTruthy();
    expect(store.chartRelationships.value.compositions[compositionId!]?.facetField).toBe("region");
  });

  it("synchronizes chart encodings across facet cells and re-renders them after undo", () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "facet-chart-encoding-dataset",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "value", type: "quantitative" },
        { name: "amount", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01-01", value: "10", amount: "20" },
        { person: "B", time: "2026-01-01", value: "14", amount: "28" },
      ],
    };
    const chart = lineChart("facet-chart-encoding-source", 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: dataset.id };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };

    expect(store.applyDimensionFacet("person", "column")).toBe(true);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const facetCells = facetRoot.kind === "group" ? facetRoot.children : [];
    const second = facetCells[1]!;
    const filtersBefore = facetCells.map((node) => node.chartSpec?.filters);
    facetCells.forEach((node) => { node.renderedContent = null; });
    store.axisBindingTarget.value = { nodeId: second.id, channel: "y" };

    store.setChartEncoding("y", "amount");

    expect(facetCells.map((node) => node.chartSpec?.encodings.y?.field)).toEqual(["amount", "amount"]);
    expect(facetCells.map((node) => node.chartSpec?.filters)).toEqual(filtersBefore);
    expect(facetCells.every((node) => node.renderedContent?.includes("data-renderer="))).toBe(true);

    store.undoCanvasChange();

    const restoredRoot = store.canvasNodes.value[0]!;
    const restoredCells = restoredRoot.kind === "group" ? restoredRoot.children : [];
    expect(restoredCells.map((node) => node.chartSpec?.encodings.y?.field)).toEqual(["value", "value"]);
    expect(restoredCells.map((node) => node.chartSpec?.filters)).toEqual(filtersBefore);
    expect(restoredCells.every((node) => node.renderedContent?.includes("data-renderer="))).toBe(true);

    store.axisBindingTarget.value = { nodeId: restoredCells[0]!.id, channel: "y" };
    store.updateAxisBindingMarkGroupConfig({ color: "#123456" });
    expect(restoredCells.every((node) =>
      node.chartSpec?.markGroups?.[0]?.sharedConfig.color === "#123456")).toBe(true);
  });
});

describe("composition coordinate editing", () => {
  it("synchronizes every facet coordinate guide for origin, scale, and direction edits", async () => {
    const dataset: Dataset = {
      ...layerDataset,
      id: "facet-coordinate-edit-dataset",
      rows: [
        { series: "A", time: "2026-01-01", value: "10" },
        { series: "B", time: "2026-01-01", value: "14" },
      ],
    };
    const chart = lineChart("facet-coordinate-edit-source", 100, false);
    chart.chartSpec = { ...chart.chartSpec!, datasetId: dataset.id };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];

    expect(store.applyDimensionFacet("series", "column")).toBe(true);
    expect(store.canvasNodes.value).toHaveLength(1);
    const facetRoot = store.canvasNodes.value[0]!;
    expect(facetRoot.kind).toBe("group");
    const [first, second] = facetRoot.kind === "group" ? facetRoot.children : [];
    expect(first && second).toBeTruthy();
    if (first?.kind === "group") first.children = [leaf("stale-facet-template-child-a", -120, -80)];
    if (second?.kind === "group") second.children = [leaf("stale-facet-template-child-b", -120, -80)];
    expect(first?.kind === "group" && first.children.length).toBeGreaterThan(0);
    store.reverseCoordinateAxis(first!, "x");
    expect(second?.coordinateGuide?.type === "Cartesian" && second.coordinateGuide.xDirection).toBe(-1);

    store.onCoordinateOriginPointerDown(first!, pointerEvent(first!.x, first!.y + first!.height));
    listeners.get("pointermove")?.(pointerEvent(first!.x + 48, first!.y + first!.height - 32));
    listeners.get("pointerup")?.(pointerEvent(first!.x + 48, first!.y + first!.height - 32));
    await nextTick();
    expect(first?.coordinateGuide?.type === "Cartesian" && second?.coordinateGuide?.type === "Cartesian"
      && second.coordinateGuide.origin).toEqual(first?.coordinateGuide?.type === "Cartesian" ? first.coordinateGuide.origin : undefined);
    const firstPlotArea = first!.chartSpec!.plotArea!;
    expect(collectNodeSelectionBounds(first!).minX).toBe(first!.x + firstPlotArea.x * first!.scaleX);

    const boundsBeforeScale = { ...store.selectionBounds.value! };
    store.onCoordinateAxisScalePointerDown(first!, "x", pointerEvent(first!.x + first!.width, first!.y + first!.height / 2));
    listeners.get("pointermove")?.(pointerEvent(first!.x + first!.width + 40, first!.y + first!.height / 2));
    listeners.get("pointerup")?.(pointerEvent(first!.x + first!.width + 40, first!.y + first!.height / 2));
    await nextTick();
    expect(second?.coordinateGuide?.type === "Cartesian" && first?.coordinateGuide?.type === "Cartesian"
      && second.coordinateGuide.xScale).toBe(first?.coordinateGuide?.type === "Cartesian" ? first.coordinateGuide.xScale : undefined);
    expect(store.selectionBounds.value).toEqual(collectNodeSelectionBounds(facetRoot));
    expect(store.selectionBounds.value).not.toEqual(boundsBeforeScale);

    const boundsBeforeYScale = { ...store.selectionBounds.value! };
    store.onCoordinateAxisScalePointerDown(first!, "y", pointerEvent(first!.x + first!.width / 2, first!.y));
    listeners.get("pointermove")?.(pointerEvent(first!.x + first!.width / 2, first!.y - 40));
    listeners.get("pointerup")?.(pointerEvent(first!.x + first!.width / 2, first!.y - 40));
    await nextTick();
    expect(second?.coordinateGuide?.type === "Cartesian" && first?.coordinateGuide?.type === "Cartesian"
      && second.coordinateGuide.yScale).toBe(first?.coordinateGuide?.type === "Cartesian" ? first.coordinateGuide.yScale : undefined);
    expect(store.selectionBounds.value).not.toEqual(boundsBeforeYScale);
    expect(store.selectionBounds.value?.height).not.toBe(boundsBeforeYScale.height);
  });

  it("synchronizes only the shared dimension for concatenation", () => {
    const chartA = lineChart("concat-coordinate-a", 100, false);
    const chartB = lineChart("concat-coordinate-b", 950, false);
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [chartA, chartB];
    store.selectedIds.value = [chartA.id, chartB.id];

    expect(store.executeComposition("concat", true, ["y"], "horizontal")).toBe(true);
    const [first, second] = store.canvasNodes.value;
    expect(first && second).toBeTruthy();
    store.selectedIds.value = [second!.id];
    store.axisBindingTarget.value = { nodeId: second!.id, channel: "y" };
    expect(store.axisBindingNode.value?.id).toBe(second!.id);
    store.setAxisBindingAggregation("y", "sum");
    expect(first?.chartSpec?.aggregations?.y).toBeUndefined();
    expect(second?.chartSpec?.aggregations?.y).toBe("sum");
    store.reverseCoordinateAxis(first!, "y");
    expect(second?.coordinateGuide?.type === "Cartesian" && second.coordinateGuide.yDirection).toBe(1);
    store.reverseCoordinateAxis(first!, "x");
    expect(first?.coordinateGuide?.type === "Cartesian" && first.coordinateGuide.xDirection).toBe(-1);
    expect(second?.coordinateGuide?.type === "Cartesian" && second.coordinateGuide.xDirection).toBe(1);
  });

  it.each([
    ["AreaChart", "LineGraph"],
    ["LineGraph", "SingleBarChart"],
    ["Scatterplot", "LineGraph"],
    ["SingleBarChart", "AreaChart"],
  ] as const)("layers configured %s and %s blocks through an interior drop", async (sourceType, targetType) => {
    const source = cartesianChart(`drag-layer-source-${sourceType}`, 100, sourceType);
    const target = cartesianChart(`drag-layer-target-${targetType}`, 950, targetType);
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [source, target];
    store.selectedIds.value = [source.id];
    const dropPoint = {
      x: target.x + target.chartSpec!.plotArea!.x + target.chartSpec!.plotArea!.width * 0.18,
      y: target.y + target.chartSpec!.plotArea!.y + target.chartSpec!.plotArea!.height / 2,
    };

    store.onCanvasNodePointerDown(source, pointerEvent(source.x + 20, source.y + 20));
    listeners.get("pointermove")?.(pointerEvent(dropPoint.x, dropPoint.y));
    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: target.id,
      type: "layer",
      sharedChannels: ["x", "y"],
      compatible: true,
    });
    listeners.get("pointerup")?.(pointerEvent(dropPoint.x, dropPoint.y));
    await nextTick();

    expect(store.canvasNodes.value).toHaveLength(1);
    const layerRoot = store.canvasNodes.value[0]!;
    expect(layerRoot.kind).toBe("group");
    expect(layerRoot.compositionSpec?.type).toBe("layer");
    expect(layerRoot.compositionSpec?.sharedChannels).toEqual(["x", "y"]);
    const layerMembers = layerRoot.kind === "group" ? layerRoot.children : [];
    const sourceAfter = layerMembers.find((node) => node.id === source.id)!;
    const targetAfter = layerMembers.find((node) => node.id === target.id)!;
    expect(sourceAfter.coordinateSystem?.ownerNodeId).toBe(target.id);
    expect(targetAfter.coordinateSystem?.ownerNodeId).toBe(target.id);
    expect(worldPlotArea(sourceAfter)).toEqual(worldPlotArea(targetAfter));
    expect(sourceAfter.chartSpec?.scales?.x?.domain).toEqual(targetAfter.chartSpec?.scales?.x?.domain);
    expect(sourceAfter.chartSpec?.scales?.y?.domain).toEqual(targetAfter.chartSpec?.scales?.y?.domain);
    expect(sourceAfter.chartSpec?.scales?.x?.type).toBe("utc");
    expect(targetAfter.chartSpec?.scales?.x?.type).toBe("utc");
    expect(worldScaleRange(sourceAfter, "x")).toEqual(worldScaleRange(targetAfter, "x"));
    expect(worldScaleRange(sourceAfter, "y")).toEqual(worldScaleRange(targetAfter, "y"));
    if (sourceType === "LineGraph") {
      const linePath = sourceAfter.renderedContent?.match(/<path d="([^"]+)"/)?.[1];
      const firstX = Number(linePath?.match(/^M\s*([-\d.]+)/)?.[1]);
      expect(sourceAfter.renderedContent).toContain('data-mark-role="line"');
      expect(linePath).not.toContain("NaN");
      expect(firstX).toBeGreaterThanOrEqual(sourceAfter.chartSpec!.plotArea!.x);
    }
  });

  it("splits a layer for editing without separating its scales or coordinate frame", async () => {
    const first = cartesianChart("layer-edit-first", 100, "AreaChart");
    const second = cartesianChart("layer-edit-second", 950, "LineGraph");
    first.chartSpec = {
      ...first.chartSpec!,
      dataTransforms: [{
        id: "layer-edit-filter-a",
        kind: "filter",
        mode: "values",
        field: "series",
        values: ["A"],
        single: true,
        purpose: "filter",
      }],
    };
    second.chartSpec = {
      ...second.chartSpec!,
      dataTransforms: [{
        id: "layer-edit-filter-b",
        kind: "filter",
        mode: "values",
        field: "series",
        values: ["B"],
        single: true,
        purpose: "filter",
      }],
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("layer", true, ["x", "y"])).toBe(true);
    const overlaidFrame = { x: first.x, y: first.y };
    expect(first.chartSpec?.scales).toEqual(second.chartSpec?.scales);

    expect(store.enterSelection()).toBe(true);
    await nextTick();
    expect(first.x).not.toBe(second.x);
    expect(first.y).toBe(second.y);
    expect(first.chartSpec?.scales).toEqual(second.chartSpec?.scales);
    expect(first.chartSpec?.plotArea).toEqual(second.chartSpec?.plotArea);
    expect(first.coordinateGuide).toEqual(second.coordinateGuide);

    expect(store.exitSelectionHierarchy()).toBe(true);
    expect({ x: first.x, y: first.y }).toEqual(overlaidFrame);
    expect({ x: second.x, y: second.y }).toEqual(overlaidFrame);
  });

  it("enters a closed Layer through its center before resolving the internal drop target", () => {
    const first = cartesianChart("layer-enter-first", 100, "AreaChart");
    const second = cartesianChart("layer-enter-second", 850, "LineGraph");
    const dragged = cartesianChart("layer-enter-dragged", 1500, "SingleBarChart");
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second, dragged];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("layer", true, ["x", "y"])).toBe(true);
    const compositionId = first.compositionSpec?.id;
    const layerBounds = store.selectionBounds.value!;
    const center = {
      x: layerBounds.minX + layerBounds.width / 2,
      y: layerBounds.minY + layerBounds.height / 2,
    };
    expect(store.compositionDropZoneAtPoint(center, dragged.id)?.enterCompositionId).toBe(compositionId);

    store.onCanvasNodePointerDown(dragged, pointerEvent(dragged.x + 20, dragged.y + 20));
    listeners.get("pointermove")?.(pointerEvent(center.x, center.y));

    expect(store.editingCompositionId.value).toBe(compositionId);
    expect(store.activeDropZone.value?.enterCompositionId).toBeUndefined();
    expect(store.compositionEnterTransition.value).toMatchObject({
      center,
      radius: expect.any(Number),
      expandScale: expect.any(Number),
    });
    const transitionId = store.compositionEnterTransition.value!.id;
    store.finishCompositionEnterTransition(transitionId);
    expect(store.compositionEnterTransition.value).toBeNull();
    listeners.get("pointerup")?.(pointerEvent(center.x, center.y));
  });

  it.each([
    ["left", "horizontal", "y", "before"],
    ["right", "horizontal", "y", "after"],
    ["top", "vertical", "x", "before"],
    ["bottom", "vertical", "x", "after"],
  ] as const)("concatenates a configured block at the %s boundary", async (edge, direction, channel, position) => {
    const source = cartesianChart(`drag-concat-source-${edge}`, 100, "LineGraph");
    const target = cartesianChart(`drag-concat-target-${edge}`, 950, "SingleBarChart");
    const defaultEncodings = {
      x: { field: "column", type: "nominal" as const },
      y: { field: "value", type: "quantitative" as const },
    };
    source.chartSpec = {
      ...source.chartSpec!,
      defaultDataBinding: true,
      encodings: defaultEncodings,
      renderer: undefined,
    };
    target.chartSpec = {
      ...target.chartSpec!,
      defaultDataBinding: true,
      encodings: defaultEncodings,
      renderer: undefined,
    };
    source.width = 620;
    source.height = 520;
    source.scaleX = 0.75;
    source.scaleY = 0.7;
    target.width = 760;
    target.height = 440;
    target.scaleX = 1.1;
    target.scaleY = 1.15;
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [source, target];
    store.selectedIds.value = [source.id];
    const targetPlotBefore = worldPlotArea(target);
    const dropPoint = edge === "left" || edge === "right"
      ? {
        x: edge === "left" ? targetPlotBefore.left - 10.1 : targetPlotBefore.right + 10.1,
        y: (targetPlotBefore.top + targetPlotBefore.bottom) / 2,
      }
      : {
        x: (targetPlotBefore.left + targetPlotBefore.right) / 2,
        y: edge === "top" ? targetPlotBefore.top - 10.1 : targetPlotBefore.bottom + 10.1,
      };

    store.onCanvasNodePointerDown(source, pointerEvent(source.x + 20, source.y + 20));
    listeners.get("pointermove")?.(pointerEvent(dropPoint.x, dropPoint.y));
    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: target.id,
      type: "concat",
      sharedChannels: [channel],
      compatible: true,
      direction,
      concatPosition: position,
    });
    listeners.get("pointerup")?.(pointerEvent(dropPoint.x, dropPoint.y));
    await nextTick();

    expect(store.canvasNodes.value).toHaveLength(2);
    expect(store.canvasNodes.value.every((node) => node.compositionSpec?.type === "concat")).toBe(true);
    const composition = store.canvasNodes.value[0]?.compositionSpec;
    expect(composition?.sharedChannels).toEqual([channel]);
    expect(composition?.direction).toBe(direction);
    expect(composition?.members.map((member) => member.nodeId)).toEqual(
      position === "before" ? [source.id, target.id] : [target.id, source.id],
    );
    const sourceAfter = store.canvasNodes.value.find((node) => node.id === source.id)!;
    const targetAfter = store.canvasNodes.value.find((node) => node.id === target.id)!;
    expect(sourceAfter.coordinateSystem?.ownerNodeId).toBe(target.id);
    expect(targetAfter.coordinateSystem?.ownerNodeId).toBe(target.id);
    const sourcePlot = worldPlotArea(sourceAfter);
    const targetPlot = worldPlotArea(targetAfter);
    store.selectedIds.value = [sourceAfter.id];
    expect(store.selectionFrame.value?.x).toBeCloseTo(sourcePlot.left);
    expect(store.selectionFrame.value?.y).toBeCloseTo(sourcePlot.top);
    expect(store.selectionFrame.value?.width).toBeCloseTo(sourcePlot.right - sourcePlot.left);
    expect(store.selectionFrame.value?.height).toBeCloseTo(sourcePlot.bottom - sourcePlot.top);
    if (direction === "horizontal") {
      expect(sourceAfter.height).toBe(targetAfter.height);
      expect(sourceAfter.scaleY).toBe(targetAfter.scaleY);
      expect(sourceAfter.height * sourceAfter.scaleY).toBe(targetAfter.height * targetAfter.scaleY);
      expect(position === "before" ? sourceAfter.x < targetAfter.x : sourceAfter.x > targetAfter.x).toBe(true);
      const plotGap = position === "before"
        ? targetPlot.left - sourcePlot.right
        : sourcePlot.left - targetPlot.right;
      expect(plotGap).toBeGreaterThanOrEqual(0);
      expect(plotGap).toBeLessThanOrEqual(16);
    } else {
      expect(sourceAfter.width).toBe(targetAfter.width);
      expect(sourceAfter.scaleX).toBe(targetAfter.scaleX);
      expect(sourceAfter.width * sourceAfter.scaleX).toBe(targetAfter.width * targetAfter.scaleX);
      expect(position === "before" ? sourceAfter.y < targetAfter.y : sourceAfter.y > targetAfter.y).toBe(true);
      const plotGap = position === "before"
        ? targetPlot.top - sourcePlot.bottom
        : sourcePlot.top - targetPlot.bottom;
      expect(plotGap).toBeGreaterThanOrEqual(0);
      expect(plotGap).toBeLessThanOrEqual(16);
    }
    expect(sourceAfter.chartSpec?.scales?.[channel]?.domain).toEqual(targetAfter.chartSpec?.scales?.[channel]?.domain);
    const sourceRange = worldScaleRange(sourceAfter, channel);
    const targetRange = worldScaleRange(targetAfter, channel);
    expect(Math.abs(sourceRange[1]! - sourceRange[0]!)).toBeCloseTo(
      Math.abs(targetRange[1]! - targetRange[0]!),
    );
    expect(sourceAfter.chartSpec?.scales?.[channel]?.type).toBe(channel === "x" ? "point" : "linear");
    expect(targetAfter.chartSpec?.scales?.[channel]?.type).toBe(channel === "x" ? "point" : "linear");
    if (channel === "x") {
      expect(sourceAfter.renderedContent).toContain('data-mark-role="line"');
      const yDomain = sourceAfter.chartSpec?.scales?.y?.domain as [number, number];
      expect(yDomain[1]).toBeGreaterThan(yDomain[0]);
    }
  });

  it("layers a Cartesian chart with an existing Layer as one intact unit", () => {
    const first = cartesianChart("repeat-layer-first", 100, "AreaChart");
    const second = cartesianChart("repeat-layer-second", 800, "LineGraph");
    const third = cartesianChart("repeat-layer-third", 1500, "SingleBarChart");
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second, third];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("layer", true, ["x", "y"])).toBe(true);
    const innerLayer = store.canvasNodes.value.find((node) => node.compositionSpec?.type === "layer")!;
    const innerCompositionId = innerLayer.compositionSpec?.id;
    expect(innerLayer.kind).toBe("group");
    expect(innerLayer.compositionSpec?.type).toBe("layer");

    expect(store.executeComposition(
      "layer",
      true,
      ["x", "y"],
      undefined,
      undefined,
      innerLayer.id,
      third.id,
    )).toBe(true);

    expect(store.canvasNodes.value).toHaveLength(1);
    const outerLayer = store.canvasNodes.value[0]!;
    expect(outerLayer.id).not.toBe(innerLayer.id);
    expect(outerLayer.compositionSpec?.type).toBe("layer");
    expect(outerLayer.kind === "group" ? outerLayer.children.map((node) => node.id) : []).toEqual([
      innerLayer.id,
      third.id,
    ]);
    expect(innerLayer.compositionSpec?.id).toBe(innerCompositionId);
    expect(innerLayer.parentCompositionSpec?.id).toBe(outerLayer.compositionSpec?.id);
  });

  it("adds a Cartesian chart to an existing concat at its outer boundary", async () => {
    const first = cartesianChart("repeat-concat-first", 100, "LineGraph");
    const second = cartesianChart("repeat-concat-second", 800, "SingleBarChart");
    const third = cartesianChart("repeat-concat-third", 1500, "AreaChart");
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second, third];
    store.selectedIds.value = [first.id, second.id];

    expect(store.executeComposition("concat", true, ["y"], "horizontal")).toBe(true);
    const compositionId = first.compositionSpec?.id;
    const plotArea = second.chartSpec!.plotArea!;
    const dropPoint = {
      x: second.x + plotArea.x + plotArea.width + 10.1,
      y: second.y + plotArea.y + plotArea.height / 2,
    };
    store.onCanvasNodePointerDown(third, pointerEvent(third.x + 20, third.y + 20));
    listeners.get("pointermove")?.(pointerEvent(dropPoint.x, dropPoint.y));

    expect(store.activeDropZone.value).toMatchObject({
      type: "concat",
      direction: "horizontal",
      concatPosition: "after",
      sharedChannels: ["y"],
      compatible: true,
    });
    listeners.get("pointerup")?.(pointerEvent(dropPoint.x, dropPoint.y));
    await nextTick();

    expect(store.canvasNodes.value).toHaveLength(3);
    expect(store.canvasNodes.value.every((node) => node.compositionSpec?.id === compositionId)).toBe(true);
    expect(first.compositionSpec?.members.map((member) => member.nodeId)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
    expect(first.x).toBeLessThan(second.x);
    expect(second.x).toBeLessThan(third.x);
  });

  it("keeps concat visual scales unchanged when splitting a link", () => {
    const first = cartesianChart("split-concat-first", 100, "LineGraph");
    const second = cartesianChart("split-concat-second", 800, "SingleBarChart");
    const third = cartesianChart("split-concat-third", 1500, "AreaChart");
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [first, second, third];
    store.selectedIds.value = [first.id, second.id, third.id];

    expect(store.executeComposition("concat", true, ["y"], "horizontal")).toBe(true);
    const control = store.concatSplitControls.value[0];
    const visualState = store.canvasNodes.value.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      scaleX: node.scaleX,
      scaleY: node.scaleY,
      scales: node.chartSpec?.scales,
      plotArea: node.chartSpec?.plotArea,
      renderedContent: node.renderedContent,
    }));

    expect(control).toBeDefined();
    expect(store.splitConcatLink(control!.id)).toBe(true);
    expect(store.canvasNodes.value.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      scaleX: node.scaleX,
      scaleY: node.scaleY,
      scales: node.chartSpec?.scales,
      plotArea: node.chartSpec?.plotArea,
      renderedContent: node.renderedContent,
    }))).toEqual(visualState);
  });

  it("replays concat links in order when adding a chart below the prior source", () => {
    const chartA = cartesianChart("ordered-concat-a", 100, "LineGraph");
    const chartB = cartesianChart("ordered-concat-b", 800, "SingleBarChart");
    const chartC = cartesianChart("ordered-concat-c", 1500, "AreaChart");
    chartA.width = 620;
    chartA.height = 440;
    chartB.width = 760;
    chartB.height = 520;
    chartC.width = 540;
    chartC.height = 360;
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [chartA, chartB, chartC];
    store.selectedIds.value = [chartA.id, chartB.id];

    expect(store.executeComposition("concat", true, ["y"], "horizontal")).toBe(true);
    expect(store.executeComposition(
      "concat",
      true,
      ["x"],
      "vertical",
      "after",
      chartB.id,
      chartC.id,
    )).toBe(true);

    expect(chartA.compositionSpec?.concatLinks).toMatchObject([
      {
        targetNodeId: chartA.id,
        sourceNodeId: chartB.id,
        direction: "horizontal",
        position: "after",
        order: 0,
      },
      {
        targetNodeId: chartB.id,
        sourceNodeId: chartC.id,
        direction: "vertical",
        position: "after",
        order: 1,
      },
    ]);
    const plotA = worldPlotArea(chartA);
    const plotB = worldPlotArea(chartB);
    const plotC = worldPlotArea(chartC);
    expect(plotB.top).toBe(plotA.top);
    expect(plotC.left).toBe(plotB.left);
    expect(plotC.right).toBe(plotB.right);
    expect(plotC.top).toBeGreaterThanOrEqual(plotB.bottom);
    expect(plotC.top - plotB.bottom).toBeLessThanOrEqual(16);
    expect(chartA.chartSpec?.axes?.y).toMatchObject({
      visible: true,
      labelsVisible: true,
    });
    expect(chartB.chartSpec?.axes).toMatchObject({
      x: { visible: false, labelsVisible: false },
      y: { visible: false, labelsVisible: false },
    });
    expect(chartC.chartSpec?.axes?.x).toMatchObject({
      visible: true,
      labelsVisible: true,
    });

    store.axisBindingTarget.value = { nodeId: chartB.id, channel: "x" };
    store.setChartAxisAppearance("x", { visible: true, labelsVisible: true });
    expect(chartB.chartSpec?.axes?.x).toMatchObject({
      visible: true,
      labelsVisible: true,
    });
  });

  it("offers Polar radial, angular, and layer drop zones", () => {
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    let dragIndex = 0;
    const dragTo = (offset: { x: number; y: number }) => {
      dragIndex += 1;
      const source = polarChart(`drag-polar-source-${dragIndex}`, 100);
      const target = polarChart(`drag-polar-target-${dragIndex}`, 800);
      store.canvasNodes.value = [source, target];
      store.selectedIds.value = [source.id];
      const point = { x: target.x + 200 + offset.x, y: target.y + 200 + offset.y };
      store.onCanvasNodePointerDown(source, pointerEvent(source.x + 20, source.y + 20));
      listeners.get("pointermove")?.(pointerEvent(point.x, point.y));
      const zone = store.activeDropZone.value;
      listeners.get("pointerup")?.(pointerEvent(point.x, point.y));
      return zone;
    };

    const radialZone = dragTo({ x: 230, y: 0 });
    expect(radialZone).toMatchObject({ type: "concat", direction: "radial", sharedChannels: ["angle"], compatible: true });

    expect(dragTo({ x: 205, y: 0 })).toBeNull();
    expect(dragTo({ x: 95, y: 20 })).toMatchObject({ type: "layer" });
    const angularBefore = dragTo({ x: 260, y: -75 });
    expect(angularBefore).toMatchObject({ type: "concat", direction: "angular", concatPosition: "before", sharedChannels: ["radius"] });

    const layerZone = dragTo({ x: 50, y: 85 });
    expect(layerZone).toMatchObject({ type: "layer", sharedChannels: ["angle", "radius"], compatible: true });
  });

  it("enumerates every legal Polar composition portal during a drag", () => {
    const source = polarChart("all-polar-zones-source", 100);
    const target = polarChart("all-polar-zones-target", 800);
    target.chartSpec = {
      ...target.chartSpec!,
      chartType: "DonutChart",
      polarArea: {
        startAngle: 0,
        angleSpan: 120,
        innerRadius: 100,
        outerRadius: 200,
      },
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [source, target];

    const zones = store.compositionDropZones(source.id);
    expect(zones.filter((zone) => zone.type === "concat").map((zone) => [
      zone.direction,
      zone.concatPosition,
      zone.sharedChannels,
    ])).toEqual(expect.arrayContaining([
      ["radial", "before", ["angle"]],
      ["radial", "after", ["angle"]],
      ["angular", "before", ["radius"]],
      ["angular", "after", ["radius"]],
    ]));
    expect(zones.filter((zone) => zone.type === "layer").map((zone) => zone.sharedChannels)).toEqual([
      ["angle", "radius"],
    ]);
  });

  it("offers radial drop zones against both Donut radii but only outside a Pie", () => {
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    const dragTo = (chartType: "DonutChart" | "PieChart", radius: number) => {
      const source = polarChart(`drag-radii-source-${chartType}-${radius}`, 100);
      const target = polarChart(`drag-radii-target-${chartType}-${radius}`, 800);
      target.chartSpec = {
        ...target.chartSpec!,
        chartType,
        polarArea: {
          startAngle: 0,
          angleSpan: 120,
          innerRadius: chartType === "DonutChart" ? 100 : 0,
          outerRadius: 200,
        },
      };
      store.canvasNodes.value = [source, target];
      store.onCanvasNodePointerDown(source, pointerEvent(source.x + 20, source.y + 20));
      const point = { x: target.x + 200 + radius, y: target.y + 200 };
      listeners.get("pointermove")?.(pointerEvent(point.x, point.y));
      const zone = store.activeDropZone.value;
      listeners.get("pointerup")?.(pointerEvent(point.x, point.y));
      return zone;
    };

    expect(dragTo("DonutChart", 90)).toMatchObject({
      type: "concat",
      direction: "radial",
      concatPosition: "before",
    });
    expect(dragTo("DonutChart", 210)).toMatchObject({
      type: "concat",
      direction: "radial",
      concatPosition: "after",
    });
    const pieInnerZone = dragTo("PieChart", 20);
    expect(pieInnerZone?.type === "concat" && pieInnerZone.direction === "radial").toBe(false);
    expect(dragTo("PieChart", 210)).toMatchObject({
      type: "concat",
      direction: "radial",
      concatPosition: "after",
    });
  });

  it("lays out Polar radial and angular concat members on one frame", () => {
    const source = polarChart("polar-radial-source", 100, 120);
    const target = polarChart("polar-radial-target", 800, 120);
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [source, target];
    store.selectedIds.value = [source.id, target.id];

    expect(store.executeComposition("concat", true, ["angle"], "radial")).toBe(true);
    const radialMembers = store.canvasNodes.value;
    expect(radialMembers[0]?.coordinateGuide?.origin).toEqual(radialMembers[1]?.coordinateGuide?.origin);
    expect(radialMembers.map((node) => [polarGuide(node)?.innerRadiusRatio, polarGuide(node)?.outerRadiusRatio])).toEqual([[0, 0.5], [0.5, 1]]);
    store.axisBindingTarget.value = { nodeId: radialMembers[1]!.id, channel: "angle" };
    expect(store.axisBindingNode.value?.id).toBe(radialMembers[1]!.id);
    store.setAxisBindingAggregation("theta", "avg");
    expect(radialMembers[0]?.chartSpec?.aggregations?.theta).toBe("sum");
    expect(radialMembers[1]?.chartSpec?.aggregations?.theta).toBe("avg");

    const angularSource = polarChart("polar-angular-source", 100, 120);
    const angularTarget = polarChart("polar-angular-target", 800, 120);
    store.canvasNodes.value = [angularSource, angularTarget];
    store.selectedIds.value = [angularSource.id, angularTarget.id];
    expect(store.executeComposition("concat", true, ["radius"], "angular")).toBe(true);
    const angularMembers = store.canvasNodes.value;
    expect(angularMembers[0]?.coordinateGuide?.origin).toEqual(angularMembers[1]?.coordinateGuide?.origin);
    expect(angularMembers.map((node) => [polarGuide(node)?.angleOffset, polarGuide(node)?.angleSpan])).toEqual([[0, 60], [60, 60]]);
  });

  it("uses annular outlines instead of a rectangular selection box for Polar nodes", () => {
    const inner = polarChart("polar-selection-inner", 100, 120);
    const outer = polarChart("polar-selection-outer", 100, 120);
    inner.coordinateGuide = {
      ...polarGuide(inner)!,
      innerRadiusRatio: 0,
      outerRadiusRatio: 0.5,
    };
    outer.coordinateGuide = {
      ...polarGuide(outer)!,
      innerRadiusRatio: 0.5,
      outerRadiusRatio: 1,
    };
    inner.chartSpec = {
      ...inner.chartSpec!,
      polarArea: { startAngle: 0, angleSpan: 120, innerRadius: 0, outerRadius: 100 },
    };
    outer.chartSpec = {
      ...outer.chartSpec!,
      polarArea: { startAngle: 0, angleSpan: 120, innerRadius: 100, outerRadius: 200 },
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    store.canvasNodes.value = [inner, outer];
    store.selectedIds.value = [inner.id, outer.id];

    expect(store.selectionPolarOutlines.value).toHaveLength(2);
    expect(store.selectionPolarOutlines.value[0]?.path).toContain(" A 100 100 ");
    expect(store.selectionPolarOutlines.value[1]?.path).toContain(" A 200 200 ");
    expect(store.selectionPolarOutlines.value[1]?.path).toContain(" A 100 100 ");

    const unrenderedTemplate = polarChart("polar-selection-template", 100, 360);
    unrenderedTemplate.renderedContent = null;
    unrenderedTemplate.chartSpec = undefined;
    store.canvasNodes.value = [unrenderedTemplate];
    store.selectedIds.value = [unrenderedTemplate.id];

    expect(store.selectionPolarOutlines.value).toHaveLength(1);
    expect(store.selectionPolarOutlines.value[0]?.path).toContain(" A 152 152 ");
  });

  it("allows coordinate-only Polar concat and activates a shared hierarchy depth scale for R", () => {
    const treeDataset: Dataset = {
      id: "polar-tree-compatibility",
      name: "polar-tree-compatibility.csv",
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
        { name: "leaf_id", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { node_id: "root", parent_id: "", leaf_id: "", value: "20" },
        { node_id: "a", parent_id: "root", leaf_id: "A", value: "8" },
        { node_id: "b", parent_id: "root", leaf_id: "B", value: "12" },
      ],
      primaryKey: ["node_id"],
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset, treeDataset];
    const pie = polarChart("polar-compatible-pie", 100);
    const donut = polarChart("polar-compatible-donut", 600);
    donut.chartSpec = { ...donut.chartSpec!, chartType: "DonutChart" };
    const tree = polarChart("polar-compatible-tree", 1100);
    tree.chartSpec = {
      chartType: "RadialDendrogram",
      datasetId: treeDataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        theta: { field: "leaf_id", type: "nominal" },
      },
    };
    const radialBars = polarChart("polar-compatible-bars", 1600);
    radialBars.chartSpec = {
      chartType: "RadialBarChart",
      datasetId: treeDataset.id,
      encodings: {
        segment: { field: "leaf_id", type: "nominal" },
        radius: { field: "value", type: "quantitative" },
      },
    };
    const sunburst = polarChart("polar-compatible-sunburst", 2100);
    sunburst.chartSpec = {
      chartType: "Sunburst",
      datasetId: treeDataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    };

    expect(store.concatNodesAreCompatible([pie, donut], "radial", "angle")).toBe(true);
    expect(store.concatNodesAreCompatible([pie, donut], "angular", "radius")).toBe(true);
    expect(store.concatNodesAreCompatible([tree, sunburst], "radial", "angle")).toBe(true);
    expect(store.concatNodesAreCompatible([tree, sunburst], "angular", "radius")).toBe(true);
    expect(store.concatNodesAreCompatible([tree, radialBars], "radial", "angle")).toBe(true);
    expect(store.concatNodesAreCompatible([tree, radialBars], "angular", "radius")).toBe(false);

    store.canvasNodes.value = [tree, sunburst];
    store.selectedIds.value = [tree.id, sunburst.id];
    expect(store.executeComposition("concat", true, ["radius"], "angular")).toBe(true);
    const composition = store.canvasNodes.value[0]?.compositionSpec;
    expect(composition?.sharedHierarchyLevelCount).toBe(1);
    expect(composition?.sharedHierarchyOuterRadius).toBeGreaterThan(0);
    const dendrogramRadius = Number(tree.renderedContent?.match(/data-hierarchy-depth="1"[^>]*data-radius="([^"]+)"/)?.[1]);
    const sunburstRadius = Number(sunburst.renderedContent?.match(/data-hierarchy-depth="1"[^>]*data-radius-center="([^"]+)"/)?.[1]);
    expect(dendrogramRadius).toBeGreaterThan(0);
    expect(dendrogramRadius).toBeCloseTo(sunburstRadius);
  });

  it("filters a Polar concat companion to Radial Dendrogram leaves", () => {
    const dataset: Dataset = {
      id: "polar-tree-leaf-filter",
      name: "polar-tree-leaf-filter.csv",
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
        { name: "axis_label", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { node_id: "root", parent_id: "", axis_label: "Root", value: "30" },
        { node_id: "branch", parent_id: "root", axis_label: "Branch", value: "24" },
        { node_id: "leaf-a", parent_id: "branch", axis_label: "Leaf A", value: "8" },
        { node_id: "leaf-b", parent_id: "branch", axis_label: "Leaf B", value: "7" },
        { node_id: "leaf-c", parent_id: "root", axis_label: "Leaf C", value: "6" },
      ],
      primaryKey: ["node_id"],
    };
    const tree = polarChart("polar-tree-leaf-filter-tree", 100, 360);
    tree.chartSpec = {
      chartType: "RadialDendrogram",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        theta: { field: "axis_label", type: "nominal" },
      },
    };
    const bars = polarChart("polar-tree-leaf-filter-bars", 700, 360);
    bars.chartSpec = {
      chartType: "RadialBarChart",
      datasetId: dataset.id,
      encodings: {
        segment: { field: "axis_label", type: "nominal" },
        radius: { field: "value", type: "quantitative" },
      },
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [tree, bars];
    store.selectedIds.value = [tree.id, bars.id];

    expect(store.executeComposition("concat", true, ["angle"], "radial")).toBe(true);
    expect(tree.coordinateSystem?.axisLabelDomains?.angle).toEqual(["Leaf A", "Leaf B", "Leaf C"]);
    expect(bars.coordinateSystem?.axisLabelDomains?.angle).toEqual(["Leaf A", "Leaf B", "Leaf C"]);
    expect(bars.renderedContent?.match(/data-mark-role="bar"/g)).toHaveLength(3);
    expect(bars.renderedContent).not.toContain('data-category-key="Root"');
    expect(bars.renderedContent).not.toContain('data-category-key="Branch"');
  });

  it("concats Cartesian trees only along their active leaf-order axis", () => {
    const tree = lineChart("cartesian-tree-compatibility", 100, false);
    tree.chartSpec = {
      chartType: "Dendrogram",
      datasetId: layerDataset.id,
      encodings: {
        key: { field: "time", type: "temporal" },
        parent: { field: "series", type: "nominal" },
        category: { field: "series", type: "nominal" },
      },
      markGroups: [{
        id: "tree-nodes",
        chartId: tree.id,
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection: "down" },
      }],
    };
    const bars = lineChart("cartesian-tree-bars", 900, false);
    bars.chartSpec = {
      chartType: "SingleBarChart",
      datasetId: layerDataset.id,
      encodings: {
        x: { field: "series", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];

    expect(store.concatNodesAreCompatible([tree, bars], "vertical", "x")).toBe(true);
    expect(store.concatNodesAreCompatible([tree, bars], "horizontal", "y")).toBe(false);

    tree.chartSpec!.markGroups![0]!.sharedConfig.treeDirection = "right";
    bars.chartSpec!.axisSwapped = true;
    expect(store.concatNodesAreCompatible([tree, bars], "horizontal", "y")).toBe(true);
    expect(store.concatNodesAreCompatible([tree, bars], "vertical", "x")).toBe(false);
  });

  it("keeps a circular Dendrogram Enter portal alongside leaf-axis Layer and Concat zones", () => {
    const dataset: Dataset = {
      id: "dendrogram-composition-portals",
      name: "dendrogram-composition-portals.csv",
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
        { name: "axis_label", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { node_id: "root", parent_id: "", axis_label: "Root", value: "15" },
        { node_id: "leaf-a", parent_id: "root", axis_label: "Leaf A", value: "7" },
        { node_id: "leaf-b", parent_id: "root", axis_label: "Leaf B", value: "8" },
      ],
      primaryKey: ["node_id"],
    };
    const tree = lineChart("dendrogram-portal-target", 100, false);
    tree.chartSpec = {
      chartType: "Dendrogram",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        category: { field: "axis_label", type: "nominal" },
      },
      plotArea: { x: 80, y: 40, width: 640, height: 320 },
      markGroups: [{
        id: "dendrogram-portal-nodes",
        chartId: tree.id,
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection: "down" },
      }],
    };
    tree.renderedContent = '<g data-chart-type="dendrogram"/>';
    const bars = lineChart("dendrogram-portal-source", 950, false);
    bars.chartSpec = {
      chartType: "SingleBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "axis_label", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
      plotArea: { x: 80, y: 40, width: 640, height: 320 },
    };
    bars.renderedContent = '<g data-chart-type="bar"/>';

    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [tree, bars];

    const targetZones = store.compositionDropZones(bars.id)
      .filter((zone) => zone.targetNodeId === tree.id);
    expect(targetZones.filter((zone) => zone.type === "layer").map((zone) => zone.sharedChannels)).toEqual([["x"]]);
    expect(targetZones.filter((zone) => zone.type === "concat").map((zone) => [
      zone.direction,
      zone.concatPosition,
      zone.sharedChannels,
    ])).toEqual(expect.arrayContaining([
      ["vertical", "before", ["x"]],
      ["vertical", "after", ["x"]],
    ]));

    const enter = targetZones.find((zone) => zone.nestedAction === "enter");
    expect(enter?.enterBounds).toBeDefined();
    const bounds = enter!.enterBounds!;
    const center = {
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + bounds.height / 2,
    };
    expect(store.compositionDropZoneAtPoint(center, bars.id)).toMatchObject({
      targetNodeId: tree.id,
      type: "nested",
      nestedAction: "enter",
    });
    expect(store.compositionDropZoneAtPoint({
      x: bounds.minX + 1,
      y: bounds.minY + 1,
    }, bars.id)).toMatchObject({
      targetNodeId: tree.id,
      type: "layer",
      sharedChannels: ["x"],
    });
  });

  it.each([
    ["leaf_id", ["Leaf A", "Leaf B", "Leaf C"]],
    ["axis_label", ["Root", "Branch", "Leaf A", "Leaf B", "Leaf C"]],
  ] as const)("simulates dragging a Bar Chart onto a Dendrogram concat using %s", async (sharedField, barDomain) => {
    listeners.clear();
    const dataset: Dataset = {
      id: `cartesian-tree-bar-concat-${sharedField}`,
      name: `cartesian-tree-bar-concat-${sharedField}.csv`,
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
        { name: "leaf_id", type: "nominal" },
        { name: "axis_label", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { node_id: "root", parent_id: "", leaf_id: "", axis_label: "Root", value: "30" },
        { node_id: "branch", parent_id: "root", leaf_id: "", axis_label: "Branch", value: "24" },
        { node_id: "leaf-a", parent_id: "branch", leaf_id: "Leaf A", axis_label: "Leaf A", value: "8" },
        { node_id: "leaf-b", parent_id: "branch", leaf_id: "Leaf B", axis_label: "Leaf B", value: "7" },
        { node_id: "leaf-c", parent_id: "root", leaf_id: "Leaf C", axis_label: "Leaf C", value: "6" },
      ],
      primaryKey: ["node_id"],
    };
    const tree = lineChart(`cartesian-tree-${sharedField}`, 100, false);
    tree.chartSpec = {
      chartType: "Dendrogram",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        category: { field: sharedField, type: "nominal" },
      },
      plotArea: { x: 80, y: 40, width: 640, height: 320 },
      scales: {
        x: { type: "point", domain: ["Leaf A", "Leaf B", "Leaf C"], range: [80, 720] },
        y: { type: "linear", domain: [0, 1], range: [40, 250] },
      },
      markGroups: [{
        id: `tree-nodes-${sharedField}`,
        chartId: tree.id,
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection: "down" },
      }],
    };
    tree.renderedContent = '<g data-chart-type="dendrogram"/>';

    const bars = lineChart(`cartesian-tree-bars-${sharedField}`, 100, false);
    bars.y = 700;
    bars.chartSpec = {
      chartType: "SingleBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: sharedField, type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
      plotArea: { x: 80, y: 40, width: 640, height: 320 },
      scales: {
        x: { type: "point", domain: [...barDomain], range: [80, 720] },
        y: { type: "linear", domain: [0, 30], range: [360, 40] },
      },
    };
    bars.renderedContent = '<g data-chart-type="bar"/>';

    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [tree, bars];
    store.selectedIds.value = [bars.id];
    const treePlot = worldPlotArea(tree);
    const dropPoint = {
      x: (treePlot.left + treePlot.right) / 2,
      y: treePlot.bottom + 10.1,
    };

    store.onCanvasNodePointerDown(bars, pointerEvent(bars.x + 20, bars.y + 20));
    listeners.get("pointermove")?.(pointerEvent(dropPoint.x, dropPoint.y));

    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: tree.id,
      type: "concat",
      sharedChannels: ["x"],
      compatible: true,
      direction: "vertical",
      concatPosition: "after",
    });

    listeners.get("pointerup")?.(pointerEvent(dropPoint.x, dropPoint.y));
    await nextTick();

    expect(store.canvasNodes.value.every((node) => node.compositionSpec?.type === "concat")).toBe(true);
    const leafDomain = ["Leaf A", "Leaf B", "Leaf C"];
    expect(tree.chartSpec?.scales?.x?.domain).toEqual(leafDomain);
    expect(bars.chartSpec?.scales?.x?.domain).toEqual(leafDomain);
    expect(bars.renderedContent?.match(/data-mark-role="bar"/g)).toHaveLength(leafDomain.length);
    expect(bars.renderedContent).not.toContain('data-category-key="Root"');
    expect(bars.renderedContent).not.toContain('data-category-key="Branch"');
  });

  it("centers a five-metric pie on every Dendrogram node after entering", async () => {
    listeners.clear();
    const metrics = ["metric_1", "metric_2", "metric_3", "metric_4", "metric_5"];
    const dataset: Dataset = {
      id: "dendrogram-nested-pies",
      name: "dendrogram-nested-pies.csv",
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
        ...metrics.map((name) => ({ name, type: "quantitative" as const })),
      ],
      rows: [
        { node_id: "root", parent_id: "", metric_1: "5", metric_2: "4", metric_3: "3", metric_4: "2", metric_5: "1" },
        { node_id: "branch", parent_id: "root", metric_1: "1", metric_2: "2", metric_3: "3", metric_4: "4", metric_5: "5" },
        { node_id: "leaf", parent_id: "branch", metric_1: "2", metric_2: "3", metric_3: "5", metric_4: "7", metric_5: "11" },
      ],
      primaryKey: ["node_id"],
    };
    const tree = lineChart("direct-nested-dendrogram", 100, false);
    tree.chartSpec = {
      chartType: "Dendrogram",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
      },
      plotArea: { x: 40, y: 40, width: 640, height: 320 },
      markGroups: [{
        id: `mark-group:${tree.id}:node`,
        chartId: tree.id,
        role: "node",
        memberKeys: [],
        sharedConfig: {},
      }],
    };
    tree.renderedContent = '<g data-chart-type="dendrogram"/>';

    const pie = polarChart("five-metric-nested-pie", 1000, 360);
    pie.chartSpec = {
      ...pie.chartSpec!,
      datasetId: dataset.id,
      encodings: {},
    };
    const nodeCenters = dataset.rows.map((_row, index) => ({ x: 226 + index * 120, y: 246 }));
    const marks = dataset.rows.map((row, index) => {
      const circle = new SvgMarkStub({}, {
        left: 220 + index * 120,
        top: 240,
        right: 232 + index * 120,
        bottom: 252,
      });
      return new SvgMarkStub({
        "data-chart-id": tree.id,
        "data-mark-role": "node",
        "data-mark-group-id": `mark-group:${tree.id}:node`,
        "data-row-key": row.node_id!,
      }, {
        left: 220 + index * 120,
        top: 240,
        right: 292 + index * 120,
        bottom: 252,
      }, [], circle);
    });
    const treeElement = new SvgMarkStub({ "data-node-id": tree.id }, {
      left: tree.x,
      top: tree.y,
      right: tree.x + tree.width,
      bottom: tree.y + tree.height,
    }, marks);
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: () => [treeElement],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [tree, pie];
    store.selectedIds.value = [pie.id];
    store.axisBindingTarget.value = { nodeId: pie.id, channel: "angle" };
    store.setPolarSegmentFields(metrics);

    store.onCanvasNodePointerDown(pie, pointerEvent(pie.x + 20, pie.y + 20));
    const plotArea = tree.chartSpec.plotArea!;
    listeners.get("pointermove")?.(pointerEvent(
      tree.x + plotArea.x + plotArea.width / 2,
      tree.y + plotArea.y + plotArea.height / 2,
    ));
    expect(store.chartDrilldown.value).toEqual({ nodeId: tree.id, level: "part" });
    listeners.get("pointermove")?.(pointerEvent(226, 246));

    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: tree.id,
      type: "nested",
      nestedAction: "embed",
    });
    expect(store.activeDropZone.value?.enterBounds).toBeUndefined();

    listeners.get("pointerup")?.(pointerEvent(226, 246));
    await nextTick();

    const nestedPies = store.canvasNodes.value.filter((node) => node.id !== tree.id);
    expect(nestedPies).toHaveLength(dataset.rows.length);
    expect(nestedPies.every((node) => node.chartSpec?.angleFields?.map((field) => field.field).join("|") === metrics.join("|"))).toBe(true);
    expect(nestedPies.every((node) => node.renderedContent?.match(/data-mark-role="arc"/g)?.length === metrics.length)).toBe(true);
    const relationships = Object.values(store.relationshipStore.state.value.nestedRelationships);
    expect(relationships).toHaveLength(dataset.rows.length);
    expect(relationships.every((relationship) => relationship.inheritedFilterContexts?.length === 1
      && relationship.inheritedFilterContexts[0]?.parentField === "node_id")).toBe(true);
    nestedPies.forEach((node, index) => {
      expect(node.x + node.width * node.scaleX / 2).toBeCloseTo(nodeCenters[index]!.x);
      expect(node.y + node.height * node.scaleY / 2).toBeCloseTo(nodeCenters[index]!.y);
    });
  });

  it("filters a monthly Radial Stacked Bar by each Dendrogram node ID", async () => {
    listeners.clear();
    const metrics = ["metric_1", "metric_2"];
    const dataset: Dataset = {
      id: "dendrogram-monthly-radial-stacks",
      name: "dendrogram-monthly-radial-stacks.csv",
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
        { name: "month", type: "ordinal" },
        ...metrics.map((name) => ({ name, type: "quantitative" as const })),
      ],
      rows: [
        { node_id: "root", parent_id: "", month: "Jan", metric_1: "30", metric_2: "3" },
        { node_id: "root", parent_id: "", month: "Feb", metric_1: "18", metric_2: "7" },
        { node_id: "branch", parent_id: "root", month: "Jan", metric_1: "4", metric_2: "22" },
        { node_id: "branch", parent_id: "root", month: "Feb", metric_1: "9", metric_2: "40" },
      ],
      primaryKey: ["node_id", "month"],
    };
    const tree = lineChart("monthly-radial-stack-parent", 100, false);
    tree.chartSpec = {
      chartType: "Dendrogram",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
      },
      plotArea: { x: 40, y: 40, width: 480, height: 240 },
      markGroups: [{
        id: `mark-group:${tree.id}:node`,
        chartId: tree.id,
        role: "node",
        memberKeys: [],
        sharedConfig: {},
      }],
    };
    tree.renderedContent = '<g data-chart-type="dendrogram"/>';

    const radialStack = polarChart("monthly-radial-stack-child", 800, 340);
    radialStack.chartSpec = {
      ...radialStack.chartSpec!,
      chartType: "RadialStackedBarChart",
      datasetId: dataset.id,
      encodings: {
        segment: { field: "month", type: "ordinal" },
      },
      valueFields: metrics.map((field) => ({ field, type: "quantitative" as const })),
    };
    const nodeIds = ["root", "branch"];
    const marks = nodeIds.map((nodeId, index) => {
      const left = 220 + index * 150;
      const circle = new SvgMarkStub({}, { left, top: 240, right: left + 12, bottom: 252 });
      return new SvgMarkStub({
        "data-chart-id": tree.id,
        "data-mark-role": "node",
        "data-mark-group-id": `mark-group:${tree.id}:node`,
        "data-node-key": nodeId,
        "data-row-key": `${nodeId}|Jan`,
      }, { left, top: 240, right: left + 72, bottom: 252 }, [], circle);
    });
    const treeElement = new SvgMarkStub({ "data-node-id": tree.id }, {
      left: tree.x,
      top: tree.y,
      right: tree.x + tree.width,
      bottom: tree.y + tree.height,
    }, marks);
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1800, height: 1000 }),
      querySelectorAll: () => [treeElement],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [tree, radialStack];
    store.selectedIds.value = [radialStack.id];
    store.axisBindingTarget.value = { nodeId: radialStack.id, channel: "radius" };
    store.setValueSeriesFields(metrics);

    store.onCanvasNodePointerDown(radialStack, pointerEvent(radialStack.x + 20, radialStack.y + 20));
    const plotArea = tree.chartSpec.plotArea!;
    listeners.get("pointermove")?.(pointerEvent(
      tree.x + plotArea.x + plotArea.width / 2,
      tree.y + plotArea.y + plotArea.height / 2,
    ));
    listeners.get("pointermove")?.(pointerEvent(226, 246));
    listeners.get("pointerup")?.(pointerEvent(226, 246));
    await nextTick();

    const nestedBars = store.canvasNodes.value.filter((node) => node.id !== tree.id);
    expect(nestedBars).toHaveLength(nodeIds.length);
    expect(nestedBars.every((node) => node.renderedContent?.match(/data-mark-role="bar"/g)?.length === 4)).toBe(true);
    const relationships = Object.values(store.relationshipStore.state.value.nestedRelationships);
    expect(relationships.map((relationship) => relationship.inheritedFilterContexts?.[0]?.value)).toEqual(nodeIds);
    nestedBars.forEach((node, index) => {
      const ownNodeId = nodeIds[index]!;
      const otherNodeId = nodeIds[1 - index]!;
      expect(node.renderedContent).toContain(`${ownNodeId}|Jan|metric_1`);
      expect(node.renderedContent).toContain(`${ownNodeId}|Feb|metric_2`);
      expect(node.renderedContent).not.toContain(`${otherNodeId}|Jan|metric_1`);
    });
  });

  it("reflows nested children when a Dendrogram node size changes", async () => {
    const dataset: Dataset = {
      id: "dendrogram-node-size-layout",
      name: "dendrogram-node-size-layout.csv",
      columns: [
        { name: "node_id", type: "nominal" },
        { name: "parent_id", type: "nominal" },
      ],
      rows: [{ node_id: "root", parent_id: "" }],
      primaryKey: ["node_id"],
    };
    const parent = lineChart("dendrogram-size-parent", 100, false);
    parent.chartSpec = {
      chartType: "Dendrogram",
      datasetId: dataset.id,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
      },
      markGroups: [{
        id: `mark-group:${parent.id}:node`,
        chartId: parent.id,
        role: "node",
        memberKeys: [],
        sharedConfig: { size: 2.5 },
      }],
    };
    const child = lineChart("dendrogram-size-child", 900, false);
    child.width = 100;
    child.height = 100;
    let markBounds = { left: 200, top: 200, right: 210, bottom: 210 };
    const canvasRef = ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [new SvgMarkStub(
        { "data-node-id": parent.id },
        { left: 100, top: 100, right: 500, bottom: 500 },
        [new SvgMarkStub(
          {
            "data-mark-role": "node",
            "data-mark-group-id": `mark-group:${parent.id}:node`,
          },
          markBounds,
          [],
          new SvgMarkStub({}, markBounds),
        )],
      )],
    } as unknown as HTMLElement);
    const store = useCanvasStore(canvasRef);
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [parent, child];
    [parent, child].forEach((node, index) => {
      store.relationshipStore.dispatch({
        type: "register-chart",
        chart: {
          id: node.id,
          nodeId: node.id,
          chartType: node.chartSpec!.chartType,
          datasetId: node.chartSpec!.datasetId,
          instanceKind: index === 0 ? "canvas" : "nested-child",
        },
      });
    });
    store.relationshipStore.dispatch({
      type: "begin-nested",
      relationship: {
        id: "nested:dendrogram-size",
        parentChartId: parent.id,
        parentElementId: "mark:dendrogram-size:node:root",
        parentMarkGroupId: `mark-group:${parent.id}:node`,
        childChartId: child.id,
        relationType: "relative-position",
        parameters: {
          ...store.relationshipStore.defaultRelativeParameters(),
          scale: { x: 0.1, y: 0.1 },
        },
        resolverVersion: 1,
      },
    });
    store.relationshipStore.dispatch({ type: "commit-nested", relationshipId: "nested:dendrogram-size" });
    store.axisBindingTarget.value = { nodeId: parent.id, channel: "x" };
    markBounds = { left: 200, top: 200, right: 250, bottom: 250 };

    child.scaleX = 0.1;
    child.scaleY = 0.1;
    const previousScale = child.scaleX;
    store.updateAxisBindingMarkGroupConfig({ size: 20 });
    await nextTick();

    const relationship = store.relationshipStore.state.value.nestedRelationships["nested:dendrogram-size"];
    expect(child.scaleX).toBeGreaterThan(previousScale);
    expect(child.scaleY).toBeCloseTo(child.scaleX);
    expect((relationship?.parameters as { scale: { x: number; y: number } }).scale.x).toBeCloseTo(child.scaleX);
    expect((relationship?.parameters as { scale: { x: number; y: number } }).scale.y).toBeCloseTo(child.scaleY);
  });

  it("keeps a closed Polar Layer whole when composing it again", () => {
    const layerFirst = polarChart("repeat-polar-layer-first", 100);
    const layerSecond = polarChart("repeat-polar-layer-second", 800);
    const layerThird = polarChart("repeat-polar-layer-third", 1500);
    const layerStore = useCanvasStore(coordinateCanvasRef());
    layerStore.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    layerStore.canvasNodes.value = [layerFirst, layerSecond, layerThird];
    layerStore.selectedIds.value = [layerFirst.id, layerSecond.id];
    expect(layerStore.executeComposition("layer", true, ["angle", "radius"])).toBe(true);
    const innerRoot = layerStore.canvasNodes.value.find((node) => node.kind === "group" && node.compositionSpec?.type === "layer");
    const innerCompositionId = innerRoot?.compositionSpec?.id;
    expect(innerRoot?.kind === "group" ? innerRoot.children : []).toHaveLength(2);
    layerStore.selectedIds.value = [innerRoot!.id, layerThird.id];
    expect(layerStore.executeComposition("layer", true, ["angle", "radius"])).toBe(true);
    expect(layerStore.canvasNodes.value).toHaveLength(1);
    const outerRoot = layerStore.canvasNodes.value[0];
    expect(outerRoot?.kind).toBe("group");
    expect(outerRoot?.compositionSpec?.id).not.toBe(innerCompositionId);
    expect(outerRoot?.kind === "group" ? outerRoot.children.map((node) => node.id) : []).toEqual([
      innerRoot!.id,
      layerThird.id,
    ]);
    expect(innerRoot?.compositionSpec?.id).toBe(innerCompositionId);
    expect(innerRoot?.kind === "group" ? innerRoot.children : []).toHaveLength(2);

    const concatFirst = polarChart("repeat-polar-concat-first", 100, 120);
    const concatSecond = polarChart("repeat-polar-concat-second", 800, 120);
    const concatThird = polarChart("repeat-polar-concat-third", 1500, 120);
    const concatStore = useCanvasStore(coordinateCanvasRef());
    concatStore.relationshipStore.dispatch({ type: "clear" });
    concatStore.canvasNodes.value = [concatFirst, concatSecond, concatThird];
    concatStore.selectedIds.value = [concatFirst.id, concatSecond.id];
    expect(concatStore.executeComposition("concat", true, ["angle"], "radial")).toBe(true);
    const concatCompositionId = concatFirst.compositionSpec?.id;
    concatStore.selectedIds.value = [concatFirst.id, concatThird.id];
    expect(concatStore.executeComposition(
      "concat",
      true,
      ["angle"],
      "radial",
      "after",
      concatFirst.id,
      concatThird.id,
    )).toBe(true);
    expect(concatStore.canvasNodes.value).toHaveLength(3);
    expect(concatStore.canvasNodes.value.every((node) => node.compositionSpec?.id === concatCompositionId)).toBe(true);
    expect(concatStore.canvasNodes.value.map((node) => [
      polarGuide(node)?.innerRadiusRatio,
      polarGuide(node)?.outerRadiusRatio,
    ])).toEqual([[0, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 1]]);

    const angularFirst = polarChart("repeat-polar-angular-first", 100, 120);
    const angularSecond = polarChart("repeat-polar-angular-second", 800, 120);
    const angularThird = polarChart("repeat-polar-angular-third", 1500, 120);
    const angularStore = useCanvasStore(coordinateCanvasRef());
    angularStore.relationshipStore.dispatch({ type: "clear" });
    angularStore.canvasNodes.value = [angularFirst, angularSecond, angularThird];
    angularStore.selectedIds.value = [angularFirst.id, angularSecond.id];
    expect(angularStore.executeComposition("concat", true, ["radius"], "angular")).toBe(true);
    angularStore.selectedIds.value = [angularFirst.id, angularThird.id];
    expect(angularStore.executeComposition(
      "concat",
      true,
      ["radius"],
      "angular",
      "after",
      angularFirst.id,
      angularThird.id,
    )).toBe(true);
    expect(angularStore.canvasNodes.value.map((node) => [
      polarGuide(node)?.angleOffset,
      polarGuide(node)?.angleSpan,
    ])).toEqual([[0, 40], [40, 40], [80, 40]]);
  });

  it("requires entering a chart before nesting a configured pie on a scatter mark", async () => {
    const dataset: Dataset = {
      id: "drag-nested-dataset",
      name: "drag-nested.csv",
      columns: [
        { name: "x", type: "quantitative" },
        { name: "y", type: "quantitative" },
        { name: "slice_a", type: "quantitative" },
        { name: "slice_b", type: "quantitative" },
      ],
      rows: [
        { x: "1", y: "10", slice_a: "4", slice_b: "6" },
        { x: "2", y: "20", slice_a: "7", slice_b: "3" },
      ],
    };
    const parent = lineChart("drag-nested-parent", 100, false);
    parent.chartSpec = {
      ...parent.chartSpec!,
      chartType: "Scatterplot",
      datasetId: dataset.id,
      encodings: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    };
    const child = lineChart("drag-nested-child", 1000, false);
    child.chartSpec = {
      ...child.chartSpec!,
      chartType: "PieChart",
      datasetId: dataset.id,
      encodings: {
        theta: { field: "slice_a", type: "quantitative" },
        radius: { field: "slice_b", type: "quantitative" },
      },
      angleFields: [{ field: "slice_a", type: "quantitative" }, { field: "slice_b", type: "quantitative" }],
    };
    child.coordinateGuide = { type: "Polar", origin: { x: 160, y: 90 } };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [parent, child];
    store.selectedIds.value = [child.id];
    await nextTick();

    const plotArea = parent.chartSpec?.plotArea;
    expect(plotArea).toBeTruthy();
    const firstPoint = {
      x: parent.x + (plotArea?.x ?? 0) + 60,
      y: parent.y + (parent.chartSpec?.scales?.y?.range[0] ?? 0)
        + ((10 - Number(parent.chartSpec?.scales?.y?.domain[0] ?? 0))
          / (Number(parent.chartSpec?.scales?.y?.domain[1] ?? 1) - Number(parent.chartSpec?.scales?.y?.domain[0] ?? 0)))
        * ((parent.chartSpec?.scales?.y?.range[1] ?? 0) - (parent.chartSpec?.scales?.y?.range[0] ?? 0)),
    };
    store.onCanvasNodePointerDown(child, pointerEvent(child.x + 20, child.y + 20));
    listeners.get("pointermove")?.(pointerEvent(firstPoint.x, firstPoint.y));

    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: parent.id,
      type: "layer",
    });
    expect(store.canvasNodes.value).toHaveLength(2);

    const chartCenter = {
      x: parent.x + (plotArea?.x ?? 0) + (plotArea?.width ?? 0) / 2,
      y: parent.y + (plotArea?.y ?? 0) + (plotArea?.height ?? 0) / 2,
    };
    listeners.get("pointermove")?.(pointerEvent(chartCenter.x, chartCenter.y));
    expect(store.chartDrilldown.value).toEqual({
      nodeId: parent.id,
      level: "part",
    });

    listeners.get("pointermove")?.(pointerEvent(firstPoint.x, firstPoint.y));
    expect(store.chartDrilldown.value).toEqual({ nodeId: parent.id, level: "part" });
    expect(store.activeDropZone.value).toMatchObject({
      targetNodeId: parent.id,
      type: "nested",
    });
    listeners.get("pointerup")?.(pointerEvent(firstPoint.x, firstPoint.y));

    expect(store.canvasNodes.value).toHaveLength(1);
    expect(store.canvasNodes.value[0]?.nestedSpec?.type).toBe("nested");
  });
});

describe("CSV column axis drag binding", () => {
  function dragCanvasRef() {
    return ref({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      querySelectorAll: () => [],
    } as unknown as HTMLElement);
  }

  it("binds a geographic Scatterplot ID and keeps using its selected GeoJSON source", async () => {
    const dataset: Dataset = {
      id: "geographic-id-drag",
      name: "geographic-id-drag.csv",
      columns: [{ name: "place_id", type: "nominal" }],
      rows: [{ place_id: "place-a" }],
    };
    const matchingSource: GeometrySource = {
      id: "geometry:matching",
      name: "matching.geojson",
      features: [{
        type: "Feature",
        id: "place-a",
        properties: {},
        geometry: { type: "Point", coordinates: [0, 0] },
      }],
    };
    const unrelatedSource: GeometrySource = {
      id: "geometry:unrelated",
      name: "unrelated.geojson",
      features: [{
        type: "Feature",
        id: "place-b",
        properties: {},
        geometry: { type: "Point", coordinates: [1, 1] },
      }],
    };
    const scatterplot = lineChart("geographic-scatterplot", 100, false);
    scatterplot.layerKind = "deckgl";
    scatterplot.deckglLayerType = "ScatterplotLayer";
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    const datasetStore = useDatasetStore();
    datasetStore.datasets.value = [dataset];
    datasetStore.geometrySources.value = [matchingSource, unrelatedSource];
    datasetStore.activeGeometrySourceId.value = matchingSource.id;
    store.canvasNodes.value = [scatterplot];

    expect(store.setDeckglDataBinding(scatterplot.id, dataset.id, matchingSource.id, "place_id")).toBe(true);
    datasetStore.activeGeometrySourceId.value = unrelatedSource.id;

    const event = columnDragEvent(dataset.id, "place_id", "nominal", 500, 300);
    store.onCanvasDragOver(event);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "geographic-body",
      targetNodeId: scatterplot.id,
      compatible: true,
    });

    await store.onCanvasDrop(event);
    expect(scatterplot.deckglBinding).toMatchObject({
      datasetId: dataset.id,
      geometrySourceId: matchingSource.id,
      idField: "place_id",
    });
  });

  it("binds a geographic PolygonLayer ID from a dropped CSV column", async () => {
    const dataset: Dataset = {
      id: "geographic-polygon-drag",
      name: "geographic-polygon-drag.csv",
      columns: [{ name: "district_id", type: "nominal" }],
      rows: [{ district_id: "district-a" }],
    };
    const source: GeometrySource = {
      id: "geometry:polygon",
      name: "districts.geojson",
      features: [{
        type: "Feature",
        id: "district-a",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
      }],
    };
    const polygon = lineChart("geographic-polygon", 100, false);
    polygon.layerKind = "deckgl";
    polygon.deckglLayerType = "PolygonLayer";
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    const datasetStore = useDatasetStore();
    datasetStore.datasets.value = [dataset];
    datasetStore.geometrySources.value = [source];
    datasetStore.activeGeometrySourceId.value = source.id;
    store.canvasNodes.value = [polygon];

    const event = columnDragEvent(dataset.id, "district_id", "nominal", 500, 300);
    store.onCanvasDragOver(event);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "geographic-body",
      targetNodeId: polygon.id,
      compatible: true,
    });

    await store.onCanvasDrop(event);
    expect(polygon.deckglBinding).toMatchObject({
      datasetId: dataset.id,
      geometrySourceId: source.id,
      idField: "district_id",
    });
  });

  it("highlights and binds a compatible column on a Cartesian axis", async () => {
    const chart = lineChart("column-drag-chart", 100, false);
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [chart];
    const event = columnDragEvent(layerDataset.id, "time", "temporal", 500, 500);

    store.onCanvasDragOver(event);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "cartesian-axis",
      targetNodeId: chart.id,
      channel: "x",
      compatible: true,
      fieldName: "time",
    });
    expect(event.dataTransfer?.dropEffect).toBe("copy");

    await store.onCanvasDrop(event);
    expect(chart.chartSpec?.encodings.x).toEqual({ field: "time", type: "temporal" });
    expect(store.selectedIds.value).toEqual([chart.id]);
    expect(store.activeDataBindingDropZone.value).toBeNull();
  });

  it("opens dimension choices when an unused column is dropped inside a configured chart", async () => {
    const dataset: Dataset = {
      id: "chart-body-dimension",
      name: "chart-body-dimension.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01", weight: "80" },
        { person: "A", time: "2026-02", weight: "79" },
        { person: "B", time: "2026-01", weight: "76" },
        { person: "B", time: "2026-02", weight: "75" },
      ],
    };
    const chart = lineChart("chart-body-target", 100, false);
    chart.chartSpec = {
      chartType: "SingleBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "person", type: "nominal" },
        y: { field: "weight", type: "quantitative" },
      },
    };
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    const event = columnDragEvent(dataset.id, "time", "temporal", 500, 300);

    store.onCanvasDragOver(event);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "chart-body",
      targetNodeId: chart.id,
      fieldName: "time",
      compatible: true,
    });
    expect(event.dataTransfer?.dropEffect).toBe("copy");

    await store.onCanvasDrop(event);
    expect(store.dimensionDropTarget.value).toMatchObject({
      nodeId: chart.id,
      fieldName: "time",
    });
    expect(store.dimensionDropTarget.value?.analysis.intents.every((intent) =>
      intent.inputColumn === "time",
    )).toBe(true);
    expect(chart.chartSpec?.encodings).toEqual({
      x: { field: "person", type: "nominal" },
      y: { field: "weight", type: "quantitative" },
    });

    const averageIntent = store.dimensionDropTarget.value?.analysis.intents.find((intent) =>
      intent.kind === "aggregate" && intent.aggregation === "avg",
    );
    expect(averageIntent).toBeDefined();
    expect(store.applyInputColumnIntent(averageIntent!.id)).toBe(true);
    expect(chart.chartSpec?.aggregations?.y).toBe("avg");
    expect(chart.chartSpec?.dimensionAggregations?.time).toBe("avg");
    expect(chart.chartSpec?.dimensionDecisions?.time).toBe("aggregate");
    expect(store.dimensionDropTarget.value).toBeNull();
  });

  it("upgrades a single bar from a chart-body dimension drop", async () => {
    const dataset: Dataset = {
      id: "chart-body-upgrade",
      name: "chart-body-upgrade.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01", weight: "80" },
        { person: "A", time: "2026-02", weight: "79" },
        { person: "B", time: "2026-01", weight: "76" },
        { person: "B", time: "2026-02", weight: "75" },
      ],
    };
    const chart = lineChart("chart-body-upgrade-target", 100, false);
    chart.chartSpec = {
      chartType: "SingleBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "person", type: "nominal" },
        y: { field: "weight", type: "quantitative" },
      },
    };
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];

    await store.onCanvasDrop(columnDragEvent(dataset.id, "time", "temporal", 500, 300));
    const upgradeIntent = store.dimensionDropTarget.value?.analysis.intents.find((intent) =>
      intent.kind === "upgrade" && intent.targetChartType === "StackedBarChart",
    );
    expect(upgradeIntent).toBeDefined();
    expect(store.applyInputColumnIntent(upgradeIntent!.id)).toBe(true);
    expect(chart.chartSpec?.chartType).toBe("StackedBarChart");
    expect(chart.chartSpec?.encodings.color).toBeUndefined();
    expect(chart.chartSpec?.seriesFields).toEqual([{ field: "time", type: "temporal" }]);
    expect(chart.renderedContent).toContain('data-bar-variant="stacked"');
  });

  it("shows an incompatible axis and leaves its binding unchanged", async () => {
    const chart = lineChart("column-drag-incompatible", 100, false);
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [layerDataset];
    store.canvasNodes.value = [chart];
    const event = columnDragEvent(layerDataset.id, "series", "nominal", 100, 300);

    store.onCanvasDragOver(event);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "cartesian-axis",
      channel: "y",
      compatible: false,
    });
    expect(event.dataTransfer?.dropEffect).toBe("none");

    await store.onCanvasDrop(event);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "value", type: "quantitative" });
    expect(store.importNotice.value).toContain("not supported");
  });

  it("accumulates quantitative Group items in the dedicated drop zone and locks Y", async () => {
    const dataset: Dataset = {
      id: "drag-group-items",
      name: "drag-group-items.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
        { name: "fat", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01", weight: "80", water: "45", fat: "18" },
        { time: "2026-02", weight: "79", water: "44", fat: "17" },
      ],
    };
    const chart = lineChart("column-drag-group-items", 100, false);
    chart.chartSpec = {
      chartType: "GroupedBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight", type: "quantitative" },
      },
    };
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    const itemDropEvent = (field: string) => {
      const bounds = store.seriesItemDropBounds(chart);
      return columnDragEvent(
        dataset.id,
        field,
        "quantitative",
        bounds.minX + bounds.width / 2,
        bounds.minY + bounds.height / 2,
      );
    };

    const firstDrop = itemDropEvent("water");
    store.onCanvasDragOver(firstDrop);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "series-item",
      label: "Group item",
      compatible: true,
    });
    await store.onCanvasDrop(firstDrop);
    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["water"]);
    expect(chart.renderedContent).toContain('data-bar-variant="grouped"');
    await store.onCanvasDrop(itemDropEvent("fat"));

    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["water", "fat"]);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "water", type: "quantitative" });
    expect(store.barItemAxisBinding(chart)).toEqual({
      label: "Group item",
      fields: ["water", "fat"],
    });
    store.selectedIds.value = [chart.id];
    const itemFrame = store.seriesItemDropFrame(chart);
    expect(itemFrame.x).toBe(store.selectionFrame.value?.x);
    expect(itemFrame.y + itemFrame.height).toBe(store.selectionFrame.value?.y);
    expect(itemFrame.width).toBeLessThanOrEqual(280);
    expect(itemFrame.height).toBe(90);

    const plot = chart.chartSpec?.plotArea;
    const yAxisDrop = columnDragEvent(
      dataset.id,
      "weight",
      "quantitative",
      chart.x + (plot?.x ?? 0),
      chart.y + (plot?.y ?? 0) + (plot?.height ?? chart.height) / 2,
    );
    store.onCanvasDragOver(yAxisDrop);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "cartesian-axis",
      channel: "y",
      compatible: false,
    });
    expect(yAxisDrop.dataTransfer?.dropEffect).toBe("none");

    store.removeBarItemField(chart.id, "water");
    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["fat"]);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "fat", type: "quantitative" });

    expect(store.updateSelectedChartMarkGroupConfig({
      seriesStyleMapping: {
        type: "series-style",
        values: { fat: { color: "#ef4444", strokeWidth: 4, shape: "dashed" } },
      },
    })).toBe(true);
    expect(chart.chartSpec?.markGroups?.[0]?.sharedConfig.seriesStyleMapping).toEqual({
      type: "series-style",
      values: { fat: { color: "#ef4444", strokeWidth: 4, shape: "dashed" } },
    });
  });

  it.each(["StackedAreaChart", "Streamgraph"])(
    "uses a dedicated %s Series drop zone and keeps logical Y locked after XY swap",
    async (chartType) => {
      const dataset: Dataset = {
        id: `drag-${chartType}`,
        name: `${chartType}.csv`,
        columns: [
          { name: "time", type: "temporal" },
          { name: "alpha", type: "quantitative" },
          { name: "beta", type: "quantitative" },
          { name: "label", type: "nominal" },
        ],
        rows: [
          { time: "2026-01-01", alpha: "4", beta: "2", label: "A" },
          { time: "2026-01-08", alpha: "6", beta: "3", label: "B" },
        ],
      };
      const chart = lineChart(`column-drag-${chartType}`, 100, false);
      chart.chartSpec = {
        chartType,
        datasetId: dataset.id,
        encodings: { x: { field: "time", type: "temporal" }, y: { field: "alpha", type: "quantitative" } },
      };
      const store = useCanvasStore(dragCanvasRef());
      store.relationshipStore.dispatch({ type: "clear" });
      useDatasetStore().datasets.value = [dataset];
      store.canvasNodes.value = [chart];
      const xAxisEvent = (field: string) => columnDragEvent(
        dataset.id,
        field,
        "quantitative",
        chart.x + (chart.chartSpec?.plotArea?.x ?? 0) + (chart.chartSpec?.plotArea?.width ?? chart.width) / 2,
        chart.y + (chart.chartSpec?.plotArea?.y ?? 0) + (chart.chartSpec?.plotArea?.height ?? chart.height),
      );
      const yAxisEvent = (field: string) => columnDragEvent(
        dataset.id,
        field,
        "quantitative",
        chart.x + (chart.chartSpec?.plotArea?.x ?? 0),
        chart.y + (chart.chartSpec?.plotArea?.y ?? 0) + (chart.chartSpec?.plotArea?.height ?? chart.height) / 2,
      );
      const itemDropEvent = (field: string, type: "nominal" | "temporal" | "quantitative" = "quantitative") => {
        const bounds = store.seriesItemDropBounds(chart);
        return columnDragEvent(
          dataset.id,
          field,
          type,
          bounds.minX + bounds.width / 2,
          bounds.minY + bounds.height / 2,
        );
      };

      await store.onCanvasDrop(itemDropEvent("alpha"));
      await store.onCanvasDrop(itemDropEvent("beta"));
      expect(store.barItemAxisBinding(chart)).toEqual({ label: "Series", fields: ["alpha", "beta"] });
      expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["alpha", "beta"]);

      store.setAxisSwap(true);
      await store.onCanvasDrop(columnDragEvent(
        dataset.id,
        "time",
        "temporal",
        chart.x + (chart.chartSpec?.plotArea?.x ?? 0),
        chart.y + (chart.chartSpec?.plotArea?.y ?? 0) + (chart.chartSpec?.plotArea?.height ?? chart.height) / 2,
      ));
      expect(chart.chartSpec?.encodings.x).toEqual({ field: "time", type: "temporal" });
      const lockedY = xAxisEvent("alpha");
      store.onCanvasDragOver(lockedY);
      expect(store.activeDataBindingDropZone.value).toMatchObject({
        type: "cartesian-axis",
        channel: "x",
        compatible: false,
      });
      expect(lockedY.dataTransfer?.dropEffect).toBe("none");
      expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["alpha", "beta"]);
      expect(store.itemBindingAxis(chart)).toBe("x");

      const incompatible = itemDropEvent("label", "nominal");
      store.onCanvasDragOver(incompatible);
      expect(store.activeDataBindingDropZone.value).toMatchObject({ type: "series-item", compatible: false });
      expect(incompatible.dataTransfer?.dropEffect).toBe("none");
    },
  );

  it.each([
    "LineGraph",
    "GroupedBarChart",
    "StackedBarChart",
    "MultiLineChart",
    "AreaChart",
    "StackedAreaChart",
    "Streamgraph",
    "HorizonChart",
  ])("keeps categorical and quantitative Series Item modes exclusive for %s", (chartType) => {
    const dataset: Dataset = {
      id: `series-item-mode-${chartType}`,
      name: `${chartType}.csv`,
      columns: [
        { name: "person", type: "nominal" },
        { name: "cohort", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
      ],
      rows: [
        { person: "A", cohort: "first", time: "2026-01", weight: "80", water: "45" },
        { person: "B", cohort: "second", time: "2026-01", weight: "76", water: "42" },
      ],
    };
    const chart = lineChart(`series-item-mode-node-${chartType}`, 120, false);
    chart.chartSpec = {
      chartType,
      datasetId: dataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight", type: "quantitative" },
      },
      valueFields: [
        { field: "weight", type: "quantitative" },
        { field: "water", type: "quantitative" },
      ],
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.selectedIds.value = [chart.id];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };

    store.setSeriesFields(["person", "cohort"]);

    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
    expect(chart.chartSpec?.series).toEqual({ field: "person", type: "nominal" });
    expect(chart.chartSpec?.seriesFields).toEqual([{ field: "person", type: "nominal" }]);
    expect(chart.chartSpec?.valueFields).toBeUndefined();

    store.setValueSeriesFields(["weight", "water"]);

    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
    expect(chart.chartSpec?.valueFields?.map((encoding) => encoding.field)).toEqual(["weight", "water"]);
    expect(chart.chartSpec?.series).toBeUndefined();
    expect(chart.chartSpec?.seriesFields).toBeUndefined();

    store.setChartEncoding("y", "water");
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
    expect(store.importNotice.value).toContain("Y is derived from quantitative Series Items");
  });

  it("keeps Y available after a categorical field is dropped in the Group item zone", async () => {
    const dataset: Dataset = {
      id: "categorical-group-item-drop",
      name: "categorical-group-item-drop.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01", weight: "80", water: "45" },
        { person: "B", time: "2026-01", weight: "76", water: "42" },
      ],
    };
    const chart = lineChart("categorical-group-item-drop-node", 100, false);
    chart.chartSpec = {
      chartType: "GroupedBarChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight", type: "quantitative" },
      },
    };
    const store = useCanvasStore(dragCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    const bounds = store.seriesItemDropBounds(chart);
    const groupDrop = columnDragEvent(
      dataset.id,
      "person",
      "nominal",
      bounds.minX + bounds.width / 2,
      bounds.minY + bounds.height / 2,
    );

    store.onCanvasDragOver(groupDrop);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "series-item",
      label: "Group item",
      compatible: true,
    });
    await store.onCanvasDrop(groupDrop);
    expect(chart.chartSpec?.seriesFields).toEqual([{ field: "person", type: "nominal" }]);
    expect(chart.chartSpec?.valueFields).toBeUndefined();
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
    expect(store.seriesItemDropFrame(chart).height).toBe(90);

    const plot = chart.chartSpec?.plotArea;
    const yDrop = columnDragEvent(
      dataset.id,
      "water",
      "quantitative",
      chart.x + (plot?.x ?? 0),
      chart.y + (plot?.y ?? 0) + (plot?.height ?? chart.height) / 2,
    );
    store.onCanvasDragOver(yDrop);
    expect(store.activeDataBindingDropZone.value).toMatchObject({
      type: "cartesian-axis",
      channel: "y",
      compatible: true,
    });
    await store.onCanvasDrop(yDrop);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "water", type: "quantitative" });
    expect(chart.chartSpec?.seriesFields).toEqual([{ field: "person", type: "nominal" }]);
  });

  it("renders a temporal categorical Series Item and retains its Y binding", () => {
    const dataset: Dataset = {
      id: "temporal-series-item",
      name: "temporal-series-item.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "snapshot", type: "temporal" },
        { name: "weight", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", snapshot: "2025-12-01", weight: "80" },
        { time: "2026-02-01", snapshot: "2025-12-01", weight: "79" },
        { time: "2026-01-01", snapshot: "2026-01-01", weight: "76" },
        { time: "2026-02-01", snapshot: "2026-01-01", weight: "75" },
      ],
    };
    const chart = lineChart("temporal-series-item-node", 120, false);
    chart.chartSpec = {
      chartType: "MultiLineChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight", type: "quantitative" },
      },
    };
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "y" };

    expect(store.setSeriesFields(["snapshot"])).toBe(true);
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
    expect(chart.chartSpec?.seriesFields).toEqual([{ field: "snapshot", type: "temporal" }]);
    expect(chart.chartSpec?.renderer?.status).toBe("ready");
  });

  it("applies a categorical Data Engine intent over an existing quantitative Series Item mode", () => {
    const dataset: Dataset = {
      id: "series-intent-mode-switch",
      name: "series-intent-mode-switch.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01", weight: "80", water: "45" },
        { person: "B", time: "2026-01", weight: "76", water: "42" },
      ],
    };
    const chart = lineChart("series-intent-mode-switch-node", 120, false);
    chart.chartSpec = {
      chartType: "MultiLineChart",
      datasetId: dataset.id,
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight", type: "quantitative" },
      },
      valueFields: [
        { field: "weight", type: "quantitative" },
        { field: "water", type: "quantitative" },
      ],
    };
    const analysis = inferColumnIntents(
      dataset,
      chart.chartSpec,
      { name: "person", type: "nominal" },
      { type: "chart-body" },
    );
    const intent = analysis.intents.find((candidate) => candidate.kind === "series");
    const store = useCanvasStore(ref(null));
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    store.canvasNodes.value = [chart];
    store.axisBindingTarget.value = { nodeId: chart.id, channel: "x" };
    store.dimensionDropTarget.value = {
      nodeId: chart.id,
      fieldName: "person",
      clientX: 0,
      clientY: 0,
      analysis,
    };

    expect(intent).toBeDefined();
    expect(store.applyInputColumnIntent(intent!.id)).toBe(true);
    expect(chart.chartSpec?.seriesFields).toEqual([{ field: "person", type: "nominal" }]);
    expect(chart.chartSpec?.valueFields).toBeUndefined();
    expect(chart.chartSpec?.encodings.y).toEqual({ field: "weight", type: "quantitative" });
  });
});

describe("Graph Link template drop", () => {
  it("enables graph edges on a deck.gl Scatterplot instead of creating another node", async () => {
    const dataset: Dataset = {
      id: "geographic-graph-link-drop",
      name: "nodes.csv + links.csv",
      columns: [],
      rows: [],
      graph: {
        nodes: {
          columns: [
            { name: "id", type: "nominal" },
            { name: "place_id", type: "nominal" },
          ],
          rows: [
            { id: "a", place_id: "place-a" },
            { id: "b", place_id: "place-b" },
          ],
        },
        edges: {
          columns: [
            { name: "source", type: "nominal" },
            { name: "target", type: "nominal" },
            { name: "value", type: "quantitative" },
          ],
          rows: [{ source: "a", target: "b", value: "2" }],
        },
      },
    };
    const scatterplot = lineChart("geographic-graph-link-target", 100, false);
    scatterplot.layerKind = "deckgl";
    scatterplot.deckglLayerType = "ScatterplotLayer";
    scatterplot.deckglDatasetId = dataset.id;
    scatterplot.deckglBinding = {
      datasetId: dataset.id,
      geometrySourceId: "geometry:places",
      idField: "place_id",
      aggregation: "sum",
    };
    const store = useCanvasStore(coordinateCanvasRef());
    store.relationshipStore.dispatch({ type: "clear" });
    useDatasetStore().datasets.value = [dataset];
    useDatasetStore().geometrySources.value = [{
      id: "geometry:places",
      name: "places.geojson",
      features: [
        {
          type: "Feature",
          id: "place-a",
          properties: {},
          geometry: { type: "Point", coordinates: [120, 30] },
        },
        {
          type: "Feature",
          id: "place-b",
          properties: {},
          geometry: { type: "Point", coordinates: [121, 31] },
        },
      ],
    }];
    store.canvasNodes.value = [scatterplot];
    const candidate = store.implementedTemplateCandidates.value.find((item) =>
      item.graphLinkMode === "cartesian");
    expect(candidate).toBeDefined();

    const transferData = new Map<string, string>();
    const dataTransfer = {
      files: [],
      types: ["application/x-svg-candidate", "text/plain"],
      dropEffect: "none",
      effectAllowed: "none",
      getData: (format: string) => transferData.get(format) ?? "",
      setData: (format: string, value: string) => transferData.set(format, value),
    };
    store.onCandidateDragStart(candidate!, {
      dataTransfer,
    } as unknown as DragEvent);
    await store.onCanvasDrop({
      clientX: 500,
      clientY: 300,
      dataTransfer,
      preventDefault() {},
    } as unknown as DragEvent);

    expect(store.canvasNodes.value).toHaveLength(1);
    expect(scatterplot.deckglConfig).toMatchObject({ link: true });
    expect(store.selectedIds.value).toEqual([scatterplot.id]);
  });
});
