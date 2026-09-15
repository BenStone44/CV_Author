<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
} from "vue";
import { ArrowLeftRight, ArrowUp, Check, ChevronDown, Move, SlidersHorizontal, X } from "@lucide/vue";
import NestedConfigEditor from "./NestedConfigEditor.vue";
import { SHARED_HIERARCHY_CASE_ID } from "../utils/sharedHierarchyCase";
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
  DeckglNestedOverlay,
  DeckglPointTarget,
  EncodingChannel,
  GeographicMapViewState,
  MarkGroupSharedConfig,
  RelativeNestedParameters,
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
import { deckglExampleImageUrl, getGeographicLayerFamily } from "../utils/geographicLayerCards";
import { getChartTemplateContract } from "../utils/chartTemplates";
import { normalizeNestedCallout } from "../utils/nestedCallout";
import { normalizeNestedDecorations } from "../utils/nestedDecorations";
import { selectionActionPositionsAbove } from "../utils/selectionControls";
import {
  cartesianTreeDirection,
  cartesianTreeLeafAxis,
  isCartesianTreeChart,
} from "../utils/treeLayout";
import { markMatchesNestedDataKey } from "../stores/canvas/nestedMarkIdentity";
import { frontendPalette, globalPalette } from "../config/global";
import {
  CHORD_POLAR_LINE_DATASET_ID,
  chordPolarLineDataset,
  MATRIX_PIE_NETWORK_DATASET_ID,
  matrixPieNetworkDataset,
} from "../utils/defaultChartData";
import academicScoresWideCsv from "../../public/site/gallery/cases/academic-scores/data/academic_scores_wide.csv?raw";

const EMPTY_SELECTION_IDS: string[] = [];
const NESTED_MAX_DIAMETER = 360;
const CHORD_CIRCULAR_STACKED_CASE = "chord-circular-stacked-facet-concat";
const LEGACY_CHORD_POLAR_LINE_CASE = "chord-polar-line-facet-concat";
const MATRIX_FORCE_HEATMAP_CASE = "matrix-force-heatmap-marginal-bars";
const LEGACY_MATRIX_PIE_NETWORK_CASE = "matrix-pie-network-marginal-bars";
const ACADEMIC_SCORES_CASE = "academic-scores-nested-concat";
const requestedCase = typeof window === "undefined"
  ? null
  : new URLSearchParams(window.location.search).get("case");
const requestedStarterValue = typeof window === "undefined"
  ? null
  : new URLSearchParams(window.location.search).get("starter");
const galleryStarterIds = new Set([
  "academic-scores",
  "polar-facet",
  "matrix-network",
  "shared-hierarchy",
  "tree-leaf-axis",
]);
const requestedStarter = requestedStarterValue && galleryStarterIds.has(requestedStarterValue)
  ? requestedStarterValue
  : null;
const isChordCircularStackedCase = requestedCase === CHORD_CIRCULAR_STACKED_CASE
  || requestedCase === LEGACY_CHORD_POLAR_LINE_CASE;
const isMatrixPieNetworkCase = requestedCase === MATRIX_FORCE_HEATMAP_CASE
  || requestedCase === LEGACY_MATRIX_PIE_NETWORK_CASE;
const isAcademicScoresCase = requestedCase === ACADEMIC_SCORES_CASE;
const isSharedHierarchyCase = requestedCase === SHARED_HIERARCHY_CASE_ID;
const isDendrogramGallery = requestedCase === "dendrogram-nested-radial-area"
  || new URLSearchParams(window.location.search).get("starter") === "tree-leaf-axis";
const isGeographicGallery = requestedCase === "geographic-network-layer-nested-bars"
  || new URLSearchParams(window.location.search).get("starter") === "geographic-network";
const datasetStore = useDatasetStore();
const starterDatasets = requestedStarter === "polar-facet"
  ? [chordPolarLineDataset]
  : requestedStarter === "matrix-network"
    ? [matrixPieNetworkDataset]
    : [];
