import type {
  ChartEncodingChannel,
  ChartTemplateKind,
  CoordinateChannel,
  DataColumnType,
} from "./types";

export type TemplateChannelMapping = {
  channel: ChartEncodingChannel;
  role: "dimension" | "measure" | "series" | "style";
  required: boolean;
  accepts: DataColumnType[];
};

export type ChartTemplateContract = {
  id: ChartTemplateKind;
  label: string;
  coordinateSystem: "Cartesian" | "Polar" | "None";
  markRole: "line" | "point" | "arc" | "cell";
  channels: TemplateChannelMapping[];
  shareableChannels: CoordinateChannel[];
  unusedDimensionStrategies: Array<"flatten" | "facet" | "nested">;
};

export const chartTemplateContracts: Record<ChartTemplateKind, ChartTemplateContract> = {
  line: {
    id: "line",
    label: "Line Chart",
    coordinateSystem: "Cartesian",
    markRole: "line",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["temporal", "quantitative", "nominal"] },
      { channel: "y", role: "measure", required: true, accepts: ["temporal", "quantitative"] },
      { channel: "color", role: "series", required: false, accepts: ["nominal", "quantitative"] },
      { channel: "size", role: "style", required: false, accepts: ["quantitative"] },
      { channel: "shape", role: "style", required: false, accepts: ["nominal"] },
    ],
    shareableChannels: ["x", "y"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  scatter: {
    id: "scatter",
    label: "Scatterplot",
    coordinateSystem: "Cartesian",
    markRole: "point",
    channels: [
      { channel: "x", role: "dimension", required: true, accepts: ["temporal", "quantitative", "nominal"] },
      { channel: "y", role: "measure", required: true, accepts: ["quantitative", "temporal", "nominal"] },
      { channel: "color", role: "style", required: false, accepts: ["nominal", "temporal", "quantitative"] },
      { channel: "size", role: "style", required: false, accepts: ["quantitative"] },
      { channel: "shape", role: "style", required: false, accepts: ["nominal"] },
    ],
    shareableChannels: ["x", "y"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  pie: {
    id: "pie",
    label: "Pie Chart",
    coordinateSystem: "Polar",
    markRole: "arc",
    channels: [
      { channel: "angle", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "dimension", required: false, accepts: ["nominal", "temporal"] },
      { channel: "radius", role: "measure", required: false, accepts: ["quantitative"] },
    ],
    shareableChannels: ["angle", "radius"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  donut: {
    id: "donut",
    label: "Donut Chart",
    coordinateSystem: "Polar",
    markRole: "arc",
    channels: [
      { channel: "angle", role: "measure", required: true, accepts: ["quantitative"] },
      { channel: "color", role: "dimension", required: false, accepts: ["nominal", "temporal"] },
      { channel: "ring", role: "series", required: false, accepts: ["nominal", "temporal"] },
      { channel: "radius", role: "measure", required: false, accepts: ["quantitative"] },
    ],
    shareableChannels: ["angle", "radius", "ring"],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
  matrix: {
    id: "matrix",
    label: "Matrix",
    coordinateSystem: "None",
    markRole: "cell",
    channels: [
      { channel: "row", role: "dimension", required: true, accepts: ["nominal", "temporal"] },
      { channel: "column", role: "dimension", required: true, accepts: ["nominal", "temporal"] },
      { channel: "value", role: "measure", required: false, accepts: ["quantitative"] },
      { channel: "color", role: "style", required: false, accepts: ["quantitative", "nominal"] },
    ],
    shareableChannels: [],
    unusedDimensionStrategies: ["flatten", "facet", "nested"],
  },
};

export function normalizeChartTemplate(chartType: string): ChartTemplateKind | null {
  const value = chartType.replace(/[\s_-]/g, "").toLowerCase();
  if (value.includes("scatter")) return "scatter";
  if (value.includes("donut")) return "donut";
  if (value.includes("pie")) return "pie";
  if (value.includes("matrix") || value.includes("heatmap")) return "matrix";
  if (value === "linegraph" || value.includes("linechart")) return "line";
  return null;
}

export function getChartTemplateContract(chartType: string) {
  const template = normalizeChartTemplate(chartType);
  return template ? chartTemplateContracts[template] : null;
}
