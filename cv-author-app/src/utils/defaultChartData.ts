import type {
  ChartDataTransform,
  ChartSpec,
  CoordinateGuide,
  Dataset,
  SvgCandidate,
} from "../types";
import Papa from "papaparse";
import defaultChartDataCsv from "../../../data/default_chart_data.csv?raw";
import { getChartTemplateContract, normalizeChartTemplate } from "./chartTemplates";
import { prepareChartData } from "./chartDataPipeline";
import { renderDeterministicChart } from "./semanticRenderer";

export const DEFAULT_CHART_DATASET_ID = "builtin:default-cartesian-data";

const defaultRows = Papa.parse<Record<string, string>>(defaultChartDataCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

/**
 * One neutral, long-form table shared by the built-in chart templates.
 * It deliberately contains discrete, signed, quantitative, and size fields so
 * every core family can render without inventing family-specific sample data.
 */
export const defaultChartDataset: Dataset = {
  id: DEFAULT_CHART_DATASET_ID,
  name: "Default chart data",
  columns: [
    { name: "column", type: "ordinal" },
    { name: "group", type: "nominal" },
    { name: "value", type: "quantitative" },
    { name: "change", type: "quantitative" },
    { name: "x", type: "quantitative" },
    { name: "y", type: "quantitative" },
    { name: "magnitude", type: "quantitative" },
  ],
  rows: defaultRows,
  primaryKey: ["column", "group"],
};

function groupFilter(): ChartDataTransform[] {
  return [{
    id: "builtin-default:group-alpha",
    kind: "filter",
    mode: "values",
    field: "group",
    values: ["Alpha"],
    single: true,
    purpose: "filter",
  }];
}

export function supportsDefaultChartData(chartType: string) {
  const family = normalizeChartTemplate(chartType);
  return family === "bar"
    || family === "line"
    || family === "area"
    || family === "scatter"
    || family === "matrix"
    || family === "pie"
    || family === "donut";
}

export function isDefaultChartDataSpec(spec: ChartSpec | null | undefined) {
  return spec?.datasetId === DEFAULT_CHART_DATASET_ID;
}

/** Start a real-data binding while retaining only chart-local appearance. */
export function replaceDefaultDataBinding(spec: ChartSpec, datasetId: string): ChartSpec {
  if ((!isDefaultChartDataSpec(spec) && spec.defaultDataBinding !== true)
    || datasetId === DEFAULT_CHART_DATASET_ID) return spec;
  return {
    chartType: spec.chartType,
    templateId: spec.templateId ?? normalizeChartTemplate(spec.chartType) ?? undefined,
    datasetId,
    axisSwapped: spec.axisSwapped,
    encodings: {},
    styleTokens: spec.styleTokens,
    markGroups: spec.markGroups?.map((group) => ({
      ...group,
      memberKeys: [],
      sharedConfig: { ...group.sharedConfig },
    })),
  };
}

/** Complete initial bindings used by both template previews and new charts. */
export function createDefaultChartSpec(chartType: string): ChartSpec | null {
  const family = normalizeChartTemplate(chartType);
  if (!family || !supportsDefaultChartData(chartType)) return null;
  const normalized = chartType.replace(/[\s_-]/g, "").toLowerCase();
  const base: ChartSpec = {
    chartType,
    templateId: family,
    datasetId: DEFAULT_CHART_DATASET_ID,
    encodings: {},
  };

  if (family === "scatter") {
    return {
      ...base,
      encodings: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
        color: { field: "group", type: "nominal" },
        size: { field: "magnitude", type: "quantitative" },
      },
    };
  }
  if (family === "matrix") {
    return {
      ...base,
      encodings: {
        x: { field: "column", type: "ordinal" },
        y: { field: "group", type: "nominal" },
        color: { field: "value", type: "quantitative" },
      },
    };
  }
  if (family === "pie" || family === "donut") {
    return {
      ...base,
      encodings: {
        theta: { field: "value", type: "quantitative" },
        segment: { field: "column", type: "ordinal" },
      },
      dataTransforms: groupFilter(),
    };
  }

  const multiSeries = normalized === "multilinechart"
    || normalized === "groupedbarchart"
    || normalized === "stackedbarchart"
    || normalized === "divergentstackedbarchart"
    || normalized === "stackedareachart"
    || normalized === "streamgraph"
    || normalized === "horizonchart";
  const valueField = normalized.includes("divergent") ? "change" : "value";
  const seriesEncoding = { field: "group", type: "nominal" as const };
  return {
    ...base,
    encodings: {
      x: { field: "column", type: "ordinal" },
      y: { field: valueField, type: "quantitative" },
      ...(multiSeries ? { color: seriesEncoding } : {}),
    },
    ...(multiSeries ? { series: seriesEncoding, seriesFields: [seriesEncoding] } : {}),
    ...(!multiSeries ? { dataTransforms: groupFilter() } : {}),
  };
}

export function defaultChartSpecWithAppearance(chartSpec: ChartSpec, chartId: string) {
  const fallback = createDefaultChartSpec(chartSpec.chartType);
  if (!fallback) return null;
  const retainsDefaultSource = isDefaultChartDataSpec(chartSpec);
  return {
    ...fallback,
    axisSwapped: chartSpec.axisSwapped,
    axes: chartSpec.axes,
    styleTokens: chartSpec.styleTokens,
    ...(retainsDefaultSource ? {
      filters: chartSpec.filters,
      valueFilters: chartSpec.valueFilters,
      numericFilters: chartSpec.numericFilters,
      dataTransforms: chartSpec.dataTransforms,
    } : {}),
    markGroups: chartSpec.markGroups?.map((group) => ({
      ...group,
      id: `mark-group:${chartId}:${group.role}`,
      chartId,
      memberKeys: [...group.memberKeys],
      sharedConfig: { ...group.sharedConfig },
    })),
  } satisfies ChartSpec;
}

export function renderDefaultChartSvg(chartType: string, width = 320, height = 180) {
  const chartSpec = createDefaultChartSpec(chartType);
  const contract = getChartTemplateContract(chartType);
  if (!chartSpec || !contract) return null;
  const coordinateGuide: CoordinateGuide | null = contract.coordinateSystem === "Cartesian"
    ? {
      type: "Cartesian",
      origin: { x: 0, y: height },
      xDirection: 1,
      yDirection: -1,
    }
    : contract.coordinateSystem === "Polar"
      ? {
        type: "Polar",
        origin: { x: width / 2, y: height / 2 },
      }
      : null;
  const prepared = prepareChartData(
    `default-preview-${chartType}`,
    defaultChartDataset,
    chartSpec,
  );
  const result = renderDeterministicChart({
    chartId: `default-preview-${chartType}`,
    width,
    height,
    minX: 0,
    minY: 0,
    coordinateGuide,
    chartSpec: prepared.chartSpec,
    dataset: prepared.dataset,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-default-dataset-id="${DEFAULT_CHART_DATASET_ID}">${result.content}</svg>`;
}

export function createDefaultDataCandidate(
  candidate: Omit<SvgCandidate, "src" | "svgMarkup">,
): SvgCandidate {
  const svgMarkup = renderDefaultChartSvg(candidate.chartType);
  if (!svgMarkup) throw new Error(`No default data renderer for ${candidate.chartType}.`);
  return {
    ...candidate,
    svgMarkup,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
  };
}
