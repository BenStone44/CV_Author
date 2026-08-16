<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  GripVertical,
  Trash2,
  Upload,
  X,
} from "@lucide/vue";
import defaultCsv from "../../data/case1.csv?raw";
import EncodingChannelField from "./EncodingChannelField.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import {
  beginCubeBindingDrag,
  CUBE_BINDING_MIME,
  cubeSelectionForChartFields,
  endCubeBindingDrag,
} from "./cubeBinding";
import type { CubeSelectionState } from "./cubeBinding";
import { cubeResultFromDataset } from "./cubeModel";
import {
  getEncodingChannelConfigsForSpec,
  resolvedEncodingField,
  resolvedPolarAxisRoles,
  resolvedSeriesField,
} from "./encodingConfig";
import { useDatasetStore } from "./useDatasetStore";
import type {
  ChartEncodingChannel,
  ChartSpec,
  DataColumnType,
  LinearColorMapping,
  MarkGroupSharedConfig,
  SeriesStyleMapping,
} from "./types";
import {
  defaultColorMapping,
  isCategoricalColorMapping,
  isLinearColorMapping,
  isSeriesStyleMapping,
} from "./visualMapping";

const previewRowLimit = 250;

const props = withDefaults(defineProps<{
  selectedChartFields?: string[];
  selectedChartId?: string;
  selectedChartValueFilters?: Record<string, string[]>;
  selectedChartSpec?: ChartSpec;
  selectedChartMarkConfig?: MarkGroupSharedConfig;
}>(), {
  selectedChartFields: () => [],
  selectedChartId: "",
  selectedChartValueFilters: () => ({}),
  selectedChartSpec: undefined,
  selectedChartMarkConfig: () => ({}),
});

const emit = defineEmits<{
  cubeSelectionChange: [state: CubeSelectionState];
  encodingChannelChange: [channel: ChartEncodingChannel, field: string];
  seriesFieldChange: [field: string];
  markConfigChange: [patch: MarkGroupSharedConfig];
}>();

const {
  activeDataset,
  parseError,
  parseWarning,
  isLoading,
  importDataset,
  clearActiveDataset,
  setColumnType,
} = useDatasetStore();

type CubeColumnName = string;
type CubeColumn = { name: CubeColumnName; label: string; kind: "dimension" | "measure"; values: string[] };
type CubeAggregation = "sum" | "avg";

const cubeColumns = computed<CubeColumn[]>(() => {
  const dataset = activeDataset.value;
  if (!dataset) return [];
  const cube = cubeResultFromDataset(dataset);
  return [
    ...cube.schema.dimensions.map((dimension) => ({
      name: dimension.id,
      label: dimension.label,
      kind: "dimension" as const,
      values: dimension.members.map((member) => member.id),
    })),
    {
      name: "__measures__",
      label: "Measures",
      kind: "measure" as const,
      values: cube.schema.measures.map((measure) => measure.id),
    },
  ];
});

const cubeRows = computed(() => Array.from(
  { length: Math.max(0, ...cubeColumns.value.map((column) => column.values.length)) },
  (_, rowIndex) => cubeColumns.value.map((column) => column.values[rowIndex] ?? ""),
));

const selectedEncodingSpec = computed(() => {
  const spec = props.selectedChartSpec;
  return spec && spec.datasetId === activeDataset.value?.id ? spec : undefined;
});
const encodingConfigs = computed(() => selectedEncodingSpec.value
  ? getEncodingChannelConfigsForSpec(selectedEncodingSpec.value)
  : []);
