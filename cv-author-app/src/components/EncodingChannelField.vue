<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { CSSProperties } from "vue";
import type { DataColumn } from "../types";
import type { EncodingChannelConfig } from "../utils/encodingConfig";
import { isEncodingColumnCompatible } from "../utils/encodingConfig";
import type { RoleSelectionMaterialization } from "../chart-blocks/bindings";

const props = defineProps<{
  config: EncodingChannelConfig;
  columns: DataColumn[];
  fatherColumns?: DataColumn[];
  value: string;
  values?: string[];
  multiple?: boolean;
  minFields?: number;
  maxFields?: number;
  materializations?: Array<"fold" | "repeat">;
  materialization?: RoleSelectionMaterialization;
  directAllowed?: boolean;
  derivedLabel?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  change: [field: string];
  fieldsChange: [fields: string[], materialization: RoleSelectionMaterialization];
}>();

const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLDivElement | null>(null);
const menuOpen = ref(false);
const menuStyle = ref<CSSProperties>({});
const fatherColumnNames = computed(() => new Set((props.fatherColumns ?? []).map((column) => column.name)));
const selectedFields = computed(() => props.multiple ? props.values ?? [] : props.value ? [props.value] : []);
const maximum = computed(() => props.maxFields ?? (props.multiple ? Number.POSITIVE_INFINITY : 1));
function isAvailable(column: DataColumn) {
  if (!isEncodingColumnCompatible(props.config, column.type)) return false;
  return !props.multiple
    || selectedFields.value.includes(column.name)
    || selectedFields.value.length < maximum.value;
}
const availableFatherColumns = computed(() => (props.fatherColumns ?? []).filter(isAvailable));
const availableLocalColumns = computed(() => props.columns
  .filter((column) => !fatherColumnNames.value.has(column.name))
  .filter(isAvailable));
const selectionLabel = computed(() => {
  if (props.derivedLabel) return props.derivedLabel;
  if (selectedFields.value.length === 0) return props.config.emptyLabel;
  if (selectedFields.value.length === 1) return selectedFields.value[0];
  return `${selectedFields.value.length} fields`;
});
const availableMaterializations = computed(() => props.materializations ?? []);

function resolvedMaterialization(fields: string[]): RoleSelectionMaterialization {
  if (fields.length <= 1 && props.directAllowed !== false) return "direct";
  if (props.materialization && availableMaterializations.value.includes(props.materialization as "fold" | "repeat")) {
    return props.materialization;
  }
  return availableMaterializations.value[0] ?? "direct";
}

function selectSingle(field: string) {
  emit("change", field);
  menuOpen.value = false;
}

function toggleMultiple(field: string) {
  const next = selectedFields.value.includes(field)
    ? selectedFields.value.filter((candidate) => candidate !== field)
    : [...selectedFields.value, field];
  if (next.length > maximum.value) return;
  emit("fieldsChange", next, resolvedMaterialization(next));
}

function clearSelection() {
  if (props.multiple) emit("fieldsChange", [], "direct");
  else selectSingle("");
}

function setMaterialization(materialization: "fold" | "repeat") {
  emit("fieldsChange", selectedFields.value, materialization);
}

async function toggleMenu() {
  if (props.disabled || !trigger.value) return;
  if (menuOpen.value) {
    menuOpen.value = false;
    return;
  }
  const rect = trigger.value.getBoundingClientRect();
  const width = Math.max(rect.width, 220);
  menuStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
    width: `${width}px`,
  };
  menuOpen.value = true;
  await nextTick();
  const height = menu.value?.getBoundingClientRect().height ?? 0;
  if (rect.bottom + 4 + height <= window.innerHeight - 8) return;
  menuStyle.value = {
    ...menuStyle.value,
    top: `${rect.top - 4 - height >= 8 ? rect.top - 4 - height : 8}px`,
  };
}
</script>

