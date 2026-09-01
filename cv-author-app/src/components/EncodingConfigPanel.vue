<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, X } from "@lucide/vue";
import EncodingChannelField from "./EncodingChannelField.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import {
  getEncodingChannelConfigsForSpec,
  hasDerivedValueSeries,
  resolvedEncodingField,
  resolvedSeriesField,
  resolveChartTemplateVariant,
} from "../utils/encodingConfig";
import type { EncodingChannelConfig } from "../utils/encodingConfig";
import {
  getChartTemplateContract,
  normalizeChartTemplate,
  physicalCartesianAxisChannel,
} from "../utils/chartTemplates";
import type {
  ChartEncodingChannel,
  ChartAxisChannel,
  ChartAxisConfig,
  ChartSpec,
  CompositionSpec,
  CoordinateGuide,
  DataColumn,
  DataRow,
  LineSeriesShape,
  LinearColorMapping,
  LinearSizeMapping,
  MarkGroupSharedConfig,
  SeriesStyleMapping,
} from "../types";
import { chartAxisLabelsVisible, chartAxisVisible } from "../utils/chartAxes";
import {
  defaultColorMapping,
  defaultSizeMapping,
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  isSeriesStyleMapping,
  visualDomain,
} from "../utils/visualMapping";
import {
  csvColumnDragMime,
  decodeCsvColumnDragPayload,
  getActiveCsvColumnDrag,
} from "../utils/csvColumnDrag";
import { RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS } from "../utils/radialClusterLayout";
import {
  isDirectionalHierarchyChart,
  normalizeCartesianTreeDirection,
  type CartesianTreeDirection,
} from "../utils/treeLayout";
import { frontendPalette } from "../config/global";

const props = defineProps<{
  chartName: string;
  chartSpec: ChartSpec;
  embedded?: boolean;
  compositionOnly?: boolean;
  sectionLabel?: string;
  fatherColumns?: DataColumn[];
  coordinateGuide?: CoordinateGuide | null;
  columns: DataColumn[];
  rows: DataRow[];
  markConfig: MarkGroupSharedConfig;
  rendererError?: string;
  compositionSpec?: CompositionSpec | null;
  compositionMembers?: Array<{
    id: string;
    name: string;
    chartType: string;
    encodings: Partial<Record<ChartEncodingChannel, { field: string; type: string }>>;
  }>;
}>();

const emit = defineEmits<{
  close: [];
  channelChange: [channel: ChartEncodingChannel, field: string];
  seriesFieldChange: [field: string];
  seriesFieldsChange: [fields: string[]];
  valueSeriesFieldsChange: [fields: string[]];
  segmentFieldsChange: [fields: string[]];
  parallelFieldsChange: [fields: string[]];
  aggregationChange: [channel: ChartEncodingChannel, aggregation?: "sum" | "avg"];
  singleBarValueOrderChange: [direction: "source" | "ascending" | "descending", topN?: number];
  markConfigChange: [patch: MarkGroupSharedConfig];
  markConfigEditStart: [field: string];
  markConfigEditEnd: [];
  axisSwap: [swapped: boolean];
  chartAxisChange: [axis: ChartAxisChannel, patch: Pick<ChartAxisConfig, "visible" | "labelsVisible">];
  coordinateAxisReverse: [axis: "x" | "y"];
  compositionChange: [patch: {
    facetField?: string;
    facetDirection?: "row" | "column";
    facetRowGap?: number;
    facetColumnGap?: number;
    facetCoordinateSystem?: "Cartesian" | "Polar";
    facetThetaField?: string;
    facetRadiusField?: string;
    facetGrid?: CompositionSpec["facetGrid"];
  }];
}>();

const template = computed(() => normalizeChartTemplate(props.chartSpec.chartType));
const fatherColumnNames = computed(() => new Set((props.fatherColumns ?? []).map((column) => column.name)));
const columnDisplayLabel = (field: string) => fatherColumnNames.value.has(field) ? `father: ${field}` : field;
const isCartesian = computed(() => getChartTemplateContract(props.chartSpec.chartType)?.coordinateSystem === "Cartesian");
const axisSwapped = computed(() => props.chartSpec.axisSwapped === true);
function isDiscreteAxis(axis: "x" | "y") {
  const source = physicalCartesianAxisChannel(props.chartSpec, axis);
  const type = props.chartSpec.encodings[source]?.type;
  return type === "nominal" || type === "ordinal";
}
const normalizedChartType = computed(() => props.chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase());
const isSingleBar = computed(() => normalizedChartType.value === "singlebarchart");
const configs = computed(() => getEncodingChannelConfigsForSpec(props.chartSpec));
function displayedEncodingField(channel: ChartEncodingChannel) {
  return props.chartSpec.defaultDataBinding
    ? ""
    : resolvedEncodingField(props.chartSpec, channel);
}
const isPolar = computed(() => template.value === "pie"
  || template.value === "donut"
  || normalizedChartType.value === "radialbarchart");
const usesPolarAxisRows = computed(() => getChartTemplateContract(props.chartSpec.chartType)?.coordinateSystem === "Polar"
  && configs.value.some((config) => config.channel === "theta")
  && configs.value.some((config) => config.channel === "radius"));
const isMultiLine = computed(() => resolveChartTemplateVariant(props.chartSpec) === "line-multi");
const isExplicitMultiLine = computed(() => normalizedChartType.value === "multilinechart");
const isGroupedBar = computed(() => template.value === "bar" && normalizedChartType.value.includes("grouped"));
const barRequiresSegments = computed(() => {
  if (template.value !== "bar") return false;
  const variant = normalizedChartType.value;
  return variant.includes("stacked");
});
const areaRequiresSeries = computed(() => {
  if (template.value !== "area") return false;
  const type = normalizedChartType.value;
  return type.includes("stacked") || type.includes("stream") || type.includes("horizon");
});
const supportsBarValueSeries = computed(() => isGroupedBar.value || barRequiresSegments.value);
const supportsSeriesItems = computed(() => template.value === "line"
  || template.value === "area"
  || supportsBarValueSeries.value);
const seriesRole = computed(() => getChartTemplateContract(props.chartSpec.chartType)?.channels
  .find((config) => config.role === "series"));
const seriesItemsRequired = computed(() => supportsSeriesItems.value
  && (seriesRole.value?.required === true || isExplicitMultiLine.value));
const seriesItemLabel = computed(() => seriesRole.value?.semanticLabel ?? "Series");
const isParallel = computed(() => template.value === "parallel");
const isHierarchy = computed(() => template.value === "hierarchy");
const isDirectionalHierarchy = computed(() => isDirectionalHierarchyChart(props.chartSpec.chartType));
const treeDirection = computed(() => normalizeCartesianTreeDirection(props.markConfig.treeDirection));
const treeDirections: Array<{
  value: CartesianTreeDirection;
  label: string;
  icon: typeof ArrowRight;
}> = [
  { value: "right", label: "Grow right", icon: ArrowRight },
  { value: "left", label: "Grow left", icon: ArrowLeft },
  { value: "down", label: "Grow down", icon: ArrowDown },
  { value: "up", label: "Grow up", icon: ArrowUp },
];
const isForceDirected = computed(() => normalizedChartType.value === "forcedirectedgraph");
const nodeLabelsVisible = computed(() => props.markConfig.nodeLabelsVisible !== false);
function markNumber(name: string, fallback: number) {
  const value = Number(props.markConfig[name]);
  return Number.isFinite(value) ? value : fallback;
}
const forceChargeStrength = computed(() => Math.abs(markNumber("chargeStrength", -120)));
const forceLinkDistance = computed(() => markNumber("linkDistance", 80));
const forceLinkStrength = computed(() => markNumber("linkStrength", 0.7));
const forceCenterStrength = computed(() => markNumber("centerStrength", 0.08));
const forceCollisionRadius = computed(() => markNumber("collisionRadius", 10));
const standardConfigs = computed(() => configs.value.filter((config) => {
  if (isCartesian.value && (config.channel === "x" || config.channel === "y")) return false;
  if (isPolar.value && config.channel === "segment") return false;
  if (usesPolarAxisRows.value && config.channel === "theta") return false;
  if (usesPolarAxisRows.value && config.channel === "radius") return false;
  if (isParallel.value && config.channel === "dimensions") return false;
  if (supportsSeriesItems.value && config.role === "series" && template.value !== "scatter") return false;
  return true;
}));
const compactConfigs = computed(() => standardConfigs.value.filter((config) =>
  (config.channel === "color" || config.channel === "size")
  && !(config.channel === "size" && normalizedChartType.value === "dendrogram" && !sizeField.value)));
const otherStandardConfigs = computed(() => standardConfigs.value.filter((config) => config.channel !== "color" && config.channel !== "size"));
const seriesMembers = computed(() => {
  const field = props.chartSpec.defaultDataBinding
    ? undefined
    : selectedSeriesFields.value[0] ?? resolvedSeriesField(props.chartSpec);
  if (!field) return [];
  return Array.from(new Set(props.rows.map((row) => row[field] ?? "").filter(Boolean)))
    .map((id) => ({ id, label: id }));
});
const selectedValueSeriesFields = computed(() => props.chartSpec.defaultDataBinding
  ? []
  : props.chartSpec.valueFields?.map((encoding) => encoding.field) ?? []);
const selectedSeriesFields = computed(() => props.chartSpec.defaultDataBinding
  ? []
  : props.chartSpec.seriesFields?.map((encoding) => encoding.field)
  ?? (props.chartSpec.series
    ? [props.chartSpec.series.field]
    : template.value === "scatter"
      && (props.chartSpec.encodings.color?.type === "nominal" || props.chartSpec.encodings.color?.type === "temporal")
      ? [props.chartSpec.encodings.color.field]
      : []));
const seriesItemMode = computed<"categorical" | "quantitative" | null>(() => {
  if (selectedSeriesFields.value.length > 0) return "categorical";
  if (selectedValueSeriesFields.value.length > 0) return "quantitative";
  return null;
});
const seriesItemColumns = computed(() => props.columns.filter((column) => template.value === "scatter"
  ? column.type === "nominal" || column.type === "temporal" || column.type === "ordinal"
  : column.type === "nominal" || column.type === "temporal" || column.type === "ordinal" || column.type === "quantitative"));
