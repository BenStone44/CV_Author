import { normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";

export type SemanticMarkIdentity = {
  role: string;
  categoryKey?: string;
  seriesKey?: string;
  rowKey?: string;
};

export type SemanticMarkMatch = {
  mode: "category" | "mark";
  canEnter: boolean;
};

export function resolveSemanticMarkMatch(
  chartType: string,
  level: "item" | "part",
  mark: SemanticMarkIdentity,
): SemanticMarkMatch {
  const variant = normalizeChartTemplate(chartType) === "bar"
    ? normalizeBarChartVariant(chartType)
    : null;
  const isCompositeBar = variant === "grouped"
    || variant === "stacked"
    || variant === "divergent-stacked";
  if (level === "item" && isCompositeBar && mark.role === "bar" && mark.categoryKey) {
    return { mode: "category", canEnter: true };
  }
  return { mode: "mark", canEnter: false };
}
