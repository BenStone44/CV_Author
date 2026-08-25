import type {
  ChartBinAggregateTransform,
  ChartDataTransform,
  ChartNumericFilterTransform,
  DataColumn,
  DataRow,
  Dataset,
} from "../types";
import { inferCsvPrimaryKey } from "./csvDataEngine";

type MaterializedChartData = Pick<Dataset, "columns" | "rows">;

function numericValue(row: DataRow, field: string) {
  const rawValue = row[field]?.trim() ?? "";
  if (!rawValue) return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function applyNumericFilter(rows: DataRow[], transform: ChartNumericFilterTransform) {
  if (transform.operator === "top" || transform.operator === "bottom") {
    const count = Math.max(1, Math.floor(transform.value));
    const retainedIndexes = new Set(rows
      .map((row, index) => ({ index, value: numericValue(row, transform.field) }))
      .filter((item): item is { index: number; value: number } => item.value !== null)
      .sort((left, right) => transform.operator === "top"
        ? right.value - left.value || left.index - right.index
        : left.value - right.value || left.index - right.index)
      .slice(0, count)
      .map((item) => item.index));
    return rows.filter((_, index) => retainedIndexes.has(index));
  }

  return rows.filter((row) => {
    const value = numericValue(row, transform.field);
    if (value === null) return false;
    if (transform.operator === "gte") return value >= transform.value;
    if (transform.operator === "gt") return value > transform.value;
    if (transform.operator === "lte") return value <= transform.value;
    if (transform.operator === "lt") return value < transform.value;
    if (transform.operator === "eq") return value === transform.value;
    return value >= Math.min(transform.value, transform.upperValue ?? transform.value)
      && value <= Math.max(transform.value, transform.upperValue ?? transform.value);
  });
}

function displayNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.parseFloat(value.toPrecision(6)).toString();
}

function binLabel(value: number, values: number[], transform: ChartBinAggregateTransform) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const parameter = Math.max(1, transform.parameter);

  if (transform.method === "fixed-width") {
    const width = parameter;
    const lower = Math.floor((value - minimum) / width) * width + minimum;
    const upper = lower + width;
    return `[${displayNumber(lower)}, ${displayNumber(upper)}${value === maximum ? "]" : ")"}`;
  }

  if (transform.method === "quantile") {
    const binCount = Math.max(2, Math.floor(parameter));
    const sorted = [...values].sort((left, right) => left - right);
    const thresholds = Array.from({ length: binCount + 1 }, (_, index) =>
      sorted[Math.min(sorted.length - 1, Math.floor(index * sorted.length / binCount))] ?? minimum);
    thresholds[0] = minimum;
    thresholds[thresholds.length - 1] = maximum;
    let index = thresholds.findIndex((threshold, thresholdIndex) =>
      thresholdIndex > 0 && value <= threshold);
    if (index < 1) index = binCount;
    const lower = thresholds[index - 1] ?? minimum;
    const upper = thresholds[index] ?? maximum;
    return `[${displayNumber(lower)}, ${displayNumber(upper)}]`;
  }

  const binCount = Math.max(2, Math.floor(parameter));
  if (minimum === maximum) return `[${displayNumber(minimum)}, ${displayNumber(maximum)}]`;
  const width = (maximum - minimum) / binCount;
  const index = Math.min(binCount - 1, Math.floor((value - minimum) / width));
  const lower = minimum + index * width;
  const upper = index === binCount - 1 ? maximum : minimum + (index + 1) * width;
  return `[${displayNumber(lower)}, ${displayNumber(upper)}${index === binCount - 1 ? "]" : ")"}`;
}

function applyTransform(
  materialized: MaterializedChartData,
  transform: ChartDataTransform,
): MaterializedChartData {
  const available = new Map(materialized.columns.map((column) => [column.name, column]));

  if (transform.kind === "filter") {
    if (!available.has(transform.field)) return materialized;
    const rows = transform.mode === "values"
      ? materialized.rows.filter((row) => transform.values.includes(row[transform.field] ?? ""))
      : applyNumericFilter(materialized.rows, transform);
    return { ...materialized, rows };
  }

  if (transform.mode === "group") {
    const groupColumn = available.get(transform.groupField);
    if (!groupColumn || !available.has(transform.valueField)) return materialized;
    const groups = new Map<string, number[]>();
    materialized.rows.forEach((row) => {
      const groupValue = row[transform.groupField] ?? "";
      const values = groups.get(groupValue) ?? [];
      const value = numericValue(row, transform.valueField);
      if (value !== null) values.push(value);
      groups.set(groupValue, values);
    });
    const rows = Array.from(groups, ([groupValue, values]) => ({
      [transform.groupField]: groupValue,
      [transform.outputField]: values.length === 0
        ? ""
        : String(transform.operation === "sum"
          ? values.reduce((sum, value) => sum + value, 0)
          : values.reduce((sum, value) => sum + value, 0) / values.length),
    }));
    return {
      columns: [groupColumn, { name: transform.outputField, type: "quantitative" }],
      rows,
    };
  }

  if (!available.has(transform.field)) return materialized;
  const numericValues = materialized.rows
    .map((row) => numericValue(row, transform.field))
    .filter((value): value is number => value !== null);
  const columns: DataColumn[] = [
    ...materialized.columns.filter((column) => column.name !== transform.outputField),
    { name: transform.outputField, type: "ordinal" },
  ];
  const rows = materialized.rows.map((row) => {
    const value = numericValue(row, transform.field);
    return {
      ...row,
      [transform.outputField]: value === null || numericValues.length === 0
        ? ""
        : binLabel(value, numericValues, transform),
    };
  });
  return { columns, rows };
}

function retainedPrimaryKey(dataset: Dataset) {
  const fields = dataset.primaryKey ?? [];
  if (fields.length === 0 || dataset.rows.length === 0) return inferCsvPrimaryKey(dataset);
  const available = new Set(dataset.columns.map((column) => column.name));
  const keys = dataset.rows.map((row) => fields.map((field) => row[field]?.trim() ?? ""));
  const remainsUnique = fields.every((field) => available.has(field))
    && keys.every((values) => values.every(Boolean))
    && new Set(keys.map((values) => JSON.stringify(values))).size === dataset.rows.length;
  return remainsUnique ? fields : inferCsvPrimaryKey(dataset);
}

export function materializeChartDataTransforms(
  dataset: Dataset,
  transforms: ChartDataTransform[] | undefined,
): Dataset {
  if (!transforms?.length) return dataset;
  const materialized = transforms.reduce<MaterializedChartData>(applyTransform, {
    columns: dataset.columns.map((column) => ({ ...column })),
    rows: dataset.rows.map((row) => ({ ...row })),
  });
  const transformed = { ...dataset, ...materialized };
  return { ...transformed, primaryKey: retainedPrimaryKey(transformed) };
}
