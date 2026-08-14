<script setup lang="ts">
import { computed } from "vue";
import { X } from "@lucide/vue";
import EncodingChannelField from "./EncodingChannelField.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import { getEncodingChannelConfigs, resolvedEncodingField } from "./encodingConfig";
import { normalizeChartTemplate } from "./chartTemplates";
import type {
  ChartEncodingChannel,
  ChartSpec,
  DataColumn,
  LinearColorMapping,
  LinearSizeMapping,
  MarkGroupSharedConfig,
} from "./types";
import {
  defaultColorMapping,
  defaultSizeMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
} from "./visualMapping";

const props = defineProps<{
  chartName: string;
  chartSpec: ChartSpec;
  columns: DataColumn[];
  markConfig: MarkGroupSharedConfig;
  rendererError?: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
  channelChange: [channel: ChartEncodingChannel, field: string];
  angleFieldsChange: [fields: string[]];
  radiusModeChange: [mode: "shared" | "per-component"];
  componentRadiusFieldChange: [componentField: string, field: string];
  markConfigChange: [patch: MarkGroupSharedConfig];
}>();

const template = computed(() => normalizeChartTemplate(props.chartSpec.chartType));
const configs = computed(() => getEncodingChannelConfigs(props.chartSpec.chartType));
const isPie = computed(() => template.value === "pie");
const standardConfigs = computed(() => configs.value.filter((config) => {
  if (isPie.value && (config.channel === "angle" || config.channel === "radius")) return false;
  return true;
}));
const quantitativeColumns = computed(() => props.columns.filter((column) => column.type === "quantitative"));
const selectedAngleFields = computed(() => props.chartSpec.angleFields?.map((encoding) => encoding.field)
  ?? (props.chartSpec.encodings.angle ? [props.chartSpec.encodings.angle.field] : []));
const radiusMode = computed(() => props.chartSpec.radiusMode ?? "shared");
const colorConfig = computed(() => configs.value.find((config) => config.channel === "color"));
const sizeConfig = computed(() => configs.value.find((config) => config.channel === "size"));
const colorField = computed(() => resolvedEncodingField(props.chartSpec, "color"));
const sizeField = computed(() => resolvedEncodingField(props.chartSpec, "size"));
const colorColumn = computed(() => props.columns.find((column) => column.name === colorField.value));
const showColorMapping = computed(() => !!colorColumn.value && colorColumn.value.type !== "nominal");
const showSizeMapping = computed(() => !!sizeField.value);
const staticColor = computed(() => typeof props.markConfig.color === "string" ? props.markConfig.color : "#2563eb");
const staticSize = computed(() => typeof props.markConfig.size === "number" ? props.markConfig.size : 4);
const colorMapping = computed(() => isLinearColorMapping(props.markConfig.colorMapping) ? props.markConfig.colorMapping : defaultColorMapping);
const sizeMapping = computed(() => isLinearSizeMapping(props.markConfig.sizeMapping) ? props.markConfig.sizeMapping : defaultSizeMapping);
const canConfirm = computed(() => configs.value.every((config) => {
  if (!config.required) return true;
  if (config.multiple) return selectedAngleFields.value.length > 0;
  return !!resolvedEncodingField(props.chartSpec, config.channel);
}));

