<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  FileSpreadsheet,
  Filter,
  GripVertical,
  ListFilter,
  MapPinned,
  Plus,
  Rows3,
  Sigma,
  Trash2,
  Upload,
  X,
} from "@lucide/vue";
import case1Csv from "../../../data/case1.csv?raw";
import case2Csv from "../../../data/case2.csv?raw";
import case3Csv from "../../../data/case3.csv?raw";
import academicScoresCsv from "../../../data/academic_scores.csv?raw";
import treeNodesCsv from "../../../data/tree_nodes.csv?raw";
import graphNodesCsv from "../../../data/nodes.csv?raw";
import graphEdgesCsv from "../../../data/edges.csv?raw";
import { useDatasetStore } from "../stores/useDatasetStore";
import type {
  ChartDataTransform,
  ChartNumericFilterTransform,
  ChartSpec,
  DataColumnType,
  Dataset,
  DatasetTable,
} from "../types";
import { materializeChartDataTransforms } from "../utils/chartDataTransforms";
import {
  beginCsvColumnDrag,
  csvColumnDragMime,
  encodeCsvColumnDragPayload,
  endCsvColumnDrag,
} from "../utils/csvColumnDrag";

const previewRowLimit = 250;

const props = defineProps<{
  chartId?: string;
  chartName?: string;
  chartSpec?: ChartSpec | null;
}>();

const emit = defineEmits<{
  transformsChange: [transforms: ChartDataTransform[]];
  datasetChange: [datasetId: string];
}>();

const panelRef = ref<HTMLElement | null>(null);
const geometryFileInput = ref<HTMLInputElement | null>(null);
const csvFileInput = ref<HTMLInputElement | null>(null);
const graphNodesFileInput = ref<HTMLInputElement | null>(null);
const graphEdgesFileInput = ref<HTMLInputElement | null>(null);
const graphNodesFile = ref<File | null>(null);
const graphEdgesFile = ref<File | null>(null);
const importMenuOpen = ref(false);
const expandedWidth = ref(304);
const canExpand = ref(false);
const isExpanded = ref(false);
const isTransposed = ref(true);
const {
  activeDataset,
  datasets,
  parseError,
  parseWarning,
  isLoading,
  importDataset,
  importGraphDataset,
  getDataset,
  setActiveDataset,
  setColumnType,
  geometrySources,
  activeGeometrySource,
  importGeometrySource,
  setActiveGeometrySource,
} = useDatasetStore();

type TransformEditorMode = "filter" | "aggregate";
type ValueFilterPurpose = "filter" | "facet-clue" | "nest-clue";
const valueFilterPurposeOptions = [
  { value: "filter", label: "Filter" },
  { value: "facet-clue", label: "Facet clue" },
  { value: "nest-clue", label: "Nest clue" },
] as const;

const transformEditorMode = ref<TransformEditorMode | null>(null);
const selectedTransformColumn = ref("");
const valueFilterPurpose = ref<ValueFilterPurpose>("filter");
const selectedFilterValues = ref<string[]>([]);
const numericFilterOperator = ref<ChartNumericFilterTransform["operator"]>("top");
const numericFilterValue = ref(10);
const numericFilterUpperValue = ref(100);
const aggregateValueField = ref("");
const aggregateOperation = ref<"sum" | "avg">("sum");
const binMethod = ref<"equal-width" | "fixed-width" | "quantile">("equal-width");
const binParameter = ref(5);
const outputField = ref("");

const presetDatasets = computed(() => {
  // Dataset ids are intentionally unique, but the panel labels datasets by
  // filename. Keep the newest dataset for a filename so re-imports do not
  // create indistinguishable options in the selector.
  const byName = new Map<string, Dataset>();
  datasets.value.forEach((dataset) => byName.set(dataset.name, dataset));
  return Array.from(byName.values());
});
const isGraph = computed(() => !!activeDataset.value?.graph);
const columns = computed(() => activeDataset.value?.columns ?? []);
const geographicJoinField = ref("");
const geographicJoinStatus = computed(() => {
  const source = activeGeometrySource.value;
  const field = geographicJoinField.value;
  if (!source || !field || !activeDataset.value) return null;
  const ids = new Set(source.features.map((feature) => feature.id));
  const values = activeDataset.value.rows
    .map((row) => (row[field] ?? "").trim())
    .filter(Boolean);
  const matched = values.filter((value) => ids.has(value)).length;
  return { matched, total: values.length, unmatched: values.length - matched };
});
const localGeometryBindings = [
  { datasetName: "case2.csv", field: "incident_zip", sourceName: "nyc-zip-boundaries.geojson", path: "/geodata/nyc-zip-boundaries.geojson" },
] as const;
const localGeometryLoading = new Set<string>();
const chartDataset = computed(() => props.chartSpec ? getDataset(props.chartSpec.datasetId) : null);
const transformedChartDataset = computed(() => chartDataset.value
  ? materializeChartDataTransforms(chartDataset.value, props.chartSpec?.dataTransforms)
  : null);
