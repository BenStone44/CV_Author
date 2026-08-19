import type {
  ChartEncodingChannel,
  ChartSpec,
  ChartTemplateKind,
  CoordinateChannel,
  DataColumnType,
} from "../types";

export type SemanticBindingSlot =
  | "x"
  | "y"
  | "series"
  | "category"
  | "value"
  | "group"
  | "segment"
  | "theta"
  | "slice"
  | "radius"
  | "ring"
  | "row"
  | "column"
  | "cell"
  | "key"
  | "parent"
  | "source"
  | "target"
  | "date"
  | "dimensions";

export type TemplateChannelMapping = {
  channel: ChartEncodingChannel;
  role: "dimension" | "measure" | "series" | "style";
  required: boolean;
  accepts: DataColumnType[];
};

export type ChartTemplateContract = {
  id: ChartTemplateKind;
  label: string;
  rendererVersion: 1 | 3;
  coordinateSystem: "Cartesian" | "Polar" | "CoordinateFree";
  markRole: "line" | "point" | "bar" | "arc" | "cell" | "area" | "path" | "node" | "box" | "contour" | "hexagon" | "link";
  channels: TemplateChannelMapping[];
  aggregationPolicy: "allowed" | "forbidden";
  requiresFunctionalDependency: boolean;
  requiresIndependentDimensions: boolean;
  shareableChannels: CoordinateChannel[];
  unusedDimensionStrategies: Array<"flatten" | "facet" | "nested">;
};

export type TemplateBindingSourceKind = "dimension" | "measure" | "measure-set" | "value-series";

export type TemplateSlotContract = {
  id: SemanticBindingSlot;
  label: string;
  required: boolean;
  accepts: TemplateBindingSourceKind[];
  supportsMemberSelection?: boolean;
};

export type TemplateBindingContract = {
  templateId: ChartTemplateKind;
  slots: TemplateSlotContract[];
  unresolvedDimensionPolicies: Array<"filter" | "rollup" | "facet" | "detail">;
  compiler: "line" | "scatter" | "bar" | "arc" | "matrix";
};

const unresolvedDimensionPolicies: TemplateBindingContract["unresolvedDimensionPolicies"] = [
  "filter",
  "rollup",
  "facet",
  "detail",
];

