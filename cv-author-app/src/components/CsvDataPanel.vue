<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  FileSpreadsheet,
  GripVertical,
  Rows3,
  Trash2,
  Upload,
} from "@lucide/vue";
import defaultCsv from "../../../data/case1.csv?raw";
import { useDatasetStore } from "../stores/useDatasetStore";
import type { DataColumnType, DatasetTable, LineSeriesShape } from "../types";
import {
  beginCsvColumnDrag,
  csvColumnDragMime,
  encodeCsvColumnDragPayload,
  endCsvColumnDrag,
} from "../utils/csvColumnDrag";

const previewRowLimit = 250;

const props = withDefaults(defineProps<{
  encodingBindings?: Record<string, string[]>;
  seriesStyles?: Record<string, Array<{
    memberId: string;
    label: string;
    color: string;
    width: number;
    shape: LineSeriesShape;
  }>>;
}>(), {
  encodingBindings: () => ({}),
  seriesStyles: () => ({}),
});
const emit = defineEmits<{
  seriesStyleChange: [memberId: string, patch: { color?: string; strokeWidth?: number; shape?: LineSeriesShape }];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const expandedWidth = ref(304);
const canExpand = ref(false);
const isExpanded = ref(false);
const isTransposed = ref(false);
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
const isGraph = computed(() => !!activeDataset.value?.graph);
const columns = computed(() => activeDataset.value?.columns ?? []);
const headers = computed(() => columns.value.map((column) => column.name));
const rows = computed(() =>
  activeDataset.value?.rows.map((row) => headers.value.map((header) => row[header] ?? "")) ?? [],
);
const previewRows = computed(() => rows.value.slice(0, previewRowLimit));
const graphTables = computed(() => {
  const graph = activeDataset.value?.graph;
  if (!graph) return [];
  return [
    { key: "nodes" as const, label: "Nodes", table: graph.nodes },
    { key: "edges" as const, label: "Edges", table: graph.edges },
  ];
});
const hasData = computed(() => isGraph.value || headers.value.length > 0);
const tableStatus = computed(() => {
  if (isGraph.value) {
    const [nodes, edges] = graphTables.value;
    return `${nodes?.table.rows.length ?? 0} nodes / ${edges?.table.rows.length ?? 0} edges`;
  }
  if (!hasData.value) return "No data";
  const rowLabel = rows.value.length === 1 ? "row" : "rows";
  const columnLabel = headers.value.length === 1 ? "column" : "columns";
  return `${rows.value.length} ${rowLabel} / ${headers.value.length} ${columnLabel}`;
});
function encodingLabels(field: string) {
  return props.encodingBindings[field] ?? [];
}
function seriesStyles(field: string) {
  return props.seriesStyles[field] ?? [];
}
function tableHeaders(table: DatasetTable) {
  return table.columns.map((column) => column.name);
}

function tableRows(table: DatasetTable) {
  const tableHeaderNames = tableHeaders(table);
  return table.rows.map((row) => tableHeaderNames.map((header) => row[header] ?? ""));
}

function tablePreviewRows(table: DatasetTable) {
  return tableRows(table).slice(0, previewRowLimit);
}
const panelStyle = computed(() => ({
  "--data-panel-expanded-width": `${expandedWidth.value}px`,
}));

function updateExpandedWidth() {
  const panel = panelRef.value;
  const tables = panel ? Array.from(panel.querySelectorAll<HTMLTableElement>(".data-table")) : [];
  if (!panel || tables.length === 0 || window.matchMedia("(max-width: 760px)").matches) {
    canExpand.value = false;
    isExpanded.value = false;
    return;
  }

  const styles = window.getComputedStyle(panel);
  const baseWidth =
    Number.parseFloat(styles.getPropertyValue("--data-panel-width")) || 304;
  const maxWidth =
    Number.parseFloat(styles.getPropertyValue("--data-panel-max-width")) || 912;
  const contentWidth = Math.max(...tables.map((table) => table.scrollWidth)) + 2;
  expandedWidth.value = Math.min(maxWidth, Math.max(baseWidth, contentWidth));
  canExpand.value = expandedWidth.value > baseWidth + 1;
  if (!canExpand.value) isExpanded.value = false;
}

function clearData() {
  clearActiveDataset();
  expandedWidth.value = 304;
  canExpand.value = false;
  isExpanded.value = false;
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function importFile(file: File) {
  void importDataset(file).then(() => {
    void nextTick(updateExpandedWidth);
    if (fileInputRef.value) fileInputRef.value.value = "";
  });
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) importFile(file);
}

function onDrop(event: DragEvent) {
  isDragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) importFile(file);
}

