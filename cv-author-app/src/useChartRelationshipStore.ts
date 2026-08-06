import { computed, ref } from "vue";
import { getChartTemplateContract } from "./chartTemplates";
import type {
  AxisBinding,
  AxisComponent,
  AxisComponentConfig,
  AxisRole,
  CanvasNode,
  ChartRelationshipCommand,
  ChartRelationshipState,
  CoordinateChannel,
  CoordinateGuide,
  MarkGroupSpec,
  NestedElementFrame,
  NestedRelationship,
  RelationshipComposition,
  RelationshipSelection,
  RelativeNestedParameters,
  ResolvedNestedTransform,
} from "./types";

type NestedResolver = (
  relationship: NestedRelationship,
  parent: NestedElementFrame,
  child: NestedElementFrame,
) => ResolvedNestedTransform;

function clonePlainValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clonePlainValue(item)) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clonePlainValue(item)]),
    ) as T;
  }
  return value;
}

function emptyState(): ChartRelationshipState {
  return {
    version: 1,
    charts: {},
    markGroups: {},
    axes: {},
    axisBindings: {},
    compositions: {},
    nestedRelationships: {},
  };
}

export function cloneChartRelationshipState(source: ChartRelationshipState): ChartRelationshipState {
  return {
    version: 1,
    charts: Object.fromEntries(Object.entries(source.charts).map(([id, chart]) => [id, {
      ...chart,
      markGroupIds: [...chart.markGroupIds],
      axisBindingIds: [...chart.axisBindingIds],
      compositionIds: [...chart.compositionIds],
    }])),
    markGroups: Object.fromEntries(Object.entries(source.markGroups).map(([id, group]) => [id, {
      ...group,
      memberKeys: [...group.memberKeys],
      sharedConfig: { ...group.sharedConfig },
    }])),
    axes: Object.fromEntries(Object.entries(source.axes).map(([id, axis]) => [id, {
      ...axis,
      config: {
        ...axis.config,
        origin: { ...axis.config.origin },
        style: axis.config.style ? { ...axis.config.style } : undefined,
      },
    }])),
    axisBindings: Object.fromEntries(Object.entries(source.axisBindings).map(([id, binding]) => [id, { ...binding }])),
    compositions: Object.fromEntries(Object.entries(source.compositions).map(([id, composition]) => [id, {
      ...composition,
      memberChartIds: [...composition.memberChartIds],
      sharedAxisIds: [...composition.sharedAxisIds],
      sharedChannels: [...composition.sharedChannels],
      facetCells: composition.facetCells?.map((cell) => ({ ...cell })),
    }])),
    nestedRelationships: Object.fromEntries(Object.entries(source.nestedRelationships).map(([id, relationship]) => [id, {
      ...relationship,
      parameters: clonePlainValue(relationship.parameters),
    }])),
  };
}

function snapshotRelationshipState(includeDrafts = true) {
  const snapshot = cloneChartRelationshipState(relationshipState.value);
  if (includeDrafts) return snapshot;
  Object.values(snapshot.nestedRelationships).forEach((relationship) => {
    if (relationship.status !== "draft") return;
    delete snapshot.nestedRelationships[relationship.id];
    const child = snapshot.charts[relationship.childChartId];
    if (!child || child.instanceKind !== "nested-child" || child.nodeId !== null) return;
    child.markGroupIds.forEach((id) => { delete snapshot.markGroups[id]; });
    child.axisBindingIds.forEach((id) => {
      const binding = snapshot.axisBindings[id];
      if (!binding) return;
      delete snapshot.axisBindings[id];
      if (!Object.values(snapshot.axisBindings).some((item) => item.axisId === binding.axisId)) {
        delete snapshot.axes[binding.axisId];
      }
    });
    delete snapshot.charts[child.id];
  });
  return snapshot;
}

function nextId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function axisConfigFromGuide(channel: CoordinateChannel, guide?: CoordinateGuide | null): AxisComponentConfig {
  const origin = guide?.origin ? { ...guide.origin } : { x: 0, y: 0 };
  if (guide?.type === "Cartesian") {
    return {
      origin,
      direction: channel === "y" ? guide.yDirection : guide.xDirection,
      scale: channel === "y" ? guide.yScale ?? 1 : guide.xScale ?? 1,
      visible: true,
    };
  }
  if (guide?.type === "Polar") {
    return {
      origin,
      direction: 1,
      scale: channel === "radius"
        ? guide.radiusScale ?? 1
        : channel === "ring"
          ? guide.ringScale ?? 1
          : 1,
      visible: true,
    };
  }
  return { origin, direction: 1, scale: 1, visible: true };
}

