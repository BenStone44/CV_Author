import type { CubeResult } from "./cubeModel";
import type { ChartEncodingChannel, ChartSpec } from "./types";
import {
  evaluateSingleChartAssignment,
  getSingleChartTemplateRequirement,
  recommendSingleChartAlternatives,
  type ChannelFieldAssignment,
  type CompatibilityIssue,
  type CompatibilityStatus,
  type CubeFieldSelection,
  type SingleChartCompatibilityResult,
} from "./chartCompatibility";
import { resolvedEncodingField, resolvedSeriesField } from "./encodingConfig";

export type ResolutionStrategy = "bind-channel" | "aggregate" | "facet" | "change-template";

export type CompatibilityResolutionState = {
  chartType: string;
  assignment: ChannelFieldAssignment;
  selectedFieldIds?: string[];
  dimensionMembers: Record<string, string[]>;
  aggregations: Record<string, "sum" | "avg">;
  facets: string[];
  derivedValueSeries?: {
    valueChannel: "y";
    seriesChannel: "color";
    measureIds: string[];
  };
};

const DERIVED_MEASURE_DIMENSION = "__cube_measure__";
const DERIVED_MEASURE_VALUE = "__cube_value__";

export type CompatibilityResolutionAction = {
  id: string;
  strategy: ResolutionStrategy;
  label: string;
  description: string;
  fieldId?: string;
  channel?: ChartEncodingChannel;
  aggregation?: "sum" | "avg";
  targetChartType?: string;
  viable: boolean;
  immediateStatus: CompatibilityStatus;
  terminalStatus: CompatibilityStatus | null;
  remainingSteps: number | null;
  issues: CompatibilityIssue[];
};

export type CompatibilityResolutionNode = {
  state: CompatibilityResolutionState;
  compatibility: SingleChartCompatibilityResult;
  terminal: boolean;
  viable: boolean;
  actions: CompatibilityResolutionAction[];
  rejectedActions: CompatibilityResolutionAction[];
};

export type CompatibilityResolutionSession = {
  root: CompatibilityResolutionState;
  history: CompatibilityResolutionState[];
  actionHistory: CompatibilityResolutionAction[];
  current: CompatibilityResolutionNode;
};

export type CompatibilityResolutionOptions = {
  maxDepth?: number;
  maxStates?: number;
  alternativeLimit?: number;
};

type SearchContext = Required<CompatibilityResolutionOptions> & {
  exploredStates: number;
};

const defaultOptions: Required<CompatibilityResolutionOptions> = {
  maxDepth: 5,
  maxStates: 400,
  alternativeLimit: 6,
};

function cloneAssignment(assignment: ChannelFieldAssignment): ChannelFieldAssignment {
  return Object.fromEntries(
    Object.entries(assignment).map(([channel, fields]) => [channel, [...(fields ?? [])]]),
  );
}

export function cloneCompatibilityResolutionState(
  state: CompatibilityResolutionState,
): CompatibilityResolutionState {
  return {
    chartType: state.chartType,
    assignment: cloneAssignment(state.assignment),
    selectedFieldIds: state.selectedFieldIds ? [...state.selectedFieldIds] : undefined,
    dimensionMembers: Object.fromEntries(
      Object.entries(state.dimensionMembers).map(([field, members]) => [field, [...members]]),
    ),
    aggregations: { ...state.aggregations },
    facets: [...state.facets],
    derivedValueSeries: state.derivedValueSeries
      ? { ...state.derivedValueSeries, measureIds: [...state.derivedValueSeries.measureIds] }
      : undefined,
  };
}

function assignedFieldIds(state: CompatibilityResolutionState) {
  return Array.from(new Set(Object.values(state.assignment).flatMap((fields) => fields ?? [])));
}

function selectedFieldIds(state: CompatibilityResolutionState) {
  return Array.from(new Set(state.selectedFieldIds ?? assignedFieldIds(state)));
}

function selectionFromState(state: CompatibilityResolutionState, cube: CubeResult): CubeFieldSelection {
  const dimensions = new Set(cube.schema.dimensions.map((field) => field.id));
  const measures = new Set(cube.schema.measures.map((field) => field.id));
  const fields = selectedFieldIds(state);
  return {
    dimensionIds: fields.filter((field) => dimensions.has(field)),
    measureIds: fields.filter((field) => measures.has(field)),
    dimensionMembers: Object.fromEntries(
      Object.entries(state.dimensionMembers).filter(([field, members]) => dimensions.has(field) && members.length > 0),
    ),
  };
}