function toggleAngleField(field: string) {
  emit("angleFieldsChange", selectedAngleFields.value.includes(field)
    ? selectedAngleFields.value.filter((item) => item !== field)
    : [...selectedAngleFields.value, field]);
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
        <strong>ENCODINGS</strong>
        <span>{{ chartName }}</span>
      </div>
      <button type="button" title="Close" aria-label="Close encoding panel" @click="emit('close')">
        <X :size="16" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </header>

    <div v-if="columns.length" class="encoding-config__channels">
      <EncodingChannelField
        v-for="config in standardConfigs"
        :key="config.channel"
        :config="config"
        :columns="columns"
        :value="resolvedEncodingField(chartSpec, config.channel)"
        @change="updateMappingDefaults(config.channel, $event)"
      />

      <section v-if="isPie" class="encoding-config__angle" aria-label="Angle components">
        <span>Angle components <abbr title="Required" aria-label="Required">*</abbr></span>
        <label v-for="column in quantitativeColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedAngleFields.includes(column.name)"
            @change="toggleAngleField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="isPie" class="encoding-config__radius" aria-label="Outer radius encoding">
        <span>Outer radius</span>
        <div class="encoding-config__segments" role="group" aria-label="Outer radius mode">
          <button type="button" :class="{ 'is-active': radiusMode === 'shared' }" @click="emit('radiusModeChange', 'shared')">Shared</button>
          <button type="button" :class="{ 'is-active': radiusMode === 'per-component' }" @click="emit('radiusModeChange', 'per-component')">Per component</button>
        </div>
        <EncodingChannelField
          v-if="radiusMode === 'shared'"
          :config="configs.find((config) => config.channel === 'radius')!"
          :columns="columns"
          :value="resolvedEncodingField(chartSpec, 'radius')"
          @change="emit('channelChange', 'radius', $event)"
        />
        <div v-else class="encoding-config__component-radii">
          <label v-for="component in chartSpec.angleFields ?? []" :key="component.field">
            <span>{{ component.field }}</span>
            <select
              :value="chartSpec.componentRadiusFields?.[component.field]?.field ?? ''"
              @change="emit('componentRadiusFieldChange', component.field, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Static</option>
              <option v-for="column in quantitativeColumns" :key="column.name" :value="column.name">{{ column.name }}</option>
            </select>
          </label>
        </div>
      </section>
    </div>
    <p v-else class="encoding-config__empty">Import a CSV to bind channels.</p>

    <section v-if="colorConfig || sizeConfig" class="encoding-config__appearance">
      <label v-if="colorConfig && !colorField" class="encoding-config__static">
        <span>Color value</span>
        <input type="color" :value="staticColor" @input="emit('markConfigChange', { color: ($event.target as HTMLInputElement).value })" />
      </label>
      <label v-if="sizeConfig && !sizeField" class="encoding-config__static">
        <span>Size value</span>
        <input type="range" min="1" max="48" step="0.5" :value="staticSize" @input="emit('markConfigChange', { size: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ staticSize }} px</output>
      </label>
      <VisualMappingEditor
        :show-color="showColorMapping"
        :show-size="showSizeMapping"
        :color-mapping="colorMapping"
        :size-mapping="sizeMapping"
        @color-change="(mapping: LinearColorMapping) => emit('markConfigChange', { colorMapping: mapping })"
        @size-change="(mapping: LinearSizeMapping) => emit('markConfigChange', { sizeMapping: mapping })"
      />
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
.encoding-config__angle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 2px; color: #516176; font-size: 11px; }
.encoding-config__angle > span { grid-column: 1 / -1; }
.encoding-config__angle abbr { color: #b42318; text-decoration: none; }
.encoding-config__angle label { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 6px 7px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 5px; background: #f8fafc; color: #334155; cursor: pointer; }
.encoding-config__angle input { width: 14px; height: 14px; flex: 0 0 14px; margin: 0; accent-color: #1554b2; }
.encoding-config__angle label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__radius, .encoding-config__appearance { display: grid; gap: 9px; padding-top: 12px; border-top: 1px solid rgba(24, 33, 47, 0.1); color: #516176; font-size: 11px; }
.encoding-config__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.encoding-config__segments button { min-height: 28px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.encoding-config__segments button.is-active { background: #fff; color: #1554b2; box-shadow: 0 1px 2px rgba(24, 33, 47, 0.14); font-weight: 700; }
.encoding-config__component-radii { display: grid; gap: 7px; }
.encoding-config__component-radii label { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); align-items: center; gap: 8px; }
.encoding-config__component-radii label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__component-radii select { width: 100%; min-width: 0; height: 30px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 6px; background: #fff; color: #223041; font: inherit; }
.encoding-config__static { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.encoding-config__static input[type="color"] { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__static input[type="range"] { width: 100%; accent-color: #1980bd; }
.encoding-config__static output { min-width: 40px; color: #687585; font-variant-numeric: tabular-nums; text-align: right; }
.encoding-config__empty, .encoding-config__error { margin: 0; font-size: 11px; line-height: 1.4; }
.encoding-config__empty { color: #6b7889; }
.encoding-config__error { color: #b42318; }
.encoding-config__actions { display: flex; justify-content: flex-end; }
.encoding-config__actions button { min-height: 32px; padding: 0 10px; border: 1px solid #1554b2; border-radius: 6px; background: #1554b2; color: #fff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.encoding-config__actions button:disabled { cursor: default; opacity: 0.45; }
</style>
