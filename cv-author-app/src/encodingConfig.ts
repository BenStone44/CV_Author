import type { ChartSpec, ChartEncodingChannel, DataColumnType } from "./types";
import { getChartTemplateContract, normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";

export type EncodingChannelConfig = {
  channel: ChartEncodingChannel;
  label: string;
  role: "dimension" | "measure" | "series" | "style";
  required: boolean;
  accepts: DataColumnType[];
  emptyLabel: "Not bound" | "Static";
  multiple?: boolean;
};

export type ChartTemplateVariant =
  | "line-single"
  | "line-multi"
  | "scatter"
  | "bar-single"
  | "bar-grouped"
  | "bar-stacked"
  | "bar-divergent"
  | "bar-divergent-stacked"
  | "pie"
  | "donut"
  | "matrix"
  | "area"
  | "parallel"
  | "hierarchy"
  | "calendar"
  | "boxplot"
  | "contour"
  | "hexbin"
  | "flow"
  | "unknown";

export type PolarRadiusBindingMode = "static" | "mapped";

export type EncodingResolutionIssue = {
  code: "conflicting-sources" | "duplicate-data-field";
  channels: Array<ChartEncodingChannel | "series">;
  fields: string[];
  message: string;
};

export type PolarAxisRole = {
  channel: "angle" | "radius";
  label: "Theta" | "R";
};

export function resolvedSeriesField(spec: ChartSpec) {
  return spec.series?.field
    ?? spec.seriesFields?.[0]?.field
    ?? (spec.encodings.color?.type === "nominal" ? spec.encodings.color.field : undefined)
    ?? "";
}

export function hasDerivedValueSeries(spec: ChartSpec, valueSlot: "y" | "value" | "theta" = "y") {
  if (valueSlot === "theta" || valueSlot === "value") return (spec.angleFields?.length ?? 0) > 1;
  return (spec.valueFields?.length ?? 0) > 1;
}

export function resolveChartTemplateVariant(spec: ChartSpec): ChartTemplateVariant {
  const template = normalizeChartTemplate(spec.chartType);
  const chartType = spec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  if (chartType === "multilinechart") return "line-multi";
  if (template === "line") return resolvedSeriesField(spec) ? "line-multi" : "line-single";
  if (template === "bar") return `bar-${normalizeBarChartVariant(spec.chartType) ?? "single"}`;
  return template ?? "unknown";
}

export function resolvedPolarRadiusMode(spec: ChartSpec): PolarRadiusBindingMode {
  if (spec.encodings.radius) return "mapped";
  return "static";
}

export function resolvedPolarAxisRoles(spec: ChartSpec, field: string): PolarAxisRole[] {
  const template = normalizeChartTemplate(spec.chartType);
  if (template !== "pie" && template !== "donut") return [];
  const thetaFields = spec.angleFields?.map((encoding) => encoding.field)
    ?? [spec.encodings.angle?.field ?? spec.encodings.y?.field].filter((item): item is string => !!item);
  const radiusField = spec.encodings.radius?.field;
  return [
    ...(thetaFields.includes(field) ? [{ channel: "angle" as const, label: "Theta" as const }] : []),
    ...(radiusField === field ? [{ channel: "radius" as const, label: "R" as const }] : []),
  ];
}

const defaultLabels: Record<ChartEncodingChannel, string> = {
  x: "X axis",
  y: "Y axis",
  angle: "Theta",
  radius: "R",
  ring: "Ring",
  row: "Row",
  column: "Column",
  value: "Value",
  color: "Color",
  size: "Size",
  shape: "Shape",
  key: "ID",
  parent: "Parent ID",
  source: "Source",
  target: "Target",
  date: "Date",
  category: "Category",
  dimensions: "Dimensions",
};

function channelLabel(chartType: string, channel: ChartEncodingChannel) {
  const template = normalizeChartTemplate(chartType);
  if (template === "bar") {
    if (channel === "x") return "Category";
    if (channel === "y") return "Value";
    if (channel === "color") {
      const variant = normalizeBarChartVariant(chartType);
      return variant === "grouped" ? "Group" : variant === "stacked" || variant === "divergent-stacked" ? "Segment" : "Color";
    }
    if (channel === "size") return "Bar width";
  }
  if (template === "line" && channel === "size") return "Stroke width";
  if (template === "scatter" && channel === "size") return "Point size";
  if ((template === "pie" || template === "donut") && channel === "color") return "Category";
  if ((template === "pie" || template === "donut") && channel === "radius") return "R / Outer radius";
  if (template === "matrix" && channel === "value") return "Cell value";
  if (template === "area" && channel === "color") return "Series";
  if (template === "parallel" && channel === "dimensions") return "Numeric dimensions";
  if (template === "hierarchy" && channel === "key") return "Node ID";
  if (template === "hierarchy" && channel === "parent") return "Parent ID";
  if (template === "hierarchy" && channel === "value") return "Node value";
  if (template === "calendar" && channel === "value") return "Daily value";
  if (template === "boxplot" && channel === "x") return "Bin variable";
  if (template === "boxplot" && channel === "y") return "Distribution value";
  if (template === "contour" && channel === "value") return "Grid value";
  if (template === "flow" && channel === "value") return "Flow value";
  return defaultLabels[channel];
}

export function getEncodingChannelConfigs(chartType: string): EncodingChannelConfig[] {
  const contract = getChartTemplateContract(chartType);
  if (!contract) return [];
  const template = normalizeChartTemplate(chartType);
  const chartTypeId = chartType.replace(/[\s_-]/g, "").toLowerCase();
  const channels = chartTypeId === "linegraph"
    ? contract.channels.filter((mapping) => mapping.role !== "series")
    : contract.channels;
  return channels.map((mapping) => ({
    ...mapping,
    role: template === "bar"
      && mapping.channel === "color"
      && (normalizeBarChartVariant(chartType) === "single" || normalizeBarChartVariant(chartType) === "divergent")
      ? "style" as const
      : mapping.role,
    label: channelLabel(chartType, mapping.channel),
    emptyLabel: mapping.role === "style" || mapping.channel === "color" || mapping.channel === "size"
      ? "Static"
      : "Not bound",
    multiple: ((template === "pie" || template === "donut") && mapping.channel === "angle")
      || (template === "parallel" && mapping.channel === "dimensions"),
  }));
}

export function getEncodingChannelConfigsForSpec(spec: ChartSpec): EncodingChannelConfig[] {
  const configs = getEncodingChannelConfigs(spec.chartType);
  if (resolveChartTemplateVariant(spec) !== "line-multi") return configs;
  return configs.filter((config) => !["color", "size", "shape"].includes(config.channel));
}

function nativeEncodingFields(spec: ChartSpec, channel: ChartEncodingChannel) {
  const template = normalizeChartTemplate(spec.chartType);
  if (channel === "column") return [spec.encodings.column?.field, spec.encodings.x?.field];
  if (channel === "row") return [spec.encodings.row?.field, spec.encodings.y?.field];
  if (channel === "angle") {
    return [
      ...(spec.angleFields?.map((encoding) => encoding.field) ?? []),
      spec.encodings.angle?.field,
      spec.encodings.y?.field,
    ];
  }
  if (channel === "y" && (template === "line" || template === "area") && spec.valueFields?.length) {
    return spec.valueFields.map((encoding) => encoding.field);
  }
  if (channel === "dimensions") return spec.parallelFields?.map((encoding) => encoding.field) ?? [];
  if (channel === "color" && (template === "pie" || template === "donut")) {
    return [spec.encodings.color?.field, spec.encodings.x?.field];
  }
  return [spec.encodings[channel]?.field];
}

function uniqueFields(fields: Array<string | undefined>) {
  return Array.from(new Set(fields.filter((field): field is string => !!field)));
}

export function resolveChartEncodingIssues(spec: ChartSpec): EncodingResolutionIssue[] {
  const configs = getEncodingChannelConfigsForSpec(spec);
  const issues: EncodingResolutionIssue[] = [];
  const resolvedDataChannels: Array<{
    channel: ChartEncodingChannel | "series";
    fields: string[];
  }> = [];

  configs.forEach((config) => {
    const native = uniqueFields(nativeEncodingFields(spec, config.channel));
    if (config.role !== "style") {
      resolvedDataChannels.push({ channel: config.channel, fields: native });
    }
  });

  const seriesNative = uniqueFields([
    spec.series?.field,
    ...(spec.seriesFields?.map((encoding) => encoding.field) ?? []),
    spec.encodings.color?.type === "nominal" ? spec.encodings.color.field : undefined,
  ]);
  const resolvesLineSeries = normalizeChartTemplate(spec.chartType) === "line";
  if (resolvesLineSeries && resolveChartTemplateVariant(spec) === "line-multi" && !hasDerivedValueSeries(spec)) {
    resolvedDataChannels.push({ channel: "series", fields: seriesNative });
  }

  const owners = new Map<string, Array<ChartEncodingChannel | "series">>();
  resolvedDataChannels.forEach(({ channel, fields }) => fields.forEach((field) => {
    owners.set(field, [...(owners.get(field) ?? []), channel]);
  }));
  owners.forEach((channels, field) => {
    const uniqueChannels = Array.from(new Set(channels));
    if (uniqueChannels.length < 2) return;
    issues.push({
      code: "duplicate-data-field",
      channels: uniqueChannels,
      fields: [field],
      message: `${field} is assigned to multiple data channels: ${uniqueChannels.join(", ")}.`,
    });
  });
  return issues;
}

export function resolvedEncodingField(spec: ChartSpec, channel: ChartEncodingChannel) {
  const template = normalizeChartTemplate(spec.chartType);
  if (channel === "y" && (template === "line" || template === "area")) {
    if (spec.valueFields?.length) return spec.valueFields[0]?.field ?? "";
  }
  if (channel === "angle" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    if (spec.angleFields?.length) return spec.angleFields[0]?.field ?? "";
  }
  if (channel === "radius" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    return spec.encodings.radius?.field ?? "";
  }
  if (channel === "column") return spec.encodings.column?.field ?? spec.encodings.x?.field ?? "";
  if (channel === "row") return spec.encodings.row?.field ?? spec.encodings.y?.field ?? "";
  if (channel === "angle") return spec.encodings.angle?.field ?? spec.encodings.y?.field ?? "";
  if (channel === "dimensions") return spec.parallelFields?.[0]?.field ?? "";
  if (channel === "color" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    return spec.encodings.color?.field ?? spec.encodings.x?.field ?? "";
  }
  return spec.encodings[channel]?.field ?? "";
}

export function isEncodingColumnCompatible(config: EncodingChannelConfig, type: DataColumnType) {
  return config.accepts.includes(type);
}
