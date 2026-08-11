<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { SlidersHorizontal, X } from "@lucide/vue";
import { CanvasCoordinateGuideView, CanvasNodeView } from "./CanvasNodeView";
import {
  CanvasCoordinateSystemLayer,
  CartesianCoordinateSystem,
  getCartesianAxisChannels,
} from "./CartesianCoordinateSystem";
import CsvDataPanel from "./CsvDataPanel.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import type {
  CanvasNode,
  CompositionType,
  EncodingChannel,
  LinearColorMapping,
  LinearSizeMapping,
  MarkGroupSharedConfig,
  OptionalEncodingChannel,
  SvgCandidate,
} from "./types";
import {
  useCanvasStore,
  coordinateOptions,
  compositionOptions,
  getFilterIconSvg,
} from "./useCanvasStore";
import { useDatasetStore } from "./useDatasetStore";
import { useLlmRenderer } from "./useLlmRenderer";
import { isLineChartType } from "./lineRenderer";
import {
  defaultColorMapping,
  defaultSizeMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
} from "./visualMapping";

const canvasRef = ref<HTMLElement | null>(null);
const encodingInspectorRef = ref<HTMLElement | null>(null);
const encodingInspectorPosition = ref<{ left: number; top: number } | null>(null);
const axisBindingAnchor = ref<{ x: number; y: number } | null>(null);

const {
  selectedCoordinateSystems,
  toggleCoordinateSystem,
  implementedTemplateCandidates,
  compositionCandidates,
  canvasNodes,
  viewZoom,
  viewPan,
  selectedIds,
  editingGroupPath,
  nestedBindingTarget,
  nestedBindingNode,
  nestedBindingColumns,
  nestedBindingSuggestedAngleFields,
  axisBindingTarget,
  axisBindingNode,
  axisBindingColumns,
  axisBindingSeriesCandidates,
  axisBindingSeriesValue,
  axisBindingEncodingValues,
  axisBindingOptionalCandidates,
  axisBindingRendererError,
  axisBindingAxis,
  axisBindingRelatedCharts,
  coordinateGuideNodes,
  contextMenu,
  draggedCandidateId,
  activeDropZone,
  interaction,
  loadingDrop,
  importNotice,
  selectedNodes,
  selectionBounds,
  selectionFrame,
  selectionRotation,
  editingGroupTransform,
  selectionOverlayZoom,
  rotationInputPosition,
  rotationInputVisible,
  marqueeBounds,
  selectionUnits,
  isPanning,
  canUndo,
  canRedo,
  canCopy,
  canDelete,
  canPaste,
  canGroup,
  canCompose,
  canFacet,
  canUngroup,
  canMoveSelectionForward,
  canMoveSelectionBackward,
  scaleHandles,
  rotateHandle,
  onCanvasPointerDown,
  onCanvasDragOver,
  onCanvasDragLeave,
  onCanvasDrop,
  onCanvasWheel,
  onCanvasContextMenu,
  onCanvasNodePointerDown,
  onCanvasNodeDoubleClick,
  onEditingGroupBackgroundPointerDown,
  applyDimensionRecommendation,
  onCanvasNodeContextMenu,
  onScaleHandlePointerDown,
  onRotateHandlePointerDown,
  onCoordinateOriginPointerDown,
  onCoordinateAxisScalePointerDown,
  onCoordinateAxisSelect,
  setAxisBindingChannel,
  bindAxisField,
  clearAxisBinding,
  confirmSeriesField,
  clearSeriesBinding,
  bindOptionalEncoding,
  clearOptionalEncoding,
  bindPolarRadiusField,
  clearPolarRadiusField,
  setPieAngleFields,
  setPieRadiusMode,
  setPieComponentRadiusField,
  updateAxisBindingMarkGroupConfig,
  closeAxisBinding,
  setSelectionRotation,
  onCandidateDragStart,
  onCandidateDragEnd,
  insertCompositionCandidate,
  undoCanvasChange,
  redoCanvasChange,
  clearCanvas,
  deleteSelectedNodes,
  reverseCoordinateAxis,
  copySelectedNodes,
  pasteClipboardNodes,
  groupSelectedItems,
  ungroupSelectedItems,
  dissolveSelectedGroups,
  createCompositionCandidate,
  confirmNestedBinding,
  closeNestedBinding,
  applyLlmRenderer,
  reorderSelectedNodes,
  alignSelection,
  resetCanvasZoom,
} = useCanvasStore(canvasRef);
const { activeDataset, getDataset } = useDatasetStore();
const llmRenderer = useLlmRenderer();
const {
  status: llmStatus,
  error: llmError,
  provenance: llmProvenance,
} = llmRenderer;
// Keep the experimental renderer disabled while template rendering is the default.
const llmRendererPaused = true;
const encodingReviewApprovedKey = ref("");
const nestedBindingPopupRef = ref<HTMLElement | null>(null);
const nestedBindingPopupPosition = ref<{ left: number; top: number } | null>(null);
const nestedPointXField = ref("");
const nestedPointYField = ref("");
const nestedPieRadiusField = ref("");
const nestedPieAngleFields = ref<string[]>([]);

const canConfirmNestedBinding = computed(() =>
  !!nestedPointXField.value
  && !!nestedPointYField.value
  && !!nestedPieRadiusField.value
  && nestedPieAngleFields.value.length > 0,
);

function positionNestedBindingPopup() {
  const board = canvasRef.value;
  const popup = nestedBindingPopupRef.value;
  const target = nestedBindingTarget.value;
  if (!board || !popup || !target) return;
  const boardRect = board.getBoundingClientRect();
  const margin = 12;
  const gap = 12;
  const anchorX = target.clientX - boardRect.left;
  const anchorY = target.clientY - boardRect.top;
  const preferredLeft = anchorX + gap;
  const left = preferredLeft + popup.offsetWidth <= boardRect.width - margin
    ? preferredLeft
    : anchorX - popup.offsetWidth - gap;
  const preferredTop = anchorY + gap;
  const top = preferredTop + popup.offsetHeight <= boardRect.height - margin
    ? preferredTop
    : anchorY - popup.offsetHeight - gap;
  nestedBindingPopupPosition.value = {
    left: Math.max(margin, Math.min(left, boardRect.width - popup.offsetWidth - margin)),
    top: Math.max(margin, Math.min(top, boardRect.height - popup.offsetHeight - margin)),
  };
}

function toggleNestedAngleField(field: string) {
  nestedPieAngleFields.value = nestedPieAngleFields.value.includes(field)
    ? nestedPieAngleFields.value.filter((item) => item !== field)
    : [...nestedPieAngleFields.value, field];
}

function submitNestedBinding() {
  if (!canConfirmNestedBinding.value) return;
  confirmNestedBinding({
    xField: nestedPointXField.value,
    yField: nestedPointYField.value,
    radiusField: nestedPieRadiusField.value,
    angleFields: nestedPieAngleFields.value,
  });
}

watch(nestedBindingTarget, (target) => {
  nestedBindingPopupPosition.value = null;
  if (!target) return;
  nestedPointXField.value = nestedBindingNode.value?.chartSpec?.encodings.x?.field ?? "";
  nestedPointYField.value = nestedBindingNode.value?.chartSpec?.encodings.y?.field ?? "";
  nestedPieRadiusField.value = nestedBindingNode.value?.nestedSpec?.radiusField
    ?? nestedPointYField.value;
  nestedPieAngleFields.value = nestedBindingNode.value?.nestedSpec?.valueFields?.length
    ? [...nestedBindingNode.value.nestedSpec.valueFields]
    : [...nestedBindingSuggestedAngleFields.value];
  void nextTick(positionNestedBindingPopup);
});

function isScatterChartType(chartType: string) {
  return chartType
    .replace(/[\s_-]/g, "")
    .toLowerCase()
    .includes("scatter");
}

function isPolarChartType(chartType: string) {
  const type = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return type.includes("pie") || type.includes("donut");
}

function isPieChartType(chartType: string) {
  const type = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return type.includes("pie") && !type.includes("donut");
}

function primaryEncodingLabel(node: CanvasNode | null, channel: EncodingChannel) {
  const type = node?.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase() ?? "";
  if (type.includes("pie") || type.includes("donut")) return channel === "x" ? "Category" : "Angle";
  if (type.includes("matrix") || type.includes("heatmap")) return channel === "x" ? "Column" : "Row";
  return `${channel.toUpperCase()} axis`;
}

function primaryEncodingField(node: CanvasNode | null, channel: EncodingChannel) {
  const type = node?.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase() ?? "";
  if (type.includes("pie") || type.includes("donut")) {
    return channel === "x" ? node?.chartSpec?.encodings.color?.field : node?.chartSpec?.encodings.angle?.field;
  }
  if (type.includes("matrix") || type.includes("heatmap")) {
    return channel === "x" ? node?.chartSpec?.encodings.column?.field : node?.chartSpec?.encodings.row?.field;
  }
  return node?.chartSpec?.encodings[channel]?.field;
}

function isPrimaryEncodingCompatible(node: CanvasNode | null, channel: EncodingChannel, type: string) {
  const chartType = node?.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase() ?? "";
  if (chartType.includes("pie") || chartType.includes("donut")) return channel === "x" ? type !== "quantitative" : type === "quantitative";
  if (chartType.includes("matrix") || chartType.includes("heatmap")) return type !== "quantitative";
  if (chartType === "linegraph" || chartType.includes("linechart")) return type === "quantitative" || type === "temporal";
  if (channel === "y" && !chartType.includes("scatter")) return type === "quantitative";
  return true;
}

function encodingReviewKey(node: CanvasNode | null) {
  if (!node?.chartSpec) return "";
  const { encodings, series } = node.chartSpec;
  return [
    node.id,
    encodings.x?.field ?? "",
    encodings.y?.field ?? "",
    series?.field ?? "",
    encodings.color?.field ?? "",
    encodings.size?.field ?? "",
    encodings.shape?.field ?? "",
  ].join("|");
}