type CubeFieldRole = {
  key: string;
  label: string;
  channel?: ChartEncodingChannel;
  kind: "encoding" | "series" | "facet";
};
type ActiveEncodingRole = ChartEncodingChannel | "series";
const activeEncodingChannel = ref<ActiveEncodingRole | null>(null);
const encodingPopoverPosition = ref({ left: 0, top: 0 });
const activeEncodingConfig = computed(() => {
  if (activeEncodingChannel.value === "series") {
    return {
      channel: "color" as const,
      label: "Series",
      role: "series" as const,
      required: false,
      accepts: ["nominal", "temporal"] as DataColumnType[],
      emptyLabel: "Not bound" as const,
    };
  }
  return encodingConfigs.value.find((config) => config.channel === activeEncodingChannel.value);
});
const activeEncodingField = computed(() => {
  const spec = selectedEncodingSpec.value;
  const channel = activeEncodingChannel.value;
  if (!spec || !channel) return "";
  return channel === "series" ? resolvedSeriesField(spec) : resolvedEncodingField(spec, channel);
});
const activeEncodingColumn = computed(() => columns.value.find((column) =>
  column.name === activeEncodingField.value,
));
const colorMapping = computed(() => isLinearColorMapping(props.selectedChartMarkConfig.colorMapping)
  ? props.selectedChartMarkConfig.colorMapping
  : defaultColorMapping);
