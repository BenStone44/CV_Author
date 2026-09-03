import { extent } from "d3-array";
import { scaleLinear, scaleLog, scalePoint, scaleUtc } from "d3-scale";
import { arc, pie } from "d3-shape";
import type { CartesianCoordinateGuide, ChartEncoding, ChartSpec, Dataset, LayerSpec, NestedChildFrame, NestedSpec, ChartPlotArea, ChartPolarArea, ChartScaleSpec, CoordinateGuide, MarkGroupSharedConfig } from "../types";
import { renderLineChart, type LineRenderInput } from "./lineRenderer";
import { cartesianAxisEncoding, normalizeBarChartVariant, normalizeChartTemplate, physicalCartesianAxisEncoding } from "./chartTemplates";
import { getChartContract, type ChartRendererKey } from "./chartContracts";
import { resolvedPolarRadiusMode } from "./encodingConfig";
import {
  defaultColorMapping,
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  isSeriesStyleMapping,
  mapColorValue,
  mapSizeValue,
  parseVisualValue,
  visualDomain,
} from "./visualMapping";
import { renderAdvancedChart } from "./advancedRenderer";
import { csvRowKey } from "./csvDataEngine";
import { chartAxisVisible } from "./chartAxes";
import { materializeGraphDataset } from "./chartDataPipeline";
import { adaptiveLabel } from "./adaptiveLabels";
import { globalPalette } from "../config/global";

const POLAR_CONCAT_SEAM_RATIO = 0.06;

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function key(dataset: Dataset, row: Record<string, string>, rowIndex?: number) {
  return csvRowKey(dataset, row, rowIndex);
}

function numericFieldValues(rows: Dataset["rows"], field: string) {
  return rows.flatMap((row) => {
    const rawValue = row[field];
    if (rawValue === undefined || rawValue.trim() === "") return [];
    const value = Number(rawValue);
    return Number.isFinite(value) ? [value] : [];
  });
}

function scalesFromSpec(spec: ChartSpec) {
  const x = spec.scales?.x;
  const y = spec.scales?.y;
  if (!x || !y) return null;
  const xScale = chartScalePosition(x);
  const yScale = chartScalePosition(y);
  return { xScale, yScale, plotArea: spec.plotArea as ChartPlotArea };
}

const palette = globalPalette.categorical;

function groupConfig(spec: ChartSpec, role: string) {
  return spec.markGroups?.find((group) => group.role === role)?.sharedConfig ?? {};
}

function visualColor(
  row: Dataset["rows"][number],
  encoding: ChartEncoding | undefined,
  domain: [number, number] | null,
  config: MarkGroupSharedConfig,
  fallback: string,
) {
  const mapping = isLinearColorMapping(config.colorMapping)
    ? config.colorMapping
    : defaultColorMapping;
  if (encoding && domain && encoding.type !== "nominal" && encoding.type !== "ordinal" && isLinearColorMapping(mapping)) {
    const value = parseVisualValue(row[encoding.field] ?? "", encoding);
    if (value !== null) return mapColorValue(value, domain, mapping);
  }
  return typeof config.color === "string" ? config.color : fallback;
}

function visualSize(
  row: Dataset["rows"][number],
  encoding: ChartEncoding | undefined,
  domain: [number, number] | null,
  config: MarkGroupSharedConfig,
  fallback: number,
) {
  const mapping = config.sizeMapping;
  if (encoding && domain && isLinearSizeMapping(mapping)) {
    const value = parseVisualValue(row[encoding.field] ?? "", encoding);
    if (value !== null) return mapSizeValue(value, domain, mapping);
  }
  return typeof config.size === "number" ? config.size : fallback;
}

function aggregateEncodingRow(
  rows: Dataset["rows"],
  spec: ChartSpec,
) {
  const representative = rows[0];
  if (!representative) return {};
  const row = { ...representative };
  Object.entries(spec.aggregations ?? {}).forEach(([channel, operation]) => {
    const encoding = spec.encodings[channel as keyof ChartSpec["encodings"]];
    if (!encoding || encoding.type !== "quantitative") return;
    const values = rows
      .map((source) => Number(source[encoding.field] ?? ""))
      .filter(Number.isFinite);
    if (values.length === 0) return;
    const total = values.reduce((sum, value) => sum + value, 0);
    row[encoding.field] = String(operation === "avg" ? total / values.length : total);
  });
  return row;
}

export function chartScalePosition(spec: ChartScaleSpec) {
  if (spec.type === "utc") {
    const scale = scaleUtc().domain((spec.domain as [string, string]).map((value) => new Date(value)) as [Date, Date]).range(spec.range);
    return (value: string) => scale(new Date(value));
  }
  if (spec.type === "point") {
    const scale = scalePoint<string>().domain(spec.domain as string[]).range(spec.range).padding(0.5);
    return (value: string) => scale(value) ?? 0;
  }
  const scale = (spec.type === "log" ? scaleLog() : scaleLinear()).domain(spec.domain as [number, number]).range(spec.range);
  return (value: string) => scale(Number(value));
}

