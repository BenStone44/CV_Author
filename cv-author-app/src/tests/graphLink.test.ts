import { describe, expect, it } from "vitest";
import { case2GraphDataset, hexbinGraphDataset } from "../utils/defaultChartData";
import { renderDeterministicChart } from "../utils/semanticRenderer";
import type { ChartSpec } from "../types";

function graphLinkSpec(chartType = "GraphLink"): ChartSpec {
  return {
    chartType,
    datasetId: case2GraphDataset.id,
    encodings: {
      source: { field: "source", type: "nominal" },
      target: { field: "target", type: "nominal" },
      value: { field: "value", type: "quantitative" },
    },
  };
}

describe("graph link template", () => {
  it("renders one link mark per valid edge with Cartesian node coordinates", () => {
    const result = renderDeterministicChart({
      chartId: "graph-link",
      width: 400,
      height: 240,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 240 }, xDirection: 1, yDirection: -1 },
      chartSpec: graphLinkSpec(),
      dataset: case2GraphDataset,
    });
    expect(result.content.match(/data-mark-role="link"/g)).toHaveLength(13);
    expect(result.content).toContain('data-source="10307"');
  });

  it("supports the Polar link contract without rendering node marks", () => {
    const result = renderDeterministicChart({
      chartId: "graph-link-polar",
      width: 320,
      height: 240,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Polar", origin: { x: 160, y: 120 }, radius: 90 },
      chartSpec: graphLinkSpec("GraphLinkPolar"),
      dataset: case2GraphDataset,
    });
    expect(result.content.match(/data-mark-role="link"/g)).toHaveLength(13);
    expect(result.content).not.toContain('data-mark-role="node"');
  });

  it("ships the six-area spread graph with valid role counts and endpoints", () => {
    const nodes = hexbinGraphDataset.graph!.nodes.rows;
    const edges = hexbinGraphDataset.graph!.edges.rows;
    const nodeIds = new Set(nodes.map((row) => row.hex_id));
    expect(nodes).toHaveLength(180);
    expect(nodes.every((row) => Number.isFinite(Number(row.x)) && Number.isFinite(Number(row.y)))).toBe(true);
    expect(new Set(nodes.map((row) => Number(row.y))).size).toBe(12);
    expect(Array.from(new Set(nodes.map((row) => String(row.hex_id).split("-")[1]))).every((rowIndex) =>
      nodes.filter((row) => String(row.hex_id).startsWith(`hex-${rowIndex}-`)).length === 15)).toBe(true);
    expect(new Set(nodes.map((row) => row.arealabel)).size).toBe(6);
    expect(nodes.filter((row) => row.typelabel === "leader")).toHaveLength(6);
    expect(nodes.filter((row) => row.typelabel === "middle").length).toBeGreaterThanOrEqual(60);
    expect(edges.every((row) => nodeIds.has(row.source) && nodeIds.has(row.target))).toBe(true);
    expect(edges.every((row) => {
      const sourceType = nodes.find((node) => node.hex_id === row.source)?.typelabel;
      const targetType = nodes.find((node) => node.hex_id === row.target)?.typelabel;
      return sourceType === "leader" ? targetType === "middle" : sourceType === "middle" && targetType === "normal";
    })).toBe(true);
    const hexbin = renderDeterministicChart({
      chartId: "hexbin-base",
      width: 420,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType: "Hexbin",
        datasetId: hexbinGraphDataset.id,
        encodings: {
          x: { field: "x", type: "quantitative" },
          y: { field: "y", type: "quantitative" },
        },
      },
      dataset: { ...hexbinGraphDataset, rows: nodes },
    });
    expect(hexbin.content).toContain('data-source-row-count="180"');
    expect(hexbin.content).toContain('data-scale="linear-linear"');
    expect(hexbin.scales?.x.type).toBe("linear");
    expect(hexbin.scales?.y.type).toBe("linear");
    const result = renderDeterministicChart({
      chartId: "hexbin-link",
      width: 420,
      height: 300,
      minX: 0,
      minY: 0,
      coordinateGuide: { type: "Cartesian", origin: { x: 0, y: 300 }, xDirection: 1, yDirection: -1 },
      chartSpec: {
        chartType: "GraphLink",
        datasetId: hexbinGraphDataset.id,
        encodings: {
          source: { field: "source", type: "nominal" },
          target: { field: "target", type: "nominal" },
          size: { field: "value", type: "quantitative" },
        },
      },
      dataset: hexbinGraphDataset,
    });
    expect(result.content.match(/data-mark-role="link"/g)).toHaveLength(edges.length);
  });
});
