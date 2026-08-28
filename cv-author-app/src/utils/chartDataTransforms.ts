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

type TransformCacheEntry = {
  rows: Dataset["rows"];
  columns: Dataset["columns"];
  signature: string;
  result: Dataset;
};

const transformCache = new WeakMap<object, TransformCacheEntry[]>();

function transformSignature(transforms: ChartDataTransform[]) {
  return JSON.stringify(transforms);
}

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

function applyGroupValueOrder(
  rows: DataRow[],
  transform: Extract<ChartDataTransform, { kind: "order" }>,
) {
  const groups = new Map<string, { sourceIndex: number; total: number; count: number }>();
  rows.forEach((row, index) => {
    const group = row[transform.groupField] ?? "";
    const value = numericValue(row, transform.valueField);
    if (!group || value === null) return;
    const current = groups.get(group);
    if (current) {
      current.total += value;
      current.count += 1;
    } else {
      groups.set(group, { sourceIndex: index, total: value, count: 1 });
    }
  });
  const groupValue = (entry: [string, { total: number; count: number }]) =>
    transform.operation === "avg" ? entry[1].total / entry[1].count : entry[1].total;
  const byValue = (direction: "ascending" | "descending") =>
    (left: [string, { sourceIndex: number; total: number; count: number }], right: [string, { sourceIndex: number; total: number; count: number }]) => {
      const difference = groupValue(left) - groupValue(right);
      return (direction === "ascending" ? difference : -difference)
        || left[1].sourceIndex - right[1].sourceIndex;
    };
  const entries = Array.from(groups.entries());
  const retained = transform.limit === undefined
    ? entries
    : [...entries]
      .sort(byValue("descending"))
      .slice(0, Math.max(1, Math.floor(transform.limit)));
  const ordered = transform.direction === "source"
    ? [...retained].sort((left, right) => left[1].sourceIndex - right[1].sourceIndex)
    : [...retained].sort(byValue(transform.direction));
  const position = new Map(ordered.map(([group], index) => [group, index]));
  return rows
    .map((row, sourceIndex) => ({ row, sourceIndex, groupIndex: position.get(row[transform.groupField] ?? "") }))
    .filter((item): item is { row: DataRow; sourceIndex: number; groupIndex: number } => item.groupIndex !== undefined)
    .sort((left, right) => left.groupIndex - right.groupIndex || left.sourceIndex - right.sourceIndex)
    .map((item) => item.row);
}

function createBinLabeler(values: number[], transform: ChartBinAggregateTransform) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const parameter = Math.max(1, transform.parameter);

  if (transform.method === "fixed-width") {
    const width = parameter;
    return (value: number) => {
      const lower = Math.floor((value - minimum) / width) * width + minimum;
      const upper = lower + width;
      return `[${displayNumber(lower)}, ${displayNumber(upper)}${value === maximum ? "]" : ")"}`;
    };
  }

  if (transform.method === "quantile") {
    const binCount = Math.max(2, Math.floor(parameter));
    const sorted = [...values].sort((left, right) => left - right);
    const thresholds = Array.from({ length: binCount + 1 }, (_, index) =>
      sorted[Math.min(sorted.length - 1, Math.floor(index * sorted.length / binCount))] ?? minimum);
    thresholds[0] = minimum;
    thresholds[thresholds.length - 1] = maximum;
    return (value: number) => {
      let index = thresholds.findIndex((threshold, thresholdIndex) =>
        thresholdIndex > 0 && value <= threshold);
      if (index < 1) index = binCount;
      const lower = thresholds[index - 1] ?? minimum;
      const upper = thresholds[index] ?? maximum;
      return `[${displayNumber(lower)}, ${displayNumber(upper)}]`;
    };
  }

  const binCount = Math.max(2, Math.floor(parameter));
  if (minimum === maximum) {
    const label = `[${displayNumber(minimum)}, ${displayNumber(maximum)}]`;
    return () => label;
  }
  const width = (maximum - minimum) / binCount;
  return (value: number) => {
    const index = Math.min(binCount - 1, Math.floor((value - minimum) / width));
    const lower = minimum + index * width;
    const upper = index === binCount - 1 ? maximum : minimum + (index + 1) * width;
    return `[${displayNumber(lower)}, ${displayNumber(upper)}${index === binCount - 1 ? "]" : ")"}`;
  };
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

  if (transform.kind === "order") {
    if (!available.has(transform.groupField) || !available.has(transform.valueField)) return materialized;
    return { ...materialized, rows: applyGroupValueOrder(materialized.rows, transform) };
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
  const labelForValue = numericValues.length > 0
    ? createBinLabeler(numericValues, transform)
    : null;
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
        : labelForValue?.(value) ?? "",
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
  const signature = transformSignature(transforms);
  const cached = transformCache.get(dataset as object)?.find((entry) =>
    entry.rows === dataset.rows
      && entry.columns === dataset.columns
      && entry.signature === signature,
  );
  if (cached) return cached.result;
  const materialized = transforms.reduce<MaterializedChartData>(applyTransform, {
    columns: dataset.columns.map((column) => ({ ...column })),
    rows: dataset.rows,
  });
  const transformed = { ...dataset, ...materialized };
  const result = { ...transformed, primaryKey: retainedPrimaryKey(transformed) };
  const entries = transformCache.get(dataset as object) ?? [];
  entries.push({ rows: dataset.rows, columns: dataset.columns, signature, result });
  transformCache.set(dataset as object, entries);
  return result;
}
