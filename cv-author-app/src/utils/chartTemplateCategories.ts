import type { SvgCandidate } from "../types";
import { getGeographicLayerFamily } from "./geographicLayerCards";

export type ChartTemplateCategory = {
  id: string;
  label: string;
  candidates: SvgCandidate[];
};

const familyDefinitions: Array<{
  id: string;
  label: string;
  chartTypes: ReadonlySet<string>;
  matches?: (candidate: SvgCandidate) => boolean;
}> = [
  {
    id: "barchart",
    label: "Bar chart",
    chartTypes: new Set(["singlebarchart", "groupedbarchart", "stackedbarchart", "divergentbarchart", "divergentstackedbarchart", "radialbarchart"]),
  },
  {
    id: "areachart",
    label: "Area chart",
    chartTypes: new Set(["areachart", "stackedareachart", "streamgraph", "horizonchart"]),
  },
  { id: "point", label: "Point", chartTypes: new Set(["scatterplot", "hexbin"]) },
  {
    id: "linechart",
    label: "Line chart",
    chartTypes: new Set(["linegraph", "multilinechart", "parallelcoordinatesplot"]),
  },

  { id: "heatmap", label: "Heatmap", chartTypes: new Set(["matrixdiagram", "contour", "hexbin"]) },
  { id: "arc", label: "Arc", chartTypes: new Set(["piechart", "donutchart", "radialbarchart"]) },
  { id: "tree", label: "Tree", chartTypes: new Set(["sunburst", "icicle", "treemap", "dendrogram", "radialdendrogram"]) },
  { id: "network", label: "Network", chartTypes: new Set(["forcedirectedgraph", "graphlink", "graphlinkpolar"]) },

  { id: "chord", label: "Chord", chartTypes: new Set(["chord"]) },
  { id: "sankey", label: "Sankey", chartTypes: new Set(["sankey"]) },

  { id: "calendar", label: "Calendar", chartTypes: new Set(["calendar"]) },
  { id: "boxplot", label: "Boxplot", chartTypes: new Set(["boxplot", "boxandwhisker"]) },
  {
    id: "geographic-point",
    label: "Geographic point",
    chartTypes: new Set(),
    matches: (candidate) => candidate.coordinateSystem === "Geographic"
      && getGeographicLayerFamily(candidate.layerType ?? candidate.chartType) === "point",
  },
  {
    id: "geographic-line",
    label: "Geographic line",
    chartTypes: new Set(),
    matches: (candidate) => candidate.coordinateSystem === "Geographic"
      && getGeographicLayerFamily(candidate.layerType ?? candidate.chartType) === "line",
  },
  {
    id: "geographic-area",
    label: "Geographic area",
    chartTypes: new Set(),
    matches: (candidate) => candidate.coordinateSystem === "Geographic"
      && getGeographicLayerFamily(candidate.layerType ?? candidate.chartType) === "area",
  },
];

function normalizedChartType(chartType: string) {
  return chartType.replace(/[\s_-]/g, "").toLowerCase();
}

export function groupChartTemplateCandidates(candidates: SvgCandidate[]): ChartTemplateCategory[] {
  const grouped = familyDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    candidates: candidates
      .filter((candidate) => definition.matches?.(candidate) ?? definition.chartTypes.has(normalizedChartType(candidate.chartType)))
      .sort((left, right) => {
        const order = [...definition.chartTypes];
        return order.indexOf(normalizedChartType(left.chartType)) - order.indexOf(normalizedChartType(right.chartType));
      }),
  })).filter((category) => category.candidates.length);
  // A candidate can belong to several families; only unmatched candidates go to Other.
  const matched = new Set(grouped.flatMap((category) => category.candidates.map((candidate) => candidate.id)));
  const remaining = candidates.filter((candidate) => !matched.has(candidate.id));
  return remaining.length
    ? [...grouped, { id: "other", label: "Other", candidates: remaining }]
    : grouped;
}
