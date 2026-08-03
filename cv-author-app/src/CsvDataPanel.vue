<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { FileSpreadsheet, Lock, Trash2, Unlock, Upload } from "@lucide/vue";
import defaultCsv from "../../case1.csv?raw";
import { useDatasetStore } from "./useDatasetStore";
import type { DataColumnType } from "./types";

const previewRowLimit = 250;

const fileInputRef = ref<HTMLInputElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const dataTableRef = ref<HTMLTableElement | null>(null);
const isDragging = ref(false);
const expandedWidth = ref(304);
const canExpand = ref(false);
const isLocked = ref(false);
const {
  activeDataset,
  parseError,
  parseWarning,
  isLoading,
  importDataset,
  clearActiveDataset,
  setColumnType,
} = useDatasetStore();

const fileName = computed(() => activeDataset.value?.name ?? "");
const columns = computed(() => activeDataset.value?.columns ?? []);
const headers = computed(() => columns.value.map((column) => column.name));
const rows = computed(() =>
  activeDataset.value?.rows.map((row) => headers.value.map((header) => row[header] ?? "")) ?? [],
);
const hasData = computed(() => headers.value.length > 0);
const previewRows = computed(() => rows.value.slice(0, previewRowLimit));
const tableStatus = computed(() => {
  if (!hasData.value) return "No data";
  const rowLabel = rows.value.length === 1 ? "row" : "rows";
  const columnLabel = headers.value.length === 1 ? "column" : "columns";
  return `${rows.value.length} ${rowLabel} / ${headers.value.length} ${columnLabel}`;
});
const panelStyle = computed(() => ({
  "--data-panel-expanded-width": `${expandedWidth.value}px`,
}));

function updateExpandedWidth() {
  const panel = panelRef.value;
  const table = dataTableRef.value;
  if (!panel || !table || window.matchMedia("(max-width: 760px)").matches) {
    canExpand.value = false;
    return;
  }

  const styles = window.getComputedStyle(panel);
  const baseWidth =
    Number.parseFloat(styles.getPropertyValue("--data-panel-width")) || 304;
  const maxWidth =
    Number.parseFloat(styles.getPropertyValue("--data-panel-max-width")) || 912;
  const contentWidth = table.scrollWidth + 2;
  expandedWidth.value = Math.min(maxWidth, Math.max(baseWidth, contentWidth));
  canExpand.value = expandedWidth.value > baseWidth + 1;
}

function clearData() {
  clearActiveDataset();
  expandedWidth.value = 304;
  canExpand.value = false;
  isLocked.value = false;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function importCsv(file: File) {
  void importDataset(file).then(() => {
    void nextTick(updateExpandedWidth);
    if (fileInputRef.value) fileInputRef.value.value = "";
  });
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) importCsv(file);
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) importCsv(file);
}

function toggleLock() {
  if (!canExpand.value) return;
  isLocked.value = !isLocked.value;
}

function onColumnTypeChange(columnName: string, event: Event) {
  const dataset = activeDataset.value;
  const type = (event.target as HTMLSelectElement).value as DataColumnType;
  if (dataset) setColumnType(dataset.id, columnName, type);
}

onMounted(() => {
  window.addEventListener("resize", updateExpandedWidth);
  if (!activeDataset.value) importCsv(new File([defaultCsv], "case1.csv", { type: "text/csv" }));
});
onBeforeUnmount(() =>
  window.removeEventListener("resize", updateExpandedWidth),
);
</script>

