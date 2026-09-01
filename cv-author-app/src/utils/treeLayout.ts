import type { ChartSpec, Dataset, EncodingChannel } from "../types";

export type CartesianTreeDirection = "right" | "left" | "down" | "up";

export function isCartesianTreeChart(chartType: string | null | undefined) {
  return chartType?.replace(/[\s_-]/g, "").toLowerCase() === "dendrogram";
}

/** Hierarchy renderers that expose the same four-way growth direction control. */
export function isDirectionalHierarchyChart(chartType: string | null | undefined) {
  const normalized = chartType?.replace(/[\s_-]/g, "").toLowerCase();
  return normalized === "dendrogram" || normalized === "icicle" || normalized === "treemap";
}

export function normalizeCartesianTreeDirection(value: unknown): CartesianTreeDirection {
  return value === "left" || value === "down" || value === "up" ? value : "right";
}

export function cartesianTreeDirection(spec: ChartSpec | null | undefined) {
  const config = spec?.markGroups?.find((group) => group.role === "node")?.sharedConfig
    ?? spec?.markGroups?.[0]?.sharedConfig;
  return normalizeCartesianTreeDirection(config?.treeDirection);
}

export function cartesianTreeLeafAxis(direction: CartesianTreeDirection): EncodingChannel {
  return direction === "left" || direction === "right" ? "y" : "x";
}

/**
 * Values represented by terminal nodes on a Cartesian dendrogram's leaf axis.
 * The axis uses the same ordering encoding as the renderer (category, then
 * key), while hierarchy membership is determined from key/parent links.
 */
export function cartesianTreeLeafValues(spec: ChartSpec | null | undefined, rows: Dataset["rows"] = []) {
  if (!isCartesianTreeChart(spec?.chartType)) return [];
  const keyField = spec?.encodings.key?.field;
  const parentField = spec?.encodings.parent?.field;
  if (!keyField || !parentField) return [];
  const childKeys = new Set(rows
    .map((row) => row[parentField])
    .filter((value): value is string => value !== undefined && value !== "")
    .map(String));
  const orderField = spec?.encodings.category?.field ?? keyField;
  const values = rows
    .filter((row) => !childKeys.has(String(row[keyField] ?? "")))
    .map((row) => row[orderField] ?? row[keyField])
    .filter((value): value is string => value !== undefined && value !== "")
    .map(String);
  return Array.from(new Set(values));
}
