<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { ChevronDown, SlidersHorizontal, Ungroup, X } from "@lucide/vue";
import { CanvasNodeView } from "./CanvasNodeView";
import {
  CanvasCoordinateSystemLayer,
  CartesianCoordinateSystem,
  getCartesianAxisChannels,
} from "./CartesianCoordinateSystem";
import { PolarCoordinateSystem } from "./PolarCoordinateSystem";
import CsvDataPanel from "./CsvDataPanel.vue";
import EncodingConfigPanel from "./EncodingConfigPanel.vue";
import type {
  CanvasNode,
  ChartEncodingChannel,
  CompositionType,
  CoordinateChannel,
  EncodingChannel,
  SvgCandidate,
} from "../types";
import {
  useCanvasStore,
  coordinateOptions,
  compositionOptions,
  getFilterIconSvg,
} from "../stores/useCanvasStore";
import { useDatasetStore } from "../stores/useDatasetStore";
import { useLlmRenderer } from "../stores/useLlmRenderer";
import { isLineChartType } from "../utils/lineRenderer";
import {
  isCategoricalColorMapping,
  isSeriesStyleMapping,
} from "../utils/visualMapping";
import {
  groupChartTemplateCandidates,
  type ChartTemplateCategory,
} from "../utils/chartTemplateCategories";

const canvasRef = ref<HTMLElement | null>(null);
const encodingInspectorOpen = ref(true);
const activeTemplateCategoryId = ref<string | null>(null);
const templateCategoryMenuPosition = ref({ left: 0, top: 0, width: 560 });

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
  selectionScopeNodes,
  chartDrilldown,
  semanticSelection,
  nestedBindingTarget,
  nestedBindingNode,
  nestedBindingColumns,
  nestedBindingSuggestedAngleFields,
  axisBindingTarget,
  axisBindingNode,
  axisBindingColumns,
  axisBindingRendererError,
  coordinateGuideNodes,
  barItemAxisBinding,
  seriesItemDropFrame,
  contextMenu,
  draggedCandidateId,
  activeDropZone,
  activeDataBindingDropZone,
  dimensionDropTarget,
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
  canTransformSelection,
  canRemoveSelectionComposition,
  canEnterSelection,
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
  enterSelection,
  removeSelectionComposition,
  onEditingGroupBackgroundPointerDown,
  onSemanticMarkPointerDown,
  onCanvasNodeContextMenu,
  onScaleHandlePointerDown,
  onRotateHandlePointerDown,
  onCoordinateOriginPointerDown,
  onCoordinateAxisScalePointerDown,
  onPolarAnglePointerDown,
  setAxisBindingAggregation,
  setAxisSwap,
  clearSeriesBinding,
  setChartSeries,
  setCompositionEncoding,
  setSeriesFields,
  setChartEncoding,
  setPieAngleFields,
  setValueSeriesFields,
  removeBarItemField,
  setParallelFields,
  updateAxisBindingMarkGroupConfig,
  updateSelectedChartMarkGroupConfig,
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
  applyInputColumnIntent,
  closeDimensionDropDecision,
  reorderSelectedNodes,
  alignSelection,
  resetCanvasZoom,
} = useCanvasStore(canvasRef);
const implementedTemplateCategories = computed(() =>
  groupChartTemplateCandidates(implementedTemplateCandidates.value.filter((candidate) =>
    selectedCoordinateSystems.value.size === 0
      || selectedCoordinateSystems.value.has(candidate.coordinateSystem),
  )),
);
const activeTemplateCategory = computed(() =>
  implementedTemplateCategories.value.find((category) => category.id === activeTemplateCategoryId.value) ?? null,
);
const templateCategoryMenuStyle = computed(() => ({
  left: `${templateCategoryMenuPosition.value.left}px`,
  top: `${templateCategoryMenuPosition.value.top}px`,
  width: `${templateCategoryMenuPosition.value.width}px`,
  maxHeight: `${Math.max(180, window.innerHeight - templateCategoryMenuPosition.value.top - 16)}px`,
}));

function closeTemplateCategoryMenu() {
  activeTemplateCategoryId.value = null;
}

watch(selectedCoordinateSystems, closeTemplateCategoryMenu);