const seriesItemDropState = ref<"idle" | "valid" | "invalid">("idle");
const segmentDropState = ref<"idle" | "valid" | "invalid">("idle");
const detailPanel = ref<"color" | "size" | null>(null);
const openSlider = ref<string | null>(null);
function toggleSlider(id: string) {
  openSlider.value = openSlider.value === id ? null : id;
}
const editableSeriesMembers = computed(() => seriesItemMode.value === "quantitative"
  ? selectedValueSeriesFields.value.map((field) => ({ id: field, label: field }))
  : seriesMembers.value);
const seriesStyleMapping = computed<SeriesStyleMapping>(() => {
  if (isSeriesStyleMapping(props.markConfig.seriesStyleMapping)) return props.markConfig.seriesStyleMapping;
  const legacy = isCategoricalColorMapping(props.markConfig.seriesColorMapping)
    ? props.markConfig.seriesColorMapping.values
    : {};
  return {
    type: "series-style",
    values: Object.fromEntries(Object.entries(legacy).map(([memberId, color]) => [memberId, { color }])),
  };
});
const legendVisible = computed(() => props.markConfig.legendVisible === true);
const quantitativeColumns = computed(() => props.columns.filter((column) => column.type === "quantitative"));
const parallelColumns = computed(() => props.columns.filter((column) =>
  column.type === "quantitative" || column.type === "nominal" || column.type === "ordinal" || column.type === "temporal"));
const aggregationEntries = computed(() => {
  const configured = Object.entries(props.chartSpec.aggregations ?? {})
    .flatMap(([channel, aggregation]) => {
      const encoding = props.chartSpec.encodings[channel as ChartEncodingChannel];
      return aggregation && encoding?.type === "quantitative"
        ? [{ channel: channel as ChartEncodingChannel, aggregation, automatic: props.chartSpec.autoAggregations?.[channel as ChartEncodingChannel] !== undefined }]
        : [];
    });
  if (!usesPolarAxisRows.value) return configured;
  const entries = new Map<ChartEncodingChannel, {
    channel: ChartEncodingChannel;
    aggregation?: "sum" | "avg";
    automatic: boolean;
  }>();
  configured.forEach((entry) => entries.set(entry.channel, entry));
  configs.value.forEach((config) => {
    const encoding = props.chartSpec.encodings[config.channel];
    if (config.role !== "measure" || encoding?.type !== "quantitative" || entries.has(config.channel)) return;
    entries.set(config.channel, { channel: config.channel, aggregation: undefined, automatic: false });
  });
  return Array.from(entries.values());
});
const singleBarValueOrder = computed(() => {
  const groupField = props.chartSpec.encodings.x?.field;
  const valueField = props.chartSpec.encodings.y?.field;
  return props.chartSpec.dataTransforms?.find((transform) => transform.kind === "order"
    && transform.groupField === groupField
    && transform.valueField === valueField) ?? null;
});
const singleBarSortDirection = computed(() => singleBarValueOrder.value?.direction ?? "source");
const singleBarTopN = computed(() => singleBarValueOrder.value?.limit);
const selectedSegmentFields = computed(() => props.chartSpec.encodings.segment?.field
  && !props.chartSpec.defaultDataBinding
  ? [props.chartSpec.encodings.segment.field]
  : props.chartSpec.defaultDataBinding
    ? []
    : props.chartSpec.angleFields?.map((encoding) => encoding.field) ?? []);
const polarSegmentMode = computed<"categorical" | "quantitative" | null>(() => {
  if (props.chartSpec.defaultDataBinding) return null;
  if (props.chartSpec.encodings.segment?.field) return "categorical";
  if ((props.chartSpec.angleFields?.length ?? 0) > 0) return "quantitative";
  return null;
});
const polarSegmentMembers = computed(() => {
  if (props.chartSpec.defaultDataBinding) return [];
  const field = props.chartSpec.encodings.segment?.field;
  if (field) {
    return Array.from(new Set(props.rows.map((row) => row[field] ?? "").filter(Boolean)))
      .map((id) => ({ id, label: id }));
  }
  return (props.chartSpec.angleFields ?? []).map((encoding) => ({
    id: encoding.field,
    label: encoding.field,
  }));
});
const polarSegmentColumns = computed(() => {
  const config = configs.value.find((item) => item.channel === "segment");
  if (!config) return [];
  return props.columns.filter((column) => config.accepts.includes(column.type));
});
const selectedParallelFields = computed(() => props.chartSpec.parallelFields?.map((encoding) => encoding.field) ?? []);
const staticRadius = computed(() => typeof props.markConfig.outerRadius === "number"
  ? props.markConfig.outerRadius
  : 1);
const polarThetaConfig = computed(() => configs.value.find((config) => config.channel === "theta"));
const polarRadiusConfig = computed(() => configs.value.find((config) => config.channel === "radius"));
const radiusField = computed(() => displayedEncodingField("radius"));
const colorConfig = computed(() => configs.value.find((config) => config.channel === "color"));
const sizeConfig = computed(() => configs.value.find((config) => config.channel === "size"));
const colorField = computed(() => displayedEncodingField("color"));
const sizeField = computed(() => displayedEncodingField("size"));
const colorColumn = computed(() => props.columns.find((column) => column.name === colorField.value));
const supportsLegend = computed(() => (isPolar.value && polarSegmentMembers.value.length > 0)
  || supportsSeriesItems.value
  || (template.value === "scatter" && colorColumn.value?.type === "nominal"));
