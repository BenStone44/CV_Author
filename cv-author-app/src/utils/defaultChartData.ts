import type {
  ChartDataTransform,
  ChartSpec,
  CoordinateGuide,
  Dataset,
  SvgCandidate,
} from "../types";
import Papa from "papaparse";
import case1Csv from "../../public/site/gallery/cases/_editor-samples/data/case1.csv?raw";
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

const defaultRows = Papa.parse<Record<string, string>>(case1Csv, {
  header: true,
  skipEmptyLines: "greedy",
}).data;

const treeNodes = [
  ["root", "", "Global"],
  ["north", "root", "North"], ["south", "root", "South"],
  ["north_a", "north", "North A"], ["north_b", "north", "North B"],
  ["south_a", "south", "South A"], ["south_b", "south", "South B"],
  ["north_a_1", "north_a", "North A1"], ["north_a_2", "north_a", "North A2"],
  ["north_b_1", "north_b", "North B1"], ["north_b_2", "north_b", "North B2"],
  ["south_a_1", "south_a", "South A1"], ["south_a_2", "south_a", "South A2"],
  ["south_b_1", "south_b", "South B1"], ["south_b_2", "south_b", "South B2"],
] as const;
const defaultTreeRows = treeNodes.flatMap(([nodeId, parentId, label], nodeIndex) =>
  Array.from({ length: 12 }, (_, monthIndex) => ({
    node_id: nodeId,
    parent_id: parentId,
    label,
    month: `2025-${String(monthIndex + 1).padStart(2, "0")}`,
    weight: String(100 - nodeIndex * 3),
    metric_1: String((monthIndex + 1) * 5 + nodeIndex),
    metric_2: String((13 - monthIndex) * 4 + nodeIndex),
    metric_3: String((monthIndex + 1) * 3 + nodeIndex + 2),
    metric_4: String((13 - monthIndex) * 30 + nodeIndex + 3),
    metric_5: String((monthIndex + 1) * 2 + nodeIndex + 1),
  })),
);

const defaultGraphNodeRows = ["Ada", "Bruno", "Cleo", "Dara", "Eli", "Faye"].map((id, index) => ({
  id,
  group: String(index % 3 + 1),
  size: String(8 + index * 2),
  label: id,
}));
const defaultGraphEdgeRows = defaultGraphNodeRows.flatMap((node, index) => [1, 2].map((offset) => ({
  source: node.id,
  target: defaultGraphNodeRows[(index + offset) % defaultGraphNodeRows.length]!.id,
  value: String(1 + (index + offset) % 5),
})));
const chordIds = ["black", "blond", "brown", "red"];
const defaultChordNodeRows = chordIds.map((id) => ({ id, label: id }));
const defaultChordEdgeRows = chordIds.flatMap((source, sourceIndex) => chordIds.map((target, targetIndex) => ({
  source,
  target,
  value: String(3200 + ((sourceIndex + 2) * (targetIndex + 3) * 977) % 9000),
})));
const defaultHexbinRows = Array.from({ length: 1200 }, (_, index) => ({
  carat: (0.2 + (index % 120) / 30).toFixed(2),
  price: String(300 + ((index * 137) % 18200)),
}));
const geoPointIds = ["10307", "11231", "11224", "10021", "10027", "10458", "11368", "11432", "11691", "11201"];
const case2GraphNodeRows = geoPointIds.flatMap((id, pointIndex) => Array.from({ length: 12 }, (_, monthIndex) => ({
  id,
  point: id,
  label: `Station ${pointIndex + 1}`,
  station_type: pointIndex % 2 ? "Transit" : "Residential",
  month: String(monthIndex + 1),
  pedestrian_trips: String(150 + pointIndex * 19 + monthIndex * 7),
  bicycle_trips: String(30 + pointIndex * 5 + monthIndex * 4),
  transit_rides: String(210 + pointIndex * 23 + monthIndex * 9),
  vehicle_trips: String(340 + pointIndex * 17 + monthIndex * 11),
  delivery_trips: String(70 + pointIndex * 6 + monthIndex * 3),
})));
const case2GraphLinkRows = Array.from({ length: 13 }, (_, index) => ({
  source: geoPointIds[index % geoPointIds.length]!,
  target: geoPointIds[(index * 3 + 1) % geoPointIds.length]!,
  value: String(index % 5 + 1),
}));
const hexbinGraphNodeRows = Array.from({ length: 180 }, (_, index) => {
  const areaIndex = Math.floor(index / 30);
  const localIndex = index % 30;
  const row = Math.floor(index / 15);
  const column = index % 15;
  return {
    hex_id: `hex-${row}-${column}`,
    x: (column * 1.05).toFixed(2),
    y: (row * 0.91).toFixed(2),
    arealabel: `Area-${areaIndex + 1}`,
    typelabel: localIndex === 0 ? "leader" : localIndex <= 10 ? "middle" : "normal",
    weight: String(1 + (index * 7) % 12),
  };
});
const hexbinGraphLinkRows = Array.from({ length: 6 }, (_, areaIndex) => Array.from({ length: 10 }, (_, offset) => {
  const leader = hexbinGraphNodeRows[areaIndex * 30]!;
  const middle = hexbinGraphNodeRows[areaIndex * 30 + offset + 1]!;
  const normal = hexbinGraphNodeRows[areaIndex * 30 + 11 + offset]!;
  return [
    { source: leader.hex_id, target: middle.hex_id, value: String(offset % 5 + 1) },
    { source: middle.hex_id, target: normal.hex_id, value: String((offset + 2) % 5 + 1) },
  ];
})).flat(2);