const activeCompositionType = ref<CompositionType | null>(null);
const seriesDraftField = ref("");
const optionalEncodingDrafts = ref<Record<OptionalEncodingChannel, string>>({
  color: "",
  size: "",
  shape: "",
});
const axisBindingMarkGroupConfig = computed(() =>
  axisBindingNode.value?.chartSpec?.markGroups?.[0]?.sharedConfig ?? {},
);
const activeColorDraftColumn = computed(() =>
  axisBindingColumns.value.find((column) => column.name === optionalEncodingDrafts.value.color),
);
const showColorMapping = computed(() =>
  !!activeColorDraftColumn.value && activeColorDraftColumn.value.type !== "nominal",
);
const showSizeMapping = computed(() => !!optionalEncodingDrafts.value.size);
const activeColorMapping = computed(() => {
  const mapping = axisBindingMarkGroupConfig.value.colorMapping;
  return isLinearColorMapping(mapping) ? mapping : defaultColorMapping;
});
const activeSizeMapping = computed(() => {
  const mapping = axisBindingMarkGroupConfig.value.sizeMapping;
  return isLinearSizeMapping(mapping) ? mapping : defaultSizeMapping;
});
const activeCompositionOption = computed(() =>
  compositionOptions.find(
    (option) => option.value === activeCompositionType.value,
  ),
);
const activeCompositionCandidates = computed(() =>
  compositionCandidates.value.filter(
    (candidate) => candidate.compositionType === activeCompositionType.value,
  ),
);
const llmNode = computed(() => {
  if (selectedIds.value.length !== 1) return null;
  return selectedNodes.value[0] ?? null;
});
const llmDataset = computed(() => {
  const datasetId =
    llmNode.value?.layerSpec?.datasetId ?? llmNode.value?.chartSpec?.datasetId;
  return datasetId ? getDataset(datasetId) : activeDataset.value;
});
const activeDimensionRecommendations = computed(() =>
  (axisBindingNode.value ?? llmNode.value)?.chartSpec?.dimensionRecommendations ?? [],
);
const dimensionOptionsEnabled = false;
const recommendationPopupOpen = ref(false);
let lastRecommendationKey = "";
let suppressRecommendationAutoOpen = false;

watch(activeDimensionRecommendations, (recommendations) => {
  if (!dimensionOptionsEnabled) {
    recommendationPopupOpen.value = false;
    return;
  }
  const key = recommendations.map((recommendation) => recommendation.id).join("|");
  if (!key) {
    recommendationPopupOpen.value = false;
    lastRecommendationKey = "";
    return;
  }
  if (axisBindingTarget.value) {
    recommendationPopupOpen.value = false;
    lastRecommendationKey = key;
    return;
  }
  if (key !== lastRecommendationKey) {
    if (suppressRecommendationAutoOpen) suppressRecommendationAutoOpen = false;
    else recommendationPopupOpen.value = true;
  }
  lastRecommendationKey = key;
}, { immediate: true });

function openRecommendationPopup() {
  if (!dimensionOptionsEnabled) return;
  recommendationPopupOpen.value = activeDimensionRecommendations.value.length > 0;
}

function closeRecommendationPopup() {
  recommendationPopupOpen.value = false;
}

function chooseDimensionRecommendation(recommendationId: string) {
  suppressRecommendationAutoOpen = true;
  applyDimensionRecommendation(recommendationId);
  recommendationPopupOpen.value = false;
}

function recommendationStrategyLabel(strategy: string) {
  return strategy === "series"
    ? "One view"
    : strategy === "flatten"
      ? "Flatten"
      : strategy === "facet"
        ? "Multiple views"
        : "Nested";
}
const selectedCanvasNodesWithCoordinateGuides = coordinateGuideNodes;

watch(
  [
    axisBindingTarget,
    axisBindingSeriesValue,
    axisBindingSeriesCandidates,
    axisBindingEncodingValues,
    axisBindingOptionalCandidates,
  ],
  ([
    target,
    confirmedField,
    candidates,
    encodingValues,
    optionalCandidates,
  ]) => {
    if (!target) {
      seriesDraftField.value = "";
      optionalEncodingDrafts.value = { color: "", size: "", shape: "" };
      return;
    }
    const available = candidates.some(
      (candidate) => candidate.field === seriesDraftField.value,
    );
    if (
      confirmedField &&
      candidates.some((candidate) => candidate.field === confirmedField)
    ) {
      seriesDraftField.value = confirmedField;
    } else if (!available) {
      seriesDraftField.value = candidates[0]?.field ?? "";
    }
    const nextDrafts = { ...optionalEncodingDrafts.value };
    optionalCandidates.forEach((option) => {
      const current = nextDrafts[option.channel];
      const currentIsAvailable = option.candidates.some(
        (candidate) => candidate.name === current,
      );
      nextDrafts[option.channel] =
        encodingValues[option.channel] ||
        (currentIsAvailable ? current : option.candidates[0]?.name) ||
        "";
    });
    optionalEncodingDrafts.value = nextDrafts;
  },
  { immediate: true },
);

function openCompositionCandidates(type: CompositionType) {
  closeAxisBinding();
  createCompositionCandidate(type);
  activeCompositionType.value = null;
}

function closeCompositionCandidates() {
  activeCompositionType.value = null;
}

async function selectCompositionCandidate(candidate: SvgCandidate) {
  if (candidate.unavailable) return;
  await insertCompositionCandidate(candidate);
  closeCompositionCandidates();
}

function onCompositionKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeCompositionCandidates();
    closeAxisBinding();
    closeRecommendationPopup();
    closeNestedBinding();
  }
}

function onAxisFieldChange(channel: EncodingChannel, event: Event) {
  setAxisBindingChannel(channel);
  const field = (event.target as HTMLSelectElement).value;
  if (field) bindAxisField(field);
  else clearAxisBinding();
}

function onPolarRadiusFieldChange(event: Event) {
  const field = (event.target as HTMLSelectElement).value;
  if (field) bindPolarRadiusField(field);
  else clearPolarRadiusField();
}

function togglePieAngleField(field: string) {
  const selected = axisBindingNode.value?.chartSpec?.angleFields?.map((encoding) => encoding.field) ?? [];
  setPieAngleFields(selected.includes(field)
    ? selected.filter((item) => item !== field)
    : [...selected, field]);
}

function onPieRadiusModeChange(mode: "shared" | "per-component") {
  setPieRadiusMode(mode);
}

function onPieComponentRadiusFieldChange(componentField: string, event: Event) {
  setPieComponentRadiusField(componentField, (event.target as HTMLSelectElement).value);
}

function onSeriesFieldChange(event: Event) {
  seriesDraftField.value = (event.target as HTMLSelectElement).value;
}

function onOptionalEncodingChange(
  channel: OptionalEncodingChannel,
  event: Event,
) {
  optionalEncodingDrafts.value[channel] = (
    event.target as HTMLSelectElement
  ).value;
}

function confirmOptionalEncodings() {
  const node = axisBindingNode.value;
  axisBindingOptionalCandidates.value.forEach((option) => {
    const selected = optionalEncodingDrafts.value[option.channel];
    if (selected) bindOptionalEncoding(option.channel, selected);
    else clearOptionalEncoding(option.channel);
  });
  const mappingPatch: MarkGroupSharedConfig = {};
  if (showColorMapping.value && !isLinearColorMapping(axisBindingMarkGroupConfig.value.colorMapping)) {
    mappingPatch.colorMapping = defaultColorMapping;
  }
  if (showSizeMapping.value && !isLinearSizeMapping(axisBindingMarkGroupConfig.value.sizeMapping)) {
    mappingPatch.sizeMapping = defaultSizeMapping;
  }
  if (Object.keys(mappingPatch).length > 0) updateAxisBindingMarkGroupConfig(mappingPatch);
  void nextTick(() => {
    encodingReviewApprovedKey.value = encodingReviewKey(node);
  });
}

function confirmEncodingInspector() {
  const node = axisBindingNode.value;
  if (isLineChartType(axisBindingNode.value?.chartSpec?.chartType ?? "")) {
    if (seriesDraftField.value) confirmSeriesField(seriesDraftField.value);
    else clearSeriesBinding();
  }
  confirmOptionalEncodings();
  void nextTick(() => {
    encodingReviewApprovedKey.value = encodingReviewKey(node);
  });
}

function onColorMappingChange(mapping: LinearColorMapping) {
  updateAxisBindingMarkGroupConfig({ colorMapping: mapping });
}

function onSizeMappingChange(mapping: LinearSizeMapping) {
  updateAxisBindingMarkGroupConfig({ sizeMapping: mapping });
}

function confirmPolarEncodingInspector() {
  closeAxisBinding();
  if (dimensionOptionsEnabled && activeDimensionRecommendations.value.length > 0) {
    recommendationPopupOpen.value = true;
  }
}

function skipOptionalEncodings() {
  const node = axisBindingNode.value;
  axisBindingOptionalCandidates.value.forEach((option) =>
    clearOptionalEncoding(option.channel),
  );
  void nextTick(() => {
    encodingReviewApprovedKey.value = encodingReviewKey(node);
  });
}

async function generateLlmRenderer() {
  if (llmRendererPaused) return;
  const node = llmNode.value;
  const dataset = llmDataset.value;
  if (!node || !dataset) return;
  try {
    const result = await llmRenderer.execute(node, dataset);
    applyLlmRenderer(node.id, result);
  } catch {
    // The deterministic/original content remains untouched on any failure.
  }
}

