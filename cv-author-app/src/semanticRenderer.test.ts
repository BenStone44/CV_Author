import { describe, expect, it } from "vitest";
import { renderDeterministicChart, renderLayerChart, renderNestedPie } from "./semanticRenderer";
import type { ChartSpec, Dataset } from "./types";

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
  });

  it("renders nested pies only for explicitly targeted scatter rows", () => {
    const line = renderLayerChart({ chartId: "layer", width: 800, height: 400, minX: 0, minY: 0, coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 }, chartSpec: lineSpec, dataset, layerSpec: { type: "layer", datasetId: dataset.id, x: lineSpec.encodings.x!, y: lineSpec.encodings.y!, children: [{ nodeId: "line", chartSpec: lineSpec, role: "line" }] } });
    const result = renderNestedPie({ chartId: "scatter", width: 800, height: 400, minX: 0, minY: 0, baseSpec: { ...lineSpec, scales: line.scales, plotArea: line.plotArea }, nestedSpec: { type: "nested", parentRowKey: "P0|2025-01-01", parentRowKeys: ["P0|2025-01-01", "P1|2025-02-01"], parentChartNodeId: "scatter", valueFields: ["water_kg", "fat_kg", "muscle_kg", "minerals_kg"], innerChartType: "PieChart" }, dataset });
    expect(result.content.match(/data-mark-role="nested-pie"/g)).toHaveLength(2);
    expect(result.content.match(/data-mark-role="pie-arc"/g)).toHaveLength(8);
  });
});
