<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type SelectOption = { value: string; label: string; disabled: boolean };

const props = withDefaults(defineProps<{
  modelValue?: string;
  value?: string;
  disabled?: boolean;
}>(), { modelValue: undefined, value: "", disabled: false });

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();

const root = ref<HTMLElement | null>(null);
const nativeSelect = ref<HTMLSelectElement | null>(null);
const options = ref<SelectOption[]>([]);
const open = ref(false);
const highlightedIndex = ref(-1);

const currentValue = () => props.modelValue ?? props.value ?? "";
const selectedOption = () => options.value.find((option) => option.value === currentValue());

function refreshOptions() {
  options.value = Array.from(nativeSelect.value?.options ?? []).map((option) => ({
    value: option.value,
    label: option.textContent?.trim() ?? option.value,
    disabled: option.disabled,
  }));
  const selectedIndex = options.value.findIndex((option) => option.value === currentValue());
  highlightedIndex.value = selectedIndex >= 0 ? selectedIndex : options.value.findIndex((option) => !option.disabled);
}

function selectValue(value: string) {
  if (props.disabled) return;
  const option = options.value.find((item) => item.value === value);
  if (!option || option.disabled) return;
  emit("update:modelValue", value);
  emit("change", value);
  open.value = false;
}

function toggle() {
  if (props.disabled) return;
  refreshOptions();
  open.value = !open.value;
}

function moveHighlight(step: number) {
  if (!options.value.length) return;
  let index = highlightedIndex.value;
  for (let count = 0; count < options.value.length; count += 1) {
    index = (index + step + options.value.length) % options.value.length;
    if (!options.value[index]?.disabled) {
      highlightedIndex.value = index;
      return;
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!open.value) {
      refreshOptions();
      open.value = true;
    }
    moveHighlight(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (open.value) selectValue(options.value[highlightedIndex.value]?.value ?? "");
    else toggle();
  } else if (event.key === "Escape") {
    open.value = false;
  }
}

function handleOutsideClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}

let observer: MutationObserver | null = null;
onMounted(async () => {
  await nextTick();
  refreshOptions();
  observer = nativeSelect.value ? new MutationObserver(refreshOptions) : null;
  observer?.observe(nativeSelect.value as Node, { childList: true, subtree: true, attributes: true });
  document.addEventListener("mousedown", handleOutsideClick);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  document.removeEventListener("mousedown", handleOutsideClick);
});
watch(() => [props.modelValue, props.value], refreshOptions);
</script>

<template>
  <div ref="root" class="custom-select" :class="{ 'custom-select--open': open, 'custom-select--disabled': disabled }">
    <select ref="nativeSelect" class="custom-select__native" :value="currentValue()" :disabled="disabled" tabindex="-1" aria-hidden="true">
      <slot />
    </select>
    <button
      type="button"
      class="custom-select__trigger"
      :disabled="disabled"
      :aria-expanded="open"
      @click="toggle"
      @keydown="handleKeydown"
    >
      <span>{{ selectedOption()?.label ?? "Select an option" }}</span>
      <span class="custom-select__chevron" aria-hidden="true">&#9662;</span>
    </button>
    <div v-if="open" class="custom-select__menu" role="listbox">
      <button
        v-for="(option, index) in options"
        :key="`${option.value}-${index}`"
        type="button"
        class="custom-select__option"
        :class="{ 'custom-select__option--selected': option.value === currentValue(), 'custom-select__option--highlighted': index === highlightedIndex }"
        :disabled="option.disabled"
        role="option"
        :aria-selected="option.value === currentValue()"
        @mouseenter="highlightedIndex = index"
        @click="selectValue(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.custom-select { position: relative; display: block; width: 100%; min-width: 0; }
.custom-select__native { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
.custom-select__trigger { display: flex; width: 100%; height: 34px; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px; border: 1px solid var(--frontend-control-border); border-radius: 6px; background: var(--frontend-surface-raised); color: var(--frontend-text-primary); font: inherit; font-size: inherit; text-align: left; cursor: pointer; transition: border-color 140ms ease, background-color 140ms ease; }
.custom-select__trigger:hover, .custom-select--open .custom-select__trigger { border-color: var(--frontend-control-accent-strong); background: var(--frontend-control-hover); }
.custom-select__trigger:focus-visible { border-color: var(--frontend-control-accent-strong); outline: 2px solid rgb(153 88 42 / 22%); outline-offset: 1px; }
.custom-select--disabled .custom-select__trigger { background: var(--frontend-surface-canvas); color: var(--frontend-text-muted); cursor: not-allowed; }
.custom-select__trigger > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.custom-select__chevron { color: var(--frontend-text-secondary); font-size: 0.75em; line-height: 1; }
.custom-select__menu { position: absolute; z-index: 100; top: calc(100% + 4px); right: 0; left: 0; display: grid; max-height: 240px; overflow-y: auto; padding: 4px; border: 1px solid var(--frontend-control-border); border-radius: 6px; background: var(--frontend-surface-raised); box-shadow: 0 10px 24px rgb(67 40 24 / 20%); }
.custom-select__option { width: 100%; min-height: 30px; padding: 6px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--frontend-text-primary); font: inherit; font-size: inherit; text-align: left; cursor: pointer; }
.custom-select__option:hover, .custom-select__option--highlighted { background: var(--frontend-control-hover); color: var(--frontend-text-primary); }
.custom-select__option--selected { font-weight: 700; }
.custom-select__option:disabled { color: var(--frontend-text-muted); cursor: not-allowed; }
.custom-select__option:disabled:hover { background: transparent; }
</style>