function toggleTemplateCategory(category: ChartTemplateCategory, event: MouseEvent) {
  if (activeTemplateCategoryId.value === category.id) {
    closeTemplateCategoryMenu();
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const preferredWidth = category.candidates.length <= 2 ? 360 : category.candidates.length <= 4 ? 540 : 680;
  const width = Math.min(preferredWidth, window.innerWidth - 32);
  templateCategoryMenuPosition.value = {
    left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
    top: rect.bottom + 6,
    width,
  };
  activeTemplateCategoryId.value = category.id;
}

function onTemplateCandidateDragEnd() {
  onCandidateDragEnd();
  closeTemplateCategoryMenu();
}

const { activeDataset, getDataset } = useDatasetStore();
const axisBindingRows = computed(() => {
  const datasetId = axisBindingNode.value?.chartSpec?.datasetId;
  const dataset = datasetId ? getDataset(datasetId) : activeDataset.value;
  return dataset?.rows ?? [];
});
const csvEncodingBindings = computed<Record<string, string[]>>(() => {
  const node = selectedIds.value.length === 1 ? selectedNodes.value[0] : null;
  const spec = node?.chartSpec;
  if (!spec) return {};
  const bindings: Record<string, string[]> = {};
  const add = (field: string | undefined, label: string) => {
    if (!field) return;
    const current = bindings[field] ?? [];
    if (!current.includes(label)) bindings[field] = [...current, label];
  };
  Object.entries(spec.encodings).forEach(([channel, encoding]) => {
    if (!encoding) return;
    if (channel === "y" && spec.valueFields?.length) return;
    const label: Record<string, string> = {
      x: "X",
      y: "Y",
      color: "Color",
      size: "Size",
      shape: "Shape",
      theta: "Theta",
      angle: "Theta",
      radius: "Radius",
      ring: "Ring",
      dimensions: "Dimensions",
    };
    add(encoding.field, label[channel] ?? channel);
  });

  const itemBinding = barItemAxisBinding(node);
  if (itemBinding) {
    itemBinding.fields.forEach((field) => add(field, itemBinding.label));
  } else {
    const seriesFields = spec.seriesFields?.map((encoding) => encoding.field)
      ?? (spec.series ? [spec.series.field] : []);
    seriesFields.forEach((field) => add(field, "Series"));
  }

  return bindings;
});
function createSeriesItemPresentation(node: CanvasNode) {
  const spec = node?.chartSpec;
  const binding = node ? barItemAxisBinding(node) : null;
  if (!node || !spec || !binding) return null;
  const rows = getDataset(spec.datasetId)?.rows ?? [];
  const categoricalFields = new Set(spec.seriesFields?.map((encoding) => encoding.field)
    ?? (spec.series ? [spec.series.field] : []));
  const markConfig = spec.markGroups?.[0]?.sharedConfig ?? {};
  const mappedStyles = isSeriesStyleMapping(markConfig.seriesStyleMapping)
    ? markConfig.seriesStyleMapping.values
    : isCategoricalColorMapping(markConfig.seriesColorMapping)
      ? Object.fromEntries(Object.entries(markConfig.seriesColorMapping.values).map(([member, color]) => [member, { color }]))
      : {};
  const fallbackColors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];
  const seen = new Set<string>();
  const members = binding.fields.flatMap((field) => {
    const fieldMembers = categoricalFields.has(field)
      ? Array.from(new Set(rows.map((row) => row[field] ?? "").filter(Boolean)))
      : [field];
    return fieldMembers.flatMap((member) => {
      if (seen.has(member)) return [];
      seen.add(member);
      const index = seen.size - 1;
      const style = (mappedStyles[member] ?? {}) as { color?: string; strokeWidth?: number; shape?: "solid" | "dashed" | "dotted" };
      return [{
        memberId: member,
        label: member,
        color: style.color ?? fallbackColors[index % fallbackColors.length]!,
        width: style.strokeWidth ?? Number(markConfig.strokeWidth ?? 2.5),
        shape: style.shape ?? "solid",
      }];
    });
  });
  return {
    node,
    label: binding.label,
    fields: binding.fields,
    members,
    legendVisible: markConfig.legendVisible === true,
    frame: seriesItemDropFrame(node),
  };
}
const seriesItemPresentations = computed(() => selectionScopeNodes.value.flatMap((node) => {
  const presentation = createSeriesItemPresentation(node);
  return presentation ? [presentation] : [];
}));
const seriesItemOverlay = computed(() => {
  if (selectedIds.value.length !== 1) return null;
  return seriesItemPresentations.value.find((item) => item.node.id === selectedIds.value[0]) ?? null;
});
const seriesItemLegends = computed(() => seriesItemPresentations.value.flatMap((item) => {
  if (!item.legendVisible || item.node.id === seriesItemOverlay.value?.node.id || item.members.length === 0) return [];
  const longestLabel = Math.max(...item.members.map((member) => member.label.length), 1);
  const height = item.members.length * 22;
  return [{
    ...item,
    legendFrame: {
      ...item.frame,
      y: item.frame.y + item.frame.height - height,
      width: Math.min(190, Math.max(90, 42 + longestLabel * 7)),
      height,
    },
  }];
}));
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

function encodingReviewKey(node: CanvasNode | null) {
  if (!node?.chartSpec) return "";
  const { encodings, series, angleFields, parallelFields } = node.chartSpec;
  return [
    node.id,
    node.chartSpec.chartType,
    ...Object.entries(encodings).sort(([left], [right]) => left.localeCompare(right)).map(([channel, encoding]) => `${channel}:${encoding?.field ?? ""}`),
    series?.field ?? "",
    ...(angleFields ?? []).map((encoding) => `angle:${encoding.field}`),
    ...(parallelFields ?? []).map((encoding) => `dimension:${encoding.field}`),
    ...(node.chartSpec.valueFields ?? []).map((encoding) => `value:${encoding.field}`),
    JSON.stringify(node.chartSpec.aggregations ?? {}),
  ].join("|");
}

const activeCompositionType = ref<CompositionType | null>(null);
const axisBindingMarkGroupConfig = computed(() =>
  axisBindingNode.value?.chartSpec?.markGroups?.[0]?.sharedConfig ?? {},
);
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
const encodingTargetNode = computed(() =>
  selectedNodes.value.find((node) => !!node.chartSpec)
  ?? axisBindingNode.value,
);
const canToggleEncodingInspector = computed(() => !!encodingTargetNode.value);
const dimensionDropNode = computed(() => dimensionDropTarget.value
  ? selectedNodes.value.find((node) => node.id === dimensionDropTarget.value?.nodeId) ?? null
  : null);
const dimensionDropField = computed(() => dimensionDropTarget.value?.fieldName ?? "");

function defaultEncodingChannel(node: CanvasNode): CoordinateChannel {
  return isPolarChartType(node.chartSpec?.chartType ?? "") ? "angle" : "x";
}

function selectEncodingTarget(node: CanvasNode) {
  if (axisBindingTarget.value?.nodeId === node.id) return;
  axisBindingTarget.value = {
    nodeId: node.id,
    channel: defaultEncodingChannel(node),
  };
}

function toggleEncodingInspector() {
  if (encodingInspectorOpen.value) {
    encodingInspectorOpen.value = false;
    return;
  }
  const node = encodingTargetNode.value;
  if (!node) return;
  closeCompositionCandidates();
  selectEncodingTarget(node);
  encodingInspectorOpen.value = true;
}

function closeEncodingInspector() {
  encodingInspectorOpen.value = false;
}
const selectedCanvasNodesWithCoordinateGuides = coordinateGuideNodes;

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
    closeTemplateCategoryMenu();
    closeCompositionCandidates();
    closeAxisBinding();
    closeNestedBinding();
  }
}

function onEncodingChannelChange(channel: ChartEncodingChannel, field: string) {
  setChartEncoding(channel, field);
}

function onSeriesItemStyleChange(memberId: string, patch: { color?: string; strokeWidth?: number; shape?: "solid" | "dashed" | "dotted" }) {
  const node = selectedIds.value.length === 1 ? selectedNodes.value[0] : null;
  if (!node?.chartSpec) return;
  const current = node.chartSpec.markGroups?.[0]?.sharedConfig.seriesStyleMapping;
  const legacy = node.chartSpec.markGroups?.[0]?.sharedConfig.seriesColorMapping;
  const values = isSeriesStyleMapping(current)
    ? current.values
    : isCategoricalColorMapping(legacy)
      ? Object.fromEntries(Object.entries(legacy.values).map(([member, color]) => [member, { color }]))
      : {};
  updateSelectedChartMarkGroupConfig({
    seriesStyleMapping: {
      type: "series-style",
      values: {
        ...values,
        [memberId]: { ...values[memberId], ...patch },
      },
    },
  });
}

