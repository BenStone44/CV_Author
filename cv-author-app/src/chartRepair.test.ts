import { describe, expect, it } from "vitest";
import {
  analyzeChartRepairs,
  analyzeChartSpecRepairs,
  type ChartRepairContract,
  type ChartRepairRoleContract,
} from "./chartRepair";
import type { ChartSpec, Dataset } from "./types";

function dimensionRole(
  id: string,
  accepts: ChartRepairRoleContract["accepts"] = ["nominal"],
): ChartRepairRoleContract {
  return {
    id,
    kind: "dimension",
    accepts,
    minFields: 1,
    maxFields: 1,
    requiresPartition: true,
    minCardinality: 2,
  };
}

const valueRole: ChartRepairRoleContract = {
  id: "value",
  kind: "measure",
  accepts: ["quantitative"],
  minFields: 1,
  maxFields: 1,
};

function contract(
  roles: ChartRepairRoleContract[],
  overrides: Partial<ChartRepairContract> = {},
): ChartRepairContract {
  return {
    roles,
    allowFieldReuse: false,
    aggregationPolicy: "allowed",
    requiresFunctionalDependency: false,
    requiresIndependentDimensions: true,
    ...overrides,
  };
}

const groupedDataset: Dataset = {
  id: "grouped",
  name: "grouped.csv",
  columns: [
    { name: "date", type: "temporal" },
    { name: "product", type: "nominal" },
    { name: "region", type: "nominal" },
    { name: "constant", type: "nominal" },
    { name: "sales", type: "quantitative" },
  ],
  rows: ["2026-01", "2026-02"].flatMap((date, dateIndex) =>
    ["A", "B"].flatMap((product, productIndex) =>
      ["north", "south"].map((region, regionIndex) => ({
        date,
        product,
        region,
        constant: "same",
        sales: String(dateIndex * 100 + productIndex * 10 + regionIndex),
      })),
    ),
  ),
};

