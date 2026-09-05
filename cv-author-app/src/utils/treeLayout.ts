import type { ChartEncoding, ChartSpec, CoordinateChannel, Dataset, EncodingChannel } from "../types";

export type CartesianTreeDirection = "right" | "left" | "down" | "up";

export function isCartesianTreeChart(chartType: string | null | undefined) {
  return chartType?.replace(/[\s_-]/g, "").toLowerCase() === "dendrogram";
}

export function isPolarTreeChart(chartType: string | null | undefined) {
  return chartType?.replace(/[\s_-]/g, "").toLowerCase() === "radialdendrogram";
}

export function isCoordinateTreeChart(chartType: string | null | undefined) {
  return isCartesianTreeChart(chartType) || isPolarTreeChart(chartType);
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

/** The only external coordinate channel a tree exposes for composition. */
export function coordinateTreeLeafAxis(spec: ChartSpec | null | undefined): CoordinateChannel | null {
  if (isCartesianTreeChart(spec?.chartType)) {
    return cartesianTreeLeafAxis(cartesianTreeDirection(spec));
  }
  if (isPolarTreeChart(spec?.chartType)) return "angle";
  return null;
}

/**
 * A tree leaf axis is categorical even when node keys happen to be numeric.
 * The source encoding supplies leaf identity/order, not a continuous measure.
 */
export function coordinateTreeLeafEncoding(spec: ChartSpec | null | undefined): ChartEncoding | undefined {
  if (isCartesianTreeChart(spec?.chartType)) {
    const encoding = spec?.encodings.category ?? spec?.encodings.key;
    return encoding ? { ...encoding, type: "nominal" } : undefined;
  }
  if (isPolarTreeChart(spec?.chartType)) {
    const encoding = spec?.encodings.theta ?? spec?.encodings.angle ?? spec?.encodings.key;
    return encoding ? { ...encoding, type: "nominal" } : undefined;
  }
  return undefined;
}

/**
 * Values represented by terminal nodes on a Cartesian dendrogram's leaf axis.
 * The axis uses the same ordering encoding as the renderer (category, then
 * key), while hierarchy membership is determined from key/parent links.
 */
export function cartesianTreeLeafValues(spec: ChartSpec | null | undefined, rows: Dataset["rows"] = []) {
  if (!isCartesianTreeChart(spec?.chartType)) return [];
  return coordinateTreeLeafValues(spec, rows);
}

/** Ordered values represented by terminal nodes on either tree coordinate system. */
export function coordinateTreeLeafValues(spec: ChartSpec | null | undefined, rows: Dataset["rows"] = []) {
  if (!isCoordinateTreeChart(spec?.chartType)) return [];
  const keyField = spec?.encodings.key?.field;
  const parentField = spec?.encodings.parent?.field;
  if (!keyField || !parentField) return [];
  const childKeys = new Set(rows
    .map((row) => row[parentField])
    .filter((value): value is string => value !== undefined && value !== "")
    .map(String));
  const orderField = isPolarTreeChart(spec?.chartType)
    ? spec?.encodings.theta?.field ?? spec?.encodings.angle?.field ?? keyField
    : spec?.encodings.category?.field ?? keyField;
  const values = rows
    .filter((row) => !childKeys.has(String(row[keyField] ?? "")))
    .map((row) => row[orderField] ?? row[keyField])
    .filter((value): value is string => value !== undefined && value !== "")
    .map(String);
  return Array.from(new Set(values));
}