function renderScatterChart(input: LineRenderInput) {
  const base = renderLineChart(input);
  const x = base.scales.x;
  const y = base.scales.y;
  const xEncoding = cartesianAxisEncoding(input.chartSpec, "x")!;
  const yEncoding = cartesianAxisEncoding(input.chartSpec, "y")!;
  const xPosition = chartScalePosition(x);
  const yPosition = chartScalePosition(y);
  const colorEncoding = input.chartSpec.encodings.color;
  const sizeEncoding = input.chartSpec.encodings.size;
  const colorField = colorEncoding?.field;
  const sizeField = sizeEncoding?.field;
  const colorValues = colorField
    ? Array.from(new Set(input.dataset.rows.map((row) => row[colorField] ?? "").filter(Boolean)))
    : [];
  const sizeValues = sizeField ? input.dataset.rows.map((row) => Number(row[sizeField] ?? "")).filter(Number.isFinite) : [];
  const sizeDomain = extent(sizeValues) as [number | undefined, number | undefined];
  const sizeScale = sizeDomain[0] === undefined || sizeDomain[1] === undefined
    ? () => 4
    : scaleLinear().domain(sizeDomain[0] === sizeDomain[1] ? [sizeDomain[0] - 1, sizeDomain[1] + 1] : sizeDomain as [number, number]).range([3, 9]);
  const config = groupConfig(input.chartSpec, "point");
  const seriesStyles = isSeriesStyleMapping(config.seriesStyleMapping)
    ? config.seriesStyleMapping.values
    : {};
  const legacySeriesColors = isCategoricalColorMapping(config.seriesColorMapping)
    ? config.seriesColorMapping.values
    : {};
  const colorDomain = visualDomain(input.dataset.rows, colorEncoding);
  const mappedSizeDomain = visualDomain(input.dataset.rows, sizeEncoding);
  const marks = input.dataset.rows.map((row, index) => {
    const xv = row[xEncoding.field] ?? "";
    const yv = row[yEncoding.field] ?? "";
    const swapped = input.chartSpec.axisSwapped === true;
    const cx = xPosition(swapped ? yv : xv);
    const cy = yPosition(swapped ? xv : yv);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return "";
    const rowKey = key(input.dataset, row) || String(index);
    const seriesKey = colorField ? row[colorField] ?? "" : input.chartSpec.series ? row[input.chartSpec.series.field] ?? "" : "";
    const colorIndex = colorField ? Math.max(0, colorValues.indexOf(seriesKey)) : 0;
    const radius = visualSize(
      row,
      sizeEncoding,
      mappedSizeDomain,
      config,
      sizeField ? sizeScale(Number(row[sizeField] ?? "")) : 4,
    );
    const color = seriesStyles[seriesKey]?.color
      ?? legacySeriesColors[seriesKey]
      ?? (colorEncoding?.type === "nominal" || colorEncoding?.type === "ordinal"
        ? palette[colorIndex % palette.length]!
        : visualColor(row, colorEncoding, colorDomain, config, palette[colorIndex % palette.length]!));
    return `<circle data-chart-id="${esc(input.chartId)}" data-mark-role="point" data-mark-group-id="mark-group:${esc(input.chartId)}:point" data-row-key="${esc(rowKey)}" data-series-key="${esc(seriesKey)}" cx="${cx}" cy="${cy}" r="${radius}" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 0.88)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const content = `<g data-chart-id="${esc(input.chartId)}" data-chart-type="scatter" data-renderer="deterministic-scatter-marks@1">${marks}</g>`;
  return { ...base, content };
}

type BarDatum = {
  category: string;
  series: string;
  value: number;
  rows: Dataset["rows"];
};

function barData(input: GenericRenderInput, xField: string, yField: string, seriesFields: string[]) {
  const rows = input.dataset.rows.flatMap((row) => {
    const category = row[xField] ?? "";
    const series = seriesFields.length > 0
      ? seriesFields.map((field) => row[field] ?? "").join(" / ")
      : "__single__";
    const value = Number(row[yField] ?? "");
    return category && series && Number.isFinite(value)
      ? [{ category, series, value, rows: [row] }]
      : [];
  });
  const hasAggregation = Object.keys(input.chartSpec.aggregations ?? {}).length > 0;
  if (!hasAggregation) return rows;
  const groups = new Map<string, BarDatum>();
  rows.forEach((datum) => {
    const groupKey = `${datum.category}\u0000${datum.series}`;
    const current = groups.get(groupKey);
    if (current) {
      current.value += datum.value;
      current.rows.push(...datum.rows);
    } else {
      groups.set(groupKey, { ...datum, rows: [...datum.rows] });
    }
  });
  const data = Array.from(groups.values());
  const yAggregation = input.chartSpec.aggregations?.y;
  if (yAggregation === "avg") data.forEach((datum) => { datum.value /= datum.rows.length; });
  return data;
}

function renderBarChart(input: GenericRenderInput) {
  if (input.chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase() === "radialbarchart") {
    return renderRadialBarChart(input);
  }
  const xEncoding = input.chartSpec.encodings.x;
  const yEncoding = input.chartSpec.encodings.y;
  if (!xEncoding || !yEncoding) throw new Error("Bar renderer requires both X and Y encodings.");
  if (yEncoding.type !== "quantitative") throw new Error("Bar renderer Y encoding must be quantitative.");
  const variant = normalizeBarChartVariant(input.chartSpec.chartType) ?? "single";
  const seriesEncodings = input.chartSpec.seriesFields?.length
    ? input.chartSpec.seriesFields
    : input.chartSpec.series
      ? [input.chartSpec.series]
      : input.chartSpec.encodings.color?.type === "nominal"
        || input.chartSpec.encodings.color?.type === "ordinal"
        ? [input.chartSpec.encodings.color]
        : [];
  const categoryValues = Array.from(new Set(input.dataset.rows.map((row) => row[xEncoding.field] ?? "").filter(Boolean)));
  const seriesValues = seriesEncodings.length > 0
    ? Array.from(new Set(input.dataset.rows.map((row) => seriesEncodings
      .map((encoding) => row[encoding.field] ?? "")
      .join(" / ")).filter(Boolean)))
    : ["__single__"];
  const data = barData(
    input,
    xEncoding.field,
    yEncoding.field,
    seriesEncodings.map((encoding) => encoding.field),
  );

  const fontSize = Math.max(9, Math.min(input.chartSpec.styleTokens?.fontSize ?? 11, Math.min(input.width, input.height) * 0.045));
  const leftMargin = Math.min(Math.max(fontSize * 4.8, input.width * 0.09), input.width * 0.28);
  const rightMargin = Math.min(Math.max(fontSize * 1.8, input.width * 0.035), input.width * 0.14);
  const topMargin = Math.min(Math.max(fontSize * 2, input.height * 0.07), input.height * 0.22);
  const bottomMargin = Math.min(Math.max(fontSize * 3.6, input.height * 0.14), input.height * 0.3);
  const basePlotArea: ChartPlotArea = {
    x: input.minX + leftMargin,
    y: input.minY + topMargin,
    width: Math.max(1, input.width - leftMargin - rightMargin),
    height: Math.max(1, input.height - topMargin - bottomMargin),
  };
  const guide = input.coordinateGuide?.type === "Cartesian" ? input.coordinateGuide : null;
  const xDiscreteSpacing = (input.chartSpec.axisSwapped ? yEncoding : xEncoding).type === "nominal"
    || (input.chartSpec.axisSwapped ? yEncoding : xEncoding).type === "ordinal"
    ? guide?.xDiscreteSpacing ?? 1
    : 1;
  const yDiscreteSpacing = (input.chartSpec.axisSwapped ? xEncoding : yEncoding).type === "nominal"
    || (input.chartSpec.axisSwapped ? xEncoding : yEncoding).type === "ordinal"
    ? guide?.yDiscreteSpacing ?? 1
    : 1;
  const scaledPlotWidth = Math.max(1, basePlotArea.width * (guide?.xScale ?? 1) * xDiscreteSpacing);
  const scaledPlotHeight = Math.max(1, basePlotArea.height * (guide?.yScale ?? 1) * yDiscreteSpacing);
  const plotArea: ChartPlotArea = input.sharedPlotArea ?? {
    x: guide?.xDirection === -1 ? basePlotArea.x + basePlotArea.width - scaledPlotWidth : basePlotArea.x,
    y: guide?.yDirection === 1 ? basePlotArea.y : basePlotArea.y + basePlotArea.height - scaledPlotHeight,
    width: scaledPlotWidth,
    height: scaledPlotHeight,
  };
  const xRange: [number, number] = input.sharedScales?.x?.range
    ?? (guide?.xDirection === -1
      ? [plotArea.x + plotArea.width, plotArea.x]
      : [plotArea.x, plotArea.x + plotArea.width]);
  const yRange: [number, number] = input.sharedScales?.y?.range
    ?? (guide?.yDirection === 1
      ? [plotArea.y, plotArea.y + plotArea.height]
      : [plotArea.y + plotArea.height, plotArea.y]);
  const isStacked = variant === "stacked" || variant === "divergent-stacked";
  const stackedExtents = categoryValues.map((category) => {
    const values = data.filter((datum) => datum.category === category).map((datum) => datum.value);
    return {
      positive: values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0),
      negative: values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0),
    };
  });
  const valuesForDomain = isStacked
    ? stackedExtents.flatMap((item) => [item.negative, item.positive])
    : data.map((datum) => datum.value);
  const minimum = Math.min(0, ...valuesForDomain);
  const maximum = Math.max(0, ...valuesForDomain);
  const span = maximum - minimum || Math.max(Math.abs(maximum), 1);
  const swapped = input.chartSpec.axisSwapped === true;
  const sharedValueScale = swapped ? input.sharedScales?.x : input.sharedScales?.y;
  const valueDomain: [number, number] = sharedValueScale?.type === "linear"
    ? sharedValueScale.domain as [number, number]
    : minimum === 0 && maximum === 0
      ? [0, 1]
      : [minimum - (minimum < 0 ? span * 0.04 : 0), maximum + (maximum > 0 ? span * 0.04 : 0)];
  const xScale: ChartScaleSpec = input.sharedScales?.x ?? (swapped
    ? { type: "linear", domain: valueDomain, range: xRange, nice: true }
    : { type: "point", domain: categoryValues, range: xRange });
  const yScale: ChartScaleSpec = input.sharedScales?.y ?? (swapped
    ? { type: "point", domain: categoryValues, range: yRange }
    : { type: "linear", domain: valueDomain, range: yRange, nice: true });
  const categoryPosition = chartScalePosition(swapped ? yScale : xScale);
  const valuePosition = chartScalePosition(swapped ? xScale : yScale);
  const zeroPosition = valuePosition("0");
  const categoryBand = (swapped ? plotArea.height : plotArea.width) / Math.max(categoryValues.length, 1);
  const groupedMarkCounts = new Map(categoryValues.map((category) => [
    category,
    data.filter((datum) => datum.category === category).length,
  ]));
  const groupCount = variant === "grouped"
    ? Math.max(...groupedMarkCounts.values(), 1)
    : 1;
  const groupBand = categoryBand * 0.78 / groupCount;
  const defaultWidth = variant === "grouped" ? groupBand * 0.88 : categoryBand * 0.7;
  const config = groupConfig(input.chartSpec, "bar");
  const colorEncoding = input.chartSpec.encodings.color;
  const sizeEncoding = input.chartSpec.encodings.size;
  const visualRows = data.map((datum) => aggregateEncodingRow(datum.rows, input.chartSpec));
  const colorDomain = input.chartSpec.aggregations?.color
    ? visualDomain(visualRows, colorEncoding)
    : visualDomain(input.dataset.rows, colorEncoding);
  const sizeDomain = input.chartSpec.aggregations?.size
    ? visualDomain(visualRows, sizeEncoding)
    : visualDomain(input.dataset.rows, sizeEncoding);
  const stackOffsets = new Map<string, { positive: number; negative: number }>(
    categoryValues.map((category) => [category, { positive: 0, negative: 0 }]),
  );
  const groupOffsets = new Map(categoryValues.map((category) => [category, 0]));
  const marks = data.map((datum, index) => {
    const categoryCenter = categoryPosition(datum.category);
    if (!Number.isFinite(categoryCenter)) return "";
    const seriesIndex = Math.max(0, seriesValues.indexOf(datum.series));
    const representative = aggregateEncodingRow(datum.rows, input.chartSpec);
    const fallbackColor = palette[seriesIndex % palette.length]!;
    const color = visualColor(representative, colorEncoding, colorDomain, config, fallbackColor);
    const mappedWidth = visualSize(representative, sizeEncoding, sizeDomain, config, defaultWidth);
    const barWidth = Math.max(1, Math.min(mappedWidth, variant === "grouped" ? groupBand * 0.92 : categoryBand * 0.9));
    const groupIndex = groupOffsets.get(datum.category) ?? 0;
    groupOffsets.set(datum.category, groupIndex + 1);
    const categoryGroupCount = groupedMarkCounts.get(datum.category) ?? groupCount;
    const centerX = variant === "grouped"
      ? categoryCenter + (groupIndex - (categoryGroupCount - 1) / 2) * groupBand
      : categoryCenter;
    let startValue = 0;
    let endValue = datum.value;
    if (isStacked) {
      const offsets = stackOffsets.get(datum.category)!;
      if (datum.value >= 0) {
        startValue = offsets.positive;
        offsets.positive += datum.value;
        endValue = offsets.positive;
      } else {
        startValue = offsets.negative;
        offsets.negative += datum.value;
        endValue = offsets.negative;
      }
    }
    const startPosition = valuePosition(String(startValue));
    const endPosition = valuePosition(String(endValue));
    const valueStart = Math.min(startPosition, endPosition);
    const valueLength = Math.max(1, Math.abs(startPosition - endPosition));
    const categoryStart = centerX - barWidth / 2;
    const keys = datum.rows.map((row, rowIndex) => key(input.dataset, row) || String(rowIndex)).join(",");
    const x = swapped ? valueStart : categoryStart;
    const y = swapped ? categoryStart : valueStart;
    const width = swapped ? valueLength : barWidth;
    const height = swapped ? barWidth : valueLength;
    return `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="bar" data-mark-group-id="mark-group:${esc(input.chartId)}:bar" data-row-keys="${esc(keys)}" data-category-key="${esc(datum.category)}" data-series-key="${esc(datum.series)}" data-value="${datum.value}" x="${x}" y="${y}" width="${width}" height="${height}" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 0.9)}"/>`;
  }).join("");
  const showZeroLine = guide?.showAllAxes !== false
    && chartAxisVisible(input.chartSpec, guide, swapped ? "y" : "x");
  const zeroLine = (variant === "divergent" || variant === "divergent-stacked") && Number.isFinite(zeroPosition) && showZeroLine
    ? swapped
      ? `<line data-mark-role="zero-line" x1="${zeroPosition}" y1="${plotArea.y}" x2="${zeroPosition}" y2="${plotArea.y + plotArea.height}" stroke="${esc(input.chartSpec.styleTokens?.axisColor ?? "#64748b")}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      : `<line data-mark-role="zero-line" x1="${plotArea.x}" y1="${zeroPosition}" x2="${plotArea.x + plotArea.width}" y2="${zeroPosition}" stroke="${esc(input.chartSpec.styleTokens?.axisColor ?? "#64748b")}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    : "";
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="bar" data-bar-variant="${variant}" data-axis-swapped="${swapped}" data-renderer="deterministic-bar@1">${zeroLine}${marks}</g>`,
    plotArea,
    scales: { x: xScale, y: yScale },
  };
}

function renderRadialBarChart(input: GenericRenderInput) {
  const theta = input.chartSpec.encodings.theta ?? input.chartSpec.encodings.angle;
  const segment = input.chartSpec.encodings.segment;
  const radius = input.chartSpec.encodings.radius;
  if (!segment || !radius) {
    throw new Error("Radial Bar renderer requires Segment and R encodings.");
  }

  const rows = input.dataset.rows.flatMap((row, rowIndex) => {
    const category = (row[segment.field] ?? "").trim();
    const rawValue = (row[radius.field] ?? "").trim();
    const value = Number(rawValue);
    const rawTheta = theta ? (row[theta.field] ?? "").trim() : "";
    const thetaValue = theta ? Number(rawTheta) : 1;
    return category && rawValue && Number.isFinite(value) && Number.isFinite(thetaValue)
      ? [{ row, rowIndex, category, value: Math.max(0, value), thetaValue: Math.max(0, thetaValue) }]
      : [];
  });
  const categories = Array.from(new Set(rows.map((datum) => datum.category)));
  const radiusAggregation = input.chartSpec.aggregations?.radius;
  const thetaAggregation = input.chartSpec.aggregations?.theta ?? input.chartSpec.aggregations?.angle;
  const data = categories.flatMap((category) => {
    const members = rows.filter((datum) => datum.category === category);
    if (!members.length) return [];
    if (!radiusAggregation && !thetaAggregation) return members;
    const radiusTotal = members.reduce((sum, datum) => sum + datum.value, 0);
    const thetaTotal = members.reduce((sum, datum) => sum + datum.thetaValue, 0);
    return [{
      ...members[0]!,
      value: radiusAggregation
        ? radiusAggregation === "avg" ? radiusTotal / members.length : radiusTotal
        : members[0]!.value,
      thetaValue: thetaAggregation
        ? thetaAggregation === "avg" ? thetaTotal / members.length : thetaTotal
        : members[0]!.thetaValue,
    }];
  });
  if (!data.length) throw new Error("Radial Bar renderer found no Segment categories with numeric R values.");

  const guide = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide : null;
  const cx = guide?.origin.x ?? input.minX + input.width / 2;
  const cy = guide?.origin.y ?? input.minY + input.height / 2;
  const baseRadius = Math.max(8, Math.min(input.width, input.height) * 0.38 * (guide?.radiusScale ?? 1));
  const innerRatio = Math.max(0, Math.min(guide?.innerRadiusRatio ?? 0.28, 0.98));
  const outerRatio = Math.max(innerRatio + 0.01, Math.min(guide?.outerRadiusRatio ?? 1, 1));
  const innerRadius = baseRadius * innerRatio;
  const outerRadius = baseRadius * outerRatio;
  const angleSpan = Math.max(1, Math.min(guide?.angleSpan ?? 360, 360));
  const angleOffset = guide?.angleOffset ?? 0;
  const startAngle = (-270 + angleOffset) * Math.PI / 180;
  const spanRadians = angleSpan * Math.PI / 180;
  const angleLayout = pie<number>()
    .sort(null)
    .value((value) => value)
    .startAngle(startAngle)
    .endAngle(startAngle + spanRadians)(data.map((datum) => theta ? datum.thetaValue : 1));
  const maximum = Math.max(...data.map((datum) => datum.value), 0);
  const valueScale = scaleLinear()
    .domain([0, maximum || 1])
    .range([innerRadius, outerRadius]);
  const config = groupConfig(input.chartSpec, "bar");
  const colorEncoding = input.chartSpec.encodings.color;
  const colorValues = Array.from(new Set(data.map((datum) => colorEncoding ? datum.row[colorEncoding.field] ?? "" : "")));
  const colorIndexes = new Map(colorValues.map((value, index) => [value, index]));
  const colorDomain = visualDomain(data.map((datum) => datum.row), colorEncoding);
  const seriesStyles = isSeriesStyleMapping(config.seriesStyleMapping)
    ? config.seriesStyleMapping.values
    : {};
  const barArc = arc<any>();

  const marks = data.map((datum, index) => {
    const angleDatum = angleLayout[index];
    if (!angleDatum) return "";
    const angle = (angleDatum.startAngle + angleDatum.endAngle) / 2;
    const inset = Math.max(0, angleDatum.endAngle - angleDatum.startAngle) * 0.14;
    const angle0 = angleDatum.startAngle + inset;
    const angle1 = angleDatum.endAngle - inset;
    const colorValue = colorEncoding ? datum.row[colorEncoding.field] ?? "" : "";
    const fallbackColor = palette[(colorIndexes.get(colorValue) ?? index) % palette.length]!;
    const color = seriesStyles[datum.category]?.color
      ?? visualColor(datum.row, colorEncoding, colorDomain, config, fallbackColor);
    const path = barArc({
      startAngle: angle0,
      endAngle: Math.max(angle0, angle1),
      innerRadius,
      outerRadius: valueScale(datum.value),
    }) ?? "";
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="bar" data-mark-group-id="mark-group:${esc(input.chartId)}:bar" data-row-key="${esc(key(input.dataset, datum.row, datum.rowIndex))}" data-category-key="${esc(datum.category)}" data-segment-value="${esc(datum.category)}" data-angle="${angle}" data-theta-value="${theta ? datum.thetaValue : 1}" data-value="${datum.value}" d="${path}" transform="translate(${cx} ${cy})" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 0.9)}"><title>${esc(datum.category)}\n${datum.value}</title></path>`;
  }).join("");

  // Mark labels are opt-in. Axis label visibility belongs to the coordinate
  // layer and must not implicitly add text on top of radial marks.
  const labels = data.length <= 24
    && config.labelsVisible === true
    ? data.map((datum, index) => {
      const angleDatum = angleLayout[index];
      if (!angleDatum) return "";
      const angle = (angleDatum.startAngle + angleDatum.endAngle) / 2;
      const degrees = angle * 180 / Math.PI;
      const x = cx + Math.sin(angle) * (outerRadius + 7);
      const y = cy - Math.cos(angle) * (outerRadius + 7);
      const onLeft = Math.sin(angle) < 0;
      const previous = angleLayout[index - 1];
      const next = angleLayout[index + 1];
      const arcGap = Math.max(12, Math.min(
        previous ? Math.abs(angle - (previous.startAngle + previous.endAngle) / 2) : Math.abs((next?.startAngle ?? angle) - angle),
        next ? Math.abs((next.startAngle + next.endAngle) / 2 - angle) : Math.abs(angle - (previous?.endAngle ?? angle)),
      ) * (outerRadius + 7));
      const style = adaptiveLabel({
        text: datum.category,
        width: arcGap,
        height: 18,
        fontSize: input.chartSpec.styleTokens?.fontSize ?? 9,
        minFontSize: 7,
        maxFontSize: 11,
        background: "#ffffff",
        fontFamily: input.chartSpec.styleTokens?.fontFamily,
        padding: 2,
      });
      return `<text data-mark-role="bar-label" x="${x}" y="${y}" transform="rotate(${degrees} ${x} ${y})" text-anchor="${onLeft ? "end" : "start"}" dominant-baseline="middle" font-size="${style.fontSize}" fill="${esc(style.color)}">${esc(style.text)}</text>`;
    }).join("") : "";

  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="radial-bar" data-renderer="deterministic-radial-bar@1" data-segment-field="${esc(segment.field)}" data-theta-mode="${theta ? "mapped" : "static"}" data-theta-field="${esc(theta?.field ?? "")}">${marks}${labels}</g>`,
    plotArea: { x: cx - outerRadius, y: cy - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
    polarArea: { startAngle: angleOffset, angleSpan, innerRadius, outerRadius },
    scales: undefined,
  };
}

function resolvedPolarEncodings(spec: ChartSpec) {
  return {
    value: spec.encodings.theta ?? spec.encodings.angle ?? spec.encodings.y,
    segment: spec.encodings.segment,
    radius: spec.encodings.radius,
  };
}

function renderPolarChart(input: GenericRenderInput, donut: boolean) {
  const { value, segment, radius } = resolvedPolarEncodings(input.chartSpec);
  const angleFields = input.chartSpec.angleFields ?? [];
  if (!segment && angleFields.length === 0 && !value) throw new Error(`${donut ? "Donut" : "Pie"} renderer requires a Segment encoding.`);
  const minX = input.minX;
  const minY = input.minY;
  const cx = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.origin.x : minX + input.width / 2;
  const cy = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.origin.y : minY + input.height / 2;
  const config = groupConfig(input.chartSpec, "arc");
  const valueAggregation = input.chartSpec.aggregations?.theta
    ?? input.chartSpec.aggregations?.angle
    ?? input.chartSpec.aggregations?.y;
  const staticRadiusRatio = typeof config.outerRadius === "number"
    ? Math.max(0, Math.min(config.outerRadius, 1))
    : 1;
  const baseOuterRadius = Math.max(8, Math.min(input.width, input.height) * 0.38
    * (input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.radiusScale ?? 1 : 1)
    * staticRadiusRatio);
  const innerRadiusRatio = input.coordinateGuide?.type === "Polar"
    ? Math.max(0, Math.min(input.coordinateGuide.innerRadiusRatio ?? 0, 0.98))
    : 0;
  const outerRadiusRatio = input.coordinateGuide?.type === "Polar"
    ? Math.max(innerRadiusRatio + 0.01, Math.min(input.coordinateGuide.outerRadiusRatio ?? 1, 1))
    : 1;
  const innerRadius = baseOuterRadius * innerRadiusRatio;
  const outerRadius = baseOuterRadius * outerRadiusRatio;
  const isOuterRadialConcatBand = input.polarConcatDirection === "radial" && innerRadiusRatio > 0;
  const markInnerRadius = donut
    ? innerRadius + Math.max(outerRadius - innerRadius, 1)
      * (isOuterRadialConcatBand ? POLAR_CONCAT_SEAM_RATIO : 0.5)
    : innerRadius;
  const angleSpan = input.coordinateGuide?.type === "Polar"
    ? Math.max(1, Math.min(input.coordinateGuide.angleSpan ?? 360, 360))
    : 360;
  const angleOffset = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.angleOffset ?? 0 : 0;
  const layoutStartAngle = (-270 + angleOffset) * Math.PI / 180;
  const layoutEndAngle = layoutStartAngle + angleSpan * Math.PI / 180;
  const polarArea = (occupiedInnerRadius: number, occupiedOuterRadius: number): ChartPolarArea => ({
    startAngle: angleOffset,
    angleSpan,
    innerRadius: occupiedInnerRadius,
    outerRadius: occupiedOuterRadius,
  });
  if (angleFields.length > 0 || segment) {
    const segmentThetaField = value?.field ?? "";
    const flattenFields = (input.chartSpec.flattenFields ?? []).filter((field) =>
      input.dataset.columns.some((column) => column.name === field),
    );
    const flattenedGroups = new Map<string, { values: string[]; rows: Dataset["rows"] }>();
    if (flattenFields.length === 0) {
      flattenedGroups.set("[]", { values: [], rows: input.dataset.rows });
    } else {
      input.dataset.rows.forEach((row) => {
        const values = flattenFields.map((field) => row[field] ?? "");
        const groupKey = JSON.stringify(values);
        const current = flattenedGroups.get(groupKey);
        if (current) current.rows.push(row);
        else flattenedGroups.set(groupKey, { values, rows: [row] });
      });
    }
    const components = segment
      ? !value
        ? Array.from(new Set(input.dataset.rows.map((row) => row[segment.field] ?? "")))
          .filter(Boolean)
          .map((segmentValue) => ({
            field: segmentValue,
            categoryKey: segmentValue,
            thetaField: "",
            flattenValues: [] as string[],
            rows: input.dataset.rows.filter((row) => (row[segment.field] ?? "") === segmentValue),
            value: 1,
          }))
        : valueAggregation
        ? Array.from(new Set(input.dataset.rows.map((row) => row[segment.field] ?? "")))
          .filter(Boolean)
          .map((segmentValue) => {
            const rows = input.dataset.rows.filter((row) => (row[segment.field] ?? "") === segmentValue);
            const numericValues = rows
              .map((row) => Number(row[segmentThetaField] ?? ""))
              .filter(Number.isFinite);
            const total = numericValues.reduce((sum, current) => sum + Math.max(0, current), 0);
            return {
              field: segmentValue,
              categoryKey: segmentValue,
              thetaField: segmentThetaField,
              flattenValues: [] as string[],
              rows,
              value: valueAggregation === "avg" && numericValues.length > 0
                ? total / numericValues.length
                : total,
            };
          })
        : input.dataset.rows.flatMap((row) => {
          const segmentValue = row[segment.field] ?? "";
          const thetaValue = Number(row[segmentThetaField] ?? "");
          if (!segmentValue || !Number.isFinite(thetaValue)) return [];
          return [{
            field: segmentValue,
            categoryKey: segmentValue,
            thetaField: segmentThetaField,
            flattenValues: [] as string[],
            rows: [row],
            value: Math.max(0, thetaValue),
          }];
        })
      : Array.from(flattenedGroups.values()).flatMap((flattened) =>
        angleFields.map((encoding) => ({
          field: encoding.field,
          categoryKey: [...flattened.values, encoding.field].join(" / "),
          thetaField: encoding.field,
          flattenValues: flattened.values,
          rows: flattened.rows,
          value: (() => {
            const numericValues = flattened.rows
              .map((row) => Number(row[encoding.field] ?? ""))
              .filter(Number.isFinite);
            const total = numericValues.reduce((sum, current) => sum + Math.max(0, current), 0);
            return valueAggregation === "avg" && numericValues.length > 0
              ? total / numericValues.length
              : total;
          })(),
        })),
      );
    const componentValues = components.map((component) => component.value);
    const layout = pie<number>()
      .sort(null)
      .value((datum) => datum)
      .startAngle(layoutStartAngle)
      .endAngle(layoutEndAngle)(componentValues);
    const radiusMode = resolvedPolarRadiusMode(input.chartSpec);
    const componentRadiusValues = components.map((component) => {
      if (radiusMode === "static") return Number.NaN;
      if (!radius) return Number.NaN;
      const values = numericFieldValues(component.rows, radius.field);
      return values.length > 0
        ? values.reduce((sum, current) => sum + Math.max(0, current), 0)
        : Number.NaN;
    });
    const radiusDomainValues = componentRadiusValues.filter(Number.isFinite);
    const radiusDomain = extent(radiusDomainValues) as [number | undefined, number | undefined];
    const radiusScale = radiusDomain[0] === undefined || radiusDomain[1] === undefined || radiusDomain[0] === radiusDomain[1]
      ? () => outerRadius
      : scaleLinear().domain(radiusDomain as [number, number]).range([
        markInnerRadius + (outerRadius - markInnerRadius) * 0.42,
        outerRadius,
      ]);
    const seriesStyles = isSeriesStyleMapping(config.seriesStyleMapping)
      ? config.seriesStyleMapping.values
      : {};
    const segmentPaletteIndexes = new Map<string, number>();
    components.forEach((component) => {
      if (!segmentPaletteIndexes.has(component.field)) {
        segmentPaletteIndexes.set(component.field, segmentPaletteIndexes.size);
      }
    });
    const arcs = layout.map((datum, index) => {
      const component = components[index];
      const field = component?.field ?? String(index + 1);
      const categoryKey = component?.categoryKey ?? [...(component?.flattenValues ?? []), field].join(" / ");
      const radiusValue = componentRadiusValues[index] ?? Number.NaN;
      const componentOuterRadius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : outerRadius;
      const path = arc<any>().innerRadius(markInnerRadius).outerRadius(componentOuterRadius);
      const color = seriesStyles[field]?.color
        ?? palette[(segmentPaletteIndexes.get(field) ?? index) % palette.length]!;
      return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="arc" data-mark-group-id="mark-group:${esc(input.chartId)}:arc" data-category-key="${esc(categoryKey)}" data-segment-value="${esc(field)}" data-theta-field="${esc(component?.thetaField ?? "")}" data-theta-value="${componentValues[index] ?? 0}" data-angle-field="${esc(component?.thetaField ?? "")}" data-angle-value="${componentValues[index] ?? 0}" data-flatten-fields="${esc(flattenFields.join("|"))}" data-flatten-values="${esc((component?.flattenValues ?? []).join("|"))}" data-radius-mode="${radiusMode}" data-radius-field="${esc(radius?.field ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" d="${path(datum) ?? ""}" transform="translate(${cx} ${cy})" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 1)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }).join("");
    // Segment labels are mark text, not theta-axis labels. Keep them hidden by
    // default and require an explicit mark-group opt-in.
    const showSegmentLabels = !!segment
      && config.labelsVisible === true
      && input.coordinateGuide?.type === "Polar";
    const segmentLabels = showSegmentLabels
      ? layout.map((datum, index) => {
        const component = components[index];
        if (!component) return "";
        const radiusValue = componentRadiusValues[index] ?? Number.NaN;
        const componentOuterRadius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : outerRadius;
        const labelRadius = markInnerRadius + (componentOuterRadius - markInnerRadius) * 0.55;
        const angle = (datum.startAngle + datum.endAngle) / 2;
        // d3-shape measures arc angles clockwise from 12 o'clock.
        const x = cx + Math.sin(angle) * labelRadius;
        const y = cy - Math.cos(angle) * labelRadius;
        const arcLength = Math.max(8, Math.abs(datum.endAngle - datum.startAngle) * labelRadius * 0.82);
        const style = adaptiveLabel({
          text: component.field,
          width: arcLength,
          height: Math.max(8, componentOuterRadius - markInnerRadius),
          fontSize: input.chartSpec.styleTokens?.fontSize ?? 11,
          minFontSize: 6,
          maxFontSize: 11,
          background: seriesStyles[component.field]?.color
            ?? palette[(segmentPaletteIndexes.get(component.field) ?? index) % palette.length],
          fontFamily: input.chartSpec.styleTokens?.fontFamily,
          padding: 2,
        });
        return style.text
          ? `<text data-mark-role="arc-label" data-category-key="${esc(component.categoryKey)}" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="${esc(style.color)}" font-size="${style.fontSize}" font-weight="650">${esc(style.text)}</text>`
          : "";
      }).join("")
      : "";
    const thetaFields = Array.from(new Set(components.map((component) => component.thetaField)));
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="${donut ? "donut" : "pie"}" data-renderer="deterministic-chart@1" data-segment-field="${esc(segment?.field ?? "")}" data-segment-fields="${esc(angleFields.map((encoding) => encoding.field).join("|"))}" data-theta-mode="${value ? "mapped" : "static"}" data-theta-fields="${esc(thetaFields.join("|"))}" data-angle-fields="${esc(thetaFields.join("|"))}" data-flatten-fields="${esc(flattenFields.join("|"))}" data-radius-mode="${radiusMode}">${arcs}${segmentLabels}</g>`,
      plotArea: { x: cx - outerRadius, y: cy - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
      polarArea: polarArea(markInnerRadius, outerRadius),
      scales: undefined,
    };
  }
  if (!value) throw new Error(`${donut ? "Donut" : "Pie"} renderer requires an angle/value encoding.`);
  // With no Segment binding, each source row remains one arc. Radius still uses
  // one shared domain so the outer extents are comparable across all arcs.
  const sourceRows = input.dataset.rows;
  const numericValues = sourceRows
    .map((row) => Number(row[value.field] ?? ""))
    .filter(Number.isFinite);
  const rows = valueAggregation
    ? [{
      ...(sourceRows[0] ?? {}),
      [value.field]: String(valueAggregation === "avg" && numericValues.length > 0
        ? numericValues.reduce((sum, current) => sum + current, 0) / numericValues.length
        : numericValues.reduce((sum, current) => sum + current, 0)),
    }]
    : sourceRows;
  const values = rows.map((row) => Math.max(0, Number(row[value.field] ?? "0")));
  const layout = pie<number>()
    .sort(null)
    .value((datum) => datum)
    .startAngle(layoutStartAngle)
    .endAngle(layoutEndAngle)(values);
  const donutInnerRadius = markInnerRadius;
  const radiusValues = radius
    ? rows.map((row) => Number(row[radius.field] ?? "")).filter(Number.isFinite)
    : [];
  const radiusDomain = extent(radiusValues) as [number | undefined, number | undefined];
  const radiusScale = radiusDomain[0] === undefined || radiusDomain[1] === undefined || radiusDomain[0] === radiusDomain[1]
    ? () => outerRadius
    : scaleLinear()
      .domain(radiusDomain as [number, number])
      .range([donutInnerRadius + (outerRadius - donutInnerRadius) * 0.48, outerRadius]);
  const arcs = layout.map((datum, index) => {
    const row = rows[index]!;
    const radiusValue = radius ? Number(row[radius.field] ?? "") : Number.NaN;
    const rowOuterRadius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : outerRadius;
    const path = arc<any>().innerRadius(donutInnerRadius).outerRadius(rowOuterRadius);
    const color = palette[index % palette.length]!;
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="arc" data-mark-group-id="mark-group:${esc(input.chartId)}:arc" data-row-key="${esc(key(input.dataset, row) || String(index))}" data-category-key="${String(index + 1)}" data-radius-field="${esc(radius?.field ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" d="${path(datum) ?? ""}" transform="translate(${cx} ${cy})" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 1)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const occupiedInnerRadius = donutInnerRadius;
  const occupiedOuterRadius = outerRadius;
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="${donut ? "donut" : "pie"}" data-renderer="deterministic-chart@1">${arcs}</g>`,
    plotArea: { x: cx - outerRadius, y: cy - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
    polarArea: polarArea(occupiedInnerRadius, occupiedOuterRadius),
    scales: undefined,
  };
}

function renderMatrixChart(input: GenericRenderInput) {
  const rowEncoding = physicalCartesianAxisEncoding(input.chartSpec, "y") ?? input.chartSpec.encodings.row;
  const columnEncoding = physicalCartesianAxisEncoding(input.chartSpec, "x") ?? input.chartSpec.encodings.column;
  const legacyValueEncoding = input.chartSpec.encodings.value;
  const colorEncoding = input.chartSpec.encodings.color;
  const valueEncoding = colorEncoding?.type === "quantitative" ? colorEncoding : legacyValueEncoding;
  if (!rowEncoding || !columnEncoding) throw new Error("Matrix renderer requires row and column encodings.");
  const rowValues = Array.from(new Set(input.dataset.rows.map((row) => row[rowEncoding.field] ?? ""))).filter(Boolean);
  const columnValues = Array.from(new Set(input.dataset.rows.map((row) => row[columnEncoding.field] ?? ""))).filter(Boolean);
  // Matrix cells use the same bounded Cartesian plot area as line/scatter
  // charts so the shared coordinate-system layer can render real axes.
  const fontSize = Math.max(9, Math.min(input.chartSpec.styleTokens?.fontSize ?? 11, Math.min(input.width, input.height) * 0.045));
  const leftMargin = Math.min(Math.max(fontSize * 4.8, input.width * 0.09), input.width * 0.28);
  const rightMargin = Math.min(Math.max(fontSize * 1.8, input.width * 0.035), input.width * 0.14);
  const topMargin = Math.min(Math.max(fontSize * 2, input.height * 0.07), input.height * 0.22);
  const bottomMargin = Math.min(Math.max(fontSize * 3.6, input.height * 0.14), input.height * 0.3);
  const basePlotArea: ChartPlotArea = {
    x: input.minX + leftMargin,
    y: input.minY + topMargin,
    width: Math.max(1, input.width - leftMargin - rightMargin),
    height: Math.max(1, input.height - topMargin - bottomMargin),
  };
  const guide = input.coordinateGuide?.type === "Cartesian" ? input.coordinateGuide : null;
  const scaledPlotWidth = Math.max(1, basePlotArea.width * (guide?.xScale ?? 1) * (guide?.xDiscreteSpacing ?? 1));
  const scaledPlotHeight = Math.max(1, basePlotArea.height * (guide?.yScale ?? 1) * (guide?.yDiscreteSpacing ?? 1));
  const plotArea: ChartPlotArea = input.sharedPlotArea ?? {
    x: guide?.xDirection === -1
      ? basePlotArea.x + basePlotArea.width - scaledPlotWidth
      : basePlotArea.x,
    y: guide?.yDirection === 1
      ? basePlotArea.y
      : basePlotArea.y + basePlotArea.height - scaledPlotHeight,
    width: scaledPlotWidth,
    height: scaledPlotHeight,
  };
  const xRange: [number, number] = input.sharedScales?.x?.range
    ?? (guide?.xDirection === -1
      ? [plotArea.x + plotArea.width, plotArea.x]
      : [plotArea.x, plotArea.x + plotArea.width]);
  const yRange: [number, number] = input.sharedScales?.y?.range
    ?? (guide?.yDirection === 1
      ? [plotArea.y, plotArea.y + plotArea.height]
      : [plotArea.y + plotArea.height, plotArea.y]);
  const xScale = input.sharedScales?.x ?? {
    type: "point" as const,
    domain: columnValues,
    range: xRange,
  };
  const yScale = input.sharedScales?.y ?? {
    type: "point" as const,
    domain: rowValues,
    range: yRange,
  };
  const xPosition = chartScalePosition(xScale);
  const yPosition = chartScalePosition(yScale);
  const cellWidth = plotArea.width / Math.max(columnValues.length, 1);
  const cellHeight = plotArea.height / Math.max(rowValues.length, 1);
  const rowIndexByValue = new Map(rowValues.map((value, index) => [value, index]));
  const columnIndexByValue = new Map(columnValues.map((value, index) => [value, index]));
  const xPositionByValue = new Map(columnValues.map((value) => [value, xPosition(value)]));
  const yPositionByValue = new Map(rowValues.map((value) => [value, yPosition(value)]));
  const colorAggregation = valueEncoding?.field
    ? input.chartSpec.dimensionAggregations?.[valueEncoding.field]
    : undefined;
  const aggregation = input.chartSpec.aggregations?.value
    ?? input.chartSpec.aggregations?.y
    ?? input.chartSpec.aggregations?.color
    ?? colorAggregation;
  type MatrixCellDatum = {
    rowKey: string;
    columnKey: string;
    rows: Dataset["rows"];
    rowIndexes: number[];
    value?: number;
    valueCount: number;
  };
  const cellData: MatrixCellDatum[] = aggregation
    ? (() => {
      const grouped = new Map<string, MatrixCellDatum>();
      input.dataset.rows.forEach((row, rowIndex) => {
        const rowKey = row[rowEncoding.field] ?? "";
        const columnKey = row[columnEncoding.field] ?? "";
        if (!rowKey || !columnKey) return;
        const groupKey = `${rowKey}\u0000${columnKey}`;
        const value = valueEncoding ? Number(row[valueEncoding.field] ?? "") : Number.NaN;
        const current = grouped.get(groupKey);
        if (current) {
          current.rows.push(row);
          current.rowIndexes.push(rowIndex);
          if (Number.isFinite(value)) {
            current.value = (current.value ?? 0) + value;
            current.valueCount += 1;
          }
          return;
        }
        grouped.set(groupKey, {
          rowKey,
          columnKey,
          rows: [row],
          rowIndexes: [rowIndex],
          value: Number.isFinite(value) ? value : undefined,
          valueCount: Number.isFinite(value) ? 1 : 0,
        });
      });
      const cells = Array.from(grouped.values());
      if (aggregation === "avg") {
        cells.forEach((cell) => {
          if (cell.value !== undefined && cell.valueCount > 0) cell.value /= cell.valueCount;
        });
      }
      return cells;
    })()
    : input.dataset.rows.map((row, rowIndex) => ({
      rowKey: row[rowEncoding.field] ?? "",
      columnKey: row[columnEncoding.field] ?? "",
      rows: [row],
      rowIndexes: [rowIndex],
      value: valueEncoding
        ? Number.isFinite(Number(row[valueEncoding.field] ?? ""))
          ? Number(row[valueEncoding.field] ?? "")
          : undefined
        : undefined,
      valueCount: valueEncoding && Number.isFinite(Number(row[valueEncoding.field] ?? "")) ? 1 : 0,
    }));
  const numeric = cellData.flatMap((cell) => cell.value === undefined ? [] : [cell.value]);
  const domain = extent(numeric) as [number | undefined, number | undefined];
  const opacity = domain[0] === undefined || domain[1] === undefined || domain[0] === domain[1]
    ? () => 0.72
    : scaleLinear().domain(domain as [number, number]).range([0.18, 0.95]);
  const config = groupConfig(input.chartSpec, "cell");
  const visualRows = cellData.map((cell) => aggregateEncodingRow(cell.rows, input.chartSpec));
  const colorDomain = input.chartSpec.aggregations?.color
    ? visualDomain(visualRows, colorEncoding)
    : visualDomain(input.dataset.rows, colorEncoding);
  const colorValues = colorEncoding?.type === "nominal" || colorEncoding?.type === "ordinal"
    ? Array.from(new Set(input.dataset.rows.map((row) => row[colorEncoding.field] ?? "")))
    : [];
  const colorIndexByValue = new Map(colorValues.map((value, index) => [value, index]));
  const cells = cellData.map((cell) => {
    const rowKey = cell.rowKey;
    const columnKey = cell.columnKey;
    const rowIndex = rowIndexByValue.get(rowKey) ?? -1;
    const columnIndex = columnIndexByValue.get(columnKey) ?? -1;
    if (rowIndex < 0 || columnIndex < 0) return "";
    const representative = aggregateEncodingRow(cell.rows, input.chartSpec);
    if (!representative) return "";
    const alpha = cell.value === undefined ? 0.72 : opacity(cell.value);
    const colorIndex = colorEncoding
      ? Math.max(0, colorIndexByValue.get(representative[colorEncoding.field] ?? "") ?? 0)
      : 0;
    const color = visualColor(representative, colorEncoding, colorDomain, config, palette[colorIndex % palette.length] ?? globalPalette.categorical[0] ?? "#000000");
    const centerX = xPositionByValue.get(columnKey);
    const centerY = yPositionByValue.get(rowKey);
    if (centerX === undefined || centerY === undefined || !Number.isFinite(centerX) || !Number.isFinite(centerY)) return "";
    const renderedOpacity = Number(config.opacity ?? alpha);
    const rowKeys = cell.rows
      .map((row, rowIndex) => key(input.dataset, row, cell.rowIndexes[rowIndex] ?? rowIndex))
      .filter(Boolean);
    const rowKeyAttribute = rowKeys.length === 1
      ? ` data-row-key="${esc(rowKeys[0]!)}"`
      : rowKeys.length > 1
        ? ` data-row-keys="${esc(rowKeys.join(","))}"`
        : "";
    return `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="cell" data-mark-group-id="mark-group:${esc(input.chartId)}:cell"${rowKeyAttribute} data-row-value="${esc(rowKey)}" data-column-value="${esc(columnKey)}" x="${centerX - cellWidth / 2 + 0.5}" y="${centerY - cellHeight / 2 + 0.5}" width="${Math.max(1, cellWidth - 1)}" height="${Math.max(1, cellHeight - 1)}" fill="${esc(color)}" fill-opacity="${renderedOpacity}"/>`;
  }).join("");
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="matrix" data-renderer="deterministic-chart@1">${cells}</g>`,
    plotArea,
    scales: { x: xScale, y: yScale },
  };
}

