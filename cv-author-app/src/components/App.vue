<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { ArrowLeftRight, ArrowUp, Check, ChevronDown, Move, RotateCcw, SlidersHorizontal, Split as SplitIcon, X } from "@lucide/vue";
import { CanvasNodeView } from "./CanvasNodeView";
import DeckglMapLayer from "./DeckglMapLayer.vue";
import DeckglEncodingConfigPanel from "./DeckglEncodingConfigPanel.vue";
import AlignmentToolbar from "./AlignmentToolbar.vue";
import { CanvasCoordinateSystemLayer } from "./CartesianCoordinateSystem";
import { PolarCoordinateSystem } from "./PolarCoordinateSystem";
import CsvDataPanel from "./CsvDataPanel.vue";
import EncodingConfigPanel from "./EncodingConfigPanel.vue";
import CompositionConfigPanel from "./CompositionConfigPanel.vue";
import type {
  CanvasNode,
  ChartDataTransform,
  ChartAxisChannel,
  ChartAxisConfig,
  ChartEncodingChannel,
  CompositionType,
  CoordinateChannel,
  EncodingChannel,
  GeographicMapViewState,
  MarkGroupSharedConfig,
  SvgCandidate,
} from "../types";
import { materializeChartDataTransforms } from "../utils/chartDataTransforms";
import { materializeGraphDataset } from "../utils/chartDataPipeline";
import {
  useCanvasStore,
  coordinateOptions,
  compositionOptions,
  getFilterIconSvg,
} from "../stores/useCanvasStore";
import { useDatasetStore } from "../stores/useDatasetStore";
import {
  isCategoricalColorMapping,
  isSeriesStyleMapping,
} from "../utils/visualMapping";
import {
  groupChartTemplateCandidates,
  type ChartTemplateCategory,
} from "../utils/chartTemplateCategories";
import { getGeographicLayerFamily } from "../utils/geographicLayerCards";
import { getChartTemplateContract } from "../utils/chartTemplates";
import {
  cartesianTreeDirection,
  cartesianTreeLeafAxis,
  isCartesianTreeChart,
} from "../utils/treeLayout";
import { markMatchesNestedDataKey } from "../stores/canvas/nestedMarkIdentity";
import { globalPalette } from "../config/global";

const EMPTY_SELECTION_IDS: string[] = [];
const NESTED_MAX_DIAMETER = 360;

const canvasRef = ref<HTMLElement | null>(null);
const encodingInspectorOpen = ref(true);
const compositionInspectorOpen = ref(false);
const activeTemplateCategoryId = ref<string | null>(null);
const templateCategoryMenuPosition = ref({ left: 0, top: 0, width: 560 });
const facetClueDialog = ref<{
  nodeId: string;
  chartName: string;
  fields: string[];
  coordinateSystem: "Cartesian" | "Polar";
  rowField: string;
  columnField: string;
  thetaField: string;
  radiusField: string;
} | null>(null);

