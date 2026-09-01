import type { ChartSpec, EncodingChannel } from "../types";

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
