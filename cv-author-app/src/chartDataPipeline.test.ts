import { describe, expect, it } from "vitest";
import {
  CUBE_MEASURE_ID_FIELD,
  CUBE_MEASURE_VALUE_FIELD,
  filterDatasetForChart,
  materializeCubeValueSeries,
  prepareChartData,
  synchronizeChartEncodingTypes,
} from "./chartDataPipeline";
import type { ChartSpec, Dataset } from "./types";

const dataset: Dataset = {
  id: "measurements",
  name: "measurements.csv",
  columns: [
    { name: "group", type: "nominal" },
    { name: "time", type: "temporal" },
    { name: "value", type: "quantitative" },
  ],
  rows: [
    { group: "A", time: "2026-01-01", value: "10" },
    { group: "B", time: "2026-01-02", value: "20" },
  ],
  primaryKey: ["group", "time"],
};

const chartSpec: ChartSpec = {
  chartType: "LineGraph",
  datasetId: dataset.id,
  encodings: {
    x: { field: "time", type: "nominal" },
    y: { field: "value", type: "nominal" },
  },
  filters: { group: "A" },
};

describe("chart data pipeline", () => {
  it("filters rows without mutating the source dataset", () => {
    const filtered = filterDatasetForChart(dataset, chartSpec);
    expect(filtered.rows).toEqual([dataset.rows[0]]);
    expect(dataset.rows).toHaveLength(2);
  });

  it("synchronizes encoding types from dataset metadata", () => {
    const synchronized = synchronizeChartEncodingTypes(chartSpec, dataset);
    expect(synchronized.encodings.x?.type).toBe("temporal");
    expect(synchronized.encodings.y?.type).toBe("quantitative");
    expect(chartSpec.encodings.x?.type).toBe("nominal");
  });

  it("runs filtering, synchronization and structure inference in order", () => {
    const prepared = prepareChartData("chart-1", dataset, chartSpec);
    expect(prepared.dataset.rows).toHaveLength(1);
    expect(prepared.chartSpec.templateId).toBe("line");
    expect(prepared.chartSpec.encodings.y?.type).toBe("quantitative");
    expect(prepared.chartSpec.markGroups?.[0]?.chartId).toBe("chart-1");
  });

  it("materializes selected Cube measures as a reusable value series", () => {
    const wideDataset: Dataset = {
      id: "body-composition",
      name: "body-composition.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "weight", type: "quantitative" },
        { name: "water", type: "quantitative" },
        { name: "fat", type: "quantitative" },
        { name: "muscle", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", weight: "80", water: "45", fat: "18", muscle: "32" },
        { time: "2026-02-01", weight: "79", water: "44", fat: "17", muscle: "33" },
      ],
      primaryKey: ["time"],
    };
    const valueSeriesSpec: ChartSpec = {
      chartType: "MultiLineChart",
      datasetId: wideDataset.id,
      encodings: { x: { field: "time", type: "temporal" } },
      cubeBinding: {
        version: 1,
        sourceId: `cube:${wideDataset.id}`,
        slots: {
          x: { kind: "dimension", dimensionId: "time" },
          y: { kind: "measure-set", measureIds: ["weight", "water", "fat", "muscle"] },
          series: { kind: "value-series", valueSlot: "y" },
        },
      },
    };

    const materialized = materializeCubeValueSeries(wideDataset, valueSeriesSpec);
    expect(materialized.dataset.rows).toHaveLength(8);
    expect(materialized.dataset.rows.slice(0, 4).map((row) => row[CUBE_MEASURE_ID_FIELD])).toEqual([
      "weight", "water", "fat", "muscle",
    ]);
    expect(materialized.dataset.rows.slice(0, 4).map((row) => row[CUBE_MEASURE_VALUE_FIELD])).toEqual([
      "80", "45", "18", "32",
    ]);
    expect(materialized.chartSpec.encodings.y).toEqual({ field: CUBE_MEASURE_VALUE_FIELD, type: "quantitative" });
    expect(materialized.chartSpec.series).toEqual({ field: CUBE_MEASURE_ID_FIELD, type: "nominal" });

    const prepared = prepareChartData("measure-series-chart", wideDataset, valueSeriesSpec);
    expect(prepared.dataset.rows).toHaveLength(8);
    expect(prepared.chartSpec.templateId).toBe("line");
  });
});
