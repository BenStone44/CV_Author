import { inferChartStructure } from "./dimensionInference";
import { normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";
import { inferCsvPrimaryKey } from "./csvDataEngine";
import type { ChartEncoding, ChartSpec, Dataset } from "../types";

export const CSV_MEASURE_ID_FIELD = "__csv_measure__";
export const CSV_MEASURE_VALUE_FIELD = "__csv_value__";

export function rowMatchesChartFilters(
  row: Dataset["rows"][number],
  spec: ChartSpec,
) {
  const matchesSelection = Object.entries(spec.filters ?? {})
    .every(([field, value]) => row[field] === value);
  if (!matchesSelection) return false;
  return Object.entries(spec.valueFilters ?? {})
    .every(([field, values]) => values.includes(row[field] ?? ""));
}

export function filterDatasetForChart(dataset: Dataset, spec: ChartSpec): Dataset {
  const hasFilters = Object.keys(spec.filters ?? {}).length > 0
    || Object.keys(spec.valueFilters ?? {}).length > 0;
  if (!hasFilters) return dataset;
  return {
    ...dataset,
    rows: dataset.rows.filter((row) => rowMatchesChartFilters(row, spec)),
  };
}

/** Materializes selected wide CSV value columns as ordinary long-form rows. */
export function materializeCsvValueSeries(dataset: Dataset, spec: ChartSpec) {
  const template = normalizeChartTemplate(spec.chartType);
  const barVariant = template === "bar" ? normalizeBarChartVariant(spec.chartType) : null;
  const supportsMeasureSeries = template === "line"
    || template === "area"
    || barVariant === "grouped"
    || barVariant === "stacked"
    || barVariant === "divergent-stacked";
  if (!supportsMeasureSeries) return { dataset, chartSpec: spec };
  const available = new Set(dataset.columns.map((column) => column.name));
  const measureIds = Array.from(new Set(spec.valueFields?.map((encoding) => encoding.field) ?? []))
    .filter((field) => available.has(field));
  if (measureIds.length < 2) return { dataset, chartSpec: spec };
  const rows = dataset.rows.flatMap((row) => measureIds.flatMap((measureId) => {
    const rawValue = row[measureId];
    if (rawValue === undefined || rawValue.trim() === "" || !Number.isFinite(Number(rawValue))) return [];
    return [{
      ...row,
      [CSV_MEASURE_ID_FIELD]: measureId,
      [CSV_MEASURE_VALUE_FIELD]: rawValue,
    }];
  }));
  const materializedDatasetWithoutKey: Dataset = {
    ...dataset,
    columns: [
      ...dataset.columns.filter((column) => column.name !== CSV_MEASURE_ID_FIELD && column.name !== CSV_MEASURE_VALUE_FIELD),
      { name: CSV_MEASURE_ID_FIELD, type: "nominal" },
      { name: CSV_MEASURE_VALUE_FIELD, type: "quantitative" },
    ],
    rows,
  };
  const sourceKey = dataset.primaryKey?.length ? dataset.primaryKey : undefined;
  const materializedDataset: Dataset = {
    ...materializedDatasetWithoutKey,
    primaryKey: sourceKey
      ? Array.from(new Set([...sourceKey, CSV_MEASURE_ID_FIELD]))
      : inferCsvPrimaryKey(materializedDatasetWithoutKey),
  };
  const seriesEncoding = { field: CSV_MEASURE_ID_FIELD, type: "nominal" as const };
  const priorSeriesFields = spec.seriesFields?.length
    ? spec.seriesFields
    : spec.series
      ? [spec.series]
      : [];
  const seriesFields = Array.from(new Map(
    [...priorSeriesFields, seriesEncoding].map((encoding) => [encoding.field, encoding]),
  ).values());
  return {
    dataset: materializedDataset,
    chartSpec: {
      ...spec,
      encodings: {
        ...spec.encodings,
        y: { field: CSV_MEASURE_VALUE_FIELD, type: "quantitative" as const },
        color: seriesEncoding,
      },
      series: seriesFields[0] ?? seriesEncoding,
      seriesFields,
    },
  };
}

function synchronizeEncodingType(
  encoding: ChartEncoding | undefined,
  dataset: Dataset,
) {
  if (!encoding) return undefined;
  const column = dataset.columns.find((item) => item.name === encoding.field);
  return column ? { ...encoding, type: column.type } : encoding;
}

export function synchronizeChartEncodingTypes(spec: ChartSpec, dataset: Dataset): ChartSpec {
  const encodings = Object.fromEntries(
    (Object.entries(spec.encodings) as Array<[string, ChartEncoding | undefined]>)
      .map(([channel, encoding]) => [channel, synchronizeEncodingType(encoding, dataset)]),
  ) as ChartSpec["encodings"];
  const angleFields = spec.angleFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const parallelFields = spec.parallelFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const valueFields = spec.valueFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const seriesFields = spec.seriesFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const componentRadiusFields = spec.componentRadiusFields
    ? Object.fromEntries(Object.entries(spec.componentRadiusFields)
      .map(([field, encoding]) => [field, synchronizeEncodingType(encoding, dataset)] as const)
      .filter((entry): entry is readonly [string, ChartEncoding] => !!entry[1]))
    : undefined;
  const seriesColumn = dataset.columns.find((item) => item.name === spec.series?.field);

  return {
    ...spec,
    encodings,
    angleFields,
    parallelFields,
    valueFields,
    seriesFields,
    componentRadiusFields,
    series: spec.series && seriesColumn
      ? { ...spec.series, type: seriesColumn.type }
      : spec.series,
  };
}

export function prepareChartData(
  chartId: string,
  sourceDataset: Dataset,
  spec: ChartSpec,
) {
  const filteredDataset = filterDatasetForChart(sourceDataset, spec);
  const materialized = materializeCsvValueSeries(filteredDataset, spec);
  const dataset = materialized.dataset;
  const synchronizedSpec = synchronizeChartEncodingTypes(materialized.chartSpec, dataset);
  return {
    dataset,
    chartSpec: inferChartStructure(chartId, dataset, synchronizedSpec),
  };
}
