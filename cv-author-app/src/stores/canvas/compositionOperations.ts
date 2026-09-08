// This adapter receives a dynamically assembled canvas context. Its public
// operations are typed at the store boundary.
// @ts-nocheck
import type {
  Bounds,
  CanvasGroupNode,
  CanvasNode,
  ChartDropZone,
  ChartPlotArea,
  ChartRelationshipState,
  CompositionType,
  ConcatLinkSpec,
  CoordinateChannel,
  NestedBindingConfig,
  NestedRelationship,
  Point,
  RelativeNestedParameters,
  SvgCandidate,
} from "../../types";
import { normalizeNestedCallout } from "../../utils/nestedCallout";

// Nested children use an independent visual size scale. The parent mark only
// supplies the anchor location; it must not determine the child's base size.
const NESTED_DEFAULT_DIAMETER = 140;
const NESTED_MAX_DIAMETER = 360;
const COMPOSITION_DROP_ZONE_GAP_PX = 10;
const LAYER_DROP_ZONE_INSET_PX = 16;

function insetBounds(bounds: Bounds, insetX: number, insetY = insetX): Bounds {
  const appliedX = Math.min(Math.max(insetX, 0), bounds.width * 0.12);
  const appliedY = Math.min(Math.max(insetY, 0), bounds.height * 0.12);
  return {
    minX: bounds.minX + appliedX,
    minY: bounds.minY + appliedY,
    maxX: bounds.maxX - appliedX,
    maxY: bounds.maxY - appliedY,
    width: bounds.width - appliedX * 2,
    height: bounds.height - appliedY * 2,
  };
}

function insetPlotArea(area: ChartPlotArea, insetX: number, insetY: number): ChartPlotArea {
  const bounds = insetBounds({
    minX: area.x,
    minY: area.y,
    maxX: area.x + area.width,
    maxY: area.y + area.height,
    width: area.width,
    height: area.height,
  }, insetX, insetY);
  return { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height };
}