function isRelativeParameters(parameters: NestedRelationship["parameters"]): parameters is RelativeNestedParameters {
  const value = parameters as Partial<RelativeNestedParameters>;
  return !!value.parentAnchor && !!value.childAnchor && !!value.offset && !!value.scale
    && typeof value.rotation === "number";
}

function rotate(point: { x: number; y: number }, degrees: number) {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

const relativePositionResolver: NestedResolver = (relationship, parent, child) => {
  if (!isRelativeParameters(relationship.parameters)) {
    throw new Error(`Nested relationship ${relationship.id} has invalid relative-position parameters.`);
  }
  const parameters = relationship.parameters;
  const parentWidth = parent.width * parent.scaleX;
  const parentHeight = parent.height * parent.scaleY;
  const parentAnchorVector = rotate({
    x: (parameters.parentAnchor.x - 0.5) * parentWidth,
    y: (parameters.parentAnchor.y - 0.5) * parentHeight,
  }, parent.rotation);
  const offset = rotate({
    x: parameters.offset.x * parent.scaleX,
    y: parameters.offset.y * parent.scaleY,
  }, parent.rotation);
  const anchor = {
    x: parent.x + parentWidth / 2 + parentAnchorVector.x + offset.x,
    y: parent.y + parentHeight / 2 + parentAnchorVector.y + offset.y,
  };
  const scaleX = parent.scaleX * parameters.scale.x;
  const scaleY = parent.scaleY * parameters.scale.y;
  const rotation = parent.rotation + parameters.rotation;
  const childWidth = child.width * scaleX;
  const childHeight = child.height * scaleY;
  const childAnchorVector = rotate({
    x: (parameters.childAnchor.x - 0.5) * childWidth,
    y: (parameters.childAnchor.y - 0.5) * childHeight,
  }, rotation);
  const center = {
    x: anchor.x - childAnchorVector.x,
    y: anchor.y - childAnchorVector.y,
  };
  return {
    x: center.x - childWidth / 2,
    y: center.y - childHeight / 2,
    scaleX,
    scaleY,
    rotation,
  };
};

const relationshipState = ref<ChartRelationshipState>(emptyState());
const selectedEntity = ref<RelationshipSelection>(null);
const nestedResolvers = new Map<string, NestedResolver>([["relative-position@1", relativePositionResolver]]);

function chartOrThrow(chartId: string) {
  const chart = relationshipState.value.charts[chartId];
  if (!chart) throw new Error(`Unknown chart: ${chartId}`);
  return chart;
}

function axisOrThrow(axisId: string) {
  const axis = relationshipState.value.axes[axisId];
  if (!axis) throw new Error(`Unknown axis: ${axisId}`);
  return axis;
}

function bindingsForAxis(axisId: string) {
  return Object.values(relationshipState.value.axisBindings).filter((binding) => binding.axisId === axisId);
}

function bindingForChartChannel(chartId: string, channel: CoordinateChannel, role: AxisRole = "primary") {
  return Object.values(relationshipState.value.axisBindings).find((binding) =>
    binding.chartId === chartId && binding.channel === channel && binding.role === role,
  ) ?? null;
}

function removeBinding(binding: AxisBinding) {
  delete relationshipState.value.axisBindings[binding.id];
  const chart = relationshipState.value.charts[binding.chartId];
  if (chart) chart.axisBindingIds = chart.axisBindingIds.filter((id) => id !== binding.id);
  const remaining = bindingsForAxis(binding.axisId);
  if (remaining.length === 1) remaining[0]!.scalePolicy = "independent";
}

function bindAxis(
  axisId: string,
  chartId: string,
  channel: CoordinateChannel,
  role: AxisRole = "primary",
  scalePolicy: AxisBinding["scalePolicy"] = "independent",
) {
  const chart = chartOrThrow(chartId);
  const axis = axisOrThrow(axisId);
  if (axis.channel !== channel) throw new Error(`Axis ${axisId} cannot bind to ${channel}.`);
  const existing = bindingForChartChannel(chartId, channel, role);
  if (existing?.axisId === axisId) return existing;
  if (existing) removeBinding(existing);
  const id = `axis-binding:${chartId}:${channel}:${role}`;
  const binding: AxisBinding = { id, axisId, chartId, channel, role, scalePolicy };
  relationshipState.value.axisBindings[id] = binding;
  chart.axisBindingIds = unique([...chart.axisBindingIds, id]);
  const sharedBindings = bindingsForAxis(axisId);
  if (sharedBindings.length > 1) sharedBindings.forEach((item) => { item.scalePolicy = "shared"; });
  return binding;
}

function createAxisForChart(chartId: string, channel: CoordinateChannel, guide?: CoordinateGuide | null) {
  const chart = chartOrThrow(chartId);
  const contract = getChartTemplateContract(chart.chartType);
  const coordinateType = contract?.coordinateSystem ?? guide?.type ?? "None";
  const axis: AxisComponent = {
    id: nextId("axis"),
    coordinateType,
    channel,
    config: axisConfigFromGuide(channel, guide),
    createdWithChartId: chartId,
  };
  relationshipState.value.axes[axis.id] = axis;
  bindAxis(axis.id, chartId, channel);
  return axis;
}

function shareAxis(chartIds: string[], channel: CoordinateChannel, requestedAxisId?: string) {
  const ids = unique(chartIds);
  if (ids.length === 0) throw new Error("share-axis requires at least one chart.");
  ids.forEach(chartOrThrow);
  const firstBinding = bindingForChartChannel(ids[0]!, channel);
  const axisId = requestedAxisId ?? firstBinding?.axisId ?? createAxisForChart(ids[0]!, channel).id;
  const axis = axisOrThrow(axisId);
  if (axis.channel !== channel) throw new Error(`Axis ${axisId} does not represent ${channel}.`);
  ids.forEach((chartId) => bindAxis(axisId, chartId, channel, "primary", "shared"));
  return axisId;
}

function syncMarkGroups(chartId: string, groups: MarkGroupSpec[]) {
  const chart = chartOrThrow(chartId);
  const nextIds = groups.map((group) => {
    const existing = relationshipState.value.markGroups[group.id];
    const id = group.chartId === chartId && (!existing || existing.chartId === chartId)
      ? group.id
      : `mark-group:${chartId}:${group.role}`;
    relationshipState.value.markGroups[id] = {
      id,
      chartId,
      role: group.role,
      memberKeys: [...group.memberKeys],
      sharedConfig: { ...group.sharedConfig },
      allowOverrides: group.allowOverrides ?? false,
    };
    return id;
  });
  chart.markGroupIds.forEach((id) => {
    if (!nextIds.includes(id)) delete relationshipState.value.markGroups[id];
  });
  chart.markGroupIds = nextIds;
  return nextIds;
}

function createComposition(composition: Omit<RelationshipComposition, "sharedAxisIds"> & { sharedAxisIds?: string[] }) {
  const memberChartIds = unique(composition.memberChartIds);
  if (memberChartIds.length === 0) throw new Error("Composition requires member charts.");
  memberChartIds.forEach(chartOrThrow);
  const sharedChannels = unique(composition.sharedChannels);
  if (composition.type === "layer") {
    if (sharedChannels.length !== 2 || !sharedChannels.includes("x") || !sharedChannels.includes("y")) {
      throw new Error("Layer must share both x and y axes.");
    }
    memberChartIds.forEach((chartId) => {
      const chart = chartOrThrow(chartId);
      if (getChartTemplateContract(chart.chartType)?.coordinateSystem !== "Cartesian") {
        throw new Error("Layer members must use Cartesian x/y axes.");
      }
    });
  }
  if (relationshipState.value.compositions[composition.id]) removeComposition(composition.id, true);
  const sharedAxisIds = sharedChannels.map((channel, index) =>
    shareAxis(memberChartIds, channel, composition.sharedAxisIds?.[index]),
  );
  const record: RelationshipComposition = {
    ...composition,
    memberChartIds,
    sharedChannels,
    sharedAxisIds,
    facetCells: composition.facetCells?.map((cell) => ({ ...cell })),
  };
  relationshipState.value.compositions[record.id] = record;
  memberChartIds.forEach((chartId) => {
    const chart = chartOrThrow(chartId);
    chart.compositionIds = unique([...chart.compositionIds, record.id]);
  });
  if (record.type === "facet") {
    record.facetCells?.forEach((cell) => {
      const chart = chartOrThrow(cell.chartId);
      chart.instanceKind = "facet-cell";
      chart.sourceChartId = record.sourceChartId;
      chart.facetKey = cell.facetKey;
    });
    if (record.sourceChartId && !memberChartIds.includes(record.sourceChartId)) {
      const source = relationshipState.value.charts[record.sourceChartId];
      if (source) {
        source.nodeId = null;
        source.instanceKind = "virtual";
        source.compositionIds = unique([...source.compositionIds, record.id]);
      }
    }
  }
  return record;
}

function removeComposition(compositionId: string, keepSharedAxes = true) {
  const composition = relationshipState.value.compositions[compositionId];
  if (!composition) return false;
  composition.memberChartIds.forEach((chartId) => {
    const chart = relationshipState.value.charts[chartId];
    if (chart) chart.compositionIds = chart.compositionIds.filter((id) => id !== compositionId);
  });
  if (composition.sourceChartId) {
    const source = relationshipState.value.charts[composition.sourceChartId];
    if (source) source.compositionIds = source.compositionIds.filter((id) => id !== compositionId);
  }
  if (!keepSharedAxes) {
    composition.sharedChannels.forEach((channel) => {
      composition.memberChartIds.forEach((chartId) => {
        const sourceBinding = bindingForChartChannel(chartId, channel);
        const sourceAxis = sourceBinding ? relationshipState.value.axes[sourceBinding.axisId] : null;
        if (!sourceAxis) return;
        const axis: AxisComponent = {
          ...sourceAxis,
          id: nextId("axis"),
          config: { ...sourceAxis.config, origin: { ...sourceAxis.config.origin } },
          createdWithChartId: chartId,
        };
        relationshipState.value.axes[axis.id] = axis;
        bindAxis(axis.id, chartId, channel);
      });
    });
  }
  delete relationshipState.value.compositions[compositionId];
  if (selectedEntity.value?.type === "composition" && selectedEntity.value.id === compositionId) selectedEntity.value = null;
  return true;
}

function unregisterChart(chartId: string, keepAxes = true) {
  const chart = relationshipState.value.charts[chartId];
  if (!chart) return false;
  chart.axisBindingIds
    .map((id) => relationshipState.value.axisBindings[id])
    .filter((binding): binding is AxisBinding => !!binding)
    .forEach((binding) => {
      const axisId = binding.axisId;
      removeBinding(binding);
      if (!keepAxes && bindingsForAxis(axisId).length === 0) delete relationshipState.value.axes[axisId];
    });
  chart.markGroupIds.forEach((id) => { delete relationshipState.value.markGroups[id]; });
  chart.compositionIds.forEach((id) => {
    const composition = relationshipState.value.compositions[id];
    if (!composition) return;
    composition.memberChartIds = composition.memberChartIds.filter((id) => id !== chartId);
    composition.facetCells = composition.facetCells?.filter((cell) => cell.chartId !== chartId);
    if (composition.memberChartIds.length === 0) delete relationshipState.value.compositions[id];
  });
  Object.values(relationshipState.value.nestedRelationships).forEach((relationship) => {
    if (relationship.parentChartId === chartId || relationship.childChartId === chartId) {
      delete relationshipState.value.nestedRelationships[relationship.id];
    }
  });
  if (selectedEntity.value?.type === "chart" && selectedEntity.value.id === chartId) selectedEntity.value = null;
  if (selectedEntity.value?.type === "mark-group" && chart.markGroupIds.includes(selectedEntity.value.id)) selectedEntity.value = null;
  delete relationshipState.value.charts[chartId];
  return true;
}

function dispatch(command: ChartRelationshipCommand): unknown {
  switch (command.type) {
    case "register-chart": {
      const current = relationshipState.value.charts[command.chart.id];
      relationshipState.value.charts[command.chart.id] = {
        ...current,
        ...command.chart,
        markGroupIds: command.chart.markGroupIds ? [...command.chart.markGroupIds] : current?.markGroupIds ?? [],
        axisBindingIds: command.chart.axisBindingIds ? [...command.chart.axisBindingIds] : current?.axisBindingIds ?? [],
        compositionIds: command.chart.compositionIds ? [...command.chart.compositionIds] : current?.compositionIds ?? [],
      };
      const channels = command.channels ?? getChartTemplateContract(command.chart.chartType)?.shareableChannels ?? [];
      channels.forEach((channel) => {
        if (!bindingForChartChannel(command.chart.id, channel)) createAxisForChart(command.chart.id, channel, command.coordinateGuide);
      });
      return relationshipState.value.charts[command.chart.id];
    }
    case "unregister-chart":
      return unregisterChart(command.chartId, command.keepAxes ?? true);
    case "sync-mark-groups":
      return syncMarkGroups(command.chartId, command.groups);
    case "update-mark-group": {
      const group = relationshipState.value.markGroups[command.groupId];
      if (!group) throw new Error(`Unknown Mark Group: ${command.groupId}`);
      if (command.sharedConfig) group.sharedConfig = { ...group.sharedConfig, ...command.sharedConfig };
      if (command.memberKeys) group.memberKeys = [...command.memberKeys];
      if (command.allowOverrides !== undefined) group.allowOverrides = command.allowOverrides;
      return group;
    }
    case "create-axis":
      relationshipState.value.axes[command.axis.id] = { ...command.axis, config: { ...command.axis.config, origin: { ...command.axis.config.origin } } };
      return relationshipState.value.axes[command.axis.id];
    case "update-axis": {
      const axis = axisOrThrow(command.axisId);
      Object.assign(axis, command.changes, {
        config: command.changes.config ? { ...axis.config, ...command.changes.config, origin: command.changes.config.origin ? { ...command.changes.config.origin } : axis.config.origin } : axis.config,
      });
      return axis;
    }
    case "delete-axis": {
      const axis = axisOrThrow(command.axisId);
      const bindings = bindingsForAxis(axis.id);
      if (command.replacement === "individual") {
        bindings.forEach((binding) => {
          const replacement: AxisComponent = {
            ...axis,
            id: nextId("axis"),
            config: { ...axis.config, origin: { ...axis.config.origin } },
            createdWithChartId: binding.chartId,
          };
          relationshipState.value.axes[replacement.id] = replacement;
          bindAxis(replacement.id, binding.chartId, binding.channel, binding.role);
        });
      } else {
        bindings.forEach(removeBinding);
      }
      delete relationshipState.value.axes[axis.id];
      if (selectedEntity.value?.type === "axis" && selectedEntity.value.id === axis.id) selectedEntity.value = null;
      return true;
    }
    case "bind-axis":
      return bindAxis(command.axisId, command.chartId, command.channel, command.role, command.scalePolicy);
    case "unbind-axis": {
      const binding = bindingForChartChannel(command.chartId, command.channel, command.role);
      if (!binding) return false;
      removeBinding(binding);
      return true;
    }
    case "share-axis":
      return shareAxis(command.chartIds, command.channel, command.axisId);
    case "create-composition":
      return createComposition(command.composition);
    case "update-composition": {
      const composition = relationshipState.value.compositions[command.compositionId];
      if (!composition) throw new Error(`Unknown Composition: ${command.compositionId}`);
      if (command.changes.memberChartIds) {
        const nextMembers = unique(command.changes.memberChartIds);
        if (nextMembers.length === 0) throw new Error("Composition requires member charts.");
        nextMembers.forEach(chartOrThrow);
        composition.memberChartIds.forEach((chartId) => {
          if (nextMembers.includes(chartId)) return;
          const chart = relationshipState.value.charts[chartId];
          if (chart) chart.compositionIds = chart.compositionIds.filter((id) => id !== composition.id);
        });
        nextMembers.forEach((chartId) => {
          const chart = chartOrThrow(chartId);
          chart.compositionIds = unique([...chart.compositionIds, composition.id]);
        });
        composition.memberChartIds = nextMembers;
        composition.sharedAxisIds = composition.sharedChannels.map((channel, index) =>
          shareAxis(nextMembers, channel, composition.sharedAxisIds[index]),
        );
      }
      if (command.changes.direction !== undefined) composition.direction = command.changes.direction;
      if (command.changes.facetField !== undefined) composition.facetField = command.changes.facetField;
      if (command.changes.facetRowField !== undefined) composition.facetRowField = command.changes.facetRowField;
      if (command.changes.facetColumnField !== undefined) composition.facetColumnField = command.changes.facetColumnField;
      if (command.changes.facetCells !== undefined) composition.facetCells = command.changes.facetCells.map((cell) => ({ ...cell }));
      return composition;
    }
    case "remove-composition":
      return removeComposition(command.compositionId, command.keepSharedAxes ?? true);
    case "begin-nested": {
      chartOrThrow(command.relationship.parentChartId);
      chartOrThrow(command.relationship.childChartId);
      const relationship: NestedRelationship = { ...command.relationship, parameters: clonePlainValue(command.relationship.parameters), status: "draft" };
      relationshipState.value.nestedRelationships[relationship.id] = relationship;
      return relationship;
    }
    case "update-nested": {
      const relationship = relationshipState.value.nestedRelationships[command.relationshipId];
      if (!relationship) throw new Error(`Unknown Nested relationship: ${command.relationshipId}`);
      if (command.changes.relationType !== undefined) relationship.relationType = command.changes.relationType;
      if (command.changes.parameters !== undefined) relationship.parameters = clonePlainValue(command.changes.parameters);
      if (command.changes.resolverVersion !== undefined) relationship.resolverVersion = command.changes.resolverVersion;
      return relationship;
    }
    case "commit-nested": {
      const relationship = relationshipState.value.nestedRelationships[command.relationshipId];
      if (!relationship) throw new Error(`Unknown Nested relationship: ${command.relationshipId}`);
      relationship.status = "active";
      createComposition({
        id: `composition:${relationship.id}`,
        type: "nested",
        memberChartIds: [relationship.parentChartId, relationship.childChartId],
        sharedChannels: [],
        sourceChartId: relationship.parentChartId,
      });
      return relationship;
    }
    case "cancel-nested": {
      const relationship = relationshipState.value.nestedRelationships[command.relationshipId];
      if (!relationship) return false;
      delete relationshipState.value.nestedRelationships[command.relationshipId];
      if (selectedEntity.value?.type === "nested" && selectedEntity.value.id === command.relationshipId) selectedEntity.value = null;
      const child = relationshipState.value.charts[relationship.childChartId];
      if (child?.instanceKind === "nested-child" && child.nodeId === null) unregisterChart(child.id, false);
      return true;
    }
    case "select-entity":
      selectedEntity.value = command.selection ? { ...command.selection } : null;
      return selectedEntity.value;
    case "replace-state":
      relationshipState.value = cloneChartRelationshipState(command.state);
      selectedEntity.value = null;
      return relationshipState.value;
    case "clear":
      relationshipState.value = emptyState();
      selectedEntity.value = null;
      return relationshipState.value;
  }
}

function registerNestedResolver(relationType: string, version: number, resolver: NestedResolver) {
  nestedResolvers.set(`${relationType}@${version}`, resolver);
}

function resolveNestedRelationship(
  relationshipId: string,
  parent: NestedElementFrame,
  child: NestedElementFrame,
) {
  const relationship = relationshipState.value.nestedRelationships[relationshipId];
  if (!relationship) throw new Error(`Unknown Nested relationship: ${relationshipId}`);
  const resolver = nestedResolvers.get(`${relationship.relationType}@${relationship.resolverVersion}`);
  if (!resolver) throw new Error(`No resolver for ${relationship.relationType}@${relationship.resolverVersion}.`);
  return resolver(relationship, parent, child);
}

function defaultRelativeParameters(): RelativeNestedParameters {
  return {
    parentAnchor: { x: 0.5, y: 0.5 },
    childAnchor: { x: 0.5, y: 0.5 },
    offset: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
  };
}

function walkNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.flatMap((node) => [node, ...(node.kind === "group" ? walkNodes(node.children) : [])]);
}

