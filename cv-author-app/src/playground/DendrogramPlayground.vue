<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CartesianCoordinateGuide, ChartSpec } from "../types";
import {
  createDefaultChartSpec,
  defaultTreeDataset,
} from "../utils/defaultChartData";
import { prepareChartData } from "../utils/chartDataPipeline";
import { renderDeterministicChart } from "../utils/semanticRenderer";

const width = 960;
const height = 620;
const nodeSize = ref(2.5);
const renderCount = ref(1);

watch(nodeSize, () => {
  renderCount.value += 1;
});

const svgMarkup = computed(() => {
  const baseSpec = createDefaultChartSpec("Dendrogram");
  if (!baseSpec) return "";

  const chartSpec: ChartSpec = {
    ...baseSpec,
    markGroups: [{
      id: "playground:dendrogram:node",
      chartId: "playground:dendrogram",
      role: "node",
      memberKeys: [],
      sharedConfig: {
        size: nodeSize.value,
        nodeLabelsVisible: true,
        treeDirection: "right",
      },
    }],
  };
  const prepared = prepareChartData("playground:dendrogram", defaultTreeDataset, chartSpec);
  const coordinateGuide: CartesianCoordinateGuide = {
    type: "Cartesian",
    origin: { x: 0, y: height },
    xDirection: 1,
    yDirection: -1,
    showAllAxes: false,
  };
  const result = renderDeterministicChart({
    chartId: "playground:dendrogram",
    width,
    height,
    minX: 0,
    minY: 0,
    coordinateGuide,
    chartSpec: prepared.chartSpec,
    dataset: prepared.dataset,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Dendrogram render">${result.content}</svg>`;
});

</script>

<template>
  <main class="playground">
    <header class="playground__header">
      <div>
        <p class="playground__eyebrow">Template playground</p>
        <h1>Dendrogram</h1>
        <p class="playground__meta">Default tree data / render {{ renderCount }} / applied size {{ nodeSize.toFixed(1) }} px</p>
      </div>
      <div class="playground__controls" aria-label="Dendrogram controls">
        <label for="node-size">Node size</label>
        <output for="node-size">{{ nodeSize.toFixed(1) }} px</output>
        <input
          id="node-size"
          v-model.number="nodeSize"
          type="range"
          min="1"
          max="48"
          step="0.5"
        />
      </div>
    </header>
    <section class="playground__canvas" aria-label="Rendered dendrogram">
      <div class="playground__svg" v-html="svgMarkup" />
    </section>
  </main>
</template>