if (starterDatasets.length > 0) {
  const starterDatasetIds = new Set(starterDatasets.map((dataset) => dataset.id));
  datasetStore.datasets.value = [
    ...datasetStore.datasets.value.filter((dataset) => !starterDatasetIds.has(dataset.id)),
    ...starterDatasets,
  ];
  datasetStore.setActiveDataset(starterDatasets[0]!.id);
}
if (!requestedStarter && isChordCircularStackedCase) {
  datasetStore.datasets.value = [
    ...datasetStore.datasets.value.filter((dataset) => dataset.id !== CHORD_POLAR_LINE_DATASET_ID),
    chordPolarLineDataset,
  ];
  datasetStore.setActiveDataset(CHORD_POLAR_LINE_DATASET_ID);
}
if (!requestedStarter && isMatrixPieNetworkCase) {
  datasetStore.datasets.value = [
    ...datasetStore.datasets.value.filter((dataset) => dataset.id !== MATRIX_PIE_NETWORK_DATASET_ID),
    matrixPieNetworkDataset,
  ];
  datasetStore.setActiveDataset(MATRIX_PIE_NETWORK_DATASET_ID);
}

const canvasRef = ref<HTMLElement | null>(null);
const encodingInspectorOpen = ref(true);
const compositionInspectorTargetId = ref<string | null>(null);
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
  toggleCoordinateSystem: toggleCoordinateSystemInStore,
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
  axisBindingChannelColumns,
  axisBindingRendererError,
  coordinateGuideNodes,
  barItemAxisBinding,
  seriesItemMemberIds,
  seriesItemDropFrame,
  contextMenu,
  draggedCandidateId,
  compositionDragSourceId,
  concatCompositionForNode,
  activeDropZone,
  availableDropZones,
  compositionEnterTransition,
  finishCompositionEnterTransition,
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
  canMoveSelectionForward,
  canMoveSelectionBackward,
  scaleHandles,
  rotateHandle,
  syncRenderedNodeSelectionBounds,
  onCanvasPointerDown,
  onCanvasDragOver,
  onCanvasDragLeave,
  onCanvasDrop,
  createDeckglPointNested,
  onCanvasWheel,
  onCanvasContextMenu,
  onCanvasNodePointerDown,
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
  onPolarInnerRadiusPointerDown,
  setAxisBindingAggregation,
  setRoleBindingFields,
  setSingleBarValueOrder,
  setAxisSwap,
  setChartAxisAppearance,
  clearSeriesBinding,
  setCompositionEncoding,
  setChartEncoding,
  setChartDataTransforms,
  resetChartBindingsForDataset,
  setDeckglMapStyle,
  setDeckglMapViewState,
  setDeckglConfig,
  setDeckglEncoding,
  setDeckglDataBinding,
  selectCanvasNode,
  updateAxisBindingMarkGroupConfig,
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
  createCompositionCandidate,
  createFacetFromFields,
  applyDimensionFacet,
  confirmNestedBinding,
  closeNestedBinding: closeNestedBindingInStore,
  applyNestedAppearance,
  updateNestedChildScale,
  closeNestedPositionEditor,
  applyInputColumnIntent,
  closeDimensionDropDecision,
  reorderSelectedNodes,
  alignSelection,
  resetCanvasZoom,
  exportCanvasSvgMarkup,
  loadDendrogramProfilesCase,
  loadGeographicNetworkCase,
  exportRenderedGeographicSvg,
  loadSharedHierarchyCase,
  loadGalleryStarter,
  loadChordCircularStackedFacetCase,
  loadMatrixPieNetworkCase,
} = useCanvasStore(canvasRef);
function deckglLayerOwner(node: CanvasNode) {
  const stack = node.deckglLayerStack;
  return stack?.[0] ?? node.id;
}
const visibleCanvasNodes = computed(() =>
  canvasNodes.value.filter((node) =>
    !nestedRenderedChildIds.value.has(node.id)
    && (node.layerKind !== "deckgl" || deckglLayerOwner(node) === node.id),
  ),
);
function compositionDropZoneKey(zone: {
  targetNodeId: string;
  type: string;
  direction?: string;
  concatPosition?: string;
  enterCompositionId?: string;
  nestedAction?: string;
  sharedChannels: string[];
}) {
  return [
    zone.targetNodeId,
    zone.type,
    zone.direction ?? "",
    zone.concatPosition ?? "",
    zone.enterCompositionId ?? "",
    zone.nestedAction ?? "",
    zone.sharedChannels.join(","),
  ].join("|");
}
const visibleCompositionDropZones = computed(() => {
  // Nested embed destinations are pointer-resolved and remain the sole
  // active-zone exception. Their Enter navigation portals must still be
  // visible before the pointer reaches the small central target.
  const visible = availableDropZones.value.filter((zone) =>
    zone.type !== "nested" || zone.nestedAction === "enter");
  const active = activeDropZone.value;
  if (!active) return visible;
  if (active.type === "nested") return [...visible, active];
  return visible.some((zone) => compositionDropZoneKey(zone) === compositionDropZoneKey(active))
    ? visible
    : [...visible, active];
});
function compositionDropZoneIsActive(zone: (typeof visibleCompositionDropZones.value)[number]) {
  return !!activeDropZone.value
    && compositionDropZoneKey(zone) === compositionDropZoneKey(activeDropZone.value);
}
const deckglLayerNodes = computed(() => visibleCanvasNodes.value.filter((node) => node.layerKind === "deckgl"));
const graphLinkDragActive = computed(() => {
  const candidateId = draggedCandidateId.value;
  return !!candidateId && implementedTemplateCandidates.value.some((candidate) =>
    candidate.id === candidateId && !!candidate.graphLinkMode);
});
const MAX_LIVE_DECKGL_MAPS = 6;
const deckglLayerElements = new Map<string, HTMLElement>();
const deckglLayerRefCallbacks = new Map<string, (element: unknown) => void>();
const deckglLayerVisibility = ref(new Map<string, { isIntersecting: boolean; ratio: number }>());
let deckglVisibilityObserver: IntersectionObserver | null = null;

