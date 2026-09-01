import { describe, expect, it } from "vitest";
import { advancedTemplateDefinitions } from "../utils/advancedChartCards";
import { getChartTemplateContract, normalizeChartTemplate } from "../utils/chartTemplates";
import { getEncodingChannelConfigs } from "../utils/encodingConfig";
import { renderDeterministicChart } from "../utils/semanticRenderer";
import { prepareChartData } from "../utils/chartDataPipeline";
import type { ChartSpec, CoordinateGuide, Dataset, NestedChildFrame } from "../types";

const cartesian: CoordinateGuide = {
  type: "Cartesian",
  origin: { x: 30, y: 270 },
  xDirection: 1,
  yDirection: -1,
};

const polar: CoordinateGuide = {
  type: "Polar",
  origin: { x: 250, y: 150 },
};

function render(
  chartType: string,
  dataset: Dataset,
  chartSpec: Omit<ChartSpec, "chartType" | "datasetId">,
  coordinateGuide?: CoordinateGuide,
  nestedChildFrames?: readonly NestedChildFrame[],
) {
  return renderDeterministicChart({
    chartId: chartType,
    width: 500,
    height: 300,
    minX: 0,
    minY: 0,
    coordinateGuide: coordinateGuide ?? (getChartTemplateContract(chartType)?.coordinateSystem === "Cartesian"
      ? cartesian
      : getChartTemplateContract(chartType)?.coordinateSystem === "Polar" ? polar : null),
    chartSpec: { chartType, datasetId: dataset.id, ...chartSpec },
    dataset,
    nestedChildFrames,
  });
}

const seriesDataset: Dataset = {
  id: "series",
  name: "series.csv",
  columns: [
    { name: "date", type: "temporal" },
    { name: "series", type: "nominal" },
    { name: "person", type: "nominal" },
    { name: "department", type: "nominal" },
    { name: "priority", type: "ordinal" },
    { name: "value", type: "quantitative" },
    { name: "a", type: "quantitative" },
    { name: "b", type: "quantitative" },
    { name: "c", type: "quantitative" },
  ],
  rows: Array.from({ length: 24 }, (_, index) => ({
    date: `2026-01-${String(index % 12 + 1).padStart(2, "0")}`,
    series: index % 2 ? "B" : "A",
    person: index % 2 ? "Person_B" : "Person_A",
    department: ["Sales", "Support", "Product"][index % 3]!,
    priority: ["Low", "Medium", "High"][index % 3]!,
    value: String((index % 8) - 2),
    a: String(index + 1),
    b: String((index * 7) % 19),
    c: String((index * index) % 23),
  })),
};

