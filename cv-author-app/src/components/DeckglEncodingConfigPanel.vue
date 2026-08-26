<script setup lang="ts">
import { Moon, Sun, X } from "@lucide/vue";
import {
  deckglDarkMapStyleUrl,
  deckglLightMapStyleUrl,
} from "../utils/geographicLayerCards";

defineProps<{
  layerName: string;
  mapStyleUrl: string;
}>();

const emit = defineEmits<{
  close: [];
  mapStyleChange: [mapStyleUrl: string];
}>();
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
</style>
