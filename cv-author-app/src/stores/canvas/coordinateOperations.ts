import { computed, nextTick } from "vue";
import type { Bounds, CanvasGroupNode, CanvasNode, ChartEncodingChannel, CoordinateChannel, CoordinateSystemSpec, DataBindingDropZone, Point } from "../../types";
import type { CsvColumnDragPayload } from "../../utils/csvColumnDrag";
import { materializeGraphDataset } from "../../utils/chartDataPipeline";
import { cartesianTreeDirection, cartesianTreeLeafAxis, isCartesianTreeChart } from "../../utils/treeLayout";
import type { Matrix } from "./coordinates";

export function useCanvasCoordinateOperations(context: any) {
  const {
    axesForChart, axisBindingTarget, barItemAxisBinding, bindingForChartChannel,
    canvasNodes, canvasRef, chartDrilldown, chartRelationships,
    chartsForAxis,
    cloneCanvasNode, collectNodeBounds, collectNodeSelectionBounds,
    compositionFrameAnimations, createCartesianAxisModel, decodeCsvColumnDragPayload,
    concatGraphMembers, concatLinksFor, defaultRelativeParameters, dispatchRelationship, editingCompositionId, editingGroupPath,
    endCsvColumnDrag, findCanvasNode, getActiveCsvColumnDrag,
    generatedCandidates, getChartTemplateContract, getGroupAtPath, getGroupsAtPath,
    getRootNode, hasRequiredChartEncodings,
    getSelectionScopeNodes, getSelectionNode, getDataset, getNodeSelectionBounds, getNodeTransform,
    getPolarOccupiedGeometry, identityMatrix, invertMatrix,
    implementedTemplateDefinitions, inferColumnIntents, isDataColumnTypeCompatible,
    isDefaultChartDataSpec, logicalAxisChannel, multiplyMatrix, nestedDropPath, normalizeBounds,
    normalizeChartTemplate,
    pointInBounds, pointToSegmentDistance, renderChartNode, renderSharedCoordinateComposition,
    reconcileRelationshipNodes, replaceDefaultDataBinding, selectedIds, semanticSelection,
    seriesItemCategoricalFields, seriesItemMemberIds, setSelection, transformPoint,
    viewPan, viewZoom,
    walkCanvasNodes, chartScalePosition, csvColumnDragMime, compositionEditLayout,
    candidates, compositionOptions, coordinateOptions, getLeafNodeTransform,
  } = context;

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
      const normalizedChartType = node.chartSpec?.chartType.replace(/[\s_-]/g, "").toLowerCase();
      if (normalizedChartType === "dendrogram" && node.coordinateGuide?.type !== "Cartesian") {
        const minX = node.kind === "leaf" ? node.contentMinX : 0;
        const minY = node.kind === "leaf" ? node.contentMinY : 0;
        node.coordinateGuide = {
          type: "Cartesian",
          origin: { x: minX, y: minY + node.height },
          xDirection: 1,
          yDirection: -1,
        };
        node.coordinateSystem = standaloneCoordinateSystem(node);
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
  function currentDropZoneScopeNodes() {
    const scopeNodes = getSelectionScopeNodes();
    const entered = nestedDropPath.value.at(-1);
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

  function canvasNodesWithRestoredCompositionLayout(nodes = canvasNodes.value) {
    if (!compositionEditLayout.value) return nodes;
    const clones = nodes.map((node) => cloneCanvasNode(node));
    const visit = (items: CanvasNode[]) => items.forEach((node) => {
      const frame = compositionEditLayout.value?.frames[node.id];
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
    const layout = compositionEditLayout.value;
    compositionEditLayout.value = null;
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
    compositionEditLayout.value = layout;
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
      if (compositionEditLayout.value !== layout || editingCompositionId.value !== composition.id) return;
      animateCompositionFrameChange(members.map((member) => member.id), () => {
        placements.forEach(({ member, x }) => { member.x = x; });
      });
    });
  }

  function beginCompositionEditing(composition: NonNullable<CanvasNode["compositionSpec"]>) {
    if (composition.type !== "layer" && composition.type !== "concat" && composition.type !== "facet") return false;
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
    return seriesItemMemberIds(node).length;
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
  function getCandidate(candidateId: string) {
    return implementedTemplateDefinitions.find((c) => c.id === candidateId)
      ?? generatedCandidates.value.find((c) => c.id === candidateId)
      ?? candidates.find((c) => c.id === candidateId);
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
      const sourceDataset = getDataset(inputSpec.datasetId);
      const dataset = sourceDataset ? materializeGraphDataset(sourceDataset, inputSpec) : null;
      const column = dataset?.columns.find((item) => item.name === payload.field);
      const itemBinding = barItemAxisBinding(node);
      const expectedTable = sourceDataset?.graph
        ? normalizeChartTemplate(inputSpec.chartType) === "flow" ? "edges" : "nodes"
        : undefined;
      if (inputSpec.datasetId === payload.datasetId
        && (!payload.table || !expectedTable || payload.table === expectedTable)
        && column?.type === payload.type && itemBinding) {
        const bounds = seriesItemDropBounds(node);
        if (pointInBounds(point, bounds)) {
          const categoricalFields = seriesItemCategoricalFields(inputSpec);
          const categoricalMode = categoricalFields.length > 0;
          const quantitativeMode = (inputSpec.valueFields?.length ?? 0) > 0;
          const chartContract = getChartTemplateContract(inputSpec.chartType);
          const segmentContract = chartContract?.channels.find((channel: { channel: string }) => channel.channel === "segment");
          const polarChart = chartContract?.coordinateSystem === "Polar" && !!segmentContract;
          const polarSegmentField = inputSpec.encodings.segment?.field;
          const polarMeasureSet = (inputSpec.angleFields?.length ?? 0) > 0;
          const compatible = polarChart
            ? polarMeasureSet
              ? column.type === "quantitative"
              : polarSegmentField
                ? column.name === polarSegmentField
                : segmentContract
                  ? isDataColumnTypeCompatible(segmentContract.accepts, column.type)
                  : false
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
        if (payload.table && expectedTable && payload.table !== expectedTable) return false;
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
        ]).filter(({ channel }) => !isCartesianTreeChart(node.chartSpec?.chartType)
          || cartesianTreeLeafAxis(cartesianTreeDirection(node.chartSpec)) === channel)
          .forEach(({ channel, start, end }) => {
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
      const sourceDataset = getDataset(spec.datasetId);
      const dataset = sourceDataset ? materializeGraphDataset(sourceDataset, spec) : null;
      const column = dataset?.columns.find((item) => item.name === payload.field);
      const expectedTable = sourceDataset?.graph
        ? normalizeChartTemplate(spec.chartType) === "flow" ? "edges" : "nodes"
        : undefined;
      if (!column || column.type !== payload.type
        || (payload.table && expectedTable && payload.table !== expectedTable)) return false;
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
    const sourceDataset = getDataset(bodyTarget.chartSpec.datasetId);
    const dataset = sourceDataset ? materializeGraphDataset(sourceDataset, bodyTarget.chartSpec) : null;
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
  return {
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
  };
}