let autoLlmRequestKey = "";
watch(
  [
    () => llmNode.value?.id ?? "",
    () => llmNode.value?.chartSpec?.chartType ?? "",
    () => llmNode.value?.chartSpec?.datasetId ?? "",
    () => llmNode.value?.chartSpec?.encodings.x?.field ?? "",
    () => llmNode.value?.chartSpec?.encodings.y?.field ?? "",
    () => llmNode.value?.chartSpec?.series?.field ?? "",
    () => llmNode.value?.chartSpec?.encodings.color?.field ?? "",
    () => llmNode.value?.chartSpec?.encodings.size?.field ?? "",
    () => llmNode.value?.chartSpec?.encodings.shape?.field ?? "",
    encodingReviewApprovedKey,
  ],
  ([
    nodeId,
    chartType,
    datasetId,
    xField,
    yField,
    seriesField,
    colorField,
    sizeField,
    shapeField,
    approvedKey,
  ]) => {
    if (llmRendererPaused) return;
    if (
      !nodeId ||
      (!isLineChartType(chartType) && !isScatterChartType(chartType)) ||
      !xField ||
      !yField ||
      !llmDataset.value
    )
      return;
    const node = llmNode.value;
    if (!node || approvedKey !== encodingReviewKey(node)) return;
    if (node.llmRenderer?.status === "ready") return;
    const key = [
      nodeId,
      datasetId,
      xField,
      yField,
      seriesField,
      colorField,
      sizeField,
      shapeField,
    ].join("|");
    if (autoLlmRequestKey === key) return;
    autoLlmRequestKey = key;
    void generateLlmRenderer();
  },
  { flush: "post" },
);

function positionEncodingInspector() {
  const board = canvasRef.value;
  const inspector = encodingInspectorRef.value;
  const anchor = axisBindingAnchor.value;
  if (!board || !inspector || !anchor) return;

  const boardRect = board.getBoundingClientRect();
  const width = inspector.offsetWidth;
  const height = inspector.offsetHeight;
  const margin = 12;
  const gap = 10;
  const anchorX = anchor.x - boardRect.left;
  const anchorY = anchor.y - boardRect.top;

  const preferredLeft = anchorX + gap;
  const left = preferredLeft + width <= boardRect.width - margin
    ? preferredLeft
    : anchorX - width - gap;
  const preferredTop = anchorY + gap;
  const top = preferredTop + height <= boardRect.height - margin
    ? preferredTop
    : anchorY - height - gap;

  encodingInspectorPosition.value = {
    left: Math.max(margin, Math.min(left, boardRect.width - width - margin)),
    top: Math.max(margin, Math.min(top, boardRect.height - height - margin)),
  };
}

function openAxisBinding(node: CanvasNode, channel: EncodingChannel, event?: PointerEvent) {
  closeCompositionCandidates();
  encodingReviewApprovedKey.value = "";
  axisBindingAnchor.value = event ? { x: event.clientX, y: event.clientY } : null;
  encodingInspectorPosition.value = null;
  onCoordinateAxisSelect(node, channel);
  if (event) void nextTick(positionEncodingInspector);
}

watch(axisBindingTarget, (target) => {
  if (!target) {
    axisBindingAnchor.value = null;
    encodingInspectorPosition.value = null;
  } else if (target.clientX !== undefined && target.clientY !== undefined) {
    axisBindingAnchor.value = { x: target.clientX, y: target.clientY };
    encodingInspectorPosition.value = null;
    void nextTick(positionEncodingInspector);
  }
});

