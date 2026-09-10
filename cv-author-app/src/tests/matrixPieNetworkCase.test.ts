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
    size: { field: "weight", type: "quantitative" },
  },
  series: { field: "dominant_component", type: "nominal" },
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
          domain: [0, 25],
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
        layoutXField: "layout_x",
        layoutYField: "layout_y",
        layoutNormalized: true,
        nodeShape: "pie",
        pieFields: "channel_a,channel_b,channel_c,channel_d,channel_e",
        nodeLabelsVisible: false,
        sizeMapping: {
          type: "linear",
          stops: [{ offset: 0, size: 8 }, { offset: 1, size: 24 }],
        },
        colorMapping: {
          type: "categorical",
          values: {
            channel_a: "#606c38",
            channel_b: "#283618",
            channel_c: "#ffe6a7",
            channel_d: "#dda15e",
            channel_e: "#bc6c25",
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
  it("renders a 20 by 20 heatmap beneath a weighted 72-node graph", () => {
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
    expect(result.content.match(/data-mark-role="node"/g)).toHaveLength(72);
    expect(result.content.match(/data-mark-role="node-pie-slice"/g)).toHaveLength(360);
    expect(result.content.match(/data-mark-role="link"/g)).toHaveLength(163);
    expect(result.content).toContain('data-link-weight="8"');
    expect(result.content).toContain('data-chart-type="force-directed-graph"');
    expect(result.content).toContain('data-layout-source="stored-force"');
    expect(result.content).toContain('data-node-shape="pie"');
    expect(result.content).toContain('fill-opacity="0.94"');
    expect(result.content).not.toContain('data-chart-type="nested-pie"');
    expect(result.content).not.toContain('data-mark-role="node-label"');
    ["#606c38", "#283618", "#ffe6a7", "#dda15e", "#bc6c25"].forEach((color) => {
      expect(result.content).toContain(`fill="${color}"`);
    });
  });

  it("derives node components and the heatmap from the same weighted graph", () => {
    const graph = matrixPieNetworkDataset.graph;
    expect(graph).toBeDefined();
    if (!graph) return;

    expect(graph.nodes.rows).toHaveLength(72);
    expect(graph.nodes.rows.filter((row) => row.density === "core")).toHaveLength(48);
    expect(graph.nodes.rows.filter((row) => row.density === "scattered")).toHaveLength(24);
    expect(graph.edges.rows.filter((row) => row.kind !== "internal").length).toBeGreaterThan(25);
    expect(graph.edges.rows.filter((row) => row.kind === "radial")).toHaveLength(40);

    const componentFields = ["channel_a", "channel_b", "channel_c", "channel_d", "channel_e"];
    graph.nodes.rows.forEach((row) => {
      const componentTotal = componentFields.reduce((sum, field) => sum + Number(row[field]), 0);
      expect(componentTotal).toBeCloseTo(Number(row.weight), 2);
      expect(Number(row.layout_x)).toBeGreaterThanOrEqual(0);
      expect(Number(row.layout_x)).toBeLessThanOrEqual(1);
      expect(Number(row.layout_y)).toBeGreaterThanOrEqual(0);
      expect(Number(row.layout_y)).toBeLessThanOrEqual(1);
      expect(componentFields).toContain(row.dominant_component);
    });
    matrixPieNetworkDataset.rows.forEach((row) => {
      const componentTotal = componentFields.reduce((sum, field) => sum + Number(row[field]), 0);
      expect(componentTotal).toBeCloseTo(Number(row.heat_value), 2);
    });
    componentFields.forEach((field) => {
      const nodeTotal = graph.nodes.rows.reduce((sum, row) => sum + Number(row[field]), 0);
      const heatTotal = matrixPieNetworkDataset.rows.reduce((sum, row) => sum + Number(row[field]), 0);
      expect(Math.abs(nodeTotal - heatTotal)).toBeLessThan(0.2);
    });
    const heatValues = matrixPieNetworkDataset.rows.map((row) => Number(row.heat_value));
    expect(Math.min(...heatValues)).toBe(0);
    expect(Math.max(...heatValues)).toBeGreaterThan(20);

    const nodeWeightTotal = graph.nodes.rows.reduce((sum, row) => sum + Number(row.weight), 0);
    const nodeCentroid = graph.nodes.rows.reduce((center, row) => ({
      x: center.x + Number(row.layout_x) * Number(row.weight) / nodeWeightTotal,
      y: center.y + Number(row.layout_y) * Number(row.weight) / nodeWeightTotal,
    }), { x: 0, y: 0 });
    const heatWeightTotal = heatValues.reduce((sum, value) => sum + value, 0);
    const heatCentroid = matrixPieNetworkDataset.rows.reduce((center, row) => ({
      x: center.x + (Number(row.column_group?.slice(1)) - 0.5) / 20 * Number(row.heat_value) / heatWeightTotal,
      y: center.y + (Number(row.row_group?.slice(1)) - 0.5) / 20 * Number(row.heat_value) / heatWeightTotal,
    }), { x: 0, y: 0 });
    expect(heatCentroid.x).toBeCloseTo(nodeCentroid.x, 2);
    expect(heatCentroid.y).toBeCloseTo(nodeCentroid.y, 2);
  });
});