function onColumnDragStart(column: { name: string; type: DataColumnType }, event: DragEvent) {
  const dataset = activeDataset.value;
  if (!dataset || !event.dataTransfer) return;
  const columnPayload = {
    datasetId: dataset.id,
    field: column.name,
    type: column.type,
  };
  beginCsvColumnDrag(columnPayload);
  event.dataTransfer.setData(csvColumnDragMime, encodeCsvColumnDragPayload(columnPayload));
  event.dataTransfer.setData("text/plain", column.name);
  event.dataTransfer.effectAllowed = "copy";
}

function onPanelDragEnter(event: DragEvent) {
  if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) isDragging.value = true;
}

function onPanelDragOver(event: DragEvent) {
  if (Array.from(event.dataTransfer?.types ?? []).includes("Files")) isDragging.value = true;
}

function toggleExpanded() {
  if (!canExpand.value) return;
  isExpanded.value = !isExpanded.value;
}

function toggleTableOrientation() {
  isTransposed.value = !isTransposed.value;
  void nextTick(updateExpandedWidth);
}

function onColumnTypeChange(columnName: string, event: Event, table?: "nodes" | "edges") {
  const dataset = activeDataset.value;
  const type = (event.target as HTMLSelectElement).value as DataColumnType;
  if (dataset) setColumnType(dataset.id, columnName, type, table);
}