const {
  selectedCoordinateSystems,
  toggleCoordinateSystem,
  implementedTemplateCandidates,
  compositionCandidates,
  canvasNodes,
  chartRelationships,
  viewZoom,
  viewPan,
  selectedIds,
  editingGroupPath,
  editingCompositionId,
  selectionScopeNodes,
  chartDrilldown,
  semanticSelection,
  nestedBindingTarget,
  nestedBindingNode,
  nestedBindingColumns,
  nestedBindingSuggestedAngleFields,
  nestedPositionEditor,
  nestedRenderPlacements,
  nestedRenderedChildIds,
  axisBindingTarget,
  axisBindingNode,
  axisBindingColumns,
  axisBindingRendererError,
  coordinateGuideNodes,
  barItemAxisBinding,
  seriesItemMemberIds,
  seriesItemDropFrame,
  contextMenu,
  draggedCandidateId,
  compositionDragSourceId,
  activeDropZone,
  activeDataBindingDropZone,
  dimensionDropTarget,
  interaction,
  loadingDrop,
  importNotice,
  selectedNodes,
  passiveCompositeSelection,
  selectionBounds,
  selectionFrame,
  selectionPolarOutlines,
  selectionRotation,
  selectedPolarAngleSpan,
  editingGroupTransform,
  selectionOverlayZoom,
  rotationInputPosition,
  rotationInputVisible,
  polarAngleInputPosition,
  polarAngleInputVisible,
  marqueeBounds,
  selectionUnits,
  concatSplitControls,
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
  canConfigureSelectionComposition,
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
  enterSelection,
  configureSelectionComposition,
  exitSelectionHierarchy,
  removeSelectionComposition,
  splitConcatLink,
  onEditingGroupBackgroundPointerDown,
  onSemanticMarkPointerDown,
  onCanvasNodeContextMenu,
  onScaleHandlePointerDown,
  onRotateHandlePointerDown,
  onCoordinateOriginPointerDown,
  onCoordinateAxisScalePointerDown,
  onPolarAnglePointerDown,
  setAxisBindingAggregation,
  setSingleBarValueOrder,
  setAxisSwap,
  setChartAxisAppearance,
  clearSeriesBinding,
  setChartSeries,
  setCompositionEncoding,
  setSeriesFields,
  setChartEncoding,
  setPolarSegmentFields,
  setValueSeriesFields,
  removeBarItemField,
  setParallelFields,
  setChartDataTransforms,
  resetChartBindingsForDataset,
  setDeckglMapStyle,
  setDeckglMapViewState,
  setDeckglConfig,
  setDeckglEncoding,
  selectCanvasNode,
  updateAxisBindingMarkGroupConfig,
  updateSelectedChartMarkGroupConfig,
  beginMarkConfigEdit,
  commitMarkConfigEdit,
  closeAxisBinding,
  setSelectionRotation,
  setPolarAngleSpan,
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
  createFacetFromFields,
  applyDimensionFacet,
  confirmNestedBinding,
  closeNestedBinding,
  updateNestedPosition,
  updateNestedChildScale,
  resetNestedPosition,
  closeNestedPositionEditor,
  applyInputColumnIntent,
  closeDimensionDropDecision,
  reorderSelectedNodes,
  alignSelection,
  resetCanvasZoom,
} = useCanvasStore(canvasRef);
const visibleCanvasNodes = computed(() =>
  canvasNodes.value.filter((node) => !nestedRenderedChildIds.value.has(node.id)),
);
const deckglLayerNodes = computed(() => visibleCanvasNodes.value.filter((node) => node.layerKind === "deckgl"));
const chartTransformNode = computed(() => {
  if (selectedIds.value.length === 1) {
    const node = selectedNodes.value[0];
    return node?.chartSpec ? node : null;
  }
  const members = selectedNodes.value;
  const composition = members[0]?.compositionSpec;
  if (!composition || (composition.type !== "layer" && composition.type !== "concat")) return null;
  const memberIds = new Set(composition.members.map((member) => member.nodeId));
  if (members.length !== memberIds.size || members.some((member) => !memberIds.has(member.id))) return null;
  const ownerId = members[0]?.coordinateSystem?.ownerNodeId;
  const owner = members.find((member) => member.id === ownerId) ?? members[0];
  return owner?.chartSpec ? owner : null;
});
const selectedCompositionSpec = computed(() => {
  const selectedNode = selectedNodes.value[0];
  const composition = selectedNode?.compositionSpec;
  if (!composition) return null;
  // Facets are materialized as a group container. The container is the
  // active composite selection even though its member chart ids are nested
  // below it and therefore cannot appear in selectedIds.
  if (selectedNodes.value.length === 1
    && selectedNode?.kind === "group"
    && composition.type === "facet") return composition;
  const selected = new Set(selectedIds.value);
  return composition.members.every((member) => selected.has(member.nodeId))
    ? composition
    : null;
});
const implementedTemplateCategories = computed(() =>
  groupChartTemplateCandidates(implementedTemplateCandidates.value.filter((candidate) =>
    selectedCoordinateSystems.value.size === 0
      || selectedCoordinateSystems.value.has(candidate.coordinateSystem),
  )),
);
const hierarchyNavigationActive = computed(() =>
  editingGroupPath.value.length > 0 || !!chartDrilldown.value || !!editingCompositionId.value,
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

function deckglLayerType(node: CanvasNode) {
  if (node.deckglLayerType) return node.deckglLayerType;
  const candidateId = node.kind === "leaf" ? node.candidateId : "";
  const candidateLayerType = candidateId.split(":").at(-1);
  if (candidateLayerType) return candidateLayerType;
  return node.name.replace(/-(?:group|leaf)-\d+$/, "");
}

function deckglLayerFamily(node: CanvasNode) {
  return getGeographicLayerFamily(deckglLayerType(node));
}

function deckglLayerConfig(node: CanvasNode) {
  const family = deckglLayerFamily(node);
  return node.deckglConfig ?? (family === "point"
    ? { size: 8, color: "#2563eb" }
    : family === "area"
      ? { color: "#2563eb" }
      : {});
}

function deckglLayerDataset(node: CanvasNode) {
  return node.deckglBinding ? getDataset(node.deckglBinding.datasetId) : null;
}

function deckglLayerGeometrySource(node: CanvasNode) {
  return node.deckglBinding ? getGeometrySource(node.deckglBinding.geometrySourceId) : null;
}

function onDeckglMapInteraction(node: CanvasNode, event: PointerEvent) {
  if (event.button !== 0) return;
  selectCanvasNode(node.id);
}

function onDeckglMapViewStateChange(node: CanvasNode, state: GeographicMapViewState) {
  setDeckglMapViewState(node.id, state);
}

function deckglLayerStyle(node: CanvasNode) {
  const width = Math.max(node.width * Math.abs(node.scaleX), 1);
  const height = Math.max(node.height * Math.abs(node.scaleY), 1);
  const cx = width / 2;
  const cy = height / 2;
  return {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${node.x + cx}px, ${node.y + cy}px) rotate(${node.rotation}deg) translate(${-cx}px, ${-cy}px)`,
  };
}

function deckglLayerWidth(node: CanvasNode) {
  return Math.max(node.width * Math.abs(node.scaleX), 1);
}

function deckglLayerHeight(node: CanvasNode) {
  return Math.max(node.height * Math.abs(node.scaleY), 1);
}

function selectionActionPath(radius: number, position: "top" | "bottom" | "left") {
  const innerRadius = radius / 2;
  const outerOffset = radius * Math.SQRT1_2;
  const innerOffset = innerRadius * Math.SQRT1_2;
  if (position === "left") {
    return [
      `M ${-outerOffset} ${outerOffset}`,
      `A ${radius} ${radius} 0 0 1 ${-outerOffset} ${-outerOffset}`,
      `L ${-innerOffset} ${-innerOffset}`,
      `A ${innerRadius} ${innerRadius} 0 0 0 ${-innerOffset} ${innerOffset}`,
      "Z",
    ].join(" ");
  }
  const direction = position === "top" ? -1 : 1;
  const outerSweep = position === "top" ? 1 : 0;
  const innerSweep = position === "top" ? 0 : 1;
  return [
    `M ${-outerOffset} ${direction * outerOffset}`,
    `A ${radius} ${radius} 0 0 ${outerSweep} ${outerOffset} ${direction * outerOffset}`,
    `L ${innerOffset} ${direction * innerOffset}`,
    `A ${innerRadius} ${innerRadius} 0 0 ${innerSweep} ${-innerOffset} ${direction * innerOffset}`,
    "Z",
  ].join(" ");
}

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

const { activeDataset, getDataset, getGeometrySource } = useDatasetStore();
const axisBindingRows = computed(() => {
  const datasetId = axisBindingNode.value?.chartSpec?.datasetId;
  const dataset = datasetId ? getDataset(datasetId) : activeDataset.value;
  return dataset && axisBindingNode.value?.chartSpec
    ? materializeChartDataTransforms(
      materializeGraphDataset(dataset, axisBindingNode.value.chartSpec),
      axisBindingNode.value.chartSpec.dataTransforms,
    ).rows
    : dataset?.rows ?? [];
});

function findCanvasNodeInTree(nodes: CanvasNode[], nodeId: string): CanvasNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.kind === "group") {
      const child = findCanvasNodeInTree(node.children, nodeId);
      if (child) return child;
    }
  }
  return null;
}

function findFirstChartNodeInTree(nodes: CanvasNode[]): CanvasNode | null {
  for (const node of nodes) {
    if (node.chartSpec) return node;
    if (node.kind === "group") {
      const child = findFirstChartNodeInTree(node.children);
      if (child) return child;
    }
  }
  return null;
}

function encodingDatasetFor(node: CanvasNode) {
  const dataset = node.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
  return dataset && node.chartSpec
    ? materializeChartDataTransforms(
      materializeGraphDataset(dataset, node.chartSpec),
      node.chartSpec.dataTransforms,
    )
    : null;
}

function boundEncodingFields(node: CanvasNode) {
  const spec = node.chartSpec;
  if (!spec) return new Set<string>();
  return new Set([
    ...Object.values(spec.encodings).flatMap((encoding) => encoding ? [encoding.field] : []),
    ...(spec.series ? [spec.series.field] : []),
    ...(spec.seriesFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.valueFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.angleFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.parallelFields?.map((encoding) => encoding.field) ?? []),
  ]);
}

const nestedEncodingPair = computed(() => {
  const focusedId = axisBindingNode.value?.id;
  if (!focusedId) return null;
  const relationship = Object.values(chartRelationships.value.nestedRelationships).find((candidate) =>
    candidate.status === "active"
      && (candidate.parentChartId === focusedId || candidate.childChartId === focusedId));
  if (!relationship) return null;
  const parent = findCanvasNodeInTree(canvasNodes.value, relationship.parentChartId);
  const child = findCanvasNodeInTree(canvasNodes.value, relationship.childChartId);
  return parent?.chartSpec && child?.chartSpec
    ? { parent, child }
    : null;
});

const nestedEncodingEntries = computed(() => {
  const pair = nestedEncodingPair.value;
  if (!pair) return [];
  const parentDataset = encodingDatasetFor(pair.parent);
  const childDataset = encodingDatasetFor(pair.child);
  const fatherFields = boundEncodingFields(pair.parent);
  const childFields = new Set(childDataset?.columns.map((column) => column.name) ?? []);
  const fatherColumns = parentDataset?.columns.filter((column) =>
    fatherFields.has(column.name) && childFields.has(column.name)) ?? [];
  return [
    {
      role: "Father",
      node: pair.parent,
      dataset: parentDataset,
      fatherColumns: [],
    },
    {
      role: "Child",
      node: pair.child,
      dataset: childDataset,
      fatherColumns,
    },
  ];
});

function onChartTransformsChange(transforms: ChartDataTransform[]) {
  const node = chartTransformNode.value;
  if (node) setChartDataTransforms(node.id, transforms);
}

function onDatasetChange(datasetId: string) {
  resetChartBindingsForDataset(datasetId);
}
function createSeriesItemPresentation(node: CanvasNode) {
  const spec = node?.chartSpec;
  const itemBinding = node ? barItemAxisBinding(node) : null;
  const scatterColor = spec && isScatterChartType(spec.chartType)
    && (spec.encodings.color?.type === "nominal" || spec.encodings.color?.type === "ordinal" || spec.encodings.color?.type === "temporal")
    ? spec.encodings.color
    : null;
  const binding = itemBinding ?? (scatterColor
    ? { label: "Point type", fields: [scatterColor.field] }
    : null);
  if (!node || !spec || !binding) return null;
  const markConfig = spec.markGroups?.[0]?.sharedConfig ?? {};
  const mappedStyles = isSeriesStyleMapping(markConfig.seriesStyleMapping)
    ? markConfig.seriesStyleMapping.values
    : isCategoricalColorMapping(markConfig.seriesColorMapping)
      ? Object.fromEntries(Object.entries(markConfig.seriesColorMapping.values).map(([member, color]) => [member, { color }]))
      : {};
  const fallbackColors = globalPalette.categorical;
  const members = seriesItemMemberIds(node).map((member, index) => {
    const style = (mappedStyles[member] ?? {}) as { color?: string; strokeWidth?: number; shape?: "solid" | "dashed" | "dotted" };
    return {
      memberId: member,
      label: member,
      color: style.color ?? fallbackColors[index % fallbackColors.length]!,
      width: style.strokeWidth ?? Number(markConfig.strokeWidth ?? 2.5),
      shape: style.shape ?? "solid",
    };
  });
  return {
    node,
    label: binding.label,
    fields: binding.fields,
    members,
    legendVisible: markConfig.legendVisible === true,
    itemEditable: itemBinding !== null,
    colorOnly: isPolarChartType(spec.chartType),
    frame: seriesItemDropFrame(node),
  };
}
const seriesItemPresentations = computed(() => selectionScopeNodes.value.flatMap((node) => {
  const presentation = createSeriesItemPresentation(node);
  return presentation ? [presentation] : [];
}));
const seriesItemOverlay = computed(() => {
  if (selectedIds.value.length !== 1) return null;
  return seriesItemPresentations.value.find((item) =>
    item.itemEditable && item.node.id === selectedIds.value[0]) ?? null;
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

type AlignmentMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
type NestedAnchorSide = "parentAnchor" | "childAnchor";

const nestedAnchorOptions = [
  { x: 0, y: 0, label: "Top left" },
  { x: 0.5, y: 0, label: "Top center" },
  { x: 1, y: 0, label: "Top right" },
  { x: 0, y: 0.5, label: "Middle left" },
  { x: 0.5, y: 0.5, label: "Center" },
  { x: 1, y: 0.5, label: "Middle right" },
  { x: 0, y: 1, label: "Bottom left" },
  { x: 0.5, y: 1, label: "Bottom center" },
  { x: 1, y: 1, label: "Bottom right" },
] as const;

const nestedPreviewGeometry = {
  previewCenterY: 128,
  offsetScale: 2,
};
const nestedPreviewDrag = ref<{
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
  minDeltaX: number;
  maxDeltaX: number;
  minDeltaY: number;
  maxDeltaY: number;
} | null>(null);
type NestedElementPreview = {
  content: string;
  viewBox: string;
  width: number;
  height: number;
};

function nestedMarkBounds(mark: SVGGraphicsElement, reference: SVGGraphicsElement) {
  const bounds = mark.getBBox();
  const markMatrix = mark.getCTM();
  const referenceMatrix = reference.getCTM();
  if (!markMatrix || !referenceMatrix) return bounds;
  const matrix = referenceMatrix.inverse().multiply(markMatrix);
  const points = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map((point) => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function nestedRenderedMarkBounds(node: CanvasNode) {
  const liveNode = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
    .find((element) => element.dataset.nodeId === node.id);
  if (!liveNode) return null;
  const marks = Array.from(liveNode?.querySelectorAll<SVGGraphicsElement>("[data-mark-role]") ?? [])
    .filter((element) => !element.querySelector("[data-mark-role]"))
    .filter((element) => !(element.getAttribute("data-mark-role") ?? "").includes("label"));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  marks.forEach((mark) => {
    try {
      const bounds = nestedMarkBounds(mark, liveNode);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    } catch {
      // A mark without SVG geometry does not contribute to the preview box.
    }
  });
  return minX < maxX && minY < maxY
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : null;
}

function nestedElementPreview(node: CanvasNode | undefined, cropToMarks = false): NestedElementPreview | null {
  if (!node?.renderedContent) return null;
  const minX = node.kind === "leaf" ? node.contentMinX : 0;
  const minY = node.kind === "leaf" ? node.contentMinY : 0;
  const renderedBounds = cropToMarks ? nestedRenderedMarkBounds(node) : null;
  const x = renderedBounds?.x ?? minX;
  const y = renderedBounds?.y ?? minY;
  const width = renderedBounds?.width ?? node.width;
  const height = renderedBounds?.height ?? node.height;
  return {
    content: node.renderedContent,
    viewBox: `${x} ${y} ${width} ${height}`,
    width,
    height,
  };
}

function nestedMarkAtDataKey(elements: Element[], dataKey: string) {
  return elements.find((element, index) => {
    const role = element.getAttribute("data-mark-role");
    const roleIndex = elements.slice(0, index)
      .filter((candidate) => candidate.getAttribute("data-mark-role") === role).length;
    return markMatchesNestedDataKey(element, dataKey, roleIndex);
  });
}

function nestedParentMarkPreview(): NestedElementPreview | null {
  const editor = nestedPositionEditor.value;
  const parent = editor?.parent;
  const fullPreview = nestedElementPreview(parent);
  if (!editor || !parent || !fullPreview || !editor.parentDataKey || typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${fullPreview.content}</svg>`,
    "image/svg+xml",
  );
  const serializedMarks = Array.from(document.querySelectorAll("[data-mark-role]"));
  const serializedGroupMarks = editor.parentMarkGroupId
    ? serializedMarks.filter((element) => element.getAttribute("data-mark-group-id") === editor.parentMarkGroupId)
    : serializedMarks;
  const mark = nestedMarkAtDataKey(serializedGroupMarks, editor.parentDataKey);
  if (!mark) return null;
  const liveParent = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
    .find((element) => element.dataset.nodeId === parent.id);
  const liveMarks = Array.from(liveParent?.querySelectorAll<SVGGraphicsElement>("[data-mark-role]") ?? []);
  const liveGroupMarks = editor.parentMarkGroupId
    ? liveMarks.filter((element) => element.getAttribute("data-mark-group-id") === editor.parentMarkGroupId)
    : liveMarks;
  const liveMark = nestedMarkAtDataKey(liveGroupMarks, editor.parentDataKey);
  if (!(liveMark instanceof SVGGraphicsElement)) return null;
  let bounds: { x: number; y: number; width: number; height: number };
  try {
    bounds = nestedMarkBounds(liveMark, liveParent!);
  } catch {
    return null;
  }
  if (!(bounds.width > 0 && bounds.height > 0)) return null;
  return {
    content: mark.outerHTML,
    viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
    width: bounds.width,
    height: bounds.height,
  };
}

