<script setup lang="ts">
import { computed } from "vue";
import { Moon, Sun, X } from "@lucide/vue";
import {
  deckglDarkMapStyleUrl,
  deckglLightMapStyleUrl,
} from "../utils/geographicLayerCards";
import type {
  DataColumn,
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
}>();

const emit = defineEmits<{
  close: [];
  mapStyleChange: [mapStyleUrl: string];
  configChange: [patch: GeographicLayerConfig];
  encodingChange: [channel: "color" | "size", field: string];
}>();

const pointSize = computed(() => typeof props.config.size === "number" ? props.config.size : 8);
const pointColor = computed(() => typeof props.config.color === "string" ? props.config.color : "#2563eb");
const quantitativeColumns = computed(() => props.columns.filter((column) => column.type === "quantitative"));
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

    <section v-if="layerFamily === 'point' || layerFamily === 'area'" class="encoding-config__column" aria-label="Geographic mark appearance">
      <div class="encoding-config__column-heading">
        <strong>{{ layerFamily === "point" ? "Circle" : "Area" }}</strong>
        <span>{{ layerFamily === "point" ? "Point mark" : "Region planning" }}</span>
      </div>
      <div v-if="binding" class="geometry-binding">
        <span>ID</span>
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
      <label class="appearance-control">
        <span>{{ binding?.colorField ? "High color" : layerFamily === "point" ? "Color" : "Area color" }}</span>
        <input
          type="color"
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
.encoding-config__header strong { color: #18212f; font-size: 12px; letter-spacing: 0.08em; }
.encoding-config__header span { overflow: hidden; color: #6b7889; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__header button { display: inline-grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #5b6a80; cursor: pointer; }
.encoding-config__header button:hover { background: #edf5fc; color: #1554b2; }
.encoding-config__column { display: grid; min-width: 0; align-content: start; gap: 12px; padding: 10px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 6px; background: #fbfcfe; }
.encoding-config__column-heading { display: grid; gap: 2px; padding-bottom: 4px; border-bottom: 1px solid rgba(24, 33, 47, 0.09); }
.encoding-config__column-heading strong { color: #263548; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
.encoding-config__column-heading span { color: #718096; font-size: 10px; line-height: 1.35; }
.map-style-control { display: grid; gap: 8px; color: #516176; font-size: 11px; }
.map-style-control__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.map-style-control__segments button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.map-style-control__segments button.is-active { background: #fff; color: #1554b2; box-shadow: 0 1px 2px rgba(24, 33, 47, 0.14); font-weight: 700; }
.appearance-control { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 1.5fr) auto; align-items: center; gap: 10px; color: #516176; font-size: 11px; }
.appearance-control input[type="color"] { width: 34px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.16); border-radius: 5px; background: #fff; cursor: pointer; }
.appearance-control input[type="range"] { width: 100%; accent-color: #1554b2; }
.appearance-control output { min-width: 42px; color: #294a6d; font-size: 10px; text-align: right; }
.geometry-binding { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 3px 8px; padding: 7px 8px; border-left: 3px solid #059669; background: #f3faf7; color: #516176; font-size: 10px; }
.geometry-binding strong { overflow: hidden; color: #14532d; text-overflow: ellipsis; white-space: nowrap; }
.geometry-binding small { grid-column: 2; color: #718096; }
.encoding-field-control { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 8px; color: #516176; font-size: 11px; }
.encoding-field-control select { min-width: 0; height: 30px; padding: 0 24px 0 7px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #263548; font: inherit; }
</style>
