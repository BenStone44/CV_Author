<script setup lang="ts">
import type { DataColumn } from "./types";
import type { EncodingChannelConfig } from "./encodingConfig";
import { isEncodingColumnCompatible } from "./encodingConfig";

defineProps<{
  config: EncodingChannelConfig;
  columns: DataColumn[];
  value: string;
}>();

const emit = defineEmits<{
  change: [field: string];
}>();
</script>

<template>
  <label class="encoding-channel-field">
    <span class="encoding-channel-field__label">
      <span>{{ config.label }}</span>
      <abbr v-if="config.required" title="Required" aria-label="Required">*</abbr>
    </span>
    <select :value="value" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="">{{ config.emptyLabel }}</option>
      <option
        v-for="column in columns"
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
  gap: 5px;
}

.encoding-channel-field__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #516176;
  font-size: 11px;
}

.encoding-channel-field__label abbr {
  color: #b42318;
  text-decoration: none;
}

select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

select:focus {
  border-color: rgba(28, 126, 214, 0.7);
  outline: 2px solid rgba(28, 126, 214, 0.12);
}

option:disabled {
  color: #a0a9b5;
}
</style>