const colorScaleGradient = computed(() => `linear-gradient(90deg, ${colorMapping.value.stops
  .map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`)
  .join(", ")})`);
const showActiveColorScale = computed(() => activeEncodingChannel.value === "color"
  && !!activeEncodingColumn.value
  && activeEncodingColumn.value.type !== "nominal");

const seriesField = computed(() => selectedEncodingSpec.value ? resolvedSeriesField(selectedEncodingSpec.value) : "");
const seriesStyleMapping = computed<SeriesStyleMapping>(() => {
  if (isSeriesStyleMapping(props.selectedChartMarkConfig.seriesStyleMapping)) {
    return props.selectedChartMarkConfig.seriesStyleMapping;
  }
  const legacy = isCategoricalColorMapping(props.selectedChartMarkConfig.seriesColorMapping)
    ? props.selectedChartMarkConfig.seriesColorMapping.values
    : {};
  return {
    type: "series-style",
    values: Object.fromEntries(Object.entries(legacy).map(([memberId, color]) => [memberId, { color }])),
  };
});
const seriesPalette = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];

function seriesMemberColor(memberId: string, index: number) {
  return seriesStyleMapping.value.values[memberId]?.color
    ?? seriesPalette[index % seriesPalette.length]!;
}

function updateSeriesMemberColor(memberId: string, color: string) {
  emit("markConfigChange", {
    seriesStyleMapping: {
      type: "series-style",
      values: {
        ...seriesStyleMapping.value.values,
        [memberId]: { ...seriesStyleMapping.value.values[memberId], color },
      },
    },
  });
}

function cubeFieldRoles(field: string): CubeFieldRole[] {
  const spec = selectedEncodingSpec.value;
  if (!spec) return [];
  const roles: CubeFieldRole[] = encodingConfigs.value
    .filter((config) => resolvedEncodingField(spec, config.channel) === field)
    .map((config) => ({
      key: config.channel,
      label: config.channel === "x"
        ? "X"
        : config.channel === "y"
          ? "Y"
          : config.channel === "angle"
            ? "Theta"
            : config.channel === "radius" ? "R" : config.label,
      channel: config.channel,
      kind: "encoding" as const,
    }));
  resolvedPolarAxisRoles(spec, field).forEach((axisRole) => {
    if (roles.some((role) => role.channel === axisRole.channel)) return;
    roles.push({
      key: axisRole.channel,
      label: axisRole.label,
      channel: axisRole.channel,
      kind: "encoding",
    });
  });
  if (resolvedSeriesField(spec) === field) roles.push({ key: "series", label: "Series", kind: "series" });
  if (spec.dimensionDecisions?.[field] === "facet") roles.push({ key: "facet", label: "Facet", kind: "facet" });
  return roles;
}

function openEncodingPopover(channel: ActiveEncodingRole, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const width = Math.min(270, window.innerWidth - 24);
  const estimatedHeight = channel === "color" ? 390 : 150;
  const openOnRight = rect.right + 8 + width <= window.innerWidth - 12;
  const left = openOnRight ? rect.right + 8 : rect.left - width - 8;
  activeEncodingChannel.value = channel;
  encodingPopoverPosition.value = {
    left: Math.max(12, Math.min(left, window.innerWidth - width - 12)),
    top: Math.max(12, Math.min(rect.top, window.innerHeight - estimatedHeight - 12)),
  };
}

function closeEncodingPopover() {
  activeEncodingChannel.value = null;
}

function updateEncodingField(channel: ActiveEncodingRole, field: string) {
  if (channel === "series") {
    emit("seriesFieldChange", field);
    return;
  }
  emit("encodingChannelChange", channel, field);
  const column = columns.value.find((item) => item.name === field);
  if (channel === "color" && column && column.type !== "nominal"
    && !isLinearColorMapping(props.selectedChartMarkConfig.colorMapping)) {
    emit("markConfigChange", { colorMapping: defaultColorMapping });
  }
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("[data-cube-encoding-popover], [data-cube-encoding-trigger]")) return;
  closeEncodingPopover();
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") closeEncodingPopover();
}

watch(
  [() => props.selectedChartId, () => activeDataset.value?.id],
  () => closeEncodingPopover(),
);

const selectedCubeValues = ref<Record<CubeColumnName, Set<number>>>({});
const cubeAggregations = ref<Record<CubeColumnName, CubeAggregation>>({});
const cubeAggregationEnabled = ref<Record<CubeColumnName, boolean>>({});

const selectionsByChart = new Map<string, {
  datasetId: string;
  values: Record<CubeColumnName, Set<string>>;
}>();
let projectedChartId = "";
let projectedDatasetId = "";
let projectedChartFields: string[] = [];
watch(
  [
    () => props.selectedChartId,
    () => activeDataset.value?.id,
    () => props.selectedChartFields,
    () => props.selectedChartValueFilters,
  ] as const,
  ([chartId, datasetId, fields]) => {
    const sameChart = chartId === projectedChartId && (datasetId ?? "") === projectedDatasetId;
    const cube = activeDataset.value ? cubeResultFromDataset(activeDataset.value) : undefined;
    const previousSelection = cubeSelectionForChartFields(projectedChartFields, cube);
    if (projectedChartId && projectedDatasetId === (datasetId ?? "")) {
      selectionsByChart.set(projectedChartId, {
        datasetId: projectedDatasetId,
        values: Object.fromEntries(cubeColumns.value.map((column) => [
          column.name,
          new Set(selectedCubeColumnValues(column.name)),
        ])) as Record<CubeColumnName, Set<string>>,
      });
    }
    const selection = cubeSelectionForChartFields(fields, activeDataset.value ? cubeResultFromDataset(activeDataset.value) : undefined);
    const cached = chartId ? selectionsByChart.get(chartId) : undefined;
    const saved = cached?.datasetId === (datasetId ?? "") ? cached.values : undefined;
    selectedCubeValues.value = Object.fromEntries(cubeColumns.value.map((column) => {
      if (column.kind === "measure") {
        // Keep local measure-set selections across the parent chart-spec update
        // triggered by the same checkbox event.
        const selectedMeasures = saved?.[column.name]
          ?? new Set(selection.values[column.name] ?? []);
        return [column.name, new Set(column.values.flatMap((value, index) =>
          selectedMeasures.has(value) ? [index] : [],
        ))];
      }
      const filteredValues = column.kind === "dimension" ? props.selectedChartValueFilters[column.name] : undefined;
      if (filteredValues) {
        return [column.name, new Set(column.values.flatMap((value, index) =>
          filteredValues.includes(value) ? [index] : [],
        ))];
      }
      const newlyBound = sameChart
        && selection.selected[column.name]
        && !previousSelection.selected[column.name];
      if (newlyBound && column.kind === "dimension") {
        return [column.name, new Set(column.values.map((_, index) => index))];
      }
      if (!saved && selection.selected[column.name]) {
        return [column.name, new Set(column.values.map((_, index) => index))];
      }
      if (saved) {
        return [column.name, new Set(column.values.flatMap((value, index) =>
          saved[column.name]?.has(value) ? [index] : [],
        ))];
      }
      const selectedValues = selection.values[column.name] ?? [];
      return [column.name, new Set(column.values.flatMap((value, index) =>
        selectedValues.includes(value) ? [index] : [],
      ))];
    })) as Record<CubeColumnName, Set<number>>;
    cubeAggregations.value = Object.fromEntries(cubeColumns.value.map((column) => [
      column.name,
      cubeAggregations.value[column.name] ?? "sum",
    ]));
    cubeAggregationEnabled.value = Object.fromEntries(cubeColumns.value.map((column) => [
      column.name,
      cubeAggregationEnabled.value[column.name] ?? false,
    ]));
    projectedChartId = chartId;
    projectedDatasetId = datasetId ?? "";
    projectedChartFields = [...fields];
  },
  { immediate: true },
);

function emitCubeSelection() {
  emit("cubeSelectionChange", {
    selected: Object.fromEntries(cubeColumns.value.map((column) => [
      column.name,
      (selectedCubeValues.value[column.name]?.size ?? 0) > 0,
    ])) as CubeSelectionState["selected"],
    values: Object.fromEntries(cubeColumns.value.map((column) => [
      column.name,
      selectedCubeColumnValues(column.name),
    ])) as CubeSelectionState["values"],
    fields: Object.fromEntries(cubeColumns.value.flatMap((column) =>
      column.kind === "dimension" ? [[column.name, column.name]] : [],
    )),
    aggregations: Object.fromEntries(cubeColumns.value.map((column) => [
      column.name,
      {
        enabled: cubeAggregationEnabled.value[column.name] ?? false,
        operation: cubeAggregations.value[column.name] ?? "sum",
      },
    ])) as CubeSelectionState["aggregations"],
  });
  if (props.selectedChartId) {
    selectionsByChart.set(props.selectedChartId, {
      datasetId: activeDataset.value?.id ?? "",
      values: Object.fromEntries(cubeColumns.value.map((column) => [
        column.name,
        new Set(selectedCubeColumnValues(column.name)),
      ])) as Record<CubeColumnName, Set<string>>,
    });
  }
}

function getCubeColumn(columnName: CubeColumnName) {
  return cubeColumns.value.find((column) => column.name === columnName)!;
}

function isCubeValueSelected(columnName: CubeColumnName, valueIndex: number) {
  return selectedCubeValues.value[columnName]?.has(valueIndex) ?? false;
}

function isCubeColumnAllSelected(columnName: CubeColumnName) {
  return (selectedCubeValues.value[columnName]?.size ?? 0)
    === getCubeColumn(columnName).values.length;
}

function isCubeColumnPartiallySelected(columnName: CubeColumnName) {
  const selectedCount = selectedCubeValues.value[columnName]?.size ?? 0;
  return selectedCount > 0
    && selectedCount < getCubeColumn(columnName).values.length;
}

function setCubeAggregation(columnName: CubeColumnName, event: Event) {
  cubeAggregations.value = {
    ...cubeAggregations.value,
    [columnName]: (event.target as HTMLSelectElement).value as CubeAggregation,
  };
  emitCubeSelection();
}

function toggleCubeAggregation(columnName: CubeColumnName, event: Event) {
  cubeAggregationEnabled.value = {
    ...cubeAggregationEnabled.value,
    [columnName]: (event.target as HTMLInputElement).checked,
  };
  emitCubeSelection();
}

function toggleCubeValue(
  columnName: CubeColumnName,
  valueIndex: number,
  event: Event,
) {
  const nextSelection = new Set(selectedCubeValues.value[columnName] ?? []);
  if ((event.target as HTMLInputElement).checked) {
    nextSelection.add(valueIndex);
  } else {
    nextSelection.delete(valueIndex);
  }
  selectedCubeValues.value = {
    ...selectedCubeValues.value,
    [columnName]: nextSelection,
  };
  emitCubeSelection();
}

function toggleCubeColumn(columnName: CubeColumnName, event: Event) {
  const column = getCubeColumn(columnName);
  const nextSelection = (event.target as HTMLInputElement).checked
    ? new Set(column.values.map((_, index) => index))
    : new Set<number>();
  selectedCubeValues.value = {
    ...selectedCubeValues.value,
    [columnName]: nextSelection,
  };
  emitCubeSelection();
}

function selectedCubeColumnValues(columnName: CubeColumnName) {
  const selectedIndexes = selectedCubeValues.value[columnName] ?? new Set<number>();
  return getCubeColumn(columnName).values.filter((_, index) =>
    selectedIndexes.has(index),
  );
}

function onCubeBindingDragStart(
  columnName: CubeColumnName,
  event: DragEvent,
  valueIndex?: number,
) {
  if (!event.dataTransfer) {
    event.preventDefault();
    return;
  }
  if (valueIndex !== undefined && !isCubeValueSelected(columnName, valueIndex)) {
    selectedCubeValues.value = {
      ...selectedCubeValues.value,
      [columnName]: new Set([valueIndex]),
    };
    emitCubeSelection();
  }
  let values = selectedCubeColumnValues(columnName);
  const column = getCubeColumn(columnName);
  if (values.length === 0) values = [...column.values];
  const aggregation = cubeAggregationEnabled.value[columnName]
    ? cubeAggregations.value[columnName]
    : undefined;
  const serialized = beginCubeBindingDrag(column.kind === "dimension"
    ? { kind: "dimension", dimensionId: column.name, memberIds: values, aggregation }
    : { kind: "measure-set", measureIds: values, aggregation });
  event.dataTransfer.setData(CUBE_BINDING_MIME, serialized);
  event.dataTransfer.effectAllowed = "copy";
}

function onCubeBindingDragEnd() {
  endCubeBindingDrag();
}

const fileInputRef = ref<HTMLInputElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const dataTableRef = ref<HTMLTableElement | null>(null);
const isDragging = ref(false);
const expandedWidth = ref(304);
const canExpand = ref(false);
const isExpanded = ref(false);
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
    isExpanded.value = false;
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

function toggleExpanded() {
  if (!canExpand.value) return;
  isExpanded.value = !isExpanded.value;
}

function onColumnTypeChange(columnName: string, event: Event) {
  const dataset = activeDataset.value;
  const type = (event.target as HTMLSelectElement).value as DataColumnType;
  if (dataset) setColumnType(dataset.id, columnName, type);
}

onMounted(() => {
  window.addEventListener("resize", updateExpandedWidth);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);
  if (!activeDataset.value) {
    importCsv(new File([defaultCsv], "case1.csv", { type: "text/csv" }));
  } else {
    void nextTick(updateExpandedWidth);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateExpandedWidth);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeyDown);
});
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

    <section class="cube-result" aria-labelledby="cube-result-title">
      <header class="data-panel__section-header">
        <h3 id="cube-result-title">Cube result</h3>
        <span>{{ cubeColumns.filter((column) => column.kind === 'dimension').length }} dimensions / {{ cubeColumns.find((column) => column.kind === 'measure')?.values.length ?? 0 }} measures</span>
      </header>
      <div class="cube-table-wrap">
        <table class="cube-table">
          <thead>
            <tr>
              <th
                v-for="column in cubeColumns"
                :key="column.name"
                scope="col"
              >
                <div class="cube-table__header-content">
                  <label class="cube-table__checkbox-label">
                    <input
                      class="cube-table__checkbox"
                      type="checkbox"
                      :checked="isCubeColumnAllSelected(column.name)"
                      :indeterminate="isCubeColumnPartiallySelected(column.name)"
                      :aria-label="`Select all ${column.name} values`"
                      @change="toggleCubeColumn(column.name, $event)"
                    />
                    <span>{{ column.label }}</span>
                  </label>
                  <div v-if="cubeFieldRoles(column.name).length" class="cube-table__encoding-badges">
                    <button
                      v-for="role in cubeFieldRoles(column.name)"
                      :key="role.key"
                      type="button"
                      class="cube-table__encoding-badge"
                      :class="{ 'cube-table__encoding-badge--static': role.kind === 'facet' }"
                      data-cube-encoding-trigger
                      :title="role.kind === 'facet' ? `${column.label} is used as a facet` : `Edit ${role.label} encoding`"
                      :aria-label="role.kind === 'facet' ? `${column.label} facet` : `Edit ${role.label} encoding for ${column.label}`"
                      :disabled="role.kind === 'facet'"
                      @click.stop="role.kind !== 'facet' && openEncodingPopover(role.kind === 'series' ? 'series' : role.channel!, $event)"
                    >
                      <span
                        v-if="role.channel === 'color'"
                        class="cube-table__color-swatch"
                        :style="{ background: colorScaleGradient }"
                        aria-hidden="true"
                      ></span>
                      {{ role.label }}
                    </button>
                  </div>
                  <span
                    class="cube-table__drag-handle"
                    draggable="true"
                    role="button"
                    :title="`Drag ${column.label} ${column.kind}`"
                    :aria-label="`Drag ${column.label} ${column.kind}`"
                    @dragstart.stop="onCubeBindingDragStart(column.name, $event)"
                    @dragend="onCubeBindingDragEnd"
                  >
                    <GripVertical :size="13" aria-hidden="true" />
                  </span>
                </div>
                <div v-if="column.kind === 'measure'" class="cube-table__aggregation-row">
                  <label class="cube-table__aggregate-toggle">
                    <input
                      class="cube-table__checkbox"
                      type="checkbox"
                      :checked="cubeAggregationEnabled[column.name]"
                      :aria-label="`Aggregate ${column.name}`"
                      @change="toggleCubeAggregation(column.name, $event)"
                    />
                  </label>
                  <select
                    class="cube-table__aggregation"
                    :value="cubeAggregations[column.name]"
                    :disabled="!cubeAggregationEnabled[column.name]"
                    :aria-label="`${column.name} aggregation`"
                    @click.stop
                    @change="setCubeAggregation(column.name, $event)"
                  >
                    <option value="sum">Sum</option>
                    <option value="avg">Avg</option>
                  </select>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in cubeRows" :key="rowIndex">
              <td
                v-for="(cell, columnIndex) in row"
                :key="columnIndex"
                :class="{
                  'cube-table__cell--selected': cell
                    && isCubeValueSelected(cubeColumns[columnIndex]!.name, rowIndex),
                }"
              >
                <div v-if="cell" class="cube-table__cell-content">
                  <label class="cube-table__checkbox-label">
                    <input
                      class="cube-table__checkbox"
                      type="checkbox"
                      :checked="isCubeValueSelected(cubeColumns[columnIndex]!.name, rowIndex)"
                      :aria-label="`Select ${cell}`"
                      @change="toggleCubeValue(cubeColumns[columnIndex]!.name, rowIndex, $event)"
                    />
                    <span
                      :title="cell"
                      class="cube-table__draggable-value"
                      draggable="true"
                      @dragstart.stop="onCubeBindingDragStart(cubeColumns[columnIndex]!.name, $event, rowIndex)"
                      @dragend="onCubeBindingDragEnd"
                    >{{ cell }}</span>
                  </label>
                  <input
                    v-if="cubeColumns[columnIndex]!.name === seriesField"
                    class="cube-table__series-color"
                    type="color"
                    :value="seriesMemberColor(cell, rowIndex)"
                    :title="`Set ${cell} series color`"
                    :aria-label="`${cell} series color`"
                    @input="updateSeriesMemberColor(cell, ($event.target as HTMLInputElement).value)"
                  />
                  <div
                    v-if="cubeColumns[columnIndex]!.kind === 'measure' && cubeFieldRoles(cell).length"
                    class="cube-table__encoding-badges"
                    :class="{ 'cube-table__encoding-badges--inline': cubeFieldRoles(cell).length === 1 }"
                  >
                    <button
                      v-for="role in cubeFieldRoles(cell)"
                      :key="role.key"
                      type="button"
                      class="cube-table__encoding-badge"
                      data-cube-encoding-trigger
                      :title="`Edit ${role.label} encoding`"
                      :aria-label="`Edit ${role.label} encoding for ${cell}`"
                      @click.stop="openEncodingPopover(role.kind === 'series' ? 'series' : role.channel!, $event)"
                    >
                      <span
                        v-if="role.channel === 'color'"
                        class="cube-table__color-swatch"
                        :style="{ background: colorScaleGradient }"
                        aria-hidden="true"
                      ></span>
                      {{ role.label }}
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <header class="data-panel__section-header data-panel__section-header--source">
      <h3>Source CSV</h3>
      <span>{{ tableStatus }}</span>
    </header>

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

    <Teleport to="body">
      <aside
        v-if="activeEncodingConfig && selectedEncodingSpec"
        class="cube-encoding-popover"
        data-cube-encoding-popover
        role="dialog"
        aria-modal="false"
        :aria-label="`${activeEncodingConfig.label} encoding`"
        :style="{
          left: `${encodingPopoverPosition.left}px`,
          top: `${encodingPopoverPosition.top}px`,
        }"
        @click.stop
        @pointerdown.stop
      >
        <header class="cube-encoding-popover__header">
          <div>
            <strong>ENCODING</strong>
            <span>{{ activeEncodingConfig.label }}</span>
          </div>
          <button type="button" title="Close" aria-label="Close encoding editor" @click="closeEncodingPopover">
            <X :size="15" :stroke-width="1.7" aria-hidden="true" />
          </button>
        </header>
        <EncodingChannelField
          :config="activeEncodingConfig"
          :columns="columns"
          :value="activeEncodingField"
          @change="updateEncodingField(activeEncodingChannel!, $event)"
        />
        <VisualMappingEditor
          v-if="showActiveColorScale"
          show-color
          :color-mapping="colorMapping"
          @color-change="(mapping: LinearColorMapping) => emit('markConfigChange', { colorMapping: mapping })"
        />
      </aside>
    </Teleport>
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

.cube-result {
  flex: 0 0 min(38%, 330px);
  min-height: 190px;
  overflow: hidden;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: #fff;
}

.data-panel__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: #f4f7fa;
}

.data-panel__section-header h3 {
  margin: 0;
  color: #33465b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.data-panel__section-header span {
  color: #7a8797;
  font-size: 10px;
}

.data-panel__section-header--source {
  flex: 0 0 auto;
  margin-top: 8px;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
}

.cube-table-wrap {
  height: calc(100% - 34px);
  overflow: auto;
  scrollbar-gutter: stable;
}

.cube-table {
  width: 100%;
  min-width: 300px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  color: #263548;
  font-size: 11px;
  line-height: 1.35;
}

.cube-table th,
.cube-table td {
  width: 33.333%;
  height: 30px;
  padding: 6px 4px;
  overflow: hidden;
  border-right: 1px solid #e5eaf0;
  border-bottom: 1px solid #e5eaf0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cube-table__checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  cursor: pointer;
}

.cube-table__checkbox-label span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cube-table__header-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 13px;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.cube-table__header-content .cube-table__checkbox-label {
  grid-column: 1;
  gap: 3px;
}

.cube-table__header-content > .cube-table__encoding-badges {
  grid-column: 2;
  grid-row: 1;
  justify-content: flex-end;
}

.cube-table__header-content .cube-table__encoding-badge {
  padding-right: 2px;
  padding-left: 2px;
}

.cube-table__header-content > .cube-table__drag-handle {
  grid-column: 3;
  grid-row: 1;
  width: 10px;
  height: 18px;
}

.cube-table__cell-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.cube-table__cell-content > .cube-table__checkbox-label {
  min-width: 42px;
}

.cube-table__cell-content > .cube-table__encoding-badges {
  grid-column: 1 / -1;
  justify-content: flex-start;
  padding-left: 20px;
}

.cube-table__cell-content > .cube-table__encoding-badges--inline {
  grid-column: 2;
  grid-row: 1;
  justify-content: flex-end;
  padding-left: 0;
}

.cube-table__encoding-badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  min-width: 0;
}

.cube-table__encoding-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 20px;
  padding: 2px 4px;
  border: 1px solid #a9c5dc;
  border-radius: 4px;
  background: #f5faff;
  color: #155b8f;
  font: inherit;
  font-size: 7.5px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.cube-table__encoding-badge--static,
.cube-table__encoding-badge--static:disabled {
  border-color: #c5b8df;
  background: #f7f4fb;
  color: #664f91;
  cursor: default;
  opacity: 1;
}

.cube-table__series-color {
  width: 22px;
  height: 20px;
  padding: 2px;
  border: 1px solid #b5c3cf;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.cube-table__encoding-badge:hover {
  border-color: #5e9dcc;
  background: #e5f2fc;
  color: #104d79;
}

.cube-table__color-swatch {
  width: 12px;
  height: 8px;
  flex: 0 0 12px;
  border: 1px solid rgba(24, 33, 47, 0.16);
  border-radius: 2px;
}

.cube-table__aggregation-row {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 6px;
}

.cube-table__aggregate-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  color: #536273;
  font-size: 8px;
  font-weight: 600;
  cursor: pointer;
}

.cube-table__aggregation {
  min-width: 0;
  flex: 1 1 auto;
  height: 22px;
  padding: 2px 14px 2px 4px;
  border: 1px solid #aeb8c3;
  border-radius: 4px;
  background: #fff;
  color: #34475a;
  font: inherit;
  font-size: 9px;
  cursor: pointer;
}

.cube-table__aggregate-toggle .cube-table__checkbox {
  width: 12px;
  height: 12px;
  flex-basis: 12px;
}

.cube-table__aggregation:disabled {
  border-color: #c8ced5;
  background: #e2e5e9;
  color: #929aa4;
  cursor: not-allowed;
  opacity: 1;
}

.cube-table__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 4px;
  color: #58728c;
  cursor: grab;
}

.cube-table__drag-handle:hover {
  background: #d8e8f6;
  color: #1554b2;
}

.cube-table__drag-handle:active,
.cube-table__draggable-value:active {
  cursor: grabbing;
}

.cube-table__drag-handle--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.cube-table__draggable-value {
  cursor: grab;
}

.cube-table__checkbox {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  margin: 0;
  accent-color: #1c7ed6;
  cursor: pointer;
}

.cube-table__cell--selected {
  background: #eef6fd;
}

.cube-table th:last-child,
.cube-table td:last-child {
  border-right: 0;
}

.cube-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #e8f0f7;
  color: #33465b;
  font-weight: 700;
}

.cube-table thead th {
  padding-right: 3px;
  padding-left: 3px;
}

.cube-table tbody tr:nth-child(even) td {
  background: #f8fafc;
}

.cube-table tbody tr:nth-child(even) .cube-table__cell--selected {
  background: #e7f2fb;
}

:global(.cube-encoding-popover) {
  position: fixed;
  z-index: 1200;
  display: grid;
  width: min(270px, calc(100vw - 24px));
  max-height: min(520px, calc(100vh - 24px));
  gap: 12px;
  padding: 12px;
  overflow: auto;
  border: 1px solid rgba(24, 33, 47, 0.15);
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(35, 57, 78, 0.2);
  color: #263548;
  font-size: 11px;
}

:global(.cube-encoding-popover__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

:global(.cube-encoding-popover__header > div) {
  display: grid;
  min-width: 0;
  gap: 2px;
}

:global(.cube-encoding-popover__header strong) {
  color: #18212f;
  font-size: 10px;
  letter-spacing: 0.08em;
}

:global(.cube-encoding-popover__header span) {
  color: #687585;
  font-size: 11px;
}

:global(.cube-encoding-popover__header button) {
  display: inline-grid;
  width: 27px;
  height: 27px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #5b6a80;
  cursor: pointer;
}

:global(.cube-encoding-popover__header button:hover) {
  background: #edf5fc;
  color: #1554b2;
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

  .data-panel--expanded {
    flex-basis: auto;
    width: auto;
  }

  .cube-result {
    flex-basis: 200px;
  }
}
</style>