const showColorMapping = computed(() => !!colorColumn.value && colorColumn.value.type !== "nominal");
const colorDomain = computed(() => {
  const column = colorColumn.value;
  if (!colorField.value || column?.type !== "quantitative") return null;
  const operation = props.chartSpec.aggregations?.color ?? props.chartSpec.autoAggregations?.color;
  if (!operation) return visualDomain(props.rows, { field: colorField.value, type: column.type });
  const dimensions = [
    ...Object.entries(props.chartSpec.encodings)
      .filter(([channel, encoding]) => channel !== "color" && channel !== "size" && encoding && encoding.type !== "quantitative")
      .map(([, encoding]) => encoding!.field),
    ...(props.chartSpec.seriesFields?.map((encoding) => encoding.field) ?? []),
    ...(props.chartSpec.series ? [props.chartSpec.series.field] : []),
  ];
  const groups = new Map<string, DataRow[]>();
  props.rows.forEach((row) => {
    const key = JSON.stringify(dimensions.map((field) => row[field] ?? ""));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  const aggregatedRows = Array.from(groups.values()).flatMap((rows) => {
    const values = rows.map((row) => Number(row[colorField.value!] ?? "")).filter(Number.isFinite);
    if (values.length === 0 || !rows[0]) return [];
    const value = operation === "avg"
      ? values.reduce((sum, current) => sum + current, 0) / values.length
      : values.reduce((sum, current) => sum + current, 0);
    return [{ ...rows[0], [colorField.value!]: String(value) }];
  });
  return visualDomain(aggregatedRows, { field: colorField.value, type: column.type });
});
const showSizeMapping = computed(() => !!sizeField.value);
const staticColor = computed(() => typeof props.markConfig.color === "string" ? props.markConfig.color : "#99582a");
const staticSize = computed(() => typeof props.markConfig.size === "number" ? props.markConfig.size : 4);
const dendrogramNodeSize = computed(() => typeof props.markConfig.size === "number" ? props.markConfig.size : 2.5);
const horizonBands = computed(() => typeof props.markConfig.bands === "number" ? props.markConfig.bands : 7);
const treemapTile = computed(() => typeof props.markConfig.tile === "string" ? props.markConfig.tile : "binary");
const radialDendrogramLeafRadius = computed(() => typeof props.markConfig.leafRadius === "number"
  ? props.markConfig.leafRadius
  : RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS);
const hexbinRadius = computed(() => typeof props.markConfig.radius === "number" ? props.markConfig.radius : 8);
const sankeyAlignment = computed(() => typeof props.markConfig.nodeAlign === "string" ? props.markConfig.nodeAlign : "justify");
const sankeyLinkColor = computed(() => typeof props.markConfig.linkColor === "string" ? props.markConfig.linkColor : "source-target");
const colorMapping = computed(() => isLinearColorMapping(props.markConfig.colorMapping) ? props.markConfig.colorMapping : defaultColorMapping);
const colorScaleGradient = computed(() => `linear-gradient(90deg, ${colorMapping.value.stops
  .slice()
  .sort((left, right) => left.offset - right.offset)
  .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
  .join(", ")})`);
const sizeMapping = computed(() => isLinearSizeMapping(props.markConfig.sizeMapping) ? props.markConfig.sizeMapping : defaultSizeMapping);
const composition = computed(() => props.compositionSpec ?? null);
const isFacetComposition = computed(() => composition.value?.type === "facet");
const facetCoordinateSystem = computed(() => composition.value?.facetCoordinateSystem ?? "Cartesian");
const facetFieldOptions = computed(() => props.columns);
const facetColumnField = computed(() => {
  if (!composition.value || composition.value.type !== "facet") return "";
  return composition.value.facetGrid?.columnField
    ?? (composition.value.facetDirection === "column" ? composition.value.facetField : "")
    ?? "";
});
const facetRowField = computed(() => {
  if (!composition.value || composition.value.type !== "facet") return "";
  return composition.value.facetGrid?.rowField
    ?? (composition.value.facetDirection === "row" ? composition.value.facetField : "")
    ?? "";
});
const facetThetaField = computed(() => composition.value?.facetThetaField ?? facetColumnField.value);
const facetRadiusField = computed(() => composition.value?.facetRadiusField ?? facetRowField.value);
const facetRowGap = computed(() => composition.value?.facetRowGap ?? 4);
const facetColumnGap = computed(() => composition.value?.facetColumnGap ?? 4);
function updateFacetField(direction: "row" | "column", field: string) {
  const current = composition.value;
  if (!current || current.type !== "facet") return;
  if (current.facetGrid) {
    const grid = {
      ...current.facetGrid,
      ...(direction === "row" ? { rowField: field } : { columnField: field }),
    };
    emit("compositionChange", { facetGrid: grid });
    return;
  }
  emit("compositionChange", {
    facetField: field,
    facetDirection: direction,
  });
}
function updateFacetPolarField(channel: "theta" | "radius", field: string) {
  updateFacetField(channel === "theta" ? "column" : "row", field);
  emit("compositionChange", channel === "theta"
    ? { facetCoordinateSystem: "Polar", facetThetaField: field }
    : { facetCoordinateSystem: "Polar", facetRadiusField: field });
}
function numericValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}
const fallbackSeriesColors = frontendPalette.series;
function seriesMemberColor(memberId: string, index: number) {
  return seriesStyleMapping.value.values[memberId]?.color
    ?? fallbackSeriesColors[index % fallbackSeriesColors.length]!;
}
function seriesMemberStrokeWidth(memberId: string) {
  return seriesStyleMapping.value.values[memberId]?.strokeWidth
    ?? Number(props.markConfig.strokeWidth ?? 2.5);
}
function seriesMemberShape(memberId: string): LineSeriesShape {
  return seriesStyleMapping.value.values[memberId]?.shape ?? "solid";
}
function updateSeriesMemberStyle(memberId: string, patch: { color?: string; strokeWidth?: number; shape?: LineSeriesShape }) {
  emit("markConfigChange", {
    seriesStyleMapping: {
      type: "series-style",
      values: {
        ...seriesStyleMapping.value.values,
        [memberId]: { ...seriesStyleMapping.value.values[memberId], ...patch },
      },
    },
  });
}
function axisChannel(channel: ChartEncodingChannel) {
  if (!axisSwapped.value || (channel !== "x" && channel !== "y")) return channel;
  return physicalCartesianAxisChannel(props.chartSpec, channel);
}

function axisConfig(config: EncodingChannelConfig) {
  const channel = axisChannel(config.channel);
  return channel === config.channel ? config : { ...config, label: channel.toUpperCase() };
}

const axisRows = computed(() => (["x", "y"] as const).flatMap((axis) => {
  const bindingAxis = axisChannel(axis);
  const config = configs.value.find((item) => item.channel === bindingAxis);
  // Keep the physical X/Y rows stable; only the selected binding shown in the
  // dropdown moves to the opposite row when axes are swapped.
  return config ? [{ axis, bindingAxis, config: { ...config, label: axis.toUpperCase() } }] : [];
}));

function isEncodingChannelDisabled(channel: ChartEncodingChannel) {
  if (channel === "y") return hasDerivedValueSeries(props.chartSpec);
  if (channel === "theta") return hasDerivedValueSeries(props.chartSpec, "theta");
  return false;
}

function displayedEncodingConfig(config: EncodingChannelConfig) {
  return isEncodingChannelDisabled(config.channel) ? { ...config, required: false } : config;
}

function axisVisibility(axis: "x" | "y") {
  return chartAxisVisible(props.chartSpec, props.coordinateGuide, axis);
}

function axisLabelsVisible(axis: "x" | "y") {
  return chartAxisLabelsVisible(props.chartSpec, props.coordinateGuide, axis);
}

function polarAxisVisibility(axis: "theta" | "radius") {
  return chartAxisVisible(props.chartSpec, props.coordinateGuide, axis);
}

function polarAxisLabelsVisible(axis: "theta" | "radius") {
  return chartAxisLabelsVisible(props.chartSpec, props.coordinateGuide, axis);
}

function setAxisVisibility(axis: "x" | "y", visible: boolean) {
  emit("chartAxisChange", axis, { visible });
}

function setAxisLabelsVisible(axis: "x" | "y", visible: boolean) {
  emit("chartAxisChange", axis, { labelsVisible: visible });
}

function setPolarAxisVisibility(axis: "theta" | "radius", visible: boolean) {
  emit("chartAxisChange", axis, { visible });
}

function setPolarAxisLabelsVisible(axis: "theta" | "radius", visible: boolean) {
  emit("chartAxisChange", axis, { labelsVisible: visible });
}

function toggleDetailPanel(channel: "color" | "size") {
  detailPanel.value = detailPanel.value === channel ? null : channel;
}

function isSeriesItemDisabled(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (!column || !seriesItemMode.value) return false;
  if (seriesItemMode.value === "categorical") {
    // A categorical series/group/segment binding is exclusive; measure sets
    // use the separate quantitative mode below and may contain multiple fields.
    const categorical = column.type === "nominal"
      || column.type === "ordinal"
      || ((template.value === "line" || template.value === "area" || template.value === "scatter")
        && column.type === "temporal");
    return (!categorical && !selectedSeriesFields.value.includes(field))
      || (seriesRole.value?.categoricalExclusive === true && !selectedSeriesFields.value.includes(field))
      || (seriesRole.value?.multiple !== true && !selectedSeriesFields.value.includes(field));
  }
  return column.type !== "quantitative";
}

function toggleSeriesItemField(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (!column || isSeriesItemDisabled(field)) return;
  if (column.type === "quantitative") {
    emit("valueSeriesFieldsChange", selectedValueSeriesFields.value.includes(field)
      ? selectedValueSeriesFields.value.filter((item) => item !== field)
      : [...selectedValueSeriesFields.value, field]);
    return;
  }
  if (seriesRole.value?.multiple === true) {
    emit("seriesFieldsChange", selectedSeriesFields.value.includes(field)
      ? selectedSeriesFields.value.filter((item) => item !== field)
      : [...selectedSeriesFields.value, field]);
  } else {
    emit("seriesFieldsChange", selectedSeriesFields.value.includes(field) ? [] : [field]);
  }
}

function seriesItemDragColumn(event: DragEvent) {
  const payload = decodeCsvColumnDragPayload(event.dataTransfer?.getData(csvColumnDragMime))
    ?? getActiveCsvColumnDrag();
  if (!payload || payload.datasetId !== props.chartSpec.datasetId) return null;
  const column = props.columns.find((item) => item.name === payload.field && item.type === payload.type);
  return column ?? null;
}

function onSeriesItemDragOver(event: DragEvent) {
  const column = seriesItemDragColumn(event);
  const compatible = !!column && !isSeriesItemDisabled(column.name);
  seriesItemDropState.value = compatible ? "valid" : "invalid";
  if (event.dataTransfer) event.dataTransfer.dropEffect = compatible ? "copy" : "none";
}

function onSeriesItemDragLeave(event: DragEvent) {
  const current = event.currentTarget;
  const related = event.relatedTarget;
  if (current instanceof Element && related instanceof Node && current.contains(related)) return;
  seriesItemDropState.value = "idle";
}

function onSeriesItemDrop(event: DragEvent) {
  const column = seriesItemDragColumn(event);
  seriesItemDropState.value = "idle";
  if (!column || isSeriesItemDisabled(column.name)) return;
  if (column.type === "quantitative") {
    if (!selectedValueSeriesFields.value.includes(column.name)) {
      emit("valueSeriesFieldsChange", [...selectedValueSeriesFields.value, column.name]);
    }
    return;
  }
  if (!selectedSeriesFields.value.includes(column.name)) {
    emit("seriesFieldsChange", seriesRole.value?.multiple === true
      ? [...selectedSeriesFields.value, column.name]
      : [column.name]);
  }
}

function toggleSegmentField(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (!column || isSegmentFieldDisabled(field)) return;
  if (column.type === "quantitative") {
    emit("segmentFieldsChange", selectedSegmentFields.value.includes(field)
      ? selectedSegmentFields.value.filter((item) => item !== field)
      : [...selectedSegmentFields.value, field]);
  } else {
    emit("segmentFieldsChange", selectedSegmentFields.value.includes(field) ? [] : [field]);
  }
}

function isSegmentFieldDisabled(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (!column || !polarSegmentMode.value) return false;
  if (polarSegmentMode.value === "categorical") return !selectedSegmentFields.value.includes(field);
  return column.type !== "quantitative";
}

function segmentDragColumn(event: DragEvent) {
  const payload = decodeCsvColumnDragPayload(event.dataTransfer?.getData(csvColumnDragMime))
    ?? getActiveCsvColumnDrag();
  if (!payload || payload.datasetId !== props.chartSpec.datasetId) return null;
  const column = props.columns.find((item) => item.name === payload.field && item.type === payload.type);
  if (!column) return null;
  if (selectedSegmentFields.value.includes(column.name)) return column;
  if (polarSegmentMode.value === "categorical") return null;
  if (polarSegmentMode.value === "quantitative" && column.type !== "quantitative") return null;
  const segmentConfig = configs.value.find((config) => config.channel === "segment");
  return segmentConfig?.accepts.includes(column.type) ? column : null;
}

function onSegmentDragOver(event: DragEvent) {
  const compatible = segmentDragColumn(event) !== null;
  segmentDropState.value = compatible ? "valid" : "invalid";
  if (event.dataTransfer) event.dataTransfer.dropEffect = compatible ? "copy" : "none";
}

function onSegmentDragLeave(event: DragEvent) {
  const current = event.currentTarget;
  const related = event.relatedTarget;
  if (current instanceof Element && related instanceof Node && current.contains(related)) return;
  segmentDropState.value = "idle";
}

function onSegmentDrop(event: DragEvent) {
  const column = segmentDragColumn(event);
  segmentDropState.value = "idle";
  if (!column || selectedSegmentFields.value.includes(column.name)) return;
  emit("segmentFieldsChange", [...selectedSegmentFields.value, column.name]);
}

function toggleParallelField(field: string) {
  emit("parallelFieldsChange", selectedParallelFields.value.includes(field)
    ? selectedParallelFields.value.filter((item) => item !== field)
    : [...selectedParallelFields.value, field]);
}

function updateMappingDefaults(channel: ChartEncodingChannel, field: string) {
  emit("channelChange", channel, field);
  const column = props.columns.find((item) => item.name === field);
  if (channel === "color" && column && column.type !== "nominal" && !isLinearColorMapping(props.markConfig.colorMapping)) {
    emit("markConfigChange", { colorMapping: defaultColorMapping });
  }
  if (channel === "size" && field && !isLinearSizeMapping(props.markConfig.sizeMapping)) {
    emit("markConfigChange", { sizeMapping: defaultSizeMapping });
  }
}

function updateSingleBarTopN(rawValue: string) {
  const value = Number(rawValue);
  emit(
    "singleBarValueOrderChange",
    singleBarSortDirection.value,
    Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined,
  );
}
</script>

<template>
  <div class="encoding-config" :class="{ 'encoding-config--hierarchy': isHierarchy }">
    <header class="encoding-config__header">
      <div>
        <strong>{{ sectionLabel ?? 'MARK ENCODINGS' }}</strong>
        <span>{{ chartName }}</span>
      </div>
      <button v-if="!embedded" type="button" title="Close" aria-label="Close encoding panel" @click="emit('close')">
        <X :size="16" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </header>

    <div v-if="columns.length" class="encoding-config__channels">
      <div class="encoding-config__columns">
      <section
        v-if="compositionSpec?.type === 'layer'"
        class="encoding-config__column encoding-config__column--composition-summary"
        aria-label="Composite coordinate system"
      >
        <div class="encoding-config__column-heading">
          <strong>Composition</strong>
          <span>{{ compositionSpec.type }} - {{ coordinateGuide?.type ?? 'CoordinateFree' }}</span>
        </div>
        <p class="encoding-config__composition-summary">
          Shared {{ compositionSpec.sharedChannels.length ? compositionSpec.sharedChannels.join(' / ').toUpperCase() : 'coordinate frame' }}
        </p>
      </section>
      <section v-if="!compositionOnly" class="encoding-config__column" aria-label="Chart encodings">
      <div v-if="compositionMembers?.length" class="encoding-config__column-heading">
        <strong>Composite encodings</strong>
        <span>{{ compositionSpec?.type ?? 'Composition' }}</span>
      </div>
      <section v-if="usesPolarAxisRows && polarThetaConfig && polarRadiusConfig" class="encoding-config__axis-rows" aria-label="Polar axis encodings">
        <div class="encoding-config__axis-rows-toolbar">
          <div class="encoding-config__axis-toolbar-options">
            <span class="encoding-config__axis-toolbar-label">Axes</span>
            <span class="encoding-config__axis-toolbar-label">Labels</span>
          </div>
        </div>
        <div class="encoding-config__axis-row">
          <div class="encoding-config__axis-channel-label">
            <span class="encoding-config__axis-row-label">THETA</span>
          </div>
          <EncodingChannelField
            :config="displayedEncodingConfig({ ...polarThetaConfig, label: 'Theta' })"
            :columns="columns"
            :father-columns="fatherColumns"
            :value="displayedEncodingField('theta')"
            :disabled="isEncodingChannelDisabled('theta')"
            @change="updateMappingDefaults('theta', $event)"
          />
          <div class="encoding-config__axis-controls">
            <label class="encoding-config__axis-toggle">
              <input
                type="checkbox"
                :checked="polarAxisVisibility('theta')"
                aria-label="Show Theta axis"
                @change="setPolarAxisVisibility('theta', ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <label class="encoding-config__axis-label-toggle">
              <input
                type="checkbox"
                :checked="polarAxisLabelsVisible('theta')"
                aria-label="Show Theta labels"
                @change="setPolarAxisLabelsVisible('theta', ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </div>
        <div class="encoding-config__axis-row encoding-config__axis-row--polar-radius">
          <div class="encoding-config__axis-channel-label">
            <span class="encoding-config__axis-row-label">R</span>
          </div>
          <div
            class="encoding-config__polar-radius-editor"
            :class="{ 'is-mapped': !!radiusField }"
          >
            <EncodingChannelField
              :config="{ ...polarRadiusConfig, label: 'R field', emptyLabel: polarRadiusConfig.required ? 'Not bound' : 'Static' }"
              :columns="columns"
              :father-columns="fatherColumns"
              :value="radiusField"
              @change="updateMappingDefaults('radius', $event)"
            />
            <label v-if="!radiusField && !polarRadiusConfig.required" class="encoding-config__polar-radius-control">
              <output>{{ Math.round(staticRadius * 100) }}%</output>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="staticRadius"
                aria-label="Static R value"
                @pointerdown="emit('markConfigEditStart', 'outerRadius')"
                @focus="emit('markConfigEditStart', 'outerRadius')"
                @pointerup="emit('markConfigEditEnd')"
                @pointercancel="emit('markConfigEditEnd')"
                @blur="emit('markConfigEditEnd')"
                @change="emit('markConfigEditEnd')"
                @input="emit('markConfigChange', { outerRadius: Number(($event.target as HTMLInputElement).value) })"
              />
            </label>
          </div>
          <div class="encoding-config__axis-controls">
            <label class="encoding-config__axis-toggle">
              <input
                type="checkbox"
                :checked="polarAxisVisibility('radius')"
                aria-label="Show R axis"
                @change="setPolarAxisVisibility('radius', ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <label class="encoding-config__axis-label-toggle">
              <input
                type="checkbox"
                :checked="polarAxisLabelsVisible('radius')"
                aria-label="Show R labels"
                @change="setPolarAxisLabelsVisible('radius', ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </div>
      </section>
      <section v-if="isCartesian && axisRows.length" class="encoding-config__axis-rows" aria-label="Cartesian axis encodings">
        <div class="encoding-config__axis-rows-toolbar">
          <div class="encoding-config__axis-switch">
            <span>Swap axes</span>
            <button
              type="button"
              role="switch"
              :aria-checked="axisSwapped"
              :class="{ 'is-active': axisSwapped }"
              @click="emit('axisSwap', !axisSwapped)"
            >
              {{ axisSwapped ? "Y / X" : "X / Y" }}
            </button>
          </div>
          <div class="encoding-config__axis-toolbar-options">
            <span class="encoding-config__axis-toolbar-label">Axes</span>
            <span class="encoding-config__axis-toolbar-label">Labels</span>
          </div>
        </div>
        <div v-for="row in axisRows" :key="row.axis" class="encoding-config__axis-row">
          <div class="encoding-config__axis-channel-label">
            <span class="encoding-config__axis-row-label">{{ row.axis.toUpperCase() }}</span>
            <button
              type="button"
              class="encoding-config__axis-direction-button"
              :title="`Reverse ${row.axis.toUpperCase()}-axis direction`"
              :aria-label="`Reverse ${row.axis.toUpperCase()}-axis direction`"
              @click="emit('coordinateAxisReverse', row.axis)"
            >
              <ArrowLeftRight :size="12" :stroke-width="1.8" :class="{ 'encoding-config__axis-directions-y-icon': row.axis === 'y' }" aria-hidden="true" />
            </button>
          </div>
          <EncodingChannelField
            :config="displayedEncodingConfig(row.config)"
            :columns="columns"
            :father-columns="fatherColumns"
            :value="displayedEncodingField(row.bindingAxis)"
            :disabled="isEncodingChannelDisabled(row.bindingAxis)"
            @change="updateMappingDefaults(row.bindingAxis, $event)"
          />
          <div class="encoding-config__axis-controls">
            <label class="encoding-config__axis-toggle">
              <input
                type="checkbox"
                :checked="axisVisibility(row.axis)"
                :aria-label="`Show ${row.axis.toUpperCase()} axis`"
                @change="setAxisVisibility(row.axis, ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <label class="encoding-config__axis-label-toggle">
              <input
                type="checkbox"
                :checked="axisLabelsVisible(row.axis)"
                :aria-label="`Show ${row.axis.toUpperCase()} labels`"
                @change="setAxisLabelsVisible(row.axis, ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </div>
      </section>
      <section v-if="compositionMembers?.length" class="encoding-config__member-list" aria-label="Composition chart encodings">
        <header>
          <strong>Charts in composition</strong>
          <span>Enter the composition to edit a chart independently.</span>
        </header>
        <details v-for="member in compositionMembers" :key="member.id" class="encoding-config__member-entry">
          <summary>
            <span>{{ member.name }}</span>
            <small>{{ member.chartType }}</small>
          </summary>
          <dl>
            <template v-for="(encoding, channel) in member.encodings" :key="channel">
              <dt>{{ channel }}</dt>
              <dd>{{ encoding?.field }}</dd>
            </template>
          </dl>
        </details>
      </section>
      <template v-for="config in otherStandardConfigs" :key="config.channel">
        <div class="encoding-config__channel-row">
          <EncodingChannelField
            :config="displayedEncodingConfig(axisConfig(config))"
            :columns="columns"
            :father-columns="fatherColumns"
            :value="displayedEncodingField(config.channel)"
            :disabled="isEncodingChannelDisabled(config.channel)"
            @change="updateMappingDefaults(config.channel, $event)"
          />
        </div>
      </template>
      <div v-if="compactConfigs.length" class="encoding-config__detail-fields">
        <div v-for="config in compactConfigs" :key="config.channel" class="encoding-config__detail-row">
          <EncodingChannelField
            :config="axisConfig(config)"
            :columns="columns"
            :father-columns="fatherColumns"
            :value="displayedEncodingField(config.channel)"
            @change="updateMappingDefaults(config.channel, $event)"
          />
          <div class="encoding-config__detail-control">
            <input
              v-if="config.channel === 'color' && !colorField"
              class="encoding-config__static-color-picker"
              type="color"
              list="frontend-color-palette"
              :value="staticColor"
              aria-label="Color value"
              @input="emit('markConfigChange', { color: ($event.target as HTMLInputElement).value })"
            />
            <template v-else-if="config.channel === 'size' && !sizeField">
              <span class="encoding-config__static-value" aria-label="Size value">{{ staticSize }} px</span>
              <input
                class="encoding-config__inline-slider"
                type="range"
                min="1"
                max="48"
                step="0.5"
                :value="staticSize"
                aria-label="Size value"
                @input="emit('markConfigChange', { size: Number(($event.target as HTMLInputElement).value) })"
              />
            </template>
            <button
              v-else-if="(config.channel === 'color' && !!colorField) || (config.channel === 'size' && !!sizeField)"
              type="button"
              class="encoding-config__details-button"
              :aria-expanded="detailPanel === config.channel"
              :aria-label="`${config.label} details`"
              @click="toggleDetailPanel(config.channel as 'color' | 'size')"
            >
              <span
                v-if="config.channel === 'color' && showColorMapping"
                class="encoding-config__color-scale-preview"
                :style="{ background: colorScaleGradient }"
                aria-hidden="true"
              />
              <span v-else>Mapped</span>
            </button>
          </div>
          <div v-if="detailPanel === config.channel" class="encoding-config__details-popover">
            <div v-if="config.channel === 'size' && !isMultiLine && !sizeField" class="encoding-config__static encoding-config__static-size-editor">
              <span>Size value</span>
              <output>{{ staticSize }} px</output>
              <input type="range" min="1" max="48" step="0.5" :value="staticSize" aria-label="Size value" @input="emit('markConfigChange', { size: Number(($event.target as HTMLInputElement).value) })" />
            </div>
            <VisualMappingEditor
              v-if="!isMultiLine"
              :show-color="config.channel === 'color' && showColorMapping"
              :show-size="config.channel === 'size' && showSizeMapping"
              :color-mapping="colorMapping"
              :color-domain="colorDomain"
              :size-mapping="sizeMapping"
              @color-change="(mapping: LinearColorMapping) => emit('markConfigChange', { colorMapping: mapping })"
              @size-change="(mapping: LinearSizeMapping) => emit('markConfigChange', { sizeMapping: mapping })"
            />
          </div>
        </div>
      </div>

      <section
        v-if="supportsSeriesItems"
        class="encoding-config__angle encoding-config__series-drop"
        :class="{
          'is-drop-active': seriesItemDropState === 'valid',
          'is-drop-invalid': seriesItemDropState === 'invalid',
        }"
        :aria-label="`${seriesItemLabel} fields`"
        @dragover.stop.prevent="onSeriesItemDragOver"
        @dragleave.stop="onSeriesItemDragLeave"
        @drop.stop.prevent="onSeriesItemDrop"
      >
        <header class="encoding-config__series-header">
          <span>
            {{ seriesItemLabel }}
            <abbr v-if="seriesItemsRequired" title="At least one required" aria-label="At least one required">*</abbr>
          </span>
          <label v-if="supportsLegend" class="encoding-config__legend-toggle">
            <span>Show legend</span>
            <input
              type="checkbox"
              :checked="legendVisible"
              @change="emit('markConfigChange', { legendVisible: ($event.target as HTMLInputElement).checked })"
            />
          </label>
        </header>
        <label
          v-for="column in seriesItemColumns"
          :key="column.name"
          :class="{ 'is-disabled': isSeriesItemDisabled(column.name) }"
        >
          <input
            type="checkbox"
            :checked="selectedSeriesFields.includes(column.name) || selectedValueSeriesFields.includes(column.name)"
            :disabled="isSeriesItemDisabled(column.name)"
            @change="toggleSeriesItemField(column.name)"
          />
          <span>{{ columnDisplayLabel(column.name) }}</span>
        </label>
      </section>

      <p v-if="seriesItemMode === 'quantitative'" class="encoding-config__derived-series">
        Series: selected measure names
      </p>

      <section
        v-if="isPolar"
        class="encoding-config__angle encoding-config__segment-drop"
        :class="{
          'is-drop-active': segmentDropState === 'valid',
          'is-drop-invalid': segmentDropState === 'invalid',
        }"
        aria-label="Segment fields"
        @dragover.stop.prevent="onSegmentDragOver"
        @dragleave.stop="onSegmentDragLeave"
        @drop.stop.prevent="onSegmentDrop"
      >
        <header class="encoding-config__series-header">
          <span>Segment <abbr title="Required" aria-label="Required">*</abbr></span>
        </header>
        <label
          v-for="column in polarSegmentColumns"
          :key="column.name"
          :class="{ 'is-disabled': isSegmentFieldDisabled(column.name) }"
        >
          <input
            type="checkbox"
            :checked="selectedSegmentFields.includes(column.name)"
            :disabled="isSegmentFieldDisabled(column.name)"
            @change="toggleSegmentField(column.name)"
          />
          <span :title="columnDisplayLabel(column.name)">{{ columnDisplayLabel(column.name) }}</span>
        </label>
      </section>

      <section v-if="isParallel" class="encoding-config__angle" aria-label="Parallel dimensions">
        <span>Dimensions <abbr title="At least two required" aria-label="At least two required">*</abbr></span>
        <label v-for="column in parallelColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedParallelFields.includes(column.name)"
            @change="toggleParallelField(column.name)"
          />
          <span>{{ columnDisplayLabel(column.name) }}</span>
        </label>
      </section>

      <template v-if="!compositionOnly">
      <section v-if="aggregationEntries.length" class="encoding-config__aggregation" aria-label="Aggregation">
        <header>
          <span>Aggregation</span>
          <small>Repeated visual keys are reduced before rendering.</small>
        </header>
        <label v-for="entry in aggregationEntries" :key="entry.channel">
          <span>{{ entry.channel.toUpperCase() }}<em v-if="entry.automatic">Auto</em></span>
          <select
            :value="entry.aggregation ?? 'none'"
            :aria-label="`${entry.channel} aggregation`"
            @change="emit(
              'aggregationChange',
              entry.channel,
              ($event.target as HTMLSelectElement).value === 'none'
                ? undefined
                : ($event.target as HTMLSelectElement).value as 'sum' | 'avg',
            )"
          >
            <option value="none">None</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
          </select>
        </label>
      </section>
      </template>
      <section
        v-if="isSingleBar && chartSpec.encodings.x && chartSpec.encodings.y"
        class="encoding-config__value-order"
        aria-label="Sort and filter bars by value"
      >
        <header>
          <span>Sort &amp; filter</span>
        </header>
        <label>
          <span>Sort</span>
          <select
            :value="singleBarSortDirection"
            @change="emit('singleBarValueOrderChange', ($event.target as HTMLSelectElement).value as 'source' | 'ascending' | 'descending', singleBarTopN)"
          >
            <option value="source">Source order</option>
            <option value="descending">Highest first</option>
            <option value="ascending">Lowest first</option>
          </select>
        </label>
        <label>
          <span>Top N</span>
          <input
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            placeholder="All"
            :value="singleBarTopN ?? ''"
            aria-label="Top N bars"
            @change="updateSingleBarTopN(($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section v-if="polarSegmentMembers.length || editableSeriesMembers.length || colorConfig || sizeConfig" class="encoding-config__appearance encoding-config__appearance--chart">
        <label v-if="supportsLegend && !supportsSeriesItems" class="encoding-config__option">
          <span>Show legend</span>
          <input
            type="checkbox"
            :checked="legendVisible"
            @change="emit('markConfigChange', { legendVisible: ($event.target as HTMLInputElement).checked })"
          />
        </label>
        <div v-if="isPolar && polarSegmentMembers.length" class="encoding-config__member-colors">
          <span>Segment colors</span>
          <label v-for="(member, index) in polarSegmentMembers" :key="member.id">
            <span :title="member.label">{{ member.label }}</span>
            <input
              type="color"
              list="frontend-color-palette"
              :value="seriesMemberColor(member.id, index)"
              :aria-label="`${member.label} segment color`"
              @input="updateSeriesMemberStyle(member.id, { color: ($event.target as HTMLInputElement).value })"
            />
          </label>
        </div>
        <div v-if="editableSeriesMembers.length" class="encoding-config__member-styles">
          <header>
            <span>Series styles</span>
            <span>Color</span>
            <span>Width</span>
            <span>Line style</span>
          </header>
          <label v-for="(member, index) in editableSeriesMembers" :key="member.id">
            <span :title="member.label">{{ member.label }}</span>
            <input
              type="color"
              list="frontend-color-palette"
              :value="seriesMemberColor(member.id, index)"
              :aria-label="`${member.label} series color`"
              @input="updateSeriesMemberStyle(member.id, { color: ($event.target as HTMLInputElement).value })"
            />
            <input
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              :value="seriesMemberStrokeWidth(member.id)"
              :aria-label="`${member.label} stroke width`"
              @change="updateSeriesMemberStyle(member.id, { strokeWidth: Number(($event.target as HTMLInputElement).value) })"
            />
            <select
              :value="seriesMemberShape(member.id)"
              :aria-label="`${member.label} line style`"
              @change="updateSeriesMemberStyle(member.id, { shape: ($event.target as HTMLSelectElement).value as LineSeriesShape })"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
        </div>
      </section>
      </section>


      <section v-if="isFacetComposition" class="encoding-config__column encoding-config__column--composition" aria-label="Composition encodings">
        <div class="encoding-config__column-heading">
          <strong>Composition</strong>
          <span>Facet</span>
        </div>
        <label class="encoding-config__option">
          <span>Facet coordinates</span>
          <select
            :value="facetCoordinateSystem"
            @change="emit('compositionChange', { facetCoordinateSystem: ($event.target as HTMLSelectElement).value as 'Cartesian' | 'Polar', facetThetaField: facetColumnField, facetRadiusField: facetRowField })"
          >
            <option value="Cartesian">Cartesian</option>
            <option value="Polar">Polar</option>
          </select>
        </label>
        <EncodingChannelField
          v-if="facetCoordinateSystem === 'Cartesian'"
          :config="{ channel: 'column', label: 'Facet column', role: 'dimension', required: false, accepts: ['nominal', 'ordinal', 'temporal'], emptyLabel: 'Not bound' }"
          :columns="facetFieldOptions"
          :father-columns="fatherColumns"
          :value="facetColumnField"
          @change="updateFacetField('column', $event)"
        />
        <EncodingChannelField
          v-if="facetCoordinateSystem === 'Cartesian'"
          :config="{ channel: 'row', label: 'Facet row', role: 'dimension', required: false, accepts: ['nominal', 'ordinal', 'temporal'], emptyLabel: 'Not bound' }"
          :columns="facetFieldOptions"
          :father-columns="fatherColumns"
          :value="facetRowField"
          @change="updateFacetField('row', $event)"
        />
        <EncodingChannelField
          v-if="facetCoordinateSystem === 'Polar'"
          :config="{ channel: 'theta', label: 'Facet theta', role: 'dimension', required: false, accepts: ['nominal', 'ordinal', 'temporal'], emptyLabel: 'Not bound' }"
          :columns="facetFieldOptions"
          :father-columns="fatherColumns"
          :value="facetThetaField"
          @change="updateFacetPolarField('theta', $event)"
        />
        <EncodingChannelField
          v-if="facetCoordinateSystem === 'Polar'"
          :config="{ channel: 'radius', label: 'Facet R', role: 'dimension', required: false, accepts: ['nominal', 'ordinal', 'temporal'], emptyLabel: 'Not bound' }"
          :columns="facetFieldOptions"
          :father-columns="fatherColumns"
          :value="facetRadiusField"
          @change="updateFacetPolarField('radius', $event)"
        />
        <label class="encoding-config__option">
          <span>{{ facetCoordinateSystem === 'Polar' ? 'Primary facet axis' : 'Layout direction' }}</span>
          <select
            :value="composition?.facetDirection ?? 'column'"
            @change="emit('compositionChange', { facetDirection: ($event.target as HTMLSelectElement).value as 'row' | 'column' })"
          >
            <option value="column">{{ facetCoordinateSystem === 'Polar' ? 'Theta' : 'Columns' }}</option>
            <option value="row">{{ facetCoordinateSystem === 'Polar' ? 'R' : 'Rows' }}</option>
          </select>
        </label>
        <section v-if="facetCoordinateSystem === 'Cartesian'" class="encoding-config__composition-spacing" aria-label="Facet spacing">
          <strong>Spacing</strong>
          <label class="encoding-config__static">
            <span>Column gap</span>
            <output>{{ facetColumnGap }} px</output>
            <input type="range" min="0" max="200" step="1" :value="facetColumnGap" aria-label="Column gap" @input="emit('compositionChange', { facetColumnGap: numericValue($event) })" />
          </label>
          <label class="encoding-config__static">
            <span>Row gap</span>
            <output>{{ facetRowGap }} px</output>
            <input type="range" min="0" max="200" step="1" :value="facetRowGap" aria-label="Row gap" @input="emit('compositionChange', { facetRowGap: numericValue($event) })" />
          </label>
        </section>
      </section>

      </div>
    </div>
    <p v-else class="encoding-config__empty">Import a CSV to bind channels.</p>

    <section v-if="normalizedChartType.includes('horizon')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Bands</span>
        <output>{{ horizonBands }}</output>
        <input type="range" min="1" max="9" step="1" :value="horizonBands" aria-label="Bands" @input="emit('markConfigChange', { bands: Number(($event.target as HTMLInputElement).value) })" />
      </label>
    </section>

    <section v-if="normalizedChartType.includes('treemap')" class="encoding-config__appearance">
      <label class="encoding-config__option">
        <span>Tiling method</span>
        <select :value="treemapTile" @change="emit('markConfigChange', { tile: ($event.target as HTMLSelectElement).value })">
          <option value="binary">Binary</option>
          <option value="squarify">Squarify</option>
          <option value="slice-dice">Slice-dice</option>
          <option value="slice">Slice</option>
          <option value="dice">Dice</option>
        </select>
      </label>
    </section>

    <section v-if="isHierarchy" class="encoding-config__appearance">
      <div v-if="isDirectionalHierarchy" class="encoding-config__tree-direction" aria-label="Tree direction">
        <span>Direction</span>
        <div role="group" aria-label="Tree direction">
          <button
            v-for="direction in treeDirections"
            :key="direction.value"
            type="button"
            :title="direction.label"
            :aria-label="direction.label"
            :aria-pressed="treeDirection === direction.value"
            :class="{ 'is-active': treeDirection === direction.value }"
            @click="emit('markConfigChange', { treeDirection: direction.value })"
          >
            <component :is="direction.icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
      </div>
      <label class="encoding-config__option encoding-config__node-label-toggle">
        <span>Show node labels</span>
        <input
          type="checkbox"
          :checked="nodeLabelsVisible"
          @change="emit('markConfigChange', { nodeLabelsVisible: ($event.target as HTMLInputElement).checked })"
        />
      </label>
      <label v-if="normalizedChartType === 'dendrogram' && !sizeField" class="encoding-config__static">
        <span>Node size</span>
        <output>{{ dendrogramNodeSize }} px</output>
        <input
          type="range"
          min="1"
          max="48"
          step="0.5"
          :value="dendrogramNodeSize"
          aria-label="Dendrogram node size"
          @pointerdown="emit('markConfigEditStart', 'size')"
          @focus="emit('markConfigEditStart', 'size')"
          @pointerup="emit('markConfigEditEnd')"
          @pointercancel="emit('markConfigEditEnd')"
          @blur="emit('markConfigEditEnd')"
          @change="emit('markConfigEditEnd')"
          @input="emit('markConfigChange', { size: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
    </section>

    <section v-if="isForceDirected" class="encoding-config__appearance" aria-label="Force layout">
      <strong>Force layout</strong>
      <label class="encoding-config__static">
        <span>Repulsion</span>
        <output>{{ forceChargeStrength }}</output>
        <input type="range" min="0" max="400" step="1" :value="forceChargeStrength" aria-label="Repulsion" @input="emit('markConfigChange', { chargeStrength: -Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="encoding-config__static">
        <span>Link distance</span>
        <output>{{ Math.round(forceLinkDistance) }} px</output>
        <input type="range" min="8" max="240" step="1" :value="forceLinkDistance" aria-label="Link distance" @input="emit('markConfigChange', { linkDistance: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="encoding-config__static">
        <span>Link strength</span>
        <output>{{ forceLinkStrength.toFixed(2) }}</output>
        <input type="range" min="0" max="2" step="0.05" :value="forceLinkStrength" aria-label="Link strength" @input="emit('markConfigChange', { linkStrength: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="encoding-config__static">
        <span>Center attraction</span>
        <output>{{ forceCenterStrength.toFixed(2) }}</output>
        <input type="range" min="0" max="1" step="0.01" :value="forceCenterStrength" aria-label="Center attraction" @input="emit('markConfigChange', { centerStrength: Number(($event.target as HTMLInputElement).value) })" />
      </label>
      <label class="encoding-config__static">
        <span>Collision radius</span>
        <output>{{ Math.round(forceCollisionRadius) }} px</output>
        <input type="range" min="0" max="40" step="1" :value="forceCollisionRadius" aria-label="Collision radius" @input="emit('markConfigChange', { collisionRadius: Number(($event.target as HTMLInputElement).value) })" />
      </label>
    </section>

    <section v-if="normalizedChartType.includes('radialdendrogram')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Leaf radius</span>
        <output>{{ radialDendrogramLeafRadius }} px</output>
        <input
          type="range"
          min="16"
          max="160"
          step="1"
          :value="radialDendrogramLeafRadius"
          aria-label="Leaf radius"
          @pointerdown="emit('markConfigEditStart', 'leafRadius')"
          @focus="emit('markConfigEditStart', 'leafRadius')"
          @pointerup="emit('markConfigEditEnd')"
          @pointercancel="emit('markConfigEditEnd')"
          @blur="emit('markConfigEditEnd')"
          @change="emit('markConfigEditEnd')"
          @input="emit('markConfigChange', { leafRadius: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
    </section>

    <section v-if="normalizedChartType.includes('hexbin')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Radius</span>
        <output>{{ hexbinRadius }} px</output>
        <input
          type="range"
          min="2"
          max="20"
          step="1"
          :value="hexbinRadius"
          aria-label="Radius"
          @pointerdown="emit('markConfigEditStart', 'radius')"
          @focus="emit('markConfigEditStart', 'radius')"
          @pointerup="emit('markConfigEditEnd')"
          @pointercancel="emit('markConfigEditEnd')"
          @blur="emit('markConfigEditEnd')"
          @change="emit('markConfigEditEnd')"
          @input="emit('markConfigChange', { radius: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
    </section>

    <section v-if="normalizedChartType.includes('sankey')" class="encoding-config__appearance">
      <label class="encoding-config__option">
        <span>Node alignment</span>
        <select :value="sankeyAlignment" @change="emit('markConfigChange', { nodeAlign: ($event.target as HTMLSelectElement).value })">
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="center">Center</option>
          <option value="justify">Justify</option>
        </select>
      </label>
      <label class="encoding-config__option">
        <span>Link color</span>
        <select :value="sankeyLinkColor" @change="emit('markConfigChange', { linkColor: ($event.target as HTMLSelectElement).value })">
          <option value="source-target">Source-target</option>
          <option value="source">Source</option>
          <option value="target">Target</option>
          <option value="static">Static</option>
        </select>
      </label>
    </section>

    <p v-if="rendererError" class="encoding-config__error">{{ rendererError }}</p>
  </div>
