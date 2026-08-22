import {
  ref,
  computed,
  watch,
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
  NestedRelationship,
  NestedRenderPlacement,
  RelativeNestedParameters,
  DataColumnType,
  MarkGroupSharedConfig,
  Dataset,
  ChartScaleSpec,
  DimensionRecommendation,
} from "../types";
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
  computeSelectionBounds,
  createCanvasNodesSvgMarkup,
  cloneChartSpec,
  getNodeSelectionBounds,
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
  getEncodingChannelConfigsForSpec,
  resolvedEncodingField,
  resolvedSeriesField,
  resolveChartEncodingIssues,
} from "../utils/encodingConfig";
import { resolveSemanticMarkMatch } from "../utils/chartSelection";
import {
  inferColumnIntents,
  type InputColumnIntentAnalysis,
} from "../utils/dimensionInference";

const historyLimit = 50;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

const matrixThumbnailColumns = 6;
const matrixThumbnailRows = 4;
const matrixThumbnailPalette = ["#eff6ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];
const matrixThumbnailCells = Array.from(
  { length: matrixThumbnailColumns * matrixThumbnailRows },
  (_, index) => {
    const column = index % matrixThumbnailColumns;
    const row = Math.floor(index / matrixThumbnailColumns);
    const colorIndex = (column * 2 + row * 3) % matrixThumbnailPalette.length;
    const fill = matrixThumbnailPalette[colorIndex] ?? "#eff6ff";
    return `<rect x="${column * 42}" y="${row * 32}" width="42" height="32" fill="${fill}"/>`;
  },
).join("");
const matrixThumbnailSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(34 26)" stroke="#fff" stroke-width="2">${matrixThumbnailCells}</g></svg>`;

const implementedTemplateSvgs = {
  LineGraph: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 180"><g stroke="#94a3b8" stroke-width="1" stroke-dasharray="2 4" opacity=".28"><line x1="28" y1="42" x2="352" y2="42"/><line x1="28" y1="86" x2="352" y2="86"/><line x1="28" y1="130" x2="352" y2="130"/></g><g fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M30 118L80 97L130 107L182 62L234 77L284 36L350 52" stroke="#2563eb"/><path d="M30 137L80 122L130 83L182 99L234 52L284 68L350 80" stroke="#e11d48"/><path d="M30 101L80 112L130 72L182 83L234 37L284 49L350 35" stroke="#059669"/></g></svg>`,
  Scatterplot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g fill="#2563eb" fill-opacity=".86" stroke="#fff" stroke-width="2"><circle cx="68" cy="121" r="7"/><circle cx="92" cy="98" r="6"/><circle cx="126" cy="112" r="8"/><circle cx="152" cy="76" r="7"/><circle cx="185" cy="91" r="6"/><circle cx="214" cy="54" r="8"/><circle cx="247" cy="68" r="7"/><circle cx="278" cy="37" r="6"/></g></svg>`,
  PieChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(160 90)"><path d="M0 0V-70A70 70 0 0 1 66.6 21.6Z" fill="#2563eb"/><path d="M0 0L66.6 21.6A70 70 0 0 1 -21.6 66.6Z" fill="#059669"/><path d="M0 0L-21.6 66.6A70 70 0 0 1 -56.6 -41.1Z" fill="#d97706"/><path d="M0 0L-56.6 -41.1A70 70 0 0 1 0 -70Z" fill="#dc2626"/></g></svg>`,
  DonutChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(160 90) rotate(-90)"><circle r="56" fill="none" stroke="#e2e8f0" stroke-width="28"/><circle r="56" fill="none" stroke="#2563eb" stroke-width="28" stroke-dasharray="132 352"/><circle r="56" fill="none" stroke="#059669" stroke-width="28" stroke-dasharray="91 352" stroke-dashoffset="-132"/><circle r="56" fill="none" stroke="#d97706" stroke-width="28" stroke-dasharray="76 352" stroke-dashoffset="-223"/><circle r="56" fill="none" stroke="#dc2626" stroke-width="28" stroke-dasharray="53 352" stroke-dashoffset="-299"/></g></svg>`,
  MatrixDiagram: matrixThumbnailSvg,
  SingleBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g fill="#2563eb"><rect x="42" y="92" width="36" height="58"/><rect x="96" y="56" width="36" height="94"/><rect x="150" y="76" width="36" height="74"/><rect x="204" y="32" width="36" height="118"/><rect x="258" y="67" width="36" height="83"/></g></svg>`,
  GroupedBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g><g fill="#2563eb"><rect x="34" y="78" width="17" height="72"/><rect x="98" y="48" width="17" height="102"/><rect x="162" y="64" width="17" height="86"/><rect x="226" y="35" width="17" height="115"/></g><g fill="#059669"><rect x="53" y="102" width="17" height="48"/><rect x="117" y="76" width="17" height="74"/><rect x="181" y="91" width="17" height="59"/><rect x="245" y="60" width="17" height="90"/></g></g></svg>`,
  StackedBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g><g fill="#2563eb"><rect x="42" y="102" width="38" height="48"/><rect x="106" y="84" width="38" height="66"/><rect x="170" y="93" width="38" height="57"/><rect x="234" y="70" width="38" height="80"/></g><g fill="#059669"><rect x="42" y="73" width="38" height="29"/><rect x="106" y="48" width="38" height="36"/><rect x="170" y="61" width="38" height="32"/><rect x="234" y="29" width="38" height="41"/></g></g></svg>`,
  DivergentBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><line x1="24" y1="90" x2="300" y2="90" stroke="#94a3b8"/><g fill="#2563eb"><rect x="40" y="46" width="32" height="44"/><rect x="104" y="90" width="32" height="35"/><rect x="168" y="29" width="32" height="61"/><rect x="232" y="90" width="32" height="52"/></g></svg>`,
  DivergentStackedBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><line x1="24" y1="90" x2="300" y2="90" stroke="#94a3b8"/><g><g fill="#2563eb"><rect x="40" y="54" width="32" height="36"/><rect x="104" y="90" width="32" height="29"/><rect x="168" y="39" width="32" height="51"/><rect x="232" y="90" width="32" height="38"/></g><g fill="#059669"><rect x="40" y="35" width="32" height="19"/><rect x="104" y="119" width="32" height="21"/><rect x="168" y="24" width="32" height="15"/><rect x="232" y="128" width="32" height="18"/></g></g></svg>`,
} as const;

const implementedTemplateDefinitions: SvgCandidate[] = ([
  { id: "builtin-template:line", name: "Single Line", chartType: "LineGraph", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.LineGraph, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.LineGraph)}` },
  { id: "builtin-template:multi-line", name: "Multi-Line Chart", chartType: "MultiLineChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.LineGraph, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.LineGraph)}` },
  { id: "builtin-template:scatter", name: "Scatterplot", chartType: "Scatterplot", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.Scatterplot, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.Scatterplot)}` },
  { id: "builtin-template:pie", name: "Pie Chart", chartType: "PieChart", coordinateSystem: "Polar", svgMarkup: implementedTemplateSvgs.PieChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.PieChart)}` },
  { id: "builtin-template:donut", name: "Donut", chartType: "DonutChart", coordinateSystem: "Polar", svgMarkup: implementedTemplateSvgs.DonutChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.DonutChart)}` },
  { id: "builtin-template:matrix", name: "Matrix", chartType: "MatrixDiagram", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.MatrixDiagram, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.MatrixDiagram)}` },
  { id: "builtin-template:single-bar", name: "Single Bar", chartType: "SingleBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.SingleBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.SingleBarChart)}` },
  { id: "builtin-template:grouped-bar", name: "Grouped Bar", chartType: "GroupedBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.GroupedBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.GroupedBarChart)}` },
  { id: "builtin-template:stacked-bar", name: "Stacked Bar", chartType: "StackedBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.StackedBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.StackedBarChart)}` },
  { id: "builtin-template:divergent-bar", name: "Divergent Bar", chartType: "DivergentBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.DivergentBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.DivergentBarChart)}` },
  { id: "builtin-template:divergent-stacked-bar", name: "Divergent Stacked Bar", chartType: "DivergentStackedBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.DivergentStackedBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.DivergentStackedBarChart)}` },
  ...advancedTemplateDefinitions,
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
  const { datasets, activeDataset, getDataset } = useDatasetStore();
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
  const undoStack = ref<CanvasHistorySnapshot[]>([]);
  const redoStack = ref<CanvasHistorySnapshot[]>([]);
  const clipboardNodes = ref<CanvasNode[]>([]);
  const interaction = ref<Interaction | null>(null);
  const contextMenu = ref<ContextMenuState | null>(null);
  const draggedCandidateId = ref<string | null>(null);
  const activeDropZone = ref<ChartDropZone | null>(null);
  const compositionDragSourceId = ref<string | null>(null);
  let nestedEnterHover: { key: string; startedAt: number } | null = null;
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
  const semanticSelection = ref<SemanticSelection | null>(null);
  const activeNestedRelationshipId = ref<string | null>(null);
  let restoredCanvas = false;
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
    const channels: CoordinateChannel[] = getChartTemplateContract(chartType)?.shareableChannels
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
        instanceKind: metadata?.instanceKind ?? chartRelationships.value.charts[node.id]?.instanceKind ?? "canvas",
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
    return {
      id: sharedAxisIds.length > 0
        ? `coordinate:${sharedAxisIds.slice().sort().join("|")}`
        : `coordinate:${nodeId}`,
      type: axisEntries[0]!.axis.coordinateType,
      ownerNodeId,
      members: Array.from(memberChannels, ([memberNodeId, channels]) => ({ nodeId: memberNodeId, channels })),
      sharedChannels: Array.from(new Set(sharedChannels)),
    };
  }

  function projectRelationshipStateToCanvas() {
    Object.values(chartRelationships.value.charts).forEach((chart) => {
      if (!chart.nodeId) return;
      const node = findCanvasNode(chart.nodeId);
      if (!node) return;
      const axisEntries = axesForChart(chart.id);
      if (node.coordinateGuide?.type === "Cartesian") {
        const xAxis = axisEntries.find(({ binding }) => binding.channel === "x")?.axis;
        const yAxis = axisEntries.find(({ binding }) => binding.channel === "y")?.axis;
        const origin = { ...node.coordinateGuide.origin };
        if (xAxis) {
          origin.x = xAxis.config.origin.x;
          node.coordinateGuide.xDirection = xAxis.config.direction;
          node.coordinateGuide.xScale = xAxis.config.scale;
        }
        if (yAxis) {
          origin.y = yAxis.config.origin.y;
          node.coordinateGuide.yDirection = yAxis.config.direction;
          node.coordinateGuide.yScale = yAxis.config.scale;
        }
        node.coordinateGuide.origin = origin;
      } else if (node.coordinateGuide?.type === "Polar") {
        const radiusAxis = axisEntries.find(({ binding }) => binding.channel === "radius")?.axis;
        const ringAxis = axisEntries.find(({ binding }) => binding.channel === "ring")?.axis;
        const angleAxis = axisEntries.find(({ binding }) => binding.channel === "angle")?.axis;
        const originAxis = radiusAxis ?? ringAxis ?? angleAxis;
        if (originAxis) node.coordinateGuide.origin = { ...originAxis.config.origin };
        if (radiusAxis) node.coordinateGuide.radiusScale = radiusAxis.config.scale;
        if (ringAxis) node.coordinateGuide.ringScale = ringAxis.config.scale;
      }
      node.coordinateSystem = relationshipCoordinateSystem(chart.id);
      const groups = chart.markGroupIds.flatMap((id) => chartRelationships.value.markGroups[id] ?? []);
      if (node.chartSpec && groups.length > 0) {
        node.chartSpec.markGroups = groups.map((group) => ({
          id: group.id,
          chartId: group.chartId,
          role: group.role,
          memberKeys: [...group.memberKeys],
          sharedConfig: { ...group.sharedConfig },
          allowOverrides: group.allowOverrides,
        }));
      }
      const chartCompositions = chart.compositionIds
        .flatMap((id) => chartRelationships.value.compositions[id] ?? []);
      const composition = chartCompositions.find((item) => item.type !== "nested") ?? chartCompositions[0];
      if (composition) {
        node.compositionSpec = {
          id: composition.id,
          type: composition.type,
          members: composition.memberChartIds.map((memberId) => ({
            nodeId: memberId,
            sourceNodeId: chartRelationships.value.charts[memberId]?.sourceChartId ?? memberId,
            chartType: chartRelationships.value.charts[memberId]?.chartType,
            sharedChannels: [...composition.sharedChannels],
          })),
          sharedChannels: [...composition.sharedChannels],
          direction: composition.direction,
          facetField: composition.facetField,
          facetValues: composition.facetCells?.map((cell) => cell.facetKey),
          facetGrid: composition.facetRowField && composition.facetColumnField
            ? {
              rowField: composition.facetRowField,
              columnField: composition.facetColumnField,
              rowValues: Array.from(new Set(composition.facetCells?.map((cell) => cell.rowValue).filter((value): value is string => !!value) ?? [])),
              columnValues: Array.from(new Set(composition.facetCells?.map((cell) => cell.columnValue).filter((value): value is string => !!value) ?? [])),
            }
            : undefined,
        };
      }
    });
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
  const selectionScopeNodes = computed(() => getSelectionScopeNodes());
  function getSelectionNode(nodeId: string) {
    return getSelectionScopeNodes().find((node) => node.id === nodeId) ?? null;
  }
  function coordinateTransformItemIds(itemIds: string[]) {
    const expanded = new Set<string>();
    itemIds.forEach((id) => {
      const node = getSelectionNode(id);
      const composition = node?.compositionSpec;
      if (!node) return;
      if (composition && editingCompositionId.value !== composition.id) {
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
    const height = 30 + Math.max(seriesItemMemberCount(node), 1) * 30;
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
    const threshold = 18 / Math.max(viewZoom.value, 0.0001);
    let nearestZone: DataBindingDropZone | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    getSelectionScopeNodes().forEach((node) => {
      const spec = node.chartSpec;
      const guide = node.coordinateGuide;
      if (!spec) return;
      const dataset = getDataset(spec.datasetId);
      const column = dataset?.columns.find((item) => item.name === payload.field);
      const itemBinding = barItemAxisBinding(node);
      if (spec.datasetId === payload.datasetId && column?.type === payload.type && itemBinding) {
        const bounds = seriesItemDropBounds(node);
        if (pointInBounds(point, bounds)) {
          const categoricalFields = seriesItemCategoricalFields(spec);
          const categoricalMode = categoricalFields.length > 0;
          const quantitativeMode = (spec.valueFields?.length ?? 0) > 0;
          const compatible = categoricalMode
            ? categoricalFields.includes(column.name)
            : quantitativeMode
              ? column.type === "quantitative"
              : normalizeChartTemplate(spec.chartType) === "scatter"
                ? column.type === "nominal" || column.type === "temporal"
                : column.type === "quantitative" || column.type === "nominal" || column.type === "temporal";
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
        if (spec.datasetId !== payload.datasetId || !dataset || !column || column.type !== payload.type) return false;
        const logicalChannel = logicalAxisChannel(node, channel);
        if (logicalChannel === "y" && (spec.valueFields?.length ?? 0) > 0) return false;
        return inferColumnIntents(dataset, spec, column, {
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
        const model = createPolarCoordinateSystemModel(node, viewZoom.value);
        if (!model) return;
        const worldOrigin = nodeLocalToSelectionScopePoint(node, model.origin);
        const worldRadiusEnd = nodeLocalToSelectionScopePoint(node, model.radiusEnd);
        const radiusDistance = pointToSegmentDistance(point, worldOrigin, worldRadiusEnd);
        if (radiusDistance <= threshold) {
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
        }
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
          const label = pathPoints[Math.floor(pathPoints.length / 2)] ?? worldRadiusEnd;
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

  const cartesianCompositionFamilies = new Set(["area", "line", "bar"]);

  function isCartesianCompositionChart(node: CanvasNode) {
    const family = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    const contract = node.chartSpec ? getChartTemplateContract(node.chartSpec.chartType) : null;
    return node.coordinateGuide?.type === "Cartesian"
      && contract?.coordinateSystem === "Cartesian"
      && !!family
      && cartesianCompositionFamilies.has(family)
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
    if (channel === "x" || channel === "y") return cartesianAxisEncoding(spec, channel);
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

  function repeatableCompositionMembers(
    node: CanvasNode,
    type: RepeatableCompositionType,
    direction?: NonNullable<NonNullable<CanvasNode["compositionSpec"]>["direction"]>,
  ): CanvasNode[] | null {
    const composition = node.compositionSpec;
    if (!composition) return [node];
    if (editingCompositionId.value === composition.id || composition.type !== type) return null;
    if (type === "concat" && direction && composition.direction !== direction) return null;
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

  function concatNodesAreCompatible(
    nodes: CanvasNode[],
    direction: "horizontal" | "vertical" | "radial" | "angular",
    channel: CoordinateChannel,
  ) {
    return existingRepeatableCompositions(nodes, "concat").every((composition) =>
      composition.direction === direction && sameChannels(composition.sharedChannels, [channel]))
      && nodes.every((node) => getChartTemplateContract(node.chartSpec!.chartType)?.shareableChannels.includes(channel))
      && sharedChannelEncodingsAreCompatible(nodes, channel);
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
  const axisBindingNode = computed(() =>
    axisBindingTarget.value ? findCanvasNode(axisBindingTarget.value.nodeId) : null,
  );
  const axisBindingDataset = computed(() => {
    const datasetId = axisBindingNode.value?.chartSpec?.datasetId;
    return datasetId ? getDataset(datasetId) : activeDataset.value;
  });
  const axisBindingColumns = computed(() => axisBindingDataset.value?.columns ?? []);
  const axisBindingValue = computed(() => {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    if (!target || !node) return "";
    return node.chartSpec?.encodings[mappedEncodingChannel(node, target.channel)]?.field ?? "";
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
      return channel === "shape" ? column.type === "nominal" : true;
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
  function itemBindingAxis(node: CanvasNode): "x" | "y" {
    return node.chartSpec?.axisSwapped === true ? "x" : "y";
  }
  function logicalAxisChannel(node: CanvasNode, channel: ChartEncodingChannel): ChartEncodingChannel {
    if (node.chartSpec?.axisSwapped !== true || (channel !== "x" && channel !== "y")) return channel;
    return channel === "x" ? "y" : "x";
  }
  function seriesItemCategoricalFields(spec: ChartSpec) {
    const explicit = spec.seriesFields?.map((encoding) => encoding.field)
      ?? (spec.series ? [spec.series.field] : []);
    if (explicit.length > 0) return explicit;
    return normalizeChartTemplate(spec.chartType) === "scatter"
      && (spec.encodings.color?.type === "nominal" || spec.encodings.color?.type === "temporal")
      ? [spec.encodings.color.field]
      : [];
  }
  function barItemAxisBinding(node: CanvasNode) {
    const variant = normalizeBarChartVariant(node.chartSpec?.chartType ?? "");
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    const isSeriesChart = template === "line" || template === "scatter" || template === "area";
    if (!node.chartSpec || (!isSeriesChart
      && variant !== "grouped" && variant !== "stacked" && variant !== "divergent-stacked")) {
      return null;
    }
    return {
      label: template === "scatter"
        ? "Point type"
        : isSeriesChart ? "Series" : variant === "grouped" ? "Group item" : "Segment item",
      fields: Array.from(new Set([
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
  const selectionScopeBounds = computed<Bounds | null>(() =>
    computeSelectionBounds(getSelectionScopeNodes(), selectedIds.value),
  );
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
    const composition = selectedNodes.value[0]?.compositionSpec;
    if (!composition || editingCompositionId.value === composition.id) return false;
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
    const model = createPolarCoordinateSystemModel(node, selectionOverlayZoom.value);
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
      nodes: canvasNodes.value.map((n) => cloneCanvasNode(n)),
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
  function restoreCanvasHistory(snapshot: CanvasHistorySnapshot) {
    interaction.value = null;
    detachPointerListeners();
    editingCompositionId.value = null;
    nestedPositionRelationshipIds.value = [];
    chartDrilldown.value = null;
    nestedDropPath = [];
    canvasNodes.value = migrateIndependentViewGroups(snapshot.nodes.map((n) => cloneCanvasNode(n)));
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
  }
  function undoCanvasChange() {
    const snapshot = undoStack.value.pop();
    if (!snapshot) return;
    redoStack.value.push(captureCanvasHistory());
    restoreCanvasHistory(snapshot);
  }
  function redoCanvasChange() {
    const snapshot = redoStack.value.pop();
    if (!snapshot) return;
    undoStack.value.push(captureCanvasHistory());
    restoreCanvasHistory(snapshot);
  }

  // --- selection ---
  function scopedCompositionMemberIds(node: CanvasNode) {
    const composition = node.compositionSpec;
    if (!composition || editingCompositionId.value === composition.id) return [node.id];
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
      if (!node) return;
      scopedCompositionMemberIds(node).forEach((memberId) => normalized.add(memberId));
    });
    return nodes.filter((n) => normalized.has(n.id)).map((n) => n.id);
  }
  function setSelection(ids: string[]) {
    selectedIds.value = normalizeSelection(ids);
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
    const dataset = node.chartSpec
      ? { ...sourceDataset, rows: sourceDataset.rows.filter((row) => rowMatchesChartFilters(row, node.chartSpec!)) }
      : sourceDataset;
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
      node.chartSpec = { ...chartSpec, scales: result.scales, plotArea: result.plotArea, renderer: { kind: "deterministic-line", version: 3, status: "ready" } };
      node.renderedContent = result.content;
      if (node.nestedSpec) {
        const nested = renderNestedPie({ chartId: node.id, width: node.width, height: node.height, minX: 0, minY: 0, baseSpec: node.chartSpec, nestedSpec: node.nestedSpec, dataset });
        node.renderedContent += nested.content;
      }
    } catch (error) {
      node.renderedContent = null;
      node.chartSpec = { ...chartSpec, renderer: { kind: "deterministic-line", version: 3, status: "error", error: error instanceof Error ? error.message : "Unable to render Layer." } };
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
      axisBindingTarget.value = {
        nodeId: node.id,
        channel: template === "pie" || template === "donut" ? "y" : "x",
        clientX: event.clientX,
        clientY: event.clientY,
      };
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
      renderChartNode(node);
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
    else renderChartNode(node);
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
      if (render) renderSharedCoordinateComposition(target);
      registerChartRelationship(target);
    });
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

  function closeDimensionDropDecision() {
    dimensionDropTarget.value = null;
  }

  function applyInputColumnIntent(intentId: string) {
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
          : false;
    if (applied) closeDimensionDropDecision();
    return applied;
  }

  function createLayer(recordHistory = true, requestedChannels?: CoordinateChannel[], targetNodeId?: string) {
    const nodes = repeatableCompositionNodes(selectedNodes.value, "layer")
      ?.filter((node) => node.chartSpec && node.coordinateGuide) ?? [];
    if (nodes.length < 2 || !nodes.every(isAtomicChartReady)) return false;
    const contracts = nodes.map((node) => getChartTemplateContract(node.chartSpec!.chartType));
    if (contracts.some((contract) => !contract)) return false;
    const coordinateType = contracts[0]!.coordinateSystem;
    if (coordinateType === "CoordinateFree" || !nodes.every((node) => node.coordinateGuide?.type === coordinateType)) return false;
    const compatibleChannels = layerChannelsForNodes(nodes);
    if (!compatibleChannels) return false;
    const sharedChannels = requestedChannels ?? compatibleChannels;
    const existingCompositions = existingRepeatableCompositions(nodes, "layer");
    if (sharedChannels.length === 0
      || !sharedChannels.every((channel) => compatibleChannels.includes(channel))
      || (existingCompositions.length > 0 && !sameChannels(sharedChannels, compatibleChannels))) return false;
    const datasetId = nodes[0]!.chartSpec!.datasetId;
    const filterKey = JSON.stringify({
      single: Object.entries(nodes[0]!.chartSpec!.filters ?? {}).sort(),
      multiple: Object.entries(nodes[0]!.chartSpec!.valueFilters ?? {}).sort(),
    });
    if (!nodes.every((node) =>
      node.chartSpec!.datasetId === datasetId
      && JSON.stringify({
        single: Object.entries(node.chartSpec!.filters ?? {}).sort(),
        multiple: Object.entries(node.chartSpec!.valueFilters ?? {}).sort(),
      }) === filterKey,
    )) return false;

    const retainedComposition = existingCompositions[0];
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
    const sourceNodes = type === "concat"
      ? targetNodeId && sourceNodeId
        ? anchoredTargetNodes && anchoredSourceNodes
          ? repeatableCompositionNodes([...anchoredTargetNodes, ...anchoredSourceNodes], "concat", direction) ?? []
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
        || !existingCompositions.every((composition) =>
          composition.direction === direction && sameChannels(composition.sharedChannels, sharedChannels))
        || !sharedChannelEncodingsAreCompatible(sourceNodes, sharedChannel)
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
    let facetGrid: NonNullable<CanvasNode["compositionSpec"]>["facetGrid"];
    if (type !== "concat") {
      const source = sourceNodes[0]!;
      const recommendation = source.chartSpec?.dimensionRecommendations?.find((item) => item.strategy === "facet");
      facetDirection = recommendation?.facetDirection;
      const dataset = source.chartSpec ? getDataset(source.chartSpec.datasetId) : null;
      facetGrid = recommendation?.facetGrid
        ? {
          ...recommendation.facetGrid,
          rowValues: [...recommendation.facetGrid.rowValues],
          columnValues: [...recommendation.facetGrid.columnValues],
        }
        : undefined;
      if (facetGrid) {
        facetValues = facetGrid.rowValues.flatMap((rowValue) =>
          facetGrid!.columnValues.map((columnValue) => `${rowValue}|${columnValue}`),
        );
        children = facetGrid.rowValues.flatMap((rowValue, rowIndex) =>
          facetGrid!.columnValues.map((columnValue, columnIndex) => {
            const clone = cloneCanvasNodeForPaste(source);
            const baseX = type === "facet" ? bounds.minX : 0;
            const baseY = type === "facet" ? bounds.minY : 0;
            clone.name = `${source.name} - ${rowValue} / ${columnValue}`;
            if (clone.chartSpec) {
              clone.chartSpec = {
                ...clone.chartSpec,
                filters: {
                  ...clone.chartSpec.filters,
                  [facetGrid!.rowField]: rowValue,
                  [facetGrid!.columnField]: columnValue,
                },
              };
            }
            renderChartNode(clone);
            clone.x = baseX + columnIndex * (clone.width * clone.scaleX + gap);
            clone.y = baseY + rowIndex * (clone.height * clone.scaleY + gap);
            return clone;
          }),
        );
      } else {
        facetField = recommendation?.field;
        facetValues = facetField && dataset
          ? Array.from(new Set(dataset.rows.map((row) => row[facetField!] ?? "").filter(Boolean)))
          : ["1", "2", "3"];
        const columns = recommendation?.facetDirection === "row"
          ? 1
          : Math.max(1, facetValues.length);
        children = facetValues.map((value, index) => {
          const clone = cloneCanvasNodeForPaste(source);
          const baseX = type === "facet" ? bounds.minX : 0;
          const baseY = type === "facet" ? bounds.minY : 0;
          if (clone.chartSpec && facetField) clone.chartSpec = { ...clone.chartSpec, filters: { ...clone.chartSpec.filters, [facetField]: value } };
          renderChartNode(clone);
          clone.x = baseX + (index % columns) * (clone.width * clone.scaleX + gap);
          clone.y = baseY + Math.floor(index / columns) * (clone.height * clone.scaleY + gap);
          return clone;
        });
      }
    } else {
      let cursor = 0;
      const orderedNodes = anchoredTargetNodes && anchoredSourceNodes
        ? concatPosition === "before"
          ? [...anchoredSourceNodes, ...anchoredTargetNodes]
          : [...anchoredTargetNodes, ...anchoredSourceNodes]
        : sourceNodes;
      children = orderedNodes.map((node) => {
        const plotBounds = collectNodeSelectionBounds(node);
        if (direction === "radial" || direction === "angular") {
          // Polar concat placement is normalized after the composition is built.
          return node;
        }
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
    const childBounds = getCanvasNodeListBounds(children);
    if (!childBounds) return false;
    const compositionDirection = direction;
    const sharedChannels: CoordinateChannel[] = type === "facet"
      ? []
      : type === "concat"
      ? requestedChannels ?? [
        compositionDirection === "vertical" ? "x"
          : compositionDirection === "radial" ? "angle"
            : compositionDirection === "angular" ? "radius" : "y",
      ]
      : [...(getChartTemplateContract(children[0]?.chartSpec?.chartType ?? "")?.shareableChannels ?? [])];
    const retainedCoordinateSystem = sourceNodes.find((node) =>
      node.compositionSpec?.id === retainedConcatComposition?.id,
    )?.coordinateSystem;
    const coordinateSystem: CoordinateSystemSpec | null = sharedChannels.length > 0 ? {
      id: retainedCoordinateSystem?.id ?? `coordinate:${compositionId}`,
      type: children[0]?.coordinateGuide?.type ?? "CoordinateFree",
      ownerNodeId: type === "nested"
        ? compositionId
        : type === "concat"
          ? retainedCoordinateSystem?.ownerNodeId ?? sourceNodes[0]!.id
          : children[0]!.id,
      members: children.map((node) => ({
        nodeId: node.id,
        channels: [...(getChartTemplateContract(node.chartSpec?.chartType ?? "")?.shareableChannels ?? [])],
      })),
      sharedChannels,
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
      facetGrid,
      members: children.map((node) => ({
        nodeId: node.id,
        sourceNodeId: type !== "concat"
          ? sourceNodes[0]!.id
          : node.compositionSpec?.members.find((member) => member.nodeId === node.id)?.sourceNodeId ?? node.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels,
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
      role: element.getAttribute("data-mark-role") ?? undefined,
      fallbackIndex: undefined as number | undefined,
    };
    if (!identity.rowKey && !identity.categoryKey && !identity.seriesKey) identity.fallbackIndex = fallbackIndex;
    return JSON.stringify(identity);
  }

  function markMatchesNestedDataKey(element: Element, dataKey: string, fallbackIndex: number) {
    try {
      const identity = JSON.parse(dataKey) as {
        rowKey?: string;
        categoryKey?: string;
        seriesKey?: string;
        role?: string;
        fallbackIndex?: number;
      };
      return (identity.rowKey === undefined || element.getAttribute("data-row-key") === identity.rowKey)
        && (identity.categoryKey === undefined || element.getAttribute("data-category-key") === identity.categoryKey)
        && (identity.seriesKey === undefined || element.getAttribute("data-series-key") === identity.seriesKey)
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
    if (zone.type !== "nested" || !zone.targetChildMarkIndexes?.length) return false;
    let groupKey: string | undefined;
    try {
      groupKey = (JSON.parse(zone.targetDataKey ?? "{}") as { categoryKey?: string }).categoryKey;
    } catch { /* legacy non-JSON item key */ }
    nestedDropPath.push({
      nodeId: zone.targetNodeId,
      childMarkIndexes: [...zone.targetChildMarkIndexes],
      groupKey,
    });
    chartDrilldown.value = { nodeId: zone.targetNodeId, level: "part" };
    semanticSelection.value = null;
    return true;
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
    if (!model) return null;
    const localPoint = toNodeLocalPoint(target, point);
    const dx = localPoint.x - model.origin.x;
    const dy = model.origin.y - localPoint.y;
    const distance = Math.hypot(dx, dy);
    const rawDegrees = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
    const degrees = rawDegrees < 0.001 ? 0 : 360 - rawDegrees;
    const angleSpan = target.compositionSpec?.type === "concat"
      && target.compositionSpec.direction === "angular"
      ? target.compositionSpec.polarAngleSpan ?? model.angleSpan
      : model.angleSpan;
    const plotArea = target.chartSpec.plotArea;
    const chartRadius = plotArea
      ? Math.max(8, Math.min(plotArea.width, plotArea.height) / 2)
      : Math.max(8, Math.min(target.width, target.height) * 0.38
        * (target.coordinateGuide.radiusScale ?? 1));
    const edgeAngle = Math.min(30, Math.max(8, angleSpan * 0.22));
    const inAngle = angleSpan >= 359.999 || degrees <= angleSpan;
    const radialGap = Math.max(8, chartRadius * 0.06);
    const radialThickness = Math.max(24, Math.min(chartRadius * 0.35, 120));
    const radialInner = chartRadius + radialGap;
    const radialOuter = radialInner + radialThickness;
    const inRadialZone = distance >= radialInner && distance <= radialOuter
      && (angleSpan >= 359.999 || degrees <= angleSpan);
    const before = degrees <= edgeAngle;
    const after = angleSpan >= 359.999
      ? degrees >= 360 - edgeAngle
      : degrees >= Math.max(0, angleSpan - edgeAngle) && degrees <= angleSpan;
    const polarNodesFor = (type: RepeatableCompositionType, direction?: "radial" | "angular") => {
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
    if (inRadialZone) {
      const nodes = polarNodesFor("concat", "radial");
      const geometry = polarSectorGeometry(target, model, radialInner, radialOuter, 0, -angleSpan);
      if (!geometry) return null;
      return {
        targetNodeId: target.id,
        type: "concat",
        sharedChannels: ["angle"],
        ...geometry,
        compatible: sharedChannelCompatible(nodes, "radial", "angle"),
        direction: "radial",
        concatPosition: "after",
      };
    }
    if (distance <= chartRadius && inAngle && (before || after)) {
      const nodes = polarNodesFor("concat", "angular");
      const isBefore = before && !after;
      const start = isBefore ? 0 : -Math.max(0, angleSpan - edgeAngle);
      const end = isBefore ? -edgeAngle : -angleSpan;
      const geometry = polarSectorGeometry(target, model, 0, chartRadius, start, end);
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
    if (distance <= chartRadius && inAngle) {
      const nodes = polarNodesFor("layer");
      const geometry = polarSectorGeometry(target, model, 0, chartRadius, 0, -angleSpan);
      if (!geometry) return null;
      const sharedChannels = nodes ? layerChannelsForNodes(nodes) ?? [] : [];
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
    const sourceCompositionMemberIds = new Set(
      source.compositionSpec?.members.map((member) => member.nodeId) ?? [sourceNodeId],
    );
    const chartTargets = getSelectionScopeNodes().filter((node) =>
      !sourceCompositionMemberIds.has(node.id)
      && !!node.chartSpec
    );
    for (const target of [...chartTargets].reverse()) {
      if (target.coordinateGuide?.type === "Polar") continue;
      const nestedItem = semanticItemDropZone(target, point, sourceNodeId);
      if (nestedItem) return nestedItem;
    }
    const targets = chartTargets.filter((node) =>
      !!node.coordinateGuide
      && !(chartDrilldown.value?.nodeId === node.id && chartDrilldown.value.level === "part"),
    );
    for (const target of targets) {
      if (!target.coordinateGuide || !target.chartSpec) continue;
      if (target.coordinateGuide.type === "Polar") {
        const polarZone = polarCompositionDropZoneAtPoint(target, source, point);
        if (polarZone) return polarZone;
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
      if (!inside) continue;

      const nestedPoint = scatterPointDropZone(target, point);
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

      const left = localPoint.x - plotArea.x;
      const right = plotArea.x + plotArea.width - localPoint.x;
      const top = localPoint.y - plotArea.y;
      const bottom = plotArea.y + plotArea.height - localPoint.y;
      const edgeSizeX = Math.min(plotArea.width * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleX), 0.25), 12));
      const edgeSizeY = Math.min(plotArea.height * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleY), 0.25), 12));
      const horizontal = Math.min(left / edgeSizeX, right / edgeSizeX) <= Math.min(top / edgeSizeY, bottom / edgeSizeY);
      const withinBoundary = horizontal
        ? Math.min(left, right) <= edgeSizeX
        : Math.min(top, bottom) <= edgeSizeY;
      if (withinBoundary) {
        const direction = horizontal ? "horizontal" : "vertical";
        const sharedChannel: CoordinateChannel = horizontal ? "y" : "x";
        const before = horizontal ? left <= right : top <= bottom;
        const compositionNodes = repeatableCompositionPairNodes(source, target, "concat", direction);
        const compatible = !!compositionNodes
          && compositionNodes.every(isCartesianCompositionChart)
          && concatNodesAreCompatible(compositionNodes, direction, sharedChannel);
        const localZone: ChartPlotArea = horizontal
          ? {
            x: left <= right ? plotArea.x : plotArea.x + plotArea.width - edgeSizeX,
            y: plotArea.y,
            width: edgeSizeX,
            height: plotArea.height,
          }
          : {
            x: plotArea.x,
            y: top <= bottom ? plotArea.y : plotArea.y + plotArea.height - edgeSizeY,
            width: plotArea.width,
            height: edgeSizeY,
          };
        const geometry = localRectDropGeometry(target, localZone);
        return {
          targetNodeId: target.id,
          type: "concat",
          sharedChannels: [sharedChannel],
          ...geometry,
          compatible,
          direction,
          concatPosition: before ? "before" : "after",
        };
      }

      const compositionNodes = repeatableCompositionPairNodes(source, target, "layer");
      const sharedChannels = compositionNodes ? layerChannelsForNodes(compositionNodes) ?? [] : [];
      const compatible = !!compositionNodes
        && compositionNodes.every(isCartesianCompositionChart)
        && sharedChannels.length > 0;
      const layerArea = {
        x: plotArea.x + edgeSizeX,
        y: plotArea.y + edgeSizeY,
        width: Math.max(0, plotArea.width - edgeSizeX * 2),
        height: Math.max(0, plotArea.height - edgeSizeY * 2),
      };
      return {
        targetNodeId: target.id,
        type: "layer",
        sharedChannels,
        ...localRectDropGeometry(target, layerArea),
        compatible,
      };
    }
    return null;
  }

  function nestedCompositionFromBlock(parent: CanvasNode, child: CanvasNode, rowKey: string) {
    const childSpec = child.chartSpec;
    const parentSpec = parent.chartSpec;
    if (!childSpec || !parentSpec) return false;
    if (childSpec.datasetId !== parentSpec.datasetId) return false;
    const childTemplate = normalizeChartTemplate(childSpec.chartType);
    if (childTemplate !== "pie" && childTemplate !== "donut") return false;
    const angleFields = childSpec.angleFields?.map((encoding) => encoding.field)
      ?? [childSpec.encodings.theta?.field ?? childSpec.encodings.angle?.field].filter((field): field is string => !!field);
    const radiusField = childSpec.encodings.radius?.field ?? childSpec.encodings.y?.field;
    if (angleFields.length === 0 || !radiusField) return false;
    return applyNestedPiesToNode(parent, rowKey, { angleFields, radiusField });
  }

  function commitCompositionDrop(zone: ChartDropZone, sourceNodeId: string) {
    const source = findCanvasNode(sourceNodeId);
    const target = findCanvasNode(zone.targetNodeId);
    if (!source || !target || !zone.compatible || !source.chartSpec || !target.chartSpec) return false;
    if (zone.type === "nested") {
      if (zone.nestedAction === "enter") {
        enterNestedDropLevel(zone);
        selectedIds.value = [];
        return true;
      }
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
        const child = index === 0 ? source : cloneCanvasNodeForPaste(source);
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
      replaceSelectionScopeNodes([
        ...getSelectionScopeNodes().filter((node) => node.id !== source.id),
        ...childInstances.map(({ child }) => child),
      ]);
      editingCompositionId.value = `composition:${childInstances[0]!.relationshipId}`;
      selectedIds.value = childInstances.map(({ child }) => child.id);
      semanticSelection.value = null;
      axisBindingTarget.value = null;
      openNestedPositionEditor(childInstances.map(({ relationshipId }) => relationshipId));
      setImportNotice(`${sourceName} nested into ${nestedTargets.length} ${target.name} items.`);
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
      renderChartNode(member);
    });
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
  function setAxisSwap(swapped: boolean) {
    const node = axisBindingNode.value;
    if (!node?.chartSpec || node.coordinateGuide?.type !== "Cartesian") return;
    updateEncodingTargets(node, (_target, spec) => ({
      ...spec,
      axisSwapped: swapped || undefined,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    }));
  }
  function closeAxisBinding() {
    axisBindingTarget.value = null;
  }
  function bindMarkField(fieldName: string, aggregation?: "sum" | "avg") {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!target || !node || !dataset) return;
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return;
    const mappedChannel = mappedEncodingChannel(node, target.channel);
    if (mappedChannel === "y" && (node.chartSpec?.valueFields?.length ?? 0) > 0) {
      setImportNotice("Y is derived from quantitative Series Items and cannot be bound separately.");
      return;
    }
    const encodings = { ...node.chartSpec?.encodings, [mappedChannel]: { field: column.name, type: column.type } };
    const clearsSeries = node.chartSpec?.series?.field === column.name
      || node.chartSpec?.seriesFields?.some((encoding) => encoding.field === column.name);
    const tentativeSpec: ChartSpec = {
      ...node.chartSpec,
      chartType: node.chartSpec?.chartType ?? (node.kind === "leaf" ? getCandidate(node.candidateId)?.chartType : undefined) ?? node.name,
      datasetId: dataset.id,
      encodings,
      series: clearsSeries ? undefined : node.chartSpec?.series,
      seriesFields: clearsSeries ? undefined : node.chartSpec?.seriesFields,
      valueFields: mappedChannel === "y" ? undefined : node.chartSpec?.valueFields,
    };
    const conflict = resolveChartEncodingIssues(tentativeSpec)
      .find((issue) => issue.code === "duplicate-data-field" && issue.fields.includes(column.name));
    if (conflict) {
      setImportNotice(conflict.message);
      return;
    }
    updateEncodingTargets(node, (member, spec) => {
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
        valueFields: memberChannel === "y" ? undefined : spec.valueFields,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
    });
  }
  function setAxisBindingAggregation(channel: EncodingChannel, aggregation?: "sum" | "avg") {
    const node = axisBindingNode.value;
    const mappedChannel = node ? mappedEncodingChannel(node, channel) : channel;
    if (!node?.chartSpec || node.chartSpec.encodings[mappedChannel]?.type !== "quantitative") return;
    updateEncodingTargets(node, (member, spec) => {
      const memberChannel = mappedEncodingChannel(member, channel);
      const aggregations = { ...spec.aggregations };
      if (aggregation) aggregations[memberChannel] = aggregation;
      else delete aggregations[memberChannel];
      return {
        ...spec,
        aggregations: Object.keys(aggregations).length ? aggregations : undefined,
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
  function confirmSeriesField(fieldName: string) {
    setChartSeries(fieldName);
  }
  function setChartSeries(fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    if (!fieldName) return clearSeriesBinding();
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return;
    const occupied = Object.values(node.chartSpec.encodings).some((encoding) => encoding?.field === fieldName);
    if (occupied) {
      setImportNotice(`${fieldName} is already bound to another channel.`);
      return;
    }
    const encoding = { field: column.name, type: column.type };
    updateEncodingTargets(node, (_target, spec) => ({
      ...spec,
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
        && (item.type === "nominal" || item.type === "temporal"));
      return column ? [{ field: column.name, type: column.type }] : [];
    }).slice(0, 1);
    const occupied = new Set(Object.values(node.chartSpec.encodings)
      .filter((encoding): encoding is NonNullable<typeof encoding> => !!encoding)
      .map((encoding) => encoding.field));
    const conflicting = selected.find((encoding) => occupied.has(encoding.field)
      && encoding.field !== node.chartSpec?.encodings.color?.field);
    if (conflicting) {
      setImportNotice(`${conflicting.field} is already bound to another channel.`);
      return false;
    }
    updateEncodingTargets(node, (_target, spec) => {
      const encodings = { ...spec.encodings };
      const template = normalizeChartTemplate(spec.chartType);
      if (template === "bar" || template === "line") delete encodings.color;
      else if (template === "area" || template === "scatter") {
        if (selected[0]) encodings.color = { ...selected[0] };
        else if ((template === "scatter" && (encodings.color?.type === "nominal" || encodings.color?.type === "temporal"))
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
  function setChartEncoding(channel: ChartEncodingChannel, fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const config = getEncodingChannelConfigsForSpec(node.chartSpec).find((item) => item.channel === channel);
    const column = fieldName ? dataset.columns.find((item) => item.name === fieldName) : undefined;
    if (!config || (fieldName && (!column || !config.accepts.includes(column.type)))) return;
    if (channel === "y" && (node.chartSpec.valueFields?.length ?? 0) > 0) {
      setImportNotice("Y is derived from quantitative Series Items and cannot be bound separately.");
      return;
    }
    if (channel === "x" || channel === "y") {
      setAxisBindingChannel(channel);
      if (fieldName) bindMarkField(fieldName);
      else clearMarkField();
      return;
    }
    if (channel === "theta" || channel === "angle") return setPieAngleFields(fieldName ? [fieldName] : []);
    if (channel === "radius") return fieldName ? bindPolarRadiusField(fieldName) : clearPolarRadiusField();
    updateEncodingTargets(node, (_target, spec) => {
      const memberEncodings = { ...spec.encodings };
      if (column) memberEncodings[channel] = { field: column.name, type: column.type };
      else delete memberEncodings[channel];
      return { ...spec, encodings: memberEncodings, scales: undefined, plotArea: undefined, renderer: undefined };
    });
  }

  function setCompositionEncoding(patch: {
    facetField?: string;
    facetDirection?: "row" | "column";
    facetGrid?: NonNullable<CanvasNode["compositionSpec"]>["facetGrid"];
    sharedChannels?: CoordinateChannel[];
  }) {
    const node = axisBindingNode.value;
    const current = node?.compositionSpec;
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    if (!node || !current || current.type === "nested") return;
    pushCanvasHistory();
    const nextSpec: NonNullable<CanvasNode["compositionSpec"]> = {
      ...current,
      ...patch,
      sharedChannels: patch.sharedChannels ? [...patch.sharedChannels] : [...current.sharedChannels],
      members: current.members.map((member) => ({ ...member, sharedChannels: patch.sharedChannels ? [...patch.sharedChannels] : [...member.sharedChannels] })),
    };
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
    const members = nextSpec.members
      .map((member) => findCanvasNode(member.nodeId))
      .filter((member): member is CanvasNode => !!member);
    if (current.type === "facet" && !nextSpec.facetGrid && patch.facetDirection && members.length > 1) {
      const anchor = members[0]!;
      const stepX = anchor.width * anchor.scaleX + 4;
      const stepY = anchor.height * anchor.scaleY + 4;
      members.forEach((member, index) => {
        member.x = patch.facetDirection === "row" ? anchor.x : anchor.x + index * stepX;
        member.y = patch.facetDirection === "row" ? anchor.y + index * stepY : anchor.y;
      });
    }
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
    });
    updateEncodingTargets(node, (_target, spec) => {
      const memberEncodings = { ...spec.encodings };
      delete memberEncodings.theta;
      delete memberEncodings.angle;
      delete memberEncodings.y;
      if (selected.length === 1) memberEncodings.theta = { ...selected[0]! };
      return {
        ...spec,
        encodings: memberEncodings,
        angleFields: selected.length > 1 ? selected : undefined,
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
  function setValueSeriesFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const selected = Array.from(new Set(fieldNames)).flatMap((field) => {
      const column = dataset.columns.find((item) => item.name === field && item.type === "quantitative");
      return column ? [{ field: column.name, type: column.type }] : [];
    });
    updateEncodingTargets(node, (_target, spec) => {
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
    const direction = owner.compositionSpec?.direction ?? "horizontal";
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
      alignConcatSharedFrame(owner, members);
      if (owner.coordinateGuide?.type !== "Polar") alignConcatPlotLayout(owner, members);
    }
    members.forEach((member) => renderChartNode(member, true));
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
    const encodingIssues = resolveChartEncodingIssues(chartSpec);
    const complete = hasRequiredChartEncodings(chartSpec) && encodingIssues.length === 0;
    const coordinateReady = contract.coordinateSystem === "CoordinateFree" || node.coordinateGuide?.type === contract.coordinateSystem;
    if (encodingIssues.length > 0) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "error",
          error: encodingIssues.map((issue) => issue.message).join(" "),
        },
      };
      return;
    }
    if (!complete || !coordinateReady) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
      };
      return;
    }
    const sourceDataset = getDataset(chartSpec.datasetId);
    if (!sourceDataset) {
      node.renderedContent = null;
      node.chartSpec = {
        ...chartSpec,
        scales: undefined,
        plotArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "error",
          error: "The bound dataset is no longer available.",
        },
      };
      return;
    }
    const { dataset, chartSpec: syncedChartSpec } = prepareChartData(
      node.id,
      sourceDataset,
      chartSpec,
    );
    const usesDerivedValueSeries = (chartSpec.valueFields?.length ?? 0) > 1;
    const persistedSyncedChartSpec = usesDerivedValueSeries
      ? {
        ...syncedChartSpec,
        encodings: chartSpec.encodings,
        series: chartSpec.series,
        seriesFields: chartSpec.seriesFields,
        valueFields: chartSpec.valueFields,
      }
      : syncedChartSpec;
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
    const nativePlotArea = chartSpec.plotArea;
    const sharedChannels = new Set(coordinateOwner?.coordinateSystem?.sharedChannels ?? []);
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
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "ready",
        },
      };
      const renderedChartSpec: ChartSpec = {
        ...persistedSyncedChartSpec,
        scales: result.scales,
        plotArea: result.plotArea,
        renderer: renderingChartSpec.renderer,
      };
      node.chartSpec = renderedChartSpec;
      node.renderedContent = result.content;
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
        ...persistedSyncedChartSpec,
        scales: undefined,
        plotArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: contract.rendererVersion,
          status: "error",
          error: error instanceof Error ? error.message : "Unable to render this chart.",
        },
      };
    }
  }

  function cloneCanvasNodeForPaste(node: CanvasNode): CanvasNode {
    const nextId = crypto.randomUUID();
    const coordinateGuide = node.coordinateGuide
      ? { ...node.coordinateGuide, origin: { ...node.coordinateGuide.origin } }
      : node.coordinateGuide;
    const chartSpec = cloneChartSpec(node.chartSpec);
    if (node.kind === "leaf") {
      const clone: CanvasLeafNode = { ...node, coordinateGuide, coordinateSystem: null, compositionSpec: null, chartSpec, id: nextId, name: `${node.name} copy`, content: scopeSvgContent(node.content, nextId) };
      clone.coordinateSystem = standaloneCoordinateSystem(clone);
      if (clone.llmRenderer?.status !== "ready") {
        renderChartNode(clone);
        renderSemanticNode(clone);
      }
      return clone;
    }
    const clone: CanvasGroupNode = { ...node, coordinateGuide, coordinateSystem: null, compositionSpec: null, chartSpec, id: nextId, name: `${node.name} copy`, children: node.children.map((c) => cloneCanvasNodeForPaste(c)) };
    clone.coordinateSystem = standaloneCoordinateSystem(clone);
    if (clone.llmRenderer?.status !== "ready") {
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
    return createUnboundChartSpec(chartType, datasetId);
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
    recordHistory = true,
  ) {
    const initialWidth = 800;
    const scale = initialWidth / template.width;
    const size = { width: initialWidth, height: template.height * scale };
    const canvasBounds = getSelectionScopeBounds();
    const x = clamp(point.x - size.width / 2, canvasBounds.minX, canvasBounds.maxX - size.width);
    const y = clamp(point.y - size.height / 2, canvasBounds.minY, canvasBounds.maxY - size.height);
    const nameCounters = { leaf: 0, group: 0 };
    const styleTokens = chartType && isLineChartType(chartType)
      ? { ...extractChartStyleTokens(template), lineWidth: 2.5 }
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
      const chartSpec = isRoot && chartType && datasetId && normalizeChartTemplate(chartType)
        ? { ...createInitialChartSpec(chartType, datasetId), styleTokens }
        : undefined;
      if (node.kind === "leaf") {
        nameCounters.leaf += 1;
        return { kind: "leaf", id, candidateId: sourceId, name: `${name}-${nameCounters.leaf}`, content: scopeSvgContent(node.content, id), viewBox: node.viewBox, width: Math.max(node.bounds.width, 1), height: Math.max(node.bounds.height, 1), x: nodeX, y: nodeY, scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, contentMinX: node.contentMinX, contentMinY: node.contentMinY, coordinateGuide, chartSpec } satisfies CanvasLeafNode;
      }
      nameCounters.group += 1;
      const groupName = node.name ? `${name}-${node.name}` : `${name}-group-${nameCounters.group}`;
      return { kind: "group", id, name: groupName, x: nodeX, y: nodeY, width: Math.max(node.bounds.width, 1), height: Math.max(node.bounds.height, 1), scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, coordinateGuide, chartSpec, children: node.children.map((c) => instantiateNode(c, node.bounds)) } satisfies CanvasGroupNode;
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
        datasetId: datasetId ?? null,
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
        candidate.chartType,
        activeDataset.value?.id,
        recordHistory,
      );
    }
    finally { loadingDrop.value = false; }
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
  function startMove(itemIds: string[], event: PointerEvent) {
    const transformItemIds = coordinateTransformItemIds(itemIds);
    if (transformItemIds.length === 0) return;
    const snapshots = Object.fromEntries(transformItemIds.map((id) => { const item = getSelectionNode(id); return [id, { x: item?.x ?? 0, y: item?.y ?? 0 }]; }));
    const scopeGroupId = editingGroupPath.value.at(-1);
    interaction.value = {
      type: "move",
      startPoint: toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId),
      itemIds: transformItemIds,
      snapshots,
      scopeGroupId,
      historyCommitted: false,
    };
    attachPointerListeners();
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
      editingCompositionId.value = composition.id;
      selectedIds.value = [];
      semanticSelection.value = null;
      chartDrilldown.value = null;
      axisBindingTarget.value = null;
      return true;
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
    return Object.values(chartRelationships.value.nestedRelationships).find((relationship) =>
      relationship.status === "active" && selection.has(relationship.childChartId),
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
    projectRelationshipStateToCanvas();
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

  function configureSelectionComposition() {
    if (!canConfigureSelectionComposition.value) return false;
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
      editingCompositionId.value = null;
      const member = getSelectionScopeNodes().find((candidate) => candidate.compositionSpec?.id === compositionId);
      setSelection(selectParent && member ? [member.id] : []);
      semanticSelection.value = null;
      axisBindingTarget.value = null;
      return true;
    }
    return exitGroupEditing(selectParent);
  }
  function onCanvasNodeDoubleClick(node: CanvasNode, event: MouseEvent) {
    if (node.kind !== "group" || node.children.length === 0 || node.renderedContent) return;
    event.preventDefault();
    event.stopPropagation();
    enterCanvasGroup(node);
  }
  function onCanvasNodePointerDown(node: CanvasNode, event: PointerEvent) {
    if (event.button !== 0) return;
    contextMenu.value = null;
    compositionDragSourceId.value = null;
    activeDropZone.value = null;
    if (chartDrilldown.value && chartDrilldown.value.nodeId !== node.id) {
      chartDrilldown.value = null;
      nestedDropPath = [];
      semanticSelection.value = null;
    }
    if (editingCompositionId.value && node.compositionSpec?.id !== editingCompositionId.value) {
      editingCompositionId.value = null;
    }
    if (node.chartSpec) dispatchRelationship({ type: "select-entity", selection: { type: "chart", id: node.id } });
    event.stopPropagation();
    if (editingGroupPath.value.length > 0 && !getSelectionNode(node.id)) {
      editingGroupPath.value = [];
      selectedIds.value = [];
    }
    const targetIds = normalizeSelection([node.id]);
    const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
    if (hasModifier) { toggleSelection(targetIds); return; }
    const nextSelection = selectedIds.value.includes(node.id) ? selectedIds.value : targetIds;
    setSelection(nextSelection);
    semanticSelection.value = null;
    if (node.chartSpec) {
      const template = normalizeChartTemplate(node.chartSpec.chartType);
      axisBindingTarget.value = {
        nodeId: node.id,
        channel: template === "pie" || template === "donut" ? "y" : "x",
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
    startMove(nextSelection, event);
    const repeatableComposition = node.compositionSpec?.type === "layer" || node.compositionSpec?.type === "concat"
      ? node.compositionSpec
      : null;
    const draggingWholeComposition = !!repeatableComposition
      && editingCompositionId.value !== repeatableComposition.id
      && repeatableComposition.members.length === nextSelection.length
      && repeatableComposition.members.every((member) => nextSelection.includes(member.nodeId));
    if (node.chartSpec && (nextSelection.length === 1 || draggingWholeComposition)) {
      compositionDragSourceId.value = node.id;
    }
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
    if (editingGroupPath.value.length > 0 && !getSelectionNode(node.id)) {
      editingGroupPath.value = [];
      selectedIds.value = [];
    }
    if (!selectedIds.value.includes(node.id)) setSelection([node.id]);
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
    const snapshots = Object.fromEntries(itemIds.map((id) => { const item = getSelectionNode(id); return [id, { x: item?.x ?? 0, y: item?.y ?? 0, scaleX: item?.scaleX ?? 1, scaleY: item?.scaleY ?? 1 }]; }));
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
    event.preventDefault();
    event.stopPropagation();
    rotationInputVisible.value = false;
    polarAngleInputVisible.value = false;
    const scopeGroupId = editingGroupPath.value.at(-1);
    interaction.value = {
      type: "polar-angle",
      nodeId: node.id,
      startPoint: toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId),
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
    if (node.compositionSpec?.type === "concat") {
      node.compositionSpec.polarAngleSpan = angleSpan;
      const owner = findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? node;
      renderSharedCoordinateComposition(owner);
      polarAngleInputVisible.value = true;
      return;
    }
    coordinateTargets(node.id, "angle").forEach((member) => {
      if (member.coordinateGuide?.type !== "Polar") return;
      member.coordinateGuide.angleSpan = angleSpan;
      renderChartNode(member);
    });
    polarAngleInputVisible.value = true;
  }
  function updateMoveInteraction(currentPoint: Point, mi: MoveInteraction) {
    const dx = currentPoint.x - mi.startPoint.x;
    const dy = currentPoint.y - mi.startPoint.y;
    mi.itemIds.forEach((id) => { const item = getSelectionNode(id); const snap = mi.snapshots[id]; if (!item || !snap) return; item.x = snap.x + dx; item.y = snap.y + dy; });
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
    const dominant = Math.abs(hChange) >= Math.abs(vChange) ? hChange : vChange;
    const rawScale = 1 + dominant;
    const minScale = Math.max(minW / start.width, minH / start.height, 0.01);
    const availW = isEast ? canvasBounds.maxX - anchor.x : anchor.x - canvasBounds.minX;
    const availH = isSouth ? canvasBounds.maxY - anchor.y : anchor.y - canvasBounds.minY;
    const maxScale = Math.max(Math.min(availW / start.width, availH / start.height), 0.01);
    const scale = clamp(rawScale, Math.min(minScale, maxScale), maxScale);
    si.itemIds.forEach((id) => { const item = getSelectionNode(id); const snap = si.snapshots[id]; if (!item || !snap) return; item.x = anchor.x + (snap.x - anchor.x) * scale; item.y = anchor.y + (snap.y - anchor.y) * scale; item.scaleX = Math.max(snap.scaleX * scale, 0.01); item.scaleY = Math.max(snap.scaleY * scale, 0.01); });
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
      renderChartNode(member);
    });
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
    axisIds.forEach((axisId) => {
      dispatchRelationship({
        type: "update-axis",
        axisId,
        changes: { config: { scale: nextScale } },
      });
    });
    targets.forEach((member) => {
      const memberGuide = member.coordinateGuide;
      if (!memberGuide) return;
      if (memberGuide.type === "Cartesian" && ci.axis === "x") memberGuide.xScale = nextScale;
      else if (memberGuide.type === "Cartesian" && ci.axis === "y") memberGuide.yScale = nextScale;
      else if (memberGuide.type === "Polar" && ci.axis === "radius") memberGuide.radiusScale = nextScale;
      else if (memberGuide.type === "Polar" && ci.axis === "ring") memberGuide.ringScale = nextScale;
      renderChartNode(member);
    });
  }
  function updatePolarAngleInteraction(currentPoint: Point, pi: PolarAngleInteraction) {
    const node = findCanvasNode(pi.nodeId);
    const guide = node?.coordinateGuide;
    if (!node || guide?.type !== "Polar") return;
    const localPoint = toNodeLocalPoint(node, currentPoint);
    const angleSpan = polarAngleSpanFromPoint(guide.origin, localPoint);
    if (node.compositionSpec?.type === "concat") {
      node.compositionSpec.polarAngleSpan = angleSpan;
      const owner = findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "") ?? node;
      renderSharedCoordinateComposition(owner);
      return;
    }
    coordinateTargets(node.id, "angle").forEach((member) => {
      if (member.coordinateGuide?.type !== "Polar") return;
      member.coordinateGuide.angleSpan = angleSpan;
      renderChartNode(member);
    });
  }
  function finalizeMarqueeSelection(mi: MarqueeInteraction) {
    const bounds = normalizeBounds(mi.startPoint, mi.currentPoint);
    if (bounds.width < 3 && bounds.height < 3) { selectedIds.value = []; return; }
    const hitIds = getSelectionScopeNodes().filter((item) => {
      const b = collectNodeSelectionBounds(item);
      return b.minX >= bounds.minX && b.maxX <= bounds.maxX && b.minY >= bounds.minY && b.maxY <= bounds.maxY;
    }).map((item) => item.id);
    setSelection(hitIds);
  }
  function onWindowPointerUp() {
    const ai = interaction.value;
    if (ai?.type === "marquee") finalizeMarqueeSelection(ai);
    if (ai?.type === "rotate") rotationInputVisible.value = true;
    if (ai?.type === "polar-angle") polarAngleInputVisible.value = true;
    if (ai?.type === "move" && compositionDragSourceId.value && activeDropZone.value) {
      commitCompositionDrop(activeDropZone.value, compositionDragSourceId.value);
    }
    interaction.value = null;
    compositionDragSourceId.value = null;
    nestedEnterHover = null;
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
      if (!ai.historyCommitted && (Math.abs(movePoint.x - ai.startPoint.x) > 0.1 || Math.abs(movePoint.y - ai.startPoint.y) > 0.1)) { pushCanvasHistory(); ai.historyCommitted = true; }
      updateMoveInteraction(movePoint, ai);
      activeDropZone.value = compositionDragSourceId.value
        ? compositionDropZoneAtPoint(movePoint, compositionDragSourceId.value)
        : null;
      const dropZone = activeDropZone.value;
      if (dropZone?.type === "nested" && dropZone.nestedAction === "enter") {
        const key = `${dropZone.targetNodeId}:${dropZone.targetElementId ?? "item"}`;
        if (nestedEnterHover?.key !== key) {
          nestedEnterHover = { key, startedAt: Date.now() };
        } else if (Date.now() - nestedEnterHover.startedAt >= 450) {
          enterNestedDropLevel(dropZone);
          nestedEnterHover = null;
          activeDropZone.value = compositionDropZoneAtPoint(movePoint, compositionDragSourceId.value);
        }
      } else {
        nestedEnterHover = null;
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
        setImportNotice(zone.type === "chart-body"
          ? `No supported use of ${csvPayload.field} was found for this chart.`
          : zone.type === "series-item"
            ? `${csvPayload.field} is not compatible with the current ${zone.label} mode.`
            : "That column type is not supported by this coordinate axis.");
        return;
      }
      const target = findCanvasNode(zone.targetNodeId);
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
      setChartEncoding(chartChannel, csvPayload.field);
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
    const zone = activeDropZone.value;
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
      draggedCandidateId.value = null;
      return;
    }
    const created = await createCanvasItem(candidate, point);
    const createdNode = created?.[0];
    const createdTemplate = normalizeChartTemplate(createdNode?.chartSpec?.chartType ?? "");
    if (createdNode?.chartSpec && (createdTemplate === "pie" || createdTemplate === "donut")) {
      axisBindingTarget.value = {
        nodeId: createdNode.id,
        channel: "y",
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
  watch(datasets, () => {
    const selectedCompositionGroup = walkCanvasNodes().find((node): node is CanvasGroupNode =>
      node.kind === "group"
      && selectedIds.value.includes(node.id)
      && (
        node.compositionSpec?.type === "facet"
        || node.compositionSpec?.type === "concat"
        || (node.compositionSpec?.type === "layer" && !!node.layerSpec)
      ),
    );
    const migratedNodes = migrateIndependentViewGroups(canvasNodes.value);
    if (migratedNodes.length !== canvasNodes.value.length || migratedNodes.some((node, index) => node !== canvasNodes.value[index])) {
      const selectedMemberId = selectedCompositionGroup?.compositionSpec?.members[0]?.nodeId;
      canvasNodes.value = migratedNodes;
      setSelection(selectedMemberId ? [selectedMemberId] : []);
    }
    walkCanvasNodes().forEach((node) => {
      node.coordinateSystem = node.coordinateSystem ?? standaloneCoordinateSystem(node);
      registerChartRelationship(node);
      if (node.llmRenderer?.status === "ready") return;
      renderChartNode(node);
      renderSemanticNode(node);
      registerChartRelationship(node);
    });
    if (!restoredCanvas && datasets.value.length > 0) {
      restoredCanvas = true;
      try {
        const raw = localStorage.getItem("cv-author-canvas-v1");
        if (raw) {
          const saved = JSON.parse(raw) as { nodes?: CanvasNode[]; relationships?: ChartRelationshipState };
          if (Array.isArray(saved.nodes)) {
            canvasNodes.value = migrateIndependentViewGroups(saved.nodes
              .filter((node) => node.id !== "llm-demo-node" && node.chartSpec?.datasetId !== "dataset:llm-demo")
              .map((node) => cloneCanvasNode(node)));
            if (saved.relationships?.version === 1) restoreRelationships(saved.relationships);
            else dispatchRelationship({ type: "clear" });
            walkCanvasNodes().forEach((node) => {
              node.coordinateSystem = node.coordinateSystem ?? standaloneCoordinateSystem(node);
              registerChartRelationship(node);
              if (node.llmRenderer?.status === "ready") return;
              renderChartNode(node);
              renderSemanticNode(node);
              registerChartRelationship(node);
            });
            reconcileRelationshipNodes(canvasNodes.value);
          }
        }
      } catch { /* ignore malformed saved projects */ }
    }
  }, { deep: true, immediate: true });
  let nestedLayoutScheduled = false;
  function scheduleNestedChildLayout() {
    if (nestedLayoutScheduled || Object.keys(chartRelationships.value.nestedRelationships).length === 0) return;
    nestedLayoutScheduled = true;
    void nextTick(() => {
      nestedLayoutScheduled = false;
      Object.values(chartRelationships.value.nestedRelationships).forEach((relationship) => {
        if (relationship.status !== "active" || relationship.relationType !== "relative-position") return;
        const parent = findCanvasNode(relationship.parentChartId);
        const child = findCanvasNode(relationship.childChartId);
        if (!parent || !child) return;
        const parentElement = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
          .find((element) => element.dataset.nodeId === parent.id);
        if (!parentElement) return;
        const marks = Array.from(parentElement.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"));
        const groupMarks = relationship.parentMarkGroupId
          ? marks.filter((element) => element.getAttribute("data-mark-group-id") === relationship.parentMarkGroupId)
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
        const scopeGroupId = parentGroupIdForNode(child.id) ?? null;
        const bounds = semanticSelectionBounds(targetMarks, scopeGroupId);
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
  watch(chartRelationships, projectRelationshipStateToCanvas, { deep: true });
  watch([canvasNodes, chartRelationships], scheduleNestedChildLayout, { deep: true });
  watch([canvasNodes, chartRelationships], ([nodes]) => {
    try { localStorage.setItem("cv-author-canvas-v1", JSON.stringify({ version: 2, nodes, relationships: snapshotRelationships(false) })); } catch { /* storage is optional */ }
  }, { deep: true });
  onBeforeUnmount(() => {
    detachPointerListeners();
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
    selectionBounds,
    selectionFrame,
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
    onCanvasNodeDoubleClick,
    enterSelection,
    configureSelectionComposition,
    removeSelectionComposition,
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
    bindMarkField,
    bindAxisField: bindMarkField,
    setAxisBindingAggregation,
    setValueFilters,
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