onMounted(() => {
  window.addEventListener("keydown", onCompositionKeyDown);
  window.addEventListener("click", closeCompositionCandidates);
  window.addEventListener("resize", positionEncodingInspector);
  window.addEventListener("resize", positionNestedBindingPopup);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onCompositionKeyDown);
  window.removeEventListener("click", closeCompositionCandidates);
  window.removeEventListener("resize", positionEncodingInspector);
  window.removeEventListener("resize", positionNestedBindingPopup);
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar__top">
        <div class="sidebar__filters">
          <div class="filter-group filter-group--coordinate">
            <p class="filter-group__title">Coordinate</p>
            <div class="filters filters--compact">
              <button
                v-for="option in coordinateOptions"
                :key="option.value"
                class="filter-chip"
                :class="{
                  'filter-chip--active': selectedCoordinateSystems.has(
                    option.value,
                  ),
                }"
                type="button"
                @click="toggleCoordinateSystem(option.value)"
              >
                <span
                  class="filter-chip__icon"
                  aria-hidden="true"
                  v-html="getFilterIconSvg(option.icon)"
                ></span>
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="sidebar__browser">
          <section class="implemented-templates" aria-label="Implemented chart templates">
            <p class="implemented-templates__title">Chart templates</p>
            <div class="implemented-template-list">
              <article
                v-for="candidate in implementedTemplateCandidates"
                :key="`implemented-${candidate.id}`"
                class="implemented-template-card"
                draggable="true"
                :title="candidate.name"
                @dragstart="onCandidateDragStart(candidate, $event)"
                @dragend="onCandidateDragEnd"
              >
                <div class="implemented-template-card__preview">
                  <img :src="candidate.src" alt="" draggable="false" />
                </div>
                <span>{{ candidate.name }}</span>
              </article>
            </div>
          </section>
        </div>
      </div>
    </aside>

    <div class="workbench">
      <CsvDataPanel />
      <main class="workspace">
        <section
          ref="canvasRef"
          class="canvas-board"
          :style="{
            backgroundPosition: `${viewPan.x}px ${viewPan.y}px, ${viewPan.x}px ${viewPan.y}px, 0 0`,
            backgroundSize: `${24 * viewZoom}px ${24 * viewZoom}px, ${24 * viewZoom}px ${24 * viewZoom}px, 100% 100%`,
          }"
          :class="{
            'canvas-board--dragging': draggedCandidateId,
            'canvas-board--panning': isPanning,
          }"
          @dragover="onCanvasDragOver"
          @dragleave="onCanvasDragLeave"
          @drop="onCanvasDrop"
          @contextmenu="onCanvasContextMenu"
        >
          <button
            v-if="dimensionOptionsEnabled"
            class="dimension-options-control"
            type="button"
            title="Adjust dimension options"
            aria-label="Adjust dimension options"
            :disabled="!activeDimensionRecommendations.length"
            @click.stop="openRecommendationPopup"
          >
            <SlidersHorizontal :size="17" :stroke-width="1.7" aria-hidden="true" />
          </button>
          <div class="toolbar toolbar--floating">
            <div class="icon-tools" role="group" aria-label="History">
              <button
                class="icon-button"
                type="button"
                title="Undo (Ctrl/Cmd+Z)"
                aria-label="Undo"
                :disabled="!canUndo"
                @click="undoCanvasChange"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="9 14 4 9 9 4" />
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                title="Redo (Ctrl/Cmd+Shift+Z)"
                aria-label="Redo"
                :disabled="!canRedo"
                @click="redoCanvasChange"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="15 14 20 9 15 4" />
                  <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                title="Delete"
                aria-label="Delete"
                :disabled="!canDelete"
                @click="deleteSelectedNodes"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                title="Clear canvas"
                aria-label="Clear canvas"
                :disabled="canvasNodes.length === 0"
                @click="clearCanvas"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 4L9 10" />
                  <path d="M9 10L3 19" />
                  <path d="M9 10L14 15" />
                  <path d="M3 19L14 15" />
                  <line x1="5" y1="18" x2="6" y2="21" />
                  <line x1="8" y1="17" x2="9" y2="20" />
                  <line x1="11" y1="16" x2="12" y2="19" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                title="Reset zoom"
                aria-label="Reset zoom"
                :disabled="viewZoom === 1 && viewPan.x === 0 && viewPan.y === 0"
                @click="resetCanvasZoom"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                </svg>
              </button>
            </div>
            <div class="group-tools" role="group" aria-label="Grouping">
              <button
                class="ghost-button"
                type="button"
                :disabled="!canGroup"
                @click="groupSelectedItems"
              >
                Group
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="!canUngroup"
                @click="ungroupSelectedItems"
              >
                Ungroup
              </button>
              <button
                class="ghost-button"
                type="button"
                title="Dissolve all nested groups"
                :disabled="!canUngroup"
                @click="dissolveSelectedGroups"
              >
                Dissolve
              </button>
            </div>
            <div
              class="composition-tools"
              role="group"
              aria-label="Composition"
            >
              <button
                v-for="option in compositionOptions"
                :key="option.value"
                class="ghost-button composition-button"
                type="button"
                :title="option.description"
                :disabled="option.value === 'facet' ? !canFacet : !canCompose"
                @click.stop="openCompositionCandidates(option.value)"
              >
                <svg
                  v-if="option.value === 'layer'"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="5.5" width="9" height="9" rx="1" />
                  <rect x="6.5" y="2.5" width="9" height="9" rx="1" />
                </svg>
                <svg
                  v-else-if="option.value === 'facet'"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="2.5" width="5" height="5" rx="0.75" />
                  <rect x="10.5" y="2.5" width="5" height="5" rx="0.75" />
                  <rect x="2.5" y="10.5" width="5" height="5" rx="0.75" />
                  <rect x="10.5" y="10.5" width="5" height="5" rx="0.75" />
                </svg>
                <svg
                  v-else-if="option.value === 'concat'"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="3" width="5" height="12" rx="1" />
                  <rect x="10.5" y="3" width="5" height="12" rx="1" />
                  <path d="M8.5 9h1" />
                </svg>
                <svg v-else viewBox="0 0 18 18" aria-hidden="true">
                  <rect x="2.5" y="2.5" width="13" height="13" rx="1" />
                  <rect x="6" y="6" width="6" height="6" rx="0.75" />
                </svg>
                <span>{{ option.label }}</span>
              </button>
            </div>
            <div class="alignment-tools" role="group" aria-label="Alignment">
              <button
                class="icon-button"
                type="button"
                title="Align left"
                aria-label="Align left"
                :disabled="selectionUnits.length < 2"
                @click="alignSelection('left')"
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
                :disabled="selectionUnits.length < 2"
                @click="alignSelection('center-x')"
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
                :disabled="selectionUnits.length < 2"
                @click="alignSelection('right')"
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
                :disabled="selectionUnits.length < 2"
                @click="alignSelection('top')"
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
                :disabled="selectionUnits.length < 2"
                @click="alignSelection('center-y')"
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
                :disabled="selectionUnits.length < 2"
                @click="alignSelection('bottom')"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2.5 13h11M4.5 3v7M8 5v5M11.5 3v7" />
                </svg>
              </button>
            </div>
          </div>

          <aside
            v-if="axisBindingTarget"
            ref="encodingInspectorRef"
            class="encoding-inspector"
            role="dialog"
            aria-modal="false"
            :aria-label="`${axisBindingTarget.channel.toUpperCase()} axis encoding`"
            :style="encodingInspectorPosition ? {
              left: `${encodingInspectorPosition.left}px`,
              top: `${encodingInspectorPosition.top}px`,
              right: 'auto',
              maxHeight: `calc(100% - ${encodingInspectorPosition.top + 12}px)`,
            } : undefined"
            @click.stop
            @pointerdown.stop
          >
            <header class="encoding-inspector__header">
              <div class="encoding-inspector__heading">
                <strong>ENCODINGS</strong>
                <span>{{
                  axisBindingNode?.chartSpec?.chartType ?? axisBindingNode?.name
                }}</span>
              </div>
              <button
                class="encoding-inspector__close"
                type="button"
                title="Close"
                aria-label="Close axis binding"
                @click="closeAxisBinding"
              >
                <X :size="16" :stroke-width="1.6" aria-hidden="true" />
              </button>
            </header>

            <section class="encoding-inspector__context">
              <div>
                <span class="encoding-inspector__context-label">Chart</span>
                <strong>{{ axisBindingNode?.name ?? "Current chart" }}</strong>
              </div>
              <div>
                <span class="encoding-inspector__context-label">Axis</span>
                <strong>{{ axisBindingAxis?.id ?? "Independent axis" }}</strong>
              </div>
              <div v-if="axisBindingRelatedCharts.length > 1" class="encoding-inspector__shared">
                <span class="encoding-inspector__context-label">Shared by</span>
                <span>{{ axisBindingRelatedCharts.map((chart) => chart.name).join(", ") }}</span>
              </div>
            </section>

            <div v-if="axisBindingColumns.length" class="encoding-inspector__axes">
              <label
                v-if="!isPieChartType(axisBindingNode?.chartSpec?.chartType ?? '')"
                class="encoding-inspector__field"
              >
                <span>{{ primaryEncodingLabel(axisBindingNode, 'x') }}</span>
                <select
                  :value="primaryEncodingField(axisBindingNode, 'x') ?? ''"
                  @change="onAxisFieldChange('x', $event)"
                >
                  <option value="">Not bound</option>
                  <option
                    v-for="column in axisBindingColumns"
                    :key="column.name"
                    :value="column.name"
                    :disabled="!isPrimaryEncodingCompatible(axisBindingNode, 'x', column.type)"
                  >
                    {{ column.name }} ({{ column.type }})
                  </option>
                </select>
              </label>
              <label
                v-if="!isPieChartType(axisBindingNode?.chartSpec?.chartType ?? '')"
                class="encoding-inspector__field"
              >
                <span>{{ primaryEncodingLabel(axisBindingNode, 'y') }}</span>
                <select
                  :value="primaryEncodingField(axisBindingNode, 'y') ?? ''"
                  @change="onAxisFieldChange('y', $event)"
                >
                  <option value="">Not bound</option>
                  <option
                    v-for="column in axisBindingColumns"
                    :key="column.name"
                    :value="column.name"
                    :disabled="!isPrimaryEncodingCompatible(axisBindingNode, 'y', column.type)"
                  >
                    {{ column.name }} ({{ column.type }})
                  </option>
                </select>
              </label>
              <div
                v-if="isPieChartType(axisBindingNode?.chartSpec?.chartType ?? '')"
                class="pie-angle-fields"
              >
                <span>Angle components</span>
                <label
                  v-for="column in axisBindingColumns.filter((item) => item.type === 'quantitative')"
                  :key="`pie-angle-field-${column.name}`"
                  class="nested-binding-popup__angle-option"
                >
                  <input
                    type="checkbox"
                    :checked="axisBindingNode?.chartSpec?.angleFields?.some((encoding) => encoding.field === column.name)"
                    @change="togglePieAngleField(column.name)"
                  />
                  <span>{{ column.name }}</span>
                </label>
              </div>
              <div
                v-if="isPieChartType(axisBindingNode?.chartSpec?.chartType ?? '')"
                class="pie-radius-editor"
              >
                <span>Outer radius</span>
                <div class="pie-radius-editor__modes" role="group" aria-label="Pie radius mode">
                  <button
                    type="button"
                    :class="{ 'is-active': (axisBindingNode?.chartSpec?.radiusMode ?? 'shared') === 'shared' }"
                    @click="onPieRadiusModeChange('shared')"
                  >
                    Same radius
                  </button>
                  <button
                    type="button"
                    :class="{ 'is-active': axisBindingNode?.chartSpec?.radiusMode === 'per-component' }"
                    @click="onPieRadiusModeChange('per-component')"
                  >
                    Per component
                  </button>
                </div>
                <label
                  v-if="(axisBindingNode?.chartSpec?.radiusMode ?? 'shared') === 'shared'"
                  class="encoding-inspector__field"
                >
                  <span>Shared value</span>
                  <select
                    :value="axisBindingNode?.chartSpec?.encodings.radius?.field ?? ''"
                    @change="onPolarRadiusFieldChange"
                  >
                    <option value="">Fixed</option>
                    <option
                      v-for="column in axisBindingColumns.filter((item) => item.type === 'quantitative')"
                      :key="`radius-${column.name}`"
                      :value="column.name"
                    >
                      {{ column.name }}
                    </option>
                  </select>
                </label>
                <div v-else class="pie-radius-editor__components">
                  <label
                    v-for="component in axisBindingNode?.chartSpec?.angleFields ?? []"
                    :key="`component-radius-${component.field}`"
                    class="pie-radius-editor__component"
                  >
                    <span>{{ component.field }}</span>
                    <select
                      :value="axisBindingNode?.chartSpec?.componentRadiusFields?.[component.field]?.field ?? ''"
                      @change="onPieComponentRadiusFieldChange(component.field, $event)"
                    >
                      <option value="">Fixed</option>
                      <option
                        v-for="column in axisBindingColumns.filter((item) => item.type === 'quantitative')"
                        :key="`${component.field}-radius-${column.name}`"
                        :value="column.name"
                      >
                        {{ column.name }}
                      </option>
                    </select>
                  </label>
                </div>
              </div>
              <label
                v-else-if="isPolarChartType(axisBindingNode?.chartSpec?.chartType ?? '')"
                class="encoding-inspector__field"
              >
                <span>Radius</span>
                <select
                  :value="axisBindingNode?.chartSpec?.encodings.radius?.field ?? ''"
                  @change="onPolarRadiusFieldChange"
                >
                  <option value="">Not bound</option>
                  <option
                    v-for="column in axisBindingColumns.filter((item) => item.type === 'quantitative')"
                    :key="`radius-${column.name}`"
                    :value="column.name"
                  >
                    {{ column.name }}
                  </option>
                </select>
              </label>
            </div>
            <p v-else class="encoding-inspector__empty">
              Import a CSV to bind this axis.
            </p>

            <section
              v-if="
                axisBindingNode?.chartSpec?.encodings.x &&
                axisBindingNode?.chartSpec?.encodings.y &&
                (isLineChartType(axisBindingNode?.chartSpec?.chartType ?? '') ||
                  isScatterChartType(
                    axisBindingNode?.chartSpec?.chartType ?? '',
                  ))
              "
              class="encoding-inspector__series"
            >
              <div
                v-if="
                  isLineChartType(axisBindingNode?.chartSpec?.chartType ?? '')
                "
                class="encoding-inspector__series-heading"
              >
                <span>Series</span>
                <span
                  v-if="axisBindingSeriesCandidates[0]"
                  class="encoding-inspector__suggestion"
                >
                  Suggested
                </span>
              </div>
              <select
                v-if="
                  isLineChartType(
                    axisBindingNode?.chartSpec?.chartType ?? '',
                  ) && axisBindingSeriesCandidates.length
                "
                :value="seriesDraftField"
                @change="onSeriesFieldChange"
              >
                <option value="">Single line (no series field)</option>
                <option
                  v-for="candidate in axisBindingSeriesCandidates"
                  :key="candidate.field"
                  :value="candidate.field"
                >
                  {{ candidate.field }} ({{ candidate.groupCount }} groups)
                </option>
              </select>
              <p
                v-else-if="
                  isLineChartType(axisBindingNode?.chartSpec?.chartType ?? '')
                "
                class="encoding-inspector__empty"
              >
                No nominal series field is available.
              </p>
              <template>
                <div
                  v-for="option in axisBindingOptionalCandidates"
                  :key="option.channel"
                  class="encoding-inspector__optional"
                >
                  <label class="encoding-inspector__field">
                    <span>{{ option.label }}</span>
                    <select
                      :value="optionalEncodingDrafts[option.channel]"
                      @change="onOptionalEncodingChange(option.channel, $event)"
                    >
                      <option value="">None</option>
                      <option
                        v-for="candidate in option.candidates"
                        :key="candidate.name"
                        :value="candidate.name"
                      >
                        {{ candidate.name }} ({{ candidate.type }})
                      </option>
                    </select>
                  </label>
                </div>
                <p
                  v-if="
                    !axisBindingOptionalCandidates.some(
                      (option) => option.candidates.length,
                    )
                  "
                  class="encoding-inspector__empty"
                >
                  No optional fields are available.
                </p>
              </template>
              <VisualMappingEditor
                :show-color="showColorMapping"
                :show-size="showSizeMapping"
                :color-mapping="activeColorMapping"
                :size-mapping="activeSizeMapping"
                @color-change="onColorMappingChange"
                @size-change="onSizeMappingChange"
              />
              <p
                v-if="axisBindingRendererError"
                class="encoding-inspector__error"
              >
                {{ axisBindingRendererError }}
              </p>
              <div class="encoding-inspector__actions">
                <button
                  class="encoding-inspector__secondary"
                  type="button"
                  @click="skipOptionalEncodings"
                >
                  Continue without optional encodings
                </button>
                <button
                  class="encoding-inspector__confirm"
                  type="button"
                  @click="confirmEncodingInspector"
                >
                  Confirm encodings
                </button>
              </div>
            </section>
            <div
              v-if="isPolarChartType(axisBindingNode?.chartSpec?.chartType ?? '')"
              class="encoding-inspector__actions encoding-inspector__actions--standalone"
            >
              <button
                class="encoding-inspector__confirm"
                type="button"
                :disabled="isPieChartType(axisBindingNode?.chartSpec?.chartType ?? '')
                  ? !axisBindingNode?.chartSpec?.angleFields?.length
                  : !axisBindingNode?.chartSpec?.encodings.angle"
                @click="confirmPolarEncodingInspector"
              >
                Confirm encodings
              </button>
            </div>
            <button
              v-if="dimensionOptionsEnabled && activeDimensionRecommendations.length"
              class="recommendation-popup-trigger"
              type="button"
              @click="openRecommendationPopup"
            >
              View {{ activeDimensionRecommendations.length }} dimension options
            </button>
          </aside>

          <aside
            v-if="nestedBindingTarget"
            ref="nestedBindingPopupRef"
            class="nested-binding-popup"
            role="dialog"
            aria-modal="false"
            aria-label="Configure Point and Pie composition"
            :style="nestedBindingPopupPosition ? {
              left: `${nestedBindingPopupPosition.left}px`,
              top: `${nestedBindingPopupPosition.top}px`,
              maxHeight: `calc(100% - ${nestedBindingPopupPosition.top + 12}px)`,
            } : undefined"
            @click.stop
            @pointerdown.stop
          >
            <header class="nested-binding-popup__header">
              <div>
                <strong>POINT + PIE</strong>
                <span>{{ nestedBindingNode?.name }}</span>
              </div>
              <button
                class="encoding-inspector__close"
                type="button"
                title="Close"
                aria-label="Close composition editor"
                @click="closeNestedBinding"
              >
                <X :size="16" :stroke-width="1.6" aria-hidden="true" />
              </button>
            </header>

            <form class="nested-binding-popup__form" @submit.prevent="submitNestedBinding">
              <fieldset>
                <legend>Point position</legend>
                <div class="nested-binding-popup__field-grid">
                  <label class="encoding-inspector__field">
                    <span>X</span>
                    <select v-model="nestedPointXField">
                      <option
                        v-for="column in nestedBindingColumns"
                        :key="`point-x-${column.name}`"
                        :value="column.name"
                      >
                        {{ column.name }} ({{ column.type }})
                      </option>
                    </select>
                  </label>
                  <label class="encoding-inspector__field">
                    <span>Y</span>
                    <select v-model="nestedPointYField">
                      <option
                        v-for="column in nestedBindingColumns"
                        :key="`point-y-${column.name}`"
                        :value="column.name"
                      >
                        {{ column.name }} ({{ column.type }})
                      </option>
                    </select>
                  </label>
                </div>
                <div class="nested-binding-popup__relation">
                  <span>Attach to</span>
                  <strong>{{ nestedBindingTarget.rowKey }}</strong>
                </div>
              </fieldset>

              <fieldset>
                <legend>Pie encodings</legend>
                <label class="encoding-inspector__field">
                  <span>Radius</span>
                  <select v-model="nestedPieRadiusField">
                    <option
                      v-for="column in nestedBindingColumns.filter((item) => item.type === 'quantitative')"
                      :key="`pie-radius-${column.name}`"
                      :value="column.name"
                    >
                      {{ column.name }}
                    </option>
                  </select>
                </label>
                <div class="nested-binding-popup__angles">
                  <span>Angle components</span>
                  <label
                    v-for="column in nestedBindingColumns.filter((item) => item.type === 'quantitative')"
                    :key="`pie-angle-${column.name}`"
                    class="nested-binding-popup__angle-option"
                  >
                    <input
                      type="checkbox"
                      :checked="nestedPieAngleFields.includes(column.name)"
                      @change="toggleNestedAngleField(column.name)"
                    />
                    <span>{{ column.name }}</span>
                  </label>
                </div>
              </fieldset>

              <div class="nested-binding-popup__actions">
                <button type="button" class="encoding-inspector__secondary" @click="closeNestedBinding">
                  Cancel
                </button>
                <button type="submit" class="encoding-inspector__confirm" :disabled="!canConfirmNestedBinding">
                  Create composition
                </button>
              </div>
            </form>
          </aside>

          <aside
            v-if="activeCompositionType"
            class="composition-popover"
            role="dialog"
            aria-modal="false"
            :aria-label="`${activeCompositionOption?.label ?? ''} candidates`"
            @click.stop
          >
            <header class="composition-popover__header">
              <div>
                <strong>{{ activeCompositionOption?.label }}</strong>
                <span> candidates</span>
              </div>
              <button
                class="composition-popover__close"
                type="button"
                title="Close"
                aria-label="Close candidate list"
                @click="closeCompositionCandidates"
              >
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" />
                </svg>
              </button>
            </header>
            <div class="composition-candidate-list">
              <article
                v-for="candidate in activeCompositionCandidates"
                :key="candidate.id"
                class="composition-candidate"
                :class="{
                  'composition-candidate--unavailable': candidate.unavailable,
                }"
                :title="candidate.name"
                :draggable="!candidate.unavailable"
                role="button"
                :tabindex="candidate.unavailable ? -1 : 0"
                :aria-disabled="candidate.unavailable || undefined"
                @click="selectCompositionCandidate(candidate)"
                @keydown.enter.prevent="selectCompositionCandidate(candidate)"
                @keydown.space.prevent="selectCompositionCandidate(candidate)"
                @dragstart="onCandidateDragStart(candidate, $event)"
                @dragend="onCandidateDragEnd"
              >
                <div class="composition-candidate__preview">
                  <img
                    :src="candidate.src"
                    :alt="candidate.name"
                    draggable="false"
                  />
                </div>
                <span class="composition-candidate__name">{{
                  candidate.name
                }}</span>
                <span
                  v-if="candidate.unavailable"
                  class="composition-candidate__status"
                >
                  Pending
                </span>
              </article>
            </div>
          </aside>
          <div
            v-if="dimensionOptionsEnabled && recommendationPopupOpen && activeDimensionRecommendations.length"
            class="recommendation-popup-backdrop"
            @pointerdown="closeRecommendationPopup"
          ></div>
          <aside
            v-if="dimensionOptionsEnabled && recommendationPopupOpen && activeDimensionRecommendations.length"
            class="recommendation-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Dimension recommendations"
            @click.stop
            @pointerdown.stop
          >
            <header class="recommendation-popup__header">
              <div>
                <strong>Dimension options</strong>
                <span>Choose how to arrange this data dimension</span>
              </div>
              <button
                class="recommendation-popup__close"
                type="button"
                title="Close"
                aria-label="Close dimension options"
                @click="closeRecommendationPopup"
              >
                <X :size="17" :stroke-width="1.7" aria-hidden="true" />
              </button>
            </header>
            <div class="recommendation-popup__options">
              <button
                v-for="recommendation in activeDimensionRecommendations"
                :key="recommendation.id"
                class="recommendation-option-card"
                type="button"
                @click="chooseDimensionRecommendation(recommendation.id)"
              >
                <span class="recommendation-option-card__strategy">
                  {{ recommendationStrategyLabel(recommendation.strategy) }}
                </span>
                <strong>{{ recommendation.field }}</strong>
                <span>{{ recommendation.label }}</span>
                <dl>
                  <div>
                    <dt>Values</dt>
                    <dd>{{ recommendation.valueCount }}</dd>
                  </div>
                  <div>
                    <dt>Marks</dt>
                    <dd>{{ recommendation.estimatedMarkCount }}</dd>
                  </div>
                  <div>
                    <dt>Shared</dt>
                    <dd>{{ recommendation.sharedChannels.join(' + ') || 'Independent' }}</dd>
                  </div>
                </dl>
              </button>
            </div>
          </aside>

          <div
            v-if="contextMenu"
            class="context-menu"
            :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
            role="menu"
            @contextmenu.stop.prevent
          >
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canCopy"
              @click="copySelectedNodes"
            >
              Copy
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canPaste"
              @click="contextMenu && pasteClipboardNodes(contextMenu.point)"
            >
              Paste
            </button>
            <div class="context-menu__separator" role="separator"></div>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canGroup"
              @click="groupSelectedItems"
            >
              Group
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canUngroup"
              @click="ungroupSelectedItems"
            >
              Ungroup
            </button>
            <div class="context-menu__separator" role="separator"></div>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canMoveSelectionForward"
              @click="reorderSelectedNodes('front')"
            >
              Bring to front
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canMoveSelectionForward"
              @click="reorderSelectedNodes('forward')"
            >
              Move forward
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canMoveSelectionBackward"
              @click="reorderSelectedNodes('backward')"
            >
              Move backward
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              :disabled="!canMoveSelectionBackward"
              @click="reorderSelectedNodes('back')"
            >
              Send to back
            </button>
            <div class="context-menu__separator" role="separator"></div>
            <button
              class="context-menu__item context-menu__item--danger"
              type="button"
              role="menuitem"
              :disabled="!canDelete"
              @click="deleteSelectedNodes"
            >
              Delete
            </button>
          </div>

          <div
            v-if="canvasNodes.length === 0 && !loadingDrop"
            class="empty-state"
          >
            Drag an SVG, PNG, JPEG, WebP, GIF, or AVIF here.
          </div>
          <div v-if="loadingDrop" class="loading-state">Loading SVG...</div>
          <div v-if="importNotice" class="import-notice">
            {{ importNotice }}
          </div>

          <svg
            class="canvas-scene"
            preserveAspectRatio="none"
            @pointerdown="onCanvasPointerDown"
            @wheel="onCanvasWheel"
          >
            <g
              :transform="`translate(${viewPan.x} ${viewPan.y}) scale(${viewZoom})`"
            >
              <CanvasNodeView
                v-for="node in canvasNodes"
                :key="node.id"
                :node="node"
                :selected="selectedIds.includes(node.id)"
                :interactive="true"
                :editing-group-path="editingGroupPath"
                :selected-ids="selectedIds"
                :on-node-pointer-down="onCanvasNodePointerDown"
                :on-node-double-click="onCanvasNodeDoubleClick"
                :on-node-context-menu="onCanvasNodeContextMenu"
                :on-editing-background-pointer-down="onEditingGroupBackgroundPointerDown"
              />
              <CanvasCoordinateSystemLayer
                v-for="node in canvasNodes"
                :key="`coordinate-system-${node.id}`"
                :node="node"
              />
              <g v-if="activeDropZone" :transform="editingGroupTransform" class="composition-drop-zone-layer">
                <rect
                  class="composition-drop-zone"
                  :class="{
                    'composition-drop-zone--layer': activeDropZone.type === 'layer',
                  'composition-drop-zone--concat': activeDropZone.type === 'concat',
                    'composition-drop-zone--horizontal': activeDropZone.direction === 'horizontal',
                    'composition-drop-zone--vertical': activeDropZone.direction === 'vertical',
                    'composition-drop-zone--before': activeDropZone.concatPosition === 'before',
                    'composition-drop-zone--after': activeDropZone.concatPosition === 'after',
                    'composition-drop-zone--nested': activeDropZone.type === 'nested',
                    'composition-drop-zone--invalid': !activeDropZone.compatible,
                  }"
                  :x="activeDropZone.bounds.minX"
                  :y="activeDropZone.bounds.minY"
                  :width="activeDropZone.bounds.width"
                  :height="activeDropZone.bounds.height"
                  vector-effect="non-scaling-stroke"
                />
              </g>
              <g :transform="editingGroupTransform">
              <g class="selection-overlay">
                <rect
                  v-if="marqueeBounds"
                  class="marquee-box"
                  :x="marqueeBounds.minX"
                  :y="marqueeBounds.minY"
                  :width="marqueeBounds.width"
                  :height="marqueeBounds.height"
                  :vector-effect="'non-scaling-stroke'"
                />
                <g v-if="selectionFrame && rotateHandle">
                  <rect
                    class="selection-box"
                    :x="selectionFrame.x"
                    :y="selectionFrame.y"
                    :width="selectionFrame.width"
                    :height="selectionFrame.height"
                    :transform="`rotate(${selectionFrame.rotation} ${selectionFrame.x + selectionFrame.width / 2} ${selectionFrame.y + selectionFrame.height / 2})`"
                    :vector-effect="'non-scaling-stroke'"
                  />
                  <circle
                    v-for="handle in scaleHandles"
                    :key="handle.key"
                    class="selection-handle"
                    :cx="handle.x"
                    :cy="handle.y"
                    :r="6 / selectionOverlayZoom"
                    :vector-effect="'non-scaling-stroke'"
                    @pointerdown="onScaleHandlePointerDown(handle.key, $event)"
                  />
                  <line
                    class="rotate-stem"
                    :x1="rotateHandle.stemX"
                    :y1="rotateHandle.stemY"
                    :x2="rotateHandle.x"
                    :y2="rotateHandle.y"
                  />
                  <circle
                    class="rotate-handle"
                    :cx="rotateHandle.x"
                    :cy="rotateHandle.y"
                    :r="6 / selectionOverlayZoom"
                    :vector-effect="'non-scaling-stroke'"
                    title="Rotate"
                    @pointerdown="onRotateHandlePointerDown"
                  />
                </g>
              </g>
              <CartesianCoordinateSystem
                v-for="node in selectedCanvasNodesWithCoordinateGuides.filter((item) => item.coordinateGuide?.type === 'Cartesian' && getCartesianAxisChannels(item, 'interactive').length > 0)"
                :key="`coordinate-guide-${node.id}`"
                :node="node"
                :view-zoom="selectionOverlayZoom"
                :channels="getCartesianAxisChannels(node, 'interactive')"
                :show-axis="false"
                :interactive="true"
                :on-axis-select="openAxisBinding"
                :on-axis-scale-pointer-down="onCoordinateAxisScalePointerDown"
              />
              <CanvasCoordinateGuideView
                v-for="node in selectedCanvasNodesWithCoordinateGuides.filter((item) => item.coordinateGuide?.type !== 'Cartesian')"
                :key="`coordinate-guide-${node.id}`"
                :node="node"
                :view-zoom="selectionOverlayZoom"
                :on-origin-pointer-down="onCoordinateOriginPointerDown"
                :on-axis-reverse="reverseCoordinateAxis"
                :on-axis-select="openAxisBinding"
                :on-axis-scale-pointer-down="onCoordinateAxisScalePointerDown"
              />
              </g>
            </g>
          </svg>
          <label
            v-if="selectionBounds && rotationInputVisible && rotateHandle"
            class="rotation-input"
            :style="rotationInputPosition ? {
              left: `${rotationInputPosition.left}px`,
              top: `${rotationInputPosition.top}px`,
            } : undefined"
          >
            <span>Angle</span>
            <input
              type="number"
              step="1"
              :value="Math.round(selectionRotation)"
              @change="
                setSelectionRotation(
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
            <span>°</span>
          </label>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(
      circle at top left,
      rgba(255, 255, 255, 0.95),
      rgba(255, 255, 255, 0.68)
    ),
    linear-gradient(135deg, #edf7ff 0%, #eef3f8 48%, #dce8f7 100%);
}
.sidebar {
  --browser-panel-height: 170px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px 4px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: rgba(248, 251, 255, 0.86);
  backdrop-filter: blur(12px);
}
.sidebar__top {
  display: grid;
  grid-template-columns: 132px minmax(200px, 28%) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}
.sidebar__filters {
  display: flex;
  min-width: 0;
  height: var(--browser-panel-height);
}
.sidebar__browser {
  grid-column: 2 / 4;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 18px minmax(0, 1fr);
  align-items: stretch;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow: hidden;
}
.implemented-templates {
  grid-row: 1 / 3;
  display: grid;
  grid-template-rows: 18px minmax(0, 1fr);
  min-width: 0;
}
.implemented-templates__title {
  margin: 0;
  color: #516176;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.implemented-template-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(82px, 1fr));
  gap: 8px;
  min-height: 0;
}
.implemented-template-card {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 24px;
  min-width: 0;
  min-height: 0;
  padding: 6px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font-size: 11px;
  text-align: center;
  cursor: grab;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.implemented-template-card:hover {
  border-color: rgba(37, 99, 235, 0.48);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.implemented-template-card:active {
  cursor: grabbing;
}
.implemented-template-card__preview {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.implemented-template-card__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.implemented-template-card > span {
  align-self: end;
  overflow: hidden;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filters--compact {
  display: grid;
  grid-template-columns: 1fr;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.filter-group--coordinate .filter-chip {
  gap: 6px;
  min-height: 30px;
  padding: 5px 10px;
  font-size: 13px;
}
.filter-group--coordinate .filter-chip__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}
.filter-group--coordinate .filter-chip__icon :deep(svg) {
  width: 14px;
  height: 14px;
}
.filter-group__title {
  margin: 0;
  color: #516176;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font: inherit;
  cursor: pointer;
  justify-content: flex-start;
  transition:
    box-shadow 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}
.filter-chip:hover {
  box-shadow: 0 0 0 3px rgba(28, 126, 214, 0.1);
}
.filter-chip--active {
  border-color: transparent;
  background: linear-gradient(135deg, #1c7ed6, #1554b2);
  color: #fff;
}
.filter-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.filter-chip__icon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}
.filter-chip--text {
  gap: 0;
}
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 10px;
}
.workbench {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.dimension-options-control {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 8px;
  background: rgba(239, 246, 255, 0.94);
  color: #1d4ed8;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(45, 89, 126, 0.12);
  backdrop-filter: blur(8px);
}
.dimension-options-control:hover:not(:disabled) {
  border-color: #2563eb;
  background: #dbeafe;
}
.dimension-options-control:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.icon-tools,
.alignment-tools {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  padding: 2px 0;
}
.group-tools {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.composition-tools {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.composition-tools .composition-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  min-height: 34px;
  padding: 7px 9px;
  border-radius: 7px;
  font-size: 13px;
}
.composition-button svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.composition-button:hover:not(:disabled) {
  border-color: rgba(28, 126, 214, 0.35);
  background: #edf5fc;
  color: #1554b2;
}
.llm-tools {
  grid-column: 1 / -1;
  display: grid;
  gap: 7px;
  padding: 9px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 8px;
  background: rgba(248, 251, 254, 0.86);
}
.llm-tools__header,
.llm-tools__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.llm-tools__header {
  color: #223041;
  font-size: 12px;
  font-weight: 700;
}
.llm-tools__status {
  color: #6b7889;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
}
.llm-tools__actions .ghost-button {
  min-height: 30px;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 11px;
}
.llm-tools__error,
.llm-tools__meta {
  margin: 0;
  font-size: 10px;
  line-height: 1.35;
}
.llm-tools__error {
  color: #b42318;
}
.llm-tools__meta {
  color: #516176;
}
.group-tools .ghost-button {
  padding: 10px 6px;
  font-size: 13px;
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  padding: 0;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.8);
  color: #223041;
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
  border-color: rgba(28, 126, 214, 0.35);
  background: #edf5fc;
  color: #1554b2;
}
.icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.toolbar--floating {
  position: absolute;
  top: 16px;
  right: 16px;
  width: min(232px, calc(100% - 32px));
  z-index: 3;
  padding: 10px 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 32px rgba(45, 89, 126, 0.12);
}
.ghost-button {
  width: 100%;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: #223041;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.toolbar--floating .ghost-button {
  box-sizing: border-box;
}
.ghost-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.composition-popover {
  position: absolute;
  top: 16px;
  right: 264px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100% - 296px));
  max-height: min(440px, calc(100% - 32px));
  min-width: 260px;
  padding: 12px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.2);
  backdrop-filter: blur(12px);
}
.encoding-inspector {
  position: absolute;
  top: 16px;
  right: 264px;
  z-index: 5;
  width: min(280px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  min-width: 220px;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.2);
  backdrop-filter: blur(12px);
}
.nested-binding-popup {
  position: absolute;
  z-index: 7;
  width: min(330px, calc(100% - 24px));
  box-sizing: border-box;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.22);
  backdrop-filter: blur(12px);
}
.nested-binding-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.nested-binding-popup__header > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.nested-binding-popup__header strong {
  color: #18212f;
  font-size: 12px;
  letter-spacing: 0.08em;
}
.nested-binding-popup__header span {
  overflow: hidden;
  color: #6b7889;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nested-binding-popup__form {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}
.nested-binding-popup fieldset {
  display: grid;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 10px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
}
.nested-binding-popup legend {
  padding: 0 5px;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
}
.nested-binding-popup__field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.nested-binding-popup .encoding-inspector__field {
  margin-top: 0;
}
.nested-binding-popup__relation {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: #6b7889;
  font-size: 10px;
}
.nested-binding-popup__relation strong {
  overflow: hidden;
  color: #334155;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nested-binding-popup__angles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  color: #516176;
  font-size: 11px;
}
.nested-binding-popup__angles > span {
  grid-column: 1 / -1;
}
.nested-binding-popup__angle-option {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  padding: 6px 7px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 5px;
  background: #f8fafc;
  color: #334155;
  cursor: pointer;
}
.nested-binding-popup__angle-option input {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  margin: 0;
  accent-color: #1554b2;
  cursor: pointer;
}
.nested-binding-popup__angle-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nested-binding-popup__actions {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 8px;
}
.nested-binding-popup__actions button {
  min-height: 34px;
  padding: 7px 9px;
  border-radius: 6px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.nested-binding-popup__actions button:disabled {
  cursor: not-allowed;
}
.recommendation-popup-trigger {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font: inherit;
  cursor: pointer;
}
.recommendation-popup-trigger:hover {
  border-color: #2563eb;
}
.recommendation-popup-backdrop {
  position: absolute;
  inset: 0;
  z-index: 7;
  background: rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(2px);
}
.recommendation-popup {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 8;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  width: min(760px, calc(100% - 48px));
  max-height: min(620px, calc(100% - 48px));
  box-sizing: border-box;
  padding: 18px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.24);
  transform: translate(-50%, -50%);
}
.recommendation-popup__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.recommendation-popup__header > div {
  display: grid;
  gap: 3px;
}
.recommendation-popup__header strong {
  color: #18212f;
  font-size: 16px;
}
.recommendation-popup__header span {
  color: #6b7889;
  font-size: 12px;
}
.recommendation-popup__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: #516176;
  cursor: pointer;
}
.recommendation-popup__close:hover {
  background: #f1f5f9;
}
.recommendation-popup__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}
.recommendation-option-card {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}
.recommendation-option-card:hover {
  border-color: #2563eb;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}
.recommendation-option-card__strategy {
  width: fit-content;
  padding: 3px 6px;
  border-radius: 4px;
  background: #e0f2fe;
  color: #075985;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.recommendation-option-card > strong {
  color: #18212f;
  font-size: 14px;
}
.recommendation-option-card > span:not(.recommendation-option-card__strategy) {
  min-height: 34px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.45;
}
.recommendation-option-card dl {
  display: grid;
  gap: 5px;
  margin: 4px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
}
.recommendation-option-card dl div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.recommendation-option-card dt,
.recommendation-option-card dd {
  margin: 0;
  font-size: 10px;
}
.recommendation-option-card dt {
  color: #94a3b8;
}
.recommendation-option-card dd {
  overflow-wrap: anywhere;
  color: #334155;
  text-align: right;
}
.encoding-inspector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.encoding-inspector__heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.encoding-inspector__heading strong {
  color: #18212f;
  font-size: 12px;
  letter-spacing: 0.08em;
}
.encoding-inspector__heading span {
  overflow: hidden;
  color: #6b7889;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.encoding-inspector__context {
  display: grid;
  gap: 7px;
  margin: 10px 0;
  padding: 9px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
  background: #f8fafc;
  color: #334155;
  font-size: 11px;
}
.encoding-inspector__context > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.encoding-inspector__context strong,
.encoding-inspector__shared > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.encoding-inspector__context-label {
  color: #6b7889;
  font-size: 10px;
  text-transform: uppercase;
}
.encoding-inspector__shared {
  padding-top: 5px;
  border-top: 1px solid rgba(24, 33, 47, 0.08);
}
.encoding-inspector__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5b6a80;
  cursor: pointer;
}
.encoding-inspector__close:hover {
  background: #edf5fc;
  color: #1554b2;
}
.encoding-inspector__field {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  color: #516176;
  font-size: 11px;
}
.encoding-inspector__field select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font: inherit;
  cursor: pointer;
}
.encoding-inspector__field select:focus {
  border-color: rgba(28, 126, 214, 0.7);
  outline: 2px solid rgba(28, 126, 214, 0.12);
}
.pie-angle-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 12px;
  color: #516176;
  font-size: 11px;
}
.pie-angle-fields > span {
  grid-column: 1 / -1;
}
.pie-radius-editor {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(24, 33, 47, 0.1);
  color: #516176;
  font-size: 11px;
}
.pie-radius-editor__modes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border-radius: 6px;
  background: #edf1f5;
}
.pie-radius-editor__modes button {
  min-width: 0;
  min-height: 28px;
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #5b6878;
  font: inherit;
  cursor: pointer;
}
.pie-radius-editor__modes button.is-active {
  background: #fff;
  color: #1554b2;
  box-shadow: 0 1px 2px rgba(24, 33, 47, 0.14);
  font-weight: 700;
}
.pie-radius-editor > .encoding-inspector__field {
  margin-top: 0;
}
.pie-radius-editor__components {
  display: grid;
  gap: 6px;
}
.pie-radius-editor__component {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  align-items: center;
  gap: 8px;
}
.pie-radius-editor__component span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pie-radius-editor__component select {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 6px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font: inherit;
  cursor: pointer;
}
.pie-radius-editor__component select:focus {
  border-color: rgba(28, 126, 214, 0.7);
  outline: 2px solid rgba(28, 126, 214, 0.12);
}
.encoding-inspector__series {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(24, 33, 47, 0.1);
}
.encoding-inspector__series-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #516176;
  font-size: 11px;
}
.encoding-inspector__suggestion {
  color: #1554b2;
  font-weight: 700;
}
.encoding-inspector__series select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font: inherit;
}
.encoding-inspector__optional {
  display: contents;
}
.encoding-inspector__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.encoding-inspector__actions--standalone {
  margin-top: 14px;
}
.encoding-inspector__actions--standalone .encoding-inspector__confirm {
  width: 100%;
}
.encoding-inspector__actions button {
  min-height: 32px;
  padding: 0 10px;
  white-space: normal;
  border-radius: 6px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.encoding-inspector__secondary {
  border: 1px solid rgba(24, 33, 47, 0.14);
  background: #fff;
  color: #516176;
}
.encoding-inspector__confirm {
  border: 1px solid #1554b2;
  background: #1554b2;
  color: #fff;
  font-weight: 700;
}
.encoding-inspector__confirm:disabled {
  cursor: default;
  opacity: 0.45;
}
.encoding-inspector__error {
  margin: 0;
  color: #b42318;
  font-size: 11px;
  line-height: 1.4;
}
.encoding-inspector__empty {
  margin: 12px 0 0;
  color: #6b7889;
  font-size: 12px;
  line-height: 1.45;
}
.composition-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  color: #304255;
  font-size: 13px;
}
.composition-popover__header strong {
  color: #18212f;
  font-size: 14px;
}
.composition-popover__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5b6a80;
  cursor: pointer;
}
.composition-popover__close:hover {
  background: #edf5fc;
  color: #1554b2;
}
.composition-popover__close svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.composition-candidate-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
  margin-top: 8px;
  overflow-y: auto;
}
.composition-candidate {
  position: relative;
  display: grid;
  grid-template-rows: 94px 20px;
  gap: 6px;
  min-width: 0;
  padding: 7px;
  border: 1px solid rgba(24, 33, 47, 0.09);
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}
.composition-candidate:hover {
  border-color: rgba(28, 126, 214, 0.34);
  box-shadow: 0 0 0 3px rgba(28, 126, 214, 0.1);
}
.composition-candidate:active {
  cursor: grabbing;
}
.composition-candidate--unavailable {
  opacity: 0.58;
  cursor: not-allowed;
}
.composition-candidate--unavailable:hover {
  border-color: rgba(24, 33, 47, 0.09);
  box-shadow: none;
}
.composition-candidate__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  border-radius: 6px;
  background: #eef4f8;
}
.composition-candidate__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.composition-candidate__name {
  overflow: hidden;
  color: #516176;
  font-size: 11px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.composition-candidate__status {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(24, 33, 47, 0.78);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.3;
  text-transform: uppercase;
  pointer-events: none;
}
.context-menu {
  position: absolute;
  z-index: 6;
  display: grid;
  width: 196px;
  padding: 6px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.2);
}
.context-menu__item {
  min-height: 36px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #223041;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.context-menu__item:hover:not(:disabled) {
  background: #edf5fc;
}
.context-menu__item--danger {
  color: #c43d3d;
}
.context-menu__item--danger:hover:not(:disabled) {
  background: #fff0f0;
}
.context-menu__item:disabled {
  color: #9aa6b5;
  cursor: not-allowed;
}
.context-menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: rgba(24, 33, 47, 0.1);
}
.canvas-board {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(rgba(28, 126, 214, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28, 126, 214, 0.06) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
  background-size:
    24px 24px,
    24px 24px,
    100% 100%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}
.canvas-board--dragging {
  outline: 2px dashed rgba(28, 126, 214, 0.48);
  outline-offset: -10px;
}
.composition-drop-zone-layer {
  pointer-events: none;
}
.composition-drop-zone {
  fill: rgba(37, 99, 235, 0.14);
  stroke: #2563eb;
  stroke-width: 2;
  stroke-dasharray: 7 5;
}
.composition-drop-zone--concat {
  fill: rgba(5, 150, 105, 0.18);
  stroke: #059669;
}
.composition-drop-zone--nested {
  fill: rgba(217, 119, 6, 0.16);
  stroke: #d97706;
}
.composition-drop-zone--concat {
  fill: rgba(5, 150, 105, 0.18);
  stroke: #059669;
}
.composition-drop-zone--horizontal,
.composition-drop-zone--vertical {
  stroke-width: 3;
}
.composition-drop-zone--invalid {
  fill: rgba(220, 38, 38, 0.14);
  stroke: #dc2626;
}
.canvas-board--panning {
  cursor: grabbing;
}
.canvas-board--panning .canvas-scene {
  cursor: grabbing;
}
.empty-state,
.loading-state {
  position: absolute;
  inset: 30% auto auto 50%;
  padding: 18px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #5b6a80;
  transform: translate(-50%, -50%);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.12);
  z-index: 1;
}
.import-notice {
  position: absolute;
  right: 20px;
  bottom: 20px;
  max-width: min(420px, calc(100% - 40px));
  padding: 12px 14px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  color: #304255;
  box-shadow: 0 14px 32px rgba(45, 89, 126, 0.14);
  z-index: 2;
}
.canvas-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.canvas-object {
  cursor: move;
  user-select: none;
  touch-action: none;
}
.canvas-object--interactive {
  pointer-events: bounding-box !important;
}
.canvas-object :deep(*) {
  pointer-events: none;
}
.canvas-object--interactive > :deep(.canvas-object-hit-target) {
  pointer-events: all !important;
}
.canvas-object :deep(.canvas-group-edit-background) {
  pointer-events: all !important;
}
.canvas-object :deep(.semantic-rendered-content),
.canvas-object :deep(.semantic-rendered-content *) {
  pointer-events: all;
}
.canvas-object--selected {
  filter: drop-shadow(0 10px 18px rgba(28, 126, 214, 0.18));
}
.canvas-object--editing-group {
  cursor: default;
}
.canvas-object :deep(.canvas-group-edit-outline) {
  fill: rgba(21, 84, 178, 0.025);
  stroke: #1554b2;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  pointer-events: none !important;
}
.coordinate-guide-layer {
  overflow: visible;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-guide) {
  overflow: visible;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-line),
