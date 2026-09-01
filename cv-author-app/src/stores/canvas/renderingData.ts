import type {
  ChartScaleSpec,
  ChartSpec,
  DataColumnType,
} from "../../types";

export function mergeSharedScale(
  scales: ChartScaleSpec[],
  ownerScale: ChartScaleSpec,
  encodingType: DataColumnType,
): ChartScaleSpec {
  if (encodingType === "nominal") {
    return {
      ...ownerScale,
      type: "point",
      domain: Array.from(new Set(scales.flatMap((scale) =>
        (scale.domain as Array<string | number>).map(String)
      ))),
    };
  }
  if (encodingType === "temporal") {
    const values = scales
      .flatMap((scale) => scale.domain as Array<string | number>)
      .map((value) => Date.parse(String(value)))
      .filter(Number.isFinite);
    if (values.length === 0) return { ...ownerScale, type: "utc" };
    return {
      ...ownerScale,
      type: "utc",
      domain: [new Date(Math.min(...values)).toISOString(), new Date(Math.max(...values)).toISOString()],
    };
  }
  const values = scales.flatMap((scale) => scale.domain as number[]).filter(Number.isFinite);
  if (values.length === 0) return ownerScale;
  return { ...ownerScale, type: "linear", domain: [Math.min(...values), Math.max(...values)], nice: true };
}

export function chartDataPreparationKey(spec: ChartSpec) {
  const {
    scales: _scales,
    plotArea: _plotArea,
    selectionBounds: _selectionBounds,
    polarArea: _polarArea,
    styleTokens: _styleTokens,
    renderer: _renderer,
    autoAggregations: _autoAggregations,
    dimensionRecommendations: _dimensionRecommendations,
    markGroups,
    ...dataSpec
  } = spec;
  return JSON.stringify({
    ...dataSpec,
    markGroups: markGroups?.map((group) => ({
      id: group.id,
      chartId: group.chartId,
      role: group.role,
      memberKeys: group.memberKeys,
      seriesField: group.seriesField,
      allowOverrides: group.allowOverrides,
    })),
  });
}