function stateKey(state: CompatibilityResolutionState) {
  const assignment = Object.entries(state.assignment)
    .filter(([, fields]) => fields?.length)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([channel, fields]) => `${channel}:${[...(fields ?? [])].sort().join(",")}`)
    .join("|");
  const aggregations = Object.entries(state.aggregations)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, operation]) => `${field}:${operation}`)
    .join("|");
  const derived = state.derivedValueSeries
    ? `${state.derivedValueSeries.valueChannel}:${state.derivedValueSeries.measureIds.join(",")}`
    : "";
  return `${state.chartType}::${assignment}::selected=${selectedFieldIds(state).sort().join(",")}::agg=${aggregations}::facet=${[...state.facets].sort().join(",")}::derived=${derived}`;
}

function materializeDerivedValueSeriesCube(cube: CubeResult, state: CompatibilityResolutionState): CubeResult {
  const derived = state.derivedValueSeries;
  if (!derived) return cube;
  const available = new Set(cube.schema.measures.map((measure) => measure.id));
  const measureIds = Array.from(new Set(derived.measureIds)).filter((measureId) => available.has(measureId));
  return {
    schema: {
      ...cube.schema,
      dimensions: [
        ...cube.schema.dimensions,
        {
          id: DERIVED_MEASURE_DIMENSION,
          label: "Selected measures",
          type: "nominal",
          members: measureIds.map((measureId, order) => ({ id: measureId, label: measureId, order })),
        },
      ],
      measures: [{
        id: DERIVED_MEASURE_VALUE,
        label: "Selected measure value",
        grainDimensionIds: [...cube.schema.dimensions.map((dimension) => dimension.id), DERIVED_MEASURE_DIMENSION],
        aggregation: { default: "avg", additivity: "additive" },
      }],
    },
    cells: cube.cells.flatMap((cell) => measureIds.flatMap((measureId) => {
      const value = cell.values[measureId];
      if (typeof value !== "number" || !Number.isFinite(value)) return [];
      return [{
        coordinates: { ...cell.coordinates, [DERIVED_MEASURE_DIMENSION]: measureId },
        values: { [DERIVED_MEASURE_VALUE]: value },
      }];
    })),
  };
}

