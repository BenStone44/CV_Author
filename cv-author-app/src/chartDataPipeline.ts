import { inferChartStructure } from "./dimensionInference";
import { normalizeChartTemplate } from "./chartTemplates";
import { cubeResultFromDataset } from "./cubeModel";
import type { ChartEncoding, ChartSpec, Dataset } from "./types";

export const CUBE_MEASURE_ID_FIELD = "__cube_measure__";
export const CUBE_MEASURE_VALUE_FIELD = "__cube_value__";

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

/**
 * Materializes a Cube measure set as ordinary long-form rows. The synthetic
 * fields are renderer details; cubeBinding remains the semantic source.
 */
export function materializeCubeValueSeries(dataset: Dataset, spec: ChartSpec) {
  const template = normalizeChartTemplate(spec.chartType);
  if (template !== "line" && template !== "area") return { dataset, chartSpec: spec };
  const value = spec.cubeBinding?.slots.y;
  const series = spec.cubeBinding?.slots.series;
  if (value?.kind !== "measure-set" || series?.kind !== "value-series" || series.valueSlot !== "y") {
    return { dataset, chartSpec: spec };
  }

  const selected = Array.from(new Set(value.measureIds));
  const cube = cubeResultFromDataset(dataset);
  const available = new Set(cube.schema.measures.map((measure) => measure.id));
  const measureIds = selected.filter((measureId) => available.has(measureId));
  const rows = dataset.rows.flatMap((row) => measureIds.flatMap((measureId) => {
    const rawValue = row[measureId];
    if (rawValue === undefined || rawValue.trim() === "" || !Number.isFinite(Number(rawValue))) return [];
    return [{
      ...row,
      [CUBE_MEASURE_ID_FIELD]: measureId,
      [CUBE_MEASURE_VALUE_FIELD]: rawValue,
    }];
  }));
  const materializedDataset: Dataset = {
    ...dataset,
    columns: [
      ...dataset.columns.filter((column) => column.name !== CUBE_MEASURE_ID_FIELD && column.name !== CUBE_MEASURE_VALUE_FIELD),
      { name: CUBE_MEASURE_ID_FIELD, type: "nominal" },
      { name: CUBE_MEASURE_VALUE_FIELD, type: "quantitative" },
    ],
    rows,
    primaryKey: dataset.primaryKey?.includes(CUBE_MEASURE_ID_FIELD)
      ? dataset.primaryKey
      : [...(dataset.primaryKey ?? []), CUBE_MEASURE_ID_FIELD],
  };
  const seriesEncoding = { field: CUBE_MEASURE_ID_FIELD, type: "nominal" as const };
  return {
    dataset: materializedDataset,
    chartSpec: {
      ...spec,
      encodings: {
        ...spec.encodings,
        y: { field: CUBE_MEASURE_VALUE_FIELD, type: "quantitative" as const },
        color: seriesEncoding,
      },
      series: seriesEncoding,
      seriesFields: [seriesEncoding],
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
  const materialized = materializeCubeValueSeries(filteredDataset, spec);
  const dataset = materialized.dataset;
  const synchronizedSpec = synchronizeChartEncodingTypes(materialized.chartSpec, dataset);
  return {
    dataset,
    chartSpec: inferChartStructure(chartId, dataset, synchronizedSpec),
  };
}
