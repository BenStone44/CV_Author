import type {
  ChartEncodingChannel,
  ChartTemplateKind,
  CoordinateChannel,
  CoordinateSystem,
  DataColumnType,
} from "../types";

export type EncodingRole = "dimension" | "measure" | "series" | "style";
export type EncodingEmptyLabel = "Not bound" | "Static";
export type ChartRendererKey =
  | "line"
  | "scatter"
  | "bar"
  | "pie"
  | "donut"
  | "matrix"
  | ChartTemplateKind;

export type ChartEncodingChannelSchema = {
  channel: ChartEncodingChannel;
  label: string;
  role: EncodingRole;
  required: boolean;
  accepts: DataColumnType[];
  emptyLabel: EncodingEmptyLabel;
  multiple?: boolean;
  configurable?: boolean;
};

export type ChartEncodingSchema = {
  chartType: string;
  id: ChartTemplateKind;
  family: ChartTemplateKind;
  label: string;
  renderer: ChartRendererKey;
  rendererVersion: 1 | 3;
  coordinateSystem: Exclude<CoordinateSystem, "Geographic">;
  markRole: "line" | "point" | "bar" | "arc" | "cell" | "area" | "path" | "node" | "box" | "contour" | "hexagon" | "link";
  channels: ChartEncodingChannelSchema[];
  aggregationPolicy: "allowed" | "forbidden";
  requiresFunctionalDependency: boolean;
  requiresIndependentDimensions: boolean;
  shareableChannels: CoordinateChannel[];
  unusedDimensionStrategies: Array<"flatten" | "facet" | "nested">;
};

type SchemaDefaults = Omit<ChartEncodingSchema, "chartType" | "label" | "channels">;

const commonStrategies: ChartEncodingSchema["unusedDimensionStrategies"] = ["flatten", "facet", "nested"];

