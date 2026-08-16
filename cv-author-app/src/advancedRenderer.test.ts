import { describe, expect, it } from "vitest";
import { advancedTemplateDefinitions } from "./advancedChartCards";
import { getChartTemplateContract, normalizeChartTemplate } from "./chartTemplates";
import { getEncodingChannelConfigs } from "./encodingConfig";
import { renderDeterministicChart } from "./semanticRenderer";
import type { ChartSpec, CoordinateGuide, Dataset } from "./types";

const cartesian: CoordinateGuide = {
  type: "Cartesian",
  origin: { x: 30, y: 270 },
  xDirection: 1,
  yDirection: -1,
};

function render(chartType: string, dataset: Dataset, chartSpec: Omit<ChartSpec, "chartType" | "datasetId">) {
  return renderDeterministicChart({
    chartId: chartType,
    width: 500,
    height: 300,
    minX: 0,
    minY: 0,
    coordinateGuide: getChartTemplateContract(chartType)?.coordinateSystem === "Cartesian" ? cartesian : null,
    chartSpec: { chartType, datasetId: dataset.id, ...chartSpec },
    dataset,
  });
}

const seriesDataset: Dataset = {
  id: "series",
  name: "series.csv",
  columns: [
    { name: "date", type: "temporal" },
    { name: "series", type: "nominal" },
    { name: "value", type: "quantitative" },
    { name: "a", type: "quantitative" },
    { name: "b", type: "quantitative" },
    { name: "c", type: "quantitative" },
  ],
  rows: Array.from({ length: 24 }, (_, index) => ({
    date: `2026-01-${String(index % 12 + 1).padStart(2, "0")}`,
    series: index % 2 ? "B" : "A",
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
    expect(advancedTemplateDefinitions).toHaveLength(15);
    expect(advancedTemplateDefinitions.map((card) => card.name)).toEqual([
      "Area Chart", "Stacked Area", "Streamgraph", "Horizon Chart",
      "Parallel Coordinates", "Icicle", "Sunburst", "Treemap", "Dendrogram",
      "Calendar", "Box Plot", "Contour", "Hexbin", "Chord", "Sankey",
    ]);
    advancedTemplateDefinitions.forEach((card) => {
      expect(normalizeChartTemplate(card.chartType)).not.toBeNull();
      expect(getChartTemplateContract(card.chartType)?.channels.length).toBeGreaterThan(0);
      expect(card.svgMarkup).toContain("<svg");
    });
  });

  it("keeps semantic encoding channels for every new card family", () => {
    const channels = (chartType: string) => getEncodingChannelConfigs(chartType).map((config) => config.channel);
    expect(channels("AreaChart")).toEqual(["x", "y", "color"]);
    expect(channels("ParallelCoordinatesPlot")).toEqual(["dimensions", "color"]);
    expect(channels("Sunburst")).toEqual(["key", "parent", "value", "color"]);
    expect(channels("Calendar")).toEqual(["date", "value", "color"]);
    expect(channels("Boxplot")).toEqual(["x", "y", "color"]);
    expect(channels("Contour")).toEqual(["x", "y", "value", "color"]);
    expect(channels("Hexbin")).toEqual(["x", "y", "color", "size"]);
    expect(channels("Sankey")).toEqual(["source", "target", "value", "color"]);
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
    if (chartType === "HorizonChart") {
      expect(result.content).toContain('data-bands="7"');
      expect(result.content).toContain('data-mark-role="horizon-axis"');
    } else {
      expect(result.scales?.x.type).toBe("utc");
    }
  });

  it("uses the gallery streamgraph offset and ordering", () => {
    const result = render("Streamgraph", seriesDataset, {
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "a", type: "quantitative" },
        color: { field: "series", type: "nominal" },
      },
    });
    expect(result.content).toContain('data-stack-offset="wiggle"');
    expect(result.content).toContain('data-stack-order="inside-out"');
  });

  it("renders parallel coordinates from multiple numeric dimensions", () => {
    const result = render("ParallelCoordinatesPlot", seriesDataset, {
      encodings: { color: { field: "series", type: "nominal" } },
      parallelFields: ["a", "b", "c"].map((field) => ({ field, type: "quantitative" as const })),
    });
    expect(result.content.match(/data-mark-role="parallel-axis"/g)).toHaveLength(3);
    expect(result.content.match(/data-mark-role="path"/g)).toHaveLength(seriesDataset.rows.length);
    expect(result.content).toContain('data-axis-orientation="horizontal"');
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
    expect(contour.content).toContain('stroke="#fff"');
    expect(hexbin.content).toContain('data-mark-role="hexagon"');
    expect(hexbin.content).toContain("data-count=");
    expect(hexbin.content).toContain('data-scale="log-log"');
    expect(hexbin.scales?.x.type).toBe("log");
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