export function useCanvasCompositionOperations(context: any) {
  const {
    activeDropZone,
    activeNestedRelationshipId,
    axisBindingTarget,
    beginCompositionEditing,
    canvasRef,
    chartDrilldown,
    chartScalePosition,
    chartRelationships,
    clamp,
    cloneCanvasNodeForPaste,
    collectRenderedNodeSelectionBounds,
    collectNodeSelectionBounds,
    compositionCoordinateTargets,
    compositionDragSourceId,
    concatCompositionForNode,
    concatEdgeNodesAreCompatible,
    concatGraphMembers,
    concatLinkId,
    concatLinksFor,
    concatMemberChannelsForLinks,
    concatMemberSharedChannels,
    concatNodesAreCompatible,
    coordinateTargets,
    createPolarCoordinateSystemModel,
    currentDropZoneScopeNodes,
    csvRowKey,
    defaultRelativeParameters,
    dispatchRelationship,
    editingCompositionId,
    editingGroupPath,
    encodingForSharedChannel,
    findCanvasNode,
    firstChartNode,
    getCanvasNodeListBounds,
    getChartTemplateContract,
    getDataset,
    getPolarOccupiedGeometry,
    getGroupAtPath,
    getNodeSelectionBounds,
    getSelectionNode,
    getSelectionScopeNodes,
    getRootNode,
    getSelectionScopeBounds,
    inferColumnIntents,
    implementedTemplateDefinitions,
    inheritParentFacetClues,
    isAtomicChartReady,
    isCartesianCompositionChart,
    isPolarCompositionChart,
    mergeBounds,
    nestClueTransforms,
    nestedItemDataKey,
    nestedBindingTarget,
    nestedDropPath,
    nestedPositionRelationshipIds,
    nodeLocalToSelectionScopePoint,
    normalizeChartTemplate,
    pointInBounds,
    pointToSegmentDistance,
    polarPointAtAngle,
    prepareChartData,
    pushCanvasHistory,
    reconcileCoordinateSystems,
    registerChartRelationship,
    renderChartNode,
    renderSemanticNode,
    renderSharedCoordinateComposition,
    replaceSelectionScopeNodes,
    resolveNestedRelationship,
    resolveNestedFilterContexts,
    renderedNodeLocalSelectionBounds,
    resolveSemanticMarkMatch,
    restoreRelationships,
    retainSharedFacetClues,
    retireMergedCompositions,
    repeatableCompositionMembers,
    repeatableCompositionNodes,
    repeatableCompositionPairNodes,
    rowMatchesChartFilters,
    sameChannels,
    scheduleNestedChildLayout,
    selectedIds,
    selectedNodes,
    semanticSelection,
    semanticMarkElements,
    semanticSelectionBounds,
    selectionBounds,
    setImportNotice,
    setSelection,
    standaloneCoordinateSystem,
    sharedChannelEncodingsAreCompatible,
    snapshotRelationships,
    toNodeLocalPoint,
    toSelectionScopePoint,
    transformPoint,
    viewZoom,
    walkCanvasNodes,
    existingFlatCompositions,
    existingRepeatableCompositions,
    compatibleLayerChannels,
  } = context;
  let nestedRelationshipBaseSnapshot: ChartRelationshipState | null = null;

  function cartesianLayerZone<T extends { minY: number; height: number }>(
    _area: T,
    _pointY: number,
    channels: CoordinateChannel[],
  ) {
    return { channels, index: 0, count: 1 };
  }

  function renderedInteractionArea(node: CanvasNode): ChartPlotArea {
    const bounds = renderedNodeLocalSelectionBounds(node) ?? getNodeSelectionBounds(node);
    return {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.width,
      height: bounds.height,
    };
  }

  function attachParentCompositionContext(
    root: CanvasNode,
    compositionSpec: NonNullable<CanvasNode["compositionSpec"]>,
    coordinateSystem: CanvasNode["coordinateSystem"],
  ) {
    walkCanvasNodes([root]).forEach((node) => {
      const ancestors = (node.compositionAncestors ?? [])
        .filter((context) => context.compositionSpec.id !== compositionSpec.id);
      node.compositionAncestors = [...ancestors, { compositionSpec, coordinateSystem: coordinateSystem ?? null }];
      node.parentCompositionSpec = compositionSpec;
      node.parentCoordinateSystem = coordinateSystem;
    });
  }

  function restoreClosedCompositionClone(source: CanvasNode, clone: CanvasNode) {
    if (source.kind !== "group" || source.compositionSpec?.type === "concat") return;
    const sourceNodes = walkCanvasNodes([source]);
    const cloneNodes = walkCanvasNodes([clone]);
    if (sourceNodes.length !== cloneNodes.length) return;
    const idMap = new Map(sourceNodes.map((node, index) => [node.id, cloneNodes[index]!.id]));
    const compositionIds = new Map<string, string>();
    const compositionCache = new Map<string, NonNullable<CanvasNode["compositionSpec"]>>();
    const coordinateIds = new Map<string, string>();
    const coordinateCache = new Map<string, CoordinateSystemSpec>();
    const cloneComposition = (spec: NonNullable<CanvasNode["compositionSpec"]>) => {
      if (!spec.members.every((member) => idMap.has(member.nodeId))) return null;
      const cached = compositionCache.get(spec.id);
      if (cached) return cached;
      const id = compositionIds.get(spec.id) ?? `composition:${crypto.randomUUID()}`;
      compositionIds.set(spec.id, id);
      const next: NonNullable<CanvasNode["compositionSpec"]> = {
        ...spec,
        id,
        members: spec.members.map((member) => ({
          ...member,
          nodeId: idMap.get(member.nodeId)!,
          sourceNodeId: idMap.get(member.sourceNodeId) ?? member.sourceNodeId,
          sharedChannels: [...member.sharedChannels],
        })),
        sharedChannels: [...spec.sharedChannels],
        concatLinks: spec.concatLinks?.map((link) => ({
          ...link,
          targetNodeId: idMap.get(link.targetNodeId) ?? link.targetNodeId,
          sourceNodeId: idMap.get(link.sourceNodeId) ?? link.sourceNodeId,
          sharedChannels: [...link.sharedChannels],
        })),
        facetValues: spec.facetValues ? [...spec.facetValues] : undefined,
        facetGrid: spec.facetGrid
          ? { ...spec.facetGrid, rowValues: [...spec.facetGrid.rowValues], columnValues: [...spec.facetGrid.columnValues] }
          : undefined,
      };
      compositionCache.set(spec.id, next);
      return next;
    };
    const cloneCoordinateSystem = (system: CoordinateSystemSpec | null | undefined) => {
      if (!system
        || !idMap.has(system.ownerNodeId)
        || !system.members.every((member) => idMap.has(member.nodeId))) return null;
      const cached = coordinateCache.get(system.id);
      if (cached) return cached;
      const id = coordinateIds.get(system.id) ?? `coordinate:${crypto.randomUUID()}`;
      coordinateIds.set(system.id, id);
      const next: CoordinateSystemSpec = {
        ...system,
        id,
        ownerNodeId: idMap.get(system.ownerNodeId)!,
        members: system.members.map((member) => ({
          ...member,
          nodeId: idMap.get(member.nodeId)!,
          channels: [...member.channels],
        })),
        sharedChannels: [...system.sharedChannels],
        axisLabelDomains: system.axisLabelDomains
          ? {
            ...(system.axisLabelDomains.x ? { x: [...system.axisLabelDomains.x] } : {}),
            ...(system.axisLabelDomains.y ? { y: [...system.axisLabelDomains.y] } : {}),
            ...(system.axisLabelDomains.angle ? { angle: [...system.axisLabelDomains.angle] } : {}),
            ...(system.axisLabelDomains.radius ? { radius: [...system.axisLabelDomains.radius] } : {}),
          }
          : undefined,
      };
      coordinateCache.set(system.id, next);
      return next;
    };
    sourceNodes.forEach((sourceNode, index) => {
      const cloneNode = cloneNodes[index]!;
      cloneNode.compositionSpec = sourceNode.compositionSpec
        ? cloneComposition(sourceNode.compositionSpec)
        : null;
      cloneNode.coordinateSystem = cloneCoordinateSystem(sourceNode.coordinateSystem)
        ?? cloneNode.coordinateSystem;
      cloneNode.parentCompositionSpec = null;
      cloneNode.parentCoordinateSystem = null;
      cloneNode.compositionAncestors = [];
    });
  }

  function createDeckglLayer(
    targetNodeId: string,
    sourceNodeId: string,
    recordHistory = true,
  ) {
    const target = findCanvasNode(targetNodeId);
    const source = findCanvasNode(sourceNodeId);
    if (!target || !source || target.id === source.id
      || target.layerKind !== "deckgl" || source.layerKind !== "deckgl") return false;
    const targetStack = target.deckglLayerStack?.length ? target.deckglLayerStack : [target.id];
    const sourceStack = source.deckglLayerStack?.length ? source.deckglLayerStack : [source.id];
    if (targetStack.some((id) => sourceStack.includes(id))) return false;
    const stack = Array.from(new Set([...targetStack, ...sourceStack]));
    if (stack.length < 2) return false;
    if (recordHistory) pushCanvasHistory();
    const frame = {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      scaleX: target.scaleX,
      scaleY: target.scaleY,
      rotation: target.rotation,
    };
    target.deckglLayerStack = stack;
    stack.slice(1).forEach((id) => {
      const member = findCanvasNode(id);
      if (!member) return;
      member.x = frame.x;
      member.y = frame.y;
      member.width = frame.width;
      member.height = frame.height;
      member.scaleX = frame.scaleX;
      member.scaleY = frame.scaleY;
      member.rotation = frame.rotation;
      member.deckglLayerStack = stack;
    });
    setSelection([target.id]);
    axisBindingTarget.value = null;
    setImportNotice(`Layer created with ${stack.length} deck.gl maps.`);
    return true;
  }

  function createLayer(
    recordHistory = true,
    requestedChannels?: CoordinateChannel[],
    targetNodeId?: string,
    sourceNodeId?: string,
  ) {
    const targetNode = targetNodeId ? findCanvasNode(targetNodeId) : null;
    const sourceNode = sourceNodeId ? findCanvasNode(sourceNodeId) : null;
    const inputNodes = targetNode && sourceNode
      ? repeatableCompositionPairNodes(sourceNode, targetNode, "layer")
      : repeatableCompositionNodes(selectedNodes.value, "layer");
    const nodes = inputNodes?.filter(isAtomicChartReady) ?? [];
    if (nodes.length === 0 || !nodes.every(isAtomicChartReady)) return false;
    const compatibleChannels = compatibleLayerChannels(nodes);
    if (!compatibleChannels) return false;
    const coordinateType = (firstChartNode(nodes[0]!)?.coordinateGuide?.type
      ?? nodes[0]!.coordinateGuide?.type);
    if (!coordinateType) return false;
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
    const targetOwnerId = targetNode?.compositionSpec?.type === "layer"
      ? targetNode.coordinateSystem?.ownerNodeId
      : targetNode?.id;
    const owner = nodes.find((node) => node.id === targetOwnerId)
      ?? nodes.find((node) => node.id === retainedOwnerId)
      ?? [...nodes].sort((left, right) => {
        const score = (node: CanvasNode) => sharedChannels.reduce(
          (count, channel) => count + (encodingForSharedChannel(node, channel) ? 1 : 0),
          0,
        );
        return score(right) - score(left);
      })[0]!;
    const layerNodes = [owner, ...nodes.filter((node) => node.id !== owner.id)];
    const layerCharts = layerNodes.flatMap((node) =>
      node.chartSpec ? [node] : walkCanvasNodes([node]).filter((member) => !!member.chartSpec));
    const ownerChart = firstChartNode(owner) ?? layerCharts[0];
    if (!ownerChart?.coordinateGuide) return false;
    const layerId = crypto.randomUUID();
    const compositionId = retainedComposition?.id ?? `composition:${layerId}`;
    const coordinateSystemId = nodes.find((node) => node.compositionSpec?.id === retainedComposition?.id)
      ?.coordinateSystem?.id ?? `coordinate:${layerId}`;
    const system: CoordinateSystemSpec = {
      id: coordinateSystemId,
      type: coordinateType,
      ownerNodeId: ownerChart.id,
      sharedChannels,
      members: layerCharts.map((node) => ({ nodeId: node.id, channels: [...sharedChannels] })),
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
      coordinateGuide: { ...ownerChart.coordinateGuide, origin: { ...ownerChart.coordinateGuide.origin } },
    };
    layerNodes.forEach((node) => {
      node.x = frame.x;
      node.y = frame.y;
      node.width = frame.width;
      node.height = frame.height;
      node.scaleX = frame.scaleX;
      node.scaleY = frame.scaleY;
      node.rotation = frame.rotation;
      if (node.chartSpec) {
        node.coordinateGuide = { ...frame.coordinateGuide, origin: { ...frame.coordinateGuide.origin } };
      }
      if (node.compositionSpec && node.compositionSpec.type !== "concat") {
        attachParentCompositionContext(node, compositionSpec, system);
      } else {
        node.coordinateSystem = system;
        node.compositionSpec = compositionSpec;
      }
      node.layerSpec = null;
    });
    const layerNodeIds = new Set(layerNodes.map((node) => node.id));
    const layerBounds = getCanvasNodeListBounds(layerNodes);
    if (!layerBounds) return false;
    layerNodes.forEach((node) => {
      node.x -= layerBounds.minX;
      node.y -= layerBounds.minY;
    });
    const root: CanvasGroupNode = {
      kind: "group",
      id: `composition-root:${layerId}`,
      name: "Layer",
      x: layerBounds.minX,
      y: layerBounds.minY,
      width: Math.max(layerBounds.width, 1),
      height: Math.max(layerBounds.height, 1),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      coordinateSystem: system,
      compositionSpec,
      children: layerNodes,
    };
    replaceSelectionScopeNodes([
      ...getSelectionScopeNodes().filter((node) => !layerNodeIds.has(node.id)),
      root,
    ]);
    reconcileCoordinateSystems();
    renderSharedCoordinateComposition(root);
    setSelection([root.id]);
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
      ? (concatCompositionForNode(anchoredTarget)
        ?? concatCompositionForNode(anchoredSource))
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
          : !concatNodesAreCompatible(sourceNodes, direction, sharedChannel))
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
      const selectedSource = sourceNodes[0]!;
      const source = selectedSource.kind === "group"
        && selectedSource.compositionSpec?.type === "facet"
        ? selectedSource.children[0] ?? selectedSource
        : selectedSource;
      const sourceChart = firstChartNode(source);
      const recommendation = sourceChart?.chartSpec?.dimensionRecommendations?.find((item) => item.strategy === "facet");
      facetDirection = recommendation?.facetDirection;
      facetCoordinateSystem = recommendation?.facetCoordinateSystem ?? "Cartesian";
      facetThetaField = recommendation?.facetThetaField;
      facetRadiusField = recommendation?.facetRadiusField;
      const sourceDataset = sourceChart?.chartSpec ? getDataset(sourceChart.chartSpec.datasetId) : null;
      const dataset = sourceDataset && sourceChart?.chartSpec
        ? prepareChartData(sourceChart.id, sourceDataset, sourceChart.chartSpec).dataset
        : sourceDataset;
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
        restoreClosedCompositionClone(member, clone);
        facetSourceNodeIds.push(member.id);
        const baseX = type === "facet" ? bounds.minX : 0;
        const baseY = type === "facet" ? bounds.minY : 0;
        const offsetX = member.x - compositeBounds.minX;
        const offsetY = member.y - compositeBounds.minY;
        clone.name = rowValue !== undefined && columnValue !== undefined
          ? `${member.name} - ${rowValue} / ${columnValue}`
          : `${member.name} - ${rowValue ?? columnValue ?? ""}`;
        walkCanvasNodes([clone]).forEach((chart) => {
          if (!chart.chartSpec) return;
          const filters = { ...chart.chartSpec.filters };
          if (facetGrid && rowValue !== undefined && columnValue !== undefined) {
            filters[facetGrid.rowField] = rowValue;
            filters[facetGrid.columnField] = columnValue;
          } else if (facetField && (rowValue ?? columnValue) !== undefined) {
            filters[facetField] = (rowValue ?? columnValue)!;
          }
          chart.chartSpec = { ...chart.chartSpec, filters };
          renderChartNode(chart);
        });
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
      if (facetCoordinateSystem !== "Polar" && facetCompositeMemberCount === 1 && children[0]) {
        // Rendering can normalize a chart's frame and scale (notably legacy
        // line charts), so position cells using the rendered frame.
        const cellWidth = children[0].width * children[0].scaleX;
        const cellHeight = children[0].height * children[0].scaleY;
        const columnCount = facetGrid?.columnValues.length
          ?? (facetDirection === "row" ? 1 : Math.max(children.length, 1));
        children.forEach((child, index) => {
          child.x = bounds.minX + (index % columnCount) * (cellWidth + gap);
          child.y = bounds.minY + Math.floor(index / columnCount) * (cellHeight + gap);
        });
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
    const priorConcatLinks = existingConcatCompositions
      .flatMap((composition) => concatLinksFor(composition))
      .map((link, order) => ({ ...link, order }));
    const nextConcatLinks = type === "concat" && anchoredConcatSpec && anchoredTarget && anchoredSource
      ? [
        ...priorConcatLinks,
        {
          targetNodeId: anchoredTarget.id,
          sourceNodeId: anchoredSource.id,
          direction,
          position: concatPosition ?? "after",
          order: priorConcatLinks.length,
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
            order: index,
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
      concatCompositionForNode(node)?.id === retainedConcatComposition?.id,
    )?.parentCoordinateSystem ?? sourceNodes.find((node) =>
      concatCompositionForNode(node)?.id === retainedConcatComposition?.id,
    )?.coordinateSystem;
    const facetSharedChannels: CoordinateChannel[] = facetCoordinateSystem === "Polar"
      ? [facetDirection === "row" ? "radius" : "angle"]
      : [facetDirection === "row" ? "y" : "x"];
    const parentCoordinateSystem = type === "nested"
      ? sourceNodes[0]?.coordinateSystem ?? null
      : null;
    const coordinateMembers = children.flatMap((node) =>
      node.chartSpec ? [node] : walkCanvasNodes([node]).filter((member) => !!member.chartSpec));
    const coordinateOwner = firstChartNode(sourceNodes[0]) ?? coordinateMembers[0];
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
          : coordinateOwner?.coordinateGuide?.type ?? "CoordinateFree",
        ownerNodeId: type === "concat"
          ? retainedCoordinateSystem?.ownerNodeId ?? coordinateOwner?.id ?? sourceNodes[0]!.id
          : children[0]!.id,
        members: (type === "concat" ? coordinateMembers : children).map((node) => ({
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
      const preservesClosedChild = node.kind === "group"
        && !node.chartSpec
        && !!node.compositionSpec
        && node.compositionSpec.type !== "concat";
      if ((type === "concat" || type === "facet") && preservesClosedChild) {
        return;
      }
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
      children.forEach((node) => {
        const preservesClosedChild = node.kind === "group"
          && !node.chartSpec
          && !!node.compositionSpec
          && node.compositionSpec.type !== "concat";
        if ((type === "concat" || type === "facet") && preservesClosedChild) {
          attachParentCompositionContext(node, compositionSpec, coordinateSystem);
        } else {
          node.compositionSpec = compositionSpec;
        }
      });
      if (type === "facet" && facetCoordinateSystem === "Polar") {
        const anchorX = bounds.minX;
        const anchorY = bounds.minY;
        children.forEach((member) => {
          member.x = anchorX;
          member.y = anchorY;
          walkCanvasNodes([member]).forEach((chart) => {
            if (!chart.chartSpec) return;
            const contract = getChartTemplateContract(chart.chartSpec.chartType);
            if (contract?.family !== "line" && contract?.family !== "area") return;
            const localMinX = chart.kind === "leaf" ? chart.contentMinX : 0;
            const localMinY = chart.kind === "leaf" ? chart.contentMinY : 0;
            chart.coordinateGuide = {
              type: "Polar",
              origin: {
                x: localMinX + chart.width / 2,
                y: localMinY + chart.height / 2,
              },
              angleOffset: 0,
              angleSpan: 360,
              innerRadiusRatio: 0.18,
              outerRadiusRatio: 1,
              showThetaLine: false,
              showRadiusLine: false,
            };
            chart.coordinateSystem = {
              id: `coordinate:${chart.id}:polar-facet`,
              type: "Polar",
              ownerNodeId: chart.id,
              members: [{ nodeId: chart.id, channels: ["angle", "radius"] }],
              sharedChannels: [],
            };
            renderChartNode(chart);
          });
        });
      }
      if (type === "concat") renderSharedCoordinateComposition(children[0]!, true);
      const replacedIds = new Set(type === "concat"
        ? children.map((node) => node.id)
        : selectedIds.value);
      const remaining = getSelectionScopeNodes().filter((node) => !replacedIds.has(node.id));
      let selectedRootId = children[0]?.id;
      if (type === "facet") {
        const rootBounds = getCanvasNodeListBounds(children);
        if (!rootBounds) return false;
        children.forEach((node) => {
          node.x -= rootBounds.minX;
          node.y -= rootBounds.minY;
        });
        const root: CanvasGroupNode = {
          kind: "group",
          id: `composition-root:${compositionId}`,
          name: "Facet",
          x: rootBounds.minX,
          y: rootBounds.minY,
          width: Math.max(rootBounds.width, 1),
          height: Math.max(rootBounds.height, 1),
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          coordinateGuide: facetCoordinateSystem === "Polar"
            ? {
              type: "Polar",
              origin: {
                x: Math.max(rootBounds.width, 1) / 2,
                y: Math.max(rootBounds.height, 1) / 2,
              },
              angleOffset: 0,
              angleSpan: 360,
              innerRadiusRatio: 0.18,
              outerRadiusRatio: 1,
            }
            : null,
          coordinateSystem,
          compositionSpec,
          children,
        };
        replaceSelectionScopeNodes([...remaining, root]);
        selectedRootId = root.id;
      } else {
        replaceSelectionScopeNodes([...remaining, ...children]);
      }
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
      setSelection(selectedRootId ? [selectedRootId] : []);
      if (type === "concat") scheduleNestedChildrenForParents(children);
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

  function scheduleNestedChildrenForParents(parents: CanvasNode[]) {
    const parentIds = new Set(parents.flatMap((parent) =>
      walkCanvasNodes([parent]).map((node) => node.id)));
    const relationshipIds = Object.values(chartRelationships.value.nestedRelationships)
      .filter((relationship) => relationship.status === "active"
        && parentIds.has(relationship.parentChartId))
      .map((relationship) => relationship.id);
    if (relationshipIds.length > 0) scheduleNestedChildLayout(relationshipIds);
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
      ? createLayer(recordHistory, requestedChannels, targetNodeId, sourceNodeId)
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
      || (template !== "scatter" && template !== "matrix" && !hasScatterLayer)
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
      parentMarkGroupId: node.chartSpec.markGroups?.find((group) =>
        group.role === (template === "matrix" ? "cell" : "point"))?.id
        ?? node.layerSpec?.children
          .find((child) => normalizeChartTemplate(child.chartSpec.chartType) === "scatter")
          ?.chartSpec.markGroups?.find((group) => group.role === "point")?.id
        ?? `mark-group:${node.id}:${template === "matrix" ? "cell" : "point"}`,
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
            retainParent: config.retainParent ?? parameters.retainParent ?? false,
          } as RelativeNestedParameters,
        },
      });
    });
    scheduleNestedChildLayout(nestedPositionRelationshipIds.value);
  }

  function updateNestedChildScale(childNodeId: string, sizeRatio: number) {
    const child = findCanvasNode(childNodeId);
    if (!child) return;
    const ratio = clamp(Number.isFinite(sizeRatio) ? sizeRatio : 1, 0, 1);
    const relationships = Object.values(chartRelationships.value.nestedRelationships)
      .filter((relationship) => relationship.status === "active"
        && relationship.relationType === "relative-position"
        && (relationship.childChartId === childNodeId
          || (relationship.parameters as Partial<RelativeNestedParameters>).sourceChildId === childNodeId));
    if (relationships.length === 0) return;
    const batchIds = new Set(relationships
      .map((relationship) => (relationship.parameters as Partial<RelativeNestedParameters>).batchId)
      .filter((batchId): batchId is string => !!batchId));
    const targets = Object.values(chartRelationships.value.nestedRelationships).filter((relationship) => {
      if (relationship.status !== "active" || relationship.relationType !== "relative-position") return false;
      const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
      return relationship.childChartId === childNodeId
        || (batchIds.size > 0 && !!parameters.batchId && batchIds.has(parameters.batchId));
    });
    const maxDimension = Math.max(child.width, child.height, 1);
    const scale = ratio * NESTED_MAX_DIAMETER / maxDimension;
    pushCanvasHistory();
    targets.forEach((relationship) => {
      const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
      if (!parameters.parentAnchor || !parameters.childAnchor || !parameters.offset) return;
      dispatchRelationship({
        type: "update-nested",
        relationshipId: relationship.id,
        changes: {
          parameters: {
            ...parameters,
            scale: { x: scale, y: scale },
          } as RelativeNestedParameters,
        },
      });
    });
    scheduleNestedChildLayout(targets.map((relationship) => relationship.id));
  }

  function updateNestedCallout(config: { enabled?: boolean; scale?: number }) {
    const relationships = nestedPositionRelationshipIds.value
      .map((relationshipId) => chartRelationships.value.nestedRelationships[relationshipId])
      .filter((relationship): relationship is NestedRelationship => !!relationship);
    if (relationships.length === 0) return false;
    const changes = relationships.map((relationship) => {
      const parameters = relationship.parameters as Partial<RelativeNestedParameters>;
      const current = normalizeNestedCallout(parameters.callout);
      const next = normalizeNestedCallout({ ...current, ...config });
      return { relationship, parameters, current, next };
    });
    if (changes.every(({ current, next }) => current.enabled === next.enabled && current.scale === next.scale)) {
      return false;
    }
    pushCanvasHistory();
    const parentIds = new Set<string>();
    changes.forEach(({ relationship, parameters, next }) => {
      parentIds.add(relationship.parentChartId);
      dispatchRelationship({
        type: "update-nested",
        relationshipId: relationship.id,
        changes: {
          parameters: {
            ...parameters,
            callout: next,
          } as RelativeNestedParameters,
        },
      });
    });
    parentIds.forEach((parentId) => {
      const parent = findCanvasNode(parentId);
      if (parent?.renderedContent) renderChartNode(parent);
    });
    scheduleNestedChildLayout(changes.map(({ relationship }) => relationship.id));
    return true;
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

  function semanticItemDropZone(node: CanvasNode, point: Point, sourceNodeId: string): ChartDropZone | null {
    if (!node.chartSpec || node.id === sourceNodeId) return null;
    const contract = getChartTemplateContract(node.chartSpec.chartType);
    const normalizedChartType = node.chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase();
    // Network labels are siblings of the node mark in the SVG group. Treat
    // the node geometry as the nesting target so the label never expands the
    // drop zone or gets hidden when the parent mark is replaced.
    const directMarkNesting = contract?.family === "hierarchy" || normalizedChartType.includes("forcedirected");
    const nodeElement = Array.from(canvasRef.value?.querySelectorAll<SVGGraphicsElement>("[data-node-id]") ?? [])
      .find((element) => element.dataset.nodeId === node.id);
    if (!nodeElement) return null;
    const allMarks = Array.from(nodeElement.querySelectorAll<SVGGraphicsElement>("[data-mark-role]"))
      .filter((element) => !directMarkNesting || (
        element.getAttribute("data-mark-role") === contract?.markRole
        && element.getAttribute("data-chart-id") === node.id
      ));
    const activePath = nestedDropPath.value.at(-1);
    const marks = activePath?.nodeId === node.id
      ? activePath.childMarkIndexes.flatMap((index) => allMarks[index] ?? [])
      : allMarks;
    const markGeometryElement = (element: SVGGraphicsElement) => directMarkNesting
      ? element.getAttribute("data-mark-role") === "node"
        ? element.querySelector<SVGGraphicsElement>("circle, rect, path") ?? element
        : element
      : element;
    const markFrames = marks
      .map((element) => ({ element, bounds: semanticSelectionBounds([markGeometryElement(element)]) }))
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
    const itemElements = directMarkNesting
      ? [hit.element.querySelector<SVGGraphicsElement>("circle, rect, path") ?? hit.element]
      : compositeHit?.elements ?? semanticMarkElements(hit.element, match.mode, categoryKey);
    const itemBounds = directMarkNesting
      ? hit.bounds
      : semanticSelectionBounds(itemElements) ?? hit.bounds;
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
        bounds: directMarkNesting
          ? unit.bounds
          : semanticSelectionBounds(unit.kind === "structural" ? [unitElement] : unit.elements) ?? unit.bounds,
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
      nestedAction: "embed",
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
      nestedDropPath.value.push({
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
    if (!member?.compositionSpec) return false;
    if (member.kind === "group") {
      editingGroupPath.value = [...editingGroupPath.value, member.id];
    }
    return beginCompositionEditing(member.compositionSpec);
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
    const radialGap = COMPOSITION_DROP_ZONE_GAP_PX / renderedScale;
    const outerZone = {
      innerRadius: chartOuterRadius + radialGap,
      outerRadius: chartOuterRadius + radialGap + radialThickness,
      position: "after" as const,
    };
    const innerConcatOuterRadius = Math.max(0, chartInnerRadius - radialGap);
    const innerZone = innerConcatOuterRadius > 0
      ? {
        innerRadius: Math.max(0, innerConcatOuterRadius - radialThickness),
        outerRadius: innerConcatOuterRadius,
        position: "before" as const,
      }
      : null;
    const radialZone = [innerZone, outerZone].find((zone) => zone
      && distance >= zone.innerRadius
      && distance <= zone.outerRadius
      && (angleSpan >= 359.999 || degrees <= angleSpan));
    const angularGap = Math.min(
      6,
      Math.max(2, radialGap / Math.max(chartOuterRadius, 1) * 180 / Math.PI),
    );
    const angularInnerRadius = chartOuterRadius + radialGap + radialThickness + radialGap;
    const angularOuterRadius = angularInnerRadius + radialThickness;
    const angleInWrappedRange = (value: number, start: number, span: number) => {
      const normalizedStart = ((start % 360) + 360) % 360;
      return (value - normalizedStart + 360) % 360 <= span;
    };
    const before = angleInWrappedRange(degrees, -angularGap - edgeAngle, edgeAngle);
    const after = angleInWrappedRange(degrees, angleSpan + angularGap, edgeAngle);
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
    if (distance >= angularInnerRadius && distance <= angularOuterRadius && (before || after)) {
      const nodes = polarNodesFor("concat", "angular");
      const isBefore = before && !after;
      const start = isBefore
        ? -(startAngle - angularGap - edgeAngle)
        : -(startAngle + angleSpan + angularGap);
      const end = isBefore
        ? -(startAngle - angularGap)
        : -(startAngle + angleSpan + angularGap + edgeAngle);
      const geometry = polarSectorGeometry(target, model, angularInnerRadius, angularOuterRadius, start, end);
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
      const layerInset = Math.min(
        LAYER_DROP_ZONE_INSET_PX / renderedScale,
        (chartOuterRadius - chartInnerRadius) * 0.12,
      );
      const layerInnerRadius = chartInnerRadius + layerInset;
      const layerOuterRadius = chartOuterRadius - layerInset;
      const angularInset = angleSpan >= 359.999
        ? 0
        : Math.min(
          angleSpan * 0.12,
          layerInset / Math.max(layerOuterRadius, 1) * 180 / Math.PI,
        );
      const insideLayerAngle = angleSpan >= 359.999
        || (degrees >= angularInset && degrees <= angleSpan - angularInset);
      if (distance < layerInnerRadius || distance > layerOuterRadius || !insideLayerAngle) return null;
      const geometry = polarSectorGeometry(
        target,
        model,
        layerInnerRadius,
        layerOuterRadius,
        -(startAngle + angularInset),
        -(startAngle + angleSpan - angularInset),
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
    if (source?.layerKind === "deckgl") {
      const target = currentDropZoneScopeNodes().find((node) =>
        node.id !== sourceNodeId
        && node.layerKind === "deckgl"
        && (!node.deckglLayerStack || node.deckglLayerStack[0] === node.id)
        && pointInBounds(point, insetBounds(
          collectRenderedNodeSelectionBounds(node),
          LAYER_DROP_ZONE_INSET_PX / Math.max(viewZoom.value, 0.25),
        )),
      );
      if (!target) return null;
      const bounds = insetBounds(
        collectRenderedNodeSelectionBounds(target),
        LAYER_DROP_ZONE_INSET_PX / Math.max(viewZoom.value, 0.25),
      );
      return {
        targetNodeId: target.id,
        type: "layer",
        sharedChannels: [],
        bounds,
        compatible: true,
      };
    }
    const sourceChart = source?.chartSpec ? source : firstChartNode(source);
    if (!source || !sourceChart?.chartSpec) return null;
    const pointInEnterCircle = (candidate: Point, bounds: Bounds) => {
      const radiusX = bounds.width / 2;
      const radiusY = bounds.height / 2;
      if (radiusX <= 0 || radiusY <= 0) return false;
      const dx = (candidate.x - (bounds.minX + radiusX)) / radiusX;
      const dy = (candidate.y - (bounds.minY + radiusY)) / radiusY;
      return dx * dx + dy * dy <= 1;
    };
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
    sourceCompositionMemberIds.add(sourceNodeId);
    // Drop-zone hit testing is scoped to the current level. Nested children
    // are rendered inside their parent and must not compete as canvas targets.
    const chartTargets = currentDropZoneScopeNodes().filter((node) =>
      !sourceCompositionMemberIds.has(node.id)
      && (!!node.chartSpec || (node.kind === "group" && !!node.compositionSpec))
    );
    // A closed composition exposes one outer drop target. Its member charts
    // remain hidden from hit testing until the author enters that composition.
    const outerCompositionTarget = [...chartTargets].reverse().find((node) => {
      const composition = node.compositionSpec;
      if (!composition
        || composition.type === "concat"
        || editingCompositionId.value === composition.id) return false;
      const members = composition.members
        .map((member) => findCanvasNode(member.nodeId))
        .filter((member): member is CanvasNode => !!member);
      const bounds = node.kind === "group"
        ? collectRenderedNodeSelectionBounds(node)
        : getCanvasNodeListBounds(members.length > 0 ? members : [node]);
      if (!bounds) return false;
      const cartesian = (composition.type === "facet"
        ? composition.facetCoordinateSystem ?? firstChartNode(node)?.coordinateGuide?.type
        : firstChartNode(node)?.coordinateGuide?.type) === "Cartesian";
      const gap = cartesian
        ? COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value, 0.25)
        : 0;
      // Polar concat portals live outside the occupied circle, including the
      // angular band beyond the radial concat ring. Keep the closed root in
      // the target search while the pointer is over those external sectors.
      const edgeX = cartesian ? bounds.width * 0.22 + gap : bounds.width * 0.48;
      const edgeY = cartesian ? bounds.height * 0.22 + gap : bounds.height * 0.48;
      return point.x >= bounds.minX - edgeX
        && point.x <= bounds.maxX + edgeX
        && point.y >= bounds.minY - edgeY
        && point.y <= bounds.maxY + edgeY;
    });
    if (outerCompositionTarget?.compositionSpec
      && outerCompositionTarget.compositionSpec.type !== "concat"
      && editingCompositionId.value !== outerCompositionTarget.compositionSpec.id) {
      const composition = outerCompositionTarget.compositionSpec;
      const members = composition.members
        .map((member) => findCanvasNode(member.nodeId))
        .filter((member): member is CanvasNode => !!member);
      const targetChart = members.find((member) => !!member.chartSpec)
        ?? firstChartNode(outerCompositionTarget);
      if (!targetChart?.chartSpec) return null;
      const bounds = outerCompositionTarget.kind === "group"
        ? collectRenderedNodeSelectionBounds(outerCompositionTarget)
        : getCanvasNodeListBounds(members.length > 0 ? members : [outerCompositionTarget]);
      const outerCoordinateType = composition.type === "facet"
        ? composition.facetCoordinateSystem ?? targetChart.coordinateGuide?.type ?? "Cartesian"
        : targetChart.coordinateGuide?.type ?? "Cartesian";
      if (bounds
        && outerCoordinateType === "Polar"
        && outerCompositionTarget.coordinateGuide?.type === "Polar") {
        const model = createPolarCoordinateSystemModel(outerCompositionTarget, viewZoom.value);
        const occupied = getPolarOccupiedGeometry(outerCompositionTarget);
        if (model && occupied) {
          const localPoint = toNodeLocalPoint(outerCompositionTarget, point);
          const dx = localPoint.x - model.origin.x;
          const dy = model.origin.y - localPoint.y;
          const distance = Math.hypot(dx, dy);
          const pointerAngle = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
          const startAngle = occupied.startAngle;
          const angleSpan = occupied.angleSpan;
          const relativeAngle = (pointerAngle - startAngle + 360) % 360;
          const inAngle = angleSpan >= 359.999 || relativeAngle <= angleSpan;
          const renderedScale = Math.max(
            Math.abs(outerCompositionTarget.scaleX),
            Math.abs(outerCompositionTarget.scaleY),
            0.0001,
          ) * Math.max(viewZoom.value, 0.0001);
          const gap = COMPOSITION_DROP_ZONE_GAP_PX / renderedScale;
          const thickness = Math.max(20 / renderedScale, Math.min(occupied.outerRadius * 0.2, 56 / renderedScale));
          const radialBands = [
            ...(occupied.innerRadius > gap
              ? [{
                innerRadius: Math.max(0, occupied.innerRadius - gap - thickness),
                outerRadius: occupied.innerRadius - gap,
                position: "before" as const,
              }]
              : []),
            {
              innerRadius: occupied.outerRadius + gap,
              outerRadius: occupied.outerRadius + gap + thickness,
              position: "after" as const,
            },
          ];
          const radial = radialBands.find((band) => inAngle
            && distance >= band.innerRadius
            && distance <= band.outerRadius);
          if (radial) {
            const geometry = polarSectorGeometry(
              outerCompositionTarget,
              model,
              radial.innerRadius,
              radial.outerRadius,
              -startAngle,
              -(startAngle + angleSpan),
            );
            if (geometry) return {
              targetNodeId: outerCompositionTarget.id,
              type: "concat",
              sharedChannels: ["angle"],
              ...geometry,
              compatible: concatEdgeNodesAreCompatible(
                outerCompositionTarget,
                source,
                "radial",
                "angle",
              ),
              direction: "radial",
              concatPosition: radial.position,
            };
          }
          const angularGap = Math.min(6, Math.max(2, gap / Math.max(occupied.outerRadius, 1) * 180 / Math.PI));
          const edgeAngle = Math.min(30, Math.max(8, angleSpan * 0.22));
          const angularInnerRadius = occupied.outerRadius + gap + thickness + gap;
          const angularOuterRadius = angularInnerRadius + thickness;
          const within = (value: number, rangeStart: number, rangeSpan: number) =>
            (value - ((rangeStart % 360) + 360) % 360 + 360) % 360 <= rangeSpan;
          const before = within(relativeAngle, -angularGap - edgeAngle, edgeAngle);
          const after = within(relativeAngle, angleSpan + angularGap, edgeAngle);
          if (distance >= angularInnerRadius && distance <= angularOuterRadius && (before || after)) {
            const isBefore = before && !after;
            const sectorStart = isBefore
              ? -(startAngle - angularGap - edgeAngle)
              : -(startAngle + angleSpan + angularGap);
            const sectorEnd = isBefore
              ? -(startAngle - angularGap)
              : -(startAngle + angleSpan + angularGap + edgeAngle);
            const geometry = polarSectorGeometry(
              outerCompositionTarget,
              model,
              angularInnerRadius,
              angularOuterRadius,
              sectorStart,
              sectorEnd,
            );
            if (geometry) return {
              targetNodeId: outerCompositionTarget.id,
              type: "concat",
              sharedChannels: ["radius"],
              ...geometry,
              compatible: concatEdgeNodesAreCompatible(
                outerCompositionTarget,
                source,
                "angular",
                "radius",
              ),
              direction: "angular",
              concatPosition: isBefore ? "before" : "after",
            };
          }
        }
      }
      if (bounds && outerCoordinateType === "Cartesian") {
        // Every closed Cartesian composite exposes concat portals around its
        // complete frame. The direct target remains the root; its member
        // charts are used only to resolve the external axis signature.
        const renderedScale = Math.max(
          Math.abs(targetChart.scaleX),
          Math.abs(targetChart.scaleY),
          0.0001,
        ) * Math.max(viewZoom.value, 0.0001);
        const edgeSizeX = Math.min(
          bounds.width * 0.22,
          Math.max(18 / renderedScale, 12),
        );
        const edgeSizeY = Math.min(
          bounds.height * 0.22,
          Math.max(18 / renderedScale, 12),
        );
        const gap = COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value, 0.25);
        const onLeft = point.x >= bounds.minX - gap - edgeSizeX
          && point.x <= bounds.minX - gap
          && point.y >= bounds.minY
          && point.y <= bounds.maxY;
        const onRight = point.x >= bounds.maxX + gap
          && point.x <= bounds.maxX + gap + edgeSizeX
          && point.y >= bounds.minY
          && point.y <= bounds.maxY;
        const onTop = point.y >= bounds.minY - gap - edgeSizeY
          && point.y <= bounds.minY - gap
          && point.x >= bounds.minX
          && point.x <= bounds.maxX;
        const onBottom = point.y >= bounds.maxY + gap
          && point.y <= bounds.maxY + gap + edgeSizeY
          && point.x >= bounds.minX
          && point.x <= bounds.maxX;
        if (onLeft || onRight || onTop || onBottom) {
          const horizontal = onLeft || onRight;
          const direction: "horizontal" | "vertical" = horizontal ? "horizontal" : "vertical";
          const sharedChannel: CoordinateChannel = horizontal ? "y" : "x";
          const compatible = concatEdgeNodesAreCompatible(
            outerCompositionTarget,
            source,
            direction,
            sharedChannel,
          );
          const zoneBounds = horizontal
            ? {
              minX: onLeft ? bounds.minX - gap - edgeSizeX : bounds.maxX + gap,
              minY: bounds.minY,
              maxX: onLeft ? bounds.minX - gap : bounds.maxX + gap + edgeSizeX,
              maxY: bounds.maxY,
              width: edgeSizeX,
              height: bounds.height,
            }
            : {
              minX: bounds.minX,
              minY: onTop ? bounds.minY - gap - edgeSizeY : bounds.maxY + gap,
              maxX: bounds.maxX,
              maxY: onTop ? bounds.minY - gap : bounds.maxY + gap + edgeSizeY,
              width: bounds.width,
              height: edgeSizeY,
            };
          return {
            targetNodeId: outerCompositionTarget.id,
            type: "concat",
            sharedChannels: [sharedChannel],
            bounds: zoneBounds,
            outline: [
              { x: zoneBounds.minX, y: zoneBounds.minY },
              { x: zoneBounds.maxX, y: zoneBounds.minY },
              { x: zoneBounds.maxX, y: zoneBounds.maxY },
              { x: zoneBounds.minX, y: zoneBounds.maxY },
            ],
            compatible,
            direction,
            concatPosition: horizontal
              ? onLeft ? "before" : "after"
              : onTop ? "before" : "after",
          };
        }
      }
      const layerBodyBounds = bounds
        ? insetBounds(
          bounds,
          LAYER_DROP_ZONE_INSET_PX / Math.max(viewZoom.value, 0.25),
        )
        : null;
      const center = bounds
        ? {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
        }
        : null;
      const enterDiameter = bounds
        ? Math.min(
          bounds.width,
          bounds.height,
          72 / Math.max(viewZoom.value, 0.25),
        )
        : 0;
      const enterBounds = center
        ? {
          minX: center.x - enterDiameter / 2,
          minY: center.y - enterDiameter / 2,
          maxX: center.x + enterDiameter / 2,
          maxY: center.y + enterDiameter / 2,
          width: enterDiameter,
          height: enterDiameter,
        }
        : null;
      const entering = !!enterBounds && pointInEnterCircle(point, enterBounds);
      if (bounds && layerBodyBounds && enterBounds
        && (entering || pointInBounds(point, layerBodyBounds))) {
        const outerType: "layer" | "concat" = composition.type === "concat" ? "concat" : "layer";
        const pair = repeatableCompositionPairNodes(source, outerCompositionTarget, outerType);
        const compatible = composition.type === "layer"
          ? (pair ? (compatibleLayerChannels(pair) ?? []).length > 0 : false)
          : composition.type === "concat"
            ? !!composition.direction && concatNodesAreCompatible(
            pair ?? [],
            composition.direction,
            composition.sharedChannels[0] ?? (composition.direction === "vertical" ? "x" : "y"),
            )
            : (pair ? (compatibleLayerChannels(pair) ?? []).length > 0 : false);
        const compatibleOuterChannels = composition.type === "concat"
          ? [...composition.sharedChannels]
          : (pair ? compatibleLayerChannels(pair) ?? [] : []);
        const layerChoice = outerType === "layer"
          ? cartesianLayerZone(layerBodyBounds, point.y, compatibleOuterChannels)
          : { channels: compatibleOuterChannels, index: 0, count: 1 };
        const layerBounds = layerChoice.count > 1
          ? {
            ...layerBodyBounds,
            minY: layerBodyBounds.minY + layerBodyBounds.height * layerChoice.index / layerChoice.count,
            maxY: layerBodyBounds.minY + layerBodyBounds.height * (layerChoice.index + 1) / layerChoice.count,
            height: layerBodyBounds.height / layerChoice.count,
          }
          : layerBodyBounds;
        const outline = [
          { x: layerBounds.minX, y: layerBounds.minY },
          { x: layerBounds.maxX, y: layerBounds.minY },
          { x: layerBounds.maxX, y: layerBounds.maxY },
          { x: layerBounds.minX, y: layerBounds.maxY },
        ];
        return {
          targetNodeId: outerCompositionTarget.id,
          type: outerType,
          sharedChannels: layerChoice.channels,
          bounds: layerBounds,
          outline,
          compatible,
          direction: composition.direction,
          enterCompositionId: (composition.type === "layer" || composition.type === "facet")
            && entering
            ? composition.id
            : undefined,
          enterBounds,
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
      if (pointInEnterCircle(point, enterBounds)
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
        nestedAction: pointInEnterCircle(point, enterBounds) ? "enter" : "embed",
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
      if (enterZone.enterCompositionId
        || enterZone.nestedAction === "enter") {
        return enterZone;
      }
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
        if (polarZone && (polarZone.type !== "layer"
          || getChartTemplateContract(target.chartSpec.chartType)?.supportsLayerComposition)) {
          return withNestedEnter(polarZone);
        }
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
      // Portals follow the same live occupancy rectangle as selection. This
      // includes hierarchy labels and any other rendered marks that extend
      // beyond a chart's declared plot area.
      const interactionArea = renderedInteractionArea(target);
      const inside = localPoint.x >= plotArea.x
        && localPoint.x <= plotArea.x + plotArea.width
        && localPoint.y >= plotArea.y
        && localPoint.y <= plotArea.y + plotArea.height;

      const nestedPoint = nestedLevelEntered && inside ? scatterPointDropZone(target, point) : null;
      if (nestedPoint) {
        const sourceTemplate = normalizeChartTemplate(sourceChart.chartSpec.chartType);
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

      const edgeSizeX = Math.min(interactionArea.width * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleX), 0.25), 12));
      const edgeSizeY = Math.min(interactionArea.height * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleY), 0.25), 12));
      const gapX = COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value * Math.abs(target.scaleX), 0.25);
      const gapY = COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value * Math.abs(target.scaleY), 0.25);
      const plotRight = interactionArea.x + interactionArea.width;
      const plotBottom = interactionArea.y + interactionArea.height;
      const inVerticalSpan = localPoint.y >= interactionArea.y && localPoint.y <= plotBottom;
      const inHorizontalSpan = localPoint.x >= interactionArea.x && localPoint.x <= plotRight;
      const onLeft = inVerticalSpan
        && localPoint.x >= interactionArea.x - gapX - edgeSizeX
        && localPoint.x <= interactionArea.x - gapX;
      const onRight = inVerticalSpan
        && localPoint.x >= plotRight + gapX
        && localPoint.x <= plotRight + gapX + edgeSizeX;
      const onTop = inHorizontalSpan
        && localPoint.y >= interactionArea.y - gapY - edgeSizeY
        && localPoint.y <= interactionArea.y - gapY;
      const onBottom = inHorizontalSpan
        && localPoint.y >= plotBottom + gapY
        && localPoint.y <= plotBottom + gapY + edgeSizeY;
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
        const cornerLeft = localPoint.x >= interactionArea.x - gapX - edgeSizeX && localPoint.x <= interactionArea.x - gapX;
        const cornerRight = localPoint.x >= plotRight + gapX && localPoint.x <= plotRight + gapX + edgeSizeX;
        const cornerTop = localPoint.y >= interactionArea.y - gapY - edgeSizeY && localPoint.y <= interactionArea.y - gapY;
        const cornerBottom = localPoint.y >= plotBottom + gapY && localPoint.y <= plotBottom + gapY + edgeSizeY;
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
            x: cornerLeft ? interactionArea.x - gapX - edgeSizeX : plotRight + gapX,
            y: cornerTop ? interactionArea.y - gapY - edgeSizeY : plotBottom + gapY,
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
            x: onLeft ? interactionArea.x - gapX - edgeSizeX : plotRight + gapX,
            y: interactionArea.y,
            width: edgeSizeX,
            height: interactionArea.height,
          }
          : {
            x: interactionArea.x,
            y: onTop ? interactionArea.y - gapY - edgeSizeY : plotBottom + gapY,
            width: interactionArea.width,
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

      if (!getChartTemplateContract(target.chartSpec.chartType)?.supportsLayerComposition) continue;

      const compositionNodes = repeatableCompositionPairNodes(source, target, "layer");
      const sharedChannels = compositionNodes ? compatibleLayerChannels(compositionNodes) ?? [] : [];
      const compatible = sharedChannels.length > 0;
      const completeLayerArea = insetPlotArea({
        x: plotArea.x,
        y: plotArea.y,
        width: plotArea.width,
        height: plotArea.height,
      },
        LAYER_DROP_ZONE_INSET_PX / Math.max(viewZoom.value * Math.abs(target.scaleX), 0.25),
        LAYER_DROP_ZONE_INSET_PX / Math.max(viewZoom.value * Math.abs(target.scaleY), 0.25),
      );
      const insideLayer = localPoint.x >= completeLayerArea.x
        && localPoint.x <= completeLayerArea.x + completeLayerArea.width
        && localPoint.y >= completeLayerArea.y
        && localPoint.y <= completeLayerArea.y + completeLayerArea.height;
      if (!insideLayer) continue;
      const choice = cartesianLayerZone(
        { minY: completeLayerArea.y, height: completeLayerArea.height },
        localPoint.y,
        sharedChannels,
      );
      const layerArea = choice.count > 1
        ? {
          ...completeLayerArea,
          y: completeLayerArea.y + completeLayerArea.height * choice.index / choice.count,
          height: completeLayerArea.height / choice.count,
        }
        : completeLayerArea;
      return withNestedEnter({
        targetNodeId: target.id,
        type: "layer",
        sharedChannels: choice.channels,
        ...localRectDropGeometry(target, layerArea),
        compatible,
      });
    }
    return null;
  }

  /**
   * Enumerate the structural portals for every direct target in the current
   * editing scope. Hit testing still chooses one active portal at the pointer,
   * while this list lets the canvas reveal all legal destinations as soon as
   * a composition drag starts.
   */
  function compositionDropZones(sourceNodeId: string): ChartDropZone[] {
    const source = findCanvasNode(sourceNodeId);
    if (!source) return [];
    const sourceMemberIds = new Set(source.compositionSpec?.members.map((member) => member.nodeId) ?? [source.id]);
    sourceMemberIds.add(source.id);
    const probes: Point[] = [];
    currentDropZoneScopeNodes().forEach((target) => {
      if (sourceMemberIds.has(target.id)) return;
      const composition = target.compositionSpec;
      if (composition && composition.type !== "concat" && editingCompositionId.value !== composition.id) {
        const members = composition.members
          .map((member) => findCanvasNode(member.nodeId))
          .filter((member): member is CanvasNode => !!member);
        const bounds = target.kind === "group"
          ? collectRenderedNodeSelectionBounds(target)
          : getCanvasNodeListBounds(members.length > 0 ? members : [target]);
        if (!bounds) return;
        const outerCoordinateType = composition.type === "facet"
          ? composition.facetCoordinateSystem ?? firstChartNode(target)?.coordinateGuide?.type
          : firstChartNode(target)?.coordinateGuide?.type;
        if (outerCoordinateType === "Polar" && target.coordinateGuide?.type === "Polar") {
          const model = createPolarCoordinateSystemModel(target, viewZoom.value);
          const occupied = getPolarOccupiedGeometry(target);
          if (!model || !occupied) return;
          const renderedScale = Math.max(
            Math.abs(target.scaleX),
            Math.abs(target.scaleY),
            0.0001,
          ) * Math.max(viewZoom.value, 0.0001);
          const radialGap = COMPOSITION_DROP_ZONE_GAP_PX / renderedScale;
          const radialThickness = Math.max(
            20 / renderedScale,
            Math.min(occupied.outerRadius * 0.2, 56 / renderedScale),
          );
          const edgeAngle = Math.min(30, Math.max(8, occupied.angleSpan * 0.22));
          const angularGap = Math.min(
            6,
            Math.max(2, radialGap / Math.max(occupied.outerRadius, 1) * 180 / Math.PI),
          );
          const angularMiddleRadius = occupied.outerRadius
            + radialGap
            + radialThickness
            + radialGap
            + radialThickness / 2;
          const probeAt = (radius: number, clockwiseDegrees: number) => {
            const local = polarPointAtAngle(model.origin, radius, -clockwiseDegrees);
            probes.push(nodeLocalToSelectionScopePoint(target, local));
          };
          probeAt((occupied.innerRadius + occupied.outerRadius) / 2, occupied.startAngle + occupied.angleSpan / 2);
          probeAt(occupied.outerRadius + radialGap + radialThickness / 2, occupied.startAngle + occupied.angleSpan / 2);
          if (occupied.innerRadius > radialGap) {
            probeAt(Math.max(0, occupied.innerRadius - radialGap - radialThickness / 2), occupied.startAngle + occupied.angleSpan / 2);
          }
          probeAt(angularMiddleRadius, occupied.startAngle - angularGap - edgeAngle / 2);
          probeAt(angularMiddleRadius, occupied.startAngle + occupied.angleSpan + angularGap + edgeAngle / 2);
          probes.push(nodeLocalToSelectionScopePoint(target, model.origin));
          return;
        }
        const edgeX = Math.min(bounds.width * 0.22, Math.max(18 / Math.max(viewZoom.value, 0.25), 12));
        const edgeY = Math.min(bounds.height * 0.22, Math.max(18 / Math.max(viewZoom.value, 0.25), 12));
        const gap = COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value, 0.25);
        const centerX = bounds.minX + bounds.width / 2;
        const centerY = bounds.minY + bounds.height / 2;
        probes.push(
          { x: bounds.minX - gap - edgeX / 2, y: centerY },
          { x: bounds.maxX + gap + edgeX / 2, y: centerY },
          { x: centerX, y: bounds.minY - gap - edgeY / 2 },
          { x: centerX, y: bounds.maxY + gap + edgeY / 2 },
          { x: bounds.minX + bounds.width * 0.28, y: bounds.minY + bounds.height / 6 },
          { x: bounds.minX + bounds.width * 0.28, y: bounds.minY + bounds.height / 2 },
          { x: bounds.minX + bounds.width * 0.28, y: bounds.minY + bounds.height * 5 / 6 },
          { x: centerX, y: centerY },
        );
        return;
      }
      const chart = target.chartSpec ? target : firstChartNode(target);
      if (!chart?.chartSpec || !chart.coordinateGuide) return;
      const localMinX = chart.kind === "leaf" ? chart.contentMinX : 0;
      const localMinY = chart.kind === "leaf" ? chart.contentMinY : 0;
      const plotArea = chart.chartSpec.plotArea ?? {
        x: localMinX,
        y: localMinY,
        width: chart.width,
        height: chart.height,
      };
      if (chart.coordinateGuide.type === "Polar") {
        const model = createPolarCoordinateSystemModel(chart, viewZoom.value);
        const occupied = getPolarOccupiedGeometry(chart);
        if (!model || !occupied) return;
        const startAngle = chart.compositionSpec?.type === "concat"
          && chart.compositionSpec.direction === "angular"
          ? chart.compositionSpec.polarAngleOffset ?? occupied.startAngle
          : occupied.startAngle;
        const angleSpan = chart.compositionSpec?.type === "concat"
          && chart.compositionSpec.direction === "angular"
          ? chart.compositionSpec.polarAngleSpan ?? model.angleSpan
          : model.angleSpan;
        const renderedScale = Math.max(
          Math.abs(chart.scaleX),
          Math.abs(chart.scaleY),
          0.0001,
        ) * Math.max(viewZoom.value, 0.0001);
        const radialThickness = Math.max(
          20 / renderedScale,
          Math.min(occupied.outerRadius * 0.2, 56 / renderedScale),
        );
        const radialGap = COMPOSITION_DROP_ZONE_GAP_PX / renderedScale;
        const middleRadius = (occupied.innerRadius + occupied.outerRadius) / 2;
        const edgeAngle = Math.min(30, Math.max(8, angleSpan * 0.22));
        const angularGap = Math.min(
          6,
          Math.max(2, radialGap / Math.max(occupied.outerRadius, 1) * 180 / Math.PI),
        );
        const angularMiddleRadius = occupied.outerRadius
          + radialGap
          + radialThickness
          + radialGap
          + radialThickness / 2;
        const probeAt = (radius: number, clockwiseDegrees: number) => {
          const local = polarPointAtAngle(model.origin, radius, -clockwiseDegrees);
          probes.push(nodeLocalToSelectionScopePoint(chart, local));
        };
        // Body Layer, separated outer/inner radial Concat, then angular
        // Concat beyond the radial band. Every probe lies strictly inside one
        // mutually exclusive zone, with a fixed-screen gap around the body.
        probeAt(middleRadius, startAngle + angleSpan / 2);
        probeAt(occupied.outerRadius + radialGap + radialThickness / 2, startAngle + angleSpan / 2);
        if (occupied.innerRadius > radialGap) {
          probeAt(Math.max(0, occupied.innerRadius - radialGap - radialThickness / 2), startAngle + angleSpan / 2);
        }
        probeAt(angularMiddleRadius, startAngle - angularGap - edgeAngle / 2);
        probeAt(angularMiddleRadius, startAngle + angleSpan + angularGap + edgeAngle / 2);
        return;
      }
      if (chart.coordinateGuide.type !== "Cartesian") {
        return;
      }
      const interactionArea = renderedInteractionArea(chart);
      const edgeX = Math.min(interactionArea.width * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(chart.scaleX), 0.25), 12));
      const edgeY = Math.min(interactionArea.height * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(chart.scaleY), 0.25), 12));
      const gapX = COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value * Math.abs(chart.scaleX), 0.25);
      const gapY = COMPOSITION_DROP_ZONE_GAP_PX / Math.max(viewZoom.value * Math.abs(chart.scaleY), 0.25);
      const centerX = interactionArea.x + interactionArea.width / 2;
      const centerY = interactionArea.y + interactionArea.height / 2;
      [
        { x: interactionArea.x - gapX - edgeX / 2, y: centerY },
        { x: interactionArea.x + interactionArea.width + gapX + edgeX / 2, y: centerY },
        { x: centerX, y: interactionArea.y - gapY - edgeY / 2 },
        { x: centerX, y: interactionArea.y + interactionArea.height + gapY + edgeY / 2 },
        { x: plotArea.x + plotArea.width * 0.28, y: plotArea.y + plotArea.height / 6 },
        { x: plotArea.x + plotArea.width * 0.28, y: plotArea.y + plotArea.height / 2 },
        { x: plotArea.x + plotArea.width * 0.28, y: plotArea.y + plotArea.height * 5 / 6 },
        { x: plotArea.x + plotArea.width / 2, y: plotArea.y + plotArea.height / 2 },
      ].forEach((probe) => probes.push(nodeLocalToSelectionScopePoint(chart, probe)));
    });

    const zones = probes
      .map((probe) => compositionDropZoneAtPoint(probe, sourceNodeId))
      .filter((zone): zone is ChartDropZone => !!zone && (zone.compatible || !!zone.enterCompositionId || zone.nestedAction === "enter"))
      .map((zone) => (zone.enterCompositionId || zone.nestedAction === "enter") && zone.enterBounds
        ? { ...zone, bounds: zone.enterBounds, outline: undefined }
        : zone);
    const unique = new Map<string, ChartDropZone>();
    zones.forEach((zone) => {
      const key = [
        zone.targetNodeId,
        zone.type,
        zone.direction ?? "",
        zone.concatPosition ?? "",
        zone.enterCompositionId ?? "",
        zone.nestedAction ?? "",
        zone.sharedChannels.join(","),
      ].join("|");
      if (!unique.has(key)) unique.set(key, zone);
    });
    return Array.from(unique.values());
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
      order: links.reduce((maximum, link) => Math.max(maximum, link.order ?? -1), -1) + 1,
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
      if (owner) renderSharedCoordinateComposition(owner, true);
    }
    scheduleNestedChildrenForParents([target, source]);
    return true;
  }

  function commitCompositionDrop(zone: ChartDropZone, sourceNodeId: string) {
    const source = findCanvasNode(sourceNodeId);
    const target = findCanvasNode(zone.targetNodeId);
    if (!source || !target || !zone.compatible) return false;
    if (source.layerKind === "deckgl" || target.layerKind === "deckgl") {
      return source.layerKind === "deckgl"
        && target.layerKind === "deckgl"
        && zone.type === "layer"
        && createDeckglLayer(target.id, source.id, false);
    }
    const sourceChart = source.chartSpec ? source : firstChartNode(source);
    const targetChart = target.chartSpec ? target : firstChartNode(target);
    if (!sourceChart?.chartSpec || !targetChart?.chartSpec) return false;
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
      const directMarkNesting = getChartTemplateContract(targetChart.chartSpec.chartType)?.family === "hierarchy";
      if (!directMarkNesting
        && (chartDrilldown.value?.nodeId !== target.id || chartDrilldown.value.level !== "part")) return false;
      const rowKey = zone.targetRowKey;
      if (rowKey && nestedCompositionFromBlock(targetChart, sourceChart, rowKey)) {
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
      if (nestedTargets.length === 0) return false;
      const parentDataset = getDataset(targetChart.chartSpec.datasetId);
      if (!parentDataset) return false;
      const materializedParent = prepareChartData(targetChart.id, parentDataset, targetChart.chartSpec).dataset;
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
        const fitScale = NESTED_DEFAULT_DIAMETER / Math.max(child.width, child.height, 1);
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
  return {
    createLayer,
    createDeckglLayer,
    createStructuralComposition,
    executeComposition,
    beginNestedRelationshipDraft,
    ensureCommittedNestedRelationship,
    createNestedPie,
    nestedPieValueFields,
    applyNestedPiesToNode,
    closeNestedBinding,
    confirmNestedBinding,
    openNestedPositionEditor,
    updateNestedPosition,
    updateNestedChildScale,
    updateNestedCallout,
    resetNestedPosition,
    closeNestedPositionEditor,
    scatterPointDropZone,
    nestedTargetWouldCreateCycle,
    semanticItemDropZone,
    enterNestedDropLevel,
    enterCompositionDropLevel,
    localRectDropGeometry,
    polarSectorGeometry,
    polarCompositionDropZoneAtPoint,
    compositionDropZoneAtPoint,
    compositionDropZones,
    nestedCompositionFromBlock,
    appendConcatLink,
    commitCompositionDrop,
  };
}
