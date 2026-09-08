import { describe, expect, it } from "vitest";
import {
  CSV_MEASURE_ID_FIELD,
  materializeCsvValueSeries,
  materializeGraphDataset,
  prepareChartData,
} from "../utils/chartDataPipeline";
import { hasRequiredChartEncodings } from "../utils/chartTemplates";
import { renderDeterministicChart } from "../utils/semanticRenderer";
import {
  DEFAULT_CHART_DATASET_ID,
  DEFAULT_HEXBIN_DATASET_ID,
  DEFAULT_CHORD_DATASET_ID,
  createDefaultChartSpec,
  defaultChartDataset,
  defaultDatasetForChartType,
  defaultHexbinDataset,
  defaultChordDataset,
  chordPolarLineDataset,
  defaultTreeDataset,
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
  it("keeps dense weekly graph-node observations for the Circular Stacked Bar Facet case", () => {
    const nodes = chordPolarLineDataset.graph!.nodes;
    const nodeIds = Array.from(new Set(nodes.rows.map((row) => row.node_id)));
    expect(nodeIds).toEqual(["North", "Northeast", "Central", "East", "South", "West"]);
    expect(nodes.rows).toHaveLength(936);
    nodeIds.forEach((nodeId) => {
      const observations = nodes.rows.filter((row) => row.node_id === nodeId);
      expect(observations).toHaveLength(156);
      expect(new Set(observations.map((row) => row.week)).size).toBe(52);
      expect(new Set(observations.map((row) => row.energy_source))).toEqual(
        new Set(["Solar", "Wind", "Hydro"]),
      );
      Array.from(new Set(observations.map((row) => row.week))).forEach((week) => {
        expect(observations.filter((row) => row.week === week)).toHaveLength(3);
      });
    });
  });

  it("provides twelve monthly stacked-bar observations for every tree node", () => {
    const metricFields = ["metric_1", "metric_2", "metric_3", "metric_4", "metric_5"];
    const nodeIds = Array.from(new Set(defaultTreeDataset.rows.map((row) => row.node_id)));
    expect(defaultTreeDataset.columns).toContainEqual({ name: "month", type: "ordinal" });
    expect(defaultTreeDataset.primaryKey).toEqual(["node_id", "month"]);
    expect(nodeIds).toHaveLength(15);
    expect(defaultTreeDataset.rows).toHaveLength(180);
    nodeIds.forEach((nodeId) => {
      const rows = defaultTreeDataset.rows.filter((row) => row.node_id === nodeId);
      expect(rows.map((row) => row.month)).toEqual([
        "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
        "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
      ]);
      expect(rows.every((row) => metricFields.every((field) => Number(row[field]) > 0))).toBe(true);
      metricFields.forEach((field) => {
        const values = rows.map((row) => Number(row[field]));
        expect(Math.max(...values) / Math.min(...values)).toBeGreaterThanOrEqual(2);
      });
      expect(rows.every((row) => {
        const values = metricFields.map((field) => Number(row[field]));
        return Math.max(...values) / Math.min(...values) >= 3;
      })).toBe(true);
    });
    expect(renderDefaultChartSvg("Dendrogram")?.match(/data-mark-role="node"/g)).toHaveLength(15);
    expect(renderDefaultChartSvg("RadialDendrogram")?.match(/data-mark-role="node"/g)).toHaveLength(15);

    const nestedBarSpec = {
      chartType: "StackedBarChart",
      datasetId: defaultTreeDataset.id,
      encodings: { x: { field: "month", type: "ordinal" as const } },
      valueFields: metricFields.map((field) => ({ field, type: "quantitative" as const })),
      filters: { node_id: "north_a" },
    };
    const prepared = prepareChartData("tree-node-stacked-bar", defaultTreeDataset, nestedBarSpec);
    expect(prepared.dataset.rows).toHaveLength(60);
    const rendered = renderDeterministicChart({
      chartId: "tree-node-stacked-bar",
      width: 360,
      height: 220,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 220 }, xDirection: 1, yDirection: -1 },
      chartSpec: prepared.chartSpec,
      dataset: prepared.dataset,
    });
    expect(rendered.content.match(/data-mark-role="bar"/g)).toHaveLength(60);
    expect(new Set(prepared.dataset.rows.map((row) => row[CSV_MEASURE_ID_FIELD]))).toEqual(new Set(metricFields));
  });

  it("uses the Observable Chord diagram matrix as a standard graph dataset", () => {
    expect(defaultChordDataset.id).toBe(DEFAULT_CHORD_DATASET_ID);
    expect(defaultChordDataset.graph?.nodes.rows).toHaveLength(4);
    expect(defaultChordDataset.graph?.edges.rows).toHaveLength(16);
    expect(createDefaultChartSpec("Chord")).toMatchObject({
      datasetId: DEFAULT_CHORD_DATASET_ID,
      axes: {
        theta: { visible: false, labelsVisible: false },
        radius: { visible: false, labelsVisible: false },
      },
      encodings: {
        key: { field: "id", type: "nominal" },
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    });
    const svg = renderDefaultChartSvg("Chord") ?? "";
    expect(svg).toContain(`data-default-dataset-id="${DEFAULT_CHORD_DATASET_ID}"`);
    expect(svg).toContain('data-renderer="observable-chord@3"');
    expect(svg).toContain("black");
    expect(svg).not.toContain("<image");
  });

  it("provides five natural monthly mobility metrics for every geo point", async () => {
    const { case2GraphDataset } = await import("../utils/defaultChartData");
    const nodes = case2GraphDataset.graph!.nodes;
    const metricFields = [
      "pedestrian_trips",
      "bicycle_trips",
      "transit_rides",
      "vehicle_trips",
      "delivery_trips",
    ];
    expect(nodes.columns).toContainEqual({ name: "month", type: "ordinal" });
    expect(nodes.columns.filter((column) => metricFields.includes(column.name))).toEqual(
      metricFields.map((name) => ({ name, type: "quantitative" })),
    );
    expect(nodes.rows).toHaveLength(120);
    expect(new Set(nodes.rows.map((row) => row.id)).size).toBe(10);
    expect(nodes.rows.every((row) => Number(row.month) >= 1 && Number(row.month) <= 12)).toBe(true);
    expect(nodes.rows.every((row) => metricFields.every((field) => Number(row[field]) > 0))).toBe(true);
    expect(Array.from(new Set(nodes.rows.map((row) => `${row.id}:${row.month}`)))).toHaveLength(120);

    const chartSpec = {
      chartType: "StackedBarChart",
      datasetId: case2GraphDataset.id,
      encodings: { x: { field: "month", type: "ordinal" } },
      valueFields: metricFields.map((field) => ({ field, type: "quantitative" as const })),
    } as const;
    const materialized = materializeCsvValueSeries(
      materializeGraphDataset(case2GraphDataset, chartSpec),
      chartSpec,
    );
    expect(materialized.dataset.rows).toHaveLength(600);
    expect(materialized.dataset.graph).toBeUndefined();
    expect(new Set(materialized.dataset.rows.map((row) => row[CSV_MEASURE_ID_FIELD]))).toEqual(new Set(metricFields));

    const prepared = prepareChartData("geo-stacked-bar", case2GraphDataset, chartSpec);
    const rendered = renderDeterministicChart({
      chartId: "geo-stacked-bar",
      width: 360,
      height: 220,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 220 }, xDirection: 1, yDirection: -1 },
      chartSpec: prepared.chartSpec,
      dataset: prepared.dataset,
    });
    expect(rendered.content.match(/data-mark-role="bar"/g)).toHaveLength(60);
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
