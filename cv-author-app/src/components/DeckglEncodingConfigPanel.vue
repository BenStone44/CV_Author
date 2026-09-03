<script setup lang="ts">
import { computed, ref } from "vue";
import { Moon, Sun, X } from "@lucide/vue";
import {
  deckglDarkMapStyleUrl,
  deckglLightMapStyleUrl,
} from "../utils/geographicLayerCards";
import type {
  DataColumn,
  Dataset,
  GeometrySource,
  GeographicLayerBinding,
  GeographicLayerConfig,
} from "../types";

const props = defineProps<{
  layerName: string;
  layerFamily: "point" | "line" | "area";
  mapStyleUrl: string;
  config: GeographicLayerConfig;
  binding?: GeographicLayerBinding;
  columns: DataColumn[];
  datasets: Dataset[];
  geometrySources: GeometrySource[];
}>();

const emit = defineEmits<{
  close: [];
  mapStyleChange: [mapStyleUrl: string];
  configChange: [patch: GeographicLayerConfig];
  encodingChange: [channel: "color" | "size", field: string];
  dataBindingChange: [datasetId: string, geometrySourceId: string, idField: string];
}>();

const pointSize = computed(() => typeof props.config.size === "number" ? props.config.size : 8);
const pointColor = computed(() => typeof props.config.color === "string" ? props.config.color : "#99582a");
const quantitativeColumns = computed(() => props.columns.filter((column) => column.type === "quantitative"));
type BindingDraft = {
  bindingKey: string;
  datasetId?: string;
  geometrySourceId?: string;
  idField?: string;
};

const bindingDraft = ref<BindingDraft | null>(null);
const bindingKey = computed(() => [
  props.binding?.datasetId ?? "",
  props.binding?.geometrySourceId ?? "",
  props.binding?.idField ?? "",
].join("\u0000"));
const currentDraft = computed(() => bindingDraft.value?.bindingKey === bindingKey.value
  ? bindingDraft.value
  : null);
const selectedDatasetId = computed({
  get: () => {
    const candidates = [currentDraft.value?.datasetId, props.binding?.datasetId];
    return candidates.find((id) => id && props.datasets.some((dataset) => dataset.id === id))
      ?? props.datasets[0]?.id
      ?? "";
  },
  set: (datasetId: string) => {
    bindingDraft.value = { bindingKey: bindingKey.value, datasetId };
  },
});
const selectedGeometrySourceId = computed({
  get: () => {
    const candidates = [currentDraft.value?.geometrySourceId, props.binding?.geometrySourceId];
    return candidates.find((id) => id && props.geometrySources.some((source) => source.id === id))
      ?? props.geometrySources[0]?.id
      ?? "";
  },
  set: (geometrySourceId: string) => {
    bindingDraft.value = {
      ...currentDraft.value,
      bindingKey: bindingKey.value,
      geometrySourceId,
    };
  },
});
const selectedDataset = computed(() =>
  props.datasets.find((dataset) => dataset.id === selectedDatasetId.value) ?? null,
);
const selectedColumns = computed(() => {
  const dataset = selectedDataset.value;
  return dataset?.columns.length ? dataset.columns : dataset?.graph?.nodes.columns ?? [];
});
const selectedIdField = computed({
  get: () => {
    const candidates = [currentDraft.value?.idField, props.binding?.idField];
    return candidates.find((field) => field && selectedColumns.value.some((column) => column.name === field))
      ?? selectedColumns.value[0]?.name
      ?? "";
  },
  set: (idField: string) => {
    bindingDraft.value = {
      ...currentDraft.value,
      bindingKey: bindingKey.value,
      idField,
    };
  },
});
const canApplyDataBinding = computed(() =>
  !!selectedDataset.value
  && props.geometrySources.some((source) => source.id === selectedGeometrySourceId.value)
  && selectedColumns.value.some((column) => column.name === selectedIdField.value),
);

function selectDataset(datasetId: string) {
  const dataset = props.datasets.find((candidate) => candidate.id === datasetId);
  const columns = dataset?.columns.length ? dataset.columns : dataset?.graph?.nodes.columns ?? [];
  bindingDraft.value = {
    ...currentDraft.value,
    bindingKey: bindingKey.value,
    datasetId,
    idField: columns[0]?.name ?? "",
  };
}

function applyDataBinding() {
  if (!canApplyDataBinding.value) return;
  emit("dataBindingChange", selectedDatasetId.value, selectedGeometrySourceId.value, selectedIdField.value);
}

