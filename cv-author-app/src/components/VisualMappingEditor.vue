<script setup lang="ts">
import { computed } from "vue";
import { Plus, Trash2 } from "@lucide/vue";
import type {
  LinearColorMapping,
  LinearColorStop,
  LinearSizeMapping,
  LinearSizeStop,
} from "../types";
import {
  defaultColorMapping,
  defaultSizeMapping,
  interpolateLinearColor,
  interpolateLinearSize,
} from "../utils/visualMapping";

const props = withDefaults(defineProps<{
  showColor?: boolean;
  showSize?: boolean;
  colorMapping?: LinearColorMapping;
  sizeMapping?: LinearSizeMapping;
}>(), {
  showColor: false,
  showSize: false,
  colorMapping: () => defaultColorMapping,
  sizeMapping: () => defaultSizeMapping,
});

const emit = defineEmits<{
  colorChange: [mapping: LinearColorMapping];
  sizeChange: [mapping: LinearSizeMapping];
}>();

const colorStops = computed(() => [...props.colorMapping.stops].sort((a, b) => a.offset - b.offset));
const sizeStops = computed(() => [...props.sizeMapping.stops].sort((a, b) => a.offset - b.offset));
const colorGradient = computed(() => `linear-gradient(90deg, ${colorStops.value
  .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
  .join(", ")})`);

function boundedOffset(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number / 100)) : 0;
}

function updateColorStop(index: number, changes: Partial<LinearColorStop>) {
  const stops = colorStops.value.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...changes } : stop);
  emit("colorChange", { type: "linear", stops });
}

function updateSizeStop(index: number, changes: Partial<LinearSizeStop>) {
  const stops = sizeStops.value.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...changes } : stop);
  emit("sizeChange", { type: "linear", stops });
}

function largestGap<T extends { offset: number }>(stops: T[]) {
  let insertion = { index: 1, offset: 0.5 };
  for (let index = 1; index < stops.length; index += 1) {
    const offset = (stops[index - 1]!.offset + stops[index]!.offset) / 2;
    if (stops[index]!.offset - stops[index - 1]!.offset > (stops[insertion.index]?.offset ?? 1) - (stops[insertion.index - 1]?.offset ?? 0)) {
      insertion = { index, offset };
    }
  }
  return insertion;
}

function addColorStop() {
  const insertion = largestGap(colorStops.value);
  const stops = [...colorStops.value];
  stops.splice(insertion.index, 0, {
    offset: insertion.offset,
    color: interpolateLinearColor(props.colorMapping, insertion.offset),
  });
  emit("colorChange", { type: "linear", stops });
}

function addSizeStop() {
  const insertion = largestGap(sizeStops.value);
  const stops = [...sizeStops.value];
  stops.splice(insertion.index, 0, {
    offset: insertion.offset,
    size: Math.round(interpolateLinearSize(props.sizeMapping, insertion.offset) * 10) / 10,
  });
  emit("sizeChange", { type: "linear", stops });
}

function removeColorStop(index: number) {
  if (colorStops.value.length <= 2) return;
  emit("colorChange", { type: "linear", stops: colorStops.value.filter((_, stopIndex) => stopIndex !== index) });
}

function removeSizeStop(index: number) {
  if (sizeStops.value.length <= 2) return;
  emit("sizeChange", { type: "linear", stops: sizeStops.value.filter((_, stopIndex) => stopIndex !== index) });
}
</script>

