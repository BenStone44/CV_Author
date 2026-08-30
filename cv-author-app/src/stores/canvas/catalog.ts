import type {
  ChartSpec,
  CompositionType,
  CoordinateSystem,
  DataRow,
  GeographicLayerConfig,
  IconKind,
  SvgCandidate,
} from "../../types";
import { advancedTemplateDefinitions } from "../../utils/advancedChartCards";
import {
  createDefaultDataCandidate,
  supportsDefaultChartData,
} from "../../utils/defaultChartData";
import { withD3GalleryThumbnail } from "../../utils/d3GalleryThumbnails";
import {
  geographicLayerDefinitions,
  getGeographicLayerFamily,
} from "../../utils/geographicLayerCards";
import { getChartTemplateContract, normalizeChartTemplate } from "../../utils/chartTemplates";

const defaultDataTemplateDefinitions = [
  { id: "builtin-template:line", name: "Single Line", chartType: "LineGraph", coordinateSystem: "Cartesian" },
  { id: "builtin-template:multi-line", name: "Multi-Line Chart", chartType: "MultiLineChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:scatter", name: "Scatterplot", chartType: "Scatterplot", coordinateSystem: "Cartesian" },
  { id: "builtin-template:matrix", name: "Matrix", chartType: "MatrixDiagram", coordinateSystem: "Cartesian" },
  { id: "builtin-template:single-bar", name: "Single Bar", chartType: "SingleBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:grouped-bar", name: "Grouped Bar", chartType: "GroupedBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:stacked-bar", name: "Stacked Bar", chartType: "StackedBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:divergent-bar", name: "Divergent Bar", chartType: "DivergentBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:divergent-stacked-bar", name: "Divergent Stacked Bar", chartType: "DivergentStackedBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:area-chart", name: "Area Chart", chartType: "AreaChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:stacked-area-chart", name: "Stacked Area", chartType: "StackedAreaChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:streamgraph", name: "Streamgraph", chartType: "Streamgraph", coordinateSystem: "Cartesian" },
  { id: "builtin-template:horizon-chart", name: "Horizon Chart", chartType: "HorizonChart", coordinateSystem: "CoordinateFree" },
  { id: "builtin-template:pie", name: "Pie Chart", chartType: "PieChart", coordinateSystem: "Polar" },
  { id: "builtin-template:donut", name: "Donut", chartType: "DonutChart", coordinateSystem: "Polar" },
  { id: "builtin-template:radial-bar-chart", name: "Radial Bar Chart", chartType: "RadialBarChart", coordinateSystem: "Polar" },
  { id: "builtin-template:icicle", name: "Icicle", chartType: "Icicle", coordinateSystem: "CoordinateFree" },
  { id: "builtin-template:sunburst", name: "Sunburst", chartType: "Sunburst", coordinateSystem: "Polar" },
  { id: "builtin-template:treemap", name: "Treemap", chartType: "Treemap", coordinateSystem: "CoordinateFree" },
  { id: "builtin-template:dendrogram", name: "Dendrogram", chartType: "Dendrogram", coordinateSystem: "Cartesian" },
  { id: "builtin-template:radial-dendrogram", name: "Radial Dendrogram", chartType: "RadialDendrogram", coordinateSystem: "Polar" },
  { id: "builtin-template:force-directed-graph", name: "Force-Directed Graph", chartType: "ForceDirectedGraph", coordinateSystem: "CoordinateFree" },
] satisfies Array<Omit<SvgCandidate, "src" | "svgMarkup">>;

export const implementedTemplateDefinitions: SvgCandidate[] = ([
  ...defaultDataTemplateDefinitions.map(createDefaultDataCandidate),
  ...advancedTemplateDefinitions.filter((candidate) => !supportsDefaultChartData(candidate.chartType)),
  ...geographicLayerDefinitions,
] as SvgCandidate[]).map(withD3GalleryThumbnail);

export function createUnboundChartSpec(chartType: string, datasetId: string): ChartSpec {
  return { chartType, templateId: normalizeChartTemplate(chartType) ?? undefined, datasetId, encodings: {} };
}

export const coordinateOptions: Array<{ value: CoordinateSystem; label: string; icon: IconKind }> = [
  { value: "Cartesian", label: "Cartesian", icon: "cartesian" },
  { value: "Polar", label: "Polar", icon: "polar" },
  { value: "Geographic", label: "Geographic", icon: "geographic" },
  { value: "CoordinateFree", label: "Free", icon: "coordinate-free" },
];

export const compositionOptions: Array<{ value: CompositionType; label: string; description: string }> = [
  { value: "layer", label: "Layer", description: "Overlay selected elements" },
  { value: "facet", label: "Facet", description: "Create small multiples from selected elements" },
  { value: "concat", label: "Concat", description: "Arrange selected views together" },
  { value: "nested", label: "Nested", description: "Embed selected elements as parent and child" },
];

