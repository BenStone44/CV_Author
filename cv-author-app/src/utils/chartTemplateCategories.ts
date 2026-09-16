import type { BlockFamilyId } from "../chart-blocks/model";
import { getChartBlockSpecification } from "../chart-blocks/registry";
import type { SvgCandidate } from "../types";

export type ChartTemplateCategory = {
  id: string;
  label: string;
  candidates: SvgCandidate[];
};

const familyDefinitions: ReadonlyArray<{ id: BlockFamilyId; label: string }> = [
  { id: "barchart", label: "Bar chart" },
  { id: "areachart", label: "Area chart" },
  { id: "point", label: "Point" },
  { id: "linechart", label: "Line chart" },
  { id: "radar", label: "Radar" },
  { id: "heatmap", label: "Heatmap" },
  { id: "arc", label: "Arc" },
  { id: "tree", label: "Tree" },
  { id: "network", label: "Network" },
  { id: "chord", label: "Chord" },
  { id: "sankey", label: "Sankey" },
  { id: "calendar", label: "Calendar" },
  { id: "boxplot", label: "Boxplot" },
  { id: "wordcloud", label: "Word cloud" },
  { id: "geographic-point", label: "Geographic point" },
  { id: "geographic-line", label: "Geographic line" },
  { id: "geographic-area", label: "Geographic area" },
];

export function groupChartTemplateCandidates(candidates: SvgCandidate[]): ChartTemplateCategory[] {
  const grouped = familyDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    candidates: candidates.filter((candidate) =>
      getChartBlockSpecification(candidate.chartType)?.families.includes(definition.id))
      .sort((left, right) => {
        const leftOrder = getChartBlockSpecification(left.chartType)?.catalog.familyOrder?.[definition.id]
          ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = getChartBlockSpecification(right.chartType)?.catalog.familyOrder?.[definition.id]
          ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      }),
  })).filter((category) => category.candidates.length);
  // Family membership is deliberately non-exclusive. Only candidates with no
  // registered family appear in Other.
  const matched = new Set(grouped.flatMap((category) => category.candidates.map((candidate) => candidate.id)));
  const remaining = candidates.filter((candidate) => !matched.has(candidate.id));
  return remaining.length
    ? [...grouped, { id: "other", label: "Other", candidates: remaining }]
    : grouped;
}
