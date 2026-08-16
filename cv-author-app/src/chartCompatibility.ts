import type { CubeResult } from "./cubeModel";
import type { CubeSelectionState } from "./cubeBinding";
import type { ChartEncodingChannel, DataColumnType } from "./types";
import { getChartTemplateContract } from "./chartTemplates";
import { getEncodingChannelConfigs } from "./encodingConfig";

export type CompatibilityStatus = "compatible" | "incomplete" | "incompatible";
export type CompatibilityFieldKind = "dimension" | "measure";
export type CompatibilityDataType = DataColumnType | "ordinal";
export type CompatibilityConstraint =
  | { kind: "minimum-members"; channel: ChartEncodingChannel; minimum: number }
  | { kind: "signed-measure"; channel: ChartEncodingChannel }
  | { kind: "nonnegative-measure"; channel: ChartEncodingChannel; requirePositive: boolean }
  | { kind: "hierarchy"; keyChannel: ChartEncodingChannel; parentChannel: ChartEncodingChannel }
  | { kind: "regular-grid"; xChannel: ChartEncodingChannel; yChannel: ChartEncodingChannel }
  | {
    kind: "functional-dependency";
    keyChannels: ChartEncodingChannel[];
    valueChannel: ChartEncodingChannel;
    issueCode: "duplicate-x" | "duplicate-x-series" | "duplicate-grain";
  }
  | {
    kind: "minimum-observations";
    channels: ChartEncodingChannel[];
    minimum: number;
    distinct: boolean;
  }
  | {
    kind: "repeated-series";
    seriesChannel: ChartEncodingChannel;
    xChannel: ChartEncodingChannel;
    minimumDistinctX: number;
  };

export type CompatibilityChannelRequirement = {
  channel: ChartEncodingChannel;
  label: string;
  required: boolean;
  acceptsKinds: CompatibilityFieldKind[];
  acceptsTypes: CompatibilityDataType[];
  minimumFields: number;
  maximumFields: number | null;
};

export type SingleChartTemplateRequirement = {
  chartType: string;
  label: string;
  family: string;
  visualStyle: string;
  coordinateSystem: "Cartesian" | "Polar" | "CoordinateFree";
  channels: CompatibilityChannelRequirement[];
  minimumDimensionCount: number;
  minimumMeasureCount: number;
  dataShape: string;
  constraints: CompatibilityConstraint[];
};

export type CubeFieldSelection = {
  dimensionIds: string[];
  measureIds: string[];
  dimensionMembers?: Record<string, string[]>;
};

export type CompatibilityField = {
  id: string;
  kind: CompatibilityFieldKind;
  type: CompatibilityDataType;
  memberIds?: string[];
};

export type ChannelAssignment = Record<string, CompatibilityField[]>;
export type ChannelFieldAssignment = Partial<Record<ChartEncodingChannel, string[]>>;

export type CompatibilityIssue = {
  code:
    | "unknown-field"
    | "unknown-member"
    | "unassigned-field"
    | "missing-channel"
    | "insufficient-members"
    | "unsigned-measure"
    | "invalid-hierarchy"
    | "irregular-grid"
    | "duplicate-x"
    | "duplicate-x-series"
    | "duplicate-grain"
    | "negative-measure"
    | "insufficient-observations"
    | "insufficient-series-points"
    | "unknown-channel"
    | "invalid-channel-field"
    | "channel-capacity"
    | "duplicate-assignment";
  message: string;
  channel?: ChartEncodingChannel;
  fieldId?: string;
};

export type MissingChannel = {
  channel: ChartEncodingChannel;
  label: string;
  minimumFields: number;
  assignedFields: number;
  candidateFieldIds: string[];
};

export type SingleChartCompatibilityResult = {
  chartType: string;
  label: string;
  status: CompatibilityStatus;
  assignment: ChannelAssignment;
  missingChannels: MissingChannel[];
  issues: CompatibilityIssue[];
};

export type AlternativeRecommendation = {
  chartType: string;
  label: string;
  status: Exclude<CompatibilityStatus, "incompatible">;
  changedDimensions: Array<"coordinate-system" | "visual-style" | "data-dimensionality">;
  missingChannelCount: number;
  compatibility: SingleChartCompatibilityResult;
};

type RequirementSeed = {
  chartType: string;
  label: string;
  family: string;
  visualStyle: string;
  minimumDimensionCount: number;
  minimumMeasureCount: number;
  dataShape: string;
  requiredChannels?: ChartEncodingChannel[];
  kindOverrides?: Partial<Record<ChartEncodingChannel, CompatibilityFieldKind[]>>;
  constraints?: CompatibilityConstraint[];
};

const dimensionOnly: CompatibilityFieldKind[] = ["dimension"];
const measureOnly: CompatibilityFieldKind[] = ["measure"];

function functionalDependency(
  keyChannels: ChartEncodingChannel[],
  valueChannel: ChartEncodingChannel,
  issueCode: "duplicate-x" | "duplicate-x-series" | "duplicate-grain",
): CompatibilityConstraint {
  return { kind: "functional-dependency", keyChannels, valueChannel, issueCode };
}

function minimumObservations(
  channels: ChartEncodingChannel[],
  minimum: number,
  distinct = true,
): CompatibilityConstraint {
  return { kind: "minimum-observations", channels, minimum, distinct };
}

