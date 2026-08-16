import type { CubeResult } from "./cubeModel";

export const CUBE_BINDING_MIME = "application/x-cv-author-cube-binding";

export type CubeDimensionBindingPayload = {
  kind: "dimension";
  dimensionId: string;
  memberIds: string[];
  aggregation?: "sum" | "avg";
};

export type CubeMeasureSetBindingPayload = {
  kind: "measure-set";
  measureIds: string[];
  groupId?: string;
  aggregation?: "sum" | "avg";
};

export type CubeBindingPayload = CubeDimensionBindingPayload | CubeMeasureSetBindingPayload;

type LegacyCubeBindingPayload = {
  dimension: "person" | "date" | "weight";
  values: string[];
  aggregation?: "sum" | "avg";
};

export type CubeSelectionState = {
  selected: Record<string, boolean>;
  values: Record<string, string[]>;
  fields: Record<string, string>;
  aggregations: Record<string, {
    enabled: boolean;
    operation: "sum" | "avg";
  }>;
};

let activeCubeBinding: CubeBindingPayload | null = null;

function normalizeLegacyPayload(payload: LegacyCubeBindingPayload): CubeBindingPayload {
  if (payload.dimension === "weight") {
    return {
      kind: "measure-set",
      measureIds: Array.from(new Set(payload.values)),
      aggregation: payload.aggregation,
    };
  }
  return {
    kind: "dimension",
    dimensionId: payload.dimension,
    memberIds: Array.from(new Set(payload.values)),
    aggregation: payload.aggregation,
  };
}

export function beginCubeBindingDrag(payload: CubeBindingPayload | LegacyCubeBindingPayload) {
  const normalized = "kind" in payload ? payload : normalizeLegacyPayload(payload);
  activeCubeBinding = normalized.kind === "dimension"
    ? { ...normalized, memberIds: [...normalized.memberIds] }
    : { ...normalized, measureIds: [...normalized.measureIds] };
  return JSON.stringify(activeCubeBinding);
}

export function endCubeBindingDrag() {
  activeCubeBinding = null;
}

export function getActiveCubeBinding() {
  return activeCubeBinding;
}

function parsePayload(value: unknown): CubeBindingPayload | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<CubeBindingPayload> & Partial<LegacyCubeBindingPayload>;
  if (parsed.kind === "dimension"
    && typeof parsed.dimensionId === "string"
    && Array.isArray(parsed.memberIds)
    && parsed.memberIds.every((member) => typeof member === "string")) {
    return {
      kind: "dimension",
      dimensionId: parsed.dimensionId,
      memberIds: Array.from(new Set(parsed.memberIds)),
      aggregation: parsed.aggregation === "avg" ? "avg" : parsed.aggregation === "sum" ? "sum" : undefined,
    };
  }
  if (parsed.kind === "measure-set"
    && Array.isArray(parsed.measureIds)
    && parsed.measureIds.every((measure) => typeof measure === "string")) {
    return {
      kind: "measure-set",
      measureIds: Array.from(new Set(parsed.measureIds)),
      groupId: typeof parsed.groupId === "string" ? parsed.groupId : undefined,
      aggregation: parsed.aggregation === "avg" ? "avg" : parsed.aggregation === "sum" ? "sum" : undefined,
    };
  }
  if ((parsed.dimension === "person" || parsed.dimension === "date" || parsed.dimension === "weight")
    && Array.isArray(parsed.values)
    && parsed.values.every((value) => typeof value === "string")) {
    return normalizeLegacyPayload({
      dimension: parsed.dimension,
      values: parsed.values,
      aggregation: parsed.aggregation === "avg" ? "avg" : parsed.aggregation === "sum" ? "sum" : undefined,
    });
  }
  return null;
}

export function readCubeBinding(dataTransfer: DataTransfer | null) {
  const raw = dataTransfer?.getData(CUBE_BINDING_MIME);
  if (!raw) return activeCubeBinding;
  try {
    return parsePayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Projects chart fields onto the dynamic Cube explorer. The optional CubeResult
 * is used for new data; the legacy fallback keeps old saved charts readable.
 */
export function cubeSelectionForChartFields(fields: string[], cube?: CubeResult): CubeSelectionState {
  if (cube) {
    const selectedFields = new Set(fields);
    const dimensions = Object.fromEntries(cube.schema.dimensions.map((dimension) => [
      dimension.id,
      {
        selected: selectedFields.has(dimension.id),
        values: dimension.members.filter((member) => selectedFields.has(member.id)).map((member) => member.id),
      },
    ]));
    const measures = cube.schema.measures.filter((measure) => selectedFields.has(measure.id)).map((measure) => measure.id);
    return {
      selected: Object.fromEntries([
        ...Object.entries(dimensions).map(([id, value]) => [id, value.selected]),
        ["__measures__", measures.length > 0],
      ]),
      values: Object.fromEntries([
        ...Object.entries(dimensions).map(([id, value]) => [id, value.values]),
        ["__measures__", measures],
      ]),
      fields: Object.fromEntries(cube.schema.dimensions.map((dimension) => [dimension.id, dimension.id])),
      aggregations: Object.fromEntries([
        ...cube.schema.dimensions.map((dimension) => [dimension.id, { enabled: false, operation: "sum" as const }]),
        ["__measures__", { enabled: false, operation: "sum" as const }],
      ]),
    };
  }
  const normalized = fields.map((field) => field.toLowerCase());
  const weightFields = fields.filter((field) => [
    "weight_kg",
    "water_kg",
    "fat_kg",
    "muscle_kg",
    "minerals_kg",
  ].includes(field));
  return {
    selected: {
      person: normalized.some((field) => field === "person" || field.includes("person")),
      date: normalized.some((field) => field === "date" || field === "time" || field.includes("date") || field.includes("time")),
      weight: weightFields.length > 0,
    },
    values: {
      person: [],
      date: [],
      weight: weightFields,
    },
    fields: { person: "person", date: "date" },
    aggregations: {
      person: { enabled: false, operation: "sum" },
      date: { enabled: false, operation: "sum" },
      weight: { enabled: false, operation: "sum" },
    },
  };
}

export function cubeBindingMatchesResult(binding: CubeBindingPayload, cube: CubeResult) {
  if (binding.kind === "dimension") {
    const dimension = cube.schema.dimensions.find((item) => item.id === binding.dimensionId);
    return !!dimension && binding.memberIds.every((memberId) => dimension.members.some((member) => member.id === memberId));
  }
  return binding.measureIds.length > 0 && binding.measureIds.every((measureId) => cube.schema.measures.some((measure) => measure.id === measureId));
}
