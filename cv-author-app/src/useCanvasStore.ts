import {
  ref,
  computed,
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
  ChartEncoding,
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
  ChartRelationshipState,
  DataColumnType,
  MarkGroupSharedConfig,
  Dataset,
} from "./types";
import { useDatasetStore } from "./useDatasetStore";
import { useChartRelationshipStore } from "./useChartRelationshipStore";
import { scoreSeriesCandidates } from "./seriesInference";
import {
  extractChartStyleTokens,
  isLineChartType,
  renderLineChart,
} from "./lineRenderer";
import {
  candidates,
  loadSvgTemplate,
  parseSvgTemplate,
  scopeSvgContent,
} from "./svgUtils";
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
} from "./canvasUtils";
import { chartScalePosition, renderDeterministicChart, renderLayerChart, renderNestedPie } from "./semanticRenderer";
import { getChartTemplateContract, normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";
import { inferChartStructure } from "./dimensionInference";
import {
  endCubeBindingDrag,
  getActiveCubeBinding,
  readCubeBinding,
  type CubeBindingPayload,
} from "./cubeBinding";
import { polarAngleSpanFromPoint } from "./PolarCoordinateSystem";
import { createCartesianAxisModel } from "./CartesianCoordinateSystem";

const historyLimit = 50;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

const implementedTemplateSvgs = {
  LineGraph: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 180"><g stroke="#94a3b8" stroke-width="1" stroke-dasharray="2 4" opacity=".28"><line x1="28" y1="42" x2="352" y2="42"/><line x1="28" y1="86" x2="352" y2="86"/><line x1="28" y1="130" x2="352" y2="130"/></g><g fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M30 118L80 97L130 107L182 62L234 77L284 36L350 52" stroke="#2563eb"/><path d="M30 137L80 122L130 83L182 99L234 52L284 68L350 80" stroke="#e11d48"/><path d="M30 101L80 112L130 72L182 83L234 37L284 49L350 35" stroke="#059669"/></g></svg>`,
  Scatterplot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g fill="#2563eb" fill-opacity=".86" stroke="#fff" stroke-width="2"><circle cx="68" cy="121" r="7"/><circle cx="92" cy="98" r="6"/><circle cx="126" cy="112" r="8"/><circle cx="152" cy="76" r="7"/><circle cx="185" cy="91" r="6"/><circle cx="214" cy="54" r="8"/><circle cx="247" cy="68" r="7"/><circle cx="278" cy="37" r="6"/></g></svg>`,
  PieChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(160 90)"><path d="M0 0V-70A70 70 0 0 1 66.6 21.6Z" fill="#2563eb"/><path d="M0 0L66.6 21.6A70 70 0 0 1 -21.6 66.6Z" fill="#059669"/><path d="M0 0L-21.6 66.6A70 70 0 0 1 -56.6 -41.1Z" fill="#d97706"/><path d="M0 0L-56.6 -41.1A70 70 0 0 1 0 -70Z" fill="#dc2626"/></g></svg>`,
  DonutChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(160 90) rotate(-90)"><circle r="56" fill="none" stroke="#e2e8f0" stroke-width="28"/><circle r="56" fill="none" stroke="#2563eb" stroke-width="28" stroke-dasharray="132 352"/><circle r="56" fill="none" stroke="#059669" stroke-width="28" stroke-dasharray="91 352" stroke-dashoffset="-132"/><circle r="56" fill="none" stroke="#d97706" stroke-width="28" stroke-dasharray="76 352" stroke-dashoffset="-223"/><circle r="56" fill="none" stroke="#dc2626" stroke-width="28" stroke-dasharray="53 352" stroke-dashoffset="-299"/></g></svg>`,
  MatrixDiagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g transform="translate(68 20)" stroke="#fff" stroke-width="3"><rect x="0" y="0" width="46" height="34" fill="#dbeafe"/><rect x="46" y="0" width="46" height="34" fill="#93c5fd"/><rect x="92" y="0" width="46" height="34" fill="#2563eb"/><rect x="138" y="0" width="46" height="34" fill="#bfdbfe"/><rect x="0" y="34" width="46" height="34" fill="#60a5fa"/><rect x="46" y="34" width="46" height="34" fill="#dbeafe"/><rect x="92" y="34" width="46" height="34" fill="#1d4ed8"/><rect x="138" y="34" width="46" height="34" fill="#93c5fd"/><rect x="0" y="68" width="46" height="34" fill="#bfdbfe"/><rect x="46" y="68" width="46" height="34" fill="#3b82f6"/><rect x="92" y="68" width="46" height="34" fill="#dbeafe"/><rect x="138" y="68" width="46" height="34" fill="#60a5fa"/><rect x="0" y="102" width="46" height="34" fill="#1d4ed8"/><rect x="46" y="102" width="46" height="34" fill="#93c5fd"/><rect x="92" y="102" width="46" height="34" fill="#60a5fa"/><rect x="138" y="102" width="46" height="34" fill="#dbeafe"/></g></svg>`,
  SingleBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g fill="#2563eb"><rect x="42" y="92" width="36" height="58"/><rect x="96" y="56" width="36" height="94"/><rect x="150" y="76" width="36" height="74"/><rect x="204" y="32" width="36" height="118"/><rect x="258" y="67" width="36" height="83"/></g></svg>`,
  GroupedBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g><g fill="#2563eb"><rect x="34" y="78" width="17" height="72"/><rect x="98" y="48" width="17" height="102"/><rect x="162" y="64" width="17" height="86"/><rect x="226" y="35" width="17" height="115"/></g><g fill="#059669"><rect x="53" y="102" width="17" height="48"/><rect x="117" y="76" width="17" height="74"/><rect x="181" y="91" width="17" height="59"/><rect x="245" y="60" width="17" height="90"/></g></g></svg>`,
  StackedBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><g><g fill="#2563eb"><rect x="42" y="102" width="38" height="48"/><rect x="106" y="84" width="38" height="66"/><rect x="170" y="93" width="38" height="57"/><rect x="234" y="70" width="38" height="80"/></g><g fill="#059669"><rect x="42" y="73" width="38" height="29"/><rect x="106" y="48" width="38" height="36"/><rect x="170" y="61" width="38" height="32"/><rect x="234" y="29" width="38" height="41"/></g></g></svg>`,
  DivergentBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><line x1="24" y1="90" x2="300" y2="90" stroke="#94a3b8"/><g fill="#2563eb"><rect x="40" y="46" width="32" height="44"/><rect x="104" y="90" width="32" height="35"/><rect x="168" y="29" width="32" height="61"/><rect x="232" y="90" width="32" height="52"/></g></svg>`,
  DivergentStackedBarChart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><line x1="24" y1="90" x2="300" y2="90" stroke="#94a3b8"/><g><g fill="#2563eb"><rect x="40" y="54" width="32" height="36"/><rect x="104" y="90" width="32" height="29"/><rect x="168" y="39" width="32" height="51"/><rect x="232" y="90" width="32" height="38"/></g><g fill="#059669"><rect x="40" y="35" width="32" height="19"/><rect x="104" y="119" width="32" height="21"/><rect x="168" y="24" width="32" height="15"/><rect x="232" y="128" width="32" height="18"/></g></g></svg>`,
} as const;

const implementedTemplateDefinitions: SvgCandidate[] = [
  { id: "builtin-template:line", name: "Line Chart", chartType: "LineGraph", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.LineGraph, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.LineGraph)}` },
  { id: "builtin-template:scatter", name: "Scatterplot", chartType: "Scatterplot", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.Scatterplot, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.Scatterplot)}` },
  { id: "builtin-template:pie", name: "Pie Chart", chartType: "PieChart", coordinateSystem: "Polar", svgMarkup: implementedTemplateSvgs.PieChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.PieChart)}` },
  { id: "builtin-template:donut", name: "Donut", chartType: "DonutChart", coordinateSystem: "Polar", svgMarkup: implementedTemplateSvgs.DonutChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.DonutChart)}` },
  { id: "builtin-template:matrix", name: "Matrix", chartType: "MatrixDiagram", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.MatrixDiagram, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.MatrixDiagram)}` },
  { id: "builtin-template:single-bar", name: "Single Bar", chartType: "SingleBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.SingleBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.SingleBarChart)}` },
  { id: "builtin-template:grouped-bar", name: "Grouped Bar", chartType: "GroupedBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.GroupedBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.GroupedBarChart)}` },
  { id: "builtin-template:stacked-bar", name: "Stacked Bar", chartType: "StackedBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.StackedBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.StackedBarChart)}` },
  { id: "builtin-template:divergent-bar", name: "Divergent Bar", chartType: "DivergentBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.DivergentBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.DivergentBarChart)}` },
  { id: "builtin-template:divergent-stacked-bar", name: "Divergent Stacked Bar", chartType: "DivergentStackedBarChart", coordinateSystem: "Cartesian", svgMarkup: implementedTemplateSvgs.DivergentStackedBarChart, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(implementedTemplateSvgs.DivergentStackedBarChart)}` },
];

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
  { value: "None", label: "None", icon: "none" },
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
    case "none":
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
  const rotationInputVisible = ref(false);
  const undoStack = ref<CanvasHistorySnapshot[]>([]);
  const redoStack = ref<CanvasHistorySnapshot[]>([]);
  const clipboardNodes = ref<CanvasNode[]>([]);
  const interaction = ref<Interaction | null>(null);
  const contextMenu = ref<ContextMenuState | null>(null);
  const draggedCandidateId = ref<string | null>(null);
  const activeDropZone = ref<ChartDropZone | null>(null);
  const activeDataBindingDropZone = ref<DataBindingDropZone | null>(null);
  const nestedBindingTarget = ref<NestedBindingTarget | null>(null);
  const loadingDrop = ref(false);
  const importNotice = ref<string | null>(null);
  const axisBindingTarget = ref<AxisBindingTarget | null>(null);
  const semanticSelection = ref<SemanticSelection | null>(null);
  const activeNestedRelationshipId = ref<string | null>(null);
  let restoredCanvas = false;
  let importNoticeTimer: number | null = null;
  let clipboardPasteCount = 0;
  let nestedRelationshipBaseSnapshot: ChartRelationshipState | null = null;

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
    const ownerNodeId = sharedAxisIds.length > 0
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
        if (xAxis) {
          node.coordinateGuide.origin = { ...xAxis.config.origin };
          node.coordinateGuide.xDirection = xAxis.config.direction;
          node.coordinateGuide.xScale = xAxis.config.scale;
        }
        if (yAxis) {
          node.coordinateGuide.yDirection = yAxis.config.direction;
          node.coordinateGuide.yScale = yAxis.config.scale;
        }
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
  function coordinateTargets(nodeId: string, channel: CoordinateChannel) {
    const source = findCanvasNode(nodeId);
    if (!source) return [];
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
      if (node.kind !== "group") return [node];
      const sourceComposition = node.compositionSpec;
      const type = sourceComposition?.type;
      const isLayer = type === "layer" && node.children.length > 0;
      if (!sourceComposition || (type !== "facet" && type !== "concat" && !isLayer)) {
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
  function getSelectionNode(nodeId: string) {
    return getSelectionScopeNodes().find((node) => node.id === nodeId) ?? null;
  }
  function coordinateTransformItemIds(itemIds: string[]) {
    const expanded = new Set<string>();
    itemIds.forEach((id) => {
      const node = getSelectionNode(id);
      if (node?.compositionSpec?.type !== "layer" || !node.coordinateSystem) {
        if (node) expanded.add(id);
        return;
      }
      node.coordinateSystem.members.forEach((member) => {
        if (getSelectionNode(member.nodeId)) expanded.add(member.nodeId);
      });
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
  function toSelectionScopePoint(clientX: number, clientY: number, groupId = editingGroupPath.value.at(-1)) {
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
  function getCanvasBounds(): Bounds {
    const rect = canvasRef.value?.getBoundingClientRect();
    const zoom = Math.max(viewZoom.value, 0.0001);
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;
    const minX = -viewPan.value.x / zoom;
    const minY = -viewPan.value.y / zoom;
    const maxX = (width - viewPan.value.x) / zoom;
    const maxY = (height - viewPan.value.y) / zoom;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
  function getSelectionScopeBounds(): Bounds {
    const group = getGroupAtPath();
    return group
      ? { minX: 0, minY: 0, maxX: group.width, maxY: group.height, width: group.width, height: group.height }
      : getCanvasBounds();
  }
  function toCanvasPoint(clientX: number, clientY: number): Point {
    const rect = canvasRef.value?.getBoundingClientRect();
    const screenX = clientX - (rect?.left ?? 0);
    const screenY = clientY - (rect?.top ?? 0);
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
  function getCandidate(candidateId: string) {
    return implementedTemplateDefinitions.find((c) => c.id === candidateId)
      ?? generatedCandidates.value.find((c) => c.id === candidateId)
      ?? candidates.find((c) => c.id === candidateId);
  }
  function mappedEncodingChannel(node: CanvasNode, channel: EncodingChannel): ChartEncodingChannel {
    const template = normalizeChartTemplate(node.chartSpec?.chartType ?? "");
    if (template === "pie" || template === "donut") return channel === "x" ? "color" : "angle";
    if (template === "matrix") return channel === "x" ? "column" : "row";
    return channel;
  }

  function rowMatchesChartFilters(row: Dataset["rows"][number], spec: ChartSpec) {
    if (!Object.entries(spec.filters ?? {}).every(([field, value]) => row[field] === value)) return false;
    return Object.entries(spec.valueFilters ?? {}).every(([field, values]) => values.includes(row[field] ?? ""));
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
  const selectionScopeBounds = computed<Bounds | null>(() =>
    computeSelectionBounds(getSelectionScopeNodes(), selectedIds.value),
  );
  const selectionBounds = computed<Bounds | null>(() => selectionScopeBounds.value);
  const selectionFrame = computed(() => {
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
  const canCompose = computed(() => selectedNodes.value.length > 1 || !!semanticSelection.value?.rowKey);
  const canFacet = computed(() => selectedNodes.value.length > 0);
  const canUngroup = computed(() => selectedNodes.value.some(
    (node) => node.kind === "group" || !!node.renderedContent,
  ));
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
    canvasNodes.value = migrateIndependentViewGroups(snapshot.nodes.map((n) => cloneCanvasNode(n)));
    if (snapshot.relationships) restoreRelationships(snapshot.relationships);
    else {
      dispatchRelationship({ type: "clear" });
      reconcileRelationshipNodes(canvasNodes.value);
    }
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
  function normalizeSelection(ids: string[]) {
    const normalized = new Set<string>();
    const nodes = getSelectionScopeNodes();
    ids.forEach((id) => { if (nodes.some((node) => node.id === id)) normalized.add(id); });
    return nodes.filter((n) => normalized.has(n.id)).map((n) => n.id);
  }
  function setSelection(ids: string[]) {
    selectedIds.value = normalizeSelection(ids);
    if (selectedIds.value.length === 0) rotationInputVisible.value = false;
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

  function onSemanticMarkPointerDown(node: CanvasNode, event: PointerEvent) {
    const target = event.target instanceof Element ? event.target.closest("[data-mark-role]") : null;
    if (!(target instanceof Element)) return;
    const role = target.getAttribute("data-mark-role") ?? "";
    const markGroupId = target.getAttribute("data-mark-group-id") ?? undefined;
    const seriesKey = target.getAttribute("data-series-key") ?? undefined;
    const rowTarget = target.hasAttribute("data-row-key") ? target : target.closest("[data-row-key]");
    const rowKey = rowTarget?.getAttribute("data-row-key") ?? undefined;
    const dataset = node.layerSpec ? getDataset(node.layerSpec.datasetId) : node.chartSpec?.datasetId ? getDataset(node.chartSpec.datasetId) : activeDataset.value;
    const row = dataset?.rows.find((item) => (dataset.primaryKey ?? []).map((field) => item[field] ?? "").join("|") === rowKey);
    semanticSelection.value = { nodeId: node.id, role, markGroupId, seriesKey, rowKey, person: row?.person, time: row?.time };
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
    else setSelection([node.id]);
    event.preventDefault();
    event.stopPropagation();
  }

  function updateNodeMarkGroupConfig(node: CanvasNode, patch: MarkGroupSharedConfig, requestedRole?: string) {
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
      pushCanvasHistory();
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

    pushCanvasHistory();
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
    updateNodeMarkGroupConfig(node, patch);
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

  function applyDimensionChartUpgrade(fieldName: string) {
    const node = axisBindingNode.value ?? selectedNodes.value[0];
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const column = dataset?.columns.find((item) => item.name === fieldName);
    if (!node?.chartSpec || !column) return false;
    const targets = dimensionDecisionTargets(node);
    const supported = targets.filter((member) => {
      const template = normalizeChartTemplate(member.chartSpec?.chartType ?? "");
      return template === "line"
        || template === "scatter"
        || template === "bar"
        || template === "pie"
        || template === "donut";
    });
    if (supported.length === 0) return false;
    pushCanvasHistory();
    supported.forEach((member) => {
      if (!member.chartSpec) return;
      const template = normalizeChartTemplate(member.chartSpec.chartType);
      member.llmRenderer = null;
      if (template === "line") {
        const seriesEncoding = { field: column.name, type: "nominal" as const };
        const valueFilters = { ...member.chartSpec.valueFilters };
        delete valueFilters[column.name];
        member.chartSpec = {
          ...member.chartSpec,
          series: member.chartSpec.series ?? seriesEncoding,
          seriesFields: Array.from(new Map([
            ...(member.chartSpec.seriesFields ?? (member.chartSpec.series ? [member.chartSpec.series] : [])),
            seriesEncoding,
          ].map((encoding) => [encoding.field, encoding])).values()),
          valueFilters: Object.keys(valueFilters).length > 0 ? valueFilters : undefined,
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "series" },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
      } else if (template === "scatter") {
        member.chartSpec = {
          ...member.chartSpec,
          encodings: {
            ...member.chartSpec.encodings,
            color: { field: column.name, type: column.type },
          },
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "series" },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
      } else if (template === "bar") {
        const currentVariant = normalizeBarChartVariant(member.chartSpec.chartType) ?? "single";
        const upgradedType = currentVariant === "divergent"
          ? "DivergentStackedBarChart"
          : currentVariant === "single"
            ? "GroupedBarChart"
            : member.chartSpec.chartType;
        const valueFilters = { ...member.chartSpec.valueFilters };
        delete valueFilters[column.name];
        member.chartSpec = {
          ...member.chartSpec,
          chartType: upgradedType,
          encodings: {
            ...member.chartSpec.encodings,
            color: { field: column.name, type: column.type },
          },
          valueFilters: Object.keys(valueFilters).length > 0 ? valueFilters : undefined,
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "series" },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
      } else if (template === "donut") {
        member.chartSpec = {
          ...member.chartSpec,
          encodings: {
            ...member.chartSpec.encodings,
            ring: { field: column.name, type: column.type },
          },
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "series" },
          dimensionRecommendations: undefined,
          renderer: undefined,
        };
      } else {
        member.chartSpec = {
          ...member.chartSpec,
          flattenFields: Array.from(new Set([...(member.chartSpec.flattenFields ?? []), fieldName])),
          dimensionDecisions: { ...member.chartSpec.dimensionDecisions, [fieldName]: "flatten" },
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

  function applyDimensionRecommendation(recommendationId: string) {
    const node = axisBindingNode.value ?? selectedNodes.value[0];
    const recommendation = node?.chartSpec?.dimensionRecommendations?.find((item) => item.id === recommendationId);
    const dataset = node?.chartSpec ? getDataset(node.chartSpec.datasetId) : null;
    const column = dataset?.columns.find((item) => item.name === recommendation?.field);
    if (!node?.chartSpec || !recommendation || !dataset) return;
    if (recommendation.strategy === "flatten" && normalizeChartTemplate(node.chartSpec.chartType) === "pie") {
      const flattenFields = (recommendation.flattenFields ?? [recommendation.field])
        .filter((field) => dataset.columns.some((item) => item.name === field));
      if (flattenFields.length === 0) return;
      pushCanvasHistory();
      coordinateTargets(node.id, "angle").forEach((member) => {
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
        renderChartNode(member);
      });
      setImportNotice(`Flatten by [${flattenFields.join(", ")}] applied.`);
      return;
    }
    if (recommendation.strategy === "series" || recommendation.strategy === "flatten") {
      if (!column) return;
      pushCanvasHistory();
      node.chartSpec = {
        ...node.chartSpec,
        series: { field: column.name, type: column.type },
        dimensionDecisions: {
          ...node.chartSpec.dimensionDecisions,
          [column.name]: recommendation.strategy,
        },
      };
      renderChartNode(node);
      setImportNotice(`${recommendation.valueCount} ${column.name} lines are shown in one view.`);
      return;
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
    let appliedRecommendation = recommendation;
    if (recommendation.strategy === "facet"
      && node.compositionSpec?.type === "facet"
      && node.compositionSpec.facetField
      && node.compositionSpec.facetField !== recommendation.field) {
      const columnValues = Array.from(new Set(dataset.rows
        .map((row) => row[recommendation.field] ?? "")
        .filter(Boolean)));
      appliedRecommendation = {
        ...recommendation,
        facetGrid: {
          rowField: node.compositionSpec.facetField,
          columnField: recommendation.field,
          rowValues: [...(node.compositionSpec.facetValues ?? [])],
          columnValues,
        },
      };
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
      ? recommendation.facetGrid
        ? `${recommendation.facetGrid.rowValues.length} × ${recommendation.facetGrid.columnValues.length} facet grid created.`
        : `${recommendation.strategy === "facet" ? "Facet" : "Nested"} created from ${column?.name ?? recommendation.field}.`
      : "The selected recommendation cannot be applied in the current editing scope.");
  }

  function createLayer(recordHistory = true) {
    const nodes = selectedNodes.value.filter((node) => node.chartSpec && node.coordinateGuide);
    if (nodes.length < 2) return false;
    const contracts = nodes.map((node) => getChartTemplateContract(node.chartSpec!.chartType));
    if (contracts.some((contract) => !contract)) return false;
    const coordinateType = contracts[0]!.coordinateSystem;
    if (coordinateType === "None" || !nodes.every((node) => node.coordinateGuide?.type === coordinateType)) return false;
    const sharedChannels = contracts[0]!.shareableChannels.filter((channel) =>
      contracts.every((contract) => contract!.shareableChannels.includes(channel)),
    );
    if (sharedChannels.length === 0) return false;
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

    const owner = [...nodes].sort((left, right) => {
      const score = (node: CanvasNode) => sharedChannels.reduce(
        (count, channel) => count + (node.chartSpec?.encodings[channel] ? 1 : 0),
        0,
      );
      return score(right) - score(left);
    })[0]!;
    const sharedEncodings = new Map<CoordinateChannel, ChartEncoding>();
    for (const channel of sharedChannels) {
      const encoding = owner.chartSpec!.encodings[channel]
        ?? nodes.map((node) => node.chartSpec!.encodings[channel]).find((item): item is ChartEncoding => !!item);
      if (encoding) sharedEncodings.set(channel, { ...encoding });
    }
    const layerNodes = [owner, ...nodes.filter((node) => node.id !== owner.id)];
    const layerId = crypto.randomUUID();
    const system: CoordinateSystemSpec = {
      id: `coordinate:${layerId}`,
      type: coordinateType,
      ownerNodeId: owner.id,
      sharedChannels,
      members: layerNodes.map((node) => ({ nodeId: node.id, channels: [...sharedChannels] })),
    };
    const compositionSpec: NonNullable<CanvasNode["compositionSpec"]> = {
      id: `composition:${layerId}`,
      type: "layer",
      sharedChannels,
      members: layerNodes.map((node) => ({
        nodeId: node.id,
        sourceNodeId: node.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels: [...sharedChannels],
      })),
    };
    if (recordHistory) pushCanvasHistory();
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
      node.chartSpec = {
        ...node.chartSpec!,
        encodings: {
          ...node.chartSpec!.encodings,
          ...Object.fromEntries(Array.from(sharedEncodings, ([channel, encoding]) => [channel, { ...encoding }])),
        },
      };
    });
    layerNodes.forEach(renderChartNode);
    replaceSelectionScopeNodes([
      ...getSelectionScopeNodes().filter((node) => !selectedIds.value.includes(node.id)),
      ...layerNodes,
    ]);
    reconcileCoordinateSystems();
    setSelection([owner.id]);
    axisBindingTarget.value = null;
    return true;
  }

  function createStructuralComposition(type: "concat" | "facet" | "nested", recordHistory = true, requestedChannels?: CoordinateChannel[], concatDirection?: "horizontal" | "vertical", concatPosition?: "before" | "after") {
    const sourceNodes = [...selectedNodes.value];
    const bounds = selectionBounds.value;
    if (!bounds || sourceNodes.length === 0 || (type === "concat" && sourceNodes.length < 2)) return false;
    const compositionId = crypto.randomUUID();
    const gap = Math.max(24, Math.min(bounds.width, bounds.height) * 0.08);
    if (recordHistory) pushCanvasHistory();
    let children: CanvasNode[] = [];
    let facetField: string | undefined;
    let facetValues: string[] | undefined;
    let facetGrid: NonNullable<CanvasNode["compositionSpec"]>["facetGrid"];
    if (type !== "concat") {
      const source = sourceNodes[0]!;
      const recommendation = source.chartSpec?.dimensionRecommendations?.find((item) => item.strategy === "facet");
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
            clone.x = baseX + columnIndex * (source.width * source.scaleX + gap);
            clone.y = baseY + rowIndex * (source.height * source.scaleY + gap);
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
            return clone;
          }),
        );
      } else {
        facetField = recommendation?.field;
        facetValues = facetField && dataset
          ? Array.from(new Set(dataset.rows.map((row) => row[facetField!] ?? "").filter(Boolean)))
          : ["1", "2", "3"];
        const columns = Math.max(1, Math.ceil(Math.sqrt(facetValues.length)));
        children = facetValues.map((value, index) => {
          const clone = cloneCanvasNodeForPaste(source);
          const baseX = type === "facet" ? bounds.minX : 0;
          const baseY = type === "facet" ? bounds.minY : 0;
          clone.x = baseX + (index % columns) * (source.width * source.scaleX + gap);
          clone.y = baseY + Math.floor(index / columns) * (source.height * source.scaleY + gap);
          if (clone.chartSpec && facetField) clone.chartSpec = { ...clone.chartSpec, filters: { ...clone.chartSpec.filters, [facetField]: value } };
          renderChartNode(clone);
          return clone;
        });
      }
    } else {
      const direction = concatDirection ?? "horizontal";
      let cursor = 0;
      const orderedNodes = concatPosition === "before" && sourceNodes.length > 1
        ? [sourceNodes[1]!, sourceNodes[0]!, ...sourceNodes.slice(2)]
        : sourceNodes;
      children = orderedNodes.map((node) => {
        if (direction === "vertical") {
          node.x = bounds.minX;
          node.y = bounds.minY + cursor;
          cursor += node.height * node.scaleY + gap;
        } else {
          node.x = bounds.minX + cursor;
          node.y = bounds.minY;
          cursor += node.width * node.scaleX + gap;
        }
        return node;
      });
    }
    const childBounds = getCanvasNodeListBounds(children);
    if (!childBounds) return false;
    const sharedChannels: CoordinateChannel[] = type === "facet"
      ? []
      : type === "concat"
      ? requestedChannels ?? ["y"]
      : [...(getChartTemplateContract(children[0]?.chartSpec?.chartType ?? "")?.shareableChannels ?? [])];
    const coordinateSystem: CoordinateSystemSpec | null = sharedChannels.length > 0 ? {
      id: `coordinate:${compositionId}`,
      type: children[0]?.coordinateGuide?.type ?? "None",
      ownerNodeId: type === "nested" ? compositionId : children[0]!.id,
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
      id: `composition:${compositionId}`,
      type,
      direction: type === "concat" ? (concatDirection ?? "horizontal") : undefined,
      sharedChannels,
      facetField,
      facetValues,
      facetGrid,
      members: children.map((node, index) => ({
        nodeId: node.id,
        sourceNodeId: type !== "concat" ? sourceNodes[0]!.id : node.id,
        chartType: node.chartSpec?.chartType,
        sharedChannels,
      })),
    };
    if (type !== "nested") {
      children.forEach((node) => { node.compositionSpec = compositionSpec; });
      replaceSelectionScopeNodes([
        ...getSelectionScopeNodes().filter((node) => !selectedIds.value.includes(node.id)),
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

  function executeComposition(type: "layer" | "concat" | "facet", recordHistory = true, requestedChannels?: CoordinateChannel[], concatDirection?: "horizontal" | "vertical", concatPosition?: "before" | "after") {
    const created = type === "layer"
      ? createLayer(recordHistory)
      : createStructuralComposition(type, recordHistory, requestedChannels, concatDirection, concatPosition);
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
    const preferred = ["water_kg", "fat_kg", "muscle_kg", "minerals_kg"];
    if (preferred.every((field) => dataset.columns.some((column) => column.name === field && column.type === "quantitative"))) {
      return preferred;
    }
    const occupied = new Set([
      node.chartSpec?.encodings.x?.field,
      node.chartSpec?.encodings.y?.field,
      node.chartSpec?.series?.field,
    ].filter((field): field is string => !!field));
    return dataset.columns
      .filter((column) => column.type === "quantitative" && !occupied.has(column.name))
      .map((column) => column.name)
      .slice(0, 4);
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
    const pointGroupMemberKeys = groupRows.map((row, index) => {
      const primaryKey = (dataset.primaryKey ?? []).map((field) => row[field] ?? "").join("|");
      return primaryKey || String(index);
    });
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
    return rows.map((row, index) => {
      const center = toWorld(xPosition(row[xEncoding.field] ?? ""), yPosition(row[yEncoding.field] ?? ""));
      const rowKey = (dataset.primaryKey ?? []).map((field) => row[field] ?? "").join("|") || String(index);
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
  }
  function reverseCoordinateAxis(target: CanvasNode, axis: "x" | "y") {
    const node = findCanvasNode(target.id);
    if (node?.coordinateGuide?.type !== "Cartesian") return;
    pushCanvasHistory();
    const binding = bindingForChartChannel(node.id, axis);
    const relationshipAxis = binding ? chartRelationships.value.axes[binding.axisId] : null;
    if (relationshipAxis) {
      dispatchRelationship({
        type: "update-axis",
        axisId: relationshipAxis.id,
        changes: { config: { direction: relationshipAxis.config.direction === 1 ? -1 : 1 } },
      });
    }
    coordinateTargets(node.id, axis).forEach((member) => {
      if (member.coordinateGuide?.type !== "Cartesian") return;
      member.llmRenderer = null;
      if (axis === "x") member.coordinateGuide.xDirection = member.coordinateGuide.xDirection === 1 ? -1 : 1;
      else member.coordinateGuide.yDirection = member.coordinateGuide.yDirection === 1 ? -1 : 1;
      renderChartNode(member);
    });
  }
  function onCoordinateAxisSelect(target: CanvasNode, channel: EncodingChannel) {
    const node = findCanvasNode(target.id);
    if (!node || node.coordinateGuide?.type !== "Cartesian") return;
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
  function closeAxisBinding() {
    axisBindingTarget.value = null;
  }
  function bindAxisField(fieldName: string, aggregation?: "sum" | "avg") {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!target || !node || !dataset) return;
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return;
    const candidateId = node.kind === "leaf" ? node.candidateId : "";
    const mappedChannel = mappedEncodingChannel(node, target.channel);
    pushCanvasHistory();
    coordinateTargets(node.id, target.channel).forEach((member) => {
      member.llmRenderer = null;
      const memberCandidateId = member.kind === "leaf" ? member.candidateId : candidateId;
      const series = member.chartSpec?.series?.field === column.name ? undefined : member.chartSpec?.series;
      const aggregations = { ...member.chartSpec?.aggregations };
      if (aggregation && column.type === "quantitative") {
        aggregations[target.channel] = aggregation;
        aggregations[mappedEncodingChannel(member, target.channel)] = aggregation;
      } else {
        delete aggregations[target.channel];
        delete aggregations[mappedEncodingChannel(member, target.channel)];
      }
      member.chartSpec = {
        ...member.chartSpec,
        chartType: member.chartSpec?.chartType ?? getCandidate(memberCandidateId)?.chartType ?? member.name,
        datasetId: dataset.id,
        encodings: {
          ...member.chartSpec?.encodings,
          [target.channel]: { field: column.name, type: column.type },
          [mappedEncodingChannel(member, target.channel)]: { field: column.name, type: column.type },
        },
        aggregations: Object.keys(aggregations).length > 0 ? aggregations : undefined,
        series,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
      renderChartNode(member);
      registerChartRelationship(member);
    });
  }
  function clearAxisBinding() {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    const mappedChannel = node ? mappedEncodingChannel(node, target?.channel ?? "x") : "x";
    if (!target || !node?.chartSpec?.encodings[mappedChannel]) return;
    pushCanvasHistory();
    coordinateTargets(node.id, target.channel).forEach((member) => {
      if (!member.chartSpec) return;
      member.llmRenderer = null;
      const encodings = { ...member.chartSpec.encodings };
      const aggregations = { ...member.chartSpec.aggregations };
      delete encodings[target.channel];
      delete encodings[mappedEncodingChannel(member, target.channel)];
      delete aggregations[target.channel];
      delete aggregations[mappedEncodingChannel(member, target.channel)];
      member.chartSpec = {
        ...member.chartSpec,
        encodings,
        aggregations: Object.keys(aggregations).length > 0 ? aggregations : undefined,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
      member.renderedContent = null;
    });
  }
  function setAxisBindingAggregation(channel: EncodingChannel, aggregation?: "sum" | "avg") {
    const node = axisBindingNode.value;
    const mappedChannel = node ? mappedEncodingChannel(node, channel) : channel;
    const encoding = node?.chartSpec?.encodings[mappedChannel];
    if (!node?.chartSpec || encoding?.type !== "quantitative") return;
    if (node.chartSpec.aggregations?.[mappedChannel] === aggregation) return;
    pushCanvasHistory();
    coordinateTargets(node.id, channel).forEach((member) => {
      if (!member.chartSpec) return;
      const memberChannel = mappedEncodingChannel(member, channel);
      const aggregations = { ...member.chartSpec.aggregations };
      if (aggregation) aggregations[memberChannel] = aggregation;
      else delete aggregations[memberChannel];
      member.llmRenderer = null;
      member.chartSpec = {
        ...member.chartSpec,
        aggregations: Object.keys(aggregations).length > 0 ? aggregations : undefined,
        renderer: undefined,
      };
      renderChartNode(member);
      registerChartRelationship(member);
    });
  }
  function setCubeValueFilters(filters: Partial<Record<"person" | "date", { field: string; values: string[] }>>) {
    const node = axisBindingNode.value ?? selectedNodes.value.find((item) => !!item.chartSpec);
    if (!node?.chartSpec) return;
    const template = normalizeChartTemplate(node.chartSpec.chartType);
    if (template !== "line" && template !== "scatter" && template !== "matrix" && template !== "bar") return;
    const next = { ...node.chartSpec.valueFilters };
    (["person", "date"] as const).forEach((dimension) => {
      Object.keys(next).forEach((field) => {
        if (field === filters[dimension]?.field) delete next[field];
      });
      const filter = filters[dimension];
      if (!filter) return;
      const dataset = getDataset(node.chartSpec!.datasetId);
      const availableCount = new Set(dataset?.rows.map((row) => row[filter.field] ?? "").filter(Boolean) ?? []).size;
      if (filter.values.length > 0 && filter.values.length < availableCount) {
        next[filter.field] = Array.from(new Set(filter.values));
      }
    });
    pushCanvasHistory();
    node.llmRenderer = null;
    node.chartSpec = {
      ...node.chartSpec,
      valueFilters: Object.keys(next).length > 0 ? next : undefined,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    };
    node.renderedContent = null;
    renderChartNode(node);
  }
  function confirmSeriesField(fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column || column.type !== "nominal") return;
    const boundFields = new Set(Object.values(node.chartSpec.encodings).map((encoding) => encoding?.field));
    if (boundFields.has(fieldName)) return;
    pushCanvasHistory();
    node.llmRenderer = null;
    node.chartSpec = {
      ...node.chartSpec,
      series: { field: column.name, type: column.type },
      dimensionDecisions: {
        ...node.chartSpec.dimensionDecisions,
        [column.name]: "series",
      },
    };
    renderChartNode(node);
  }
  function clearSeriesBinding() {
    const node = axisBindingNode.value;
    if (!node?.chartSpec?.series) return;
    pushCanvasHistory();
    node.llmRenderer = null;
    node.chartSpec = {
      ...node.chartSpec,
      series: undefined,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
      dimensionDecisions: undefined,
      dimensionRecommendations: undefined,
    };
    renderChartNode(node);
    registerChartRelationship(node);
  }
  function bindOptionalEncoding(channel: OptionalEncodingChannel, fieldName: string) {
    const target = axisBindingTarget.value;
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!target || !node?.chartSpec || !dataset) return;
    const column = dataset.columns.find((item) => item.name === fieldName);
    if (!column) return;
    pushCanvasHistory();
    node.llmRenderer = null;
    node.chartSpec = {
      ...node.chartSpec,
      encodings: {
        ...node.chartSpec.encodings,
        [channel]: { field: column.name, type: column.type },
      },
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    };
    node.renderedContent = null;
    renderChartNode(node);
  }
  function clearOptionalEncoding(channel: OptionalEncodingChannel) {
    const node = axisBindingNode.value;
    if (!node?.chartSpec?.encodings[channel]) return;
    pushCanvasHistory();
    node.llmRenderer = null;
    const encodings = { ...node.chartSpec.encodings };
    delete encodings[channel];
    node.chartSpec = { ...node.chartSpec, encodings, renderer: undefined, scales: undefined, plotArea: undefined };
    node.renderedContent = null;
    renderChartNode(node);
  }
  function setChartEncoding(channel: ChartEncodingChannel, fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset) return;
    const contract = getChartTemplateContract(node.chartSpec.chartType);
    const mapping = contract?.channels.find((item) => item.channel === channel);
    const column = fieldName ? dataset.columns.find((item) => item.name === fieldName) : undefined;
    if (!mapping || (fieldName && (!column || !mapping.accepts.includes(column.type)))) return;
    if (channel === "x" || channel === "y") {
      setAxisBindingChannel(channel);
      if (fieldName) bindAxisField(fieldName);
      else clearAxisBinding();
      return;
    }
    if (channel === "column" || channel === "row") {
      setAxisBindingChannel(channel === "column" ? "x" : "y");
      if (fieldName) bindAxisField(fieldName);
      else clearAxisBinding();
      return;
    }
    if (channel === "angle") {
      setAxisBindingChannel("y");
      if (fieldName) bindAxisField(fieldName);
      else clearAxisBinding();
      return;
    }
    if (channel === "radius") {
      if (fieldName) bindPolarRadiusField(fieldName);
      else clearPolarRadiusField();
      return;
    }
    if (channel === "color" && (normalizeChartTemplate(node.chartSpec.chartType) === "pie" || normalizeChartTemplate(node.chartSpec.chartType) === "donut")) {
      setAxisBindingChannel("x");
      if (fieldName) bindAxisField(fieldName);
      else clearAxisBinding();
      return;
    }
    pushCanvasHistory();
    node.llmRenderer = null;
    const encodings = { ...node.chartSpec.encodings };
    if (column) encodings[channel] = { field: column.name, type: column.type };
    else delete encodings[channel];
    node.chartSpec = {
      ...node.chartSpec,
      encodings,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
    };
    node.renderedContent = null;
    renderChartNode(node);
    registerChartRelationship(node);
  }
  function bindPolarRadiusField(fieldName: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    const column = dataset?.columns.find((item) => item.name === fieldName);
    if (!node?.chartSpec || !column || column.type !== "quantitative") return;
    pushCanvasHistory();
    coordinateTargets(node.id, "radius").forEach((member) => {
      if (!member.chartSpec) return;
      member.chartSpec = {
        ...member.chartSpec,
        radiusMode: "shared",
        encodings: {
          ...member.chartSpec.encodings,
          radius: { field: column.name, type: column.type },
        },
        renderer: undefined,
      };
      renderChartNode(member);
    });
  }
  function clearPolarRadiusField() {
    const node = axisBindingNode.value;
    if (!node?.chartSpec?.encodings.radius) return;
    pushCanvasHistory();
    coordinateTargets(node.id, "radius").forEach((member) => {
      if (!member.chartSpec) return;
      const encodings = { ...member.chartSpec.encodings };
      delete encodings.radius;
      member.chartSpec = { ...member.chartSpec, radiusMode: "shared", encodings, renderer: undefined };
      renderChartNode(member);
    });
  }
  function setPieRadiusMode(mode: "shared" | "per-component") {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node?.chartSpec || !dataset || normalizeChartTemplate(node.chartSpec.chartType) !== "pie") return;
    pushCanvasHistory();
    coordinateTargets(node.id, "radius").forEach((member) => {
      if (!member.chartSpec) return;
      const componentRadiusFields = mode === "per-component"
        ? Object.fromEntries((member.chartSpec.angleFields ?? []).map((angleEncoding): [string, ChartEncoding | undefined] => {
          const existing = member.chartSpec?.componentRadiusFields?.[angleEncoding.field];
          const sourceColumn = dataset.columns.find((column) => column.name === angleEncoding.field && column.type === "quantitative");
          return [angleEncoding.field, existing ?? (sourceColumn ? { field: sourceColumn.name, type: sourceColumn.type } : undefined)];
        }).filter((entry): entry is [string, ChartEncoding] => !!entry[1]))
        : member.chartSpec.componentRadiusFields;
      member.chartSpec = {
        ...member.chartSpec,
        radiusMode: mode,
        componentRadiusFields,
        renderer: undefined,
      };
      renderChartNode(member);
    });
  }
  function setPieComponentRadiusField(componentField: string, radiusField: string) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    const column = dataset?.columns.find((item) => item.name === radiusField && item.type === "quantitative");
    if (!node?.chartSpec || !dataset || normalizeChartTemplate(node.chartSpec.chartType) !== "pie") return;
    if (!node.chartSpec.angleFields?.some((encoding) => encoding.field === componentField)) return;
    if (radiusField && !column) return;
    pushCanvasHistory();
    coordinateTargets(node.id, "radius").forEach((member) => {
      if (!member.chartSpec) return;
      const componentRadiusFields = { ...member.chartSpec.componentRadiusFields };
      if (column) componentRadiusFields[componentField] = { field: column.name, type: column.type };
      else delete componentRadiusFields[componentField];
      member.chartSpec = {
        ...member.chartSpec,
        radiusMode: "per-component",
        componentRadiusFields,
        renderer: undefined,
      };
      renderChartNode(member);
    });
  }
  function applyPieAngleFields(node: CanvasNode, dataset: Dataset, fieldNames: string[]) {
    if (!node.chartSpec || normalizeChartTemplate(node.chartSpec.chartType) !== "pie") return 0;
    const selected = Array.from(new Set(fieldNames))
      .map((field) => dataset.columns.find((column) => column.name === field))
      .filter((column): column is NonNullable<typeof column> => column?.type === "quantitative")
      .map((column) => ({ field: column.name, type: column.type }));
    pushCanvasHistory();
    coordinateTargets(node.id, "angle").forEach((member) => {
      if (!member.chartSpec) return;
      const encodings = { ...member.chartSpec.encodings };
      delete encodings.angle;
      delete encodings.y;
      member.chartSpec = {
        ...member.chartSpec,
        encodings,
        angleFields: selected.map((encoding) => ({ ...encoding })),
        componentRadiusFields: member.chartSpec.radiusMode === "per-component"
          ? Object.fromEntries(selected.map((encoding) => [
            encoding.field,
            member.chartSpec?.componentRadiusFields?.[encoding.field] ?? { ...encoding },
          ]))
          : member.chartSpec.componentRadiusFields,
        renderer: undefined,
        dimensionDecisions: undefined,
        dimensionRecommendations: undefined,
      };
      renderChartNode(member);
    });
    return selected.length;
  }
  function setPieAngleFields(fieldNames: string[]) {
    const node = axisBindingNode.value;
    const dataset = axisBindingDataset.value;
    if (!node || !dataset) return;
    applyPieAngleFields(node, dataset, fieldNames);
  }
  function bindCubeFieldsToPie(nodeId: string, fieldNames: string[]) {
    const node = findCanvasNode(nodeId);
    const dataset = node?.chartSpec?.datasetId
      ? getDataset(node.chartSpec.datasetId)
      : activeDataset.value;
    if (!node?.chartSpec || !dataset || normalizeChartTemplate(node.chartSpec.chartType) !== "pie") return false;
    const validFields = Array.from(new Set(fieldNames)).filter((field) =>
      dataset.columns.some((column) => column.name === field && column.type === "quantitative"),
    );
    if (validFields.length === 0 || validFields.length !== new Set(fieldNames).size) return false;
    applyPieAngleFields(node, dataset, validFields);
    return true;
  }
  function closeContextMenu() { contextMenu.value = null; }

  function renderChartNode(node: CanvasNode) {
    const layerOwner = node.compositionSpec?.type === "layer"
      && node.coordinateSystem?.ownerNodeId !== node.id
      ? findCanvasNode(node.coordinateSystem?.ownerNodeId ?? "")
      : null;
    const inheritedEncodings: ChartSpec["encodings"] = {};
    if (layerOwner?.chartSpec) {
      (node.coordinateSystem?.sharedChannels ?? []).forEach((channel) => {
        const encoding = layerOwner.chartSpec?.encodings[channel];
        if (encoding) inheritedEncodings[channel] = { ...encoding };
      });
    }
    const storedChartSpec = node.chartSpec
      ? {
        ...node.chartSpec,
        encodings: { ...node.chartSpec.encodings, ...inheritedEncodings },
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
    const required = contract.channels.filter((mapping) => mapping.required);
    const complete = required.every((mapping) => {
      if (chartSpec.encodings[mapping.channel]) return true;
      if (template === "pie") {
        return mapping.channel === "angle"
          && (!!chartSpec.angleFields?.length || !!chartSpec.encodings.y);
      }
      if (template === "donut") return mapping.channel === "angle" && !!chartSpec.encodings.y;
      if (template === "matrix") {
        if (mapping.channel === "row") return !!chartSpec.encodings.y;
        if (mapping.channel === "column") return !!chartSpec.encodings.x;
      }
      return false;
    });
    const coordinateReady = contract.coordinateSystem === "None" || node.coordinateGuide?.type === contract.coordinateSystem;
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
          version: template === "line" ? 3 : 1,
          status: "error",
          error: "The bound dataset is no longer available.",
        },
      };
      return;
    }
    const hasFilters = Object.keys(chartSpec.filters ?? {}).length > 0
      || Object.keys(chartSpec.valueFilters ?? {}).length > 0;
    const dataset = hasFilters
      ? {
        ...sourceDataset,
        rows: sourceDataset.rows.filter((row) => rowMatchesChartFilters(row, chartSpec)),
      }
      : sourceDataset;
    const syncEncodingType = (encoding: typeof chartSpec.encodings.x) => {
      if (!encoding) return undefined;
      const column = dataset.columns.find((item) => item.name === encoding.field);
      return column ? { ...encoding, type: column.type } : encoding;
    };
    const syncedEncodings = Object.fromEntries(
      (Object.entries(chartSpec.encodings) as Array<[string, typeof chartSpec.encodings.x]>).map(([channel, encoding]) => [channel, syncEncodingType(encoding)]),
    ) as ChartSpec["encodings"];
    const syncedAngleFields = chartSpec.angleFields
      ?.map((encoding) => syncEncodingType(encoding))
      .filter((encoding): encoding is ChartEncoding => !!encoding);
    const syncedComponentRadiusFields = chartSpec.componentRadiusFields
      ? Object.fromEntries(Object.entries(chartSpec.componentRadiusFields)
        .map(([field, encoding]) => [field, syncEncodingType(encoding)] as const)
        .filter((entry): entry is readonly [string, ChartEncoding] => !!entry[1]))
      : undefined;
    const seriesColumn = dataset.columns.find((item) => item.name === chartSpec.series?.field);
    const syncedChartSpec = inferChartStructure(node.id, dataset, {
      ...chartSpec,
      encodings: syncedEncodings,
      angleFields: syncedAngleFields,
      componentRadiusFields: syncedComponentRadiusFields,
      series: chartSpec.series && seriesColumn
        ? { ...chartSpec.series, type: seriesColumn.type }
        : chartSpec.series,
    });
    const ownerScales = layerOwner?.chartSpec?.scales;
    const ownerPlotArea = layerOwner?.chartSpec?.plotArea;
    const memberLocalOrigin = {
      x: node.kind === "leaf" ? node.contentMinX : 0,
      y: node.kind === "leaf" ? node.contentMinY : 0,
    };
    const ownerLocalOrigin = {
      x: layerOwner?.kind === "leaf" ? layerOwner.contentMinX : 0,
      y: layerOwner?.kind === "leaf" ? layerOwner.contentMinY : 0,
    };
    const sharedOffset = {
      x: memberLocalOrigin.x - ownerLocalOrigin.x,
      y: memberLocalOrigin.y - ownerLocalOrigin.y,
    };
    const sharedPlotArea = ownerPlotArea
      ? {
        ...ownerPlotArea,
        x: ownerPlotArea.x + sharedOffset.x,
        y: ownerPlotArea.y + sharedOffset.y,
      }
      : undefined;
    const sharedScales = ownerScales?.x && ownerScales.y
      ? {
        x: {
          ...ownerScales.x,
          range: ownerScales.x.range.map((value) => value + sharedOffset.x) as [number, number],
        },
        y: {
          ...ownerScales.y,
          range: ownerScales.y.range.map((value) => value + sharedOffset.y) as [number, number],
        },
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
      const renderedChartSpec: ChartSpec = {
        ...syncedChartSpec,
        scales: result.scales,
        plotArea: result.plotArea,
        renderer: {
          kind: "deterministic-chart",
          version: template === "line" ? 3 : 1,
          status: "ready",
        },
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
          baseSpec: renderedChartSpec,
          nestedSpec: node.nestedSpec,
          dataset,
        });
        node.renderedContent += nested.content;
      }
    } catch (error) {
      node.renderedContent = null;
      node.chartSpec = {
        ...syncedChartSpec,
        scales: undefined,
        plotArea: undefined,
        renderer: {
          kind: "deterministic-chart",
          version: template === "line" ? 3 : 1,
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
  function countTemplateNodes(nodes: import("./types").ParsedSvgTemplateNode[]): number {
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
    coordinateSystem: CoordinateSystem = "None",
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
    const instantiateNode = (node: import("./types").ParsedSvgTemplateNode, parentBounds: import("./types").Bounds | null): CanvasNode => {
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
      const coordinateSystem = matchingCandidate?.coordinateSystem ?? "None";
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
  function exitGroupEditing(selectExitedGroup = true) {
    const exitedGroupId = editingGroupPath.value.at(-1);
    if (!exitedGroupId) return false;
    editingGroupPath.value = editingGroupPath.value.slice(0, -1);
    setSelection(selectExitedGroup ? [exitedGroupId] : []);
    semanticSelection.value = null;
    axisBindingTarget.value = null;
    return true;
  }
  function onCanvasNodeDoubleClick(node: CanvasNode, event: MouseEvent) {
    if (node.kind !== "group" || node.children.length === 0 || node.renderedContent) return;
    event.preventDefault();
    event.stopPropagation();
    if (editingGroupPath.value.length > 0 && !getSelectionNode(node.id)) {
      editingGroupPath.value = [];
    }
    const nextPath = getRootNode(node.id)
      ? [node.id]
      : [...editingGroupPath.value, node.id];
    editingGroupPath.value = nextPath;
    selectedIds.value = [];
    semanticSelection.value = null;
    axisBindingTarget.value = null;
    contextMenu.value = null;
    interaction.value = null;
    detachPointerListeners();
  }
  function onCanvasNodePointerDown(node: CanvasNode, event: PointerEvent) {
    if (event.button !== 0) return;
    contextMenu.value = null;
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
  }
  function openContextMenu(event: MouseEvent) {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 196;
    const menuHeight = 404;
    contextMenu.value = {
      x: clamp(event.clientX - rect.left, 8, rect.width - menuWidth - 8),
      y: clamp(event.clientY - rect.top, 8, rect.height - menuHeight - 8),
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
    if (editingGroupPath.value.length > 0) exitGroupEditing(false);
    interaction.value = { type: "marquee", startPoint: toCanvasPoint(event.clientX, event.clientY), currentPoint: toCanvasPoint(event.clientX, event.clientY) };
    attachPointerListeners();
  }
  function onEditingGroupBackgroundPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    contextMenu.value = null;
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
    const affectedNodeIds = new Set<string>([node.id]);
    axesForChart(node.id).forEach(({ axis }) => {
      dispatchRelationship({ type: "update-axis", axisId: axis.id, changes: { config: { origin } } });
      chartsForAxis(axis.id).forEach(({ chart }) => {
        if (chart.nodeId) affectedNodeIds.add(chart.nodeId);
      });
    });
    const targets = Array.from(affectedNodeIds)
      .map((nodeId) => findCanvasNode(nodeId))
      .filter((member): member is CanvasNode => !!member);
    targets.forEach((member) => {
      if (member.coordinateGuide) member.coordinateGuide.origin = { ...origin };
    });
  }
  function updateCoordinateAxisScaleInteraction(currentPoint: Point, ci: CoordinateAxisScaleInteraction) {
    const node = findCanvasNode(ci.nodeId);
    const guide = node?.coordinateGuide;
    if (!node || !guide) return;
    const localStart = toNodeLocalPoint(node, ci.startPoint);
    const localCurrent = toNodeLocalPoint(node, currentPoint);
    const span = ci.axis === "x" || ci.axis === "ring" ? Math.max(node.width, 1) : Math.max(node.height, 1);
    const direction = guide.type === "Cartesian"
      ? (ci.axis === "x" ? guide.xDirection : guide.yDirection)
      : 1;
    const delta = ci.axis === "x" || ci.axis === "ring"
      ? (localCurrent.x - localStart.x) * direction
      : (localCurrent.y - localStart.y) * direction;
    const nextScale = clamp(ci.startScale + delta / span, Math.max(1 / span, 0.001), 1.5);
    const binding = bindingForChartChannel(node.id, ci.axis);
    if (binding) {
      dispatchRelationship({
        type: "update-axis",
        axisId: binding.axisId,
        changes: { config: { scale: nextScale } },
      });
    }
    coordinateTargets(node.id, ci.axis).forEach((member) => {
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
    guide.angleSpan = polarAngleSpanFromPoint(guide.origin, localPoint);
    renderChartNode(node);
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
    interaction.value = null;
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
    const rect = canvasRef.value?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const nextZoom = clamp(viewZoom.value * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === viewZoom.value) return;
    const modelX = (screenX - viewPan.value.x) / viewZoom.value;
    const modelY = (screenY - viewPan.value.y) / viewZoom.value;
    viewPan.value = { x: screenX - modelX * nextZoom, y: screenY - modelY * nextZoom };
    viewZoom.value = nextZoom;
  }
  function resetCanvasZoom() { viewZoom.value = 1; viewPan.value = { x: 0, y: 0 }; }

  // --- drag & drop ---
  function pieAngleDropZoneAt(
    point: Point,
    binding: CubeBindingPayload,
  ): DataBindingDropZone | null {
    const targets = [...getSelectionScopeNodes()].reverse().filter((node) =>
      node.chartSpec
      && node.coordinateGuide?.type === "Polar"
      && normalizeChartTemplate(node.chartSpec.chartType) === "pie",
    );
    for (const node of targets) {
      if (node.coordinateGuide?.type !== "Polar") continue;
      const localPoint = toNodeLocalPoint(node, point);
      const radius = Math.max(
        8,
        Math.min(node.width, node.height) * 0.42
          * (node.coordinateGuide.radiusScale ?? 1),
      );
      const distance = Math.hypot(
        localPoint.x - node.coordinateGuide.origin.x,
        localPoint.y - node.coordinateGuide.origin.y,
      );
      if (distance > radius) continue;
      const dataset = node.chartSpec?.datasetId
        ? getDataset(node.chartSpec.datasetId)
        : activeDataset.value;
      const compatible = binding.dimension === "weight"
        && binding.values.length > 0
        && !!dataset
        && binding.values.every((field) =>
          dataset.columns.some((column) =>
            column.name === field && column.type === "quantitative",
          ),
        );
      return {
        type: "polar-angle",
        targetNodeId: node.id,
        channel: "angle",
        center: nodeLocalToSelectionScopePoint(node, node.coordinateGuide.origin),
        radiusX: radius * Math.abs(node.scaleX),
        radiusY: radius * Math.abs(node.scaleY),
        rotation: node.rotation,
        compatible,
      };
    }
    return null;
  }
  function cubeFieldForNode(node: CanvasNode, binding: CubeBindingPayload) {
    const dataset = node.chartSpec?.datasetId
      ? getDataset(node.chartSpec.datasetId)
      : activeDataset.value;
    if (!dataset) return undefined;
    if (binding.dimension === "person") {
      return dataset.columns.find((column) => column.name.toLowerCase() === "person")?.name
        ?? dataset.columns.find((column) => column.type === "nominal" && column.name.toLowerCase().includes("person"))?.name;
    }
    if (binding.dimension === "date") {
      return dataset.columns.find((column) => column.name.toLowerCase() === "date")?.name
        ?? dataset.columns.find((column) => column.name.toLowerCase() === "time")?.name
        ?? dataset.columns.find((column) => column.type === "temporal")?.name;
    }
    return binding.values.find((field) =>
      dataset.columns.some((column) => column.name === field),
    );
  }
  function distanceToSegment(point: Point, start: Point, end: Point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      0,
      1,
    );
    return Math.hypot(
      point.x - (start.x + ratio * dx),
      point.y - (start.y + ratio * dy),
    );
  }
  function cartesianAxisDropZoneAt(
    point: Point,
    binding: CubeBindingPayload,
  ): DataBindingDropZone | null {
    const threshold = 24 / Math.max(viewZoom.value, 0.25);
    const zones = getSelectionScopeNodes().flatMap((node) => {
      if (node.coordinateGuide?.type !== "Cartesian" || !node.chartSpec) return [];
      const guide = node.coordinateGuide;
      const minX = node.kind === "leaf" ? node.contentMinX : 0;
      const minY = node.kind === "leaf" ? node.contentMinY : 0;
      const model = createCartesianAxisModel(node);
      const origin = model?.origin ?? guide.origin;
      const xEnd = model?.xEnd ?? {
        x: guide.xDirection === 1 ? minX + node.width : minX,
        y: origin.y,
      };
      const yEnd = model?.yEnd ?? {
        x: origin.x,
        y: guide.yDirection === -1 ? minY : minY + node.height,
      };
      const fieldName = cubeFieldForNode(node, binding);
      const dataset = node.chartSpec.datasetId ? getDataset(node.chartSpec.datasetId) : activeDataset.value;
      const column = dataset?.columns.find((item) => item.name === fieldName);
      const contract = getChartTemplateContract(node.chartSpec.chartType);
      return (["x", "y"] as EncodingChannel[]).map((channel) => {
        const localEnd = channel === "x" ? xEnd : yEnd;
        const start = nodeLocalToSelectionScopePoint(node, origin);
        const end = nodeLocalToSelectionScopePoint(node, localEnd);
        const dataChannel = mappedEncodingChannel(node, channel);
        const accepts = contract?.channels.find((item) => item.channel === dataChannel)?.accepts ?? [];
        return {
          type: "cartesian-axis" as const,
          targetNodeId: node.id,
          channel,
          start,
          end,
          fieldName,
          compatible: !!column && accepts.includes(column.type),
          distance: distanceToSegment(point, start, end),
        };
      });
    }).filter((zone) => zone.distance <= threshold)
      .sort((left, right) => left.distance - right.distance);
    const nearest = zones[0];
    if (!nearest) return null;
    const { distance: _distance, ...zone } = nearest;
    return zone;
  }
  function chartAtDataBindingPoint(point: Point) {
    return [...getSelectionScopeNodes()].reverse().find((node) => {
      if (!node.chartSpec) return false;
      const local = toNodeLocalPoint(node, point);
      const minX = node.kind === "leaf" ? node.contentMinX : 0;
      const minY = node.kind === "leaf" ? node.contentMinY : 0;
      return local.x >= minX && local.x <= minX + node.width
        && local.y >= minY && local.y <= minY + node.height;
    }) ?? null;
  }
  function dataBindingDropZoneAt(point: Point, binding: CubeBindingPayload) {
    const axisZone = cartesianAxisDropZoneAt(point, binding);
    if (axisZone) return axisZone;
    return pieAngleDropZoneAt(point, binding);
  }
  function chartDropZoneAt(point: Point, candidate: SvgCandidate): ChartDropZone | null {
    const candidateContract = getChartTemplateContract(candidate.chartType);
    if (!candidateContract) return null;
    const candidateTemplate = normalizeChartTemplate(candidate.chartType);
    const targets = [...getSelectionScopeNodes()].reverse().filter((node) => node.chartSpec && node.coordinateGuide);
    for (const node of targets) {
      const contract = getChartTemplateContract(node.chartSpec!.chartType);
      if (!contract) continue;
      const localMinX = node.kind === "leaf" ? node.contentMinX : 0;
      const localMinY = node.kind === "leaf" ? node.contentMinY : 0;
      const plot = node.chartSpec?.plotArea ?? { x: localMinX, y: localMinY, width: node.width, height: node.height };
      const bounds: Bounds = {
        minX: node.x + (plot.x - localMinX) * node.scaleX,
        minY: node.y + (plot.y - localMinY) * node.scaleY,
        maxX: node.x + (plot.x - localMinX + plot.width) * node.scaleX,
        maxY: node.y + (plot.y - localMinY + plot.height) * node.scaleY,
        width: plot.width * node.scaleX,
        height: plot.height * node.scaleY,
      };
      if (point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) continue;
      if (normalizeChartTemplate(node.chartSpec!.chartType) === "scatter" && candidateTemplate === "pie") {
        const pointTarget = scatterPointDropZone(node, point);
        if (!pointTarget) continue;
        return {
          targetNodeId: node.id,
          type: "nested",
          sharedChannels: [],
          bounds: pointTarget.bounds,
          compatible: nestedPieValueFields(node).length > 0,
          targetRowKey: pointTarget.rowKey,
        };
      }
      if (contract.coordinateSystem !== candidateContract.coordinateSystem) continue;
      const edge = Math.max(28 / Math.max(viewZoom.value, 0.25), Math.min(bounds.width, bounds.height) * 0.16);
      const distances = {
        left: point.x - bounds.minX,
        right: bounds.maxX - point.x,
        top: point.y - bounds.minY,
        bottom: bounds.maxY - point.y,
      };
      const nearest = (Object.entries(distances) as Array<[keyof typeof distances, number]>).sort((left, right) => left[1] - right[1])[0]!;
      if (nearest[1] <= edge) {
        const isHorizontalEdge = nearest[0] === "top" || nearest[0] === "bottom";
        const channel: CoordinateChannel = contract.coordinateSystem === "Polar"
          ? (isHorizontalEdge ? "radius" : "ring")
          : (isHorizontalEdge ? "x" : "y");
        const compatible = contract.shareableChannels.includes(channel) && candidateContract.shareableChannels.includes(channel);
        const zoneBounds = nearest[0] === "left"
          ? { minX: bounds.minX - edge, minY: bounds.minY, maxX: bounds.minX + edge, maxY: bounds.maxY, width: edge * 2, height: bounds.height }
          : nearest[0] === "right"
            ? { minX: bounds.maxX - edge, minY: bounds.minY, maxX: bounds.maxX + edge, maxY: bounds.maxY, width: edge * 2, height: bounds.height }
            : nearest[0] === "top"
              ? { minX: bounds.minX, minY: bounds.minY - edge, maxX: bounds.maxX, maxY: bounds.minY + edge, width: bounds.width, height: edge * 2 }
              : { minX: bounds.minX, minY: bounds.maxY - edge, maxX: bounds.maxX, maxY: bounds.maxY + edge, width: bounds.width, height: edge * 2 };
        return {
          targetNodeId: node.id,
          type: "concat",
          sharedChannels: [channel],
          bounds: zoneBounds,
          compatible,
          direction: isHorizontalEdge ? "vertical" : "horizontal",
          concatPosition: nearest[0] === "top" || nearest[0] === "left" ? "before" : "after",
        };
      }
      const sharedChannels = contract.shareableChannels.filter((channel) => candidateContract.shareableChannels.includes(channel));
      return {
        targetNodeId: node.id,
        type: "layer",
        sharedChannels,
        bounds: { minX: bounds.minX + edge, minY: bounds.minY + edge, maxX: bounds.maxX - edge, maxY: bounds.maxY - edge, width: Math.max(0, bounds.width - edge * 2), height: Math.max(0, bounds.height - edge * 2) },
        compatible: sharedChannels.length > 0,
      };
    }
    return null;
  }
  function onCandidateDragStart(candidate: SvgCandidate, event: DragEvent) {
    draggedCandidateId.value = candidate.id;
    activeDataBindingDropZone.value = null;
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
    const cubeBinding = getActiveCubeBinding();
    if (cubeBinding) {
      activeDropZone.value = null;
      const point = toSelectionScopePoint(event.clientX, event.clientY);
      const hoveredChart = chartAtDataBindingPoint(point);
      if (hoveredChart && !selectedIds.value.includes(hoveredChart.id)) {
        setSelection([hoveredChart.id]);
        dispatchRelationship({ type: "select-entity", selection: { type: "chart", id: hoveredChart.id } });
      }
      activeDataBindingDropZone.value = dataBindingDropZoneAt(point, cubeBinding);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = activeDataBindingDropZone.value?.compatible
          ? "copy"
          : "none";
      }
      return;
    }
    const candidate = draggedCandidateId.value ? getCandidate(draggedCandidateId.value) : null;
    activeDataBindingDropZone.value = null;
    activeDropZone.value = candidate
      ? chartDropZoneAt(toSelectionScopePoint(event.clientX, event.clientY), candidate)
      : null;
    if (event.dataTransfer) event.dataTransfer.dropEffect = activeDropZone.value?.compatible === false ? "none" : "copy";
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
    const cubeBinding = readCubeBinding(event.dataTransfer);
    if (cubeBinding) {
      const zone = activeDataBindingDropZone.value
        ?? dataBindingDropZoneAt(point, cubeBinding);
      activeDataBindingDropZone.value = null;
      activeDropZone.value = null;
      endCubeBindingDrag();
      if (!zone) {
        setImportNotice("Drop the Cube field on a compatible chart axis or Pie angle region.");
        return;
      }
      if (!zone.compatible) {
        setImportNotice("This Cube field is not compatible with the target channel.");
        return;
      }
      if (zone.type === "cartesian-axis") {
        const target = findCanvasNode(zone.targetNodeId);
        if (!target || !zone.fieldName) return;
        axisBindingTarget.value = { nodeId: target.id, channel: zone.channel };
        bindAxisField(zone.fieldName, cubeBinding.aggregation);
        axisBindingTarget.value = null;
        setSelection([target.id]);
        setImportNotice(`${zone.fieldName} bound to ${zone.channel.toUpperCase()} axis.`);
        return;
      }
      if (!bindCubeFieldsToPie(zone.targetNodeId, cubeBinding.values)) {
        setImportNotice("The selected weight metrics are not available in this Pie Chart dataset.");
        return;
      }
      setSelection([zone.targetNodeId]);
      setImportNotice(`${cubeBinding.values.length} weight metrics bound to Pie Chart angle.`);
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
        executeComposition(zone.type, false, zone.sharedChannels, zone.direction, zone.concatPosition);
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
      if (exitGroupEditing()) event.preventDefault();
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
  watch(chartRelationships, projectRelationshipStateToCanvas, { deep: true });
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
    semanticSelection,
    semanticMarkGroupConfig,
    nestedBindingTarget,
    activeNestedRelationshipId,
    nestedBindingNode,
    nestedBindingColumns,
    nestedBindingSuggestedAngleFields,
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
    interaction,
    contextMenu,
    draggedCandidateId,
    activeDropZone,
    activeDataBindingDropZone,
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
    exitGroupEditing,
    onEditingGroupBackgroundPointerDown,
    onSemanticMarkPointerDown,
    updateSemanticMarkGroupConfig,
    updateAxisBindingMarkGroupConfig,
    applyDimensionRecommendation,
    applyDimensionAggregation,
    applyDimensionChartUpgrade,
    applyLlmRenderer,
    onCanvasNodeContextMenu,
    onScaleHandlePointerDown,
    onRotateHandlePointerDown,
    onCoordinateOriginPointerDown,
    onCoordinateAxisScalePointerDown,
    onPolarAnglePointerDown,
    onCoordinateAxisSelect,
    setAxisBindingChannel,
    bindAxisField,
    setAxisBindingAggregation,
    setCubeValueFilters,
    clearAxisBinding,
    confirmSeriesField,
    clearSeriesBinding,
    bindOptionalEncoding,
    clearOptionalEncoding,
    setChartEncoding,
    bindPolarRadiusField,
    clearPolarRadiusField,
    setPieAngleFields,
    bindCubeFieldsToPie,
    setPieRadiusMode,
    setPieComponentRadiusField,
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
    selectedCoordinateSystems,
    toggleCoordinateSystem,
    createCompositionCandidate,
    createLayer,
    executeComposition,
    createNestedPie,
    confirmNestedBinding,
    closeNestedBinding,
    groupSelectedItems,
    ungroupSelectedItems,
    dissolveSelectedGroups,
    reorderSelectedNodes,
    alignSelection,
    resetCanvasZoom,
  };
}
