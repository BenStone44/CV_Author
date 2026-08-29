import { describe, expect, it } from "vitest";
import {
  CSV_MEASURE_ID_FIELD,
  CSV_MEASURE_VALUE_FIELD,
  filterDatasetForChart,
  materializeCsvValueSeries,
  prepareChartData,
  synchronizeChartEncodingTypes,
} from "../utils/chartDataPipeline";
import type { ChartSpec, Dataset } from "../types";

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

  it("runs filtering, synchronization and explicit structure materialization in order", () => {
    const prepared = prepareChartData("chart-1", dataset, chartSpec);
    expect(prepared.dataset.rows).toHaveLength(1);
    expect(prepared.chartSpec.templateId).toBe("line");
    expect(prepared.chartSpec.encodings.y?.type).toBe("quantitative");
    expect(prepared.chartSpec.markGroups?.[0]?.chartId).toBe("chart-1");
  });

  it("does not infer an unused series column while preparing render data", () => {
    const repeatedDataset: Dataset = {
      ...dataset,
      rows: [
        { group: "A", time: "2026-01-01", value: "10" },
        { group: "B", time: "2026-01-01", value: "20" },
      ],
    };
    const prepared = prepareChartData("explicit-chart", repeatedDataset, {
      ...chartSpec,
      filters: undefined,
    });

    expect(prepared.chartSpec.series).toBeUndefined();
    expect(prepared.chartSpec.dimensionRecommendations).toBeUndefined();
  });

  it("automatically sums Theta after a categorical Pie Segment is selected", () => {
    const pieDataset: Dataset = {
      id: "pie-segments",
      name: "pie-segments.csv",
      columns: [
        { name: "id", type: "nominal" },
        { name: "group", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { id: "1", group: "A", value: "10" },
        { id: "2", group: "A", value: "5" },
        { id: "3", group: "B", value: "20" },
      ],
      primaryKey: ["id"],
    };
    const baseSpec: ChartSpec = {
      chartType: "PieChart",
      datasetId: pieDataset.id,
      encodings: {
        theta: { field: "value", type: "quantitative" },
        segment: { field: "group", type: "nominal" },
      },
    };

    const automatic = prepareChartData("pie-automatic", pieDataset, baseSpec);
    expect(automatic.chartSpec.aggregations).toEqual({ theta: "sum" });
    expect(automatic.chartSpec.autoAggregations).toEqual({ theta: "sum" });
    expect(automatic.chartSpec.markGroups?.[0]?.memberKeys).toEqual(["A", "B"]);

    const aggregated = prepareChartData("pie-aggregated", pieDataset, {
      ...baseSpec,
      aggregations: { theta: "sum" },
    });
    expect(aggregated.chartSpec.aggregations).toEqual({ theta: "sum" });
    expect(aggregated.chartSpec.autoAggregations).toBeUndefined();
    expect(aggregated.chartSpec.markGroups?.[0]?.memberKeys).toEqual(["A", "B"]);
  });

  it("materializes selected wide CSV fields as a reusable value series", () => {
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
      valueFields: ["weight", "water", "fat", "muscle"]
        .map((field) => ({ field, type: "quantitative" as const })),
    };

    const materialized = materializeCsvValueSeries(wideDataset, valueSeriesSpec);
    expect(materialized.dataset.rows).toHaveLength(8);
    expect(materialized.dataset.rows.slice(0, 4).map((row) => row[CSV_MEASURE_ID_FIELD])).toEqual([
      "weight", "water", "fat", "muscle",
    ]);
    expect(materialized.dataset.rows.slice(0, 4).map((row) => row[CSV_MEASURE_VALUE_FIELD])).toEqual([
      "80", "45", "18", "32",
    ]);
    expect(materialized.chartSpec.encodings.y).toEqual({ field: CSV_MEASURE_VALUE_FIELD, type: "quantitative" });
    expect(materialized.chartSpec.series).toEqual({ field: CSV_MEASURE_ID_FIELD, type: "nominal" });

    const prepared = prepareChartData("measure-series-chart", wideDataset, valueSeriesSpec);
    expect(prepared.dataset.rows).toHaveLength(8);
    expect(prepared.chartSpec.templateId).toBe("line");
  });

  it("materializes multiple Stacked Area and Streamgraph value columns as series", () => {
    const wideDataset: Dataset = {
      id: "stacked-area-values",
      name: "stacked-area-values.csv",
      columns: [
        { name: "time", type: "temporal" },
        { name: "planned", type: "quantitative" },
        { name: "actual", type: "quantitative" },
      ],
      rows: [
        { time: "2026-01-01", planned: "4", actual: "7" },
        { time: "2026-01-02", planned: "6", actual: "8" },
      ],
    };
    for (const chartType of ["StackedAreaChart", "Streamgraph"]) {
      const spec: ChartSpec = {
        chartType,
        datasetId: wideDataset.id,
        encodings: { x: { field: "time", type: "temporal" } },
        valueFields: ["planned", "actual"].map((field) => ({ field, type: "quantitative" as const })),
      };
      const result = materializeCsvValueSeries(wideDataset, spec);
      expect(result.dataset.rows).toHaveLength(4);
      expect(result.chartSpec.encodings.y?.field).toBe(CSV_MEASURE_VALUE_FIELD);
      expect(result.chartSpec.encodings.color?.field).toBe(CSV_MEASURE_ID_FIELD);
      expect(result.chartSpec.series?.field).toBe(CSV_MEASURE_ID_FIELD);
    }
  });

  it("materializes multiple Stacked Bar segment columns to the standard color channel", () => {
    const wideDataset: Dataset = {
      id: "stacked-bars",
      name: "stacked-bars.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "planned", type: "quantitative" },
        { name: "actual", type: "quantitative" },
      ],
      rows: [
        { category: "A", planned: "10", actual: "7" },
        { category: "B", planned: "12", actual: "9" },
      ],
      primaryKey: ["category"],
    };
    const spec: ChartSpec = {
      chartType: "StackedBarChart",
      datasetId: wideDataset.id,
      encodings: { x: { field: "category", type: "nominal" } },
      valueFields: ["planned", "actual"].map((field) => ({ field, type: "quantitative" as const })),
    };
    const materialized = materializeCsvValueSeries(wideDataset, spec);
    expect(materialized.dataset.rows).toHaveLength(4);
    expect(materialized.chartSpec.encodings.y).toEqual({ field: CSV_MEASURE_VALUE_FIELD, type: "quantitative" });
    expect(materialized.chartSpec.encodings.color).toEqual({ field: CSV_MEASURE_ID_FIELD, type: "nominal" });
    expect(materialized.chartSpec.series).toEqual({ field: CSV_MEASURE_ID_FIELD, type: "nominal" });
  });

  it("keeps categorical segment fields when materializing stacked measures", () => {
    const wideDataset: Dataset = {
      id: "stacked-bars-with-segment",
      name: "stacked-bars-with-segment.csv",
      columns: [
        { name: "category", type: "nominal" },
        { name: "region", type: "nominal" },
        { name: "planned", type: "quantitative" },
        { name: "actual", type: "quantitative" },
      ],
      rows: [
        { category: "A", region: "East", planned: "10", actual: "7" },
        { category: "A", region: "West", planned: "8", actual: "9" },
      ],
      primaryKey: ["category", "region"],
    };
    const materialized = materializeCsvValueSeries(wideDataset, {
      chartType: "StackedBarChart",
      datasetId: wideDataset.id,
      encodings: { x: { field: "category", type: "nominal" } },
      seriesFields: [{ field: "region", type: "nominal" }],
      valueFields: ["planned", "actual"].map((field) => ({ field, type: "quantitative" as const })),
    });
    expect(materialized.chartSpec.seriesFields?.map((encoding) => encoding.field)).toEqual([
      "region", CSV_MEASURE_ID_FIELD,
    ]);
  });

  it("does not claim the derived measure field is a row key without a source key", () => {
    const keylessDataset: Dataset = {
      id: "keyless-wide",
      name: "keyless-wide.csv",
      columns: [
        { name: "period", type: "temporal" },
        { name: "first", type: "quantitative" },
        { name: "second", type: "quantitative" },
      ],
      rows: [
        { period: "2026-01-01", first: "10", second: "20" },
        { period: "2026-02-01", first: "11", second: "21" },
      ],
    };
    const spec: ChartSpec = {
      chartType: "MultiLineChart",
      datasetId: keylessDataset.id,
      encodings: { x: { field: "period", type: "temporal" } },
      valueFields: ["first", "second"].map((field) => ({
        field,
        type: "quantitative" as const,
      })),
    };

    const materialized = materializeCsvValueSeries(keylessDataset, spec);

    expect(materialized.dataset.primaryKey).not.toEqual([CSV_MEASURE_ID_FIELD]);
    expect(new Set(materialized.dataset.rows.map((row) =>
      (materialized.dataset.primaryKey ?? []).map((field) => row[field]).join("|"),
    )).size).not.toBe(2);
  });
});
