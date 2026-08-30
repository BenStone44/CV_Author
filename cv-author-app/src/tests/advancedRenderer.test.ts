import { describe, expect, it } from "vitest";
import { advancedTemplateDefinitions } from "../utils/advancedChartCards";
import { getChartTemplateContract, normalizeChartTemplate } from "../utils/chartTemplates";
import { getEncodingChannelConfigs } from "../utils/encodingConfig";
import { renderDeterministicChart } from "../utils/semanticRenderer";
import { prepareChartData } from "../utils/chartDataPipeline";
import type { ChartSpec, CoordinateGuide, Dataset } from "../types";

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
    expect(radialCluster?.svgMarkup).toContain('data-renderer="observable-radial-cluster@3"');
    expect(radialCluster?.svgMarkup).toContain('data-leaf-radius="68"');
    expect(radialCluster?.svgMarkup).toContain('data-selection-radius="76"');
    expect(radialCluster?.svgMarkup).toContain('stroke-opacity="0.4"');
    expect(radialCluster?.svgMarkup).toContain('fill="#555"');
    expect(radialCluster?.svgMarkup).toContain('fill="#999"');
  });

  it("keeps semantic encoding channels for every new card family", () => {
    const channels = (chartType: string) => getEncodingChannelConfigs(chartType).map((config) => config.channel);
    expect(channels("AreaChart")).toEqual(["x", "y", "color"]);
    expect(channels("ParallelCoordinatesPlot")).toEqual(["dimensions", "color"]);
    expect(channels("Sunburst")).toEqual(["key", "parent", "value", "color"]);
    expect(channels("RadialDendrogram")).toEqual(["key", "parent", "theta"]);
    expect(channels("RadialBarChart")).toEqual(["theta", "segment", "radius", "color"]);
    expect(channels("Calendar")).toEqual(["date", "value", "color"]);
    expect(channels("Boxplot")).toEqual(["x", "y", "color"]);
    expect(channels("Contour")).toEqual(["x", "y", "color"]);
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