export type GenericRenderInput = {
  chartId: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
  coordinateGuide: CoordinateGuide | null | undefined;
  chartSpec: ChartSpec;
  dataset: Dataset;
  polarConcatDirection?: "radial" | "angular";
  sharedPlotArea?: ChartPlotArea;
  sharedScales?: Partial<{ x: ChartScaleSpec; y: ChartScaleSpec }>;
  /** Child selection-box sizes keyed by the parent mark identity. */
  nestedChildFrames?: readonly NestedChildFrame[];
};

export type DeterministicChartResult = {
  content: string;
  plotArea: ChartPlotArea;
  /** Optional rendered footprint used by the canvas selection frame. */
  selectionBounds?: ChartPlotArea;
  polarArea?: ChartPolarArea;
  scales?: { x: ChartScaleSpec; y: ChartScaleSpec };
};

type ChartPipeline = {
  coordinateSystem: "Cartesian" | "Polar" | "CoordinateFree";
  render: (input: GenericRenderInput) => DeterministicChartResult;
};

function requireCoordinateGuide<T extends "Cartesian" | "Polar">(
  input: GenericRenderInput,
  coordinateSystem: T,
) {
  if (input.coordinateGuide?.type !== coordinateSystem) {
    throw new Error(`${input.chartSpec.chartType} requires a ${coordinateSystem} coordinate system.`);
  }
  return input.coordinateGuide;
}

