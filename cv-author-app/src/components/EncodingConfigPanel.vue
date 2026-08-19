<script setup lang="ts">
import { computed } from "vue";
import { X } from "@lucide/vue";
import EncodingChannelField from "./EncodingChannelField.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import {
  getEncodingChannelConfigsForSpec,
  hasDerivedValueSeries,
  resolvedEncodingField,
  resolvedPolarRadiusMode,
  resolveChartEncodingIssues,
  resolvedSeriesField,
  resolveChartTemplateVariant,
} from "../utils/encodingConfig";
import type { EncodingChannelConfig } from "../utils/encodingConfig";
import { getChartTemplateContract, normalizeChartTemplate } from "../utils/chartTemplates";
import type {
  ChartEncodingChannel,
  ChartSpec,
  CompositionSpec,
  CoordinateChannel,
  DataColumn,
  DataRow,
  LineSeriesShape,
  LinearColorMapping,
  LinearSizeMapping,
  MarkGroupSharedConfig,
  SeriesStyleMapping,
  DimensionRecommendation,
} from "../types";
import {
  defaultColorMapping,
  defaultSizeMapping,
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  isSeriesStyleMapping,
} from "../utils/visualMapping";

const props = defineProps<{
  chartName: string;
  chartSpec: ChartSpec;
  columns: DataColumn[];
  rows: DataRow[];
  markConfig: MarkGroupSharedConfig;
  rendererError?: string;
  compatibilityMessage?: string;
  repairPlans?: Array<{ key: string; fields: string[] }>;
  selectedRepairPlanKey?: string;
  resolutionRequired?: boolean;
  pendingDimension?: { field: string; valueCount: number } | null;
  pendingAggregation?: "sum" | "avg";
  pendingChartUpgrade?: string;
  dimensionChartUpgradeOptions?: Array<{ chartType: string; label: string }>;
  availableFacetDirections?: Array<"row" | "column">;
  pendingFacetDirection?: "row" | "column";
  alternativeRecommendations?: DimensionRecommendation[];
  compositionSpec?: CompositionSpec | null;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
  channelChange: [channel: ChartEncodingChannel, field: string];
  seriesFieldChange: [field: string];
  seriesFieldsChange: [fields: string[]];
  valueSeriesFieldsChange: [fields: string[]];
  angleFieldsChange: [fields: string[]];
  parallelFieldsChange: [fields: string[]];
  markConfigChange: [patch: MarkGroupSharedConfig];
  axisSwap: [swapped: boolean];
  chooseRepairPlan: [key: string];
  chooseDimensionAggregation: [];
  chooseDimensionChartUpgrade: [];
  chooseDimensionFacet: [];
  updatePendingAggregation: [value: "sum" | "avg"];
  updatePendingChartUpgrade: [value: string];
  updatePendingFacetDirection: [value: "row" | "column"];
  compositionChange: [patch: {
    facetField?: string;
    facetDirection?: "row" | "column";
    facetGrid?: CompositionSpec["facetGrid"];
    sharedChannels?: CoordinateChannel[];
  }];
}>();