export function defaultGeographicLayerConfig(layerType: string): GeographicLayerConfig {
  const family = getGeographicLayerFamily(layerType);
  return family === "point" ? { size: 8, color: "#2563eb" } : family === "area" ? { color: "#2563eb" } : {};
}

export type NestedContextRole = "dimension" | "series" | "measure";

export function chartRoleFields(spec: ChartSpec, roles: ReadonlySet<NestedContextRole>) {
  const contract = getChartTemplateContract(spec.chartType);
  if (!contract) return [];
  return Array.from(new Set(contract.channels.flatMap((mapping) => {
    if (mapping.role === "style" || !roles.has(mapping.role)) return [];
    if (mapping.role === "series") {
      const encodings = spec.seriesFields?.length ? spec.seriesFields : spec.series ? [spec.series] : spec.encodings[mapping.channel] ? [spec.encodings[mapping.channel]!] : [];
      return encodings.map((encoding) => encoding.field);
    }
    if (mapping.role === "measure" && mapping.channel === "y" && spec.valueFields?.length) return spec.valueFields.map((encoding) => encoding.field);
    if (mapping.role === "measure" && (mapping.channel === "theta" || mapping.channel === "angle") && spec.angleFields?.length) return spec.angleFields.map((encoding) => encoding.field);
    const encoding = spec.encodings[mapping.channel]
      ?? (mapping.channel === "x" ? spec.encodings.column : undefined)
      ?? (mapping.channel === "y" ? spec.encodings.row : undefined);
    return encoding ? [encoding.field] : [];
  })));
}

export function getNestedParentContextFields(spec: ChartSpec) {
  const contract = getChartTemplateContract(spec.chartType);
  const hasAggregation = Object.keys(spec.dimensionAggregations ?? {}).length > 0
    || contract?.channels.some((mapping) => mapping.role === "measure" && spec.aggregations?.[mapping.channel] !== undefined) === true;
  const roles = new Set<NestedContextRole>(["dimension", "series"]);
  if (!hasAggregation) roles.add("measure");
  return chartRoleFields(spec, roles);
}

export function canResolveNestedParentField(spec: ChartSpec, field: string, parentRow: DataRow | undefined) {
  return getNestedParentContextFields(spec).includes(field)
    || (normalizeChartTemplate(spec.chartType) === "scatter" && parentRow?.[field] !== undefined);
}

export function supportsOptionalEncodings(chartType: string) {
  return !!getChartTemplateContract(chartType)?.channels.some((channel) => channel.role === "style");
}

export function lineDataEncodings(encodings: ChartSpec["encodings"]): ChartSpec["encodings"] {
  const next = { ...encodings };
  delete next.color;
  delete next.size;
  delete next.shape;
  return next;
}

export function migrateLineChartAppearance(spec: ChartSpec) {
  if (spec.renderer?.version === 2 || spec.renderer?.version === 3) return spec;
  const lineGroup = spec.markGroups?.find((group) => group.role === "line");
  const hasLegacyStyleWidth = spec.styleTokens?.lineWidth === 5;
  const hasLegacyGroupWidth = lineGroup?.sharedConfig.strokeWidth === 5 && lineGroup.sharedConfig.color === undefined;
  if (!hasLegacyStyleWidth && !hasLegacyGroupWidth) return spec;
  return {
    ...spec,
    styleTokens: spec.styleTokens ? { ...spec.styleTokens, lineWidth: hasLegacyStyleWidth ? 2.5 : spec.styleTokens.lineWidth } : spec.styleTokens,
    markGroups: spec.markGroups?.map((group) => group !== lineGroup || !hasLegacyGroupWidth
      ? group
      : { ...group, sharedConfig: { ...group.sharedConfig, strokeWidth: 2.5 } }),
  };
}

export function getFilterIconSvg(icon: IconKind): string {
  switch (icon) {
    case "cartesian": return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5v10.5h10.5" /><path d="M5 11l2.3-2.2 1.9 1.5 3.1-4" /></svg>`;
    case "polar": return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /><path d="M8 2.5v11" /><path d="M2.5 8h11" /><path d="M8 3.6a4.4 4.4 0 1 1 0 8.8" /></svg>`;
    case "geographic": return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.3" /><path d="M2.9 6.3h10.2" /><path d="M3.3 9.7h9.4" /><path d="M8 2.8c1.9 1.6 2.8 3.4 2.8 5.2S9.9 11.6 8 13.2C6.1 11.6 5.2 9.8 5.2 8S6.1 4.4 8 2.8Z" /></svg>`;
    case "coordinate-free": return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10" /><path d="M3 8h10" /><path d="M3 11.5h6.5" /></svg>`;
    default: return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 8h10" /><path d="M8 3v10" /></svg>`;
  }
}
