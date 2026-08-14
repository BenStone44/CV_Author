export const CUBE_BINDING_MIME = "application/x-cv-author-cube-binding";

export type CubeDimension = "person" | "date" | "weight";

export type CubeBindingPayload = {
  dimension: CubeDimension;
  values: string[];
  aggregation?: "sum" | "avg";
};

export type CubeSelectionState = {
  selected: Record<CubeDimension, boolean>;
  values: Record<CubeDimension, string[]>;
  fields: Partial<Record<CubeDimension, string>>;
  aggregations: Record<CubeDimension, {
    enabled: boolean;
    operation: "sum" | "avg";
  }>;
};

let activeCubeBinding: CubeBindingPayload | null = null;

export function beginCubeBindingDrag(payload: CubeBindingPayload) {
  activeCubeBinding = {
    dimension: payload.dimension,
    values: [...payload.values],
    aggregation: payload.aggregation,
  };
  return JSON.stringify(activeCubeBinding);
}

export function endCubeBindingDrag() {
  activeCubeBinding = null;
}

export function getActiveCubeBinding() {
  return activeCubeBinding;
}

export function readCubeBinding(dataTransfer: DataTransfer | null) {
  const raw = dataTransfer?.getData(CUBE_BINDING_MIME);
  if (!raw) return activeCubeBinding;
  try {
    const parsed = JSON.parse(raw) as Partial<CubeBindingPayload>;
    if (
      (parsed.dimension === "person"
        || parsed.dimension === "date"
        || parsed.dimension === "weight")
      && Array.isArray(parsed.values)
      && parsed.values.every((value) => typeof value === "string")
      && (parsed.aggregation === undefined
        || parsed.aggregation === "sum"
        || parsed.aggregation === "avg")
    ) {
      return {
        dimension: parsed.dimension,
        values: Array.from(new Set(parsed.values)),
        aggregation: parsed.aggregation,
      } satisfies CubeBindingPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export function cubeSelectionForChartFields(fields: string[]) {
  const normalized = fields.map((field) => field.toLowerCase());
  return {
    person: normalized.some((field) => field === "person" || field.includes("person")),
    date: normalized.some((field) =>
      field === "date" || field === "time" || field.includes("date") || field.includes("time"),
    ),
    weight: fields.filter((field) => [
      "weight_kg",
      "water_kg",
      "fat_kg",
      "muscle_kg",
      "minerals_kg",
    ].includes(field)),
  };
}
