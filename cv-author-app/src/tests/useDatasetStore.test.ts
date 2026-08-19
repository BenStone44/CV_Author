import { describe, expect, it } from "vitest";
import { inferColumnType, parseGraphDataset } from "../stores/useDatasetStore";

describe("CSV column type inference", () => {
  it("infers from values without using the column name", () => {
    expect(inferColumnType(["1", "2", "3"])).toBe("quantitative");
    expect(inferColumnType(["2026-01-01", "2026-02-01"])).toBe("temporal");
    expect(inferColumnType(["A", "B", "C"])).toBe("nominal");
  });
});

describe("Graph JSON import", () => {
  it("keeps node and edge attributes in separate inferred tables", () => {
    const dataset = parseGraphDataset(JSON.stringify({
      nodes: [
        { id: "A", label: "Alpha", weight: 1 },
        { id: "B", label: "Beta", weight: 2 },
      ],
      edges: [
        { source: "A", target: "B", distance: 3.5 },
      ],
    }), "network.json");

    expect(dataset.name).toBe("network.json");
    expect(dataset.columns).toEqual([]);
    expect(dataset.rows).toEqual([]);
    expect(dataset.graph?.nodes.columns).toEqual([
      { name: "id", type: "nominal" },
      { name: "label", type: "nominal" },
      { name: "weight", type: "quantitative" },
    ]);
    expect(dataset.graph?.nodes.rows[0]).toEqual({ id: "A", label: "Alpha", weight: "1" });
    expect(dataset.graph?.edges.rows[0]).toEqual({ source: "A", target: "B", distance: "3.5" });
  });

  it("accepts a graph wrapper and empty tables", () => {
    const dataset = parseGraphDataset(JSON.stringify({ graph: { nodes: [], edges: [] } }));
    expect(dataset.graph?.nodes).toEqual({ columns: [], rows: [] });
    expect(dataset.graph?.edges).toEqual({ columns: [], rows: [] });
  });

  it("rejects malformed graph structures", () => {
    expect(() => parseGraphDataset("{}"))
      .toThrow('Graph JSON "nodes" must be an array.');
    expect(() => parseGraphDataset(JSON.stringify({ nodes: [{ id: "A" }], edges: ["bad"] })))
      .toThrow('Graph JSON "edges" row 1 must be an object.');
  });
});