.coordinate-guide-layer :deep(.coordinate-axis-arrowhead) {
  fill: none;
  stroke: #111;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.coordinate-guide-layer :deep(.coordinate-axis-arrowhead) {
  stroke-linejoin: round;
}
.coordinate-guide-layer :deep(.coordinate-axis-line--tail) {
  opacity: 0.72;
}
.coordinate-guide-layer :deep(.coordinate-axis-hit-target) {
  fill: none;
  stroke: transparent;
  stroke-width: 18;
  pointer-events: stroke;
  cursor: pointer;
  touch-action: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-line--bound) {
  stroke: #1c7ed6;
}
.coordinate-guide-layer :deep(.coordinate-axis-binding-label) {
  fill: #1554b2;
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 0;
  pointer-events: none;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.94);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.coordinate-guide-layer :deep(.coordinate-origin-handle) {
  fill: #111;
  stroke: none;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-origin-hit-target) {
  fill: transparent;
  stroke: transparent;
  pointer-events: all;
  cursor: grab;
  touch-action: none;
}
.coordinate-guide-layer :deep(.coordinate-origin-hit-target:active) {
  cursor: grabbing;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-control) {
  opacity: 0.42;
  pointer-events: all;
  cursor: pointer;
  touch-action: none;
  transition: opacity 120ms ease;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-hit-target) {
  fill: transparent;
  stroke: transparent;
  pointer-events: all;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-outline) {
  fill: rgba(255, 255, 255, 0.82);
  stroke: #111;
  stroke-width: 1.3;
  stroke-dasharray: 3 3;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-icon) {
  fill: none;
  stroke: #111;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
.coordinate-guide-layer
  :deep(.coordinate-axis-reverse-control:hover .coordinate-axis-reverse-icon) {
  stroke-width: 2.3;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-control:hover) {
  opacity: 1;
}
.cartesian-coordinate-system {
  overflow: visible;
  pointer-events: none;
}
.canvas-scene :deep(.canvas-coordinate-system-node) {
  overflow: visible;
  pointer-events: none;
}
.canvas-scene :deep(.cartesian-coordinate-system--static) {
  font-weight: 400;
  letter-spacing: 0;
}
.canvas-scene :deep(.cartesian-axis-grid) {
  fill: none;
  stroke-width: 1;
  stroke-opacity: 0.22;
}
.canvas-scene :deep(.cartesian-axis-domain) {
  fill: none;
  stroke-width: 1.25;
}
.canvas-scene :deep(.cartesian-axis-tick) {
  fill: none;
  stroke-width: 1;
}
.canvas-scene :deep(.cartesian-axis-tick-label),
.canvas-scene :deep(.cartesian-axis-title) {
  fill: inherit;
  font-family: inherit;
  font-size: inherit;
  font-style: normal;
  font-weight: 400;
  letter-spacing: 0;
}
.cartesian-coordinate-system :deep(.cartesian-axis-line),
.cartesian-coordinate-system :deep(.cartesian-axis-arrow) {
  fill: none;
  stroke: #111;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
.cartesian-coordinate-system :deep(.cartesian-axis-endpoint) {
  pointer-events: all;
}
.cartesian-coordinate-system :deep(.cartesian-axis-config-control) {
  pointer-events: all;
  cursor: pointer;
  touch-action: none;
}
.cartesian-coordinate-system :deep(.cartesian-axis-config-button) {
  fill: rgba(255, 255, 255, 0.98);
  stroke: rgba(21, 84, 178, 0.72);
  stroke-width: 1.5;
  cursor: pointer;
}
.cartesian-coordinate-system :deep(.cartesian-axis-config-icon) {
  fill: none;
  stroke: #1554b2;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.cartesian-coordinate-system :deep(.cartesian-axis-config-control:hover .cartesian-axis-config-button) {
  fill: #eff6ff;
  stroke: #1554b2;
  stroke-width: 2;
}
.cartesian-coordinate-system :deep(.cartesian-axis-handle-stem) {
  stroke: #1554b2;
  stroke-width: 1.4;
  stroke-dasharray: 2 2;
  pointer-events: none;
}
.cartesian-coordinate-system :deep(.cartesian-axis-scale-handle) {
  fill: #1554b2;
  stroke: #fff;
  stroke-width: 1.5;
  cursor: ew-resize;
  touch-action: none;
}
.cartesian-coordinate-system :deep(.cartesian-axis-endpoint--y .cartesian-axis-scale-handle) {
  cursor: ns-resize;
}
.coordinate-guide-layer :deep(.polar-coordinate-ring) {
  fill: none;
  stroke: rgba(17, 17, 17, 0.62);
  stroke-width: 1.4;
}
.coordinate-guide-layer :deep(.polar-coordinate-spoke) {
  stroke: rgba(17, 17, 17, 0.78);
  stroke-width: 1.5;
}
.coordinate-guide-layer :deep(.polar-coordinate-origin) {
  fill: #111;
  stroke: none;
}
.coordinate-guide-layer :deep(.polar-coordinate-scale-handle) {
  fill: #fff;
  stroke: #059669;
  stroke-width: 2;
  cursor: ew-resize;
  vector-effect: non-scaling-stroke;
}
.coordinate-guide-layer :deep(.polar-coordinate-scale-handle--radius) {
  cursor: ns-resize;
}
.selection-overlay {
  pointer-events: none;
  overflow: visible;
}
.selection-box {
  fill: rgba(28, 126, 214, 0.06);
  stroke: #1c7ed6;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}
.marquee-box {
  fill: rgba(28, 126, 214, 0.12);
  stroke: #1c7ed6;
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}
.selection-handle {
  fill: #fff;
  stroke: #1c7ed6;
  stroke-width: 2;
  pointer-events: all;
  cursor: nwse-resize;
}
.rotate-stem {
  stroke: #1c7ed6;
  stroke-width: 1.2;
  stroke-dasharray: 3 2;
  pointer-events: none;
}
.rotate-handle {
  fill: #fff;
  stroke: #1c7ed6;
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}
.rotate-handle:active {
  cursor: grabbing;
}
.rotation-input {
  position: absolute;
  left: 16px;
  bottom: auto;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #516176;
  font-size: 12px;
  box-shadow: 0 8px 20px rgba(45, 89, 126, 0.12);
  backdrop-filter: blur(8px);
  transform: translate(10px, calc(-100% - 10px));
}
.rotation-input input {
  width: 58px;
  height: 28px;
  padding: 3px 6px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 5px;
  color: #223041;
  font: inherit;
  text-align: right;
}
@media (max-width: 1320px) {
  .sidebar__top {
    grid-template-columns: 132px minmax(200px, 30%) minmax(0, 1fr);
  }
  .sidebar__browser {
    grid-column: 2 / 4;
  }
}
@media (max-width: 960px) {
  .sidebar {
    padding: 16px;
  }
  .sidebar__top {
    grid-template-columns: 1fr;
  }
  .sidebar__browser {
    grid-column: auto;
  }
  .canvas-board {
    min-height: 520px;
  }
  .toolbar--floating {
    right: 12px;
    top: 12px;
    width: min(220px, calc(100% - 24px));
  }
  .dimension-options-control {
    top: 12px;
    left: 12px;
  }
  .composition-popover {
    top: 256px;
    right: 12px;
    width: min(360px, calc(100% - 24px));
    min-width: 0;
    max-height: calc(100% - 268px);
  }
  .encoding-inspector {
    top: 256px;
    right: 12px;
    width: min(280px, calc(100% - 24px));
    min-width: 0;
  }
}
@media (max-width: 760px) {
  .app-shell {
    height: auto;
    overflow: visible;
  }
  .workbench {
    flex-direction: column;
    overflow: visible;
  }
}
</style>
