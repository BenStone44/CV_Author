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

const defaultLabels: Record<ChartEncodingChannel, string> = {
  x: "X axis",
  y: "Y axis",
  angle: "Angle",
  radius: "Radius",
  ring: "Ring",
  row: "Row",
  column: "Column",
  value: "Value",
  color: "Color",
  size: "Size",
  shape: "Shape",
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
  if ((template === "pie" || template === "donut") && channel === "radius") return "Outer radius";
  if (template === "matrix" && channel === "value") return "Cell value";
  return defaultLabels[channel];
}

export function getEncodingChannelConfigs(chartType: string): EncodingChannelConfig[] {
  const contract = getChartTemplateContract(chartType);
  if (!contract) return [];
  const template = normalizeChartTemplate(chartType);
  return contract.channels.map((mapping) => ({
    ...mapping,
    label: channelLabel(chartType, mapping.channel),
    emptyLabel: mapping.role === "style" || mapping.channel === "color" || mapping.channel === "size"
      ? "Static"
      : "Not bound",
    multiple: template === "pie" && mapping.channel === "angle",
  }));
}

export function resolvedEncodingField(spec: ChartSpec, channel: ChartEncodingChannel) {
  if (channel === "column") return spec.encodings.column?.field ?? spec.encodings.x?.field ?? "";
  if (channel === "row") return spec.encodings.row?.field ?? spec.encodings.y?.field ?? "";
  if (channel === "angle") return spec.encodings.angle?.field ?? spec.encodings.y?.field ?? "";
  if (channel === "color" && (normalizeChartTemplate(spec.chartType) === "pie" || normalizeChartTemplate(spec.chartType) === "donut")) {
    return spec.encodings.color?.field ?? spec.encodings.x?.field ?? "";
  }
  return spec.encodings[channel]?.field ?? "";
}

export function isEncodingColumnCompatible(config: EncodingChannelConfig, type: DataColumnType) {
  return config.accepts.includes(type);
}
