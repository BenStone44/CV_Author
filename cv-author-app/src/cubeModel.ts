import type { ChartTemplateKind, DataColumnType, Dataset } from "./types";

export type CubeAggregation = "sum" | "avg" | "min" | "max" | "count" | "distinct" | "none";
export type CubeDimensionType = Exclude<DataColumnType, "quantitative"> | "ordinal";

export type CubeDimensionMember = {
  id: string;
  label: string;
  order?: number;
  parentId?: string;
};

export type CubeDimension = {
  id: string;
  label: string;
  type: CubeDimensionType;
  members: CubeDimensionMember[];
};

export type CubeMeasure = {
  id: string;
  label: string;
  unit?: string;
  grainDimensionIds: string[];
  aggregation: {
    default: CubeAggregation;
    additivity: "additive" | "semi-additive" | "non-additive";
    nonAdditiveDimensionIds?: string[];
  };
  groupId?: string;
};

export type CubeSchema = {
  version: 1;
  id: string;
  dimensions: CubeDimension[];
  measures: CubeMeasure[];
  measureGroups?: Array<{
    id: string;
    label: string;
    measureIds: string[];
  }>;
};

export type CubeCell = {
  coordinates: Record<string, string>;
  values: Record<string, number | null>;
};

export type CubeResult = {
  schema: CubeSchema;
  cells: CubeCell[];
};

export type CubeDimensionSelection = {
  kind: "dimension";
  dimensionId: string;
  memberIds?: string[];
  levelId?: string;
};

export type CubeFilter =
  | {
    kind: "members";
    dimensionId: string;
    memberIds: string[];
    mode: "include" | "exclude";
  }
  | {
    kind: "range";
    dimensionId: string;
    minimum?: string | number;
    maximum?: string | number;
  };

export type CubeValueSelection =
  | {
    kind: "measure";
    measureId: string;
  }
  | {
    kind: "measure-set";
    groupId?: string;
    measureIds: string[];
  };

export type CubeDerivedSeriesSelection = {
  kind: "value-series";
  valueSlot: CubeValueSlot;
};

export type CubeBindingSource = CubeDimensionSelection | CubeValueSelection | CubeDerivedSeriesSelection;
export type CubeValueSlot = "x" | "y" | "value" | "theta" | "radius" | "cell";
export type SemanticBindingSlot =
  | CubeValueSlot
  | "category"
  | "series"
  | "group"
  | "segment"
  | "slice"
  | "ring"
  | "row"
  | "column";

export type CubeChartBinding = {
  version: 1;
  sourceId: string;
  slots: Partial<Record<SemanticBindingSlot, CubeBindingSource>>;
  filters?: CubeFilter[];
  aggregation?: Record<string, CubeAggregation>;
  visualMappings?: {
    color?: {
      sourceSlot?: SemanticBindingSlot;
      constant?: string;
      memberStyles?: Record<string, { color: string }>;
    };
    size?: {
      sourceSlot?: SemanticBindingSlot;
      constant?: number;
    };
    shape?: {
      sourceSlot?: SemanticBindingSlot;
      constant?: string;
    };
  };
  unresolvedDimensions?: Array<{
    dimensionId: string;
    policy: "filter" | "rollup" | "facet" | "detail";
  }>;
};

export type NormalizedCubeSeriesRow = {
  seriesKey: string;
  styleKey: string;
  value: number;
  measureId: string;
  dimensionId?: string;
  memberId?: string;
  sourceCount: number;
};

export type CompiledCubeValueSeries = {
  rows: NormalizedCubeSeriesRow[];
  errors: string[];
};

function uniqueValues(dataset: Dataset, field: string) {
  return Array.from(new Set(dataset.rows.map((row) => row[field] ?? "").filter(Boolean)));
}