const nestedParentPreview = computed(nestedParentMarkPreview);
const nestedChildPreview = computed(() => nestedElementPreview(nestedPositionEditor.value?.child, true));
const nestedPreviewScale = computed(() => {
  const editor = nestedPositionEditor.value;
  if (!editor) return 1;
  const parentPreview = nestedParentPreview.value;
  const parentMaxDimension = Math.max(parentPreview?.width ?? editor.parent.width, parentPreview?.height ?? editor.parent.height, 1);
  const childMaxDimension = Math.max(
    editor.child.width * editor.parameters.scale.x,
    editor.child.height * editor.parameters.scale.y,
    1,
  );
  return 156 / Math.max(parentMaxDimension, childMaxDimension);
});
const nestedParentPreviewSize = computed(() => {
  const editor = nestedPositionEditor.value;
  const preview = nestedParentPreview.value;
  const width = (preview?.width ?? editor?.parent.width ?? 120) * nestedPreviewScale.value;
  const height = (preview?.height ?? editor?.parent.height ?? 120) * nestedPreviewScale.value;
  const minDimension = 52;
  const minimumScale = minDimension / Math.max(width, height, 1);
  return minimumScale > 1
    ? { width: width * minimumScale, height: height * minimumScale }
    : { width, height };
});
const nestedParentPreviewStyle = computed(() => {
  const size = nestedParentPreviewSize.value;
  return {
    width: `${size.width}px`,
    height: `${size.height}px`,
    left: `calc(50% - ${size.width / 2}px)`,
    top: `${nestedPreviewGeometry.previewCenterY - size.height / 2}px`,
  };
});
const nestedChildPreviewSize = computed(() => {
  const editor = nestedPositionEditor.value;
  if (!editor) return { width: 108, height: 68 };
  const width = editor.child.width * editor.parameters.scale.x * nestedPreviewScale.value;
  const height = editor.child.height * editor.parameters.scale.y * nestedPreviewScale.value;
  const minDimension = 42;
  const minimumScale = minDimension / Math.max(width, height, 1);
  return minimumScale > 1
    ? { width: width * minimumScale, height: height * minimumScale }
    : { width, height };
});
const nestedChildScaleRatio = computed(() => {
  const editor = nestedPositionEditor.value;
  if (!editor) return 0;
  return Math.max(
    editor.child.width * editor.parameters.scale.x,
    editor.child.height * editor.parameters.scale.y,
  ) / NESTED_MAX_DIAMETER;
});
const nestedChildPreviewStyle = computed(() => {
  const parameters = nestedPositionEditor.value?.parameters;
  if (!parameters) return undefined;
  const geometry = nestedPreviewGeometry;
  const childSize = nestedChildPreviewSize.value;
  const parentSize = nestedParentPreviewSize.value;
  return {
    left: `calc(50% - ${parentSize.width / 2}px + ${
      parameters.parentAnchor.x * parentSize.width
      - parameters.childAnchor.x * childSize.width
      + parameters.offset.x * geometry.offsetScale
    }px)`,
    top: `${geometry.previewCenterY - parentSize.height / 2
      + parameters.parentAnchor.y * parentSize.height
      - parameters.childAnchor.y * childSize.height
      + parameters.offset.y * geometry.offsetScale}px`,
    width: `${childSize.width}px`,
    height: `${childSize.height}px`,
  };
});
const nestedOffsetGuideStyle = computed(() => {
  const parameters = nestedPositionEditor.value?.parameters;
  if (!parameters) return undefined;
  const geometry = nestedPreviewGeometry;
  const offsetX = parameters.offset.x * geometry.offsetScale;
  const offsetY = parameters.offset.y * geometry.offsetScale;
  const parentSize = nestedParentPreviewSize.value;
  return {
    left: `calc(50% - ${parentSize.width / 2}px + ${parameters.parentAnchor.x * parentSize.width}px)`,
    top: `${geometry.previewCenterY - parentSize.height / 2 + parameters.parentAnchor.y * parentSize.height}px`,
    width: `${Math.hypot(offsetX, offsetY)}px`,
    transform: `rotate(${Math.atan2(offsetY, offsetX) * 180 / Math.PI}deg)`,
  };
});