<template>
  <aside
    ref="panelRef"
    class="data-panel"
    :class="{
      'data-panel--dragging': isDragging,
      'data-panel--expandable': canExpand,
      'data-panel--locked': canExpand && isLocked,
    }"
    :style="panelStyle"
    aria-label="CSV data"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.self.prevent="isDragging = false"
    @drop.prevent="onDrop"
  >
    <header class="data-panel__header">
      <div class="data-panel__title">
        <h2>Data</h2>
      </div>
      <div class="data-panel__actions">
        <button
          class="data-panel__icon-button"
          :class="{ 'data-panel__icon-button--active': isLocked }"
          type="button"
          :disabled="!canExpand"
          :title="isLocked ? 'Unlock panel width' : 'Lock panel width'"
          :aria-label="isLocked ? 'Unlock panel width' : 'Lock panel width'"
          :aria-pressed="isLocked"
          @click="toggleLock"
        >
          <Unlock v-if="isLocked" :size="15" aria-hidden="true" />
          <Lock v-else :size="15" aria-hidden="true" />
        </button>
        <button
          class="data-panel__import-button"
          type="button"
          :disabled="isLoading"
          @click="openFilePicker"
        >
          <Upload :size="14" aria-hidden="true" />
          <span>{{ isLoading ? "Importing..." : "Import CSV" }}</span>
        </button>
        <button
          v-if="fileName"
          class="data-panel__icon-button data-panel__icon-button--danger"
          type="button"
          title="Clear data"
          aria-label="Clear data"
          @click="clearData"
        >
          <Trash2 :size="15" aria-hidden="true" />
        </button>
      </div>
    </header>

    <input
      ref="fileInputRef"
      class="data-panel__file-input"
      type="file"
      accept=".csv,text/csv"
      @change="onFileChange"
    />
    <div
      class="data-panel__meta"
      :class="{ 'data-panel__meta--empty': !fileName }"
    >
      <strong :title="fileName">{{ fileName || "No file selected" }}</strong>
      <span>{{ tableStatus }}</span>
    </div>

    <p v-if="parseError" class="data-panel__message data-panel__message--error">
      {{ parseError }}
    </p>
    <p v-else-if="parseWarning" class="data-panel__message">
      {{ parseWarning }}
    </p>

    <div v-if="hasData" class="data-table-wrap">
      <table ref="dataTableRef" class="data-table">
        <thead>
          <tr>
            <th class="data-table__row-number" scope="col">#</th>
            <th
              v-for="(header, columnIndex) in headers"
              :key="`${columnIndex}-${header}`"
              scope="col"
              :title="header"
            >
              <span>{{ header }}</span>
              <select
                :value="columns[columnIndex]?.type"
                aria-label="Column type"
                @change="onColumnTypeChange(header, $event)"
              >
                <option value="nominal">nominal</option>
                <option value="temporal">temporal</option>
                <option value="quantitative">quantitative</option>
              </select>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex">
            <th class="data-table__row-number" scope="row">
              {{ rowIndex + 1 }}
            </th>
            <td
              v-for="(cell, columnIndex) in row"
              :key="columnIndex"
              :title="cell"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="data-panel__empty" aria-live="polite">
      <FileSpreadsheet :size="34" aria-hidden="true" />
      <span>{{ isLoading ? "Reading CSV" : "No data" }}</span>
    </div>

    <footer v-if="rows.length > previewRowLimit" class="data-panel__footer">
      Showing {{ previewRowLimit }} of {{ rows.length }} rows
    </footer>
  </aside>
</template>

<style scoped>
.data-panel {
  --data-panel-width: 340px;
  --data-panel-max-width: 912px;
  display: flex;
  flex: 0 0 var(--data-panel-width);
  flex-direction: column;
  align-self: stretch;
  width: var(--data-panel-width);
  min-height: 0;
  min-width: 340px;
  margin: 10px 0 10px 10px;
  overflow: hidden;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 8px;
  background: #f8fafc;
  box-shadow: 0 8px 22px rgba(45, 89, 126, 0.08);
  transition:
    width 180ms ease,
    flex-basis 180ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.data-panel--expandable:hover,
.data-panel--locked {
  flex-basis: min(var(--data-panel-expanded-width), calc(100vw - 40px));
  width: min(var(--data-panel-expanded-width), calc(100vw - 40px));
}

.data-panel--dragging {
  border-color: #1c7ed6;
  box-shadow: 0 0 0 3px rgba(28, 126, 214, 0.14);
}

.data-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: #fff;
}