function onCompositionEncodingChange(patch: Parameters<typeof setCompositionEncoding>[0]) {
  setCompositionEncoding(patch);
}

function onAxisSwap(swapped: boolean) {
  setAxisSwap(swapped);
}

function onSeriesFieldChange(field: string) {
  setChartSeries(field);
}

function onSeriesFieldsChange(fields: string[]) {
  setSeriesFields(fields);
}

function removeSeriesCaptionItem(nodeId: string, field: string, event: Event) {
  event.preventDefault();
  event.stopPropagation();
  removeBarItemField(nodeId, field);
}

function confirmEncodingInspector() {
  const node = axisBindingNode.value;
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

watch(encodingTargetNode, (node) => {
  if (!node) return;
  selectEncodingTarget(node);
}, { immediate: true });

onMounted(() => {
  window.addEventListener("keydown", onCompositionKeyDown);
  window.addEventListener("click", closeCompositionCandidates);
  window.addEventListener("click", closeTemplateCategoryMenu);
  window.addEventListener("resize", positionNestedBindingPopup);
  window.addEventListener("resize", closeTemplateCategoryMenu);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onCompositionKeyDown);
  window.removeEventListener("click", closeCompositionCandidates);
  window.removeEventListener("click", closeTemplateCategoryMenu);
  window.removeEventListener("resize", positionNestedBindingPopup);
  window.removeEventListener("resize", closeTemplateCategoryMenu);
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
            <div class="implemented-template-category-list">
              <button
                v-for="category in implementedTemplateCategories"
                :key="category.id"
                class="implemented-template-category"
                :class="{ 'implemented-template-category--active': activeTemplateCategoryId === category.id }"
                type="button"
                :title="`${category.label}: ${category.candidates.map((candidate) => candidate.name).join(', ')}`"
                :aria-label="`${category.label}, ${category.candidates.length} templates`"
                aria-haspopup="menu"
                :aria-expanded="activeTemplateCategoryId === category.id"
                @click.stop="toggleTemplateCategory(category, $event)"
              >
                <div
                  class="implemented-template-category__preview"
                  :class="`implemented-template-category__preview--${Math.min(4, category.candidates.length)}`"
                >
                  <span
                    v-for="candidate in category.candidates.slice(0, 4)"
                    :key="candidate.id"
                    class="implemented-template-category__tile"
                  >
                    <img :src="candidate.src" alt="" draggable="false" />
                  </span>
                </div>
                <span class="implemented-template-category__footer">
                  <span>{{ category.label }}</span>
                  <span class="implemented-template-category__count">{{ category.candidates.length }}</span>
                  <ChevronDown :size="14" :stroke-width="1.7" aria-hidden="true" />
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </aside>

    <Teleport to="body">
      <div
        v-if="activeTemplateCategory"
        class="template-category-menu"
        :style="templateCategoryMenuStyle"
        role="menu"
        :aria-label="`${activeTemplateCategory.label} chart templates`"
        @click.stop
      >
        <header class="template-category-menu__header">
          <div>
            <strong>{{ activeTemplateCategory.label }}</strong>
            <span>{{ activeTemplateCategory.candidates.length }} templates</span>
          </div>
          <button type="button" title="Close" aria-label="Close template menu" @click="closeTemplateCategoryMenu">
            <X :size="15" :stroke-width="1.7" aria-hidden="true" />
          </button>
        </header>
        <div class="template-category-menu__grid">
          <article
            v-for="candidate in activeTemplateCategory.candidates"
            :key="candidate.id"
            class="template-category-menu__item"
            draggable="true"
            role="menuitem"
            :title="candidate.name"
            @dragstart="onCandidateDragStart(candidate, $event)"
            @dragend="onTemplateCandidateDragEnd"
          >
            <div class="template-category-menu__preview">
              <img :src="candidate.src" alt="" draggable="false" />
            </div>
            <span>{{ candidate.name }}</span>
          </article>
        </div>
      </div>
    </Teleport>

    <div class="workbench">
      <CsvDataPanel
        :encoding-bindings="csvEncodingBindings"
      />
      <main class="workspace">
        <section
          ref="canvasRef"
          class="canvas-board"
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
            class="encoding-control"
            :class="{ 'encoding-control--active': encodingInspectorOpen }"
            type="button"
            :disabled="!canToggleEncodingInspector"
            :aria-expanded="encodingInspectorOpen"
            aria-controls="encoding-inspector"
            title="Encoding"
            @click.stop="toggleEncodingInspector"
          >
            <SlidersHorizontal :size="15" :stroke-width="1.7" aria-hidden="true" />
            <span>Encoding</span>
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
            v-if="encodingInspectorOpen && axisBindingTarget"
            id="encoding-inspector"
            class="encoding-inspector"
            role="dialog"
            aria-modal="false"
            :aria-label="`${axisBindingNode?.chartSpec?.chartType ?? 'Chart'} mark encodings`"
            @click.stop
            @pointerdown.stop
          >
            <EncodingConfigPanel
              v-if="axisBindingNode?.chartSpec"
              :chart-name="axisBindingNode.chartSpec.chartType ?? axisBindingNode.name"
              :chart-spec="axisBindingNode.chartSpec"
              :composition-spec="axisBindingNode.compositionSpec"
              :columns="axisBindingColumns"
              :rows="axisBindingRows"
              :mark-config="axisBindingMarkGroupConfig"
              :renderer-error="axisBindingRendererError"
              @close="closeEncodingInspector"
              @confirm="confirmEncodingInspector"
              @channel-change="onEncodingChannelChange"
              @composition-change="onCompositionEncodingChange"
              @axis-swap="onAxisSwap"
              @series-field-change="onSeriesFieldChange"
              @series-fields-change="onSeriesFieldsChange"
              @value-series-fields-change="setValueSeriesFields"
              @angle-fields-change="setPieAngleFields"
              @parallel-fields-change="setParallelFields"
              @mark-config-change="updateAxisBindingMarkGroupConfig"
            />
          </aside>

          <div
            v-if="dimensionDropTarget"
            class="recommendation-popup-backdrop"
            @click="closeDimensionDropDecision"
          />
          <aside
            v-if="dimensionDropTarget"
            class="recommendation-popup dimension-drop-popup"
            role="dialog"
            aria-modal="true"
            :aria-label="`Choose how to use ${dimensionDropField}`"
            @click.stop
            @pointerdown.stop
          >
            <header class="recommendation-popup__header">
              <div>
                <strong>Use {{ dimensionDropField }}</strong>
                <span>{{ dimensionDropNode?.chartSpec?.chartType }}</span>
              </div>
              <button
                class="recommendation-popup__close"
                type="button"
                title="Close"
                aria-label="Close dimension options"
                @click="closeDimensionDropDecision"
              >
                <X :size="17" :stroke-width="1.7" aria-hidden="true" />
              </button>
            </header>
            <div class="recommendation-popup__options dimension-drop-popup__options">
              <article
                v-for="intent in dimensionDropTarget.analysis.intents"
                :key="intent.id"
                class="recommendation-option-card"
              >
                <span class="recommendation-option-card__strategy">{{ intent.kind }}</span>
                <strong>{{ intent.label }}</strong>
                <button type="button" @click="applyInputColumnIntent(intent.id)">Apply</button>
              </article>
            </div>
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
                :editing-chart-id="chartDrilldown?.nodeId ?? null"
                :selected-ids="selectedIds"
                :on-node-pointer-down="onCanvasNodePointerDown"
                :on-node-double-click="onCanvasNodeDoubleClick"
                :on-node-context-menu="onCanvasNodeContextMenu"
                :on-mark-pointer-down="onSemanticMarkPointerDown"
                :on-editing-background-pointer-down="onEditingGroupBackgroundPointerDown"
              />
              <CanvasCoordinateSystemLayer
                v-for="node in canvasNodes"
                :key="`coordinate-system-${node.id}`"
                :node="node"
              />
              <g v-if="activeDropZone" :transform="editingGroupTransform" class="composition-drop-zone-layer">
                <component
                  :is="activeDropZone.outline ? 'polygon' : 'rect'"
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
                  :points="activeDropZone.outline?.map((point) => `${point.x},${point.y}`).join(' ')"
                  vector-effect="non-scaling-stroke"
                />
              </g>
              <g
                v-for="legend in seriesItemLegends"
                :key="`series-item-legend-${legend.node.id}`"
                :transform="editingGroupTransform"
                class="series-item-legend-layer"
              >
                <g :transform="`rotate(${legend.legendFrame.rotation} ${legend.legendFrame.center.x} ${legend.legendFrame.center.y})`">
                  <foreignObject
                    :x="legend.legendFrame.x"
                    :y="legend.legendFrame.y"
                    :width="legend.legendFrame.width"
                    :height="legend.legendFrame.height"
                  >
                    <div xmlns="http://www.w3.org/1999/xhtml" class="series-item-legend">
                      <div
                        v-for="member in legend.members"
                        :key="`${legend.node.id}-legend-${member.memberId}`"
                        class="series-item-legend__item"
                      >
                        <span
                          class="series-item-legend__swatch"
                          :style="{ background: member.color }"
                          aria-hidden="true"
                        ></span>
                        <span :title="member.label">{{ member.label }}</span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              </g>
              <g
                v-if="seriesItemOverlay"
                :transform="editingGroupTransform"
                class="series-item-drop-guide"
              >
                <g
                  :transform="`rotate(${seriesItemOverlay.frame.rotation} ${seriesItemOverlay.frame.center.x} ${seriesItemOverlay.frame.center.y})`"
                >
                  <foreignObject
                    :x="seriesItemOverlay.frame.x"
                    :y="seriesItemOverlay.frame.y"
                    :width="seriesItemOverlay.frame.width"
                    :height="seriesItemOverlay.frame.height"
                  >
                    <div
                      xmlns="http://www.w3.org/1999/xhtml"
                      class="series-item-panel"
                      @pointerdown.stop
                    >
                      <header class="series-item-panel__header">
                        <strong>{{ seriesItemOverlay.label }}</strong>
                        <span class="series-item-panel__bindings">
                          <span
                            v-for="field in seriesItemOverlay.fields"
                            :key="`${seriesItemOverlay.node.id}-binding-${field}`"
                            class="series-item-panel__binding"
                          >
                            <span :title="field">{{ field }}</span>
                            <button
                              type="button"
                              :title="`Remove ${field}`"
                              :aria-label="`Remove ${field}`"
                              @pointerdown.stop
                              @click="removeSeriesCaptionItem(seriesItemOverlay.node.id, field, $event)"
                            >
                              <X :size="12" :stroke-width="1.8" aria-hidden="true" />
                            </button>
                          </span>
                        </span>
                      </header>
                      <div
                        v-for="member in seriesItemOverlay.members"
                        :key="`${seriesItemOverlay.node.id}-series-member-${member.memberId}`"
                        class="series-item-panel__member"
                      >
                        <span :title="member.label">{{ member.label }}</span>
                        <label
                          class="series-item-panel__color"
                          :style="{ background: member.color }"
                          :title="`${member.label} color`"
                        >
                          <input
                            type="color"
                            :value="member.color"
                            :aria-label="`${member.label} color`"
                            @input="onSeriesItemStyleChange(member.memberId, { color: ($event.target as HTMLInputElement).value })"
                          />
                        </label>
                        <input
                          type="number"
                          min="0.5"
                          max="16"
                          step="0.5"
                          :value="member.width"
                          :aria-label="`${member.label} stroke width`"
                          @change="onSeriesItemStyleChange(member.memberId, { strokeWidth: Number(($event.target as HTMLInputElement).value) })"
                        />
                        <select
                          :value="member.shape"
                          :aria-label="`${member.label} line style`"
                          @change="onSeriesItemStyleChange(member.memberId, { shape: ($event.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted' })"
                        >
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                        </select>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              </g>
              <g
                v-if="activeDataBindingDropZone"
                :transform="editingGroupTransform"
                class="data-binding-drop-zone-layer"
              >
                <template v-if="activeDataBindingDropZone.type === 'polar-axis'">
                  <path
                    class="data-binding-drop-zone"
                    :class="{
                      'data-binding-drop-zone--invalid': !activeDataBindingDropZone.compatible,
                    }"
                    :d="activeDataBindingDropZone.path"
                    vector-effect="non-scaling-stroke"
                  />
                  <text
                    class="data-binding-drop-zone__label"
                    :x="activeDataBindingDropZone.labelPosition.x"
                    :y="activeDataBindingDropZone.labelPosition.y"
                    text-anchor="middle"
                  >{{ activeDataBindingDropZone.channel === 'angle' ? 'Theta' : 'R' }}</text>
                </template>
                <template v-else-if="activeDataBindingDropZone.type === 'series-item'">
                  <g :transform="`rotate(${activeDataBindingDropZone.frame.rotation} ${activeDataBindingDropZone.frame.center.x} ${activeDataBindingDropZone.frame.center.y})`">
                    <rect
                      class="data-binding-series-item-drop-zone"
                      :class="{
                        'data-binding-drop-zone--invalid': !activeDataBindingDropZone.compatible,
                      }"
                      :x="activeDataBindingDropZone.frame.x"
                      :y="activeDataBindingDropZone.frame.y"
                      :width="activeDataBindingDropZone.frame.width"
                      :height="activeDataBindingDropZone.frame.height"
                      rx="6"
                      vector-effect="non-scaling-stroke"
                    />
                    <text
                      class="data-binding-series-item-drop-zone__label"
                      :class="{
                        'data-binding-series-item-drop-zone__label--invalid': !activeDataBindingDropZone.compatible,
                      }"
                      :x="activeDataBindingDropZone.frame.x + activeDataBindingDropZone.frame.width / 2"
                      :y="activeDataBindingDropZone.frame.y + activeDataBindingDropZone.frame.height / 2"
                      text-anchor="middle"
                      dominant-baseline="middle"
                    >{{ activeDataBindingDropZone.label }}</text>
                  </g>
                </template>
                <rect
                  v-else-if="activeDataBindingDropZone.type === 'chart-body'"
                  class="data-binding-chart-drop-zone"
                  :x="activeDataBindingDropZone.bounds.minX"
                  :y="activeDataBindingDropZone.bounds.minY"
                  :width="activeDataBindingDropZone.bounds.width"
                  :height="activeDataBindingDropZone.bounds.height"
                  vector-effect="non-scaling-stroke"
                />
                <ellipse
                  v-else-if="activeDataBindingDropZone.type === 'polar-slice'"
                  class="data-binding-drop-zone"
                  :class="{
                    'data-binding-drop-zone--invalid': !activeDataBindingDropZone.compatible,
                  }"
                  :cx="activeDataBindingDropZone.center.x"
                  :cy="activeDataBindingDropZone.center.y"
                  :rx="activeDataBindingDropZone.radiusX"
                  :ry="activeDataBindingDropZone.radiusY"
                  :transform="`rotate(${activeDataBindingDropZone.rotation} ${activeDataBindingDropZone.center.x} ${activeDataBindingDropZone.center.y})`"
                  vector-effect="non-scaling-stroke"
                />
                <line
                  v-else
                  class="data-binding-axis-drop-zone"
                  :class="{
                    'data-binding-drop-zone--invalid': !activeDataBindingDropZone.compatible,
                  }"
                  :x1="activeDataBindingDropZone.start.x"
                  :y1="activeDataBindingDropZone.start.y"
                  :x2="activeDataBindingDropZone.end.x"
                  :y2="activeDataBindingDropZone.end.y"
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
                <g v-if="selectionFrame">
                  <rect
                    class="selection-box"
                    :class="{ 'selection-box--semantic': !!semanticSelection }"
                    :x="selectionFrame.x"
                    :y="selectionFrame.y"
                    :width="selectionFrame.width"
                    :height="selectionFrame.height"
                    :transform="`rotate(${selectionFrame.rotation} ${selectionFrame.x + selectionFrame.width / 2} ${selectionFrame.y + selectionFrame.height / 2})`"
                    :vector-effect="'non-scaling-stroke'"
                  />
                  <circle
                    v-if="canTransformSelection"
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
                    v-if="canTransformSelection && rotateHandle"
                    class="rotate-stem"
                    :x1="rotateHandle.stemX"
                    :y1="rotateHandle.stemY"
                    :x2="rotateHandle.x"
                    :y2="rotateHandle.y"
                  />
                  <circle
                    v-if="canTransformSelection && rotateHandle"
                    class="rotate-handle"
                    :cx="rotateHandle.x"
                    :cy="rotateHandle.y"
                    :r="6 / selectionOverlayZoom"
                    :vector-effect="'non-scaling-stroke'"
                    title="Rotate"
                    @pointerdown="onRotateHandlePointerDown"
                  />
                  <g
                    v-if="canRemoveSelectionComposition"
                    class="selection-uncompose"
                    role="button"
                    tabindex="0"
                    aria-label="Remove composition"
                    :transform="`translate(${selectionFrame.x + selectionFrame.width / 2} ${selectionFrame.y + selectionFrame.height / 2})`"
                    @pointerdown.stop.prevent="removeSelectionComposition"
                    @keydown.enter.stop.prevent="removeSelectionComposition"
                    @keydown.space.stop.prevent="removeSelectionComposition"
                  >
                    <title>Remove composition</title>
                    <circle
                      :r="Math.min(selectionFrame.width, selectionFrame.height) / 6"
                      :stroke-width="Math.min(selectionFrame.width, selectionFrame.height) / 6"
                    />
                    <g
                      class="selection-uncompose__icon"
                      :transform="`translate(${-7 / selectionOverlayZoom} ${-Math.min(selectionFrame.width, selectionFrame.height) / 6 - 7 / selectionOverlayZoom})`"
                    >
                      <Ungroup
                        :size="14 / selectionOverlayZoom"
                        :stroke-width="2.2"
                        aria-hidden="true"
                      />
                    </g>
                  </g>
                  <g
                    v-if="canEnterSelection"
                    class="selection-enter"
                    role="button"
                    tabindex="0"
                    aria-label="Enter selection"
                    :transform="`translate(${selectionFrame.x + selectionFrame.width / 2} ${selectionFrame.y + selectionFrame.height / 2})`"
                    @pointerdown.stop.prevent="enterSelection"
                    @keydown.enter.stop.prevent="enterSelection"
                  >
                    <circle
                      :r="Math.min(selectionFrame.width, selectionFrame.height) / (canRemoveSelectionComposition ? 12 : 4)"
                      vector-effect="non-scaling-stroke"
                    />
                    <text
                      text-anchor="middle"
                      dominant-baseline="middle"
                      :font-size="13 / selectionOverlayZoom"
                    >Enter</text>
                  </g>
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
                :on-axis-scale-pointer-down="onCoordinateAxisScalePointerDown"
              />
              <PolarCoordinateSystem
                v-for="node in selectedCanvasNodesWithCoordinateGuides.filter((item) => item.coordinateGuide?.type !== 'Cartesian')"
                :key="`coordinate-guide-${node.id}`"
                :node="node"
                :view-zoom="selectionOverlayZoom"
                :on-angle-pointer-down="onPolarAnglePointerDown"
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
  --browser-panel-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px 28px 8px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: rgba(248, 251, 255, 0.86);
  backdrop-filter: blur(12px);
}
.sidebar__top {
  display: grid;
  grid-template-columns: 170px minmax(240px, 30%) minmax(0, 1fr);
  gap: 20px;
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
  grid-template-rows: 22px minmax(0, 1fr);
  min-width: 0;
}
.implemented-templates__title {
  margin: 0;
  color: #516176;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.implemented-template-category-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 240px;
  grid-template-rows: 190px;
  gap: 12px;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}
