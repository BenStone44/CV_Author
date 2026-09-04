import { describe, expect, it } from "vitest";
import { hasRequiredChartEncodings } from "../utils/chartTemplates";
import {
  DEFAULT_CHART_DATASET_ID,
  DEFAULT_HEXBIN_DATASET_ID,
  DEFAULT_CHORD_DATASET_ID,
  createDefaultChartSpec,
  defaultChartDataset,
  defaultDatasetForChartType,
  defaultHexbinDataset,
  defaultChordDataset,
  renderDefaultChartSvg,
} from "../utils/defaultChartData";

const chartTypes = [
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
  "Hexbin",
  "PieChart",
  "DonutChart",
  "RadialBarChart",
  "Chord",
] as const;

describe("built-in default chart data", () => {
  it("uses the Observable Chord diagram matrix as a standard graph dataset", () => {
    expect(defaultChordDataset.id).toBe(DEFAULT_CHORD_DATASET_ID);
    expect(defaultChordDataset.graph?.nodes.rows).toHaveLength(4);
    expect(defaultChordDataset.graph?.edges.rows).toHaveLength(16);
    expect(createDefaultChartSpec("Chord")).toMatchObject({
      datasetId: DEFAULT_CHORD_DATASET_ID,
      encodings: {
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    });
    const svg = renderDefaultChartSvg("Chord") ?? "";
    expect(svg).toContain(`data-default-dataset-id="${DEFAULT_CHORD_DATASET_ID}"`);
    expect(svg).toContain('data-renderer="observable-chord@2"');
    expect(svg).toContain("black");
    expect(svg).not.toContain("<image");
  });

  it("provides a monthly value series for every case2 station", async () => {
    const { case2GraphDataset } = await import("../utils/defaultChartData");
    const nodes = case2GraphDataset.graph!.nodes;
    expect(nodes.columns).toContainEqual({ name: "month", type: "ordinal" });
    expect(nodes.columns).toContainEqual({ name: "value", type: "quantitative" });
    expect(nodes.rows).toHaveLength(120);
    expect(new Set(nodes.rows.map((row) => row.id)).size).toBe(10);
    expect(nodes.rows.every((row) => Number(row.month) >= 1 && Number(row.month) <= 12)).toBe(true);
    expect(nodes.rows.every((row) => Number(row.value) >= 0 && Number(row.value) <= 100)).toBe(true);
    expect(Array.from(new Set(nodes.rows.map((row) => `${row.id}:${row.month}`)))).toHaveLength(120);
  });

  it("provides 10 horizontal values and 5 series with stable row identities", () => {
    expect(defaultChartDataset.id).toBe(DEFAULT_CHART_DATASET_ID);
    expect(defaultChartDataset.rows).toHaveLength(50);
    expect(defaultChartDataset.primaryKey).toEqual(["column", "group"]);
    expect(new Set(defaultChartDataset.rows.map((row) => row.group)).size).toBe(5);
    expect(new Set(defaultChartDataset.rows.map((row) => row.column)).size).toBe(10);
    expect(new Set(defaultChartDataset.rows.map((row) => `${row.column}:${row.group}`)).size).toBe(50);
  });

  it.each(["StackedBarChart", "MultiLineChart"])("binds all 5 groups as series for %s", (chartType) => {
    const spec = createDefaultChartSpec(chartType);
    expect(spec?.series).toEqual({ field: "group", type: "nominal" });
    expect(spec?.seriesFields).toEqual([{ field: "group", type: "nominal" }]);
  });

  it("binds ordinal, nominal, and numeric dimensions for the parallel coordinates template", () => {
    expect(createDefaultChartSpec("ParallelCoordinatesPlot")).toMatchObject({
      encodings: { color: { field: "group", type: "nominal" } },
      parallelFields: [
        { field: "column", type: "ordinal" },
        { field: "group", type: "nominal" },
        { field: "value", type: "quantitative" },
        { field: "change", type: "quantitative" },
        { field: "magnitude", type: "quantitative" },
      ],
    });
  });

  it("renders parallel coordinates from every default row", () => {
    const svg = renderDefaultChartSvg("ParallelCoordinatesPlot") ?? "";

    expect(svg.match(/data-mark-role="parallel-axis"/g)).toHaveLength(5);
    expect(svg.match(/data-mark-role="path"/g)).toHaveLength(defaultChartDataset.rows.length);
    expect(svg.match(/data-axis-scale="point"/g)).toHaveLength(2);
    expect(svg).toContain('data-default-dataset-id="builtin:default-cartesian-data"');
    expect(svg).not.toContain("<image");
  });

  it("renders 5 groups for stacked bars and multi-line charts", () => {
    const stacked = renderDefaultChartSvg("StackedBarChart") ?? "";
    const multiLine = renderDefaultChartSvg("MultiLineChart") ?? "";
    const seriesKeys = (svg: string) => new Set(
      Array.from(svg.matchAll(/data-series-key="([^"]+)"/g), (match) => match[1]),
    );

    expect(stacked.match(/data-mark-role="bar"/g)).toHaveLength(50);
    expect(seriesKeys(stacked)).toHaveLength(5);
    expect(multiLine.match(/data-mark-role="line"/g)).toHaveLength(5);
    expect(seriesKeys(multiLine)).toHaveLength(5);
    expect(multiLine.match(/data-point-count="10"/g)).toHaveLength(5);
  });

  it.each(chartTypes)("provides complete bindings for %s", (chartType) => {
    const spec = createDefaultChartSpec(chartType);
    expect(spec?.datasetId).toBe(defaultDatasetForChartType(chartType).id);
    expect(spec && hasRequiredChartEncodings(spec)).toBe(true);
  });

  it.each(chartTypes)("renders the %s template SVG from its default data", (chartType) => {
    const svg = renderDefaultChartSvg(chartType);
    expect(svg).toContain(`data-default-dataset-id="${defaultDatasetForChartType(chartType).id}"`);
    expect(svg).toContain("data-renderer=");
    expect(svg).not.toContain("<image");
  });

  it.each(["AreaChart", "StackedAreaChart", "Streamgraph", "HorizonChart"])("uses a 2:1 default preview for %s", (chartType) => {
    expect(renderDefaultChartSvg(chartType)).toContain('viewBox="0 0 320 160"');
  });

  it("uses the complete downloaded D3 diamonds table as Hexbin default data", () => {
    expect(defaultHexbinDataset.id).toBe(DEFAULT_HEXBIN_DATASET_ID);
    expect(defaultHexbinDataset.rows).toHaveLength(53_940);
    expect(defaultHexbinDataset.columns).toEqual([
      { name: "carat", type: "quantitative" },
      { name: "price", type: "quantitative" },
    ]);
    expect(createDefaultChartSpec("Hexbin")).toMatchObject({
      datasetId: DEFAULT_HEXBIN_DATASET_ID,
      encodings: {
        x: { field: "carat", type: "quantitative" },
        y: { field: "price", type: "quantitative" },
      },
    });
    const svg = renderDefaultChartSvg("Hexbin");
    expect(svg).toContain(`data-default-dataset-id="${DEFAULT_HEXBIN_DATASET_ID}"`);
    expect(svg).toContain('data-source-row-count="53940"');
    expect(svg).not.toContain("<image");
  });

  it("maps quantitative Matrix cell values to distinct default colors", () => {
    const svg = renderDefaultChartSvg("MatrixDiagram");
    const fills = Array.from(svg?.matchAll(/<rect[^>]*data-mark-role="cell"[^>]*fill="([^"]+)"/g) ?? [])
      .map((match) => match[1]);
    expect(new Set(fills).size).toBeGreaterThan(1);
  });

  it.each(["PieChart", "DonutChart"])("uses the shared categorical field with static Theta for %s", (chartType) => {
    const spec = createDefaultChartSpec(chartType);
    expect(spec).toMatchObject({
      encodings: {
        segment: { field: "column", type: "ordinal" },
      },
      dataTransforms: [{ field: "group", values: ["Alpha"] }],
    });
    expect(spec?.encodings.theta).toBeUndefined();
  });

  it("binds the shared categorical and value fields to radial bar axes", () => {
    const spec = createDefaultChartSpec("RadialBarChart");
    expect(spec).toMatchObject({
      encodings: {
        segment: { field: "column", type: "ordinal" },
        radius: { field: "value", type: "quantitative" },
      },
      dataTransforms: [{ field: "group", values: ["Alpha"] }],
    });
    expect(spec?.encodings.theta).toBeUndefined();
  });

  it("binds the default Dendrogram leaf order to a Cartesian dimension", () => {
    const spec = createDefaultChartSpec("Dendrogram");
    expect(spec).toMatchObject({
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        category: { field: "label", type: "nominal" },
      },
    });
    expect(renderDefaultChartSvg("Dendrogram")).toContain('data-leaf-axis="y"');
  });
});