const repeatedSeries: CompatibilityConstraint = {
  kind: "repeated-series",
  seriesChannel: "color",
  xChannel: "x",
  minimumDistinctX: 2,
};

const positiveAngles: CompatibilityConstraint = {
  kind: "nonnegative-measure",
  channel: "angle",
  requirePositive: true,
};

const templateSeeds: RequirementSeed[] = [
  { chartType: "LineGraph", label: "Single Line", family: "lines", visualStyle: "line", minimumDimensionCount: 1, minimumMeasureCount: 1, dataShape: "Selected X functionally determines one distinct Y value.", kindOverrides: { y: measureOnly }, constraints: [functionalDependency(["x"], "y", "duplicate-x")] },
  { chartType: "MultiLineChart", label: "Multi-Line Chart", family: "lines", visualStyle: "line", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected X and Series determine Y, and every selected Series has repeated X observations.", requiredChannels: ["color"], kindOverrides: { y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-x-series"), repeatedSeries] },
  { chartType: "ParallelCoordinatesPlot", label: "Parallel Coordinates", family: "lines", visualStyle: "path", minimumDimensionCount: 0, minimumMeasureCount: 2, dataShape: "At least two selected quantitative axes with at least two complete observations.", kindOverrides: { dimensions: measureOnly }, constraints: [minimumObservations(["dimensions"], 2)] },
  { chartType: "AreaChart", label: "Area Chart", family: "areas", visualStyle: "area", minimumDimensionCount: 1, minimumMeasureCount: 1, dataShape: "Selected X functionally determines one area-height Y value.", kindOverrides: { y: measureOnly, color: dimensionOnly }, constraints: [functionalDependency(["x"], "y", "duplicate-x")] },
  { chartType: "StackedAreaChart", label: "Stacked Area", family: "areas", visualStyle: "stacked-area", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected X and Series determine one stack value, with repeated observations per Series.", requiredChannels: ["color"], kindOverrides: { y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-x-series"), repeatedSeries] },
  { chartType: "Streamgraph", label: "Streamgraph", family: "areas", visualStyle: "streamgraph", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected X and Series determine one stream value, with at least two repeated Series.", requiredChannels: ["color"], kindOverrides: { y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-x-series"), repeatedSeries] },
  { chartType: "HorizonChart", label: "Horizon Chart", family: "areas", visualStyle: "horizon", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected X and Series determine one horizon value, with repeated observations per Series.", requiredChannels: ["color"], kindOverrides: { y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-x-series"), repeatedSeries] },
  { chartType: "SingleBarChart", label: "Single Bar", family: "bars", visualStyle: "bar", minimumDimensionCount: 1, minimumMeasureCount: 1, dataShape: "Each selected category determines one distinct bar value unless aggregation was applied first.", kindOverrides: { x: dimensionOnly, y: measureOnly }, constraints: [functionalDependency(["x"], "y", "duplicate-grain")] },
  { chartType: "GroupedBarChart", label: "Grouped Bar", family: "bars", visualStyle: "grouped-bar", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected Category and Group determine one bar value.", requiredChannels: ["color"], kindOverrides: { x: dimensionOnly, y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-grain")] },
  { chartType: "StackedBarChart", label: "Stacked Bar", family: "bars", visualStyle: "stacked-bar", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected Category and Segment determine one stack value.", requiredChannels: ["color"], kindOverrides: { x: dimensionOnly, y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-grain")] },
  { chartType: "DivergentBarChart", label: "Divergent Bar", family: "bars", visualStyle: "divergent-bar", minimumDimensionCount: 1, minimumMeasureCount: 1, dataShape: "Each selected category determines one value and the selected values cross zero.", kindOverrides: { x: dimensionOnly, y: measureOnly }, constraints: [functionalDependency(["x"], "y", "duplicate-grain"), { kind: "signed-measure", channel: "y" }] },
  { chartType: "DivergentStackedBarChart", label: "Divergent Stacked Bar", family: "bars", visualStyle: "divergent-stacked-bar", minimumDimensionCount: 2, minimumMeasureCount: 1, dataShape: "Selected Category and Segment determine one signed stack value, and values cross zero.", requiredChannels: ["color"], kindOverrides: { x: dimensionOnly, y: measureOnly, color: dimensionOnly }, constraints: [{ kind: "minimum-members", channel: "color", minimum: 2 }, functionalDependency(["x", "color"], "y", "duplicate-grain"), { kind: "signed-measure", channel: "y" }] },
  { chartType: "Calendar", label: "Calendar", family: "bars", visualStyle: "calendar", minimumDimensionCount: 1, minimumMeasureCount: 1, dataShape: "Each selected date determines one distinct daily value.", kindOverrides: { date: dimensionOnly, value: measureOnly }, constraints: [functionalDependency(["date"], "value", "duplicate-grain")] },
  { chartType: "Scatterplot", label: "Scatterplot", family: "dots", visualStyle: "point", minimumDimensionCount: 0, minimumMeasureCount: 2, dataShape: "At least two distinct complete selected X-Y observations.", kindOverrides: { size: measureOnly, shape: dimensionOnly }, constraints: [minimumObservations(["x", "y"], 2)] },
  { chartType: "PieChart", label: "Pie Chart", family: "radial", visualStyle: "arc", minimumDimensionCount: 0, minimumMeasureCount: 1, dataShape: "Selected angle values are nonnegative and contain a positive contribution.", kindOverrides: { angle: measureOnly, color: dimensionOnly, radius: measureOnly }, constraints: [positiveAngles] },
  { chartType: "DonutChart", label: "Donut", family: "radial", visualStyle: "donut", minimumDimensionCount: 0, minimumMeasureCount: 1, dataShape: "Selected angle values are nonnegative and contain a positive contribution.", kindOverrides: { angle: measureOnly, color: dimensionOnly, ring: dimensionOnly, radius: measureOnly }, constraints: [positiveAngles] },
  { chartType: "MatrixDiagram", label: "Matrix", family: "analysis", visualStyle: "matrix", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Selected Row and Column determine at most one distinct Cell value.", kindOverrides: { row: dimensionOnly, column: dimensionOnly, value: measureOnly }, constraints: [functionalDependency(["row", "column"], "value", "duplicate-grain")] },
  { chartType: "Boxplot", label: "Box Plot", family: "analysis", visualStyle: "box", minimumDimensionCount: 0, minimumMeasureCount: 2, dataShape: "At least five complete selected observations define a distribution.", kindOverrides: { x: measureOnly, y: measureOnly }, constraints: [minimumObservations(["x", "y"], 5, false)] },
  { chartType: "Contour", label: "Contour", family: "analysis", visualStyle: "density", minimumDimensionCount: 0, minimumMeasureCount: 3, dataShape: "Selected quantitative X and Y form a complete grid and determine one grid value.", kindOverrides: { x: measureOnly, y: measureOnly, value: measureOnly }, constraints: [{ kind: "regular-grid", xChannel: "x", yChannel: "y" }, functionalDependency(["x", "y"], "value", "duplicate-grain")] },
  { chartType: "Hexbin", label: "Hexbin", family: "analysis", visualStyle: "density", minimumDimensionCount: 0, minimumMeasureCount: 2, dataShape: "At least two complete selected quantitative X-Y observations.", kindOverrides: { x: measureOnly, y: measureOnly }, constraints: [minimumObservations(["x", "y"], 2, false)] },
  { chartType: "Icicle", label: "Icicle", family: "hierarchies", visualStyle: "hierarchy", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Unique node ID x parent ID adjacency list; optional node value.", kindOverrides: { key: dimensionOnly, parent: dimensionOnly, value: measureOnly }, constraints: [{ kind: "hierarchy", keyChannel: "key", parentChannel: "parent" }] },
  { chartType: "Sunburst", label: "Sunburst", family: "hierarchies", visualStyle: "hierarchy", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Unique node ID x parent ID adjacency list; optional node value.", kindOverrides: { key: dimensionOnly, parent: dimensionOnly, value: measureOnly }, constraints: [{ kind: "hierarchy", keyChannel: "key", parentChannel: "parent" }] },
  { chartType: "Treemap", label: "Treemap", family: "hierarchies", visualStyle: "hierarchy", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Unique node ID x parent ID adjacency list; optional node value.", kindOverrides: { key: dimensionOnly, parent: dimensionOnly, value: measureOnly }, constraints: [{ kind: "hierarchy", keyChannel: "key", parentChannel: "parent" }] },
  { chartType: "Dendrogram", label: "Dendrogram", family: "hierarchies", visualStyle: "hierarchy", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Unique node ID x parent ID adjacency list.", kindOverrides: { key: dimensionOnly, parent: dimensionOnly, value: measureOnly }, constraints: [{ kind: "hierarchy", keyChannel: "key", parentChannel: "parent" }] },
  { chartType: "Chord", label: "Chord", family: "networks", visualStyle: "flow", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Selected Source and Target form at least one link and determine an optional flow value.", kindOverrides: { source: dimensionOnly, target: dimensionOnly, value: measureOnly }, constraints: [minimumObservations(["source", "target"], 1), functionalDependency(["source", "target"], "value", "duplicate-grain")] },
  { chartType: "Sankey", label: "Sankey", family: "networks", visualStyle: "flow", minimumDimensionCount: 2, minimumMeasureCount: 0, dataShape: "Selected Source and Target form at least one link and determine an optional flow value.", kindOverrides: { source: dimensionOnly, target: dimensionOnly, value: measureOnly }, constraints: [minimumObservations(["source", "target"], 1), functionalDependency(["source", "target"], "value", "duplicate-grain")] },
];

function acceptedTypes(types: DataColumnType[]): CompatibilityDataType[] {
  return types.includes("nominal") ? [...types, "ordinal"] : types;
}

function defaultKinds(types: DataColumnType[]): CompatibilityFieldKind[] {
  return [
    ...(types.some((type) => type === "nominal" || type === "temporal") ? ["dimension" as const] : []),
    ...(types.includes("quantitative") ? ["measure" as const] : []),
  ];
}

function buildRequirement(seed: RequirementSeed): SingleChartTemplateRequirement {
  const contract = getChartTemplateContract(seed.chartType);
  if (!contract) throw new Error(`Missing chart contract for ${seed.chartType}.`);
  const required = new Set(seed.requiredChannels ?? []);
  const channels = getEncodingChannelConfigs(seed.chartType).map((config) => {
    const minimumFields = config.channel === "dimensions" ? 2 : 1;
    return {
      channel: config.channel,
      label: config.label,
      required: config.required || required.has(config.channel),
      acceptsKinds: seed.kindOverrides?.[config.channel] ?? defaultKinds(config.accepts),
      acceptsTypes: acceptedTypes(config.accepts),
      minimumFields,
      maximumFields: config.multiple ? null : 1,
    } satisfies CompatibilityChannelRequirement;
  });
  return {
    chartType: seed.chartType,
    label: seed.label,
    family: seed.family,
    visualStyle: seed.visualStyle,
    coordinateSystem: contract.coordinateSystem,
    channels,
    minimumDimensionCount: seed.minimumDimensionCount,
    minimumMeasureCount: seed.minimumMeasureCount,
    dataShape: seed.dataShape,
    constraints: seed.constraints ?? [],
  };
}

export const singleChartTemplateRequirements = templateSeeds.map(buildRequirement);

export function getSingleChartTemplateRequirement(chartType: string) {
  return singleChartTemplateRequirements.find((requirement) => requirement.chartType === chartType) ?? null;
}

export function cubeSelectionFromState(state: CubeSelectionState, cube: CubeResult): CubeFieldSelection {
  const dimensionIds = cube.schema.dimensions
    .filter((dimension) => state.selected[dimension.id])
    .map((dimension) => dimension.id);
  const measureIds = state.selected.__measures__ ? state.values.__measures__ ?? [] : [];
  return {
    dimensionIds,
    measureIds,
    dimensionMembers: Object.fromEntries(dimensionIds.flatMap((dimensionId) => {
      const members = state.values[dimensionId];
      return members?.length ? [[dimensionId, members]] : [];
    })),
  };
}

function resolveSelection(selection: CubeFieldSelection, cube: CubeResult) {
  const issues: CompatibilityIssue[] = [];
  const fields: CompatibilityField[] = [];
  const dimensions = new Map(cube.schema.dimensions.map((dimension) => [dimension.id, dimension]));
  const measures = new Map(cube.schema.measures.map((measure) => [measure.id, measure]));
  Array.from(new Set(selection.dimensionIds)).forEach((id) => {
    const dimension = dimensions.get(id);
    if (!dimension) {
      issues.push({ code: "unknown-field", fieldId: id, message: `Unknown Cube dimension: ${id}.` });
      return;
    }
    const memberIds = selection.dimensionMembers?.[id];
    const unknownMember = memberIds?.find((memberId) => !dimension.members.some((member) => member.id === memberId));
    if (unknownMember) {
      issues.push({ code: "unknown-member", fieldId: id, message: `Unknown member ${unknownMember} in dimension ${id}.` });
      return;
    }
    fields.push({ id, kind: "dimension", type: dimension.type, memberIds: memberIds?.length ? Array.from(new Set(memberIds)) : undefined });
  });
  Array.from(new Set(selection.measureIds)).forEach((id) => {
    if (!measures.has(id)) {
      issues.push({ code: "unknown-field", fieldId: id, message: `Unknown Cube measure: ${id}.` });
      return;
    }
    fields.push({ id, kind: "measure", type: "quantitative" });
  });
  return { fields, issues };
}

function channelAcceptsField(channel: CompatibilityChannelRequirement, field: CompatibilityField) {
  return channel.acceptsKinds.includes(field.kind) && channel.acceptsTypes.includes(field.type);
}

function assignmentScore(requirement: SingleChartTemplateRequirement, assignment: ChannelAssignment) {
  return requirement.channels.reduce((score, channel, channelIndex) => {
    const fields = assignment[channel.channel] ?? [];
    const requiredScore = channel.required && fields.length >= channel.minimumFields ? 100 : 0;
    const positionalScore = fields.length * (requirement.channels.length - channelIndex);
    const semanticScore = fields.reduce((total, field) => {
      const rolePrefersDimension = ["x", "color", "shape", "key", "parent", "source", "target", "row", "column", "date", "category"].includes(channel.channel);
      const rolePrefersMeasure = ["y", "value", "angle", "radius", "size", "dimensions"].includes(channel.channel);
      return total + (rolePrefersDimension && field.kind === "dimension" ? 8 : 0) + (rolePrefersMeasure && field.kind === "measure" ? 8 : 0);
    }, 0);
    return score + requiredScore + positionalScore + semanticScore;
  }, 0);
}

function enumerateAssignments(requirement: SingleChartTemplateRequirement, fields: CompatibilityField[]) {
  const assignments: ChannelAssignment[] = [];
  const current: ChannelAssignment = {};
  const visit = (index: number) => {
    if (index === fields.length) {
      assignments.push(Object.fromEntries(Object.entries(current).map(([channel, values]) => [channel, [...values]])));
      return;
    }
    const field = fields[index]!;
    requirement.channels.forEach((channel) => {
      if (!channelAcceptsField(channel, field)) return;
      const values = current[channel.channel] ?? [];
      if (channel.maximumFields !== null && values.length >= channel.maximumFields) return;
      current[channel.channel] = [...values, field];
      visit(index + 1);
      if (values.length) current[channel.channel] = values;
      else delete current[channel.channel];
    });
  };
  visit(0);
  return assignments.sort((left, right) => assignmentScore(requirement, right) - assignmentScore(requirement, left));
}

function allCubeFields(cube: CubeResult): CompatibilityField[] {
  return [
    ...cube.schema.dimensions.map((dimension) => ({ id: dimension.id, kind: "dimension" as const, type: dimension.type })),
    ...cube.schema.measures.map((measure) => ({ id: measure.id, kind: "measure" as const, type: "quantitative" as const })),
  ];
}

function missingChannels(
  requirement: SingleChartTemplateRequirement,
  assignment: ChannelAssignment,
  availableFields: CompatibilityField[],
) {
  const assigned = new Set(Object.values(assignment).flatMap((fields) => fields)
    .map((field) => `${field.kind}:${field.id}`));
  return requirement.channels.flatMap((channel) => {
    const assignedFields = assignment[channel.channel]?.length ?? 0;
    if (!channel.required || assignedFields >= channel.minimumFields) return [];
    const candidateFieldIds = availableFields
      .filter((field) => !assigned.has(`${field.kind}:${field.id}`) && channelAcceptsField(channel, field))
      .map((field) => field.id);
    return [{
      channel: channel.channel,
      label: channel.label,
      minimumFields: channel.minimumFields,
      assignedFields,
      candidateFieldIds,
    } satisfies MissingChannel];
  });
}

function cellsForAssignment(
  cube: CubeResult,
  assignment: ChannelAssignment,
  dimensionMembers: Record<string, string[]>,
) {
  const selections = new Map(Object.entries(dimensionMembers)
    .filter(([, members]) => members.length > 0)
    .map(([fieldId, members]) => [fieldId, new Set(members)]));
  Object.values(assignment).flatMap((fields) => fields)
    .filter((field) => field.kind === "dimension" && field.memberIds?.length)
    .forEach((field) => selections.set(field.id, new Set(field.memberIds)));
  return cube.cells.filter((cell) => Array.from(selections).every(([fieldId, members]) =>
    members.has(cell.coordinates[fieldId] ?? ""),
  ));
}

function fieldValues(cube: CubeResult, field: CompatibilityField, cells = cube.cells) {
  return cells.flatMap((cell) => {
    const value = field.kind === "dimension" ? cell.coordinates[field.id] : cell.values[field.id];
    return value === undefined || value === null || value === "" ? [] : [value];
  });
}

function cellFieldValue(cell: CubeResult["cells"][number], field: CompatibilityField) {
  return field.kind === "measure" ? cell.values[field.id] : cell.coordinates[field.id];
}

function validateConstraints(
  requirement: SingleChartTemplateRequirement,
  assignment: ChannelAssignment,
  cube: CubeResult,
  dimensionMembers: Record<string, string[]> = {},
) {
  const issues: CompatibilityIssue[] = [];
  const selectedCells = cellsForAssignment(cube, assignment, dimensionMembers);
  const requiredFields = requirement.channels
    .filter((channel) => channel.required)
    .flatMap((channel) => assignment[channel.channel] ?? []);
  if (requiredFields.length > 0 && !selectedCells.some((cell) => requiredFields.every((field) => {
    const value = cellFieldValue(cell, field);
    return value !== undefined && value !== null && value !== "";
  }))) {
    issues.push({
      code: "insufficient-observations",
      message: `${requirement.label} has no complete observation for its required channels in the selected data.`,
    });
  }
  requirement.constraints.forEach((constraint) => {
    if (constraint.kind === "minimum-members") {
      const field = assignment[constraint.channel]?.[0];
      if (!field) return;
      const memberCount = new Set(fieldValues(cube, field, selectedCells).map(String)).size;
      if (memberCount < constraint.minimum) {
        issues.push({ code: "insufficient-members", channel: constraint.channel, fieldId: field.id, message: `${requirement.label} requires at least ${constraint.minimum} members on ${constraint.channel}; ${field.id} provides ${memberCount}.` });
      }
      return;
    }
    if (constraint.kind === "signed-measure") {
      const field = assignment[constraint.channel]?.[0];
      if (!field) return;
      const values = fieldValues(cube, field, selectedCells).map(Number).filter(Number.isFinite);
      if (!values.some((value) => value < 0) || !values.some((value) => value > 0)) {
        issues.push({ code: "unsigned-measure", channel: constraint.channel, fieldId: field.id, message: `${field.id} does not contain both negative and positive values required by ${requirement.label}.` });
      }
      return;
    }
    if (constraint.kind === "nonnegative-measure") {
      const fields = assignment[constraint.channel] ?? [];
      if (!fields.length) return;
      const values = fields.flatMap((field) => fieldValues(cube, field, selectedCells))
        .map(Number)
        .filter(Number.isFinite);
      if (values.some((value) => value < 0) || (constraint.requirePositive && !values.some((value) => value > 0))) {
        issues.push({
          code: "negative-measure",
          channel: constraint.channel,
          fieldId: fields[0]?.id,
          message: `${requirement.label} requires nonnegative ${constraint.channel} values with at least one positive contribution.`,
        });
      }
      return;
    }
    if (constraint.kind === "hierarchy") {
      const key = assignment[constraint.keyChannel]?.[0];
      const parent = assignment[constraint.parentChannel]?.[0];
      if (!key || !parent) return;
      const pairs = Array.from(new Map(selectedCells.map((cell) => {
        const pair = { key: cell.coordinates[key.id] ?? "", parent: cell.coordinates[parent.id] ?? "" };
        return [`${pair.key}\u001f${pair.parent}`, pair];
      })).values());
      const keys = pairs.map((pair) => pair.key).filter(Boolean);
      const keySet = new Set(keys);
      const rootCount = pairs.filter((pair) => pair.key && !pair.parent).length;
      const valid = keys.length === keySet.size
        && rootCount === 1
        && pairs.every((pair) => pair.key && (!pair.parent || keySet.has(pair.parent)));
      if (!valid) {
        issues.push({ code: "invalid-hierarchy", message: `${key.id} and ${parent.id} do not form a single-root adjacency hierarchy.` });
      }
      return;
    }
    if (constraint.kind === "functional-dependency") {
      const keyFields = constraint.keyChannels.map((channel) => assignment[channel]?.[0]);
      const valueField = assignment[constraint.valueChannel]?.[0];
      if (keyFields.some((field) => !field) || !valueField) return;
      const valuesByKey = new Map<string, Set<string>>();
      selectedCells.forEach((cell) => {
        const value = cellFieldValue(cell, valueField);
        if (value === undefined || value === null || value === "") return;
        const keyValues = keyFields.map((field) => cellFieldValue(cell, field!));
        if (keyValues.some((key) => key === undefined || key === null || key === "")) return;
        const key = keyValues.map(String).join("\u001f");
        valuesByKey.set(key, new Set([...(valuesByKey.get(key) ?? []), String(value)]));
      });
      if (Array.from(valuesByKey.values()).some((values) => values.size > 1)) {
        const grain = constraint.keyChannels.map((channel) => channel === "color" ? "Series" : channel.toUpperCase()).join(" x ");
        issues.push({
          code: constraint.issueCode,
          channel: constraint.valueChannel,
          fieldId: valueField.id,
          message: `${requirement.label} requires ${grain} to determine one distinct ${valueField.id}; the selected data maps at least one ${grain} to multiple values.`,
        });
      }
      return;
    }
    if (constraint.kind === "minimum-observations") {
      const fields = constraint.channels.flatMap((channel) => assignment[channel] ?? []);
      if (constraint.channels.some((channel) => !(assignment[channel]?.length)) || !fields.length) return;
      const tuples = selectedCells.flatMap((cell) => {
        const values = fields.map((field) => cellFieldValue(cell, field));
        if (values.some((value) => value === undefined || value === null || value === "")) return [];
        return [values.map(String).join("\u001f")];
      });
      const observationCount = constraint.distinct ? new Set(tuples).size : tuples.length;
      if (observationCount < constraint.minimum) {
        issues.push({
          code: "insufficient-observations",
          message: `${requirement.label} requires at least ${constraint.minimum} ${constraint.distinct ? "distinct " : ""}complete observations; the selected data provides ${observationCount}.`,
        });
      }
      return;
    }
    if (constraint.kind === "repeated-series") {
      const series = assignment[constraint.seriesChannel]?.[0];
      const x = assignment[constraint.xChannel]?.[0];
      if (!series || !x) return;
      const xBySeries = new Map<string, Set<string>>();
      selectedCells.forEach((cell) => {
        const seriesValue = cellFieldValue(cell, series);
        const xValue = cellFieldValue(cell, x);
        if (seriesValue === undefined || seriesValue === null || seriesValue === ""
          || xValue === undefined || xValue === null || xValue === "") return;
        const key = String(seriesValue);
        xBySeries.set(key, new Set([...(xBySeries.get(key) ?? []), String(xValue)]));
      });
      const shortSeries = Array.from(xBySeries.values()).filter((values) => values.size < constraint.minimumDistinctX).length;
      if (shortSeries > 0) {
        issues.push({
          code: "insufficient-series-points",
          channel: constraint.seriesChannel,
          fieldId: series.id,
          message: `${requirement.label} requires every selected Series to span at least ${constraint.minimumDistinctX} distinct X values; ${shortSeries} Series do not.`,
        });
      }
      return;
    }
    const x = assignment[constraint.xChannel]?.[0];
    const y = assignment[constraint.yChannel]?.[0];
    if (!x || !y) return;
    const pairs = selectedCells.flatMap((cell) => {
      const xValue = x.kind === "measure" ? cell.values[x.id] : cell.coordinates[x.id];
      const yValue = y.kind === "measure" ? cell.values[y.id] : cell.coordinates[y.id];
      return xValue === undefined || xValue === null || yValue === undefined || yValue === null ? [] : [[String(xValue), String(yValue)] as const];
    });
    const xValues = new Set(pairs.map(([value]) => value));
    const yValues = new Set(pairs.map(([, value]) => value));
    const uniquePairs = new Set(pairs.map(([xValue, yValue]) => `${xValue}\u001f${yValue}`));
    if (xValues.size < 2 || yValues.size < 2 || uniquePairs.size !== xValues.size * yValues.size) {
      issues.push({ code: "irregular-grid", message: `${x.id} x ${y.id} is not a complete regular grid required by ${requirement.label}.` });
    }
  });
  return issues;
}

/**
 * Evaluates the exact field-to-channel choices made by the author. Unlike
 * evaluateSingleChartCompatibility, this function never remaps a field to a
 * different channel in search of a better result.
 */
export function evaluateSingleChartAssignment(
  chartType: string,
  fieldAssignment: ChannelFieldAssignment,
  cube: CubeResult,
  dimensionMembers: Record<string, string[]> = {},
  selectedFieldIds?: string[],
): SingleChartCompatibilityResult {
  const requirement = getSingleChartTemplateRequirement(chartType);
  if (!requirement) throw new Error(`Unknown chart template: ${chartType}.`);
  const fieldsById = new Map(allCubeFields(cube).map((field) => [`${field.kind}:${field.id}`, field]));
  const fieldsByBareId = new Map<string, CompatibilityField[]>();
  fieldsById.forEach((field) => fieldsByBareId.set(field.id, [...(fieldsByBareId.get(field.id) ?? []), field]));
  const requirementsByChannel = new Map(requirement.channels.map((channel) => [channel.channel, channel]));
  const assignment: ChannelAssignment = {};
  const issues: CompatibilityIssue[] = [];
  const assignedFieldKeys = new Set<string>();

  Object.entries(dimensionMembers).forEach(([fieldId, memberIds]) => {
    if (!memberIds.length) return;
    const dimension = cube.schema.dimensions.find((item) => item.id === fieldId);
    const unknownMember = memberIds.find((memberId) => !dimension?.members.some((member) => member.id === memberId));
    if (!dimension || unknownMember) {
      issues.push({
        code: dimension ? "unknown-member" : "unknown-field",
        fieldId,
        message: dimension
          ? `Unknown member ${unknownMember} in dimension ${fieldId}.`
          : `Unknown selected dimension: ${fieldId}.`,
      });
    }
  });

  Object.entries(fieldAssignment).forEach(([channelId, fieldIds]) => {
    const channel = channelId as ChartEncodingChannel;
    const channelRequirement = requirementsByChannel.get(channel);
    if (!channelRequirement) {
      issues.push({
        code: "unknown-channel",
        channel,
        message: `${requirement.label} does not define a ${channel} channel.`,
      });
      return;
    }
    const uniqueFieldIds = Array.from(new Set(fieldIds ?? []));
    if (channelRequirement.maximumFields !== null && uniqueFieldIds.length > channelRequirement.maximumFields) {
      issues.push({
        code: "channel-capacity",
        channel,
        message: `${channelRequirement.label} accepts at most ${channelRequirement.maximumFields} field.`,
      });
    }
    uniqueFieldIds.forEach((fieldId) => {
      const candidates = fieldsByBareId.get(fieldId) ?? [];
      const field = candidates.find((candidate) => channelAcceptsField(channelRequirement, candidate));
      if (!field) {
        issues.push({
          code: candidates.length ? "invalid-channel-field" : "unknown-field",
          channel,
          fieldId,
          message: candidates.length
            ? `${fieldId} cannot be assigned to ${channelRequirement.label}.`
            : `Unknown Cube field: ${fieldId}.`,
        });
        return;
      }
      const key = `${field.kind}:${field.id}`;
      if (assignedFieldKeys.has(key)) {
        issues.push({
          code: "duplicate-assignment",
          channel,
          fieldId,
          message: `${field.id} is assigned to more than one data channel.`,
        });
        return;
      }
      const memberIds = field.kind === "dimension" ? dimensionMembers[field.id] : undefined;
      const unknownMember = memberIds?.find((memberId) => {
        const dimension = cube.schema.dimensions.find((item) => item.id === field.id);
        return !dimension?.members.some((member) => member.id === memberId);
      });
      if (unknownMember) {
        issues.push({
          code: "unknown-member",
          channel,
          fieldId,
          message: `Unknown member ${unknownMember} in dimension ${field.id}.`,
        });
        return;
      }
      assignedFieldKeys.add(key);
      assignment[channel] = [
        ...(assignment[channel] ?? []),
        { ...fieldsById.get(key)!, memberIds: memberIds?.length ? Array.from(new Set(memberIds)) : undefined },
      ];
    });
  });

  if (issues.length) {
    return { chartType, label: requirement.label, status: "incompatible", assignment, missingChannels: [], issues };
  }
  const visibleFieldIds = Array.from(new Set(selectedFieldIds
    ?? Object.values(fieldAssignment).flatMap((fieldIds) => fieldIds ?? [])));
  const availableFields = visibleFieldIds.flatMap((fieldId) => fieldsByBareId.get(fieldId) ?? []);
  const missing = missingChannels(requirement, assignment, availableFields);
  if (missing.length) {
    return {
      chartType,
      label: requirement.label,
      status: "incomplete",
      assignment,
      missingChannels: missing,
      issues: missing.map((item) => ({
        code: "missing-channel",
        channel: item.channel,
        message: `Required channel ${item.label} is not complete in the selected data.`,
      })),
    };
  }
  const constraintIssues = validateConstraints(requirement, assignment, cube, dimensionMembers);
  return {
    chartType,
    label: requirement.label,
    status: constraintIssues.length ? "incompatible" : "compatible",
    assignment,
    missingChannels: [],
    issues: constraintIssues,
  };
}

export function evaluateSingleChartCompatibility(
  chartType: string,
  selection: CubeFieldSelection,
  cube: CubeResult,
): SingleChartCompatibilityResult {
  const requirement = getSingleChartTemplateRequirement(chartType);
  if (!requirement) throw new Error(`Unknown chart template: ${chartType}.`);
  const resolved = resolveSelection(selection, cube);
  if (resolved.issues.length) {
    return { chartType, label: requirement.label, status: "incompatible", assignment: {}, missingChannels: [], issues: resolved.issues };
  }
  const assignments = enumerateAssignments(requirement, resolved.fields);
  if (!assignments.length) {
    return {
      chartType,
      label: requirement.label,
      status: "incompatible",
      assignment: {},
      missingChannels: [],
      issues: [{ code: "unassigned-field", message: "One or more selected Cube fields cannot be assigned to this template without exceeding its channels." }],
    };
  }
  let bestIncomplete: { assignment: ChannelAssignment; missing: MissingChannel[] } | null = null;
  let bestConstraintFailure: { assignment: ChannelAssignment; issues: CompatibilityIssue[] } | null = null;
  for (const assignment of assignments) {
    const missing = missingChannels(requirement, assignment, resolved.fields);
    if (missing.length) {
      bestIncomplete ??= { assignment, missing };
      continue;
    }
    const issues = validateConstraints(requirement, assignment, cube, selection.dimensionMembers);
    if (!issues.length) {
      return { chartType, label: requirement.label, status: "compatible", assignment, missingChannels: [], issues: [] };
    }
    bestConstraintFailure ??= { assignment, issues };
  }
  if (bestConstraintFailure) {
    return { chartType, label: requirement.label, status: "incompatible", assignment: bestConstraintFailure.assignment, missingChannels: [], issues: bestConstraintFailure.issues };
  }
  if (bestIncomplete) {
    return {
      chartType,
      label: requirement.label,
      status: "incomplete",
      assignment: bestIncomplete.assignment,
      missingChannels: bestIncomplete.missing,
      issues: bestIncomplete.missing.map((missing) => ({
        code: "missing-channel",
        channel: missing.channel,
        message: `Required channel ${missing.label} is not complete in the selected data.`,
      })),
    };
  }
  return {
    chartType,
    label: requirement.label,
    status: "incompatible",
    assignment: {},
    missingChannels: [],
    issues: [{ code: "unassigned-field", message: "The selected fields do not satisfy this template's channel and data constraints." }],
  };
}

export function recommendSingleChartAlternatives(
  intendedChartType: string,
  selection: CubeFieldSelection,
  cube: CubeResult,
  limit = 5,
): AlternativeRecommendation[] {
  const intended = getSingleChartTemplateRequirement(intendedChartType);
  if (!intended) throw new Error(`Unknown chart template: ${intendedChartType}.`);
  const intendedCompatibility = evaluateSingleChartCompatibility(intendedChartType, selection, cube);
  const repairsDuplicateSingleLine = intendedChartType === "LineGraph"
    && intendedCompatibility.issues.some((issue) => issue.code === "duplicate-x");
  return singleChartTemplateRequirements
    .filter((candidate) => candidate.chartType !== intendedChartType)
    .flatMap((candidate) => {
      const compatibility = evaluateSingleChartCompatibility(candidate.chartType, selection, cube);
      if (compatibility.status === "incompatible") return [];
      const changedDimensions: AlternativeRecommendation["changedDimensions"] = [
        ...(candidate.coordinateSystem !== intended.coordinateSystem ? ["coordinate-system" as const] : []),
        ...(candidate.visualStyle !== intended.visualStyle ? ["visual-style" as const] : []),
        ...(candidate.minimumDimensionCount !== intended.minimumDimensionCount
          || candidate.minimumMeasureCount !== intended.minimumMeasureCount ? ["data-dimensionality" as const] : []),
      ];
      return [{
        chartType: candidate.chartType,
        label: candidate.label,
        status: compatibility.status,
        changedDimensions,
        missingChannelCount: compatibility.missingChannels.length,
        compatibility,
      } satisfies AlternativeRecommendation];
    })
    .sort((left, right) => {
      if (repairsDuplicateSingleLine) {
        const directRepair = (recommendation: AlternativeRecommendation) => recommendation.chartType === "MultiLineChart" ? 0 : 1;
        const repairPriority = directRepair(left) - directRepair(right);
        if (repairPriority) return repairPriority;
      }
      const status = (left.status === "compatible" ? 0 : 100) - (right.status === "compatible" ? 0 : 100);
      if (status) return status;
      const leftRequirement = getSingleChartTemplateRequirement(left.chartType)!;
      const rightRequirement = getSingleChartTemplateRequirement(right.chartType)!;
      const distance = (candidate: SingleChartTemplateRequirement, recommendation: AlternativeRecommendation) =>
        recommendation.changedDimensions.length * 20
        + recommendation.missingChannelCount * 30
        + (candidate.family === intended.family ? -12 : 0)
        + (candidate.visualStyle === intended.visualStyle ? -8 : 0);
      return distance(leftRequirement, left) - distance(rightRequirement, right)
        || left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}