function alignNestedPosition(mode: AlignmentMode) {
  const parameters = nestedPositionEditor.value?.parameters;
  if (!parameters) return;
  const parentAnchor = { ...parameters.parentAnchor };
  const childAnchor = { ...parameters.childAnchor };
  const offset = { ...parameters.offset };
  if (mode === "left" || mode === "center-x" || mode === "right") {
    const x = mode === "left" ? 0 : mode === "right" ? 1 : 0.5;
    parentAnchor.x = x;
    childAnchor.x = x;
    offset.x = 0;
  } else {
    const y = mode === "top" ? 0 : mode === "bottom" ? 1 : 0.5;
    parentAnchor.y = y;
    childAnchor.y = y;
    offset.y = 0;
  }
  updateNestedPosition({ parentAnchor, childAnchor, offset });
}

function onCanvasToolbarAlign(mode: AlignmentMode) {
  if (nestedPositionEditor.value) {
    alignNestedPosition(mode);
    return;
  }
  alignSelection(mode);
}

function selectNestedAnchor(side: NestedAnchorSide, anchor: { x: number; y: number }) {
  if (side === "parentAnchor") updateNestedPosition({ parentAnchor: anchor });
  else updateNestedPosition({ childAnchor: anchor });
}

function setNestedParentRetention(event: Event) {
  updateNestedPosition({ retainParent: (event.currentTarget as HTMLInputElement).checked });
}

