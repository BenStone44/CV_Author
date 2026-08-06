import { describe, expect, it } from "vitest";
import { inferChartStructure } from "./dimensionInference";
import type { ChartSpec, Dataset } from "./types";

const dataset: Dataset = {
  id: "case1",
  name: "case1.csv",
  columns: [
    { name: "person", type: "nominal" },
    { name: "time", type: "temporal" },
    { name: "weight_kg", type: "quantitative" },
  ],
  rows: ["A", "B", "C", "D", "E"].flatMap((person) => [
    { person, time: "2025-01-01", weight_kg: "80" },
    { person, time: "2025-02-01", weight_kg: "85" },
  ]),
  primaryKey: ["person", "time"],
};

const chartSpec: ChartSpec = {
  chartType: "LineGraph",
  datasetId: dataset.id,
  encodings: {
    x: { field: "time", type: "temporal" },
    y: { field: "weight_kg", type: "quantitative" },
  },
};

describe("line chart dimension recommendations", () => {
  it("offers one-view and multiple-view choices for an inferred series", () => {
    const result = inferChartStructure("line-1", dataset, chartSpec);

    expect(result.series?.field).toBe("person");
    expect(result.dimensionRecommendations).toMatchObject([
      { strategy: "series", field: "person", valueCount: 5 },
      { strategy: "facet", field: "person", valueCount: 5 },
    ]);
  });

  it("does not offer the same choice again after a decision is recorded", () => {
    const result = inferChartStructure("line-1", dataset, {
      ...chartSpec,
      series: { field: "person", type: "nominal" },
      dimensionDecisions: { person: "series" },
    });

    expect(result.dimensionRecommendations).toEqual([]);
  });
});