function reconcileCanvasNodes(nodes: CanvasNode[]) {
  const all = walkNodes(nodes);
  const chartNodes = all.filter((node) => !!node.chartSpec);
  chartNodes.forEach((node) => {
    const spec = node.chartSpec!;
    dispatch({
      type: "register-chart",
      chart: {
        id: node.id,
        nodeId: node.id,
        chartType: spec.chartType,
        datasetId: spec.datasetId,
        instanceKind: relationshipState.value.charts[node.id]?.instanceKind ?? "canvas",
        sourceChartId: relationshipState.value.charts[node.id]?.sourceChartId,
        sourceTemplateId: node.kind === "leaf" ? node.candidateId : relationshipState.value.charts[node.id]?.sourceTemplateId,
        facetKey: relationshipState.value.charts[node.id]?.facetKey,
      },
      coordinateGuide: node.coordinateGuide,
    });
    if (spec.markGroups) syncMarkGroups(node.id, spec.markGroups);
  });

  chartNodes.forEach((node) => {
    const nested = node.nestedSpec;
    if (!nested || !node.chartSpec) return;
    const existing = Object.values(relationshipState.value.nestedRelationships).find((relationship) =>
      relationship.parentChartId === node.id && relationship.parentDataKey === nested.parentRowKey,
    );
    if (existing) return;
    const relationshipId = `nested:legacy:${nested.groupId ?? node.id}`;
    const childChartId = `nested-child:legacy:${nested.groupId ?? node.id}`;
    dispatch({
      type: "register-chart",
      chart: {
        id: childChartId,
        nodeId: null,
        chartType: nested.innerChartType,
        datasetId: node.chartSpec.datasetId,
        instanceKind: "nested-child",
        sourceTemplateId: "builtin-template:pie",
      },
    });
    dispatch({
      type: "begin-nested",
      relationship: {
        id: relationshipId,
        parentChartId: node.id,
        parentElementId: `mark:${node.id}:point:${nested.parentRowKey}`,
        parentMarkGroupId: nested.parentMarkGroupId,
        parentDataKey: nested.parentRowKey,
        childChartId,
        relationType: "relative-position",
        parameters: defaultRelativeParameters(),
        resolverVersion: 1,
      },
    });
    dispatch({ type: "commit-nested", relationshipId });
  });

  const systems = new Map<string, { members: string[]; channels: CoordinateChannel[] }>();
  chartNodes.forEach((node) => {
    const system = node.coordinateSystem;
    if (!system || system.sharedChannels.length === 0) return;
    const current = systems.get(system.id) ?? { members: [], channels: [...system.sharedChannels] };
    current.members.push(...system.members.map((member) => member.nodeId));
    systems.set(system.id, current);
  });
  systems.forEach((system, systemId) => {
    system.channels.forEach((channel) => {
      const members = unique(system.members).filter((id) => !!relationshipState.value.charts[id]);
      if (members.length === 0) return;
      const axisId = `axis:${systemId}:${channel}`;
      if (!relationshipState.value.axes[axisId]) {
        const sourceNode = chartNodes.find((node) => node.id === members[0]);
        relationshipState.value.axes[axisId] = {
          id: axisId,
          coordinateType: sourceNode?.coordinateGuide?.type ?? "None",
          channel,
          config: axisConfigFromGuide(channel, sourceNode?.coordinateGuide),
          createdWithChartId: members[0],
        };
      }
      shareAxis(members, channel, axisId);
    });
  });

  const seenCompositions = new Set<string>();
  chartNodes.forEach((node) => {
    const spec = node.compositionSpec;
    if (!spec || seenCompositions.has(spec.id)) return;
    seenCompositions.add(spec.id);
    const memberChartIds = spec.members.map((member) => member.nodeId).filter((id) => !!relationshipState.value.charts[id]);
    if (memberChartIds.length === 0) return;
    if (spec.type === "layer" && (!spec.sharedChannels.includes("x") || !spec.sharedChannels.includes("y"))) return;
    createComposition({
      id: spec.id,
      type: spec.type,
      memberChartIds,
      sharedChannels: [...spec.sharedChannels],
      direction: spec.direction,
      sourceChartId: spec.type === "facet" ? spec.members[0]?.sourceNodeId : undefined,
      facetField: spec.facetField,
      facetRowField: spec.facetGrid?.rowField,
      facetColumnField: spec.facetGrid?.columnField,
      facetCells: spec.type === "facet"
        ? memberChartIds.map((chartId, index) => {
          const columnCount = spec.facetGrid?.columnValues.length ?? 0;
          const rowIndex = columnCount > 0 ? Math.floor(index / columnCount) : -1;
          const columnIndex = columnCount > 0 ? index % columnCount : -1;
          return {
            chartId,
            facetKey: spec.facetValues?.[index] ?? String(index),
            rowValue: rowIndex >= 0 ? spec.facetGrid?.rowValues[rowIndex] : undefined,
            columnValue: columnIndex >= 0 ? spec.facetGrid?.columnValues[columnIndex] : undefined,
          };
        })
        : undefined,
    });
  });
  return relationshipState.value;
}