/** Interprets an already-converted tabular Cube result without reshaping columns. */
export function cubeResultFromDataset(dataset: Dataset): CubeResult {
  if (dataset.cubeResult) return dataset.cubeResult;
  const isIdColumn = (column: Dataset["columns"][number]) => column.name.trim().toLowerCase() === "id";
  const dimensionColumns = dataset.columns.filter((column) =>
    isIdColumn(column) || column.type !== "quantitative",
  );
  const measureColumns = dataset.columns.filter((column) =>
    !isIdColumn(column) && column.type === "quantitative",
  );
  const grainDimensionIds = dimensionColumns.map((column) => column.name);
  return {
    schema: {
      version: 1,
      id: `cube:${dataset.id}`,
      dimensions: dimensionColumns.map((column) => ({
        id: column.name,
        label: column.name,
        type: isIdColumn(column) ? "nominal" : column.type as CubeDimensionType,
        members: uniqueValues(dataset, column.name).map((value, order) => ({ id: value, label: value, order })),
      })),
      measures: measureColumns.map((column) => ({
        id: column.name,
        label: column.name,
        grainDimensionIds: [...grainDimensionIds],
        aggregation: { default: "sum", additivity: "additive" },
      })),
      measureGroups: measureColumns.length > 1
        ? [{ id: "measures", label: "Measures", measureIds: measureColumns.map((column) => column.name) }]
        : undefined,
    },
    cells: dataset.rows.map((row) => ({
      coordinates: Object.fromEntries(dimensionColumns.map((column) => [column.name, row[column.name] ?? ""])),
      values: Object.fromEntries(measureColumns.map((column) => {
        const value = Number(row[column.name] ?? "");
        return [column.name, Number.isFinite(value) ? value : null];
      })),
    })),
  };
}

export function cubeDimensionStyleKey(dimensionId: string, memberId: string) {
  return `dimension:${dimensionId}/member:${memberId}`;
}

export function cubeMeasureStyleKey(measureId: string) {
  return `measure:${measureId}`;
}

function valueSource(binding: CubeChartBinding, slot: CubeValueSlot) {
  const source = binding.slots[slot];
  return source?.kind === "measure" || source?.kind === "measure-set" ? source : null;
}

function selectedMeasureIds(source: CubeValueSelection) {
  return source.kind === "measure" ? [source.measureId] : Array.from(new Set(source.measureIds));
}

function compareRangeValue(value: string, boundary: string | number) {
  if (typeof boundary === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric - boundary : Number.NaN;
  }
  return value.localeCompare(boundary);
}

function matchesFilters(cell: CubeCell, filters: CubeFilter[]) {
  return filters.every((filter) => {
    const value = cell.coordinates[filter.dimensionId] ?? "";
    if (filter.kind === "members") {
      const includes = filter.memberIds.includes(value);
      return filter.mode === "include" ? includes : !includes;
    }
    if (filter.minimum !== undefined && compareRangeValue(value, filter.minimum) < 0) return false;
    if (filter.maximum !== undefined && compareRangeValue(value, filter.maximum) > 0) return false;
    return true;
  });
}