const liveDeckglLayerIds = computed(() => {
  const selected = new Set(selectedIds.value);
  return new Set(Array.from(deckglLayerVisibility.value.entries())
    .filter(([, visibility]) => visibility.isIntersecting)
    .sort(([leftId, left], [rightId, right]) => {
      const selectedDifference = Number(selected.has(rightId)) - Number(selected.has(leftId));
      return selectedDifference || right.ratio - left.ratio;
    })
    .slice(0, MAX_LIVE_DECKGL_MAPS)
    .map(([id]) => id));
});

function updateDeckglLayerVisibility(entries: IntersectionObserverEntry[]) {
  const next = new Map(deckglLayerVisibility.value);
  let changed = false;
  entries.forEach((entry) => {
    const id = (entry.target as HTMLElement).dataset.nodeId;
    if (!id) return;
    const previous = next.get(id);
    if (previous?.isIntersecting === entry.isIntersecting
      && previous.ratio === entry.intersectionRatio) return;
    next.set(id, { isIntersecting: entry.isIntersecting, ratio: entry.intersectionRatio });
    changed = true;
  });
  if (changed) deckglLayerVisibility.value = next;
}

function setDeckglLayerElement(nodeId: string, element: unknown) {
  const previous = deckglLayerElements.get(nodeId);
  // Vue invokes function refs again after parent updates. Re-observing the
  // same element schedules another IntersectionObserver notification, which
  // can form a render/observe loop while a map node is being dragged.
  if (previous === element) return;
  if (previous) deckglVisibilityObserver?.unobserve(previous);
  if (!(element instanceof HTMLElement)) {
    deckglLayerElements.delete(nodeId);
    deckglLayerRefCallbacks.delete(nodeId);
    const next = new Map(deckglLayerVisibility.value);
    next.delete(nodeId);
    deckglLayerVisibility.value = next;
    return;
  }
  deckglLayerElements.set(nodeId, element);
  deckglVisibilityObserver?.observe(element);
}

function deckglLayerRef(nodeId: string) {
  let callback = deckglLayerRefCallbacks.get(nodeId);
  if (!callback) {
    callback = (element) => setDeckglLayerElement(nodeId, element);
    deckglLayerRefCallbacks.set(nodeId, callback);
  }
  return callback;
}