function cartesianInput(input: GenericRenderInput) {
  return { ...input, coordinateGuide: input.coordinateGuide as CartesianCoordinateGuide };
}

/**
 * Chart-specific rendering is registered here so the public render entry point
 * only coordinates template lookup, validation and execution.
 */
export const deterministicChartPipelines: Record<ChartRendererKey, ChartPipeline> = {
  line: {
    coordinateSystem: "Cartesian",
    render: (input) => renderLineChart(cartesianInput(input)),
  },
  scatter: {
    coordinateSystem: "Cartesian",
    render: (input) => renderScatterChart(cartesianInput(input)),
  },
  bar: {
    coordinateSystem: "Cartesian",
    render: (input) => renderBarChart(input),
  },
  pie: {
    coordinateSystem: "Polar",
    render: (input) => renderPolarChart(input, false),
  },
  donut: {
    coordinateSystem: "Polar",
    render: (input) => renderPolarChart(input, true),
  },
  matrix: {
    coordinateSystem: "Cartesian",
    render: (input) => renderMatrixChart(input),
  },
  area: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  parallel: { coordinateSystem: "CoordinateFree", render: renderAdvancedChart },
  hierarchy: { coordinateSystem: "CoordinateFree", render: renderAdvancedChart },
  calendar: { coordinateSystem: "CoordinateFree", render: renderAdvancedChart },
  boxplot: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  contour: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  hexbin: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  flow: { coordinateSystem: "CoordinateFree", render: renderAdvancedChart },
};

