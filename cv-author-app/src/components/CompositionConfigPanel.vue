<script setup lang="ts">
import { computed } from "vue";
import { X } from "@lucide/vue";
import type { CompositionSpec, DataColumn } from "../types";

const props = defineProps<{
  compositionSpec: CompositionSpec;
  columns: DataColumn[];
}>();

const emit = defineEmits<{
  close: [];
  change: [patch: {
    facetField?: string;
    facetDirection?: "row" | "column";
    facetRowGap?: number;
    facetColumnGap?: number;
    facetCoordinateSystem?: "Cartesian" | "Polar";
    facetThetaField?: string;
    facetRadiusField?: string;
    facetGrid?: CompositionSpec["facetGrid"];
  }];
}>();

const facetColumns = computed(() => props.columns.filter((column) =>
  column.type === "nominal" || column.type === "ordinal" || column.type === "temporal",
));
const facetCoordinateSystem = computed(() => props.compositionSpec.facetCoordinateSystem ?? "Cartesian");
const facetColumnField = computed(() => props.compositionSpec.facetGrid?.columnField
  ?? (props.compositionSpec.facetDirection === "column" ? props.compositionSpec.facetField : "")
  ?? "");
const facetRowField = computed(() => props.compositionSpec.facetGrid?.rowField
  ?? (props.compositionSpec.facetDirection === "row" ? props.compositionSpec.facetField : "")
  ?? "");
const facetThetaField = computed(() => props.compositionSpec.facetThetaField ?? facetColumnField.value);
const facetRadiusField = computed(() => props.compositionSpec.facetRadiusField ?? facetRowField.value);
const facetRowGap = computed(() => props.compositionSpec.facetRowGap ?? 4);
const facetColumnGap = computed(() => props.compositionSpec.facetColumnGap ?? 4);

function setFacetCoordinateSystem(value: "Cartesian" | "Polar") {
  emit("change", {
    facetCoordinateSystem: value,
    facetThetaField: facetColumnField.value,
    facetRadiusField: facetRowField.value,
  });
}

function updateFacetField(direction: "row" | "column", field: string) {
  const grid = props.compositionSpec.facetGrid;
  if (grid) {
    emit("change", {
      facetGrid: {
        ...grid,
        ...(direction === "row" ? { rowField: field } : { columnField: field }),
      },
    });
    return;
  }
  emit("change", { facetField: field, facetDirection: direction });
}

function updatePolarField(channel: "theta" | "radius", field: string) {
  emit("change", channel === "theta"
    ? { facetCoordinateSystem: "Polar", facetThetaField: field }
    : { facetCoordinateSystem: "Polar", facetRadiusField: field });
}

function numericValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="composition-config">
    <header class="composition-config__header">
      <div>
        <strong>{{ compositionSpec.type }}</strong>
        <span>Composition</span>
      </div>
      <button type="button" title="Close" aria-label="Close composition configuration" @click="emit('close')">
        <X :size="16" :stroke-width="1.7" aria-hidden="true" />
      </button>
    </header>

    <div class="composition-config__body">
      <template v-if="compositionSpec.type === 'facet'">
        <section class="composition-config__section">
          <header>
            <strong>Layout</strong>
            <span>{{ compositionSpec.members.length }} views</span>
          </header>
          <div class="composition-config__segments" role="group" aria-label="Facet coordinate system">
            <button
              type="button"
              :class="{ 'is-active': facetCoordinateSystem === 'Cartesian' }"
              :aria-pressed="facetCoordinateSystem === 'Cartesian'"
              @click="setFacetCoordinateSystem('Cartesian')"
            >Cartesian</button>
            <button
              type="button"
              :class="{ 'is-active': facetCoordinateSystem === 'Polar' }"
              :aria-pressed="facetCoordinateSystem === 'Polar'"
              @click="setFacetCoordinateSystem('Polar')"
            >Polar</button>
          </div>
        </section>

        <section v-if="facetCoordinateSystem === 'Cartesian'" class="composition-config__section">
          <header><strong>Facet fields</strong></header>
          <label class="composition-config__field">
            <span>Column</span>
            <select :value="facetColumnField" @change="updateFacetField('column', ($event.target as HTMLSelectElement).value)">
              <option value="">Not bound</option>
              <option v-for="column in facetColumns" :key="`column-${column.name}`" :value="column.name">{{ column.name }}</option>
            </select>
          </label>
          <label class="composition-config__field">
            <span>Row</span>
            <select :value="facetRowField" @change="updateFacetField('row', ($event.target as HTMLSelectElement).value)">
              <option value="">Not bound</option>
              <option v-for="column in facetColumns" :key="`row-${column.name}`" :value="column.name">{{ column.name }}</option>
            </select>
          </label>
        </section>

        <section v-else class="composition-config__section">
          <header><strong>Facet fields</strong></header>
          <label class="composition-config__field">
            <span>Theta</span>
            <select :value="facetThetaField" @change="updatePolarField('theta', ($event.target as HTMLSelectElement).value)">
              <option value="">Not bound</option>
              <option v-for="column in facetColumns" :key="`theta-${column.name}`" :value="column.name">{{ column.name }}</option>
            </select>
          </label>
          <label class="composition-config__field">
            <span>Radius</span>
            <select :value="facetRadiusField" @change="updatePolarField('radius', ($event.target as HTMLSelectElement).value)">
              <option value="">Not bound</option>
              <option v-for="column in facetColumns" :key="`radius-${column.name}`" :value="column.name">{{ column.name }}</option>
            </select>
          </label>
        </section>

        <section v-if="facetCoordinateSystem === 'Cartesian'" class="composition-config__section">
          <header><strong>Spacing</strong></header>
          <label class="composition-config__slider">
            <span>Column gap</span>
            <input type="range" min="0" max="200" step="1" :value="facetColumnGap" @change="emit('change', { facetColumnGap: numericValue($event) })" />
            <output>{{ facetColumnGap }} px</output>
          </label>
          <label class="composition-config__slider">
            <span>Row gap</span>
            <input type="range" min="0" max="200" step="1" :value="facetRowGap" @change="emit('change', { facetRowGap: numericValue($event) })" />
            <output>{{ facetRowGap }} px</output>
          </label>
        </section>
      </template>

      <section v-else class="composition-config__section">
        <header>
          <strong>{{ compositionSpec.type === 'concat' ? 'Arrangement' : 'Structure' }}</strong>
          <span>{{ compositionSpec.members.length }} views</span>
        </header>
        <dl class="composition-config__summary">
          <div v-if="compositionSpec.direction">
            <dt>Direction</dt>
            <dd>{{ compositionSpec.direction }}</dd>
          </div>
          <div>
            <dt>Shared channels</dt>
            <dd>{{ compositionSpec.sharedChannels.join(', ') || 'None' }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.composition-config { width: min(330px, calc(100vw - 32px)); background: var(--frontend-component-composition); color: #432818; }
.composition-config__header { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-bottom: 1px solid rgba(67, 40, 24, 0.12); }
.composition-config__header > div { display: flex; min-width: 0; align-items: baseline; gap: 7px; }
.composition-config__header strong { font-size: calc(12px * var(--frontend-font-scale)); text-transform: capitalize; }
.composition-config__header span { color: #718096; font-size: calc(10px * var(--frontend-font-scale)); }
.composition-config__header button { display: inline-grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 5px; background: transparent; color: #99582a; cursor: pointer; }
.composition-config__header button:hover { background: #edf1f5; color: #432818; }
.composition-config__body { display: grid; gap: 12px; max-height: min(620px, calc(100vh - 180px)); padding: 12px; overflow: auto; }
.composition-config__section { display: grid; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid rgba(67, 40, 24, 0.1); }
.composition-config__section:last-child { padding-bottom: 0; border-bottom: 0; }
.composition-config__section > header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.composition-config__section > header strong { font-size: calc(11px * var(--frontend-font-scale)); }
.composition-config__section > header span { color: #718096; font-size: calc(9px * var(--frontend-font-scale)); }
.composition-config__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.composition-config__segments button { min-height: 30px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; font-size: calc(10px * var(--frontend-font-scale)); cursor: pointer; }
.composition-config__segments button.is-active { background: var(--frontend-surface-raised); color: #432818; box-shadow: 0 1px 2px rgba(67, 40, 24, 0.14); font-weight: 700; }
.composition-config__field { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: 8px; color: #99582a; font-size: calc(10px * var(--frontend-font-scale)); }
.composition-config__field select { width: 100%; min-width: 0; height: 30px; padding: 0 7px; border: 1px solid rgba(67, 40, 24, 0.14); border-radius: 5px; background: var(--frontend-surface-raised); color: #432818; font: inherit; font-size: calc(10px * var(--frontend-font-scale)); }
.composition-config__slider { display: grid; grid-template-columns: 72px minmax(0, 1fr) 48px; align-items: center; gap: 7px; color: #99582a; font-size: calc(10px * var(--frontend-font-scale)); }
.composition-config__slider input { width: 100%; min-width: 0; accent-color: var(--frontend-slider-thumb); }
.composition-config__slider output { color: #294a6d; font-variant-numeric: tabular-nums; text-align: right; }
.composition-config__summary { display: grid; gap: 7px; margin: 0; }
.composition-config__summary div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px; font-size: calc(10px * var(--frontend-font-scale)); }
.composition-config__summary dt { color: #718096; }
.composition-config__summary dd { margin: 0; overflow-wrap: anywhere; }
</style>
