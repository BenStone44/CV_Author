import { describe, expect, it } from "vitest";
import { deterministicChartPipelines, renderDeterministicChart, renderLayerChart, renderNestedPie } from "../utils/semanticRenderer";
import type { ChartSpec, Dataset } from "../types";

const dataset: Dataset = {
  id: "case1", name: "case1.csv",
  columns: [
    { name: "person", type: "nominal" }, { name: "time", type: "temporal" },
    { name: "weight_kg", type: "quantitative" }, { name: "water_kg", type: "quantitative" },
    { name: "fat_kg", type: "quantitative" }, { name: "muscle_kg", type: "quantitative" }, { name: "minerals_kg", type: "quantitative" },
  ],
  rows: Array.from({ length: 40 }, (_, index) => ({ person: `P${index % 5}`, time: `2025-${String(index % 8 + 1).padStart(2, "0")}-01`, weight_kg: "80", water_kg: "40", fat_kg: "15", muscle_kg: "20", minerals_kg: "5" })),
  primaryKey: ["person", "time"],
};

const lineSpec: ChartSpec = {
  chartType: "LineGraph", datasetId: dataset.id,
  encodings: { x: { field: "time", type: "temporal" }, y: { field: "weight_kg", type: "quantitative" } },
  series: { field: "person", type: "nominal" },
};