export function renderDeterministicChart(input: GenericRenderInput) {
  const schema = getChartContract(input.chartSpec.chartType);
  if (!schema) throw new Error(`Unsupported chart template: ${input.chartSpec.chartType}`);
  const pipeline = deterministicChartPipelines[schema.renderer];
  const coordinateSystem = schema.coordinateSystem ?? pipeline.coordinateSystem;
  if (coordinateSystem !== "CoordinateFree") requireCoordinateGuide(input, coordinateSystem);
  return pipeline.render({
    ...input,
    dataset: materializeGraphDataset(input.dataset, input.chartSpec),
  });
}

export function renderLayerChart(input: LineRenderInput & { layerSpec: LayerSpec; childCharts?: ChartSpec[] }) {
  const line = renderLineChart(input);
  const childCharts = input.layerSpec.children.map((child) => child.chartSpec);
  const scatter = input.layerSpec.children.find((child) => child.role === "scatter")?.chartSpec
    ?? childCharts.find((chart) => chart.chartType.replace(/[\s_-]/g, "").toLowerCase().includes("scatter"));
  const scales = scalesFromSpec({ ...input.chartSpec, scales: line.scales, plotArea: line.plotArea });
  if (!scales || !scatter) return { ...line, layerSpec: input.layerSpec };
  const xField = input.layerSpec.x?.field ?? input.chartSpec.encodings.x?.field;
  const yField = input.layerSpec.y?.field ?? input.chartSpec.encodings.y?.field;
  if (!xField || !yField) return { ...line, layerSpec: input.layerSpec };
  const scatterResult = renderScatterChart({
    ...input,
    chartSpec: {
      ...scatter,
      encodings: {
        ...scatter.encodings,
        x: input.layerSpec.x ?? scatter.encodings.x,
        y: input.layerSpec.y ?? scatter.encodings.y,
      },
    },
    sharedPlotArea: line.plotArea,
    sharedScales: line.scales,
  });
  // The scatter renderer already returns a dedicated root group. Reuse it as
  // the layer's point mark instead of adding a wrapper that has no visual or
  // interaction state of its own.
  const markerContent = scatterResult.content.replace(
    /^<g\b/,
    `<g data-mark-role="points" data-point-count="${input.dataset.rows.length}"`,
  );
  const content = line.content.replace(/<\/g>\s*$/, `${markerContent}</g>`);
  return { ...line, content, layerSpec: input.layerSpec };
}

