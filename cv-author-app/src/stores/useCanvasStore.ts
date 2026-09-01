import {
  ref,
  shallowRef,
  computed,
  nextTick,
  watch,
  onMounted,
  onBeforeUnmount,
  type Ref,
} from "vue";
import type {
  CanvasNode,
  CanvasLeafNode,
  CanvasGroupNode,
  CanvasHistorySnapshot,
  CanvasHistoryPositionPatch,
  MarkGroupConfigValue,
  ContextMenuState,
  CoordinateSystem,
  Interaction,
  MarqueeInteraction,
  MoveInteraction,
  PanInteraction,
  ScaleInteraction,
  RotateInteraction,
  CoordinateOriginInteraction,
  CoordinateAxisScaleInteraction,
  PolarAngleInteraction,
  ScaleHandle,
  SelectionUnit,
  Bounds,
  Point,
  ParsedSvgTemplate,
  ParsedSvgTemplateNode,
  ParsedSvgLeafTemplateNode,
  SvgCandidate,
  CompositionType,
  LayerOrderAction,
  AxisBindingTarget,
  EncodingChannel,
  ChartSpec,
  ChartAxisChannel,
  ChartAxisConfig,
  ChartPlotArea,
  ChartEncodingChannel,
  LayerSpec,
  NestedSpec,
  SemanticSelection,
  GeneratedMarkMetadata,
  LlmRendererProvenance,
  OptionalEncodingChannel,
  CoordinateChannel,
  CoordinateSystemSpec,
  ChartDropZone,
  DataBindingDropZone,
  NestedBindingConfig,
  NestedBindingTarget,
  ChartDrilldown,
  ChartRelationshipState,
  InheritedFilterContext,
  NestedRelationship,
  NestedRenderPlacement,
  RelativeNestedParameters,
  MarkGroupSharedConfig,
  Dataset,
  DataRow,
  DimensionRecommendation,
  ChartDataTransform,
  GeographicLayerConfig,
  GeographicMapViewState,
  ConcatLinkSpec,
  ConcatSplitControl,
} from "../types";
import { isDataColumnTypeCompatible } from "../types";
import { useDatasetStore } from "./useDatasetStore";
import { useChartRelationshipStore } from "./useChartRelationshipStore";
import { scoreSeriesCandidates } from "../utils/seriesInference";
import {
  extractChartStyleTokens,
  isLineChartType,
  renderLineChart,
} from "../utils/lineRenderer";
import {
  candidates,
  loadSvgTemplate,
  parseSvgTemplate,
  scopeSvgContent,
} from "../utils/svgUtils";
import {
  clamp,
  normalizeBounds,
  mergeBounds,
  boundsFromNodeFrame,
  cloneCanvasNode,
  collectNodeBounds,
  collectNodeSelectionBounds,
  createCanvasNodesSvgMarkup,
  cloneChartSpec,
  getNodeSelectionBounds,
  getPolarOccupiedGeometry,
  getPolarSelectionGeometry,
  getLeafNodeTransform,
  getNodeTransform,
} from "../utils/canvasUtils";
import { chartScalePosition, renderDeterministicChart, renderLayerChart, renderNestedPie } from "../utils/semanticRenderer";
import {
  cartesianAxisEncoding,
  getDimensionChartUpgradeOptions,
  getChartTemplateContract,
  hasRequiredChartEncodings,
  normalizeBarChartVariant,
  normalizeChartTemplate,
} from "../utils/chartTemplates";
export { getDimensionChartUpgradeOptions } from "../utils/chartTemplates";
import { materializeGraphDataset, prepareChartData, rowMatchesChartFilters } from "../utils/chartDataPipeline";
import { materializeChartDataTransforms } from "../utils/chartDataTransforms";
import { csvRowKey } from "../utils/csvDataEngine";
import {
  createPolarCoordinateSystemModel,
  polarAngleSpanFromPoint,
} from "../components/PolarCoordinateSystem";
import { createCartesianAxisModel } from "../components/CartesianCoordinateSystem";
import {
  csvColumnDragMime,
  decodeCsvColumnDragPayload,
  endCsvColumnDrag,
  getActiveCsvColumnDrag,
  type CsvColumnDragPayload,
} from "../utils/csvColumnDrag";
import {
  getEncodingChannelConfigsForSpec,
  resolvedEncodingField,
  resolvedSeriesField,
  resolveChartEncodingIssues,
} from "../utils/encodingConfig";
import { resolveSemanticMarkMatch } from "../utils/chartSelection";
import {
  createChartInstanceDocument,
  restoreCanvasNodesFromChartInstanceDocument,
} from "../utils/chartInstance";
import {
  inferColumnIntents,
  type InputColumnIntentAnalysis,
} from "../utils/dimensionInference";
import { geoJsonFeatureIds } from "../utils/geoJsonGeometry";
import {
  createDefaultChartSpec,
  defaultChartDataset,
  defaultChartSpecWithAppearance,
  isDefaultChartDataSpec,
  replaceDefaultDataBinding,
  supportsDefaultChartData,
} from "../utils/defaultChartData";
import {
  canResolveNestedParentField,
  chartRoleFields,
  compositionOptions,
  coordinateOptions,
  createUnboundChartSpec,
  defaultGeographicLayerConfig,
  getNestedParentContextFields,
  implementedTemplateDefinitions,
  lineDataEncodings,
  migrateLineChartAppearance,
  supportsOptionalEncodings,
  type NestedContextRole,
} from "./canvas/catalog";
import {
  identityMatrix,
  invertMatrix,
  multiplyMatrix,
  pointInBounds,
  pointToSegmentDistance,
  polarPointAtAngle,
  transformPoint,
  type Matrix,
} from "./canvas/coordinates";
import { useCanvasHistory } from "./canvas/history";
import { useCanvasSelection } from "./canvas/selection";
import { useCanvasTree } from "./canvas/tree";
import { markMatchesNestedDataKey, nestedItemDataKey } from "./canvas/nestedMarkIdentity";
import { countTemplateNodes, estimatePolarOrigin } from "./canvas/importGeometry";
import { useCanvasRendering } from "./canvas/rendering";
import { useCanvasClipboard } from "./canvas/clipboard";
import { useCanvasImportOperations } from "./canvas/importOperations";
import { useCanvasInteraction } from "./canvas/interaction";
import { useCanvasCompositionOperations } from "./canvas/compositionOperations";
import { useCanvasCoordinateOperations } from "./canvas/coordinateOperations";
import {
  cartesianTreeDirection,
  cartesianTreeLeafAxis,
  isCartesianTreeChart,
} from "../utils/treeLayout";
export {
  canResolveNestedParentField,
  compositionOptions,
  coordinateOptions,
  createUnboundChartSpec,
  getFilterIconSvg,
  getNestedParentContextFields,
} from "./canvas/catalog";