function aggregateCubeOverDimension(
  cube: CubeResult,
  dimensionId: string,
  operation: "sum" | "avg",
): CubeResult {
  const remainingDimensions = cube.schema.dimensions.filter((dimension) => dimension.id !== dimensionId);
  const groups = new Map<string, typeof cube.cells>();
  cube.cells.forEach((cell) => {
    const key = remainingDimensions.map((dimension) => cell.coordinates[dimension.id] ?? "").join("\u001f");
    groups.set(key, [...(groups.get(key) ?? []), cell]);
  });
  return {
    schema: { ...cube.schema, dimensions: remainingDimensions },
    cells: Array.from(groups.values()).map((cells) => ({
      coordinates: Object.fromEntries(remainingDimensions.map((dimension) => [dimension.id, cells[0]?.coordinates[dimension.id] ?? ""])),
      values: Object.fromEntries(cube.schema.measures.map((measure) => {
        const values = cells.map((cell) => cell.values[measure.id]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        if (!values.length) return [measure.id, null];
        const sum = values.reduce((total, value) => total + value, 0);
        return [measure.id, operation === "avg" ? sum / values.length : sum];
      })),
    })),
  };
}

function projectCube(
  cube: CubeResult,
  state: CompatibilityResolutionState,
  facetMembers: Record<string, string>,
): CubeResult {
  const filteredCells = cube.cells.filter((cell) =>
    Object.entries(facetMembers).every(([field, member]) => cell.coordinates[field] === member)
    && Object.entries(state.dimensionMembers).every(([field, members]) =>
      !members.length || members.includes(cell.coordinates[field] ?? "")),
  );
  let projected: CubeResult = {
    schema: {
      ...cube.schema,
      dimensions: cube.schema.dimensions.filter((dimension) => !state.facets.includes(dimension.id)),
    },
    cells: filteredCells,
  };
  Object.entries(state.aggregations).forEach(([dimensionId, operation]) => {
    projected = aggregateCubeOverDimension(projected, dimensionId, operation);
  });
  return projected;
}

function facetPartitions(cube: CubeResult, facets: string[]) {
  if (!facets.length) return [{}];
  const keys = new Map<string, Record<string, string>>();
  cube.cells.forEach((cell) => {
    const values = Object.fromEntries(facets.map((field) => [field, cell.coordinates[field] ?? ""]));
    if (Object.values(values).some((value) => !value)) return;
    keys.set(facets.map((field) => values[field]).join("\u001f"), values);
  });
  return Array.from(keys.values());
}

function combinePartitionResults(results: SingleChartCompatibilityResult[]): SingleChartCompatibilityResult {
  const representative = results[0]!;
  const incompatible = results.find((result) => result.status === "incompatible");
  if (incompatible) return incompatible;
  const incomplete = results.find((result) => result.status === "incomplete");
  return incomplete ?? representative;
}

export function evaluateCompatibilityResolutionState(
  state: CompatibilityResolutionState,
  cube: CubeResult,
): SingleChartCompatibilityResult {
  const normalizedCube = materializeDerivedValueSeriesCube(cube, state);
  const partitions = facetPartitions(normalizedCube, state.facets);
  if (!partitions.length) {
    const requirement = getSingleChartTemplateRequirement(state.chartType);
    if (!requirement) throw new Error(`Unknown chart template: ${state.chartType}.`);
    return {
      chartType: state.chartType,
      label: requirement.label,
      status: "incompatible",
      assignment: {},
      missingChannels: [],
      issues: [{ code: "unknown-member", message: "The selected facet has no data members." }],
    };
  }
  return combinePartitionResults(partitions.map((members) => {
    const projected = projectCube(normalizedCube, state, members);
    return evaluateSingleChartAssignment(
      state.chartType,
      state.assignment,
      projected,
      state.dimensionMembers,
      selectedFieldIds(state),
    );
  }));
}

function makeCandidateActions(
  state: CompatibilityResolutionState,
  compatibility: SingleChartCompatibilityResult,
  cube: CubeResult,
  alternativeLimit: number,
) {
  const actionCube = materializeDerivedValueSeriesCube(cube, state);
  const assigned = new Set(assignedFieldIds(state));
  const selected = new Set(selectedFieldIds(state));
  const actions: Array<Omit<CompatibilityResolutionAction, "viable" | "immediateStatus" | "terminalStatus" | "remainingSteps" | "issues">> = [];
  compatibility.missingChannels.forEach((missing) => {
    missing.candidateFieldIds.filter((field) => !assigned.has(field)).forEach((fieldId) => {
      actions.push({
        id: `bind:${missing.channel}:${fieldId}`,
        strategy: "bind-channel",
        channel: missing.channel,
        fieldId,
        label: `Bind ${fieldId} to ${missing.label}`,
        description: `Complete the required ${missing.label} channel with ${fieldId}.`,
      });
    });
  });

  const canResolveGrain = compatibility.status === "incompatible"
    && compatibility.issues.some((issue) => issue.code === "duplicate-x" || issue.code === "duplicate-x-series");
  if (canResolveGrain) {
    actionCube.schema.dimensions
      .filter((dimension) => selected.has(dimension.id)
        && !assigned.has(dimension.id)
        && !state.aggregations[dimension.id]
        && !state.facets.includes(dimension.id)
        && dimension.members.length > 1)
      .forEach((dimension) => {
        (["sum", "avg"] as const).forEach((aggregation) => actions.push({
          id: `aggregate:${dimension.id}:${aggregation}`,
          strategy: "aggregate",
          fieldId: dimension.id,
          aggregation,
          label: `${aggregation === "sum" ? "Sum" : "Average"} over ${dimension.label}`,
          description: `Reduce ${dimension.label} before checking the chart grain again.`,
        }));
        actions.push({
          id: `facet:${dimension.id}`,
          strategy: "facet",
          fieldId: dimension.id,
          label: `Facet by ${dimension.label}`,
          description: `Evaluate one chart per ${dimension.label} member.`,
        });
      });
  }

  const selection = selectionFromState(state, actionCube);
  recommendSingleChartAlternatives(state.chartType, selection, actionCube, alternativeLimit).forEach((alternative) => {
    actions.push({
      id: `template:${alternative.chartType}`,
      strategy: "change-template",
      targetChartType: alternative.chartType,
      label: `Change to ${alternative.label}`,
      description: alternative.changedDimensions.length
        ? `Changes ${alternative.changedDimensions.join(", ")}.`
        : "Keeps the current design dimensions.",
    });
  });
  return Array.from(new Map(actions.map((action) => [action.id, action])).values());
}

export function applyCompatibilityResolutionAction(
  state: CompatibilityResolutionState,
  action: Pick<CompatibilityResolutionAction, "strategy" | "fieldId" | "channel" | "aggregation" | "targetChartType">,
  cube: CubeResult,
): CompatibilityResolutionState {
  const next = cloneCompatibilityResolutionState(state);
  if (action.strategy === "bind-channel" && action.channel && action.fieldId) {
    next.assignment[action.channel] = [action.fieldId];
    return next;
  }
  if (action.strategy === "aggregate" && action.fieldId && action.aggregation) {
    next.aggregations[action.fieldId] = action.aggregation;
    return next;
  }
  if (action.strategy === "facet" && action.fieldId) {
    next.facets = Array.from(new Set([...next.facets, action.fieldId]));
    return next;
  }
  if (action.strategy === "change-template" && action.targetChartType) {
    const targetRequirement = getSingleChartTemplateRequirement(action.targetChartType);
    if (!targetRequirement) throw new Error(`Unknown chart template: ${action.targetChartType}.`);
    const targetChannels = new Set(targetRequirement.channels.map((channel) => channel.channel));
    const preservedAssignment = Object.fromEntries(
      Object.entries(next.assignment).filter(([channel]) => targetChannels.has(channel as ChartEncodingChannel)),
    );
    next.chartType = action.targetChartType;
    next.assignment = preservedAssignment;
    return next;
  }
  throw new Error("Incomplete compatibility resolution action.");
}

function searchNode(
  state: CompatibilityResolutionState,
  cube: CubeResult,
  context: SearchContext,
  depth: number,
  ancestors: Set<string>,
): CompatibilityResolutionNode {
  context.exploredStates += 1;
  const compatibility = evaluateCompatibilityResolutionState(state, cube);
  if (compatibility.status === "compatible") {
    return { state, compatibility, terminal: true, viable: true, actions: [], rejectedActions: [] };
  }
  if (depth >= context.maxDepth || context.exploredStates >= context.maxStates) {
    return { state, compatibility, terminal: false, viable: false, actions: [], rejectedActions: [] };
  }
  const nextAncestors = new Set(ancestors).add(stateKey(state));
  const candidates = makeCandidateActions(state, compatibility, cube, context.alternativeLimit);
  const evaluated = candidates.map((candidate) => {
    const next = applyCompatibilityResolutionAction(state, candidate, cube);
    const key = stateKey(next);
    const child = nextAncestors.has(key) || context.exploredStates >= context.maxStates
      ? null
      : searchNode(next, cube, context, depth + 1, nextAncestors);
    return {
      ...candidate,
      viable: child?.viable ?? false,
      immediateStatus: child?.compatibility.status ?? "incompatible",
      terminalStatus: child?.viable ? "compatible" as const : null,
      remainingSteps: child?.viable
        ? child.terminal ? 0 : Math.min(...child.actions.filter((action) => action.viable).map((action) => (action.remainingSteps ?? 0) + 1))
        : null,
      issues: child?.compatibility.issues ?? [],
    } satisfies CompatibilityResolutionAction;
  });
  const actions = evaluated
    .filter((action) => action.viable)
    .sort((left, right) => (left.remainingSteps ?? Infinity) - (right.remainingSteps ?? Infinity)
      || left.label.localeCompare(right.label));
  return {
    state,
    compatibility,
    terminal: false,
    viable: actions.length > 0,
    actions,
    rejectedActions: evaluated.filter((action) => !action.viable),
  };
}

export function planCompatibilityResolution(
  state: CompatibilityResolutionState,
  cube: CubeResult,
  options: CompatibilityResolutionOptions = {},
) {
  const context: SearchContext = { ...defaultOptions, ...options, exploredStates: 0 };
  return searchNode(cloneCompatibilityResolutionState(state), cube, context, 0, new Set());
}

export function createCompatibilityResolutionSession(
  state: CompatibilityResolutionState,
  cube: CubeResult,
  options: CompatibilityResolutionOptions = {},
): CompatibilityResolutionSession {
  const root = cloneCompatibilityResolutionState(state);
  return { root, history: [root], actionHistory: [], current: planCompatibilityResolution(root, cube, options) };
}

export function advanceCompatibilityResolutionSession(
  session: CompatibilityResolutionSession,
  actionId: string,
  cube: CubeResult,
  options: CompatibilityResolutionOptions = {},
): CompatibilityResolutionSession {
  const action = session.current.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Resolution action is not viable from the current state: ${actionId}.`);
  const state = applyCompatibilityResolutionAction(session.current.state, action, cube);
  return {
    ...session,
    history: [...session.history, state],
    actionHistory: [...session.actionHistory, action],
    current: planCompatibilityResolution(state, cube, options),
  };
}

export function backCompatibilityResolutionSession(
  session: CompatibilityResolutionSession,
  cube: CubeResult,
  options: CompatibilityResolutionOptions = {},
): CompatibilityResolutionSession {
  if (session.history.length <= 1) return session;
  const history = session.history.slice(0, -1);
  const state = history[history.length - 1]!;
  return {
    ...session,
    history,
    actionHistory: session.actionHistory.slice(0, -1),
    current: planCompatibilityResolution(state, cube, options),
  };
}

export function resetCompatibilityResolutionSession(
  session: CompatibilityResolutionSession,
  cube: CubeResult,
  options: CompatibilityResolutionOptions = {},
): CompatibilityResolutionSession {
  return createCompatibilityResolutionSession(session.root, cube, options);
}

export function compatibilityResolutionStateFromChartSpec(
  spec: ChartSpec,
): CompatibilityResolutionState {
  const chartTypeId = spec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  const effectiveChartType = chartTypeId === "linegraph" && resolvedSeriesField(spec)
    ? "MultiLineChart"
    : spec.chartType;
  const requirement = getSingleChartTemplateRequirement(effectiveChartType);
  if (!requirement) throw new Error(`Unknown chart template: ${effectiveChartType}.`);
  const assignment: ChannelFieldAssignment = {};
  const ySource = spec.cubeBinding?.slots.y;
  const seriesSource = spec.cubeBinding?.slots.series;
  const derivedValueSeries = ySource?.kind === "measure-set"
    && seriesSource?.kind === "value-series"
    && seriesSource.valueSlot === "y"
    ? {
      valueChannel: "y" as const,
      seriesChannel: "color" as const,
      measureIds: [...ySource.measureIds],
    }
    : undefined;
  requirement.channels.forEach((channel) => {
    let fields: string[] = [];
    if (derivedValueSeries && channel.channel === derivedValueSeries.valueChannel) {
      fields = [DERIVED_MEASURE_VALUE];
    } else if (derivedValueSeries && channel.channel === derivedValueSeries.seriesChannel) {
      fields = [DERIVED_MEASURE_DIMENSION];
    } else if (channel.channel === "angle") {
      fields = spec.angleFields?.map((encoding) => encoding.field) ?? [];
      const fallback = resolvedEncodingField(spec, "angle");
      if (!fields.length && fallback) fields = [fallback];
    }
    else if (channel.channel === "dimensions") fields = spec.parallelFields?.map((encoding) => encoding.field) ?? [];
    else if (channel.channel === "color" && effectiveChartType.replace(/[\s_-]/g, "").toLowerCase() === "multilinechart") {
      const series = resolvedSeriesField(spec);
      fields = series ? [series] : [];
    } else {
      const field = resolvedEncodingField(spec, channel.channel);
      fields = field ? [field] : [];
    }
    if (fields.length) assignment[channel.channel] = fields;
  });
  return {
    chartType: effectiveChartType,
    assignment,
    selectedFieldIds: Array.from(new Set([
      ...Object.values(assignment).flatMap((fields) => fields ?? []),
      ...Object.keys(spec.filters ?? {}),
      ...Object.keys(spec.valueFilters ?? {}),
    ])),
    dimensionMembers: {
      ...Object.fromEntries(Object.values(spec.cubeBinding?.slots ?? {}).flatMap((source) =>
        source?.kind === "dimension" && source.memberIds?.length ? [[source.dimensionId, [...source.memberIds]]] : [])),
      ...Object.fromEntries(Object.entries(spec.filters ?? {}).map(([field, value]) => [field, [value]])),
      ...Object.fromEntries(Object.entries(spec.valueFilters ?? {}).filter(([, values]) => values.length > 0)),
    },
    aggregations: { ...spec.dimensionAggregations },
    facets: [],
    derivedValueSeries,
  };
}