/**
 * The original case1.csv sample, bundled so the editor can restore its familiar
 * startup data and previews without fetching it as an on-demand preset.
 */
export const defaultChartDataset: Dataset = {
  id: DEFAULT_CHART_DATASET_ID,
  name: "case1.csv",
  columns: [
    { name: "id", type: "quantitative" },
    { name: "person", type: "nominal" },
    { name: "time", type: "ordinal" },
    { name: "weight_kg", type: "quantitative" },
    { name: "water_kg", type: "quantitative" },
    { name: "fat_kg", type: "quantitative" },
    { name: "muscle_kg", type: "quantitative" },
    { name: "minerals_kg", type: "quantitative" },
  ],
  rows: defaultRows,
  primaryKey: ["id"],
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

/** Monthly observations for ten stations joined to NYC ZIP geometries by point ID. */
export const case2GraphDataset: Dataset = {
  id: CASE2_GRAPH_DATASET_ID,
  name: "case2 station graph",
  columns: [],
  rows: [],
  graph: {
    nodes: { columns: [
      { name: "id", type: "nominal" }, { name: "point", type: "nominal" },
      { name: "label", type: "nominal" }, { name: "station_type", type: "nominal" },
      { name: "month", type: "ordinal" },
      { name: "pedestrian_trips", type: "quantitative" },
      { name: "bicycle_trips", type: "quantitative" },
      { name: "transit_rides", type: "quantitative" },
      { name: "vehicle_trips", type: "quantitative" },
      { name: "delivery_trips", type: "quantitative" },
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
    { name: "month", type: "ordinal" },
    { name: "weight", type: "quantitative" },
    { name: "metric_1", type: "quantitative" },
    { name: "metric_2", type: "quantitative" },
    { name: "metric_3", type: "quantitative" },
    { name: "metric_4", type: "quantitative" },
    { name: "metric_5", type: "quantitative" },
  ],
  rows: defaultTreeRows,
  primaryKey: ["node_id", "month"],
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

function personFilter(): ChartDataTransform[] {
  return [{
    id: "builtin-case1:person-a",
    kind: "filter",
    mode: "values",
    field: "person",
    values: ["Person_A"],
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
    blockId: spec.blockId,
    blockRevision: spec.blockRevision,
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
      axes: {
        theta: { visible: false, labelsVisible: false },
        radius: { visible: false, labelsVisible: false },
      },
      encodings: {
        key: { field: "id", type: "nominal" },
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
        x: { field: "time", type: "ordinal" },
        y: { field: "weight_kg", type: "quantitative" },
        color: { field: "person", type: "nominal" },
        size: { field: "fat_kg", type: "quantitative" },
      },
    };
  }
  if (family === "matrix") {
    return {
      ...base,
      encodings: {
        x: { field: "time", type: "ordinal" },
        y: { field: "person", type: "nominal" },
        color: { field: "weight_kg", type: "quantitative" },
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
        color: { field: "person", type: "nominal" },
      },
      parallelFields: [
        { field: "person", type: "nominal" },
        { field: "time", type: "ordinal" },
        { field: "weight_kg", type: "quantitative" },
        { field: "water_kg", type: "quantitative" },
        { field: "fat_kg", type: "quantitative" },
        { field: "muscle_kg", type: "quantitative" },
        { field: "minerals_kg", type: "quantitative" },
      ],
    };
  }
  if (family === "pie" || family === "donut") {
    return {
      ...base,
      encodings: {
        segment: { field: "time", type: "ordinal" },
        theta: { field: "weight_kg", type: "quantitative" },
      },
      aggregations: { theta: "sum" },
      dataTransforms: personFilter(),
    };
  }
  if (normalized === "radarchart") {
    const seriesEncoding = { field: "person", type: "nominal" as const };
    return {
      ...base,
      encodings: {
        theta: { field: "time", type: "ordinal" },
        radius: { field: "weight_kg", type: "quantitative" },
        series: seriesEncoding,
      },
      series: seriesEncoding,
      seriesFields: [seriesEncoding],
    };
  }
  const radialBar = normalized === "radialbarchart"
    || normalized === "radialrectbarchart";
  const radialStackedBar = normalized === "radialstackedbarchart"
    || normalized === "radialrectstackedbarchart";
  if (radialBar || radialStackedBar) {
    const seriesEncoding = { field: "person", type: "nominal" as const };
    return {
      ...base,
      encodings: {
        segment: { field: "time", type: "ordinal" },
        radius: { field: "weight_kg", type: "quantitative" },
        ...(radialStackedBar ? { series: seriesEncoding } : {}),
      },
      ...(radialStackedBar ? { series: seriesEncoding, seriesFields: [seriesEncoding] } : {}),
      ...(!radialStackedBar ? { dataTransforms: personFilter() } : {}),
    };
  }
  const circularStackedBar = normalized === "circularstackedbarchart";
  if (normalized === "circularbarchart" || circularStackedBar) {
    const seriesEncoding = { field: "person", type: "nominal" as const };
    return {
      ...base,
      encodings: {
        ...(circularStackedBar
          ? {
            theta: { field: "weight_kg", type: "quantitative" as const },
            radius: { field: "time", type: "ordinal" as const },
          }
          : {
            segment: { field: "time", type: "ordinal" as const },
            theta: { field: "weight_kg", type: "quantitative" as const },
          }),
        ...(circularStackedBar ? { series: seriesEncoding } : {}),
      },
      ...(circularStackedBar ? { series: seriesEncoding, seriesFields: [seriesEncoding] } : {}),
      ...(!circularStackedBar ? { dataTransforms: personFilter() } : {}),
    };
  }

  const multiSeries = normalized === "multilinechart"
    || normalized === "groupedbarchart"
    || normalized === "stackedbarchart"
    || normalized === "divergentstackedbarchart"
    || normalized === "stackedareachart"
    || normalized === "streamgraph"
    || normalized === "horizonchart";
  const seriesEncoding = { field: "person", type: "nominal" as const };
  return {
    ...base,
    encodings: {
      x: { field: "time", type: "ordinal" },
      y: { field: "weight_kg", type: "quantitative" },
      ...(multiSeries ? { series: seriesEncoding } : {}),
    },
    ...(multiSeries ? { series: seriesEncoding, seriesFields: [seriesEncoding] } : {}),
    ...(!multiSeries ? { dataTransforms: personFilter() } : {}),
  };
}

export function defaultChartSpecWithAppearance(chartSpec: ChartSpec, chartId: string) {
  const fallback = createDefaultChartSpec(chartSpec.chartType);
  if (!fallback) return null;
  const retainsDefaultSource = isDefaultChartDataSpec(chartSpec);
  return {
    ...fallback,
    axisSwapped: chartSpec.axisSwapped,
    axes: chartSpec.axes ?? fallback.axes,
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

function densifyAreaPreviewDataset(dataset: Dataset, chartSpec: ChartSpec): Dataset {
  const progressionField = chartSpec.encodings.x?.field ?? "time";
  const seriesField = chartSpec.series?.field ?? "person";
  const progressionValues = Array.from(new Set(dataset.rows.map((row) => row[progressionField] ?? "")))
    .filter(Boolean);
  if (progressionValues.length < 2) return dataset;
  const numericFields = new Set(dataset.columns
    .filter((column) => column.type === "quantitative")
    .map((column) => column.name));
  const rows: Dataset["rows"] = [];
  progressionValues.forEach((progression, progressionIndex) => {
    const currentRows = dataset.rows.filter((row) => row[progressionField] === progression);
    rows.push(...currentRows);
    const nextProgression = progressionValues[progressionIndex + 1];
    if (!nextProgression) return;
    const nextByGroup = new Map(dataset.rows
      .filter((row) => row[progressionField] === nextProgression)
      .map((row) => [row[seriesField] ?? "", row]));
    currentRows.forEach((current) => {
      const next = nextByGroup.get(current[seriesField] ?? "");
      if (!next) return;
      const midpoint: Record<string, string> = { ...current, [progressionField]: `${progression}-mid` };
      numericFields.forEach((field) => {
        const left = Number(current[field] ?? "");
        const right = Number(next[field] ?? "");
        if (Number.isFinite(left) && Number.isFinite(right)) midpoint[field] = String((left + right) / 2);
      });
      rows.push(midpoint);
    });
  });
  return { ...dataset, rows };
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
  const previewDataset = normalizeChartTemplate(chartType) === "area"
    ? densifyAreaPreviewDataset(defaultDataset, chartSpec)
    : defaultDataset;
  const prepared = prepareChartData(
    `default-preview-${chartType}`,
    previewDataset,
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
