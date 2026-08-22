<script setup lang="ts">
import { computed, ref } from "vue";
import { X } from "@lucide/vue";
import EncodingChannelField from "./EncodingChannelField.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import {
  getEncodingChannelConfigsForSpec,
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
  DataColumn,
  DataRow,
  LineSeriesShape,
  LinearColorMapping,
  LinearSizeMapping,
  MarkGroupSharedConfig,
  SeriesStyleMapping,
} from "../types";
import {
  defaultColorMapping,
  defaultSizeMapping,
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  isSeriesStyleMapping,
} from "../utils/visualMapping";
import {
  csvColumnDragMime,
  decodeCsvColumnDragPayload,
  getActiveCsvColumnDrag,
} from "../utils/csvColumnDrag";

const props = defineProps<{
  chartName: string;
  chartSpec: ChartSpec;
  columns: DataColumn[];
  rows: DataRow[];
  markConfig: MarkGroupSharedConfig;
  rendererError?: string;
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
  compositionChange: [patch: {
    facetField?: string;
    facetDirection?: "row" | "column";
    facetGrid?: CompositionSpec["facetGrid"];
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
const supportsSeriesItems = computed(() => template.value === "line"
  || template.value === "scatter"
  || template.value === "area"
  || supportsBarValueSeries.value);
const seriesRole = computed(() => getChartTemplateContract(props.chartSpec.chartType)?.channels
  .find((config) => config.role === "series"));
const seriesItemsRequired = computed(() => supportsSeriesItems.value
  && (seriesRole.value?.required === true || isExplicitMultiLine.value));
const seriesItemLabel = computed(() => seriesRole.value?.semanticLabel ?? "Series");
const isParallel = computed(() => template.value === "parallel");
const standardConfigs = computed(() => configs.value.filter((config) => {
  if (isPolar.value && config.channel === "theta") return false;
  if (isPolar.value && config.channel === "radius") return false;
  if (isParallel.value && config.channel === "dimensions") return false;
  if (supportsSeriesItems.value && config.role === "series") return false;
  if (supportsSeriesItems.value && seriesItemMode.value === "quantitative" && config.channel === "y") return false;
  return true;
}));
const seriesMembers = computed(() => {
  const field = selectedSeriesFields.value[0] ?? resolvedSeriesField(props.chartSpec);
  if (!field) return [];
  return Array.from(new Set(props.rows.map((row) => row[field] ?? "").filter(Boolean)))
    .map((id) => ({ id, label: id }));
});
const selectedValueSeriesFields = computed(() => props.chartSpec.valueFields?.map((encoding) => encoding.field) ?? []);
const selectedSeriesFields = computed(() => props.chartSpec.seriesFields?.map((encoding) => encoding.field)
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
  ? column.type === "nominal" || column.type === "temporal"
  : column.type === "nominal" || column.type === "temporal" || column.type === "quantitative"));
const seriesItemDropState = ref<"idle" | "valid" | "invalid">("idle");
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
const supportsLegend = computed(() => supportsSeriesItems.value
  || (template.value === "scatter" && colorColumn.value?.type === "nominal"));
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
const canConfirm = computed(() => resolveChartEncodingIssues(props.chartSpec).length === 0
  && (!seriesItemsRequired.value
    || (seriesItemMode.value === "categorical"
      ? selectedSeriesFields.value.length === 1 && !!resolvedEncodingField(props.chartSpec, "y")
      : seriesItemMode.value === "quantitative"
        ? selectedValueSeriesFields.value.length >= (supportsBarValueSeries.value ? 2 : 1)
        : false))
  && configs.value.every((config) => {
    if (!config.required) return true;
    if (supportsSeriesItems.value && config.role === "series") return seriesItemMode.value !== null;
    if (config.channel === "y" && seriesItemMode.value === "quantitative") {
      return selectedValueSeriesFields.value.length > 0;
    }
    if (config.channel === "dimensions") return selectedParallelFields.value.length >= 2;
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

function isSeriesItemDisabled(field: string) {
  const column = props.columns.find((item) => item.name === field);
  if (!column || !seriesItemMode.value) return false;
  if (seriesItemMode.value === "categorical") return !selectedSeriesFields.value.includes(field);
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
  emit("seriesFieldsChange", selectedSeriesFields.value.includes(field) ? [] : [field]);
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
  if (!selectedSeriesFields.value.includes(column.name)) emit("seriesFieldsChange", [column.name]);
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
        <span>
          {{ seriesItemLabel }}
          <abbr v-if="seriesItemsRequired" title="At least one required" aria-label="At least one required">*</abbr>
        </span>
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
          <span>{{ column.name }}</span>
        </label>
      </section>

      <p v-if="seriesItemMode === 'quantitative'" class="encoding-config__derived-series">
        Series: selected measure names
      </p>

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
        <label v-if="supportsLegend" class="encoding-config__option">
          <span>Show legend</span>
          <input
            type="checkbox"
            :checked="legendVisible"
            @change="emit('markConfigChange', { legendVisible: ($event.target as HTMLInputElement).checked })"
          />
        </label>
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

    <p v-if="rendererError" class="encoding-config__error">{{ rendererError }}</p>
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
.encoding-config__columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: stretch; padding-bottom: 3px; }
.encoding-config__column { display: grid; min-width: 0; align-content: start; gap: 10px; padding: 10px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 6px; background: #fbfcfe; }
.encoding-config__column--composition { background: #f8fbff; }
.encoding-config__column-heading { display: grid; gap: 2px; padding-bottom: 2px; border-bottom: 1px solid rgba(24, 33, 47, 0.09); }
.encoding-config__column-heading strong { color: #263548; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.encoding-config__column-heading span, .encoding-config__column-empty { color: #718096; font-size: 10px; line-height: 1.35; }
.encoding-config__axis-switch { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 8px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 6px; background: #f8fafc; color: #516176; font-size: 11px; }
.encoding-config__axis-switch button { min-width: 64px; min-height: 28px; padding: 0 8px; border: 1px solid rgba(28, 126, 214, 0.28); border-radius: 999px; background: #fff; color: #1554b2; font: inherit; font-size: 10px; font-weight: 700; cursor: pointer; }
.encoding-config__axis-switch button.is-active { border-color: #1554b2; background: #1554b2; color: #fff; }
.encoding-config__summary { margin: 0; padding: 8px 9px; border-left: 3px solid #1980bd; background: #f3f7fa; color: #334155; font-size: 11px; line-height: 1.45; }
.encoding-config__derived-series { margin: -4px 0 0; color: #1554b2; font-size: 11px; }
.encoding-config__angle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 2px; color: #516176; font-size: 11px; }
.encoding-config__angle > span { grid-column: 1 / -1; }
.encoding-config__angle abbr { color: #b42318; text-decoration: none; }
.encoding-config__angle label { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 6px 7px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 5px; background: #f8fafc; color: #334155; cursor: pointer; }
.encoding-config__angle label.is-disabled { background: #f1f3f5; color: #97a1ae; cursor: not-allowed; opacity: 0.68; }
.encoding-config__angle input { width: 14px; height: 14px; flex: 0 0 14px; margin: 0; accent-color: #1554b2; }
.encoding-config__angle label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__series-drop { padding: 8px; border: 1px dashed rgba(21, 84, 178, 0.28); border-radius: 6px; transition: border-color 120ms ease, background 120ms ease; }
.encoding-config__series-drop.is-drop-active { border-color: #1554b2; background: #edf6ff; }
.encoding-config__series-drop.is-drop-invalid { border-color: #b42318; background: #fff1ef; }
.encoding-config__radius, .encoding-config__appearance { display: grid; gap: 9px; padding-top: 12px; border-top: 1px solid rgba(24, 33, 47, 0.1); color: #516176; font-size: 11px; }
.encoding-config__radius-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.encoding-config__radius-heading strong { color: #1554b2; font-size: 10px; font-weight: 700; }
.encoding-config__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.encoding-config__segments button { min-height: 28px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.encoding-config__segments button.is-active { background: #fff; color: #1554b2; box-shadow: 0 1px 2px rgba(24, 33, 47, 0.14); font-weight: 700; }
.encoding-config__static { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.encoding-config__option { display: grid; grid-template-columns: minmax(92px, 1fr) minmax(0, 1.25fr); align-items: center; gap: 8px; }
.encoding-config__option select { width: 100%; height: 34px; padding: 0 8px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 6px; background: #fff; color: #223041; font: inherit; }
.encoding-config__member-colors { display: grid; gap: 7px; }
.encoding-config__member-colors > span { color: #334155; font-weight: 650; }
.encoding-config__member-colors label { display: grid; grid-template-columns: minmax(0, 1fr) 38px; align-items: center; gap: 8px; }
.encoding-config__member-colors label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-colors input { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__member-styles { display: grid; gap: 7px; }
.encoding-config__member-styles header,
.encoding-config__member-styles label { display: grid; grid-template-columns: minmax(48px, 1fr) 30px 40px 62px; align-items: center; gap: 5px; }
.encoding-config__member-styles header { color: #687585; font-size: 9px; }
.encoding-config__member-styles header span:first-child { color: #334155; font-size: 11px; font-weight: 650; }
.encoding-config__member-styles label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-styles input[type="color"] { width: 30px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__member-styles input[type="number"],
.encoding-config__member-styles select { width: 100%; min-width: 0; height: 28px; padding: 0 4px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #223041; font: inherit; font-size: 9px; }
.encoding-config__static input[type="color"] { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__static input[type="range"] { width: 100%; accent-color: #1980bd; }
.encoding-config__static output { min-width: 40px; color: #687585; font-variant-numeric: tabular-nums; text-align: right; }
.encoding-config__empty, .encoding-config__error { margin: 0; font-size: 11px; line-height: 1.4; }
.encoding-config__empty { color: #6b7889; }
.encoding-config__error { color: #b42318; }
.encoding-config__facet-directions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); width: 100%; gap: 4px; }
.encoding-config__facet-directions button { width: 100%; height: 34px; padding: 0 8px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 6px; background: #fff; color: #516176; font: inherit; font-size: 10px; cursor: pointer; }
.encoding-config__facet-directions button.is-active { border-color: #b42318; background: #fff1ef; color: #8c2929; font-weight: 700; }
.encoding-config__actions { display: flex; justify-content: flex-end; }
.encoding-config__actions button { min-height: 32px; padding: 0 10px; border: 1px solid #1554b2; border-radius: 6px; background: #1554b2; color: #fff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.encoding-config__actions button:disabled { cursor: default; opacity: 0.45; }
</style>