describe("chart minimal repair search", () => {
  it("returns every minimal field that can fill one missing role", () => {
    const result = analyzeChartRepairs(
      groupedDataset,
      contract([
        dimensionRole("x", ["temporal"]),
        dimensionRole("series"),
        valueRole,
      ]),
      { x: ["date"], value: ["sales"] },
      { candidateFields: ["product", "region"] },
    );

    expect(result.status).toBe("DIMENSION_UNDERFLOW");
    expect(result.repairs).toEqual([
      {
        addedFields: ["product"],
        binding: { x: ["date"], value: ["sales"], series: ["product"] },
      },
      {
        addedFields: ["region"],
        binding: { x: ["date"], value: ["sales"], series: ["region"] },
      },
    ]);
  });

  it("preserves each role mapping for the same two-field set", () => {
    const dataset: Dataset = {
      id: "matrix",
      name: "matrix.csv",
      columns: [
        { name: "product", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "channel", type: "nominal" },
      ],
      rows: ["A", "B"].flatMap((product) => ["north", "south"].flatMap((region) =>
        ["web", "store"].map((channel) => ({ product, region, channel })),
      )),
    };

    const result = analyzeChartRepairs(
      dataset,
      contract([dimensionRole("row"), dimensionRole("column")]),
      {},
    );

    expect(result.repairs).toHaveLength(6);
    expect(result.repairs).toContainEqual({
      addedFields: ["product", "region"],
      binding: { row: ["product"], column: ["region"] },
    });
    expect(result.repairs).toContainEqual({
      addedFields: ["product", "region"],
      binding: { column: ["product"], row: ["region"] },
    });
  });

  it("rejects fields with incompatible types or no grouping structure", () => {
    const result = analyzeChartRepairs(
      groupedDataset,
      contract([
        dimensionRole("x", ["temporal"]),
        dimensionRole("series"),
        valueRole,
      ]),
      { x: ["date"], value: ["sales"] },
      { candidateFields: ["constant", "sales", "product"] },
    );

    expect(result.repairs.map((repair) => repair.addedFields)).toEqual([["product"]]);
  });

  it("does not count structurally equivalent fields as independent dimensions", () => {
    const dataset: Dataset = {
      id: "equivalent",
      name: "equivalent.csv",
      columns: [
        { name: "product", type: "nominal" },
        { name: "alias", type: "nominal" },
        { name: "region", type: "nominal" },
      ],
      rows: ["A", "B"].flatMap((product) => ["north", "south"].map((region) => ({
        product,
        alias: product === "A" ? "one" : "two",
        region,
      }))),
    };

    const result = analyzeChartRepairs(
      dataset,
      contract([dimensionRole("row"), dimensionRole("column")]),
      { row: ["product"] },
      { candidateFields: ["alias", "region"] },
    );

    expect(result.repairs).toEqual([{
      addedFields: ["region"],
      binding: { row: ["product"], column: ["region"] },
    }]);
  });

  it("repairs underflow and overflow with the same added dimension", () => {
    const dataset: Dataset = {
      id: "combined",
      name: "combined.csv",
      columns: [
        { name: "date", type: "temporal" },
        { name: "product", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "sales", type: "quantitative" },
      ],
      rows: ["2026-01", "2026-02"].flatMap((date, dateIndex) =>
        ["A", "B"].flatMap((product, productIndex) => ["north", "south"].map((region) => ({
          date,
          product,
          region,
          sales: String(dateIndex * 100 + productIndex * 10),
        }))),
      ),
    };
    const noAggregation = contract([
      dimensionRole("x", ["temporal"]),
      dimensionRole("series"),
      valueRole,
    ], {
      aggregationPolicy: "forbidden",
      requiresFunctionalDependency: true,
    });

    const result = analyzeChartRepairs(
      dataset,
      noAggregation,
      { x: ["date"], value: ["sales"] },
      { candidateFields: ["product", "region"] },
    );

    expect(result.issues).toEqual(["DIMENSION_UNDERFLOW", "DIMENSION_OVERFLOW"]);
    expect(result.repairs.map((repair) => repair.addedFields)).toEqual([["product"]]);
  });

  it("lets aggregation policy change whether duplicate visual keys are legal", () => {
    const noAggregation = contract([
      dimensionRole("x", ["temporal"]),
      dimensionRole("series"),
      valueRole,
    ], {
      aggregationPolicy: "forbidden",
      requiresFunctionalDependency: true,
    });
    const binding = { x: ["date"], value: ["sales"] };
    const candidates = { candidateFields: ["region"] };

    expect(analyzeChartRepairs(groupedDataset, noAggregation, binding, candidates).status)
      .toBe("UNRESOLVABLE");
    expect(analyzeChartRepairs(groupedDataset, {
      ...noAggregation,
      aggregationPolicy: "allowed",
    }, binding, candidates).repairs.map((repair) => repair.addedFields)).toEqual([["region"]]);
  });

  it("supports contracts that allow one field to occupy multiple roles", () => {
    const result = analyzeChartRepairs(
      groupedDataset,
      contract([dimensionRole("row"), dimensionRole("column")], {
        allowFieldReuse: true,
        requiresIndependentDimensions: false,
      }),
      {},
      { candidateFields: ["product"] },
    );

    expect(result.repairs).toEqual([{
      addedFields: ["product"],
      binding: { row: ["product"], column: ["product"] },
    }]);
  });

  it("keeps minimal CSP repairs of different cardinalities", () => {
    const dataset: Dataset = {
      id: "different-csp-cardinalities",
      name: "different-csp-cardinalities.csv",
      columns: [
        { name: "A", type: "nominal" },
        { name: "B", type: "quantitative" },
        { name: "C", type: "temporal" },
      ],
      rows: [
        { A: "a1", B: "1", C: "2026-01" },
        { A: "a2", B: "2", C: "2026-02" },
      ],
    };
    const row = dimensionRole("row", ["nominal", "quantitative"]);
    const column = dimensionRole("column", ["nominal", "temporal"]);

    const result = analyzeChartRepairs(
      dataset,
      contract([row, column], {
        allowFieldReuse: true,
        requiresIndependentDimensions: false,
      }),
      {},
    );

    expect(result.repairs.map((repair) => repair.addedFields)).toEqual([
      ["A"],
      ["B", "C"],
    ]);
  });

  it("adapts a repository chart contract without chart-name logic in the solver", () => {
    const spec: ChartSpec = {
      chartType: "GroupedBarChart",
      datasetId: groupedDataset.id,
      encodings: {
        x: { field: "date", type: "temporal" },
        y: { field: "sales", type: "quantitative" },
      },
    };

    const result = analyzeChartSpecRepairs(groupedDataset, spec);

    expect(result.status).toBe("DIMENSION_UNDERFLOW");
    expect(result.repairs.map((repair) => repair.addedFields)).toEqual([
      ["product"],
      ["region"],
    ]);
    expect(result.repairs.every((repair) => repair.binding.series?.length === 1)).toBe(true);
  });
});
