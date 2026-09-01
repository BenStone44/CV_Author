<script setup lang="ts">
import { computed } from "vue";
import type { DataColumn } from "../types";
import type { EncodingChannelConfig } from "../utils/encodingConfig";
import { isEncodingColumnCompatible } from "../utils/encodingConfig";

const props = defineProps<{
  config: EncodingChannelConfig;
  columns: DataColumn[];
  fatherColumns?: DataColumn[];
  value: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  change: [field: string];
}>();

const fatherColumnNames = computed(() => new Set((props.fatherColumns ?? []).map((column) => column.name)));
const localColumns = computed(() => props.columns.filter((column) => !fatherColumnNames.value.has(column.name)));
</script>

<template>
  <label class="encoding-channel-field">
    <span class="encoding-channel-field__label">
      <span>{{ config.label }}</span>
      <abbr v-if="config.required" title="Required" aria-label="Required">*</abbr>
    </span>
    <select :value="value" :disabled="disabled" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="">{{ config.emptyLabel }}</option>
      <option
        v-for="column in fatherColumns ?? []"
        :key="`father:${column.name}`"
        :value="column.name"
        :disabled="!isEncodingColumnCompatible(config, column.type)"
      >
        father: {{ column.name }}
      </option>
      <option
        v-for="column in localColumns"
        :key="column.name"
        :value="column.name"
        :disabled="!isEncodingColumnCompatible(config, column.type)"
      >
        {{ column.name }} ({{ column.type }})
      </option>
    </select>
  </label>
</template>

<style scoped>
.encoding-channel-field {
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

select {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 1px solid rgba(67, 40, 24, 0.14);
  border-radius: 6px;
  background: var(--frontend-surface-raised);
  color: #432818;
  font: inherit;
  font-size: calc(11px * var(--frontend-font-scale));
  cursor: pointer;
}

select:focus {
  border-color: rgba(153, 88, 42, 0.7);
  outline: 2px solid rgba(153, 88, 42, 0.12);
}

select:disabled {
  background: #f1f3f5;
  color: #97a1ae;
  cursor: not-allowed;
}

option:disabled {
  color: #a0a9b5;
}
</style>
