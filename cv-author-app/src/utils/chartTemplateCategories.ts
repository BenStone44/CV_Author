import type { SvgCandidate } from "../types";

export type ChartTemplateCategory = {
  id: string;
  label: string;
  candidates: SvgCandidate[];
};

const familyDefinitions: Array<{
  id: string;
  label: string;
  chartTypes: ReadonlySet<string>;
}> = [
  {
    id: "barchart",
    label: "Bar chart",
    chartTypes: new Set(["singlebarchart", "groupedbarchart", "stackedbarchart", "divergentbarchart", "divergentstackedbarchart"]),
  },
  {
    id: "linechart",
    label: "Line chart",
    chartTypes: new Set(["linegraph", "multilinechart"]),
  },
  {
    id: "areachart",
    label: "Area chart",
    chartTypes: new Set(["areachart", "stackedareachart", "streamgraph", "horizonchart"]),
  },
  { id: "point", label: "Point", chartTypes: new Set(["scatterplot"]) },
  { id: "heatmap", label: "Heatmap", chartTypes: new Set(["matrixdiagram", "contour", "hexbin"]) },
  { id: "arc", label: "Arc", chartTypes: new Set(["piechart", "donutchart"]) },
  { id: "chord", label: "Chord", chartTypes: new Set(["chord"]) },
  { id: "sankey", label: "Sankey", chartTypes: new Set(["sankey"]) },
  { id: "parallel-coordinates", label: "Parallel coordinates", chartTypes: new Set(["parallelcoordinatesplot"]) },
  { id: "tree", label: "Tree", chartTypes: new Set(["sunburst", "icicle", "treemap", "dendrogram"]) },
  { id: "calendar", label: "Calendar", chartTypes: new Set(["calendar"]) },
  { id: "boxplot", label: "Boxplot", chartTypes: new Set(["boxplot", "boxandwhisker"]) },
];

function normalizedChartType(chartType: string) {
  return chartType.replace(/[\s_-]/g, "").toLowerCase();
}

export function groupChartTemplateCandidates(candidates: SvgCandidate[]): ChartTemplateCategory[] {
  const grouped = familyDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    candidates: candidates.filter((candidate) => definition.chartTypes.has(normalizedChartType(candidate.chartType))),
  })).filter((category) => category.candidates.length);
  const assigned = new Set(grouped.flatMap((category) => category.candidates.map((candidate) => candidate.id)));
  const remaining = candidates.filter((candidate) => !assigned.has(candidate.id));
  return remaining.length
    ? [...grouped, { id: "other", label: "Other", candidates: remaining }]
    : grouped;
}
