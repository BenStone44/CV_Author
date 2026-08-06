import { profileDatasetDimensions, scoreSeriesFields } from "./dimensionInference";
import type { ChartSpec, Dataset, SeriesCandidate } from "./types";

export function scoreSeriesCandidates(dataset: Dataset, chartSpec: ChartSpec): SeriesCandidate[] {
  const xEncoding = chartSpec.encodings.x;
  if (!xEncoding) return [];
  return scoreSeriesFields(
    dataset,
    xEncoding,
    chartSpec.encodings.y,
    profileDatasetDimensions(dataset),
  );
}