</template>

<style scoped>
.encoding-config { --encoding-config-font-size: calc(11px * var(--frontend-font-scale)); display: grid; width: min(100%, 460px); gap: 6px; box-sizing: border-box; font-size: var(--encoding-config-font-size); }
.encoding-config__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.encoding-config__header > div { display: grid; min-width: 0; gap: 2px; }
.encoding-config__header strong { color: #432818; font-size: calc(12px * var(--frontend-font-scale)); letter-spacing: 0.08em; }
.encoding-config__header span { overflow: hidden; color: #6b7889; font-size: var(--encoding-config-font-size); text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__header button { display: inline-grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #99582a; cursor: pointer; }
.encoding-config__header button:hover { background: var(--frontend-surface-soft); color: #432818; }
.encoding-config__channels { display: grid; gap: 5px; }
.encoding-config__axis-rows { display: grid; gap: 4px; }
.encoding-config__axis-rows-toolbar { display: grid; grid-template-columns: minmax(52px, 0.2fr) minmax(164px, 0.76fr) minmax(96px, 0.42fr); align-items: center; gap: 2px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__axis-toolbar-options { display: contents; }
.encoding-config__axis-toolbar-label { justify-self: center; white-space: nowrap; }
.encoding-config__axis-toolbar-options { grid-column: 3; display: grid; grid-template-columns: 38px 48px; justify-content: center; gap: 2px; }
.encoding-config__axis-switch { grid-column: 1 / span 2; justify-self: start; }
.encoding-config__axis-row { display: grid; grid-template-columns: minmax(52px, 0.2fr) minmax(164px, 0.76fr) minmax(96px, 0.42fr); position: relative; align-items: center; gap: 2px; padding: 3px 4px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 5px; background: #fefae0; }
.encoding-config__axis-channel-label { display: inline-flex; align-items: center; justify-content: center; gap: 3px; min-width: 0; }
.encoding-config__axis-row-label { color: #99582a; font-size: var(--encoding-config-font-size); font-weight: 700; }
.encoding-config__axis-controls { display: grid; grid-template-columns: 38px 48px; justify-content: center; gap: 2px; }
.encoding-config__axis-toggle,
.encoding-config__axis-label-toggle { display: inline-flex; justify-content: center; }
.encoding-config__axis-toggle input,
.encoding-config__axis-label-toggle input { width: 12px; height: 12px; margin: 0; accent-color: var(--frontend-slider-thumb); }
.encoding-config__axis-row :deep(.encoding-channel-field) { display: contents; min-width: 0; }
.encoding-config__axis-row :deep(.encoding-channel-field__label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.encoding-config__axis-row :deep(.encoding-channel-field select) { grid-column: 2; min-width: 0; }
.encoding-config__polar-radius-editor { display: grid; grid-column: 2; grid-template-columns: minmax(72px, 0.58fr) minmax(0, 1fr); align-items: center; gap: 6px; min-width: 0; }
.encoding-config__polar-radius-editor :deep(.encoding-channel-field) { display: contents; }
.encoding-config__polar-radius-editor :deep(.encoding-channel-field__label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.encoding-config__polar-radius-editor :deep(.encoding-channel-field select) { grid-column: 1; width: 100%; min-width: 0; }
.encoding-config__polar-radius-editor.is-mapped { grid-template-columns: minmax(0, 1fr); }
.encoding-config__polar-radius-control { display: grid; grid-column: 2; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 7px; min-width: 0; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__polar-radius-control output { min-width: 36px; color: #99582a; font-variant-numeric: tabular-nums; text-align: right; }
.encoding-config__polar-radius-control input[type="range"] { width: 100%; min-width: 0; accent-color: var(--frontend-control-accent); }
.encoding-config__axis-direction-button { display: inline-grid; width: 22px; height: 22px; padding: 0; place-items: center; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 4px; background: var(--frontend-surface-raised); color: #99582a; cursor: pointer; }
.encoding-config__axis-direction-button:hover { border-color: rgba(67, 40, 24, 0.4); background: var(--frontend-surface-soft); color: #432818; }
.encoding-config__columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; align-items: stretch; }
.encoding-config__channel-row { display: grid; grid-template-columns: minmax(52px, 0.2fr) minmax(164px, 0.76fr) minmax(96px, 0.42fr); align-items: center; gap: 2px; min-height: 32px; padding: 3px 4px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 5px; background: #fefae0; }
.encoding-config__channel-row :deep(.encoding-channel-field) { display: contents; }
.encoding-config__channel-row :deep(.encoding-channel-field__label) { justify-content: center; min-width: 0; text-align: center; }
.encoding-config__channel-row :deep(.encoding-channel-field select) { grid-column: 2; min-width: 0; }
.encoding-config__channel-row::after { content: ""; grid-column: 3; min-width: 0; }
.encoding-config--hierarchy .encoding-config__channel-row,
.encoding-config--hierarchy .encoding-config__detail-row {
  grid-template-columns: minmax(82px, 0.3fr) minmax(164px, 0.7fr) minmax(0, 0.1fr);
}
.encoding-config--hierarchy .encoding-config__channel-row :deep(.encoding-channel-field select),
.encoding-config--hierarchy .encoding-config__detail-row :deep(.encoding-channel-field select) {
  justify-self: end;
  width: min(100%, 220px);
}
.encoding-config__column { display: grid; min-width: 0; align-content: start; gap: 7px; padding: 8px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 6px; background: #fefae0; }
.encoding-config__column--composition { background: #f8fbff; }
.encoding-config__column--composition-summary { background: #f4f8fc; }
.encoding-config__composition-summary { margin: 0; color: #99582a; font-size: var(--encoding-config-font-size); line-height: 1.35; }
.encoding-config__column-heading { display: grid; gap: 2px; padding-bottom: 2px; border-bottom: 1px solid rgba(67, 40, 24, 0.09); }
.encoding-config__column-heading strong { color: #263548; font-size: var(--encoding-config-font-size); letter-spacing: 0.08em; text-transform: uppercase; }
.encoding-config__column-heading span, .encoding-config__column-empty { color: #718096; font-size: var(--encoding-config-font-size); line-height: 1.35; }
.encoding-config__member-list { display: grid; gap: 6px; padding: 8px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 6px; background: #fefae0; }
.encoding-config__member-list > header { display: grid; gap: 2px; }
.encoding-config__member-list > header strong { color: #432818; font-size: var(--encoding-config-font-size); }
.encoding-config__member-list > header span { color: #718096; font-size: var(--encoding-config-font-size); line-height: 1.35; }
.encoding-config__member-entry { border-top: 1px solid rgba(67, 40, 24, 0.08); }
.encoding-config__member-entry summary { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 6px 0; color: #432818; font-size: var(--encoding-config-font-size); cursor: pointer; }
.encoding-config__member-entry summary small { color: #718096; font-size: var(--encoding-config-font-size); }
.encoding-config__member-entry dl { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 3px 8px; margin: 0 0 6px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__member-entry dt { color: #718096; text-transform: uppercase; }
.encoding-config__member-entry dd { margin: 0; overflow: hidden; color: #432818; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__axis-switch { display: inline-flex; align-items: center; gap: 7px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__axis-switch button { min-width: 64px; min-height: 28px; padding: 0 8px; border: 1px solid rgba(153, 88, 42, 0.28); border-radius: 999px; background: var(--frontend-surface-raised); color: #432818; font: inherit; font-size: var(--encoding-config-font-size); font-weight: 700; cursor: pointer; }
.encoding-config__axis-switch button.is-active { border-color: #432818; background: #432818; color: var(--frontend-surface-raised); }
.encoding-config__tree-direction { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__tree-direction > div { display: grid; grid-template-columns: repeat(4, 30px); border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; overflow: hidden; background: var(--frontend-surface-raised); }
.encoding-config__tree-direction button { display: inline-grid; width: 30px; height: 28px; padding: 0; place-items: center; border: 0; border-left: 1px solid rgba(67, 40, 24, 0.1); background: transparent; color: #99582a; cursor: pointer; }
.encoding-config__tree-direction button:first-child { border-left: 0; }
.encoding-config__tree-direction button:hover { background: var(--frontend-surface-soft); color: #432818; }
.encoding-config__tree-direction button.is-active { background: #432818; color: var(--frontend-surface-raised); }
.encoding-config__detail-fields { display: grid; gap: 6px; }
.encoding-config__detail-row { position: relative; display: grid; grid-template-columns: minmax(52px, 0.2fr) minmax(164px, 0.76fr) minmax(96px, 0.42fr); align-items: center; gap: 2px; min-height: 32px; padding: 3px 4px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 5px; background: #fefae0; }
.encoding-config__detail-row :deep(.encoding-channel-field) { display: contents; }
.encoding-config__detail-row :deep(.encoding-channel-field__label) { justify-content: center; min-width: 0; text-align: center; }
.encoding-config__detail-row :deep(.encoding-channel-field select) { grid-column: 2; min-width: 0; }
.encoding-config__detail-control { grid-column: 3; display: flex; min-width: 0; min-height: 28px; align-items: center; justify-content: center; gap: 5px; }
.encoding-config__appearance--chart { order: 2; }
.encoding-config__aggregation,
.encoding-config__value-order,
.encoding-config__radius { order: 3; }
.encoding-config__details-button { min-width: 64px; max-width: 120px; height: 30px; overflow: hidden; padding: 0 8px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: #fefae0; color: #99582a; font: inherit; font-size: var(--encoding-config-font-size); text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.encoding-config__details-button:hover, .encoding-config__details-button[aria-expanded="true"] { border-color: rgba(67, 40, 24, 0.4); background: var(--frontend-surface-soft); color: #432818; }
.encoding-config__color-scale-preview { display: block; width: 100%; height: 12px; border: 1px solid rgba(67, 40, 24, 0.16); border-radius: 3px; }
.encoding-config__static-color-picker { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); cursor: pointer; }
.encoding-config__node-label-toggle { grid-template-columns: minmax(0, 1fr) auto; }
.encoding-config__static-value { color: #99582a; font-size: var(--encoding-config-font-size); white-space: nowrap; }
.encoding-config__inline-slider { width: 55px; min-width: 0; accent-color: var(--frontend-control-accent); }
.encoding-config__details-popover { position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 20; display: grid; width: min(320px, calc(100vw - 32px)); max-height: min(440px, 70vh); overflow: auto; gap: 8px; padding: 10px; border: 1px solid rgba(67, 40, 24, 0.16); border-radius: 6px; background: var(--frontend-surface-raised); box-shadow: 0 10px 28px rgba(67, 40, 24, 0.18); }
.encoding-config__details-popover .visual-mapping-editor { margin: 0; }
.encoding-config__slider-dot { display: inline-grid; width: 22px; height: 22px; padding: 0; place-items: center; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.encoding-config__slider-dot span { width: 10px; height: 10px; border: 2px solid #432818; border-radius: 50%; background: var(--frontend-surface-raised); box-shadow: 0 0 0 2px rgba(67, 40, 24, 0.12); }
.encoding-config__slider-dot:hover span, .encoding-config__slider-dot[aria-expanded="true"] span { background: #432818; }
.encoding-config__slider-popover { position: absolute; right: 0; bottom: calc(100% + 5px); z-index: 2; display: flex; width: 150px; height: 34px; align-items: center; padding: 6px 9px; border: 1px solid rgba(67, 40, 24, 0.16); border-radius: 6px; background: var(--frontend-surface-raised); box-shadow: 0 8px 20px rgba(67, 40, 24, 0.16); }
.encoding-config__slider-popover input { width: 100%; accent-color: var(--frontend-control-accent); }
.encoding-config__static-size { position: relative; grid-template-columns: minmax(72px, 1fr) auto 22px; }
.encoding-config__axis-options { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: 6px 8px; padding: 7px 8px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 6px; background: #fefae0; }
.encoding-config__axis-options > strong { color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__axis-toggles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; }
.encoding-config__axis-toggles label { display: flex; align-items: center; gap: 6px; min-width: 0; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__axis-toggles label:last-child { grid-column: 1 / -1; }
.encoding-config__axis-directions { display: grid; gap: 5px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__axis-directions,
.encoding-config__axis-spacing { grid-column: 1 / -1; }
.encoding-config__axis-directions > div { display: flex; gap: 6px; }
.encoding-config__axis-directions button { display: inline-flex; min-width: 0; min-height: 26px; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); color: #99582a; font: inherit; font-size: var(--encoding-config-font-size); cursor: pointer; }
.encoding-config__axis-directions button:hover { border-color: rgba(67, 40, 24, 0.4); background: var(--frontend-surface-soft); color: #432818; }
.encoding-config__axis-directions-y-icon { transform: rotate(90deg); }
.encoding-config__axis-spacing { display: grid; grid-template-columns: minmax(0, 1fr) 88px 28px; align-items: center; gap: 6px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__axis-spacing input { width: 100%; min-width: 0; }
.encoding-config__axis-spacing output { color: #294a6d; text-align: right; }
.encoding-config__summary { margin: 0; padding: 8px 9px; border-left: 3px solid #fefae0; background: #f3f7fa; color: #432818; font-size: var(--encoding-config-font-size); line-height: 1.45; }
.encoding-config__derived-series { margin: -4px 0 0; color: #432818; font-size: var(--encoding-config-font-size); }
.encoding-config__aggregation { display: grid; gap: 7px; padding: 8px; border: 1px solid rgba(67, 40, 24, 0.2); border-radius: 6px; background: #f8fbff; color: #432818; }
.encoding-config__aggregation header { display: grid; gap: 2px; }
.encoding-config__aggregation header span { font-size: var(--encoding-config-font-size); font-weight: 700; }
.encoding-config__aggregation header small { color: #718096; font-size: var(--encoding-config-font-size); line-height: 1.35; }
.encoding-config__aggregation label { display: grid; grid-template-columns: minmax(0, 1fr) 108px; align-items: center; gap: 8px; font-size: var(--encoding-config-font-size); }
.encoding-config__aggregation label > span { display: inline-flex; align-items: center; gap: 6px; }
.encoding-config__aggregation em { padding: 2px 4px; border-radius: 3px; background: #e0efff; color: #432818; font-size: var(--encoding-config-font-size); font-style: normal; font-weight: 700; text-transform: uppercase; }
.encoding-config__aggregation select { width: 100%; height: 28px; padding: 0 6px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); color: #432818; font: inherit; font-size: var(--encoding-config-font-size); }
.encoding-config__value-order { display: grid; gap: 7px; padding: 8px; border: 1px solid rgba(67, 40, 24, 0.12); border-radius: 6px; background: #fefae0; color: #432818; }
.encoding-config__value-order header { display: grid; gap: 2px; }
.encoding-config__value-order header span { font-size: var(--encoding-config-font-size); font-weight: 700; }
.encoding-config__value-order label { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(0, 1.4fr); align-items: center; gap: 8px; font-size: var(--encoding-config-font-size); }
.encoding-config__value-order select,
.encoding-config__value-order input { width: 100%; min-width: 0; height: 30px; padding: 0 7px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); color: #432818; font: inherit; font-size: var(--encoding-config-font-size); }
.encoding-config__angle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 2px; color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__angle > span { grid-column: 1 / -1; }
.encoding-config__series-header { display: flex; align-items: center; justify-content: space-between; grid-column: 1 / -1; gap: 8px; }
.encoding-config__legend-toggle { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: #99582a; font-size: var(--encoding-config-font-size); white-space: nowrap; }
.encoding-config__legend-toggle input { width: 12px; height: 12px; margin: 0; accent-color: var(--frontend-slider-thumb); }
.encoding-config__angle abbr { color: #b42318; text-decoration: none; }
.encoding-config__angle label { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 4px 6px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 5px; background: #fefae0; color: #432818; cursor: pointer; }
.encoding-config__angle label.is-disabled { background: #f1f3f5; color: #97a1ae; cursor: not-allowed; opacity: 0.68; }
.encoding-config__angle input { width: 14px; height: 14px; flex: 0 0 14px; margin: 0; accent-color: var(--frontend-slider-thumb); }
.encoding-config__angle label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__series-drop { padding: 8px; border: 1px dashed rgba(67, 40, 24, 0.28); border-radius: 6px; transition: border-color 120ms ease, background 120ms ease; }
.encoding-config__series-drop.is-drop-active { border-color: #432818; background: #edf6ff; }
.encoding-config__series-drop.is-drop-invalid { border-color: #b42318; background: #fff1ef; }
.encoding-config__segment-drop { display: grid; gap: 6px; min-height: 52px; padding: 7px; border: 1px dashed rgba(67, 40, 24, 0.28); border-radius: 6px; background: var(--frontend-surface-raised); color: #99582a; font-size: var(--encoding-config-font-size); transition: border-color 120ms ease, background 120ms ease; }
.encoding-config__segment-drop.is-drop-active { border-color: #432818; background: #edf6ff; }
.encoding-config__segment-drop.is-drop-invalid { border-color: #b42318; background: #fff1ef; }
.encoding-config__segment-drop header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.encoding-config__segment-drop header > span { color: #432818; font-weight: 650; }
.encoding-config__segment-drop p { margin: 0; color: #718096; font-size: var(--encoding-config-font-size); }
.encoding-config__segment-fields { display: flex; min-width: 0; flex-wrap: wrap; gap: 5px; }
.encoding-config__segment-fields > span { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; padding-left: 7px; border: 1px solid rgba(67, 40, 24, 0.2); border-radius: 4px; background: #f8fbff; }
.encoding-config__segment-fields > span > span { min-width: 0; overflow: hidden; color: #432818; font-size: var(--encoding-config-font-size); text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__segment-fields button { display: inline-grid; width: 24px; height: 24px; flex: 0 0 24px; padding: 0; place-items: center; border: 0; border-left: 1px solid rgba(67, 40, 24, 0.12); background: transparent; color: #99582a; cursor: pointer; }
.encoding-config__segment-fields button:hover { background: #fff1ef; color: #b42318; }
.encoding-config__radius, .encoding-config__appearance { display: grid; gap: 7px; padding-top: 8px; border-top: 1px solid rgba(67, 40, 24, 0.1); color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__radius-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.encoding-config__radius-heading strong { color: #432818; font-size: var(--encoding-config-font-size); font-weight: 700; }
.encoding-config__composition-spacing { display: grid; gap: 7px; padding-top: 8px; border-top: 1px solid rgba(67, 40, 24, 0.1); }
.encoding-config__composition-spacing > strong { color: #432818; font-size: var(--encoding-config-font-size); }
.encoding-config__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.encoding-config__segments button { min-height: 28px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.encoding-config__segments button.is-active { background: var(--frontend-surface-raised); color: #432818; box-shadow: 0 1px 2px rgba(67, 40, 24, 0.14); font-weight: 700; }
.encoding-config__static { position: relative; display: grid; grid-template-columns: minmax(72px, 1fr) auto minmax(80px, 1fr); align-items: center; gap: 8px; }
.encoding-config__static input[type="range"] { width: 100%; accent-color: var(--frontend-control-accent); }
.encoding-config__option { display: grid; grid-template-columns: minmax(92px, 1fr) minmax(0, 1.25fr); align-items: center; gap: 8px; }
.encoding-config__option select { width: 100%; height: 34px; padding: 0 8px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 6px; background: var(--frontend-surface-raised); color: #432818; font: inherit; }
.encoding-config__member-colors { display: grid; gap: 7px; }
.encoding-config__member-colors > span { color: #432818; font-weight: 650; }
.encoding-config__member-colors label { display: grid; grid-template-columns: minmax(0, 1fr) 38px; align-items: center; gap: 8px; }
.encoding-config__member-colors label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-colors input { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); }
.encoding-config__member-styles { display: grid; gap: 7px; }
.encoding-config__member-styles header,
.encoding-config__member-styles label { display: grid; grid-template-columns: minmax(48px, 1fr) 30px 40px 62px; align-items: center; gap: 5px; }
.encoding-config__member-styles header { color: #99582a; font-size: var(--encoding-config-font-size); }
.encoding-config__member-styles header span:first-child { color: #432818; font-size: var(--encoding-config-font-size); font-weight: 650; }
.encoding-config__member-styles label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-styles input[type="color"] { width: 30px; height: 28px; padding: 2px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); }
.encoding-config__member-styles input[type="number"],
.encoding-config__member-styles select { width: 100%; min-width: 0; height: 28px; padding: 0 4px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); color: #432818; font: inherit; font-size: var(--encoding-config-font-size); }
.encoding-config__static input[type="color"] { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); }
.encoding-config__static input[type="range"] { width: 100%; accent-color: var(--frontend-control-accent); }
.encoding-config__static output { min-width: 40px; color: #99582a; font-variant-numeric: tabular-nums; text-align: right; }
.encoding-config__empty, .encoding-config__error { margin: 0; font-size: var(--encoding-config-font-size); line-height: 1.4; }
.encoding-config__empty { color: #6b7889; }
.encoding-config__error { color: #b42318; }
.encoding-config__facet-directions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); width: 100%; gap: 4px; }
.encoding-config__facet-directions button { width: 100%; height: 34px; padding: 0 8px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 6px; background: var(--frontend-surface-raised); color: #99582a; font: inherit; font-size: var(--encoding-config-font-size); cursor: pointer; }
.encoding-config__facet-directions button.is-active { border-color: #b42318; background: #fff1ef; color: #8c2929; font-weight: 700; }
</style>