function collectRelationshipIssues() {
  const issues: string[] = [];
  Object.values(relationshipState.value.charts).forEach((chart) => {
    chart.markGroupIds.forEach((id) => {
      if (!relationshipState.value.markGroups[id]) issues.push(`Chart ${chart.id} references missing Mark Group ${id}.`);
    });
    chart.axisBindingIds.forEach((id) => {
      if (!relationshipState.value.axisBindings[id]) issues.push(`Chart ${chart.id} references missing AxisBinding ${id}.`);
    });
    chart.compositionIds.forEach((id) => {
      if (!relationshipState.value.compositions[id]) issues.push(`Chart ${chart.id} references missing Composition ${id}.`);
    });
  });
  Object.values(relationshipState.value.markGroups).forEach((group) => {
    if (!relationshipState.value.charts[group.chartId]) issues.push(`Mark Group ${group.id} references missing Chart ${group.chartId}.`);
  });
  Object.values(relationshipState.value.axisBindings).forEach((binding) => {
    const axis = relationshipState.value.axes[binding.axisId];
    if (!relationshipState.value.charts[binding.chartId]) issues.push(`AxisBinding ${binding.id} references missing Chart ${binding.chartId}.`);
    if (!axis) issues.push(`AxisBinding ${binding.id} references missing Axis ${binding.axisId}.`);
    else if (axis.channel !== binding.channel) issues.push(`AxisBinding ${binding.id} channel does not match Axis ${binding.axisId}.`);
  });
  Object.values(relationshipState.value.compositions).forEach((composition) => {
    composition.memberChartIds.forEach((chartId) => {
      if (!relationshipState.value.charts[chartId]) issues.push(`Composition ${composition.id} references missing Chart ${chartId}.`);
    });
    composition.sharedAxisIds.forEach((axisId) => {
      if (!relationshipState.value.axes[axisId]) issues.push(`Composition ${composition.id} references missing Axis ${axisId}.`);
    });
    if (composition.type === "layer") {
      const channels = new Set(composition.sharedChannels);
      if (channels.size !== 2 || !channels.has("x") || !channels.has("y")) issues.push(`Layer ${composition.id} must share exactly x and y.`);
    }
    composition.sharedChannels.forEach((channel, index) => {
      const axisId = composition.sharedAxisIds[index];
      if (!axisId) return;
      composition.memberChartIds.forEach((chartId) => {
        if (bindingForChartChannel(chartId, channel)?.axisId !== axisId) {
          issues.push(`Composition ${composition.id} member ${chartId} is not bound to shared ${channel} Axis ${axisId}.`);
        }
      });
    });
  });
  Object.values(relationshipState.value.nestedRelationships).forEach((relationship) => {
    if (!relationshipState.value.charts[relationship.parentChartId]) issues.push(`Nested ${relationship.id} references missing parent Chart ${relationship.parentChartId}.`);
    if (!relationshipState.value.charts[relationship.childChartId]) issues.push(`Nested ${relationship.id} references missing child Chart ${relationship.childChartId}.`);
    if (!nestedResolvers.has(`${relationship.relationType}@${relationship.resolverVersion}`)) {
      issues.push(`Nested ${relationship.id} has no resolver for ${relationship.relationType}@${relationship.resolverVersion}.`);
    }
  });
  return issues;
}

