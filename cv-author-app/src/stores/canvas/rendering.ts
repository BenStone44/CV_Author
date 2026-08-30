import type { CanvasNode, ChartScaleSpec, ChartSpec, Dataset, Point } from "../../types";
import { chartDataPreparationKey, mergeSharedScale } from "./renderingData";

export function useCanvasRendering(context: any) {
  const {
    chartRelationships,
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
  } = context;
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

  function alignCartesianConcatDimension(
    target: CanvasNode,
    member: CanvasNode,
    direction: "horizontal" | "vertical",
  ) {
    if (target.coordinateGuide?.type !== "Cartesian" || member.coordinateGuide?.type !== "Cartesian") return;
    if (direction === "horizontal") {
      member.height = target.height;
      member.scaleY = target.scaleY;
      member.coordinateGuide.origin.y = target.coordinateGuide.origin.y;
      member.coordinateGuide.yDirection = target.coordinateGuide.yDirection;
      member.coordinateGuide.yScale = target.coordinateGuide.yScale;
      return;
    }
    member.width = target.width;
    member.scaleX = target.scaleX;
    member.coordinateGuide.origin.x = target.coordinateGuide.origin.x;
    member.coordinateGuide.xDirection = target.coordinateGuide.xDirection;
    member.coordinateGuide.xScale = target.coordinateGuide.xScale;
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
    const orderedMembers = owner.compositionSpec.members
      .map((item) => members.find((member) => member.id === item.nodeId))
      .filter((member): member is CanvasNode => !!member);
    if (orderedMembers.length === 0) return;
    const memberIds = new Set(orderedMembers.map((member) => member.id));
    // Project the concat graph onto one polar axis. Links in the other axis
    // keep their endpoints aligned so radial and angular concats can combine.
    const positionsFor = (direction: "radial" | "angular") => {
      const links = concatLinksFor(owner.compositionSpec!).filter((link) =>
        memberIds.has(link.targetNodeId)
        && memberIds.has(link.sourceNodeId),
      );
      const adjacency = new Map<string, Array<{ nodeId: string; delta: number }>>();
      orderedMembers.forEach((member) => adjacency.set(member.id, []));
      links.forEach((link) => {
        const delta = link.direction === direction
          ? (link.position === "after" ? 1 : -1)
          : 0;
        adjacency.get(link.targetNodeId)?.push({ nodeId: link.sourceNodeId, delta });
        adjacency.get(link.sourceNodeId)?.push({ nodeId: link.targetNodeId, delta: -delta });
      });
      const positions = new Map<string, number>();
      orderedMembers.forEach((member) => {
        if (positions.has(member.id)) return;
        positions.set(member.id, 0);
        const queue = [member.id];
        while (queue.length > 0) {
          const currentId = queue.shift()!;
          const currentPosition = positions.get(currentId)!;
          adjacency.get(currentId)?.forEach(({ nodeId, delta }) => {
            if (positions.has(nodeId)) return;
            positions.set(nodeId, currentPosition + delta);
            queue.push(nodeId);
          });
        }
      });
      const values = Array.from(positions.values());
      const minimum = Math.min(...values);
      const count = Math.max(1, Math.max(...values) - minimum + 1);
      return { positions, minimum, count };
    };
    const radial = positionsFor("radial");
    const angular = positionsFor("angular");
    const ownerOrigin = nodeLocalToSelectionScopePoint(owner, owner.coordinateGuide.origin);
    const totalAngleSpan = Math.max(1, Math.min(
      owner.compositionSpec.polarAngleSpan ?? owner.coordinateGuide.angleSpan ?? 360,
      360,
    ));
    const baseAngleOffset = owner.compositionSpec.polarAngleOffset ?? owner.coordinateGuide.angleOffset ?? 0;
    const angularSpan = totalAngleSpan / angular.count;
    orderedMembers.forEach((member) => {
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
      const radialIndex = radial.positions.get(member.id)! - radial.minimum;
      const angularIndex = angular.positions.get(member.id)! - angular.minimum;
      guide.angleSpan = angularSpan;
      guide.angleOffset = baseAngleOffset + angularSpan * angularIndex;
      guide.innerRadiusRatio = radialIndex / radial.count;
      guide.outerRadiusRatio = (radialIndex + 1) / radial.count;
    });
  }

  function alignCartesianConcatFrames(owner: CanvasNode, members: CanvasNode[]) {
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

    // concatLinksFor returns creation order. Replay each gesture against its
    // recorded reference chart so later links cannot reposition that target
    // through a group-wide member ordering or graph traversal.
    layoutLinks.forEach((link) => {
      const target = byId.get(link.targetNodeId);
      const source = byId.get(link.sourceNodeId);
      if (!target || !source
        || target.coordinateGuide?.type !== "Cartesian"
        || source.coordinateGuide?.type !== "Cartesian"
        || (link.direction !== "horizontal" && link.direction !== "vertical")) return;
      source.rotation = target.rotation;
      alignCartesianConcatDimension(target, source, link.direction);
      const targetBounds = collectNodeSelectionBounds(target);
      const sourceBounds = collectNodeSelectionBounds(source);
      const gap = Math.max(6, Math.min(14, Math.min(targetBounds.width, targetBounds.height) * 0.025));
      if (link.direction === "horizontal") {
        const desiredX = link.position === "before"
          ? targetBounds.minX - gap - sourceBounds.width
          : targetBounds.maxX + gap;
        source.x += desiredX - sourceBounds.minX;
        source.y += targetBounds.minY - sourceBounds.minY;
      } else {
        const desiredY = link.position === "before"
          ? targetBounds.minY - gap - sourceBounds.height
          : targetBounds.maxY + gap;
        source.x += targetBounds.minX - sourceBounds.minX;
        source.y += desiredY - sourceBounds.minY;
      }
    });
  }

  function setCartesianAxisVisibility(node: CanvasNode, channel: "x" | "y", visible: boolean) {
    if (!node.chartSpec) return;
    node.chartSpec = {
      ...node.chartSpec,
      axes: {
        ...node.chartSpec.axes,
        [channel]: {
          ...node.chartSpec.axes?.[channel],
          visible,
          labelsVisible: visible,
        },
      },
    };
  }

  function resetCartesianAxisVisibility(node: CanvasNode) {
    if (node.coordinateGuide?.type !== "Cartesian") return;
    setCartesianAxisVisibility(node, "x", true);
    setCartesianAxisVisibility(node, "y", true);
  }

  function syncCartesianConcatAxisVisibility(owner: CanvasNode, members: CanvasNode[]) {
    const composition = owner.compositionSpec;
    if (composition?.type !== "concat") return;
    const cartesianMembers = members.filter((member) => member.coordinateGuide?.type === "Cartesian");
    const byId = new Map(cartesianMembers.map((member) => [member.id, member]));
    const memberOrder = new Map(composition.members.map((member, index) => [member.nodeId, index]));
    const visibleOwners = new Map<"x" | "y", Set<string>>([
      ["x", new Set<string>()],
      ["y", new Set<string>()],
    ]);
    const sharedMembers = new Map<"x" | "y", Set<string>>([
      ["x", new Set<string>()],
      ["y", new Set<string>()],
    ]);
    (["x", "y"] as const).forEach((channel) => {
      const links = concatLinksFor(composition).filter((link) =>
        link.sharedChannels.includes(channel)
        && byId.has(link.targetNodeId)
        && byId.has(link.sourceNodeId));
      const adjacency = new Map<string, Set<string>>();
      links.forEach((link) => {
        const targets = adjacency.get(link.targetNodeId) ?? new Set<string>();
        targets.add(link.sourceNodeId);
        adjacency.set(link.targetNodeId, targets);
        const sources = adjacency.get(link.sourceNodeId) ?? new Set<string>();
        sources.add(link.targetNodeId);
        adjacency.set(link.sourceNodeId, sources);
        sharedMembers.get(channel)!.add(link.targetNodeId);
        sharedMembers.get(channel)!.add(link.sourceNodeId);
      });
      const visited = new Set<string>();
      adjacency.forEach((_neighbors, memberId) => {
        if (visited.has(memberId)) return;
        const componentIds: string[] = [];
        const queue = [memberId];
        visited.add(memberId);
        while (queue.length > 0) {
          const current = queue.shift()!;
          componentIds.push(current);
          adjacency.get(current)?.forEach((neighbor) => {
            if (visited.has(neighbor)) return;
            visited.add(neighbor);
            queue.push(neighbor);
          });
        }
        const component = componentIds.flatMap((id) => {
          const member = byId.get(id);
          return member ? [member] : [];
        });
        const axisOwner = component.sort((left, right) => {
          const leftBounds = collectNodeSelectionBounds(left);
          const rightBounds = collectNodeSelectionBounds(right);
          const spatialDifference = channel === "y"
            ? leftBounds.minX - rightBounds.minX
            : rightBounds.maxY - leftBounds.maxY;
          return spatialDifference || (memberOrder.get(left.id) ?? 0) - (memberOrder.get(right.id) ?? 0);
        })[0];
        if (axisOwner) visibleOwners.get(channel)!.add(axisOwner.id);
      });
    });

    const syncChannel = (member: CanvasNode, channel: "x" | "y") => {
      const visible = !sharedMembers.get(channel)!.has(member.id)
        || visibleOwners.get(channel)!.has(member.id);
      setCartesianAxisVisibility(member, channel, visible);
    };
    cartesianMembers.forEach((member) => {
      syncChannel(member, "x");
      syncChannel(member, "y");
    });
  }

  function renderSharedCoordinateComposition(node: CanvasNode, applyAxisVisibility = false) {
    const type = node.compositionSpec?.type;
    const members = sharedCoordinateMembers(node);
    if (members.length <= 1 || (type !== "layer" && type !== "concat")) {
      if (applyAxisVisibility) resetCartesianAxisVisibility(node);
      renderChartNode(node);
      return;
    }
    const owner = members.find((member) => member.id === node.coordinateSystem?.ownerNodeId) ?? members[0]!;
    // First obtain every unit's native domain. The second pass merges only the
    // declared shared channels and preserves independent concat dimensions.
    members.forEach((member) => renderChartNode(member, false));
    if (type === "concat") {
      if (owner.coordinateGuide?.type === "Polar") alignPolarConcatFrame(owner, members);
      else {
        alignCartesianConcatFrames(owner, members);
        if (applyAxisVisibility) syncCartesianConcatAxisVisibility(owner, members);
      }
    }
    members.forEach((member) => renderChartNode(member, true));
    // Shared-scale rendering may change a member's live plot area. Replay the
    // same ordered links once more against final bounds to keep every added
    // chart flush with the reference chart used by its concat gesture.
    if (type === "concat" && owner.coordinateGuide?.type === "Cartesian") {
      alignCartesianConcatFrames(owner, members);
      if (applyAxisVisibility) syncCartesianConcatAxisVisibility(owner, members);
    }
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
      && node.compositionSpec?.type !== "layer"
      && node.compositionSpec?.type !== "concat") {
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
    const defaultFallback = complete ? null : defaultChartSpecWithAppearance(chartSpec, node.id);
    const fallbackChartSpec = defaultFallback
      && (!defaultFallback.series || isDefaultChartDataSpec(chartSpec) || chartSpec.defaultDataBinding === true)
      ? defaultFallback
      : null;
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
    const renderDataset = fallbackChartSpec
      ? getDataset(renderingInputSpec.datasetId) ?? defaultChartDataset
      : sourceDataset;
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
        polarConcatDirection: node.compositionSpec?.type === "concat"
          && (node.compositionSpec.direction === "radial" || node.compositionSpec.direction === "angular")
          ? node.compositionSpec.direction
          : undefined,
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

  return {
    sharedCoordinateMembers,
    mergedCompositionScales,
    setPolarNodeOrigin,
    alignPolarConcatFrame,
    renderSharedCoordinateComposition,
    prepareChartDataForNode,
    renderChartNode,
  };
}
