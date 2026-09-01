<script setup lang="ts">
type AlignmentMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  align: [mode: AlignmentMode];
}>();
</script>

<template>
  <div class="alignment-tools" role="group" aria-label="Alignment">
    <button
      class="icon-button"
      type="button"
      title="Align left"
      aria-label="Align left"
      :disabled="disabled"
      @click="emit('align', 'left')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 2.5v11M6 4.5h7M6 8h5M6 11.5h7" />
      </svg>
    </button>
    <button
      class="icon-button"
      type="button"
      title="Align center horizontally"
      aria-label="Align center horizontally"
      :disabled="disabled"
      @click="emit('align', 'center-x')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.5v11M4 4.5h8M5.5 8h5M4 11.5h8" />
      </svg>
    </button>
    <button
      class="icon-button"
      type="button"
      title="Align right"
      aria-label="Align right"
      :disabled="disabled"
      @click="emit('align', 'right')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13 2.5v11M3 4.5h7M5 8h5M3 11.5h7" />
      </svg>
    </button>
    <button
      class="icon-button"
      type="button"
      title="Align top"
      aria-label="Align top"
      :disabled="disabled"
      @click="emit('align', 'top')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 3h11M4.5 6v7M8 6v5M11.5 6v7" />
      </svg>
    </button>
    <button
      class="icon-button"
      type="button"
      title="Align center vertically"
      aria-label="Align center vertically"
      :disabled="disabled"
      @click="emit('align', 'center-y')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 8h11M4.5 4v8M8 5.5v5M11.5 4v8" />
      </svg>
    </button>
    <button
      class="icon-button"
      type="button"
      title="Align bottom"
      aria-label="Align bottom"
      :disabled="disabled"
      @click="emit('align', 'bottom')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 13h11M4.5 3v7M8 5v5M11.5 3v7" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.alignment-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  width: 100%;
  padding: 2px 0;
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  padding: 0;
  border: 1px solid rgba(67, 40, 24, 0.1);
  border-radius: 6px;
  background: rgb(var(--frontend-light-rgb) / 0.8);
  color: #432818;
  cursor: pointer;
}
.icon-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.icon-button:hover:not(:disabled) {
  border-color: rgba(153, 88, 42, 0.35);
  background: var(--frontend-surface-soft);
  color: #432818;
}
.icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