const template = computed(() => normalizeChartTemplate(props.chartSpec.chartType));
const isCartesian = computed(() => getChartTemplateContract(props.chartSpec.chartType)?.coordinateSystem === "Cartesian");
const axisSwapped = computed(() => props.chartSpec.axisSwapped === true);
const normalizedChartType = computed(() => props.chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase());
const configs = computed(() => getEncodingChannelConfigsForSpec(props.chartSpec));
const isPolar = computed(() => template.value === "pie" || template.value === "donut");
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
const supportsMeasureSeries = computed(() => isExplicitMultiLine.value || areaRequiresSeries.value || supportsBarValueSeries.value);
const usesDerivedSeries = computed(() => hasDerivedValueSeries(props.chartSpec, "y"));
const usesBarValueSeries = computed(() => supportsBarValueSeries.value && (props.chartSpec.valueFields?.length ?? 0) > 0);
const isParallel = computed(() => template.value === "parallel");
const standardConfigs = computed(() => configs.value.filter((config) => {
  if (isPolar.value && config.channel === "theta") return false;
  if (isPolar.value && config.channel === "radius") return false;
  if (isParallel.value && config.channel === "dimensions") return false;
  if ((isGroupedBar.value || barRequiresSegments.value) && config.channel === "color") return false;
  if ((config.channel === "y" && supportsBarValueSeries.value)
    || (supportsMeasureSeries.value && config.channel === "y" && (!supportsBarValueSeries.value || usesBarValueSeries.value))
    || (supportsMeasureSeries.value && config.channel === "color" && (!supportsBarValueSeries.value || usesBarValueSeries.value))) return false;
  return true;
}));
const seriesConfig = computed<EncodingChannelConfig | null>(() => (isMultiLine.value || areaRequiresSeries.value) && !usesDerivedSeries.value ? {
  channel: "color",
  label: "Series",
  role: "series",
  required: true,
  accepts: ["nominal", "temporal"],
  emptyLabel: "Not bound",
} : null);
const seriesMembers = computed(() => {
  const field = resolvedSeriesField(props.chartSpec);
  if (!field) return [];
  return Array.from(new Set(props.rows.map((row) => row[field] ?? "").filter(Boolean)))
    .map((id) => ({ id, label: id }));
});
const selectedValueSeriesFields = computed(() => {
  if (supportsBarValueSeries.value) return props.chartSpec.valueFields?.map((encoding) => encoding.field) ?? [];
  if (props.chartSpec.valueFields?.length) return props.chartSpec.valueFields.map((encoding) => encoding.field);
  const field = resolvedEncodingField(props.chartSpec, "y");
  return field ? [field] : [];
});
const selectedSeriesFields = computed(() => props.chartSpec.seriesFields?.map((encoding) => encoding.field)
  ?? (props.chartSpec.series ? [props.chartSpec.series.field] : []));
const selectedSegmentFields = computed(() => Array.from(new Set([
  ...selectedSeriesFields.value,
  ...selectedValueSeriesFields.value,
])));
const groupItemColumns = computed(() => props.columns.filter((column) =>
  column.type === "nominal" || column.type === "temporal" || column.type === "quantitative"));
const segmentColumns = computed(() => props.columns.filter((column) =>
  column.type === "nominal" || column.type === "temporal" || column.type === "quantitative"));