function isDeckglLayerLive(nodeId: string) {
  const activeInteraction = interaction.value;
  // Do not replace a moving WebGL map with its placeholder when an
  // IntersectionObserver threshold is crossed mid-drag.
  if (activeInteraction?.type === "move" && activeInteraction.itemIds.includes(nodeId)) return true;
  if (deckglVisibilityObserver) return liveDeckglLayerIds.value.has(nodeId);
  const selected = new Set(selectedIds.value);
  return deckglLayerNodes.value
    .slice()
    .sort((left, right) => Number(selected.has(right.id)) - Number(selected.has(left.id)))
    .slice(0, MAX_LIVE_DECKGL_MAPS)
    .some((node) => node.id === nodeId);
}
function deckglLayerRenderSpecs(node: CanvasNode) {
  const ids = node.deckglLayerStack?.length ? node.deckglLayerStack : [node.id];
  return ids
    .map((id) => findCanvasNodeInTree(canvasNodes.value, id))
    .filter((member): member is CanvasNode => member?.layerKind === "deckgl")
    .map((member) => ({
      id: member.id,
      layerType: deckglLayerType(member),
      config: deckglLayerConfig(member),
      binding: member.deckglBinding,
      dataset: deckglLayerDataset(member),
      datasetRows: deckglLayerRows(member),
      geometryFeatures: deckglLayerGeometrySource(member)?.features ?? [],
    }));
}
function deckglNestedOverlays(node: CanvasNode): DeckglNestedOverlay[] {
  const layerIds = new Set(node.deckglLayerStack?.length ? node.deckglLayerStack : [node.id]);
  return Object.values(chartRelationships.value.nestedRelationships).flatMap((relationship) => {
    if (relationship.status !== "active" || !layerIds.has(relationship.parentChartId) || !relationship.parentDataKey) return [];
    const child = findCanvasNodeInTree(canvasNodes.value, relationship.childChartId);
    const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
    if (!child?.renderedContent || !parameters.parentAnchor || !parameters.childAnchor
      || !parameters.offset || !parameters.scale) return [];
    const parent = findCanvasNodeInTree(canvasNodes.value, relationship.parentChartId);
    const parentRadius = Number(deckglLayerConfig(parent ?? node).size ?? 8);
    return [{
      relationshipId: relationship.id,
      parentNodeId: relationship.parentChartId,
      parentDataKey: relationship.parentDataKey,
      content: child.renderedContent,
      width: child.width,
      height: child.height,
      parentRadius: Number.isFinite(parentRadius) ? Math.max(parentRadius, 1) : 8,
      parameters: {
        parentAnchor: { ...parameters.parentAnchor },
        childAnchor: { ...parameters.childAnchor },
        offset: { ...parameters.offset },
        scale: { ...parameters.scale },
        rotation: parameters.rotation ?? 0,
        retainParent: parameters.retainParent,
        callout: normalizeNestedCallout(parameters.callout),
        decorations: normalizeNestedDecorations(parameters.decorations),
      },
    }];
  });
}
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
  // Closed compositions are represented by a group root. Selecting that root
  // is sufficient even though its direct members live in the child scope.
  if (selectedNodes.value.length === 1
    && selectedNode?.kind === "group"
    && composition.type !== "concat") return composition;
  const selected = new Set(selectedIds.value);
  return composition.members.every((member) => selected.has(member.nodeId))
    ? composition
    : null;
});
const compositionInspectorOpen = computed({
  get: () => selectedCompositionSpec.value?.id === compositionInspectorTargetId.value,
  set: (open: boolean) => {
    compositionInspectorTargetId.value = open ? selectedCompositionSpec.value?.id ?? null : null;
  },
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
    ? { size: 8, color: frontendPalette.control.accentStrong }
    : family === "area"
      ? { color: frontendPalette.control.accentStrong }
      : {});
}

function deckglLayerDataset(node: CanvasNode) {
  return getDataset(node.deckglBinding?.datasetId ?? node.deckglDatasetId ?? "");
}

function deckglLayerRows(node: CanvasNode) {
  const dataset = deckglLayerDataset(node);
  return dataset?.rows.length
    ? dataset.rows
    : dataset?.graph?.nodes.rows ?? [];
}

function deckglLayerColumns(node: CanvasNode) {
  const dataset = deckglLayerDataset(node);
  return dataset?.columns.length
    ? dataset.columns
    : dataset?.graph?.nodes.columns ?? [];
}

function deckglLayerGeometrySource(node: CanvasNode) {
  const sourceId = node.deckglBinding?.geometrySourceId;
  return sourceId ? getGeometrySource(sourceId) : null;
}

function onDeckglMapViewStateChange(node: CanvasNode, state: GeographicMapViewState) {
  setDeckglMapViewState(node.id, state);
}

