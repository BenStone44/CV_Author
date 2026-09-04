// @ts-nocheck See compositionOperations.ts for the dynamic context boundary.
import type {
  CanvasGroupNode,
  CanvasNode,
  CoordinateAxisScaleInteraction,
  CoordinateChannel,
  CoordinateOriginInteraction,
  DeckglPointTarget,
  MarqueeInteraction,
  MoveInteraction,
  NestedRelationship,
  Point,
  PolarAngleInteraction,
  RelativeNestedParameters,
  RotateInteraction,
  ScaleHandle,
  ScaleInteraction,
} from "../../types";
import { deckglPointNestHoverEvent } from "../../types";

export function useCanvasInteraction(context: any) {
  const {
    activeDropZone,
    axisBindingTarget,
    beginCompositionEditing,
    bindingForChartChannel,
    canConfigureSelectionComposition,
    canEnterSelection,
    canRemoveSelectionComposition,
    canvasRef,
    chartDrilldown,
    chartRelationships,
    clamp,
    clearCompositionDropZoneSchedule,
    commitCompositionDrop,
    collectNodeSelectionBounds,
    compositionDropZoneAtPoint,
    compositionDragSourceId,
    captureCanvasHistory,
    deckglPointDropTarget,
    concatEditableAxis,
    concatLinkId,
    concatLinksFor,
    coordinateTargets,
    coordinateTransformItemIds,
    dispatchRelationship,
    dragTestStage,
    editingCompositionId,
    editingGroupPath,
    enterCompositionDropLevel,
    enterNestedDropLevel,
    findCanvasNode,
    finishCompositionEditing,
    firstChartNode,
    flushCompositionDropZone,
    getCanvasViewport,
    getCanvasBounds,
    getChartTemplateContract,
    getGroupAtPath,
    getRootNode,
    getSelectionNode,
    getSelectionScopeNodes,
    interaction,
    nestedDropPath,
    nestedPositionEditor,
    nestedSelectionRelationships,
    nestCanvasNodeOnDeckglPoint,
    nodeLocalToSelectionScopePoint,
    normalizeBounds,
    normalizeChartTemplate,
    normalizeSelection,
    openNestedPositionEditor,
    pointInBounds,
    polarAngleSpanFromPoint,
    polarPointAtAngle,
    polarAngleInputVisible,
    pushCanvasHistory,
    pushMoveHistory,
    reconcileCoordinateSystems,
    registerChartRelationship,
    renderChartNode,
    renderCoordinateTargets,
    renderSharedCoordinateComposition,
    replaceSelectionScopeNodes,
    restoreCompositionEditLayout,
    rotationInputVisible,
    scopedCompositionMemberIds,
    selectedIds,
    selectedNodes,
    semanticSelection,
    selectionBounds,
    setImportNotice,
    setAxisBindingTarget,
    setSelection,
    scheduleNestedChildLayout,
    scheduleCompositionDropZone,
    selectionTestOnly,
    standaloneCoordinateSystem,
    toCanvasPoint,
    toNodeLocalPoint,
    toSelectionScopePoint,
    topLevelSelectionNodeId,
    transformPoint,
    toggleSelection,
    walkCanvasNodes,
    measureSelectionStage,
    viewPan,
    viewZoom,
    MAX_ZOOM,
    MIN_ZOOM,
    contextMenu,
  } = context;
  let pendingMoveUpdate: { point: Point; interaction: MoveInteraction } | null = null;
  let moveUpdateFrame: number | null = null;
  let transformOnlyElements: Element[] | null = null;

  function attachPointerListeners() {
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp, { once: true });
    window.addEventListener(deckglPointNestHoverEvent, onDeckglPointNestHover);
  }
  function detachPointerListeners() {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener(deckglPointNestHoverEvent, onDeckglPointNestHover);
  }
  function onDeckglPointNestHover(event: Event) {
    deckglPointDropTarget.value = (event as CustomEvent<DeckglPointTarget | null>).detail ?? null;
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
    // Mapbox/deck.gl layers are HTML siblings of the SVG canvas. Updating
    // their reactive node position on every pointer event forces each map to
    // process a layout update, so keep their movement in the DOM until drop.
    const deferModelMove = transformOnly || transformItemIds.some((id) =>
      getSelectionNode(id)?.layerKind === "deckgl");
    interaction.value = {
      type: "move",
      startPoint: toSelectionScopePoint(event.clientX, event.clientY, scopeGroupId),
      itemIds: transformItemIds,
      snapshots,
      scopeGroupId,
      historyCommitted: false,
      transformOnly: deferModelMove,
      deferred,
      nestedRelationshipIds,
      historySnapshot: captureCanvasHistory(),
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
      const elements = Array.from(canvas.querySelectorAll<Element>(
        "[data-node-id], [data-coordinate-node-id], [data-canvas-owner-node-id]",
      ));
      transformOnlyElements = elements.filter((element) => {
        const elementNodeId = element.dataset.nodeId
          ?? element.dataset.coordinateNodeId
          ?? element.dataset.canvasOwnerNodeId
          ?? "";
        if (!ids.has(elementNodeId)) return false;
        const parentNode = element.parentElement?.closest<Element>("[data-node-id]");
        return !parentNode || !ids.has(parentNode.dataset.nodeId ?? "");
      });
      const overlay = canvas.querySelector?.(".selection-overlay");
      if (overlay) transformOnlyElements.push(overlay);
    }
    transformOnlyElements.forEach((element) => {
      const isHtmlElement = element.namespaceURI === "http://www.w3.org/1999/xhtml";
      const baseTransform = element.dataset.transformOnlyBase
        ?? (isHtmlElement ? element.style.transform : element.getAttribute("transform"))
        ?? "";
      element.dataset.transformOnlyBase = baseTransform;
      if (isHtmlElement) element.style.transform = `translate(${dx}px, ${dy}px) ${baseTransform}`;
      else element.setAttribute("transform", `translate(${dx} ${dy}) ${baseTransform}`);
    });
  }

  function clearTransformOnlyMove() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    Array.from(canvas.querySelectorAll<Element>("[data-transform-only-base]")).forEach((element) => {
      if (element.namespaceURI === "http://www.w3.org/1999/xhtml") {
        element.style.transform = element.dataset.transformOnlyBase ?? "";
      }
      else element.setAttribute("transform", element.dataset.transformOnlyBase ?? "");
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
    nestedDropPath.value = [];
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
      nestedDropPath.value = [];
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
    nestedDropPath.value = [];
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
      // Detaching a concat is structural only; retain its current frame and rendered scales.
      if (composition.type !== "concat") renderSharedCoordinateComposition(member, true);
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
    // The graph is about to be partitioned. Split every former shared axis
    // before reconciling the surviving concat components below.
    dispatchRelationship({
      type: "remove-composition",
      compositionId: composition.id,
      keepSharedAxes: false,
    });
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
      // Severing a link must not replay concat layout or regenerate scales.
      componentNodes.forEach((node) => {
        node.compositionSpec = nextComposition;
        node.coordinateSystem = nextSystem;
      });
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
      if (node.kind === "group" && node.children.length > 0 && composition.type === "facet") {
        const chartNode = firstChartNode(node);
        if (!chartNode) return false;
        axisBindingTarget.value = {
          nodeId: chartNode.id,
          channel: chartNode.coordinateGuide?.type === "Polar" ? "angle" : "x",
        };
        return true;
      }
      const configurableFacet = composition.type !== "facet"
        || !!composition.facetField
        || !!composition.facetGrid;
      const memberIds = configurableFacet ? scopedCompositionMemberIds(node) : [];
      if (memberIds.length > 1 && memberIds.every((id) => selectedIds.value.includes(id))) {
        axisBindingTarget.value = {
          nodeId: node.id,
          channel: node.coordinateGuide?.type === "Polar" ? "angle" : "x",
        };
        return true;
      }
      // A passive structural selection must be entered before member-owned
      // nested controls become configurable.
      return false;
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
    if (nestedDropPath.value.length > 0) {
      const exited = nestedDropPath.value.pop();
      const parent = nestedDropPath.value.at(-1);
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
      nestedDropPath.value = [];
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
          setAxisBindingTarget({
            nodeId: node.id,
            channel: getChartTemplateContract(node.chartSpec!.chartType)?.coordinateSystem === "Polar" ? "angle" : "x",
            clientX: event.clientX,
            clientY: event.clientY,
          });
        });
      }
      return;
    }
    if (selectionTestOnly("composition")) {
      event.stopPropagation();
      if (node.chartSpec || node.layerKind === "deckgl") measureSelectionStage(node.id, "composition", () => {
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
        setAxisBindingTarget({
          nodeId: node.id,
          channel: getChartTemplateContract(node.chartSpec!.chartType)?.coordinateSystem === "Polar" ? "angle" : "x",
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
      if (!draggingNestedUnit && (node.chartSpec || node.layerKind === "deckgl") && (nextSelection.length === 1 || draggingWholeComposition)) {
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
  function applyPendingMoveInteraction() {
    const pending = pendingMoveUpdate;
    pendingMoveUpdate = null;
    if (!pending || interaction.value !== pending.interaction) return;
    if (pending.interaction.transformOnly || pending.interaction.deferred) {
      setTransformOnlyMove(
        pending.interaction,
        pending.point.x - pending.interaction.startPoint.x,
        pending.point.y - pending.interaction.startPoint.y,
      );
    } else {
      updateMoveInteraction(pending.point, pending.interaction);
    }
  }

  function scheduleMoveInteraction(currentPoint: Point, mi: MoveInteraction) {
    pendingMoveUpdate = { point: currentPoint, interaction: mi };
    if (moveUpdateFrame !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      applyPendingMoveInteraction();
      return;
    }
    moveUpdateFrame = requestAnimationFrame(() => {
      moveUpdateFrame = null;
      applyPendingMoveInteraction();
    });
  }

  function flushMoveInteraction() {
    if (moveUpdateFrame !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(moveUpdateFrame);
      moveUpdateFrame = null;
    }
    applyPendingMoveInteraction();
  }

  function cancelMoveInteractionSchedule() {
    if (moveUpdateFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(moveUpdateFrame);
    }
    moveUpdateFrame = null;
    pendingMoveUpdate = null;
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
      if (item.layerKind === "deckgl") {
        // Mapbox owns an HTML viewport, so it may resize freely on both axes.
        item.x = anchor.x + (snap.x - anchor.x) * scaleX;
        item.y = anchor.y + (snap.y - anchor.y) * scaleY;
        item.scaleX = Math.max(snap.scaleX * scaleX, 0.01);
        item.scaleY = Math.max(snap.scaleY * scaleY, 0.01);
      } else if (item.chartSpec && item.coordinateGuide) {
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
    const deckglSource = ai?.type === "move" && compositionDragSourceId.value
      ? findCanvasNode(compositionDragSourceId.value)
      : null;
    const deckglDropTarget = deckglSource?.chartSpec && deckglSource.renderedContent
      ? deckglPointDropTarget.value
      : null;
    let finalMovePoint: Point | null = null;
    const nestedLayoutIds = ai && ai.type !== "move" && "itemIds" in ai
      ? Object.values(chartRelationships.value.nestedRelationships)
        .filter((relationship) => ai.itemIds.includes(relationship.parentChartId)
          || ai.itemIds.includes(relationship.childChartId))
        .map((relationship) => relationship.id)
      : [];
    if (ai?.type === "move") {
      if (ai.historyCommitted) {
        if (ai.transformOnly || ai.deferred) {
          if (moveUpdateFrame !== null) {
            cancelAnimationFrame(moveUpdateFrame);
            moveUpdateFrame = null;
          }
          pendingMoveUpdate = null;
          const finalPoint = ai.scopeGroupId
            ? toSelectionScopePoint(event.clientX, event.clientY, ai.scopeGroupId)
            : toCanvasPoint(event.clientX, event.clientY);
          finalMovePoint = finalPoint;
          updateMoveInteraction(finalPoint, ai);
          if (!deckglDropTarget) pushMoveHistory(ai);
          // The model now owns the final position. Restore the temporary DOM
          // transform so it cannot become the base for the next drag.
          clearTransformOnlyMove();
        } else {
          flushMoveInteraction();
          if (!deckglDropTarget) commitMoveHistory(ai);
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
      if (ai?.type === "move" && ai.historyCommitted && compositionDragSourceId.value && deckglDropTarget) {
        nestCanvasNodeOnDeckglPoint(
          compositionDragSourceId.value,
          deckglDropTarget,
          ai.historySnapshot,
          ai.snapshots[compositionDragSourceId.value],
        );
      } else if (ai?.type === "move" && ai.historyCommitted && compositionDragSourceId.value) {
        if (ai.transformOnly && finalMovePoint) {
          activeDropZone.value = compositionDropZoneAtPoint(finalMovePoint, compositionDragSourceId.value);
        } else {
          flushCompositionDropZone();
        }
        if (activeDropZone.value) {
          commitCompositionDrop(activeDropZone.value, compositionDragSourceId.value);
        }
      }
    }
    interaction.value = null;
    if (nestedLayoutIds.length > 0) scheduleNestedChildLayout(nestedLayoutIds);
    compositionDragSourceId.value = null;
    deckglPointDropTarget.value = null;
    clearCompositionDropZoneSchedule();
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
      if (!ai.historyCommitted) {
        const dragThreshold = 2 / Math.max(viewZoom.value, 0.01);
        if (Math.abs(movePoint.x - ai.startPoint.x) <= dragThreshold
          && Math.abs(movePoint.y - ai.startPoint.y) <= dragThreshold) return;
        ai.historyCommitted = true;
      }
      if (ai.transformOnly) {
        setTransformOnlyMove(ai, movePoint.x - ai.startPoint.x, movePoint.y - ai.startPoint.y);
        return;
      }
      scheduleMoveInteraction(movePoint, ai);
      if (dragTestStage === "position") return;
      if (compositionDragSourceId.value) {
        scheduleCompositionDropZone(movePoint, compositionDragSourceId.value);
        // Enter portals change the editing scope, so resolve them on the
        // pointer event rather than waiting for another movement or hover delay.
        flushCompositionDropZone();
      } else {
        activeDropZone.value = null;
      }
      const dropZone = activeDropZone.value;
      const enteringComposition = !!dropZone?.enterCompositionId;
      const enteringNested = dropZone?.type === "nested" && dropZone.nestedAction === "enter";
      if (dropZone && (enteringComposition || enteringNested)) {
        const sourceNodeId = compositionDragSourceId.value;
        if (sourceNodeId) {
          if (dropZone.enterCompositionId) enterCompositionDropLevel(dropZone);
          else enterNestedDropLevel(dropZone);
          activeDropZone.value = compositionDropZoneAtPoint(movePoint, sourceNodeId);
        }
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

  return {
    attachPointerListeners,
    detachPointerListeners,
    startMove,
    commitMoveHistory,
    setTransformOnlyMove,
    clearTransformOnlyMove,
    enterCanvasGroup,
    enterSelection,
    selectedNestedRelationship,
    nestedBatchMetadata,
    removeNestedComposition,
    removeSelectionComposition,
    splitConcatLink,
    configureSelectionComposition,
    exitGroupEditing,
    exitSelectionHierarchy,
    clearTransientChartSelectionState,
    clearSelectionTransientState,
    clearSelectionDrilldown,
    finishSelectionComposition,
    resetSelectionScope,
    onCanvasNodePointerDown,
    openContextMenu,
    onCanvasNodeContextMenu,
    onCanvasContextMenu,
    onCanvasPointerDown,
    onEditingGroupBackgroundPointerDown,
    onScaleHandlePointerDown,
    onRotateHandlePointerDown,
    onCoordinateOriginPointerDown,
    onCoordinateAxisScalePointerDown,
    onPolarAnglePointerDown,
    updateRotateInteraction,
    setSelectionRotation,
    setPolarAngleSpan,
    updateMoveInteraction,
    scheduleMoveInteraction,
    flushMoveInteraction,
    cancelMoveInteractionSchedule,
    updateScaleInteraction,
    updateCoordinateOriginInteraction,
    updateCoordinateAxisScaleInteraction,
    updatePolarAngleInteraction,
    finalizeMarqueeSelection,
    onWindowPointerUp,
    onWindowPointerMove,
    onCanvasWheel,
    resetCanvasZoom,
  };
}
