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
  it("renders a selectable Point Group without duplicate axes", () => {
    const result = renderDeterministicChart({
      chartId: "point-group",
      width: 800,
      height: 400,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 400 }, xDirection: 1, yDirection: -1 },
      chartSpec: { ...lineSpec, chartType: "Scatterplot" },
      dataset,
      marksOnly: true,
    });
    expect(result.content.match(/data-mark-role="point"/g)).toHaveLength(40);
    expect(result.content).not.toContain('data-mark-role="x-axis"');
    expect(result.content).not.toContain('data-mark-role="y-axis"');
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