async function onDeckglPointDrop(target: DeckglPointTarget) {
  await createDeckglPointNested(target);
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

const selectionConfigurePosition = computed(() => {
  const frame = selectionFrame.value;
  if (!frame) return { x: 0, y: 0 };
  return selectionActionPositionsAbove(frame, selectionOverlayZoom.value).configure;
});
const selectionSplitPosition = computed(() => {
  const frame = selectionFrame.value;
  if (!frame) return { x: 0, y: 0 };
  return selectionActionPositionsAbove(frame, selectionOverlayZoom.value).split;
});

function closeTemplateCategoryMenu() {
  activeTemplateCategoryId.value = null;
}

function toggleCoordinateSystem(value: Parameters<typeof toggleCoordinateSystemInStore>[0]) {
  toggleCoordinateSystemInStore(value);
  closeTemplateCategoryMenu();
}

function toggleTemplateCategory(category: ChartTemplateCategory, event: MouseEvent) {
  if (activeTemplateCategoryId.value === category.id) {
    closeTemplateCategoryMenu();
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const preferredWidth = 420;
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

const { activeDataset, datasets, geometrySources, getDataset, getGeometrySource } = datasetStore;
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
    && (spec.encodings.color?.type === "nominal" || spec.encodings.color?.type === "ordinal")
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
    const style = (mappedStyles[member] ?? {}) as { color?: string };
    return {
      memberId: member,
      label: member,
      color: style.color ?? fallbackColors[index % fallbackColors.length]!,
    };
  });
  return {
    node,
    label: displaySeriesItemLabel(binding.label),
    fields: binding.fields,
    members,
    legendVisible: markConfig.legendVisible === true,
    itemEditable: itemBinding !== null,
    frame: seriesItemDropFrame(node),
  };
}
function displaySeriesItemLabel(label: string) {
  return label.replace(/\s+item$/i, "");
}
const seriesItemPresentations = computed(() => selectionScopeNodes.value.flatMap((node: CanvasNode) => {
  const presentation = createSeriesItemPresentation(node);
  return presentation ? [presentation] : [];
}));
const seriesItemLegends = computed(() => seriesItemPresentations.value.flatMap((item: NonNullable<ReturnType<typeof createSeriesItemPresentation>>) => {
  if (!item.legendVisible || item.members.length === 0) return [];
  const longestLabel = Math.max(...item.members.map((member) => member.label.length), 1);
  const height = item.members.length * 22;
  return [{
    ...item,
    legendFrame: {
      ...item.frame,
      y: item.frame.y + item.frame.height - height,
      width: Math.min(130, Math.max(64, 24 + longestLabel * 7)),
      height,
    },
  }];
}));
const nestedBindingPopupRef = ref<HTMLElement | null>(null);
const nestedBindingPopupPosition = ref<{ left: number; top: number } | null>(null);
type NestedBindingDraft = {
  targetKey: string;
  xField?: string;
  yField?: string;
  radiusField?: string;
  angleFields?: string[];
};
const nestedBindingDraft = ref<NestedBindingDraft | null>(null);
const nestedBindingDraftKey = computed(() => {
  const target = nestedBindingTarget.value;
  return target ? `${target.nodeId}\u0000${target.rowKey}\u0000${target.clientX}\u0000${target.clientY}` : "";
});
const activeNestedBindingDraft = computed(() =>
  nestedBindingDraft.value?.targetKey === nestedBindingDraftKey.value ? nestedBindingDraft.value : null,
);
const defaultNestedPointXField = computed(() => nestedBindingNode.value?.chartSpec?.encodings.x?.field ?? "");
const defaultNestedPointYField = computed(() => nestedBindingNode.value?.chartSpec?.encodings.y?.field ?? "");
const defaultNestedAngleFields = computed<string[]>(() => {
  const fields = nestedBindingNode.value?.nestedSpec?.valueFields;
  return fields?.length ? fields : nestedBindingSuggestedAngleFields.value;
});

function updateNestedBindingDraft(patch: Omit<Partial<NestedBindingDraft>, "targetKey">) {
  nestedBindingDraft.value = {
    ...activeNestedBindingDraft.value,
    targetKey: nestedBindingDraftKey.value,
    ...patch,
  };
}