const hierarchyDataset: Dataset = {
  id: "hierarchy",
  name: "hierarchy.csv",
  columns: [
    { name: "id", type: "nominal" },
    { name: "parent", type: "nominal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { id: "root", parent: "", value: "0" },
    { id: "a", parent: "root", value: "8" },
    { id: "b", parent: "root", value: "5" },
    { id: "a1", parent: "a", value: "3" },
    { id: "a2", parent: "a", value: "5" },
  ],
};

const radialHierarchyDataset: Dataset = {
  id: "radial-hierarchy",
  name: "radial-hierarchy.csv",
  columns: [
    { name: "id", type: "nominal" },
    { name: "parent", type: "nominal" },
    { name: "leaf", type: "nominal" },
    { name: "value", type: "quantitative" },
    { name: "group", type: "nominal" },
  ],
  rows: [
    { id: "root", parent: "", leaf: "", value: "", group: "" },
    { id: "a", parent: "root", leaf: "", value: "", group: "A" },
    { id: "a1", parent: "a", leaf: "a1", value: "3", group: "A" },
    { id: "a2", parent: "a", leaf: "a2", value: "5", group: "A" },
    { id: "b", parent: "root", leaf: "b", value: "4", group: "B" },
  ],
};

const flowDataset: Dataset = {
  id: "flow",
  name: "flow.csv",
  columns: [
    { name: "source", type: "nominal" },
    { name: "target", type: "nominal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { source: "A", target: "B", value: "8" },
    { source: "A", target: "C", value: "5" },
    { source: "B", target: "D", value: "6" },
    { source: "C", target: "D", value: "4" },
  ],
};

const contourDataset: Dataset = {
  id: "contour",
  name: "contour.csv",
  columns: [
    { name: "x", type: "quantitative" },
    { name: "y", type: "quantitative" },
    { name: "z", type: "quantitative" },
  ],
  rows: Array.from({ length: 36 }, (_, index) => {
    const x = index % 6;
    const y = Math.floor(index / 6);
    return { x: String(x), y: String(y), z: String(2 ** (1 + ((x - 2.5) ** 2 + (y - 2.5) ** 2) / 2)) };
  }),
};

describe("advanced chart cards", () => {
  it("registers all requested cards with contracts", () => {
    expect(advancedTemplateDefinitions).toHaveLength(17);
    expect(advancedTemplateDefinitions.map((card) => card.name)).toEqual([
      "Area Chart", "Stacked Area", "Streamgraph", "Horizon Chart",
      "Parallel Coordinates", "Icicle", "Sunburst", "Treemap", "Dendrogram",
      "Radial Dendrogram", "Radial Bar Chart",
      "Calendar", "Box Plot", "Contour", "Hexbin", "Chord", "Sankey",
    ]);
    advancedTemplateDefinitions.forEach((card) => {
      expect(normalizeChartTemplate(card.chartType)).not.toBeNull();
      expect(getChartTemplateContract(card.chartType)?.channels.length).toBeGreaterThan(0);
      expect(card.svgMarkup).toContain("<svg");
    });
    const radialCluster = advancedTemplateDefinitions.find((card) => card.chartType === "RadialDendrogram");
    expect(getChartTemplateContract("Dendrogram")?.supportsLayerComposition).toBe(false);
    expect(getChartTemplateContract("RadialDendrogram")?.supportsLayerComposition).toBe(false);
    expect(radialCluster?.svgMarkup).toContain('data-renderer="observable-radial-cluster@3"');
    expect(radialCluster?.svgMarkup).toContain('data-leaf-radius="68"');
    expect(radialCluster?.svgMarkup).toContain('data-selection-radius="76"');
    expect(radialCluster?.svgMarkup).toContain('stroke-opacity="0.4"');
    expect(radialCluster?.svgMarkup).toContain('fill="#555"');
    expect(radialCluster?.svgMarkup).toContain('fill="#999"');
    const contour = advancedTemplateDefinitions.find((card) => card.chartType === "Contour");
    const hexbin = advancedTemplateDefinitions.find((card) => card.chartType === "Hexbin");
    expect(contour?.svgMarkup).toContain('data-renderer="observable-contours@2"');
    expect(contour?.svgMarkup).toContain('viewBox="0 0 956 600"');
    expect(contour?.svgMarkup).toContain('stroke-opacity="0.5"');
    expect(contour?.svgMarkup).not.toContain("<image");
    expect(hexbin?.svgMarkup).toContain('data-renderer="observable-hexbin@2"');
    expect(hexbin?.svgMarkup).toContain('viewBox="0 0 320 180"');
    expect(hexbin?.svgMarkup).toContain('data-default-dataset-id="builtin:d3-hexbin-diamonds"');
    expect(hexbin?.svgMarkup).toContain('data-source-row-count="53940"');
    expect(hexbin?.svgMarkup?.match(/<path/g)?.length).toBeGreaterThan(500);
    expect(hexbin?.svgMarkup).toContain('stroke="black"');
    expect(hexbin?.svgMarkup).not.toContain("<image");
  });

  it("keeps semantic encoding channels for every new card family", () => {
    const channels = (chartType: string) => getEncodingChannelConfigs(chartType).map((config) => config.channel);
    expect(channels("AreaChart")).toEqual(["x", "y", "color"]);
    expect(channels("ParallelCoordinatesPlot")).toEqual(["dimensions", "color"]);
    expect(channels("Sunburst")).toEqual(["key", "parent", "value", "color"]);
    expect(channels("Dendrogram")).toEqual(["key", "parent", "value", "color", "size", "category"]);
    expect(channels("RadialDendrogram")).toEqual(["key", "parent", "theta"]);
    expect(channels("RadialBarChart")).toEqual(["theta", "segment", "radius", "color"]);
    expect(channels("Calendar")).toEqual(["date", "value", "color"]);
    expect(channels("Boxplot")).toEqual(["x", "y", "color"]);
    expect(channels("Contour")).toEqual(["x", "y", "color"]);
    expect(channels("Hexbin")).toEqual(["x", "y"]);
    expect(channels("Sankey")).toEqual(["source", "target", "value", "color"]);
  });

  it("exposes only the channels consumed by the D3 contour and hexbin examples", () => {
    expect(getEncodingChannelConfigs("Contour").map((config) => config.channel)).toEqual(["x", "y", "color"]);
    expect(getEncodingChannelConfigs("Hexbin").map((config) => config.channel)).toEqual(["x", "y"]);
  });

  it.each(["AreaChart", "StackedAreaChart", "Streamgraph", "HorizonChart"])("renders %s area marks", (chartType) => {
    const result = render(chartType, seriesDataset, {
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
    });
    expect(result.content).toContain('data-mark-role="area"');
    expect(result.content).toContain('data-area-curve="basis"');
    expect(result.content).toMatch(/d="[^"]*C/);
    if (chartType === "HorizonChart") {
      expect(result.content).toContain('data-bands="7"');
      expect(result.content).toContain('data-mark-role="horizon-axis"');
    } else {
      expect(result.scales?.x.type).toBe("utc");
      expect(result.plotArea.width / result.plotArea.height).toBeCloseTo(2);
    }
  });

  it("keeps repeated progression values in a plain area chart", () => {
    const repeatedDataset: Dataset = {
      id: "repeated-area",
      name: "repeated-area.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { date: "2026-01-01", value: "4" },
        { date: "2026-01-01", value: "8" },
        { date: "2026-01-02", value: "6" },
        { date: "2026-01-02", value: "10" },
      ],
    };
    const result = render("AreaChart", repeatedDataset, {
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
    });

    expect(result.content).toContain('data-renderer="deterministic-area@1"');
    expect(result.content).toContain('data-point-count="4"');
    const yDomain = result.scales?.y.domain as [number, number];
    expect(yDomain[0]).toBeLessThanOrEqual(0);
    expect(yDomain[1]).toBeGreaterThanOrEqual(0);
  });

  it("only aggregates repeated area progression values when explicitly configured", () => {
    const dataset: Dataset = {
      id: "explicit-area-aggregation",
      name: "explicit-area-aggregation.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { date: "2026-01-01", value: "4" },
        { date: "2026-01-01", value: "8" },
        { date: "2026-01-02", value: "6" },
        { date: "2026-01-02", value: "10" },
      ],
    };
    const result = render("AreaChart", dataset, {
      aggregations: { y: "sum" },
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
    });

    expect(result.content).toContain('data-point-count="2"');
  });

  it("uses the line path for a selected stacked-area series with duplicate X values", () => {
    const dataset: Dataset = {
      id: "selected-stacked-series",
      name: "selected-stacked-series.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "series", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { date: "2026-01-01", series: "A", value: "4" },
        { date: "2026-01-01", series: "A", value: "8" },
        { date: "2026-01-02", series: "A", value: "6" },
        { date: "2026-01-02", series: "A", value: "10" },
      ],
    };
    const result = render("StackedAreaChart", dataset, {
      series: { field: "series", type: "nominal" },
      seriesFields: [{ field: "series", type: "nominal" }],
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
      valueFilters: { series: ["A"] },
    });

    expect(result.content).toContain('data-point-count="4"');
    expect(result.content).not.toContain('data-point-count="2"');
  });

  it("aligns multiple stacked-area series by X", () => {
    const dataset: Dataset = {
      id: "person-weight-by-time",
      name: "person-weight-by-time.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "person", type: "nominal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", person: "A", weight_kg: "88" },
        { time: "2026-01-01", person: "B", weight_kg: "95" },
        { time: "2026-02-01", person: "A", weight_kg: "84" },
        { time: "2026-02-01", person: "B", weight_kg: "102" },
      ],
    };
    const result = render("StackedAreaChart", dataset, {
      encodings: {
        x: { field: "time", type: "temporal" },
        y: { field: "weight_kg", type: "quantitative" },
        color: { field: "person", type: "nominal" },
      },
      series: { field: "person", type: "nominal" },
      seriesFields: [{ field: "person", type: "nominal" }],
    });

    expect(result.content.match(/data-mark-role="area"/g)).toHaveLength(2);
    expect(result.content.match(/data-point-count="2"/g)).toHaveLength(2);
  });

  it("aligns filtered wide value fields before stacking area layers", () => {
    const dataset: Dataset = {
      id: "faceted-body-composition",
      name: "faceted-body-composition.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "water", type: "quantitative" },
        { name: "fat", type: "quantitative" },
        { name: "muscle", type: "quantitative" },
        { name: "minerals", type: "quantitative" },
      ],
      rows: [
        { person: "A", time: "2026-01-01", water: "40", fat: "18", muscle: "30", minerals: "3" },
        { person: "A", time: "2026-02-01", water: "42", fat: "17", muscle: "31", minerals: "4" },
        { person: "B", time: "2026-01-01", water: "45", fat: "15", muscle: "34", minerals: "4" },
      ],
      primaryKey: ["person", "time"],
    };
    const chartSpec: ChartSpec = {
      chartType: "StackedAreaChart",
      datasetId: dataset.id,
      filters: { person: "A" },
      encodings: { x: { field: "time", type: "temporal" } },
      valueFields: ["water", "fat", "muscle", "minerals"].map((field) => ({
        field,
        type: "quantitative" as const,
      })),
    };
    const prepared = prepareChartData("faceted-stacked-area", dataset, chartSpec);
    const result = renderDeterministicChart({
      chartId: "faceted-stacked-area",
      width: 500,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: cartesian,
      chartSpec: prepared.chartSpec,
      dataset: prepared.dataset,
    });

    expect(prepared.dataset.rows).toHaveLength(8);
    expect(result.content.match(/data-mark-role="area"/g)).toHaveLength(4);
    expect(result.content.match(/data-point-count="2"/g)).toHaveLength(4);
  });

  it("uses the same vertical progression template when plain area axes are swapped", () => {
    const repeatedDataset: Dataset = {
      id: "swapped-repeated-area",
      name: "swapped-repeated-area.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { date: "2026-01-01", value: "4" },
        { date: "2026-01-01", value: "8" },
        { date: "2026-01-02", value: "6" },
        { date: "2026-01-02", value: "10" },
      ],
    };
    const result = render("AreaChart", repeatedDataset, {
      axisSwapped: true,
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
    });

    expect(result.content).toContain('data-axis-swapped="true"');
    expect(result.content).toContain('data-point-count="4"');
    expect(result.scales?.x.type).toBe("linear");
    const xDomain = result.scales?.x.domain as [number, number];
    expect(xDomain[0]).toBeLessThanOrEqual(0);
    expect(xDomain[1]).toBeGreaterThanOrEqual(0);
    expect(result.scales?.y.type).toBe("utc");
  });

  it("centers and smooths streamgraph layers", () => {
    const result = render("Streamgraph", seriesDataset, {
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "a", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
    });
    expect(result.content).toContain('data-stack-offset="silhouette"');
    expect(result.content).toContain('data-stack-order="inside-out"');
    expect(result.content).toContain('data-area-curve="basis"');
    expect(result.content).toMatch(/d="[^"]*C/);
  });

  it("centers a single streamgraph layer instead of falling back to a zero baseline", () => {
    const result = render("Streamgraph", {
      id: "single-stream",
      name: "single-stream.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { date: "2026-01-01", value: "2" },
        { date: "2026-01-02", value: "6" },
        { date: "2026-01-03", value: "4" },
      ],
    }, {
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
    });

    const domain = result.scales?.y.domain as [number, number];
    expect(domain[0]).toBeCloseTo(-domain[1]);
    expect(result.content).toContain('data-stack-offset="silhouette"');
    expect(result.content).toMatch(/d="[^"]*C/);
  });

  it("anchors zero-valued streamgraph endpoints on the centered baseline", () => {
    const result = render("Streamgraph", {
      id: "zero-endpoint-stream",
      name: "zero-endpoint-stream.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "series", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { date: "2026-01-01", series: "A", value: "0" },
        { date: "2026-01-02", series: "A", value: "8" },
        { date: "2026-01-03", series: "A", value: "0" },
      ],
    }, {
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
    });

    const yRange = result.scales?.y.range as [number, number];
    const center = (yRange[0] + yRange[1]) / 2;
    const path = result.content.match(/data-mark-role="area"[^>]*d="([^"]+)"/)?.[1] ?? "";
    const start = path.match(/^M[^,]+,([0-9.-]+)/)?.[1];
    expect(Number(start)).toBeCloseTo(center, 3);
  });

  it.each(["StackedAreaChart", "Streamgraph"])("swaps %s like MultiLine while preserving every series", (chartType) => {
    const result = render(chartType, seriesDataset, {
      axisSwapped: true,
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "value", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
    });

    expect(result.content).toContain('data-axis-swapped="true"');
    expect(result.content.match(/data-mark-role="area"/g)).toHaveLength(2);
    expect(result.scales?.x.type).toBe("linear");
    expect(result.scales?.y.type).toBe("utc");
  });

  it("renders quantitative, nominal, and ordinal parallel dimensions without axis boxplots", () => {
    const result = render("ParallelCoordinatesPlot", seriesDataset, {
      encodings: { color: { field: "series", type: "nominal" } },
      parallelFields: [
        { field: "a", type: "quantitative" as const },
        { field: "person", type: "nominal" as const },
        { field: "priority", type: "ordinal" as const },
        { field: "date", type: "temporal" as const },
      ],
    });
    expect(result.content.match(/data-mark-role="parallel-axis"/g)).toHaveLength(4);
    expect(result.content.match(/data-mark-role="path"/g)).toHaveLength(seriesDataset.rows.length);
    expect(result.content.match(/data-axis-scale="point"/g)).toHaveLength(2);
    expect(result.content).toContain('data-axis-scale="linear"');
    expect(result.content).toContain('data-axis-scale="utc"');
    expect(result.content.match(/stroke-dasharray="2 3"/g)).toHaveLength(2);
    const axisTitleSizes = Array.from(result.content.matchAll(/data-mark-role="parallel-axis-title"[^>]*font-size="([^"]+)"/g), (match) => Number(match[1]));
    expect(new Set(axisTitleSizes).size).toBe(1);
    expect(axisTitleSizes[0]).toBeLessThanOrEqual(8);
    expect(result.content).not.toContain('<title>1 - 24</title>');
    expect(result.content).not.toContain('data-mark-role="nested-boxplot"');
    expect(result.content).toContain('data-axis-orientation="vertical"');
  });

  it.each(["Icicle", "Sunburst", "Treemap", "Dendrogram"])("renders %s hierarchy nodes", (chartType) => {
    const result = render(chartType, hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    });
    expect(result.content).toContain('data-mark-role="node"');
    expect(result.content).toContain('data-node-key="a1"');
    expect(result.content).toContain('data-row-key=');
  });

  it("applies a static dendrogram node size to every node", () => {
    const result = render("Dendrogram", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
      markGroups: [{
        id: "dendrogram-nodes",
        chartId: "Dendrogram",
        role: "node",
        memberKeys: [],
        sharedConfig: { size: 18 },
      }],
    });
    const radii = Array.from(result.content.matchAll(/<circle r="([^"]+)"/g), (match) => Number(match[1]));
    expect(radii.length).toBeGreaterThan(0);
    expect(new Set(radii)).toEqual(new Set([18]));
  });

  it("reports dendrogram selection bounds from rendered node and label extents", () => {
    const result = render("Dendrogram", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
      markGroups: [{
        id: "dendrogram-selection-bounds",
        chartId: "Dendrogram",
        role: "node",
        memberKeys: [],
        sharedConfig: { size: 18 },
      }],
    });
    const selectionBounds = (result as { selectionBounds?: { x: number; y: number; width: number; height: number } }).selectionBounds;
    expect(selectionBounds).toBeDefined();
    expect(selectionBounds!.width).toBeGreaterThan(0);
    expect(selectionBounds!.height).toBeGreaterThan(0);
    expect(selectionBounds!.x).not.toBe(result.plotArea!.x);
    expect(selectionBounds!.y).not.toBe(result.plotArea!.y);
  });

  it("reports force-directed selection bounds from rendered nodes and labels", () => {
    const graphDataset: Dataset = {
      id: "network-selection",
      name: "network-selection.csv",
      columns: [],
      rows: [],
      graph: {
        nodes: {
          columns: [{ name: "id", type: "nominal" }, { name: "label", type: "nominal" }],
          rows: [{ id: "A", label: "A very long network label" }, { id: "B", label: "B" }],
        },
        edges: {
          columns: [{ name: "source", type: "nominal" }, { name: "target", type: "nominal" }],
          rows: [{ source: "A", target: "B" }],
        },
      },
    };
    const result = render("ForceDirectedGraph", graphDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
      },
    });
    const selectionBounds = (result as { selectionBounds?: { x: number; y: number; width: number; height: number } }).selectionBounds;
    expect(selectionBounds).toBeDefined();
    expect(selectionBounds!.width).toBeGreaterThan(0);
    expect(selectionBounds!.height).toBeGreaterThan(0);
    expect(selectionBounds).not.toEqual({
      x: result.plotArea!.x,
      y: result.plotArea!.y,
      width: result.plotArea!.width,
      height: result.plotArea!.height,
    });
  });

  it("centers treemap labels and clips them to their tiles", () => {
    const result = render("Treemap", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    });

    const labels = Array.from(result.content.matchAll(/<text data-mark-role="node-label"([^>]*)>/g), (match) => match[1] ?? "");
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((attributes) => {
      expect(attributes).toContain('text-anchor="middle"');
      expect(attributes).toContain('dominant-baseline="middle"');
      expect(attributes).toMatch(/font-size="(?:[5-9](?:\.\d+)?|10)"/);
      expect(attributes).toMatch(/clip-path="url\(#treemap-/);
    });
    expect(result.content).toMatch(/<tspan x="[^"]+" y="[^"]+"[^>]*>/);
  });

  it.each([
    ["right", "y", "x", 1],
    ["left", "y", "x", -1],
    ["down", "x", "y", 1],
    ["up", "x", "y", -1],
  ] as const)("renders a %s-growing Cartesian tree on the %s leaf axis", (direction, leafAxis, depthCoordinate, sign) => {
    const result = render("Dendrogram", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        category: { field: "id", type: "nominal" },
      },
      markGroups: [{
        id: "tree-nodes",
        chartId: "Dendrogram",
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection: direction },
      }],
    });
    const position = (key: string) => {
      const match = result.content.match(new RegExp(`transform="translate\\(([-0-9.]+) ([-0-9.]+)\\)"[^>]+data-node-key="${key}"`));
      expect(match).not.toBeNull();
      return { x: Number(match?.[1]), y: Number(match?.[2]) };
    };
    const root = position("root");
    const leaf = position("a1");

    expect(result.content).toContain(`data-tree-direction="${direction}"`);
    expect(result.content).toContain(`data-leaf-axis="${leafAxis}"`);
    expect(result.scales?.[leafAxis].type).toBe("point");
    expect(Math.sign(leaf[depthCoordinate] - root[depthCoordinate])).toBe(sign);
  });

  it.each(["Icicle", "Treemap"])("applies the four-way tree direction to %s", (chartType) => {
    const directions = ["right", "left", "down", "up"] as const;
    const outputs = directions.map((treeDirection) => render(chartType, hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
      markGroups: [{
        id: "hierarchy-nodes",
        chartId: chartType,
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection },
      }],
    }).content);

    directions.forEach((treeDirection, index) => {
      expect(outputs[index]).toContain(`data-tree-direction="${treeDirection}"`);
    });
    expect(new Set(outputs).size).toBe(directions.length);
  });

  it("keeps Icicle nodes inside the plot when growing upward", () => {
    const result = render("Icicle", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
      markGroups: [{
        id: "hierarchy-nodes",
        chartId: "Icicle",
        role: "node",
        memberKeys: [],
        sharedConfig: { treeDirection: "up" },
      }],
    });
    const position = (key: string) => {
      const match = result.content.match(new RegExp(`transform="translate\\(([-0-9.]+) ([-0-9.]+)\\)"[^>]+data-node-key="${key}"`));
      expect(match).not.toBeNull();
      return { x: Number(match?.[1]), y: Number(match?.[2]) };
    };
    expect(position("root").y).toBeGreaterThan(position("a1").y);
    expect(result.content).toContain('data-tree-direction="up"');
  });

  it("renders equal-width radial bars from Segment and R with a default inner radius", () => {
    const dendrogram = render("RadialDendrogram", radialHierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        theta: { field: "leaf", type: "nominal" },
      },
    });
    const bars = render("RadialBarChart", radialHierarchyDataset, {
      encodings: {
        segment: { field: "leaf", type: "nominal" },
        radius: { field: "value", type: "quantitative" },
        color: { field: "group", type: "nominal" },
      },
    });

    expect(dendrogram.content).toContain('data-chart-type="radial-dendrogram"');
    expect(dendrogram.content).toContain('data-renderer="observable-radial-cluster@3"');
    expect(dendrogram.content).toContain('fill="#555"');
    expect(dendrogram.content).toContain('fill="#999"');
    expect(dendrogram.content.match(/data-mark-role="node"/g)).toHaveLength(5);
    expect(bars.content).toContain('data-chart-type="radial-bar"');
    expect(bars.content).toContain('data-theta-mode="static"');
    expect(bars.content.match(/data-mark-role="bar"/g)).toHaveLength(3);
    expect(bars.content.match(/data-theta-value="1"/g)).toHaveLength(3);
    ["a1", "a2", "b"].forEach((leaf) => {
      expect(bars.content).toContain(`data-category-key="${leaf}"`);
    });
    expect(dendrogram.polarArea?.angleSpan).toBe(360);
    expect(bars.polarArea?.angleSpan).toBe(360);
    expect(bars.polarArea?.innerRadius).toBeGreaterThan(0);

    const mappedTheta = render("RadialBarChart", radialHierarchyDataset, {
      encodings: {
        theta: { field: "value", type: "quantitative" },
        segment: { field: "leaf", type: "nominal" },
        radius: { field: "value", type: "quantitative" },
      },
    });
    expect(mappedTheta.content).toContain('data-theta-mode="mapped"');
    expect(mappedTheta.content).toContain('data-theta-value="3"');
  });

  it("fits a radial dendrogram to the polar angle span and configured leaf radius", () => {
    const dendrogram = render("RadialDendrogram", radialHierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        theta: { field: "leaf", type: "nominal" },
      },
      markGroups: [{
        id: "mark-group:radial:node",
        chartId: "radial",
        role: "node",
        memberKeys: [],
        sharedConfig: { leafRadius: 54 },
      }],
    }, {
      type: "Polar",
      origin: { x: 160, y: 90 },
      angleSpan: 120,
    });

    expect(dendrogram.content).toContain('data-angle-span="120"');
    expect(dendrogram.content).toContain('data-leaf-radius="54"');
    expect(dendrogram.content).toContain('data-selection-radius="62"');
    expect(dendrogram.polarArea).toMatchObject({ angleSpan: 120, outerRadius: 54 });
  });

  it("routes tree and network links around embedded child selection boxes", () => {
    const frame: NestedChildFrame = {
      parentDataKey: JSON.stringify({ rowKey: "3", role: "node" }),
      parentMarkGroupId: "mark-group:Dendrogram:node",
      width: 80,
      height: 40,
    };
    const plainTree = render("Dendrogram", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    });
    const nestedTree = render("Dendrogram", hierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    }, undefined, [frame]);
    expect(nestedTree.content).not.toBe(plainTree.content);
    const plainRadial = render("RadialDendrogram", radialHierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        theta: { field: "leaf", type: "nominal" },
      },
    });
    const nestedRadial = render("RadialDendrogram", radialHierarchyDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        parent: { field: "parent", type: "nominal" },
        theta: { field: "leaf", type: "nominal" },
      },
    }, polar, [{
      parentDataKey: JSON.stringify({ rowKey: "2", role: "node" }),
      parentMarkGroupId: "mark-group:RadialDendrogram:node",
      width: 64,
      height: 44,
    }]);
    expect(nestedRadial.content).not.toBe(plainRadial.content);

    const graphDataset: Dataset = {
      id: "network-nested",
      name: "network-nested.csv",
      columns: [],
      rows: [],
      graph: {
        nodes: { columns: [{ name: "id", type: "nominal" }], rows: [{ id: "A" }, { id: "B" }] },
        edges: { columns: [{ name: "source", type: "nominal" }, { name: "target", type: "nominal" }], rows: [{ source: "A", target: "B" }] },
      },
    };
    const plainNetwork = render("ForceDirectedGraph", graphDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
      },
    });
    const nestedNetwork = render("ForceDirectedGraph", graphDataset, {
      encodings: {
        key: { field: "id", type: "nominal" },
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
      },
    }, undefined, [
      { parentDataKey: JSON.stringify({ rowKey: "0", role: "node" }), parentMarkGroupId: "mark-group:ForceDirectedGraph:node", width: 50, height: 30 },
    ]);
    expect(nestedNetwork.content).not.toBe(plainNetwork.content);
  });

  it("renders calendar and box plot marks", () => {
    const calendar = render("Calendar", seriesDataset, {
      encodings: { date: { field: "date", type: "temporal" }, value: { field: "a", type: "quantitative" } },
    });
    const boxplot = render("Boxplot", seriesDataset, {
      encodings: { x: { field: "a", type: "quantitative" }, y: { field: "b", type: "quantitative" } },
    });
    expect(calendar.content).toContain('data-chart-type="calendar"');
    expect(calendar.content).toContain('data-mark-role="cell"');
    expect(calendar.content).toContain('data-week-start="monday"');
    expect(calendar.content).toContain('data-weekends="excluded"');
    expect(calendar.content).toContain('data-mark-role="month-boundaries"');
    expect(boxplot.content).toContain('data-binning="continuous"');
    expect(boxplot.content).toContain('data-mark-role="box"');
  });

  it("renders contour paths and aggregated hexagons", () => {
    const contour = render("Contour", contourDataset, { encodings: {
      x: { field: "x", type: "quantitative" },
      y: { field: "y", type: "quantitative" },
      value: { field: "z", type: "quantitative" },
    } });
    const hexbin = render("Hexbin", seriesDataset, { encodings: {
      x: { field: "a", type: "quantitative" },
      y: { field: "c", type: "quantitative" },
    } });
    expect(contour.content).toContain('data-mark-role="contour"');
    expect(contour.content).toContain('data-color-scale="sequential-log-magma"');
    expect(contour.content).toContain('data-renderer="observable-contours@2"');
    expect(contour.content).toContain("clip-path=");
    expect(contour.content).toContain('stroke="#fff"');
    expect(hexbin.content).toContain('data-mark-role="hexagon"');
    expect(hexbin.content).toContain("data-count=");
    expect(hexbin.content).toContain('data-scale="log-log"');
    expect(hexbin.content).toContain('data-renderer="observable-hexbin@2"');
    expect(hexbin.scales?.x.type).toBe("log");
  });

  it("rejects sparse contour input instead of filling missing grid cells", () => {
    const sparse = {
      ...contourDataset,
      rows: contourDataset.rows.slice(1),
    };
    expect(() => render("Contour", sparse, { encodings: {
      x: { field: "x", type: "quantitative" },
      y: { field: "y", type: "quantitative" },
      value: { field: "z", type: "quantitative" },
    } })).toThrow("complete rectangular X/Y value grid");
  });

  it.each(["Chord", "Sankey"])("renders %s links and nodes", (chartType) => {
    const result = render(chartType, flowDataset, {
      encodings: {
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    });
    expect(result.content).toContain('data-mark-role="link"');
    expect(result.content).toContain('data-mark-role="node"');
    if (chartType === "Chord") {
      expect(result.content).toContain('data-mark-role="group-ticks"');
      expect(result.content).toContain('data-ribbon-color="target"');
    } else {
      expect(result.content).toContain("linearGradient");
      expect(result.content).toContain('data-node-align="justify"');
    }
  });
});
