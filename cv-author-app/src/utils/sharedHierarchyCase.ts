import type { ChartSpec } from "../types";
import chartSpecs from "../../public/site/gallery/cases/shared-hierarchy/chart-specs.json";

export const SHARED_HIERARCHY_CASE_ID = "sunburst-radial-dendrogram-shared-r";

/** Instantiate the case-owned chart definitions with live editor IDs. */
export function sharedHierarchyChartSpec(chartType: "Sunburst" | "RadialDendrogram", datasetId: string, chartId: string): ChartSpec {
  const spec = structuredClone(chartSpecs[chartType]) as unknown as ChartSpec;
  spec.datasetId = datasetId;
  spec.markGroups?.forEach((group) => { group.id = `mark-group:${chartId}:${group.role}`; group.chartId = chartId; });
  return spec;
}
