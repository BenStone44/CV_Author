import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../types";
import { prepareChartData } from "../utils/chartDataPipeline";
import { matrixPieNetworkDataset } from "../utils/defaultChartData";
import { renderDeterministicChart } from "../utils/semanticRenderer";

const matrixSpec: ChartSpec = {
  chartType: "MatrixDiagram",
  templateId: "matrix",
  datasetId: matrixPieNetworkDataset.id,
  link: true,
  encodings: {
    x: { field: "column_group", type: "ordinal" },
    y: { field: "row_group", type: "ordinal" },
    color: { field: "heat_value", type: "quantitative" },
    key: { field: "id", type: "nominal" },
    source: { field: "source", type: "nominal" },
    target: { field: "target", type: "nominal" },
    value: { field: "weight", type: "quantitative" },
    size: { field: "size", type: "quantitative" },
  },
  series: { field: "community", type: "nominal" },
  markGroups: [
    {
      id: "matrix-case:cells",
      chartId: "matrix-case",
      role: "cell",
      memberKeys: [],
      sharedConfig: {
        opacity: 0.94,
        colorMapping: {
          type: "linear",
          domain: [14, 165],
          stops: [
            { offset: 0, color: "#f7fbff" },
            { offset: 0.5, color: "#4292c6" },
            { offset: 1, color: "#08306b" },
          ],
        },
      },
      allowOverrides: true,
    },
    {
      id: "matrix-case:nodes",
      chartId: "matrix-case",
      role: "node",
      memberKeys: [],
      sharedConfig: {
        communityField: "community",
        communityStrength: 0.26,
        nodeLabelsVisible: false,
        sizeMapping: {
          type: "linear",
          stops: [{ offset: 0, size: 4 }, { offset: 1, size: 12 }],
        },
        colorMapping: {
          type: "categorical",
          values: {
            "Community A": "#003049",
            "Community B": "#c1121f",
            "Community C": "#006d77",
          },
        },
      },
      allowOverrides: true,
    },
    {
      id: "matrix-case:links",
      chartId: "matrix-case",
      role: "link",
      memberKeys: [],
      sharedConfig: { color: "#263238", opacity: 0.28 },
      allowOverrides: true,
    },
  ],
};

describe("Matrix force-network heatmap case", () => {
  it("renders a 20 by 20 heatmap beneath a dense 100-node graph", () => {
    const prepared = prepareChartData("matrix-case", matrixPieNetworkDataset, matrixSpec);
    const result = renderDeterministicChart({
      chartId: "matrix-case",
      width: 920,
      height: 920,
      minX: 0,
      minY: 0,
      coordinateGuide: {
        type: "Cartesian",
        origin: { x: 0, y: 920 },
        xDirection: 1,
        yDirection: 1,
      },
      chartSpec: prepared.chartSpec,
      dataset: prepared.dataset,
    });

    expect(result.content.match(/data-mark-role="cell"/g)).toHaveLength(400);
    expect(result.content.match(/data-mark-role="node"/g)).toHaveLength(100);
    expect(result.content.match(/data-mark-role="link"/g)).toHaveLength(412);
    expect(result.content).toContain('data-chart-type="force-directed-graph"');
    expect(result.content).toContain('fill-opacity="0.94"');
    expect(result.content).not.toContain('data-chart-type="nested-pie"');
    expect(result.content).not.toContain('data-mark-role="node-label"');
    expect(result.content).toContain('fill="#003049"');
    expect(result.content).toContain('fill="#c1121f"');
    expect(result.content).toContain('fill="#006d77"');
  });

  it("provides three balanced communities, varied node sizes, and three heat hotspots", () => {
    const graph = matrixPieNetworkDataset.graph;
    expect(graph).toBeDefined();
    if (!graph) return;

    const communityCounts = graph.nodes.rows.reduce<Record<string, number>>((counts, row) => {
      const community = row.community ?? "";
      counts[community] = (counts[community] ?? 0) + 1;
      return counts;
    }, {});
    expect(communityCounts).toEqual({
      "Community A": 34,
      "Community B": 33,
      "Community C": 33,
    });
    const sizes = graph.nodes.rows.map((row) => Number(row.size));
    expect(Math.min(...sizes)).toBe(6);
    expect(Math.max(...sizes)).toBe(60);

    const heatAt = (row: number, column: number) => Number(matrixPieNetworkDataset.rows.find((datum) =>
      datum.row_group === `R${String(row).padStart(2, "0")}`
      && datum.column_group === `C${String(column).padStart(2, "0")}`)?.heat_value ?? 0);
    expect(heatAt(5, 5)).toBeGreaterThan(120);
    expect(heatAt(14, 7)).toBeGreaterThan(120);
    expect(heatAt(11, 16)).toBeGreaterThan(120);
    expect(Math.min(...matrixPieNetworkDataset.rows.map((row) => Number(row.heat_value)))).toBe(14);
  });
});