<template>
  <div class="encoding-channel-field" :class="{ 'is-disabled': disabled }">
    <span class="encoding-channel-field__label">
      <span>{{ config.label }}</span>
      <abbr v-if="config.required" title="Required" aria-label="Required">*</abbr>
    </span>
    <div class="encoding-channel-field__dropdown">
      <button
        ref="trigger"
        type="button"
        class="encoding-channel-field__trigger"
        :aria-label="`${config.label}: ${selectionLabel}`"
        aria-haspopup="listbox"
        :aria-expanded="menuOpen"
        :disabled="disabled"
        @click="toggleMenu"
      >
        <span :title="derivedLabel ?? selectedFields.join(', ')">{{ selectionLabel }}</span>
        <span aria-hidden="true">▾</span>
      </button>
    </div>
    <Teleport to="body">
      <div v-if="menuOpen" class="encoding-channel-field__backdrop" @pointerdown="menuOpen = false" />
      <div
        v-if="menuOpen"
        ref="menu"
        class="encoding-channel-field__menu"
        :style="menuStyle"
        role="listbox"
        :aria-label="`${config.label} fields`"
      >
        <div
          v-if="multiple && availableMaterializations.length > 1 && selectedFields.length > 1"
          class="encoding-channel-field__mode"
        >
          <span>Layout</span>
          <select
            :value="materialization"
            :aria-label="`${config.label} materialization`"
            @change="setMaterialization(($event.target as HTMLSelectElement).value as 'fold' | 'repeat')"
          >
            <option v-for="mode in availableMaterializations" :key="mode" :value="mode">
              {{ mode === 'fold' ? 'Fold to key/value' : 'Repeat fields' }}
            </option>
          </select>
        </div>
        <button
          type="button"
          class="encoding-channel-field__clear"
          :class="{ 'is-selected': selectedFields.length === 0 }"
          @click="clearSelection"
        >
          {{ config.emptyLabel }}
        </button>
        <label v-for="column in availableFatherColumns" :key="`father:${column.name}`">
          <input
            :type="multiple ? 'checkbox' : 'radio'"
            :checked="selectedFields.includes(column.name)"
            @change="multiple ? toggleMultiple(column.name) : selectSingle(column.name)"
          />
          <span>father: {{ column.name }}</span>
        </label>
        <label v-for="column in availableLocalColumns" :key="column.name">
          <input
            :type="multiple ? 'checkbox' : 'radio'"
            :checked="selectedFields.includes(column.name)"
            @change="multiple ? toggleMultiple(column.name) : selectSingle(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
        <p v-if="selectedFields.length > 0 && selectedFields.length < (minFields ?? 0)">
          Select at least {{ minFields }} fields.
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.encoding-channel-field {
  position: relative;
  display: grid;
  grid-template-columns: minmax(70px, 0.42fr) minmax(0, 1fr);
  align-items: center;
  gap: 7px;
}

.encoding-channel-field__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #99582a;
  font-size: calc(11px * var(--frontend-font-scale));
  font-weight: 700;
}

.encoding-channel-field__label abbr {
  color: #b42318;
  text-decoration: none;
}

.encoding-channel-field__dropdown {
  position: relative;
  min-width: 0;
}

.encoding-channel-field__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--frontend-control-border);
  border-radius: 6px;
  background: var(--frontend-surface-raised);
  color: #432818;
  font: inherit;
  font-size: calc(11px * var(--frontend-font-scale));
  cursor: pointer;
}

.encoding-channel-field__trigger > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-channel-field__trigger[aria-expanded="true"],
.encoding-channel-field__trigger:focus {
  border-color: var(--frontend-border-strong);
  outline: 2px solid rgba(153, 88, 42, 0.12);
}

.encoding-channel-field.is-disabled {
  pointer-events: none;
}

.encoding-channel-field.is-disabled .encoding-channel-field__trigger {
  background: var(--frontend-surface-canvas);
  color: #718096;
  cursor: not-allowed;
}

.encoding-channel-field__menu {
  position: fixed;
  z-index: 10001;
  display: grid;
  overflow: visible;
  padding: 6px;
  border: 1px solid var(--frontend-control-border);
  border-radius: 7px;
  background: var(--frontend-surface-raised);
  box-shadow: 0 8px 20px rgba(67, 40, 24, 0.16);
}

.encoding-channel-field__backdrop {
  position: fixed;
  z-index: 10000;
  inset: 0;
}

.encoding-channel-field__menu label,
.encoding-channel-field__clear {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #432818;
  font: inherit;
  font-size: calc(11px * var(--frontend-font-scale));
  text-align: left;
}

.encoding-channel-field__menu label:hover,
.encoding-channel-field__clear:hover { background: var(--frontend-surface-soft); }
.encoding-channel-field__clear { grid-template-columns: 1fr; width: 100%; cursor: pointer; }
.encoding-channel-field__clear.is-selected { font-weight: 700; }
.encoding-channel-field__menu p { margin: 5px 6px; color: #b42318; font-size: calc(10px * var(--frontend-font-scale)); }

.encoding-channel-field__mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  padding: 4px 6px 7px;
  border-bottom: 1px solid var(--frontend-border-subtle);
  color: #5b6878;
  font-size: calc(10px * var(--frontend-font-scale));
}

.encoding-channel-field__mode select {
  min-width: 0;
  border: 1px solid var(--frontend-control-border);
  border-radius: 4px;
  background: var(--frontend-surface-raised);
  color: #432818;
  font: inherit;
}
</style>
