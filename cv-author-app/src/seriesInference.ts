import { group } from "d3-array";
import type { ChartSpec, Dataset, SeriesCandidate } from "./types";

function parseXValue(value: string, type: "nominal" | "temporal" | "quantitative") {
  if (type === "temporal") {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? String(timestamp) : null;
  }
  if (type === "quantitative") {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : null;
  }
  return value.trim() || null;
}

export function scoreSeriesCandidates(dataset: Dataset, chartSpec: ChartSpec): SeriesCandidate[] {
  const xEncoding = chartSpec.encodings.x;
  const excludedFields = new Set([
    chartSpec.encodings.x?.field,
    chartSpec.encodings.y?.field,
  ].filter((field): field is string => !!field));
  if (!xEncoding) return [];

  const validRows = dataset.rows.filter((row) => parseXValue(row[xEncoding.field] ?? "", xEncoding.type) !== null);
  const completeXDomain = new Set(
    validRows
      .map((row) => parseXValue(row[xEncoding.field] ?? "", xEncoding.type))
      .filter((value): value is string => value !== null),
  );
  if (completeXDomain.size < 2) return [];

  return dataset.columns
    .filter((column) => column.type === "nominal" && !excludedFields.has(column.name))
    .map((column, columnIndex) => {
      const groups = group(
        validRows.filter((row) => (row[column.name] ?? "").trim() !== ""),
        (row) => row[column.name]!,
      );
      const groupRows = Array.from(groups.values());
      const groupCount = groupRows.length;
      if (groupCount < 2 || groupRows.length === 0) return null;

      const groupMetrics = groupRows.map((rows) => {
        const xValues = rows
          .map((row) => parseXValue(row[xEncoding.field] ?? "", xEncoding.type))
          .filter((value): value is string => value !== null);
        const uniqueXValues = new Set(xValues);
        return {
          size: rows.length,
          coverage: uniqueXValues.size / completeXDomain.size,
          uniqueness: rows.length === 0 ? 0 : uniqueXValues.size / rows.length,
          hasMultiplePoints: uniqueXValues.size >= 2 ? 1 : 0,
        };
      });
      const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      const coverage = average(groupMetrics.map((metric) => metric.coverage));
      const xUniqueness = average(groupMetrics.map((metric) => metric.uniqueness));
      const multiplePointRate = average(groupMetrics.map((metric) => metric.hasMultiplePoints));
      const averageGroupSize = average(groupMetrics.map((metric) => metric.size));
      const groupCountFit = groupCount <= 12 ? 1 : Math.max(0, 1 - (groupCount - 12) / 28);
      const score = coverage * 0.35
        + xUniqueness * 0.25
        + multiplePointRate * 0.25
        + groupCountFit * 0.15;

      return {
        field: column.name,
        score,
        groupCount,
        averageGroupSize,
        coverage,
        xUniqueness,
        columnIndex,
      };
    })
    .filter((candidate): candidate is SeriesCandidate & { columnIndex: number } => candidate !== null)
    .sort((left, right) => right.score - left.score || left.columnIndex - right.columnIndex)
    .map(({ columnIndex: _columnIndex, ...candidate }) => candidate);
}