function setNestedChildScale(event: Event) {
  const editor = nestedPositionEditor.value;
  const ratio = Number((event.currentTarget as HTMLInputElement).value);
  if (!editor || !Number.isFinite(ratio)) return;
  updateNestedChildScale(editor.child.id, ratio);
}

function isNestedAnchorSelected(side: NestedAnchorSide, anchor: { x: number; y: number }) {
  const selected = nestedPositionEditor.value?.parameters[side];
  return selected?.x === anchor.x && selected.y === anchor.y;
}

function nestedAnchorOptionStyle(anchor: { x: number; y: number }) {
  return {
    left: `${anchor.x * 100}%`,
    top: `${anchor.y * 100}%`,
  };
}

function onNestedPreviewPointerDown(event: PointerEvent) {
  const offset = nestedPositionEditor.value?.parameters.offset;
  if (!offset || event.button !== 0) return;
  const child = event.currentTarget as HTMLElement;
  const preview = child.parentElement;
  if (!preview) return;
  child.setPointerCapture(event.pointerId);
  const childRect = child.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const visibleHandle = 18;
  nestedPreviewDrag.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startOffsetX: offset.x,
    startOffsetY: offset.y,
    minDeltaX: previewRect.left + visibleHandle - childRect.right,
    maxDeltaX: previewRect.right - visibleHandle - childRect.left,
    minDeltaY: previewRect.top + visibleHandle - childRect.bottom,
    maxDeltaY: previewRect.bottom - visibleHandle - childRect.top,
  };
}

