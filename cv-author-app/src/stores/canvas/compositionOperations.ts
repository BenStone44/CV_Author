import type {
  Bounds,
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
import { isCartesianTreeChart } from "../../utils/treeLayout";

// Nested children use an independent visual size scale. The parent mark only
// supplies the anchor location; it must not determine the child's base size.
const NESTED_DEFAULT_DIAMETER = 140;
const NESTED_MAX_DIAMETER = 360;

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
    collectNodeSelectionBounds,
    compositionCoordinateTargets,
    compositionDragSourceId,
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
    const nodes = inputNodes
      ?.filter((node) => node.chartSpec && node.coordinateGuide) ?? [];
    if (nodes.length === 0 || !nodes.every(isAtomicChartReady)) return false;
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
      if (type === "concat") renderSharedCoordinateComposition(children[0]!, true);
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
      if (bounds && composition.type === "facet"
        && (composition.facetCoordinateSystem ?? targetChart.coordinateGuide?.type ?? "Cartesian") === "Cartesian") {
        // A facet is an external two-axis chart: the facet field supplies one
        // nominal/ordinal axis and every cell shares the other axis. Expose
        // concat portals around the complete facet frame instead of treating
        // the whole composition as an interior layer target only.
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
        const onLeft = point.x >= bounds.minX - edgeSizeX
          && point.x <= bounds.minX
          && point.y >= bounds.minY
          && point.y <= bounds.maxY;
        const onRight = point.x >= bounds.maxX
          && point.x <= bounds.maxX + edgeSizeX
          && point.y >= bounds.minY
          && point.y <= bounds.maxY;
        const onTop = point.y >= bounds.minY - edgeSizeY
          && point.y <= bounds.minY
          && point.x >= bounds.minX
          && point.x <= bounds.maxX;
        const onBottom = point.y >= bounds.maxY
          && point.y <= bounds.maxY + edgeSizeY
          && point.x >= bounds.minX
          && point.x <= bounds.maxX;
        if (onLeft || onRight || onTop || onBottom) {
          const horizontal = onLeft || onRight;
          const direction: "horizontal" | "vertical" = horizontal ? "horizontal" : "vertical";
          const sharedChannel: CoordinateChannel = horizontal ? "y" : "x";
          const compatible = concatEdgeNodesAreCompatible(
            targetChart,
            source,
            direction,
            sharedChannel,
          );
          const zoneBounds = horizontal
            ? {
              minX: onLeft ? bounds.minX - edgeSizeX : bounds.maxX,
              minY: bounds.minY,
              maxX: onLeft ? bounds.minX : bounds.maxX + edgeSizeX,
              maxY: bounds.maxY,
              width: edgeSizeX,
              height: bounds.height,
            }
            : {
              minX: bounds.minX,
              minY: onTop ? bounds.minY - edgeSizeY : bounds.maxY,
              maxX: bounds.maxX,
              maxY: onTop ? bounds.minY : bounds.maxY + edgeSizeY,
              width: bounds.width,
              height: edgeSizeY,
            };
          return {
            targetNodeId: targetChart.id,
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
      // Hierarchy charts expose node marks directly and have no chart-level
      // layer or enter portal. A drop must touch a concrete node.
      const targetContract = target.chartSpec
        ? getChartTemplateContract(target.chartSpec.chartType)
        : null;
      const directMarkNesting = targetContract?.family === "hierarchy";
      if (directMarkNesting
        || target.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase().includes("forcedirected")) {
        const nestedItem = semanticItemDropZone(target, point, sourceNodeId);
        if (nestedItem) return nestedItem;
      }
      if (directMarkNesting) continue;
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
      // Dendrograms render labels and node radii outside their plot area.
      // Composition portals must sit outside that complete visual footprint;
      // other Cartesian charts continue to use their plot rectangle.
      const interactionArea = isCartesianTreeChart(target.chartSpec.chartType)
        ? getNodeSelectionBounds(target)
        : plotArea;
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

      const edgeSizeX = Math.min(interactionArea.width * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleX), 0.25), 12));
      const edgeSizeY = Math.min(interactionArea.height * 0.22, Math.max(18 / Math.max(viewZoom.value * Math.abs(target.scaleY), 0.25), 12));
      const plotRight = interactionArea.x + interactionArea.width;
      const plotBottom = interactionArea.y + interactionArea.height;
      const inVerticalSpan = localPoint.y >= interactionArea.y && localPoint.y <= plotBottom;
      const inHorizontalSpan = localPoint.x >= interactionArea.x && localPoint.x <= plotRight;
      const onLeft = inVerticalSpan
        && localPoint.x >= interactionArea.x - edgeSizeX
        && localPoint.x <= interactionArea.x;
      const onRight = inVerticalSpan
        && localPoint.x >= plotRight
        && localPoint.x <= plotRight + edgeSizeX;
      const onTop = inHorizontalSpan
        && localPoint.y >= interactionArea.y - edgeSizeY
        && localPoint.y <= interactionArea.y;
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
        const cornerLeft = localPoint.x >= interactionArea.x - edgeSizeX && localPoint.x <= interactionArea.x;
        const cornerRight = localPoint.x >= plotRight && localPoint.x <= plotRight + edgeSizeX;
        const cornerTop = localPoint.y >= interactionArea.y - edgeSizeY && localPoint.y <= interactionArea.y;
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
            x: cornerLeft ? interactionArea.x - edgeSizeX : plotRight,
            y: cornerTop ? interactionArea.y - edgeSizeY : plotBottom,
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
            x: onLeft ? interactionArea.x - edgeSizeX : plotRight,
            y: interactionArea.y,
            width: edgeSizeX,
            height: interactionArea.height,
          }
          : {
            x: interactionArea.x,
            y: onTop ? interactionArea.y - edgeSizeY : plotBottom,
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
      const directMarkNesting = getChartTemplateContract(target.chartSpec.chartType)?.family === "hierarchy";
      if (!directMarkNesting
        && (chartDrilldown.value?.nodeId !== target.id || chartDrilldown.value.level !== "part")) return false;
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
    nestedCompositionFromBlock,
    appendConcatLink,
    commitCompositionDrop,
  };
}
