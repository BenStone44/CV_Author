import { describe, expect, it } from "vitest";
import {
  analyzeDimensionGrainRepairs,
  inferChartStructure,
} from "./dimensionInference";
import type { ChartSpec, Dataset } from "./types";

const dataset: Dataset = {
  id: "case1",
  name: "case1.csv",
  columns: [
    { name: "person", type: "nominal" },
    { name: "time", type: "temporal" },
    { name: "weight_kg", type: "quantitative" },
  ],
  rows: ["A", "B", "C", "D", "E"].flatMap((person, personIndex) => [
    { person, time: "2025-01-01", weight_kg: String(80 + personIndex) },
    { person, time: "2025-02-01", weight_kg: String(85 + personIndex) },
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
  it("excludes quantitative columns from every minimal dimension repair", () => {
    const repairDataset: Dataset = {
      id: "typed-dimension-repairs",
      name: "typed-dimension-repairs.csv",
      columns: [
        { name: "entity", type: "nominal" },
        { name: "numeric_alias", type: "quantitative" },
        { name: "period", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { entity: "A", numeric_alias: "1", period: "T1", value: "10" },
        { entity: "B", numeric_alias: "2", period: "T1", value: "20" },
      ],
    };

    const result = analyzeDimensionGrainRepairs(repairDataset, ["period"], ["value"]);

    expect(result.candidates.map((candidate) => candidate.fields)).toEqual([["entity"]]);
    expect(result.candidates.flatMap((candidate) => candidate.fields)).not.toContain("numeric_alias");
  });

  it("reports unresolvable when only quantitative columns distinguish conflicts", () => {
    const numericOnlyDataset: Dataset = {
      id: "numeric-only-dimension-repair",
      name: "numeric-only-dimension-repair.csv",
      columns: [
        { name: "numeric_group", type: "quantitative" },
        { name: "period", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { numeric_group: "1", period: "T1", value: "10" },
        { numeric_group: "2", period: "T1", value: "20" },
      ],
    };

    const result = analyzeDimensionGrainRepairs(numericOnlyDataset, ["period"], ["value"]);

    expect(result.status).toBe("unresolvable");
    expect(result.candidates).toEqual([]);
  });

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

  it("does not prefer a business field over an equally valid row identifier", () => {
    const noisyDataset: Dataset = {
      id: "grain-evidence",
      name: "grain-evidence.csv",
      columns: [
        { name: "row_id", type: "nominal" },
        { name: "person", type: "nominal" },
        { name: "time", type: "temporal" },
        { name: "tag", type: "nominal" },
        { name: "weight_kg", type: "quantitative" },
      ],
      rows: ["A", "B", "C", "D", "E"].flatMap((person, personIndex) =>
        ["2025-01-01", "2025-02-01", "2025-03-01"].map((time, timeIndex) => ({
          row_id: `${person}-${timeIndex}`,
          person,
          time,
          tag: personIndex < 2 ? "normal" : "overweight",
          weight_kg: String(70 + personIndex * 3 + timeIndex),
        })),
      ),
    };

    const result = inferChartStructure("line-grain", noisyDataset, {
      ...chartSpec,
      datasetId: noisyDataset.id,
    });

    expect(result.series).toBeUndefined();
    expect(result.dimensionRecommendations?.some((recommendation) =>
      recommendation.strategy === "series",
    )).toBe(false);
  });

  it("does not choose between structurally equivalent series fields", () => {
    const ambiguousDataset: Dataset = {
      id: "equivalent-series",
      name: "equivalent-series.csv",
      columns: [
        { name: "entity", type: "nominal" },
        { name: "alias", type: "quantitative" },
        { name: "period", type: "temporal" },
        { name: "value", type: "quantitative" },
      ],
      rows: ["A", "B", "C"].flatMap((entity, entityIndex) =>
        ["T1", "T2"].map((period, periodIndex) => ({
          entity,
          alias: String(entityIndex + 1),
          period,
          value: String(entityIndex + periodIndex),
        })),
      ),
    };

    const result = inferChartStructure("ambiguous-line", ambiguousDataset, {
      chartType: "LineGraph",
      datasetId: ambiguousDataset.id,
      encodings: {
        x: { field: "period", type: "temporal" },
        y: { field: "value", type: "quantitative" },
      },
    });

    expect(result.series).toBeUndefined();
    expect(result.dimensionRecommendations?.some((recommendation) =>
      recommendation.strategy === "series",
    )).toBe(false);
  });
});