onMounted(() => {
  window.addEventListener("resize", updateExpandedWidth);
  if (!activeDataset.value) {
    importFile(new File([defaultCsv], "case1.csv", { type: "text/csv" }));
  } else {
    void nextTick(updateExpandedWidth);
  }
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
      'data-panel--expanded': canExpand && isExpanded,
    }"
    :style="panelStyle"
    aria-label="Imported data"
    @dragenter.prevent="onPanelDragEnter"
    @dragover.prevent="onPanelDragOver"
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
          :class="{ 'data-panel__icon-button--active': isTransposed }"
          type="button"
          :disabled="!hasData"
          :title="isTransposed ? 'Show fields horizontally' : 'Show fields vertically'"
          :aria-label="isTransposed ? 'Show fields horizontally' : 'Show fields vertically'"
          :aria-pressed="isTransposed"
          @click="toggleTableOrientation"
        >
          <Rows3 v-if="isTransposed" :size="15" aria-hidden="true" />
          <Columns3 v-else :size="15" aria-hidden="true" />
        </button>
        <button
          class="data-panel__icon-button"
          :class="{ 'data-panel__icon-button--active': isExpanded }"
          type="button"
          :disabled="!canExpand"
          :title="isExpanded ? 'Collapse CSV data' : 'Expand CSV data'"
          :aria-label="isExpanded ? 'Collapse CSV data' : 'Expand CSV data'"
          :aria-expanded="isExpanded"
          @click="toggleExpanded"
        >
          <ChevronsLeft v-if="isExpanded" :size="15" aria-hidden="true" />
          <ChevronsRight v-else :size="15" aria-hidden="true" />
        </button>
        <button
          class="data-panel__import-button"
          type="button"
          :disabled="isLoading"
          @click="openFilePicker"
        >
          <Upload :size="14" aria-hidden="true" />
          <span>{{ isLoading ? "Importing..." : "Import data" }}</span>
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
      accept=".csv,.json,text/csv,application/json"
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
      <template v-if="!isGraph">
      <table
        v-if="!isTransposed"
        class="data-table"
      >
        <thead>
          <tr>
            <th class="data-table__row-number" scope="col">#</th>
            <th
              v-for="(header, columnIndex) in headers"
              :key="`${columnIndex}-${header}`"
              scope="col"
              :title="header"
            >
              <span
                class="data-table__draggable-field"
                draggable="true"
                @dragstart="onColumnDragStart(columns[columnIndex]!, $event)"
                @dragend="endCsvColumnDrag"
              >
                <GripVertical :size="12" :stroke-width="1.8" aria-hidden="true" />
                <span class="data-table__column-label">{{ header }}</span>
              </span>
              <select
                :value="columns[columnIndex]?.type"
                class="data-table__column-type"
                aria-label="Column type"
                @change="onColumnTypeChange(header, $event)"
              >
                <option value="nominal">nominal</option>
                <option value="temporal">temporal</option>
                <option value="quantitative">quantitative</option>
              </select>
            </th>
          </tr>
          <tr v-if="Object.keys(props.encodingBindings).length > 0" class="data-table__binding-row">
            <th class="data-table__binding-label" scope="row">Encoding</th>
            <th
              v-for="header in headers"
              :key="`encoding-${header}`"
              class="data-table__binding-cell"
              scope="col"
            >
              <span v-if="encodingLabels(header).length === 0" class="data-table__binding-empty">-</span>
              <span v-else class="data-table__binding-values">
                <span v-for="label in encodingLabels(header)" :key="`${header}-${label}`" class="data-table__binding-value">{{ label }}</span>
                <span v-for="style in seriesStyles(header)" :key="`${header}-style-${style.memberId}`" class="data-table__series-style">
                  <span class="data-table__series-style-head"><span>Color</span><span>Width</span><span>Line style</span></span>
                  <span class="data-table__series-style-controls">
                    <input type="color" :value="style.color" :aria-label="`${style.label} series color`" @input="emit('seriesStyleChange', style.memberId, { color: ($event.target as HTMLInputElement).value })" />
                    <input type="number" min="0.5" max="16" step="0.5" :value="style.width" :aria-label="`${style.label} stroke width`" @change="emit('seriesStyleChange', style.memberId, { strokeWidth: Number(($event.target as HTMLInputElement).value) })" />
                    <select :value="style.shape" :aria-label="`${style.label} line style`" @change="emit('seriesStyleChange', style.memberId, { shape: ($event.target as HTMLSelectElement).value as LineSeriesShape })"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select>
                  </span>
                </span>
              </span>
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
      <table
        v-else
        class="data-table data-table--transposed"
      >
        <thead>
          <tr>
            <th class="data-table__field-name" scope="col">Field</th>
            <th v-if="Object.keys(props.encodingBindings).length > 0" class="data-table__binding-cell" scope="col">Encoding</th>
            <th
              v-for="(_, rowIndex) in previewRows"
              :key="rowIndex"
              scope="col"
            >
              {{ rowIndex + 1 }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(column, columnIndex) in columns"
            :key="`${columnIndex}-${column.name}`"
          >
            <th
              class="data-table__field-name"
              scope="row"
              :title="column.name"
            >
              <span
                class="data-table__draggable-field"
                draggable="true"
                @dragstart="onColumnDragStart(column, $event)"
                @dragend="endCsvColumnDrag"
              >
                <GripVertical :size="12" :stroke-width="1.8" aria-hidden="true" />
                <span class="data-table__column-label">{{ column.name }}</span>
              </span>
              <select
                :value="column.type"
                class="data-table__column-type"
                :aria-label="`${column.name} column type`"
                @change="onColumnTypeChange(column.name, $event)"
              >
                <option value="nominal">nominal</option>
                <option value="temporal">temporal</option>
                <option value="quantitative">quantitative</option>
              </select>
            </th>
            <td v-if="Object.keys(props.encodingBindings).length > 0" class="data-table__binding-cell">
              <span v-if="encodingLabels(column.name).length === 0" class="data-table__binding-empty">-</span>
              <span v-else class="data-table__binding-values">
                <span v-for="label in encodingLabels(column.name)" :key="`${column.name}-${label}`" class="data-table__binding-value">{{ label }}</span>
                <span v-for="style in seriesStyles(column.name)" :key="`${column.name}-style-${style.memberId}`" class="data-table__series-style">
                  <span class="data-table__series-style-head"><span>Color</span><span>Width</span><span>Line style</span></span>
                  <span class="data-table__series-style-controls">
                    <input type="color" :value="style.color" :aria-label="`${style.label} series color`" @input="emit('seriesStyleChange', style.memberId, { color: ($event.target as HTMLInputElement).value })" />
                    <input type="number" min="0.5" max="16" step="0.5" :value="style.width" :aria-label="`${style.label} stroke width`" @change="emit('seriesStyleChange', style.memberId, { strokeWidth: Number(($event.target as HTMLInputElement).value) })" />
                    <select :value="style.shape" :aria-label="`${style.label} line style`" @change="emit('seriesStyleChange', style.memberId, { shape: ($event.target as HTMLSelectElement).value as LineSeriesShape })"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select>
                  </span>
                </span>
              </span>
            </td>
            <td
              v-for="(row, rowIndex) in previewRows"
              :key="rowIndex"
              :title="row[columnIndex]"
            >
              {{ row[columnIndex] }}
            </td>
          </tr>
        </tbody>
      </table>
      </template>
      <template v-else>
      <section
        v-for="graphTable in graphTables"
        :key="graphTable.key"
        class="graph-table-section"
      >
        <header class="graph-table-section__header">
          <h3>{{ graphTable.label }}</h3>
          <span>
            {{ graphTable.table.rows.length }} rows / {{ graphTable.table.columns.length }} columns
          </span>
        </header>
        <table
          v-if="!isTransposed && graphTable.table.columns.length > 0"
          class="data-table"
        >
          <thead>
            <tr>
              <th class="data-table__row-number" scope="col">#</th>
              <th
                v-for="(header, columnIndex) in tableHeaders(graphTable.table)"
                :key="`${columnIndex}-${header}`"
                scope="col"
                :title="header"
              >
                <span>{{ header }}</span>
                <select
                  :value="graphTable.table.columns[columnIndex]?.type"
                  aria-label="Column type"
                  @change="onColumnTypeChange(header, $event, graphTable.key)"
                >
                  <option value="nominal">nominal</option>
                  <option value="temporal">temporal</option>
                  <option value="quantitative">quantitative</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in tablePreviewRows(graphTable.table)"
              :key="rowIndex"
            >
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
        <table
          v-else-if="isTransposed && graphTable.table.columns.length > 0"
          class="data-table data-table--transposed"
        >
          <thead>
            <tr>
              <th class="data-table__field-name" scope="col">Field</th>
              <th
                v-for="(_, rowIndex) in tablePreviewRows(graphTable.table)"
                :key="rowIndex"
                scope="col"
              >
                {{ rowIndex + 1 }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(column, columnIndex) in graphTable.table.columns"
              :key="`${columnIndex}-${column.name}`"
            >
              <th class="data-table__field-name" scope="row" :title="column.name">
                <span>{{ column.name }}</span>
                <select
                  :value="column.type"
                  :aria-label="`${column.name} column type`"
                  @change="onColumnTypeChange(column.name, $event, graphTable.key)"
                >
                  <option value="nominal">nominal</option>
                  <option value="temporal">temporal</option>
                  <option value="quantitative">quantitative</option>
                </select>
              </th>
              <td
                v-for="(row, rowIndex) in tablePreviewRows(graphTable.table)"
                :key="rowIndex"
                :title="row[columnIndex]"
              >
                {{ row[columnIndex] }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="graph-table-section__empty">No attributes</p>
      </section>
      </template>
    </div>

    <div v-else class="data-panel__empty" aria-live="polite">
      <FileSpreadsheet :size="34" aria-hidden="true" />
      <span>{{ isLoading ? "Reading data" : "No data" }}</span>
    </div>

    <footer v-if="!isGraph && rows.length > previewRowLimit" class="data-panel__footer">
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

.data-panel--expanded {
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
  scrollbar-color: transparent transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
  background: #fff;
}

.data-table-wrap:hover,
.data-table-wrap:focus-within {
  scrollbar-color: #a8b4c4 transparent;
}

.data-table-wrap::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.data-table-wrap::-webkit-scrollbar-track,
.data-table-wrap::-webkit-scrollbar-thumb {
  background: transparent;
}

.data-table-wrap:hover::-webkit-scrollbar-thumb,
.data-table-wrap:focus-within::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: #a8b4c4;
  background-clip: padding-box;
}

.graph-table-section {
  border-bottom: 1px solid rgba(24, 33, 47, 0.1);
}

.graph-table-section:last-child {
  border-bottom: 0;
}

.graph-table-section__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px 7px;
  background: #fff;
}

.graph-table-section__header h3 {
  margin: 0;
  color: #33465b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.graph-table-section__header span,
.graph-table-section__empty {
  color: #7a8797;
  font-size: 10px;
}

.graph-table-section__empty {
  margin: 0;
  padding: 18px 12px;
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

.data-table thead th .data-table__draggable-field,
.data-table tbody th .data-table__draggable-field {
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 3px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 15px;
  overflow: hidden;
  white-space: nowrap;
  cursor: grab;
  color: #52657a;
}

.data-table thead th .data-table__draggable-field > svg,
.data-table tbody th .data-table__draggable-field > svg {
  flex: 0 0 auto;
  color: #7a8da2;
  order: 0;
}

.data-table thead th .data-table__draggable-field > span,
.data-table tbody th .data-table__draggable-field > span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  order: 1;
}

.data-table__draggable-field:active {
  cursor: grabbing;
}

.data-table thead th select.data-table__column-type {
  width: 100%;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #708298;
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  text-align: left;
}

.data-table__binding-row {
  background: #f8fbfe;
}

.data-table__binding-label,
.data-table__binding-cell {
  height: auto !important;
  min-height: 28px;
  padding: 4px 9px !important;
  background: #f8fbfe;
  color: #52657a;
  font-size: 9px;
  font-weight: 600;
  text-align: left;
  vertical-align: middle;
}

.data-table__binding-label {
  min-width: 42px !important;
  color: #33465b;
}

.data-table__binding-cell {
  min-width: 260px;
  max-width: 320px;
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: clip;
}

.data-table__binding-values {
  display: grid;
  gap: 2px;
}

.data-table__series-style {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding-top: 2px;
  border-top: 1px solid rgba(28, 126, 214, 0.12);
}

.data-table__series-style-head,
.data-table__series-style-controls {
  display: grid;
  grid-template-columns: 28px 48px 74px;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.data-table__series-style-head {
  color: #52657a;
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
}

.data-table__series-style input,
.data-table__series-style select {
  box-sizing: border-box;
  min-width: 0;
  height: 20px;
  padding: 1px 2px;
  border: 1px solid #c9d5e1;
  border-radius: 3px;
  background: #fff;
  color: #33465b;
  font: inherit;
  font-size: 9px;
}

.data-table__series-style input[type="color"] {
  width: 28px;
  padding: 1px;
  cursor: pointer;
}

.data-table__series-style input[type="number"] {
  width: 48px;
}

.data-table__series-style select {
  width: 74px;
  text-align: left;
}

.data-table__binding-value {
  display: block;
  max-width: none;
  padding: 0;
  color: #1554b2;
  font-size: 9px;
  font-weight: 650;
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
}

.data-table__binding-empty {
  color: #9aa8b7;
  font-weight: 500;
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

.data-table__field-name {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 128px;
  min-width: 128px !important;
  max-width: 180px !important;
  background: #f1f5f8;
  color: #33465b;
  font-weight: 700;
}

.data-table thead .data-table__field-name {
  z-index: 3;
  background: #e5edf4;
}

.data-table__field-name span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-table__field-name select {
  width: 100%;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #708298;
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  text-align: left;
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

  .data-panel--expanded {
    flex-basis: auto;
    width: auto;
  }
}
</style>
