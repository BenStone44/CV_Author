<script setup lang="ts">
import { computed, ref } from "vue";
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
  colorDomain?: [number, number] | null;
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
const openSizeStop = ref<number | null>(null);
const colorGradient = computed(() => `linear-gradient(90deg, ${colorStops.value
  .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
  .join(", ")})`);
function boundedOffset(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number / 100)) : 0;
}

function updateColorStopOffset(index: number, rawValue: string) {
  const offset = boundedOffset(rawValue);
  const stops = colorStops.value.map((stop, stopIndex) => stopIndex === index ? { ...stop, offset } : stop);
  emit("colorChange", { ...props.colorMapping, type: "linear", stops });
}

function updateColorStop(index: number, changes: Partial<LinearColorStop>) {
  const stops = colorStops.value.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...changes } : stop);
  emit("colorChange", { ...props.colorMapping, type: "linear", stops });
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
  emit("colorChange", { ...props.colorMapping, type: "linear", stops });
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
  emit("colorChange", { ...props.colorMapping, type: "linear", stops: colorStops.value.filter((_, stopIndex) => stopIndex !== index) });
}

function removeSizeStop(index: number) {
  if (sizeStops.value.length <= 2) return;
  emit("sizeChange", { type: "linear", stops: sizeStops.value.filter((_, stopIndex) => stopIndex !== index) });
}

function toggleSizeStop(index: number) {
  openSizeStop.value = openSizeStop.value === index ? null : index;
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
      <div class="color-stop-heading" aria-hidden="true">
        <span>Percent</span>
        <span>Color</span>
      </div>
      <div v-for="(stop, index) in colorStops" :key="`color-${index}`" class="stop-row">
        <label>
          <input
            class="offset-input"
            type="number"
            min="0"
            max="100"
            step="1"
            :value="Math.round(stop.offset * 100)"
            :aria-label="`Color stop ${index + 1} position`"
            @change="updateColorStopOffset(index, ($event.target as HTMLInputElement).value)"
          />
          <span>%</span>
        </label>
        <input
          class="color-input"
          type="color"
          list="frontend-color-palette"
          :value="stop.color"
          :aria-label="`Color stop ${index + 1}`"
          @input="updateColorStop(index, { color: ($event.target as HTMLInputElement).value })"
        />
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
        <output>{{ Number(stop.size.toFixed(1)) }} px</output>
        <button
          type="button"
          class="slider-dot"
          :aria-expanded="openSizeStop === index"
          :aria-label="`Edit size stop ${index + 1}`"
          @click="toggleSizeStop(index)"
        ><span /></button>
        <div v-if="openSizeStop === index" class="size-slider-popover">
          <input
            type="range"
            min="1"
            max="48"
            step="0.5"
            :value="stop.size"
            :aria-label="`Size stop ${index + 1} in pixels`"
            @input="updateSizeStop(index, { size: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
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
  font-size: var(--encoding-config-font-size, 11px);
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
  color: #99582a;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px 26px;
  gap: 7px;
}

.stop-row label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 3px;
  font-size: var(--encoding-config-font-size, 11px);
  color: #99582a;
}

.color-input {
  box-sizing: border-box;
  width: 100%;
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

.value-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 3px 6px;
  border: 1px solid #dce3ea;
  border-radius: 4px;
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.color-stop-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px 26px;
  gap: 7px;
  color: #99582a;
  font-size: var(--encoding-config-font-size, 11px);
}

.size-stop-row {
  position: relative;
  display: grid;
  grid-template-columns: 68px 46px 22px 26px;
  gap: 7px;
  min-height: 28px;
}

.slider-dot { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; place-items: center; }
.slider-dot span { width: 10px; height: 10px; border: 2px solid #432818; border-radius: 50%; background: #fff; }
.slider-dot:hover span, .slider-dot[aria-expanded="true"] span { background: #432818; }
.size-slider-popover { position: absolute; right: 26px; bottom: calc(100% + 5px); z-index: 3; display: flex; width: 150px; height: 34px; align-items: center; padding: 6px 9px; border: 1px solid rgba(67, 40, 24, 0.16); border-radius: 6px; background: #fff; box-shadow: 0 8px 20px rgba(67, 40, 24, 0.16); }
.size-slider-popover input { width: 100%; accent-color: #bb9457; }

.size-position,
.size-stop-row output {
  font-size: var(--encoding-config-font-size, 11px);
  color: #99582a;
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