</script>

<template>
  <div class="encoding-config">
    <header class="encoding-config__header">
      <div>
        <strong>ENCODING CONFIG</strong>
        <span>{{ layerName }}</span>
      </div>
      <button type="button" title="Close" aria-label="Close encoding panel" @click="emit('close')">
        <X :size="16" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </header>

    <section class="encoding-config__column" aria-label="Map appearance">
      <div class="encoding-config__column-heading">
        <strong>Map style</strong>
      </div>
      <div class="map-style-control">
        <div class="map-style-control__segments" role="group" aria-label="Map style">
          <button
            type="button"
            :class="{ 'is-active': mapStyleUrl === deckglLightMapStyleUrl }"
            :aria-pressed="mapStyleUrl === deckglLightMapStyleUrl"
            @click="emit('mapStyleChange', deckglLightMapStyleUrl)"
          >
            <Sun :size="14" :stroke-width="1.8" aria-hidden="true" />
            <span>Light</span>
          </button>
          <button
            type="button"
            :class="{ 'is-active': mapStyleUrl === deckglDarkMapStyleUrl }"
            :aria-pressed="mapStyleUrl === deckglDarkMapStyleUrl"
            @click="emit('mapStyleChange', deckglDarkMapStyleUrl)"
          >
            <Moon :size="14" :stroke-width="1.8" aria-hidden="true" />
            <span>Dark</span>
          </button>
        </div>
      </div>
    </section>

    <section class="encoding-config__column" aria-label="Geographic data binding">
      <div class="encoding-config__column-heading">
        <strong>Data binding</strong>
        <span>{{ binding ? "Update the CSV-to-GeoJSON join" : "Select data and a GeoJSON ID join" }}</span>
      </div>
      <label class="encoding-field-control">
        <span>Data</span>
        <select :value="selectedDatasetId" @change="selectDataset(($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Select data</option>
          <option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id">{{ dataset.name }}</option>
        </select>
      </label>
      <label class="encoding-field-control">
        <span>GeoJSON</span>
        <select v-model="selectedGeometrySourceId">
          <option value="" disabled>Select GeoJSON</option>
          <option v-for="source in geometrySources" :key="source.id" :value="source.id">{{ source.name }}</option>
        </select>
      </label>
      <label class="encoding-field-control">
        <span>GeoJSON ID</span>
        <select v-model="selectedIdField" :disabled="selectedColumns.length === 0">
          <option value="" disabled>Select ID column</option>
          <option v-for="column in selectedColumns" :key="column.name" :value="column.name">{{ column.name }}</option>
        </select>
      </label>
      <button class="data-binding-apply" type="button" :disabled="!canApplyDataBinding" @click="applyDataBinding">
        {{ binding ? "Update join" : "Bind data" }}
      </button>
    </section>

    <section v-if="layerFamily === 'point' || layerFamily === 'area' || layerFamily === 'line'" class="encoding-config__column" aria-label="Geographic mark appearance">
      <div class="encoding-config__column-heading">
        <strong>{{ layerFamily === "point" ? "Circle" : layerFamily === "line" ? "Line" : "Area" }}</strong>
        <span>{{ layerFamily === "point" ? "Point mark" : layerFamily === "line" ? "Link mark" : "Region planning" }}</span>
      </div>
      <div v-if="binding" class="geometry-binding">
        <span>GeoJSON ID</span>
        <strong>{{ binding.idField }}</strong>
        <small>GeoJSON join · SUM</small>
      </div>
      <label v-if="binding" class="encoding-field-control">
        <span>Color</span>
        <select :value="binding.colorField ?? ''" @change="emit('encodingChange', 'color', ($event.target as HTMLSelectElement).value)">
          <option value="">Static color</option>
          <option v-for="column in quantitativeColumns" :key="column.name" :value="column.name">
            SUM {{ column.name }}
          </option>
        </select>
      </label>
      <label v-if="binding && layerFamily === 'point'" class="encoding-field-control">
        <span>Size</span>
        <select :value="binding.sizeField ?? ''" @change="emit('encodingChange', 'size', ($event.target as HTMLSelectElement).value)">
          <option value="">Static size</option>
          <option v-for="column in quantitativeColumns" :key="column.name" :value="column.name">
            SUM {{ column.name }}
          </option>
        </select>
      </label>
      <label v-if="layerFamily === 'point' && !binding?.sizeField" class="appearance-control">
        <span>Size</span>
        <input
          type="range"
          min="2"
          max="48"
          step="1"
          :value="pointSize"
          @input="emit('configChange', { size: Number(($event.target as HTMLInputElement).value) })"
        />
        <output>{{ pointSize }} px</output>
      </label>
      <label v-if="layerFamily === 'line'" class="appearance-control">
        <span>Thickness</span>
        <input
          type="range"
          min="1"
          max="12"
          step="1"
          :value="pointSize"
          @input="emit('configChange', { size: Number(($event.target as HTMLInputElement).value) })"
        />
        <output>{{ pointSize }} px</output>
      </label>
      <label class="appearance-control">
        <span>{{ binding?.colorField ? "High color" : layerFamily === "point" ? "Color" : layerFamily === "line" ? "Color" : "Area color" }}</span>
          <input
            type="color"
            list="frontend-color-palette"
            :value="pointColor"
          :aria-label="layerFamily === 'point' ? 'Circle color' : 'Area color'"
          @input="emit('configChange', { color: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </section>
  </div>