const nestedPointXField = computed({
  get: () => activeNestedBindingDraft.value?.xField ?? defaultNestedPointXField.value,
  set: (xField: string) => updateNestedBindingDraft({ xField }),
});
const nestedPointYField = computed({
  get: () => activeNestedBindingDraft.value?.yField ?? defaultNestedPointYField.value,
  set: (yField: string) => updateNestedBindingDraft({ yField }),
});
const nestedPieRadiusField = computed({
  get: () => activeNestedBindingDraft.value?.radiusField
    ?? nestedBindingNode.value?.nestedSpec?.radiusField
    ?? defaultNestedPointYField.value,
  set: (radiusField: string) => updateNestedBindingDraft({ radiusField }),
});
const nestedPieAngleFields = computed<string[]>({
  get: () => activeNestedBindingDraft.value?.angleFields
    ?? defaultNestedAngleFields.value,
  set: (angleFields: string[]) => updateNestedBindingDraft({ angleFields }),
});

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
    ? nestedPieAngleFields.value.filter((item: string) => item !== field)
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

function setNestedBindingPopupRef(element: Element | null) {
  nestedBindingPopupRef.value = element instanceof HTMLElement ? element : null;
  if (!element) return;
  nestedBindingPopupPosition.value = null;
  void nextTick(positionNestedBindingPopup);
}

function closeNestedBinding() {
  nestedBindingPopupPosition.value = null;
  closeNestedBindingInStore();
}

type AlignmentMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
const nestedConfigRef = ref<InstanceType<typeof NestedConfigEditor> | null>(null);
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
  if (parent?.layerKind === "deckgl") {
    const configuredRadius = Number(deckglLayerConfig(parent).size ?? 8);
    const radius = Number.isFinite(configuredRadius) ? Math.max(configuredRadius, 1) : 8;
    const diameter = radius * 2;
    return {
      content: `<circle cx="${radius}" cy="${radius}" r="${radius}" fill="#64748b"/>`,
      viewBox: `0 0 ${diameter} ${diameter}`, width: diameter, height: diameter,
    };
  }
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
const nestedChildPreview = computed(() => nestedElementPreview(nestedPositionEditor.value?.child));
function onCanvasToolbarAlign(mode: AlignmentMode) {
  if (nestedPositionEditor.value) {
    nestedConfigRef.value?.align(mode);
    return;
  }
  alignSelection(mode);
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
type DimensionIntentDraft = {
  targetKey: string;
  intents: Record<string, string>;
  filters: Record<string, string>;
};
const dimensionIntentDraft = ref<DimensionIntentDraft | null>(null);
const dimensionIntentTargetKey = computed(() => {
  const target = dimensionDropTarget.value;
  return target ? `${target.nodeId}\u0000${target.fieldName}\u0000${target.clientX}\u0000${target.clientY}` : "";
});
const activeDimensionIntentDraft = computed(() =>
  dimensionIntentDraft.value?.targetKey === dimensionIntentTargetKey.value ? dimensionIntentDraft.value : null,
);
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

function selectedDimensionIntent(group: { id: string; intents: Array<{ id: string }> }) {
  return activeDimensionIntentDraft.value?.intents[group.id] ?? group.intents[0]?.id ?? "";
}

function chooseDimensionIntent(groupId: string, intentId: string) {
  dimensionIntentDraft.value = {
    targetKey: dimensionIntentTargetKey.value,
    intents: { ...activeDimensionIntentDraft.value?.intents, [groupId]: intentId },
    filters: { ...activeDimensionIntentDraft.value?.filters },
  };
}

function selectedDimensionFilter(group: { id: string; intents: Array<{ filterValues?: string[] }> }) {
  return activeDimensionIntentDraft.value?.filters[group.id] ?? group.intents[0]?.filterValues?.[0] ?? "";
}

function chooseDimensionFilter(groupId: string, value: string) {
  dimensionIntentDraft.value = {
    targetKey: dimensionIntentTargetKey.value,
    intents: { ...activeDimensionIntentDraft.value?.intents },
    filters: { ...activeDimensionIntentDraft.value?.filters, [groupId]: value },
  };
}

function applyDimensionIntentGroup(group: { id: string; intents: Array<{ id: string; kind: string; filterValues?: string[] }> }) {
  const intentId = selectedDimensionIntent(group);
  if (!intentId) return;
  const filterValue = group.id === "filter" ? selectedDimensionFilter(group) : undefined;
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
      .map((transform) => transform.kind === "filter" && transform.mode === "values" ? transform.field : "")
      .filter(Boolean) ?? []));
    const existingFacetFields = new Set([
      node?.compositionSpec?.facetField,
      node?.compositionSpec?.facetGrid?.rowField,
      node?.compositionSpec?.facetGrid?.columnField,
    ].filter((field): field is string => !!field));
    const remainingClueFields = clueFields.filter((field) => !existingFacetFields.has(field));
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const facetDataset = dataset && node?.chartSpec
      ? materializeGraphDataset(dataset, node.chartSpec)
      : dataset;
    const eligibleFields = facetDataset?.columns
      .filter((column) => column.type === "nominal" || column.type === "ordinal")
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