const editableSeriesMembers = computed(() => usesDerivedSeries.value
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
const quantitativeColumns = computed(() => props.columns.filter((column) => column.type === "quantitative"));
const selectedAngleFields = computed(() => props.chartSpec.angleFields?.map((encoding) => encoding.field)
  ?? (props.chartSpec.encodings.theta
    ? [props.chartSpec.encodings.theta.field]
    : props.chartSpec.encodings.angle
      ? [props.chartSpec.encodings.angle.field]
      : []));
const selectedParallelFields = computed(() => props.chartSpec.parallelFields?.map((encoding) => encoding.field) ?? []);
const radiusMode = computed(() => resolvedPolarRadiusMode(props.chartSpec));
const staticOuterRadius = computed(() => typeof props.markConfig.outerRadius === "number"
  ? props.markConfig.outerRadius
  : 1);
const colorConfig = computed(() => configs.value.find((config) => config.channel === "color"));
const sizeConfig = computed(() => configs.value.find((config) => config.channel === "size"));
const colorField = computed(() => resolvedEncodingField(props.chartSpec, "color"));
const sizeField = computed(() => resolvedEncodingField(props.chartSpec, "size"));
const colorColumn = computed(() => props.columns.find((column) => column.name === colorField.value));
const showColorMapping = computed(() => !!colorColumn.value && colorColumn.value.type !== "nominal");
const showSizeMapping = computed(() => !!sizeField.value);
const staticColor = computed(() => typeof props.markConfig.color === "string" ? props.markConfig.color : "#2563eb");
const staticSize = computed(() => typeof props.markConfig.size === "number" ? props.markConfig.size : 4);
const horizonBands = computed(() => typeof props.markConfig.bands === "number" ? props.markConfig.bands : 7);
const treemapTile = computed(() => typeof props.markConfig.tile === "string" ? props.markConfig.tile : "binary");
const hexbinRadius = computed(() => typeof props.markConfig.radius === "number" ? props.markConfig.radius : 8);
const sankeyAlignment = computed(() => typeof props.markConfig.nodeAlign === "string" ? props.markConfig.nodeAlign : "justify");
const sankeyLinkColor = computed(() => typeof props.markConfig.linkColor === "string" ? props.markConfig.linkColor : "source-target");
const colorMapping = computed(() => isLinearColorMapping(props.markConfig.colorMapping) ? props.markConfig.colorMapping : defaultColorMapping);
const sizeMapping = computed(() => isLinearSizeMapping(props.markConfig.sizeMapping) ? props.markConfig.sizeMapping : defaultSizeMapping);
const composition = computed(() => props.compositionSpec ?? null);
const isFacetComposition = computed(() => composition.value?.type === "facet");
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
const resolveOptions = computed(() => {
  if (!composition.value || composition.value.type !== "facet") return [] as CoordinateChannel[];
  const shareable = getChartTemplateContract(props.chartSpec.chartType)?.shareableChannels ?? [];
  return (["x", "y"] as CoordinateChannel[]).filter((channel) => shareable.includes(channel));
});
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
function toggleResolvedChannel(channel: CoordinateChannel) {
  const current = composition.value;
  if (!current || current.type !== "facet") return;
  const channels = current.sharedChannels.includes(channel)
    ? current.sharedChannels.filter((item) => item !== channel)
    : [...current.sharedChannels, channel];
  emit("compositionChange", { sharedChannels: channels });
}
const fallbackSeriesColors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];
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
const hasResolutionBlocker = computed(() => !!props.compatibilityMessage || props.resolutionRequired === true);
const canConfirm = computed(() => !hasResolutionBlocker.value
  && resolveChartEncodingIssues(props.chartSpec).length === 0
  && (!supportsMeasureSeries.value
    || (barRequiresSegments.value
      ? (!usesBarValueSeries.value || selectedValueSeriesFields.value.length >= 2)
      : isGroupedBar.value
        ? (!usesBarValueSeries.value || selectedValueSeriesFields.value.length >= 2)
        : usesDerivedSeries.value || !!resolvedSeriesField(props.chartSpec)))
  && configs.value.every((config) => {
    if (!config.required) return true;
  if (config.channel === "y" && supportsMeasureSeries.value
      && (!supportsBarValueSeries.value || usesBarValueSeries.value)
      && selectedValueSeriesFields.value.length >= (supportsBarValueSeries.value ? 2 : 1)) return true;
  if (config.channel === "dimensions") return selectedParallelFields.value.length >= 2;
  if (config.channel === "color" && (usesDerivedSeries.value || usesBarValueSeries.value
    || ((isGroupedBar.value || barRequiresSegments.value) && selectedSeriesFields.value.length > 0))) return true;
  if (config.multiple) return selectedAngleFields.value.length > 0;
  return !!resolvedEncodingField(props.chartSpec, config.channel);
}));

function axisChannel(channel: ChartEncodingChannel) {
  if (!axisSwapped.value || (channel !== "x" && channel !== "y")) return channel;
  return channel === "x" ? "y" : "x";
}

function axisConfig(config: EncodingChannelConfig) {
  const channel = axisChannel(config.channel);
  return channel === config.channel ? config : { ...config, label: channel.toUpperCase() };
}

function toggleValueSeriesField(field: string) {
  emit("valueSeriesFieldsChange", selectedValueSeriesFields.value.includes(field)
    ? selectedValueSeriesFields.value.filter((item) => item !== field)
    : [...selectedValueSeriesFields.value, field]);
}

function toggleSeriesField(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (isGroupedBar.value && column?.type === "quantitative") {
    toggleValueSeriesField(field);
    return;
  }
  emit("seriesFieldsChange", selectedSeriesFields.value.includes(field)
    ? selectedSeriesFields.value.filter((item) => item !== field)
    : [...selectedSeriesFields.value, field]);
}

function toggleSegmentField(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (!column) return;
  if (column.type === "quantitative") {
    toggleValueSeriesField(field);
    return;
  }
  toggleSeriesField(field);
}