export function renderNestedPie(input: {
  chartId: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
  baseSpec: ChartSpec;
  nestedSpec: NestedSpec;
  dataset: Dataset;
}) {
  const scales = scalesFromSpec(input.baseSpec);
  if (!scales) throw new Error("Nested Pie requires shared chart scales.");
  const xEncoding = input.baseSpec.encodings.x;
  const yEncoding = input.baseSpec.encodings.y;
  if (!xEncoding || !yEncoding) throw new Error("Nested Pie requires explicit X and Y encodings.");
  const fields = input.nestedSpec.valueFields;
  const groupId = input.nestedSpec.groupId ?? `nested-pie-group:${input.nestedSpec.parentChartNodeId}`;
  const colors = globalPalette.categorical;
  const baseRadius = Math.max(5, Math.min(input.width, input.height) * 0.018);
  const radiusField = input.nestedSpec.radiusField;
  const radiusValues = radiusField
    ? input.dataset.rows.map((row) => Number(row[radiusField] ?? "")).filter(Number.isFinite)
    : [];
  const radiusDomain = extent(radiusValues) as [number | undefined, number | undefined];
  const radiusScale = radiusDomain[0] === undefined || radiusDomain[1] === undefined
    ? () => baseRadius
    : scaleLinear()
      .domain(radiusDomain[0] === radiusDomain[1] ? [radiusDomain[0] - 1, radiusDomain[1] + 1] : radiusDomain as [number, number])
      .range([baseRadius * 0.72, baseRadius * 1.6]);
  const selectedKeys = new Set(input.nestedSpec.parentRowKeys?.length
    ? input.nestedSpec.parentRowKeys
    : input.nestedSpec.parentRowKey === "*"
      ? []
      : [input.nestedSpec.parentRowKey]);
  const rows = selectedKeys.size > 0
    ? input.dataset.rows.filter((row) => selectedKeys.has(key(input.dataset, row)))
    : input.dataset.rows;
  const pies = rows.map((row) => {
    const x = row[xEncoding.field] ?? "";
    const y = row[yEncoding.field] ?? "";
    const cx = scales.xScale(x);
    const cy = scales.yScale(y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return "";
    const radiusValue = radiusField ? Number(row[radiusField] ?? "") : Number.NaN;
    const radius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : baseRadius;
    const values = fields.map((field) => Math.max(0, Number(row[field] ?? "0")));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = values.map((value, index) => {
      const next = angle + (value / total) * Math.PI * 2;
      const large = next - angle > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${cx + Math.cos(angle) * radius} ${cy + Math.sin(angle) * radius} A ${radius} ${radius} 0 ${large} 1 ${cx + Math.cos(next) * radius} ${cy + Math.sin(next) * radius} Z`;
      angle = next;
      return `<path data-mark-role="pie-arc" data-mark-group-id="${esc(groupId)}" data-row-key="${esc(key(input.dataset, row))}" data-pie-component="${esc(fields[index] ?? "")}" d="${d}" fill="${colors[index % colors.length]}"/>`;
    }).join("");
    return `<g data-mark-role="nested-pie" data-mark-group-id="${esc(groupId)}" data-composition-group-id="${esc(groupId)}" data-row-key="${esc(key(input.dataset, row))}" data-radius-field="${esc(radiusField ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" data-arc-count="${fields.length}">${arcs}</g>`;
  }).join("");
  const content = `<g data-chart-id="${esc(input.chartId)}" data-chart-type="nested-pie" data-mark-role="nested-pies" data-composition-group-id="${esc(groupId)}" data-parent-mark-group-id="${esc(input.nestedSpec.parentMarkGroupId ?? "")}">${pies}</g>`;
  return { content, plotArea: scales.plotArea, pointCount: rows.length };
}
