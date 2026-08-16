<script setup lang="ts">
import { computed } from "vue";
import type { EncodingChannelConfig } from "./encodingConfig";
import type { CubeResult } from "./cubeModel";

const measuresSourceId = "__measures__";

const props = defineProps<{
  config: EncodingChannelConfig;
  cubeResult: CubeResult;
  sourceId: string;
  memberIds: string[];
  multipleMeasures?: boolean;
}>();

const emit = defineEmits<{
  sourceChange: [sourceId: string, memberIds: string[]];
  membersChange: [memberIds: string[]];
}>();

const sources = computed(() => [
  ...props.cubeResult.schema.dimensions.map((dimension) => ({
    id: dimension.id,
    label: dimension.label,
    type: dimension.type === "ordinal" ? "nominal" as const : dimension.type,
    members: dimension.members.map((member) => ({ id: member.id, label: member.label })),
    multiple: true,
  })),
  {
    id: measuresSourceId,
    label: "Measures",
    type: "quantitative" as const,
    members: props.cubeResult.schema.measures.map((measure) => ({ id: measure.id, label: measure.label })),
    multiple: !!props.multipleMeasures,
  },
]);

const selectedSource = computed(() => sources.value.find((source) => source.id === props.sourceId));
const selectedMembers = computed(() => new Set(props.memberIds));

function selectSource(event: Event) {
  const sourceId = (event.target as HTMLSelectElement).value;
  const source = sources.value.find((item) => item.id === sourceId);
  if (!source) {
    emit("sourceChange", "", []);
    return;
  }
  const memberIds = source.multiple
    ? source.members.map((member) => member.id)
    : source.members[0] ? [source.members[0].id] : [];
  emit("sourceChange", source.id, memberIds);
}

function toggleMember(memberId: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (!selectedSource.value?.multiple) {
    emit("membersChange", checked ? [memberId] : []);
    return;
  }
  emit("membersChange", checked
    ? Array.from(new Set([...props.memberIds, memberId]))
    : props.memberIds.filter((id) => id !== memberId));
}
</script>

<template>
  <section class="cube-encoding-field">
    <label class="cube-encoding-field__source">
      <span class="cube-encoding-field__label">
        <span>{{ config.label }}</span>
        <abbr v-if="config.required" title="Required" aria-label="Required">*</abbr>
      </span>
      <select :value="sourceId" @change="selectSource">
        <option value="">{{ config.emptyLabel }}</option>
        <option
          v-for="source in sources"
          :key="source.id"
          :value="source.id"
          :disabled="!config.accepts.includes(source.type)"
        >
          {{ source.label }} ({{ source.type }})
        </option>
      </select>
    </label>

    <div
      v-if="selectedSource"
      class="cube-encoding-field__members"
      :aria-label="`${selectedSource.label} members`"
    >
      <label v-for="member in selectedSource.members" :key="member.id">
        <input
          type="checkbox"
          :checked="selectedMembers.has(member.id)"
          @change="toggleMember(member.id, $event)"
        />
        <span :title="member.label">{{ member.label }}</span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.cube-encoding-field {
  display: grid;
  gap: 7px;
}

.cube-encoding-field__source {
  display: grid;
  gap: 5px;
}

.cube-encoding-field__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #516176;
  font-size: 11px;
}

.cube-encoding-field__label abbr {
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

.cube-encoding-field__members {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.cube-encoding-field__members label {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  padding: 6px 7px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 5px;
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
  cursor: pointer;
}

.cube-encoding-field__members input {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  margin: 0;
  accent-color: #1554b2;
}

.cube-encoding-field__members span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
