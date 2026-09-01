import type { ChartSpec, ChartEncodingChannel, DataColumnType } from "../types";
import { getChartEncodingSchema } from "./chartEncodingSchemas";
import { normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";

export type EncodingChannelConfig = {
  channel: ChartEncodingChannel;
  label: string;
  role: "dimension" | "measure" | "series" | "style";
  required: boolean;
  accepts: DataColumnType[];
  emptyLabel: "Not bound" | "Static";
  multiple?: boolean;
  categoricalExclusive?: boolean;
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
  channel: "theta" | "segment" | "radius";
  label: "Theta" | "Segment" | "R";
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
  if (getChartEncodingSchema(spec.chartType)?.coordinateSystem !== "Polar") return [];
  const thetaField = spec.encodings.theta?.field ?? spec.encodings.angle?.field ?? spec.encodings.y?.field;
  const radiusField = spec.encodings.radius?.field;
  const segmentField = spec.encodings.segment?.field;
  const segmentFields = spec.angleFields?.map((encoding) => encoding.field) ?? [];
  return [
    ...(thetaField === field ? [{ channel: "theta" as const, label: "Theta" as const }] : []),
    ...((template === "pie" || template === "donut" || spec.chartType.replace(/[\s_-]/g, "").toLowerCase() === "radialbarchart")
      && (segmentField === field || segmentFields.includes(field))
      ? [{ channel: "segment" as const, label: "Segment" as const }]
      : []),
    ...(radiusField === field ? [{ channel: "radius" as const, label: "R" as const }] : []),
  ];
}

export function getEncodingChannelConfigs(chartType: string): EncodingChannelConfig[] {
  const schema = getChartEncodingSchema(chartType);
  if (!schema) return [];
  return schema.channels
    .filter((channel) => channel.configurable !== false)
    .map((channel) => ({ ...channel }));
}

export function getEncodingChannelConfigsForSpec(spec: ChartSpec): EncodingChannelConfig[] {
  const configs = getEncodingChannelConfigs(spec.chartType);
  if (resolveChartTemplateVariant(spec) !== "line-multi") return configs;
  return configs.filter((config) => !["color", "size", "shape"].includes(config.channel));
}

function nativeEncodingFields(spec: ChartSpec, channel: ChartEncodingChannel) {
  const template = normalizeChartTemplate(spec.chartType);
  if (template === "matrix") {
    if (channel === "x") return [spec.encodings.x?.field, spec.encodings.column?.field];
    if (channel === "y") return [spec.encodings.y?.field, spec.encodings.row?.field];
    if (channel === "color") return [spec.encodings.color?.field, spec.encodings.value?.field];
  }
  if (template === "contour" && channel === "color") {
    return [spec.encodings.color?.field, spec.encodings.value?.field];
  }
  if (channel === "column") return [spec.encodings.column?.field, spec.encodings.x?.field];
  if (channel === "row") return [spec.encodings.row?.field, spec.encodings.y?.field];
  if (channel === "theta") {
    return [
      spec.encodings.theta?.field,
      spec.encodings.angle?.field,
      spec.encodings.y?.field,
    ];
  }
  if (channel === "segment" && (template === "pie" || template === "donut")) {
    return [
      spec.encodings.segment?.field,
      ...(spec.angleFields?.map((encoding) => encoding.field) ?? []),
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
  const contract = getChartEncodingSchema(spec.chartType);
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
    if (uniqueChannels.length < 2 || contract?.allowFieldReuse === true) return;
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
  if (channel === "theta" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    if (spec.angleFields?.length) return spec.angleFields[0]?.field ?? "";
    return spec.encodings.theta?.field ?? spec.encodings.angle?.field ?? spec.encodings.y?.field ?? "";
  }
  if (channel === "radius" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    return spec.encodings.radius?.field ?? "";
  }
  if (channel === "segment" && (template === "pie" || template === "donut")) {
    return spec.encodings.segment?.field ?? spec.angleFields?.[0]?.field ?? "";
  }
  if (channel === "column") return spec.encodings.column?.field ?? spec.encodings.x?.field ?? "";
  if (channel === "row") return spec.encodings.row?.field ?? spec.encodings.y?.field ?? "";
  if (template === "matrix") {
    if (channel === "x") return spec.encodings.x?.field ?? spec.encodings.column?.field ?? "";
    if (channel === "y") return spec.encodings.y?.field ?? spec.encodings.row?.field ?? "";
    if (channel === "color") return spec.encodings.color?.field ?? spec.encodings.value?.field ?? "";
  }
  if (template === "contour" && channel === "color") {
    return spec.encodings.color?.field ?? spec.encodings.value?.field ?? "";
  }
  if (channel === "theta") return spec.encodings.theta?.field ?? spec.encodings.angle?.field ?? spec.encodings.y?.field ?? "";
  if (channel === "dimensions") return spec.parallelFields?.[0]?.field ?? "";
  if (channel === "color" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    return spec.encodings.color?.field ?? spec.encodings.x?.field ?? "";
  }
  return spec.encodings[channel]?.field ?? "";
}

export function isEncodingColumnCompatible(config: EncodingChannelConfig, type: DataColumnType) {
  if (config.accepts.includes(type)) return true;
  // Ordinal values are ordered categorical data and can occupy legacy
  // nominal/temporal dimension and series roles.
  return type === "ordinal" && (config.accepts.includes("nominal") || config.accepts.includes("temporal"));
}
