import type {
  ChartDataTransform,
  ChartSpec,
  CoordinateGuide,
  Dataset,
  SvgCandidate,
} from "../types";
import Papa from "papaparse";
import defaultChartDataCsv from "../../../data/default_chart_data.csv?raw";
import defaultTreeDataCsv from "../../../data/tree_nodes.csv?raw";
import defaultGraphNodesCsv from "../../../data/nodes.csv?raw";
import defaultGraphEdgesCsv from "../../../data/edges.csv?raw";
import defaultChordNodesCsv from "../../../data/chord_nodes.csv?raw";
import defaultChordEdgesCsv from "../../../data/chord_edges.csv?raw";
import d3HexbinDiamondsCsv from "../../../data/d3_hexbin_diamonds.csv?raw";
import case2GraphNodesCsv from "../../../data/case2_graph_nodes.csv?raw";
import case2GraphLinksCsv from "../../../data/case2_graph_links.csv?raw";
import hexbinGraphNodesCsv from "../../../data/hexbin_graph_nodes.csv?raw";
import hexbinGraphLinksCsv from "../../../data/hexbin_graph_links.csv?raw";
import { getChartTemplateContract, normalizeChartTemplate } from "./chartTemplates";
import { prepareChartData } from "./chartDataPipeline";
import { renderDeterministicChart } from "./semanticRenderer";

export const DEFAULT_CHART_DATASET_ID = "builtin:default-cartesian-data";
export const DEFAULT_TREE_DATASET_ID = "builtin:default-tree-data";
export const DEFAULT_GRAPH_DATASET_ID = "builtin:default-force-graph-data";
export const DEFAULT_CHORD_DATASET_ID = "builtin:default-chord-data";
export const DEFAULT_HEXBIN_DATASET_ID = "builtin:d3-hexbin-diamonds";
export const CASE2_GRAPH_DATASET_ID = "builtin:case2-station-graph";
export const HEXBIN_GRAPH_DATASET_ID = "builtin:hexbin-spread-graph";