const transformColumns = computed(() => transformedChartDataset.value?.columns ?? []);
const transformRows = computed(() => transformedChartDataset.value?.rows ?? []);
const transforms = computed(() => props.chartSpec?.dataTransforms ?? []);
const canEditChartTransforms = computed(() => !!props.chartId && !!chartDataset.value && transformColumns.value.length > 0);
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
const selectedColumn = computed(() =>
  transformColumns.value.find((column) => column.name === selectedTransformColumn.value) ?? null,
);
const isSelectedColumnQuantitative = computed(() => selectedColumn.value?.type === "quantitative");
const selectedColumnValues = computed(() => {
  const field = selectedTransformColumn.value;
  if (!field) return [];
  return Array.from(new Set(transformRows.value.map((row) => row[field] ?? "")))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
});
const quantitativeColumns = computed(() =>
  transformColumns.value.filter((column) => column.type === "quantitative"),
);
const outputFieldIsAvailable = computed(() => {
  const name = outputField.value.trim();
  return !!name && !transformColumns.value.some((column) => column.name === name);
});
const canApplyTransform = computed(() => {
  if (!selectedColumn.value) return false;
  if (transformEditorMode.value === "filter") {
    if (!isSelectedColumnQuantitative.value) {
      return valueFilterPurpose.value === "filter"
        ? selectedFilterValues.value.length > 0
        : selectedFilterValues.value.some((value) => value.trim().length > 0);
    }
    if (!Number.isFinite(numericFilterValue.value)) return false;
    if (numericFilterOperator.value === "between") {
      return Number.isFinite(numericFilterUpperValue.value);
    }
    return numericFilterOperator.value !== "top"
      && numericFilterOperator.value !== "bottom"
      || numericFilterValue.value >= 1;
  }
  if (!outputFieldIsAvailable.value) return false;
  if (isSelectedColumnQuantitative.value) {
    return Number.isFinite(binParameter.value)
      && (binMethod.value === "fixed-width" ? binParameter.value > 0 : binParameter.value >= 2);
  }
  return !!aggregateValueField.value;
});
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
const fieldColumnWidth = computed(() => {
  const fieldNames = isGraph.value
    ? graphTables.value.flatMap(({ table }) => table.columns.map((column) => column.name))
    : headers.value;
  const longestNameLength = Math.max("Field".length, ...fieldNames.map((name) => Array.from(name).length));
  return Math.max(128, longestNameLength * 11 + 38);
});
const panelStyle = computed(() => ({
  "--data-panel-expanded-width": `${expandedWidth.value}px`,
  "--data-table-field-width": `${fieldColumnWidth.value}px`,
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

function onDatasetChange(event: Event) {
  const datasetId = (event.target as HTMLSelectElement).value;
  if (datasetId) {
    setActiveDataset(datasetId);
    emit("datasetChange", datasetId);
  }
}

async function onGeometryFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await importGeometrySource(file);
  importMenuOpen.value = false;
  input.value = "";
}

async function onCsvFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await importDataset(file);
  importMenuOpen.value = false;
  input.value = "";
}

function onGraphFileChange(kind: "nodes" | "edges", event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (kind === "nodes") graphNodesFile.value = file;
  else graphEdgesFile.value = file;
  input.value = "";
}

async function importGraphFiles() {
  if (!graphNodesFile.value || !graphEdgesFile.value) return;
  await importGraphDataset(
    graphNodesFile.value,
    graphEdgesFile.value,
    `${graphNodesFile.value.name} + ${graphEdgesFile.value.name}`,
  );
  graphNodesFile.value = null;
  graphEdgesFile.value = null;
  importMenuOpen.value = false;
}

function isGeographicJoinColumn(field: string) {
  const binding = localGeometryBindings.find((item) => item.datasetName === activeDataset.value?.name);
  return !!binding
    && !!activeGeometrySource.value
    && field === binding.field
    && !!geographicJoinStatus.value?.matched;
}

function onColumnDragStart(column: { name: string; type: DataColumnType }, event: DragEvent) {
  const dataset = activeDataset.value;
  if (!dataset || !event.dataTransfer) return;
  const columnPayload = {
    datasetId: dataset.id,
    field: column.name,
    type: displayColumnType(column.type) ?? "nominal",
  };
  beginCsvColumnDrag(columnPayload);
  event.dataTransfer.setData(csvColumnDragMime, encodeCsvColumnDragPayload(columnPayload));
  event.dataTransfer.setData("text/plain", column.name);
  event.dataTransfer.effectAllowed = "copy";
}

function onGraphColumnDragStart(
  table: "nodes" | "edges",
  column: { name: string; type: DataColumnType },
  event: DragEvent,
) {
  const dataset = activeDataset.value;
  if (!dataset || !event.dataTransfer) return;
  const columnPayload = {
    datasetId: dataset.id,
    table,
    field: column.name,
    type: displayColumnType(column.type) ?? "nominal",
  };
  beginCsvColumnDrag(columnPayload);
  event.dataTransfer.setData(csvColumnDragMime, encodeCsvColumnDragPayload(columnPayload));
  event.dataTransfer.setData("text/plain", `${table}.${column.name}`);
  event.dataTransfer.effectAllowed = "copy";
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

function displayColumnType(type: DataColumnType | undefined) {
  return type === "temporal" ? "ordinal" : type;
}

function uniqueOutputField(baseName: string) {
  const names = new Set(transformColumns.value.map((column) => column.name));
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName}_${suffix}`)) suffix += 1;
  return `${baseName}_${suffix}`;
}

function resetTransformForm(mode: TransformEditorMode) {
  transformEditorMode.value = mode;
  selectedTransformColumn.value = "";
  valueFilterPurpose.value = "filter";
  selectedFilterValues.value = [];
  numericFilterOperator.value = "top";
  numericFilterValue.value = 10;
  numericFilterUpperValue.value = 100;
  aggregateValueField.value = "";
  aggregateOperation.value = "sum";
  binMethod.value = "equal-width";
  binParameter.value = 5;
  outputField.value = "";
}

function closeTransformEditor() {
  transformEditorMode.value = null;
}

function onTransformColumnChange() {
  selectedFilterValues.value = [];
  valueFilterPurpose.value = "filter";
  const column = selectedColumn.value;
  if (!column) {
    outputField.value = "";
    aggregateValueField.value = "";
    return;
  }
  if (column.type === "quantitative") {
    outputField.value = uniqueOutputField(`${column.name}_bin`);
    return;
  }
  aggregateValueField.value = quantitativeColumns.value[0]?.name ?? "";
  updateAggregateOutputField();
}

function updateAggregateOutputField() {
  if (!selectedTransformColumn.value || !aggregateValueField.value) return;
  outputField.value = uniqueOutputField(
    `${aggregateValueField.value}_${aggregateOperation.value}_by_${selectedTransformColumn.value}`,
  );
}

function setValueFilterPurpose(purpose: ValueFilterPurpose) {
  valueFilterPurpose.value = purpose;
  if (purpose === "filter") return;
  const field = selectedTransformColumn.value;
  const firstValue = transformRows.value
    .map((row) => row[field] ?? "")
    .find((value) => value.trim().length > 0);
  selectedFilterValues.value = firstValue === undefined ? [] : [firstValue];
}

function toggleFilterValue(value: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  selectedFilterValues.value = checked
    ? [...selectedFilterValues.value, value]
    : selectedFilterValues.value.filter((item) => item !== value);
}

function selectAllFilterValues() {
  selectedFilterValues.value = [...selectedColumnValues.value];
}

function clearFilterValues() {
  selectedFilterValues.value = [];
}

function transformSummary(transform: ChartDataTransform) {
  if (transform.kind === "filter" && transform.mode === "values") {
    const purposeLabel = transform.purpose === "nest-clue"
      ? "Nest clue"
      : transform.purpose === "facet-clue" || (transform.purpose === undefined && transform.single)
        ? "Facet clue"
        : null;
    return purposeLabel
      ? `${transform.field} · ${purposeLabel}`
      : `${transform.field}: ${transform.values.length} selected`;
  }
  if (transform.kind === "filter") {
    const operatorLabels: Record<ChartNumericFilterTransform["operator"], string> = {
      top: "Top",
      bottom: "Bottom",
      gte: "≥",
      gt: ">",
      lte: "≤",
      lt: "<",
      eq: "=",
      between: "Range",
    };
    return transform.operator === "between"
      ? `${transform.field}: ${transform.value}–${transform.upperValue}`
      : `${transform.field}: ${operatorLabels[transform.operator]} ${transform.value}`;
  }
  if (transform.kind === "order") {
    const direction = transform.direction === "source"
      ? "Source order"
      : transform.direction === "ascending"
        ? "Ascending"
        : "Descending";
    const limit = transform.limit === undefined ? "" : ` · Top ${transform.limit}`;
    return `${transform.operation.toUpperCase()} ${transform.valueField} by ${transform.groupField} · ${direction}${limit}`;
  }
  if (transform.mode === "group") {
    return `${transform.operation.toUpperCase()} ${transform.valueField} by ${transform.groupField} → ${transform.outputField}`;
  }
  const methodLabels = {
    "equal-width": "Equal width",
    "fixed-width": "Fixed width",
    quantile: "Quantile",
  };
  return `${transform.field}: ${methodLabels[transform.method]} → ${transform.outputField}`;
}

function applyTransform() {
  const column = selectedColumn.value;
  if (!props.chartId || !column || !canApplyTransform.value) return;
  const id = `transform:${crypto.randomUUID()}`;
  let transform: ChartDataTransform;

  if (transformEditorMode.value === "filter") {
    transform = column.type === "quantitative"
      ? {
        id,
        kind: "filter",
        mode: "numeric",
        field: column.name,
        operator: numericFilterOperator.value,
        value: numericFilterValue.value,
        upperValue: numericFilterOperator.value === "between"
          ? numericFilterUpperValue.value
          : undefined,
      }
      : {
        id,
        kind: "filter",
        mode: "values",
        field: column.name,
        values: [...selectedFilterValues.value],
        single: valueFilterPurpose.value !== "filter",
        purpose: valueFilterPurpose.value,
      };
  } else if (column.type === "quantitative") {
    transform = {
      id,
      kind: "aggregate",
      mode: "bin",
      field: column.name,
      method: binMethod.value,
      parameter: binParameter.value,
      outputField: outputField.value.trim(),
    };
  } else {
    transform = {
      id,
      kind: "aggregate",
      mode: "group",
      groupField: column.name,
      valueField: aggregateValueField.value,
      operation: aggregateOperation.value,
      outputField: outputField.value.trim(),
    };
  }

  emit("transformsChange", [...transforms.value, transform]);
  closeTransformEditor();
  void nextTick(updateExpandedWidth);
}

function removeTransform(transformId: string) {
  if (!props.chartId) return;
  emit("transformsChange", transforms.value.filter((transform) => transform.id !== transformId));
  void nextTick(updateExpandedWidth);
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && transformEditorMode.value) closeTransformEditor();
}

async function ensurePresetDatasets() {
  const presets = [
    { name: "case1.csv", source: case1Csv },
    { name: "case2.csv", source: case2Csv },
    { name: "case3.csv", source: case3Csv },
    { name: "academic_scores.csv", source: academicScoresCsv },
    { name: "tree_nodes.csv", source: treeNodesCsv },
  ];
  for (const preset of presets) {
    if (!datasets.value.some((dataset) => dataset.name === preset.name)) {
      await importDataset(new File([preset.source], preset.name, { type: "text/csv" }));
    }
  }
  if (!datasets.value.some((dataset) => dataset.name === "nodes.csv + edges.csv")) {
    await importGraphDataset(
      new File([graphNodesCsv], "nodes.csv", { type: "text/csv" }),
      new File([graphEdgesCsv], "edges.csv", { type: "text/csv" }),
      "nodes.csv + edges.csv",
    );
  }
  const preferred = presetDatasets.value.find((dataset) => dataset.name === "case1.csv") ?? presetDatasets.value[0];
  if (preferred) setActiveDataset(preferred.id);
  await nextTick(updateExpandedWidth);
}

async function syncLocalGeometry(dataset: Dataset) {
  const binding = localGeometryBindings.find((item) => item.datasetName === dataset.name);
  if (!binding || !dataset.columns.some((column) => column.name === binding.field)) return;
  geographicJoinField.value = binding.field;
  const existing = geometrySources.value.find((source) => source.name === binding.sourceName);
  if (existing) {
    setActiveGeometrySource(existing.id);
    return;
  }
  if (localGeometryLoading.has(binding.sourceName)) return;
  localGeometryLoading.add(binding.sourceName);
  try {
    const response = await fetch(binding.path);
    if (!response.ok) return;
    const source = await importGeometrySource(new File(
      [await response.blob()],
      binding.sourceName,
      { type: "application/geo+json" },
    ));
    if (source) {
      setActiveGeometrySource(source.id);
      geographicJoinField.value = binding.field;
    }
  } catch {
    // Local pairing is optional; users can import another geometry source.
  } finally {
    localGeometryLoading.delete(binding.sourceName);
  }
}

onMounted(() => {
  window.addEventListener("resize", updateExpandedWidth);
  window.addEventListener("keydown", onWindowKeydown);
  void ensurePresetDatasets();
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateExpandedWidth);
  window.removeEventListener("keydown", onWindowKeydown);
});

watch(() => props.chartId, closeTransformEditor);
watch(headers, () => void nextTick(updateExpandedWidth));
watch(activeDataset, (dataset) => {
  if (dataset) void syncLocalGeometry(dataset);
}, { immediate: true });
</script>

<template>
  <aside
    ref="panelRef"
    class="data-panel"
    :class="{ 'data-panel--expanded': canExpand && isExpanded }"
    :style="panelStyle"
    aria-label="Imported data"
  >
    <header class="data-panel__header">
      <div class="data-panel__title">
        <h2>Data</h2>
      </div>
      <div class="data-panel__actions">
        <input
          ref="csvFileInput"
          class="data-panel__file-input"
          type="file"
          accept=".csv,text/csv"
          @change="onCsvFileChange"
        />
        <input
          ref="geometryFileInput"
          class="data-panel__file-input"
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          @change="onGeometryFileChange"
        />
        <button
          class="data-panel__icon-button"
          type="button"
          title="Import data"
          aria-label="Import data"
          :aria-expanded="importMenuOpen"
          @click="importMenuOpen = !importMenuOpen"
        >
          <Upload :size="15" aria-hidden="true" />
        </button>
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
      </div>
    </header>

    <div v-if="importMenuOpen" class="import-menu" role="menu" aria-label="Import data type">
      <button type="button" role="menuitem" @click="csvFileInput?.click()">
        <FileSpreadsheet :size="14" aria-hidden="true" />
        <span>CSV table</span>
      </button>
      <button
        type="button"
        role="menuitem"
        :disabled="presetDatasets.length === 0"
        :title="presetDatasets.length === 0 ? 'Import a CSV table first' : 'Import GeoJSON geometry'"
        @click="geometryFileInput?.click()"
      >
        <MapPinned :size="14" aria-hidden="true" />
        <span>GeoJSON geometry</span>
      </button>
      <section class="graph-import" aria-label="Import graph tables">
        <header class="graph-import__header">
          <strong>Graph</strong>
          <small>Nodes and edges</small>
        </header>
        <input
          ref="graphNodesFileInput"
          class="data-panel__file-input"
          type="file"
          accept=".csv,text/csv"
          @change="onGraphFileChange('nodes', $event)"
        />
        <input
          ref="graphEdgesFileInput"
          class="data-panel__file-input"
          type="file"
          accept=".csv,text/csv"
          @change="onGraphFileChange('edges', $event)"
        />
        <div class="graph-import__controls">
          <button type="button" @click="graphNodesFileInput?.click()">
            {{ graphNodesFile?.name ?? "Select nodes CSV" }}
          </button>
          <button type="button" @click="graphEdgesFileInput?.click()">
            {{ graphEdgesFile?.name ?? "Select edges CSV" }}
          </button>
          <button
            type="button"
            class="graph-import__submit"
            :disabled="!graphNodesFile || !graphEdgesFile || isLoading"
            @click="importGraphFiles"
          >
            Import graph
          </button>
        </div>
      </section>
    </div>

    <div
      class="data-panel__meta"
      :class="{ 'data-panel__meta--empty': presetDatasets.length === 0 }"
    >
      <select
        class="data-panel__dataset-select"
        :value="activeDataset?.id ?? ''"
        aria-label="Select dataset"
        :disabled="isLoading || presetDatasets.length === 0"
        @change="onDatasetChange"
      >
        <option v-for="dataset in presetDatasets" :key="dataset.id" :value="dataset.id">
          {{ dataset.name }}
        </option>
      </select>
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
                <MapPinned v-if="isGeographicJoinColumn(header)" :size="12" aria-label="Geographic join field" />
              </span>
              <select
                :value="displayColumnType(columns[columnIndex]?.type)"
                class="data-table__column-type"
                aria-label="Column type"
                @change="onColumnTypeChange(header, $event)"
              >
                <option value="nominal">nominal</option>
                <option value="ordinal">ordinal</option>
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
      <table
        v-else
        class="data-table data-table--transposed"
      >
        <thead>
          <tr>
            <th class="data-table__field-name" scope="col">Field</th>
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
                <MapPinned v-if="isGeographicJoinColumn(column.name)" :size="12" aria-label="Geographic join field" />
              </span>
              <select
                :value="displayColumnType(column.type)"
                class="data-table__column-type"
                :aria-label="`${column.name} column type`"
                @change="onColumnTypeChange(column.name, $event)"
              >
                <option value="nominal">nominal</option>
                <option value="ordinal">ordinal</option>
                <option value="quantitative">quantitative</option>
              </select>
            </th>
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
                <span
                  class="data-table__draggable-field"
                  draggable="true"
                  @dragstart="onGraphColumnDragStart(graphTable.key, graphTable.table.columns[columnIndex]!, $event)"
                  @dragend="endCsvColumnDrag"
                >
                  <GripVertical :size="12" :stroke-width="1.8" aria-hidden="true" />
                  <span class="data-table__column-label">{{ header }}</span>
                </span>
                <select
                  :value="displayColumnType(graphTable.table.columns[columnIndex]?.type)"
                  aria-label="Column type"
                  @change="onColumnTypeChange(header, $event, graphTable.key)"
                >
                  <option value="nominal">nominal</option>
                  <option value="ordinal">ordinal</option>
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
                <span
                  class="data-table__draggable-field"
                  draggable="true"
                  @dragstart="onGraphColumnDragStart(graphTable.key, column, $event)"
                  @dragend="endCsvColumnDrag"
                >
                  <GripVertical :size="12" :stroke-width="1.8" aria-hidden="true" />
                  <span class="data-table__column-label">{{ column.name }}</span>
                </span>
                <select
                  :value="displayColumnType(column.type)"
                  :aria-label="`${column.name} column type`"
                  @change="onColumnTypeChange(column.name, $event, graphTable.key)"
                >
                  <option value="nominal">nominal</option>
                  <option value="ordinal">ordinal</option>
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

    <section v-if="!isGraph" class="transform-panel" aria-label="Filter and aggregate">
      <header class="transform-panel__header">
        <div>
          <h3>Chart transform</h3>
          <small>{{ chartName || "Select a chart" }}</small>
        </div>
        <span v-if="transforms.length">{{ transforms.length }}</span>
      </header>
      <div v-if="transforms.length" class="transform-panel__list">
        <div
          v-for="transform in transforms"
          :key="transform.id"
          class="transform-panel__item"
        >
          <Filter v-if="transform.kind === 'filter'" :size="14" aria-hidden="true" />
          <ListFilter v-else-if="transform.kind === 'order'" :size="14" aria-hidden="true" />
          <Sigma v-else :size="14" aria-hidden="true" />
          <span :title="transformSummary(transform)">{{ transformSummary(transform) }}</span>
          <button
            type="button"
            title="Remove transform"
            aria-label="Remove transform"
            @click="removeTransform(transform.id)"
          >
            <Trash2 :size="13" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="transform-panel__actions">
        <button
          type="button"
          :disabled="!canEditChartTransforms"
          @click="resetTransformForm('filter')"
        >
          <Filter :size="14" aria-hidden="true" />
          <span>Filter</span>
          <Plus :size="12" aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="!canEditChartTransforms"
          @click="resetTransformForm('aggregate')"
        >
          <Sigma :size="14" aria-hidden="true" />
          <span>Aggregate</span>
          <Plus :size="12" aria-hidden="true" />
        </button>
      </div>
    </section>
  </aside>

  <Teleport to="body">
    <div
      v-if="transformEditorMode"
      class="transform-dialog-backdrop"
      @mousedown.self="closeTransformEditor"
    >
      <section
        class="transform-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${transformEditorMode}-dialog-title`"
      >
        <header class="transform-dialog__header">
          <div class="transform-dialog__title">
            <Filter v-if="transformEditorMode === 'filter'" :size="17" aria-hidden="true" />
            <Sigma v-else :size="17" aria-hidden="true" />
            <h2 :id="`${transformEditorMode}-dialog-title`">
              Add {{ transformEditorMode === "filter" ? "filter" : "aggregate" }}
            </h2>
          </div>
          <button
            class="transform-dialog__close"
            type="button"
            title="Close"
            aria-label="Close"
            @click="closeTransformEditor"
          >
            <X :size="16" aria-hidden="true" />
          </button>
        </header>

        <div class="transform-dialog__body">
          <label class="transform-control">
            <span>Column</span>
            <select v-model="selectedTransformColumn" autofocus @change="onTransformColumnChange">
              <option value="" disabled>Select a column</option>
              <option v-for="column in transformColumns" :key="column.name" :value="column.name">
                {{ column.name }} · {{ displayColumnType(column.type) }}
              </option>
            </select>
          </label>

          <template v-if="transformEditorMode === 'filter' && selectedColumn">
            <template v-if="!isSelectedColumnQuantitative">
              <fieldset class="transform-segmented">
                <legend>Purpose</legend>
                <div class="transform-segmented__options transform-segmented__options--purpose">
                  <label
                    v-for="option in valueFilterPurposeOptions"
                    :key="option.value"
                    :class="{ 'transform-segmented__active': valueFilterPurpose === option.value }"
                  >
                    <input
                      :checked="valueFilterPurpose === option.value"
                      type="radio"
                      name="value-filter-purpose"
                      :value="option.value"
                      @change="setValueFilterPurpose(option.value)"
                    />
                    <span>{{ option.label }}</span>
                  </label>
                </div>
              </fieldset>
              <div v-if="valueFilterPurpose === 'filter'" class="transform-dialog__inline-header">
                <div class="transform-dialog__text-actions">
                  <button type="button" @click="selectAllFilterValues">All</button>
                  <button type="button" @click="clearFilterValues">Clear</button>
                </div>
              </div>
              <div v-if="valueFilterPurpose === 'filter'" class="transform-value-list">
                <label v-for="value in selectedColumnValues" :key="value">
                  <input
                    type="checkbox"
                    :checked="selectedFilterValues.includes(value)"
                    @change="toggleFilterValue(value, $event)"
                  />
                  <span>{{ value || "(empty)" }}</span>
                </label>
              </div>
            </template>

            <template v-else>
              <label class="transform-control">
                <span>Condition</span>
                <select v-model="numericFilterOperator">
                  <option value="top">Top N</option>
                  <option value="bottom">Bottom N</option>
                  <option value="gte">≥ Greater than or equal</option>
                  <option value="gt">&gt; Greater than</option>
                  <option value="lte">≤ Less than or equal</option>
                  <option value="lt">&lt; Less than</option>
                  <option value="eq">= Equal</option>
                  <option value="between">Range</option>
                </select>
              </label>
              <div class="transform-number-row" :class="{ 'transform-number-row--range': numericFilterOperator === 'between' }">
                <label class="transform-control">
                  <span>{{ numericFilterOperator === "top" || numericFilterOperator === "bottom" ? "Count" : numericFilterOperator === "between" ? "Minimum" : "Value" }}</span>
                  <input
                    v-model.number="numericFilterValue"
                    type="number"
                    :min="numericFilterOperator === 'top' || numericFilterOperator === 'bottom' ? 1 : undefined"
                    :step="numericFilterOperator === 'top' || numericFilterOperator === 'bottom' ? 1 : 'any'"
                  />
                </label>
                <label v-if="numericFilterOperator === 'between'" class="transform-control">
                  <span>Maximum</span>
                  <input v-model.number="numericFilterUpperValue" type="number" step="any" />
                </label>
              </div>
            </template>
          </template>

          <template v-if="transformEditorMode === 'aggregate' && selectedColumn">
            <template v-if="!isSelectedColumnQuantitative">
              <label class="transform-control">
                <span>Value column</span>
                <select v-model="aggregateValueField" @change="updateAggregateOutputField">
                  <option value="" disabled>Select a quantitative column</option>
                  <option v-for="column in quantitativeColumns" :key="column.name" :value="column.name">
                    {{ column.name }}
                  </option>
                </select>
              </label>
              <fieldset class="transform-segmented">
                <legend>Operation</legend>
                <div class="transform-segmented__options">
                  <label :class="{ 'transform-segmented__active': aggregateOperation === 'sum' }">
                    <input
                      v-model="aggregateOperation"
                      type="radio"
                      value="sum"
                      @change="updateAggregateOutputField"
                    />
                    <span>Sum</span>
                  </label>
                  <label :class="{ 'transform-segmented__active': aggregateOperation === 'avg' }">
                    <input
                      v-model="aggregateOperation"
                      type="radio"
                      value="avg"
                      @change="updateAggregateOutputField"
                    />
                    <span>Average</span>
                  </label>
                </div>
              </fieldset>
            </template>

            <template v-else>
              <label class="transform-control">
                <span>Binning</span>
                <select v-model="binMethod" @change="binParameter = binMethod === 'fixed-width' ? 10 : 5">
                  <option value="equal-width">Equal width</option>
                  <option value="fixed-width">Fixed width</option>
                  <option value="quantile">Quantile</option>
                </select>
              </label>
              <label class="transform-control">
                <span>{{ binMethod === "fixed-width" ? "Bin width" : "Number of bins" }}</span>
                <input
                  v-model.number="binParameter"
                  type="number"
                  :min="binMethod === 'fixed-width' ? 0 : 2"
                  :step="binMethod === 'fixed-width' ? 'any' : 1"
                />
              </label>
            </template>

            <label class="transform-control">
              <span>New column</span>
              <input v-model="outputField" type="text" spellcheck="false" />
              <small v-if="outputField.trim() && !outputFieldIsAvailable">
                Choose a unique column name.
              </small>
            </label>
          </template>
        </div>

        <footer class="transform-dialog__footer">
          <button type="button" class="transform-dialog__cancel" @click="closeTransformEditor">
            Cancel
          </button>
          <button
            type="button"
            class="transform-dialog__apply"
            :disabled="!canApplyTransform"
            @click="applyTransform"
          >
            Apply
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
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

.data-panel__file-input {
  display: none;
}

.import-menu {
  display: grid;
  gap: 5px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.1);
  background: #f4f8fc;
}

.import-menu > button {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 5px;
  background: #fff;
  color: #33465b;
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.import-menu > button:hover {
  border-color: rgba(28, 126, 214, 0.3);
  background: #edf5fc;
  color: #1554b2;
}

.import-menu > button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
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

.data-panel__meta {
  display: grid;
  gap: 3px;
  min-height: 52px;
  padding: 10px 12px;
  color: #6b7788;
  font-size: 11px;
}

.data-panel__dataset-select {
  width: 100%;
  min-width: 0;
  padding: 3px 24px 3px 5px;
  border: 1px solid rgba(28, 126, 214, 0.24);
  border-radius: 5px;
  background: #f7fbff;
  color: #27384b;
  font: inherit;
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.data-panel__dataset-select:focus-visible {
  outline: 2px solid rgba(28, 126, 214, 0.35);
  outline-offset: 1px;
}

.data-panel__dataset-select:disabled {
  opacity: 0.62;
  cursor: wait;
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
.graph-import { display: grid; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(24, 33, 47, 0.1); border-bottom: 1px solid rgba(24, 33, 47, 0.1); background: #f8fafc; }
.graph-import__header { display: grid; gap: 2px; }
.graph-import__header strong { color: #263548; font-size: 11px; }
.graph-import__header small { color: #718096; font-size: 10px; }
.graph-import__controls { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
.graph-import__controls button { min-width: 0; overflow: hidden; padding: 6px 8px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #42546c; font: inherit; font-size: 10px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.graph-import__controls button:disabled { cursor: not-allowed; opacity: 0.55; }
.graph-import__controls .graph-import__submit { background: #1554b2; color: #fff; font-weight: 700; text-align: center; }

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
  width: var(--data-table-field-width);
  min-width: var(--data-table-field-width) !important;
  max-width: var(--data-table-field-width) !important;
  background: #f1f5f8;
  color: #33465b;
  font-weight: 700;
}

.data-table--transposed .data-table__field-name {
  width: var(--data-table-field-width);
  min-width: var(--data-table-field-width) !important;
  max-width: var(--data-table-field-width) !important;
}

.data-table--transposed .data-table__field-name::after {
  position: absolute;
  top: 0;
  right: -1px;
  bottom: -1px;
  width: 1px;
  background: #d7e0e9;
  content: "";
}

/* Keep graph table labels readable while either table is scrolled horizontally. */
.graph-table-section .data-table__row-number,
.graph-table-section .data-table__field-name {
  position: sticky;
  left: 0;
  z-index: 4;
  background: #f1f5f8;
  background-clip: padding-box;
}

.graph-table-section .data-table thead .data-table__row-number,
.graph-table-section .data-table thead .data-table__field-name {
  z-index: 5;
  background: #e5edf4;
}

.data-table thead .data-table__field-name {
  z-index: 3;
  background: #e5edf4;
}

.data-table--transposed .data-table__field-name span,
.data-table--transposed .data-table__field-name .data-table__column-label {
  display: block;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.data-table:not(.data-table--transposed) thead th:not(.data-table__row-number) {
  max-width: none;
}

.data-table:not(.data-table--transposed) thead .data-table__column-label {
  overflow: visible;
  text-overflow: clip;
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

.transform-panel {
  flex: 0 0 auto;
  border-top: 1px solid rgba(24, 33, 47, 0.1);
  background: #f8fafc;
}

.transform-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 7px 12px 5px;
}

.transform-panel__header h3 {
  margin: 0;
  color: #516176;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.transform-panel__header > div {
  min-width: 0;
}

.transform-panel__header small {
  display: block;
  max-width: 240px;
  margin-top: 2px;
  overflow: hidden;
  color: #7a8797;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transform-panel__header span {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 8px;
  background: #e2e8ef;
  color: #5d6c7d;
  font-size: 9px;
  text-align: center;
}

.transform-panel__list {
  display: grid;
  gap: 4px;
  max-height: 112px;
  padding: 0 8px 6px;
  overflow-y: auto;
}

.transform-panel__item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 24px;
  align-items: center;
  min-height: 30px;
  padding: 2px 2px 2px 7px;
  border: 1px solid #dfe5eb;
  border-radius: 5px;
  background: #fff;
  color: #52657a;
}

.transform-panel__item > svg {
  color: #75869a;
}

.transform-panel__item > span {
  min-width: 0;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transform-panel__item button,
.transform-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #8491a0;
  cursor: pointer;
}

.transform-panel__item button:hover,
.transform-dialog__close:hover {
  background: #fff0f0;
  color: #b42f2f;
}

.transform-panel__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 8px 9px;
}

.transform-panel__actions button {
  display: grid;
  grid-template-columns: 16px 1fr 12px;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 32px;
  padding: 5px 8px;
  border: 1px solid #cfd9e3;
  border-radius: 6px;
  background: #fff;
  color: #40566d;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.transform-panel__actions button:hover:not(:disabled) {
  border-color: rgba(28, 126, 214, 0.42);
  background: #edf5fc;
  color: #1554b2;
}

.transform-panel__actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.transform-dialog-backdrop {
  position: fixed;
  z-index: 2400;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(17, 24, 34, 0.38);
}

.transform-dialog {
  display: flex;
  flex-direction: column;
  width: min(440px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 40px));
  overflow: hidden;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 22px 55px rgba(21, 32, 46, 0.24);
}

.transform-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid #e4e8ed;
}

.transform-dialog__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #42586f;
}

.transform-dialog__title h2 {
  margin: 0;
  color: #202e3d;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
}

.transform-dialog__body {
  display: grid;
  gap: 16px;
  min-height: 160px;
  padding: 16px;
  overflow-y: auto;
}

.transform-control {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.transform-control > span,
.transform-segmented legend {
  color: #526174;
  font-size: 11px;
  font-weight: 700;
}

.transform-control select,
.transform-control input {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 6px 9px;
  border: 1px solid #cfd7e0;
  border-radius: 6px;
  background: #fff;
  color: #253648;
  font: inherit;
  font-size: 12px;
}

.transform-control select:focus,
.transform-control input:focus {
  border-color: #438dcc;
  outline: 2px solid rgba(28, 126, 214, 0.16);
  outline-offset: 0;
}

.transform-control small {
  color: #b23a3a;
  font-size: 10px;
}

.transform-dialog__inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}

.transform-toggle,
.transform-value-list label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #34495e;
  font-size: 11px;
  cursor: pointer;
}

.transform-toggle input,
.transform-value-list input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #1c7ed6;
}

.transform-dialog__text-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.transform-dialog__text-actions button {
  padding: 2px 5px;
  border: 0;
  background: transparent;
  color: #1b67a6;
  font-size: 10px;
  cursor: pointer;
}

.transform-dialog__text-actions button:hover {
  text-decoration: underline;
}

.transform-value-list {
  display: grid;
  gap: 1px;
  max-height: 230px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid #dce2e8;
  border-radius: 6px;
  background: #f9fafb;
}

.transform-value-list label {
  min-height: 30px;
  padding: 4px 7px;
  border-radius: 4px;
}

.transform-value-list label:hover {
  background: #edf3f8;
}

.transform-value-list label span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.transform-number-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.transform-number-row--range {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.transform-segmented {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.transform-segmented legend {
  margin-bottom: 6px;
  padding: 0;
}

.transform-segmented__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.transform-segmented__options--purpose {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.transform-segmented__options label {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border: 1px solid #cfd7e0;
  background: #fff;
  color: #526174;
  font-size: 11px;
  cursor: pointer;
}

.transform-segmented__options label:first-of-type {
  border-radius: 6px 0 0 6px;
}

.transform-segmented__options label + label {
  border-left: 0;
}

.transform-segmented__options label:last-of-type {
  border-radius: 0 6px 6px 0;
}

.transform-segmented__options label.transform-segmented__active {
  border-color: #438dcc;
  background: #e5f1fb;
  color: #1554b2;
  font-weight: 700;
}

.transform-segmented input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.transform-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 58px;
  padding: 10px 16px;
  border-top: 1px solid #e4e8ed;
  background: #f8fafc;
}

.transform-dialog__footer button {
  min-width: 76px;
  height: 34px;
  padding: 6px 13px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.transform-dialog__cancel {
  border: 1px solid #cfd7e0;
  background: #fff;
  color: #526174;
}

.transform-dialog__apply {
  border: 1px solid #176eb8;
  background: #1c7ed6;
  color: #fff;
}

.transform-dialog__apply:disabled {
  border-color: #b9c1ca;
  background: #c5ccd4;
  cursor: not-allowed;
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

  .transform-dialog-backdrop {
    align-items: end;
    padding: 10px;
  }

  .transform-dialog {
    width: 100%;
    max-height: calc(100vh - 20px);
  }
}
</style>
