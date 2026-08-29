import {
  ref,
  computed,
  nextTick,
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
  ContextMenuState,
  CoordinateSystem,
  IconKind,
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
  ElementOrientation,
  SvgCandidate,
  CompositionType,
  LayerOrderAction,
  AxisBindingTarget,
  EncodingChannel,
  ChartSpec,
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
  DataColumnType,
  MarkGroupSharedConfig,
  Dataset,
  DataRow,
  ChartScaleSpec,
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
import { prepareChartData, rowMatchesChartFilters } from "../utils/chartDataPipeline";
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
import { advancedTemplateDefinitions } from "../utils/advancedChartCards";
import { withD3GalleryThumbnail } from "../utils/d3GalleryThumbnails";
import {
  geographicLayerDefinitions,
  getGeographicLayerFamily,
} from "../utils/geographicLayerCards";
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
  createDefaultDataCandidate,
  defaultChartDataset,
  defaultChartSpecWithAppearance,
  isDefaultChartDataSpec,
  replaceDefaultDataBinding,
  supportsDefaultChartData,
} from "../utils/defaultChartData";

const historyLimit = 50;
const singleBarValueOrderTransformId = "encoding:single-bar:value-order";
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

const polarTemplateSvgs = {
  PieChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(160 90)"><path d="M0 0V-70A70 70 0 0 1 66.6 21.6Z" fill="#2563eb"/><path d="M0 0L66.6 21.6A70 70 0 0 1 -21.6 66.6Z" fill="#059669"/><path d="M0 0L-21.6 66.6A70 70 0 0 1 -56.6 -41.1Z" fill="#d97706"/><path d="M0 0L-56.6 -41.1A70 70 0 0 1 0 -70Z" fill="#dc2626"/><circle cx="0" cy="0" r="4" fill="#fff" opacity=".92"/></g></svg>`,
  DonutChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(160 90) rotate(-90)"><circle r="56" fill="none" stroke="#e2e8f0" stroke-width="28"/><circle r="56" fill="none" stroke="#2563eb" stroke-width="28" stroke-dasharray="132 352"/><circle r="56" fill="none" stroke="#059669" stroke-width="28" stroke-dasharray="91 352" stroke-dashoffset="-132"/><circle r="56" fill="none" stroke="#d97706" stroke-width="28" stroke-dasharray="76 352" stroke-dashoffset="-223"/><circle r="56" fill="none" stroke="#dc2626" stroke-width="28" stroke-dasharray="53 352" stroke-dashoffset="-299"/></g><circle cx="160" cy="90" r="7" fill="#fff" stroke="#cbd5e1" stroke-width="2"/></svg>`,
} as const;

const defaultDataTemplateDefinitions = [
  { id: "builtin-template:line", name: "Single Line", chartType: "LineGraph", coordinateSystem: "Cartesian" },
  { id: "builtin-template:multi-line", name: "Multi-Line Chart", chartType: "MultiLineChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:scatter", name: "Scatterplot", chartType: "Scatterplot", coordinateSystem: "Cartesian" },
  { id: "builtin-template:matrix", name: "Matrix", chartType: "MatrixDiagram", coordinateSystem: "Cartesian" },
  { id: "builtin-template:single-bar", name: "Single Bar", chartType: "SingleBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:grouped-bar", name: "Grouped Bar", chartType: "GroupedBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:stacked-bar", name: "Stacked Bar", chartType: "StackedBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:divergent-bar", name: "Divergent Bar", chartType: "DivergentBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:divergent-stacked-bar", name: "Divergent Stacked Bar", chartType: "DivergentStackedBarChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:area-chart", name: "Area Chart", chartType: "AreaChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:stacked-area-chart", name: "Stacked Area", chartType: "StackedAreaChart", coordinateSystem: "Cartesian" },
  { id: "builtin-template:streamgraph", name: "Streamgraph", chartType: "Streamgraph", coordinateSystem: "Cartesian" },
  { id: "builtin-template:horizon-chart", name: "Horizon Chart", chartType: "HorizonChart", coordinateSystem: "CoordinateFree" },
] satisfies Array<Omit<SvgCandidate, "src" | "svgMarkup">>;

const implementedTemplateDefinitions: SvgCandidate[] = ([
  ...defaultDataTemplateDefinitions.map(createDefaultDataCandidate),
  // Polar templates keep their existing native placeholders for now.
  { id: "builtin-template:pie", name: "Pie Chart", chartType: "PieChart", coordinateSystem: "Polar", svgMarkup: polarTemplateSvgs.PieChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(polarTemplateSvgs.PieChart)}` },
  { id: "builtin-template:donut", name: "Donut", chartType: "DonutChart", coordinateSystem: "Polar", svgMarkup: polarTemplateSvgs.DonutChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(polarTemplateSvgs.DonutChart)}` },
  ...advancedTemplateDefinitions.filter((candidate) => !supportsDefaultChartData(candidate.chartType)),
  ...geographicLayerDefinitions,
] as SvgCandidate[]).map(withD3GalleryThumbnail);

export function createUnboundChartSpec(chartType: string, datasetId: string): ChartSpec {
  return {
    chartType,
    templateId: normalizeChartTemplate(chartType) ?? undefined,
    datasetId,
    encodings: {},
  };
}

export const coordinateOptions: Array<{
  value: CoordinateSystem;
  label: string;
  icon: IconKind;
}> = [
  { value: "Cartesian", label: "Cartesian", icon: "cartesian" },
  { value: "Polar", label: "Polar", icon: "polar" },
  { value: "Geographic", label: "Geographic", icon: "geographic" },
  { value: "CoordinateFree", label: "Free", icon: "coordinate-free" },
];

const defaultGeographicLayerConfig = (layerType: string): GeographicLayerConfig => {
  const family = getGeographicLayerFamily(layerType);
  return family === "point"
    ? { size: 8, color: "#2563eb" }
    : family === "area"
      ? { color: "#2563eb" }
      : {};
};

export const compositionOptions: Array<{
  value: CompositionType;
  label: string;
  description: string;
}> = [
  { value: "layer", label: "Layer", description: "Overlay selected elements" },
  { value: "facet", label: "Facet", description: "Create small multiples from selected elements" },
  { value: "concat", label: "Concat", description: "Arrange selected views together" },
  { value: "nested", label: "Nested", description: "Embed selected elements as parent and child" },
];

type NestedContextRole = "dimension" | "series" | "measure";

function chartRoleFields(spec: ChartSpec, roles: ReadonlySet<NestedContextRole>) {
  const contract = getChartTemplateContract(spec.chartType);
  if (!contract) return [];
  return Array.from(new Set(contract.channels.flatMap((mapping) => {
    if (mapping.role === "style" || !roles.has(mapping.role)) return [];
    if (mapping.role === "series") {
      const encodings = spec.seriesFields?.length
        ? spec.seriesFields
        : spec.series
          ? [spec.series]
          : spec.encodings[mapping.channel]
            ? [spec.encodings[mapping.channel]!]
            : [];
      return encodings.map((encoding) => encoding.field);
    }
    if (mapping.role === "measure" && mapping.channel === "y" && spec.valueFields?.length) {
      return spec.valueFields.map((encoding) => encoding.field);
    }
    if (mapping.role === "measure"
      && (mapping.channel === "theta" || mapping.channel === "angle")
      && spec.angleFields?.length) {
      return spec.angleFields.map((encoding) => encoding.field);
    }
    const encoding = spec.encodings[mapping.channel]
      ?? (mapping.channel === "x" ? spec.encodings.column : undefined)
      ?? (mapping.channel === "y" ? spec.encodings.row : undefined);
    return encoding ? [encoding.field] : [];
  })));
}

/** Fields that define one parent mark and therefore scope its nested child. */
export function getNestedParentContextFields(spec: ChartSpec) {
  const contract = getChartTemplateContract(spec.chartType);
  const hasAggregation = Object.keys(spec.dimensionAggregations ?? {}).length > 0
    || contract?.channels.some((mapping) =>
      mapping.role === "measure" && spec.aggregations?.[mapping.channel] !== undefined) === true;
  const roles = new Set<NestedContextRole>(["dimension", "series"]);
  if (!hasAggregation) roles.add("measure");
  return chartRoleFields(spec, roles);
}

export function canResolveNestedParentField(
  spec: ChartSpec,
  field: string,
  parentRow: DataRow | undefined,
) {
  if (getNestedParentContextFields(spec).includes(field)) return true;
  return normalizeChartTemplate(spec.chartType) === "scatter"
    && parentRow?.[field] !== undefined;
}

function supportsOptionalEncodings(chartType: string) {
  return !!getChartTemplateContract(chartType)?.channels.some((channel) => channel.role === "style");
}

function lineDataEncodings(encodings: ChartSpec["encodings"]): ChartSpec["encodings"] {
  const next = { ...encodings };
  delete next.color;
  delete next.size;
  delete next.shape;
  return next;
}

function migrateLineChartAppearance(spec: ChartSpec) {
  if (spec.renderer?.version === 2 || spec.renderer?.version === 3) return spec;
  const lineGroup = spec.markGroups?.find((group) => group.role === "line");
  const hasLegacyStyleWidth = spec.styleTokens?.lineWidth === 5;
  const hasLegacyGroupWidth = lineGroup?.sharedConfig.strokeWidth === 5
    && lineGroup.sharedConfig.color === undefined;
  if (!hasLegacyStyleWidth && !hasLegacyGroupWidth) return spec;
  return {
    ...spec,
    styleTokens: spec.styleTokens
      ? { ...spec.styleTokens, lineWidth: hasLegacyStyleWidth ? 2.5 : spec.styleTokens.lineWidth }
      : spec.styleTokens,
    markGroups: spec.markGroups?.map((group) => group !== lineGroup || !hasLegacyGroupWidth
      ? group
      : { ...group, sharedConfig: { ...group.sharedConfig, strokeWidth: 2.5 } }),
  };
}

export function getFilterIconSvg(icon: IconKind): string {
  switch (icon) {
    case "cartesian":
      return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5v10.5h10.5" /><path d="M5 11l2.3-2.2 1.9 1.5 3.1-4" /></svg>`;
    case "polar":
      return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /><path d="M8 2.5v11" /><path d="M2.5 8h11" /><path d="M8 3.6a4.4 4.4 0 1 1 0 8.8" /></svg>`;
    case "geographic":
      return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.3" /><path d="M2.9 6.3h10.2" /><path d="M3.3 9.7h9.4" /><path d="M8 2.8c1.9 1.6 2.8 3.4 2.8 5.2S9.9 11.6 8 13.2C6.1 11.6 5.2 9.8 5.2 8S6.1 4.4 8 2.8Z" /></svg>`;
    case "coordinate-free":
      return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10" /><path d="M3 8h10" /><path d="M3 11.5h6.5" /></svg>`;
    default:
      return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 8h10" /><path d="M8 3v10" /></svg>`;
  }
}

