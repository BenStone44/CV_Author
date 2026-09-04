<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { frontendPalette } from "../config/global";
import {
  deckglLightMapStyleUrl,
  geographicLayerTypes,
} from "../utils/geographicLayerCards";
import DeckglMapLayer from "./DeckglMapLayer.vue";

const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 180;
const CAPTURE_SETTLE_TIME_MS = 6500;

const requestedLayerType = new URLSearchParams(window.location.search).get("deckgl-thumbnail");
const supportedLayerTypes = new Set<string>(geographicLayerTypes);
const layerType = requestedLayerType && supportedLayerTypes.has(requestedLayerType)
  ? requestedLayerType
  : "ScatterplotLayer";
const captureViewStates = {
  HexagonLayer: { longitude: -1.4157, latitude: 52.2324, zoom: 8, pitch: 40.5, bearing: -27 },
  IconLayer: { longitude: 0, latitude: 0, zoom: 6, pitch: 0, bearing: 0 },
  PointCloudLayer: { longitude: 0, latitude: 0, zoom: 7, pitch: 45, bearing: -45 },
  TerrainLayer: { longitude: -122.44, latitude: 37.73, zoom: 10.5, pitch: 45, bearing: 0 },
  SimpleMeshLayer: { longitude: 0, latitude: 0, zoom: 8, pitch: 40, bearing: -30 },
} as const;
const mapViewState = captureViewStates[layerType as keyof typeof captureViewStates];
const captureReady = ref(false);
let settleTimer: number | null = null;

onMounted(() => {
  // Mapbox tiles and the deck.gl examples load independently. Give both
  // renderers one bounded settling window before Playwright captures the card.
  settleTimer = window.setTimeout(() => {
    captureReady.value = true;
  }, CAPTURE_SETTLE_TIME_MS);
});

onBeforeUnmount(() => {
  if (settleTimer !== null) window.clearTimeout(settleTimer);
});
</script>

<template>
  <main
    class="deckgl-thumbnail-capture"
    :data-capture-ready="captureReady"
    :data-layer-type="layerType"
  >
    <DeckglMapLayer
      :layer-type="layerType"
      :config="{ size: 8, color: frontendPalette.control.accentStrong }"
      :dataset-rows="[]"
      :geometry-features="[]"
      :map-style-url="deckglLightMapStyleUrl"
      :map-view-state="mapViewState"
      :width="CAPTURE_WIDTH"
      :height="CAPTURE_HEIGHT"
      thumbnail-capture
    />
  </main>
</template>

<style scoped>
.deckgl-thumbnail-capture {
  width: 320px;
  height: 180px;
  overflow: hidden;
  background: var(--frontend-surface-canvas);
}

.deckgl-thumbnail-capture :deep(.deckgl-map-shell) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.deckgl-thumbnail-capture :deep(.mapboxgl-ctrl-top-right),
.deckgl-thumbnail-capture :deep(.mapboxgl-ctrl-bottom-left),
.deckgl-thumbnail-capture :deep(.mapboxgl-ctrl-bottom-right) {
  display: none;
}

:global(#vue-devtools-anchor),
:global(.vue-devtools__anchor),
:global(.vue-devtools__anchor-btn),
:global(.vue-devtools__panel),
:global(.vue-devtools-frame) {
  display: none !important;
}
</style>