const charts = computed(() => Object.values(relationshipState.value.charts));
const axes = computed(() => Object.values(relationshipState.value.axes));
const compositions = computed(() => Object.values(relationshipState.value.compositions));
const nestedRelationships = computed(() => Object.values(relationshipState.value.nestedRelationships));
const relationshipIssues = computed(collectRelationshipIssues);

export function useChartRelationshipStore() {
  return {
    state: relationshipState,
    selectedEntity,
    charts,
    axes,
    compositions,
    nestedRelationships,
    relationshipIssues,
    dispatch,
    snapshot: snapshotRelationshipState,
    restore: (snapshot: ChartRelationshipState) => dispatch({ type: "replace-state", state: snapshot }),
    bindingForChartChannel,
    bindingsForAxis,
    axesForChart: (chartId: string) => {
      const chart = relationshipState.value.charts[chartId];
      return chart?.axisBindingIds.flatMap((id) => {
        const binding = relationshipState.value.axisBindings[id];
        const axis = binding ? relationshipState.value.axes[binding.axisId] : null;
        return binding && axis ? [{ binding, axis }] : [];
      }) ?? [];
    },
    chartsForAxis: (axisId: string) => bindingsForAxis(axisId).flatMap((binding) => {
      const chart = relationshipState.value.charts[binding.chartId];
      return chart ? [{ binding, chart }] : [];
    }),
    compositionsForChart: (chartId: string) => {
      const chart = relationshipState.value.charts[chartId];
      return chart?.compositionIds.flatMap((id) => relationshipState.value.compositions[id] ?? []) ?? [];
    },
    markGroupsForChart: (chartId: string) => {
      const chart = relationshipState.value.charts[chartId];
      return chart?.markGroupIds.flatMap((id) => relationshipState.value.markGroups[id] ?? []) ?? [];
    },
    nestedForParentElement: (parentChartId: string, parentElementId: string) =>
      nestedRelationships.value.filter((relationship) =>
        relationship.parentChartId === parentChartId && relationship.parentElementId === parentElementId,
      ),
    registerNestedResolver,
    resolveNestedRelationship,
    defaultRelativeParameters,
    reconcileCanvasNodes,
  };
}