describe("semantic Case 1 renderers", () => {
  it("keeps one registered pipeline per supported chart template", () => {
    expect(Object.keys(deterministicChartPipelines).sort()).toEqual([
      "area", "bar", "boxplot", "calendar", "contour", "donut", "flow",
      "hexbin", "hierarchy", "line", "matrix", "parallel", "pie", "scatter",
    ]);
    expect(deterministicChartPipelines.bar.coordinateSystem).toBe("Cartesian");
    expect(deterministicChartPipelines.donut.coordinateSystem).toBe("Polar");
  });

  it("renders all Bar Chart variants through one Cartesian renderer", () => {
    const barDataset: Dataset = {
      id: "bars",
      name: "bars.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "series", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { category: "A", series: "One", value: "8" },
        { category: "A", series: "Two", value: "-3" },
        { category: "B", series: "One", value: "5" },
        { category: "B", series: "Two", value: "-6" },
      ],
      primaryKey: ["category", "series"],
    };
    const render = (chartType: string, color = true) => renderDeterministicChart({
      chartId: chartType,
      width: 500,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType,
        datasetId: barDataset.id,
        encodings: {
          x: { field: "category", type: "nominal" },
          y: { field: "value", type: "quantitative" },
          ...(color ? { color: { field: "series", type: "nominal" as const } } : {}),
        },
      },
      dataset: barDataset,
    });

    const single = render("SingleBarChart", false);
    const grouped = render("GroupedBarChart");
    const stacked = render("StackedBarChart");
    const divergent = render("DivergentBarChart", false);
    const divergentStacked = render("DivergentStackedBarChart");

    expect(single.content).toContain('data-bar-variant="single"');
    expect(single.content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    const categoryABars = Array.from(single.content.matchAll(
      /<rect[^>]*data-category-key="A"[^>]*x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g,
    ));
    expect(categoryABars).toHaveLength(2);
    expect(categoryABars[0]?.[1]).toBe(categoryABars[1]?.[1]);
    expect(categoryABars[0]?.[3]).toBe(categoryABars[1]?.[3]);
    const categoryAValues = categoryABars.map((match) => Number(match[0]?.match(/data-value="([^"]+)"/)?.[1] ?? "NaN"));
    const zeroPositions = categoryABars.map((match, index) => {
      const y = Number(match[2]);
      const height = Number(match[4]);
      return categoryAValues[index]! >= 0 ? y + height : y;
    });
    expect(zeroPositions[0]).toBeCloseTo(zeroPositions[1]!);
    expect(grouped.content).toContain('data-bar-variant="grouped"');
    expect(grouped.content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    expect(stacked.content).toContain('data-bar-variant="stacked"');
    expect(stacked.content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    expect(divergent.content).toContain('data-bar-variant="divergent"');
    expect(divergent.content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    expect(divergent.content).toContain('data-mark-role="zero-line"');
    expect(divergentStacked.content).toContain('data-bar-variant="divergent-stacked"');
    expect(divergentStacked.content).toContain('data-mark-role="zero-line"');
    expect(divergentStacked.content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    expect(grouped.scales?.x.type).toBe("point");
    expect(grouped.scales?.y.type).toBe("linear");
    expect(grouped.scales?.y.domain).toEqual(expect.arrayContaining([expect.any(Number)]));
  });

  it("uses every selected group item field for grouped and stacked identities", () => {
    const multiGroupDataset: Dataset = {
      id: "multi-group-bars",
      name: "multi-group-bars.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "channel", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { category: "A", region: "East", channel: "Online", value: "4" },
        { category: "A", region: "East", channel: "Store", value: "6" },
        { category: "A", region: "West", channel: "Online", value: "3" },
        { category: "A", region: "West", channel: "Store", value: "5" },
      ],
      primaryKey: ["category", "region", "channel"],
    };
    const render = (chartType: string) => renderDeterministicChart({
      chartId: chartType,
      width: 500,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType,
        datasetId: multiGroupDataset.id,
        encodings: {
          x: { field: "category", type: "nominal" },
          y: { field: "value", type: "quantitative" },
        },
        seriesFields: ["region", "channel"].map((field) => ({ field, type: "nominal" as const })),
      },
      dataset: multiGroupDataset,
    });
    expect(render("GroupedBarChart").content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    expect(render("StackedBarChart").content.match(/data-mark-role="bar"/g)).toHaveLength(4);
    expect(render("GroupedBarChart").content).toContain('data-series-key="East / Online"');
  });

  it("keeps every person-by-measure bar within one X category", () => {
    const wideRows = Array.from({ length: 5 }, (_, personIndex) =>
      ["weight", "water", "fat", "muscle"].map((measure, measureIndex) => ({
        person: `P${personIndex + 1}`,
        time: "2026-01-01",
        measure,
        value: String(personIndex + measureIndex + 1),
      }))).flat();
    const wideDataset: Dataset = {
      id: "wide-grouped-bars",
      name: "wide-grouped-bars.csv",
      columns: [
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "measure", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: wideRows,
      primaryKey: ["person", "time", "measure"],
    };
    const render = (chartType: string) => renderDeterministicChart({
      chartId: chartType,
      width: 600,
      height: 320,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 320 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType,
        datasetId: wideDataset.id,
        encodings: {
          x: { field: "time", type: "temporal" },
          y: { field: "value", type: "quantitative" },
        },
        seriesFields: [{ field: "measure", type: "nominal" }],
      },
      dataset: wideDataset,
    });

    expect(render("GroupedBarChart").content.match(/data-mark-role="bar"/g)).toHaveLength(20);
    expect(render("StackedBarChart").content.match(/data-mark-role="bar"/g)).toHaveLength(20);
  });

  it("applies Bar Chart color and size column mappings", () => {
    const barDataset: Dataset = {
      id: "mapped-bars",
      name: "mapped-bars.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "value", type: "quantitative" },
        { name: "color", type: "quantitative" },
        { name: "size", type: "quantitative" },
      ],
      rows: [
        { category: "A", value: "4", color: "0", size: "0" },
        { category: "B", value: "8", color: "100", size: "100" },
      ],
    };
    const result = renderDeterministicChart({
      chartId: "mapped-bars",
      width: 500,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType: "SingleBarChart",
        datasetId: barDataset.id,
        encodings: {
          x: { field: "category", type: "nominal" },
          y: { field: "value", type: "quantitative" },
          color: { field: "color", type: "quantitative" },
          size: { field: "size", type: "quantitative" },
        },
        markGroups: [{
          id: "mark-group:mapped-bars:bar",
          chartId: "mapped-bars",
          role: "bar",
          memberKeys: [],
          sharedConfig: {
            colorMapping: { type: "linear", stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
            sizeMapping: { type: "linear", stops: [{ offset: 0, size: 10 }, { offset: 1, size: 30 }] },
          },
        }],
      },
      dataset: barDataset,
    });

    expect(result.content).toContain('width="10"');
    expect(result.content).toContain('fill="#000000"');
    expect(result.content).toContain('width="30"');
    expect(result.content).toContain('fill="#ffffff"');
  });

  it("uses Matrix value for intensity and Color for categorical cell color", () => {
    const matrixDataset: Dataset = {
      id: "matrix-color",
      name: "matrix-color.csv",
      columns: [
        { name: "row", type: "nominal" },
        { name: "column", type: "nominal" },
        { name: "value", type: "quantitative" },
        { name: "group", type: "nominal" },
      ],
      rows: [
        { row: "R1", column: "C1", value: "10", group: "A" },
        { row: "R1", column: "C2", value: "20", group: "B" },
      ],
    };
    const result = renderDeterministicChart({
      chartId: "matrix-color",
      width: 320,
      height: 180,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 180 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType: "MatrixDiagram",
        datasetId: matrixDataset.id,
        encodings: {
          row: { field: "row", type: "nominal" },
          column: { field: "column", type: "nominal" },
          value: { field: "value", type: "quantitative" },
          color: { field: "group", type: "nominal" },
        },
      },
      dataset: matrixDataset,
    });

    expect(result.content).toContain('fill="#2563eb"');
    expect(result.content).toContain('fill="#dc2626"');
    expect(new Set(result.content.match(/fill-opacity="[^"]+"/g))).toHaveLength(2);
  });

  it("compresses polar marks into the configured angular span", () => {
    const chartSpec: ChartSpec = {
      chartType: "PieChart",
      datasetId: dataset.id,
      encodings: {
        angle: { field: "weight_kg", type: "quantitative" },
        color: { field: "person", type: "nominal" },
      },
    };
    const full = renderDeterministicChart({
      chartId: "full-pie",
      width: 320,
      height: 180,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 90 }, angleSpan: 360 },
      chartSpec,
      dataset,
    });
    const partial = renderDeterministicChart({
      chartId: "partial-pie",
      width: 320,
      height: 180,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 90 }, angleSpan: 270 },
      chartSpec,
      dataset,
    });

    expect(full.content.match(/data-mark-role="arc"/g)).toHaveLength(40);
    expect(partial.content.match(/data-mark-role="arc"/g)).toHaveLength(40);
    expect(partial.content).not.toBe(full.content.replaceAll("full-pie", "partial-pie"));
    expect(partial.polarArea).toMatchObject({
      startAngle: 0,
      angleSpan: 270,
      innerRadius: 0,
      outerRadius: partial.plotArea.width / 2,
    });

    const donut = renderDeterministicChart({
      chartId: "donut",
      width: 320,
      height: 180,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 90 }, angleSpan: 270 },
      chartSpec: { ...chartSpec, chartType: "DonutChart" },
      dataset,
    });
    expect(donut.polarArea?.innerRadius).toBeGreaterThan(0);
    expect(donut.polarArea?.outerRadius).toBe(donut.plotArea.width / 2);
  });

  it("renders scatter marks without duplicate axes", () => {
    const result = renderDeterministicChart({
      chartId: "point-group",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 },
      chartSpec: { ...lineSpec, chartType: "Scatterplot" },
      dataset,
    });
    expect(result.content.match(/data-mark-role="point"/g)).toHaveLength(40);
    expect(result.content).not.toContain('data-mark-role="x-axis"');
    expect(result.content).not.toContain('data-mark-role="y-axis"');
  });

  it("renders matrix cells with Cartesian scales after X/Y are configured", () => {
    const result = renderDeterministicChart({
      chartId: "matrix",
      width: 400,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType: "MatrixDiagram",
        datasetId: dataset.id,
        encodings: {
          x: { field: "time", type: "temporal" },
          y: { field: "person", type: "nominal" },
          column: { field: "time", type: "temporal" },
          row: { field: "person", type: "nominal" },
          value: { field: "weight_kg", type: "quantitative" },
        },
      },
      dataset,
    });
    expect(result.content.match(/data-mark-role="cell"/g)).toHaveLength(40);
    expect(result.content.match(/<rect data-chart-id=/g)).toHaveLength(40);
    expect(result.plotArea.width).toBeGreaterThan(0);
    expect(result.plotArea.height).toBeGreaterThan(0);
    expect(result.scales?.x.type).toBe("point");
    expect(result.scales?.y.type).toBe("point");
    expect(result.scales?.x.domain).toEqual(expect.arrayContaining(["2025-01-01"]));
    expect(result.scales?.y.domain).toEqual(expect.arrayContaining(["P0"]));

    const scaled = renderDeterministicChart({
      chartId: "scaled-matrix",
      width: 400,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 300 },
        xDirection: 1,
        yDirection: -1,
        xScale: 1.25,
        yScale: 0.75,
      },
      chartSpec: {
        chartType: "MatrixDiagram",
        datasetId: dataset.id,
        encodings: {
          column: { field: "time", type: "temporal" },
          row: { field: "person", type: "nominal" },
        },
      },
      dataset,
    });
    expect(scaled.plotArea.width).toBeCloseTo(result.plotArea.width * 1.25);
    expect(scaled.plotArea.height).toBeCloseTo(result.plotArea.height * 0.75);
  });

  it("applies shared multi-stop color and pixel-size mappings", () => {
    const mappingDataset: Dataset = {
      id: "mapping",
      name: "mapping.csv",
      columns: [
        { name: "x", type: "quantitative" },
        { name: "y", type: "quantitative" },
        { name: "color", type: "quantitative" },
        { name: "size", type: "quantitative" },
      ],
      rows: [
        { x: "0", y: "0", color: "0", size: "0" },
        { x: "1", y: "1", color: "50", size: "50" },
        { x: "2", y: "2", color: "100", size: "100" },
      ],
    };
    const result = renderDeterministicChart({
      chartId: "mapped-points",
      width: 400,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType: "Scatterplot",
        datasetId: mappingDataset.id,
        encodings: {
          x: { field: "x", type: "quantitative" },
          y: { field: "y", type: "quantitative" },
          color: { field: "color", type: "quantitative" },
          size: { field: "size", type: "quantitative" },
        },
        markGroups: [{
          id: "mark-group:mapped-points:point",
          chartId: "mapped-points",
          role: "point",
          memberKeys: [],
          sharedConfig: {
            colorMapping: { type: "linear", stops: [{ offset: 0, color: "#000000" }, { offset: 0.5, color: "#ff0000" }, { offset: 1, color: "#ffffff" }] },
            sizeMapping: { type: "linear", stops: [{ offset: 0, size: 2 }, { offset: 0.5, size: 6 }, { offset: 1, size: 10 }] },
          },
        }],
      },
      dataset: mappingDataset,
    });
    expect(result.content).toContain('r="2" fill="#000000"');
    expect(result.content).toContain('r="6" fill="#ff0000"');
    expect(result.content).toContain('r="10" fill="#ffffff"');
  });

  it("uses static color and size when no visual fields are bound", () => {
    const result = renderDeterministicChart({
      chartId: "static-points",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        ...lineSpec,
        chartType: "Scatterplot",
        encodings: { x: lineSpec.encodings.x, y: lineSpec.encodings.y },
        markGroups: [{
          id: "mark-group:static-points:point",
          chartId: "static-points",
          role: "point",
          memberKeys: [],
          sharedConfig: { color: "#123456", size: 7 },
        }],
      },
      dataset,
    });

    expect(result.content).toContain('r="7" fill="#123456"');
  });

  it("shares line scales and emits point row metadata", () => {
    const result = renderLayerChart({ chartId: "layer", width: 800, height: 400, minX: 0, minY: 0, coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 }, chartSpec: lineSpec, dataset, layerSpec: { type: "layer", datasetId: dataset.id, x: lineSpec.encodings.x!, y: lineSpec.encodings.y!, children: [{ nodeId: "line", chartSpec: lineSpec, role: "line" }, { nodeId: "scatter", chartSpec: { ...lineSpec, chartType: "Scatterplot" }, role: "scatter" }] } });
    expect(result.content.match(/data-mark-role="point"/g)).toHaveLength(40);
    expect(result.content).toContain('data-row-key="P0|2025-01-01"');
  });

  it("renders four arcs for each of forty nested pies", () => {
    const line = renderLayerChart({ chartId: "layer", width: 800, height: 400, minX: 0, minY: 0, coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 }, chartSpec: lineSpec, dataset, layerSpec: { type: "layer", datasetId: dataset.id, x: lineSpec.encodings.x!, y: lineSpec.encodings.y!, children: [{ nodeId: "line", chartSpec: lineSpec, role: "line" }] } });
    const result = renderNestedPie({ chartId: "layer", width: 800, height: 400, minX: 0, minY: 0, baseSpec: { ...lineSpec, scales: line.scales, plotArea: line.plotArea }, nestedSpec: { type: "nested", parentRowKey: "*", parentChartNodeId: "layer", valueFields: ["water_kg", "fat_kg", "muscle_kg", "minerals_kg"], innerChartType: "PieChart" }, dataset });
    expect(result.content.match(/data-mark-role="nested-pie"/g)).toHaveLength(40);
    expect(result.content.match(/data-mark-role="pie-arc"/g)).toHaveLength(160);
    expect(result.content).not.toContain("data-person=");
    expect(result.content).not.toContain("data-time=");
  });

  it("renders nested pies only for explicitly targeted scatter rows", () => {
    const line = renderLayerChart({ chartId: "layer", width: 800, height: 400, minX: 0, minY: 0, coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 }, chartSpec: lineSpec, dataset, layerSpec: { type: "layer", datasetId: dataset.id, x: lineSpec.encodings.x!, y: lineSpec.encodings.y!, children: [{ nodeId: "line", chartSpec: lineSpec, role: "line" }] } });
    const result = renderNestedPie({ chartId: "scatter", width: 800, height: 400, minX: 0, minY: 0, baseSpec: { ...lineSpec, scales: line.scales, plotArea: line.plotArea }, nestedSpec: { type: "nested", parentRowKey: "P0|2025-01-01", parentRowKeys: ["P0|2025-01-01", "P1|2025-02-01"], parentChartNodeId: "scatter", valueFields: ["water_kg", "fat_kg", "muscle_kg", "minerals_kg"], innerChartType: "PieChart" }, dataset });
    expect(result.content.match(/data-mark-role="nested-pie"/g)).toHaveLength(2);
    expect(result.content.match(/data-mark-role="pie-arc"/g)).toHaveLength(8);
  });

  it("targets rows by stable fallback keys when no primary key is inferred", () => {
    const keylessDataset = { ...dataset, primaryKey: undefined };
    const line = renderLayerChart({ chartId: "keyless", width: 800, height: 400, minX: 0, minY: 0, coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 }, chartSpec: lineSpec, dataset: keylessDataset, layerSpec: { type: "layer", datasetId: dataset.id, x: lineSpec.encodings.x!, y: lineSpec.encodings.y!, children: [{ nodeId: "line", chartSpec: lineSpec, role: "line" }] } });
    const result = renderNestedPie({ chartId: "keyless", width: 800, height: 400, minX: 0, minY: 0, baseSpec: { ...lineSpec, scales: line.scales, plotArea: line.plotArea }, nestedSpec: { type: "nested", parentRowKey: "0", parentRowKeys: ["0", "1"], parentChartNodeId: "keyless", valueFields: ["water_kg", "fat_kg"], innerChartType: "PieChart" }, dataset: keylessDataset });

    expect(result.content.match(/data-mark-role="nested-pie"/g)).toHaveLength(2);
    expect(result.content).toContain('data-row-key="0"');
    expect(result.content).toContain('data-row-key="1"');
  });
});
