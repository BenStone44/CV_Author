import { describe, expect, it } from "vitest";
import type { ChartDataTransform, Dataset } from "../types";
import { materializeChartDataTransforms } from "../utils/chartDataTransforms";

const dataset: Dataset = {
  id: "sales",
  name: "sales.csv",
  columns: [
    { name: "region", type: "nominal" },
    { name: "quarter", type: "ordinal" },
    { name: "sales", type: "quantitative" },
  ],
  rows: [
    { region: "East", quarter: "Q1", sales: "10" },
    { region: "East", quarter: "Q2", sales: "30" },
    { region: "West", quarter: "Q1", sales: "20" },
    { region: "West", quarter: "Q2", sales: "40" },
  ],
};

function materialize(transforms: ChartDataTransform[]) {
  return materializeChartDataTransforms(dataset, transforms);
}

describe("chart data transforms", () => {
  it("filters only the materialized chart data", () => {
    const result = materialize([{
      id: "east-only",
      kind: "filter",
      mode: "values",
      field: "region",
      values: ["East"],
      single: true,
    }]);

    expect(result.rows.map((row) => row.sales)).toEqual(["10", "30"]);
    expect(dataset.rows).toHaveLength(4);
  });

  it("supports numeric ranges and exact top-N filtering", () => {
    const ranged = materialize([{
      id: "sales-range",
      kind: "filter",
      mode: "numeric",
      field: "sales",
      operator: "between",
      value: 15,
      upperValue: 35,
    }]);
    const top = materialize([{
      id: "top-two",
      kind: "filter",
      mode: "numeric",
      field: "sales",
      operator: "top",
      value: 2,
    }]);

    expect(ranged.rows.map((row) => row.sales)).toEqual(["30", "20"]);
    expect(top.rows.map((row) => row.sales)).toEqual(["30", "40"]);
  });

  it("selects top bars by their aggregated group value", () => {
    const groupedDataset: Dataset = {
      ...dataset,
      rows: [
        { region: "East", quarter: "Q1", sales: "30" },
        { region: "East", quarter: "Q2", sales: "30" },
        { region: "West", quarter: "Q1", sales: "50" },
        { region: "West", quarter: "Q2", sales: "1" },
      ],
    };
    const result = materializeChartDataTransforms(groupedDataset, [{
      id: "single-bar-value-order",
      kind: "order",
      mode: "group-value",
      groupField: "region",
      valueField: "sales",
      operation: "sum",
      direction: "descending",
      limit: 1,
    }]);

    expect(result.rows.map((row) => row.region)).toEqual(["East", "East"]);
  });

  it("orders complete bar groups while preserving row order within each bar", () => {
    const result = materialize([{
      id: "single-bar-value-order",
      kind: "order",
      mode: "group-value",
      groupField: "region",
      valueField: "sales",
      operation: "sum",
      direction: "descending",
    }]);

    expect(result.rows.map((row) => `${row.region}-${row.quarter}`)).toEqual([
      "West-Q1",
      "West-Q2",
      "East-Q1",
      "East-Q2",
    ]);
  });

  it("groups a category and calculates a numeric average", () => {
    const result = materialize([{
      id: "average-by-region",
      kind: "aggregate",
      mode: "group",
      groupField: "region",
      valueField: "sales",
      operation: "avg",
      outputField: "average_sales",
    }]);

    expect(result.columns).toEqual([
      { name: "region", type: "nominal" },
      { name: "average_sales", type: "quantitative" },
    ]);
    expect(result.rows).toEqual([
      { region: "East", average_sales: "20" },
      { region: "West", average_sales: "30" },
    ]);
  });

  it("adds an ordinal bin field to the chart data", () => {
    const result = materialize([{
      id: "sales-bins",
      kind: "aggregate",
      mode: "bin",
      field: "sales",
      method: "equal-width",
      parameter: 2,
      outputField: "sales_bin",
    }]);

    expect(result.columns.at(-1)).toEqual({ name: "sales_bin", type: "ordinal" });
    expect(result.rows.map((row) => row.sales_bin)).toEqual([
      "[10, 25)",
      "[25, 40]",
      "[10, 25)",
      "[25, 40]",
    ]);
  });
});