const defaultRows = Papa.parse<Record<string, string>>(defaultChartDataCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const defaultTreeRows = Papa.parse<Record<string, string>>(defaultTreeDataCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const defaultGraphNodeRows = Papa.parse<Record<string, string>>(defaultGraphNodesCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const defaultGraphEdgeRows = Papa.parse<Record<string, string>>(defaultGraphEdgesCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const defaultChordNodeRows = Papa.parse<Record<string, string>>(defaultChordNodesCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const defaultChordEdgeRows = Papa.parse<Record<string, string>>(defaultChordEdgesCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const defaultHexbinRows = Papa.parse<Record<string, string>>(d3HexbinDiamondsCsv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;
const case2GraphNodeRows = Papa.parse<Record<string, string>>(case2GraphNodesCsv, { header: true, skipEmptyLines: "greedy" }).data;
const case2GraphLinkRows = Papa.parse<Record<string, string>>(case2GraphLinksCsv, { header: true, skipEmptyLines: "greedy" }).data;
const hexbinGraphNodeRows = Papa.parse<Record<string, string>>(hexbinGraphNodesCsv, { header: true, skipEmptyLines: "greedy" }).data;
const hexbinGraphLinkRows = Papa.parse<Record<string, string>>(hexbinGraphLinksCsv, { header: true, skipEmptyLines: "greedy" }).data;

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

/** Complete diamonds attachment used by the Observable D3 Hexbin example. */
export const defaultHexbinDataset: Dataset = {
  id: DEFAULT_HEXBIN_DATASET_ID,
  name: "D3 Hexbin diamonds",
  columns: [
    { name: "carat", type: "quantitative" },
    { name: "price", type: "quantitative" },
  ],
  rows: defaultHexbinRows,
};

/** Ten station nodes joined to NYC ZIP geometries through the point ID field. */
export const case2GraphDataset: Dataset = {
  id: CASE2_GRAPH_DATASET_ID,
  name: "case2 station graph",
  columns: [],
  rows: [],
  graph: {
    nodes: { columns: [
      { name: "id", type: "nominal" }, { name: "point", type: "nominal" },
      { name: "label", type: "nominal" }, { name: "station_type", type: "nominal" },
    ], rows: case2GraphNodeRows },
    edges: { columns: [{ name: "source", type: "nominal" }, { name: "target", type: "nominal" }, { name: "value", type: "quantitative" }], rows: case2GraphLinkRows },
  },
};

/** Six-area hexbin spread graph with leader -> middle -> normal links. */
export const hexbinGraphDataset: Dataset = {
  id: HEXBIN_GRAPH_DATASET_ID,
  name: "Hexbin spread graph",
  columns: [],
  rows: [],
  graph: {
    nodes: { columns: [
      { name: "hex_id", type: "nominal" }, { name: "x", type: "quantitative" }, { name: "y", type: "quantitative" },
      { name: "arealabel", type: "nominal" }, { name: "typelabel", type: "nominal" }, { name: "weight", type: "quantitative" },
    ], rows: hexbinGraphNodeRows },
    edges: { columns: [{ name: "source", type: "nominal" }, { name: "target", type: "nominal" }, { name: "value", type: "quantitative" }], rows: hexbinGraphLinkRows },
  },
};

/** A shared parent-linked hierarchy used by every built-in tree template. */
export const defaultTreeDataset: Dataset = {
  id: DEFAULT_TREE_DATASET_ID,
  name: "Default tree data",
  columns: [
    { name: "node_id", type: "nominal" },
    { name: "parent_id", type: "nominal" },
    { name: "label", type: "nominal" },
    { name: "weight", type: "quantitative" },
    { name: "metric_1", type: "quantitative" },
    { name: "metric_2", type: "quantitative" },
    { name: "metric_3", type: "quantitative" },
    { name: "metric_4", type: "quantitative" },
    { name: "metric_5", type: "quantitative" },
  ],
  rows: defaultTreeRows,
  primaryKey: ["node_id"],
};

/** A graph dataset with separate node and edge tables for network templates. */
export const defaultGraphDataset: Dataset = {
  id: DEFAULT_GRAPH_DATASET_ID,
  name: "Default force graph data",
  columns: [],
  rows: [],
  graph: {
    nodes: {
      columns: [
        { name: "id", type: "nominal" },
        { name: "group", type: "nominal" },
        { name: "size", type: "quantitative" },
        { name: "label", type: "nominal" },
      ],
      rows: defaultGraphNodeRows,
    },
    edges: {
      columns: [
        { name: "source", type: "nominal" },
        { name: "target", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: defaultGraphEdgeRows,
    },
  },
};

/** The four-way directed relationship matrix from Observable's Chord diagram II. */
export const defaultChordDataset: Dataset = {
  id: DEFAULT_CHORD_DATASET_ID,
  name: "Observable Chord diagram II data",
  columns: [],
  rows: [],
  graph: {
    nodes: {
      columns: [
        { name: "id", type: "nominal" },
        { name: "label", type: "nominal" },
      ],
      rows: defaultChordNodeRows,
    },
    edges: {
      columns: [
        { name: "source", type: "nominal" },
        { name: "target", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: defaultChordEdgeRows,
    },
  },
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
  const normalized = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return family === "bar"
    || family === "line"
    || family === "area"
    || family === "parallel"
    || family === "scatter"
    || family === "matrix"
    || family === "hexbin"
    || family === "pie"
    || family === "donut"
    || (family === "flow" && normalized.includes("chord"))
    || normalized.includes("graphlink")
    || family === "hierarchy"
    || normalized === "forcedirectedgraph";
}

export function defaultDatasetForChartType(chartType: string): Dataset {
  const normalized = chartType.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized.includes("graphlink")) return case2GraphDataset;
  if (normalizeChartTemplate(chartType) === "hexbin") return defaultHexbinDataset;
  if (normalizeChartTemplate(chartType) === "hierarchy") return defaultTreeDataset;
  if (normalized === "forcedirectedgraph") return defaultGraphDataset;
  if (normalized === "chord") return defaultChordDataset;
  return defaultChartDataset;
}

export function isDefaultChartDataSpec(spec: ChartSpec | null | undefined) {
  return spec?.datasetId === DEFAULT_CHART_DATASET_ID
    || spec?.datasetId === DEFAULT_TREE_DATASET_ID
    || spec?.datasetId === DEFAULT_GRAPH_DATASET_ID
    || spec?.datasetId === DEFAULT_CHORD_DATASET_ID
    || spec?.datasetId === DEFAULT_HEXBIN_DATASET_ID
    || spec?.datasetId === CASE2_GRAPH_DATASET_ID
    || spec?.datasetId === HEXBIN_GRAPH_DATASET_ID;
}

/** Start a real-data binding while retaining only chart-local appearance. */
export function replaceDefaultDataBinding(spec: ChartSpec, datasetId: string): ChartSpec {
  if ((!isDefaultChartDataSpec(spec) && spec.defaultDataBinding !== true)
    || datasetId === defaultDatasetForChartType(spec.chartType).id) return spec;
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

  if (family === "hierarchy") {
    return {
      ...base,
      datasetId: DEFAULT_TREE_DATASET_ID,
      encodings: {
        key: { field: "node_id", type: "nominal" },
        parent: { field: "parent_id", type: "nominal" },
        value: { field: "weight", type: "quantitative" },
        ...(normalized === "dendrogram"
          ? { category: { field: "label", type: "nominal" as const } }
          : {}),
      },
    };
  }

  if (normalized === "forcedirectedgraph") {
    return {
      ...base,
      datasetId: DEFAULT_GRAPH_DATASET_ID,
      encodings: {
        key: { field: "id", type: "nominal" },
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "value", type: "quantitative" },
        color: { field: "group", type: "nominal" },
        size: { field: "size", type: "quantitative" },
      },
    };
  }

  if (normalized.includes("graphlink")) {
    return {
      ...base,
      datasetId: CASE2_GRAPH_DATASET_ID,
      encodings: {
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    };
  }

  if (normalized === "chord") {
    return {
      ...base,
      datasetId: DEFAULT_CHORD_DATASET_ID,
      encodings: {
        source: { field: "source", type: "nominal" },
        target: { field: "target", type: "nominal" },
        value: { field: "value", type: "quantitative" },
      },
    };
  }

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
  if (family === "hexbin") {
    return {
      ...base,
      datasetId: DEFAULT_HEXBIN_DATASET_ID,
      encodings: {
        x: { field: "carat", type: "quantitative" },
        y: { field: "price", type: "quantitative" },
      },
    };
  }
  if (family === "parallel") {
    return {
      ...base,
      encodings: {
        color: { field: "group", type: "nominal" },
      },
      parallelFields: [
        { field: "column", type: "ordinal" },
        { field: "group", type: "nominal" },
        { field: "value", type: "quantitative" },
        { field: "change", type: "quantitative" },
        { field: "magnitude", type: "quantitative" },
      ],
    };
  }
  if (family === "pie" || family === "donut") {
    return {
      ...base,
      encodings: {
        segment: { field: "column", type: "ordinal" },
        theta: { field: "value", type: "quantitative" },
      },
      aggregations: { theta: "sum" },
      dataTransforms: groupFilter(),
    };
  }
  if (normalized === "radialbarchart") {
    return {
      ...base,
      encodings: {
        segment: { field: "column", type: "ordinal" },
        radius: { field: "value", type: "quantitative" },
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

export function renderDefaultChartSvg(
  chartType: string,
  width = 320,
  height = normalizeChartTemplate(chartType) === "area" ? width / 2 : 180,
) {
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
  const defaultDataset = defaultDatasetForChartType(chartType);
  const prepared = prepareChartData(
    `default-preview-${chartType}`,
    defaultDataset,
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
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-default-dataset-id="${defaultDataset.id}">${result.content}</svg>`;
  return stripSvgTextElements(markup);
}

/** Remove visible text from catalog previews while preserving chart geometry. */
export function stripSvgTextElements(markup: string) {
  return markup
    .replace(/<text\b[^>]*>[\s\S]*?<\/text\s*>/gi, "")
    .replace(/<text\b[^>]*\/\s*>/gi, "");
}

export function createDefaultDataCandidate(
  candidate: Omit<SvgCandidate, "src" | "svgMarkup">,
): SvgCandidate {
  const renderedMarkup = renderDefaultChartSvg(candidate.chartType);
  if (!renderedMarkup) throw new Error(`No default data renderer for ${candidate.chartType}.`);
  const svgMarkup = stripSvgTextElements(renderedMarkup);
  return {
    ...candidate,
    svgMarkup,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
  };
}