function onNestedPreviewPointerMove(event: PointerEvent) {
  const drag = nestedPreviewDrag.value;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const deltaX = Math.max(drag.minDeltaX, Math.min(event.clientX - drag.startClientX, drag.maxDeltaX));
  const deltaY = Math.max(drag.minDeltaY, Math.min(event.clientY - drag.startClientY, drag.maxDeltaY));
  updateNestedPosition({
    offset: {
      x: drag.startOffsetX + deltaX / nestedPreviewGeometry.offsetScale,
      y: drag.startOffsetY + deltaY / nestedPreviewGeometry.offsetScale,
    },
  });
}

function onNestedPreviewPointerUp(event: PointerEvent) {
  if (nestedPreviewDrag.value?.pointerId !== event.pointerId) return;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  nestedPreviewDrag.value = null;
}

function isScatterChartType(chartType: string) {
  return chartType
    .replace(/[\s_-]/g, "")
    .toLowerCase()
    .includes("scatter");
}

function isPolarChartType(chartType: string) {
  return getChartTemplateContract(chartType)?.coordinateSystem === "Polar";
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
const encodingTargetNode = computed(() => {
  const selectedNode = selectedNodes.value[0];
  if (selectedNode?.chartSpec || selectedNode?.layerKind === "deckgl") return selectedNode;
  if (selectedNode?.kind === "group" && selectedNode.compositionSpec?.type === "facet") {
    return findFirstChartNodeInTree(selectedNode.children) ?? axisBindingNode.value;
  }
  return axisBindingNode.value;
});
const compositionMemberEncodingEntries = computed(() => {
  const node = axisBindingNode.value;
  const composition = node?.compositionSpec;
  if (!node || !composition || composition.type !== "layer"
    || editingCompositionId.value === composition.id) return [];
  const ownerId = node.coordinateSystem?.ownerNodeId ?? composition.members[0]?.nodeId;
  return composition.members
    .filter((member) => member.nodeId !== ownerId)
    .map((member) => findCanvasNodeInTree(canvasNodes.value, member.nodeId))
    .filter((member): member is CanvasNode => !!member?.chartSpec)
    .map((member) => ({
      id: member.id,
      name: member.name,
      chartType: member.chartSpec!.chartType,
      encodings: member.chartSpec!.encodings,
    }));
});
const compositionEncodingOnly = computed(() => {
  const node = selectedNodes.value[0];
  return selectedNodes.value.length === 1
    && node?.kind === "group"
    && node.compositionSpec?.type === "facet";
});
const compositionEncodingSectionLabel = computed(() => {
  const composition = axisBindingNode.value?.compositionSpec;
  return composition?.type === "layer" ? "LAYER ENCODINGS" : undefined;
});
const showPolarSelectionOutlines = computed(() => selectionPolarOutlines.value.length > 0);
const canToggleEncodingInspector = computed(() => !!encodingTargetNode.value);
const dimensionDropNode = computed(() => dimensionDropTarget.value
  ? selectedNodes.value.find((node) => node.id === dimensionDropTarget.value?.nodeId) ?? null
  : null);
const dimensionDropField = computed(() => dimensionDropTarget.value?.fieldName ?? "");
const dimensionIntentSelection = ref<Record<string, string>>({});
const dimensionFilterSelection = ref<Record<string, string>>({});
const dimensionIntentGroups = computed(() => {
  const intents = dimensionDropTarget.value?.analysis.intents ?? [];
  const groups = [
    {
      id: "aggregate",
      kicker: "01 / REDUCE",
      title: "Aggregate repeated values",
      description: "Keep the current visual key and reduce duplicate measures.",
      intents: intents.filter((intent) => intent.kind === "aggregate"),
    },
    {
      id: "facet",
      kicker: "02 / PARTITION",
      title: "Facet into views",
      description: "Turn the dropped column into a row or column partition.",
      intents: intents.filter((intent) => intent.kind === "facet"),
    },
    {
      id: "upgrade",
      kicker: "03 / COMPOSE",
      title: "Upgrade chart structure",
      description: "Use the column as a series or move to a richer chart form.",
      intents: intents.filter((intent) => intent.kind === "upgrade" || intent.kind === "series"),
    },
    {
      id: "filter",
      kicker: "04 / FOCUS",
      title: "Filter to one value",
      description: "Keep one value locally while leaving the dataset unchanged.",
      intents: intents.filter((intent) => intent.kind === "filter"),
    },
  ];
  return groups;
});

watch(dimensionDropTarget, (target) => {
  if (!target) return;
  dimensionIntentSelection.value = {};
  dimensionFilterSelection.value = {};
  dimensionIntentGroups.value.forEach((group) => {
    if (group.intents[0]) {
      dimensionIntentSelection.value[group.id] = group.intents[0].id;
    }
    const filterIntent = group.intents.find((intent) => intent.kind === "filter");
    if (filterIntent?.filterValues?.[0]) {
      dimensionFilterSelection.value[group.id] = filterIntent.filterValues[0];
    }
  });
}, { immediate: true });

function selectedDimensionIntent(group: { id: string; intents: Array<{ id: string }> }) {
  return dimensionIntentSelection.value[group.id] ?? group.intents[0]?.id ?? "";
}

function chooseDimensionIntent(groupId: string, intentId: string) {
  dimensionIntentSelection.value[groupId] = intentId;
}

function applyDimensionIntentGroup(group: { id: string; intents: Array<{ id: string; kind: string; filterValues?: string[] }> }) {
  const intentId = selectedDimensionIntent(group);
  if (!intentId) return;
  const filterValue = group.id === "filter" ? dimensionFilterSelection.value[group.id] : undefined;
  applyInputColumnIntent(intentId, filterValue);
}

function defaultEncodingChannel(node: CanvasNode): CoordinateChannel {
  if (isCartesianTreeChart(node.chartSpec?.chartType)) {
    return cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec));
  }
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
  const target = encodingTargetNode.value;
  const isOpenForCurrentTarget = encodingInspectorOpen.value
    && !!axisBindingTarget.value
    && axisBindingTarget.value.nodeId === target?.id;
  if (isOpenForCurrentTarget) {
    encodingInspectorOpen.value = false;
    return;
  }
  if (!target) return;
  closeCompositionCandidates();
  compositionInspectorOpen.value = false;
  selectEncodingTarget(target);
  encodingInspectorOpen.value = true;
}

