import type { CoordinateSystem, SvgCandidate } from "./types";

export type ChartTemplateCategory = {
  id: string;
  label: string;
  candidates: SvgCandidate[];
};

const categoryDefinitions: Array<{
  id: CoordinateSystem;
  label: string;
}> = [
  { id: "Cartesian", label: "Cartesian" },
  { id: "Polar", label: "Polar" },
  { id: "Geographic", label: "Geographic" },
  { id: "CoordinateFree", label: "Coordinate Free" },
];

export function groupChartTemplateCandidates(candidates: SvgCandidate[]): ChartTemplateCategory[] {
  const grouped = categoryDefinitions.map((definition) => ({
    id: definition.id.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
    label: definition.label,
    candidates: candidates.filter((candidate) => candidate.coordinateSystem === definition.id),
  })).filter((category) => category.candidates.length);
  const assigned = new Set(grouped.flatMap((category) => category.candidates.map((candidate) => candidate.id)));
  const remaining = candidates.filter((candidate) => !assigned.has(candidate.id));
  return remaining.length
    ? [...grouped, { id: "other", label: "Other", candidates: remaining }]
    : grouped;
}