</template>

<style scoped>
.encoding-config { display: grid; gap: 14px; }
.encoding-config__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.encoding-config__header > div { display: grid; min-width: 0; gap: 2px; }
.encoding-config__header strong { color: #432818; font-size: calc(12px * var(--frontend-font-scale)); letter-spacing: 0.08em; }
.encoding-config__header span { overflow: hidden; color: #6b7889; font-size: calc(11px * var(--frontend-font-scale)); text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__header button { display: inline-grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #99582a; cursor: pointer; }
.encoding-config__header button:hover { background: var(--frontend-surface-soft); color: #432818; }
.encoding-config__column { display: grid; min-width: 0; align-content: start; gap: 12px; padding: 10px; border: 1px solid rgba(67, 40, 24, 0.1); border-radius: 6px; background: var(--frontend-surface-soft); }
.encoding-config__column-heading { display: grid; gap: 2px; padding-bottom: 4px; border-bottom: 1px solid rgba(67, 40, 24, 0.09); }
.encoding-config__column-heading strong { color: #263548; font-size: calc(10px * var(--frontend-font-scale)); letter-spacing: 0.08em; text-transform: uppercase; }
.encoding-config__column-heading span { color: #718096; font-size: calc(10px * var(--frontend-font-scale)); line-height: 1.35; }
.map-style-control { display: grid; gap: 8px; color: #99582a; font-size: calc(11px * var(--frontend-font-scale)); }
.map-style-control__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: color-mix(in srgb, var(--frontend-surface-soft) 70%, var(--frontend-surface-raised)); }
.map-style-control__segments button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.map-style-control__segments button.is-active { background: var(--frontend-surface-raised); color: #432818; box-shadow: 0 1px 2px rgba(67, 40, 24, 0.14); font-weight: 700; }
.appearance-control { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 1.5fr) auto; align-items: center; gap: 10px; color: #99582a; font-size: calc(11px * var(--frontend-font-scale)); }
.appearance-control input[type="color"] { width: 34px; height: 28px; padding: 2px; border: 1px solid rgba(67, 40, 24, 0.16); border-radius: 5px; background: var(--frontend-surface-raised); cursor: pointer; }
.appearance-control input[type="range"] { width: 100%; accent-color: var(--frontend-slider-thumb); }
.appearance-control output { min-width: 42px; color: var(--frontend-text-secondary); font-size: calc(10px * var(--frontend-font-scale)); text-align: right; }
.geometry-binding { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 3px 8px; padding: 7px 8px; border-left: 3px solid #99582a; background: #f3faf7; color: #99582a; font-size: calc(10px * var(--frontend-font-scale)); }
.geometry-binding strong { overflow: hidden; color: #14532d; text-overflow: ellipsis; white-space: nowrap; }
.geometry-binding small { grid-column: 2; color: #718096; }
.encoding-field-control { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 8px; color: #99582a; font-size: calc(11px * var(--frontend-font-scale)); }
.encoding-field-control select { min-width: 0; height: 30px; padding: 0 24px 0 7px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); color: #263548; font: inherit; }
.data-binding-apply { min-height: 30px; border: 1px solid rgba(67, 40, 24, 0.18); border-radius: 5px; background: #99582a; color: #fff; font: inherit; cursor: pointer; }
.data-binding-apply:disabled { cursor: not-allowed; opacity: 0.45; }
</style>
