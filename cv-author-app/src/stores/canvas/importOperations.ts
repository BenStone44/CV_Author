import type {
  Bounds,
  CanvasGroupNode,
  CanvasLeafNode,
  CanvasNode,
  ChartSpec,
  CompositionType,
  CoordinateSystem,
  GeographicLayerConfig,
  GeographicMapViewState,
  ParsedSvgTemplate,
  ParsedSvgTemplateNode,
  Point,
  SvgCandidate,
} from "../../types";
import { defaultDatasetForChartType } from "../../utils/defaultChartData";
import { parseEmbeddedPoint } from "../../utils/geoJsonGeometry";

export function useCanvasImportOperations(context: any) {
  const {
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
  } = context;
  let importNoticeTimer: number | null = null;

  function setImportNotice(message: string) {
    importNotice.value = message;
    if (importNoticeTimer !== null) window.clearTimeout(importNoticeTimer);
    importNoticeTimer = window.setTimeout(() => { importNotice.value = null; importNoticeTimer = null; }, 4000);
  }
  function clearImportNoticeTimer() {
    if (importNoticeTimer !== null) window.clearTimeout(importNoticeTimer);
    importNoticeTimer = null;
  }
  function createInitialChartSpec(chartType: string, datasetId: string): ChartSpec {
    const defaultSpec = createDefaultChartSpec(chartType);
    const unbound = createUnboundChartSpec(chartType, datasetId);
    const normalizedChartType = chartType.replace(/[\s_-]/g, "").toLowerCase();
    const dataset = getDataset(datasetId);
    if (normalizedChartType === "forcedirectedgraph" && dataset?.graph) {
      const nodeColumns = dataset.graph.nodes.columns;
      const edgeColumns = dataset.graph.edges.columns;
      const findColumn = (columns: typeof nodeColumns, names: string[]) => {
        const column = columns.find((candidate) => names.includes(candidate.name.toLowerCase()));
        return column ? { field: column.name, type: column.type } : undefined;
      };
      const key = findColumn(nodeColumns, ["id", "node_id", "key"]);
      const source = findColumn(edgeColumns, ["source", "from", "source_id"]);
      const target = findColumn(edgeColumns, ["target", "to", "target_id"]);
      const value = findColumn(edgeColumns, ["value", "weight", "link_value"]);
      const color = findColumn(nodeColumns, ["group", "category", "color"]);
      const size = findColumn(nodeColumns, ["size", "weight", "value"]);
      return {
        ...unbound,
        encodings: {
          ...(key ? { key } : {}),
          ...(source ? { source } : {}),
          ...(target ? { target } : {}),
          ...(value?.type === "quantitative" ? { value } : {}),
          ...(color ? { color } : {}),
          ...(size?.type === "quantitative" ? { size } : {}),
        },
      };
    }
    if (normalizedChartType.includes("graphlink") && dataset?.graph) {
      const edgeColumns = dataset.graph.edges.columns;
      const findColumn = (names: string[]) => {
        const column = edgeColumns.find((candidate) => names.includes(candidate.name.toLowerCase()));
        return column ? { field: column.name, type: column.type } : undefined;
      };
      const source = findColumn(["source", "from", "source_id"]);
      const target = findColumn(["target", "to", "target_id"]);
      const value = findColumn(["value", "weight", "link_value"]);
      return {
        ...unbound,
        encodings: {
          ...(source ? { source } : {}),
          ...(target ? { target } : {}),
          ...(value?.type === "quantitative" ? { value } : {}),
        },
      };
    }
    if (normalizedChartType === "chord" && dataset?.graph) {
      const edgeColumns = dataset.graph.edges.columns;
      const findColumn = (names: string[]) => {
        const column = edgeColumns.find((candidate) => names.includes(candidate.name.toLowerCase()));
        return column ? { field: column.name, type: column.type } : undefined;
      };
      const source = findColumn(["source", "from", "source_id"]);
      const target = findColumn(["target", "to", "target_id"]);
      const value = findColumn(["value", "weight", "link_value"]);
      return {
        ...unbound,
        encodings: {
          ...(source ? { source } : {}),
          ...(target ? { target } : {}),
          ...(value?.type === "quantitative" ? { value } : {}),
        },
      };
    }
    return defaultSpec ? { ...unbound, defaultDataBinding: true } : unbound;
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
    rootSizingBounds?: Bounds,
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
    const instantiateNode = (node: ParsedSvgTemplateNode, parentBounds: Bounds | null): CanvasNode => {
      const isRoot = !parentBounds;
      const nodeBounds = isRoot && rootSizingBounds ? rootSizingBounds : node.bounds;
      const id = crypto.randomUUID();
      const nodeX = isRoot ? x + (nodeBounds.minX - template.minX) * scale : node.bounds.minX - parentBounds!.minX;
      const nodeY = isRoot ? y + (nodeBounds.minY - template.minY) * scale : node.bounds.minY - parentBounds!.minY;
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
                ? node.contentMinY + nodeBounds.height
                : nodeBounds.height,
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
        return { kind: "leaf", id, candidateId: sourceId, name: `${name}-${nameCounters.leaf}`, content: scopeSvgContent(node.content, id), viewBox: node.viewBox, width: Math.max(nodeBounds.width, 1), height: Math.max(nodeBounds.height, 1), x: nodeX, y: nodeY, scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, contentMinX: node.contentMinX, contentMinY: node.contentMinY, coordinateGuide, chartSpec, layerKind, deckglLayerType, deckglDatasetId: layerKind === "deckgl" ? datasetId : undefined, mapStyleUrl, deckglConfig: initialDeckglConfig ? { ...initialDeckglConfig } : undefined } satisfies CanvasLeafNode;
      }
      nameCounters.group += 1;
      const groupName = node.name ? `${name}-${node.name}` : `${name}-group-${nameCounters.group}`;
      return { kind: "group", id, name: groupName, x: nodeX, y: nodeY, width: Math.max(nodeBounds.width, 1), height: Math.max(nodeBounds.height, 1), scaleX: nodeScaleX, scaleY: nodeScaleY, rotation: 0, coordinateGuide, chartSpec, layerKind, deckglLayerType, deckglDatasetId: layerKind === "deckgl" ? datasetId : undefined, mapStyleUrl, deckglConfig: initialDeckglConfig ? { ...initialDeckglConfig } : undefined, children: node.children.map((c) => instantiateNode(c, node.bounds)) } satisfies CanvasGroupNode;
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
      const templateFamily = normalizeChartTemplate(candidate.chartType);
      const usesBarTemplateFrame = candidate.id.startsWith("builtin-template:")
        && candidate.coordinateSystem === "Cartesian"
        && templateFamily === "line";
      const barCandidate = usesBarTemplateFrame
        ? getCandidate("builtin-template:single-bar")
        : undefined;
      const barTemplate = barCandidate?.svgMarkup
        ? parseSvgTemplate(barCandidate.svgMarkup)
        : undefined;
      const rootSizingBounds = templateFamily === "area"
        ? {
          minX: template.minX,
          minY: template.minY,
          maxX: template.minX + template.width,
          maxY: template.minY + template.height,
          width: template.width,
          height: template.height,
        }
        : barTemplate?.nodes.length === 1
          ? barTemplate.nodes[0]?.bounds
          : undefined;
      return createCanvasNodesFromTemplate(
        candidate.id,
        candidate.name,
        template,
        point,
        !!candidate.compositionType,
        candidate.coordinateSystem,
        candidate.renderMode === "static-layer" ? undefined : candidate.chartType,
        activeDataset.value?.id
          ?? (templateFamily === "flow" && candidate.chartType.replace(/[\s_-]/g, "").toLowerCase() === "chord"
            ? defaultDatasetForChartType(candidate.chartType).id
            : undefined),
        candidate.renderMode === "static-layer" ? "deckgl" : undefined,
        candidate.renderMode === "static-layer" ? candidate.layerType : undefined,
        candidate.renderMode === "static-layer" ? candidate.mapStyleUrl : undefined,
        candidate.defaultWidth,
        rootSizingBounds,
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
  function setDeckglEncoding(nodeId: string, channel: "position" | "color" | "size", field: string) {
    const node = findCanvasNode(nodeId);
    const binding = node?.deckglBinding;
    const dataset = node ? getDataset(binding?.datasetId ?? node.deckglDatasetId ?? "") : null;
    if (!node || !dataset) return;
    const columns = dataset.columns.length ? dataset.columns : dataset.graph?.nodes.columns ?? [];
    const column = columns.find((item) => item.name === field);
    const rows = dataset.rows.length ? dataset.rows : dataset.graph?.nodes.rows ?? [];
    if (channel === "position") {
      if (field && !rows.some((row) => parseEmbeddedPoint(row[field]) !== null)) return;
      if (field) {
        node.deckglBinding = {
          ...(binding ?? { datasetId: dataset.id, aggregation: "sum" as const }),
          pointField: field,
          geometrySourceId: undefined,
          idField: undefined,
        };
      } else if (binding) {
        node.deckglBinding = { ...binding, pointField: undefined };
      }
      return;
    }
    if (!binding) return;
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

  return {
    setImportNotice,
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
  };
}