/** Semantic data roles shown to authors. Native channels remain renderer details. */
export const templateBindingContracts: Record<ChartTemplateKind, TemplateBindingContract> = {
  line: {
    templateId: "line",
    slots: [
      { id: "x", label: "Horizontal", required: true, accepts: ["dimension", "measure"] },
      { id: "y", label: "Value", required: true, accepts: ["measure", "measure-set"] },
      { id: "series", label: "Series", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "line",
  },
  scatter: {
    templateId: "scatter",
    slots: [
      { id: "x", label: "Horizontal", required: true, accepts: ["dimension", "measure"] },
      { id: "y", label: "Vertical", required: true, accepts: ["dimension", "measure"] },
      { id: "series", label: "Series", required: false, accepts: ["dimension"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "scatter",
  },
  bar: {
    templateId: "bar",
    slots: [
      { id: "category", label: "Category", required: true, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "value", label: "Value", required: true, accepts: ["measure", "measure-set"] },
      { id: "group", label: "Group", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
      { id: "segment", label: "Segment", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "bar",
  },
  pie: {
    templateId: "pie",
    slots: [
      { id: "theta", label: "Theta", required: true, accepts: ["measure", "measure-set"] },
      { id: "slice", label: "Breakdown", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
      { id: "radius", label: "R", required: false, accepts: ["measure"] },
    ],
    unresolvedDimensionPolicies,
    compiler: "arc",
  },
  donut: {
    templateId: "donut",
    slots: [
      { id: "theta", label: "Theta", required: true, accepts: ["measure", "measure-set"] },
      { id: "slice", label: "Breakdown", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
      { id: "ring", label: "Ring", required: false, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "radius", label: "R", required: false, accepts: ["measure"] },
    ],
    unresolvedDimensionPolicies,
    compiler: "arc",
  },
  matrix: {
    templateId: "matrix",
    slots: [
      { id: "row", label: "Row", required: true, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "column", label: "Column", required: true, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "cell", label: "Cell value", required: false, accepts: ["measure"] },
    ],
    unresolvedDimensionPolicies,
    compiler: "matrix",
  },
  area: {
    templateId: "area",
    slots: [
      { id: "x", label: "Horizontal", required: true, accepts: ["dimension", "measure"] },
      { id: "y", label: "Value", required: true, accepts: ["measure", "measure-set"] },
      { id: "series", label: "Series", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "line",
  },
  parallel: { templateId: "parallel", slots: [], unresolvedDimensionPolicies, compiler: "line" },
  hierarchy: { templateId: "hierarchy", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
  calendar: { templateId: "calendar", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
  boxplot: { templateId: "boxplot", slots: [], unresolvedDimensionPolicies, compiler: "bar" },
  contour: { templateId: "contour", slots: [], unresolvedDimensionPolicies, compiler: "scatter" },
  hexbin: { templateId: "hexbin", slots: [], unresolvedDimensionPolicies, compiler: "scatter" },
  flow: { templateId: "flow", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
};

export const chartTemplateContracts: Record<ChartTemplateKind, ChartTemplateContract> = {
  line: {
    id: "line",
    label: "Line Chart",
    rendererVersion: 3,
    coordinateSystem: "Cartesian",
    markRole: "line",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["temporal", "quantitative", "nominal"] },
      { channel: "y", role: "measure", required: true, accepts: ["temporal", "quantitative"] },
      { channel: "color", role: "series", required: false, accepts: ["nominal", "temporal"] },
      { channel: "size", role: "style", required: false, accepts: ["quantitative"] },
      { channel: "shape", role: "style", required: false, accepts: ["nominal"] },
    ],
    aggregationPolicy: "forbidden",
    requiresFunctionalDependency: true,
    requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  scatter: {
    id: "scatter",
    label: "Scatterplot",
    rendererVersion: 1,
    coordinateSystem: "Cartesian",
    markRole: "point",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["temporal", "quantitative", "nominal"] },
      { channel: "y", role: "measure", required: true, accepts: ["quantitative", "temporal", "nominal"] },
      { channel: "color", role: "style", required: false, accepts: ["nominal", "temporal", "quantitative"] },
      { channel: "size", role: "style", required: false, accepts: ["quantitative"] },
      { channel: "shape", role: "style", required: false, accepts: ["nominal"] },
    ],
    aggregationPolicy: "forbidden",
    requiresFunctionalDependency: false,
    requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  bar: {
    id: "bar",
    label: "Bar Chart",
    rendererVersion: 1,
    coordinateSystem: "Cartesian",
    markRole: "bar",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["nominal", "temporal"] },
      { channel: "y", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "series", required: false, accepts: ["nominal", "temporal"] },
      { channel: "size", role: "style", required: false, accepts: ["quantitative"] },
    ],
    aggregationPolicy: "allowed",
    requiresFunctionalDependency: false,
    requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  pie: {
    id: "pie",
    label: "Pie Chart",
    rendererVersion: 1,
    coordinateSystem: "Polar",
    markRole: "arc",
    channels: [
      { channel: "theta", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "dimension", required: false, accepts: ["nominal", "temporal"] },
      { channel: "radius", role: "measure", required: false, accepts: ["quantitative"] },
    ],
    aggregationPolicy: "allowed",
    requiresFunctionalDependency: false,
    requiresIndependentDimensions: true,
    shareableChannels: ["angle", "radius"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  donut: {
    id: "donut",
    label: "Donut Chart",
    rendererVersion: 1,
    coordinateSystem: "Polar",
    markRole: "arc",
    channels: [
      { channel: "theta", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "dimension", required: false, accepts: ["nominal", "temporal"] },
      { channel: "ring", role: "series", required: false, accepts: ["nominal", "temporal"] },
      { channel: "radius", role: "measure", required: false, accepts: ["quantitative"] },
    ],
    aggregationPolicy: "allowed",
    requiresFunctionalDependency: false,
    requiresIndependentDimensions: true,
    shareableChannels: ["angle", "radius", "ring"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  matrix: {
    id: "matrix",
    label: "Matrix",
    rendererVersion: 1,
    coordinateSystem: "Cartesian",
    markRole: "cell",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["nominal", "temporal"] },
      { channel: "y", role: "dimension", required: true, accepts: ["nominal", "temporal"] },
      { channel: "color", role: "measure", required: false, accepts: ["quantitative", "nominal"] },
    ],
    aggregationPolicy: "allowed",
    requiresFunctionalDependency: false,
    requiresIndependentDimensions: true,
    // Matrix uses the same Cartesian X/Y channels as line and scatter;
    // quantitative color is the cell value encoding.
    shareableChannels: ["x", "y"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  area: {
    id: "area", label: "Area Chart", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "area",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["temporal", "quantitative", "nominal"] },
      { channel: "y", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "series", required: false, accepts: ["nominal", "temporal"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  parallel: {
    id: "parallel", label: "Parallel Coordinates", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "path",
    channels: [
      { channel: "dimensions", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "series", required: false, accepts: ["nominal", "temporal", "quantitative"] },
    ],
    aggregationPolicy: "forbidden", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: [], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  hierarchy: {
    id: "hierarchy", label: "Hierarchy", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "node",
    channels: [
      { channel: "key", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"] },
      { channel: "parent", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"] },
      { channel: "value", role: "measure", required: false, accepts: ["quantitative"] },
      { channel: "color", role: "style", required: false, accepts: ["nominal", "quantitative"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: [], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  calendar: {
    id: "calendar", label: "Calendar", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "cell",
    channels: [
      { channel: "date", role: "dimension", required: true, accepts: ["temporal"] },
      { channel: "value", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "style", required: false, accepts: ["quantitative", "nominal"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: [], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  boxplot: {
    id: "boxplot", label: "Box Plot", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "box",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["quantitative"] },
      { channel: "y", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "style", required: false, accepts: ["nominal", "quantitative"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  contour: {
    id: "contour", label: "Contour", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "contour",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["quantitative"] },
      { channel: "y", role: "dimension", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "measure", required: true, accepts: ["quantitative", "nominal"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  hexbin: {
    id: "hexbin", label: "Hexbin", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "hexagon",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["quantitative"] },
      { channel: "y", role: "dimension", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "style", required: false, accepts: ["quantitative", "nominal"] },
      { channel: "size", role: "style", required: false, accepts: ["quantitative"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: ["x", "y"], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  flow: {
    id: "flow", label: "Flow", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "link",
    channels: [
      { channel: "source", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"] },
      { channel: "target", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"] },
      { channel: "value", role: "measure", required: false, accepts: ["quantitative"] },
      { channel: "color", role: "style", required: false, accepts: ["nominal", "quantitative"] },
    ],
    aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true,
    shareableChannels: [], unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
};

type RequiredEncodingFallback = (spec: ChartSpec) => boolean;

const requiredEncodingFallbacks: Record<
  ChartTemplateKind,
  Partial<Record<ChartEncodingChannel, RequiredEncodingFallback>>
> = {
  line: {
    y: (spec) => !!spec.valueFields?.length,
  },
  scatter: {},
  bar: {
    y: (spec) => {
      const variant = normalizeBarChartVariant(spec.chartType);
      return (variant === "grouped" || variant === "stacked" || variant === "divergent-stacked")
        && (spec.valueFields?.length ?? 0) > 0;
    },
    color: (spec) => {
      const variant = normalizeBarChartVariant(spec.chartType);
      return (variant === "grouped" || variant === "stacked" || variant === "divergent-stacked")
        && ((spec.valueFields?.length ?? 0) >= 2 || (spec.seriesFields?.length ?? 0) > 0 || !!spec.series);
    },
  },
  pie: {
    theta: (spec) => !!spec.angleFields?.length
      || !!spec.encodings.theta
      || !!spec.encodings.angle
      || !!spec.encodings.y,
  },
  donut: {
    theta: (spec) => !!spec.angleFields?.length
      || !!spec.encodings.theta
      || !!spec.encodings.angle
      || !!spec.encodings.y,
  },
  area: {
    y: (spec) => !!spec.valueFields?.length,
    color: (spec) => (spec.valueFields?.length ?? 0) > 1,
  },
  matrix: {
    x: (spec) => !!spec.encodings.column,
    y: (spec) => !!spec.encodings.row,
  },
  parallel: { dimensions: (spec) => (spec.parallelFields?.length ?? 0) >= 2 },
  hierarchy: {},
  calendar: {},
  boxplot: {},
  contour: {
    color: (spec) => !!spec.encodings.value,
  },
  hexbin: {},
  flow: {},
};

export function hasRequiredChartEncodings(spec: ChartSpec) {
  const template = normalizeChartTemplate(spec.chartType);
  if (!template) return false;
  const contract = getChartTemplateContract(spec.chartType);
  if (!contract) return false;
  const chartType = spec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  const seriesField = spec.series?.field
    ?? spec.seriesFields?.[0]?.field
    ?? (spec.encodings.color?.type === "nominal" ? spec.encodings.color.field : undefined)
    ?? ((spec.valueFields?.length ?? 0) > 1 ? "__csv_measure__" : "");
  if (chartType === "multilinechart" && !seriesField) return false;
  const barVariant = template === "bar" ? normalizeBarChartVariant(spec.chartType) : null;
  return contract.channels
    .filter((mapping) => mapping.required
      && !(template === "bar"
        && (barVariant === "grouped" || barVariant === "stacked" || barVariant === "divergent-stacked")
        && mapping.channel === "y"))
    .every((mapping) => !!spec.encodings[mapping.channel]
      || requiredEncodingFallbacks[template][mapping.channel]?.(spec) === true);
}

const chartTemplateMatchers: Array<readonly [ChartTemplateKind, (value: string) => boolean]> = [
  ["parallel", (value) => value.includes("parallelcoordinate")],
  ["hierarchy", (value) => ["icicle", "sunburst", "treemap", "dendrogram"].some((name) => value.includes(name))],
  ["calendar", (value) => value.includes("calendar")],
  ["boxplot", (value) => value.includes("boxplot") || value.includes("boxandwhisker")],
  ["contour", (value) => value.includes("contour")],
  ["hexbin", (value) => value.includes("hexbin")],
  ["flow", (value) => value.includes("chord") || value.includes("sankey")],
  ["area", (value) => value.includes("area") || value.includes("streamgraph") || value.includes("horizon")],
  ["scatter", (value) => value.includes("scatter")],
  ["bar", (value) => value.includes("barchart") || value === "bar"],
  ["donut", (value) => value.includes("donut")],
  ["pie", (value) => value.includes("pie")],
  ["matrix", (value) => value.includes("matrix") || value.includes("heatmap")],
  ["line", (value) => value === "linegraph" || value.includes("linechart")],
];

export function normalizeChartTemplate(chartType: string): ChartTemplateKind | null {
  const value = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return chartTemplateMatchers.find(([, matches]) => matches(value))?.[0] ?? null;
}

export function cartesianAxisEncoding(spec: ChartSpec, axis: "x" | "y") {
  const source = spec.axisSwapped ? (axis === "x" ? "y" : "x") : axis;
  return spec.encodings[source];
}

export type BarChartVariant = "single" | "grouped" | "stacked" | "divergent" | "divergent-stacked";

const barVariantMatchers: Array<readonly [BarChartVariant, (value: string) => boolean]> = [
  ["divergent-stacked", (value) => (value.includes("divergent") || value.includes("diverging")) && value.includes("stacked")],
  ["grouped", (value) => value.includes("grouped")],
  ["stacked", (value) => value.includes("stacked")],
  ["divergent", (value) => value.includes("divergent") || value.includes("diverging")],
];

export function normalizeBarChartVariant(chartType: string): BarChartVariant | null {
  if (normalizeChartTemplate(chartType) !== "bar") return null;
  const value = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return barVariantMatchers.find(([, matches]) => matches(value))?.[0] ?? "single";
}

const channelSlotMappings: Record<ChartTemplateKind, Partial<Record<ChartEncodingChannel, SemanticBindingSlot>>> = {
  line: { x: "x", y: "y", color: "series" },
  scatter: { x: "x", y: "y", color: "series" },
  bar: { x: "category", y: "value" },
  pie: { theta: "theta", color: "slice", radius: "radius" },
  donut: { theta: "theta", color: "slice", ring: "ring", radius: "radius" },
  matrix: { x: "column", y: "row", color: "cell" },
  area: { x: "x", y: "y", color: "series" },
  parallel: {},
  hierarchy: {},
  calendar: {},
  boxplot: {},
  contour: { x: "x", y: "y" },
  hexbin: { x: "x", y: "y" },
  flow: {},
};

export function semanticSlotForChannel(
  chartType: string,
  channel: ChartEncodingChannel,
): SemanticBindingSlot | null {
  const template = normalizeChartTemplate(chartType);
  if (!template) return null;
  if ((template === "pie" || template === "donut") && channel === "angle") return "theta";
  if (template === "bar" && channel === "color") {
    const variant = normalizeBarChartVariant(chartType);
    return variant === "grouped"
      ? "group"
      : variant === "stacked" || variant === "divergent-stacked"
        ? "segment"
        : "category";
  }
  return channelSlotMappings[template][channel] ?? null;
}

export function getChartTemplateContract(chartType: string) {
  const template = normalizeChartTemplate(chartType);
  if (!template) return null;
  const contract = chartTemplateContracts[template];
  const value = chartType.replace(/[\s_-]/g, "").toLowerCase();
  const requiresColor = template === "area"
    ? value.includes("stacked") || value.includes("streamgraph") || value.includes("horizon")
    : template === "bar"
      ? ["grouped", "stacked", "divergent-stacked"].includes(normalizeBarChartVariant(chartType) ?? "")
      : false;
  const channels = contract.channels.map((channel) => ({
    ...channel,
    ...(requiresColor && channel.channel === "color" ? { required: true } : {}),
  }));
  return {
    ...contract,
    channels,
    ...(template === "area" && value.includes("horizon")
      ? { coordinateSystem: "CoordinateFree" as const, shareableChannels: [] }
      : {}),
  };
}

export function getTemplateBindingContract(chartType: string) {
  const template = normalizeChartTemplate(chartType);
  return template ? templateBindingContracts[template] : null;
}