.implemented-template-category-list:hover,
.implemented-template-category-list:focus-within {
  scrollbar-color: #a8b4c4 transparent;
}
.implemented-template-category-list::-webkit-scrollbar {
  height: 8px;
}
.implemented-template-category-list::-webkit-scrollbar-track,
.implemented-template-category-list::-webkit-scrollbar-thumb {
  background: transparent;
}
.implemented-template-category-list:hover::-webkit-scrollbar-thumb,
.implemented-template-category-list:focus-within::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: #a8b4c4;
  background-clip: padding-box;
}
.implemented-template-category {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 30px;
  width: 240px;
  height: 190px;
  min-width: 240px;
  min-height: 190px;
  padding: 8px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.implemented-template-category:hover,
.implemented-template-category--active {
  border-color: rgba(37, 99, 235, 0.48);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.implemented-template-category__preview {
  display: grid;
  gap: 3px;
  min-width: 0;
  min-height: 0;
  padding: 3px;
  overflow: hidden;
  background: #f7f9fc;
}
.implemented-template-category__preview--1 {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}
.implemented-template-category__preview--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: 1fr;
}
.implemented-template-category__preview--3,
.implemented-template-category__preview--4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}
.implemented-template-category__preview--3 .implemented-template-category__tile:last-child {
  grid-column: 1 / 3;
}
.implemented-template-category__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(31, 45, 61, 0.08);
  background: #fff;
}
.implemented-template-category__tile img {
  width: 100%;
  height: 100%;
  padding: 2px;
  object-fit: contain;
}
.implemented-template-category__footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 0 4px 0 7px;
  line-height: 30px;
}
.implemented-template-category__footer > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.implemented-template-category__count {
  color: #728196;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.implemented-template-category__footer svg {
  transition: transform 140ms ease;
}
.implemented-template-category--active .implemented-template-category__footer svg {
  transform: rotate(180deg);
}
.template-category-menu {
  position: fixed;
  z-index: 50;
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr);
  max-height: calc(100vh - 210px);
  padding: 7px;
  border: 1px solid rgba(24, 33, 47, 0.16);
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(31, 45, 61, 0.18);
}
.template-category-menu__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 3px 7px 7px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
}
.template-category-menu__header > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.template-category-menu__header strong {
  color: #223041;
  font-size: 12px;
}
.template-category-menu__header span {
  color: #728196;
  font-size: 10px;
}
.template-category-menu__header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  background: transparent;
  color: #5b6b80;
  cursor: pointer;
}
.template-category-menu__header button:hover {
  background: #eef3f8;
}
.template-category-menu__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  gap: 7px;
  min-height: 0;
  padding-top: 7px;
  overflow-y: auto;
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}
.template-category-menu__grid:hover,
.template-category-menu__grid:focus-within {
  scrollbar-color: #a8b4c4 transparent;
}
.template-category-menu__grid::-webkit-scrollbar {
  width: 8px;
}
.template-category-menu__grid::-webkit-scrollbar-track,
.template-category-menu__grid::-webkit-scrollbar-thumb {
  background: transparent;
}
.template-category-menu__grid:hover::-webkit-scrollbar-thumb,
.template-category-menu__grid:focus-within::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: #a8b4c4;
  background-clip: padding-box;
}
.template-category-menu__item {
  display: grid;
  grid-template-rows: 82px 24px;
  min-width: 0;
  padding: 5px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  cursor: grab;
  transition: border-color 140ms ease, background 140ms ease;
}
.template-category-menu__item:hover {
  border-color: rgba(37, 99, 235, 0.45);
  background: #f8fbff;
}
.template-category-menu__item:active {
  cursor: grabbing;
}
.template-category-menu__preview {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.template-category-menu__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.template-category-menu__item > span {
  align-self: end;
  overflow: hidden;
  font-size: 10px;
  line-height: 24px;
  text-align: center;
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
  gap: 8px;
  min-height: 38px;
  padding: 7px 12px;
  font-size: 14px;
}
.filter-group--coordinate .filter-chip__icon {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
}
.filter-group--coordinate .filter-chip__icon :deep(svg) {
  width: 17px;
  height: 17px;
}
.filter-group__title {
  margin: 0;
  color: #516176;
  font-size: 13px;
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
  background: #fff;
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
.dimension-decision-control {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 8px;
  background: rgba(239, 246, 255, 0.94);
  color: #1d4ed8;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(45, 89, 126, 0.12);
  backdrop-filter: blur(8px);
}
.dimension-decision-control:hover {
  border-color: #2563eb;
  background: #dbeafe;
}
.dimension-decision-control span {
  font-size: 11px;
  font-weight: 650;
}
.encoding-control {
  position: absolute;
  top: 16px;
  right: 264px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 104px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(45, 89, 126, 0.1);
  backdrop-filter: blur(8px);
}
.encoding-control:hover:not(:disabled),
.encoding-control--active {
  border-color: rgba(28, 126, 214, 0.38);
  background: #edf5fc;
  color: #1554b2;
}
.encoding-control:disabled {
  opacity: 0.42;
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
  top: 58px;
  right: 264px;
  z-index: 5;
  width: min(420px, calc(100% - 24px));
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
.recommendation-popup__header > .recommendation-popup__header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
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
.recommendation-popup__close:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}
.recommendation-popup__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}
.repair-plan-list {
  display: grid;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
}
.repair-plan-option {
  display: grid;
  grid-template-columns: minmax(110px, 0.5fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.repair-plan-option:hover {
  border-color: #2563eb;
  background: #f8fbff;
}
.repair-plan-option strong {
  overflow-wrap: anywhere;
  color: #18212f;
  font-size: 13px;
}
.repair-plan-option small {
  color: #94a3b8;
  font-size: 10px;
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
.recommendation-option-card:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
.recommendation-option-card--disabled {
  opacity: 0.56;
  cursor: default;
}
.recommendation-option-card--disabled:hover {
  border-color: rgba(24, 33, 47, 0.12);
  box-shadow: none;
  transform: none;
}
.recommendation-option-card select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgba(24, 33, 47, 0.16);
  border-radius: 5px;
  background: #fff;
  color: #334155;
  font: inherit;
}
.recommendation-option-card > button {
  min-height: 34px;
  border: 1px solid #2563eb;
  border-radius: 5px;
  background: #2563eb;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.dimension-drop-popup {
  width: min(720px, calc(100% - 48px));
  max-height: min(520px, calc(100% - 48px));
}
.dimension-drop-popup__options {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.dimension-drop-popup__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.dimension-drop-popup__actions button {
  min-height: 34px;
  border: 1px solid #2563eb;
  border-radius: 5px;
  background: #fff;
  color: #1d4ed8;
  font: inherit;
  cursor: pointer;
}
.dimension-drop-popup__actions button:hover {
  background: #eff6ff;
}
.facet-direction-control {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  min-height: 34px;
  border: 1px solid rgba(24, 33, 47, 0.16);
  border-radius: 5px;
  overflow: hidden;
}
.facet-direction-control__button--active,
.facet-direction-control button {
  min-width: 0;
  border: 0;
  background: #fff;
  color: #64748b;
  font: inherit;
  cursor: pointer;
}
.facet-direction-control button + button {
  border-left: 1px solid rgba(24, 33, 47, 0.12);
}
.facet-direction-control .facet-direction-control__button--active {
  background: #e0f2fe;
  color: #075985;
  font-weight: 700;
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
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}
.canvas-board--dragging {
  outline: 2px dashed rgba(28, 126, 214, 0.48);
  outline-offset: -10px;
}
.composition-drop-zone-layer {
  pointer-events: none;
}
.data-binding-drop-zone-layer {
  pointer-events: none;
}
.series-item-drop-guide { pointer-events: none; }
.series-item-drop-guide foreignObject { overflow: visible; pointer-events: all; }
.series-item-legend-layer { pointer-events: none; }
.series-item-legend {
  display: grid;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  align-content: start;
  overflow: hidden;
  padding: 2px 5px;
  background: rgba(255, 255, 255, 0.84);
  color: #263548;
  font-family: Inter, sans-serif;
}
.series-item-legend__item {
  display: grid;
  height: 22px;
  min-width: 0;
  grid-template-columns: 12px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
}
.series-item-legend__item > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-item-legend__swatch {
  display: block;
  width: 11px;
  height: 11px;
  box-sizing: border-box;
  border: 1px solid rgba(24, 33, 47, 0.38);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.82);
}
.series-item-panel {
  display: grid;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  grid-auto-rows: 30px;
  overflow: hidden;
  border: 1.5px dashed rgba(21, 84, 178, 0.48);
  border-radius: 5px 5px 0 0;
  background: rgba(255, 255, 255, 0.96);
  color: #263548;
  font-family: Inter, sans-serif;
  pointer-events: auto;
}
.series-item-panel__header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-bottom: 1px solid rgba(21, 84, 178, 0.16);
  background: #edf5fc;
}
.series-item-panel__header strong {
  flex: 0 0 auto;
  color: #1554b2;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0;
}
.series-item-panel__member > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-item-panel__bindings {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  gap: 4px;
  overflow: hidden;
}
.series-item-panel__binding {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 2px;
  padding-left: 5px;
  border: 1px solid rgba(21, 84, 178, 0.2);
  border-radius: 4px;
  background: #fff;
  color: #516176;
  font-size: 9px;
}
.series-item-panel__binding > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-item-panel__binding button {
  display: inline-grid;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  padding: 0;
  place-items: center;
  border: 0;
  border-left: 1px solid rgba(21, 84, 178, 0.12);
  background: transparent;
  color: #687585;
  cursor: pointer;
}
.series-item-panel__binding button:hover {
  background: #fff1ef;
  color: #b42318;
}
.series-item-panel__member {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 28px 44px minmax(58px, 72px);
  align-items: center;
  gap: 5px;
  padding: 3px 6px 3px 8px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: #fff;
  font-size: 10px;
}
.series-item-panel__member > span:first-child {
  font-weight: 650;
}
.series-item-panel__member input[type="number"],
.series-item-panel__member select {
  min-width: 0;
  height: 23px;
  box-sizing: border-box;
  border: 1px solid #c9d5e1;
  border-radius: 4px;
  background: #fff;
  color: #33465b;
  font: inherit;
}
.series-item-panel__color {
  position: relative;
  display: block;
  width: 24px;
  height: 20px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(24, 33, 47, 0.38);
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
  cursor: pointer;
}
.series-item-panel__color input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  opacity: 0;
  cursor: pointer;
}
.series-item-panel__member input[type="number"] { width: 44px; padding: 0 3px; }
.series-item-panel__member select { width: 100%; padding: 0 3px; }
.data-binding-drop-zone {
  fill: rgba(28, 126, 214, 0.18);
  stroke: #1c7ed6;
  stroke-width: 3;
  stroke-dasharray: 7 5;
}
.data-binding-drop-zone--invalid {
  fill: rgba(220, 38, 38, 0.14);
  stroke: #dc2626;
}
.data-binding-drop-zone__label {
  fill: #1554b2;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}
.data-binding-chart-drop-zone {
  fill: rgba(37, 99, 235, 0.08);
  stroke: #2563eb;
  stroke-width: 2;
  stroke-dasharray: 8 6;
}
.data-binding-series-item-drop-zone {
  fill: rgba(21, 84, 178, 0.1);
  stroke: #1554b2;
  stroke-width: 2;
  stroke-dasharray: 7 5;
}
.data-binding-series-item-drop-zone.data-binding-drop-zone--invalid {
  fill: rgba(180, 35, 24, 0.1);
  stroke: #b42318;
}
.data-binding-series-item-drop-zone__label {
  fill: #1554b2;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}
.data-binding-series-item-drop-zone__label--invalid { fill: #b42318; }
.data-binding-axis-drop-zone {
  stroke: #1c7ed6;
  stroke-width: 8;
  stroke-linecap: round;
  opacity: 0.72;
}
.data-binding-axis-drop-zone.data-binding-drop-zone--invalid {
  stroke: #dc2626;
}
.composition-drop-zone {
  fill: rgba(37, 99, 235, 0.14);
  stroke: #2563eb;
  stroke-width: 2;
  stroke-dasharray: 7 5;
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
  /* Let the explicit frame-sized hit target below receive events. The default
     SVG hit testing avoids expanding the group to overflowing chart content. */
  pointer-events: auto !important;
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
.canvas-object :deep(.chart-placeholder-frame) {
  fill: rgba(255, 255, 255, 0.03);
  stroke: #6f8194;
  stroke-width: 1.5;
  stroke-dasharray: 7 5;
  pointer-events: none !important;
}
.canvas-object--selected :deep(.chart-placeholder-frame) {
  stroke: #1c7ed6;
  stroke-width: 2;
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
.canvas-scene :deep(.cartesian-axis-item-bindings) {
  pointer-events: all;
}
.canvas-scene :deep(.cartesian-axis-item-bindings__label) {
  fill: #516176;
  font-weight: 700;
  letter-spacing: 0;
  pointer-events: none;
}
.canvas-scene :deep(.cartesian-axis-item-binding__background) {
  fill: #edf5fc;
  stroke: rgba(28, 126, 214, 0.34);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.canvas-scene :deep(.cartesian-axis-item-binding__text) {
  fill: #1554b2;
  font-weight: 600;
  letter-spacing: 0;
  pointer-events: none;
}
.canvas-scene :deep(.cartesian-axis-item-binding__remove) {
  cursor: pointer;
}
.canvas-scene :deep(.cartesian-axis-item-binding__remove path) {
  fill: none;
  stroke: #516176;
  stroke-linecap: round;
  stroke-width: 1.5;
}
.canvas-scene :deep(.cartesian-axis-item-binding__remove:hover path) {
  stroke: #b42f2f;
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
.coordinate-guide-layer :deep(.polar-coordinate-radius-axis),
.coordinate-guide-layer :deep(.polar-coordinate-angle-axis) {
  fill: none;
  stroke: rgba(17, 17, 17, 0.78);
  stroke-width: 1.5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.coordinate-guide-layer :deep(.polar-coordinate-radius-axis--upper),
.coordinate-guide-layer :deep(.polar-coordinate-angle-axis--upper) {
  stroke: #1554b2;
}
.coordinate-guide-layer :deep(.polar-coordinate-axis-label) {
  fill: #1554b2;
  font-family: Inter, sans-serif;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.polar-coordinate-angle-control) {
  cursor: grab;
  touch-action: none;
}
.coordinate-guide-layer :deep(.polar-coordinate-angle-control:active) {
  cursor: grabbing;
}
.coordinate-guide-layer :deep(.polar-coordinate-angle-hit-target) {
  fill: transparent;
  stroke: transparent;
}
.coordinate-guide-layer :deep(.polar-coordinate-angle-handle) {
  fill: #fff;
  stroke: #1554b2;
  stroke-width: 2;
  opacity: 0;
  transition: opacity 120ms ease;
  vector-effect: non-scaling-stroke;
}
.coordinate-guide-layer :deep(.polar-coordinate-angle-control:hover .polar-coordinate-angle-handle),
.coordinate-guide-layer :deep(.polar-coordinate-angle-control:active .polar-coordinate-angle-handle) {
  opacity: 1;
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
.selection-box--semantic {
  fill: rgba(21, 84, 178, 0.1);
  stroke-dasharray: none;
}
.selection-enter {
  opacity: 0.46;
  pointer-events: all;
  cursor: pointer;
  outline: none;
  transition: opacity 140ms ease;
}
.selection-enter circle {
  fill: #b42318;
  stroke: #fff;
  stroke-width: 2.5;
  filter: drop-shadow(0 3px 7px rgba(77, 18, 14, 0.38));
}
.selection-enter text {
  fill: #fff;
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 0;
  pointer-events: none;
  user-select: none;
}
.selection-enter:hover,
.selection-enter:focus {
  opacity: 1;
}
.selection-uncompose {
  opacity: 0.32;
  pointer-events: all;
  cursor: pointer;
  outline: none;
  transition: opacity 140ms ease;
}
.selection-uncompose > circle {
  fill: none;
  stroke: #b42318;
  pointer-events: stroke;
  filter: drop-shadow(0 3px 7px rgba(77, 18, 14, 0.28));
}
.selection-uncompose__icon {
  color: #fff;
  pointer-events: none;
}
.selection-uncompose:hover,
.selection-uncompose:focus {
  opacity: 0.86;
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
    grid-template-columns: 170px minmax(240px, 30%) minmax(0, 1fr);
  }
  .sidebar__browser {
    grid-column: 2 / 4;
  }
}
@media (max-width: 960px) {
  .sidebar {
    padding: 18px;
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
  .dimension-decision-control {
    top: 12px;
    left: 12px;
  }
  .encoding-control {
    top: 12px;
    right: 244px;
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
    width: min(420px, calc(100% - 24px));
    min-width: 0;
  }
  .dimension-drop-popup__options {
    grid-template-columns: minmax(0, 1fr);
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