const familyDefaults: Record<ChartTemplateKind, SchemaDefaults> = {
  line: { id: "line", family: "line", renderer: "line", rendererVersion: 3, coordinateSystem: "Cartesian", markRole: "line", aggregationPolicy: "forbidden", requiresFunctionalDependency: true, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  scatter: { id: "scatter", family: "scatter", renderer: "scatter", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "point", aggregationPolicy: "forbidden", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  bar: { id: "bar", family: "bar", renderer: "bar", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "bar", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  pie: { id: "pie", family: "pie", renderer: "pie", rendererVersion: 1, coordinateSystem: "Polar", markRole: "arc", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["angle", "radius"], unusedDimensionStrategies: commonStrategies },
  donut: { id: "donut", family: "donut", renderer: "donut", rendererVersion: 1, coordinateSystem: "Polar", markRole: "arc", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["angle", "radius", "ring"], unusedDimensionStrategies: commonStrategies },
  matrix: { id: "matrix", family: "matrix", renderer: "matrix", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "cell", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  area: { id: "area", family: "area", renderer: "area", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "area", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  parallel: { id: "parallel", family: "parallel", renderer: "parallel", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "path", aggregationPolicy: "forbidden", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies },
  hierarchy: { id: "hierarchy", family: "hierarchy", renderer: "hierarchy", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "node", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies },
  calendar: { id: "calendar", family: "calendar", renderer: "calendar", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "cell", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies },
  boxplot: { id: "boxplot", family: "boxplot", renderer: "boxplot", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "box", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  contour: { id: "contour", family: "contour", renderer: "contour", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "contour", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  hexbin: { id: "hexbin", family: "hexbin", renderer: "hexbin", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "hexagon", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies },
  flow: { id: "flow", family: "flow", renderer: "flow", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "link", aggregationPolicy: "allowed", requiresFunctionalDependency: false, requiresIndependentDimensions: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies },
};

function defineSchema(
  chartType: string,
  label: string,
  family: ChartTemplateKind,
  channels: ChartEncodingChannelSchema[],
  overrides: Partial<SchemaDefaults> = {},
): ChartEncodingSchema {
  return { chartType, label, channels, ...familyDefaults[family], ...overrides };
}

const xAny = { channel: "x", label: "X", role: "dimension", required: true, accepts: ["temporal", "quantitative", "nominal"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const yMeasure = { channel: "y", label: "Y", role: "measure", required: true, accepts: ["temporal", "quantitative"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const lineSize = { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const lineShape = { channel: "shape", label: "Shape", role: "style", required: false, accepts: ["nominal"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const lineSeries = { channel: "color", label: "Color", role: "series", required: false, accepts: ["nominal", "temporal"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const barX = { channel: "x", label: "X", role: "dimension", required: true, accepts: ["nominal", "temporal"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const barY = { channel: "y", label: "Y", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const barStyle = { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "temporal"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const barSeries = { channel: "color", label: "Color", role: "series", required: true, accepts: ["nominal", "temporal"], emptyLabel: "Static", multiple: true } satisfies ChartEncodingChannelSchema;
const barSize = { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const areaChannels = (requiresSeries: boolean): ChartEncodingChannelSchema[] => [
  xAny,
  { ...yMeasure, accepts: ["quantitative"] },
  { ...lineSeries, required: requiresSeries },
];
const hierarchyChannels: ChartEncodingChannelSchema[] = [
  { channel: "key", label: "Node ID", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "parent", label: "Parent ID", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "value", label: "Node value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
];
const flowChannels: ChartEncodingChannelSchema[] = [
  { channel: "source", label: "Source", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "target", label: "Target", role: "dimension", required: true, accepts: ["nominal", "temporal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "value", label: "Flow value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
];

/**
 * The single reviewable source of truth for every chart exposed by the app.
 * Encoding controls consume `channels`; rendering consumes `renderer` and
 * `coordinateSystem`; validation consumes the remaining contract fields.
 */
export const chartEncodingSchemas = {
  LineGraph: defineSchema("LineGraph", "Single Line", "line", [xAny, yMeasure, { ...lineSeries, configurable: false }, lineSize, lineShape]),
  MultiLineChart: defineSchema("MultiLineChart", "Multi-Line Chart", "line", [xAny, yMeasure, lineSeries, lineSize, lineShape]),
  Scatterplot: defineSchema("Scatterplot", "Scatterplot", "scatter", [
    xAny,
    { ...yMeasure, accepts: ["quantitative", "temporal", "nominal"] },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "temporal", "quantitative"], emptyLabel: "Static" },
    lineSize,
    lineShape,
  ]),
  SingleBarChart: defineSchema("SingleBarChart", "Single Bar", "bar", [barX, barY, barStyle, barSize]),
  GroupedBarChart: defineSchema("GroupedBarChart", "Grouped Bar", "bar", [barX, barY, barSeries, barSize]),
  StackedBarChart: defineSchema("StackedBarChart", "Stacked Bar", "bar", [barX, barY, barSeries, barSize]),
  DivergentBarChart: defineSchema("DivergentBarChart", "Divergent Bar", "bar", [barX, barY, barStyle, barSize]),
  DivergentStackedBarChart: defineSchema("DivergentStackedBarChart", "Divergent Stacked Bar", "bar", [barX, barY, barSeries, barSize]),
  PieChart: defineSchema("PieChart", "Pie Chart", "pie", [
    { channel: "theta", label: "Theta", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound", multiple: true },
    { channel: "color", label: "Color", role: "dimension", required: false, accepts: ["nominal", "temporal"], emptyLabel: "Static" },
    { channel: "radius", label: "R", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  ]),
  DonutChart: defineSchema("DonutChart", "Donut", "donut", [
    { channel: "theta", label: "Theta", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound", multiple: true },
    { channel: "color", label: "Color", role: "dimension", required: false, accepts: ["nominal", "temporal"], emptyLabel: "Static" },
    { channel: "ring", label: "Ring", role: "series", required: false, accepts: ["nominal", "temporal"], emptyLabel: "Not bound" },
    { channel: "radius", label: "R", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  ]),
  MatrixDiagram: defineSchema("MatrixDiagram", "Matrix", "matrix", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["nominal", "temporal"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "dimension", required: true, accepts: ["nominal", "temporal"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "measure", required: false, accepts: ["quantitative", "nominal"], emptyLabel: "Static" },
  ]),
  AreaChart: defineSchema("AreaChart", "Area Chart", "area", areaChannels(false)),
  StackedAreaChart: defineSchema("StackedAreaChart", "Stacked Area", "area", areaChannels(true)),
  Streamgraph: defineSchema("Streamgraph", "Streamgraph", "area", areaChannels(true)),
  HorizonChart: defineSchema("HorizonChart", "Horizon Chart", "area", areaChannels(true), { coordinateSystem: "CoordinateFree", shareableChannels: [] }),
  ParallelCoordinatesPlot: defineSchema("ParallelCoordinatesPlot", "Parallel Coordinates", "parallel", [
    { channel: "dimensions", label: "Numeric dimensions", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound", multiple: true },
    { channel: "color", label: "Color", role: "series", required: false, accepts: ["nominal", "temporal", "quantitative"], emptyLabel: "Static" },
  ]),
  Icicle: defineSchema("Icicle", "Icicle", "hierarchy", hierarchyChannels),
  Sunburst: defineSchema("Sunburst", "Sunburst", "hierarchy", hierarchyChannels),
  Treemap: defineSchema("Treemap", "Treemap", "hierarchy", hierarchyChannels),
  Dendrogram: defineSchema("Dendrogram", "Dendrogram", "hierarchy", hierarchyChannels),
  Calendar: defineSchema("Calendar", "Calendar", "calendar", [
    { channel: "date", label: "Date", role: "dimension", required: true, accepts: ["temporal"], emptyLabel: "Not bound" },
    { channel: "value", label: "Daily value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["quantitative", "nominal"], emptyLabel: "Static" },
  ]),
  Boxplot: defineSchema("Boxplot", "Box Plot", "boxplot", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
  ]),
  Contour: defineSchema("Contour", "Contour", "contour", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "measure", required: true, accepts: ["quantitative", "nominal"], emptyLabel: "Static" },
  ]),
  Hexbin: defineSchema("Hexbin", "Hexbin", "hexbin", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["quantitative", "nominal"], emptyLabel: "Static" },
    lineSize,
  ]),
  Chord: defineSchema("Chord", "Chord", "flow", flowChannels),
  Sankey: defineSchema("Sankey", "Sankey", "flow", flowChannels),
} satisfies Record<string, ChartEncodingSchema>;

export type SupportedChartType = keyof typeof chartEncodingSchemas;

function normalizedName(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

const exactSchemas = new Map(
  Object.values(chartEncodingSchemas).map((schema) => [normalizedName(schema.chartType), schema]),
);

const familyMatchers: Array<readonly [ChartTemplateKind, (value: string) => boolean]> = [
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

const familyFallbacks: Record<ChartTemplateKind, ChartEncodingSchema> = {
  line: chartEncodingSchemas.LineGraph,
  scatter: chartEncodingSchemas.Scatterplot,
  bar: chartEncodingSchemas.SingleBarChart,
  pie: chartEncodingSchemas.PieChart,
  donut: chartEncodingSchemas.DonutChart,
  matrix: chartEncodingSchemas.MatrixDiagram,
  area: chartEncodingSchemas.AreaChart,
  parallel: chartEncodingSchemas.ParallelCoordinatesPlot,
  hierarchy: chartEncodingSchemas.Icicle,
  calendar: chartEncodingSchemas.Calendar,
  boxplot: chartEncodingSchemas.Boxplot,
  contour: chartEncodingSchemas.Contour,
  hexbin: chartEncodingSchemas.Hexbin,
  flow: chartEncodingSchemas.Chord,
};

export function normalizeChartFamily(chartType: string): ChartTemplateKind | null {
  const value = normalizedName(chartType);
  return exactSchemas.get(value)?.family
    ?? familyMatchers.find(([, matches]) => matches(value))?.[0]
    ?? null;
}

export function getChartEncodingSchema(chartType: string): ChartEncodingSchema | null {
  const value = normalizedName(chartType);
  const exact = exactSchemas.get(value);
  if (exact) return exact;
  const family = normalizeChartFamily(chartType);
  if (!family) return null;
  const fallback = familyFallbacks[family];
  return { ...fallback, chartType, label: chartType };
}

export const chartTemplateContracts = Object.fromEntries(
  (Object.keys(familyFallbacks) as ChartTemplateKind[]).map((family) => [family, familyFallbacks[family]]),
) as Record<ChartTemplateKind, ChartEncodingSchema>;