.data-panel__title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #18212f;
}

.data-panel__title h2 {
  margin: 0;
  color: #516176;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.data-panel__actions {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.data-panel__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #66768a;
  cursor: pointer;
}

.data-panel__icon-button:hover:not(:disabled) {
  border-color: rgba(28, 126, 214, 0.24);
  background: #edf5fc;
  color: #1554b2;
}

.data-panel__icon-button--danger:hover:not(:disabled) {
  border-color: rgba(196, 61, 61, 0.2);
  background: #fff0f0;
  color: #b42f2f;
}

.data-panel__icon-button--active {
  border-color: rgba(28, 126, 214, 0.28);
  background: #dcecfb;
  color: #1554b2;
}

.data-panel__icon-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.data-panel__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.data-panel__import-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: auto;
  min-height: 28px;
  margin: 0;
  padding: 5px 8px;
  border: 1px solid rgba(28, 126, 214, 0.22);
  border-radius: 6px;
  background: #edf5fc;
  color: #1554b2;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.data-panel__import-button:hover:not(:disabled) {
  border-color: rgba(28, 126, 214, 0.38);
  background: #dcecfb;
}

.data-panel__import-button:disabled {
  opacity: 0.62;
  cursor: wait;
}

.data-panel__meta {
  display: grid;
  gap: 3px;
  min-height: 52px;
  padding: 10px 12px;
  color: #6b7788;
  font-size: 11px;
}

.data-panel__meta strong {
  overflow: hidden;
  color: #27384b;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-panel__meta--empty strong {
  color: #6b7788;
  font-weight: 500;
}

.data-panel__message {
  margin: 0 12px 10px;
  padding: 7px 8px;
  border-left: 3px solid #d59a2e;
  background: #fff9e8;
  color: #76520f;
  font-size: 11px;
  line-height: 1.35;
}

.data-panel__message--error {
  border-left-color: #c43d3d;
  background: #fff0f0;
  color: #8c2929;
}

.data-table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 2px;
  overflow-x: auto;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
  background: #fff;
}

.data-table {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: #263548;
  font-size: 11px;
  line-height: 1.35;
}

.data-table th,
.data-table td {
  max-width: 180px;
  min-width: 96px;
  height: 32px;
  overflow: hidden;
  padding: 6px 9px;
  border-right: 1px solid #e5eaf0;
  border-bottom: 1px solid #e5eaf0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #edf3f8;
  color: #33465b;
  font-weight: 700;
}

.data-table thead th span,
.data-table thead th small {
  display: block;
}

.data-table thead th select {
  width: 100%;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #708298;
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
}

.data-table tbody tr:nth-child(even) td,
.data-table tbody tr:nth-child(even) th {
  background: #f8fafc;
}

.data-table__row-number {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 42px;
  min-width: 42px !important;
  max-width: 42px !important;
  background: #f1f5f8;
  color: #7a8797;
  font-weight: 500;
  text-align: right !important;
}

.data-table thead .data-table__row-number {
  z-index: 3;
  background: #e5edf4;
}

.data-panel__empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 180px;
  border-top: 1px solid rgba(24, 33, 47, 0.06);
  color: #93a0af;
  font-size: 12px;
}

.data-panel__footer {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 8px 12px;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
  background: #fff;
  color: #6b7788;
  font-size: 10px;
}

@media (max-width: 1100px) {
  .data-panel {
    --data-panel-width: 264px;
    --data-panel-max-width: 792px;
  }
}

@media (max-width: 760px) {
  .data-panel {
    --data-panel-width: auto;
    width: auto;
    min-width: 0;
    height: 420px;
    min-height: 320px;
    max-height: 420px;
    margin: 10px 10px 0;
  }

  .data-panel--expandable:hover,
  .data-panel--locked {
    flex-basis: auto;
    width: auto;
  }
}
</style>
