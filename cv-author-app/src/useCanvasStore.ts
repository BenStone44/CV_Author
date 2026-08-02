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
  ScaleHandle,
  SelectionUnit,
  Bounds,
  Point,
  ParsedSvgTemplate,
  SvgCandidate,
  CompositionType,
  LayerOrderAction,
} from "./types";
import {
  candidates,
  loadSvgTemplate,
  parseSvgTemplate,
  scopeSvgContent,
  collator,
} from "./svgUtils";
import {
  clamp,
  normalizeBounds,
  mergeBounds,
  boundsFromNodeFrame,
  cloneCanvasNode,
  collectNodeBounds,
  computeBounds,
  createCanvasNodesSvgMarkup,
} from "./canvasUtils";

const historyLimit = 50;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

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
  // --- sidebar state ---
  const selectedCoordinateSystems = ref<Set<CoordinateSystem>>(new Set());
  const selectedChartType = ref("All");
  const generatedCandidates = ref<SvgCandidate[]>([]);

  function toggleCoordinateSystem(value: CoordinateSystem) {
    selectedCoordinateSystems.value = selectedCoordinateSystems.value.has(value)
      ? new Set()
      : new Set([value]);
  }
  function coordinateSystemMatches(coordinateSystem: CoordinateSystem) {
    return selectedCoordinateSystems.value.size === 0 || selectedCoordinateSystems.value.has(coordinateSystem);
  }

  const previewableCandidates = computed(() =>
    [...generatedCandidates.value, ...candidates],
  );
  const compositionCandidates = computed(() =>
    generatedCandidates.value,
  );
  const availableChartTypes = computed(() => {
    const names = new Set(
      candidates
        .filter((c) => coordinateSystemMatches(c.coordinateSystem))
        .map((c) => c.chartType),
    );
    return ["All", ...Array.from(names).sort((a, b) => collator.compare(a, b))];
  });
  watch(availableChartTypes, (values) => {
    if (!values.includes(selectedChartType.value)) selectedChartType.value = "All";
  }, { immediate: true });
  const filteredCandidates = computed(() => {
    return candidates.filter((c) => {
      const chartTypeMatches = selectedChartType.value === "All" || c.chartType === selectedChartType.value;
      return coordinateSystemMatches(c.coordinateSystem) && chartTypeMatches;
    });
  });

  // --- canvas state ---
  const canvasNodes = ref<CanvasNode[]>([]);
  const viewZoom = ref(1);
  const viewPan = ref<Point>({ x: 0, y: 0 });
  const selectedIds = ref<string[]>([]);
  const rotationInputVisible = ref(false);
  const undoStack = ref<CanvasHistorySnapshot[]>([]);
  const redoStack = ref<CanvasHistorySnapshot[]>([]);
  const clipboardNodes = ref<CanvasNode[]>([]);
  const interaction = ref<Interaction | null>(null);
  const contextMenu = ref<ContextMenuState | null>(null);
  const draggedCandidateId = ref<string | null>(null);
  const loadingDrop = ref(false);
  const importNotice = ref<string | null>(null);
  let importNoticeTimer: number | null = null;
  let clipboardPasteCount = 0;

  // --- helpers ---
  function getRootNode(nodeId: string) {
    return canvasNodes.value.find((n) => n.id === nodeId) ?? null;
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
  function toCanvasPoint(clientX: number, clientY: number): Point {
    const rect = canvasRef.value?.getBoundingClientRect();
    const screenX = clientX - (rect?.left ?? 0);
    const screenY = clientY - (rect?.top ?? 0);
    return { x: (screenX - viewPan.value.x) / viewZoom.value, y: (screenY - viewPan.value.y) / viewZoom.value };
  }
  function getCandidate(candidateId: string) {
    return generatedCandidates.value.find((c) => c.id === candidateId)
      ?? candidates.find((c) => c.id === candidateId);
  }

  // --- computed ---
  const selectedNodes = computed(() =>
    selectedIds.value.map((id) => getRootNode(id)).filter((n): n is CanvasNode => !!n),
  );
  const selectionBounds = computed<Bounds | null>(() =>
    computeBounds(canvasNodes.value, selectedIds.value),
  );
  const selectionFrame = computed(() => {
    const bounds = selectionBounds.value;
    const node = selectedIds.value.length === 1 ? getRootNode(selectedIds.value[0]!) : null;
    if (!bounds || !node) return bounds ? { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height, rotation: 0 } : null;
    return {
      x: node.x,
      y: node.y,
      width: node.width * node.scaleX,
      height: node.height * node.scaleY,
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
      const node = getRootNode(id);
      if (!node) return null;
      return { key: `node:${id}`, itemIds: [id], bounds: collectNodeBounds(node) } satisfies SelectionUnit;
    }).filter((u): u is SelectionUnit => !!u),
  );
  const isPanning = computed(() => interaction.value?.type === "pan");
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const canCopy = computed(() => selectedNodes.value.length > 0);
  const canDelete = computed(() => selectedNodes.value.length > 0);
  const canPaste = computed(() => clipboardNodes.value.length > 0);
  const canGroup = computed(() => selectedNodes.value.length > 1);
  const canCompose = computed(() => selectedNodes.value.length > 1);
  const canFacet = computed(() => selectedNodes.value.length > 0);
  const canUngroup = computed(() => selectedNodes.value.some((n) => n.kind === "group"));
  const canMoveSelectionForward = computed(() => {
    const sel = new Set(selectedIds.value);
    return canvasNodes.value.some((n, i) => {
      const next = canvasNodes.value[i + 1];
      return sel.has(n.id) && !!next && !sel.has(next.id);
    });
  });
  const canMoveSelectionBackward = computed(() => {
    const sel = new Set(selectedIds.value);
    return canvasNodes.value.some((n, i) => {
      const prev = canvasNodes.value[i - 1];
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
    const x = frame.x + frame.width + 22 / viewZoom.value;
    const y = frame.y - 22 / viewZoom.value;
    const dx = x - cx; const dy = y - cy;
    return {
      x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: cy + dx * Math.sin(radians) + dy * Math.cos(radians),
      stemX: cx + (frame.x + frame.width - cx) * Math.cos(radians) - (frame.y - cy) * Math.sin(radians),
      stemY: cy + (frame.x + frame.width - cx) * Math.sin(radians) + (frame.y - cy) * Math.cos(radians),
    };
  });

  // --- history ---
  function captureCanvasHistory(): CanvasHistorySnapshot {
    return { nodes: canvasNodes.value.map((n) => cloneCanvasNode(n)), selectedIds: [...selectedIds.value] };
  }
  function pushCanvasHistory() {
    undoStack.value.push(captureCanvasHistory());
    if (undoStack.value.length > historyLimit) undoStack.value.shift();
    redoStack.value = [];
  }
  function restoreCanvasHistory(snapshot: CanvasHistorySnapshot) {
    interaction.value = null;
    detachPointerListeners();
    canvasNodes.value = snapshot.nodes.map((n) => cloneCanvasNode(n));
    setSelection(snapshot.selectedIds);
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
    ids.forEach((id) => { if (getRootNode(id)) normalized.add(id); });
    return canvasNodes.value.filter((n) => normalized.has(n.id)).map((n) => n.id);
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
    selectedIds.value = [];
  }
  function deleteSelectedNodes() {
    const sel = new Set(selectedIds.value);
    if (sel.size === 0) return;
    pushCanvasHistory();
    canvasNodes.value = canvasNodes.value.filter((n) => !sel.has(n.id));
    selectedIds.value = [];
    contextMenu.value = null;
  }
  function closeContextMenu() { contextMenu.value = null; }

  function cloneCanvasNodeForPaste(node: CanvasNode): CanvasNode {
    const nextId = crypto.randomUUID();
    if (node.kind === "leaf") {
      return { ...node, id: nextId, name: `${node.name} copy`, content: scopeSvgContent(node.content, nextId) };
    }
    return { ...node, id: nextId, name: `${node.name} copy`, children: node.children.map((c) => cloneCanvasNodeForPaste(c)) };
  }
  function copySelectedNodes() {
    const sel = new Set(selectedIds.value);
    const copied = canvasNodes.value.filter((n) => sel.has(n.id)).map((n) => cloneCanvasNode(n));
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
    const canvasBounds = getCanvasBounds();
    const intendedDx = point ? point.x - (bounds.minX + bounds.width / 2) : clipboardPasteCount * 16;
    const intendedDy = point ? point.y - (bounds.minY + bounds.height / 2) : clipboardPasteCount * 16;
    const dx = clamp(intendedDx, canvasBounds.minX - bounds.minX, canvasBounds.maxX - bounds.maxX);
    const dy = clamp(intendedDy, canvasBounds.minY - bounds.minY, canvasBounds.maxY - bounds.maxY);
    nextNodes.forEach((n) => { n.x += dx; n.y += dy; });
    pushCanvasHistory();
    canvasNodes.value.push(...nextNodes);
    setSelection(nextNodes.map((n) => n.id));
  }

  // --- import ---
  function countTemplateNodes(nodes: import("./types").ParsedSvgTemplateNode[]): number {
    return nodes.reduce((count, n) => n.kind === "leaf" ? count + 1 : count + 1 + countTemplateNodes(n.children), 0);
  }
  function setImportNotice(message: string) {
    importNotice.value = message;
    if (importNoticeTimer !== null) window.clearTimeout(importNoticeTimer);
    importNoticeTimer = window.setTimeout(() => { importNotice.value = null; importNoticeTimer = null; }, 4000);
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
    const bounds = selectionBounds.value;
    if ((type === "facet" ? !canFacet.value : !canCompose.value) || !bounds) return;
    const selected = new Set(selectedIds.value);
    const nodes = canvasNodes.value.filter((node) => selected.has(node.id));
    const option = compositionOptions.find((item) => item.value === type);
    if (!option || nodes.length < (type === "facet" ? 1 : 2)) return;

    if (type === "facet") {
      const layouts = [
        ...createCartesianFacetLayouts(nodes, bounds).map((layout) => ({
          ...layout,
          coordinateSystem: "Cartesian" as const,
          unavailable: false,
        })),
        ...createPolarFacetLayouts(nodes, bounds).map((layout) => ({
          ...layout,
          coordinateSystem: "Polar" as const,
          unavailable: layout.unavailable ?? false,
        })),
      ];
      const candidatesForLayouts = layouts
        .map((layout) => createGeneratedCandidate(
          type,
          `${layout.coordinateSystem}: ${layout.name}`,
          layout.nodes,
          layout.coordinateSystem,
          layout.unavailable,
        ))
        .filter((candidate): candidate is SvgCandidate => !!candidate);
      generatedCandidates.value
        .filter((candidate) => candidate.compositionType === "facet")
        .forEach((candidate) => URL.revokeObjectURL(candidate.src));
      generatedCandidates.value = [
        ...candidatesForLayouts,
        ...generatedCandidates.value.filter(
          (candidate) => candidate.compositionType !== "facet",
        ),
      ];
      setImportNotice(`${candidatesForLayouts.length} facet layouts added.`);
      return;
    }

    const svgMarkup = createCanvasNodesSvgMarkup(nodes, bounds);
    const sequence = generatedCandidates.value.filter(
      (candidate) => candidate.compositionType === type,
    ).length + 1;
    const id = `composition:${type}:${crypto.randomUUID()}`;
    generatedCandidates.value = [
      {
        id,
        name: `${option.label} composition ${sequence}`,
        chartType: "Composition",
        coordinateSystem: "None",
        src: URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml" })),
        compositionType: type,
        svgMarkup,
      },
      ...generatedCandidates.value,
    ];
    setImportNotice(`${option.label} preview added.`);
  }
  function createCanvasNodesFromTemplate(
    sourceId: string,
    name: string,
    template: ParsedSvgTemplate,
    point: Point,
    forceOuterGroup = false,
  ) {
    const initialWidth = 800;
    const scale = initialWidth / template.width;
    const size = { width: initialWidth, height: template.height * scale };
    const canvasBounds = getCanvasBounds();
    const x = clamp(point.x - size.width / 2, canvasBounds.minX, canvasBounds.maxX - size.width);
    const y = clamp(point.y - size.height / 2, canvasBounds.minY, canvasBounds.maxY - size.height);
    const nameCounters = { leaf: 0, group: 0 };
    const instantiateNode = (node: import("./types").ParsedSvgTemplateNode, parentBounds: import("./types").Bounds | null): CanvasNode => {
      const isRoot = !parentBounds;
      const nodeX = isRoot ? x + (node.bounds.minX - template.minX) * scale : node.bounds.minX - parentBounds!.minX;
      const nodeY = isRoot ? y + (node.bounds.minY - template.minY) * scale : node.bounds.minY - parentBounds!.minY;
      const nodeScaleX = isRoot ? scale : 1;
      const nodeScaleY = isRoot ? scale : 1;
      if (node.kind === "leaf") {
        const id = crypto.randomUUID();
        nameCounters.leaf += 1;
        return { kind: "leaf", id, candidateId: sourceId, name: `${name}-${nameCounters.leaf}`, content: scopeSvgContent(node.content, id), viewBox: node.viewBox, width: Math.max(node.bounds.width, 1), height: Math.max(node.bounds.height, 1), x: nodeX, y: nodeY, scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, contentMinX: node.contentMinX, contentMinY: node.contentMinY } satisfies CanvasLeafNode;
      }
      nameCounters.group += 1;
      return { kind: "group", id: crypto.randomUUID(), name: `${name}-group-${nameCounters.group}`, x: nodeX, y: nodeY, width: Math.max(node.bounds.width, 1), height: Math.max(node.bounds.height, 1), scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, children: node.children.map((c) => instantiateNode(c, node.bounds)) } satisfies CanvasGroupNode;
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
    pushCanvasHistory();
    canvasNodes.value.push(...nextItems);
    setSelection(nextItems[0] ? [nextItems[0].id] : []);
    setImportNotice(countTemplateNodes(template.nodes) > 1 ? `${name}: imported ${countTemplateNodes(template.nodes)} SVG tree nodes.` : `${name}: imported as a single SVG node.`);
  }
  async function createCanvasItem(candidate: SvgCandidate, point: Point) {
    loadingDrop.value = true;
    try {
      const template = candidate.svgMarkup
        ? parseSvgTemplate(candidate.svgMarkup)
        : await loadSvgTemplate(candidate.id);
      createCanvasNodesFromTemplate(
        candidate.id,
        candidate.name,
        template,
        point,
        !!candidate.compositionType,
      );
    }
    finally { loadingDrop.value = false; }
  }
  async function insertCompositionCandidate(candidate: SvgCandidate) {
    if (candidate.unavailable) return;
    const bounds = getCanvasBounds();
    await createCanvasItem(candidate, {
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + bounds.height / 2,
    });
  }
  async function createCanvasNodesFromFile(file: File, point: Point) {
    loadingDrop.value = true;
    try { const markup = await file.text(); const t = parseSvgTemplate(markup); createCanvasNodesFromTemplate(`file:${file.name}:${crypto.randomUUID()}`, file.name.replace(/\.svg$/i, ""), t, point); }
    finally { loadingDrop.value = false; }
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
    const bounds = computeBounds(canvasNodes.value, itemIds);
    if (!bounds) return;
    const snapshots = Object.fromEntries(itemIds.map((id) => { const item = getRootNode(id); return [id, { x: item?.x ?? 0, y: item?.y ?? 0 }]; }));
    interaction.value = { type: "move", startPoint: toCanvasPoint(event.clientX, event.clientY), startBounds: bounds, itemIds, snapshots, historyCommitted: false };
    attachPointerListeners();
  }
  function onCanvasNodePointerDown(node: CanvasNode, event: PointerEvent) {
    if (event.button !== 0) return;
    contextMenu.value = null;
    event.stopPropagation();
    const targetIds = normalizeSelection([node.id]);
    const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
    if (hasModifier) { toggleSelection(targetIds); return; }
    const nextSelection = selectedIds.value.includes(node.id) ? selectedIds.value : targetIds;
    setSelection(nextSelection);
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
    interaction.value = { type: "marquee", startPoint: toCanvasPoint(event.clientX, event.clientY), currentPoint: toCanvasPoint(event.clientX, event.clientY) };
    attachPointerListeners();
  }
  function onScaleHandlePointerDown(handle: ScaleHandle, event: PointerEvent) {
    if (event.button !== 0 || !selectionBounds.value) return;
    event.stopPropagation();
    const snapshots = Object.fromEntries(selectedIds.value.map((id) => { const item = getRootNode(id); return [id, { x: item?.x ?? 0, y: item?.y ?? 0, scaleX: item?.scaleX ?? 1, scaleY: item?.scaleY ?? 1 }]; }));
    interaction.value = { type: "scale", handle, startPoint: toCanvasPoint(event.clientX, event.clientY), startBounds: selectionBounds.value, itemIds: [...selectedIds.value], snapshots, historyCommitted: false };
    attachPointerListeners();
  }
  function onRotateHandlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || !selectionBounds.value || selectedIds.value.length === 0) return;
    event.stopPropagation();
    const bounds = selectionBounds.value;
    const center = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
    const point = toCanvasPoint(event.clientX, event.clientY);
    const snapshots = Object.fromEntries(selectedIds.value.map((id) => {
      const item = getRootNode(id);
      return [id, { x: item?.x ?? 0, y: item?.y ?? 0, rotation: item?.rotation ?? 0 }];
    }));
    interaction.value = { type: "rotate", startPoint: point, center, startAngle: Math.atan2(point.y - center.y, point.x - center.x), itemIds: [...selectedIds.value], snapshots, historyCommitted: false };
    attachPointerListeners();
  }
  function updateRotateInteraction(currentPoint: Point, ri: RotateInteraction) {
    const angle = Math.atan2(currentPoint.y - ri.center.y, currentPoint.x - ri.center.x) - ri.startAngle;
    const degrees = angle * 180 / Math.PI;
    ri.itemIds.forEach((id) => {
      const item = getRootNode(id); const snap = ri.snapshots[id];
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
    selectedIds.value.forEach((id) => { const item = getRootNode(id); if (item) item.rotation = next; });
    rotationInputVisible.value = true;
  }
  function updateMoveInteraction(currentPoint: Point, mi: MoveInteraction) {
    const canvasBounds = getCanvasBounds();
    const dx = clamp(currentPoint.x - mi.startPoint.x, canvasBounds.minX - mi.startBounds.minX, canvasBounds.maxX - mi.startBounds.maxX);
    const dy = clamp(currentPoint.y - mi.startPoint.y, canvasBounds.minY - mi.startBounds.minY, canvasBounds.maxY - mi.startBounds.maxY);
    mi.itemIds.forEach((id) => { const item = getRootNode(id); const snap = mi.snapshots[id]; if (!item || !snap) return; item.x = snap.x + dx; item.y = snap.y + dy; });
  }
  function updateScaleInteraction(currentPoint: Point, si: ScaleInteraction) {
    const canvasBounds = getCanvasBounds();
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
    si.itemIds.forEach((id) => { const item = getRootNode(id); const snap = si.snapshots[id]; if (!item || !snap) return; item.x = anchor.x + (snap.x - anchor.x) * scale; item.y = anchor.y + (snap.y - anchor.y) * scale; item.scaleX = Math.max(snap.scaleX * scale, 0.01); item.scaleY = Math.max(snap.scaleY * scale, 0.01); });
  }
  function finalizeMarqueeSelection(mi: MarqueeInteraction) {
    const bounds = normalizeBounds(mi.startPoint, mi.currentPoint);
    if (bounds.width < 3 && bounds.height < 3) { selectedIds.value = []; return; }
    const hitIds = canvasNodes.value.filter((item) => {
      const b = collectNodeBounds(item);
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
    if (ai.type === "marquee") { ai.currentPoint = point; return; }
    if (ai.type === "move") {
      if (!ai.historyCommitted && (Math.abs(point.x - ai.startPoint.x) > 0.1 || Math.abs(point.y - ai.startPoint.y) > 0.1)) { pushCanvasHistory(); ai.historyCommitted = true; }
      updateMoveInteraction(point, ai);
      return;
    }
    if (ai.type === "rotate") {
      if (!ai.historyCommitted && Math.hypot(point.x - ai.startPoint.x, point.y - ai.startPoint.y) > 0.1) { pushCanvasHistory(); ai.historyCommitted = true; }
      updateRotateInteraction(point, ai);
      return;
    }
    if (!ai.historyCommitted && (Math.abs(point.x - ai.startPoint.x) > 0.1 || Math.abs(point.y - ai.startPoint.y) > 0.1)) { pushCanvasHistory(); ai.historyCommitted = true; }
    updateScaleInteraction(point, ai);
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
  function onCandidateDragStart(candidate: SvgCandidate, event: DragEvent) {
    draggedCandidateId.value = candidate.id;
    event.dataTransfer?.setData("application/x-svg-candidate", candidate.id);
    event.dataTransfer?.setData("text/plain", candidate.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
  }
  function onCandidateDragEnd() { draggedCandidateId.value = null; }
  function onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  async function onCanvasDrop(event: DragEvent) {
    event.preventDefault();
    const point = toCanvasPoint(event.clientX, event.clientY);
    const droppedFile = Array.from(event.dataTransfer?.files ?? []).find(
      (f) => f.type === "image/svg+xml" || /\.svg$/i.test(f.name),
    );
    if (droppedFile) {
      await createCanvasNodesFromFile(droppedFile, point);
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
    await createCanvasItem(candidate, point);
    draggedCandidateId.value = null;
  }

  // --- movement / ordering / grouping ---
  function moveItems(itemIds: string[], dx: number, dy: number) {
    itemIds.forEach((id) => { const item = getRootNode(id); if (!item) return; item.x += dx; item.y += dy; });
  }
  function reorderSelectedNodes(action: LayerOrderAction) {
    const sel = new Set(selectedIds.value);
    if (sel.size === 0) return;
    const selected = canvasNodes.value.filter((n) => sel.has(n.id));
    const unselected = canvasNodes.value.filter((n) => !sel.has(n.id));
    let nextNodes: CanvasNode[];
    switch (action) {
      case "front": nextNodes = [...unselected, ...selected]; break;
      case "back":  nextNodes = [...selected, ...unselected]; break;
      case "forward":
        nextNodes = [...canvasNodes.value];
        for (let i = nextNodes.length - 2; i >= 0; i -= 1) {
          const n = nextNodes[i], m = nextNodes[i + 1];
          if (n && m && sel.has(n.id) && !sel.has(m.id)) { nextNodes[i] = m; nextNodes[i + 1] = n; }
        }
        break;
      default:
        nextNodes = [...canvasNodes.value];
        for (let i = 1; i < nextNodes.length; i += 1) {
          const n = nextNodes[i], p = nextNodes[i - 1];
          if (n && p && sel.has(n.id) && !sel.has(p.id)) { nextNodes[i - 1] = n; nextNodes[i] = p; }
        }
        break;
    }
    const changed = nextNodes.some((n, i) => n.id !== canvasNodes.value[i]?.id);
    if (!changed) return;
    pushCanvasHistory();
    canvasNodes.value = nextNodes;
  }
  function groupSelectedItems() {
    const groupBounds = selectionBounds.value;
    if (!canGroup.value || !groupBounds) return;
    pushCanvasHistory();
    const sel = new Set(selectedIds.value);
    const insertIndex = canvasNodes.value.findIndex((n) => sel.has(n.id));
    const nextGroupId = crypto.randomUUID();
    const nextChildren = canvasNodes.value
      .filter((n) => sel.has(n.id))
      .map((n) => ({ ...n, x: n.x - groupBounds.minX, y: n.y - groupBounds.minY }));
    canvasNodes.value = canvasNodes.value.filter((n) => !sel.has(n.id));
    canvasNodes.value.splice(
      insertIndex < 0 ? canvasNodes.value.length : insertIndex,
      0,
      { kind: "group", id: nextGroupId, name: `group-${nextGroupId.slice(0, 8)}`, x: groupBounds.minX, y: groupBounds.minY, width: groupBounds.width, height: groupBounds.height, scaleX: 1, scaleY: 1, rotation: 0, children: nextChildren } satisfies CanvasGroupNode,
    );
    setSelection([nextGroupId]);
  }
  function ungroupSelectedItems() {
    const groupIds = new Set(
      selectedNodes.value.filter((n): n is CanvasGroupNode => n.kind === "group").map((n) => n.id),
    );
    if (groupIds.size === 0) return;
    pushCanvasHistory();
    const nextRoots: CanvasNode[] = [];
    const nextSel: string[] = [];
    canvasNodes.value.forEach((node) => {
      if (node.kind !== "group" || !groupIds.has(node.id)) { nextRoots.push(node); return; }
      node.children.forEach((child) => {
        const flat = { ...child, x: node.x + child.x * node.scaleX, y: node.y + child.y * node.scaleY, scaleX: child.scaleX * node.scaleX, scaleY: child.scaleY * node.scaleY } satisfies CanvasNode;
        nextRoots.push(flat);
        nextSel.push(flat.id);
      });
    });
    canvasNodes.value = nextRoots;
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
    canvasNodes.value.forEach((node) => {
      if (node.kind !== "group" || !groupIds.has(node.id)) { nextRoots.push(node); return; }
      flattenGroupToLeaves(node).forEach((leaf) => { nextRoots.push(leaf); nextSel.push(leaf.id); });
    });
    canvasNodes.value = nextRoots;
    setSelection(nextSel);
  }
  function alignSelection(mode: "left" | "right" | "top" | "bottom" | "center-x" | "center-y") {
    const units = selectionUnits.value;
    const bounds = selectionBounds.value;
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
    if (event.key === "Escape") { contextMenu.value = null; return; }
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
  onBeforeUnmount(() => {
    detachPointerListeners();
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("click", closeContextMenu);
    if (importNoticeTimer !== null) window.clearTimeout(importNoticeTimer);
    generatedCandidates.value.forEach((candidate) => URL.revokeObjectURL(candidate.src));
  });

  return {
    candidates,
    selectedChartType,
    previewableCandidates,
    compositionCandidates,
    availableChartTypes,
    filteredCandidates,
    canvasNodes,
    viewZoom,
    viewPan,
    selectedIds,
    interaction,
    contextMenu,
    draggedCandidateId,
    loadingDrop,
    importNotice,
    selectedNodes,
    selectionBounds,
    selectionFrame,
    selectionRotation,
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
    onCanvasDrop,
    onCanvasWheel,
    onCanvasContextMenu,
    onCanvasNodePointerDown,
    onCanvasNodeContextMenu,
    onScaleHandlePointerDown,
    onRotateHandlePointerDown,
    setSelectionRotation,
    onCandidateDragStart,
    onCandidateDragEnd,
    insertCompositionCandidate,
    undoCanvasChange,
    redoCanvasChange,
    clearCanvas,
    deleteSelectedNodes,
    copySelectedNodes,
    pasteClipboardNodes,
    selectedCoordinateSystems,
    toggleCoordinateSystem,
    createCompositionCandidate,
    groupSelectedItems,
    ungroupSelectedItems,
    dissolveSelectedGroups,
    reorderSelectedNodes,
    alignSelection,
    resetCanvasZoom,
  };
}