<template>
  <div v-if="showColor || showSize" class="visual-mapping-editor">
    <section v-if="showColor" class="mapping-section" aria-label="Color linear mapping">
      <header>
        <strong>Color scale</strong>
        <button type="button" title="Add color stop" aria-label="Add color stop" @click="addColorStop">
          <Plus :size="14" aria-hidden="true" />
        </button>
      </header>
      <div class="color-gradient" :style="{ background: colorGradient }" aria-hidden="true"></div>
      <div v-for="(stop, index) in colorStops" :key="`color-${index}`" class="stop-row">
        <input
          class="color-input"
          type="color"
          :value="stop.color"
          :aria-label="`Color stop ${index + 1}`"
          @input="updateColorStop(index, { color: ($event.target as HTMLInputElement).value })"
        />
        <label>
          <input
            class="offset-input"
            type="number"
            min="0"
            max="100"
            step="1"
            :value="Math.round(stop.offset * 100)"
            :aria-label="`Color stop ${index + 1} position`"
            @change="updateColorStop(index, { offset: boundedOffset(($event.target as HTMLInputElement).value) })"
          />
          <span>%</span>
        </label>
        <button
          type="button"
          title="Remove color stop"
          aria-label="Remove color stop"
          :disabled="colorStops.length <= 2"
          @click="removeColorStop(index)"
        >
          <Trash2 :size="13" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section v-if="showSize" class="mapping-section" aria-label="Size linear mapping">
      <header>
        <strong>Size scale</strong>
        <button type="button" title="Add size stop" aria-label="Add size stop" @click="addSizeStop">
          <Plus :size="14" aria-hidden="true" />
        </button>
      </header>
      <div v-for="(stop, index) in sizeStops" :key="`size-${index}`" class="size-stop-row">
        <label class="size-position">
          <input
            class="offset-input"
            type="number"
            min="0"
            max="100"
            step="1"
            :value="Math.round(stop.offset * 100)"
            :aria-label="`Size stop ${index + 1} position`"
            @change="updateSizeStop(index, { offset: boundedOffset(($event.target as HTMLInputElement).value) })"
          />
          <span>%</span>
        </label>
        <input
          type="range"
          min="1"
          max="48"
          step="0.5"
          :value="stop.size"
          :aria-label="`Size stop ${index + 1} in pixels`"
          @input="updateSizeStop(index, { size: Number(($event.target as HTMLInputElement).value) })"
        />
        <output>{{ Number(stop.size.toFixed(1)) }} px</output>
        <button
          type="button"
          title="Remove size stop"
          aria-label="Remove size stop"
          :disabled="sizeStops.length <= 2"
          @click="removeSizeStop(index)"
        >
          <Trash2 :size="13" aria-hidden="true" />
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.visual-mapping-editor {
  display: grid;
  gap: 14px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid #e6ebf0;
}

.mapping-section {
  display: grid;
  gap: 8px;
}

.mapping-section header,
.stop-row,
.size-stop-row {
  display: flex;
  align-items: center;
}

.mapping-section header {
  justify-content: space-between;
}

.mapping-section strong {
  font-size: 11px;
  font-weight: 650;
  color: #263241;
}

button {
  display: inline-grid;
  width: 26px;
  height: 26px;
  padding: 0;
  place-items: center;
  border: 1px solid #dce3ea;
  border-radius: 5px;
  background: #fff;
  color: #536273;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: #9ab4ca;
  color: #176ea6;
}

button:disabled {
  opacity: 0.35;
  cursor: default;
}

.color-gradient {
  height: 14px;
  border: 1px solid rgba(31, 41, 55, 0.16);
  border-radius: 3px;
}

.stop-row {
  gap: 7px;
}

.stop-row label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #687585;
}

.color-input {
  width: 32px;
  height: 26px;
  padding: 2px;
  border: 1px solid #dce3ea;
  border-radius: 4px;
  background: #fff;
}

.offset-input {
  width: 58px;
  height: 26px;
  padding: 3px 6px;
  border: 1px solid #dce3ea;
  border-radius: 4px;
  font: inherit;
}

.size-stop-row {
  display: grid;
  grid-template-columns: 68px minmax(72px, 1fr) 46px 26px;
  gap: 7px;
  min-height: 28px;
}

.size-stop-row input[type="range"] {
  width: 100%;
  accent-color: #1980bd;
}

.size-position,
.size-stop-row output {
  font-size: 10px;
  color: #687585;
}

.size-position {
  display: flex;
  align-items: center;
  gap: 3px;
}

.size-position .offset-input {
  width: 48px;
}

.size-stop-row output {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