function closeEncodingInspector() {
  encodingInspectorOpen.value = false;
}

function openSelectedCompositionConfig() {
  if (!configureSelectionComposition()) return;
  if (nestedPositionEditor.value) return;
  closeCompositionCandidates();
  encodingInspectorOpen.value = false;
  compositionInspectorOpen.value = true;
}

function closeCompositionInspector() {
  compositionInspectorOpen.value = false;
}
watch(selectedCompositionSpec, (composition) => {
  if (!composition) compositionInspectorOpen.value = false;
});
const selectedCanvasNodesWithCoordinateGuides = coordinateGuideNodes;
const cartesianAxisSwapNode = computed(() => {
  if (semanticSelection.value || selectedIds.value.length !== 1) return null;
  const node = selectedNodes.value[0];
  const chartType = node?.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase();
  return node?.coordinateGuide?.type === "Cartesian" && node.chartSpec && chartType !== "dendrogram"
    ? node
    : null;
});
const cartesianAxisSwapPosition = computed(() => {
  const frame = selectionFrame.value;
  if (!frame || !cartesianAxisSwapNode.value) return null;
  const inset = 18 / selectionOverlayZoom.value;
  const point = { x: frame.x + inset, y: frame.y + inset };
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const radians = frame.rotation * Math.PI / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
});

function toggleSelectedCartesianAxes() {
  const node = cartesianAxisSwapNode.value;
  if (!node?.chartSpec) return;
  setAxisSwap(node.chartSpec.axisSwapped !== true, node.id);
}

function openCompositionCandidates(type: CompositionType) {
  closeAxisBinding();
  if (type === "facet") {
    const node = chartTransformNode.value;
    const clueFields = Array.from(new Set(node?.chartSpec?.dataTransforms
      ?.filter((transform) => transform.kind === "filter"
        && transform.mode === "values"
        && (transform.purpose === "facet-clue"
          || transform.purpose === "nested-context"
          || (transform.purpose === undefined && transform.single)))
      .map((transform) => transform.mode === "values" ? transform.field : "")
      .filter(Boolean) ?? []));
    const existingFacetFields = new Set([
      node?.compositionSpec?.facetField,
      node?.compositionSpec?.facetGrid?.rowField,
      node?.compositionSpec?.facetGrid?.columnField,
    ].filter((field): field is string => !!field));
    const remainingClueFields = clueFields.filter((field) => !existingFacetFields.has(field));
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const eligibleFields = dataset?.columns
      .filter((column) => column.type === "nominal" || column.type === "ordinal" || column.type === "temporal")
      .map((column) => column.name)
      .filter((field) => !existingFacetFields.has(field)) ?? [];
    if (node) {
      const selectableFields = clueFields.length > 0
        ? node.compositionSpec?.type === "facet" ? remainingClueFields : clueFields
        : eligibleFields;
      if (selectableFields.length === 0) {
        activeCompositionType.value = null;
        return;
      }
      facetClueDialog.value = {
        nodeId: node.id,
        chartName: node.name,
        fields: selectableFields,
        coordinateSystem: "Cartesian",
        rowField: "",
        columnField: selectableFields[0] ?? "",
        thetaField: selectableFields[0] ?? "",
        radiusField: selectableFields[1] ?? "",
      };
      activeCompositionType.value = null;
      return;
    }
  }
  createCompositionCandidate(type);
  activeCompositionType.value = null;
}