export function useCanvasStore(canvasRef: Ref<HTMLElement | null>) {
  type DragTestStage = "transform" | "position" | "position-dropzone" | "full" | null;
  type SelectionTestStage = "cleanup" | "transient" | "drilldown" | "composition-edit" | "scope" | "normalize" | "move" | "relationship" | "selection" | "axis-binding" | "composition" | "full" | null;
  const dragTestStage: DragTestStage = typeof window === "undefined"
    ? null
    : (() => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("drag-transform-only")) return "transform";
      const value = params.get("drag-stage");
      return value === "transform" || value === "position" || value === "position-dropzone" || value === "full"
        ? value
        : null;
    })();
  const selectionTestConfig: { stage: SelectionTestStage; profile: boolean } = typeof window === "undefined"
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
  const clipboardNodes = ref<CanvasNode[]>([]);
  const interaction = ref<Interaction | null>(null);
  let pendingMoveUpdate: { point: Point; interaction: MoveInteraction } | null = null;
  let moveUpdateFrame: number | null = null;
  const nestedPreparedDataCache = new Map<string, {
    sourceDataset: Dataset;
    dataKey: string;
    result: ReturnType<typeof prepareChartData>;
  }>();
  let transformOnlyElements: SVGGElement[] | null = null;
  let pendingDropZoneUpdate: { point: Point; sourceNodeId: string } | null = null;
  let dropZoneUpdateFrame: number | null = null;
  const contextMenu = ref<ContextMenuState | null>(null);
  const draggedCandidateId = ref<string | null>(null);
  const activeDropZone = ref<ChartDropZone | null>(null);
  const compositionDragSourceId = ref<string | null>(null);
  type CompositionEditFrame = Pick<CanvasNode, "x" | "y" | "width" | "height" | "scaleX" | "scaleY" | "rotation">;
  let compositionEditLayout: {
    compositionId: string;
    type: "layer";
    frames: Record<string, CompositionEditFrame>;
  } | null = null;
  const compositionFrameAnimations = new Map<SVGGraphicsElement, Animation>();
  let nestedEnterHover: { key: string; timeoutId: number } | null = null;
  function clearNestedEnterHover() {
    if (nestedEnterHover) window.clearTimeout(nestedEnterHover.timeoutId);
    nestedEnterHover = null;
  }

  function scheduleCompositionDropZone(point: Point, sourceNodeId: string) {
    pendingDropZoneUpdate = { point, sourceNodeId };
    if (dropZoneUpdateFrame !== null) return;
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
      cancelAnimationFrame(dropZoneUpdateFrame);
      dropZoneUpdateFrame = null;
    }
    const pending = pendingDropZoneUpdate;
    pendingDropZoneUpdate = null;
    if (pending && compositionDragSourceId.value === pending.sourceNodeId) {
      activeDropZone.value = compositionDropZoneAtPoint(pending.point, pending.sourceNodeId);
    }
  }
  let nestedDropPath: Array<{ nodeId: string; childMarkIndexes: number[]; groupKey?: string }> = [];
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
  let importNoticeTimer: number | null = null;
  let clipboardPasteCount = 0;
  let nestedRelationshipBaseSnapshot: ChartRelationshipState | null = null;

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
    return {
      relationshipIds: relationships.map((item) => item.id),
      parentName: parent?.name ?? "Parent",
      childName: child?.name.replace(/ nested \d+$/, "") ?? "Child",
      instanceCount: relationships.length,
      parameters: {
        parentAnchor: { ...parameters.parentAnchor },
        childAnchor: { ...parameters.childAnchor },
        offset: { ...parameters.offset },
        retainParent: relationships.every((item) =>
          (item.parameters as Partial<RelativeNestedParameters>).retainParent !== false),
      },
    };
  });

  // --- helpers ---
  function getRootNode(nodeId: string) {
    return canvasNodes.value.find((n) => n.id === nodeId) ?? null;
  }
  function findCanvasNode(nodeId: string, nodes = canvasNodes.value): CanvasNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.kind === "group") {
        const nested = findCanvasNode(nodeId, node.children);
        if (nested) return nested;
      }
    }
    return null;
  }
  function walkCanvasNodes(nodes = canvasNodes.value): CanvasNode[] {
    return nodes.flatMap((node) => [node, ...(node.kind === "group" ? walkCanvasNodes(node.children) : [])]);
  }
  function parentGroupIdForNode(nodeId: string, nodes = canvasNodes.value, parentGroupId?: string): string | undefined {
    for (const node of nodes) {
      if (node.id === nodeId) return parentGroupId;
      if (node.kind !== "group") continue;
      const nestedParentId = parentGroupIdForNode(nodeId, node.children, node.id);
      if (nestedParentId !== undefined) return nestedParentId;
    }
    return undefined;
  }

  function registerChartRelationship(
    node: CanvasNode,
    metadata?: {
      instanceKind?: "canvas" | "facet-cell" | "nested-child" | "virtual";
      sourceChartId?: string;
      facetKey?: string;
      chartType?: string;
      datasetId?: string | null;
      sourceTemplateId?: string;
    },
  ) {
    const candidate = node.kind === "leaf" ? getCandidate(node.candidateId) : null;
    const chartType = node.chartSpec?.chartType ?? metadata?.chartType ?? candidate?.chartType;
    if (!chartType || (!node.chartSpec && !node.coordinateGuide)) return null;
    const instanceKind = metadata?.instanceKind ?? chartRelationships.value.charts[node.id]?.instanceKind ?? "canvas";
    // Embedded children are positioned by their relationship and never share
    // canvas axes. Avoid creating unused axis bindings for every nested copy.
    const channels: CoordinateChannel[] = instanceKind === "nested-child"
      ? []
      : getChartTemplateContract(chartType)?.shareableChannels
        ?? (node.coordinateGuide?.type === "Cartesian"
          ? ["x", "y"]
          : node.coordinateGuide?.type === "Polar"
            ? ["angle", "radius"]
            : []);
    dispatchRelationship({
      type: "register-chart",
      chart: {
        id: node.id,
        nodeId: node.id,
        chartType,
        datasetId: node.chartSpec?.datasetId ?? metadata?.datasetId ?? null,
        instanceKind,
        sourceChartId: metadata?.sourceChartId ?? chartRelationships.value.charts[node.id]?.sourceChartId,
        sourceTemplateId: metadata?.sourceTemplateId
          ?? (node.kind === "leaf" ? node.candidateId : chartRelationships.value.charts[node.id]?.sourceTemplateId),
        facetKey: metadata?.facetKey ?? chartRelationships.value.charts[node.id]?.facetKey,
      },
      coordinateGuide: node.coordinateGuide,
      channels,
    });
    if (node.chartSpec?.markGroups) {
      const normalizedGroups = node.chartSpec.markGroups.map((group) => ({
        ...group,
        id: `mark-group:${node.id}:${group.role}`,
        chartId: node.id,
        memberKeys: [...group.memberKeys],
        sharedConfig: { ...group.sharedConfig },
      }));
      node.chartSpec = { ...node.chartSpec, markGroups: normalizedGroups };
      dispatchRelationship({ type: "sync-mark-groups", chartId: node.id, groups: normalizedGroups });
    }
    return chartRelationships.value.charts[node.id] ?? null;
  }

  function relationshipCoordinateSystem(nodeId: string): CoordinateSystemSpec | null {
    const sourceNode = findCanvasNode(nodeId);
    const axisEntries = axesForChart(nodeId);
    if (axisEntries.length === 0) return null;
    const memberChannels = new Map<string, CoordinateChannel[]>();
    const sharedChannels: CoordinateChannel[] = [];
    const sharedAxisIds: string[] = [];
    axisEntries.forEach(({ axis, binding }) => {
      const linkedCharts = chartsForAxis(axis.id);
      if (linkedCharts.length > 1) {
        sharedChannels.push(binding.channel);
        sharedAxisIds.push(axis.id);
      }
      linkedCharts.forEach(({ chart, binding: linkedBinding }) => {
        if (!chart.nodeId) return;
        memberChannels.set(chart.nodeId, Array.from(new Set([
          ...(memberChannels.get(chart.nodeId) ?? []),
          linkedBinding.channel,
        ])));
      });
    });
    if (!memberChannels.has(nodeId)) {
      memberChannels.set(nodeId, axisEntries.map(({ binding }) => binding.channel));
    }
    const currentOwnerNodeId = findCanvasNode(nodeId)?.coordinateSystem?.ownerNodeId;
    const ownerNodeId = currentOwnerNodeId && memberChannels.has(currentOwnerNodeId)
      ? currentOwnerNodeId
      : sharedAxisIds.length > 0
        ? chartsForAxis(sharedAxisIds[0]!)[0]?.chart.nodeId ?? nodeId
        : nodeId;
    const compositionMembers = sourceNode?.compositionSpec?.members
      .map((member) => findCanvasNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member) ?? [];
    const polarMembers = [sourceNode, ...compositionMembers]
      .filter((member, index, all): member is CanvasNode => !!member && all.findIndex((candidate) => candidate?.id === member.id) === index);
    const polarOuterRadius = axisEntries[0]?.axis.coordinateType === "Polar"
      ? Math.max(0, ...polarMembers.map((member) => getPolarOccupiedGeometry(member)?.outerRadius ?? 0))
      : 0;
    return {
      id: sharedAxisIds.length > 0
        ? `coordinate:${sharedAxisIds.slice().sort().join("|")}`
        : `coordinate:${nodeId}`,
      type: axisEntries[0]!.axis.coordinateType,
      ownerNodeId,
      members: Array.from(memberChannels, ([memberNodeId, channels]) => ({ nodeId: memberNodeId, channels })),
      sharedChannels: Array.from(new Set(sharedChannels)),
      ...(polarOuterRadius > 0 ? { polarOuterRadius } : {}),
    };
  }

  function coordinateSystemForNode(nodeId: string): CoordinateSystemSpec | null {
    const related = relationshipCoordinateSystem(nodeId);
    if (related) return related;
    const direct = findCanvasNode(nodeId)?.coordinateSystem;
    if (direct) return direct;
    return walkCanvasNodes()
      .map((node) => node.coordinateSystem)
      .find((system) => system?.members.some((member) => member.nodeId === nodeId)) ?? null;
  }

  /**
   * Resolve the blocks affected by an edit to a coordinate channel. Composition
   * membership is deliberately checked before relationship axes: facet blocks
   * have independent axes, while their coordinate frame is still edited as one
   * composition; concat only shares the declared partition axis.
   */
  function compositionCoordinateTargets(nodeId: string, channel: CoordinateChannel): CanvasNode[] | null {
    const source = findCanvasNode(nodeId);
    const spec = source?.compositionSpec;
    if (!source || !spec || spec.type === "nested") return null;
    const members = spec.members
      .map((member) => findCanvasNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member);
    if (members.length === 0) return null;
    // Entering a layer only separates its members spatially. Its shared
    // coordinate contract remains active while the members are edited.
    if (editingCompositionId.value === spec.id && spec.type === "concat") return [source];
    if (spec.type === "concat") {
      const links = concatLinksFor(spec);
      if (links.length > 0) {
        const channelLinks = links.filter((link) => link.sharedChannels.includes(channel));
        if (channelLinks.length === 0) return [source];
        const ids = new Set<string>();
        const adjacency = new Map<string, Set<string>>();
        channelLinks.forEach((link) => {
          const targetSet = adjacency.get(link.targetNodeId) ?? new Set<string>();
          targetSet.add(link.sourceNodeId);
          adjacency.set(link.targetNodeId, targetSet);
          const sourceSet = adjacency.get(link.sourceNodeId) ?? new Set<string>();
          sourceSet.add(link.targetNodeId);
          adjacency.set(link.sourceNodeId, sourceSet);
        });
        const queue = [nodeId];
        ids.add(nodeId);
        while (queue.length > 0) {
          const current = queue.shift()!;
          adjacency.get(current)?.forEach((next) => {
            if (ids.has(next)) return;
            ids.add(next);
            queue.push(next);
          });
        }
        const channelTargets = members.filter((member) => ids.has(member.id));
        return channelTargets.length > 0 ? channelTargets : [source];
      }
    }
    if ((spec.type === "concat" || spec.type === "layer") && !spec.sharedChannels.includes(channel)) return [source];
    return members;
  }

  function coordinateTargets(nodeId: string, channel: CoordinateChannel) {
    const source = findCanvasNode(nodeId);
    if (!source) return [];
    const compositionTargets = compositionCoordinateTargets(nodeId, channel);
    if (compositionTargets) return compositionTargets;
    const binding = bindingForChartChannel(nodeId, channel);
    if (binding) {
      return chartsForAxis(binding.axisId)
        .map(({ chart }) => chart.nodeId ? findCanvasNode(chart.nodeId) : null)
        .filter((node): node is CanvasNode => !!node);
    }
    const system = coordinateSystemForNode(nodeId);
    if (!system || !system.sharedChannels.includes(channel)) return [source];
    return system.members
      .filter((member) => member.channels.includes(channel))
      .map((member) => findCanvasNode(member.nodeId))
      .filter((node): node is CanvasNode => !!node);
  }
  function renderCoordinateTargets(node: CanvasNode, targets: CanvasNode[]) {
    if (node.compositionSpec?.type === "layer") {
      const owner = findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? node;
      renderSharedCoordinateComposition(owner);
      return;
    }
    targets.forEach((member) => renderChartNode(
      member,
      editingCompositionId.value === member.compositionSpec?.id ? false : true,
    ));
  }
  function standaloneCoordinateSystem(node: CanvasNode): CoordinateSystemSpec | null {
    if (!node.chartSpec || !node.coordinateGuide) return null;
    const contract = getChartTemplateContract(node.chartSpec.chartType);
    if (!contract || contract.shareableChannels.length === 0) return null;
    return {
      id: `coordinate:${node.id}`,
      type: contract.coordinateSystem,
      ownerNodeId: node.id,
      members: [{ nodeId: node.id, channels: [...contract.shareableChannels] }],
      sharedChannels: [],
    };
  }
  function reconcileCoordinateSystems(nodes = canvasNodes.value) {
    const all = walkCanvasNodes(nodes);
    const liveIds = new Set(all.map((node) => node.id));
    const systems = new Map<string, CoordinateSystemSpec>();
    all.forEach((node) => {
      const system = node.coordinateSystem;
      if (!system) return;
      const canonical = systems.get(system.id) ?? system;
      canonical.members = canonical.members.filter((member) => liveIds.has(member.nodeId));
      if (!liveIds.has(canonical.ownerNodeId)) canonical.ownerNodeId = canonical.members[0]?.nodeId ?? node.id;
      systems.set(system.id, canonical);
      node.coordinateSystem = canonical;
    });
    const compositions = new Map<string, NonNullable<CanvasNode["compositionSpec"]>>();
    all.forEach((node) => {
      const spec = node.compositionSpec;
      if (spec && !compositions.has(spec.id)) compositions.set(spec.id, spec);
    });
    compositions.forEach((spec) => {
      spec.members = spec.members.filter((member) => liveIds.has(member.nodeId));
    });
    all.forEach((node) => {
      const spec = node.compositionSpec ? compositions.get(node.compositionSpec.id) : null;
      node.compositionSpec = spec && spec.members.length > 1 ? spec : null;
    });
    reconcileRelationshipNodes(nodes);
  }

  function liftCompositionChild(group: CanvasGroupNode, child: CanvasNode) {
    const groupCenter = {
      x: group.x + group.width * group.scaleX / 2,
      y: group.y + group.height * group.scaleY / 2,
    };
    const childCenter = {
      x: group.x + (child.x + child.width * child.scaleX / 2) * group.scaleX,
      y: group.y + (child.y + child.height * child.scaleY / 2) * group.scaleY,
    };
    const radians = group.rotation * Math.PI / 180;
    const dx = childCenter.x - groupCenter.x;
    const dy = childCenter.y - groupCenter.y;
    const rotatedCenter = {
      x: groupCenter.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: groupCenter.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
    const scaleX = child.scaleX * group.scaleX;
    const scaleY = child.scaleY * group.scaleY;
    return {
      ...child,
      x: rotatedCenter.x - child.width * scaleX / 2,
      y: rotatedCenter.y - child.height * scaleY / 2,
      scaleX,
      scaleY,
      rotation: child.rotation + group.rotation,
    } satisfies CanvasNode;
  }

  function migrateIndependentViewGroups(nodes: CanvasNode[]): CanvasNode[] {
    return nodes.flatMap((node) => {
      if (node.coordinateSystem && (node.coordinateSystem.type as string) === "None") {
        node.coordinateSystem.type = "CoordinateFree";
      }
      if (node.kind !== "group") return [node];
      const sourceComposition = node.compositionSpec;
      const type = sourceComposition?.type;
      const childIds = new Set(node.children.map((child) => child.id));
      const containsCompositionMembers = sourceComposition?.members.some((member) => childIds.has(member.nodeId)) ?? false;
      const isIndependentViewWrapper = (type === "facet" || type === "concat") && containsCompositionMembers;
      const isLayer = type === "layer" && containsCompositionMembers;
      if (!sourceComposition || (!isIndependentViewWrapper && !isLayer)) {
        node.children = migrateIndependentViewGroups(node.children);
        return [node];
      }
      const children = node.children.map((child) => liftCompositionChild(node, child));
      const layerOwner = isLayer
        ? children.find((child) => child.id === node.coordinateSystem?.ownerNodeId) ?? children[0]
        : null;
      if (layerOwner) {
        children.forEach((child) => {
          child.x = layerOwner.x;
          child.y = layerOwner.y;
          child.width = layerOwner.width;
          child.height = layerOwner.height;
          child.scaleX = layerOwner.scaleX;
          child.scaleY = layerOwner.scaleY;
          child.rotation = layerOwner.rotation;
          child.coordinateGuide = layerOwner.coordinateGuide
            ? { ...layerOwner.coordinateGuide, origin: { ...layerOwner.coordinateGuide.origin } }
            : layerOwner.coordinateGuide;
        });
      }
      const compositionSpec = {
        ...sourceComposition,
        members: sourceComposition.members.map((member) => ({ ...member, sharedChannels: [...member.sharedChannels] })),
        sharedChannels: [...sourceComposition.sharedChannels],
        facetValues: sourceComposition.facetValues ? [...sourceComposition.facetValues] : undefined,
        facetGrid: sourceComposition.facetGrid
          ? { ...sourceComposition.facetGrid, rowValues: [...sourceComposition.facetGrid.rowValues], columnValues: [...sourceComposition.facetGrid.columnValues] }
          : undefined,
      };
      const coordinateSystem = node.coordinateSystem
        ? { ...node.coordinateSystem, ownerNodeId: layerOwner?.id ?? children[0]?.id ?? node.coordinateSystem.ownerNodeId }
        : null;
      if (coordinateSystem) coordinateSystem.members = coordinateSystem.members.map((member) => ({ ...member, channels: [...member.channels] }));
      children.forEach((child) => {
        child.compositionSpec = compositionSpec;
        child.coordinateSystem = coordinateSystem;
      });
      if (isLayer && node.nestedSpec) {
        const pointGroup = children.find((child) =>
          getChartTemplateContract(child.chartSpec?.chartType ?? "")?.markRole === "point",
        );
        if (pointGroup) pointGroup.nestedSpec = {
          ...node.nestedSpec,
          parentRowKeys: node.nestedSpec.parentRowKeys ? [...node.nestedSpec.parentRowKeys] : undefined,
          valueFields: [...node.nestedSpec.valueFields],
          parentChartNodeId: pointGroup.id,
        };
      }
      return children;
    });
  }
  function getGroupsAtPath(path = editingGroupPath.value): CanvasGroupNode[] {
    let nodes = canvasNodes.value;
    const groups: CanvasGroupNode[] = [];
    for (const id of path) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node || node.kind !== "group") return [];
      groups.push(node);
      nodes = node.children;
    }
    return groups;
  }
  function getGroupAtPath(path = editingGroupPath.value): CanvasGroupNode | null {
    return getGroupsAtPath(path).at(-1) ?? null;
  }
  function getSelectionScopeNodes() {
    return getGroupAtPath()?.children ?? canvasNodes.value;
  }
  function nestedSelectionRelationships(selectionId: string): NestedRelationship[] {
    const relationships = Object.values(chartRelationships.value.nestedRelationships)
      .filter((relationship) => relationship.status === "active");
    const unitKeys = new Map<string, NestedRelationship[]>();
    relationships.forEach((relationship) => {
      const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
      const key = parameters.batchId ?? relationship.id;
      const current = unitKeys.get(key) ?? [];
      current.push(relationship);
      unitKeys.set(key, current);
    });
    for (const [key, members] of unitKeys) {
      if (`nested-unit:${key}` === selectionId) return members;
    }
    return [];
  }

  function topLevelSelectionNodeId(nodeId: string) {
    let current = nodeId;
    const seen = new Set<string>();
    while (!seen.has(current)) {
      seen.add(current);
      const parent = Object.values(chartRelationships.value.nestedRelationships).find((relationship) =>
        relationship.status === "active" && relationship.childChartId === current,
      )?.parentChartId;
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  function currentDropZoneScopeNodes() {
    const scopeNodes = getSelectionScopeNodes();
    const entered = nestedDropPath.at(-1);
    if (entered) {
      const node = scopeNodes.find((candidate) => candidate.id === entered.nodeId)
        ?? findCanvasNode(entered.nodeId);
      return node ? [node] : [];
    }
    if (editingCompositionId.value) {
      const compositionNodes = scopeNodes.filter((node) => node.compositionSpec?.id === editingCompositionId.value);
      if (compositionNodes.length > 0) return compositionNodes;
    }
    const nestedChildIds = new Set(Object.values(chartRelationships.value.nestedRelationships)
      .filter((relationship) => relationship.status === "active")
      .map((relationship) => relationship.childChartId));
    const visible = scopeNodes.filter((node) => !nestedChildIds.has(node.id));
    // A composed chart is one interaction target until the author explicitly
    // enters its editing level. Keep only its coordinate owner at this level.
    const representatives = new Map<string, CanvasNode>();
    visible.forEach((node) => {
      const composition = node.compositionSpec;
      if (!composition || editingCompositionId.value === composition.id) {
        representatives.set(node.id, node);
        return;
      }
      if (composition.type === "concat") {
        representatives.set(node.id, node);
        return;
      }
      if (node.kind === "group" && (composition.type === "facet" || composition.type === "nested")) {
        representatives.set(composition.id, node);
        return;
      }
      const ownerId = node.coordinateSystem?.ownerNodeId
        ?? composition.members[0]?.nodeId
        ?? node.id;
      if (!representatives.has(composition.id) && ownerId === node.id) representatives.set(composition.id, node);
    });
    return Array.from(representatives.values());
  }

  const selectionScopeNodes = computed(() => getSelectionScopeNodes());
  function getSelectionNode(nodeId: string) {
    return getSelectionScopeNodes().find((node) => node.id === nodeId) ?? null;
  }

  function canvasNodesWithRestoredCompositionLayout(nodes = canvasNodes.value) {
    if (!compositionEditLayout) return nodes;
    const clones = nodes.map((node) => cloneCanvasNode(node));
    const visit = (items: CanvasNode[]) => items.forEach((node) => {
      const frame = compositionEditLayout?.frames[node.id];
      if (frame) Object.assign(node, frame);
      if (node.kind === "group") visit(node.children);
    });
    visit(clones);
    return clones;
  }

  function compositionElementTransform(element: SVGGraphicsElement) {
    const computedTransform = window.getComputedStyle(element).transform;
    if (computedTransform && computedTransform !== "none") return computedTransform;
    const matrix = element.transform.baseVal.consolidate()?.matrix;
    return matrix
      ? `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`
      : "none";
  }

  function animateCompositionFrameChange(nodeIds: string[], apply: () => void) {
    const canvas = canvasRef.value;
    const idSet = new Set(nodeIds);
    const snapshots = canvas
      ? Array.from(canvas.querySelectorAll<SVGGraphicsElement>(
        ".canvas-object[data-node-id], .canvas-coordinate-system-node[data-coordinate-node-id]",
      )).flatMap((element) => {
        const nodeId = element.getAttribute("data-node-id")
          ?? element.getAttribute("data-coordinate-node-id");
        if (!nodeId || !idSet.has(nodeId)) return [];
        const transform = compositionElementTransform(element);
        compositionFrameAnimations.get(element)?.cancel();
        compositionFrameAnimations.delete(element);
        return [{ element, transform }];
      })
      : [];

    apply();
    if (snapshots.length === 0) return;
    void nextTick(() => {
      snapshots.forEach(({ element, transform }) => {
        if (!element.isConnected || typeof element.animate !== "function") return;
        const targetTransform = compositionElementTransform(element);
        if (targetTransform === transform) return;
        const animation = element.animate(
          [{ transform }, { transform: targetTransform }],
          { duration: 360, easing: "cubic-bezier(0.2, 0.75, 0.2, 1)" },
        );
        compositionFrameAnimations.set(element, animation);
        const cleanup = () => {
          if (compositionFrameAnimations.get(element) === animation) {
            compositionFrameAnimations.delete(element);
          }
        };
        animation.onfinish = cleanup;
        animation.oncancel = cleanup;
      });
    });
  }

  function restoreCompositionEditLayout(animate = false) {
    const layout = compositionEditLayout;
    compositionEditLayout = null;
    if (!layout) return;
    const restore = () => Object.entries(layout.frames).forEach(([nodeId, frame]) => {
      const node = findCanvasNode(nodeId);
      if (node) Object.assign(node, frame);
    });
    if (animate) animateCompositionFrameChange(Object.keys(layout.frames), restore);
    else restore();
  }

  function spreadLayerCompositionForEditing(composition: NonNullable<CanvasNode["compositionSpec"]>) {
    const members = composition.members
      .map((member) => getSelectionNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member);
    if (members.length < 2) return;
    const frames = Object.fromEntries(members.map((member) => [member.id, {
      x: member.x,
      y: member.y,
      width: member.width,
      height: member.height,
      scaleX: member.scaleX,
      scaleY: member.scaleY,
      rotation: member.rotation,
    }]));
    const layout = { compositionId: composition.id, type: "layer" as const, frames };
    compositionEditLayout = layout;
    // Keep the layer's merged domains and common plot geometry; editing only
    // changes the members' outer canvas positions.
    renderSharedCoordinateComposition(members[0]!);
    const widths = members.map((member) => collectNodeSelectionBounds(member).width);
    const gap = Math.max(24, Math.min(72, Math.max(...widths) * 0.16));
    const anchor = collectNodeSelectionBounds(members[0]!);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (members.length - 1);
    let cursor = anchor.minX + anchor.width / 2 - totalWidth / 2;
    const placements = members.map((member, index) => {
      const bounds = collectNodeSelectionBounds(member);
      const placement = { member, x: member.x + cursor - bounds.minX };
      cursor += widths[index]! + gap;
      return placement;
    });
    // Let Vue materialize a coordinate layer for every editing member at the
    // original overlaid frame before moving the charts and axes together.
    void nextTick(() => {
      if (compositionEditLayout !== layout || editingCompositionId.value !== composition.id) return;
      animateCompositionFrameChange(members.map((member) => member.id), () => {
        placements.forEach(({ member, x }) => { member.x = x; });
      });
    });
  }

  function beginCompositionEditing(composition: NonNullable<CanvasNode["compositionSpec"]>) {
    if (composition.type !== "layer" && composition.type !== "concat") return false;
    if (editingCompositionId.value === composition.id) return true;
    restoreCompositionEditLayout();
    editingCompositionId.value = composition.id;
    if (composition.type === "layer") spreadLayerCompositionForEditing(composition);
    selectedIds.value = [];
    semanticSelection.value = null;
    chartDrilldown.value = null;
    axisBindingTarget.value = null;
    return true;
  }

  function finishCompositionEditing(selectParent = true) {
    const compositionId = editingCompositionId.value;
    if (!compositionId) return false;
    restoreCompositionEditLayout(true);
    editingCompositionId.value = null;
    const member = getSelectionScopeNodes().find((candidate) => candidate.compositionSpec?.id === compositionId);
    setSelection(selectParent && member ? [member.id] : []);
    semanticSelection.value = null;
    axisBindingTarget.value = null;
    if (member) renderSharedCoordinateComposition(member);
    return true;
  }

  function editingCartesianConcat(node: CanvasNode | null | undefined) {
    const composition = node?.compositionSpec;
    return node?.coordinateGuide?.type === "Cartesian"
      && composition?.type === "concat"
      && editingCompositionId.value === composition.id
      && (composition.direction === "horizontal" || composition.direction === "vertical")
      ? composition
      : null;
  }

  function concatEditableAxis(node: CanvasNode | null | undefined): "x" | "y" | null {
    const composition = editingCartesianConcat(node);
    return composition?.direction === "horizontal"
      ? "x"
      : composition?.direction === "vertical" ? "y" : null;
  }

  function coordinateTransformItemIds(itemIds: string[]) {
    const expanded = new Set<string>();
    itemIds.forEach((id) => {
      const nestedRelationships = id.startsWith("nested-unit:")
        ? nestedSelectionRelationships(id)
        : [];
      if (nestedRelationships.length > 0) {
        nestedRelationships.forEach((relationship) => {
          expanded.add(relationship.parentChartId);
          expanded.add(relationship.childChartId);
        });
        return;
      }
      const node = getSelectionNode(id);
      const composition = node?.compositionSpec;
      if (!node) return;
      if (composition && editingCompositionId.value !== composition.id) {
        if (composition.type === "concat") {
          concatGraphMembers(composition).forEach((memberId) => {
            if (getSelectionNode(memberId)) expanded.add(memberId);
          });
          return;
        }
        composition.members.forEach((member) => {
          if (getSelectionNode(member.nodeId)) expanded.add(member.nodeId);
        });
        return;
      }
      expanded.add(id);
    });
    return Array.from(expanded);
  }
  function replaceSelectionScopeNodes(nodes: CanvasNode[]) {
    const group = getGroupAtPath();
    if (group) group.children = nodes;
    else canvasNodes.value = nodes;
  }
  function toGroupLocalPoint(groupId: string, clientX: number, clientY: number): Point {
    const elements = canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]");
    const element = Array.from(elements ?? []).find((candidate) => candidate.dataset.nodeId === groupId);
    const matrix = element?.getScreenCTM();
    if (matrix && typeof DOMPoint !== "undefined") {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    }
    return toCanvasPoint(clientX, clientY);
  }
  function toSelectionScopePoint(clientX: number, clientY: number, groupId: string | null | undefined = editingGroupPath.value.at(-1)) {
    return groupId ? toGroupLocalPoint(groupId, clientX, clientY) : toCanvasPoint(clientX, clientY);
  }
  type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
  const identityMatrix = (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
    return {
      a: left.a * right.a + left.c * right.b,
      b: left.b * right.a + left.d * right.b,
      c: left.a * right.c + left.c * right.d,
      d: left.b * right.c + left.d * right.d,
      e: left.a * right.e + left.c * right.f + left.e,
      f: left.b * right.e + left.d * right.f + left.f,
    };
  }
  function invertMatrix(matrix: Matrix): Matrix | null {
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
    return {
      a: matrix.d / determinant,
      b: -matrix.b / determinant,
      c: -matrix.c / determinant,
      d: matrix.a / determinant,
      e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
      f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
    };
  }
  function groupMatrix(group: CanvasGroupNode): Matrix {
    const radians = group.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const cx = group.width / 2;
    const cy = group.height / 2;
    const a = cos * group.scaleX;
    const b = sin * group.scaleX;
    const c = -sin * group.scaleY;
    const d = cos * group.scaleY;
    return {
      a,
      b,
      c,
      d,
      e: group.x + cx * group.scaleX - a * cx - c * cy,
      f: group.y + cy * group.scaleY - b * cx - d * cy,
    };
  }
  function transformPoint(matrix: Matrix, point: Point): Point {
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
  }
  // The visible model-space rectangle moves when the viewport is panned.
  // Keeping this conversion in one place prevents drops and interactions from
  // being clamped to the old, untransformed 0..viewport range.
  function getCanvasViewport() {
    const canvas = canvasRef.value;
    const rect = canvas?.getBoundingClientRect();
    return {
      left: (rect?.left ?? 0) + (canvas?.clientLeft ?? 0),
      top: (rect?.top ?? 0) + (canvas?.clientTop ?? 0),
      width: canvas?.clientWidth ?? 0,
      height: canvas?.clientHeight ?? 0,
    };
  }
  function getCanvasBounds(): Bounds {
    const viewport = getCanvasViewport();
    const zoom = Math.max(viewZoom.value, 0.0001);
    const minX = -viewPan.value.x / zoom;
    const minY = -viewPan.value.y / zoom;
    const maxX = (viewport.width - viewPan.value.x) / zoom;
    const maxY = (viewport.height - viewPan.value.y) / zoom;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
  function getSelectionScopeBounds(): Bounds {
    const group = getGroupAtPath();
    return group
      ? { minX: 0, minY: 0, maxX: group.width, maxY: group.height, width: group.width, height: group.height }
      : getCanvasBounds();
  }
  function toCanvasPoint(clientX: number, clientY: number): Point {
    const viewport = getCanvasViewport();
    const screenX = clientX - viewport.left;
    const screenY = clientY - viewport.top;
    return { x: (screenX - viewPan.value.x) / viewZoom.value, y: (screenY - viewPan.value.y) / viewZoom.value };
  }
  function toNodeLocalPoint(node: CanvasNode, point: Point): Point {
    const center = {
      x: node.x + node.width * node.scaleX / 2,
      y: node.y + node.height * node.scaleY / 2,
    };
    const radians = -node.rotation * Math.PI / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const unrotated = {
      x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
    return {
      x: (node.kind === "leaf" ? node.contentMinX : 0) + (unrotated.x - node.x) / node.scaleX,
      y: (node.kind === "leaf" ? node.contentMinY : 0) + (unrotated.y - node.y) / node.scaleY,
    };
  }
  function nodeLocalToSelectionScopePoint(node: CanvasNode, point: Point): Point {
    const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
    const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
    const localCenter = {
      x: localMinX + node.width / 2,
      y: localMinY + node.height / 2,
    };
    const worldCenter = {
      x: node.x + node.width * node.scaleX / 2,
      y: node.y + node.height * node.scaleY / 2,
    };
    const radians = node.rotation * Math.PI / 180;
    const dx = (point.x - localCenter.x) * node.scaleX;
    const dy = (point.y - localCenter.y) * node.scaleY;
    return {
      x: worldCenter.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: worldCenter.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  }
  function seriesItemMemberCount(node: CanvasNode) {
    const binding = barItemAxisBinding(node);
    if (!binding || !node.chartSpec) return 0;
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
    return members.size;
  }
  function seriesItemDropFrame(node: CanvasNode) {
    const selection = getNodeSelectionBounds(node);
    const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
    const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
    const selectionTopLeft = {
      x: node.x + (selection.minX - localMinX) * node.scaleX,
      y: node.y + (selection.minY - localMinY) * node.scaleY,
    };
    const selectionWidth = selection.width * node.scaleX;
    const width = Math.min(280, Math.max(252, selectionWidth));
    const memberRows = Math.max(seriesItemMemberCount(node), 1);
    const height = 30 + memberRows * 30;
    const center = {
      x: selectionTopLeft.x + width / 2,
      y: selectionTopLeft.y + selection.height * node.scaleY / 2,
    };
    return {
      x: selectionTopLeft.x,
      y: selectionTopLeft.y - height,
      width,
      height,
      rotation: node.rotation,
      center,
    };
  }
  function seriesItemDropBounds(node: CanvasNode): Bounds {
    const frame = seriesItemDropFrame(node);
    const radians = frame.rotation * Math.PI / 180;
    const rotate = (point: Point) => {
      const dx = point.x - frame.center.x;
      const dy = point.y - frame.center.y;
      return {
        x: frame.center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: frame.center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
      };
    };
    const corners = [
      rotate({ x: frame.x, y: frame.y }),
      rotate({ x: frame.x + frame.width, y: frame.y }),
      rotate({ x: frame.x, y: frame.y + frame.height }),
      rotate({ x: frame.x + frame.width, y: frame.y + frame.height }),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    return { ...bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
  }
  function pointInBounds(point: Point, bounds: Bounds) {
    return point.x >= bounds.minX && point.x <= bounds.maxX
      && point.y >= bounds.minY && point.y <= bounds.maxY;
  }
  function getCandidate(candidateId: string) {
    return implementedTemplateDefinitions.find((c) => c.id === candidateId)
      ?? generatedCandidates.value.find((c) => c.id === candidateId)
      ?? candidates.find((c) => c.id === candidateId);
  }

  function pointToSegmentDistance(point: Point, start: Point, end: Point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.0001) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
  }

  function polarPointAtAngle(origin: Point, radius: number, degrees: number): Point {
    const radians = degrees * Math.PI / 180;
    return { x: origin.x + Math.cos(radians) * radius, y: origin.y - Math.sin(radians) * radius };
  }

  function dataBindingDropZoneAtPoint(point: Point, payload: CsvColumnDragPayload): DataBindingDropZone | null {
    const geographicTarget = [...getSelectionScopeNodes()].reverse().find((node) => {
      if (node.layerKind !== "deckgl") return false;
      const supportedLayer = node.deckglLayerType === "GeoJsonLayer"
        || node.deckglLayerType === "PolygonLayer"
        || node.deckglLayerType === "SolidPolygonLayer"
        || node.deckglLayerType === "ScatterplotLayer";
      if (!supportedLayer) return false;
      const local = toNodeLocalPoint(node, point);
      const minX = node.kind === "leaf" ? node.contentMinX : 0;
      const minY = node.kind === "leaf" ? node.contentMinY : 0;
      return local.x >= minX && local.x <= minX + node.width
        && local.y >= minY && local.y <= minY + node.height;
    });
    if (geographicTarget) {
      const dataset = getDataset(payload.datasetId);
      const source = activeGeometrySource.value;
      const column = dataset?.columns.find((item) => item.name === payload.field);
      const usableFeatures = source?.features.filter((feature) =>
        geographicTarget.deckglLayerType === "ScatterplotLayer"
          || feature.geometry.type === "Polygon"
          || feature.geometry.type === "MultiPolygon") ?? [];
      const geometryIds = new Set(usableFeatures.flatMap(geoJsonFeatureIds));
      const hasMatch = !!dataset && !!column && dataset.rows.some((row) => geometryIds.has((row[payload.field] ?? "").trim()));
      return {
        type: "geographic-body",
        targetNodeId: geographicTarget.id,
        fieldName: payload.field,
        compatible: !!source && column?.type === payload.type && hasMatch,
        bounds: collectNodeSelectionBounds(geographicTarget),
      };
    }
    const threshold = 18 / Math.max(viewZoom.value, 0.0001);
    let nearestZone: DataBindingDropZone | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    getSelectionScopeNodes().forEach((node) => {
      const spec = node.chartSpec;
      const guide = node.coordinateGuide;
      if (!spec) return;
      const inputSpec = isDefaultChartDataSpec(spec) || spec.defaultDataBinding === true
        ? replaceDefaultDataBinding(spec, payload.datasetId)
        : spec;
      const dataset = getDataset(inputSpec.datasetId);
      const column = dataset?.columns.find((item) => item.name === payload.field);
      const itemBinding = barItemAxisBinding(node);
      if (inputSpec.datasetId === payload.datasetId && column?.type === payload.type && itemBinding) {
        const bounds = seriesItemDropBounds(node);
        if (pointInBounds(point, bounds)) {
          const categoricalFields = seriesItemCategoricalFields(inputSpec);
          const categoricalMode = categoricalFields.length > 0;
          const quantitativeMode = (inputSpec.valueFields?.length ?? 0) > 0;
          const polarChart = normalizeChartTemplate(spec.chartType) === "pie"
            || normalizeChartTemplate(spec.chartType) === "donut";
          const polarSegmentField = inputSpec.encodings.segment?.field;
          const polarMeasureSet = (inputSpec.angleFields?.length ?? 0) > 0;
          const compatible = polarChart
            ? polarMeasureSet
              ? column.type === "quantitative"
              : polarSegmentField
                ? column.name === polarSegmentField
                : column.type === "quantitative" || column.type === "nominal" || column.type === "ordinal" || column.type === "temporal"
            : categoricalMode
            ? categoricalFields.includes(column.name)
            : quantitativeMode
              ? column.type === "quantitative"
              : normalizeChartTemplate(spec.chartType) === "scatter"
                ? column.type === "nominal" || column.type === "ordinal" || column.type === "temporal"
                : column.type === "quantitative" || column.type === "nominal" || column.type === "ordinal" || column.type === "temporal";
          nearestZone = {
            type: "series-item",
            targetNodeId: node.id,
            fieldName: column.name,
            label: itemBinding.label,
            compatible,
            bounds,
            frame: seriesItemDropFrame(node),
          };
          nearestDistance = -1;
        }
      }
      if (!guide || nearestDistance < 0) return;
      const accepts = (channel: ChartEncodingChannel) => {
        if (inputSpec.datasetId !== payload.datasetId || !dataset || !column || column.type !== payload.type) return false;
        const logicalChannel = logicalAxisChannel(node, channel);
        if (logicalChannel === "y" && (inputSpec.valueFields?.length ?? 0) > 0) return false;
        return inferColumnIntents(dataset, inputSpec, column, {
          type: "channel",
          channel: logicalChannel,
        }).status === "VALID";
      };
      if (guide.type === "Cartesian") {
        const model = createCartesianAxisModel(node);
        const minX = node.kind === "leaf" ? node.contentMinX : 0;
        const minY = node.kind === "leaf" ? node.contentMinY : 0;
        const left = model?.left ?? minX;
        const top = model?.top ?? minY;
        const right = model?.right ?? minX + node.width * (guide.xScale ?? 1);
        const bottom = model?.bottom ?? minY + node.height * (guide.yScale ?? 1);
        const origin = model?.origin ?? { x: guide.xDirection === 1 ? left : right, y: guide.yDirection === -1 ? bottom : top };
        const xEnd = model?.xEnd ?? { x: guide.xDirection === 1 ? right : left, y: origin.y };
        const yEnd = model?.yEnd ?? { x: origin.x, y: guide.yDirection === -1 ? top : bottom };
        ([
          { channel: "x" as const, start: origin, end: xEnd },
          { channel: "y" as const, start: origin, end: yEnd },
        ]).forEach(({ channel, start, end }) => {
          const worldStart = nodeLocalToSelectionScopePoint(node, start);
          const worldEnd = nodeLocalToSelectionScopePoint(node, end);
          const distance = pointToSegmentDistance(point, worldStart, worldEnd);
          if (distance > threshold) return;
          const zone: DataBindingDropZone = {
            type: "cartesian-axis",
            targetNodeId: node.id,
            channel,
            start: worldStart,
            end: worldEnd,
            compatible: accepts(channel),
            fieldName: payload.field,
          };
          if (distance < nearestDistance) {
            nearestZone = zone;
            nearestDistance = distance;
          }
        });
      } else if (guide.type === "Polar") {
        const model = createPolarCoordinateSystemModel(
          node,
          viewZoom.value,
          !node.compositionSpec || editingCompositionId.value !== node.compositionSpec.id,
        );
        if (!model) return;
        const worldOrigin = nodeLocalToSelectionScopePoint(node, model.origin);
        const defaultWorldRadiusEnd = nodeLocalToSelectionScopePoint(node, model.radiusEnd);
        // Both radial guides represent the same R/outer-radius channel. This
        // keeps drops consistent for partial polar spans where the upper guide
        // is the most accessible one.
        const radialEnds = [model.radiusEnd, model.upperRadiusEnd];
        radialEnds.forEach((radiusEnd) => {
          const worldRadiusEnd = nodeLocalToSelectionScopePoint(node, radiusEnd);
          const radiusDistance = pointToSegmentDistance(point, worldOrigin, worldRadiusEnd);
          if (radiusDistance > threshold) return;
          const zone: DataBindingDropZone = {
            type: "polar-axis", targetNodeId: node.id, channel: "radius",
            path: `M ${worldOrigin.x} ${worldOrigin.y} L ${worldRadiusEnd.x} ${worldRadiusEnd.y}`,
            labelPosition: { x: (worldOrigin.x + worldRadiusEnd.x) / 2, y: (worldOrigin.y + worldRadiusEnd.y) / 2 - 8 },
            compatible: accepts("radius"), fieldName: payload.field,
          };
          if (radiusDistance < nearestDistance) {
            nearestZone = zone;
            nearestDistance = radiusDistance;
          }
        });
        const steps = Math.max(12, Math.ceil(model.angleSpan / 12));
        let angleDistance = Number.POSITIVE_INFINITY;
        const pathPoints: Point[] = [];
        for (let index = 0; index <= steps; index += 1) {
          const degrees = model.angleSpan * index / steps;
          const local = polarPointAtAngle(model.origin, model.radius, degrees);
          const world = nodeLocalToSelectionScopePoint(node, local);
          pathPoints.push(world);
          if (index > 0) angleDistance = Math.min(angleDistance, pointToSegmentDistance(point, pathPoints[index - 1]!, world));
        }
        if (angleDistance <= threshold && angleDistance < nearestDistance) {
          const path = pathPoints.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
          const label = pathPoints[Math.floor(pathPoints.length / 2)] ?? defaultWorldRadiusEnd;
          nearestZone = {
            type: "polar-axis", targetNodeId: node.id, channel: "angle", path,
            labelPosition: { x: label.x, y: label.y - 8 }, compatible: accepts("theta"), fieldName: payload.field,
          };
          nearestDistance = angleDistance;
        }
      }
    });
    if (nearestZone) return nearestZone;
    const bodyTarget = [...getSelectionScopeNodes()].reverse().find((node) => {
      const spec = node.chartSpec;
      if (!spec || spec.datasetId !== payload.datasetId || !hasRequiredChartEncodings(spec)) return false;
      const dataset = getDataset(spec.datasetId);
      const column = dataset?.columns.find((item) => item.name === payload.field);
      if (!column || column.type !== payload.type) return false;
      const boundFields = new Set([
        ...Object.values(spec.encodings).flatMap((encoding) => encoding ? [encoding.field] : []),
        ...(spec.seriesFields?.map((encoding) => encoding.field) ?? []),
        ...(spec.valueFields?.map((encoding) => encoding.field) ?? []),
      ]);
      if (boundFields.has(payload.field)) return false;
      const local = toNodeLocalPoint(node, point);
      const minX = node.kind === "leaf" ? node.contentMinX : 0;
      const minY = node.kind === "leaf" ? node.contentMinY : 0;
      return local.x >= minX && local.x <= minX + node.width
        && local.y >= minY && local.y <= minY + node.height;
    });
    if (!bodyTarget?.chartSpec) return null;
    const dataset = getDataset(bodyTarget.chartSpec.datasetId);
    const column = dataset?.columns.find((item) => item.name === payload.field);
    if (!dataset || !column) return null;
    const analysis = inferColumnIntents(dataset, bodyTarget.chartSpec, column, { type: "chart-body" });
    return {
      type: "chart-body",
      targetNodeId: bodyTarget.id,
      fieldName: payload.field,
      compatible: analysis.status === "VALID" && analysis.intents.length > 0,
      bounds: collectNodeSelectionBounds(bodyTarget),
    };
  }
  function mappedEncodingChannel(node: CanvasNode, channel: CoordinateChannel): ChartEncodingChannel {
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    if (template === "pie" || template === "donut") {
      if (channel === "angle") return "theta";
      if (channel === "radius" || channel === "ring") return channel;
      return channel === "x" ? "color" : "theta";
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
    if (channel === "x" || channel === "y") {
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
      return composition.concatLinks.map((link) => ({
        ...link,
        sharedChannels: [...link.sharedChannels],
      }));
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
        const sharedChannels = coordinateType === "Polar"
          ? [composition.facetDirection === "row" ? "radius" : "angle"]
          : [composition.facetDirection === "row" ? "y" : "x"];
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
    if (contracts.some((contract) => !contract)) return null;
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
    return externalCoordinatesAreCompatible(nodes)
      && existingRepeatableCompositions(nodes, "concat").every((composition) => {
        const links = concatLinksFor(composition);
        return links.length === 0 || links.every((link) => link.sharedChannels.includes(channel)
          ? link.direction === direction
          : true);
      })
      && nodes.every((node) => externalCoordinate(node)?.sharedChannels.includes(channel))
      && sharedChannelEncodingsAreCompatible(nodes, channel);
  }

  function concatEdgeNodesAreCompatible(
    target: CanvasNode,
    source: CanvasNode,
    direction: "horizontal" | "vertical" | "radial" | "angular",
    channel: CoordinateChannel,
  ) {
    return externalCoordinatesAreCompatible([target, source])
      && [target, source].every((node) => externalCoordinate(node)?.sharedChannels.includes(channel))
      && sharedChannelEncodingsAreCompatible([target, source], channel)
      && (direction === "radial" || direction === "angular"
        ? [target, source].every(isPolarCompositionChart)
        : [target, source].every(isCartesianCompositionChart));
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
    const composition = target.compositionSpec;
    if (composition?.type !== "layer" && composition?.type !== "concat") return target;
    if (editingCompositionId.value === composition.id) return target;
    return findCanvasNode(target.coordinateSystem?.ownerNodeId ?? "")
      ?? composition.members
        .map((member) => findCanvasNode(member.nodeId))
        .find((member): member is CanvasNode => !!member)
      ?? target;
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
      ? materializeChartDataTransforms(dataset, chartNode.chartSpec.dataTransforms)
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
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    if (template === "pie" || template === "donut") return "angle";
    return node.chartSpec?.axisSwapped === true ? "x" : "y";
  }
  function logicalAxisChannel(node: CanvasNode, channel: ChartEncodingChannel): ChartEncodingChannel {
    if (node.chartSpec?.axisSwapped !== true || (channel !== "x" && channel !== "y")) return channel;
    return channel === "x" ? "y" : "x";
  }
  function seriesItemCategoricalFields(spec: ChartSpec) {
    if (spec.defaultDataBinding) return [];
    const explicit = spec.seriesFields?.map((encoding) => encoding.field)
      ?? (spec.series ? [spec.series.field] : []);
    if (explicit.length > 0) return explicit;
    const template = normalizeChartTemplate(spec.chartType);
    if ((template === "pie" || template === "donut") && spec.encodings.segment?.field) {
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
    if (node.chartSpec && (template === "pie" || template === "donut")) {
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
      const geometry = getPolarOccupiedGeometry(node);
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
        // Polar links do not have a single Cartesian edge. Keep the control
        // at the midpoint of the two occupied bounds until a radial geometry
        // control is added.
        x = (selectedBounds.minX + selectedBounds.maxX + otherBounds.minX + otherBounds.maxX) / 4;
        y = (selectedBounds.minY + selectedBounds.maxY + otherBounds.minY + otherBounds.maxY) / 4;
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
    return {
      instanceDocument: createChartInstanceDocument(canvasNodesWithRestoredCompositionLayout()),
      selectedIds: [...selectedIds.value],
      editingGroupPath: [...editingGroupPath.value],
      relationships,
    };
  }
  function pushCanvasHistory(relationships?: ChartRelationshipState) {
    undoStack.value.push(captureCanvasHistory(relationships));
    if (undoStack.value.length > historyLimit) undoStack.value.shift();
    redoStack.value = [];
  }
  function applyPositionHistory(patch: CanvasHistoryPositionPatch, direction: "before" | "after") {
    patch.changes.forEach(({ nodeId, before, after }) => {
      const node = findCanvasNode(nodeId);
      const position = direction === "before" ? before : after;
      if (node) {
        node.x = position.x;
        node.y = position.y;
      }
    });
  }
  function pushMoveHistory(mi: MoveInteraction) {
    const changes = mi.itemIds.flatMap((nodeId) => {
      const node = getSelectionNode(nodeId);
      const before = mi.snapshots[nodeId];
      if (!node || !before || (node.x === before.x && node.y === before.y)) return [];
      return [{ nodeId, before: { ...before }, after: { x: node.x, y: node.y } }];
    });
    if (changes.length === 0) return false;
    const patch: CanvasHistoryPositionPatch = { kind: "position", changes };
    undoStack.value.push(patch);
    if (undoStack.value.length > historyLimit) undoStack.value.shift();
    redoStack.value = [];
    return true;
  }
  function restoreCanvasHistory(snapshot: CanvasHistorySnapshot) {
    interaction.value = null;
    detachPointerListeners();
    compositionEditLayout = null;
    editingCompositionId.value = null;
    nestedPositionRelationshipIds.value = [];
    chartDrilldown.value = null;
    nestedDropPath = [];
    const snapshotNodes = snapshot.instanceDocument
      ? restoreCanvasNodesFromChartInstanceDocument(snapshot.instanceDocument)
      : snapshot.nodes ?? [];
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
  function undoCanvasChange() {
    const entry = undoStack.value.pop();
    if (!entry) return;
    if ("kind" in entry) {
      if (entry.kind !== "position") return;
      applyPositionHistory(entry, "before");
      redoStack.value.push(entry);
      return;
    }
    redoStack.value.push(captureCanvasHistory());
    restoreCanvasHistory(entry);
  }
  function redoCanvasChange() {
    const entry = redoStack.value.pop();
    if (!entry) return;
    if ("kind" in entry) {
      if (entry.kind !== "position") return;
      applyPositionHistory(entry, "after");
      undoStack.value.push(entry);
      return;
    }
    undoStack.value.push(captureCanvasHistory());
    restoreCanvasHistory(entry);
  }

  // --- selection ---
  function scopedCompositionMemberIds(node: CanvasNode) {
    const composition = node.compositionSpec;
    if (!composition || editingCompositionId.value === composition.id) return [node.id];
    // Concat members remain individually selectable. Movement expands the
    // selected member through `coordinateTransformItemIds`.
    if (composition.type === "concat") return [node.id];
    const members = new Set(composition.members.map((member) => member.nodeId));
    const memberIds = getSelectionScopeNodes()
      .filter((candidate) => members.has(candidate.id))
      .map((candidate) => candidate.id);
    return memberIds.length > 0 ? memberIds : [node.id];
  }
  function normalizeSelection(ids: string[]) {
    const normalized = new Set<string>();
    const nodes = getSelectionScopeNodes();
    ids.forEach((id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) {
        const nestedRelationship = id.startsWith("nested-unit:")
          ? nestedSelectionRelationships(id)[0]
          : Object.values(chartRelationships.value.nestedRelationships).find((relationship) =>
            relationship.status === "active" && relationship.childChartId === id,
          );
        if (nestedRelationship) {
          const parentId = topLevelSelectionNodeId(nestedRelationship.parentChartId);
          if (nodes.some((candidate) => candidate.id === parentId)) normalized.add(parentId);
        }
        return;
      }
      const topLevelId = topLevelSelectionNodeId(node.id);
      const topLevelNode = nodes.find((candidate) => candidate.id === topLevelId) ?? node;
      scopedCompositionMemberIds(topLevelNode).forEach((memberId) => normalized.add(memberId));
    });
    return nodes.filter((n) => normalized.has(n.id)).map((n) => n.id);
  }
  function setSelection(ids: string[]) {
    const nextSelection = normalizeSelection(ids);
    if (nextSelection.length !== selectedIds.value.length
      || nextSelection.some((id, index) => id !== selectedIds.value[index])) {
      selectedIds.value = nextSelection;
    }
    if (selectedIds.value.length === 0) {
      rotationInputVisible.value = false;
      polarAngleInputVisible.value = false;
    }
    if (!selectedIds.value.some((id) => getSelectionNode(id)?.coordinateGuide?.type === "Polar")) {
      polarAngleInputVisible.value = false;
    }
  }
  function toggleSelection(ids: string[]) {
    const targetIds = normalizeSelection(ids);
    const sel = new Set(selectedIds.value);
    const allSelected = targetIds.every((id) => sel.has(id));
    if (allSelected) { selectedIds.value = selectedIds.value.filter((id) => !targetIds.includes(id)); return; }
    setSelection([...selectedIds.value, ...targetIds]);
  }

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
    nestedDropPath = [];
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
      const template = normalizeChartTemplate(node.chartSpec.chartType);
      setAxisBindingTarget({
        nodeId: node.id,
        channel: template === "pie" || template === "donut" ? "y" : "x",
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
      return true;
    }
    if (updates.length === 0) return false;

    if (recordHistory) pushCanvasHistory();
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
    pushCanvasHistory();
    targets.forEach((target) => updateNodeMarkGroupConfig(target, patch, undefined, false));
    reconcileRelationshipNodes(canvasNodes.value);
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

  function encodingTargets(node: CanvasNode) {
    if (node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat") {
      if (editingCompositionId.value === node.compositionSpec.id) return node.chartSpec ? [node] : [];
      return node.compositionSpec.members
        .map((member) => findCanvasNode(member.nodeId))
        .filter((member): member is CanvasNode => !!member?.chartSpec);
    }
    return dimensionDecisionTargets(node);
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
    const parentDimensionFields = chartRoleFields(parentSpec, new Set<NestedContextRole>(["dimension"]));
    const parentSeriesFields = chartRoleFields(parentSpec, new Set<NestedContextRole>(["series"]));
    const clues = nestClueTransforms(child.chartSpec);
    const fieldsToResolve = clues.length > 0
      ? clues.map((clue) => clue.field)
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

  function createLayer(recordHistory = true, requestedChannels?: CoordinateChannel[], targetNodeId?: string) {
    const nodes = repeatableCompositionNodes(selectedNodes.value, "layer")
      ?.filter((node) => node.chartSpec && node.coordinateGuide) ?? [];
    const compatibleChannels = compatibleLayerChannels(nodes);
    if (!compatibleChannels) return false;
    const coordinateType = nodes[0]!.coordinateGuide!.type;
    const sharedChannels = requestedChannels ?? compatibleChannels;
    const existingCompositions = existingFlatCompositions(nodes);
    const existingLayerCompositions = existingCompositions.filter((composition) => composition.type === "layer");
    if (sharedChannels.length === 0
      || !sharedChannels.every((channel) => compatibleChannels.includes(channel))
      || (existingLayerCompositions.length > 0 && !sameChannels(sharedChannels, compatibleChannels))) return false;
    const retainedComposition = existingCompositions.find((composition) => composition.type === "layer");
    const retainedOwnerId = retainedComposition
      ? nodes.find((node) => node.compositionSpec?.id === retainedComposition.id)?.coordinateSystem?.ownerNodeId
      : undefined;
    const targetNode = targetNodeId ? findCanvasNode(targetNodeId) : null;
    const targetOwnerId = targetNode?.compositionSpec?.type === "layer"
      ? targetNode.coordinateSystem?.ownerNodeId
      : targetNode?.id;
    const owner = nodes.find((node) => node.id === targetOwnerId)
      ?? nodes.find((node) => node.id === retainedOwnerId)
      ?? [...nodes].sort((left, right) => {
        const score = (node: CanvasNode) => sharedChannels.reduce(
          (count, channel) => count + (node.chartSpec?.encodings[channel] ? 1 : 0),
          0,
        );
        return score(right) - score(left);
      })[0]!;
    const layerNodes = [owner, ...nodes.filter((node) => node.id !== owner.id)];
    const layerId = crypto.randomUUID();
    const compositionId = retainedComposition?.id ?? `composition:${layerId}`;
    const coordinateSystemId = nodes.find((node) => node.compositionSpec?.id === retainedComposition?.id)
      ?.coordinateSystem?.id ?? `coordinate:${layerId}`;
    const system: CoordinateSystemSpec = {
      id: coordinateSystemId,
      type: coordinateType,
      ownerNodeId: owner.id,
      sharedChannels,
      members: layerNodes.map((node) => ({ nodeId: node.id, channels: [...sharedChannels] })),
    };
    const compositionSpec: NonNullable<CanvasNode["compositionSpec"]> = {
      id: compositionId,
      type: "layer",
      sharedChannels,
      members: layerNodes.map((node) => ({
        nodeId: node.id,
        sourceNodeId: node.compositionSpec?.members.find((member) => member.nodeId === node.id)?.sourceNodeId ?? node.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels: [...sharedChannels],
      })),
    };
    if (recordHistory) pushCanvasHistory();
    retainSharedFacetClues(owner, layerNodes);
    retireMergedCompositions(existingCompositions, compositionId);
    const frame = {
      x: owner.x,
      y: owner.y,
      width: owner.width,
      height: owner.height,
      scaleX: owner.scaleX,
      scaleY: owner.scaleY,
      rotation: owner.rotation,
      coordinateGuide: { ...owner.coordinateGuide!, origin: { ...owner.coordinateGuide!.origin } },
    };
    layerNodes.forEach((node) => {
      node.x = frame.x;
      node.y = frame.y;
      node.width = frame.width;
      node.height = frame.height;
      node.scaleX = frame.scaleX;
      node.scaleY = frame.scaleY;
      node.rotation = frame.rotation;
      node.coordinateGuide = { ...frame.coordinateGuide, origin: { ...frame.coordinateGuide.origin } };
      node.coordinateSystem = system;
      node.compositionSpec = compositionSpec;
      node.layerSpec = null;
    });
    renderSharedCoordinateComposition(owner);
    const layerNodeIds = new Set(layerNodes.map((node) => node.id));
    replaceSelectionScopeNodes([
      ...getSelectionScopeNodes().filter((node) => !layerNodeIds.has(node.id)),
      ...layerNodes,
    ]);
    reconcileCoordinateSystems();
    setSelection([owner.id]);
    axisBindingTarget.value = null;
    return true;
  }

  function createStructuralComposition(
    type: "concat" | "facet" | "nested",
    recordHistory = true,
    requestedChannels?: CoordinateChannel[],
    concatDirection?: "horizontal" | "vertical" | "radial" | "angular",
    concatPosition?: "before" | "after",
    targetNodeId?: string,
    sourceNodeId?: string,
  ) {
    const direction = concatDirection ?? "horizontal";
    const anchoredTarget = targetNodeId ? findCanvasNode(targetNodeId) : null;
    const anchoredSource = sourceNodeId ? findCanvasNode(sourceNodeId) : null;
    const anchoredTargetNodes = type === "concat" && anchoredTarget
      ? repeatableCompositionMembers(anchoredTarget, "concat", direction)
      : null;
    const anchoredSourceNodes = type === "concat" && anchoredSource
      ? repeatableCompositionMembers(anchoredSource, "concat", direction)
      : null;
    const anchoredConcatSpec = type === "concat"
      ? (anchoredTarget?.compositionSpec?.type === "concat"
        ? anchoredTarget.compositionSpec
        : anchoredSource?.compositionSpec?.type === "concat"
          ? anchoredSource.compositionSpec
          : null)
      : null;
    const sourceNodes = type === "concat"
      ? targetNodeId && sourceNodeId
        ? anchoredTargetNodes && anchoredSourceNodes
          ? anchoredConcatSpec
            ? [
              ...anchoredTargetNodes,
              ...anchoredSourceNodes.filter((node) => !anchoredTargetNodes.some((targetNode) => targetNode.id === node.id)),
            ]
            : repeatableCompositionNodes([...anchoredTargetNodes, ...anchoredSourceNodes], "concat", direction) ?? []
          : []
        : repeatableCompositionNodes(selectedNodes.value, "concat", direction) ?? []
      : [...selectedNodes.value];
    const bounds = type === "concat"
      ? sourceNodes.reduce<Bounds | null>((current, node) => mergeBounds(current, collectNodeSelectionBounds(node)), null)
      : selectionBounds.value;
    if (!bounds
      || sourceNodes.length === 0
      || !sourceNodes.every(isAtomicChartReady)
      || (type === "concat" && sourceNodes.length < 2)) return false;
    if (type === "concat") {
      const sharedChannel: CoordinateChannel = direction === "horizontal"
        ? "y"
        : direction === "vertical"
          ? "x"
          : direction === "radial" ? "angle" : "radius";
      const sharedChannels = requestedChannels ?? [sharedChannel];
      const existingCompositions = existingRepeatableCompositions(sourceNodes, "concat");
      const polar = sourceNodes.every(isPolarCompositionChart);
      const cartesian = sourceNodes.every(isCartesianCompositionChart);
      if ((!polar && !cartesian)
        || sharedChannels.length !== 1
        || sharedChannels[0] !== sharedChannel
        || (!anchoredConcatSpec && !existingCompositions.every((composition) =>
          composition.direction === direction && sameChannels(composition.sharedChannels, sharedChannels)))
        || (anchoredConcatSpec
          ? !concatEdgeNodesAreCompatible(anchoredTarget!, anchoredSource!, direction, sharedChannel)
          : !sharedChannelEncodingsAreCompatible(sourceNodes, sharedChannel))
        || (polar && direction !== "radial" && direction !== "angular")
        || (cartesian && (direction === "radial" || direction === "angular"))) return false;
    }
    const compositionId = crypto.randomUUID();
    const existingConcatCompositions = type === "concat"
      ? existingRepeatableCompositions(sourceNodes, "concat")
      : [];
    const retainedConcatComposition = existingConcatCompositions[0];
    const compositionSpecId = retainedConcatComposition?.id ?? `composition:${compositionId}`;
    const gap = type === "facet"
      ? 4
      : Math.max(6, Math.min(14, Math.min(bounds.width, bounds.height) * 0.025));
    if (recordHistory) pushCanvasHistory();
    retireMergedCompositions(existingConcatCompositions, compositionSpecId);
    let children: CanvasNode[] = [];
    let facetField: string | undefined;
    let facetValues: string[] | undefined;
    let facetDirection: "row" | "column" | undefined;
    let facetCoordinateSystem: "Cartesian" | "Polar" | undefined;
    let facetThetaField: string | undefined;
    let facetRadiusField: string | undefined;
    let facetGrid: NonNullable<CanvasNode["compositionSpec"]>["facetGrid"];
    const facetSourceNodeIds: string[] = [];
    let facetCompositeMemberCount = 1;
    if (type !== "concat") {
      const source = sourceNodes[0]!;
      const recommendation = source.chartSpec?.dimensionRecommendations?.find((item) => item.strategy === "facet");
      facetDirection = recommendation?.facetDirection;
      facetCoordinateSystem = recommendation?.facetCoordinateSystem ?? "Cartesian";
      facetThetaField = recommendation?.facetThetaField;
      facetRadiusField = recommendation?.facetRadiusField;
      const dataset = source.chartSpec ? getDataset(source.chartSpec.datasetId) : null;
      facetGrid = recommendation?.facetGrid
        ? {
          ...recommendation.facetGrid,
          rowValues: [...recommendation.facetGrid.rowValues],
          columnValues: [...recommendation.facetGrid.columnValues],
        }
        : undefined;
      const compositeMembers = sourceNodes.length > 1
        && (source.compositionSpec?.type === "layer" || source.compositionSpec?.type === "concat")
        && sourceNodes.every((member) => member.compositionSpec?.id === source.compositionSpec?.id)
        ? sourceNodes
        : [source];
      facetCompositeMemberCount = compositeMembers.length;
      const compositeBounds = getCanvasNodeListBounds(compositeMembers) ?? collectNodeSelectionBounds(source);
      const cloneFacetMember = (
        member: CanvasNode,
        rowValue: string | undefined,
        columnValue: string | undefined,
        rowIndex: number,
        columnIndex: number,
      ) => {
        const clone = cloneCanvasNodeForPaste(member);
        facetSourceNodeIds.push(member.id);
        const baseX = type === "facet" ? bounds.minX : 0;
        const baseY = type === "facet" ? bounds.minY : 0;
        const offsetX = member.x - compositeBounds.minX;
        const offsetY = member.y - compositeBounds.minY;
        clone.name = rowValue !== undefined && columnValue !== undefined
          ? `${member.name} - ${rowValue} / ${columnValue}`
          : `${member.name} - ${rowValue ?? columnValue ?? ""}`;
        if (clone.chartSpec) {
          const filters = { ...clone.chartSpec.filters };
          if (facetGrid && rowValue !== undefined && columnValue !== undefined) {
            filters[facetGrid.rowField] = rowValue;
            filters[facetGrid.columnField] = columnValue;
          } else if (facetField && (rowValue ?? columnValue) !== undefined) {
            filters[facetField] = (rowValue ?? columnValue)!;
          }
          clone.chartSpec = {
            ...clone.chartSpec,
            filters,
          };
        }
        renderChartNode(clone);
        if (facetCoordinateSystem === "Polar") {
          const thetaCount = facetGrid?.columnValues.length
            ?? (facetThetaField && dataset
              ? new Set(dataset.rows.map((row) => row[facetThetaField!] ?? "").filter(Boolean)).size
              : 1);
          const radialIndex = facetRadiusField ? rowIndex + 1 : 1;
          const angleIndex = facetThetaField ? columnIndex : 0;
          const angle = (-90 + angleIndex * 360 / Math.max(thetaCount, 1)) * Math.PI / 180;
          const radialStep = Math.max(compositeBounds.width, compositeBounds.height) + gap;
          const centerX = baseX + compositeBounds.width / 2;
          const centerY = baseY + compositeBounds.height / 2;
          clone.x = centerX + Math.cos(angle) * radialStep * radialIndex - compositeBounds.width / 2 + offsetX;
          clone.y = centerY + Math.sin(angle) * radialStep * radialIndex - compositeBounds.height / 2 + offsetY;
        } else {
          clone.x = baseX + columnIndex * (compositeBounds.width + gap) + offsetX;
          clone.y = baseY + rowIndex * (compositeBounds.height + gap) + offsetY;
        }
        return clone;
      };
      if (facetGrid) {
        const cellValues = facetGrid.rowValues.flatMap((rowValue) =>
          facetGrid!.columnValues.map((columnValue) => ({ rowValue, columnValue })),
        );
        facetValues = cellValues.flatMap(({ rowValue, columnValue }) =>
          compositeMembers.map(() => `${rowValue}|${columnValue}`),
        );
        children = cellValues.flatMap(({ rowValue, columnValue }, index) =>
          compositeMembers.map((member) => cloneFacetMember(
            member,
            rowValue,
            columnValue,
            Math.floor(index / facetGrid!.columnValues.length),
            index % facetGrid!.columnValues.length,
          )),
        );
      } else {
        facetField = recommendation?.field;
        const values = facetField && dataset
          ? Array.from(new Set(dataset.rows.map((row) => row[facetField!] ?? "").filter(Boolean)))
          : ["1", "2", "3"];
        const columns = recommendation?.facetDirection === "row"
          ? 1
          : Math.max(1, values.length);
        facetValues = values.flatMap((value) => compositeMembers.map(() => value));
        children = values.flatMap((value, index) =>
          compositeMembers.map((member) => cloneFacetMember(
            member,
            value,
            undefined,
            Math.floor(index / columns),
            index % columns,
          )),
        );
      }
    } else {
      const orderedNodes = anchoredTargetNodes && anchoredSourceNodes
        ? anchoredConcatSpec
          ? [...anchoredTargetNodes, ...anchoredSourceNodes.filter((node) => !anchoredTargetNodes.some((targetNode) => targetNode.id === node.id))]
          : concatPosition === "before"
            ? [...anchoredSourceNodes, ...anchoredTargetNodes]
            : [...anchoredTargetNodes, ...anchoredSourceNodes]
        : sourceNodes;
      if (anchoredConcatSpec && anchoredTarget && anchoredSource) {
        children = orderedNodes;
        const targetBounds = collectNodeSelectionBounds(anchoredTarget);
        const sourceBounds = collectNodeSelectionBounds(anchoredSource);
        if (direction === "horizontal") {
          anchoredSource.x += (concatPosition === "before"
            ? targetBounds.minX - sourceBounds.maxX - gap
            : targetBounds.maxX + gap - sourceBounds.minX);
          anchoredSource.y += targetBounds.minY - sourceBounds.minY;
        } else if (direction === "vertical") {
          anchoredSource.y += (concatPosition === "before"
            ? targetBounds.minY - sourceBounds.maxY - gap
            : targetBounds.maxY + gap - sourceBounds.minY);
          anchoredSource.x += targetBounds.minX - sourceBounds.minX;
        }
      } else {
        let cursor = 0;
        children = orderedNodes.map((node) => {
          const plotBounds = collectNodeSelectionBounds(node);
          if (direction === "radial" || direction === "angular") return node;
          if (direction === "vertical") {
            node.y += bounds.minY + cursor - plotBounds.minY;
            cursor += plotBounds.height + gap;
          } else {
            node.x += bounds.minX + cursor - plotBounds.minX;
            cursor += plotBounds.width + gap;
          }
          return node;
        });
      }
      if (children[0]) retainSharedFacetClues(children[0], children);
    }
    if (type === "facet" && facetCompositeMemberCount > 1) {
      const sourceComposition = sourceNodes[0]?.compositionSpec;
      const sourceCoordinateSystem = sourceNodes[0]?.coordinateSystem;
      if (sourceComposition && (sourceComposition.type === "layer" || sourceComposition.type === "concat")) {
        const cellGroups: CanvasGroupNode[] = [];
        for (let start = 0; start < children.length; start += facetCompositeMemberCount) {
          const cellChildren = children.slice(start, start + facetCompositeMemberCount);
          if (cellChildren.length !== facetCompositeMemberCount) continue;
          const cellBounds = getCanvasNodeListBounds(cellChildren);
          if (!cellBounds) continue;
          const innerCompositionId = `composition:${crypto.randomUUID()}`;
          const sourceMemberIds = facetSourceNodeIds.slice(start, start + facetCompositeMemberCount);
          const ownerIndex = sourceCoordinateSystem
            ? sourceNodes.findIndex((member) => member.id === sourceCoordinateSystem.ownerNodeId)
            : 0;
          const innerComposition: NonNullable<CanvasNode["compositionSpec"]> = {
            ...sourceComposition,
            id: innerCompositionId,
            members: cellChildren.map((child, index) => ({
              nodeId: child.id,
              sourceNodeId: sourceMemberIds[index] ?? sourceNodes[index]?.id ?? child.id,
              chartType: child.chartSpec?.chartType,
              sharedChannels: [...sourceComposition.sharedChannels],
            })),
          };
          const innerCoordinateSystem: CoordinateSystemSpec | null = sourceCoordinateSystem
            ? {
              ...sourceCoordinateSystem,
              id: `coordinate:${innerCompositionId}`,
              ownerNodeId: cellChildren[ownerIndex >= 0 ? ownerIndex : 0]?.id ?? cellChildren[0]!.id,
              members: cellChildren.map((child) => ({
                nodeId: child.id,
                channels: [...(sourceCoordinateSystem.members.find((member) => member.nodeId === sourceNodes[cellChildren.indexOf(child)]?.id)?.channels ?? sourceComposition.sharedChannels)],
              })),
            }
            : null;
          cellChildren.forEach((child) => {
            child.x -= cellBounds.minX;
            child.y -= cellBounds.minY;
            child.compositionSpec = innerComposition;
            child.coordinateSystem = innerCoordinateSystem;
          });
          cellGroups.push({
            kind: "group",
            id: `facet-cell:${crypto.randomUUID()}`,
            name: `Facet cell ${cellGroups.length + 1}`,
            x: cellBounds.minX,
            y: cellBounds.minY,
            width: Math.max(cellBounds.width, 1),
            height: Math.max(cellBounds.height, 1),
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            coordinateSystem: null,
            compositionSpec: null,
            children: cellChildren,
          });
        }
        children = cellGroups;
        facetValues = Array.from(new Set(facetValues ?? []));
      }
    }
    const childBounds = getCanvasNodeListBounds(children);
    if (!childBounds) return false;
    const priorConcatLinks = existingConcatCompositions.flatMap((composition) => concatLinksFor(composition));
    const nextConcatLinks = type === "concat" && anchoredConcatSpec && anchoredTarget && anchoredSource
      ? [
        ...priorConcatLinks,
        {
          targetNodeId: anchoredTarget.id,
          sourceNodeId: anchoredSource.id,
          direction,
          position: concatPosition ?? "after",
          sharedChannels: [...(requestedChannels ?? [
            direction === "vertical" ? "x" : direction === "radial" ? "angle" : direction === "angular" ? "radius" : "y",
          ])],
        },
      ]
      : type === "concat" && retainedConcatComposition
        ? priorConcatLinks
        : type === "concat"
          ? children.slice(1).map((node, index) => ({
            targetNodeId: children[index]!.id,
            sourceNodeId: node.id,
            direction,
            position: "after" as const,
            sharedChannels: [...(requestedChannels ?? [
              direction === "vertical" ? "x" : direction === "radial" ? "angle" : direction === "angular" ? "radius" : "y",
            ])],
          }))
          : undefined;
    const mixedConcat = type === "concat" && !!nextConcatLinks
      && new Set(nextConcatLinks.map((link) => link.direction)).size > 1;
    const compositionDirection = mixedConcat ? undefined : direction;
    const sharedChannels: CoordinateChannel[] = type === "facet"
      ? []
      : type === "concat"
      ? mixedConcat
        ? Array.from(new Set(nextConcatLinks!.flatMap((link) => link.sharedChannels)))
        : requestedChannels ?? [
          compositionDirection === "vertical" ? "x"
            : compositionDirection === "radial" ? "angle"
              : compositionDirection === "angular" ? "radius" : "y",
        ]
      : [...(getChartTemplateContract(children[0]?.chartSpec?.chartType ?? "")?.shareableChannels ?? [])];
    const retainedCoordinateSystem = sourceNodes.find((node) =>
      node.compositionSpec?.id === retainedConcatComposition?.id,
    )?.coordinateSystem;
    const facetSharedChannels: CoordinateChannel[] = facetCoordinateSystem === "Polar"
      ? [facetDirection === "row" ? "radius" : "angle"]
      : [facetDirection === "row" ? "y" : "x"];
    const parentCoordinateSystem = type === "nested"
      ? sourceNodes[0]?.coordinateSystem ?? null
      : null;
    const coordinateSystem: CoordinateSystemSpec | null = type === "nested"
      ? parentCoordinateSystem
        ? {
          ...parentCoordinateSystem,
          members: [
            ...parentCoordinateSystem.members.map((member) => ({ ...member, channels: [...member.channels] })),
            ...children
              .filter((child) => !parentCoordinateSystem.members.some((member) => member.nodeId === child.id))
              .map((child) => ({
                nodeId: child.id,
                channels: [...parentCoordinateSystem.sharedChannels],
              })),
          ],
          sharedChannels: [...parentCoordinateSystem.sharedChannels],
        }
        : null
      : (sharedChannels.length > 0 || type === "facet") ? {
        id: retainedCoordinateSystem?.id ?? `coordinate:${compositionId}`,
        type: type === "facet"
          ? facetCoordinateSystem ?? "Cartesian"
          : children[0]?.coordinateGuide?.type ?? "CoordinateFree",
        ownerNodeId: type === "concat"
          ? retainedCoordinateSystem?.ownerNodeId ?? sourceNodes[0]!.id
          : children[0]!.id,
        members: children.map((node) => ({
          nodeId: node.id,
          channels: type === "facet"
            ? [...facetSharedChannels]
            : type === "concat" && mixedConcat
              ? concatMemberSharedChannels({
                type: "concat", members: [], sharedChannels: [], concatLinks: nextConcatLinks,
              }, node.id)
              : [...(getChartTemplateContract(node.chartSpec?.chartType ?? "")?.shareableChannels ?? [])],
        })),
        sharedChannels: type === "facet"
          ? facetSharedChannels
          : sharedChannels,
      } : null;
    children.forEach((node) => {
      node.coordinateSystem = type === "facet"
        ? standaloneCoordinateSystem(node)
        : coordinateSystem;
    });
    const compositionSpec: NonNullable<CanvasNode["compositionSpec"]> = {
      id: compositionSpecId,
      type,
      direction: type === "concat" ? compositionDirection : undefined,
      concatLinks: type === "concat" ? nextConcatLinks : undefined,
      polarAngleSpan: type === "concat" && children[0]?.coordinateGuide?.type === "Polar"
        ? Math.max(1, Math.min(
          retainedConcatComposition?.polarAngleSpan ?? children[0].coordinateGuide.angleSpan ?? 360,
          360,
        ))
        : undefined,
      polarAngleOffset: type === "concat" && children[0]?.coordinateGuide?.type === "Polar"
        ? retainedConcatComposition?.polarAngleOffset ?? children[0].coordinateGuide.angleOffset ?? 0
        : undefined,
      sharedChannels,
      facetField,
      facetValues,
      facetDirection,
      facetRowGap: type === "facet" ? gap : undefined,
      facetColumnGap: type === "facet" ? gap : undefined,
      facetCoordinateSystem,
      facetThetaField,
      facetRadiusField,
      facetGrid,
      members: children.map((node, index) => ({
        nodeId: node.id,
        sourceNodeId: type !== "concat"
          ? facetCompositeMemberCount > 1
            ? sourceNodes[0]?.id ?? node.id
            : facetSourceNodeIds[index] ?? sourceNodes[0]!.id
        : node.compositionSpec?.members.find((member) => member.nodeId === node.id)?.sourceNodeId ?? node.id,
        chartType: node.chartSpec?.chartType,
      sharedChannels: type === "concat" && mixedConcat
          ? concatMemberChannelsForLinks(nextConcatLinks, node.id)
          : sharedChannels,
      })),
    };
    if (type !== "nested") {
      children.forEach((node) => { node.compositionSpec = compositionSpec; });
      if (type === "concat") renderSharedCoordinateComposition(children[0]!);
      const replacedIds = new Set(type === "concat"
        ? children.map((node) => node.id)
        : selectedIds.value);
      replaceSelectionScopeNodes([
        ...getSelectionScopeNodes().filter((node) => !replacedIds.has(node.id)),
        ...children,
      ]);
      reconcileCoordinateSystems();
      if (type === "facet" && facetCompositeMemberCount > 1) {
        children.forEach((cell) => {
          if (cell.kind !== "group") return;
          const member = cell.children.find((child) =>
            child.compositionSpec?.type === "layer" || child.compositionSpec?.type === "concat",
          );
          if (member) renderSharedCoordinateComposition(member);
        });
      }
      setSelection(children[0] ? [children[0].id] : []);
      return true;
    }
    const group: CanvasGroupNode = {
      kind: "group",
      id: compositionId,
      name: type === "nested" ? "Nested" : type === "facet" ? "Facet" : "Concat",
      x: bounds.minX,
      y: bounds.minY,
      width: Math.max(childBounds.width, 1),
      height: Math.max(childBounds.height, 1),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      coordinateSystem,
      compositionSpec,
      children,
    };
    replaceSelectionScopeNodes([
      ...getSelectionScopeNodes().filter((node) => !selectedIds.value.includes(node.id)),
      group,
    ]);
    setSelection([group.id]);
    return true;
  }

  function executeComposition(
    type: "layer" | "concat" | "facet",
    recordHistory = true,
    requestedChannels?: CoordinateChannel[],
    concatDirection?: "horizontal" | "vertical" | "radial" | "angular",
    concatPosition?: "before" | "after",
    targetNodeId?: string,
    sourceNodeId?: string,
  ) {
    const created = type === "layer"
      ? createLayer(recordHistory, requestedChannels, targetNodeId)
      : createStructuralComposition(
        type,
        recordHistory,
        requestedChannels,
        concatDirection,
        concatPosition,
        targetNodeId,
        sourceNodeId,
      );
    setImportNotice(created
      ? `${type[0]!.toUpperCase()}${type.slice(1)} composition created.`
      : `${type[0]!.toUpperCase()}${type.slice(1)} requires compatible selected charts.`);
    return created;
  }

  function beginNestedRelationshipDraft(node: CanvasNode, candidate: SvgCandidate, rowKey: string) {
    if (!node.chartSpec) return null;
    if (nestedRelationshipBaseSnapshot) restoreRelationships(nestedRelationshipBaseSnapshot);
    nestedRelationshipBaseSnapshot = snapshotRelationships();
    registerChartRelationship(node);
    const childChartId = `nested-child:${crypto.randomUUID()}`;
    dispatchRelationship({
      type: "register-chart",
      chart: {
        id: childChartId,
        nodeId: null,
        chartType: candidate.chartType,
        datasetId: node.chartSpec.datasetId,
        instanceKind: "nested-child",
        sourceTemplateId: candidate.id,
      },
    });
    const relationshipId = `nested:${crypto.randomUUID()}`;
    const pointGroup = node.chartSpec.markGroups?.find((group) => group.role === "point")
      ?? node.layerSpec?.children
        .find((child) => normalizeChartTemplate(child.chartSpec.chartType) === "scatter")
        ?.chartSpec.markGroups?.find((group) => group.role === "point");
    dispatchRelationship({
      type: "begin-nested",
      relationship: {
        id: relationshipId,
        parentChartId: node.id,
        parentElementId: `mark:${node.id}:point:${rowKey}`,
        parentMarkGroupId: pointGroup?.id,
        parentDataKey: rowKey,
        childChartId,
        relationType: "relative-position",
        parameters: defaultRelativeParameters(),
        resolverVersion: 1,
      },
    });
    activeNestedRelationshipId.value = relationshipId;
    return relationshipId;
  }

  function ensureCommittedNestedRelationship(node: CanvasNode, parentRowKey: string) {
    if (!node.chartSpec || activeNestedRelationshipId.value) return activeNestedRelationshipId.value;
    const existing = Object.values(chartRelationships.value.nestedRelationships).find((relationship) =>
      relationship.parentChartId === node.id && relationship.parentDataKey === parentRowKey,
    );
    if (existing) return existing.id;
    const candidate = implementedTemplateDefinitions.find((item) => item.chartType === "PieChart");
    if (!candidate) return null;
    const relationshipId = beginNestedRelationshipDraft(node, candidate, parentRowKey);
    if (!relationshipId) return null;
    dispatchRelationship({ type: "commit-nested", relationshipId });
    activeNestedRelationshipId.value = null;
    nestedRelationshipBaseSnapshot = null;
    return relationshipId;
  }

  function createNestedPie() {
    const selection = semanticSelection.value;
    if (!selection?.rowKey) return false;
    const node = findCanvasNode(selection.nodeId);
    return node ? applyNestedPiesToNode(node, selection.rowKey) : false;
  }

  function nestedPieValueFields(node: CanvasNode) {
    const datasetId = node.layerSpec?.datasetId ?? node.chartSpec?.datasetId;
    const dataset = datasetId ? getDataset(datasetId) : null;
    if (!dataset) return [];
    const occupied = new Set([
      node.chartSpec?.encodings.x?.field,
      node.chartSpec?.encodings.y?.field,
      node.chartSpec?.series?.field,
    ].filter((field): field is string => !!field));
    return dataset.columns
      .filter((column) => column.type === "quantitative" && !occupied.has(column.name))
      .map((column) => column.name);
  }

  function applyNestedPiesToNode(
    node: CanvasNode,
    parentRowKey = "*",
    config?: Pick<NestedBindingConfig, "angleFields" | "radiusField">,
    recordHistory = true,
  ) {
    const template = node.chartSpec ? normalizeChartTemplate(node.chartSpec.chartType) : null;
    const hasScatterLayer = node.layerSpec?.children.some((child) => normalizeChartTemplate(child.chartSpec.chartType) === "scatter");
    const datasetId = node.layerSpec?.datasetId ?? node.chartSpec?.datasetId;
    const dataset = datasetId ? getDataset(datasetId) : null;
    const fields = config?.angleFields ?? nestedPieValueFields(node);
    const quantitative = new Set(dataset?.columns.filter((column) => column.type === "quantitative").map((column) => column.name) ?? []);
    const radiusField = config?.radiusField || node.nestedSpec?.radiusField || node.chartSpec?.encodings.y?.field;
    if (
      !node.chartSpec
      || !dataset
      || (template !== "scatter" && !hasScatterLayer)
      || fields.length === 0
      || fields.some((field) => !quantitative.has(field))
      || !radiusField
      || !quantitative.has(radiusField)
    ) return false;
    const groupRows = dataset.rows.filter((row) => rowMatchesChartFilters(row, node.chartSpec!));
    const groupDataset = { ...dataset, rows: groupRows };
    const pointGroupMemberKeys = groupRows.map((row, index) =>
      csvRowKey(groupDataset, row, index),
    );
    const parentRowKeys = parentRowKey === "*"
      ? []
      : Array.from(new Set(pointGroupMemberKeys.length > 0 ? pointGroupMemberKeys : [parentRowKey]));
    if (recordHistory) pushCanvasHistory();
    node.nestedSpec = {
      type: "nested",
      groupId: node.nestedSpec?.groupId ?? `nested-pie-group:${node.id}`,
      parentRowKey,
      parentRowKeys,
      parentChartNodeId: node.id,
      parentMarkGroupId: node.chartSpec.markGroups?.find((group) => group.role === "point")?.id
        ?? node.layerSpec?.children
          .find((child) => normalizeChartTemplate(child.chartSpec.chartType) === "scatter")
          ?.chartSpec.markGroups?.find((group) => group.role === "point")?.id
        ?? `mark-group:${node.id}:point`,
      valueFields: fields,
      radiusField,
      innerChartType: "PieChart",
    };
    if (node.layerSpec) renderSemanticNode(node);
    else renderChartNode(node);
    ensureCommittedNestedRelationship(node, parentRowKey);
    setSelection([node.id]);
    return true;
  }

  function closeNestedBinding() {
    if (nestedRelationshipBaseSnapshot) restoreRelationships(nestedRelationshipBaseSnapshot);
    activeNestedRelationshipId.value = null;
    nestedRelationshipBaseSnapshot = null;
    nestedBindingTarget.value = null;
  }

  function confirmNestedBinding(config: NestedBindingConfig) {
    const target = nestedBindingTarget.value;
    const node = nestedBindingNode.value;
    const dataset = nestedBindingDataset.value;
    if (!target || !node?.chartSpec || !dataset) return false;
    const columnByName = new Map(dataset.columns.map((column) => [column.name, column]));
    const xColumn = columnByName.get(config.xField);
    const yColumn = columnByName.get(config.yField);
    const radiusColumn = columnByName.get(config.radiusField);
    const angleFields = Array.from(new Set(config.angleFields));
    if (
      !xColumn
      || !yColumn
      || !radiusColumn
      || radiusColumn.type !== "quantitative"
      || angleFields.length === 0
      || angleFields.some((field) => columnByName.get(field)?.type !== "quantitative")
    ) return false;

    pushCanvasHistory(nestedRelationshipBaseSnapshot ?? undefined);
    const xEncoding = { field: xColumn.name, type: xColumn.type };
    const yEncoding = { field: yColumn.name, type: yColumn.type };
    node.chartSpec = {
      ...node.chartSpec,
      encodings: { ...node.chartSpec.encodings, x: xEncoding, y: yEncoding },
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    };
    if (node.layerSpec) {
      node.layerSpec = {
        ...node.layerSpec,
        x: xEncoding,
        y: yEncoding,
        children: node.layerSpec.children.map((child) => ({
          ...child,
          chartSpec: {
            ...child.chartSpec,
            encodings: { ...child.chartSpec.encodings, x: xEncoding, y: yEncoding },
            scales: undefined,
            plotArea: undefined,
            renderer: undefined,
          },
        })),
      };
    }
    if (node.layerSpec) renderSemanticNode(node);
    else renderChartNode(node);
    const created = applyNestedPiesToNode(node, target.rowKey, {
      angleFields,
      radiusField: radiusColumn.name,
    }, false);
    if (created) {
      if (activeNestedRelationshipId.value) {
        dispatchRelationship({ type: "commit-nested", relationshipId: activeNestedRelationshipId.value });
      }
      activeNestedRelationshipId.value = null;
      nestedRelationshipBaseSnapshot = null;
      nestedBindingTarget.value = null;
      setImportNotice(`Point + Pie composition created with radius ${radiusColumn.name}.`);
      scheduleNestedChildLayout();
    }
    return created;
  }

  function openNestedPositionEditor(relationshipIds: string[]) {
    nestedPositionRelationshipIds.value = relationshipIds.filter((relationshipId) => {
      const relationship = chartRelationships.value.nestedRelationships[relationshipId];
      return relationship?.status === "active" && relationship.relationType === "relative-position";
    });
  }

  function updateNestedPosition(config: {
    parentAnchor?: Point;
    childAnchor?: Point;
    offset?: Point;
    retainParent?: boolean;
  }) {
    const normalizeAnchor = (value: Point) => ({
      x: clamp(value.x, 0, 1),
      y: clamp(value.y, 0, 1),
    });
    nestedPositionRelationshipIds.value.forEach((relationshipId) => {
      const relationship = chartRelationships.value.nestedRelationships[relationshipId];
      if (!relationship) return;
      const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
      if (!parameters.parentAnchor || !parameters.childAnchor || !parameters.offset) return;
      dispatchRelationship({
        type: "update-nested",
        relationshipId,
        changes: {
          parameters: {
            ...parameters,
            parentAnchor: config.parentAnchor ? normalizeAnchor(config.parentAnchor) : { ...parameters.parentAnchor },
            childAnchor: config.childAnchor ? normalizeAnchor(config.childAnchor) : { ...parameters.childAnchor },
            offset: config.offset && Number.isFinite(config.offset.x) && Number.isFinite(config.offset.y)
              ? { ...config.offset }
              : { ...parameters.offset },
            retainParent: config.retainParent ?? parameters.retainParent ?? true,
          } as RelativeNestedParameters,
        },
      });
    });
    scheduleNestedChildLayout(nestedPositionRelationshipIds.value);
  }

  function resetNestedPosition() {
    updateNestedPosition({
      parentAnchor: { x: 0.5, y: 0.5 },
      childAnchor: { x: 0.5, y: 0.5 },
      offset: { x: 0, y: 0 },
    });
  }

  function closeNestedPositionEditor() {
    nestedPositionRelationshipIds.value = [];
  }

  function scatterPointDropZone(node: CanvasNode, point: Point) {
    const spec = node.chartSpec;
    const dataset = spec ? getDataset(spec.datasetId) : null;
    const xEncoding = spec?.encodings.x;
    const yEncoding = spec?.encodings.y;
    const xScale = spec?.scales?.x;
    const yScale = spec?.scales?.y;
    if (!spec || !dataset || !xEncoding || !yEncoding || !xScale || !yScale) return null;
    const rows = dataset.rows.filter((row) => rowMatchesChartFilters(row, spec));
    const xPosition = chartScalePosition(xScale);
    const yPosition = chartScalePosition(yScale);
    const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
    const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
    const localCenter = { x: localMinX + node.width / 2, y: localMinY + node.height / 2 };
    const worldCenter = { x: node.x + node.width * node.scaleX / 2, y: node.y + node.height * node.scaleY / 2 };
    const radians = node.rotation * Math.PI / 180;
    const toWorld = (x: number, y: number) => {
      const dx = (x - localCenter.x) * node.scaleX;
      const dy = (y - localCenter.y) * node.scaleY;
      return {
        x: worldCenter.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: worldCenter.y + dx * Math.sin(radians) + dy * Math.cos(radians),
      };
    };
    const pointSize = Number(spec.markGroups?.find((group) => group.role === "point")?.sharedConfig.size ?? 4);
    const hitRadius = Math.max(12 / Math.max(viewZoom.value, 0.25), pointSize * Math.max(Math.abs(node.scaleX), Math.abs(node.scaleY)) + 7 / Math.max(viewZoom.value, 0.25));
    const filteredDataset = { ...dataset, rows };
    const result = rows.map((row, index) => {
      const center = toWorld(xPosition(row[xEncoding.field] ?? ""), yPosition(row[yEncoding.field] ?? ""));
      const rowKey = csvRowKey(filteredDataset, row, index);
      return { center, rowKey, distance: Math.hypot(point.x - center.x, point.y - center.y) };
    })
      .filter((candidate) => Number.isFinite(candidate.center.x) && Number.isFinite(candidate.center.y) && candidate.distance <= hitRadius)
      .sort((left, right) => left.distance - right.distance)
      .map((candidate) => ({
        rowKey: candidate.rowKey,
        bounds: {
          minX: candidate.center.x - hitRadius,
          minY: candidate.center.y - hitRadius,
          maxX: candidate.center.x + hitRadius,
          maxY: candidate.center.y + hitRadius,
          width: hitRadius * 2,
          height: hitRadius * 2,
        } satisfies Bounds,
      }))[0] ?? null;
    return result;
  }

  function nestedTargetWouldCreateCycle(parentChartId: string, childChartId: string) {
    const descendants = new Set<string>();
    const visit = (chartId: string) => {
      Object.values(chartRelationships.value.nestedRelationships).forEach((relationship) => {
        if (relationship.parentChartId !== chartId || descendants.has(relationship.childChartId)) return;
        descendants.add(relationship.childChartId);
        visit(relationship.childChartId);
      });
    };
    visit(childChartId);
    return parentChartId === childChartId || descendants.has(parentChartId);
  }

  function nestedItemDataKey(
    element: Element,
    fallbackIndex: number,
    categoryOnly = false,
  ) {
    const identity = {
      rowKey: categoryOnly ? undefined : element.getAttribute("data-row-key") ?? undefined,
      categoryKey: element.getAttribute("data-category-key") ?? undefined,
      seriesKey: categoryOnly ? undefined : element.getAttribute("data-series-key") ?? undefined,
      rowValue: element.getAttribute("data-row-value") ?? undefined,
      columnValue: element.getAttribute("data-column-value") ?? undefined,
      role: element.getAttribute("data-mark-role") ?? undefined,
      fallbackIndex: undefined as number | undefined,
    };
    if (!identity.rowKey
      && !identity.categoryKey
      && !identity.seriesKey
      && !identity.rowValue
      && !identity.columnValue) identity.fallbackIndex = fallbackIndex;
    return JSON.stringify(identity);
  }

  function markMatchesNestedDataKey(element: Element, dataKey: string, fallbackIndex: number) {
    try {
      const identity = JSON.parse(dataKey) as {
        rowKey?: string;
        categoryKey?: string;
        seriesKey?: string;
        rowValue?: string;
        columnValue?: string;
        role?: string;
        fallbackIndex?: number;
      };
      return (identity.rowKey === undefined || element.getAttribute("data-row-key") === identity.rowKey)
        && (identity.categoryKey === undefined || element.getAttribute("data-category-key") === identity.categoryKey)
        && (identity.seriesKey === undefined || element.getAttribute("data-series-key") === identity.seriesKey)
        && (identity.rowValue === undefined || element.getAttribute("data-row-value") === identity.rowValue)
        && (identity.columnValue === undefined || element.getAttribute("data-column-value") === identity.columnValue)
        && (identity.role === undefined || element.getAttribute("data-mark-role") === identity.role)
        && (identity.fallbackIndex === undefined || fallbackIndex === identity.fallbackIndex);
    } catch {
      return [
        element.getAttribute("data-row-key"),
        element.getAttribute("data-category-key"),
        element.getAttribute("data-series-key"),
      ].includes(dataKey);
    }
  }

  function semanticItemDropZone(node: CanvasNode, point: Point, sourceNodeId: string): ChartDropZone | null {
    if (!node.chartSpec || node.id === sourceNodeId) return null;
    const nodeElement = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
      .find((element) => element.dataset.nodeId === node.id);
    if (!nodeElement) return null;
    const allMarks = Array.from(nodeElement.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"));
    const activePath = nestedDropPath.at(-1);
    const marks = activePath?.nodeId === node.id
      ? activePath.childMarkIndexes.flatMap((index) => allMarks[index] ?? [])
      : allMarks;
    const markFrames = marks
      .map((element) => ({ element, bounds: semanticSelectionBounds([element]) }))
      .filter((candidate): candidate is { element: SVGGraphicsElement; bounds: Bounds } => !!candidate.bounds);
    const directHit = markFrames
      .filter(({ bounds }) => {
        const padding = Math.max(0, (24 / Math.max(viewZoom.value, 0.25) - Math.min(bounds.width, bounds.height)) / 2);
        return point.x >= bounds.minX - padding && point.x <= bounds.maxX + padding
          && point.y >= bounds.minY - padding && point.y <= bounds.maxY + padding;
      })
      .sort((left, right) => left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height)[0];
    const categoryUnits = Array.from(new Set(markFrames
      .map(({ element }) => element.getAttribute("data-category-key"))
      .filter((value): value is string => !!value && value !== activePath?.groupKey)))
      .flatMap((categoryKey) => {
        const elements = markFrames
          .filter(({ element }) => element.getAttribute("data-category-key") === categoryKey)
          .map(({ element }) => element);
        const first = elements[0];
        if (!first) return [];
        const role = first.getAttribute("data-mark-role") ?? "item";
        const match = resolveSemanticMarkMatch(node.chartSpec!.chartType, "item", { role, categoryKey });
        const bounds = match.canEnter ? semanticSelectionBounds(elements) : null;
        return bounds ? [{ kind: "category" as const, element: first, bounds, elements }] : [];
      });
    const categoryHit = categoryUnits
      .filter(({ bounds }) => pointInBounds(point, bounds))
      .sort((left, right) => left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height)[0];
    const structuralUnits = markFrames
      .flatMap(({ element, bounds }) => {
        const elements = Array.from(element.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"));
        return elements.length > 0 ? [{ kind: "structural" as const, element, bounds, elements }] : [];
      });
    const structuralHit = structuralUnits
      .filter(({ bounds }) => pointInBounds(point, bounds))
      .sort((left, right) => left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height)[0];
    const compositeHit = structuralHit ?? categoryHit;
    const hit = compositeHit ?? directHit;
    if (!hit) return null;

    const role = hit.element.getAttribute("data-mark-role") ?? "item";
    const markGroupId = hit.element.getAttribute("data-mark-group-id") ?? undefined;
    const categoryKey = hit.element.getAttribute("data-category-key") ?? undefined;
    const seriesKey = hit.element.getAttribute("data-series-key") ?? undefined;
    const rowTarget = hit.element.hasAttribute("data-row-key")
      ? hit.element
      : hit.element.closest<SVGGraphicsElement>("[data-row-key]");
    const rowKey = rowTarget?.getAttribute("data-row-key") ?? undefined;
    const drilldownLevel = chartDrilldown.value?.nodeId === node.id
      ? chartDrilldown.value.level
      : "item";
    const match = resolveSemanticMarkMatch(node.chartSpec.chartType, drilldownLevel, {
      role,
      categoryKey,
      seriesKey,
      rowKey,
    });
    const itemElements = compositeHit?.elements ?? semanticMarkElements(hit.element, match.mode, categoryKey);
    const itemBounds = semanticSelectionBounds(itemElements) ?? hit.bounds;
    const canEnter = !!compositeHit || (drilldownLevel === "item" && match.canEnter);
    const enterDiameter = canEnter
      ? Math.min(itemBounds.width, itemBounds.height, 72 / Math.max(viewZoom.value, 0.25))
      : 0;
    const enterBounds = canEnter && enterDiameter >= 18 / Math.max(viewZoom.value, 0.25)
      ? {
        minX: itemBounds.minX + (itemBounds.width - enterDiameter) / 2,
        minY: itemBounds.minY + (itemBounds.height - enterDiameter) / 2,
        maxX: itemBounds.minX + (itemBounds.width + enterDiameter) / 2,
        maxY: itemBounds.minY + (itemBounds.height + enterDiameter) / 2,
        width: enterDiameter,
        height: enterDiameter,
      }
      : undefined;
    const siblingUnits = structuralHit
      ? structuralUnits.filter(({ element }) =>
        element.getAttribute("data-mark-role") === structuralHit.element.getAttribute("data-mark-role")
        && element.getAttribute("data-mark-group-id") === structuralHit.element.getAttribute("data-mark-group-id"))
      : categoryHit
        ? categoryUnits
        : markFrames
          .filter(({ element }) =>
            element.getAttribute("data-mark-role") === role
            && element.getAttribute("data-mark-group-id") === markGroupId)
          .map(({ element, bounds }) => ({
            kind: "mark" as const,
            element,
            bounds,
            elements: [element],
          }));
    const nestedTargets = siblingUnits.map((unit, index) => {
      const unitElement = unit.element;
      const dataKey = nestedItemDataKey(unitElement, index, unit.kind === "category");
      return {
        elementId: `mark:${node.id}:${encodeURIComponent(dataKey)}`,
        markGroupId: unitElement.getAttribute("data-mark-group-id") ?? undefined,
        dataKey,
        rowKey: unitElement.getAttribute("data-row-key") ?? undefined,
        bounds: semanticSelectionBounds(unit.kind === "structural" ? [unitElement] : unit.elements) ?? unit.bounds,
      };
    });
    const hitUnitIndex = siblingUnits.findIndex((unit) =>
      unit.element === hit.element || unit.elements.includes(hit.element));
    const hoveredTarget = nestedTargets[hitUnitIndex]
      ?? nestedTargets.find((candidate) => pointInBounds(point, candidate.bounds))
      ?? nestedTargets[0];
    if (!hoveredTarget) return null;
    return {
      targetNodeId: node.id,
      type: "nested",
      sharedChannels: [],
      bounds: itemBounds,
      compatible: !nestedTargetWouldCreateCycle(node.id, sourceNodeId),
      targetRowKey: hoveredTarget.rowKey ?? rowKey,
      targetElementId: hoveredTarget.elementId,
      targetMarkGroupId: hoveredTarget.markGroupId ?? markGroupId,
      targetDataKey: hoveredTarget.dataKey,
      nestedAction: enterBounds && pointInBounds(point, enterBounds) ? "enter" : "embed",
      enterBounds,
      targetChildMarkIndexes: canEnter
        ? itemElements.map((element) => allMarks.indexOf(element as SVGGraphicsElement)).filter((index) => index >= 0)
        : undefined,
      nestedTargets,
    };
  }

  function enterNestedDropLevel(zone: ChartDropZone) {
    if (zone.type !== "nested") return false;
    let groupKey: string | undefined;
    try {
      groupKey = (JSON.parse(zone.targetDataKey ?? "{}") as { categoryKey?: string }).categoryKey;
    } catch { /* legacy non-JSON item key */ }
    if (zone.targetChildMarkIndexes?.length) {
      nestedDropPath.push({
        nodeId: zone.targetNodeId,
        childMarkIndexes: [...zone.targetChildMarkIndexes],
        groupKey,
      });
    }
    chartDrilldown.value = { nodeId: zone.targetNodeId, level: "part" };
    semanticSelection.value = null;
    return true;
  }

  function enterCompositionDropLevel(zone: ChartDropZone) {
    if (!zone.enterCompositionId) return false;
    const member = getSelectionScopeNodes().find((node) =>
      node.compositionSpec?.id === zone.enterCompositionId);
    return !!member?.compositionSpec && beginCompositionEditing(member.compositionSpec);
  }

  function localRectDropGeometry(node: CanvasNode, rect: ChartPlotArea) {
    const outline = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ].map((corner) => nodeLocalToSelectionScopePoint(node, corner));
    const xs = outline.map(({ x }) => x);
    const ys = outline.map(({ y }) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      outline,
      bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    };
  }

  function polarSectorGeometry(node: CanvasNode, model: ReturnType<typeof createPolarCoordinateSystemModel>, innerRadius: number, outerRadius: number, startDegrees: number, endDegrees: number) {
    if (!model) return null;
    const span = Math.max(Math.abs(endDegrees - startDegrees), 1);
    const steps = Math.max(8, Math.ceil(span / 8));
    const localPoints = [
      ...Array.from({ length: steps + 1 }, (_, index) =>
        polarPointAtAngle(model.origin, outerRadius, startDegrees + (endDegrees - startDegrees) * index / steps)),
      ...Array.from({ length: steps + 1 }, (_, index) =>
        polarPointAtAngle(model.origin, innerRadius, endDegrees - (endDegrees - startDegrees) * index / steps)),
    ];
    const outline = localPoints.map((point) => nodeLocalToSelectionScopePoint(node, point));
    const xs = outline.map(({ x }) => x);
    const ys = outline.map(({ y }) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      outline,
      bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    };
  }

  function polarCompositionDropZoneAtPoint(target: CanvasNode, source: CanvasNode, point: Point): ChartDropZone | null {
    if (target.coordinateGuide?.type !== "Polar" || !target.chartSpec || !source.chartSpec) return null;
    const model = createPolarCoordinateSystemModel(target, viewZoom.value);
    const occupiedGeometry = getPolarOccupiedGeometry(target);
    if (!model || !occupiedGeometry) return null;
    const localPoint = toNodeLocalPoint(target, point);
    const dx = localPoint.x - model.origin.x;
    const dy = model.origin.y - localPoint.y;
    const distance = Math.hypot(dx, dy);
    const pointerAngle = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
    const startAngle = target.compositionSpec?.type === "concat"
      && target.compositionSpec.direction === "angular"
      ? target.compositionSpec.polarAngleOffset ?? occupiedGeometry.startAngle
      : occupiedGeometry.startAngle;
    const degrees = (pointerAngle - startAngle + 360) % 360;
    const angleSpan = target.compositionSpec?.type === "concat"
      && target.compositionSpec.direction === "angular"
      ? target.compositionSpec.polarAngleSpan ?? model.angleSpan
      : model.angleSpan;
    const chartInnerRadius = occupiedGeometry.innerRadius;
    const chartOuterRadius = occupiedGeometry.outerRadius;
    const edgeAngle = Math.min(30, Math.max(8, angleSpan * 0.22));
    const inAngle = angleSpan >= 359.999 || degrees <= angleSpan;
    const renderedScale = Math.max(
      Math.abs(target.scaleX),
      Math.abs(target.scaleY),
      0.0001,
    ) * Math.max(viewZoom.value, 0.0001);
    const radialThickness = Math.max(
      20 / renderedScale,
      Math.min(chartOuterRadius * 0.2, 56 / renderedScale),
    );
    const outerZone = {
      innerRadius: chartOuterRadius,
      outerRadius: chartOuterRadius + radialThickness,
      position: "after" as const,
    };
    const innerZone = chartInnerRadius > 0
      ? {
        innerRadius: Math.max(0, chartInnerRadius - radialThickness),
        outerRadius: chartInnerRadius,
        position: "before" as const,
      }
      : null;
    const radialZone = [innerZone, outerZone].find((zone) => zone
      && distance >= zone.innerRadius
      && distance <= zone.outerRadius
      && (angleSpan >= 359.999 || degrees <= angleSpan));
    const before = degrees <= edgeAngle;
    const after = angleSpan >= 359.999
      ? degrees >= 360 - edgeAngle
      : degrees >= Math.max(0, angleSpan - edgeAngle) && degrees <= angleSpan;
    const polarNodesFor = (type: RepeatableCompositionType, direction?: "radial" | "angular") => {
      if (type === "concat" && target.compositionSpec?.type === "concat" && direction) {
        const channel: CoordinateChannel = direction === "radial" ? "angle" : "radius";
        return concatEdgeNodesAreCompatible(target, source, direction, channel)
          ? [target, source]
          : null;
      }
      const nodes = repeatableCompositionPairNodes(source, target, type, direction);
      return nodes?.length
        && nodes.every(isPolarCompositionChart)
        && nodes.every((node) => getChartTemplateContract(node.chartSpec!.chartType)?.coordinateSystem === "Polar")
        ? nodes
        : null;
    };
    const sharedChannelCompatible = (
      nodes: CanvasNode[] | null,
      direction: "radial" | "angular",
      channel: CoordinateChannel,
    ) => !!nodes && concatNodesAreCompatible(nodes, direction, channel);
    if (radialZone) {
      const nodes = polarNodesFor("concat", "radial");
      const geometry = polarSectorGeometry(
        target,
        model,
        radialZone.innerRadius,
        radialZone.outerRadius,
        -startAngle,
        -(startAngle + angleSpan),
      );
      if (!geometry) return null;
      return {
        targetNodeId: target.id,
        type: "concat",
        sharedChannels: ["angle"],
        ...geometry,
        compatible: sharedChannelCompatible(nodes, "radial", "angle"),
        direction: "radial",
        concatPosition: radialZone.position,
      };
    }
    if (distance >= chartInnerRadius && distance <= chartOuterRadius && inAngle && (before || after)) {
      const nodes = polarNodesFor("concat", "angular");
      const isBefore = before && !after;
      const start = isBefore
        ? -startAngle
        : -(startAngle + Math.max(0, angleSpan - edgeAngle));
      const end = isBefore
        ? -(startAngle + edgeAngle)
        : -(startAngle + angleSpan);
      const geometry = polarSectorGeometry(target, model, chartInnerRadius, chartOuterRadius, start, end);
      if (!geometry) return null;
      return {
        targetNodeId: target.id,
        type: "concat",
        sharedChannels: ["radius"],
        ...geometry,
        compatible: sharedChannelCompatible(nodes, "angular", "radius"),
        direction: "angular",
        concatPosition: isBefore ? "before" : "after",
      };
    }
    if (distance >= chartInnerRadius && distance <= chartOuterRadius && inAngle) {
      const nodes = polarNodesFor("layer");
      const geometry = polarSectorGeometry(
        target,
        model,
        chartInnerRadius,
        chartOuterRadius,
        -startAngle,
        -(startAngle + angleSpan),
      );
      if (!geometry) return null;
      const sharedChannels = nodes ? compatibleLayerChannels(nodes) ?? [] : [];
      return {
        targetNodeId: target.id,
        type: "layer",
        sharedChannels,
        ...geometry,
        compatible: sharedChannels.length > 0,
      };
    }
    return null;
  }

  function compositionDropZoneAtPoint(point: Point, sourceNodeId: string): ChartDropZone | null {
    const source = findCanvasNode(sourceNodeId);
    if (!source?.chartSpec) return null;
    const nodeElementCache = new Map<string, SVGGraphicsElement | null>();
    const nodeElementFor = (nodeId: string) => {
      if (nodeElementCache.has(nodeId)) return nodeElementCache.get(nodeId) ?? null;
      const element = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
        .find((candidate) => candidate.dataset.nodeId === nodeId) ?? null;
      nodeElementCache.set(nodeId, element);
      return element;
    };
    const sourceCompositionMemberIds = new Set(
      source.compositionSpec?.members.map((member) => member.nodeId) ?? [sourceNodeId],
    );
    // Drop-zone hit testing is scoped to the current level. Nested children
    // are rendered inside their parent and must not compete as canvas targets.
    const chartTargets = currentDropZoneScopeNodes().filter((node) =>
      !sourceCompositionMemberIds.has(node.id)
      && (!!node.chartSpec || (node.kind === "group" && !!node.compositionSpec))
    );
    // Existing layer/concat compositions expose one outer drop target. Their
    // member charts remain hidden from hit testing until enterCompositionLevel.
      const outerCompositionTarget = chartTargets.find((node) =>
      !!node.compositionSpec,
    );
    if (outerCompositionTarget?.compositionSpec
      && outerCompositionTarget.compositionSpec.type !== "concat") {
      const composition = outerCompositionTarget.compositionSpec;
      const members = composition.members
        .map((member) => findCanvasNode(member.nodeId))
        .filter((member): member is CanvasNode => !!member);
      const targetChart = members.find((member) => !!member.chartSpec)
        ?? firstChartNode(outerCompositionTarget);
      if (!targetChart?.chartSpec) return null;
      const bounds = getCanvasNodeListBounds(members.length > 0 ? members : [outerCompositionTarget]);
      if (bounds && pointInBounds(point, bounds)) {
        const outerType: "layer" | "concat" = composition.type === "concat" ? "concat" : "layer";
        const pair = repeatableCompositionPairNodes(source, targetChart, outerType);
        const compatible = composition.type === "layer"
          ? (pair ? (compatibleLayerChannels(pair) ?? []).length > 0 : false)
          : composition.type === "concat"
            ? !!composition.direction && concatNodesAreCompatible(
            pair ?? [],
            composition.direction,
            composition.sharedChannels[0] ?? (composition.direction === "vertical" ? "x" : "y"),
            )
            : (pair ? (compatibleLayerChannels(pair) ?? []).length > 0 : false);
        const outerSharedChannels = composition.type === "concat"
          ? [...composition.sharedChannels]
          : (pair ? compatibleLayerChannels(pair) ?? [] : []);
        const outline = [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
        ];
        const center = {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
        };
        const enterDiameter = Math.min(
          bounds.width,
          bounds.height,
          72 / Math.max(viewZoom.value, 0.25),
        );
        const enterBounds = {
          minX: center.x - enterDiameter / 2,
          minY: center.y - enterDiameter / 2,
          maxX: center.x + enterDiameter / 2,
          maxY: center.y + enterDiameter / 2,
          width: enterDiameter,
          height: enterDiameter,
        };
        return {
          targetNodeId: targetChart.id,
          type: outerType,
          sharedChannels: outerSharedChannels,
          bounds,
          outline,
          compatible,
          direction: composition.direction,
          // Only the central portal enters the composition. The surrounding
          // region remains an outer target so a drop composes whole charts.
          ...(composition.type !== "facet"
            && composition.type !== "nested"
            && pointInBounds(point, enterBounds)
            && enterDiameter >= 18 / Math.max(viewZoom.value, 0.25)
            ? { enterCompositionId: composition.id, enterBounds }
            : { enterBounds }),
        };
      }
    }
    const enteredNestedLevel = (nodeId: string) => chartDrilldown.value?.nodeId === nodeId
      && chartDrilldown.value.level === "part";
    const nestedEnterCandidates = new Map<string, ChartDropZone>();
    const chartEnterZone = (target: CanvasNode): ChartDropZone | null => {
      if (!target.chartSpec) return null;
      const localMinX = target.kind === "leaf" ? target.contentMinX : 0;
      const localMinY = target.kind === "leaf" ? target.contentMinY : 0;
      const plotArea = target.chartSpec.plotArea ?? {
        x: localMinX,
        y: localMinY,
        width: target.width,
        height: target.height,
      };
      const localPoint = toNodeLocalPoint(target, point);
      const inside = localPoint.x >= plotArea.x
        && localPoint.x <= plotArea.x + plotArea.width
        && localPoint.y >= plotArea.y
        && localPoint.y <= plotArea.y + plotArea.height;
      if (!inside) return null;
      const geometry = localRectDropGeometry(target, plotArea);
      const center = nodeLocalToSelectionScopePoint(target, {
        x: plotArea.x + plotArea.width / 2,
        y: plotArea.y + plotArea.height / 2,
      });
      const diameter = Math.min(
        geometry.bounds.width,
        geometry.bounds.height,
        72 / Math.max(viewZoom.value, 0.25),
      );
      if (diameter < 18 / Math.max(viewZoom.value, 0.25)) return null;
      const enterBounds = {
        minX: center.x - diameter / 2,
        minY: center.y - diameter / 2,
        maxX: center.x + diameter / 2,
        maxY: center.y + diameter / 2,
        width: diameter,
        height: diameter,
      };
      const composition = target.compositionSpec;
      if (pointInBounds(point, enterBounds)
        && (composition?.type === "layer" || composition?.type === "concat")
        && editingCompositionId.value !== composition.id) {
        return {
          targetNodeId: target.id,
          type: composition.type,
          sharedChannels: [...composition.sharedChannels],
          ...geometry,
          compatible: true,
          enterCompositionId: composition.id,
          enterBounds,
          direction: composition.direction,
        };
      }
      const nodeElement = nodeElementFor(target.id);
      const markIndexes = nodeElement
        ? Array.from(nodeElement.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"))
          .map((_element, index) => index)
        : [];
      return {
        targetNodeId: target.id,
        type: "nested",
        sharedChannels: [],
        ...geometry,
        compatible: true,
        nestedAction: pointInBounds(point, enterBounds) ? "enter" : "embed",
        enterBounds,
        targetChildMarkIndexes: markIndexes,
      };
    };
    for (const target of [...chartTargets].reverse()) {
      if (enteredNestedLevel(target.id)) {
        const nestedItem = semanticItemDropZone(target, point, sourceNodeId);
        if (nestedItem) return nestedItem;
        continue;
      }
      const enterZone = chartEnterZone(target);
      if (!enterZone) continue;
      if (enterZone.enterCompositionId || enterZone.nestedAction === "enter") return enterZone;
      nestedEnterCandidates.set(target.id, enterZone);
    }
    const targets = chartTargets.filter((node) => !!node.coordinateGuide);
    const withNestedEnter = (zone: ChartDropZone) => {
      const candidate = nestedEnterCandidates.get(zone.targetNodeId);
      return candidate?.enterBounds
        ? { ...zone, enterBounds: candidate.enterBounds }
        : zone;
    };
    for (const target of targets) {
      if (!target.coordinateGuide || !target.chartSpec) continue;
      const nestedLevelEntered = enteredNestedLevel(target.id);
      if (target.coordinateGuide.type === "Polar") {
        if (nestedLevelEntered) continue;
        const polarZone = polarCompositionDropZoneAtPoint(target, source, point);
        if (polarZone) return withNestedEnter(polarZone);
        continue;
      }
      const localPoint = toNodeLocalPoint(target, point);
      const localMinX = target.kind === "leaf" ? target.contentMinX : 0;
      const localMinY = target.kind === "leaf" ? target.contentMinY : 0;
      const plotArea = target.chartSpec.plotArea ?? {
        x: localMinX,
        y: localMinY,
        width: target.width,
        height: target.height,
      };
      const inside = localPoint.x >= plotArea.x
        && localPoint.x <= plotArea.x + plotArea.width
        && localPoint.y >= plotArea.y
        && localPoint.y <= plotArea.y + plotArea.height;

      const nestedPoint = nestedLevelEntered && inside ? scatterPointDropZone(target, point) : null;
      if (nestedPoint) {
        const sourceTemplate = normalizeChartTemplate(source.chartSpec.chartType);
        const nestedCompatible = sourceTemplate === "pie" || sourceTemplate === "donut";
        return {
          targetNodeId: target.id,
          type: "nested",
          sharedChannels: [],
          bounds: nestedPoint.bounds,
          compatible: nestedCompatible,
          targetRowKey: nestedPoint.rowKey,
        };
      }
      if (nestedLevelEntered) continue;

      const edgeSizeX = Math.min(plotArea.width * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleX), 0.25), 12));
      const edgeSizeY = Math.min(plotArea.height * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleY), 0.25), 12));
      const plotRight = plotArea.x + plotArea.width;
      const plotBottom = plotArea.y + plotArea.height;
      const inVerticalSpan = localPoint.y >= plotArea.y && localPoint.y <= plotBottom;
      const inHorizontalSpan = localPoint.x >= plotArea.x && localPoint.x <= plotRight;
      const onLeft = inVerticalSpan
        && localPoint.x >= plotArea.x - edgeSizeX
        && localPoint.x <= plotArea.x;
      const onRight = inVerticalSpan
        && localPoint.x >= plotRight
        && localPoint.x <= plotRight + edgeSizeX;
      const onTop = inHorizontalSpan
        && localPoint.y >= plotArea.y - edgeSizeY
        && localPoint.y <= plotArea.y;
      const onBottom = inHorizontalSpan
        && localPoint.y >= plotBottom
        && localPoint.y <= plotBottom + edgeSizeY;
      if (target.compositionSpec?.type === "concat") {
        const links = concatLinksFor(target.compositionSpec);
        const horizontalNeighbors = links.flatMap((link) => {
          if (link.direction !== "horizontal") return [];
          const otherId = link.targetNodeId === target.id ? link.sourceNodeId : link.targetNodeId;
          const other = findCanvasNode(otherId);
          return other ? [{ link, node: other }] : [];
        });
        const verticalNeighbors = links.flatMap((link) => {
          if (link.direction !== "vertical") return [];
          const otherId = link.targetNodeId === target.id ? link.sourceNodeId : link.targetNodeId;
          const other = findCanvasNode(otherId);
          return other ? [{ link, node: other }] : [];
        });
        const cornerLeft = localPoint.x >= plotArea.x - edgeSizeX && localPoint.x <= plotArea.x;
        const cornerRight = localPoint.x >= plotRight && localPoint.x <= plotRight + edgeSizeX;
        const cornerTop = localPoint.y >= plotArea.y - edgeSizeY && localPoint.y <= plotArea.y;
        const cornerBottom = localPoint.y >= plotBottom && localPoint.y <= plotBottom + edgeSizeY;
        const horizontalNeighbor = cornerLeft
          ? horizontalNeighbors.find(({ node }) => collectNodeSelectionBounds(node).maxX <= collectNodeSelectionBounds(target).minX + 1)
          : cornerRight
            ? horizontalNeighbors.find(({ node }) => collectNodeSelectionBounds(node).minX >= collectNodeSelectionBounds(target).maxX - 1)
            : undefined;
        const verticalNeighbor = cornerTop
          ? verticalNeighbors.find(({ node }) => collectNodeSelectionBounds(node).maxY <= collectNodeSelectionBounds(target).minY + 1)
          : cornerBottom
            ? verticalNeighbors.find(({ node }) => collectNodeSelectionBounds(node).minY >= collectNodeSelectionBounds(target).maxY - 1)
            : undefined;
        if ((cornerLeft || cornerRight) && (cornerTop || cornerBottom) && horizontalNeighbor && verticalNeighbor
          && !sourceCompositionMemberIds.has(horizontalNeighbor.node.id)
          && !sourceCompositionMemberIds.has(verticalNeighbor.node.id)
          && concatEdgeNodesAreCompatible(verticalNeighbor.node, source, "horizontal", "y")
          && concatEdgeNodesAreCompatible(horizontalNeighbor.node, source, "vertical", "x")) {
          const cornerRect = {
            x: cornerLeft ? plotArea.x - edgeSizeX : plotRight,
            y: cornerTop ? plotArea.y - edgeSizeY : plotBottom,
            width: edgeSizeX,
            height: edgeSizeY,
          };
          return withNestedEnter({
            targetNodeId: target.id,
            type: "concat-corner",
            sharedChannels: ["x", "y"],
            ...localRectDropGeometry(target, cornerRect),
            compatible: true,
            concatPair: [
              {
                // The corner cell sits beside the vertical neighbor and
                // above/below the horizontal neighbor. Pairing the axes with
                // the opposite neighbor avoids placing it one cell farther
                // out at the outer diagonal.
                targetNodeId: verticalNeighbor.node.id,
                direction: "horizontal",
                position: cornerLeft ? "before" : "after",
                sharedChannels: ["y"],
              },
              {
                targetNodeId: horizontalNeighbor.node.id,
                direction: "vertical",
                position: cornerTop ? "before" : "after",
                sharedChannels: ["x"],
              },
            ],
          });
        }
      }
      if (onLeft || onRight || onTop || onBottom) {
        const horizontal = onLeft || onRight;
        const direction = horizontal ? "horizontal" : "vertical";
        const sharedChannel: CoordinateChannel = horizontal ? "y" : "x";
        const before = horizontal ? onLeft : onTop;
        const compositionNodes = repeatableCompositionPairNodes(source, target, "concat", direction);
        const compatible = target.compositionSpec?.type === "concat"
          ? concatEdgeNodesAreCompatible(target, source, direction, sharedChannel)
          : !!compositionNodes
            && compositionNodes.every(isCartesianCompositionChart)
            && concatNodesAreCompatible(compositionNodes, direction, sharedChannel);
        const localZone: ChartPlotArea = horizontal
          ? {
            x: onLeft ? plotArea.x - edgeSizeX : plotRight,
            y: plotArea.y,
            width: edgeSizeX,
            height: plotArea.height,
          }
          : {
            x: plotArea.x,
            y: onTop ? plotArea.y - edgeSizeY : plotBottom,
            width: plotArea.width,
            height: edgeSizeY,
          };
        const geometry = localRectDropGeometry(target, localZone);
        return withNestedEnter({
          targetNodeId: target.id,
          type: "concat",
          sharedChannels: [sharedChannel],
          ...geometry,
          compatible,
          direction,
          concatPosition: before ? "before" : "after",
        });
      }

      if (!inside) continue;

      const compositionNodes = repeatableCompositionPairNodes(source, target, "layer");
      const sharedChannels = compositionNodes ? compatibleLayerChannels(compositionNodes) ?? [] : [];
      const compatible = sharedChannels.length > 0;
      const layerArea = {
        x: plotArea.x,
        y: plotArea.y,
        width: plotArea.width,
        height: plotArea.height,
      };
      return withNestedEnter({
        targetNodeId: target.id,
        type: "layer",
        sharedChannels,
        ...localRectDropGeometry(target, layerArea),
        compatible,
      });
    }
    return null;
  }

  function nestedCompositionFromBlock(parent: CanvasNode, child: CanvasNode, rowKey: string) {
    const childSpec = child.chartSpec;
    const parentSpec = parent.chartSpec;
    if (!childSpec || !parentSpec) return false;
    if (childSpec.datasetId !== parentSpec.datasetId) return false;
    if (nestClueTransforms(childSpec).length > 0) return false;
    inheritParentFacetClues(parent, child);
    const childTemplate = normalizeChartTemplate(childSpec.chartType);
    if (childTemplate !== "pie" && childTemplate !== "donut") return false;
    const angleFields = childSpec.angleFields?.map((encoding) => encoding.field)
      ?? [childSpec.encodings.theta?.field ?? childSpec.encodings.angle?.field].filter((field): field is string => !!field);
    const radiusField = childSpec.encodings.radius?.field ?? childSpec.encodings.y?.field;
    if (angleFields.length === 0 || !radiusField) return false;
    return applyNestedPiesToNode(parent, rowKey, { angleFields, radiusField });
  }

  function appendConcatLink(
    composition: NonNullable<CanvasNode["compositionSpec"]>,
    target: CanvasNode,
    source: CanvasNode,
    direction: "horizontal" | "vertical",
    position: "before" | "after",
  ) {
    const links = concatLinksFor(composition);
    if (links.some((link) => link.targetNodeId === target.id && link.sourceNodeId === source.id
      && link.direction === direction)) return false;
    const targetBounds = collectNodeSelectionBounds(target);
    const sourceBounds = collectNodeSelectionBounds(source);
    if (!targetBounds || !sourceBounds) return false;
    const gap = Math.max(6, Math.min(14, Math.min(targetBounds.width, targetBounds.height) * 0.025));
    if (direction === "horizontal") {
      source.x += (position === "before"
        ? targetBounds.minX - sourceBounds.maxX - gap
        : targetBounds.maxX + gap - sourceBounds.minX);
      source.y += targetBounds.minY - sourceBounds.minY;
    } else {
      source.y += (position === "before"
        ? targetBounds.minY - sourceBounds.maxY - gap
        : targetBounds.maxY + gap - sourceBounds.minY);
      source.x += targetBounds.minX - sourceBounds.minX;
    }
    const nextLink: ConcatLinkSpec = {
      targetNodeId: target.id,
      sourceNodeId: source.id,
      direction,
      position,
      sharedChannels: [direction === "horizontal" ? "y" : "x"],
    };
    composition.concatLinks = [...links, nextLink];
    composition.sharedChannels = Array.from(new Set(composition.concatLinks.flatMap((link) => link.sharedChannels)));
    composition.direction = new Set(composition.concatLinks.map((link) => link.direction)).size === 1
      ? direction
      : undefined;
    composition.members.forEach((member) => {
      member.sharedChannels = concatMemberSharedChannels(composition, member.nodeId);
    });
    if (composition.type === "concat") {
      const owner = findCanvasNode(composition.members[0]?.nodeId ?? target.id);
      if (owner) renderSharedCoordinateComposition(owner);
    }
    return true;
  }

  function commitCompositionDrop(zone: ChartDropZone, sourceNodeId: string) {
    const source = findCanvasNode(sourceNodeId);
    const target = findCanvasNode(zone.targetNodeId);
    if (!source || !target || !zone.compatible || !source.chartSpec || !target.chartSpec) return false;
    if (zone.enterCompositionId) {
      const entered = enterCompositionDropLevel(zone);
      if (entered) selectedIds.value = [];
      return entered;
    }
    if (zone.type === "concat-corner") {
      if (!zone.concatPair || zone.concatPair.length !== 2) return false;
      const pairTarget = findCanvasNode(zone.concatPair[0]!.targetNodeId);
      const pairComposition = pairTarget?.compositionSpec?.type === "concat" ? pairTarget.compositionSpec : null;
      if (!pairTarget || !pairComposition || zone.concatPair.some((pair) => !findCanvasNode(pair.targetNodeId))) return false;
      const first = zone.concatPair[0]!;
      const firstCreated = executeComposition(
        "concat",
        false,
        first.sharedChannels,
        first.direction,
        first.position,
        first.targetNodeId,
        sourceNodeId,
      );
      if (!firstCreated) return false;
      const sourceAfter = findCanvasNode(sourceNodeId);
      const second = zone.concatPair[1]!;
      const secondTarget = findCanvasNode(second.targetNodeId);
      const composition = sourceAfter?.compositionSpec?.type === "concat" ? sourceAfter.compositionSpec : null;
      if (!sourceAfter || !secondTarget || !composition
        || !appendConcatLink(composition, secondTarget, sourceAfter, second.direction, second.position)) return false;
      sourceAfter.compositionSpec = composition;
      secondTarget.compositionSpec = composition;
      reconcileCoordinateSystems();
      selectedIds.value = [sourceAfter.id];
      axisBindingTarget.value = null;
      return true;
    }
    if (zone.type === "nested") {
      if (zone.nestedAction === "enter") {
        enterNestedDropLevel(zone);
        selectedIds.value = [];
        return true;
      }
      if (chartDrilldown.value?.nodeId !== target.id || chartDrilldown.value.level !== "part") return false;
      const rowKey = zone.targetRowKey;
      if (rowKey && nestedCompositionFromBlock(target, source, rowKey)) {
        const scopeNodes = getSelectionScopeNodes();
        source.chartSpec && dispatchRelationship({ type: "unregister-chart", chartId: source.id, keepAxes: true });
        replaceSelectionScopeNodes(scopeNodes.filter((node) => node.id !== source.id));
        reconcileCoordinateSystems();
        setSelection([target.id]);
        return true;
      }
      const nestedTargets = zone.nestedTargets?.length
        ? zone.nestedTargets
        : zone.targetElementId && zone.targetDataKey
          ? [{
            elementId: zone.targetElementId,
            markGroupId: zone.targetMarkGroupId,
            dataKey: zone.targetDataKey,
            rowKey: zone.targetRowKey,
            bounds: zone.bounds,
          }]
          : [];
      if (nestedTargets.length === 0 || !source.chartSpec || !target.chartSpec) return false;
      const parentDataset = getDataset(target.chartSpec.datasetId);
      if (!parentDataset) return false;
      const materializedParent = prepareChartData(target.id, parentDataset, target.chartSpec).dataset;
      const parentRowsByKey = nestedTargets.length > 1 ? new Map<string, DataRow>() : null;
      if (parentRowsByKey) {
        materializedParent.rows.forEach((row, index) => {
          parentRowsByKey.set(csvRowKey(materializedParent, row, index), row);
        });
      }
      const rowKeyForNestedTarget = (nestedTarget: NonNullable<ChartDropZone["nestedTargets"]>[number]) => {
        if (nestedTarget.rowKey) return nestedTarget.rowKey;
        try {
          return (JSON.parse(nestedTarget.dataKey) as { rowKey?: string }).rowKey;
        } catch {
          return undefined;
        }
      };
      const nestedContextResults = nestedTargets.map((nestedTarget) =>
        resolveNestedFilterContexts(
          target,
          source,
          nestedTarget.dataKey,
          nestedTarget.rowKey,
          materializedParent,
          parentRowsByKey?.get(rowKeyForNestedTarget(nestedTarget) ?? ""),
        ));
      const unresolvedFields = Array.from(new Set(nestedContextResults.flatMap((result) => result.unresolvedFields)));
      if (unresolvedFields.length > 0) {
        setImportNotice(`Nested context could not resolve parent structural values for: ${unresolvedFields.join(", ")}.`);
        return false;
      }
      const sourceName = source.name;
      const batchId = `nested-batch:${crypto.randomUUID()}`;
      const sourceFrame = {
        x: source.x,
        y: source.y,
        scaleX: source.scaleX,
        scaleY: source.scaleY,
        rotation: source.rotation,
      };
      const childInstances = nestedTargets.map((nestedTarget, index) => {
        const child = index === 0 ? source : cloneCanvasNodeForPaste(source, false);
        inheritParentFacetClues(target, child);
        const fitScale = Math.max(0.01, Math.min(
          nestedTarget.bounds.width * 0.78 / Math.max(child.width, 1),
          nestedTarget.bounds.height * 0.78 / Math.max(child.height, 1),
        ));
        child.name = `${sourceName} nested ${index + 1}`;
        child.scaleX = fitScale;
        child.scaleY = fitScale;
        child.rotation = target.rotation;
        child.x = nestedTarget.bounds.minX + (nestedTarget.bounds.width - child.width * fitScale) / 2;
        child.y = nestedTarget.bounds.minY + (nestedTarget.bounds.height - child.height * fitScale) / 2;
        registerChartRelationship(child, { instanceKind: "nested-child", sourceChartId: target.id });
        const relationshipId = `nested:${crypto.randomUUID()}`;
        dispatchRelationship({
          type: "begin-nested",
          relationship: {
            id: relationshipId,
            parentChartId: target.id,
            parentElementId: nestedTarget.elementId,
            parentMarkGroupId: nestedTarget.markGroupId,
            parentDataKey: nestedTarget.dataKey,
            childChartId: child.id,
            inheritedFilterContexts: nestedContextResults[index]?.contexts,
            relationType: "relative-position",
            parameters: {
              ...defaultRelativeParameters(),
              scale: { x: fitScale, y: fitScale },
              batchId,
              sourceChildId: source.id,
              sourceChildName: sourceName,
              sourceFrame,
            },
            resolverVersion: 1,
          },
        });
        dispatchRelationship({ type: "commit-nested", relationshipId });
        return { child, relationshipId };
      });
      // Register every relationship before rendering. This lets the indexed
      // nested-context cache settle once instead of being rebuilt per child.
      childInstances.forEach(({ child }) => {
        if (child.layerSpec) renderSemanticNode(child);
        else renderChartNode(child);
      });
      replaceSelectionScopeNodes([
        ...getSelectionScopeNodes().filter((node) => node.id !== source.id),
        ...childInstances.map(({ child }) => child),
      ]);
      editingCompositionId.value = `composition:${childInstances[0]!.relationshipId}`;
      // A nested batch is selected through its top-level parent. The internal
      // child nodes remain render/layout records, not independent selections.
      setSelection([target.id]);
      semanticSelection.value = null;
      axisBindingTarget.value = null;
      openNestedPositionEditor(childInstances.map(({ relationshipId }) => relationshipId));
      setImportNotice(`${sourceName} nested into ${nestedTargets.length} ${target.name} items.`);
      scheduleNestedChildLayout(childInstances.map(({ relationshipId }) => relationshipId));
      return true;
    }
    // Selection normalization follows canvas z-order, but concat ordering must
    // preserve the semantic target/source order supplied by the drop gesture.
    selectedIds.value = [target.id, source.id];
    const created = executeComposition(
      zone.type,
      false,
      zone.sharedChannels,
      zone.direction,
      zone.concatPosition,
      target.id,
      source.id,
    );
    if (created) axisBindingTarget.value = null;
    return created;
  }
  function reverseCoordinateAxis(target: CanvasNode, axis: "x" | "y") {
    const node = findCanvasNode(target.id);
    if (node?.coordinateGuide?.type !== "Cartesian") return;
    pushCanvasHistory();
    const targets = coordinateTargets(node.id, axis);
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
  function setCoordinateGuideAppearance(patch: {
    showAllAxes?: boolean;
    showXLine?: boolean;
    showYLine?: boolean;
    showXLabels?: boolean;
    showYLabels?: boolean;
    showThetaLine?: boolean;
    showRadiusLine?: boolean;
    showDiscreteLabels?: boolean;
    xDiscreteSpacing?: number;
    yDiscreteSpacing?: number;
  }) {
    const node = axisBindingNode.value;
    if (!node?.coordinateGuide) return;
    pushCanvasHistory();
    Object.assign(node.coordinateGuide, patch);
    if (patch.showAllAxes !== undefined
      || patch.showXLine !== undefined
      || patch.showYLine !== undefined
      || patch.showXLabels !== undefined
      || patch.showYLabels !== undefined
      || patch.showThetaLine !== undefined
      || patch.showRadiusLine !== undefined
      || patch.showDiscreteLabels !== undefined
      || patch.xDiscreteSpacing !== undefined
      || patch.yDiscreteSpacing !== undefined) {
      renderChartNode(node);
    }
    registerChartRelationship(node);
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
    const selected = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field
        && (item.type === "nominal" || item.type === "ordinal" || item.type === "temporal"));
      return column ? [{ field: column.name, type: column.type }] : [];
    }).slice(0, 1);
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
    const column = fieldName ? dataset.columns.find((item) => item.name === fieldName) : undefined;
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
    updateEncodingTargets(node, (_target, spec) => ({
      ...spec,
      encodings: { ...spec.encodings, radius: { field: column.name, type: column.type } },
      radiusMode: undefined,
      componentRadiusFields: undefined,
      renderer: undefined,
    }));
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
    if (!node.chartSpec || (template !== "pie" && template !== "donut")) return 0;
    const selected = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field && item.type === "quantitative");
      return column ? [{ field: column.name, type: column.type }] : [];
    }).slice(0, 1);
    updateEncodingTargets(node, (_target, spec) => {
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
    const template = normalizeChartTemplate(node.chartSpec.chartType);
    if (template === "pie" || template === "donut") {
      const current = node.chartSpec.encodings.segment?.field
        ? [node.chartSpec.encodings.segment.field]
        : node.chartSpec.angleFields?.map((encoding) => encoding.field) ?? [];
      if (current.includes(fieldName)) return true;
      if (node.chartSpec.encodings.segment?.field) return false;
      if ((node.chartSpec.angleFields?.length ?? 0) > 0 && column.type !== "quantitative") return false;
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
    const template = normalizeChartTemplate(node.chartSpec.chartType);
    if (template === "pie" || template === "donut") {
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
    const fields = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field && item.type === "quantitative");
      return column ? [{ field: column.name, type: column.type }] : [];
    });
    updateEncodingTargets(node, (_target, spec) => ({
      ...spec,
      parallelFields: fields,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    }));
  }
  function closeContextMenu() { contextMenu.value = null; }

  function mergeSharedScale(
    scales: ChartScaleSpec[],
    ownerScale: ChartScaleSpec,
    encodingType: DataColumnType,
  ): ChartScaleSpec {
    if (encodingType === "nominal") {
      return {
        ...ownerScale,
        type: "point",
        domain: Array.from(new Set(scales.flatMap((scale) =>
          (scale.domain as Array<string | number>).map(String)
        ))),
      };
    }
    if (encodingType === "temporal") {
      const values = scales
        .flatMap((scale) => scale.domain as Array<string | number>)
        .map((value) => Date.parse(String(value)))
        .filter(Number.isFinite);
      if (values.length === 0) return { ...ownerScale, type: "utc" };
      return {
        ...ownerScale,
        type: "utc",
        domain: [new Date(Math.min(...values)).toISOString(), new Date(Math.max(...values)).toISOString()],
      };
    }
    const values = scales
      .flatMap((scale) => scale.domain as number[])
      .filter(Number.isFinite);
    if (values.length === 0) return ownerScale;
    return { ...ownerScale, type: "linear", domain: [Math.min(...values), Math.max(...values)], nice: true };
  }

  function sharedCoordinateMembers(node: CanvasNode) {
    if (node.compositionSpec?.type !== "layer" && node.compositionSpec?.type !== "concat") return [node];
    return node.compositionSpec.members
      .map((member) => findCanvasNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member?.chartSpec);
  }

  function mergedCompositionScales(owner: CanvasNode) {
    const channels = owner.coordinateSystem?.sharedChannels
      .filter((channel): channel is "x" | "y" => channel === "x" || channel === "y") ?? [];
    const members = sharedCoordinateMembers(owner);
    const result: Partial<Record<"x" | "y", ChartScaleSpec>> = {};
    channels.forEach((channel) => {
      const ownerScale = owner.chartSpec?.scales?.[channel];
      const encodingType = encodingForSharedChannel(owner, channel)?.type;
      if (!ownerScale || !encodingType) return;
      const barCategoryScale = owner.compositionSpec?.type === "concat" && channel === "x"
        ? members.find((member) => normalizeChartTemplate(member.chartSpec?.chartType ?? "") === "bar")
          ?.chartSpec?.scales?.x
        : undefined;
      if (barCategoryScale?.type === "point") {
        result[channel] = {
          ...barCategoryScale,
          domain: [...barCategoryScale.domain] as string[],
          range: [...barCategoryScale.range] as [number, number],
        };
        return;
      }
      const availableScales = members
        .filter((member) => member.coordinateSystem?.members
          .find((item) => item.nodeId === member.id)
          ?.channels.includes(channel) ?? true)
        .map((member) => member.chartSpec?.scales?.[channel])
        .filter((scale): scale is ChartScaleSpec => !!scale);
      if (availableScales.length > 0) {
        result[channel] = mergeSharedScale(availableScales, ownerScale, encodingType);
      }
    });
    return Object.keys(result).length > 0 ? result : undefined;
  }

  function alignConcatSharedFrame(owner: CanvasNode, members: CanvasNode[]) {
    const direction = owner.compositionSpec?.direction ?? "horizontal";
    members.forEach((member) => {
      if (member.coordinateGuide?.type !== "Cartesian" || owner.coordinateGuide?.type !== "Cartesian") return;
      member.rotation = owner.rotation;
      if (direction === "horizontal") {
        member.y = owner.y;
        member.scaleY = owner.scaleY;
        member.coordinateGuide.origin.y = owner.coordinateGuide.origin.y;
        member.coordinateGuide.yDirection = owner.coordinateGuide.yDirection;
        member.coordinateGuide.yScale = owner.coordinateGuide.yScale;
      } else {
        member.x = owner.x;
        member.scaleX = owner.scaleX;
        member.coordinateGuide.origin.x = owner.coordinateGuide.origin.x;
        member.coordinateGuide.xDirection = owner.coordinateGuide.xDirection;
        member.coordinateGuide.xScale = owner.coordinateGuide.xScale;
      }
    });
  }

  function setPolarNodeOrigin(node: CanvasNode, desiredOrigin: Point, rotation: number) {
    if (node.coordinateGuide?.type !== "Polar") return;
    node.rotation = rotation;
    const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
    const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
    const localCenter = { x: localMinX + node.width / 2, y: localMinY + node.height / 2 };
    const radians = rotation * Math.PI / 180;
    const dx = (node.coordinateGuide.origin.x - localCenter.x) * node.scaleX;
    const dy = (node.coordinateGuide.origin.y - localCenter.y) * node.scaleY;
    const worldCenter = {
      x: desiredOrigin.x - (dx * Math.cos(radians) - dy * Math.sin(radians)),
      y: desiredOrigin.y - (dx * Math.sin(radians) + dy * Math.cos(radians)),
    };
    node.x = worldCenter.x - node.width * node.scaleX / 2;
    node.y = worldCenter.y - node.height * node.scaleY / 2;
  }

  function alignPolarConcatFrame(owner: CanvasNode, members: CanvasNode[]) {
    if (owner.coordinateGuide?.type !== "Polar" || owner.compositionSpec?.type !== "concat") return;
    if (concatHasMixedDirections(owner.compositionSpec)) return;
    if (!members.every((member) => member.coordinateGuide?.type === "Polar")) return;
    const direction = owner.compositionSpec.direction;
    const orderedMembers = owner.compositionSpec.members
      .map((item) => members.find((member) => member.id === item.nodeId))
      .filter((member): member is CanvasNode => !!member);
    const ownerOrigin = nodeLocalToSelectionScopePoint(owner, owner.coordinateGuide.origin);
    const totalAngleSpan = Math.max(1, Math.min(
      owner.compositionSpec.polarAngleSpan ?? owner.coordinateGuide.angleSpan ?? 360,
      360,
    ));
    const baseAngleOffset = owner.compositionSpec.polarAngleOffset ?? owner.coordinateGuide.angleOffset ?? 0;
    const angularSpan = totalAngleSpan / Math.max(orderedMembers.length, 1);
    orderedMembers.forEach((member, index) => {
      const guide = member.coordinateGuide;
      if (guide?.type !== "Polar") return;
      member.width = owner.width;
      member.height = owner.height;
      member.scaleX = owner.scaleX;
      member.scaleY = owner.scaleY;
      guide.origin = { ...owner.coordinateGuide!.origin };
      guide.radiusScale = owner.coordinateGuide?.radiusScale;
      guide.ringScale = owner.coordinateGuide?.ringScale;
      setPolarNodeOrigin(member, ownerOrigin, owner.rotation);
      if (direction === "angular") {
        guide.angleSpan = angularSpan;
        guide.angleOffset = baseAngleOffset + angularSpan * index;
        guide.innerRadiusRatio = 0;
        guide.outerRadiusRatio = 1;
      } else {
        guide.angleSpan = owner.coordinateGuide?.angleSpan;
        guide.angleOffset = baseAngleOffset;
        guide.innerRadiusRatio = index / orderedMembers.length;
        guide.outerRadiusRatio = (index + 1) / orderedMembers.length;
      }
    });
  }

  function alignConcatPlotLayout(owner: CanvasNode, members: CanvasNode[]) {
    const composition = owner.compositionSpec;
    const direction = composition?.direction ?? "horizontal";
    if (composition?.type === "concat" && concatHasMixedDirections(composition)) return;
    const orderedMembers = owner.compositionSpec?.members
      .map((item) => members.find((member) => member.id === item.nodeId))
      .filter((member): member is CanvasNode => !!member) ?? members;
    const firstBounds = orderedMembers[0] ? collectNodeSelectionBounds(orderedMembers[0]) : null;
    if (!firstBounds) return;
    const gap = Math.max(6, Math.min(14, Math.min(firstBounds.width, firstBounds.height) * 0.025));
    let cursor = direction === "horizontal" ? firstBounds.minX : firstBounds.minY;
    orderedMembers.forEach((member) => {
      const bounds = collectNodeSelectionBounds(member);
      if (direction === "horizontal") {
        member.x += cursor - bounds.minX;
        cursor += bounds.width + gap;
      } else {
        member.y += cursor - bounds.minY;
        cursor += bounds.height + gap;
      }
    });
  }

  function alignMixedConcatFrames(owner: CanvasNode, members: CanvasNode[]) {
    const composition = owner.compositionSpec;
    if (composition?.type !== "concat") return;
    const byId = new Map(members.map((member) => [member.id, member]));
    const links = concatLinksFor(composition).filter((link) =>
      (link.direction === "horizontal" || link.direction === "vertical")
      && byId.has(link.targetNodeId)
      && byId.has(link.sourceNodeId),
    );
    if (links.length === 0) return;

    const cartesianMembers = members.filter((member) => member.coordinateGuide?.type === "Cartesian");
    const cartesianIds = new Set(cartesianMembers.map((member) => member.id));
    const layoutLinks = links.filter((link) =>
      cartesianIds.has(link.targetNodeId) && cartesianIds.has(link.sourceNodeId));
    if (layoutLinks.length === 0) return;

    const boundsFor = (nodeId: string) => {
      const node = byId.get(nodeId);
      return node ? collectNodeSelectionBounds(node) : null;
    };
    const moveAxisTo = (node: CanvasNode, axis: "x" | "y", desiredMin: number) => {
      const bounds = collectNodeSelectionBounds(node);
      const delta = desiredMin - (axis === "x" ? bounds.minX : bounds.minY);
      if (axis === "x") node.x += delta;
      else node.y += delta;
    };

    // Apply the link-local frame first. Scaling changes the live selection
    // bounds, so geometry must be solved against these final member sizes.
    layoutLinks.forEach((link) => {
      const target = byId.get(link.targetNodeId);
      const source = byId.get(link.sourceNodeId);
      if (!target || !source
        || target.coordinateGuide?.type !== "Cartesian"
        || source.coordinateGuide?.type !== "Cartesian") return;
      if (link.direction === "horizontal") {
        source.scaleY = target.scaleY;
        source.coordinateGuide.origin.y = target.coordinateGuide.origin.y;
        source.coordinateGuide.yDirection = target.coordinateGuide.yDirection;
        source.coordinateGuide.yScale = target.coordinateGuide.yScale;
      } else {
        source.scaleX = target.scaleX;
        source.coordinateGuide.origin.x = target.coordinateGuide.origin.x;
        source.coordinateGuide.xDirection = target.coordinateGuide.xDirection;
        source.coordinateGuide.xScale = target.coordinateGuide.xScale;
      }
    });
    const defaultGap = (() => {
      const anchorBounds = boundsFor(owner.id) ?? collectNodeSelectionBounds(cartesianMembers[0]!);
      return Math.max(6, Math.min(14, Math.min(anchorBounds.width, anchorBounds.height) * 0.025));
    })();
    const gapFor = (link: ConcatLinkSpec) => {
      const targetBounds = boundsFor(link.targetNodeId);
      return targetBounds
        ? Math.max(6, Math.min(14, Math.min(targetBounds.width, targetBounds.height) * 0.025))
        : defaultGap;
    };

    // Solve each canvas axis independently. A horizontal edge owns x (the
    // side-by-side placement), while a vertical edge owns y. The opposite
    // direction only aligns the shared axis. Keeping those constraints
    // separate is what allows a member to sit at a real two-dimensional
    // concat corner without one edge undoing the other.
    const layoutAxis = (axis: "x" | "y") => {
      const anchorId = byId.has(owner.id) ? owner.id : layoutLinks[0]!.targetNodeId;
      const values = new Map<string, number>();
      const primary = new Set<string>();
      const queue = [anchorId];
      const anchorBounds = boundsFor(anchorId);
      if (!anchorBounds) return;
      values.set(anchorId, axis === "x" ? anchorBounds.minX : anchorBounds.minY);

      const assign = (nodeId: string, desired: number, isPrimary: boolean) => {
        const node = byId.get(nodeId);
        if (!node) return false;
        // The owner is the stable canvas anchor. Links are solved relative to
        // it, so a cycle must never move it when the reverse edge is visited.
        if (nodeId === anchorId) return false;
        const current = values.get(nodeId);
        const alreadyPrimary = primary.has(nodeId);
        if (current !== undefined && (alreadyPrimary || !isPrimary)) return false;
        values.set(nodeId, desired);
        if (isPrimary) primary.add(nodeId);
        moveAxisTo(node, axis, desired);
        return true;
      };

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const current = byId.get(currentId);
        const currentBounds = boundsFor(currentId);
        if (!current || !currentBounds) continue;
        layoutLinks.forEach((link) => {
          const forward = link.targetNodeId === currentId;
          const reverse = link.sourceNodeId === currentId;
          if (!forward && !reverse) return;
          const neighborId = forward ? link.sourceNodeId : link.targetNodeId;
          const neighbor = byId.get(neighborId);
          const neighborBounds = boundsFor(neighborId);
          if (!neighbor || !neighborBounds) return;
          const isPrimary = axis === "x"
            ? link.direction === "horizontal"
            : link.direction === "vertical";
          let desired: number;
          if (!isPrimary) {
            desired = axis === "x" ? currentBounds.minX : currentBounds.minY;
          } else if (axis === "x") {
            const sourceIsCurrent = link.sourceNodeId === currentId;
            const sourceBefore = link.position === "before";
            const linkGap = gapFor(link);
            if (sourceIsCurrent) {
              desired = sourceBefore
                ? currentBounds.maxX + linkGap
                : currentBounds.minX - linkGap - neighborBounds.width;
            } else {
              desired = sourceBefore
                ? currentBounds.minX - linkGap - neighborBounds.width
                : currentBounds.maxX + linkGap;
            }
          } else {
            const sourceIsCurrent = link.sourceNodeId === currentId;
            const sourceBefore = link.position === "before";
            const linkGap = gapFor(link);
            if (sourceIsCurrent) {
              desired = sourceBefore
                ? currentBounds.maxY + linkGap
                : currentBounds.minY - linkGap - neighborBounds.height;
            } else {
              desired = sourceBefore
                ? currentBounds.minY - linkGap - neighborBounds.height
                : currentBounds.maxY + linkGap;
            }
          }
          if (assign(neighborId, desired, isPrimary)) queue.push(neighborId);
        });
      }
    };

    layoutAxis("x");
    layoutAxis("y");
  }

  function renderSharedCoordinateComposition(node: CanvasNode) {
    const type = node.compositionSpec?.type;
    const members = sharedCoordinateMembers(node);
    if (members.length <= 1 || (type !== "layer" && type !== "concat")) {
      renderChartNode(node);
      return;
    }
    const owner = members.find((member) => member.id === node.coordinateSystem?.ownerNodeId) ?? members[0]!;
    // First obtain every unit's native domain. The second pass merges only the
    // declared shared channels and preserves independent concat dimensions.
    members.forEach((member) => renderChartNode(member, false));
    if (type === "concat") {
      if (owner.coordinateGuide?.type === "Polar") alignPolarConcatFrame(owner, members);
      if (!concatHasMixedDirections(owner.compositionSpec!)) {
        alignConcatSharedFrame(owner, members);
        if (owner.coordinateGuide?.type !== "Polar") alignConcatPlotLayout(owner, members);
      } else alignMixedConcatFrames(owner, members);
    }
    members.forEach((member) => renderChartNode(member, true));
    if (owner.coordinateSystem?.type === "Polar") {
      const outerRadius = Math.max(
        0,
        ...members.map((member) => getPolarOccupiedGeometry(member)?.outerRadius ?? 0),
      );
      const sharedOuterRadius = outerRadius > 0 ? outerRadius : undefined;
      if (owner.compositionSpec?.type === "layer" || owner.compositionSpec?.type === "concat") {
        members.forEach((member) => {
          if (member.compositionSpec?.type === "layer" || member.compositionSpec?.type === "concat") {
            member.compositionSpec.polarOuterRadius = sharedOuterRadius;
          }
        });
      }
      members.forEach((member) => {
        if (member.coordinateSystem?.type === "Polar") {
          member.coordinateSystem.polarOuterRadius = sharedOuterRadius;
        }
      });
    }
  }

  function chartDataPreparationKey(spec: ChartSpec) {
    const {
      scales: _scales,
      plotArea: _plotArea,
      polarArea: _polarArea,
      styleTokens: _styleTokens,
      renderer: _renderer,
      autoAggregations: _autoAggregations,
      dimensionRecommendations: _dimensionRecommendations,
      markGroups,
      ...dataSpec
    } = spec;
    return JSON.stringify({
      ...dataSpec,
      markGroups: markGroups?.map((group) => ({
        id: group.id,
        chartId: group.chartId,
        role: group.role,
        memberKeys: group.memberKeys,
        seriesField: group.seriesField,
        allowOverrides: group.allowOverrides,
      })),
    });
  }

  function prepareChartDataForNode(
    node: CanvasNode,
    sourceDataset: Dataset,
    spec: ChartSpec,
  ) {
    const isNestedChild = chartRelationships.value.charts[node.id]?.instanceKind === "nested-child";
    if (!isNestedChild) return prepareChartData(node.id, sourceDataset, spec);
    const dataKey = chartDataPreparationKey(spec);
    const cached = nestedPreparedDataCache.get(node.id);
    if (cached?.sourceDataset === sourceDataset && cached.dataKey === dataKey) {
      return {
        dataset: cached.result.dataset,
        chartSpec: {
          ...cached.result.chartSpec,
          styleTokens: spec.styleTokens,
          markGroups: spec.markGroups,
          scales: spec.scales,
          plotArea: spec.plotArea,
          polarArea: spec.polarArea,
          renderer: spec.renderer,
        },
      };
    }
    const result = prepareChartData(node.id, sourceDataset, spec);
    if (nestedPreparedDataCache.size >= 512) nestedPreparedDataCache.clear();
    nestedPreparedDataCache.set(node.id, { sourceDataset, dataKey, result });
    return result;
  }

  function renderChartNode(node: CanvasNode, useLayerScales = true) {
    const coordinateOwner = useLayerScales
      && (node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
      ? findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "")
      : null;
    const storedChartSpec = node.chartSpec
      ? {
        ...node.chartSpec,
        encodings: { ...node.chartSpec.encodings },
      }
      : null;
    const template = storedChartSpec ? normalizeChartTemplate(storedChartSpec.chartType) : null;
    if (!storedChartSpec || !template) return;
    const chartSpec = template === "line"
      ? migrateLineChartAppearance(storedChartSpec)
      : storedChartSpec;
    if (template === "line"
      && storedChartSpec.renderer?.version !== 3
      && !node.layerSpec
      && node.compositionSpec?.type !== "layer") {
      const targetWidth = node.height * (380 / 180);
      if (targetWidth > node.width) {
        const scaleCorrection = node.width / targetWidth;
        node.width = targetWidth;
        node.scaleX *= scaleCorrection;
        node.scaleY *= scaleCorrection;
      }
    }
    const contract = getChartTemplateContract(chartSpec.chartType)!;
    const sourceDataset = getDataset(chartSpec.datasetId);
    const defaultFieldsUnavailable = chartSpec.defaultDataBinding === true
      && !!sourceDataset
      && [
        ...Object.values(chartSpec.encodings),
        ...(chartSpec.seriesFields ?? []),
        ...(chartSpec.valueFields ?? []),
      ].some((encoding) =>
        !!encoding && !sourceDataset.columns.some((column) => column.name === encoding.field));
    const encodingIssues = resolveChartEncodingIssues(chartSpec);
    const complete = hasRequiredChartEncodings(chartSpec)
      && encodingIssues.length === 0
      && !defaultFieldsUnavailable;
    const coordinateReady = contract.coordinateSystem === "CoordinateFree" || node.coordinateGuide?.type === contract.coordinateSystem;
    if (encodingIssues.length > 0) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        polarArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "error",
          error: encodingIssues.map((issue) => issue.message).join(" "),
        },
      };
      return;
    }
    if (!coordinateReady) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        polarArea: undefined,
        renderer: undefined,
      };
      return;
    }
    const fallbackChartSpec = complete ? null : defaultChartSpecWithAppearance(chartSpec, node.id);
    if (!complete && !fallbackChartSpec) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        polarArea: undefined,
        renderer: undefined,
      };
      return;
    }
    const renderingInputSpec = fallbackChartSpec ?? chartSpec;
    const renderDataset = fallbackChartSpec ? defaultChartDataset : sourceDataset;
    if (!renderDataset) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        polarArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "error",
          error: "The bound dataset is no longer available.",
        },
      };
      return;
    }
    const effectiveDataTransforms = fallbackChartSpec
      ? renderingInputSpec.dataTransforms
      : transformsWithNestedContext(node, renderingInputSpec.dataTransforms);
    const materializationSpec = effectiveDataTransforms === renderingInputSpec.dataTransforms
      ? renderingInputSpec
      : { ...renderingInputSpec, dataTransforms: effectiveDataTransforms };
    const { dataset, chartSpec: syncedChartSpec } = prepareChartDataForNode(
      node,
      renderDataset,
      materializationSpec,
    );
    const usesDerivedValueSeries = (renderingInputSpec.valueFields?.length ?? 0) > 1;
    const persistedSyncedChartSpec = usesDerivedValueSeries
      ? {
        ...syncedChartSpec,
        dataTransforms: renderingInputSpec.dataTransforms,
        encodings: renderingInputSpec.encodings,
        series: renderingInputSpec.series,
        seriesFields: renderingInputSpec.seriesFields,
        valueFields: renderingInputSpec.valueFields,
      }
      : { ...syncedChartSpec, dataTransforms: renderingInputSpec.dataTransforms };
    const ownerScales = coordinateOwner ? mergedCompositionScales(coordinateOwner) : undefined;
    const ownerPlotArea = coordinateOwner?.chartSpec?.plotArea;
    const memberLocalOrigin = {
      x: node.kind === "leaf" ? node.contentMinX : 0,
      y: node.kind === "leaf" ? node.contentMinY : 0,
    };
    const ownerLocalOrigin = {
      x: coordinateOwner?.kind === "leaf" ? coordinateOwner.contentMinX : 0,
      y: coordinateOwner?.kind === "leaf" ? coordinateOwner.contentMinY : 0,
    };
    const sharedOffset = {
      x: memberLocalOrigin.x - ownerLocalOrigin.x,
      y: memberLocalOrigin.y - ownerLocalOrigin.y,
    };
    const nativePlotArea = renderingInputSpec.plotArea;
    const sharedChannels = new Set(
      (coordinateOwner?.coordinateSystem?.sharedChannels ?? []).filter((channel) =>
        node.coordinateSystem?.members.find((member) => member.nodeId === node.id)?.channels.includes(channel)
        ?? true),
    );
    const sharedPlotArea = ownerPlotArea && nativePlotArea
      ? {
        x: sharedChannels.has("x") ? ownerPlotArea.x + sharedOffset.x : nativePlotArea.x,
        y: sharedChannels.has("y") ? ownerPlotArea.y + sharedOffset.y : nativePlotArea.y,
        width: sharedChannels.has("x") ? ownerPlotArea.width : nativePlotArea.width,
        height: sharedChannels.has("y") ? ownerPlotArea.height : nativePlotArea.height,
      }
      : undefined;
    const sharedScales = ownerScales
      ? {
        ...(sharedChannels.has("x") && ownerScales.x
          ? {
            x: {
              ...ownerScales.x,
              range: ownerScales.x.range.map((value) => value + sharedOffset.x) as [number, number],
            },
          }
          : {}),
        ...(sharedChannels.has("y") && ownerScales.y
          ? {
            y: {
              ...ownerScales.y,
              range: ownerScales.y.range.map((value) => value + sharedOffset.y) as [number, number],
            },
          }
          : {}),
      }
      : undefined;
    node.llmRenderer = null;
    try {
      const result = renderDeterministicChart({
        chartId: node.id,
        width: node.width,
        height: node.height,
        minX: node.kind === "leaf" ? node.contentMinX : 0,
        minY: node.kind === "leaf" ? node.contentMinY : 0,
        coordinateGuide: node.coordinateGuide,
        chartSpec: syncedChartSpec,
        dataset,
        sharedPlotArea,
        sharedScales,
      });
      const renderingChartSpec: ChartSpec = {
        ...syncedChartSpec,
        scales: result.scales,
        plotArea: result.plotArea,
        polarArea: result.polarArea,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "ready",
        },
      };
      const renderedChartSpec: ChartSpec = fallbackChartSpec ? {
        ...chartSpec,
        scales: result.scales,
        plotArea: result.plotArea,
        polarArea: result.polarArea,
        renderer: undefined,
      } : {
        ...persistedSyncedChartSpec,
        scales: result.scales,
        plotArea: result.plotArea,
        polarArea: result.polarArea,
        renderer: renderingChartSpec.renderer,
      };
      node.chartSpec = renderedChartSpec;
      node.renderedContent = result.content;
      if (node.coordinateGuide?.type === "Polar" && result.polarArea) {
        node.coordinateGuide.radius = result.polarArea.outerRadius;
      }
      if (node.nestedSpec && template === "scatter") {
        const nested = renderNestedPie({
          chartId: node.id,
          width: node.width,
          height: node.height,
          minX: node.kind === "leaf" ? node.contentMinX : 0,
          minY: node.kind === "leaf" ? node.contentMinY : 0,
          baseSpec: renderingChartSpec,
          nestedSpec: node.nestedSpec,
          dataset,
        });
        node.renderedContent += nested.content;
      }
    } catch (error) {
      node.renderedContent = null;
      node.chartSpec = {
        ...(fallbackChartSpec ? chartSpec : persistedSyncedChartSpec),
        scales: undefined,
        plotArea: undefined,
        polarArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "error",
          error: error instanceof Error ? error.message : "Unable to render this chart.",
        },
      };
    }
  }

  function cloneCanvasNodeForPaste(node: CanvasNode, renderClone = true): CanvasNode {
    const nextId = crypto.randomUUID();
    const coordinateGuide = node.coordinateGuide
      ? { ...node.coordinateGuide, origin: { ...node.coordinateGuide.origin } }
      : node.coordinateGuide;
    const chartSpec = cloneChartSpec(node.chartSpec);
    if (node.kind === "leaf") {
      const clone: CanvasLeafNode = { ...node, coordinateGuide, coordinateSystem: null, compositionSpec: null, chartSpec, id: nextId, name: `${node.name} copy`, content: scopeSvgContent(node.content, nextId) };
      clone.coordinateSystem = standaloneCoordinateSystem(clone);
      if (renderClone && clone.llmRenderer?.status !== "ready") {
        renderChartNode(clone);
        renderSemanticNode(clone);
      }
      return clone;
    }
    const clone: CanvasGroupNode = { ...node, coordinateGuide, coordinateSystem: null, compositionSpec: null, chartSpec, id: nextId, name: `${node.name} copy`, children: node.children.map((c) => cloneCanvasNodeForPaste(c, renderClone)) };
    clone.coordinateSystem = standaloneCoordinateSystem(clone);
    if (renderClone && clone.llmRenderer?.status !== "ready") {
      renderChartNode(clone);
      renderSemanticNode(clone);
    }
    return clone;
  }
  function copySelectedNodes() {
    const sel = new Set(selectedIds.value);
    const copied = getSelectionScopeNodes().filter((n) => sel.has(n.id)).map((n) => cloneCanvasNode(n));
    if (copied.length === 0) return;
    clipboardNodes.value = copied;
    clipboardPasteCount = 0;
  }
  function getCanvasNodeListBounds(nodes: CanvasNode[]): Bounds | null {
    let bounds: Bounds | null = null;
    for (const n of nodes) bounds = mergeBounds(bounds, collectNodeBounds(n));
    return bounds;
  }
  function pasteClipboardNodes(point?: Point) {
    if (clipboardNodes.value.length === 0) return;
    const nextNodes = clipboardNodes.value.map((n) => cloneCanvasNodeForPaste(n));
    const bounds = getCanvasNodeListBounds(nextNodes);
    if (!bounds) return;
    clipboardPasteCount += 1;
    const editingGroup = getGroupAtPath();
    const canvasBounds = editingGroup
      ? { minX: 0, minY: 0, maxX: editingGroup.width, maxY: editingGroup.height, width: editingGroup.width, height: editingGroup.height }
      : getCanvasBounds();
    const intendedDx = point && !editingGroup ? point.x - (bounds.minX + bounds.width / 2) : clipboardPasteCount * 16;
    const intendedDy = point && !editingGroup ? point.y - (bounds.minY + bounds.height / 2) : clipboardPasteCount * 16;
    const dx = clamp(intendedDx, canvasBounds.minX - bounds.minX, canvasBounds.maxX - bounds.maxX);
    const dy = clamp(intendedDy, canvasBounds.minY - bounds.minY, canvasBounds.maxY - bounds.maxY);
    nextNodes.forEach((n) => { n.x += dx; n.y += dy; });
    pushCanvasHistory();
    replaceSelectionScopeNodes([...getSelectionScopeNodes(), ...nextNodes]);
    walkCanvasNodes(nextNodes).forEach((node) => registerChartRelationship(node));
    setSelection(nextNodes.map((n) => n.id));
  }

  // --- import ---
  function countTemplateNodes(nodes: import("../types").ParsedSvgTemplateNode[]): number {
    return nodes.reduce((count, n) => n.kind === "leaf" ? count + 1 : count + 1 + countTemplateNodes(n.children), 0);
  }
  function collectElementOrientations(node: ParsedSvgTemplateNode): ElementOrientation[] {
    if (node.kind === "leaf") return node.orientation ? [node.orientation] : [];
    return node.children.flatMap(collectElementOrientations);
  }
  function solveOrientationCenter(
    orientations: ElementOrientation[],
    usePerpendicularDirection: boolean,
  ): { point: Point; error: number } | null {
    const solve = (items: ElementOrientation[]) => {
      let a = 0, b = 0, c = 0, rhsX = 0, rhsY = 0, totalWeight = 0;
      items.forEach((orientation) => {
        const direction = usePerpendicularDirection
          ? { x: -orientation.direction.y, y: orientation.direction.x }
          : orientation.direction;
        const normal = { x: -direction.y, y: direction.x };
        const weight = Math.max(0.01, orientation.confidence * orientation.confidence);
        const projection = normal.x * orientation.point.x + normal.y * orientation.point.y;
        a += weight * normal.x * normal.x;
        b += weight * normal.x * normal.y;
        c += weight * normal.y * normal.y;
        rhsX += weight * normal.x * projection;
        rhsY += weight * normal.y * projection;
        totalWeight += weight;
      });
      const determinant = a * c - b * b;
      if (items.length < 3 || totalWeight <= 0 || determinant <= (a + c) * 0.000001) return null;
      return {
        x: (rhsX * c - b * rhsY) / determinant,
        y: (a * rhsY - b * rhsX) / determinant,
      };
    };
    const distanceToLine = (orientation: ElementOrientation, point: Point) => {
      const direction = usePerpendicularDirection
        ? { x: -orientation.direction.y, y: orientation.direction.x }
        : orientation.direction;
      return Math.abs(
        -direction.y * (point.x - orientation.point.x)
        + direction.x * (point.y - orientation.point.y),
      );
    };

    const initial = solve(orientations);
    if (!initial) return null;
    const distances = orientations.map((orientation) => distanceToLine(orientation, initial));
    const sortedDistances = [...distances].sort((left, right) => left - right);
    const median = sortedDistances[Math.floor(sortedDistances.length / 2)] ?? 0;
    const threshold = Math.max(median * 2.5, 0.5);
    const inliers = orientations.filter((_, index) => (distances[index] ?? Infinity) <= threshold);
    const point = solve(inliers.length >= 3 ? inliers : orientations) ?? initial;
    let weightedError = 0;
    let totalWeight = 0;
    orientations.forEach((orientation) => {
      const weight = Math.max(0.01, orientation.confidence * orientation.confidence);
      const distance = distanceToLine(orientation, point);
      weightedError += weight * distance * distance;
      totalWeight += weight;
    });
    return { point, error: Math.sqrt(weightedError / Math.max(totalWeight, 0.0001)) };
  }
  function estimatePolarOrigin(node: ParsedSvgTemplateNode): Point {
    const fallback = {
      x: node.bounds.minX + node.bounds.width / 2,
      y: node.bounds.minY + node.bounds.height / 2,
    };
    const orientations = collectElementOrientations(node)
      .filter((orientation) => orientation.confidence >= 0.12)
      .slice(0, 600);
    const candidates = [
      solveOrientationCenter(orientations, false),
      solveOrientationCenter(orientations, true),
    ].filter((candidate): candidate is { point: Point; error: number } => !!candidate)
      .filter(({ point }) =>
        point.x >= node.bounds.minX - node.bounds.width * 0.15
        && point.x <= node.bounds.maxX + node.bounds.width * 0.15
        && point.y >= node.bounds.minY - node.bounds.height * 0.15
        && point.y <= node.bounds.maxY + node.bounds.height * 0.15,
      )
      .sort((left, right) => left.error - right.error);
    const best = candidates[0];
    const maximumUsefulError = Math.max(node.bounds.width, node.bounds.height) * 0.2;
    return best && best.error <= maximumUsefulError ? best.point : fallback;
  }
  function setImportNotice(message: string) {
    importNotice.value = message;
    if (importNoticeTimer !== null) window.clearTimeout(importNoticeTimer);
    importNoticeTimer = window.setTimeout(() => { importNotice.value = null; importNoticeTimer = null; }, 4000);
  }
  function createInitialChartSpec(chartType: string, datasetId: string): ChartSpec {
    const defaultSpec = createDefaultChartSpec(chartType);
    return defaultSpec
      ? { ...defaultSpec, datasetId, defaultDataBinding: true }
      : createUnboundChartSpec(chartType, datasetId);
  }
  function resetChartBindingsForDataset(datasetId: string) {
    if (!getDataset(datasetId)) return false;

    const targets = walkCanvasNodes(canvasNodes.value)
      .filter((node) => !!node.chartSpec && node.chartSpec.datasetId !== datasetId);
    if (targets.length === 0) return false;

    pushCanvasHistory();

    targets.forEach((node) => {
      if (!node.chartSpec) return;
      const prior = node.chartSpec;
      node.llmRenderer = null;
      node.chartSpec = {
        chartType: prior.chartType,
        templateId: prior.templateId
          ?? normalizeChartTemplate(prior.chartType)
          ?? undefined,
        datasetId,
        defaultDataBinding: supportsDefaultChartData(prior.chartType) || undefined,
        encodings: {},
        styleTokens: prior.styleTokens,
      };
      node.renderedContent = null;
      renderChartNode(node);
      registerChartRelationship(node);
    });

    axisBindingTarget.value = null;
    dimensionDropTarget.value = null;
    setImportNotice(
      `Chart bindings cleared for ${
        getDataset(datasetId)?.name ?? "the selected dataset"
      }.`,
    );
    return true;
  }
  function createFacetCopy(
    nodes: CanvasNode[],
    bounds: Bounds,
    x: number,
    y: number,
    scale = 1,
    rotation = 0,
  ): CanvasGroupNode {
    const children = nodes.map((node) => {
      const clone = cloneCanvasNodeForPaste(node);
      clone.x -= bounds.minX;
      clone.y -= bounds.minY;
      return clone;
    });
    return {
      kind: "group",
      id: crypto.randomUUID(),
      name: "facet-cell",
      x,
      y,
      width: Math.max(bounds.width, 1),
      height: Math.max(bounds.height, 1),
      scaleX: scale,
      scaleY: scale,
      rotation,
      children,
    };
  }
  function createCartesianFacetLayouts(nodes: CanvasNode[], bounds: Bounds) {
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    const gap = Math.max(24, Math.min(width, height) * 0.18);
    const copy = (column: number, row: number) =>
      createFacetCopy(nodes, bounds, column * (width + gap), row * (height + gap));
    return [
      { name: "Horizontal", nodes: [copy(0, 0), copy(1, 0), copy(2, 0)] },
      { name: "Vertical", nodes: [copy(0, 0), copy(0, 1), copy(0, 2)] },
      { name: "Two-way", nodes: [copy(0, 0), copy(1, 0), copy(0, 1), copy(1, 1)] },
    ];
  }
  function createPolarFacetLayouts(nodes: CanvasNode[], bounds: Bounds) {
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    const unit = Math.max(width, height);
    const outerRadius = unit * 1.65;
    const center = outerRadius + unit * 0.6;
    const ring = (count: number, radius: number, scale: number, offset = -Math.PI / 2) =>
      Array.from({ length: count }, (_, index) => {
        const angle = offset + index * Math.PI * 2 / count;
        const rotationTowardCenter = angle * 180 / Math.PI + 90;
        return createFacetCopy(
          nodes,
          bounds,
          center + Math.cos(angle) * radius - width * scale / 2,
          center + Math.sin(angle) * radius - height * scale / 2,
          scale,
          rotationTowardCenter,
        );
      });
    return [
      {
        name: "Ring",
        nodes: ring(8, unit * 1.12, 0.52),
      },
      {
        name: "Radial + angular",
        nodes: [
          ...ring(6, unit * 0.82, 0.44),
          ...ring(10, outerRadius, 0.44),
        ],
      },
      {
        name: "Outward rings",
        nodes: [createFacetCopy(nodes, bounds, 0, 0, 0.8)],
        unavailable: true,
      },
    ];
  }
  function createGeneratedCandidate(
    type: CompositionType,
    name: string,
    nodes: CanvasNode[],
    coordinateSystem: CoordinateSystem,
    unavailable = false,
  ): SvgCandidate | null {
    const bounds = getCanvasNodeListBounds(nodes);
    if (!bounds) return null;
    const svgMarkup = createCanvasNodesSvgMarkup(nodes, bounds);
    return {
      id: `composition:${type}:${crypto.randomUUID()}`,
      name,
      chartType: "Composition",
      coordinateSystem,
      src: URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml" })),
      compositionType: type,
      svgMarkup,
      unavailable,
    };
  }
  function createCompositionCandidate(type: CompositionType) {
    if (type === "nested") {
      if (createNestedPie()) setImportNotice("Nested Pie created at the selected Scatterplot point.");
      else setImportNotice("Select a Scatterplot point first.");
      return;
    }
    executeComposition(type);
  }
  function createCanvasNodesFromTemplate(
    sourceId: string,
    name: string,
    template: ParsedSvgTemplate,
    point: Point,
    forceOuterGroup = false,
    coordinateSystem: CoordinateSystem = "CoordinateFree",
    chartType?: string,
    datasetId?: string,
    layerKind?: CanvasNode["layerKind"],
    deckglLayerType?: string,
    mapStyleUrl?: string,
    defaultWidth = 800,
    recordHistory = true,
  ) {
    const initialWidth = Math.max(defaultWidth, 160);
    const scale = initialWidth / template.width;
    const size = { width: initialWidth, height: template.height * scale };
    const canvasBounds = getSelectionScopeBounds();
    const x = clamp(point.x - size.width / 2, canvasBounds.minX, canvasBounds.maxX - size.width);
    const y = clamp(point.y - size.height / 2, canvasBounds.minY, canvasBounds.maxY - size.height);
    const nameCounters = { leaf: 0, group: 0 };
    const styleTokens = chartType && isLineChartType(chartType)
      ? { ...extractChartStyleTokens(template), lineWidth: 2.5 }
      : undefined;
    const initialDeckglConfig = layerKind === "deckgl"
      ? defaultGeographicLayerConfig(deckglLayerType ?? name)
      : undefined;
    const instantiateNode = (node: import("../types").ParsedSvgTemplateNode, parentBounds: import("../types").Bounds | null): CanvasNode => {
      const isRoot = !parentBounds;
      const id = crypto.randomUUID();
      const nodeX = isRoot ? x + (node.bounds.minX - template.minX) * scale : node.bounds.minX - parentBounds!.minX;
      const nodeY = isRoot ? y + (node.bounds.minY - template.minY) * scale : node.bounds.minY - parentBounds!.minY;
      const nodeScaleX = isRoot ? scale : 1;
      const nodeScaleY = isRoot ? scale : 1;
      const coordinateGuide = !isRoot
        ? null
        : coordinateSystem === "Cartesian"
          ? {
            type: "Cartesian" as const,
            origin: {
              x: node.kind === "leaf" ? node.contentMinX : 0,
              y: node.kind === "leaf"
                ? node.contentMinY + node.bounds.height
                : node.bounds.height,
            },
            xDirection: 1 as const,
            yDirection: -1 as const,
          }
          : coordinateSystem === "Polar"
            ? {
              type: "Polar" as const,
              origin: (() => {
                const inferred = estimatePolarOrigin(node);
                return node.kind === "leaf"
                  ? inferred
                  : { x: inferred.x - node.bounds.minX, y: inferred.y - node.bounds.minY };
              })(),
            }
            : null;
      const chartSpec = isRoot && chartType && normalizeChartTemplate(chartType)
        ? (() => {
          const initialSpec = datasetId
            ? createInitialChartSpec(chartType, datasetId)
            : null;
          return initialSpec ? { ...initialSpec, styleTokens } : undefined;
        })()
        : undefined;
      if (node.kind === "leaf") {
        nameCounters.leaf += 1;
        return { kind: "leaf", id, candidateId: sourceId, name: `${name}-${nameCounters.leaf}`, content: scopeSvgContent(node.content, id), viewBox: node.viewBox, width: Math.max(node.bounds.width, 1), height: Math.max(node.bounds.height, 1), x: nodeX, y: nodeY, scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, contentMinX: node.contentMinX, contentMinY: node.contentMinY, coordinateGuide, chartSpec, layerKind, deckglLayerType, mapStyleUrl, deckglConfig: initialDeckglConfig ? { ...initialDeckglConfig } : undefined } satisfies CanvasLeafNode;
      }
      nameCounters.group += 1;
      const groupName = node.name ? `${name}-${node.name}` : `${name}-group-${nameCounters.group}`;
      return { kind: "group", id, name: groupName, x: nodeX, y: nodeY, width: Math.max(node.bounds.width, 1), height: Math.max(node.bounds.height, 1), scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, coordinateGuide, chartSpec, layerKind, deckglLayerType, mapStyleUrl, deckglConfig: initialDeckglConfig ? { ...initialDeckglConfig } : undefined, children: node.children.map((c) => instantiateNode(c, node.bounds)) } satisfies CanvasGroupNode;
    };
    let nextItems = template.nodes.map((n) => instantiateNode(n, null));
    if (forceOuterGroup && (nextItems.length !== 1 || nextItems[0]?.kind !== "group")) {
      const outerBounds = getCanvasNodeListBounds(nextItems);
      if (outerBounds) {
        nextItems = [{
          kind: "group",
          id: crypto.randomUUID(),
          name: `${name}-group`,
          x: outerBounds.minX,
          y: outerBounds.minY,
          width: Math.max(outerBounds.width, 1),
          height: Math.max(outerBounds.height, 1),
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          layerKind,
          deckglLayerType,
          mapStyleUrl,
          deckglConfig: initialDeckglConfig ? { ...initialDeckglConfig } : undefined,
          children: nextItems.map((node) => ({
            ...node,
            x: node.x - outerBounds.minX,
            y: node.y - outerBounds.minY,
          })),
        } satisfies CanvasGroupNode];
      }
    }
    if (recordHistory) pushCanvasHistory();
    replaceSelectionScopeNodes([...getSelectionScopeNodes(), ...nextItems]);
    walkCanvasNodes(nextItems).forEach((node) => {
      node.coordinateSystem = node.coordinateSystem ?? standaloneCoordinateSystem(node);
      renderChartNode(node);
      registerChartRelationship(node, {
        chartType,
        datasetId: node.chartSpec?.datasetId ?? datasetId ?? null,
        sourceTemplateId: sourceId,
      });
    });
    setSelection(nextItems[0] ? [nextItems[0].id] : []);
    const editableNode = nextItems[0];
    axisBindingTarget.value = null;
    setImportNotice(countTemplateNodes(template.nodes) > 1 ? `${name}: imported ${countTemplateNodes(template.nodes)} SVG tree nodes.` : `${name}: imported as a single SVG node.`);
    return nextItems;
  }
  async function createCanvasItem(candidate: SvgCandidate, point: Point, recordHistory = true) {
    loadingDrop.value = true;
    try {
      const template = candidate.svgMarkup
        ? parseSvgTemplate(candidate.svgMarkup)
        : await loadSvgTemplate(candidate.id);
      return createCanvasNodesFromTemplate(
        candidate.id,
        candidate.name,
        template,
        point,
        !!candidate.compositionType,
        candidate.coordinateSystem,
        candidate.renderMode === "static-layer" ? undefined : candidate.chartType,
        activeDataset.value?.id,
        candidate.renderMode === "static-layer" ? "deckgl" : undefined,
        candidate.renderMode === "static-layer" ? candidate.layerType : undefined,
        candidate.renderMode === "static-layer" ? candidate.mapStyleUrl : undefined,
        candidate.defaultWidth,
        recordHistory,
      );
    }
    finally { loadingDrop.value = false; }
  }
  function setDeckglMapStyle(nodeId: string, mapStyleUrl: string) {
    const node = findCanvasNode(nodeId);
    if (node?.layerKind !== "deckgl" || node.mapStyleUrl === mapStyleUrl) return;
    node.mapStyleUrl = mapStyleUrl;
  }
  function setDeckglMapViewState(nodeId: string, mapViewState: GeographicMapViewState) {
    const node = findCanvasNode(nodeId);
    if (node?.layerKind !== "deckgl") return;
    node.mapViewState = { ...mapViewState };
  }
  function setDeckglConfig(nodeId: string, patch: GeographicLayerConfig) {
    const node = findCanvasNode(nodeId);
    if (node?.layerKind !== "deckgl") return;
    const layerType = node.deckglLayerType ?? node.name;
    node.deckglConfig = {
      ...defaultGeographicLayerConfig(layerType),
      ...node.deckglConfig,
      ...patch,
    };
  }
  function setDeckglEncoding(nodeId: string, channel: "color" | "size", field: string) {
    const node = findCanvasNode(nodeId);
    const binding = node?.deckglBinding;
    const dataset = binding ? getDataset(binding.datasetId) : null;
    if (!node || !binding || !dataset) return;
    const column = dataset.columns.find((item) => item.name === field);
    if (field && column?.type !== "quantitative") return;
    node.deckglBinding = {
      ...binding,
      [channel === "color" ? "colorField" : "sizeField"]: field || undefined,
    };
  }
  function selectCanvasNode(nodeId: string) {
    const node = findCanvasNode(nodeId);
    if (!node) return;
    if (!selectedIds.value.includes(nodeId)) setSelection([nodeId]);
    semanticSelection.value = null;
    axisBindingTarget.value = node.layerKind === "deckgl"
      ? { nodeId, channel: "x" }
      : null;
  }
  async function insertCompositionCandidate(candidate: SvgCandidate) {
    if (candidate.unavailable) return;
    const bounds = getSelectionScopeBounds();
    await createCanvasItem(candidate, {
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + bounds.height / 2,
    });
  }
  async function createCanvasNodesFromFile(file: File, point: Point) {
    loadingDrop.value = true;
    try {
      const markup = await file.text();
      const name = file.name.replace(/\.svg$/i, "");
      const matchingCandidate = candidates.find((candidate) => candidate.name === name);
      const coordinateSystem = matchingCandidate?.coordinateSystem ?? "CoordinateFree";
      const t = parseSvgTemplate(markup);
      createCanvasNodesFromTemplate(
        `file:${file.name}:${crypto.randomUUID()}`,
        name,
        t,
        point,
        false,
        coordinateSystem,
        matchingCandidate?.chartType,
        activeDataset.value?.id,
      );
    }
    finally { loadingDrop.value = false; }
  }

  function readImageFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unable to read the image file."));
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read the image file."));
      reader.readAsDataURL(file);
    });
  }

  function readImageDimensions(source: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({
        width: Math.max(image.naturalWidth, 1),
        height: Math.max(image.naturalHeight, 1),
      });
      image.onerror = () => reject(new Error("Unable to decode the image file."));
      image.src = source;
    });
  }

  async function createCanvasNodeFromImageFile(file: File, point: Point) {
    loadingDrop.value = true;
    try {
      const source = await readImageFileAsDataUrl(file);
      const { width, height } = await readImageDimensions(source);
      const canvasBounds = getSelectionScopeBounds();
      const maximumWidth = Math.min(800, canvasBounds.width * 0.72);
      const maximumHeight = Math.min(640, canvasBounds.height * 0.72);
      const scale = Math.min(1, maximumWidth / width, maximumHeight / height);
      const visualWidth = width * scale;
      const visualHeight = height * scale;
      const x = clamp(point.x - visualWidth / 2, canvasBounds.minX, canvasBounds.maxX - visualWidth);
      const y = clamp(point.y - visualHeight / 2, canvasBounds.minY, canvasBounds.maxY - visualHeight);
      const id = crypto.randomUUID();
      const safeSource = source.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      const name = file.name.replace(/\.(?:png|jpe?g|webp|gif|avif)$/i, "") || "Image";
      const node: CanvasLeafNode = {
        kind: "leaf",
        id,
        candidateId: `image:${file.name}:${id}`,
        name,
        content: `<image data-canvas-image="true" href="${safeSource}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        x,
        y,
        scaleX: scale,
        scaleY: scale,
        rotation: 0,
        contentMinX: 0,
        contentMinY: 0,
        coordinateGuide: null,
        coordinateSystem: null,
      };
      pushCanvasHistory();
      replaceSelectionScopeNodes([...getSelectionScopeNodes(), node]);
      setSelection([node.id]);
      axisBindingTarget.value = null;
      nestedBindingTarget.value = null;
      setImportNotice(`${file.name}: image imported.`);
      return node;
    } catch (error) {
      setImportNotice(error instanceof Error ? error.message : "Unable to import the image file.");
      return null;
    } finally {
      loadingDrop.value = false;
    }
  }

  // --- pointer / interaction ---
  function attachPointerListeners() {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp, { once: true });
  }
  function detachPointerListeners() {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
  }
  function startMove(itemIds: string[], event: PointerEvent, transformOnly = false) {
    const transformItemIds = coordinateTransformItemIds(itemIds);
    const transformIdSet = new Set(transformItemIds);
    let addedNestedChild = true;
    while (addedNestedChild) {
      addedNestedChild = false;
      Object.values(chartRelationships.value.nestedRelationships).forEach((relationship) => {
        if (relationship.status !== "active"
          || !transformIdSet.has(relationship.parentChartId)
          || transformIdSet.has(relationship.childChartId)
          || !findCanvasNode(relationship.childChartId)) return;
        transformIdSet.add(relationship.childChartId);
        transformItemIds.push(relationship.childChartId);
        addedNestedChild = true;
      });
    }
    if (transformItemIds.length === 0) return;
    const movedIds = new Set(transformItemIds);
    const nestedRelationshipIds = Array.from(new Set([
      ...itemIds.flatMap((id) => id.startsWith("nested-unit:")
        ? nestedSelectionRelationships(id).map((relationship) => relationship.id)
        : []),
      ...Object.values(chartRelationships.value.nestedRelationships)
        .filter((relationship) => relationship.status === "active"
          && (movedIds.has(relationship.parentChartId) || movedIds.has(relationship.childChartId)))
        .map((relationship) => relationship.id),
    ]));
    const compositionIds = new Set(transformItemIds.flatMap((id) => {
      const composition = getSelectionNode(id)?.compositionSpec;
      return composition && editingCompositionId.value !== composition.id ? [composition.id] : [];
    }));
    const deferred = nestedRelationshipIds.length > 0
      || (transformItemIds.length > 1 && compositionIds.size === 1);
    const snapshots = Object.fromEntries(transformItemIds.map((id) => { const item = getSelectionNode(id); return [id, { x: item?.x ?? 0, y: item?.y ?? 0 }]; }));
    const scopeGroupId = editingGroupPath.value.at(-1);
    interaction.value = {
      type: "move",
      startPoint: toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId),
      itemIds: transformItemIds,
      snapshots,
      scopeGroupId,
      historyCommitted: false,
      transformOnly,
      deferred,
      nestedRelationshipIds,
    };
    attachPointerListeners();
  }

  function commitMoveHistory(mi: MoveInteraction) {
    if (mi.transformOnly || !mi.historyCommitted) return;
    pushMoveHistory(mi);
  }

  function setTransformOnlyMove(interactionState: MoveInteraction, dx: number, dy: number) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    if (!transformOnlyElements) {
      const ids = new Set(interactionState.itemIds);
      const elements = Array.from(canvas.querySelectorAll<SVGGElement>(
        "[data-node-id], [data-coordinate-node-id], [data-canvas-owner-node-id]",
      ));
      transformOnlyElements = elements.filter((element) => {
        const elementNodeId = element.dataset.nodeId
          ?? element.dataset.coordinateNodeId
          ?? element.dataset.canvasOwnerNodeId
          ?? "";
        if (!ids.has(elementNodeId)) return false;
        const parentNode = element.parentElement?.closest<SVGGElement>("[data-node-id]");
        return !parentNode || !ids.has(parentNode.dataset.nodeId ?? "");
      });
      const overlay = canvas.querySelector?.(".selection-overlay") as SVGGElement | null | undefined;
      if (overlay) transformOnlyElements.push(overlay);
    }
    transformOnlyElements.forEach((element) => {
      const baseTransform = element.dataset.transformOnlyBase
        ?? element.getAttribute("transform")
        ?? "";
      element.dataset.transformOnlyBase = baseTransform;
      element.setAttribute("transform", `translate(${dx} ${dy}) ${baseTransform}`);
    });
  }

  function clearTransformOnlyMove() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    Array.from(canvas.querySelectorAll<SVGGElement>("[data-transform-only-base]")).forEach((element) => {
      element.setAttribute("transform", element.dataset.transformOnlyBase ?? "");
      delete element.dataset.transformOnlyBase;
    });
    transformOnlyElements = null;
  }
  function enterCanvasGroup(node: CanvasGroupNode) {
    if (editingGroupPath.value.length > 0 && !getSelectionNode(node.id)) {
      editingGroupPath.value = [];
    }
    const nextPath = getRootNode(node.id)
      ? [node.id]
      : [...editingGroupPath.value, node.id];
    editingGroupPath.value = nextPath;
    editingCompositionId.value = node.compositionSpec?.id ?? null;
    selectedIds.value = [];
    semanticSelection.value = null;
    chartDrilldown.value = null;
    nestedDropPath = [];
    axisBindingTarget.value = null;
    contextMenu.value = null;
    interaction.value = null;
    detachPointerListeners();
  }
  function enterSelection() {
    if (!canEnterSelection.value) return false;
    const semantic = semanticSelection.value;
    if (semantic && chartDrilldown.value?.nodeId === semantic.nodeId) {
      chartDrilldown.value = { nodeId: semantic.nodeId, level: "part" };
      semanticSelection.value = { ...semantic, level: "part" };
      return true;
    }
    const node = selectedNodes.value[0];
    if (selectedNodes.value.length === 1
      && node?.kind === "group"
      && node.children.length > 0
      && !node.renderedContent) {
      enterCanvasGroup(node);
      return true;
    }
    const composition = node?.compositionSpec;
    if (composition && editingCompositionId.value !== composition.id) {
      return beginCompositionEditing(composition);
    }
    if (selectedIds.value.length === 1 && node?.chartSpec && node.renderedContent) {
      chartDrilldown.value = { nodeId: node.id, level: "item" };
      nestedDropPath = [];
      semanticSelection.value = null;
      return true;
    }
    return false;
  }

  function selectedNestedRelationship() {
    const selection = new Set(selectedIds.value);
    const selectedUnitId = [...selection].find((id) => id.startsWith("nested-unit:") && nestedSelectionRelationships(id).length > 0);
    if (selectedUnitId) return nestedSelectionRelationships(selectedUnitId)[0] ?? null;
    return Object.values(chartRelationships.value.nestedRelationships).find((relationship) =>
      relationship.status === "active"
      && (selection.has(relationship.childChartId) || selection.has(relationship.parentChartId)),
    ) ?? null;
  }

  function nestedBatchMetadata(relationship: NestedRelationship) {
    const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
    const frame = parameters.sourceFrame;
    if (
      !parameters.batchId
      || !parameters.sourceChildId
      || !parameters.sourceChildName
      || !frame
      || ![frame.x, frame.y, frame.scaleX, frame.scaleY, frame.rotation].every(Number.isFinite)
    ) return null;
    return {
      batchId: parameters.batchId,
      sourceChildId: parameters.sourceChildId,
      sourceChildName: parameters.sourceChildName,
      sourceFrame: frame,
    };
  }

  function removeNestedComposition(relationship: NestedRelationship) {
    const metadata = nestedBatchMetadata(relationship);
    if (!metadata) return false;
    const batchRelationships = Object.values(chartRelationships.value.nestedRelationships)
      .filter((candidate) => nestedBatchMetadata(candidate)?.batchId === metadata.batchId);
    const source = findCanvasNode(metadata.sourceChildId);
    if (!source || batchRelationships.length === 0) return false;

    pushCanvasHistory();
    const removedCompositionIds = new Set(batchRelationships.map((candidate) => `composition:${candidate.id}`));
    batchRelationships.forEach((candidate) => {
      dispatchRelationship({
        type: "remove-composition",
        compositionId: `composition:${candidate.id}`,
        keepSharedAxes: false,
      });
      dispatchRelationship({ type: "cancel-nested", relationshipId: candidate.id });
    });

    const batchChildIds = new Set(batchRelationships.map((candidate) => candidate.childChartId));
    batchChildIds.forEach((childId) => {
      dispatchRelationship({ type: "unregister-chart", chartId: childId, keepAxes: false });
    });
    walkCanvasNodes().forEach((node) => {
      if (node.compositionSpec && removedCompositionIds.has(node.compositionSpec.id)) {
        node.compositionSpec = null;
      }
    });
    Object.assign(source, metadata.sourceFrame, {
      name: metadata.sourceChildName,
      compositionSpec: null,
    });
    source.coordinateSystem = standaloneCoordinateSystem(source);

    const scopeNodes = getSelectionScopeNodes();
    replaceSelectionScopeNodes([
      ...scopeNodes.filter((node) => !batchChildIds.has(node.id)),
      source,
    ]);
    registerChartRelationship(source, { instanceKind: "canvas" });
    reconcileCoordinateSystems();
    editingCompositionId.value = null;
    selectedIds.value = [source.id];
    axisBindingTarget.value = null;
    semanticSelection.value = null;
    chartDrilldown.value = null;
    nestedDropPath = [];
    contextMenu.value = null;
    setImportNotice(`${metadata.sourceChildName} removed from nested composition.`);
    return true;
  }

  function removeSelectionComposition() {
    if (!canRemoveSelectionComposition.value) return false;
    const nestedRelationship = selectedNestedRelationship();
    if (nestedRelationship && removeNestedComposition(nestedRelationship)) return true;
    const composition = selectedNodes.value[0]?.compositionSpec;
    if (!composition) return false;
    const memberIds = new Set(scopedCompositionMemberIds(selectedNodes.value[0]!));
    const members = getSelectionScopeNodes().filter((node) => memberIds.has(node.id));
    if (members.length < 2) return false;

    pushCanvasHistory();
    dispatchRelationship({
      type: "remove-composition",
      compositionId: composition.id,
      keepSharedAxes: false,
    });
    members.forEach((member) => {
      member.compositionSpec = null;
      member.coordinateSystem = standaloneCoordinateSystem(member);
      renderChartNode(member);
    });
    reconcileCoordinateSystems();
    editingCompositionId.value = null;
    setSelection(members.map((member) => member.id));
    axisBindingTarget.value = null;
    semanticSelection.value = null;
    chartDrilldown.value = null;
    contextMenu.value = null;
    setImportNotice("Composition removed.");
    return true;
  }

  function splitConcatLink(controlId: string) {
    const selected = selectedNodes.value[0];
    const composition = selected?.compositionSpec;
    if (!selected || composition?.type !== "concat" || editingCompositionId.value === composition.id) return false;
    const links = concatLinksFor(composition);
    const linkIndex = links.findIndex((link) => concatLinkId(link) === controlId);
    if (linkIndex < 0) return false;
    const remainingLinks = links.filter((_link, index) => index !== linkIndex);
    const memberIds = composition.members.map((member) => member.nodeId);
    const adjacency = new Map<string, Set<string>>(memberIds.map((id) => [id, new Set()]));
    remainingLinks.forEach((link) => {
      adjacency.get(link.targetNodeId)?.add(link.sourceNodeId);
      adjacency.get(link.sourceNodeId)?.add(link.targetNodeId);
    });
    const components: string[][] = [];
    const visited = new Set<string>();
    memberIds.forEach((id) => {
      if (visited.has(id)) return;
      const component: string[] = [];
      const queue = [id];
      visited.add(id);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        adjacency.get(current)?.forEach((next) => {
          if (visited.has(next)) return;
          visited.add(next);
          queue.push(next);
        });
      }
      components.push(component);
    });
    pushCanvasHistory();
    const oldCoordinateSystem = selected.coordinateSystem;
    const nodesById = new Map(memberIds.flatMap((id) => {
      const node = findCanvasNode(id);
      return node ? [[id, node] as const] : [];
    }));
    components.forEach((component, componentIndex) => {
      const componentNodes = component.flatMap((id) => {
        const node = nodesById.get(id);
        return node ? [node] : [];
      });
      const componentLinks = remainingLinks.filter((link) =>
        component.includes(link.targetNodeId) && component.includes(link.sourceNodeId));
      const nextComposition = componentNodes.length > 1
        ? {
          ...composition,
          id: componentIndex === 0 ? composition.id : `composition:${crypto.randomUUID()}`,
          direction: new Set(componentLinks.map((link) => link.direction)).size === 1
            ? componentLinks[0]?.direction
            : undefined,
          sharedChannels: new Set(componentLinks.map((link) => link.direction)).size === 1
            ? Array.from(new Set(componentLinks.flatMap((link) => link.sharedChannels)))
            : [],
          concatLinks: componentLinks,
          members: componentNodes.map((node) => ({
            nodeId: node.id,
            sourceNodeId: composition.members.find((member) => member.nodeId === node.id)?.sourceNodeId ?? node.id,
            chartType: node.chartSpec?.chartType,
            sharedChannels: new Set(componentLinks.map((link) => link.direction)).size === 1
              ? Array.from(new Set(componentLinks.flatMap((link) => link.sharedChannels)))
              : [],
          })),
        }
        : null;
      const nextSystem = componentNodes.length > 1
        ? oldCoordinateSystem
          ? {
            ...oldCoordinateSystem,
            id: componentIndex === 0 ? oldCoordinateSystem.id : `coordinate:${crypto.randomUUID()}`,
            ownerNodeId: componentNodes.some((node) => node.id === oldCoordinateSystem.ownerNodeId)
              ? oldCoordinateSystem.ownerNodeId
              : componentNodes[0]!.id,
            members: oldCoordinateSystem.members.filter((member) => component.includes(member.nodeId)),
            sharedChannels: nextComposition?.sharedChannels ?? [],
          }
          : {
            id: `coordinate:${crypto.randomUUID()}`,
            type: componentNodes[0]?.coordinateGuide?.type ?? "CoordinateFree",
            ownerNodeId: componentNodes[0]!.id,
            members: componentNodes.map((node) => ({
              nodeId: node.id,
              channels: [...(getChartTemplateContract(node.chartSpec?.chartType ?? "")?.shareableChannels ?? [])],
            })),
            sharedChannels: nextComposition?.sharedChannels ?? [],
          }
        : componentNodes[0] ? standaloneCoordinateSystem(componentNodes[0]) : null;
      componentNodes.forEach((node) => {
        node.compositionSpec = nextComposition;
        node.coordinateSystem = nextSystem;
      });
      if (componentNodes[0]) {
        if (nextComposition) renderSharedCoordinateComposition(componentNodes[0]);
        else renderChartNode(componentNodes[0]);
      }
    });
    reconcileCoordinateSystems();
    setSelection([selected.id]);
    setImportNotice("Concat link split.");
    return true;
  }

  function configureSelectionComposition() {
    if (!canConfigureSelectionComposition.value) return false;
    const node = selectedNodes.value[0];
    const composition = node?.compositionSpec;
    if (node && composition && editingCompositionId.value !== composition.id) {
      if (node.kind === "group" && composition.type === "facet") {
        const chartNode = firstChartNode(node);
        if (!chartNode) return false;
        axisBindingTarget.value = {
          nodeId: chartNode.id,
          channel: chartNode.coordinateGuide?.type === "Polar" ? "angle" : "x",
        };
        return true;
      }
      const memberIds = scopedCompositionMemberIds(node);
      if (memberIds.length > 1 && memberIds.every((id) => selectedIds.value.includes(id))) {
        axisBindingTarget.value = {
          nodeId: node.id,
          channel: node.coordinateGuide?.type === "Polar" ? "angle" : "x",
        };
        return true;
      }
    }
    const nestedRelationship = selectedNestedRelationship();
    if (!nestedRelationship) return false;
    const metadata = nestedBatchMetadata(nestedRelationship);
    const relationships = metadata
      ? Object.values(chartRelationships.value.nestedRelationships).filter((candidate) =>
        candidate.status === "active"
          && nestedBatchMetadata(candidate)?.batchId === metadata.batchId,
      )
      : [nestedRelationship];
    openNestedPositionEditor(relationships.map((relationship) => relationship.id));
    return nestedPositionEditor.value !== null;
  }
  function exitGroupEditing(selectExitedGroup = true) {
    const exitedGroupId = editingGroupPath.value.at(-1);
    if (!exitedGroupId) return false;
    restoreCompositionEditLayout(true);
    editingGroupPath.value = editingGroupPath.value.slice(0, -1);
    editingCompositionId.value = null;
    setSelection(selectExitedGroup ? [exitedGroupId] : []);
    semanticSelection.value = null;
    chartDrilldown.value = null;
    axisBindingTarget.value = null;
    return true;
  }
  function exitSelectionHierarchy(selectParent = true) {
    if (nestedDropPath.length > 0) {
      const exited = nestedDropPath.pop();
      const parent = nestedDropPath.at(-1);
      chartDrilldown.value = parent
        ? { nodeId: parent.nodeId, level: "part" }
        : exited ? { nodeId: exited.nodeId, level: "item" } : null;
      semanticSelection.value = null;
      return true;
    }
    const drilldown = chartDrilldown.value;
    if (drilldown) {
      if (drilldown.level === "part") {
        chartDrilldown.value = { ...drilldown, level: "item" };
        semanticSelection.value = selectParent && semanticSelection.value
          ? { ...semanticSelection.value, level: "item" }
          : null;
      } else {
        chartDrilldown.value = null;
        semanticSelection.value = null;
        if (selectParent) setSelection([drilldown.nodeId]);
      }
      return true;
    }
    if (editingCompositionId.value) {
      const compositionId = editingCompositionId.value;
      const activeGroup = getGroupAtPath();
      if (activeGroup?.compositionSpec?.id === compositionId) {
        return exitGroupEditing(selectParent);
      }
      return finishCompositionEditing(selectParent);
    }
    return exitGroupEditing(selectParent);
  }
  function clearTransientChartSelectionState(node: CanvasNode) {
    clearSelectionTransientState();
    clearSelectionDrilldown(node);
    finishSelectionComposition(node);
    resetSelectionScope(node);
  }
  function clearSelectionTransientState() {
    contextMenu.value = null;
    compositionDragSourceId.value = null;
    activeDropZone.value = null;
  }
  function clearSelectionDrilldown(node: CanvasNode) {
    if (chartDrilldown.value && chartDrilldown.value.nodeId !== node.id) {
      chartDrilldown.value = null;
      nestedDropPath = [];
      semanticSelection.value = null;
    }
  }
  function finishSelectionComposition(node: CanvasNode) {
    if (editingCompositionId.value && node.compositionSpec?.id !== editingCompositionId.value) {
      finishCompositionEditing(false);
    }
  }
  function resetSelectionScope(node: CanvasNode) {
    if (editingGroupPath.value.length > 0 && !getSelectionNode(node.id)) {
      editingGroupPath.value = [];
      selectedIds.value = [];
    }
  }
  function onCanvasNodePointerDown(node: CanvasNode, event: PointerEvent) {
    if (event.button !== 0) return;
    const topLevelNodeId = topLevelSelectionNodeId(node.id);
    if (topLevelNodeId !== node.id) {
      const topLevelNode = findCanvasNode(topLevelNodeId);
      if (topLevelNode) {
        onCanvasNodePointerDown(topLevelNode, event);
        return;
      }
    }
    if (dragTestStage === "transform") {
      event.preventDefault();
      event.stopPropagation();
      startMove([node.id], event, true);
      return;
    }
    if (dragTestStage === "position") {
      event.preventDefault();
      event.stopPropagation();
      startMove([node.id], event);
      return;
    }
    if (dragTestStage === "position-dropzone") {
      event.preventDefault();
      event.stopPropagation();
      startMove([node.id], event);
      compositionDragSourceId.value = node.id;
      return;
    }
    const composition = node.compositionSpec;
    if (composition && editingCompositionId.value !== composition.id) {
      event.preventDefault();
      event.stopPropagation();
      if (composition.type === "concat") {
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          toggleSelection([node.id]);
          return;
        }
        // Keep the clicked chart as the selection unit. `startMove` expands
        // its transform targets to the whole concat graph, so the group still
        // moves together without collapsing drop-zone hit testing.
        startMove([node.id], event);
        setSelection([node.id]);
        semanticSelection.value = null;
        chartDrilldown.value = null;
        axisBindingTarget.value = null;
        contextMenu.value = null;
        compositionDragSourceId.value = node.id;
        activeDropZone.value = null;
        return;
      }
      const memberIds = scopedCompositionMemberIds(node);
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleSelection(memberIds);
        return;
      }
      const alreadySelected = memberIds.length === selectedIds.value.length
        && memberIds.every((id) => selectedIds.value.includes(id));
      const nextSelection = alreadySelected ? selectedIds.value : memberIds;
      startMove(nextSelection, event);
      if (!alreadySelected) selectedIds.value = nextSelection;
      semanticSelection.value = null;
      chartDrilldown.value = null;
      axisBindingTarget.value = null;
      contextMenu.value = null;
      compositionDragSourceId.value = null;
      activeDropZone.value = null;
      return;
    }
    if (selectionTestOnly("cleanup")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "cleanup", () => clearTransientChartSelectionState(node));
      return;
    }
    if (selectionTestOnly("transient")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "transient", clearSelectionTransientState);
      return;
    }
    if (selectionTestOnly("drilldown")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "drilldown", () => clearSelectionDrilldown(node));
      return;
    }
    if (selectionTestOnly("composition-edit")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "composition-edit", () => finishSelectionComposition(node));
      return;
    }
    if (selectionTestOnly("scope")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "scope", () => resetSelectionScope(node));
      return;
    }
    if (selectionTestOnly("normalize")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "normalize", () => normalizeSelection([node.id]));
      return;
    }
    if (selectionTestOnly("move")) {
      event.preventDefault();
      event.stopPropagation();
      measureSelectionStage(node.id, "move", () => startMove([node.id], event));
      return;
    }
    if (selectionTestOnly("relationship")) {
      event.stopPropagation();
      if (node.chartSpec) {
        measureSelectionStage(node.id, "relationship", () =>
          dispatchRelationship({ type: "select-entity", selection: { type: "chart", id: node.id } }));
      }
      return;
    }
    if (selectionTestOnly("selection")) {
      event.stopPropagation();
      measureSelectionStage(node.id, "selection", () => {
        setSelection([node.id]);
        semanticSelection.value = null;
      });
      return;
    }
    if (selectionTestOnly("axis-binding")) {
      event.stopPropagation();
      if (node.chartSpec) {
        measureSelectionStage(node.id, "axis-binding", () => {
          const template = normalizeChartTemplate(node.chartSpec!.chartType);
          setAxisBindingTarget({
            nodeId: node.id,
            channel: template === "pie" || template === "donut" ? "y" : "x",
            clientX: event.clientX,
            clientY: event.clientY,
          });
        });
      }
      return;
    }
    if (selectionTestOnly("composition")) {
      event.stopPropagation();
      if (node.chartSpec) measureSelectionStage(node.id, "composition", () => {
        compositionDragSourceId.value = node.id;
      });
      return;
    }
    measureSelectionStage(node.id, "transient", clearSelectionTransientState);
    measureSelectionStage(node.id, "drilldown", () => clearSelectionDrilldown(node));
    measureSelectionStage(node.id, "composition-edit", () => finishSelectionComposition(node));
    event.stopPropagation();
    measureSelectionStage(node.id, "scope", () => resetSelectionScope(node));
    const targetIds = measureSelectionStage(node.id, "normalize", () => normalizeSelection([node.id]));
    const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
    if (hasModifier) {
      measureSelectionStage(node.id, "selection", () => toggleSelection(targetIds));
      return;
    }
    const nextSelection = selectedIds.value.includes(node.id) ? selectedIds.value : targetIds;
    // Read the pointer origin before selection updates can trigger an SVG layout.
    measureSelectionStage(node.id, "move", () => startMove(nextSelection, event));
    if (node.chartSpec) {
      measureSelectionStage(node.id, "relationship", () =>
        dispatchRelationship({ type: "select-entity", selection: { type: "chart", id: node.id } }));
    }
    measureSelectionStage(node.id, "selection", () => {
      setSelection(nextSelection);
      semanticSelection.value = null;
    });
    if (node.chartSpec) {
      measureSelectionStage(node.id, "axis-binding", () => {
        const template = normalizeChartTemplate(node.chartSpec!.chartType);
        setAxisBindingTarget({
          nodeId: node.id,
          channel: template === "pie" || template === "donut" ? "y" : "x",
          clientX: event.clientX,
          clientY: event.clientY,
        });
      });
    }
    measureSelectionStage(node.id, "composition", () => {
      const draggingNestedUnit = nextSelection.some((id) => nestedSelectionRelationships(id).length > 0);
      const repeatableComposition = node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat"
        ? node.compositionSpec
        : null;
      const draggingWholeComposition = !!repeatableComposition
        && editingCompositionId.value !== repeatableComposition.id
        && repeatableComposition.members.length === nextSelection.length
        && repeatableComposition.members.every((member) => nextSelection.includes(member.nodeId));
      if (!draggingNestedUnit && node.chartSpec && (nextSelection.length === 1 || draggingWholeComposition)) {
        compositionDragSourceId.value = node.id;
      }
    });
  }
  function openContextMenu(event: MouseEvent) {
    if (!canvasRef.value) return;
    const viewport = getCanvasViewport();
    const menuWidth = 196;
    const menuHeight = 404;
    contextMenu.value = {
      x: clamp(event.clientX - viewport.left, 8, viewport.width - menuWidth - 8),
      y: clamp(event.clientY - viewport.top, 8, viewport.height - menuHeight - 8),
      point: toCanvasPoint(event.clientX, event.clientY),
    };
  }
  function onCanvasNodeContextMenu(node: CanvasNode, event: MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    const topLevelNode = findCanvasNode(topLevelSelectionNodeId(node.id)) ?? node;
    if (editingGroupPath.value.length > 0 && !getSelectionNode(node.id)) {
      editingGroupPath.value = [];
      selectedIds.value = [];
    }
    if (!selectedIds.value.includes(topLevelNode.id)) setSelection([topLevelNode.id]);
    openContextMenu(event);
  }
  function onCanvasContextMenu(event: MouseEvent) {
    event.preventDefault();
    const target = event.target;
    if (target instanceof Element && target.closest(".toolbar--floating")) { contextMenu.value = null; return; }
    setSelection([]);
    openContextMenu(event);
  }
  function onCanvasPointerDown(event: PointerEvent) {
    if (event.button === 1) {
      event.preventDefault();
      contextMenu.value = null;
      interaction.value = { type: "pan", startScreenPoint: { x: event.clientX, y: event.clientY }, startPan: { ...viewPan.value } };
      attachPointerListeners();
      return;
    }
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    contextMenu.value = null;
    exitSelectionHierarchy(false);
    interaction.value = { type: "marquee", startPoint: toCanvasPoint(event.clientX, event.clientY), currentPoint: toCanvasPoint(event.clientX, event.clientY) };
    attachPointerListeners();
  }
  function onEditingGroupBackgroundPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    contextMenu.value = null;
    chartDrilldown.value = null;
    semanticSelection.value = null;
    selectedIds.value = [];
    rotationInputVisible.value = false;
    const scopeGroupId = editingGroupPath.value.at(-1);
    const point = toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId);
    interaction.value = { type: "marquee", startPoint: point, currentPoint: point, scopeGroupId };
    attachPointerListeners();
  }
  function onScaleHandlePointerDown(handle: ScaleHandle, event: PointerEvent) {
    if (event.button !== 0 || !selectionBounds.value) return;
    event.stopPropagation();
    const itemIds = coordinateTransformItemIds(selectedIds.value);
    const snapshots = Object.fromEntries(itemIds.map((id) => {
      const item = getSelectionNode(id);
      return [id, {
        x: item?.x ?? 0,
        y: item?.y ?? 0,
        width: item?.width ?? 1,
        height: item?.height ?? 1,
        scaleX: item?.scaleX ?? 1,
        scaleY: item?.scaleY ?? 1,
        coordinateOrigin: item?.coordinateGuide?.origin
          ? { ...item.coordinateGuide.origin }
          : undefined,
        coordinateScales: item?.coordinateGuide?.type === "Cartesian"
          ? {
            x: item.coordinateGuide.xScale,
            y: item.coordinateGuide.yScale,
          }
          : item?.coordinateGuide?.type === "Polar"
            ? {
              radius: item.coordinateGuide.radiusScale,
              ring: item.coordinateGuide.ringScale,
            }
            : undefined,
      }];
    }));
    const scopeGroupId = editingGroupPath.value.at(-1);
    interaction.value = { type: "scale", handle, startPoint: toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId), startBounds: selectionBounds.value, itemIds, snapshots, scopeGroupId, historyCommitted: false };
    attachPointerListeners();
  }
  function onRotateHandlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || !selectionBounds.value || selectedIds.value.length === 0) return;
    event.stopPropagation();
    polarAngleInputVisible.value = false;
    const bounds = selectionBounds.value;
    const center = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
    const scopeGroupId = editingGroupPath.value.at(-1);
    const point = toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId);
    const itemIds = coordinateTransformItemIds(selectedIds.value);
    const snapshots = Object.fromEntries(itemIds.map((id) => {
      const item = getSelectionNode(id);
      return [id, { x: item?.x ?? 0, y: item?.y ?? 0, rotation: item?.rotation ?? 0 }];
    }));
    interaction.value = { type: "rotate", startPoint: point, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x), itemIds, snapshots, scopeGroupId, historyCommitted: false };
    attachPointerListeners();
  }
  function onCoordinateOriginPointerDown(node: CanvasNode, event: PointerEvent) {
    if (event.button !== 0 || node.coordinateGuide?.type !== "Cartesian") return;
    event.preventDefault();
    event.stopPropagation();
    const scopeGroupId = editingGroupPath.value.at(-1);
    const point = toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId);
    interaction.value = {
      type: "coordinate-origin",
      nodeId: node.id,
      startPoint: point,
      startOrigin: { ...node.coordinateGuide.origin },
      scopeGroupId,
      historyCommitted: false,
    };
    attachPointerListeners();
  }
  function onCoordinateAxisScalePointerDown(node: CanvasNode, axis: CoordinateChannel, event: PointerEvent) {
    const guide = node.coordinateGuide;
    if (event.button !== 0 || !guide) return;
    if (guide.type === "Cartesian" && axis !== "x" && axis !== "y") return;
    if (guide.type === "Polar" && axis !== "radius" && axis !== "ring") return;
    if (guide.type === "Polar"
      && (node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
      && editingCompositionId.value !== node.compositionSpec.id
      && !node.compositionSpec.sharedChannels.includes(axis)) return;
    if (guide.type === "Cartesian"
      && node.compositionSpec?.type === "concat"
      && editingCompositionId.value === node.compositionSpec.id
      && node.compositionSpec.sharedChannels.includes(axis)) return;
    polarAngleInputVisible.value = false;
    const scopeGroupId = editingGroupPath.value.at(-1);
    interaction.value = {
      type: "coordinate-axis-scale",
      nodeId: node.id,
      axis,
      startPoint: toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId),
      startScale: guide.type === "Cartesian"
        ? (axis === "x" ? guide.xScale ?? 1 : guide.yScale ?? 1)
        : (axis === "radius" ? guide.radiusScale ?? 1 : guide.ringScale ?? 1),
      scopeGroupId,
      historyCommitted: false,
    };
    attachPointerListeners();
  }
  function onPolarAnglePointerDown(node: CanvasNode, event: PointerEvent) {
    if (event.button !== 0 || node.coordinateGuide?.type !== "Polar") return;
    if ((node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
      && editingCompositionId.value !== node.compositionSpec.id
      && !node.compositionSpec.sharedChannels.includes("angle")) return;
    event.preventDefault();
    event.stopPropagation();
    rotationInputVisible.value = false;
    polarAngleInputVisible.value = false;
    const scopeGroupId = editingGroupPath.value.at(-1);
    const startPoint = toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId);
    const localPoint = toNodeLocalPoint(node, startPoint);
    const radius = Math.hypot(
      localPoint.x - node.coordinateGuide.origin.x,
      localPoint.y - node.coordinateGuide.origin.y,
    );
    const renderedScale = Math.max(
      Math.abs(node.scaleX),
      Math.abs(node.scaleY),
      0.0001,
    ) * Math.max(selectionOverlayZoom.value, 0.0001);
    if (Number.isFinite(radius) && radius > 0) {
      node.coordinateGuide.radius = Math.max(1, radius - 4 / renderedScale);
    }
    interaction.value = {
      type: "polar-angle",
      nodeId: node.id,
      startPoint,
      scopeGroupId,
      historyCommitted: false,
    };
    attachPointerListeners();
  }
  function updateRotateInteraction(currentPoint: Point, ri: RotateInteraction) {
    const angle = Math.atan2(currentPoint.y - ri.center.y, currentPoint.x - ri.center.x) - ri.startAngle;
    const degrees = angle * 180 / Math.PI;
    ri.itemIds.forEach((id) => {
      const item = getSelectionNode(id); const snap = ri.snapshots[id];
      if (!item || !snap) return;
      const dx = snap.x + item.width * item.scaleX / 2 - ri.center.x;
      const dy = snap.y + item.height * item.scaleY / 2 - ri.center.y;
      const radians = angle;
      const rotatedX = ri.center.x + dx * Math.cos(radians) - dy * Math.sin(radians);
      const rotatedY = ri.center.y + dx * Math.sin(radians) + dy * Math.cos(radians);
      item.x = rotatedX - item.width * item.scaleX / 2;
      item.y = rotatedY - item.height * item.scaleY / 2;
      item.rotation = snap.rotation + degrees;
    });
  }
  function setSelectionRotation(value: number) {
    if (!Number.isFinite(value) || selectedIds.value.length === 0) return;
    if (selectedNodes.value.some((node) => !!editingCartesianConcat(node))) return;
    pushCanvasHistory();
    const next = value % 360;
    coordinateTransformItemIds(selectedIds.value).forEach((id) => {
      const item = getSelectionNode(id);
      if (item) item.rotation = next;
    });
    rotationInputVisible.value = true;
  }
  function setPolarAngleSpan(value: number) {
    if (!Number.isFinite(value) || selectedIds.value.length === 0) return;
    const angleSpan = Math.max(1, Math.min(value, 360));
    const node = selectedNodes.value.find((item) => item.coordinateGuide?.type === "Polar");
    if (!node || node.coordinateGuide?.type !== "Polar") return;
    pushCanvasHistory();
    if ((node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
      && editingCompositionId.value !== node.compositionSpec.id) {
      node.compositionSpec.polarAngleSpan = angleSpan;
      const owner = findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? node;
      renderSharedCoordinateComposition(owner);
      polarAngleInputVisible.value = true;
      return;
    }
    const targets = coordinateTargets(node.id, "angle");
    targets.forEach((member) => {
      if (member.coordinateGuide?.type !== "Polar") return;
      member.coordinateGuide.angleSpan = angleSpan;
    });
    renderCoordinateTargets(node, targets);
    polarAngleInputVisible.value = true;
  }
  function updateMoveInteraction(currentPoint: Point, mi: MoveInteraction) {
    const dx = currentPoint.x - mi.startPoint.x;
    const dy = currentPoint.y - mi.startPoint.y;
    mi.itemIds.forEach((id) => {
      const item = getSelectionNode(id);
      const snap = mi.snapshots[id];
      if (!item || !snap) return;
      const editableAxis = concatEditableAxis(item);
      item.x = snap.x + (editableAxis === "y" ? 0 : dx);
      item.y = snap.y + (editableAxis === "x" ? 0 : dy);
    });
  }

  // Coalesce high-frequency pointer events into one reactive update per frame.
  // This keeps Vue from diffing the entire SVG tree for every pointer event.
  function scheduleMoveInteraction(currentPoint: Point, mi: MoveInteraction) {
    pendingMoveUpdate = { point: currentPoint, interaction: mi };
    if (moveUpdateFrame !== null) return;
    moveUpdateFrame = requestAnimationFrame(() => {
      moveUpdateFrame = null;
      const pending = pendingMoveUpdate;
      pendingMoveUpdate = null;
      if (pending && interaction.value === pending.interaction) {
        if (pending.interaction.deferred) {
          setTransformOnlyMove(
            pending.interaction,
            pending.point.x - pending.interaction.startPoint.x,
            pending.point.y - pending.interaction.startPoint.y,
          );
        } else {
          updateMoveInteraction(pending.point, pending.interaction);
        }
      }
    });
  }

  function flushMoveInteraction() {
    if (moveUpdateFrame !== null) {
      cancelAnimationFrame(moveUpdateFrame);
      moveUpdateFrame = null;
    }
    const pending = pendingMoveUpdate;
    pendingMoveUpdate = null;
    if (pending && interaction.value === pending.interaction) {
      if (pending.interaction.deferred) {
        setTransformOnlyMove(
          pending.interaction,
          pending.point.x - pending.interaction.startPoint.x,
          pending.point.y - pending.interaction.startPoint.y,
        );
      } else {
        updateMoveInteraction(pending.point, pending.interaction);
      }
    }
  }
  function updateScaleInteraction(currentPoint: Point, si: ScaleInteraction) {
    const scopeGroup = si.scopeGroupId ? getGroupAtPath() : null;
    const canvasBounds = scopeGroup
      ? { minX: 0, minY: 0, maxX: scopeGroup.width, maxY: scopeGroup.height, width: scopeGroup.width, height: scopeGroup.height }
      : getCanvasBounds();
    const start = si.startBounds;
    const minW = 24, minH = 24;
    const isEast = si.handle === "ne" || si.handle === "se";
    const isSouth = si.handle === "sw" || si.handle === "se";
    const dirX = isEast ? 1 : -1, dirY = isSouth ? 1 : -1;
    const anchor = { x: isEast ? start.minX : start.maxX, y: isSouth ? start.minY : start.maxY };
    const hChange = (dirX * (currentPoint.x - si.startPoint.x)) / start.width;
    const vChange = (dirY * (currentPoint.y - si.startPoint.y)) / start.height;
    const availW = isEast ? canvasBounds.maxX - anchor.x : anchor.x - canvasBounds.minX;
    const availH = isSouth ? canvasBounds.maxY - anchor.y : anchor.y - canvasBounds.minY;
    const minScaleX = Math.max(minW / start.width, 0.01);
    const minScaleY = Math.max(minH / start.height, 0.01);
    const maxScaleX = Math.max(availW / start.width, 0.01);
    const maxScaleY = Math.max(availH / start.height, 0.01);
    const editableAxis = si.itemIds
      .map((id) => concatEditableAxis(getSelectionNode(id)))
      .find((axis): axis is "x" | "y" => !!axis);
    const uniformMinScale = Math.max(minScaleX, minScaleY);
    const uniformMaxScale = Math.min(maxScaleX, maxScaleY);
    const uniformScale = clamp(
      Math.abs(hChange) >= Math.abs(vChange) ? 1 + hChange : 1 + vChange,
      uniformMinScale,
      uniformMaxScale,
    );
    const scaleX = editableAxis === "y"
      ? 1
      : clamp(1 + hChange, Math.min(minScaleX, maxScaleX), maxScaleX);
    const scaleY = editableAxis === "x"
      ? 1
      : clamp(1 + vChange, Math.min(minScaleY, maxScaleY), maxScaleY);
    si.itemIds.forEach((id) => {
      const item = getSelectionNode(id);
      const snap = si.snapshots[id];
      if (!item || !snap) return;
      if (item.chartSpec && item.coordinateGuide) {
        item.x = anchor.x + (snap.x - anchor.x) * scaleX;
        item.y = anchor.y + (snap.y - anchor.y) * scaleY;
        // Deterministic charts derive their marks from width/height. Commit
        // the resize to that geometry instead of stretching the rendered SVG.
        item.width = Math.max(snap.width * Math.abs(snap.scaleX) * scaleX, 1);
        item.height = Math.max(snap.height * Math.abs(snap.scaleY) * scaleY, 1);
        item.scaleX = Math.sign(snap.scaleX) || 1;
        item.scaleY = Math.sign(snap.scaleY) || 1;
        if (item.coordinateGuide && snap.coordinateOrigin) {
          const localMinX = item.kind === "leaf" ? item.contentMinX : 0;
          const localMinY = item.kind === "leaf" ? item.contentMinY : 0;
          item.coordinateGuide.origin = {
            x: localMinX + (snap.coordinateOrigin.x - localMinX)
              * (item.width / Math.max(snap.width * Math.abs(snap.scaleX), 1)),
            y: localMinY + (snap.coordinateOrigin.y - localMinY)
              * (item.height / Math.max(snap.height * Math.abs(snap.scaleY), 1)),
          };
        }
        if (item.coordinateGuide?.type === "Cartesian" && snap.coordinateScales) {
          // Start from the user's existing axis scales. They are corrected
          // after the first render so the dragged axis endpoint lands exactly
          // under the pointer, rather than applying a second frame transform.
          item.coordinateGuide.xScale = snap.coordinateScales.x ?? 1;
          item.coordinateGuide.yScale = snap.coordinateScales.y ?? 1;
        } else if (item.coordinateGuide?.type === "Polar" && snap.coordinateScales) {
          // Polar marks are laid out from the smaller frame dimension, so the
          // renderer already keeps the radial geometry circular. Preserve the
          // explicit radial/ring scale instead of applying a second resize.
          item.coordinateGuide.radiusScale = snap.coordinateScales.radius ?? 1;
          item.coordinateGuide.ringScale = snap.coordinateScales.ring ?? 1;
        }
      } else {
        // Arbitrary SVG content has no axes to compensate a free-form resize.
        // Keep its transform isotropic so circles and uniform strokes remain
        // visually stable.
        item.x = anchor.x + (snap.x - anchor.x) * uniformScale;
        item.y = anchor.y + (snap.y - anchor.y) * uniformScale;
        item.scaleX = Math.max(snap.scaleX * uniformScale, 0.01);
        item.scaleY = Math.max(snap.scaleY * uniformScale, 0.01);
      }
    });
    const chartNodes = si.itemIds
      .map((id) => getSelectionNode(id))
      .filter((item): item is CanvasNode => !!item?.chartSpec && !!item.coordinateGuide);
    const axisScaleUpdates = new Map<string, number>();
    const compositionOwners = new Set<string>();
    chartNodes.forEach((item) => {
      const composition = item.compositionSpec;
      if ((composition?.type === "layer" || composition?.type === "concat")
        && editingCompositionId.value !== composition.id) {
        compositionOwners.add(item.coordinateSystem?.ownerNodeId ?? item.id);
      }
    });
    const calibrationNodes = [
      ...chartNodes.filter((item) => !compositionOwners.has(item.coordinateSystem?.ownerNodeId ?? "")),
      ...Array.from(compositionOwners)
        .map((ownerId) => findCanvasNode(ownerId))
        .filter((item): item is CanvasNode => !!item),
    ].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
    calibrationNodes.forEach((item) => {
      if (compositionOwners.has(item.id)) renderSharedCoordinateComposition(item);
      else if (item.layerSpec) renderSemanticNode(item);
      else renderChartNode(item);
    });
    // Once the new frame has been rendered, solve the axis scale from the
    // actual plot origin/endpoint. This keeps the pointer position and the
    // selected axis endpoint identical even when margins or aspect constraints
    // change the native plot size.
    calibrationNodes.forEach((item) => {
      const guide = item.coordinateGuide;
      const plot = item.chartSpec?.plotArea;
      if (guide?.type !== "Cartesian" || !plot) return;
      const localPointer = {
        x: currentPoint.x - item.x,
        y: currentPoint.y - item.y,
      };
      let changed = false;
      const calibrate = (
        axis: "x" | "y",
        endpointDragged: boolean,
        origin: number,
        endpoint: number,
        target: number,
      ) => {
        if (!endpointDragged) return;
        const currentLength = Math.abs(endpoint - origin);
        const targetLength = Math.abs(target - origin);
        if (currentLength <= 0.0001 || !Number.isFinite(targetLength)) return;
        const factor = targetLength / currentLength;
        if (axis === "x") guide.xScale = Math.max(0.001, (guide.xScale ?? 1) * factor);
        else guide.yScale = Math.max(0.001, (guide.yScale ?? 1) * factor);
        changed = true;
      };
      const xOrigin = guide.xDirection === 1 ? plot.x : plot.x + plot.width;
      const xEndpoint = guide.xDirection === 1 ? plot.x + plot.width : plot.x;
      const yOrigin = guide.yDirection === -1 ? plot.y + plot.height : plot.y;
      const yEndpoint = guide.yDirection === -1 ? plot.y : plot.y + plot.height;
      calibrate("x", isEast === (guide.xDirection === 1), xOrigin, xEndpoint, localPointer.x);
      calibrate("y", isSouth === (guide.yDirection === 1), yOrigin, yEndpoint, localPointer.y);
      if (!changed) return;
      if (compositionOwners.has(item.id)) renderSharedCoordinateComposition(item);
      else if (item.layerSpec) renderSemanticNode(item);
      else renderChartNode(item);
    });
    chartNodes.forEach((item) => {
      const guide = item.coordinateGuide;
      if (!guide) return;
      const scales = guide.type === "Cartesian"
        ? [["x" as const, guide.xScale ?? 1], ["y" as const, guide.yScale ?? 1]]
        : [["radius" as const, guide.radiusScale ?? 1], ["ring" as const, guide.ringScale ?? 1]];
      scales.forEach(([channel, scale]) => {
        const binding = bindingForChartChannel(item.id, channel);
        // A shared axis has one canonical scale. Keep the first selected
        // member's value instead of letting a later member overwrite it;
        // prefer the coordinate-system owner when it is part of the resize.
        if (!binding) return;
        const isOwner = item.coordinateSystem?.ownerNodeId === item.id;
        if (isOwner || !axisScaleUpdates.has(binding.axisId)) axisScaleUpdates.set(binding.axisId, scale);
      });
    });
    axisScaleUpdates.forEach((scale, axisId) => {
      dispatchRelationship({ type: "update-axis", axisId, changes: { config: { scale } } });
    });
  }
  function updateCoordinateOriginInteraction(currentPoint: Point, ci: CoordinateOriginInteraction) {
    const node = findCanvasNode(ci.nodeId);
    if (!node || node.coordinateGuide?.type !== "Cartesian") return;
    const localPoint = toNodeLocalPoint(node, currentPoint);
    const minX = node.kind === "leaf" ? node.contentMinX : 0;
    const minY = node.kind === "leaf" ? node.contentMinY : 0;
    const origin = {
      x: clamp(localPoint.x, minX, minX + node.width),
      y: clamp(localPoint.y, minY, minY + node.height),
    };
    const xTargets = coordinateTargets(node.id, "x");
    const yTargets = coordinateTargets(node.id, "y");
    const targets = new Map<string, CanvasNode>([
      ...xTargets.map((member) => [member.id, member] as const),
      ...yTargets.map((member) => [member.id, member] as const),
    ]);
    const xTargetIds = new Set(xTargets.map((member) => member.id));
    const yTargetIds = new Set(yTargets.map((member) => member.id));
    const axisUpdates = new Map<string, Point>();
    const updateAxes = (channel: "x" | "y", value: number) => {
      const componentTargets = channel === "x" ? xTargets : yTargets;
      componentTargets.forEach((member) => {
        const binding = bindingForChartChannel(member.id, channel);
        const axis = binding ? chartRelationships.value.axes[binding.axisId] : null;
        if (!axis) return;
        const nextOrigin = { ...axis.config.origin, [channel]: value } as Point;
        axisUpdates.set(axis.id, nextOrigin);
      });
    };
    updateAxes("x", origin.x);
    updateAxes("y", origin.y);
    axisUpdates.forEach((nextOrigin, axisId) => {
      dispatchRelationship({ type: "update-axis", axisId, changes: { config: { origin: nextOrigin } } });
    });
    targets.forEach((member) => {
      if (member.coordinateGuide?.type !== "Cartesian") return;
      const nextOrigin = { ...member.coordinateGuide.origin };
      if (xTargetIds.has(member.id)) nextOrigin.x = origin.x;
      if (yTargetIds.has(member.id)) nextOrigin.y = origin.y;
      member.coordinateGuide.origin = nextOrigin;
    });
    renderCoordinateTargets(node, Array.from(targets.values()));
  }
  function updateCoordinateAxisScaleInteraction(currentPoint: Point, ci: CoordinateAxisScaleInteraction) {
    const node = findCanvasNode(ci.nodeId);
    const guide = node?.coordinateGuide;
    if (!node || !guide) return;
    const localStart = toNodeLocalPoint(node, ci.startPoint);
    const localCurrent = toNodeLocalPoint(node, currentPoint);
    const horizontal = ci.axis === "x"
      || ci.axis === "ring"
      || (guide.type === "Polar" && ci.axis === "radius");
    const span = horizontal ? Math.max(node.width, 1) : Math.max(node.height, 1);
    const direction = guide.type === "Cartesian"
      ? (ci.axis === "x" ? guide.xDirection : guide.yDirection)
      : 1;
    const delta = horizontal
      ? (localCurrent.x - localStart.x) * direction
      : (localCurrent.y - localStart.y) * direction;
    const nextScale = clamp(ci.startScale + delta / span, Math.max(1 / span, 0.001), 1.5);
    const targets = coordinateTargets(node.id, ci.axis);
    const axisIds = new Set<string>();
    targets.forEach((member) => {
      const binding = bindingForChartChannel(member.id, ci.axis);
      if (binding) axisIds.add(binding.axisId);
    });
    if (!node.compositionSpec || editingCompositionId.value !== node.compositionSpec.id) {
      axisIds.forEach((axisId) => {
        dispatchRelationship({
          type: "update-axis",
          axisId,
          changes: { config: { scale: nextScale } },
        });
      });
    }
    targets.forEach((member) => {
      const memberGuide = member.coordinateGuide;
      if (!memberGuide) return;
      if (memberGuide.type === "Cartesian" && ci.axis === "x") memberGuide.xScale = nextScale;
      else if (memberGuide.type === "Cartesian" && ci.axis === "y") memberGuide.yScale = nextScale;
      else if (memberGuide.type === "Polar" && ci.axis === "radius") memberGuide.radiusScale = nextScale;
      else if (memberGuide.type === "Polar" && ci.axis === "ring") memberGuide.ringScale = nextScale;
    });
    if ((node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
      && editingCompositionId.value !== node.compositionSpec.id) {
      const owner = findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? node;
      renderSharedCoordinateComposition(owner);
    } else {
      renderCoordinateTargets(node, targets);
    }
  }
  function updatePolarAngleInteraction(currentPoint: Point, pi: PolarAngleInteraction) {
    const node = findCanvasNode(pi.nodeId);
    const guide = node?.coordinateGuide;
    if (!node || guide?.type !== "Polar") return;
    const localPoint = toNodeLocalPoint(node, currentPoint);
    const angleSpan = polarAngleSpanFromPoint(guide.origin, localPoint);
    if ((node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat")
      && editingCompositionId.value !== node.compositionSpec.id) {
      node.compositionSpec.polarAngleSpan = angleSpan;
      const owner = findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? node;
      renderSharedCoordinateComposition(owner);
      return;
    }
    const targets = coordinateTargets(node.id, "angle");
    targets.forEach((member) => {
      if (member.coordinateGuide?.type !== "Polar") return;
      member.coordinateGuide.angleSpan = angleSpan;
    });
    renderCoordinateTargets(node, targets);
  }
  function finalizeMarqueeSelection(mi: MarqueeInteraction) {
    const bounds = normalizeBounds(mi.startPoint, mi.currentPoint);
    if (bounds.width < 3 && bounds.height < 3) { setSelection([]); return; }
    const hitIds = getSelectionScopeNodes().filter((item) => {
      const b = collectNodeSelectionBounds(item);
      return b.minX >= bounds.minX && b.maxX <= bounds.maxX && b.minY >= bounds.minY && b.maxY <= bounds.maxY;
    }).map((item) => item.id);
    setSelection(hitIds);
  }
  function onWindowPointerUp(event: PointerEvent) {
    const ai = interaction.value;
    const nestedLayoutIds = ai && ai.type !== "move" && "itemIds" in ai
      ? Object.values(chartRelationships.value.nestedRelationships)
        .filter((relationship) => ai.itemIds.includes(relationship.parentChartId)
          || ai.itemIds.includes(relationship.childChartId))
        .map((relationship) => relationship.id)
      : [];
    if (ai?.type === "move") {
      if (ai.historyCommitted) {
        if (ai.deferred) {
          if (moveUpdateFrame !== null) {
            cancelAnimationFrame(moveUpdateFrame);
            moveUpdateFrame = null;
          }
          pendingMoveUpdate = null;
          const finalPoint = ai.scopeGroupId
            ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
            : toCanvasPoint(event.clientX, event.clientY);
          updateMoveInteraction(finalPoint, ai);
          pushMoveHistory(ai);
          // The model now owns the final position. Restore the temporary DOM
          // transform so it cannot become the base for the next drag.
          clearTransformOnlyMove();
        } else {
          flushMoveInteraction();
          commitMoveHistory(ai);
          if (ai.transformOnly) clearTransformOnlyMove();
        }
      } else {
        pendingMoveUpdate = null;
        if (moveUpdateFrame !== null) {
          cancelAnimationFrame(moveUpdateFrame);
          moveUpdateFrame = null;
        }
        if (ai.transformOnly) clearTransformOnlyMove();
      }
    }
    if (ai?.type === "marquee") finalizeMarqueeSelection(ai);
    if (ai?.type === "rotate") rotationInputVisible.value = true;
    if (ai?.type === "polar-angle") polarAngleInputVisible.value = true;
    if (dragTestStage === null || dragTestStage === "full") {
      if (ai?.type === "move" && ai.historyCommitted && compositionDragSourceId.value) {
        flushCompositionDropZone();
        if (activeDropZone.value) {
          commitCompositionDrop(activeDropZone.value, compositionDragSourceId.value);
        }
      }
    }
    interaction.value = null;
    if (nestedLayoutIds.length > 0) scheduleNestedChildLayout(nestedLayoutIds);
    compositionDragSourceId.value = null;
    pendingDropZoneUpdate = null;
    if (dropZoneUpdateFrame !== null) {
      cancelAnimationFrame(dropZoneUpdateFrame);
      dropZoneUpdateFrame = null;
    }
    clearNestedEnterHover();
    activeDropZone.value = null;
    detachPointerListeners();
  }
  function onWindowPointerMove(event: PointerEvent) {
    const ai = interaction.value;
    if (!ai) return;
    if (ai.type === "pan") {
      viewPan.value = { x: (ai as PanInteraction).startPan.x + (event.clientX - (ai as PanInteraction).startScreenPoint.x), y: (ai as PanInteraction).startPan.y + (event.clientY - (ai as PanInteraction).startScreenPoint.y) };
      return;
    }
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (ai.type === "marquee") {
      ai.currentPoint = ai.scopeGroupId
        ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
        : point;
      return;
    }
    if (ai.type === "move") {
      const movePoint = ai.scopeGroupId
        ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
        : point;
      if (ai.transformOnly) {
        setTransformOnlyMove(ai, movePoint.x - ai.startPoint.x, movePoint.y - ai.startPoint.y);
        return;
      }
      if (!ai.historyCommitted) {
        const dragThreshold = 2 / Math.max(viewZoom.value, 0.01);
        if (Math.abs(movePoint.x - ai.startPoint.x) <= dragThreshold
          && Math.abs(movePoint.y - ai.startPoint.y) <= dragThreshold) return;
        ai.historyCommitted = true;
      }
      scheduleMoveInteraction(movePoint, ai);
      if (dragTestStage === "position") return;
      if (compositionDragSourceId.value) {
        scheduleCompositionDropZone(movePoint, compositionDragSourceId.value);
      } else {
        activeDropZone.value = null;
      }
      const dropZone = activeDropZone.value;
      const enteringComposition = !!dropZone?.enterCompositionId;
      const enteringNested = dropZone?.type === "nested" && dropZone.nestedAction === "enter";
      if (dropZone && (enteringComposition || enteringNested)) {
        const key = enteringComposition
          ? `composition:${dropZone.enterCompositionId}`
          : `${dropZone.targetNodeId}:${dropZone.targetElementId ?? "item"}`;
        if (nestedEnterHover?.key !== key) {
          clearNestedEnterHover();
          const sourceNodeId = compositionDragSourceId.value;
          if (sourceNodeId) {
            const timeoutId = window.setTimeout(() => {
              const currentZone = activeDropZone.value;
              const currentKey = currentZone?.enterCompositionId
                ? `composition:${currentZone.enterCompositionId}`
                : currentZone?.type === "nested" && currentZone.nestedAction === "enter"
                  ? `${currentZone.targetNodeId}:${currentZone.targetElementId ?? "item"}`
                  : null;
              if (interaction.value?.type === "move"
                && compositionDragSourceId.value === sourceNodeId
                && currentKey === key
                && currentZone) {
                if (currentZone.enterCompositionId) enterCompositionDropLevel(currentZone);
                else enterNestedDropLevel(currentZone);
                activeDropZone.value = compositionDropZoneAtPoint(movePoint, sourceNodeId);
              }
              nestedEnterHover = null;
            }, 450);
            nestedEnterHover = { key, timeoutId };
          }
        }
      } else {
        clearNestedEnterHover();
      }
      return;
    }
    if (ai.type === "rotate") {
      const rotatePoint = ai.scopeGroupId
        ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
        : point;
      if (!ai.historyCommitted && Math.hypot(rotatePoint.x - ai.startPoint.x, rotatePoint.y - ai.startPoint.y) > 0.1) { pushCanvasHistory(); ai.historyCommitted = true; }
      updateRotateInteraction(rotatePoint, ai);
      return;
    }
    if (ai.type === "coordinate-origin") {
      const coordinatePoint = ai.scopeGroupId
        ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
        : point;
      if (!ai.historyCommitted && Math.hypot(coordinatePoint.x - ai.startPoint.x, coordinatePoint.y - ai.startPoint.y) > 0.1) {
        pushCanvasHistory();
        ai.historyCommitted = true;
      }
      updateCoordinateOriginInteraction(coordinatePoint, ai);
      return;
    }
    if (ai.type === "coordinate-axis-scale") {
      const coordinatePoint = ai.scopeGroupId
        ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
        : point;
      if (!ai.historyCommitted && Math.hypot(coordinatePoint.x - ai.startPoint.x, coordinatePoint.y - ai.startPoint.y) > 0.1) {
        pushCanvasHistory();
        ai.historyCommitted = true;
      }
      updateCoordinateAxisScaleInteraction(coordinatePoint, ai);
      return;
    }
    if (ai.type === "polar-angle") {
      const coordinatePoint = ai.scopeGroupId
        ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
        : point;
      if (!ai.historyCommitted && Math.hypot(coordinatePoint.x - ai.startPoint.x, coordinatePoint.y - ai.startPoint.y) > 0.1) {
        pushCanvasHistory();
        ai.historyCommitted = true;
      }
      updatePolarAngleInteraction(coordinatePoint, ai);
      return;
    }
    const scalePoint = ai.scopeGroupId
      ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
      : point;
    if (!ai.historyCommitted && (Math.abs(scalePoint.x - ai.startPoint.x) > 0.1 || Math.abs(scalePoint.y - ai.startPoint.y) > 0.1)) { pushCanvasHistory(); ai.historyCommitted = true; }
    updateScaleInteraction(scalePoint, ai);
  }

  // --- wheel / zoom ---
  function onCanvasWheel(event: WheelEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest(".toolbar--floating")) return;
    if (!canvasRef.value) return;
    const viewport = getCanvasViewport();
    event.preventDefault();
    const screenX = event.clientX - viewport.left;
    const screenY = event.clientY - viewport.top;
    const nextZoom = clamp(viewZoom.value * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === viewZoom.value) return;
    const modelX = (screenX - viewPan.value.x) / viewZoom.value;
    const modelY = (screenY - viewPan.value.y) / viewZoom.value;
    viewPan.value = { x: screenX - modelX * nextZoom, y: screenY - modelY * nextZoom };
    viewZoom.value = nextZoom;
  }
  function resetCanvasZoom() { viewZoom.value = 1; viewPan.value = { x: 0, y: 0 }; }

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
  function scheduleNestedChildLayout(relationshipIds?: Iterable<string>) {
    const relationships = chartRelationships.value.nestedRelationships;
    if (Object.keys(relationships).length === 0) return;
    if (relationshipIds) {
      if (pendingNestedLayoutIds) {
        for (const relationshipId of relationshipIds) {
          if (relationships[relationshipId]) pendingNestedLayoutIds.add(relationshipId);
        }
      }
      if (pendingNestedLayoutIds?.size === 0) return;
    } else {
      pendingNestedLayoutIds = null;
    }
    if (nestedLayoutScheduled) return;
    nestedLayoutScheduled = true;
    void nextTick(() => {
      nestedLayoutScheduled = false;
      const scheduledRelationshipIds = pendingNestedLayoutIds;
      pendingNestedLayoutIds = new Set();
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
        const scopeGroupId = parentGroupIds.get(child.id) ?? null;
        const boundsCacheKey = `${relationship.parentChartId}:${relationship.parentDataKey ?? "*"}:${scopeGroupId ?? ""}`;
        let bounds = targetBoundsCache.get(boundsCacheKey);
        if (bounds === undefined) {
          bounds = semanticSelectionBounds(targetMarks, scopeGroupId);
          targetBoundsCache.set(boundsCacheKey, bounds);
        }
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const next = resolveNestedRelationship(relationship.id, {
          x: bounds.minX,
          y: bounds.minY,
          width: bounds.width,
          height: bounds.height,
          scaleX: 1,
          scaleY: 1,
          rotation: parent.rotation,
        }, {
          x: child.x,
          y: child.y,
          width: child.width,
          height: child.height,
          scaleX: 1,
          scaleY: 1,
          rotation: child.rotation,
        });
        if (
          Math.abs(child.x - next.x) < 0.01
          && Math.abs(child.y - next.y) < 0.01
          && Math.abs(child.scaleX - next.scaleX) < 0.0001
          && Math.abs(child.scaleY - next.scaleY) < 0.0001
          && Math.abs(child.rotation - next.rotation) < 0.01
        ) return;
        Object.assign(child, next);
      });
    });
  }
  onBeforeUnmount(() => {
    detachPointerListeners();
    compositionFrameAnimations.forEach((animation) => animation.cancel());
    compositionFrameAnimations.clear();
    if (moveUpdateFrame !== null) cancelAnimationFrame(moveUpdateFrame);
    if (dropZoneUpdateFrame !== null) cancelAnimationFrame(dropZoneUpdateFrame);
    pendingMoveUpdate = null;
    pendingDropZoneUpdate = null;
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("click", closeContextMenu);
    if (importNoticeTimer !== null) window.clearTimeout(importNoticeTimer);
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
    setCoordinateGuideAppearance,
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