function aggregateValues(values: number[], aggregation: CubeAggregation) {
  if (values.length === 0) return null;
  if (aggregation === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (aggregation === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  if (aggregation === "count") return values.length;
  if (aggregation === "distinct") return new Set(values).size;
  return values.length === 1 ? values[0]! : null;
}

function measureLabel(cube: CubeResult, measureId: string) {
  return cube.schema.measures.find((measure) => measure.id === measureId)?.label ?? measureId;
}

function dimensionMemberLabel(cube: CubeResult, dimensionId: string, memberId: string) {
  return cube.schema.dimensions.find((dimension) => dimension.id === dimensionId)
    ?.members.find((member) => member.id === memberId)?.label ?? memberId;
}

export function compileCubeValueSeries(
  cube: CubeResult,
  binding: CubeChartBinding,
  valueSlot: CubeValueSlot = "value",
  seriesSlot: SemanticBindingSlot = "slice",
): CompiledCubeValueSeries {
  const errors: string[] = [];
  const value = valueSource(binding, valueSlot);
  if (!value) return { rows: [], errors: [`${valueSlot} must be bound to a Cube measure or measure set.`] };

  const measures = new Map(cube.schema.measures.map((measure) => [measure.id, measure]));
  const measureIds = selectedMeasureIds(value);
  measureIds.forEach((measureId) => {
    if (!measures.has(measureId)) errors.push(`Unknown Cube measure: ${measureId}.`);
  });
  if (errors.length > 0) return { rows: [], errors };

  const series = binding.slots[seriesSlot];
  if (series?.kind === "value-series" && value.kind !== "measure-set") {
    return { rows: [], errors: [`${seriesSlot} can use value-series only when ${valueSlot} is a measure set.`] };
  }
  if (series?.kind === "dimension" && !cube.schema.dimensions.some((dimension) => dimension.id === series.dimensionId)) {
    return { rows: [], errors: [`Unknown Cube dimension: ${series.dimensionId}.`] };
  }

  const dimensionSelections = Object.values(binding.slots)
    .filter((source): source is CubeDimensionSelection => source?.kind === "dimension");
  const selectionFilters: CubeFilter[] = dimensionSelections.flatMap((selection) => selection.memberIds?.length
    ? [{ kind: "members", dimensionId: selection.dimensionId, memberIds: selection.memberIds, mode: "include" } as const]
    : []);
  const cells = cube.cells.filter((cell) => matchesFilters(cell, [...(binding.filters ?? []), ...selectionFilters]));

  type PendingValue = { value: number; cell: CubeCell; measureId: string };
  const groups = new Map<string, {
    seriesKey: string;
    styleKey: string;
    measureId: string;
    dimensionId?: string;
    memberId?: string;
    values: PendingValue[];
  }>();

  cells.forEach((cell) => measureIds.forEach((measureId) => {
    const numeric = cell.values[measureId];
    if (numeric === null || !Number.isFinite(numeric)) return;
    let seriesKey = value.kind === "measure-set" ? measureLabel(cube, measureId) : measureLabel(cube, measureId);
    let styleKey = cubeMeasureStyleKey(measureId);
    let dimensionId: string | undefined;
    let memberId: string | undefined;
    if (series?.kind === "dimension") {
      dimensionId = series.dimensionId;
      memberId = cell.coordinates[dimensionId] ?? "";
      if (!memberId) return;
      const memberLabel = dimensionMemberLabel(cube, dimensionId, memberId);
      seriesKey = value.kind === "measure-set" ? `${measureLabel(cube, measureId)} / ${memberLabel}` : memberLabel;
      styleKey = value.kind === "measure-set"
        ? `${cubeMeasureStyleKey(measureId)}|${cubeDimensionStyleKey(dimensionId, memberId)}`
        : cubeDimensionStyleKey(dimensionId, memberId);
    } else if (series?.kind === "value-series") {
      seriesKey = measureLabel(cube, measureId);
      styleKey = cubeMeasureStyleKey(measureId);
    }
    const groupKey = `${measureId}\u001f${dimensionId ?? ""}\u001f${memberId ?? seriesKey}`;
    const group = groups.get(groupKey) ?? { seriesKey, styleKey, measureId, dimensionId, memberId, values: [] };
    group.values.push({ value: numeric as number, cell, measureId });
    groups.set(groupKey, group);
  }));

  const rows = Array.from(groups.values()).flatMap((group) => {
    const measure = measures.get(group.measureId)!;
    const aggregation = binding.aggregation?.[group.measureId] ?? measure.aggregation.default;
    if (aggregation === "sum" && measure.aggregation.additivity === "non-additive" && group.values.length > 1) {
      errors.push(`${measure.label} is non-additive and cannot be summed across ${group.values.length} cells.`);
      return [];
    }
    if (aggregation === "sum" && measure.aggregation.additivity === "semi-additive") {
      const invalidDimension = measure.aggregation.nonAdditiveDimensionIds?.find((dimensionId) =>
        new Set(group.values.map((item) => item.cell.coordinates[dimensionId] ?? "")).size > 1,
      );
      if (invalidDimension) {
        errors.push(`${measure.label} cannot be summed across ${invalidDimension}.`);
        return [];
      }
    }
    const aggregated = aggregateValues(group.values.map((item) => item.value), aggregation);
    if (aggregated === null) {
      errors.push(`${measure.label} requires an aggregation for ${group.values.length} cells.`);
      return [];
    }
    return [{
      seriesKey: group.seriesKey,
      styleKey: group.styleKey,
      value: aggregated,
      measureId: group.measureId,
      dimensionId: group.dimensionId,
      memberId: group.memberId,
      sourceCount: group.values.length,
    }];
  });

  return { rows, errors };
}

export function createMeasureSetBinding(
  cube: CubeResult,
  measureIds: string[],
  aggregation?: CubeAggregation,
  valueSlot: CubeValueSlot = "value",
): CubeChartBinding {
  const selected = Array.from(new Set(measureIds));
  const binding: CubeChartBinding = {
    version: 1,
    sourceId: cube.schema.id,
    slots: {
      [valueSlot]: selected.length === 1
        ? { kind: "measure", measureId: selected[0]! }
        : { kind: "measure-set", measureIds: selected },
      ...(selected.length > 1 ? { slice: { kind: "value-series" as const, valueSlot } } : {}),
    },
    unresolvedDimensions: cube.schema.dimensions.map((dimension) => ({ dimensionId: dimension.id, policy: "rollup" })),
  };
  if (aggregation) binding.aggregation = Object.fromEntries(selected.map((measureId) => [measureId, aggregation]));
  return binding;
}

export function createMeasureBreakdownBinding(
  cube: CubeResult,
  measureId: string,
  dimensionId: string,
  memberIds?: string[],
  aggregation?: CubeAggregation,
): CubeChartBinding {
  const binding: CubeChartBinding = {
    version: 1,
    sourceId: cube.schema.id,
    slots: {
      value: { kind: "measure", measureId },
      slice: { kind: "dimension", dimensionId, memberIds: memberIds ? [...memberIds] : undefined },
    },
    unresolvedDimensions: cube.schema.dimensions
      .filter((dimension) => dimension.id !== dimensionId)
      .map((dimension) => ({ dimensionId: dimension.id, policy: "rollup" })),
  };
  if (aggregation) binding.aggregation = { [measureId]: aggregation };
  return binding;
}

export function bindCubeSourceToSlot(
  cube: CubeResult,
  current: CubeChartBinding | undefined,
  slot: SemanticBindingSlot,
  source: CubeDimensionSelection | CubeValueSelection,
  aggregation?: CubeAggregation,
): CubeChartBinding {
  const base: CubeChartBinding = current?.sourceId === cube.schema.id
    ? cloneCubeChartBinding(current)!
    : { version: 1, sourceId: cube.schema.id, slots: {} };
  const normalizedSource: CubeDimensionSelection | CubeValueSelection = source.kind === "dimension"
    ? { ...source, memberIds: source.memberIds ? Array.from(new Set(source.memberIds)) : undefined }
    : source.kind === "measure-set" && new Set(source.measureIds).size === 1
      ? { kind: "measure", measureId: Array.from(new Set(source.measureIds))[0]! }
      : source.kind === "measure-set"
        ? { ...source, measureIds: Array.from(new Set(source.measureIds)) }
        : { ...source };
  base.slots[slot] = normalizedSource;

  const referencedMeasureIds = new Set(Object.values(base.slots).flatMap((item) => {
    if (item?.kind === "measure") return [item.measureId];
    if (item?.kind === "measure-set") return item.measureIds;
    return [];
  }));
  if (base.aggregation) {
    base.aggregation = Object.fromEntries(
      Object.entries(base.aggregation).filter(([measureId]) => referencedMeasureIds.has(measureId)),
    );
    if (Object.keys(base.aggregation).length === 0) delete base.aggregation;
  }

  const boundDimensionIds = new Set(Object.values(base.slots).flatMap((item) =>
    item?.kind === "dimension" ? [item.dimensionId] : [],
  ));
  base.unresolvedDimensions = cube.schema.dimensions
    .filter((dimension) => !boundDimensionIds.has(dimension.id))
    .map((dimension) => ({ dimensionId: dimension.id, policy: "rollup" as const }));

  if (aggregation && (normalizedSource.kind === "measure" || normalizedSource.kind === "measure-set")) {
    const measureIds = normalizedSource.kind === "measure"
      ? [normalizedSource.measureId]
      : normalizedSource.measureIds;
    base.aggregation = {
      ...base.aggregation,
      ...Object.fromEntries(measureIds.map((measureId) => [measureId, aggregation])),
    };
  }
  return base;
}

export function unbindCubeSlot(
  cube: CubeResult,
  current: CubeChartBinding | undefined,
  slot: SemanticBindingSlot,
) {
  if (!current || current.sourceId !== cube.schema.id || !current.slots[slot]) return current;
  const binding = cloneCubeChartBinding(current)!;
  delete binding.slots[slot];
  const referencedMeasureIds = new Set(Object.values(binding.slots).flatMap((item) => {
    if (item?.kind === "measure") return [item.measureId];
    if (item?.kind === "measure-set") return item.measureIds;
    return [];
  }));
  if (binding.aggregation) {
    binding.aggregation = Object.fromEntries(
      Object.entries(binding.aggregation).filter(([measureId]) => referencedMeasureIds.has(measureId)),
    );
    if (Object.keys(binding.aggregation).length === 0) delete binding.aggregation;
  }
  const boundDimensionIds = new Set(Object.values(binding.slots).flatMap((item) =>
    item?.kind === "dimension" ? [item.dimensionId] : [],
  ));
  binding.unresolvedDimensions = cube.schema.dimensions
    .filter((dimension) => !boundDimensionIds.has(dimension.id))
    .map((dimension) => ({ dimensionId: dimension.id, policy: "rollup" as const }));
  return binding;
}

function sourceSummary(cube: CubeResult, source: CubeBindingSource | undefined) {
  if (!source) return "";
  if (source.kind === "measure") return measureLabel(cube, source.measureId);
  if (source.kind === "measure-set") return source.measureIds.map((measureId) => measureLabel(cube, measureId)).join(", ");
  if (source.kind === "value-series") return "selected measures";
  const dimension = cube.schema.dimensions.find((item) => item.id === source.dimensionId);
  const label = dimension?.label ?? source.dimensionId;
  if (!source.memberIds?.length) return label;
  const members = source.memberIds.map((memberId) => dimensionMemberLabel(cube, source.dimensionId, memberId));
  return `${label}: ${members.join(", ")}`;
}

export function summarizeCubeBinding(
  cube: CubeResult,
  binding: CubeChartBinding | undefined,
  template: ChartTemplateKind | null,
) {
  if (!binding || binding.sourceId !== cube.schema.id || !template) return "";
  const slots = binding.slots;
  if (template === "pie" || template === "donut") {
    const theta = sourceSummary(cube, slots.theta ?? slots.value);
    const radius = sourceSummary(cube, slots.radius);
    const slice = sourceSummary(cube, slots.slice);
    const ring = template === "donut" ? sourceSummary(cube, slots.ring) : "";
    return [
      theta ? `theta ${theta}` : "",
      radius ? `radius ${radius}` : "",
      slice ? `by ${slice}` : "",
      ring ? `rings by ${ring}` : "",
    ].filter(Boolean).join(", ");
  }
  if (template === "bar") {
    const value = sourceSummary(cube, slots.value);
    const category = sourceSummary(cube, slots.category);
    const breakdown = sourceSummary(cube, slots.group ?? slots.segment);
    return [value, category ? `by ${category}` : "", breakdown ? `split by ${breakdown}` : ""].filter(Boolean).join(", ");
  }
  if (template === "matrix") {
    const cell = sourceSummary(cube, slots.cell);
    const row = sourceSummary(cube, slots.row);
    const column = sourceSummary(cube, slots.column);
    return [cell, row && column ? `by ${row} x ${column}` : row || column].filter(Boolean).join(", ");
  }
  const x = sourceSummary(cube, slots.x);
  const y = sourceSummary(cube, slots.y);
  const series = sourceSummary(cube, slots.series);
  const relation = template === "line" ? "over" : "by";
  return [y, x ? `${relation} ${x}` : "", series ? `split by ${series}` : ""].filter(Boolean).join(", ");
}

export function cubeBindingMeasureIds(binding: CubeChartBinding | undefined, slot: CubeValueSlot = "value") {
  const source = binding ? valueSource(binding, slot) : null;
  return source ? selectedMeasureIds(source) : [];
}

export function cubeBindingMatchesResult(binding: {
  kind: "dimension";
  dimensionId: string;
  memberIds: string[];
} | {
  kind: "measure-set";
  measureIds: string[];
}, cube: CubeResult) {
  if (binding.kind === "dimension") {
    const dimension = cube.schema.dimensions.find((item) => item.id === binding.dimensionId);
    return !!dimension && binding.memberIds.every((memberId) => dimension.members.some((member) => member.id === memberId));
  }
  return binding.measureIds.length > 0
    && binding.measureIds.every((measureId) => cube.schema.measures.some((measure) => measure.id === measureId));
}

export function cubeSeriesColor(binding: CubeChartBinding | undefined, styleKey: string) {
  return binding?.visualMappings?.color?.memberStyles?.[styleKey]?.color;
}

export function withCubeSeriesColor(binding: CubeChartBinding, styleKey: string, color: string): CubeChartBinding {
  return {
    ...binding,
    slots: { ...binding.slots },
    visualMappings: {
      ...binding.visualMappings,
      color: {
        ...binding.visualMappings?.color,
        sourceSlot: binding.visualMappings?.color?.sourceSlot ?? "slice",
        memberStyles: {
          ...binding.visualMappings?.color?.memberStyles,
          [styleKey]: { color },
        },
      },
    },
  };
}

export function cloneCubeChartBinding(binding: CubeChartBinding | undefined) {
  if (!binding) return undefined;
  return {
    ...binding,
    slots: Object.fromEntries(Object.entries(binding.slots).map(([slot, source]) => [
      slot,
      source
        ? {
          ...source,
          ...(source.kind === "dimension" && source.memberIds ? { memberIds: [...source.memberIds] } : {}),
          ...(source.kind === "measure-set" ? { measureIds: [...source.measureIds] } : {}),
        }
        : source,
    ])) as CubeChartBinding["slots"],
    filters: binding.filters?.map((filter) => ({
      ...filter,
      ...(filter.kind === "members" ? { memberIds: [...filter.memberIds] } : {}),
    })),
    aggregation: binding.aggregation ? { ...binding.aggregation } : undefined,
    visualMappings: binding.visualMappings
      ? {
        color: binding.visualMappings.color
          ? {
            ...binding.visualMappings.color,
            memberStyles: binding.visualMappings.color.memberStyles
              ? Object.fromEntries(Object.entries(binding.visualMappings.color.memberStyles).map(([key, style]) => [key, { ...style }]))
              : undefined,
          }
          : undefined,
        size: binding.visualMappings.size ? { ...binding.visualMappings.size } : undefined,
        shape: binding.visualMappings.shape ? { ...binding.visualMappings.shape } : undefined,
      }
      : undefined,
    unresolvedDimensions: binding.unresolvedDimensions?.map((dimension) => ({ ...dimension })),
  } satisfies CubeChartBinding;
}