function onCompositionEncodingChange(patch: Parameters<typeof setCompositionEncoding>[0]) {
  setCompositionEncoding(patch);
}

function polarScaleChannels(node: CanvasNode): CoordinateChannel[] {
  const composition = node.compositionSpec;
  if (composition?.type === "facet" && composition.facetCoordinateSystem === "Polar") {
    return ["angle", "radius"];
  }
  const concat = concatCompositionForNode(node);
  if (concat && editingCompositionId.value !== concat.id) {
    return Array.from(new Set([
      ...concat.sharedChannels.filter((channel): channel is CoordinateChannel =>
        channel === "angle" || channel === "radius"),
      "radius" as const,
    ]));
  }
  if (!composition || editingCompositionId.value === composition.id) return ["angle", "radius"];
  return composition.sharedChannels.filter((channel): channel is CoordinateChannel =>
    channel === "angle" || channel === "radius",
  );
}

function useCompositePolarRadius(node: CanvasNode) {
  const concat = concatCompositionForNode(node);
  if (concat) return false;
  return editingCompositionId.value !== node.compositionSpec?.id;
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

async function loadAcademicScoresWideData(compose = false) {
  const dataset = await datasetStore.importDataset(new File(
    [academicScoresWideCsv],
    "academic_scores_wide.csv",
    { type: "text/csv" },
  ));
  return dataset ? loadGalleryStarter("academic-scores", dataset.id, compose) : false;
}

async function loadSharedHierarchyExample(compose: boolean) {
  try {
    const response = await fetch("/site/gallery/cases/shared-hierarchy/data/tree.csv");
    if (!response.ok) throw new Error(`Hierarchy CSV request failed: ${response.status}`);
    const dataset = await datasetStore.importDataset(new File([await response.text()], "tree.csv", { type: "text/csv" }));
    return dataset ? loadSharedHierarchyCase(dataset.id, compose) : false;
  } catch (error) {
    document.documentElement.dataset.galleryStarterError = String(error);
    return false;
  }
}

async function loadRequestedGalleryStarter(starterId: string) {
  if (starterId === "shared-hierarchy") return loadSharedHierarchyExample(false);
  return starterId === "academic-scores"
    ? loadAcademicScoresWideData()
    : loadGalleryStarter(starterId);
}

function exposeRenderedCaseSvg() {
  const svg = exportCanvasSvgMarkup(true);
  if (!svg) return false;
  (window as Window & { __VISBRICKS_CASE_SVG__?: string }).__VISBRICKS_CASE_SVG__ = svg;
  return true;
}

onMounted(() => {
  if (isDendrogramGallery) {
    const starter = new URLSearchParams(window.location.search).get("starter") === "tree-leaf-axis";
    document.documentElement.dataset[starter ? "starterId" : "caseId"] = starter ? "tree-leaf-axis" : "dendrogram-nested-radial-area";
    document.documentElement.dataset[starter ? "starterStatus" : "caseStatus"] = "loading";
    void nextTick(async () => {
      try {
        if (!await loadDendrogramProfilesCase(!starter)) throw new Error("Dendrogram case setup failed");
        if (!starter) {
          const svg = exportCanvasSvgMarkup(true);
          if (!svg) throw new Error("Dendrogram export unavailable");
          (window as Window & { __VISBRICKS_CASE_SVG__?: string }).__VISBRICKS_CASE_SVG__ = svg;
        }
        document.documentElement.dataset[starter ? "starterStatus" : "caseStatus"] = "ready";
      } catch (error) {
        document.documentElement.dataset.galleryStarterError = String(error);
        document.documentElement.dataset[starter ? "starterStatus" : "caseStatus"] = "error";
      }
    });
  }
  const geoStarter = new URLSearchParams(window.location.search).get("starter") === "geographic-network";
  if (geoStarter || requestedCase === "geographic-network-layer-nested-bars") {
    document.documentElement.dataset[geoStarter ? "starterId" : "caseId"] = geoStarter ? "geographic-network" : "geographic-network-layer-nested-bars";
    document.documentElement.dataset[geoStarter ? "starterStatus" : "caseStatus"] = "loading";
    void nextTick(async () => {
      try {
        if (!await loadGeographicNetworkCase(!geoStarter)) throw new Error("Geographic case setup failed");
        if (!geoStarter) {
          const svg = await exportRenderedGeographicSvg();
          if (!svg) throw new Error("Geographic export unavailable");
          (window as Window & { __VISBRICKS_CASE_SVG__?: string }).__VISBRICKS_CASE_SVG__ = svg;
        }
        document.documentElement.dataset[geoStarter ? "starterStatus" : "caseStatus"] = "ready";
      } catch (error) {
        document.documentElement.dataset.galleryStarterError = String(error);
        document.documentElement.dataset[geoStarter ? "starterStatus" : "caseStatus"] = "error";
      }
    });
  }
  syncRenderedNodeSelectionBounds();
  if (typeof IntersectionObserver === "function" && canvasRef.value) {
    deckglVisibilityObserver = new IntersectionObserver(updateDeckglLayerVisibility, {
      root: canvasRef.value,
      rootMargin: "160px",
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
    });
    deckglLayerElements.forEach((element) => deckglVisibilityObserver?.observe(element));
  }
  window.addEventListener("keydown", onCompositionKeyDown);
  window.addEventListener("click", closeCompositionCandidates);
  window.addEventListener("click", closeTemplateCategoryMenu);
  window.addEventListener("resize", positionNestedBindingPopup);
  window.addEventListener("resize", closeTemplateCategoryMenu);
  if (requestedStarter && !isDendrogramGallery) {
    document.documentElement.dataset.starterId = requestedStarter;
    document.documentElement.dataset.starterStatus = "loading";
    void nextTick(async () => {
      const loaded = await loadRequestedGalleryStarter(requestedStarter);
      await nextTick();
      document.documentElement.dataset.starterStatus = loaded ? "ready" : "error";
    });
  } else if (isSharedHierarchyCase) {
    document.documentElement.dataset.caseId = SHARED_HIERARCHY_CASE_ID;
    document.documentElement.dataset.caseStatus = "loading";
    void nextTick(async () => {
      const loaded = await loadSharedHierarchyExample(true);
      await nextTick();
      document.documentElement.dataset.caseStatus = loaded && exposeRenderedCaseSvg() ? "ready" : "error";
    });
  } else if (isAcademicScoresCase) {
    document.documentElement.dataset.caseId = requestedCase;
    document.documentElement.dataset.caseStatus = "loading";
    void nextTick(async () => {
      const loaded = await loadAcademicScoresWideData(true);
      await nextTick();
      document.documentElement.dataset.caseStatus = loaded && exposeRenderedCaseSvg() ? "ready" : "error";
    });
  } else if (isChordCircularStackedCase) {
    document.documentElement.dataset.caseId = requestedCase;
    document.documentElement.dataset.caseStatus = "loading";
    void nextTick(async () => {
      const loaded = await loadChordCircularStackedFacetCase(CHORD_POLAR_LINE_DATASET_ID);
      await nextTick();
      document.documentElement.dataset.caseStatus = loaded && exposeRenderedCaseSvg() ? "ready" : "error";
    });
  }
  if (!requestedStarter && isMatrixPieNetworkCase) {
    document.documentElement.dataset.caseId = requestedCase;
    document.documentElement.dataset.caseStatus = "loading";
    void nextTick(async () => {
      const loaded = await loadMatrixPieNetworkCase(MATRIX_PIE_NETWORK_DATASET_ID);
      await nextTick();
      document.documentElement.dataset.caseStatus = loaded && exposeRenderedCaseSvg() ? "ready" : "error";
    });
  }
});
onUpdated(() => {
  // CanvasNodeView emits actual SVG occupancy groups for visible content. The store
  // compares the resulting small bounds map and mutates reactive state only
  // when browser layout changed, so this post-render bridge settles in at
  // most one additional component update.
  syncRenderedNodeSelectionBounds();
});
onBeforeUnmount(() => {
  deckglVisibilityObserver?.disconnect();
  deckglVisibilityObserver = null;
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