function toggleAngleField(field: string) {
  emit("angleFieldsChange", selectedAngleFields.value.includes(field)
    ? selectedAngleFields.value.filter((item) => item !== field)
    : [...selectedAngleFields.value, field]);
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
</script>

<template>
  <div class="encoding-config">
    <header class="encoding-config__header">
      <div>
        <strong>MARK ENCODINGS</strong>
        <span>{{ chartName }}</span>
      </div>
      <button type="button" title="Close" aria-label="Close encoding panel" @click="emit('close')">
        <X :size="16" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </header>

    <div v-if="columns.length" class="encoding-config__channels">
      <div class="encoding-config__columns">
      <section class="encoding-config__column" aria-label="Chart encodings">
      <div v-if="isCartesian" class="encoding-config__axis-switch">
        <span>Cartesian axes</span>
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
      <template v-for="config in standardConfigs" :key="config.channel">
        <EncodingChannelField
          :config="axisConfig(config)"
          :columns="columns"
          :value="resolvedEncodingField(chartSpec, config.channel)"
          @change="updateMappingDefaults(config.channel, $event)"
        />
      </template>

      <section v-if="isGroupedBar" class="encoding-config__angle" aria-label="Group item fields">
        <span>Group item <abbr title="At least one required" aria-label="At least one required">*</abbr></span>
        <label v-for="column in groupItemColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedSeriesFields.includes(column.name) || selectedValueSeriesFields.includes(column.name)"
            @change="toggleSeriesField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="barRequiresSegments" class="encoding-config__angle" aria-label="Segment fields">
        <span>Segment <abbr title="At least one required" aria-label="At least one required">*</abbr></span>
        <label v-for="column in segmentColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedSegmentFields.includes(column.name)"
            @change="toggleSegmentField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="supportsMeasureSeries && !barRequiresSegments && !isGroupedBar" class="encoding-config__angle" aria-label="Y value columns">
        <span>{{ axisSwapped ? "X values" : "Y values" }} <abbr title="At least one required" aria-label="At least one required">*</abbr></span>
        <label v-for="column in quantitativeColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedValueSeriesFields.includes(column.name)"
            @change="toggleValueSeriesField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <p v-if="usesDerivedSeries" class="encoding-config__derived-series">
        Series: selected measure names
      </p>

      <EncodingChannelField
        v-if="seriesConfig"
        :config="seriesConfig"
        :columns="columns"
        :value="resolvedSeriesField(chartSpec)"
        @change="emit('seriesFieldChange', $event)"
      />

      <section v-if="isPolar" class="encoding-config__angle" aria-label="Theta measures">
        <span>Theta <abbr title="Required" aria-label="Required">*</abbr></span>
        <label v-for="column in quantitativeColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedAngleFields.includes(column.name)"
            @change="toggleAngleField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="isParallel" class="encoding-config__angle" aria-label="Parallel dimensions">
        <span>Numeric dimensions <abbr title="At least two required" aria-label="At least two required">*</abbr></span>
        <label v-for="column in quantitativeColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedParallelFields.includes(column.name)"
            @change="toggleParallelField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="isPolar" class="encoding-config__radius" aria-label="R axis encoding">
        <div class="encoding-config__radius-heading">
          <span>R / Outer radius</span>
          <strong>{{ radiusMode === "static" ? "Static" : "Mapped" }}</strong>
        </div>
        <EncodingChannelField
          :config="configs.find((config) => config.channel === 'radius')!"
          :columns="columns"
          :value="resolvedEncodingField(chartSpec, 'radius')"
          @change="emit('channelChange', 'radius', $event)"
        />
        <label v-if="radiusMode === 'static'" class="encoding-config__static encoding-config__static-radius">
          <span>Outer radius</span>
          <input
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            :value="staticOuterRadius"
            @input="emit('markConfigChange', { outerRadius: Number(($event.target as HTMLInputElement).value) })"
          />
          <output>{{ Math.round(staticOuterRadius * 100) }}%</output>
        </label>
      </section>

      <section v-if="editableSeriesMembers.length || colorConfig || sizeConfig" class="encoding-config__appearance encoding-config__appearance--chart">
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
        <label v-if="!isMultiLine && colorConfig && !colorField && editableSeriesMembers.length === 0" class="encoding-config__static">
          <span>Color value</span>
          <input type="color" :value="staticColor" @input="emit('markConfigChange', { color: ($event.target as HTMLInputElement).value })" />
        </label>
        <label v-if="!isMultiLine && sizeConfig && !sizeField" class="encoding-config__static">
          <span>Size value</span>
          <input type="range" min="1" max="48" step="0.5" :value="staticSize" @input="emit('markConfigChange', { size: Number(($event.target as HTMLInputElement).value) })" />
          <output>{{ staticSize }} px</output>
        </label>
        <VisualMappingEditor
          v-if="!isMultiLine"
          :show-color="showColorMapping"
          :show-size="showSizeMapping"
          :color-mapping="colorMapping"
          :size-mapping="sizeMapping"
          @color-change="(mapping: LinearColorMapping) => emit('markConfigChange', { colorMapping: mapping })"
          @size-change="(mapping: LinearSizeMapping) => emit('markConfigChange', { sizeMapping: mapping })"
        />
      </section>
      </section>

      <section v-if="isFacetComposition" class="encoding-config__column encoding-config__column--composition" aria-label="Composition encodings">
        <div class="encoding-config__column-heading">
          <strong>Composition</strong>
          <span>Facet</span>
        </div>
        <EncodingChannelField
          :config="{ channel: 'column', label: 'Facet column', role: 'dimension', required: false, accepts: ['nominal', 'temporal', 'quantitative'], emptyLabel: 'Not bound' }"
          :columns="facetFieldOptions"
          :value="facetColumnField"
          @change="updateFacetField('column', $event)"
        />
        <EncodingChannelField
          :config="{ channel: 'row', label: 'Facet row', role: 'dimension', required: false, accepts: ['nominal', 'temporal', 'quantitative'], emptyLabel: 'Not bound' }"
          :columns="facetFieldOptions"
          :value="facetRowField"
          @change="updateFacetField('row', $event)"
        />
        <label class="encoding-config__option">
          <span>Layout direction</span>
          <select
            :value="composition?.facetDirection ?? 'column'"
            @change="emit('compositionChange', { facetDirection: ($event.target as HTMLSelectElement).value as 'row' | 'column' })"
          >
            <option value="column">Columns</option>
            <option value="row">Rows</option>
          </select>
        </label>
      </section>

      <section v-if="isFacetComposition" class="encoding-config__column encoding-config__column--resolve" aria-label="Composition resolve">
        <div class="encoding-config__column-heading">
          <strong>Resolve</strong>
          <span>Shared axes</span>
        </div>
        <label v-for="channel in resolveOptions" :key="channel" class="encoding-config__resolve-option">
          <input
            type="checkbox"
            :checked="composition?.sharedChannels.includes(channel)"
            @change="toggleResolvedChannel(channel)"
          />
          <span>{{ channel.toUpperCase() }}</span>
          <small>{{ composition?.sharedChannels.includes(channel) ? 'Shared' : 'Independent' }}</small>
        </label>
        <p v-if="resolveOptions.length === 0" class="encoding-config__column-empty">No resolvable channels.</p>
      </section>
      </div>
    </div>
    <p v-else class="encoding-config__empty">Import a CSV to bind channels.</p>

    <section v-if="normalizedChartType.includes('horizon')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Bands</span>
        <input type="range" min="1" max="9" step="1" :value="horizonBands" @input="emit('markConfigChange', { bands: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ horizonBands }}</output>
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

    <section v-if="normalizedChartType.includes('hexbin')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Radius</span>
        <input type="range" min="2" max="20" step="1" :value="hexbinRadius" @input="emit('markConfigChange', { radius: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ hexbinRadius }} px</output>
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

    <section
      v-if="compatibilityMessage || repairPlans?.length || alternativeRecommendations?.length"
      class="encoding-config__resolution"
      aria-label="Encoding resolution"
    >
      <div class="encoding-config__resolution-header">
        <div>
          <strong>Resolve required</strong>
          <span v-if="compatibilityMessage">This binding is not ready to apply.</span>
          <span v-else>Review the available data alternatives.</span>
        </div>
      </div>
      <p v-if="compatibilityMessage" class="encoding-config__error">{{ compatibilityMessage }}</p>
      <div v-if="repairPlans?.length" class="encoding-config__repair-list">
        <span>Minimal repairs</span>
        <button
          v-for="(plan, index) in repairPlans"
          :key="plan.key"
          type="button"
          class="encoding-config__repair-option"
          :class="{ 'encoding-config__repair-option--active': selectedRepairPlanKey === plan.key }"
          @click="emit('chooseRepairPlan', plan.key)"
        >
          <strong>{{ index + 1 }}. {{ plan.fields.join(" + ") }}</strong>
          <small>{{ plan.fields.length }} {{ plan.fields.length === 1 ? "field" : "fields" }}</small>
        </button>
      </div>
      <div v-if="pendingDimension" class="encoding-config__resolution-options">
        <div class="encoding-config__resolution-subtitle">
          <strong>Resolve {{ pendingDimension.field }}</strong>
          <span>{{ pendingDimension.valueCount }} values need a structural decision.</span>
        </div>
        <section class="encoding-config__resolution-card">
          <span>Data reduction</span>
          <strong>Aggregate {{ pendingDimension.field }}</strong>
          <select
            :value="pendingAggregation"
            aria-label="Aggregation method"
            @change="emit('updatePendingAggregation', ($event.target as HTMLSelectElement).value as 'sum' | 'avg')"
          >
            <option value="sum">Sum</option>
            <option value="avg">Avg</option>
          </select>
          <button type="button" @click="emit('chooseDimensionAggregation')">Apply</button>
        </section>
        <section v-if="dimensionChartUpgradeOptions?.length" class="encoding-config__resolution-card">
          <span>Chart upgrade</span>
          <strong>Upgrade with {{ pendingDimension.field }}</strong>
          <select
            :value="pendingChartUpgrade"
            aria-label="Chart upgrade target"
            @change="emit('updatePendingChartUpgrade', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in dimensionChartUpgradeOptions" :key="option.chartType" :value="option.chartType">{{ option.label }}</option>
          </select>
          <button type="button" :disabled="!pendingChartUpgrade" @click="emit('chooseDimensionChartUpgrade')">Apply</button>
        </section>
        <section v-if="availableFacetDirections?.length" class="encoding-config__resolution-card">
          <span>Facet</span>
          <strong>Facet by {{ pendingDimension.field }}</strong>
          <div class="encoding-config__facet-directions" role="group" aria-label="Facet direction">
            <button
              v-for="direction in availableFacetDirections"
              :key="direction"
              type="button"
              :class="{ 'is-active': pendingFacetDirection === direction }"
              @click="emit('updatePendingFacetDirection', direction)"
            >
              {{ direction === "column" ? "Column" : "Row" }}
            </button>
          </div>
          <button type="button" @click="emit('chooseDimensionFacet')">Apply</button>
        </section>
      </div>
      <div v-if="alternativeRecommendations?.length" class="encoding-config__alternative-list">
        <span>Alternative recommendations</span>
        <div v-for="recommendation in alternativeRecommendations" :key="recommendation.id" class="encoding-config__alternative-option">
          <strong>{{ recommendation.label }}</strong>
          <small>{{ recommendation.field }} · {{ recommendation.strategy }}</small>
        </div>
      </div>
    </section>
    <p v-else-if="rendererError" class="encoding-config__error">{{ rendererError }}</p>
    <div class="encoding-config__actions">
      <button type="button" :disabled="!canConfirm" @click="emit('confirm')">Confirm encodings</button>
    </div>
  </div>
</template>

<style scoped>
.encoding-config { display: grid; gap: 14px; }
.encoding-config__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.encoding-config__header > div { display: grid; min-width: 0; gap: 2px; }
.encoding-config__header strong { color: #18212f; font-size: 12px; letter-spacing: 0.08em; }
.encoding-config__header span { overflow: hidden; color: #6b7889; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__header button { display: inline-grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #5b6a80; cursor: pointer; }
.encoding-config__header button:hover { background: #edf5fc; color: #1554b2; }
.encoding-config__channels { display: grid; gap: 12px; }
.encoding-config__columns { display: grid; grid-template-columns: minmax(260px, 1.4fr) minmax(220px, 1fr) minmax(180px, 0.8fr); gap: 10px; align-items: start; overflow-x: auto; padding-bottom: 3px; }
.encoding-config__column { display: grid; min-width: 0; gap: 10px; padding: 10px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 6px; background: #fbfcfe; }
.encoding-config__column--composition { background: #f8fbff; }
.encoding-config__column--resolve { background: #fafafa; }
.encoding-config__column-heading { display: grid; gap: 2px; padding-bottom: 2px; border-bottom: 1px solid rgba(24, 33, 47, 0.09); }
.encoding-config__column-heading strong { color: #263548; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.encoding-config__column-heading span, .encoding-config__column-empty { color: #718096; font-size: 10px; line-height: 1.35; }
.encoding-config__resolve-option { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 7px; color: #344256; font-size: 11px; }
.encoding-config__resolve-option small { color: #718096; font-size: 9px; }
.encoding-config__axis-switch { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 8px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 6px; background: #f8fafc; color: #516176; font-size: 11px; }
.encoding-config__axis-switch button { min-width: 64px; min-height: 28px; padding: 0 8px; border: 1px solid rgba(28, 126, 214, 0.28); border-radius: 999px; background: #fff; color: #1554b2; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; }
.encoding-config__axis-switch button.is-active { border-color: #1554b2; background: #1554b2; color: #fff; }
.encoding-config__summary { margin: 0; padding: 8px 9px; border-left: 3px solid #1980bd; background: #f3f7fa; color: #334155; font-size: 11px; line-height: 1.45; }
.encoding-config__derived-series { margin: -4px 0 0; color: #1554b2; font-size: 11px; }
.encoding-config__angle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 2px; color: #516176; font-size: 11px; }
.encoding-config__angle > span { grid-column: 1 / -1; }
.encoding-config__angle abbr { color: #b42318; text-decoration: none; }
.encoding-config__angle label { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 6px 7px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 5px; background: #f8fafc; color: #334155; cursor: pointer; }
.encoding-config__angle input { width: 14px; height: 14px; flex: 0 0 14px; margin: 0; accent-color: #1554b2; }
.encoding-config__angle label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__radius, .encoding-config__appearance { display: grid; gap: 9px; padding-top: 12px; border-top: 1px solid rgba(24, 33, 47, 0.1); color: #516176; font-size: 11px; }
.encoding-config__radius-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.encoding-config__radius-heading strong { color: #1554b2; font-size: 10px; font-weight: 700; }
.encoding-config__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.encoding-config__segments button { min-height: 28px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.encoding-config__segments button.is-active { background: #fff; color: #1554b2; box-shadow: 0 1px 2px rgba(24, 33, 47, 0.14); font-weight: 700; }
.encoding-config__static { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.encoding-config__option { display: grid; grid-template-columns: minmax(92px, 1fr) minmax(0, 1.25fr); align-items: center; gap: 8px; }
.encoding-config__option select { width: 100%; height: 30px; padding: 0 7px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #223041; font: inherit; }
.encoding-config__member-colors { display: grid; gap: 7px; }
.encoding-config__member-colors > span { color: #334155; font-weight: 650; }
.encoding-config__member-colors label { display: grid; grid-template-columns: minmax(0, 1fr) 38px; align-items: center; gap: 8px; }
.encoding-config__member-colors label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-colors input { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__member-styles { display: grid; gap: 7px; }
.encoding-config__member-styles header,
.encoding-config__member-styles label { display: grid; grid-template-columns: minmax(62px, 1fr) 34px 46px 70px; align-items: center; gap: 5px; }
.encoding-config__member-styles header { color: #687585; font-size: 9px; }
.encoding-config__member-styles header span:first-child { color: #334155; font-size: 11px; font-weight: 650; }
.encoding-config__member-styles label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-styles input[type="color"] { width: 34px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__member-styles input[type="number"],
.encoding-config__member-styles select { width: 100%; min-width: 0; height: 28px; padding: 0 4px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #223041; font: inherit; font-size: 9px; }
.encoding-config__static input[type="color"] { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__static input[type="range"] { width: 100%; accent-color: #1980bd; }
.encoding-config__static output { min-width: 40px; color: #687585; font-variant-numeric: tabular-nums; text-align: right; }
.encoding-config__empty, .encoding-config__error { margin: 0; font-size: 11px; line-height: 1.4; }
.encoding-config__empty { color: #6b7889; }
.encoding-config__error { color: #b42318; }
.encoding-config__resolution { display: grid; gap: 8px; padding: 10px; border: 1px solid rgba(180, 35, 24, 0.2); border-radius: 7px; background: #fff8f7; }
.encoding-config__resolution-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.encoding-config__resolution-header > div { display: grid; gap: 2px; min-width: 0; }
.encoding-config__resolution-header strong { color: #8c2929; font-size: 11px; }
.encoding-config__resolution-header span { color: #9b5c57; font-size: 10px; line-height: 1.35; }
.encoding-config__repair-list, .encoding-config__alternative-list { display: grid; gap: 5px; padding-top: 7px; border-top: 1px solid rgba(180, 35, 24, 0.12); }
.encoding-config__repair-list > span, .encoding-config__alternative-list > span { color: #8c2929; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.encoding-config__repair-option, .encoding-config__alternative-option { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 7px; border: 1px solid rgba(180, 35, 24, 0.12); border-radius: 5px; background: #fff; font: inherit; text-align: left; }
.encoding-config__repair-option { cursor: pointer; }
.encoding-config__repair-option:hover, .encoding-config__repair-option--active { border-color: rgba(180, 35, 24, 0.45); background: #fff1ef; }
.encoding-config__repair-option strong, .encoding-config__alternative-option strong { min-width: 0; overflow: hidden; color: #334155; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__repair-option small, .encoding-config__alternative-option small { flex: 0 0 auto; color: #9b5c57; font-size: 9px; }
.encoding-config__resolution-options { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(180, 35, 24, 0.14); }
.encoding-config__resolution-subtitle { display: grid; gap: 2px; }
.encoding-config__resolution-subtitle strong { color: #8c2929; font-size: 11px; }
.encoding-config__resolution-subtitle span { color: #9b5c57; font-size: 10px; }
.encoding-config__resolution-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(92px, 1fr) auto; align-items: center; gap: 7px; padding: 8px; border: 1px solid rgba(180, 35, 24, 0.14); border-radius: 6px; background: #fff; }
.encoding-config__resolution-card > span { grid-column: 1 / -1; color: #9b5c57; font-size: 9px; font-weight: 700; text-transform: uppercase; }
.encoding-config__resolution-card > strong { min-width: 0; overflow: hidden; color: #334155; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__resolution-card select { width: 100%; height: 28px; min-width: 0; padding: 0 5px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #334155; font: inherit; font-size: 10px; }
.encoding-config__resolution-card > button { min-height: 28px; padding: 0 9px; border: 1px solid #b42318; border-radius: 5px; background: #b42318; color: #fff; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; }
.encoding-config__resolution-card > button:disabled { cursor: not-allowed; opacity: 0.45; }
.encoding-config__facet-directions { display: flex; gap: 4px; }
.encoding-config__facet-directions button { min-height: 28px; padding: 0 8px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #516176; font: inherit; font-size: 10px; cursor: pointer; }
.encoding-config__facet-directions button.is-active { border-color: #b42318; background: #fff1ef; color: #8c2929; font-weight: 700; }
.encoding-config__actions { display: flex; justify-content: flex-end; }
.encoding-config__actions button { min-height: 32px; padding: 0 10px; border: 1px solid #1554b2; border-radius: 6px; background: #1554b2; color: #fff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.encoding-config__actions button:disabled { cursor: default; opacity: 0.45; }
</style>