const canConfirmFacetClues = computed(() => {
  const dialog = facetClueDialog.value;
  if (!dialog) return false;
  const first = dialog.coordinateSystem === "Cartesian" ? dialog.rowField : dialog.thetaField;
  const second = dialog.coordinateSystem === "Cartesian" ? dialog.columnField : dialog.radiusField;
  return !!(first || second) && (!first || !second || first !== second);
});

function closeFacetClueDialog() {
  facetClueDialog.value = null;
}

function confirmFacetClues() {
  const dialog = facetClueDialog.value;
  if (!dialog || !canConfirmFacetClues.value) return;
  createFacetFromFields(dialog.nodeId, dialog.coordinateSystem === "Cartesian"
    ? {
      coordinateSystem: "Cartesian",
      rowField: dialog.rowField || undefined,
      columnField: dialog.columnField || undefined,
    }
    : {
      coordinateSystem: "Polar",
      thetaField: dialog.thetaField || undefined,
      radiusField: dialog.radiusField || undefined,
    });
  closeFacetClueDialog();
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
    closeNestedPositionEditor();
    closeFacetClueDialog();
    closeCompositionInspector();
  }
}

function onEncodingChannelChange(channel: ChartEncodingChannel, field: string) {
  setChartEncoding(channel, field);
}

function withEncodingNode(node: CanvasNode, action: () => void) {
  const previousTarget = axisBindingTarget.value;
  axisBindingTarget.value = {
    nodeId: node.id,
    channel: previousTarget?.nodeId === node.id
      ? previousTarget.channel
      : defaultEncodingChannel(node),
  };
  try {
    action();
  } finally {
    axisBindingTarget.value = previousTarget;
  }
}

function nestedMarkConfig(node: CanvasNode) {
  const config = node.chartSpec?.markGroups?.[0]?.sharedConfig ?? {};
  const relationship = Object.values(chartRelationships.value.nestedRelationships).find((candidate) =>
    candidate.status === "active" && candidate.childChartId === node.id,
  );
  if (!relationship || !node.chartSpec || getChartTemplateContract(node.chartSpec.chartType)?.coordinateSystem !== "Polar") {
    return config;
  }
  const scale = (relationship.parameters as { scale?: { x?: number; y?: number } }).scale;
  const diameter = Math.max(node.width * (scale?.x ?? 1), node.height * (scale?.y ?? 1));
  return { ...config, outerRadius: Math.max(0, Math.min(diameter / NESTED_MAX_DIAMETER, 1)) };
}

function onNestedMarkConfigChange(node: CanvasNode, patch: MarkGroupSharedConfig) {
  const isNestedChild = Object.values(chartRelationships.value.nestedRelationships).some((candidate) =>
    candidate.status === "active" && candidate.childChartId === node.id,
  );
  if (isNestedChild
    && typeof patch.outerRadius === "number"
    && node.chartSpec
    && getChartTemplateContract(node.chartSpec.chartType)?.coordinateSystem === "Polar") {
    updateNestedChildScale(node.id, patch.outerRadius);
    const { outerRadius: _outerRadius, ...remaining } = patch;
    if (Object.keys(remaining).length > 0) {
      withEncodingNode(node, () => updateAxisBindingMarkGroupConfig(remaining));
    }
    return;
  }
  withEncodingNode(node, () => updateAxisBindingMarkGroupConfig(patch));
}

function beginNestedMarkConfigEdit(node: CanvasNode, field: string) {
  const role = node.chartSpec?.markGroups?.[0]?.role ?? "arc";
  beginMarkConfigEdit(node.id, role, field);
}

function onMarkConfigEditStart(field: string) {
  const node = axisBindingNode.value;
  if (!node?.chartSpec) return;
  const role = node.chartSpec.markGroups?.[0]?.role ?? "arc";
  beginMarkConfigEdit(node.id, role, field);
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

function polarScaleChannels(node: CanvasNode): CoordinateChannel[] {
  const composition = node.compositionSpec;
  if (!composition || editingCompositionId.value === composition.id) return ["angle", "radius"];
  return composition.sharedChannels.filter((channel): channel is CoordinateChannel =>
    channel === "angle" || channel === "radius",
  );
}

function onAxisSwap(swapped: boolean) {
  setAxisSwap(swapped);
}

function onChartAxisChange(
  axis: ChartAxisChannel,
  patch: Pick<ChartAxisConfig, "visible" | "labelsVisible">,
) {
  setChartAxisAppearance(axis, patch);
}

function onCoordinateAxisReverse(axis: "x" | "y") {
  const node = axisBindingNode.value;
  if (!node) return;
  reverseCoordinateAxis(node, axis);
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

<template src="./App.template.html"></template>

<style scoped src="./App.base.css"></style>
<style scoped src="./App.controls.css"></style>