const singleBarValueOrderTransformId = "encoding:single-bar:value-order";
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export function useCanvasStore(canvasRef: Ref<HTMLElement | null>) {
  type DragTestStage = "transform" | "position" | "position-dropzone" | "full" | null;
  type SelectionTestStage = "cleanup" | "transient" | "drilldown" | "composition-edit" | "scope" | "normalize" | "move" | "relationship" | "selection" | "axis-binding" | "composition" | "full" | null;
  const dragTestStage: DragTestStage = typeof window === "undefined" || !window.location
    ? null
    : (() => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("drag-transform-only")) return "transform";
      const value = params.get("drag-stage");
      return value === "transform" || value === "position" || value === "position-dropzone" || value === "full"
        ? value
        : null;
    })();
  const selectionTestConfig: { stage: SelectionTestStage; profile: boolean } = typeof window === "undefined" || !window.location
    ? { stage: null, profile: false }
    : (() => {
      const params = new URLSearchParams(window.location.search);
      const value = params.get("selection-stage");
      const stage: SelectionTestStage = value === "cleanup"
        || value === "transient"
        || value === "drilldown"
        || value === "composition-edit"
        || value === "scope"
        || value === "normalize"
        || value === "move"
        || value === "relationship"
        || value === "selection"
        || value === "axis-binding"
        || value === "composition"
        || value === "full"
        ? value
        : null;
      return { stage, profile: params.has("selection-profile") || stage !== null };
    })();
  type SelectionDiagnosticEntry = {
    nodeId: string;
    stage: Exclude<SelectionTestStage, null>;
    phase: "sync" | "flush";
    duration: number;
    recordedAt: number;
  };
  const selectionDiagnosticLog = typeof window === "undefined"
    ? null
    : ((window as Window & { __CV_AUTHOR_SELECTION_LOG__?: SelectionDiagnosticEntry[] }).__CV_AUTHOR_SELECTION_LOG__
      ??= []);
  function measureSelectionStage<T>(nodeId: string, stage: Exclude<SelectionTestStage, null>, action: () => T): T {
    if (!selectionTestConfig.profile) return action();
    const startedAt = performance.now();
    const result = action();
    const duration = performance.now() - startedAt;
    const entry: SelectionDiagnosticEntry = { nodeId, stage, phase: "sync", duration, recordedAt: Date.now() };
    selectionDiagnosticLog?.push(entry);
    console.info(`[selection-test] ${stage} sync ${duration.toFixed(2)}ms`, { nodeId });
    if (selectionTestConfig.stage === stage) {
      void nextTick(() => {
        const flushDuration = performance.now() - startedAt;
        const flushEntry: SelectionDiagnosticEntry = {
          nodeId,
          stage,
          phase: "flush",
          duration: flushDuration,
          recordedAt: Date.now(),
        };
        selectionDiagnosticLog?.push(flushEntry);
        console.info(`[selection-test] ${stage} flush ${flushDuration.toFixed(2)}ms`, { nodeId });
      });
    }
    return result;
  }
  function selectionTestOnly(stage: Exclude<SelectionTestStage, null>) {
    return selectionTestConfig.stage !== null && selectionTestConfig.stage !== "full"
      && selectionTestConfig.stage === stage;
  }
  const {
    activeDataset,
    getDataset,
    activeGeometrySource,
  } = useDatasetStore();
  const relationshipStore = useChartRelationshipStore();
  const {
    state: chartRelationships,
    selectedEntity: selectedRelationshipEntity,
    dispatch: dispatchRelationship,
    snapshot: snapshotRelationships,
    restore: restoreRelationships,
    bindingForChartChannel,
    axesForChart,
    chartsForAxis,
    reconcileCanvasNodes: reconcileRelationshipNodes,
    defaultRelativeParameters,
    resolveNestedRelationship,
  } = relationshipStore;
  // --- sidebar state ---
  const selectedCoordinateSystems = ref<Set<CoordinateSystem>>(new Set());
  const generatedCandidates = ref<SvgCandidate[]>([]);

  function toggleCoordinateSystem(value: CoordinateSystem) {
    selectedCoordinateSystems.value = selectedCoordinateSystems.value.has(value)
      ? new Set()
      : new Set([value]);
  }
  function coordinateSystemMatches(coordinateSystem: CoordinateSystem) {
    return selectedCoordinateSystems.value.size === 0 || selectedCoordinateSystems.value.has(coordinateSystem);
  }
  function isVisibleCandidate(candidate: SvgCandidate) {
    return candidate.chartType.replace(/^_+/, "").toLowerCase() !== "bespoke";
  }

  const previewableCandidates = computed(() =>
    [...implementedTemplateDefinitions, ...generatedCandidates.value, ...candidates.filter(isVisibleCandidate)],
  );
  const implementedTemplateCandidates = computed(() => implementedTemplateDefinitions);
  const compositionCandidates = computed(() =>
    generatedCandidates.value,
  );
  const filteredCandidates = computed(() => {
    const implementedIds = new Set(implementedTemplateCandidates.value.map((candidate) => candidate.id));
    return candidates.filter((c) => {
      if (!isVisibleCandidate(c)) return false;
      if (implementedIds.has(c.id)) return false;
      return coordinateSystemMatches(c.coordinateSystem);
    });
  });

  // --- canvas state ---
  const canvasNodes = ref<CanvasNode[]>([]);
  const viewZoom = ref(1);
  const viewPan = ref<Point>({ x: 0, y: 0 });
  const selectedIds = ref<string[]>([]);
  const editingGroupPath = ref<string[]>([]);
  const editingCompositionId = ref<string | null>(null);
  const chartDrilldown = ref<ChartDrilldown | null>(null);
  const rotationInputVisible = ref(false);
  const polarAngleInputVisible = ref(false);
  const undoStack = ref<Array<CanvasHistorySnapshot | CanvasHistoryPositionPatch>>([]);
  const redoStack = ref<Array<CanvasHistorySnapshot | CanvasHistoryPositionPatch>>([]);
  const pendingMarkConfigEdit = ref<{
    snapshot: CanvasHistorySnapshot;
    field: string;
    changes: Array<{ nodeId: string; role: string; before: MarkGroupConfigValue | undefined }>;
  } | null>(null);
  const clipboardNodes = ref<CanvasNode[]>([]);
  const interaction = ref<Interaction | null>(null);
  const nestedPreparedDataCache = new Map<string, {
    sourceDataset: Dataset;
    dataKey: string;
    result: ReturnType<typeof prepareChartData>;
  }>();
  let pendingDropZoneUpdate: { point: Point; sourceNodeId: string } | null = null;
  let dropZoneUpdateFrame: number | null = null;
  const contextMenu = ref<ContextMenuState | null>(null);
  const draggedCandidateId = ref<string | null>(null);
  const activeDropZone = ref<ChartDropZone | null>(null);
  const compositionDragSourceId = ref<string | null>(null);
  type CompositionEditFrame = Pick<CanvasNode, "x" | "y" | "width" | "height" | "scaleX" | "scaleY" | "rotation">;
  const compositionEditLayout = shallowRef<{
    compositionId: string;
    type: "layer";
    frames: Record<string, CompositionEditFrame>;
  } | null>(null);
  const compositionFrameAnimations = new Map<SVGGraphicsElement, Animation>();
  function scheduleCompositionDropZone(point: Point, sourceNodeId: string) {
    pendingDropZoneUpdate = { point, sourceNodeId };
    if (dropZoneUpdateFrame !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      flushCompositionDropZone();
      return;
    }
    dropZoneUpdateFrame = requestAnimationFrame(() => {
      dropZoneUpdateFrame = null;
      const pending = pendingDropZoneUpdate;
      pendingDropZoneUpdate = null;
      if (!pending || compositionDragSourceId.value !== pending.sourceNodeId) return;
      activeDropZone.value = compositionDropZoneAtPoint(pending.point, pending.sourceNodeId);
    });
  }

  function flushCompositionDropZone() {
    if (dropZoneUpdateFrame !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(dropZoneUpdateFrame);
      dropZoneUpdateFrame = null;
    }
    const pending = pendingDropZoneUpdate;
    pendingDropZoneUpdate = null;
    if (pending && compositionDragSourceId.value === pending.sourceNodeId) {
      activeDropZone.value = compositionDropZoneAtPoint(pending.point, pending.sourceNodeId);
    }
  }
  function clearCompositionDropZoneSchedule() {
    if (dropZoneUpdateFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(dropZoneUpdateFrame);
    }
    dropZoneUpdateFrame = null;
    pendingDropZoneUpdate = null;
  }
  const nestedDropPath = ref<Array<{ nodeId: string; childMarkIndexes: number[]; groupKey?: string }>>([]);
  const activeDataBindingDropZone = ref<DataBindingDropZone | null>(null);
  const dimensionDropTarget = ref<{
    nodeId: string;
    fieldName: string;
    clientX: number;
    clientY: number;
    analysis: InputColumnIntentAnalysis;
  } | null>(null);
  const nestedBindingTarget = ref<NestedBindingTarget | null>(null);
  const nestedPositionRelationshipIds = ref<string[]>([]);
  const loadingDrop = ref(false);
  const importNotice = ref<string | null>(null);
  const axisBindingTarget = ref<AxisBindingTarget | null>(null);
  // Pointer coordinates are only metadata; keep the reactive target stable for repeated clicks.
  function setAxisBindingTarget(target: AxisBindingTarget) {
    const current = axisBindingTarget.value;
    if (current?.nodeId === target.nodeId && current.channel === target.channel) return;
    axisBindingTarget.value = target;
  }
  const semanticSelection = ref<SemanticSelection | null>(null);
  const activeNestedRelationshipId = ref<string | null>(null);
  const {
    getRootNode,
    findCanvasNode,
    walkCanvasNodes,
    parentGroupIdForNode,
    getGroupsAtPath,
    getGroupAtPath,
    getSelectionScopeNodes,
    getSelectionNode,
    nestedSelectionRelationships,
    topLevelSelectionNodeId,
  } = useCanvasTree({
    canvasNodes,
    editingGroupPath,
    relationships: chartRelationships,
  });

  const nestedPositionEditor = computed(() => {
    const relationships = nestedPositionRelationshipIds.value
      .map((relationshipId) => chartRelationships.value.nestedRelationships[relationshipId])
      .filter((relationship): relationship is NestedRelationship => !!relationship);
    const relationship = relationships[0];
    if (!relationship) return null;
    const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
    if (!parameters.parentAnchor || !parameters.childAnchor || !parameters.offset) return null;
    const parent = findCanvasNode(relationship.parentChartId);
    const child = findCanvasNode(relationship.childChartId);
    if (!parent || !child) return null;
    return {
      relationshipIds: relationships.map((item) => item.id),
      parent,
      child,
      parentName: parent.name,
      childName: child.name.replace(/ nested \d+$/, ""),
      parentMarkGroupId: relationship.parentMarkGroupId,
      parentDataKey: relationship.parentDataKey,
      instanceCount: relationships.length,
      parameters: {
        parentAnchor: { ...parameters.parentAnchor },
        childAnchor: { ...parameters.childAnchor },
        offset: { ...parameters.offset },
        scale: { ...(parameters.scale ?? { x: 1, y: 1 }) },
        retainParent: relationships.every((item) =>
          (item.parameters as Partial<RelativeNestedParameters>).retainParent !== false),
      },
    };
  });

  // --- helpers ---

  let renderChartNodeImplementation: ((node: CanvasNode, useLayerScales?: boolean) => void) | undefined;
  let renderSharedCoordinateCompositionImplementation:
    ((node: CanvasNode, applyAxisVisibility?: boolean) => void) | undefined;
  let setSelectionImplementation: ((ids: string[]) => void) | undefined;
  let cloneCanvasNodeForPasteImplementation: ((node: CanvasNode, renderClone?: boolean) => CanvasNode) | undefined;
  let getCanvasNodeListBoundsImplementation: ((nodes: CanvasNode[]) => Bounds | null) | undefined;
  let setImportNoticeImplementation: ((message: string) => void) | undefined;
  function renderChartNode(node: CanvasNode, useLayerScales = true) {
    renderChartNodeImplementation?.(node, useLayerScales);
  }
  function renderSharedCoordinateComposition(node: CanvasNode, applyAxisVisibility = false) {
    renderSharedCoordinateCompositionImplementation?.(node, applyAxisVisibility);
  }
  function setSelection(ids: string[]) {
    setSelectionImplementation?.(ids);
  }
  function cloneCanvasNodeForPaste(node: CanvasNode, renderClone = true) {
    return cloneCanvasNodeForPasteImplementation?.(node, renderClone) ?? node;
  }
  function getCanvasNodeListBounds(nodes: CanvasNode[]) {
    return getCanvasNodeListBoundsImplementation?.(nodes) ?? null;
  }
  function setImportNotice(message: string) {
    setImportNoticeImplementation?.(message);
  }

  const coordinateOperations = useCanvasCoordinateOperations({
    axesForChart, axisBindingTarget, barItemAxisBinding, bindingForChartChannel,
    canvasNodes, canvasRef, chartDrilldown, chartRelationships,
    chartsForAxis,
    cloneCanvasNode, collectNodeBounds, collectNodeSelectionBounds,
    compositionFrameAnimations, concatGraphMembers, concatLinksFor, createCartesianAxisModel,
    decodeCsvColumnDragPayload, defaultRelativeParameters,
    dispatchRelationship, editingCompositionId, editingGroupPath, endCsvColumnDrag,
    findCanvasNode, generatedCandidates, getActiveCsvColumnDrag, getChartTemplateContract,
    getGroupAtPath,
    getGroupsAtPath, getRootNode, getSelectionScopeNodes, getSelectionNode, getDataset,
    getNodeSelectionBounds, hasRequiredChartEncodings,
    getNodeTransform, getPolarOccupiedGeometry, identityMatrix, invertMatrix,
    implementedTemplateDefinitions, inferColumnIntents, isDataColumnTypeCompatible,
    isDefaultChartDataSpec, logicalAxisChannel, multiplyMatrix, nestedDropPath, normalizeBounds,
    normalizeChartTemplate,
    pointInBounds, pointToSegmentDistance, reconcileRelationshipNodes,
    renderChartNode, renderSharedCoordinateComposition,
    replaceDefaultDataBinding, selectedIds, semanticSelection, seriesItemCategoricalFields,
    seriesItemMemberIds,
    setSelection, transformPoint, walkCanvasNodes, chartScalePosition, csvColumnDragMime,
    candidates, compositionEditLayout, compositionOptions, coordinateOptions, getLeafNodeTransform,
    viewPan, viewZoom,
  });
  const {
    registerChartRelationship, relationshipCoordinateSystem, coordinateSystemForNode,
    compositionCoordinateTargets, coordinateTargets, renderCoordinateTargets,
    standaloneCoordinateSystem, reconcileCoordinateSystems, liftCompositionChild,
    migrateIndependentViewGroups, currentDropZoneScopeNodes, selectionScopeNodes,
    canvasNodesWithRestoredCompositionLayout, compositionElementTransform,
    animateCompositionFrameChange, restoreCompositionEditLayout,
    spreadLayerCompositionForEditing, beginCompositionEditing, finishCompositionEditing,
    editingCartesianConcat, concatEditableAxis, coordinateTransformItemIds,
    replaceSelectionScopeNodes, toGroupLocalPoint, toSelectionScopePoint, groupMatrix,
    getCanvasViewport, getCanvasBounds, getSelectionScopeBounds, toCanvasPoint,
    toNodeLocalPoint, nodeLocalToSelectionScopePoint, seriesItemMemberCount,
    seriesItemDropFrame, seriesItemDropBounds, getCandidate, dataBindingDropZoneAtPoint,
  } = coordinateOperations;

  function mappedEncodingChannel(node: CanvasNode, channel: CoordinateChannel): ChartEncodingChannel {
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    const coordinateType = getChartTemplateContract(node.chartSpec?.chartType ?? "")?.coordinateSystem;
    if (isCartesianTreeChart(node.chartSpec?.chartType) && (channel === "x" || channel === "y")) {
      return channel === cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec))
        ? "category"
        : channel;
    }
    if (template === "pie" || template === "donut") {
      if (channel === "angle") return "theta";
      if (channel === "radius" || channel === "ring") return channel;
      return channel === "x" ? "color" : "theta";
    }
    if (coordinateType === "Polar") {
      if (channel === "angle") return "theta";
      if (channel === "radius" || channel === "ring") return channel;
    }
    if (template === "matrix") return channel;
    return channel === "angle" || channel === "radius" || channel === "ring" ? "x" : channel;
  }

  /** A composition can only consume completed atomic chart units. */
  function isAtomicChartReady(node: CanvasNode) {
    const spec = node.chartSpec;
    const contract = spec ? getChartTemplateContract(spec.chartType) : null;
    return !!spec
      && !!contract
      && hasRequiredChartEncodings(spec)
      && (!node.coordinateGuide || node.coordinateGuide.type === contract.coordinateSystem);
  }

  function isCartesianCompositionChart(node: CanvasNode) {
    const contract = node.chartSpec ? getChartTemplateContract(node.chartSpec.chartType) : null;
    return node.coordinateGuide?.type === "Cartesian"
      && contract?.coordinateSystem === "Cartesian"
      && isAtomicChartReady(node);
  }

  function isPolarCompositionChart(node: CanvasNode) {
    const contract = node.chartSpec ? getChartTemplateContract(node.chartSpec.chartType) : null;
    return node.coordinateGuide?.type === "Polar"
      && contract?.coordinateSystem === "Polar"
      && isAtomicChartReady(node);
  }

  function encodingForSharedChannel(node: CanvasNode, channel: CoordinateChannel) {
    const spec = node.chartSpec;
    if (!spec) return undefined;
    const facet = node.compositionSpec?.type === "facet" ? node.compositionSpec : null;
    if (facet) {
      const facetChannel: CoordinateChannel = (facet.facetCoordinateSystem ?? node.coordinateGuide?.type) === "Polar"
        ? (facet.facetDirection === "row" ? "radius" : "angle")
        : (facet.facetDirection === "row" ? "y" : "x");
      if (channel === facetChannel) {
        const facetField = (facet.facetCoordinateSystem ?? node.coordinateGuide?.type) === "Polar"
          ? (facet.facetDirection === "row" ? facet.facetRadiusField : facet.facetThetaField)
          : (facet.facetGrid
            ? facet.facetDirection === "row" ? facet.facetGrid.rowField : facet.facetGrid.columnField
            : facet.facetField);
        if (facetField) {
          const fieldType = getDataset(spec.datasetId)?.columns.find((column) => column.name === facetField)?.type;
          if (fieldType) return { field: facetField, type: fieldType };
        }
      }
    }
    if (channel === "x" || channel === "y") {
      if (isCartesianTreeChart(spec.chartType)) {
        const leafAxis = cartesianTreeLeafAxis(cartesianTreeDirection(spec));
        if (channel !== leafAxis) return undefined;
        return spec.encodings.category ?? spec.encodings.key;
      }
      const axisEncoding = cartesianAxisEncoding(spec, channel);
      if (axisEncoding) return axisEncoding;
      // Matrix/heatmap charts may still use persisted row/column encodings.
      if (normalizeChartTemplate(spec.chartType) === "matrix") {
        return channel === "x" ? spec.encodings.column : spec.encodings.row;
      }
      return undefined;
    }
    const encoding = channel === "angle"
      ? spec.encodings.theta ?? spec.encodings.angle
      : spec.encodings[channel];
    if (encoding) return encoding;
    if (channel === "angle") {
      return spec.angleFields?.[0];
    }
    if (channel === "radius") return spec.encodings.radius;
    return undefined;
  }

  function sharedChannelEncodingsAreCompatible(nodes: CanvasNode[], channel: CoordinateChannel) {
    const encodings = nodes.map((node) => encodingForSharedChannel(node, channel));
    if (channel === "radius" && encodings.every((encoding) => !encoding)) return true;
    if (encodings.some((encoding) => !encoding)) return false;
    const firstType = encodings[0]!.type;
    return encodings.every((encoding) => encoding!.type === firstType);
  }

  type RepeatableCompositionType = "layer" | "concat";

  type ExternalCoordinate = {
    type: CoordinateSystem;
    sharedChannels: CoordinateChannel[];
  };

  function concatLinksFor(composition: NonNullable<CanvasNode["compositionSpec"]>): ConcatLinkSpec[] {
    if (composition.type !== "concat") return [];
    if (composition.concatLinks?.length) {
      return composition.concatLinks
        .map((link, index) => ({
          ...link,
          order: link.order ?? index,
          sharedChannels: [...link.sharedChannels],
        }))
        .sort((left, right) => left.order - right.order);
    }
    // Older saved canvases only have one direction and an ordered member list.
    // Treat adjacent members as the legacy links so they participate in the
    // same graph-based selection/drop behavior.
    if (!composition.direction || composition.members.length < 2) return [];
    const sharedChannels = [...composition.sharedChannels];
    return composition.members.slice(1).map((member, index) => ({
      targetNodeId: composition.members[index]!.nodeId,
      sourceNodeId: member.nodeId,
      direction: composition.direction!,
      position: "after" as const,
      sharedChannels: [...sharedChannels],
      order: index,
    }));
  }

  function concatHasMixedDirections(composition: NonNullable<CanvasNode["compositionSpec"]>) {
    const links = concatLinksFor(composition);
    return new Set(links.map((link) => link.direction)).size > 1;
  }

  function concatLinkId(link: ConcatLinkSpec) {
    return `${link.targetNodeId}|${link.sourceNodeId}|${link.direction}|${link.position}`;
  }

  function externalCoordinate(node: CanvasNode): ExternalCoordinate | null {
    const composition = node.compositionSpec;
    if (composition) {
      if (composition.type === "facet") {
        const coordinateType = composition.facetCoordinateSystem ?? node.coordinateGuide?.type ?? "Cartesian";
        const sharedChannels: CoordinateChannel[] = coordinateType === "Polar"
          // A facet contributes its own nominal/ordinal coordinate while its
          // member charts retain the other shared coordinate. Expose both
          // channels to outer compositions so a facet behaves like the
          // two-axis chart it renders as.
          ? ["angle", "radius"]
          : ["x", "y"];
        return { type: coordinateType, sharedChannels };
      }
      if (composition.type === "nested") {
        return {
          type: node.coordinateSystem?.type ?? node.coordinateGuide?.type ?? "CoordinateFree",
          sharedChannels: [...(node.coordinateSystem?.sharedChannels ?? composition.sharedChannels)],
        };
      }
      if (composition.type === "concat") {
        const contract = node.chartSpec ? getChartTemplateContract(node.chartSpec.chartType) : null;
        return {
          type: node.coordinateSystem?.type ?? node.coordinateGuide?.type ?? contract?.coordinateSystem ?? "CoordinateFree",
          sharedChannels: [...(contract?.shareableChannels ?? [])],
        };
      }
      return {
        type: node.coordinateSystem?.type ?? node.coordinateGuide?.type ?? "CoordinateFree",
        sharedChannels: [...composition.sharedChannels],
      };
    }
    const contract = node.chartSpec ? getChartTemplateContract(node.chartSpec.chartType) : null;
    if (!contract) return null;
    return {
      type: node.coordinateGuide?.type ?? contract.coordinateSystem,
      sharedChannels: [...contract.shareableChannels],
    };
  }

  function externalCoordinatesAreCompatible(nodes: CanvasNode[]) {
    const coordinates = nodes.map(externalCoordinate);
    if (coordinates.some((coordinate) => !coordinate)) return false;
    const first = coordinates[0]!;
    return first.type !== "CoordinateFree"
      && coordinates.every((coordinate) => coordinate!.type === first.type);
  }

  function repeatableCompositionMembers(
    node: CanvasNode,
    type: RepeatableCompositionType,
    direction?: NonNullable<NonNullable<CanvasNode["compositionSpec"]>["direction"]>,
  ): CanvasNode[] | null {
    const composition = node.compositionSpec;
    if (!composition) return [node];
    if (editingCompositionId.value === composition.id) return null;
    // Layer and concat can participate in a new composition as atomic
    // external units. Expand their members so the resulting coordinate system
    // can be rebuilt from the underlying chart contracts.
    if (composition.type !== type
      && composition.type !== "layer"
      && composition.type !== "concat"
      && composition.type !== "facet") return [node];
    // A concat is a graph of independent links. Existing members may already
    // have horizontal and vertical links, so a new edge need not match the
    // first edge's direction.
    const members = composition.members
      .map((member) => getSelectionNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member);
    return members.length === composition.members.length ? members : null;
  }

  function repeatableCompositionNodes(
    nodes: CanvasNode[],
    type: RepeatableCompositionType,
    direction?: NonNullable<NonNullable<CanvasNode["compositionSpec"]>["direction"]>,
  ) {
    const expanded: CanvasNode[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      const members = repeatableCompositionMembers(node, type, direction);
      if (!members) return null;
      members.forEach((member) => {
        if (seen.has(member.id)) return;
        seen.add(member.id);
        expanded.push(member);
      });
    }
    return expanded;
  }

  function repeatableCompositionPairNodes(
    source: CanvasNode,
    target: CanvasNode,
    type: RepeatableCompositionType,
    direction?: NonNullable<NonNullable<CanvasNode["compositionSpec"]>["direction"]>,
  ) {
    const sourceMembers = repeatableCompositionMembers(source, type, direction);
    const targetMembers = repeatableCompositionMembers(target, type, direction);
    if (!sourceMembers || !targetMembers) return null;
    if (sourceMembers.some((member) => targetMembers.some((targetMember) => targetMember.id === member.id))) return null;
    return repeatableCompositionNodes([...targetMembers, ...sourceMembers], type, direction);
  }

  function sameChannels(left: CoordinateChannel[], right: CoordinateChannel[]) {
    return left.length === right.length && left.every((channel) => right.includes(channel));
  }

  function existingRepeatableCompositions(nodes: CanvasNode[], type: RepeatableCompositionType) {
    const specs = new Map<string, NonNullable<CanvasNode["compositionSpec"]>>();
    nodes.forEach((node) => {
      const spec = node.compositionSpec;
      if (spec?.type === type) specs.set(spec.id, spec);
    });
    return Array.from(specs.values());
  }

  function existingFlatCompositions(nodes: CanvasNode[]) {
    const specs = new Map<string, NonNullable<CanvasNode["compositionSpec"]>>();
    nodes.forEach((node) => {
      const spec = node.compositionSpec;
      if (spec && (spec.type === "layer" || spec.type === "concat")) specs.set(spec.id, spec);
    });
    return Array.from(specs.values());
  }

  function layerChannelsForNodes(nodes: CanvasNode[]) {
    const contracts = nodes.map((node) => node.chartSpec ? getChartTemplateContract(node.chartSpec.chartType) : null);
    if (contracts.some((contract) => !contract || !contract.supportsLayerComposition)) return null;
    const compatible = contracts[0]!.shareableChannels.filter((channel) =>
      contracts.every((contract) => contract!.shareableChannels.includes(channel))
      && sharedChannelEncodingsAreCompatible(nodes, channel),
    );
    const existing = existingRepeatableCompositions(nodes, "layer");
    if (existing.length === 0) return compatible;
    const channels = existing[0]!.sharedChannels;
    if (!existing.every((spec) => sameChannels(spec.sharedChannels, channels))) return null;
    return channels.every((channel) => compatible.includes(channel)) ? [...channels] : null;
  }

  function compatibleLayerChannels(nodes: CanvasNode[]) {
    if (nodes.length < 2 || !externalCoordinatesAreCompatible(nodes)) return null;
    const coordinateType = externalCoordinate(nodes[0]!)!.type;
    const channels = nodes[0]!.compositionSpec
      ? externalCoordinate(nodes[0]!)!.sharedChannels
      : layerChannelsForNodes(nodes);
    if (!channels) return null;
    const compatible = channels.filter((channel) => nodes.every((node) => {
      const external = externalCoordinate(node);
      return !!external && external.sharedChannels.includes(channel);
    }));
    return coordinateType !== "CoordinateFree" && compatible.length ? compatible : null;
  }

  function concatNodesAreCompatible(
    nodes: CanvasNode[],
    direction: "horizontal" | "vertical" | "radial" | "angular",
    channel: CoordinateChannel,
  ) {
    // Polar concat shares a geometric domain. A hierarchy may derive its
    // angle or radius structurally instead of exposing a field encoding.
    const polarGeometryConcat = (direction === "radial" && channel === "angle")
      || (direction === "angular" && channel === "radius");
    const allPolar = polarGeometryConcat && nodes.every(isPolarCompositionChart);
    return externalCoordinatesAreCompatible(nodes)
      && existingRepeatableCompositions(nodes, "concat").every((composition) => {
        const links = concatLinksFor(composition);
        return links.length === 0 || links.every((link) => link.sharedChannels.includes(channel)
          ? link.direction === direction
          : true);
      })
      && (allPolar || (
        nodes.every((node) => externalCoordinate(node)?.sharedChannels.includes(channel))
        && sharedChannelEncodingsAreCompatible(nodes, channel)
      ));
  }

  function concatEdgeNodesAreCompatible(
    target: CanvasNode,
    source: CanvasNode,
    direction: "horizontal" | "vertical" | "radial" | "angular",
    channel: CoordinateChannel,
  ) {
    const polarGeometryConcat = (direction === "radial" && channel === "angle")
      || (direction === "angular" && channel === "radius");
    if (polarGeometryConcat) {
      return externalCoordinatesAreCompatible([target, source])
        && [target, source].every(isPolarCompositionChart);
    }
    return externalCoordinatesAreCompatible([target, source])
      && [target, source].every((node) => externalCoordinate(node)?.sharedChannels.includes(channel))
      && sharedChannelEncodingsAreCompatible([target, source], channel)
      && [target, source].every(isCartesianCompositionChart);
  }

  function concatGraphMembers(composition: NonNullable<CanvasNode["compositionSpec"]>) {
    const ids = new Set(composition.members.map((member) => member.nodeId));
    concatLinksFor(composition).forEach((link) => {
      ids.add(link.targetNodeId);
      ids.add(link.sourceNodeId);
    });
    return Array.from(ids);
  }

  function concatMemberSharedChannels(
    composition: NonNullable<CanvasNode["compositionSpec"]>,
    nodeId: string,
  ) {
    const links = concatLinksFor(composition);
    if (!links.length) return [...composition.sharedChannels];
    return Array.from(new Set(links
      .filter((link) => link.targetNodeId === nodeId || link.sourceNodeId === nodeId)
      .flatMap((link) => link.sharedChannels)));
  }

  function concatMemberChannelsForLinks(links: ConcatLinkSpec[] | undefined, nodeId: string) {
    if (!links?.length) return [];
    return Array.from(new Set(links
      .filter((link) => link.targetNodeId === nodeId || link.sourceNodeId === nodeId)
      .flatMap((link) => link.sharedChannels)));
  }

  function retireMergedCompositions(
    compositions: NonNullable<CanvasNode["compositionSpec"]>[],
    retainedId: string,
  ) {
    compositions.forEach((composition) => {
      if (composition.id === retainedId) return;
      dispatchRelationship({
        type: "remove-composition",
        compositionId: composition.id,
        keepSharedAxes: true,
      });
    });
  }

  // --- computed ---
  const selectedNodes = computed(() =>
    selectedIds.value.map((id) => getSelectionNode(id)).filter((n): n is CanvasNode => !!n),
  );
  const passiveCompositeSelection = computed(() => {
    const composition = selectedNodes.value[0]?.compositionSpec;
    return !!composition && editingCompositionId.value !== composition.id;
  });
  const axisBindingNode = computed(() => {
    const target = axisBindingTarget.value ? findCanvasNode(axisBindingTarget.value.nodeId) : null;
    if (!target) return null;
    // Concat members remain independent charts even though declared channels
    // share one structural coordinate contract.
    return target;
  });
  function firstChartNode(node: CanvasNode | null | undefined) {
    return node
      ? walkCanvasNodes([node]).find((candidate) => !!candidate.chartSpec) ?? null
      : null;
  }
  const axisBindingDataset = computed(() => {
    const chartNode = firstChartNode(axisBindingNode.value);
    const datasetId = chartNode?.chartSpec?.datasetId;
    const dataset = datasetId ? getDataset(datasetId) : activeDataset.value;
    return dataset && chartNode?.chartSpec
      ? materializeChartDataTransforms(
        materializeGraphDataset(dataset, chartNode.chartSpec),
        chartNode.chartSpec.dataTransforms,
      )
      : dataset;
  });
  const axisBindingColumns = computed(() => axisBindingDataset.value?.columns ?? []);
  const axisBindingValue = computed(() => {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    if (!target || !node) return "";
    return encodingForSharedChannel(node, target.channel)?.field ?? "";
  });
  const axisBindingSeriesCandidates = computed(() => {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset || !isLineChartType(node.chartSpec.chartType)) return [];
    return scoreSeriesCandidates(dataset, node.chartSpec);
  });
  const axisBindingSeriesValue = computed(() => axisBindingNode.value?.chartSpec?.series?.field ?? "");
  const axisBindingEncodingValues = computed(() => {
    const encodings = axisBindingNode.value?.chartSpec?.encodings;
    return {
      color: encodings?.color?.field ?? "",
      size: encodings?.size?.field ?? "",
      shape: encodings?.shape?.field ?? "",
    } satisfies Record<OptionalEncodingChannel, string>;
  });
  const axisBindingOptionalCandidates = computed(() => {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset || !supportsOptionalEncodings(node.chartSpec.chartType)) return [];
    const supportedChannels = new Set(
      getChartTemplateContract(node.chartSpec.chartType)?.channels.map((mapping) => mapping.channel) ?? [],
    );
    const excluded = new Set([
      node.chartSpec.encodings.x?.field,
      node.chartSpec.encodings.y?.field,
    ].filter((field): field is string => !!field));
    const candidates = (channel: OptionalEncodingChannel) => dataset.columns.filter((column) => {
      if (excluded.has(column.name)) return false;
      if (channel === "size") return column.type === "quantitative";
      return channel === "shape" ? column.type === "nominal" || column.type === "ordinal" : true;
    });
    return [
      { channel: "color" as const, label: "Color", candidates: candidates("color") },
      { channel: "size" as const, label: "Size", candidates: candidates("size") },
      { channel: "shape" as const, label: "Shape", candidates: candidates("shape") },
    ].filter((option) => supportedChannels.has(option.channel));
  });
  const axisBindingRendererError = computed(() => axisBindingNode.value?.chartSpec?.renderer?.error ?? "");
  const axisBindingAxis = computed(() => {
    const target = axisBindingTarget.value;
    if (!target) return null;
    const binding = bindingForChartChannel(target.nodeId, target.channel);
    return binding ? chartRelationships.value.axes[binding.axisId] ?? null : null;
  });
  const axisBindingRelatedCharts = computed(() => {
    const axis = axisBindingAxis.value;
    if (!axis) return [] as CanvasNode[];
    return chartsForAxis(axis.id)
      .map(({ chart }) => chart.nodeId ? findCanvasNode(chart.nodeId) : null)
      .filter((node): node is CanvasNode => !!node);
  });
  const coordinateGuideNodes = computed(() => {
    const seen = new Set<string>();
    return selectedNodes.value.filter((node) => {
      if (!node.coordinateGuide) return false;
      const id = coordinateSystemForNode(node.id)?.id ?? `coordinate:${node.id}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  });
  function itemBindingAxis(node: CanvasNode): CoordinateChannel {
    if (getChartTemplateContract(node.chartSpec?.chartType ?? "")?.coordinateSystem === "Polar") return "angle";
    if (isCartesianTreeChart(node.chartSpec?.chartType)) {
      return cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec));
    }
    return node.chartSpec?.axisSwapped === true ? "x" : "y";
  }
  function logicalAxisChannel(node: CanvasNode, channel: ChartEncodingChannel): ChartEncodingChannel {
    if (isCartesianTreeChart(node.chartSpec?.chartType) && (channel === "x" || channel === "y")) {
      return channel === cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec))
        ? "category"
        : channel;
    }
    if (node.chartSpec?.axisSwapped !== true || (channel !== "x" && channel !== "y")) return channel;
    return channel === "x" ? "y" : "x";
  }
  function isPolarSegmentChart(chartType: string) {
    const template = normalizeChartTemplate(chartType);
    return template === "pie"
      || template === "donut"
      || chartType.replace(/[\s_-]/g, "").toLowerCase() === "radialbarchart";
  }
  function seriesItemCategoricalFields(spec: ChartSpec) {
    if (spec.defaultDataBinding) return [];
    const explicit = spec.seriesFields?.map((encoding) => encoding.field)
      ?? (spec.series ? [spec.series.field] : []);
    if (explicit.length > 0) return explicit;
    const template = normalizeChartTemplate(spec.chartType);
    if (isPolarSegmentChart(spec.chartType) && spec.encodings.segment?.field) {
      return [spec.encodings.segment.field];
    }
    return template === "scatter"
      && (spec.encodings.color?.type === "nominal" || spec.encodings.color?.type === "ordinal" || spec.encodings.color?.type === "temporal")
      ? [spec.encodings.color.field]
      : [];
  }
  function barItemAxisBinding(node: CanvasNode) {
    const variant = normalizeBarChartVariant(node.chartSpec?.chartType ?? "");
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    if (node.chartSpec && isPolarSegmentChart(node.chartSpec.chartType)) {
      return {
        label: "Segment",
        fields: node.chartSpec.encodings.segment?.field
          ? [node.chartSpec.encodings.segment.field]
          : node.chartSpec.angleFields?.map((encoding) => encoding.field) ?? [],
      };
    }
    const isSeriesChart = template === "line" || template === "scatter" || template === "area";
    if (!node.chartSpec || (!isSeriesChart
      && variant !== "grouped" && variant !== "stacked" && variant !== "divergent-stacked")) {
      return null;
    }
    return {
      label: template === "scatter"
        ? "Point type"
        : isSeriesChart ? "Series" : variant === "grouped" ? "Group item" : "Segment item",
      fields: node.chartSpec.defaultDataBinding
        ? []
        : Array.from(new Set([
          ...seriesItemCategoricalFields(node.chartSpec),
          ...(node.chartSpec.valueFields?.map((encoding) => encoding.field) ?? []),
        ])),
    };
  }
  function seriesItemMemberIds(node: CanvasNode) {
    const binding = barItemAxisBinding(node);
    if (!binding || !node.chartSpec) return [];
    const categoricalFields = new Set(seriesItemCategoricalFields(node.chartSpec));
    const rows = getDataset(node.chartSpec.datasetId)?.rows ?? [];
    const members = new Set<string>();
    binding.fields.forEach((field) => {
      if (!categoricalFields.has(field)) {
        members.add(field);
        return;
      }
      rows.forEach((row) => {
        const value = row[field];
        if (value) members.add(value);
      });
    });
    return Array.from(members);
  }
  const semanticMarkGroupConfig = computed(() => {
    const selection = semanticSelection.value;
    const node = selection ? findCanvasNode(selection.nodeId) : null;
    if (!selection || !node) return null;
    const specs = [node.chartSpec, ...(node.layerSpec?.children.map((child) => child.chartSpec) ?? [])].filter((spec): spec is ChartSpec => !!spec);
    const group = specs.flatMap((spec) => spec.markGroups ?? []).find((item) =>
      item.id === selection.markGroupId || item.role === selection.role,
    );
    return group ? { ...group.sharedConfig } : null;
  });
  const nestedBindingNode = computed(() =>
    nestedBindingTarget.value ? findCanvasNode(nestedBindingTarget.value.nodeId) : null,
  );
  const nestedBindingDataset = computed(() => {
    const node = nestedBindingNode.value;
    const datasetId = node?.layerSpec?.datasetId ?? node?.chartSpec?.datasetId;
    return datasetId ? getDataset(datasetId) : null;
  });
  const nestedBindingColumns = computed(() => nestedBindingDataset.value?.columns ?? []);
  const nestedBindingSuggestedAngleFields = computed(() => {
    const node = nestedBindingNode.value;
    return node ? nestedPieValueFields(node) : [];
  });
  const nestedRenderPlacements = computed<NestedRenderPlacement[]>(() =>
    Object.values(chartRelationships.value.nestedRelationships).flatMap((relationship) => {
      if (relationship.status !== "active") return [];
      const parent = findCanvasNode(relationship.parentChartId);
      const child = findCanvasNode(relationship.childChartId);
      if (
        !parent?.renderedContent
        || !child
        || parentGroupIdForNode(parent.id) !== parentGroupIdForNode(child.id)
      ) return [];
      return [{
        relationshipId: relationship.id,
        parentChartId: relationship.parentChartId,
        parentMarkGroupId: relationship.parentMarkGroupId,
        parentDataKey: relationship.parentDataKey,
        retainParent: (relationship.parameters as Partial<RelativeNestedParameters>).retainParent !== false,
        child,
      }];
    }),
  );
  const nestedRenderedChildIds = computed<ReadonlySet<string>>(() =>
    new Set(nestedRenderPlacements.value.map((placement) => placement.child.id)),
  );
  const selectionScopeBounds = computed<Bounds | null>(() => {
    let bounds: Bounds | null = null;
    selectedIds.value.forEach((id) => {
      const node = getSelectionNode(id);
      if (node) bounds = mergeBounds(bounds, collectNodeSelectionBounds(node));
    });
    return bounds;
  });
  const selectionBounds = computed<Bounds | null>(() => selectionScopeBounds.value);
  const selectionFrame = computed(() => {
    const semanticBounds = semanticSelection.value?.bounds;
    if (semanticBounds) {
      return {
        x: semanticBounds.minX,
        y: semanticBounds.minY,
        width: semanticBounds.width,
        height: semanticBounds.height,
        rotation: 0,
      };
    }
    const bounds = selectionBounds.value;
    const node = selectedIds.value.length === 1 ? getSelectionNode(selectedIds.value[0]!) : null;
    if (!bounds || !node) return bounds ? { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height, rotation: 0 } : null;
    if (nestedSelectionRelationships(node.id).length > 0) {
      return { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height, rotation: 0 };
    }
    const visualBounds = getNodeSelectionBounds(node);
    const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
    const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
    return {
      x: node.x + (visualBounds.minX - localMinX) * node.scaleX,
      y: node.y + (visualBounds.minY - localMinY) * node.scaleY,
      width: visualBounds.width * node.scaleX,
      height: visualBounds.height * node.scaleY,
      rotation: node.rotation,
    };
  });
  const selectionPolarOutlines = computed(() => {
    if (semanticSelection.value || selectedIds.value.length === 0) return [];
    const nodes = selectedIds.value.flatMap((id) => {
      const node = getSelectionNode(id);
      return node ? [node] : [];
    });
    if (nodes.length !== selectedIds.value.length) return [];
    const outlines = nodes.flatMap((node) => {
      const geometry = getPolarSelectionGeometry(node);
      if (!geometry) return [];
      return [{
        key: node.id,
        path: geometry.path,
        transform: node.kind === "leaf" ? getLeafNodeTransform(node) : getNodeTransform(node),
      }];
    });
    return outlines.length === nodes.length ? outlines : [];
  });
  const selectionRotation = computed(() => {
    const node = selectedNodes.value[0];
    return node ? node.rotation : 0;
  });
  const selectedPolarAngleSpan = computed(() => {
    const node = selectedNodes.value.find((item) => item.coordinateGuide?.type === "Polar");
    if (node?.compositionSpec?.type === "concat" && Number.isFinite(node.compositionSpec.polarAngleSpan)) {
      return Math.max(1, Math.min(node.compositionSpec.polarAngleSpan!, 360));
    }
    return node?.coordinateGuide?.type === "Polar"
      ? Math.max(1, Math.min(node.coordinateGuide.angleSpan ?? 360, 360))
      : null;
  });
  const marqueeBounds = computed(() => {
    if (!interaction.value || interaction.value.type !== "marquee") return null;
    return normalizeBounds(interaction.value.startPoint, interaction.value.currentPoint);
  });
  const selectionUnits = computed<SelectionUnit[]>(() =>
    selectedIds.value.map((id) => {
      const node = getSelectionNode(id);
      if (!node) return null;
      return { key: `node:${id}`, itemIds: [id], bounds: collectNodeSelectionBounds(node) } satisfies SelectionUnit;
    }).filter((u): u is SelectionUnit => !!u),
  );
  const concatSplitControls = computed<ConcatSplitControl[]>(() => {
    if (semanticSelection.value || selectedIds.value.length !== 1) return [];
    const selected = selectedNodes.value[0];
    const composition = selected?.compositionSpec;
    if (!selected || composition?.type !== "concat" || editingCompositionId.value === composition.id) return [];
    const links = concatLinksFor(composition).filter((link) =>
      link.targetNodeId === selected.id || link.sourceNodeId === selected.id,
    );
    return links.flatMap((link) => {
      const otherId = link.targetNodeId === selected.id ? link.sourceNodeId : link.targetNodeId;
      const other = findCanvasNode(otherId);
      if (!other) return [];
      const selectedBounds = collectNodeSelectionBounds(selected);
      const otherBounds = collectNodeSelectionBounds(other);
      if (!selectedBounds || !otherBounds) return [];
      let x: number;
      let y: number;
      if (link.direction === "horizontal") {
        const selectedLeft = selectedBounds.minX < otherBounds.minX;
        x = selectedLeft
          ? (selectedBounds.maxX + otherBounds.minX) / 2
          : (otherBounds.maxX + selectedBounds.minX) / 2;
        const minY = Math.max(selectedBounds.minY, otherBounds.minY);
        const maxY = Math.min(selectedBounds.maxY, otherBounds.maxY);
        y = minY <= maxY ? (minY + maxY) / 2 : (selectedBounds.minY + otherBounds.minY) / 2;
      } else if (link.direction === "vertical") {
        const selectedTop = selectedBounds.minY < otherBounds.minY;
        y = selectedTop
          ? (selectedBounds.maxY + otherBounds.minY) / 2
          : (otherBounds.maxY + selectedBounds.minY) / 2;
        const minX = Math.max(selectedBounds.minX, otherBounds.minX);
        const maxX = Math.min(selectedBounds.maxX, otherBounds.maxX);
        x = minX <= maxX ? (minX + maxX) / 2 : (selectedBounds.minX + otherBounds.minX) / 2;
      } else {
        const selectedPolar = getPolarOccupiedGeometry(selected);
        const otherPolar = getPolarOccupiedGeometry(other);
        if (!selectedPolar || !otherPolar) {
          x = (selectedBounds.minX + selectedBounds.maxX + otherBounds.minX + otherBounds.maxX) / 4;
          y = (selectedBounds.minY + selectedBounds.maxY + otherBounds.minY + otherBounds.maxY) / 4;
        } else if (link.direction === "radial") {
          // Ring concat shares its angular plane. Put the split control on
          // the shared R boundary, halfway through that plane's angle span.
          const radialBoundaries = [
            { radius: selectedPolar.outerRadius, otherRadius: otherPolar.innerRadius },
            { radius: selectedPolar.innerRadius, otherRadius: otherPolar.outerRadius },
          ];
          const boundary = radialBoundaries.reduce((closest, candidate) =>
            Math.abs(candidate.radius - candidate.otherRadius) < Math.abs(closest.radius - closest.otherRadius)
              ? candidate
              : closest,
          );
          const angle = selectedPolar.startAngle + selectedPolar.angleSpan / 2;
          const localPoint = polarPointAtAngle(selectedPolar.origin, boundary.radius, -angle);
          ({ x, y } = nodeLocalToSelectionScopePoint(selected, localPoint));
        } else {
          // Angular concat shares the radial plane. Its join is the common
          // angular boundary, with the control halfway between inner and
          // outer radii.
          const angleDistance = (first: number, second: number) => {
            const difference = Math.abs(((first - second + 540) % 360) - 180);
            return difference;
          };
          const angularBoundaries = [
            { angle: selectedPolar.startAngle, otherAngle: otherPolar.endAngle },
            { angle: selectedPolar.endAngle, otherAngle: otherPolar.startAngle },
          ];
          const boundary = angularBoundaries.reduce((closest, candidate) =>
            angleDistance(candidate.angle, candidate.otherAngle) < angleDistance(closest.angle, closest.otherAngle)
              ? candidate
              : closest,
          );
          const radius = selectedPolar.innerRadius
            + (selectedPolar.outerRadius - selectedPolar.innerRadius) / 2;
          const localPoint = polarPointAtAngle(selectedPolar.origin, radius, -boundary.angle);
          ({ x, y } = nodeLocalToSelectionScopePoint(selected, localPoint));
        }
      }
      return [{ ...link, id: concatLinkId(link), x, y }];
    });
  });
  const isPanning = computed(() => interaction.value?.type === "pan");
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const canCopy = computed(() => selectedNodes.value.length > 0);
  const canDelete = computed(() => selectedNodes.value.length > 0);
  const canPaste = computed(() => clipboardNodes.value.length > 0);
  const canGroup = computed(() => selectedNodes.value.length > 1);
  const canCompose = computed(() => {
    if (selectedNodes.value.length > 1) return selectedNodes.value.every(isAtomicChartReady);
    const node = selectedNodes.value[0];
    return !!node && isAtomicChartReady(node) && !!semanticSelection.value?.rowKey;
  });
  const canFacet = computed(() => selectedNodes.value.length > 0 && selectedNodes.value.every(isAtomicChartReady));
  const canUngroup = computed(() => selectedNodes.value.some(
    (node) => node.kind === "group" || !!node.renderedContent,
  ));
  const canTransformSelection = computed(() => !semanticSelection.value && selectedIds.value.length > 0);
  const canRemoveSelectionComposition = computed(() => {
    if (semanticSelection.value || selectedNodes.value.length === 0) return false;
    const nestedRelationship = selectedNestedRelationship();
    if (nestedRelationship && nestedBatchMetadata(nestedRelationship)) return true;
    const composition = selectedNodes.value[0]?.compositionSpec;
    if (!composition || editingCompositionId.value === composition.id) return false;
    const memberIds = scopedCompositionMemberIds(selectedNodes.value[0]!);
    return memberIds.length > 1
      && memberIds.every((id) => selectedIds.value.includes(id));
  });
  const canConfigureSelectionComposition = computed(() => {
    if (semanticSelection.value || selectedNodes.value.length === 0) return false;
    if (selectedNestedRelationship()) return true;
    const node = selectedNodes.value[0];
    const composition = node?.compositionSpec;
    if (!composition || editingCompositionId.value === composition.id) return false;
    // A facet is represented by a group container after materialization. Its
    // members live inside the group, so selecting the container is sufficient
    // to configure the facet.
    if (selectedNodes.value.length === 1
      && node?.kind === "group"
      && composition.type === "facet") return composition.members.length > 1;
    const memberIds = scopedCompositionMemberIds(selectedNodes.value[0]!);
    return memberIds.length > 1
      && memberIds.every((id) => selectedIds.value.includes(id));
  });
  const canEnterSelection = computed(() => {
    const semantic = semanticSelection.value;
    if (semantic) {
      return semantic.level === "item"
        && (semantic.partCount ?? 0) > 1
        && chartDrilldown.value?.nodeId === semantic.nodeId;
    }
    if (selectedNodes.value.length === 1) {
      const node = selectedNodes.value[0]!;
      if (node.kind === "group" && node.children.length > 0 && !node.renderedContent) return true;
      if (node.chartSpec && node.renderedContent && chartDrilldown.value?.nodeId !== node.id) return true;
    }
    const composition = selectedNodes.value[0]?.compositionSpec;
    if (!composition || editingCompositionId.value === composition.id) return false;
    const members = scopedCompositionMemberIds(selectedNodes.value[0]!);
    return members.length > 1
      && members.every((id) => selectedIds.value.includes(id));
  });
  const canMoveSelectionForward = computed(() => {
    const sel = new Set(selectedIds.value);
    const nodes = getSelectionScopeNodes();
    return nodes.some((n, i) => {
      const next = nodes[i + 1];
      return sel.has(n.id) && !!next && !sel.has(next.id);
    });
  });
  const canMoveSelectionBackward = computed(() => {
    const sel = new Set(selectedIds.value);
    const nodes = getSelectionScopeNodes();
    return nodes.some((n, i) => {
      const prev = nodes[i - 1];
      return sel.has(n.id) && !!prev && !sel.has(prev.id);
    });
  });
  const scaleHandles = computed(() => {
    if (!canTransformSelection.value) return [];
    const frame = selectionFrame.value;
    if (!frame) return [];
    const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    const radians = frame.rotation * Math.PI / 180;
    const point = (x: number, y: number) => {
      const dx = x - center.x; const dy = y - center.y;
      return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
    };
    return [
      { key: "nw" as ScaleHandle, ...point(frame.x, frame.y) },
      { key: "ne" as ScaleHandle, ...point(frame.x + frame.width, frame.y) },
      { key: "sw" as ScaleHandle, ...point(frame.x, frame.y + frame.height) },
      { key: "se" as ScaleHandle, ...point(frame.x + frame.width, frame.y + frame.height) },
    ];
  });
  const rotateHandle = computed(() => {
    if (!canTransformSelection.value) return null;
    if (selectedNodes.value.some((node) => !!editingCartesianConcat(node))) return null;
    const frame = selectionFrame.value;
    if (!frame) return null;
    const radians = frame.rotation * Math.PI / 180;
    const cx = frame.x + frame.width / 2; const cy = frame.y + frame.height / 2;
    const x = frame.x + frame.width + 22 / selectionOverlayZoom.value;
    const y = frame.y - 22 / selectionOverlayZoom.value;
    const dx = x - cx; const dy = y - cy;
    return {
      x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: cy + dx * Math.sin(radians) + dy * Math.cos(radians),
      stemX: cx + (frame.x + frame.width - cx) * Math.cos(radians) - (frame.y - cy) * Math.sin(radians),
      stemY: cy + (frame.x + frame.width - cx) * Math.sin(radians) + (frame.y - cy) * Math.cos(radians),
    };
  });
  const editingGroupMatrix = computed(() =>
    getGroupsAtPath().reduce((matrix, group) => multiplyMatrix(matrix, groupMatrix(group)), identityMatrix()),
  );
  const editingGroupTransform = computed(() => {
    if (editingGroupPath.value.length === 0) return undefined;
    const matrix = editingGroupMatrix.value;
    return `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`;
  });
  const editingGroupScale = computed(() => {
    if (editingGroupPath.value.length === 0) return 1;
    const matrix = editingGroupMatrix.value;
    return Math.max(Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)), 0.0001);
  });
  const selectionOverlayZoom = computed(() => viewZoom.value * editingGroupScale.value);
  const rotationInputPosition = computed(() => {
    const handle = rotateHandle.value;
    if (!handle) return null;
    const canvasPoint = editingGroupPath.value.length > 0
      ? transformPoint(editingGroupMatrix.value, handle)
      : handle;
    return {
      left: viewPan.value.x + canvasPoint.x * viewZoom.value,
      top: viewPan.value.y + canvasPoint.y * viewZoom.value,
    };
  });
  const polarAngleInputPosition = computed(() => {
    if (!polarAngleInputVisible.value) return null;
    const node = selectedNodes.value.find((item) => item.coordinateGuide?.type === "Polar");
    if (!node) return null;
    const model = createPolarCoordinateSystemModel(
      node,
      selectionOverlayZoom.value,
      !node.compositionSpec || editingCompositionId.value !== node.compositionSpec.id,
    );
    if (!model) return null;
    let canvasPoint = nodeLocalToSelectionScopePoint(node, model.upperRadiusEnd);
    if (editingGroupPath.value.length > 0) canvasPoint = transformPoint(editingGroupMatrix.value, canvasPoint);
    return {
      left: viewPan.value.x + canvasPoint.x * viewZoom.value,
      top: viewPan.value.y + canvasPoint.y * viewZoom.value,
    };
  });

  // --- history ---
  function captureCanvasHistory(relationships = snapshotRelationships()): CanvasHistorySnapshot {
    const snapshotNodes = canvasNodesWithRestoredCompositionLayout();
    return {
      instanceDocument: createChartInstanceDocument(snapshotNodes),
      nodes: snapshotNodes.map((node) => cloneCanvasNode(node)),
      selectedIds: [...selectedIds.value],
      editingGroupPath: [...editingGroupPath.value],
      relationships,
    };
  }
  function restoreCanvasHistory(snapshot: CanvasHistorySnapshot) {
    interaction.value = null;
    detachPointerListeners();
    compositionEditLayout.value = null;
    editingCompositionId.value = null;
    nestedPositionRelationshipIds.value = [];
    chartDrilldown.value = null;
    nestedDropPath.value = [];
    const snapshotNodes = snapshot.nodes
      ?? (snapshot.instanceDocument
        ? restoreCanvasNodesFromChartInstanceDocument(snapshot.instanceDocument)
        : []);
    canvasNodes.value = migrateIndependentViewGroups(snapshotNodes.map((n) => cloneCanvasNode(n)));
    if (snapshot.relationships) restoreRelationships(snapshot.relationships);
    else {
      dispatchRelationship({ type: "clear" });
      reconcileRelationshipNodes(canvasNodes.value);
    }
    const renderedLayers = new Set<string>();
    walkCanvasNodes().forEach((node) => {
      if (!node.chartSpec || node.llmRenderer) return;
      if (node.layerSpec) {
        renderSemanticNode(node);
        return;
      }
      if (node.compositionSpec?.type === "layer") {
        if (renderedLayers.has(node.compositionSpec.id)) return;
        renderedLayers.add(node.compositionSpec.id);
      }
      renderSharedCoordinateComposition(node);
    });
    editingGroupPath.value = snapshot.editingGroupPath && getGroupAtPath(snapshot.editingGroupPath)
      ? [...snapshot.editingGroupPath]
      : [];
    setSelection(snapshot.selectedIds);
    axisBindingTarget.value = null;
    semanticSelection.value = null;
    nestedBindingTarget.value = null;
    activeNestedRelationshipId.value = null;
    scheduleNestedChildLayout();
  }
  const canvasHistory = useCanvasHistory({
    undoStack,
    redoStack,
    captureSnapshot: captureCanvasHistory,
    restoreSnapshot: restoreCanvasHistory,
    findNode: findCanvasNode,
    selectionNode: getSelectionNode,
  });
  function pushCanvasHistory(relationships?: ChartRelationshipState) {
    canvasHistory.pushSnapshot(captureCanvasHistory(relationships));
  }
  function pushMoveHistory(mi: MoveInteraction) {
    return canvasHistory.pushMovePatch(mi.itemIds, mi.snapshots);
  }
  function undoCanvasChange() {
    canvasHistory.undo();
  }
  function redoCanvasChange() {
    canvasHistory.redo();
  }

  // --- selection ---
  const {
    scopedCompositionMemberIds,
    normalizeSelection,
    setSelection: setSelectionFromSelection,
    toggleSelection,
  } = useCanvasSelection({
    selectedIds,
    editingCompositionId,
    rotationInputVisible,
    polarAngleInputVisible,
    relationships: chartRelationships,
    selectionScopeNodes: getSelectionScopeNodes,
    selectionNode: getSelectionNode,
    nestedRelationships: nestedSelectionRelationships,
    topLevelNodeId: topLevelSelectionNodeId,
  });
  setSelectionImplementation = setSelectionFromSelection;

  // --- canvas ops ---
  function clearCanvas() {
    if (canvasNodes.value.length === 0) return;
    pushCanvasHistory();
    canvasNodes.value = [];
    dispatchRelationship({ type: "clear" });
    selectedIds.value = [];
    editingGroupPath.value = [];
    editingCompositionId.value = null;
    chartDrilldown.value = null;
    nestedDropPath.value = [];
    axisBindingTarget.value = null;
    semanticSelection.value = null;
    nestedBindingTarget.value = null;
    activeNestedRelationshipId.value = null;
  }
  function deleteSelectedNodes() {
    const nestedRelationship = selectedNestedRelationship();
    if (nestedRelationship && removeNestedComposition(nestedRelationship)) return;
    const sel = new Set(selectedIds.value);
    if (sel.size === 0) return;
    pushCanvasHistory();
    getSelectionScopeNodes()
      .filter((node) => sel.has(node.id))
      .flatMap((node) => walkCanvasNodes([node]))
      .filter((node) => !!node.chartSpec)
      .forEach((node) => dispatchRelationship({ type: "unregister-chart", chartId: node.id, keepAxes: true }));
    replaceSelectionScopeNodes(getSelectionScopeNodes().filter((n) => !sel.has(n.id)));
    reconcileCoordinateSystems();
    selectedIds.value = [];
    if (axisBindingTarget.value && sel.has(axisBindingTarget.value.nodeId)) {
      axisBindingTarget.value = null;
    }
    contextMenu.value = null;
    semanticSelection.value = null;
    activeNestedRelationshipId.value = null;
  }

  function renderSemanticNode(node: CanvasNode) {
    if (!node.layerSpec || node.coordinateGuide?.type !== "Cartesian") return;
    const sourceDataset = getDataset(node.layerSpec.datasetId);
    if (!sourceDataset) return;
    const dataTransforms = node.chartSpec?.dataTransforms;
    const effectiveDataTransforms = transformsWithNestedContext(node, dataTransforms);
    const filteredDataset = node.chartSpec
      ? { ...sourceDataset, rows: sourceDataset.rows.filter((row) => rowMatchesChartFilters(row, node.chartSpec!)) }
      : sourceDataset;
    const dataset = node.chartSpec
      ? materializeChartDataTransforms(filteredDataset, effectiveDataTransforms)
      : filteredDataset;
    const lineChild = node.layerSpec.children.find((child) => child.role === "line");
    if (!lineChild) return;
    const chartSpec = migrateLineChartAppearance({ ...lineChild.chartSpec, encodings: { ...lineChild.chartSpec.encodings }, series: lineChild.chartSpec.series });
    lineChild.chartSpec = chartSpec;
    try {
      const result = renderLayerChart({
        chartId: node.id,
        width: node.width,
        height: node.height,
        minX: 0,
        minY: 0,
        coordinateGuide: node.coordinateGuide,
        chartSpec,
        dataset,
        layerSpec: node.layerSpec,
      });
      node.chartSpec = { ...chartSpec, dataTransforms, scales: result.scales, plotArea: result.plotArea, renderer: { kind: "deterministic-line", version: 3, status: "ready" } };
      node.renderedContent = result.content;
      if (node.nestedSpec) {
        const nested = renderNestedPie({ chartId: node.id, width: node.width, height: node.height, minX: 0, minY: 0, baseSpec: node.chartSpec, nestedSpec: node.nestedSpec, dataset });
        node.renderedContent += nested.content;
      }
    } catch (error) {
      node.renderedContent = null;
      node.chartSpec = { ...chartSpec, dataTransforms, renderer: { kind: "deterministic-line", version: 3, status: "error", error: error instanceof Error ? error.message : "Unable to render Layer." } };
    }
  }

  function applyLlmRenderer(nodeId: string, result: { svg: string; marks: GeneratedMarkMetadata[]; code: string; provenance: LlmRendererProvenance }) {
    const node = findCanvasNode(nodeId);
    if (!node) return false;
    pushCanvasHistory();
    node.renderedContent = `<g data-chart-type="llm" data-renderer="llm@1" data-mark-count="${result.marks.length}">${result.svg}</g>`;
    node.llmRenderer = {
      kind: "llm",
      version: 1,
      status: "ready",
      code: result.code,
      marks: result.marks.map((mark) => ({ ...mark })),
      provenance: { ...result.provenance },
    };
    if (node.chartSpec) {
      node.chartSpec = {
        ...node.chartSpec,
        renderer: { kind: "llm", version: 1, status: "ready" },
      };
    }
    return true;
  }

  function semanticSelectionBounds(elements: Element[], scopeGroupId: string | null | undefined = editingGroupPath.value.at(-1)) {
    let bounds: Bounds | null = null;
    elements.forEach((element) => {
      if (element instanceof SVGGraphicsElement) {
        try {
          const elementMatrix = element.getScreenCTM();
          const scopeElement = scopeGroupId
            ? Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
              .find((candidate) => candidate.dataset.nodeId === scopeGroupId)
            : element.ownerSVGElement?.firstElementChild;
          const scopeMatrix = scopeElement instanceof SVGGraphicsElement
            ? scopeElement.getScreenCTM()
            : null;
          const inverseScopeMatrix = scopeMatrix ? invertMatrix(scopeMatrix) : null;
          if (elementMatrix && inverseScopeMatrix) {
            const relativeMatrix = multiplyMatrix(inverseScopeMatrix, elementMatrix);
            const box = element.getBBox({
              fill: true,
              stroke: true,
              markers: true,
              clipped: true,
            });
            const points = [
              transformPoint(relativeMatrix, { x: box.x, y: box.y }),
              transformPoint(relativeMatrix, { x: box.x + box.width, y: box.y }),
              transformPoint(relativeMatrix, { x: box.x, y: box.y + box.height }),
              transformPoint(relativeMatrix, { x: box.x + box.width, y: box.y + box.height }),
            ];
            const minX = Math.min(...points.map((point) => point.x));
            const minY = Math.min(...points.map((point) => point.y));
            const maxX = Math.max(...points.map((point) => point.x));
            const maxY = Math.max(...points.map((point) => point.y));
            if ([minX, minY, maxX, maxY].every(Number.isFinite) && (maxX > minX || maxY > minY)) {
              bounds = mergeBounds(bounds, {
                minX,
                minY,
                maxX,
                maxY,
                width: maxX - minX,
                height: maxY - minY,
              });
              return;
            }
          }
        } catch {
          // Fall back for detached or partially rendered SVG elements.
        }
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;
      const points = [
        toSelectionScopePoint(rect.left, rect.top, scopeGroupId),
        toSelectionScopePoint(rect.right, rect.top, scopeGroupId),
        toSelectionScopePoint(rect.left, rect.bottom, scopeGroupId),
        toSelectionScopePoint(rect.right, rect.bottom, scopeGroupId),
      ];
      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxX = Math.max(...points.map((point) => point.x));
      const maxY = Math.max(...points.map((point) => point.y));
      bounds = mergeBounds(bounds, {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
      });
    });
    return bounds;
  }

  function semanticMarkElements(target: Element, mode: "category" | "mark", categoryKey?: string) {
    if (mode === "mark" || !categoryKey) return [target];
    const chartRoot = target.closest("[data-chart-type]");
    if (!chartRoot) return [target];
    return Array.from(chartRoot.querySelectorAll("[data-mark-role]"))
      .filter((element) => element.getAttribute("data-category-key") === categoryKey);
  }

  function onSemanticMarkPointerDown(node: CanvasNode, event: PointerEvent) {
    const topLevelNodeId = topLevelSelectionNodeId(node.id);
    if (topLevelNodeId !== node.id) {
      const topLevelNode = findCanvasNode(topLevelNodeId);
      if (topLevelNode) {
        onCanvasNodePointerDown(topLevelNode, event);
        return;
      }
    }
    const drilldown = chartDrilldown.value;
    if (!drilldown || drilldown.nodeId !== node.id) return;
    const target = event.target instanceof Element ? event.target.closest("[data-mark-role]") : null;
    if (!(target instanceof Element)) return;
    compositionDragSourceId.value = null;
    activeDropZone.value = null;
    const role = target.getAttribute("data-mark-role") ?? "";
    const markGroupId = target.getAttribute("data-mark-group-id") ?? undefined;
    const seriesKey = target.getAttribute("data-series-key") ?? undefined;
    const categoryKey = target.getAttribute("data-category-key") ?? undefined;
    const rowTarget = target.hasAttribute("data-row-key") ? target : target.closest("[data-row-key]");
    const rowKey = rowTarget?.getAttribute("data-row-key") ?? undefined;
    const match = resolveSemanticMarkMatch(node.chartSpec?.chartType ?? "", drilldown.level, {
      role,
      categoryKey,
      seriesKey,
      rowKey,
    });
    const elements = semanticMarkElements(target, match.mode, categoryKey);
    semanticSelection.value = {
      nodeId: node.id,
      role,
      markGroupId,
      seriesKey,
      categoryKey,
      rowKey,
      level: drilldown.level,
      partCount: elements.length,
      bounds: semanticSelectionBounds(elements) ?? undefined,
    };
    dispatchRelationship({
      type: "select-entity",
      selection: markGroupId && chartRelationships.value.markGroups[markGroupId]
        ? { type: "mark-group", id: markGroupId }
        : { type: "chart", id: node.id },
    });
    if (node.chartSpec) {
      setAxisBindingTarget({
        nodeId: node.id,
        channel: isCartesianTreeChart(node.chartSpec.chartType)
          ? cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec))
          : getChartTemplateContract(node.chartSpec.chartType)?.coordinateSystem === "Polar" ? "angle" : "x",
        clientX: event.clientX,
        clientY: event.clientY,
      });
    } else {
      axisBindingTarget.value = null;
    }
    if (node.nestedSpec && rowKey && (role === "pie-arc" || role === "nested-pie")) {
      nestedBindingTarget.value = {
        nodeId: node.id,
        rowKey,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
    const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
    if (hasModifier) toggleSelection([node.id]);
    else {
      setSelection([node.id]);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function updateNodeMarkGroupConfig(
    node: CanvasNode,
    patch: MarkGroupSharedConfig,
    requestedRole?: string,
    recordHistory = true,
  ) {
    const role = requestedRole ?? getChartTemplateContract(node.chartSpec?.chartType ?? "")?.markRole;
    if (!role) return false;
    const specs = [node.chartSpec, ...(node.layerSpec?.children.map((child) => child.chartSpec) ?? [])]
      .filter((spec): spec is ChartSpec => !!spec);
    const updates = specs.flatMap((spec) => {
      const group = spec.markGroups?.find((item) => item.role === role)
        ?? (!requestedRole ? spec.markGroups?.[0] : undefined);
      if (!group) return [];
      return [{ spec, group }];
    });
    if (updates.length === 0 && node.chartSpec && !requestedRole) {
      if (recordHistory) pushCanvasHistory();
      node.chartSpec = {
        ...node.chartSpec,
        markGroups: [{
          id: `mark-group:${node.id}:${role}`,
          chartId: node.id,
          role,
          memberKeys: [],
          sharedConfig: { opacity: 1, ...patch },
        }],
      };
      renderChartNode(node, !(node.compositionSpec
        && editingCompositionId.value === node.compositionSpec.id));
      registerChartRelationship(node);
      if (patch.size !== undefined || patch.leafRadius !== undefined) {
        const affectedNested = Object.values(chartRelationships.value.nestedRelationships)
          .filter((relationship) => relationship.status === "active"
            && (relationship.parentChartId === node.id || relationship.childChartId === node.id))
          .map((relationship) => relationship.id);
        if (affectedNested.length > 0) {
          scheduleNestedChildLayout(affectedNested, {
            fitToParentMark: patch.size !== undefined && isCartesianTreeChart(node.chartSpec?.chartType),
          });
        }
      }
      return true;
    }
    if (updates.length === 0) return false;

    const field = Object.keys(patch).length === 1 ? Object.keys(patch)[0] : undefined;
    const deferred = !!field
      && pendingMarkConfigEdit.value?.field === field
      && pendingMarkConfigEdit.value.changes.some((change) => change.nodeId === node.id && change.role === role);
    if (recordHistory && !deferred) pushCanvasHistory();
    updates.forEach(({ group }) => {
      group.sharedConfig = { ...group.sharedConfig, ...patch };
      if (chartRelationships.value.markGroups[group.id]) {
        dispatchRelationship({ type: "update-mark-group", groupId: group.id, sharedConfig: patch });
      }
    });
    if (node.layerSpec) renderSemanticNode(node);
    else renderChartNode(node, !(node.compositionSpec
      && editingCompositionId.value === node.compositionSpec.id));
    registerChartRelationship(node);
    // Size changes alter the geometry consumed by tree/force layouts and by
    // every parent link that embeds this chart. Re-run the affected nested
    // relationships after the renderer has produced the new marks.
    if (patch.size !== undefined || patch.leafRadius !== undefined) {
      const affectedNested = Object.values(chartRelationships.value.nestedRelationships)
        .filter((relationship) => relationship.status === "active"
          && (relationship.parentChartId === node.id || relationship.childChartId === node.id))
        .map((relationship) => relationship.id);
      if (affectedNested.length > 0) {
        scheduleNestedChildLayout(affectedNested, {
          fitToParentMark: patch.size !== undefined && isCartesianTreeChart(node.chartSpec?.chartType),
        });
      }
    }
    return true;
  }

  function updateAxisBindingMarkGroupConfig(patch: MarkGroupSharedConfig) {
    const node = axisBindingNode.value;
    if (!node) return;
    const targets = encodingTargets(node);
    if (targets.length <= 1) {
      updateNodeMarkGroupConfig(node, patch);
      return;
    }
    if (!pendingMarkConfigEdit.value) pushCanvasHistory();
    targets.forEach((target) => updateNodeMarkGroupConfig(target, patch, undefined, false));
    reconcileRelationshipNodes(canvasNodes.value);
  }

  function markConfigGroup(node: CanvasNode, role: string) {
    return node.chartSpec?.markGroups?.find((group) => group.role === role)
      ?? node.chartSpec?.markGroups?.[0];
  }

  function beginMarkConfigEdit(nodeId: string, role: string, field: string) {
    if (pendingMarkConfigEdit.value) commitMarkConfigEdit();
    const node = findCanvasNode(nodeId);
    if (!node) return;
    const changes = encodingTargets(node).flatMap((target) => {
      const group = markConfigGroup(target, role);
      return group
        ? [{ nodeId: target.id, role, before: group.sharedConfig[field] }]
        : [];
    });
    if (changes.length === 0) return;
    pendingMarkConfigEdit.value = {
      snapshot: captureCanvasHistory(),
      field,
      changes,
    };
  }

  function commitMarkConfigEdit() {
    const edit = pendingMarkConfigEdit.value;
    pendingMarkConfigEdit.value = null;
    if (!edit) return;
    const changed = edit.changes.some((change) => {
      const node = findCanvasNode(change.nodeId);
      const group = node ? markConfigGroup(node, change.role) : null;
      return !!group && !Object.is(group.sharedConfig[edit.field], change.before);
    });
    if (!changed) return;
    undoStack.value.push(edit.snapshot);
    if (undoStack.value.length > 50) undoStack.value.shift();
    redoStack.value = [];
  }

  function updateSelectedChartMarkGroupConfig(patch: MarkGroupSharedConfig) {
    const node = selectedNodes.value.find((item) => !!item.chartSpec);
    if (!node) return false;
    return updateNodeMarkGroupConfig(node, patch);
  }

  function updateSemanticMarkGroupConfig(patch: MarkGroupSharedConfig) {
    const selection = semanticSelection.value;
    const node = selection ? findCanvasNode(selection.nodeId) : null;
    if (!selection || !node) return;
    updateNodeMarkGroupConfig(node, patch, selection.role);
  }

  function dimensionDecisionTargets(node: CanvasNode) {
    if (node.compositionSpec?.type !== "facet") return [node];
    return node.compositionSpec.members
      .map((member) => findCanvasNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member?.chartSpec);
  }

  function nestedBatchEncodingTargets(node: CanvasNode) {
    const relationship = Object.values(chartRelationships.value.nestedRelationships).find((candidate) =>
      candidate.status === "active" && candidate.childChartId === node.id,
    );
    if (!relationship) return [node];
    const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
    const batchId = parameters.batchId;
    const relationships = Object.values(chartRelationships.value.nestedRelationships).filter((candidate) => {
      if (candidate.status !== "active") return false;
      if (batchId) return (candidate.parameters as Partial<RelativeNestedParameters>).batchId === batchId;
      return candidate.id === relationship.id;
    });
    const targets = relationships
      .map((candidate) => findCanvasNode(candidate.childChartId))
      .filter((candidate): candidate is CanvasNode => !!candidate?.chartSpec);
    return targets.length > 0 ? targets : [node];
  }

  function encodingTargets(node: CanvasNode) {
    const nestedTargets = nestedBatchEncodingTargets(node);
    if (nestedTargets.length > 1) return nestedTargets;
    if (node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat") {
      return node.chartSpec ? [node] : [];
    }
    const targets = dimensionDecisionTargets(node);
    if (targets.length !== 1 || targets[0]?.id !== node.id) return targets;
    return nestedTargets;
  }

  function updateEncodingTargets(
    node: CanvasNode,
    update: (target: CanvasNode, spec: ChartSpec) => ChartSpec,
    render = true,
  ) {
    const targets = encodingTargets(node);
    pushCanvasHistory();
    targets.forEach((target) => {
      if (!target.chartSpec) return;
      target.llmRenderer = null;
      target.chartSpec = update(target, target.chartSpec);
      registerChartRelationship(target);
    });
    if (render) {
      const owner = (node.compositionSpec?.type === "layer"
        || (node.compositionSpec?.type === "concat" && editingCompositionId.value !== node.compositionSpec.id))
        ? findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? targets[0] ?? node
        : null;
      if (owner) renderSharedCoordinateComposition(owner);
      else if ((node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
        && editingCompositionId.value === node.compositionSpec.id) targets.forEach((target) => renderChartNode(target, false));
      else targets.forEach((target) => renderSharedCoordinateComposition(target));
    }
    reconcileRelationshipNodes(canvasNodes.value);
  }

  function applyDimensionAggregation(fieldName: string, aggregation: "sum" | "avg") {
    const node = axisBindingNode.value ?? selectedNodes.value[0];
    if (!node?.chartSpec) return false;
    const targets = dimensionDecisionTargets(node);
    const updates = targets.flatMap((member) => {
      if (!member.chartSpec) return [];
      const contract = getChartTemplateContract(member.chartSpec.chartType);
      const measureChannels = (contract?.channels ?? [])
        .filter((mapping) => mapping.role === "measure")
        .map((mapping) => mapping.channel)
        .filter((channel) => member.chartSpec?.encodings[channel]?.type === "quantitative");
      return measureChannels.length > 0 ? [{ member, measureChannels }] : [];
    });
    if (updates.length === 0) return false;
    pushCanvasHistory();
    updates.forEach(({ member, measureChannels }) => {
      if (!member.chartSpec) return;
      member.llmRenderer = null;
      member.chartSpec = {
        ...member.chartSpec,
        aggregations: {
          ...member.chartSpec.aggregations,
          ...Object.fromEntries(measureChannels.map((channel) => [channel, aggregation])),
        },
        dimensionAggregations: {
          ...member.chartSpec.dimensionAggregations,
          [fieldName]: aggregation,
        },
        dimensionDecisions: {
          ...member.chartSpec.dimensionDecisions,
          [fieldName]: "aggregate",
        },
        dimensionRecommendations: undefined,
        renderer: undefined,
      };
      renderChartNode(member);
      registerChartRelationship(member);
    });
    setImportNotice(`${fieldName} reduced with ${aggregation.toUpperCase()}.`);
    return true;
  }

  function applyDimensionChartUpgrade(fieldName: string, requestedChartType?: string) {
    const node = axisBindingNode.value ?? selectedNodes.value[0];
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const column = dataset?.columns.find((item) => item.name === fieldName);
    if (!node?.chartSpec || !column) return false;
    const targets = dimensionDecisionTargets(node);
    const supported = targets.flatMap((member) => {
      const options = getDimensionChartUpgradeOptions(member.chartSpec?.chartType ?? "");
      const target = requestedChartType
        ? options.find((option) => option.chartType === requestedChartType)
        : options[0];
      return target ? [{ member, targetChartType: target.chartType }] : [];
    });
    if (supported.length === 0) return false;
    pushCanvasHistory();
    supported.forEach(({ member, targetChartType }) => {
      if (!member.chartSpec) return;
      const template = normalizeChartTemplate(member.chartSpec.chartType);
      member.llmRenderer = null;
      if (template === "line" || template === "area") {
        const seriesEncoding = { field: column.name, type: column.type };
        const valueFilters = { ...member.chartSpec.valueFilters };
        delete valueFilters[column.name];
        member.chartSpec = {
          ...member.chartSpec,
          chartType: targetChartType,
          templateId: template,
          encodings: template === "line"
            ? lineDataEncodings(member.chartSpec.encodings)
            : { ...member.chartSpec.encodings, color: seriesEncoding },
          series: seriesEncoding,
          seriesFields: [seriesEncoding],
          valueFields: undefined,
          valueFilters: Object.keys(valueFilters).length > 0 ? valueFilters : undefined,
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "series" },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
      } else if (template === "bar") {
        const valueFilters = { ...member.chartSpec.valueFilters };
        delete valueFilters[column.name];
        const encodings = { ...member.chartSpec.encodings };
        delete encodings.color;
        const seriesEncoding = { field: column.name, type: column.type };
        member.chartSpec = {
          ...member.chartSpec,
          chartType: targetChartType,
          encodings,
          series: seriesEncoding,
          seriesFields: [seriesEncoding],
          valueFields: undefined,
          valueFilters: Object.keys(valueFilters).length > 0 ? valueFilters : undefined,
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "series" },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
      }
      renderChartNode(member);
      registerChartRelationship(member);
    });
    setImportNotice(`${fieldName} added as another chart dimension.`);
    return true;
  }

  function applyDimensionRecommendation(
    recommendationId: string,
    facetDirection: "row" | "column" = "column",
    recommendationOverride?: DimensionRecommendation,
  ) {
    const node = axisBindingNode.value ?? selectedNodes.value[0];
    const recommendation = recommendationOverride
      ?? node?.chartSpec?.dimensionRecommendations?.find((item) => item.id === recommendationId);
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const column = dataset?.columns.find((item) => item.name === recommendation?.field);
    if (!node?.chartSpec || !recommendation || !dataset) return false;
    if (recommendation.strategy === "flatten" && normalizeChartTemplate(node.chartSpec.chartType) === "pie") {
      const flattenFields = (recommendation.flattenFields ?? [recommendation.field])
        .filter((field) => dataset.columns.some((item) => item.name === field));
      if (flattenFields.length === 0) return false;
      pushCanvasHistory();
      [node].forEach((member) => {
        if (!member.chartSpec) return;
        const nextFlattenFields = Array.from(new Set([
          ...(member.chartSpec.flattenFields ?? []),
          ...flattenFields,
        ]));
        member.chartSpec = {
          ...member.chartSpec,
          flattenFields: nextFlattenFields,
          dimensionDecisions: {
            ...member.chartSpec.dimensionDecisions,
            ...Object.fromEntries(flattenFields.map((field) => [field, "flatten" as const])),
          },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
        renderSharedCoordinateComposition(member);
      });
      setImportNotice(`Flatten by [${flattenFields.join(", ")}] applied.`);
      return true;
    }
    if (recommendation.strategy === "series" || recommendation.strategy === "flatten") {
      if (!column) return false;
      pushCanvasHistory();
      const valueFilters = { ...node.chartSpec.valueFilters };
      delete valueFilters[column.name];
      node.chartSpec = {
        ...node.chartSpec,
        chartType: normalizeChartTemplate(node.chartSpec.chartType) === "line"
          ? "MultiLineChart"
          : node.chartSpec.chartType,
        templateId: normalizeChartTemplate(node.chartSpec.chartType) === "line"
          ? "line"
          : node.chartSpec.templateId,
        encodings: normalizeChartTemplate(node.chartSpec.chartType) === "line"
          ? lineDataEncodings(node.chartSpec.encodings)
          : node.chartSpec.encodings,
        series: { field: column.name, type: column.type },
        seriesFields: [{ field: column.name, type: column.type }],
        valueFields: undefined,
        valueFilters: Object.keys(valueFilters).length > 0 ? valueFilters : undefined,
        dimensionDecisions: {
          ...node.chartSpec.dimensionDecisions,
          [column.name]: recommendation.strategy,
        },
      };
      renderChartNode(node);
      registerChartRelationship(node);
      setImportNotice(`${recommendation.valueCount} ${column.name} lines are shown in one view.`);
      return true;
    }
    if (recommendation.strategy === "facet" && node.compositionSpec?.type === "facet") {
      if (node.compositionSpec.facetGrid) return false;
      const occupiedDirection = node.compositionSpec.facetDirection ?? "column";
      if (node.compositionSpec.facetField && occupiedDirection === facetDirection) return false;
    }
    const facetMembers = recommendation.strategy === "facet"
      ? dimensionDecisionTargets(node)
      : [node];
    if (recommendation.strategy === "facet") pushCanvasHistory();
    facetMembers.forEach((member) => {
      if (!member.chartSpec) return;
      member.chartSpec = {
        ...member.chartSpec,
        dimensionDecisions: {
          ...member.chartSpec.dimensionDecisions,
          [recommendation.field]: "facet",
        },
      };
    });
    let appliedRecommendation = recommendation.strategy === "facet"
      ? { ...recommendation, facetDirection }
      : recommendation;
    if (recommendation.strategy === "facet"
      && node.compositionSpec?.type === "facet"
      && node.compositionSpec.facetField
      && node.compositionSpec.facetField !== recommendation.field) {
      const addedValues = Array.from(new Set(dataset.rows
        .map((row) => row[recommendation.field] ?? "")
        .filter(Boolean)));
      const existingDirection = node.compositionSpec.facetDirection ?? "column";
      const existingField = node.compositionSpec.facetField;
      const existingValues = [...(node.compositionSpec.facetValues ?? [])];
      appliedRecommendation = {
        ...recommendation,
        facetGrid: {
          rowField: facetDirection === "row" ? recommendation.field : existingField,
          columnField: facetDirection === "column" ? recommendation.field : existingField,
          rowValues: facetDirection === "row" ? addedValues : existingValues,
          columnValues: facetDirection === "column" ? addedValues : existingValues,
        },
      };
      if (existingDirection === facetDirection) return false;
      setSelection(facetMembers.map((member) => member.id));
    }
    if (recommendation.strategy === "facet") {
      facetMembers.forEach((member) => {
        if (!member.chartSpec) return;
        const remainingTransforms = member.chartSpec.dataTransforms?.filter((transform) =>
          !(isFacetClueTransform(transform) && transform.field === recommendation.field));
        member.chartSpec = {
          ...member.chartSpec,
          dataTransforms: remainingTransforms?.length ? remainingTransforms : undefined,
          scales: undefined,
          plotArea: undefined,
          polarArea: undefined,
          renderer: undefined,
        };
      });
    }
    node.chartSpec.dimensionRecommendations = [
      appliedRecommendation,
      ...(node.chartSpec.dimensionRecommendations ?? []).filter((item) => item.id !== recommendation.id),
    ];
    if (selectedIds.value.length <= 1) setSelection([node.id]);
    const created = createStructuralComposition(
      recommendation.strategy,
      recommendation.strategy !== "facet",
    );
    setImportNotice(created
      ? appliedRecommendation.facetGrid
        ? `${appliedRecommendation.facetGrid.rowValues.length} × ${appliedRecommendation.facetGrid.columnValues.length} facet grid created.`
        : `${recommendation.strategy === "facet" ? "Facet" : "Nested"} created from ${column?.name ?? recommendation.field}.`
      : "The selected recommendation cannot be applied in the current editing scope.");
    return created;
  }

  function applyDimensionFacet(fieldName: string, direction: "row" | "column") {
    const node = axisBindingNode.value ?? selectedNodes.value[0];
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    if (!node?.chartSpec || !dataset) return false;
    if (node.compositionSpec?.type === "facet") {
      if (node.compositionSpec.facetGrid) return false;
      const occupiedDirection = node.compositionSpec.facetDirection ?? "column";
      if (node.compositionSpec.facetField && occupiedDirection === direction) return false;
    }
    const values = Array.from(new Set(dataset.rows
      .map((row) => row[fieldName] ?? "")
      .filter(Boolean)));
    if (values.length === 0) return false;
    const recommendationId = `${node.id}:${fieldName}:facet`;
    const recommendation = node.chartSpec.dimensionRecommendations?.find((item) =>
      item.strategy === "facet" && item.field === fieldName,
    ) ?? {
      id: recommendationId,
      strategy: "facet" as const,
      field: fieldName,
      valueCount: values.length,
      estimatedMarkCount: values.length,
      sharedChannels: [],
      label: `Facet by ${fieldName}`,
    };
    return applyDimensionRecommendation(recommendation.id, direction, recommendation);
  }

  function isFacetClueTransform(transform: ChartDataTransform): transform is Extract<ChartDataTransform, { kind: "filter"; mode: "values" }> {
    return transform.kind === "filter"
      && transform.mode === "values"
      && (transform.purpose === "facet-clue"
        || transform.purpose === "nested-context"
        || (transform.purpose === undefined && transform.single));
  }

  function facetClueTransforms(spec: ChartSpec | undefined) {
    return (spec?.dataTransforms ?? []).filter(isFacetClueTransform);
  }

  function nestClueTransforms(spec: ChartSpec | undefined) {
    return (spec?.dataTransforms ?? []).filter((transform): transform is Extract<ChartDataTransform, { kind: "filter"; mode: "values" }> =>
      transform.kind === "filter"
        && transform.mode === "values"
        && transform.purpose === "nest-clue");
  }

  // Batch nested drops can create many child relationships. Keep the lookup
  // indexed by child chart so each render does not rescan every relationship.
  const nestedFilterContextsByChildChartId = computed(() => {
    const contextsByChild = new Map<string, InheritedFilterContext[]>();
    Object.values(chartRelationships.value.nestedRelationships).forEach((relationship) => {
      if (relationship.status !== "active" || !relationship.inheritedFilterContexts?.length) return;
      const contexts = contextsByChild.get(relationship.childChartId) ?? [];
      contexts.push(...relationship.inheritedFilterContexts);
      contextsByChild.set(relationship.childChartId, contexts);
    });
    return contextsByChild;
  });

  function transformsWithNestedContext(node: CanvasNode, transforms: ChartDataTransform[] | undefined) {
    const contexts = nestedFilterContextsByChildChartId.value.get(node.id) ?? [];
    if (contexts.length === 0) return transforms;
    const sourceTransforms = transforms ?? [];
    const consumedFields = new Set<string>();
    const resolved = sourceTransforms.map((transform) => {
      if (transform.kind !== "filter" || transform.mode !== "values" || transform.purpose !== "nest-clue") {
        return transform;
      }
      const context = contexts.find((candidate) => candidate.childField === transform.field);
      if (!context) return transform;
      consumedFields.add(context.childField);
      if (context.filterMode === "numeric") {
        return transform;
      }
      return { ...transform, values: [String(context.value)] };
    });
    const generated = contexts
      .filter((context) => !consumedFields.has(context.childField))
      .map((context): ChartDataTransform => context.filterMode === "numeric"
        ? {
          id: `nested-filter:${context.parentChartId}:${context.childField}`,
          kind: "filter",
          mode: "numeric",
          field: context.childField,
          operator: "eq",
          value: Number(context.value),
        }
        : {
          id: `nested-filter:${context.parentChartId}:${context.childField}`,
          kind: "filter",
          mode: "values",
          field: context.childField,
          values: [String(context.value)],
          single: true,
          purpose: "nested-context",
        });
    return [...resolved, ...generated];
  }

  function resolveNestedFilterContexts(
    parent: CanvasNode,
    child: CanvasNode,
    parentDataKey: string,
    rowKey?: string,
    materializedParentOverride?: Dataset,
    materializedParentRowOverride?: Record<string, string>,
  ) {
    const parentSpec = parent.chartSpec;
    const childSpec = child.chartSpec;
    const parentDataset = parentSpec ? getDataset(parentSpec.datasetId) : null;
    const childDataset = childSpec ? getDataset(childSpec.datasetId) : null;
    if (!parentSpec || !childSpec || !parentDataset || !childDataset || parentDataset.id !== childDataset.id) {
      return { contexts: [] as InheritedFilterContext[], unresolvedFields: ["dataset"] };
    }
    const parentXField = parentSpec.encodings.x?.field ?? parentSpec.encodings.column?.field;
    const parentYField = parentSpec.encodings.y?.field ?? parentSpec.encodings.row?.field;
    const parentStructuralFields = getNestedParentContextFields(parentSpec);
    const hierarchyKeyField = normalizeChartTemplate(parentSpec.chartType) === "hierarchy"
      ? parentSpec.encodings.key?.field
      : undefined;
    const parentDimensionFields = chartRoleFields(parentSpec, new Set<NestedContextRole>(["dimension"]));
    const parentSeriesFields = chartRoleFields(parentSpec, new Set<NestedContextRole>(["series"]));
    const clues = nestClueTransforms(child.chartSpec);
    const fieldsToResolve = clues.length > 0
      ? clues.map((clue) => clue.field)
      : hierarchyKeyField
        ? [hierarchyKeyField]
        : parentStructuralFields;
    let identity: {
      rowKey?: string;
      categoryKey?: string;
      seriesKey?: string;
      rowValue?: string;
      columnValue?: string;
    } = {};
    try {
      identity = JSON.parse(parentDataKey) as typeof identity;
    } catch {
      identity = { rowKey: parentDataKey };
    }
    const resolvedRowKey = rowKey ?? identity.rowKey;
    const materializedParent = materializedParentOverride
      ?? prepareChartData(parent.id, parentDataset, parentSpec).dataset;
    const parentRow = materializedParentRowOverride
      ?? (resolvedRowKey === undefined
        ? undefined
        : materializedParent.rows.find((row, index) => csvRowKey(materializedParent, row, index) === resolvedRowKey));
    const contexts: InheritedFilterContext[] = [];
    const unresolvedFields: string[] = [];
    const markValuesByField = new Map<string, string>();
    if (parentXField && identity.columnValue !== undefined) {
      markValuesByField.set(parentXField, identity.columnValue);
    }
    if (parentYField && identity.rowValue !== undefined) {
      markValuesByField.set(parentYField, identity.rowValue);
    }
    if (parentDimensionFields.length === 1 && identity.categoryKey !== undefined) {
      markValuesByField.set(parentDimensionFields[0]!, identity.categoryKey);
    }
    if (parentSeriesFields.length === 1 && identity.seriesKey !== undefined) {
      markValuesByField.set(parentSeriesFields[0]!, identity.seriesKey);
    }
    fieldsToResolve.forEach((field) => {
      const parentColumn = materializedParent.columns.find((column) => column.name === field);
      const childColumn = childDataset.columns.find((column) => column.name === field);
      const value = (parentRow?.[field] ?? markValuesByField.get(field) ?? "").trim();
      if (!canResolveNestedParentField(parentSpec, field, parentRow)
        || !parentColumn
        || !childColumn
        || !isDataColumnTypeCompatible([childColumn.type], parentColumn.type)
        || !value) {
        unresolvedFields.push(field);
        return;
      }
      const numeric = parentColumn.type === "quantitative";
      if (numeric && !Number.isFinite(Number(value))) {
        unresolvedFields.push(field);
        return;
      }
      contexts.push({
        parentChartId: parent.id,
        parentDataKey,
        parentField: field,
        childField: field,
        value: numeric ? Number(value) : value,
        filterMode: numeric ? "numeric" : "values",
        source: "parent-row",
      });
    });
    return { contexts, unresolvedFields };
  }

  /** Keep a clue available on the composition owner when all members supplied it. */
  function retainSharedFacetClues(owner: CanvasNode, members: CanvasNode[]) {
    if (!owner.chartSpec || members.length < 2) return;
    const ownerTransforms = owner.chartSpec.dataTransforms ?? [];
    const ownerClues = facetClueTransforms(owner.chartSpec);
    if (ownerClues.length === 0) return;
    const sharedFields = new Set(ownerClues
      .filter((clue) => members.every((member) => facetClueTransforms(member.chartSpec).some((candidate) => candidate.field === clue.field)))
      .map((clue) => clue.field));
    if (sharedFields.size === 0) return;
    const retained = ownerTransforms.map((transform) => ({ ...transform }));
    owner.chartSpec = {
      ...owner.chartSpec,
      dataTransforms: retained.length ? retained : undefined,
      renderer: undefined,
      scales: undefined,
      plotArea: undefined,
      polarArea: undefined,
    };
  }

  /** Nested charts inherit parent clues without replacing their own transforms. */
  function inheritParentFacetClues(parent: CanvasNode, child: CanvasNode) {
    if (!parent.chartSpec || !child.chartSpec) return;
    const parentClues = facetClueTransforms(parent.chartSpec);
    if (parentClues.length === 0) return;
    const childTransforms = child.chartSpec.dataTransforms ?? [];
    const childFields = new Set([
      ...facetClueTransforms(child.chartSpec),
      ...nestClueTransforms(child.chartSpec),
    ].map((clue) => clue.field));
    const inherited = parentClues
      .filter((clue) => !childFields.has(clue.field))
      .map((clue) => ({ ...clue, purpose: "nested-context" as const }));
    if (inherited.length === 0) return;
    child.chartSpec = {
      ...child.chartSpec,
      dataTransforms: [...childTransforms, ...inherited],
      renderer: undefined,
      scales: undefined,
      plotArea: undefined,
      polarArea: undefined,
    };
  }

  function createFacetFromFields(
    nodeId: string,
    fields: {
      coordinateSystem?: "Cartesian" | "Polar";
      rowField?: string;
      columnField?: string;
      thetaField?: string;
      radiusField?: string;
    },
  ) {
    const node = findCanvasNode(nodeId);
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    if (!node?.chartSpec || !dataset || !isAtomicChartReady(node)) return false;
    const facetCoordinateSystem = fields.coordinateSystem ?? "Cartesian";
    const rowField = (facetCoordinateSystem === "Polar" ? fields.radiusField : fields.rowField) || undefined;
    const columnField = (facetCoordinateSystem === "Polar" ? fields.thetaField : fields.columnField) || undefined;
    if ((!rowField && !columnField) || (rowField && rowField === columnField)) return false;
    const available = new Map(dataset.columns.map((column) => [column.name, column]));
    const facetFields = [rowField, columnField].filter((field): field is string => !!field);
    if (facetFields.some((field) => {
      const type = available.get(field)?.type;
      return type !== "nominal" && type !== "ordinal" && type !== "temporal";
    })) return false;
    const valuesFor = (field: string) => Array.from(new Set(dataset.rows
      .map((row) => row[field] ?? "")
      .filter(Boolean)));
    const rowValues = rowField ? valuesFor(rowField) : [];
    const columnValues = columnField ? valuesFor(columnField) : [];
    if ((rowField && rowValues.length === 0) || (columnField && columnValues.length === 0)) return false;

    const primaryField = columnField ?? rowField!;
    const recommendation: DimensionRecommendation = {
      id: `${node.id}:${facetFields.join(":")}:facet-clue`,
      strategy: "facet",
      field: primaryField,
      valueCount: rowField && columnField
        ? rowValues.length * columnValues.length
        : (columnValues.length || rowValues.length),
      estimatedMarkCount: rowField && columnField
        ? rowValues.length * columnValues.length
        : (columnValues.length || rowValues.length),
      sharedChannels: [],
      label: rowField && columnField
        ? `Facet by ${rowField} and ${columnField}`
        : `Facet by ${primaryField}`,
      facetDirection: rowField && !columnField ? "row" : "column",
      facetCoordinateSystem,
      facetThetaField: facetCoordinateSystem === "Polar" ? columnField : undefined,
      facetRadiusField: facetCoordinateSystem === "Polar" ? rowField : undefined,
      facetGrid: rowField && columnField
        ? { rowField, columnField, rowValues, columnValues }
        : undefined,
    };
    const existingFacetFields = new Set([
      node.compositionSpec?.facetField,
      node.compositionSpec?.facetGrid?.rowField,
      node.compositionSpec?.facetGrid?.columnField,
    ].filter((field): field is string => !!field));
    const clueFields = new Set(node.compositionSpec?.type === "facet"
      ? facetFields.filter((field) => !existingFacetFields.has(field))
      : facetFields);
    const withoutConsumedClues = (transforms: ChartDataTransform[] | undefined) => transforms?.filter((transform) =>
      !(transform.kind === "filter"
        && transform.mode === "values"
        && (transform.purpose === "facet-clue"
          || transform.purpose === "nested-context"
          || (transform.purpose === undefined && transform.single))
        && clueFields.has(transform.field)));
    const transformTargets = node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat"
      ? node.compositionSpec.members
        .map((member) => findCanvasNode(member.nodeId))
        .filter((member): member is CanvasNode => !!member?.chartSpec)
      : [node];

    pushCanvasHistory();
    transformTargets.forEach((target) => {
      if (!target.chartSpec) return;
      const targetTransforms = withoutConsumedClues(target.chartSpec.dataTransforms);
      target.chartSpec = {
        ...target.chartSpec,
        dataTransforms: targetTransforms?.length ? targetTransforms : undefined,
        dimensionRecommendations: target.id === node.id
          ? [
            recommendation,
            ...(target.chartSpec.dimensionRecommendations ?? []).filter((item) => item.strategy !== "facet"),
          ]
          : target.chartSpec.dimensionRecommendations,
        scales: undefined,
        plotArea: undefined,
        polarArea: undefined,
        renderer: undefined,
      };
    });
    if (node.layerSpec) {
      node.layerSpec = {
        ...node.layerSpec,
        children: node.layerSpec.children.map((child) => {
          const childTransforms = withoutConsumedClues(child.chartSpec.dataTransforms);
          return {
            ...child,
            chartSpec: {
              ...child.chartSpec,
              dataTransforms: childTransforms?.length ? childTransforms : undefined,
            },
          };
        }),
      };
    }
    const created = createStructuralComposition("facet", false);
    setImportNotice(created
      ? rowField && columnField
        ? `${rowValues.length} × ${columnValues.length} facet grid created.`
        : `${primaryField} facet created.`
      : "The selected facet fields cannot be applied to this chart.");
    return created;
  }

  function closeDimensionDropDecision() {
    dimensionDropTarget.value = null;
  }

  function applyInputColumnIntent(intentId: string, selectedFilterValue?: string) {
    const target = dimensionDropTarget.value;
    const node = target ? findCanvasNode(target.nodeId) : null;
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const column = dataset?.columns.find((candidate) => candidate.name === target?.fieldName);
    if (!target || !node?.chartSpec || !dataset || !column) return false;
    const analysis = inferColumnIntents(dataset, node.chartSpec, column, { type: "chart-body" });
    const intent = analysis.intents.find((candidate) => candidate.id === intentId);
    if (!intent) {
      dimensionDropTarget.value = { ...target, analysis };
      setImportNotice("That column intent is no longer valid for the current chart.");
      return false;
    }
    const applied = intent.kind === "aggregate" && intent.aggregation
      ? applyDimensionAggregation(target.fieldName, intent.aggregation)
      : intent.kind === "facet" && intent.facetDirection
        ? applyDimensionFacet(target.fieldName, intent.facetDirection)
        : intent.kind === "upgrade" && intent.targetChartType
          ? applyDimensionChartUpgrade(target.fieldName, intent.targetChartType)
          : intent.kind === "series"
            ? setSeriesFields([target.fieldName])
          : intent.kind === "filter"
            ? (() => {
              const filterValue = selectedFilterValue ?? intent.filterValues?.[0];
              const currentSpec = node.chartSpec;
              if (!filterValue || !currentSpec) return false;
              pushCanvasHistory();
              const filterTransform: ChartDataTransform = {
                id: `intent-filter:${node.id}:${target.fieldName}`,
                kind: "filter",
                mode: "values",
                field: target.fieldName,
                values: [filterValue],
                single: false,
                purpose: "filter",
              };
              const transforms = [
                ...(currentSpec.dataTransforms ?? []).filter((transform) =>
                  !(transform.kind === "filter" && transform.mode === "values" && transform.field === target.fieldName)),
                filterTransform,
              ];
              node.chartSpec = {
                ...currentSpec,
                dataTransforms: transforms,
                dimensionDecisions: {
                  ...currentSpec.dimensionDecisions,
                  [target.fieldName]: "filter",
                },
                dimensionRecommendations: undefined,
                scales: undefined,
                plotArea: undefined,
                polarArea: undefined,
                renderer: undefined,
              };
              renderChartNode(node);
              registerChartRelationship(node);
              setImportNotice(`${target.fieldName} filtered to ${filterValue}.`);
              return true;
            })()
          : false;
    if (applied) closeDimensionDropDecision();
    return applied;
  }

  const compositionOperations = useCanvasCompositionOperations({
    activeDropZone, activeNestedRelationshipId, axisBindingTarget, beginCompositionEditing,
    canvasRef,
    chartDrilldown, chartScalePosition,
    chartRelationships, clamp, cloneCanvasNodeForPaste,
    collectNodeSelectionBounds, compositionCoordinateTargets, compositionDragSourceId,
    concatEdgeNodesAreCompatible, concatGraphMembers, concatLinkId, concatLinksFor,
    concatMemberChannelsForLinks, concatMemberSharedChannels, concatNodesAreCompatible,
    coordinateTargets, createPolarCoordinateSystemModel, currentDropZoneScopeNodes,
    csvRowKey, defaultRelativeParameters, dispatchRelationship, editingCompositionId,
    findCanvasNode, firstChartNode, getCanvasNodeListBounds, getChartTemplateContract,
    getDataset, getPolarOccupiedGeometry, getGroupAtPath, getNodeSelectionBounds, getSelectionNode,
    getSelectionScopeNodes, getSelectionScopeBounds, getRootNode, inferColumnIntents,
    inheritParentFacetClues, mergeBounds, nestClueTransforms, nestedItemDataKey,
    implementedTemplateDefinitions,
    nestedBindingTarget, nestedDropPath, nestedPositionRelationshipIds,
    nodeLocalToSelectionScopePoint, normalizeChartTemplate, pointInBounds,
    pointToSegmentDistance, polarPointAtAngle, prepareChartData, pushCanvasHistory,
    reconcileCoordinateSystems, registerChartRelationship, renderChartNode, renderSemanticNode,
    renderSharedCoordinateComposition, replaceSelectionScopeNodes,
    resolveNestedRelationship, resolveNestedFilterContexts, resolveSemanticMarkMatch,
    restoreRelationships, retainSharedFacetClues, retireMergedCompositions,
    repeatableCompositionMembers, repeatableCompositionNodes, repeatableCompositionPairNodes,
    rowMatchesChartFilters, sameChannels, scheduleNestedChildLayout,
    selectedIds, selectedNodes, semanticSelection, semanticMarkElements, semanticSelectionBounds,
    selectionBounds,
    setImportNotice, setSelection, standaloneCoordinateSystem, sharedChannelEncodingsAreCompatible,
    snapshotRelationships, toNodeLocalPoint,
    toSelectionScopePoint, transformPoint, walkCanvasNodes, existingFlatCompositions,
    existingRepeatableCompositions, compatibleLayerChannels, isAtomicChartReady,
    isCartesianCompositionChart, isPolarCompositionChart, viewZoom,
  });
  const {
    createLayer, createStructuralComposition, executeComposition,
    beginNestedRelationshipDraft, ensureCommittedNestedRelationship, createNestedPie,
    nestedPieValueFields, applyNestedPiesToNode, closeNestedBinding, confirmNestedBinding,
    openNestedPositionEditor, updateNestedPosition, updateNestedChildScale, resetNestedPosition,
    closeNestedPositionEditor, scatterPointDropZone, nestedTargetWouldCreateCycle,
    semanticItemDropZone, enterNestedDropLevel, enterCompositionDropLevel,
    localRectDropGeometry, polarSectorGeometry, polarCompositionDropZoneAtPoint,
    compositionDropZoneAtPoint, nestedCompositionFromBlock, appendConcatLink,
    commitCompositionDrop,
  } = compositionOperations;

  function reverseCoordinateAxis(target: CanvasNode, axis: "x" | "y") {
    const node = findCanvasNode(target.id);
    if (node?.coordinateGuide?.type !== "Cartesian") return;
    pushCanvasHistory();
    const nestedTargets = nestedBatchEncodingTargets(node);
    const targets = nestedTargets.length > 1 ? nestedTargets : coordinateTargets(node.id, axis);
    const currentDirection = axis === "x" ? node.coordinateGuide.xDirection : node.coordinateGuide.yDirection;
    const nextDirection: 1 | -1 = currentDirection === 1 ? -1 : 1;
    const axisIds = new Set<string>();
    targets.forEach((member) => {
      const binding = bindingForChartChannel(member.id, axis);
      if (binding) axisIds.add(binding.axisId);
    });
    axisIds.forEach((axisId) => {
      const relationshipAxis = chartRelationships.value.axes[axisId];
      if (!relationshipAxis) return;
      dispatchRelationship({
        type: "update-axis",
        axisId,
        changes: { config: { direction: nextDirection } },
      });
    });
    targets.forEach((member) => {
      if (member.coordinateGuide?.type !== "Cartesian") return;
      member.llmRenderer = null;
      if (axis === "x") member.coordinateGuide.xDirection = nextDirection;
      else member.coordinateGuide.yDirection = nextDirection;
    });
    renderCoordinateTargets(node, targets);
  }
  function onCoordinateAxisSelect(target: CanvasNode, channel: CoordinateChannel) {
    const node = findCanvasNode(target.id);
    if (!node?.coordinateGuide) return;
    if (node.coordinateGuide.type === "Cartesian" && channel !== "x" && channel !== "y") return;
    if (node.coordinateGuide.type === "Polar" && channel !== "angle" && channel !== "radius" && channel !== "ring") return;
    if (node.compositionSpec?.type === "layer" && node.coordinateSystem?.sharedChannels.includes(channel)) return;
    axisBindingTarget.value = { nodeId: node.id, channel };
    const binding = bindingForChartChannel(node.id, channel);
    dispatchRelationship({
      type: "select-entity",
      selection: binding ? { type: "axis", id: binding.axisId } : { type: "chart", id: node.id },
    });
    contextMenu.value = null;
  }
  function setAxisBindingChannel(channel: EncodingChannel) {
    const target = axisBindingTarget.value;
    if (!target) return;
    axisBindingTarget.value = { ...target, channel };
  }
  function setAxisSwap(swapped: boolean, nodeId?: string) {
    const node = nodeId ? findCanvasNode(nodeId) : axisBindingNode.value;
    if (!node?.chartSpec || node.coordinateGuide?.type !== "Cartesian") return;
    updateEncodingTargets(node, (_target, spec) => ({
      ...spec,
      axisSwapped: swapped || undefined,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    }));
  }
  function setChartAxisAppearance(
    axis: ChartAxisChannel,
    patch: Pick<ChartAxisConfig, "visible" | "labelsVisible">,
  ) {
    const node = axisBindingNode.value;
    if (!node?.chartSpec) return;
    const targets = encodingTargets(node);
    pushCanvasHistory();
    targets.forEach((target) => {
      if (!target.chartSpec) return;
      target.chartSpec = {
        ...target.chartSpec,
        axes: {
          ...target.chartSpec.axes,
          [axis]: { ...target.chartSpec.axes?.[axis], ...patch },
        },
      };
      renderChartNode(target);
      registerChartRelationship(target);
    });
  }
  function closeAxisBinding() {
    axisBindingTarget.value = null;
  }
  function bindMarkField(fieldName: string, aggregation?: "sum" | "avg", inputDatasetId?: string) {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    const dataset = inputDatasetId ? getDataset(inputDatasetId) : axisBindingDataset.value;
    if (!target || !node || !dataset) return;
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return;
    const mappedChannel = mappedEncodingChannel(node, target.channel);
    if (mappedChannel === "y" && (node.chartSpec?.valueFields?.length ?? 0) > 0) {
      setImportNotice("Y is derived from quantitative Series Items and cannot be bound separately.");
      return;
    }
    const inputSpec = node.chartSpec
      ? replaceDefaultDataBinding(node.chartSpec, dataset.id)
      : undefined;
    const encodings = { ...inputSpec?.encodings, [mappedChannel]: { field: column.name, type: column.type } };
    const clearsSeries = inputSpec?.series?.field === column.name
      || inputSpec?.seriesFields?.some((encoding) => encoding.field === column.name);
    const tentativeSpec: ChartSpec = {
      ...inputSpec,
      chartType: inputSpec?.chartType ?? (node.kind === "leaf" ? getCandidate(node.candidateId)?.chartType : undefined) ?? node.name,
      datasetId: dataset.id,
      encodings,
      series: clearsSeries ? undefined : inputSpec?.series,
      seriesFields: clearsSeries ? undefined : inputSpec?.seriesFields,
      valueFields: mappedChannel === "y" ? undefined : inputSpec?.valueFields,
    };
    const conflict = resolveChartEncodingIssues(tentativeSpec)
      .find((issue) => issue.code === "duplicate-data-field" && issue.fields.includes(column.name));
    if (conflict) {
      setImportNotice(conflict.message);
      return;
    }
    updateEncodingTargets(node, (member, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      const memberChannel = mappedEncodingChannel(member, target.channel);
      const memberEncodings = { ...spec.encodings, [memberChannel]: { field: column.name, type: column.type } };
      const memberClearsSeries = spec.series?.field === column.name
        || spec.seriesFields?.some((encoding) => encoding.field === column.name);
      const aggregations = { ...spec.aggregations };
      if (aggregation && column.type === "quantitative") aggregations[memberChannel] = aggregation;
      else delete aggregations[memberChannel];
      return {
        ...spec,
        encodings: memberEncodings,
        series: memberClearsSeries ? undefined : spec.series,
        seriesFields: memberClearsSeries ? undefined : spec.seriesFields,
        valueFields: memberChannel === "y" ? undefined : spec.valueFields,
        aggregations: Object.keys(aggregations).length ? aggregations : undefined,
        dataTransforms: memberChannel === "x" || memberChannel === "y"
          ? spec.dataTransforms?.filter((transform) => transform.id !== singleBarValueOrderTransformId)
          : spec.dataTransforms,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
    });
  }
  function clearMarkField() {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    if (!target || !node?.chartSpec) return;
    if (!encodingTargets(node).some((member) => member.chartSpec?.encodings[target.channel]
      || member.chartSpec?.encodings[mappedEncodingChannel(member, target.channel)])) return;
    updateEncodingTargets(node, (member, spec) => {
      const memberChannel = mappedEncodingChannel(member, target.channel);
      const encodings = { ...spec.encodings };
      const aggregations = { ...spec.aggregations };
      delete encodings[target.channel];
      delete encodings[memberChannel];
      delete aggregations[target.channel];
      delete aggregations[memberChannel];
      member.renderedContent = null;
      return {
        ...spec,
        encodings,
        aggregations: Object.keys(aggregations).length ? aggregations : undefined,
        dataTransforms: memberChannel === "x" || memberChannel === "y"
          ? spec.dataTransforms?.filter((transform) => transform.id !== singleBarValueOrderTransformId)
          : spec.dataTransforms,
        valueFields: memberChannel === "y" ? undefined : spec.valueFields,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
    });
  }
  function setAxisBindingAggregation(channel: ChartEncodingChannel, aggregation?: "sum" | "avg") {
    const node = axisBindingNode.value;
    const mappedChannel = node && (channel === "x" || channel === "y")
      ? mappedEncodingChannel(node, channel)
      : channel;
    if (!node?.chartSpec || node.chartSpec.encodings[mappedChannel]?.type !== "quantitative") return;
    updateEncodingTargets(node, (member, spec) => {
      const memberChannel = (channel === "x" || channel === "y")
        ? mappedEncodingChannel(member, channel)
        : channel;
      const aggregations = { ...spec.aggregations };
      const autoAggregations = { ...spec.autoAggregations };
      if (aggregation) aggregations[memberChannel] = aggregation;
      else delete aggregations[memberChannel];
      delete autoAggregations[memberChannel];
      const dataTransforms = memberChannel === "y"
        ? spec.dataTransforms?.map((transform) => transform.id === singleBarValueOrderTransformId && transform.kind === "order"
          ? { ...transform, operation: aggregation ?? "sum" }
          : transform)
        : spec.dataTransforms;
      return {
        ...spec,
        aggregations: Object.keys(aggregations).length ? aggregations : undefined,
        autoAggregations: Object.keys(autoAggregations).length ? autoAggregations : undefined,
        dataTransforms,
        renderer: undefined,
      };
    });
  }
  function setSingleBarValueOrder(
    direction: "source" | "ascending" | "descending",
    topN?: number,
  ) {
    const node = axisBindingNode.value;
    if (!node?.chartSpec || normalizeBarChartVariant(node.chartSpec.chartType) !== "single") return;
    const normalizedTopN = Number.isFinite(topN) && topN !== undefined && topN >= 1
      ? Math.floor(topN)
      : undefined;
    updateEncodingTargets(node, (_member, spec) => {
      const groupField = spec.encodings.x?.field;
      const valueField = spec.encodings.y?.field;
      if (!groupField || !valueField || normalizeBarChartVariant(spec.chartType) !== "single") return spec;
      const retainedTransforms = (spec.dataTransforms ?? [])
        .filter((transform) => transform.id !== singleBarValueOrderTransformId);
      const dataTransforms: ChartDataTransform[] = direction === "source" && normalizedTopN === undefined
        ? retainedTransforms
        : [
          ...retainedTransforms,
          {
            id: singleBarValueOrderTransformId,
            kind: "order",
            mode: "group-value",
            groupField,
            valueField,
            operation: spec.aggregations?.y ?? "sum",
            direction,
            limit: normalizedTopN,
          },
        ];
      return {
        ...spec,
        dataTransforms: dataTransforms.length > 0 ? dataTransforms : undefined,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
      };
    });
  }
  function setValueFilters(filters: Record<string, { field: string; values: string[] }>) {
    const node = axisBindingNode.value ?? selectedNodes.value.find((item) => !!item.chartSpec);
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    if (!node?.chartSpec || !dataset) return;
    const next: Record<string, string[]> = {};
    Object.values(filters).forEach(({ field, values }) => {
      const availableCount = new Set(dataset.rows.map((row) => row[field] ?? "").filter(Boolean)).size;
      if (values.length > 0 && values.length < availableCount) next[field] = Array.from(new Set(values));
    });
    pushCanvasHistory();
    node.chartSpec = {
      ...node.chartSpec,
      valueFilters: Object.keys(next).length ? next : undefined,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    };
    renderChartNode(node);
  }
  function setChartDataTransforms(nodeId: string, transforms: ChartDataTransform[]) {
    const node = findCanvasNode(nodeId);
    if (!node?.chartSpec) return false;
    const priorTransforms = node.chartSpec.dataTransforms ?? [];
    const addedGroup = transforms.find((transform) =>
      transform.mode === "group" && !priorTransforms.some((prior) => prior.id === transform.id));
    const removedGroup = priorTransforms.find((transform) =>
      transform.mode === "group" && !transforms.some((next) => next.id === transform.id));
    const replacements = [
      ...(removedGroup?.mode === "group"
        ? [{ from: removedGroup.outputField, to: removedGroup.valueField }]
        : []),
      ...(addedGroup?.mode === "group"
        ? [{ from: addedGroup.valueField, to: addedGroup.outputField }]
        : []),
    ];
    const replaceField = (field: string) =>
      replacements.find((item) => item.from === field)?.to ?? field;
    const replaceEncoding = (encoding: ChartSpec["series"]) => {
      if (!encoding) return encoding;
      const field = replaceField(encoding.field);
      return field === encoding.field ? encoding : { ...encoding, field, type: "quantitative" as const };
    };
    const reboundTransforms = transforms.map((transform): ChartDataTransform => transform.kind === "order"
      ? {
        ...transform,
        groupField: replaceField(transform.groupField),
        valueField: replaceField(transform.valueField),
      }
      : transform);
    const orderedTransforms = [
      ...reboundTransforms.filter((transform) => transform.kind !== "order"),
      ...reboundTransforms.filter((transform) => transform.kind === "order"),
    ];
    const replaceSpecBindings = (spec: ChartSpec): ChartSpec => ({
      ...spec,
      encodings: Object.fromEntries(Object.entries(spec.encodings)
        .map(([channel, encoding]) => [channel, replaceEncoding(encoding)])) as ChartSpec["encodings"],
      valueFields: spec.valueFields?.map((encoding) => replaceEncoding(encoding)!),
      angleFields: spec.angleFields?.map((encoding) => replaceEncoding(encoding)!),
      parallelFields: spec.parallelFields?.map((encoding) => replaceEncoding(encoding)!),
      series: replaceEncoding(spec.series),
      seriesFields: spec.seriesFields?.map((encoding) => replaceEncoding(encoding)!),
    });
    pushCanvasHistory();
    node.llmRenderer = null;
    node.chartSpec = {
      ...replaceSpecBindings(node.chartSpec),
      dataTransforms: orderedTransforms.length > 0 ? orderedTransforms : undefined,
      scales: undefined,
      plotArea: undefined,
      polarArea: undefined,
      renderer: undefined,
    };
    if (node.layerSpec) {
      node.layerSpec = {
        ...node.layerSpec,
        x: replaceEncoding(node.layerSpec.x),
        y: replaceEncoding(node.layerSpec.y),
        children: node.layerSpec.children.map((child) => ({
          ...child,
          chartSpec: {
            ...replaceSpecBindings(child.chartSpec),
            dataTransforms: orderedTransforms.length > 0 ? orderedTransforms : undefined,
          },
        })),
      };
      renderSemanticNode(node);
    } else {
      renderSharedCoordinateComposition(node);
    }
    reconcileRelationshipNodes(canvasNodes.value);
    return true;
  }
  function confirmSeriesField(fieldName: string) {
    setChartSeries(fieldName);
  }
  function setChartSeries(fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    if (!fieldName) return clearSeriesBinding();
    const inputSpec = replaceDefaultDataBinding(node.chartSpec, dataset.id);
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return;
    const occupied = Object.values(inputSpec.encodings).some((encoding) => encoding?.field === fieldName);
    if (occupied) {
      setImportNotice(`${fieldName} is already bound to another channel.`);
      return;
    }
    const encoding = { field: column.name, type: column.type };
    updateEncodingTargets(node, (_target, spec) => ({
      ...replaceDefaultDataBinding(spec, dataset.id),
      encodings: normalizeChartTemplate(spec.chartType) === "line"
        ? lineDataEncodings(spec.encodings)
        : spec.encodings,
      series: encoding,
      seriesFields: [encoding],
      valueFields: undefined,
      dimensionDecisions: { ...spec.dimensionDecisions, [column.name]: "series" },
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    }));
  }
  function setSeriesFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return false;
    const seriesConfig = getEncodingChannelConfigsForSpec(node.chartSpec)
      .find((config) => config.role === "series");
    const selected = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field
        && (item.type === "nominal" || item.type === "ordinal" || item.type === "temporal"));
      return column ? [{ field: column.name, type: column.type }] : [];
    }).filter((_encoding, index) => seriesConfig?.multiple === true || index === 0);
    const inputSpec = replaceDefaultDataBinding(node.chartSpec, dataset.id);
    const occupied = new Set(Object.values(inputSpec.encodings)
      .filter((encoding): encoding is NonNullable<typeof encoding> => !!encoding)
      .map((encoding) => encoding.field));
    const conflicting = selected.find((encoding) => occupied.has(encoding.field)
      && encoding.field !== inputSpec.encodings.color?.field);
    if (conflicting) {
      setImportNotice(`${conflicting.field} is already bound to another channel.`);
      return false;
    }
    updateEncodingTargets(node, (_target, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      const encodings = { ...spec.encodings };
      const template = normalizeChartTemplate(spec.chartType);
      if (template === "bar" || template === "line") delete encodings.color;
      else if (template === "area" || template === "scatter") {
        if (selected[0]) encodings.color = { ...selected[0] };
        else if ((template === "scatter" && (encodings.color?.type === "nominal" || encodings.color?.type === "ordinal" || encodings.color?.type === "temporal"))
          || encodings.color?.field === spec.series?.field
          || spec.seriesFields?.some((encoding) => encoding.field === encodings.color?.field)) {
          delete encodings.color;
        }
      }
      const dimensionDecisions = { ...spec.dimensionDecisions };
      (spec.seriesFields ?? (spec.series ? [spec.series] : []))
        .forEach((encoding) => { delete dimensionDecisions[encoding.field]; });
      selected.forEach((encoding) => { dimensionDecisions[encoding.field] = "series"; });
      return {
        ...spec,
        encodings,
        series: selected[0],
        seriesFields: selected.length ? selected : undefined,
        valueFields: selected.length ? undefined : spec.valueFields,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: Object.keys(dimensionDecisions).length ? dimensionDecisions : undefined,
        dimensionRecommendations: undefined,
      };
    });
    return true;
  }
  function clearSeriesBinding() {
    const node = axisBindingNode.value;
    if (!node?.chartSpec) return;
    updateEncodingTargets(node, (_target, spec) => {
      const field = resolvedSeriesField(spec);
      const decisions = { ...spec.dimensionDecisions };
      if (field) delete decisions[field];
      return {
        ...spec,
        series: undefined,
        seriesFields: undefined,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: Object.keys(decisions).length ? decisions : undefined,
        dimensionRecommendations: undefined,
      };
    });
  }
  function bindOptionalEncoding(channel: OptionalEncodingChannel, fieldName: string) {
    setChartEncoding(channel, fieldName);
  }
  function clearOptionalEncoding(channel: OptionalEncodingChannel) {
    setChartEncoding(channel, "");
  }
  function setChartEncoding(channel: ChartEncodingChannel, fieldName: string, inputDatasetId?: string) {
    const node = axisBindingNode.value;
    const dataset = inputDatasetId ? getDataset(inputDatasetId) : axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const config = getEncodingChannelConfigsForSpec(node.chartSpec).find((item) => item.channel === channel);
    const graphTable = dataset.graph
      ? channel === "source" || channel === "target" || channel === "value"
        ? dataset.graph.edges
        : dataset.graph.nodes
      : null;
    const column = fieldName
      ? (graphTable?.columns ?? dataset.columns).find((item) => item.name === fieldName)
      : undefined;
    if (!config || (fieldName && (!column || !isDataColumnTypeCompatible(config.accepts, column.type)))) return;
    if (channel === "y" && (node.chartSpec.valueFields?.length ?? 0) > 0) {
      setImportNotice("Y is derived from quantitative Series Items and cannot be bound separately.");
      return;
    }
    if (channel === "x" || channel === "y") {
      setAxisBindingChannel(channel);
      if (fieldName) bindMarkField(fieldName, undefined, inputDatasetId);
      else clearMarkField();
      return;
    }
    if (channel === "theta" || channel === "angle") return setPieAngleFields(fieldName ? [fieldName] : []);
    if (channel === "radius") return fieldName ? bindPolarRadiusField(fieldName) : clearPolarRadiusField();
    updateEncodingTargets(node, (_target, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      const memberEncodings = { ...spec.encodings };
      if (column) memberEncodings[channel] = { field: column.name, type: column.type };
      else delete memberEncodings[channel];
      return { ...spec, encodings: memberEncodings, scales: undefined, plotArea: undefined, renderer: undefined };
    });
  }

  function setCompositionEncoding(patch: {
    facetField?: string;
    facetDirection?: "row" | "column";
    facetRowGap?: number;
    facetColumnGap?: number;
    facetCoordinateSystem?: "Cartesian" | "Polar";
    facetThetaField?: string;
    facetRadiusField?: string;
    facetGrid?: NonNullable<CanvasNode["compositionSpec"]>["facetGrid"];
    sharedChannels?: CoordinateChannel[];
  }) {
    const node = axisBindingNode.value;
    const current = node?.compositionSpec;
    const chartNode = firstChartNode(node);
    const dataset = chartNode?.chartSpec ? getDataset(chartNode.chartSpec.datasetId) : null;
    if (!node || !current || current.type === "nested") return;
    pushCanvasHistory();
    const nextSpec: NonNullable<CanvasNode["compositionSpec"]> = {
      ...current,
      ...patch,
      sharedChannels: patch.sharedChannels ? [...patch.sharedChannels] : [...current.sharedChannels],
      members: current.members.map((member) => ({ ...member, sharedChannels: patch.sharedChannels ? [...patch.sharedChannels] : [...member.sharedChannels] })),
    };
    if (current.type === "facet") {
      if (patch.facetRowGap !== undefined) nextSpec.facetRowGap = Math.max(0, Math.min(200, patch.facetRowGap));
      if (patch.facetColumnGap !== undefined) nextSpec.facetColumnGap = Math.max(0, Math.min(200, patch.facetColumnGap));
    }
    if (current.type === "facet" && patch.facetField !== undefined) {
      const field = patch.facetField || undefined;
      const values = field && dataset
        ? Array.from(new Set(dataset.rows.map((row) => row[field] ?? "").filter(Boolean)))
        : [];
      nextSpec.facetField = field;
      nextSpec.facetValues = values;
      nextSpec.facetGrid = undefined;
      nextSpec.facetDirection = patch.facetDirection ?? current.facetDirection ?? "column";
    }
    if (current.type === "facet" && patch.facetGrid) {
      nextSpec.facetGrid = {
        ...patch.facetGrid,
        rowValues: [...patch.facetGrid.rowValues],
        columnValues: [...patch.facetGrid.columnValues],
      };
      nextSpec.facetField = undefined;
      nextSpec.facetValues = undefined;
    }
    if (current.type === "facet" && patch.facetCoordinateSystem) {
      nextSpec.facetCoordinateSystem = patch.facetCoordinateSystem;
      nextSpec.facetThetaField = patch.facetThetaField ?? current.facetThetaField;
      nextSpec.facetRadiusField = patch.facetRadiusField ?? current.facetRadiusField;
    }
    const members = nextSpec.members
      .map((member) => findCanvasNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member);
    if (current.type === "facet"
      && members.length > 1
      && (patch.facetDirection !== undefined
        || patch.facetCoordinateSystem !== undefined
        || patch.facetRowGap !== undefined
        || patch.facetColumnGap !== undefined)) {
      const anchor = members[0]!;
      const stepX = anchor.width * anchor.scaleX + (nextSpec.facetColumnGap ?? 4);
      const stepY = anchor.height * anchor.scaleY + (nextSpec.facetRowGap ?? 4);
      if (nextSpec.facetCoordinateSystem === "Polar") {
        const thetaField = nextSpec.facetThetaField;
        const radiusField = nextSpec.facetRadiusField;
        const domain = (field: string | undefined) => field && dataset
          ? Array.from(new Set(dataset.rows.map((row) => row[field] ?? "").filter(Boolean)))
          : [];
        const thetaValues = domain(thetaField);
        const radiusValues = domain(radiusField);
        const radialStep = Math.max(stepX, stepY);
        const centerX = anchor.x + anchor.width * anchor.scaleX / 2;
        const centerY = anchor.y + anchor.height * anchor.scaleY / 2;
        members.forEach((member, index) => {
          const memberSpec = firstChartNode(member)?.chartSpec;
          const thetaValue = thetaField ? memberSpec?.filters?.[thetaField] : undefined;
          const radiusValue = radiusField ? memberSpec?.filters?.[radiusField] : undefined;
          const thetaIndex = Math.max(0, thetaValue ? thetaValues.indexOf(thetaValue) : index);
          const radiusIndex = Math.max(0, radiusValue ? radiusValues.indexOf(radiusValue) : 0) + 1;
          const angle = (-90 + thetaIndex * 360 / Math.max(thetaValues.length || members.length, 1)) * Math.PI / 180;
          member.x = centerX + Math.cos(angle) * radialStep * radiusIndex - member.width * member.scaleX / 2;
          member.y = centerY + Math.sin(angle) * radialStep * radiusIndex - member.height * member.scaleY / 2;
        });
      } else if (nextSpec.facetGrid) {
        members.forEach((member, index) => {
          const memberSpec = firstChartNode(member)?.chartSpec;
          const rowValue = memberSpec?.filters?.[nextSpec.facetGrid!.rowField];
          const columnValue = memberSpec?.filters?.[nextSpec.facetGrid!.columnField];
          const rowIndex = Math.max(0, rowValue ? nextSpec.facetGrid!.rowValues.indexOf(rowValue) : 0);
          const columnIndex = Math.max(0, columnValue ? nextSpec.facetGrid!.columnValues.indexOf(columnValue) : index);
          member.x = anchor.x + columnIndex * stepX;
          member.y = anchor.y + rowIndex * stepY;
        });
      } else {
        members.forEach((member, index) => {
          member.x = nextSpec.facetDirection === "row" ? anchor.x : anchor.x + index * stepX;
          member.y = nextSpec.facetDirection === "row" ? anchor.y + index * stepY : anchor.y;
        });
      }
    }
    // Facet configuration is edited from the composite surface while the
    // active encoding target may be one of its member charts. Keep the owner
    // group and every member in sync so the inspector and serialization do
    // not revert to stale composite values.
    const compositionOwner = walkCanvasNodes().find((candidate) =>
      candidate.kind === "group" && candidate.compositionSpec?.id === current.id,
    );
    if (compositionOwner) compositionOwner.compositionSpec = nextSpec;
    if (node.compositionSpec?.id === current.id) node.compositionSpec = nextSpec;
    members.forEach((member, index) => {
      member.compositionSpec = nextSpec;
      if (member.chartSpec && current.type === "facet" && patch.facetField !== undefined) {
        const filters = { ...member.chartSpec.filters };
        if (current.facetField) delete filters[current.facetField];
        if (nextSpec.facetField && nextSpec.facetValues?.[index]) {
          filters[nextSpec.facetField] = nextSpec.facetValues[index]!;
        }
        member.chartSpec = {
          ...member.chartSpec,
          filters: Object.keys(filters).length ? filters : undefined,
          renderer: undefined,
        };
        renderChartNode(member);
      }
      registerChartRelationship(member);
    });
    reconcileRelationshipNodes(canvasNodes.value);
  }
  function bindPolarRadiusField(fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    const column = dataset?.columns.find((item) => item.name === fieldName && item.type === "quantitative");
    if (!node?.chartSpec || !column) return;
    updateEncodingTargets(node, (_target, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      return {
        ...spec,
        encodings: { ...spec.encodings, radius: { field: column.name, type: column.type } },
        radiusMode: undefined,
        componentRadiusFields: undefined,
        renderer: undefined,
      };
    });
  }
  function clearPolarRadiusField() {
    const node = axisBindingNode.value;
    if (!node?.chartSpec?.encodings.radius) return;
    updateEncodingTargets(node, (_target, spec) => {
      const encodings = { ...spec.encodings };
      delete encodings.radius;
      return { ...spec, encodings, radiusMode: undefined, componentRadiusFields: undefined, renderer: undefined };
    });
  }
  function applyPieAngleFields(node: CanvasNode, dataset: Dataset, fieldNames: string[]) {
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    const radialBar = node.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase() === "radialbarchart";
    if (!node.chartSpec || (template !== "pie" && template !== "donut" && !radialBar)) return 0;
    const selected = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field
        && (item.type === "quantitative" || item.type === "nominal" || item.type === "ordinal" || item.type === "temporal"));
      return column ? [{ field: column.name, type: column.type }] : [];
    }).slice(0, 1);
    updateEncodingTargets(node, (_target, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      const memberEncodings = { ...spec.encodings };
      delete memberEncodings.theta;
      delete memberEncodings.angle;
      delete memberEncodings.y;
      if (selected[0]) memberEncodings.theta = { ...selected[0] };
      return {
        ...spec,
        encodings: memberEncodings,
        angleFields: undefined,
        radiusMode: undefined,
        componentRadiusFields: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
    });
    return selected.length;
  }
  function setPieAngleFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (node && dataset) applyPieAngleFields(node, dataset, fieldNames);
  }
  function setPolarSegmentFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const columns = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field);
      return column ? [column] : [];
    });
    if (columns.length === 0) {
      updateEncodingTargets(node, (_target, spec) => {
        spec = replaceDefaultDataBinding(spec, dataset.id);
        const encodings = { ...spec.encodings };
        delete encodings.segment;
        return {
          ...spec,
          encodings,
          angleFields: undefined,
          radiusMode: undefined,
          componentRadiusFields: undefined,
          renderer: undefined,
          dimensionDecisions: undefined,
          dimensionRecommendations: undefined,
        };
      });
      return;
    }
    const quantitative = columns.every((column) => column.type === "quantitative");
    if (!quantitative && columns.length > 1) return;
    updateEncodingTargets(node, (_target, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      const encodings = { ...spec.encodings };
      delete encodings.segment;
      delete encodings.angle;
      delete encodings.y;
      if (quantitative) {
        delete encodings.theta;
        return {
          ...spec,
          encodings,
          angleFields: columns.map((column) => ({ field: column.name, type: column.type })),
          radiusMode: undefined,
          componentRadiusFields: undefined,
          renderer: undefined,
          dimensionDecisions: undefined,
          dimensionRecommendations: undefined,
        };
      }
      encodings.segment = { field: columns[0]!.name, type: columns[0]!.type };
      return {
        ...spec,
        encodings,
        angleFields: undefined,
        radiusMode: undefined,
        componentRadiusFields: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
    });
  }
  function setValueSeriesFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const selected = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field && item.type === "quantitative");
      return column ? [{ field: column.name, type: column.type }] : [];
    });
    updateEncodingTargets(node, (_target, spec) => {
      spec = replaceDefaultDataBinding(spec, dataset.id);
      const memberEncodings = { ...spec.encodings };
      delete memberEncodings.color;
      if (selected[0]) memberEncodings.y = { ...selected[0] };
      else delete memberEncodings.y;
      return {
        ...spec,
        encodings: memberEncodings,
        valueFields: selected.length ? selected : undefined,
        series: undefined,
        seriesFields: undefined,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
    });
  }
  function addBarItemField(fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset || !barItemAxisBinding(node)) return false;
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return false;
    if (isPolarSegmentChart(node.chartSpec.chartType)) {
      const radialBar = node.chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase() === "radialbarchart";
      if (radialBar && column.type !== "nominal" && column.type !== "ordinal" && column.type !== "temporal") return false;
      const current = node.chartSpec.encodings.segment?.field
        ? [node.chartSpec.encodings.segment.field]
        : node.chartSpec.angleFields?.map((encoding) => encoding.field) ?? [];
      if (current.includes(fieldName)) return true;
      if (node.chartSpec.encodings.segment?.field) return false;
      if (!radialBar && (node.chartSpec.angleFields?.length ?? 0) > 0 && column.type !== "quantitative") return false;
      if (!current.includes(fieldName)) setPolarSegmentFields([...current, fieldName]);
      return true;
    }
    if (column.type === "quantitative") {
      const current = node.chartSpec.valueFields?.map((encoding) => encoding.field)
        ?? [];
      if (current.includes(fieldName)) return true;
      setValueSeriesFields([...current, fieldName]);
      return true;
    }
    if (node.chartSpec.series?.field === fieldName
      || node.chartSpec.seriesFields?.some((encoding) => encoding.field === fieldName)) return true;
    return setSeriesFields([fieldName]);
  }
  function removeBarItemField(nodeId: string, fieldName: string) {
    const node = findCanvasNode(nodeId);
    if (!node?.chartSpec || !barItemAxisBinding(node)) return;
    axisBindingTarget.value = { nodeId, channel: itemBindingAxis(node) };
    if (isPolarSegmentChart(node.chartSpec.chartType)) {
      const segmentFields = node.chartSpec.encodings.segment?.field
        ? [node.chartSpec.encodings.segment.field]
        : node.chartSpec.angleFields?.map((encoding) => encoding.field) ?? [];
      if (segmentFields.includes(fieldName)) {
        setPolarSegmentFields(segmentFields.filter((field) => field !== fieldName));
      }
      return;
    }
    const valueFields = node.chartSpec.valueFields?.map((encoding) => encoding.field) ?? [];
    if (valueFields.includes(fieldName)) {
      setValueSeriesFields(valueFields.filter((field) => field !== fieldName));
      return;
    }
    const seriesFields = seriesItemCategoricalFields(node.chartSpec);
    if (seriesFields.includes(fieldName)) setSeriesFields(seriesFields.filter((field) => field !== fieldName));
  }
  function setParallelFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const dimensions = getEncodingChannelConfigsForSpec(node.chartSpec)
      .find((config) => config.channel === "dimensions");
    if (!dimensions) return;
    const fields = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field && dimensions.accepts.includes(item.type));
      return column ? [{ field: column.name, type: column.type }] : [];
    });
    updateEncodingTargets(node, (_target, spec) => ({
      ...replaceDefaultDataBinding(spec, dataset.id),
      parallelFields: fields,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    }));
  }
  function closeContextMenu() { contextMenu.value = null; }

  const {
    sharedCoordinateMembers,
    mergedCompositionScales,
    setPolarNodeOrigin,
    alignPolarConcatFrame,
    renderSharedCoordinateComposition: renderedSharedCoordinateComposition,
    prepareChartDataForNode,
    renderChartNode: renderedChartNode,
  } = useCanvasRendering({
    chartRelationships,
    concatHasMixedDirections,
    concatLinksFor,
    defaultChartDataset,
    defaultChartSpecWithAppearance,
    encodingForSharedChannel,
    findCanvasNode,
    getChartTemplateContract,
    getDataset,
    getPolarOccupiedGeometry,
    hasRequiredChartEncodings,
    isDefaultChartDataSpec,
    migrateLineChartAppearance,
    nestedPreparedDataCache,
    nodeLocalToSelectionScopePoint,
    normalizeChartTemplate,
    prepareChartData,
    renderDeterministicChart,
    renderNestedPie,
    resolveChartEncodingIssues,
    transformsWithNestedContext,
    collectNodeSelectionBounds,
  });
  renderChartNodeImplementation = renderedChartNode;
  renderSharedCoordinateCompositionImplementation = renderedSharedCoordinateComposition;

  watch(canvasNodes, (nodes) => {
    walkCanvasNodes(nodes).forEach((node) => {
      if (node.chartSpec && !node.renderedContent && node.chartSpec.renderer?.status !== "error") {
        renderChartNode(node);
      }
    });
  }, { flush: "post" });

  const {
    cloneCanvasNodeForPaste: cloneCanvasNodeForPasteFromClipboard,
    copySelectedNodes,
    getCanvasNodeListBounds: getCanvasNodeListBoundsFromClipboard,
    pasteClipboardNodes,
  } = useCanvasClipboard({
    clipboardNodes,
    cloneCanvasNode,
    cloneChartSpec,
    clamp,
    collectNodeBounds,
    getCanvasBounds,
    getGroupAtPath,
    getSelectionScopeNodes,
    mergeBounds,
    pushCanvasHistory,
    registerChartRelationship,
    renderChartNode,
    renderSemanticNode,
    replaceSelectionScopeNodes,
    scopeSvgContent,
    selectedIds,
    setSelection,
    standaloneCoordinateSystem,
    walkCanvasNodes,
  });
  cloneCanvasNodeForPasteImplementation = cloneCanvasNodeForPasteFromClipboard;
  getCanvasNodeListBoundsImplementation = getCanvasNodeListBoundsFromClipboard;

  // --- import ---
  const {
    setImportNotice: setImportNoticeFromImport,
    clearImportNoticeTimer,
    createInitialChartSpec,
    resetChartBindingsForDataset,
    createFacetCopy,
    createCartesianFacetLayouts,
    createPolarFacetLayouts,
    createGeneratedCandidate,
    createCompositionCandidate,
    createCanvasNodesFromTemplate,
    createCanvasItem,
    setDeckglMapStyle,
    setDeckglMapViewState,
    setDeckglConfig,
    setDeckglEncoding,
    selectCanvasNode,
    insertCompositionCandidate,
    createCanvasNodesFromFile,
    readImageFileAsDataUrl,
    readImageDimensions,
    createCanvasNodeFromImageFile,
  } = useCanvasImportOperations({
    activeDataset,
    axisBindingTarget,
    canvasNodes,
    candidates,
    clamp,
    cloneCanvasNodeForPaste,
    countTemplateNodes,
    createCanvasNodesSvgMarkup,
    createDefaultChartSpec,
    createNestedPie,
    createUnboundChartSpec,
    defaultGeographicLayerConfig,
    dimensionDropTarget,
    estimatePolarOrigin,
    executeComposition,
    extractChartStyleTokens,
    findCanvasNode,
    getCandidate,
    getCanvasNodeListBounds,
    getDataset,
    getSelectionScopeBounds,
    getSelectionScopeNodes,
    isLineChartType,
    importNotice,
    loadSvgTemplate,
    loadingDrop,
    normalizeChartTemplate,
    parseSvgTemplate,
    pushCanvasHistory,
    registerChartRelationship,
    renderChartNode,
    replaceSelectionScopeNodes,
    scopeSvgContent,
    selectedIds,
    semanticSelection,
    setSelection,
    standaloneCoordinateSystem,
    supportsDefaultChartData,
    walkCanvasNodes,
    nestedBindingTarget,
  });
  setImportNoticeImplementation = setImportNoticeFromImport;

  // --- pointer / interaction ---
  const interactionApi = useCanvasInteraction({
    activeDropZone, axisBindingTarget, beginCompositionEditing, bindingForChartChannel,
    canConfigureSelectionComposition, canEnterSelection, canRemoveSelectionComposition,
    canvasRef, chartDrilldown, chartRelationships, clamp, clearCompositionDropZoneSchedule,
    collectNodeSelectionBounds, commitCompositionDrop, compositionDropZoneAtPoint,
    compositionDragSourceId, concatEditableAxis,
    concatLinkId, concatLinksFor,
    coordinateTargets, coordinateTransformItemIds, dispatchRelationship, dragTestStage,
    editingCompositionId, editingGroupPath, enterCompositionDropLevel, enterNestedDropLevel,
    findCanvasNode, finishCompositionEditing,
    firstChartNode, flushCompositionDropZone, getCanvasViewport, getCanvasBounds,
    getChartTemplateContract, getGroupAtPath,
    getRootNode, getSelectionNode, getSelectionScopeNodes, interaction, nestedDropPath,
    nestedPositionEditor, nestedSelectionRelationships, nodeLocalToSelectionScopePoint,
    normalizeBounds, normalizeChartTemplate, normalizeSelection, openNestedPositionEditor, pointInBounds,
    polarAngleSpanFromPoint, polarPointAtAngle, polarAngleInputVisible,
    pushCanvasHistory, pushMoveHistory, reconcileCoordinateSystems,
    registerChartRelationship, renderChartNode, renderCoordinateTargets,
    renderSharedCoordinateComposition,
    replaceSelectionScopeNodes, restoreCompositionEditLayout, rotationInputVisible,
    scopedCompositionMemberIds, selectedIds, selectedNodes, semanticSelection, selectionBounds,
    setAxisBindingTarget, setImportNotice, setSelection, scheduleCompositionDropZone,
    scheduleNestedChildLayout,
    selectionTestOnly, standaloneCoordinateSystem, toCanvasPoint, toNodeLocalPoint,
    toSelectionScopePoint, transformPoint, toggleSelection, walkCanvasNodes, measureSelectionStage,
    topLevelSelectionNodeId, viewPan, viewZoom, MAX_ZOOM, MIN_ZOOM, contextMenu,
  });
  const {
    attachPointerListeners, detachPointerListeners, startMove, commitMoveHistory,
    setTransformOnlyMove, clearTransformOnlyMove, enterCanvasGroup, enterSelection,
    selectedNestedRelationship, nestedBatchMetadata, removeNestedComposition,
    removeSelectionComposition, splitConcatLink, configureSelectionComposition,
    exitGroupEditing, exitSelectionHierarchy, clearTransientChartSelectionState,
    clearSelectionTransientState, clearSelectionDrilldown, finishSelectionComposition,
    resetSelectionScope, onCanvasNodePointerDown, openContextMenu,
    onCanvasNodeContextMenu, onCanvasContextMenu, onCanvasPointerDown,
    onEditingGroupBackgroundPointerDown, onScaleHandlePointerDown,
    onRotateHandlePointerDown, onCoordinateOriginPointerDown,
    onCoordinateAxisScalePointerDown, onPolarAnglePointerDown,
    updateRotateInteraction, setSelectionRotation, setPolarAngleSpan,
    updateMoveInteraction, scheduleMoveInteraction, flushMoveInteraction,
    cancelMoveInteractionSchedule,
    updateScaleInteraction, updateCoordinateOriginInteraction,
    updateCoordinateAxisScaleInteraction, updatePolarAngleInteraction,
    finalizeMarqueeSelection, onWindowPointerUp, onWindowPointerMove,
    onCanvasWheel, resetCanvasZoom,
  } = interactionApi;

  // --- drag & drop ---
  function onCandidateDragStart(candidate: SvgCandidate, event: DragEvent) {
    draggedCandidateId.value = candidate.id;
    activeDataBindingDropZone.value = null;
    dimensionDropTarget.value = null;
    event.dataTransfer?.setData("application/x-svg-candidate", candidate.id);
    event.dataTransfer?.setData("text/plain", candidate.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }
  function onCandidateDragEnd() {
    draggedCandidateId.value = null;
    activeDropZone.value = null;
    activeDataBindingDropZone.value = null;
  }
  function onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
    const payload = decodeCsvColumnDragPayload(event.dataTransfer?.getData(csvColumnDragMime))
      ?? getActiveCsvColumnDrag();
    if (payload) {
      const point = toSelectionScopePoint(event.clientX, event.clientY);
      const zone = dataBindingDropZoneAtPoint(point, payload);
      activeDataBindingDropZone.value = zone;
      activeDropZone.value = null;
      if (event.dataTransfer) event.dataTransfer.dropEffect = zone?.compatible ? "copy" : "none";
      return;
    }
    activeDataBindingDropZone.value = null;
    // Template cards always create atomic units first. Composition is an
    // explicit second step after every selected unit has valid mark encodings.
    activeDropZone.value = null;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  function onCanvasDragLeave(event: DragEvent) {
    const current = event.currentTarget;
    const related = event.relatedTarget;
    if (current instanceof Element && related instanceof Node && current.contains(related)) return;
    activeDropZone.value = null;
    activeDataBindingDropZone.value = null;
  }
  async function onCanvasDrop(event: DragEvent) {
    event.preventDefault();
    const point = toSelectionScopePoint(event.clientX, event.clientY);
    const csvPayload = decodeCsvColumnDragPayload(event.dataTransfer?.getData(csvColumnDragMime));
    if (csvPayload) {
      const zone = dataBindingDropZoneAtPoint(point, csvPayload) ?? activeDataBindingDropZone.value;
      activeDataBindingDropZone.value = null;
      activeDropZone.value = null;
      endCsvColumnDrag();
      dimensionDropTarget.value = null;
      if (!zone) {
        setImportNotice("Drop a column on a visible coordinate axis.");
        return;
      }
      if (!zone.compatible) {
        setImportNotice(zone.type === "geographic-body"
          ? `${csvPayload.field} has no matching ID in the active GeoJSON source.`
          : zone.type === "chart-body"
          ? `No supported use of ${csvPayload.field} was found for this chart.`
          : zone.type === "series-item"
            ? `${csvPayload.field} is not compatible with the current ${zone.label} mode.`
            : "That column type is not supported by this coordinate axis.");
        return;
      }
      const target = findCanvasNode(zone.targetNodeId);
      if (zone.type === "geographic-body") {
        const source = activeGeometrySource.value;
        if (!target || target.layerKind !== "deckgl" || !source) return;
        pushCanvasHistory();
        target.deckglBinding = {
          datasetId: csvPayload.datasetId,
          geometrySourceId: source.id,
          idField: csvPayload.field,
          aggregation: "sum",
        };
        setSelection([target.id]);
        axisBindingTarget.value = { nodeId: target.id, channel: "x" };
        const dataset = getDataset(csvPayload.datasetId);
        const datasetIds = new Set(dataset?.rows
          .map((row) => (row[csvPayload.field] ?? "").trim())
          .filter(Boolean) ?? []);
        const matchedFeatureCount = source.features.filter((feature) =>
          geoJsonFeatureIds(feature).some((id) => datasetIds.has(id))).length;
        setImportNotice(`${csvPayload.field} joined to ${matchedFeatureCount} GeoJSON geometries.`);
        return;
      }
      if (!target?.chartSpec) return;
      if (zone.type === "chart-body") {
        const dataset = getDataset(target.chartSpec.datasetId);
        const column = dataset?.columns.find((item) => item.name === csvPayload.field);
        if (!dataset || !column) return;
        const analysis = inferColumnIntents(dataset, target.chartSpec, column, { type: "chart-body" });
        if (analysis.status !== "VALID" || analysis.intents.length === 0) {
          setImportNotice(`No supported use of ${csvPayload.field} was found for this chart.`);
          return;
        }
        axisBindingTarget.value = {
          nodeId: target.id,
          channel: target.chartSpec.axisSwapped ? "y" : "x",
          clientX: event.clientX,
          clientY: event.clientY,
        };
        setSelection([target.id]);
        dimensionDropTarget.value = {
          nodeId: target.id,
          fieldName: csvPayload.field,
          clientX: event.clientX,
          clientY: event.clientY,
          analysis,
        };
        return;
      }
      if (zone.type === "series-item") {
        axisBindingTarget.value = {
          nodeId: target.id,
          channel: itemBindingAxis(target),
          clientX: event.clientX,
          clientY: event.clientY,
        };
        setSelection([target.id]);
        const applied = addBarItemField(csvPayload.field);
        setImportNotice(applied
          ? `${csvPayload.field} bound to ${zone.label}.`
          : `${csvPayload.field} cannot be bound to ${zone.label}.`);
        return;
      }
      axisBindingTarget.value = {
        nodeId: target.id,
        channel: zone.channel,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      setSelection([target.id]);
      const chartChannel: ChartEncodingChannel = zone.type === "polar-axis"
        ? zone.channel === "angle" ? "theta" : "radius"
        : logicalAxisChannel(target, zone.channel);
      setChartEncoding(chartChannel, csvPayload.field, csvPayload.datasetId);
      setImportNotice(`${csvPayload.field} bound to ${zone.channel === "angle" ? "theta" : zone.channel}.`);
      return;
    }
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
    const droppedSvg = droppedFiles.find(
      (f) => f.type === "image/svg+xml" || /\.svg$/i.test(f.name),
    );
    if (droppedSvg) {
      await createCanvasNodesFromFile(droppedSvg, point);
      draggedCandidateId.value = null;
      return;
    }
    const droppedImage = droppedFiles.find((file) =>
      (/^image\/(?:png|jpeg|webp|gif|avif)$/i.test(file.type)
        || /\.(?:png|jpe?g|webp|gif|avif)$/i.test(file.name)),
    );
    if (droppedImage) {
      await createCanvasNodeFromImageFile(droppedImage, point);
      draggedCandidateId.value = null;
      return;
    }
    const candidateId =
      event.dataTransfer?.getData("application/x-svg-candidate") ??
      event.dataTransfer?.getData("text/plain") ??
      draggedCandidateId.value;
    if (!candidateId) return;
    const candidate = getCandidate(candidateId);
    if (!candidate) return;
    // Geographic deck.gl examples are visual layers, not semantic chart
    // members. Always place them as standalone objects, even over a
    // composition drop zone.
    const zone = candidate.renderMode === "static-layer" ? null : activeDropZone.value;
    if (candidate.renderMode === "static-layer") activeDropZone.value = null;
    if (zone) {
      activeDropZone.value = null;
      if (!zone.compatible) {
        setImportNotice("This chart does not support the coordinate channel represented by that drop zone.");
        draggedCandidateId.value = null;
        return;
      }
      const target = findCanvasNode(zone.targetNodeId);
      if (!target) return;
      if (zone.type === "nested") {
        if (zone.targetRowKey) {
          beginNestedRelationshipDraft(target, candidate, zone.targetRowKey);
          nestedBindingTarget.value = {
            nodeId: target.id,
            rowKey: zone.targetRowKey,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          axisBindingTarget.value = null;
          contextMenu.value = null;
        }
        draggedCandidateId.value = null;
        return;
      }
      pushCanvasHistory();
      const created = await createCanvasItem(candidate, point, false);
      const dropped = created?.[0];
      if (dropped) {
        setSelection([target.id, dropped.id]);
        if (zone.type === "concat-corner") {
          commitCompositionDrop(zone, dropped.id);
        } else {
          executeComposition(
            zone.type,
            false,
            zone.sharedChannels,
            zone.direction,
            zone.concatPosition,
            target.id,
            dropped.id,
          );
        }
      }
      draggedCandidateId.value = null;
      return;
    }
    const created = await createCanvasItem(candidate, point);
    const createdNode = created?.[0];
    const createdTemplate = normalizeChartTemplate(createdNode?.chartSpec?.chartType ?? "");
    if (createdNode?.chartSpec && (createdTemplate === "pie" || createdTemplate === "donut")) {
      axisBindingTarget.value = {
        nodeId: createdNode.id,
        channel: "angle",
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
    draggedCandidateId.value = null;
  }

  // --- movement / ordering / grouping ---
  function moveItems(itemIds: string[], dx: number, dy: number) {
    itemIds.forEach((id) => { const item = getSelectionNode(id); if (!item) return; item.x += dx; item.y += dy; });
  }
  function reorderSelectedNodes(action: LayerOrderAction) {
    const sel = new Set(selectedIds.value);
    if (sel.size === 0) return;
    const scopeNodes = getSelectionScopeNodes();
    const selected = scopeNodes.filter((n) => sel.has(n.id));
    const unselected = scopeNodes.filter((n) => !sel.has(n.id));
    let nextNodes: CanvasNode[];
    switch (action) {
      case "front": nextNodes = [...unselected, ...selected]; break;
      case "back":  nextNodes = [...selected, ...unselected]; break;
      case "forward":
        nextNodes = [...scopeNodes];
        for (let i = nextNodes.length - 2; i >= 0; i -= 1) {
          const n = nextNodes[i], m = nextNodes[i + 1];
          if (n && m && sel.has(n.id) && !sel.has(m.id)) { nextNodes[i] = m; nextNodes[i + 1] = n; }
        }
        break;
      default:
        nextNodes = [...scopeNodes];
        for (let i = 1; i < nextNodes.length; i += 1) {
          const n = nextNodes[i], p = nextNodes[i - 1];
          if (n && p && sel.has(n.id) && !sel.has(p.id)) { nextNodes[i - 1] = n; nextNodes[i] = p; }
        }
        break;
    }
    const changed = nextNodes.some((n, i) => n.id !== scopeNodes[i]?.id);
    if (!changed) return;
    pushCanvasHistory();
    replaceSelectionScopeNodes(nextNodes);
  }
  function groupSelectedItems() {
    const groupBounds = selectionScopeBounds.value;
    if (!canGroup.value || !groupBounds) return;
    pushCanvasHistory();
    const sel = new Set(selectedIds.value);
    const scopeNodes = getSelectionScopeNodes();
    const insertIndex = scopeNodes.findIndex((n) => sel.has(n.id));
    const nextGroupId = crypto.randomUUID();
    const nextChildren = scopeNodes
      .filter((n) => sel.has(n.id))
      .map((n) => ({ ...n, x: n.x - groupBounds.minX, y: n.y - groupBounds.minY }));
    const nextScopeNodes = scopeNodes.filter((n) => !sel.has(n.id));
    nextScopeNodes.splice(
      insertIndex < 0 ? nextScopeNodes.length : insertIndex,
      0,
      { kind: "group", id: nextGroupId, name: `group-${nextGroupId.slice(0, 8)}`, x: groupBounds.minX, y: groupBounds.minY, width: groupBounds.width, height: groupBounds.height, scaleX: 1, scaleY: 1, rotation: 0, children: nextChildren } satisfies CanvasGroupNode,
    );
    replaceSelectionScopeNodes(nextScopeNodes);
    setSelection([nextGroupId]);
  }
  function generatedLeavesFromNode(node: CanvasNode): CanvasLeafNode[] {
    if (!node.renderedContent) return [];
    const baseMinX = node.kind === "leaf" ? node.contentMinX : 0;
    const baseMinY = node.kind === "leaf" ? node.contentMinY : 0;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${baseMinX} ${baseMinY} ${node.width} ${node.height}" width="${node.width}" height="${node.height}">${node.renderedContent}</svg>`;
    try {
      const template = parseSvgTemplate(markup);
      const leaves: ParsedSvgLeafTemplateNode[] = [];
      const visit = (entries: ParsedSvgTemplateNode[]) => entries.forEach((entry) => {
        if (entry.kind === "leaf") leaves.push(entry);
        else visit(entry.children);
      });
      visit(template.nodes);
      return leaves.map((leaf, index) => {
        const id = crypto.randomUUID();
        return {
          kind: "leaf",
          id,
          candidateId: `generated:${node.id}`,
          name: `${node.name}-${index + 1}`,
          content: scopeSvgContent(leaf.content, id),
          viewBox: leaf.viewBox,
          width: Math.max(leaf.bounds.width, 1),
          height: Math.max(leaf.bounds.height, 1),
          x: node.x + (leaf.bounds.minX - baseMinX) * node.scaleX,
          y: node.y + (leaf.bounds.minY - baseMinY) * node.scaleY,
          scaleX: node.scaleX,
          scaleY: node.scaleY,
          rotation: node.rotation,
          contentMinX: leaf.contentMinX,
          contentMinY: leaf.contentMinY,
        } satisfies CanvasLeafNode;
      });
    } catch {
      return [];
    }
  }
  function ungroupSelectedItems() {
    const nodeIds = new Set(
      selectedNodes.value.filter((node) => node.kind === "group" || !!node.renderedContent).map((node) => node.id),
    );
    if (nodeIds.size === 0) return;
    pushCanvasHistory();
    const nextRoots: CanvasNode[] = [];
    const nextSel: string[] = [];
    getSelectionScopeNodes().forEach((node) => {
      if (!nodeIds.has(node.id)) { nextRoots.push(node); return; }
      if (node.kind === "group" && node.children.length > 0) {
        const sharedSystem = node.coordinateSystem;
        const ownerNodeId = node.children[0]?.id;
        if (sharedSystem && ownerNodeId) sharedSystem.ownerNodeId = ownerNodeId;
        node.children.forEach((child) => {
          const flat = { ...child, x: node.x + child.x * node.scaleX, y: node.y + child.y * node.scaleY, scaleX: child.scaleX * node.scaleX, scaleY: child.scaleY * node.scaleY } satisfies CanvasNode;
          if (sharedSystem) flat.coordinateSystem = sharedSystem;
          nextRoots.push(flat);
          nextSel.push(flat.id);
        });
        return;
      }
      const generatedLeaves = generatedLeavesFromNode(node);
      if (generatedLeaves.length > 0) {
        nextRoots.push(...generatedLeaves);
        nextSel.push(...generatedLeaves.map((leaf) => leaf.id));
        return;
      }
      if (node.kind !== "group") { nextRoots.push(node); return; }
    });
    replaceSelectionScopeNodes(nextRoots);
    reconcileCoordinateSystems();
    setSelection(nextSel);
  }
  function flattenGroupToLeaves(
    node: CanvasGroupNode, parentX = 0, parentY = 0, parentScaleX = 1, parentScaleY = 1,
  ): CanvasLeafNode[] {
    const x = parentX + node.x * parentScaleX;
    const y = parentY + node.y * parentScaleY;
    const scaleX = parentScaleX * node.scaleX;
    const scaleY = parentScaleY * node.scaleY;
    return node.children.flatMap((child) => {
      const flat = { ...child, x: x + child.x * scaleX, y: y + child.y * scaleY, scaleX: child.scaleX * scaleX, scaleY: child.scaleY * scaleY };
      return child.kind === "leaf" ? [flat as CanvasLeafNode] : flattenGroupToLeaves(flat as CanvasGroupNode);
    });
  }
  function dissolveSelectedGroups() {
    const groupIds = new Set(
      selectedNodes.value.filter((n): n is CanvasGroupNode => n.kind === "group").map((n) => n.id),
    );
    if (groupIds.size === 0) return;
    pushCanvasHistory();
    const nextRoots: CanvasNode[] = [];
    const nextSel: string[] = [];
    getSelectionScopeNodes().forEach((node) => {
      if (node.kind !== "group" || !groupIds.has(node.id)) { nextRoots.push(node); return; }
      flattenGroupToLeaves(node).forEach((leaf) => { nextRoots.push(leaf); nextSel.push(leaf.id); });
    });
    replaceSelectionScopeNodes(nextRoots);
    reconcileCoordinateSystems();
    setSelection(nextSel);
  }
  function alignSelection(mode: "left" | "right" | "top" | "bottom" | "center-x" | "center-y") {
    const units = selectionUnits.value;
    const bounds = selectionScopeBounds.value;
    if (units.length < 2 || !bounds) return;
    const adjustments = units.map((unit) => {
      let dx = 0, dy = 0;
      switch (mode) {
        case "left":     dx = bounds.minX - unit.bounds.minX; break;
        case "right":    dx = bounds.maxX - unit.bounds.maxX; break;
        case "top":      dy = bounds.minY - unit.bounds.minY; break;
        case "bottom":   dy = bounds.maxY - unit.bounds.maxY; break;
        case "center-x": dx = bounds.minX + bounds.width / 2 - (unit.bounds.minX + unit.bounds.width / 2); break;
        case "center-y": dy = bounds.minY + bounds.height / 2 - (unit.bounds.minY + unit.bounds.height / 2); break;
      }
      return { unit, dx, dy };
    });
    if (!adjustments.some(({ dx, dy }) => Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)) return;
    pushCanvasHistory();
    adjustments.forEach(({ unit, dx, dy }) => moveItems(unit.itemIds, dx, dy));
  }

  // --- keyboard ---
  function onWindowKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      contextMenu.value = null;
      if (exitSelectionHierarchy()) event.preventDefault();
      return;
    }
    const target = event.target;
    const isEditing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isEditing || event.altKey) return;
    if (event.key === "Delete") {
      if (selectedIds.value.length > 0) { event.preventDefault(); deleteSelectedNodes(); }
      return;
    }
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "c") { if (selectedIds.value.length > 0) { event.preventDefault(); copySelectedNodes(); } return; }
    if (key === "v") { if (clipboardNodes.value.length > 0) { event.preventDefault(); pasteClipboardNodes(); } return; }
    if (key !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redoCanvasChange(); else undoCanvasChange();
  }

  // --- lifecycle ---
  onMounted(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("click", closeContextMenu);
  });
  let nestedLayoutScheduled = false;
  let pendingNestedLayoutIds: Set<string> | null = new Set();
  let pendingNestedLayoutFitToParentMark = false;
  function scheduleNestedChildLayout(
    relationshipIds?: Iterable<string>,
    options: { fitToParentMark?: boolean } = {},
  ) {
    const relationships = chartRelationships.value.nestedRelationships;
    if (Object.keys(relationships).length === 0) return;
    const requestedRelationshipIds = relationshipIds ? Array.from(relationshipIds) : undefined;
    // Parent templates consume the child's current selection-box dimensions
    // when routing links. Re-render affected parents before Vue patches the
    // DOM used below to resolve the parent mark bounds.
    const parentIds = new Set<string>();
    if (requestedRelationshipIds) {
      for (const relationshipId of requestedRelationshipIds) {
        const relationship = relationships[relationshipId];
        if (relationship?.status === "active") parentIds.add(relationship.parentChartId);
      }
    } else {
      Object.values(relationships).forEach((relationship) => {
        if (relationship.status === "active") parentIds.add(relationship.parentChartId);
      });
    }
    parentIds.forEach((parentId) => {
      const parent = findCanvasNode(parentId);
      if (parent) renderChartNode(parent);
    });
    if (requestedRelationshipIds) {
      if (pendingNestedLayoutIds) {
        for (const relationshipId of requestedRelationshipIds) {
          if (relationships[relationshipId]) pendingNestedLayoutIds.add(relationshipId);
        }
      }
      if (pendingNestedLayoutIds?.size === 0) return;
      if (options.fitToParentMark) pendingNestedLayoutFitToParentMark = true;
    } else {
      pendingNestedLayoutIds = null;
      pendingNestedLayoutFitToParentMark = pendingNestedLayoutFitToParentMark || !!options.fitToParentMark;
    }
    if (nestedLayoutScheduled) return;
    nestedLayoutScheduled = true;
    void nextTick(() => {
      nestedLayoutScheduled = false;
      const scheduledRelationshipIds = pendingNestedLayoutIds;
      pendingNestedLayoutIds = new Set();
      const fitToParentMark = pendingNestedLayoutFitToParentMark;
      pendingNestedLayoutFitToParentMark = false;
      const parentDomCache = new Map<string, {
        element: SVGGraphicsElement;
        marks: SVGGraphicsElement[];
        marksByGroup: Map<string, SVGGraphicsElement[]>;
      }>();
      const targetBoundsCache = new Map<string, Bounds | null>();
      const nodeElements = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? []);
      const nodeElementsById = new Map(nodeElements.map((element) => [element.dataset.nodeId ?? "", element]));
      const nodesById = new Map(walkCanvasNodes().map((node) => [node.id, node]));
      const parentGroupIds = new Map<string, string | undefined>();
      const parentsNeedingRerender = new Set<string>();
      const indexParentGroups = (nodes: CanvasNode[], parentGroupId?: string) => {
        nodes.forEach((node) => {
          parentGroupIds.set(node.id, parentGroupId);
          if (node.kind === "group") indexParentGroups(node.children, node.id);
        });
      };
      indexParentGroups(canvasNodes.value);
      Object.values(chartRelationships.value.nestedRelationships).forEach((relationship) => {
        if (scheduledRelationshipIds && !scheduledRelationshipIds.has(relationship.id)) return;
        if (relationship.status !== "active" || relationship.relationType !== "relative-position") return;
        const parent = nodesById.get(relationship.parentChartId);
        const child = nodesById.get(relationship.childChartId);
        if (!parent || !child) return;
        let parentEntry = parentDomCache.get(parent.id);
        if (!parentEntry) {
          const parentElement = nodeElementsById.get(parent.id);
          if (!parentElement) return;
          const marks = Array.from(parentElement.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"));
          const marksByGroup = new Map<string, SVGGraphicsElement[]>();
          marks.forEach((mark) => {
            const groupId = mark.getAttribute("data-mark-group-id") ?? "";
            const group = marksByGroup.get(groupId) ?? [];
            group.push(mark);
            marksByGroup.set(groupId, group);
          });
          parentEntry = {
            element: parentElement,
            marks,
            marksByGroup,
          };
          parentDomCache.set(parent.id, parentEntry);
        }
        const { marks } = parentEntry;
        const groupMarks = relationship.parentMarkGroupId
          ? parentEntry.marksByGroup.get(relationship.parentMarkGroupId) ?? []
          : marks;
        const identityMarks = relationship.parentDataKey
          ? groupMarks.filter((element, index) => {
            const role = element.getAttribute("data-mark-role");
            const roleIndex = groupMarks.slice(0, index)
              .filter((candidate) => candidate.getAttribute("data-mark-role") === role).length;
            return markMatchesNestedDataKey(element, relationship.parentDataKey!, roleIndex);
          })
          : [];
        const targetMarks = identityMarks.length > 0 ? identityMarks : groupMarks;
        if (targetMarks.length === 0) return;
        const targetGeometryMarks = normalizeChartTemplate(parent.chartSpec?.chartType ?? "") === "hierarchy"
          ? targetMarks.map((mark) => mark.querySelector<SVGGraphicsElement>("circle, rect, path") ?? mark)
          : targetMarks;
        const scopeGroupId = parentGroupIds.get(child.id) ?? null;
        const boundsCacheKey = `${relationship.parentChartId}:${relationship.parentDataKey ?? "*"}:${scopeGroupId ?? ""}`;
        let bounds = targetBoundsCache.get(boundsCacheKey);
        if (bounds === undefined) {
          bounds = semanticSelectionBounds(targetGeometryMarks, scopeGroupId);
          targetBoundsCache.set(boundsCacheKey, bounds);
        }
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const parentFrame = {
          x: bounds.minX,
          y: bounds.minY,
          width: bounds.width,
          height: bounds.height,
          scaleX: 1,
          scaleY: 1,
          rotation: parent.rotation,
        };
        const childFrame = {
          x: child.x,
          y: child.y,
          width: child.width,
          height: child.height,
          scaleX: 1,
          scaleY: 1,
          rotation: child.rotation,
        };
        let next = resolveNestedRelationship(relationship.id, parentFrame, childFrame);
        if (fitToParentMark && isCartesianTreeChart(parent.chartSpec?.chartType)) {
          const fitScale = Math.max(0.01, Math.min(
            bounds.width * 0.78 / Math.max(child.width, 1),
            bounds.height * 0.78 / Math.max(child.height, 1),
          ));
          const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
          // Keep the resolved scale as the relationship baseline so a later
          // layout pass does not restore the stale scale captured at drop time.
          if (parameters.parentAnchor && parameters.childAnchor && parameters.offset
            && (parameters.scale?.x !== fitScale || parameters.scale?.y !== fitScale)) {
            dispatchRelationship({
              type: "update-nested",
              relationshipId: relationship.id,
              changes: {
                parameters: {
                  ...parameters,
                  scale: { x: fitScale, y: fitScale },
                } as RelativeNestedParameters,
              },
            });
            parentsNeedingRerender.add(parent.id);
          }
          next = resolveNestedRelationship(relationship.id, parentFrame, childFrame);
        }
        if (
          Math.abs(child.x - next.x) < 0.01
          && Math.abs(child.y - next.y) < 0.01
          && Math.abs(child.scaleX - next.scaleX) < 0.0001
          && Math.abs(child.scaleY - next.scaleY) < 0.0001
          && Math.abs(child.rotation - next.rotation) < 0.01
        ) return;
        Object.assign(child, next);
      });
      if (parentsNeedingRerender.size > 0) {
        parentsNeedingRerender.forEach((parentId) => {
          const parent = findCanvasNode(parentId);
          if (parent) renderChartNode(parent);
        });
        const rerenderRelationships = Object.values(relationships)
          .filter((relationship) => parentsNeedingRerender.has(relationship.parentChartId))
          .map((relationship) => relationship.id);
        if (rerenderRelationships.length > 0) {
          scheduleNestedChildLayout(rerenderRelationships, { fitToParentMark: true });
        }
      }
    });
  }
  onBeforeUnmount(() => {
    detachPointerListeners();
    compositionFrameAnimations.forEach((animation) => animation.cancel());
    compositionFrameAnimations.clear();
    cancelMoveInteractionSchedule();
    clearCompositionDropZoneSchedule();
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("click", closeContextMenu);
    clearImportNoticeTimer();
    generatedCandidates.value.forEach((candidate) => URL.revokeObjectURL(candidate.src));
  });

  return {
    candidates,
    previewableCandidates,
    implementedTemplateCandidates,
    compositionCandidates,
    filteredCandidates,
    canvasNodes,
    chartRelationships,
    relationshipStore,
    selectedRelationshipEntity,
    viewZoom,
    viewPan,
    selectedIds,
    editingGroupPath,
    selectionScopeNodes,
    editingCompositionId,
    chartDrilldown,
    semanticSelection,
    semanticMarkGroupConfig,
    nestedBindingTarget,
    activeNestedRelationshipId,
    nestedBindingNode,
    nestedBindingColumns,
    nestedBindingSuggestedAngleFields,
    nestedPositionEditor,
    nestedRenderPlacements,
    nestedRenderedChildIds,
    axisBindingTarget,
    axisBindingNode,
    axisBindingColumns,
    axisBindingValue,
    axisBindingSeriesCandidates,
    axisBindingSeriesValue,
    axisBindingEncodingValues,
    axisBindingOptionalCandidates,
    axisBindingRendererError,
    axisBindingAxis,
    axisBindingRelatedCharts,
    coordinateGuideNodes,
    barItemAxisBinding,
    seriesItemMemberIds,
    itemBindingAxis,
    seriesItemDropFrame,
    seriesItemDropBounds,
    interaction,
    contextMenu,
    draggedCandidateId,
    compositionDragSourceId,
    activeDropZone,
    activeDataBindingDropZone,
    dimensionDropTarget,
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
    removeSelectionComposition,
    splitConcatLink,
    exitSelectionHierarchy,
    exitGroupEditing,
    onEditingGroupBackgroundPointerDown,
    onSemanticMarkPointerDown,
    updateSemanticMarkGroupConfig,
    updateAxisBindingMarkGroupConfig,
    updateSelectedChartMarkGroupConfig,
    beginMarkConfigEdit,
    commitMarkConfigEdit,
    applyDimensionRecommendation,
    applyDimensionAggregation,
    applyDimensionChartUpgrade,
    applyDimensionFacet,
    createFacetFromFields,
    applyInputColumnIntent,
    closeDimensionDropDecision,
    applyLlmRenderer,
    onCanvasNodeContextMenu,
    onScaleHandlePointerDown,
    onRotateHandlePointerDown,
    onCoordinateOriginPointerDown,
    onCoordinateAxisScalePointerDown,
    onPolarAnglePointerDown,
    onCoordinateAxisSelect,
    setAxisBindingChannel,
    setAxisSwap,
    setChartAxisAppearance,
    bindMarkField,
    bindAxisField: bindMarkField,
    setAxisBindingAggregation,
    setSingleBarValueOrder,
    setValueFilters,
    setChartDataTransforms,
    resetChartBindingsForDataset,
    setDeckglMapStyle,
    setDeckglMapViewState,
    setDeckglConfig,
    setDeckglEncoding,
    selectCanvasNode,
    clearMarkField,
    clearAxisBinding: clearMarkField,
    confirmSeriesField,
    setChartSeries,
    setSeriesFields,
    clearSeriesBinding,
    bindOptionalEncoding,
    clearOptionalEncoding,
    setChartEncoding,
    setCompositionEncoding,
    bindPolarRadiusField,
    clearPolarRadiusField,
    setPieAngleFields,
    setPolarSegmentFields,
    setValueSeriesFields,
    addBarItemField,
    removeBarItemField,
    setParallelFields,
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
    selectedCoordinateSystems,
    toggleCoordinateSystem,
    createCompositionCandidate,
    createLayer,
    executeComposition,
    createNestedPie,
    confirmNestedBinding,
    closeNestedBinding,
    updateNestedPosition,
    updateNestedChildScale,
    resetNestedPosition,
    closeNestedPositionEditor,
    groupSelectedItems,
    ungroupSelectedItems,
    dissolveSelectedGroups,
    reorderSelectedNodes,
    alignSelection,
    resetCanvasZoom,
  };
}
