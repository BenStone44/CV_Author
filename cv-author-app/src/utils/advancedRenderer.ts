import {
  arc as d3Arc,
  area as d3Area,
  bin as d3Bin,
  chord as d3Chord,
  cluster,
  contours as d3Contours,
  curveBasis,
  descending,
  line as d3Line,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceSimulation,
  geoPath,
  linkRadial,
  partition,
  quantileSorted,
  range as d3Range,
  ribbon as d3Ribbon,
  scaleLinear,
  scaleLog,
  scaleOrdinal,
  scalePoint,
  scaleSequential,
  scaleSequentialLog,
  scaleUtc,
  stack,
  stackOffsetSilhouette,
  stackOrderInsideOut,
  stratify,
  tickStep,
  ticks,
  treemap,
  treemapBinary,
  treemapDice,
  treemapSlice,
  treemapSliceDice,
  treemapSquarify,
  utcMonday,
  utcMonth,
  utcMonths,
  utcYear,
} from "d3";
import { hexbin } from "d3-hexbin";
import {
  sankey,
  sankeyCenter,
  sankeyJustify,
  sankeyLeft,
  sankeyLinkHorizontal,
  sankeyRight,
  type SankeyGraph,
} from "d3-sankey";
import type { ChartEncoding, ChartPlotArea, ChartScaleSpec, Dataset } from "../types";
import type { GenericRenderInput } from "./semanticRenderer";
import { renderLineChart } from "./lineRenderer";
import { csvRowKey } from "./csvDataEngine";
import { cartesianAxisEncoding } from "./chartTemplates";
import {
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  globalGradientColor,
  mapColorValue,
  mapSizeValue,
  parseVisualValue,
  visualDomain,
} from "./visualMapping";
import {
  createRadialClusterLayout,
  RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS,
  RADIAL_DENDROGRAM_SELECTION_PADDING,
  type RadialClusterNode,
} from "./radialClusterLayout";
import {
  cartesianTreeDirection,
  cartesianTreeLeafAxis,
} from "./treeLayout";
import { adaptiveAxisFontSize, adaptiveLabel, measureLabelWidth, readableTextColor } from "./adaptiveLabels";
import { globalPalette } from "../config/global";

const tableau = globalPalette.categorical;

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function adaptiveText(text: string, attributes: string, width: number, height: number, background?: string, fontSize = 10) {
  const style = adaptiveLabel({ text, width, height, background, fontSize, minFontSize: 6, maxFontSize: 12, padding: 2 });
  return style.text
    ? `<text ${attributes} font-size="${style.fontSize}" fill="${style.color}">${esc(style.text)}</text>`
    : "";
}

function normalizedType(chartType: string) {
  return chartType.replace(/[\s_-]/g, "").toLowerCase();
}

function plotArea(input: GenericRenderInput, inset = 10): ChartPlotArea {
  return {
    x: input.minX + inset,
    y: input.minY + inset,
    width: Math.max(1, input.width - inset * 2),
    height: Math.max(1, input.height - inset * 2),
  };
}

function rowKey(dataset: Dataset, row: Dataset["rows"][number], index: number) {
  return csvRowKey(dataset, row, index);
}

type NestedMarkIdentity = {
  rowKey?: string;
  categoryKey?: string;
  seriesKey?: string;
  rowValue?: string;
  columnValue?: string;
  role?: string;
  fallbackIndex?: number;
};

function nestedMarkIdentity(dataKey: string | undefined): NestedMarkIdentity {
  if (!dataKey) return {};
  try {
    return JSON.parse(dataKey) as NestedMarkIdentity;
  } catch {
    return { rowKey: dataKey };
  }
}

function nestedChildFrame(
  input: GenericRenderInput,
  values: {
    rowKey?: string;
    nodeKey?: string;
    role?: string;
    categoryKey?: string;
    seriesKey?: string;
    rowValue?: string;
    columnValue?: string;
    index?: number;
    markGroupId?: string;
  },
) {
  return input.nestedChildFrames?.find((frame) => {
    if (frame.parentMarkGroupId && values.markGroupId && frame.parentMarkGroupId !== values.markGroupId) return false;
    const identity = nestedMarkIdentity(frame.parentDataKey);
    const legacyDirectKey = !!frame.parentDataKey && !frame.parentDataKey.trim().startsWith("{");
    return (identity.rowKey === undefined
      || identity.rowKey === values.rowKey
      || (legacyDirectKey && identity.rowKey === values.nodeKey))
      && (identity.categoryKey === undefined || identity.categoryKey === values.categoryKey || identity.categoryKey === values.nodeKey)
      && (identity.seriesKey === undefined || identity.seriesKey === values.seriesKey)
      && (identity.rowValue === undefined || identity.rowValue === values.rowValue)
      && (identity.columnValue === undefined || identity.columnValue === values.columnValue)
      && (identity.role === undefined || identity.role === values.role)
      && (identity.fallbackIndex === undefined || identity.fallbackIndex === values.index);
  });
}

/** Return the point where a link exits/enters an embedded rectangular child. */
function rectangleLinkEndpoint(
  point: { x: number; y: number },
  toward: { x: number; y: number },
  width: number,
  height: number,
) {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return point;
  const ux = dx / length;
  const uy = dy / length;
  const halfWidth = Math.max(0, width) / 2;
  const halfHeight = Math.max(0, height) / 2;
  const extent = Math.min(
    Math.abs(ux) > 1e-6 ? halfWidth / Math.abs(ux) : Number.POSITIVE_INFINITY,
    Math.abs(uy) > 1e-6 ? halfHeight / Math.abs(uy) : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(extent)) return point;
  return { x: point.x + ux * extent, y: point.y + uy * extent };
}

function nestedFrameLinkEndpoint(
  point: { x: number; y: number },
  toward: { x: number; y: number },
  frame: { shape?: "circle" | "rect"; radius?: number; width: number; height: number },
) {
  if (frame.shape === "circle" && Number.isFinite(frame.radius) && (frame.radius ?? 0) > 0) {
    const dx = toward.x - point.x;
    const dy = toward.y - point.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-6) return { x: point.x + dx / length * frame.radius!, y: point.y + dy / length * frame.radius! };
  }
  return rectangleLinkEndpoint(point, toward, frame.width, frame.height);
}

function nestedFrameExtent(frame: { shape?: "circle" | "rect"; radius?: number; width: number; height: number }) {
  if (frame.shape === "circle" && Number.isFinite(frame.radius) && (frame.radius ?? 0) > 0) return frame.radius!;
  return Math.hypot(Math.max(0, frame.width) / 2, Math.max(0, frame.height) / 2);
}

function numeric(row: Dataset["rows"][number], encoding: ChartEncoding | undefined, fallback = Number.NaN) {
  if (!encoding) return fallback;
  const value = Number(row[encoding.field] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function sharedConfig(input: GenericRenderInput, preferredRole?: string) {
  return input.chartSpec.markGroups?.find((group) => group.role === preferredRole)?.sharedConfig
    ?? input.chartSpec.markGroups?.[0]?.sharedConfig
    ?? {};
}

function finiteDomain(values: number[], fallback: [number, number] = [0, 1]): [number, number] {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return fallback;
  const domain: [number, number] = [Math.min(...clean), Math.max(...clean)];
  if (domain[0] === domain[1]) {
    const delta = Math.abs(domain[0]) * 0.01 || 1;
    domain[0] -= delta;
    domain[1] += delta;
  }
  return domain;
}

function scaleForEncoding(rows: Dataset["rows"], encoding: ChartEncoding, range: [number, number]) {
  if (encoding.type === "nominal" || encoding.type === "ordinal") {
    const domain = Array.from(new Set(rows.map((row) => row[encoding.field] ?? "")));
    const scale = scalePoint<string>().domain(domain).range(range).padding(0.5);
    return {
      scale: (value: string) => scale(value) ?? range[0],
      spec: { type: "point" as const, domain, range },
    };
  }
  const values = rows.map((row) => encoding.type === "temporal"
    ? Date.parse(row[encoding.field] ?? "")
    : Number(row[encoding.field] ?? ""));
  const domain = finiteDomain(values);
  if (encoding.type === "temporal") {
    const dateDomain = domain.map((value) => new Date(value)) as [Date, Date];
    const scale = scaleUtc().domain(dateDomain).range(range);
    return {
      scale: (value: string) => scale(new Date(value)),
      spec: { type: "utc" as const, domain: dateDomain.map((value) => value.toISOString()) as [string, string], range },
    };
  }
  const scale = scaleLinear().domain(domain).range(range);
  return {
    scale: (value: string) => scale(Number(value)),
    spec: { type: "linear" as const, domain, range },
  };
}

function areaValuePosition(spec: ChartScaleSpec, value: number) {
  if (spec.type !== "linear") return spec.range[0] ?? 0;
  return scaleLinear().domain(spec.domain as [number, number]).range(spec.range)(value);
}

function areaAxisPosition(spec: ChartScaleSpec, value: string) {
  if (spec.type === "utc") {
    return scaleUtc()
      .domain((spec.domain as [string, string]).map((item) => new Date(item)) as [Date, Date])
      .range(spec.range)(new Date(value));
  }
  if (spec.type === "point") {
    return scalePoint<string>()
      .domain(spec.domain as string[])
      .range(spec.range)
      .padding(0.5)(value) ?? 0;
  }
  return scaleLinear().domain(spec.domain as [number, number]).range(spec.range)(Number(value));
}

function areaPath(
  points: Array<{ x: number; y: number }>,
  axisSwapped: boolean,
  baseline: number,
  progressionRange?: [number, number],
) {
  if (points.length === 0) return "";
  // Area marks are visually cleaner when they enter and leave through the
  // zero baseline. These synthetic points belong to the rendered geometry
  // only; source rows and row-key metadata remain unchanged.
  const extendedPoints = progressionRange
    ? axisSwapped
      ? [
        { x: baseline, y: progressionRange[0] },
        ...points,
        { x: baseline, y: progressionRange[1] },
      ]
      : [
        { x: progressionRange[0], y: baseline },
        ...points,
        { x: progressionRange[1], y: baseline },
      ]
    : points;
  return axisSwapped
    ? d3Area<{ x: number; y: number }>()
      .y((point) => point.y)
      .x0(baseline)
      .x1((point) => point.x)
      .curve(curveBasis)(extendedPoints) ?? ""
    : d3Area<{ x: number; y: number }>()
      .x((point) => point.x)
      .y0(baseline)
      .y1((point) => point.y)
      .curve(curveBasis)(extendedPoints) ?? "";
}

function formatTick(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, notation: Math.abs(value) >= 10000 ? "compact" : "standard" }).format(value);
}

function renderArea(input: GenericRenderInput) {
  const type = normalizedType(input.chartSpec.chartType);
  if (type === "areachart") {
    if (input.coordinateGuide?.type !== "Cartesian") {
      throw new Error("Area Chart requires a Cartesian coordinate guide.");
    }
    const lineResult = renderLineChart({
      ...input,
      coordinateGuide: input.coordinateGuide,
      chartSpec: { ...input.chartSpec, chartType: "LineGraph" },
      includeZeroValueDomain: true,
      plotAspectRatio: 2,
    });
    const axisSwapped = input.chartSpec.axisSwapped === true;
    const valueScale = axisSwapped ? lineResult.scales.x : lineResult.scales.y;
    const progressionScale = axisSwapped ? lineResult.scales.y : lineResult.scales.x;
    const baseline = areaValuePosition(valueScale, 0);
    const opacity = Number(sharedConfig(input, "area").opacity ?? 0.42);
    const marks = lineResult.series.map((series) => {
      const points = series.points.map(({ x, y }) => ({ x, y }));
      const path = areaPath(points, axisSwapped, baseline, progressionScale.range);
      if (!path) return "";
      const rowKeys = series.points.flatMap((point) => point.rowKeys);
      return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(series.key)}" data-point-count="${points.length}" data-zero-endpoints="true" data-row-keys="${esc(rowKeys.join(","))}" d="${path}" fill="${esc(series.color)}" fill-opacity="${opacity}" stroke="${esc(series.color)}" stroke-width="${series.lineWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"><title>${esc(series.key === "__single__" ? (cartesianAxisEncoding(input.chartSpec, "y")?.field ?? "") : series.key)}</title></path>`;
    }).join("");
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="area" data-axis-swapped="${axisSwapped}" data-area-curve="basis" data-renderer="deterministic-area@1">${marks}</g>`,
      plotArea: lineResult.plotArea,
      scales: lineResult.scales,
    };
  }
  const xEncoding = input.chartSpec.encodings.x;
  const yEncoding = input.chartSpec.encodings.y;
  if (!xEncoding || !yEncoding) throw new Error("Area renderer requires X and Y encodings.");
  const isHorizon = type.includes("horizon");
  const isStacked = type.includes("stacked") || type.includes("stream");
  const isStream = type.includes("stream");
  const seriesEncoding = input.chartSpec.encodings.color;
  const rows = input.dataset.rows.filter((row) => Number.isFinite(numeric(row, yEncoding)) && (row[xEncoding.field] ?? "") !== "");
  const hasExplicitAggregation = input.chartSpec.aggregations?.y !== undefined
    || Object.keys(input.chartSpec.dimensionAggregations ?? {}).length > 0;
  const seriesValues = seriesEncoding
    ? Array.from(new Set(rows.map((row) => row[seriesEncoding.field] ?? "")))
    : ["__single__"];
  const xValues = Array.from(new Set(rows.map((row) => row[xEncoding.field] ?? ""))).sort((left, right) => {
    if (xEncoding.type === "temporal") return Date.parse(left) - Date.parse(right);
    if (xEncoding.type === "quantitative") return Number(left) - Number(right);
    return left.localeCompare(right, "en", { numeric: true });
  });
  const orderedRows = [...rows].sort((left, right) => {
    const leftValue = left[xEncoding.field] ?? "";
    const rightValue = right[xEncoding.field] ?? "";
    if (xEncoding.type === "temporal") return Date.parse(leftValue) - Date.parse(rightValue);
    if (xEncoding.type === "quantitative") return Number(leftValue) - Number(rightValue);
    return leftValue.localeCompare(rightValue, "en", { numeric: true });
  });
  // Multi-series stacks require one aligned column per X. Summing repeated
  // X-series cells follows the area contract's allowed aggregation policy.
  const table = hasExplicitAggregation || isHorizon || isStacked
    ? (() => {
      const valueBySeries = new Map(seriesValues.map((series) => [series, new Map<string, number>()]));
      rows.forEach((row) => {
        const series = seriesEncoding ? row[seriesEncoding.field] ?? "" : "__single__";
        const xValue = row[xEncoding.field] ?? "";
        const values = valueBySeries.get(series);
        if (values) values.set(xValue, (values.get(xValue) ?? 0) + numeric(row, yEncoding, 0));
      });
      return xValues.map((xValue) => Object.fromEntries([
        ["x", xValue],
        ...seriesValues.map((series) => [series, valueBySeries.get(series)?.get(xValue) ?? 0]),
      ])) as Array<Record<string, string | number>>;
    })()
    : orderedRows.map((row) => {
      const series = seriesEncoding ? row[seriesEncoding.field] ?? "" : "__single__";
      const xValue = row[xEncoding.field] ?? "";
      return Object.fromEntries([
        ["x", xValue],
        ...seriesValues.map((candidate) => [candidate, candidate === series ? numeric(row, yEncoding, 0) : 0]),
      ]) as Record<string, string | number>;
    });

  if (isHorizon) {
    const marginTop = 30;
    const marginRight = 10;
    const marginLeft = 10;
    const availableHeight = Math.max(1, input.height - marginTop);
    const size = availableHeight / Math.max(1, seriesValues.length);
    const padding = Math.min(1, size * 0.08);
    const width = input.width;
    const bands = Math.max(1, Math.min(9, Math.round(Number(sharedConfig(input, "area").bands ?? 7))));
    const maximum = Math.max(1, ...table.flatMap((datum) => seriesValues.map((series) => Number(datum[series] ?? 0))));
    const x = scaleForEncoding(rows, xEncoding, [input.minX, input.minX + width]);
    const y = scaleLinear().domain([0, maximum]).range([size, size - bands * (size - padding)]);
    const area = d3Area<Record<string, string | number>>()
      .defined((datum) => Number.isFinite(Number(datum.value)))
      .x((datum) => x.scale(String(datum.x ?? "")))
      .y0(size)
      .y1((datum) => y(Number(datum.value)))
      .curve(curveBasis);
    const uid = `horizon-${input.chartId.replace(/[^a-z0-9_-]/gi, "-")}`;
    const seriesGroups = seriesValues.map((series, seriesIndex) => {
      const top = input.minY + marginTop + seriesIndex * size;
      const pathId = `${uid}-path-${seriesIndex}`;
      const clipId = `${uid}-clip-${seriesIndex}`;
      const data = table.map((datum) => ({ x: datum.x ?? "", value: Number(datum[series] ?? 0) }));
      const uses = d3Range(bands).map((band) => `<use href="#${pathId}" fill="${globalGradientColor((band + 1) / bands, [0, 1])}" transform="translate(0 ${band * size})"/>`).join("");
      const seriesLabel = series === "__single__" ? yEncoding.field : series;
      const label = adaptiveText(seriesLabel, `x="${input.minX + 4}" y="${(size + padding) / 2}" dy="0.35em"`, width * 0.32, Math.max(8, size), "#ffffff");
      return `<g transform="translate(0 ${top})"><defs><clipPath id="${clipId}"><rect x="${input.minX}" y="${padding}" width="${width}" height="${Math.max(0, size - padding)}"/></clipPath><path id="${pathId}" d="${area(data) ?? ""}"/></defs><g clip-path="url(#${clipId})" data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(series)}">${uses}</g>${label}</g>`;
    }).join("");
    const temporalDomain = x.spec.domain as [string, string] | [number, number];
    const start = new Date(temporalDomain[0]);
    const end = new Date(temporalDomain[1]);
    const tickCount = Math.max(2, Math.floor(width / 80));
    const axisTicks = xEncoding.type === "temporal"
      ? scaleUtc().domain([start, end]).range([input.minX, input.minX + width]).ticks(tickCount).map((value) => ({
        position: x.scale(value.toISOString()),
        label: value.toLocaleString("en-US", { month: "short", year: start.getUTCFullYear() === end.getUTCFullYear() ? undefined : "numeric", timeZone: "UTC" }),
      }))
      : ticks(Number(temporalDomain[0]), Number(temporalDomain[1]), tickCount).map((value) => ({ position: x.scale(String(value)), label: formatTick(value) }));
    const visibleTicks = axisTicks.filter((tick) => tick.position >= input.minX + marginLeft && tick.position < input.minX + width - marginRight);
    const axisFontSize = adaptiveAxisFontSize(visibleTicks.map((tick) => tick.label), visibleTicks.map((tick) => tick.position), 10, 6, 10);
    const axis = visibleTicks.map((tick) => `<g class="tick" transform="translate(${tick.position} ${input.minY + marginTop})"><line y2="-6" stroke="currentColor"/>${adaptiveText(tick.label, `y="-9" text-anchor="middle"`, Math.max(12, width / Math.max(visibleTicks.length, 1)), 16, "#ffffff", axisFontSize)}</g>`).join("");
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="horizon" data-area-curve="basis" data-bands="${bands}" data-renderer="observable-horizon@2" font-family="sans-serif">${seriesGroups}<g data-mark-role="horizon-axis">${axis}</g></g>`,
      plotArea: { x: input.minX, y: input.minY + marginTop, width, height: availableHeight },
    };
  }

  if (input.coordinateGuide?.type !== "Cartesian") {
    throw new Error("Stacked Area and Streamgraph require a Cartesian coordinate guide.");
  }
  const lineResult = renderLineChart({
    ...input,
    coordinateGuide: input.coordinateGuide,
    chartSpec: { ...input.chartSpec, chartType: "MultiLineChart" },
    includeZeroValueDomain: true,
    plotAspectRatio: 2,
  });
  // With one selected series, stacked area is the same visual contract as a
  // line with a filled baseline. Reuse the line's ordered points so duplicate
  // X rows follow the same path instead of entering d3.stack as duplicate
  // columns.
  if (seriesValues.length === 1 && !isStream) {
    const axisSwapped = input.chartSpec.axisSwapped === true;
    const valueScale = axisSwapped ? lineResult.scales.x : lineResult.scales.y;
    const progressionScale = axisSwapped ? lineResult.scales.y : lineResult.scales.x;
    const baseline = areaValuePosition(valueScale, 0);
    const series = lineResult.series[0];
    if (series) {
      const path = areaPath(series.points.map(({ x, y }) => ({ x, y })), axisSwapped, baseline, progressionScale.range);
      const rowKeys = series.points.flatMap((point) => point.rowKeys);
      const opacity = Number(sharedConfig(input, "area").opacity ?? 0.42);
      const mark = `<path data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(series.key)}" data-point-count="${series.points.length}" data-zero-endpoints="true" data-row-keys="${esc(rowKeys.join(","))}" d="${path}" fill="${esc(series.color)}" fill-opacity="${opacity}" stroke="${esc(series.color)}" stroke-width="${series.lineWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"><title>${esc(series.key === "__single__" ? yEncoding.field : series.key)}</title></path>`;
      return {
        content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="${isStream ? "streamgraph" : isStacked ? "stacked" : "area"}" data-axis-swapped="${axisSwapped}" data-stack-offset="${isStream ? "silhouette" : "zero"}" data-stack-order="${isStream ? "inside-out" : "none"}" data-area-curve="basis" data-renderer="observable-area@3">${mark}</g>`,
        plotArea: lineResult.plotArea,
        scales: lineResult.scales,
      };
    }
  }
  const areaPlot = lineResult.plotArea;
  const axisSwapped = input.chartSpec.axisSwapped === true;
  const progressionScale = axisSwapped ? lineResult.scales.y : lineResult.scales.x;
  const progressionPosition = (value: string) => areaAxisPosition(progressionScale, value);
  const stackGenerator = stack<Record<string, string | number>>().keys(seriesValues);
  // A silhouette offset centers the total stream thickness at every
  // progression value. Wiggle minimizes baseline movement but intentionally
  // does not produce a symmetric stream.
  if (isStream) stackGenerator.offset(stackOffsetSilhouette).order(stackOrderInsideOut);
  const layers = isStacked
    ? stackGenerator(table)
    : seriesValues.map((series) => table.map((datum) => [0, Number(datum[series] ?? 0)] as [number, number]));
  const stackedValues = layers.flatMap((layer) => layer.flatMap((point) => [point[0], point[1]]));
  const yDomain: [number, number] = isStream
    ? finiteDomain(stackedValues)
    : [0, Math.max(1, ...stackedValues)];
  const sharedValueScale = axisSwapped ? input.sharedScales?.x : input.sharedScales?.y;
  const valueRange = axisSwapped ? lineResult.scales.x.range : lineResult.scales.y.range;
  const valueScale: ChartScaleSpec = sharedValueScale?.type === "linear"
    ? sharedValueScale
    : { type: "linear", domain: yDomain, range: valueRange };
  const valuePosition = (value: number) => areaValuePosition(valueScale, value);
  const area = axisSwapped
    ? d3Area<[number, number]>()
      .y((_, index) => index === 0
        ? progressionScale.range[0]
        : index === table.length + 1
          ? progressionScale.range[1]
          : progressionPosition(String(table[index - 1]?.x ?? "")))
      .x0((point) => valuePosition(point[0]))
      .x1((point) => valuePosition(point[1]))
    : d3Area<[number, number]>()
      .x((_, index) => index === 0
        ? progressionScale.range[0]
        : index === table.length + 1
          ? progressionScale.range[1]
          : progressionPosition(String(table[index - 1]?.x ?? "")))
      .y0((point) => valuePosition(point[0]))
      .y1((point) => valuePosition(point[1]));
  area.curve(curveBasis);
  const marks = layers.map((layer, index) => {
    const color = !isStacked && seriesValues.length === 1 ? "steelblue" : tableau[index % tableau.length]!;
    // Silhouette streams use a centered value domain, so its visual zero
    // baseline is the lower domain edge rather than numeric zero. Stacked
    // areas retain the ordinary numeric-zero baseline.
    const endpointValue = isStream ? yDomain[0] : 0;
    const extendedLayer: Array<[number, number]> = [[endpointValue, endpointValue], ...(layer as Array<[number, number]>), [endpointValue, endpointValue]];
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(seriesValues[index] ?? "")}" data-point-count="${layer.length}" data-zero-endpoints="true" d="${area(extendedLayer) ?? ""}" fill="${color}"><title>${esc(seriesValues[index] === "__single__" ? yEncoding.field : seriesValues[index] ?? "")}</title></path>`;
  }).join("");
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="${isStream ? "streamgraph" : isStacked ? "stacked" : "area"}" data-axis-swapped="${axisSwapped}" data-stack-offset="${isStream ? "silhouette" : "zero"}" data-stack-order="${isStream ? "inside-out" : "none"}" data-area-curve="basis" data-renderer="observable-area@3">${marks}</g>`,
    plotArea: areaPlot,
    scales: axisSwapped
      ? { x: valueScale, y: progressionScale }
      : { x: progressionScale, y: valueScale },
  };
}

function renderParallel(input: GenericRenderInput) {
  const fields = input.chartSpec.parallelFields ?? [];
  if (fields.length < 2) throw new Error("Parallel Coordinates requires at least two dimensions.");
  const marginTop = 22;
  const marginRight = 18;
  const marginBottom = 24;
  const marginLeft = 18;
  const area = {
    x: input.minX + marginLeft,
    y: input.minY + marginTop,
    width: Math.max(1, input.width - marginLeft - marginRight),
    height: Math.max(1, input.height - marginTop - marginBottom),
  };
  const x = scalePoint<string>().domain(fields.map((field) => field.field)).range([area.x, area.x + area.width]).padding(0.35);
  type ParallelAxis = {
    scale: "linear" | "point" | "utc";
    domain: string[];
    position: (row: Dataset["rows"][number]) => number;
    ticks: Array<{ label: string; position: number }>;
  };
  const tickCount = Math.max(3, Math.floor(area.height / 44));
  const axesByField = new Map<string, ParallelAxis>();
  fields.forEach((field) => {
    const categorical = field.type === "nominal" || field.type === "ordinal";
    if (categorical) {
      const domain = Array.from(new Set(input.dataset.rows.map((row) => row[field.field] ?? "")));
      const scale = scalePoint<string>().domain(domain).range([area.y + area.height, area.y]).padding(0.8);
      axesByField.set(field.field, {
        scale: "point",
        domain,
        position: (row) => scale(row[field.field] ?? "") ?? Number.NaN,
        ticks: domain.flatMap((value) => {
          const position = scale(value);
          return position === undefined ? [] : [{ label: value, position }];
        }),
      });
      return;
    }
    if (field.type === "temporal") {
      const dataDomain = finiteDomain(input.dataset.rows.map((row) => Date.parse(row[field.field] ?? "")));
      const span = dataDomain[1] - dataDomain[0];
      const padding = span > 0 ? span * 0.06 : 86_400_000;
      const domain: [Date, Date] = [new Date(dataDomain[0] - padding), new Date(dataDomain[1] + padding)];
      const scale = scaleUtc().domain(domain).range([area.y + area.height, area.y]);
      axesByField.set(field.field, {
        scale: "utc",
        domain: domain.map((value) => value.toISOString().slice(0, 10)),
        position: (row) => {
          const value = Date.parse(row[field.field] ?? "");
          return Number.isFinite(value) ? scale(new Date(value)) : Number.NaN;
        },
        ticks: scale.ticks(tickCount).map((value) => ({
          label: value.toISOString().slice(0, 10),
          position: scale(value),
        })),
      });
      return;
    }
    const dataDomain = finiteDomain(input.dataset.rows.map((row) => numeric(row, field)));
    const span = dataDomain[1] - dataDomain[0];
    const padding = span > 0 ? span * 0.06 : Math.max(1, Math.abs(dataDomain[0]) * 0.06);
    const domain: [number, number] = [dataDomain[0] - padding, dataDomain[1] + padding];
    const scale = scaleLinear().domain(domain).range([area.y + area.height, area.y]);
    axesByField.set(field.field, {
      scale: "linear",
      domain: domain.map(formatTick),
      position: (row) => scale(numeric(row, field)),
      ticks: scale.ticks(tickCount).map((value) => ({ label: formatTick(value), position: scale(value) })),
    });
  });
  const colorEncoding = input.chartSpec.encodings.color;
  const colorField = colorEncoding?.field ?? fields[0]!.field;
  const colorValues = input.dataset.rows.map((row) => Number(row[colorField] ?? "")).filter(Number.isFinite);
  const sequential = scaleSequential((value) => globalGradientColor(1 - value, [0, 1])).domain(finiteDomain(colorValues));
  const categories = colorEncoding?.type === "nominal" || colorEncoding?.type === "ordinal"
    ? Array.from(new Set(input.dataset.rows.map((row) => row[colorField] ?? "")))
    : [];
  const ordinal = scaleOrdinal<string, string>().domain(categories).range(tableau);
  const line = d3Line<[string, number]>()
    .defined(([, value]) => Number.isFinite(value))
    .x(([field]) => x(field) ?? area.x)
    .y(([, value]) => value);
  const sortedRows = input.dataset.rows.slice().sort((left, right) => Number(left[colorField] ?? 0) - Number(right[colorField] ?? 0));
  const paths = sortedRows.map((row) => {
    const index = input.dataset.rows.indexOf(row);
    const points = fields.map((field) => [field.field, axesByField.get(field.field)?.position(row) ?? Number.NaN] as [string, number]);
    const stroke = colorEncoding?.type === "nominal" || colorEncoding?.type === "ordinal" ? ordinal(row[colorField] ?? "") : sequential(Number(row[colorField] ?? 0));
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="path" data-mark-group-id="mark-group:${esc(input.chartId)}:path" data-row-key="${esc(rowKey(input.dataset, row, index))}" d="${line(points) ?? ""}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-opacity="0.4"/>`;
  }).join("");
  const axes = fields.map((field) => {
    const axis = axesByField.get(field.field)!;
    const axisX = x(field.field) ?? area.x;
    const tickFontSize = adaptiveAxisFontSize(axis.ticks.map((tick) => tick.label), axis.ticks.map((tick) => tick.position), 7, 5, 7);
    const tickMarks = axis.ticks.map((tick) => {
      return `<g class="tick" data-tick-kind="${axis.scale === "point" ? "category" : "value"}" transform="translate(${axisX} ${tick.position})"><line x1="-3" x2="3" stroke="currentColor"/>${adaptiveText(tick.label, `x="6" y="2.5" text-anchor="start"`, 54, Math.max(10, area.height / 7), "#ffffff", tickFontSize)}</g>`;
    }).join("");
    const titleFontSize = adaptiveAxisFontSize(fields.map((item) => item.field), fields.map((item) => x(item.field) ?? area.x), 8, 6, 8);
    const axisLine = axis.scale === "point"
      ? `<line x1="${axisX}" x2="${axisX}" y1="${area.y}" y2="${area.y + area.height}" stroke="currentColor" stroke-dasharray="2 3"/>`
      : `<line x1="${axisX}" x2="${axisX}" y1="${area.y}" y2="${area.y + area.height}" stroke="currentColor"/>`;
    const axisLabel = `<text data-mark-role="parallel-axis-title" x="${axisX}" y="${area.y - 8}" text-anchor="middle" fill="currentColor" font-size="${titleFontSize}">${esc(field.field)}</text>`;
    return `<g data-mark-role="parallel-axis" data-field="${esc(field.field)}" data-axis-scale="${axis.scale}">${axisLine}${tickMarks}${axisLabel}<title>${axis.domain.join(" - ")}</title></g>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="parallel" data-axis-orientation="vertical" data-renderer="observable-parallel@2" font-family="sans-serif">${paths}${axes}</g>`, plotArea: area };
}

function hierarchyRoot(input: GenericRenderInput) {
  const keyEncoding = input.chartSpec.encodings.key;
  const parentEncoding = input.chartSpec.encodings.parent;
  const valueEncoding = input.chartSpec.encodings.value ?? input.chartSpec.encodings.size;
  if (!keyEncoding || !parentEncoding) throw new Error("Hierarchy renderer requires Node ID and Parent ID encodings.");
  const rows = input.dataset.rows.filter((row) => (row[keyEncoding.field] ?? "").trim());
  const ids = new Set(rows.map((row) => row[keyEncoding.field] ?? ""));
  const roots = rows.filter((row) => !ids.has(row[parentEncoding.field] ?? ""));
  const normalized = roots.length === 1 ? rows : [
    { [keyEncoding.field]: "__root__", [parentEncoding.field]: "", ...(valueEncoding ? { [valueEncoding.field]: "0" } : {}) },
    ...rows.map((row) => roots.includes(row) ? { ...row, [parentEncoding.field]: "__root__" } : row),
  ];
  const root = stratify<Dataset["rows"][number]>()
    .id((row) => row[keyEncoding.field] ?? "")
    .parentId((row) => row[parentEncoding.field] || null)(normalized)
    .sum((row) => valueEncoding ? Math.max(0, numeric(row, valueEncoding, 0)) : 1);
  return { root, synthetic: roots.length !== 1 };
}

function topAncestorColor<T extends { depth: number; parent: T | null; id?: string }>(node: T, color: (name: string) => string) {
  if (!node.depth) return "#ccc";
  let ancestor = node;
  while (ancestor.depth > 1 && ancestor.parent) ancestor = ancestor.parent;
  return color(ancestor.id ?? "");
}

function renderHierarchy(input: GenericRenderInput) {
  const type = normalizedType(input.chartSpec.chartType);
  const area = plotArea(input, 4);
  const { root, synthetic } = hierarchyRoot(input);
  const nodeConfig = sharedConfig(input, "node");
  const colorEncoding = input.chartSpec.encodings.color;
  const sizeEncoding = input.chartSpec.encodings.size;
  const colorValues = colorEncoding
    ? root.descendants().map((node) => node.data[colorEncoding.field] ?? "")
    : [];
  const colorDomain = colorEncoding?.type === "quantitative"
    ? finiteDomain(colorValues.map((value) => Number(value)))
    : Array.from(new Set(colorValues));
  const ordinalNodeColor = colorEncoding && colorEncoding.type !== "quantitative"
    ? scaleOrdinal<string, string>().domain(colorDomain as string[]).range(tableau)
    : null;
  const sequentialNodeColor = colorEncoding?.type === "quantitative"
    ? scaleSequential((value) => globalGradientColor(value, [0, 1])).domain(colorDomain as [number, number])
    : null;
  const sizeDomain = sizeEncoding
    ? finiteDomain(root.descendants().map((node) => Number(node.data[sizeEncoding.field] ?? "")))
    : [0, 1] as [number, number];
  const nodeRadius = (node: { data: Dataset["rows"][number] }) => {
    if (!sizeEncoding) {
      const configured = Number(nodeConfig.size);
      return Number.isFinite(configured) ? Math.max(1, Math.min(48, configured)) : 2.5;
    }
    const value = Number(node.data[sizeEncoding.field] ?? "");
    return Number.isFinite(value) && sizeDomain[1] > sizeDomain[0]
      ? scaleLinear().domain(sizeDomain).range([2, 8]).clamp(true)(value)
      : 2.5;
  };
  const nodeColor = (node: { data: Dataset["rows"][number] }, fallback: string) => {
    if (!colorEncoding) return typeof nodeConfig.color === "string" ? nodeConfig.color : fallback;
    const value = node.data[colorEncoding.field] ?? "";
    if (sequentialNodeColor) {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? sequentialNodeColor(numericValue) : fallback;
    }
    return ordinalNodeColor?.(value) ?? fallback;
  };
  const nodeLabelsVisible = nodeConfig.nodeLabelsVisible !== false;
  const topNames = root.children?.map((node) => node.id ?? "") ?? [];
  const rainbow = scaleOrdinal<string, string>().domain(topNames).range(tableau);
  const visible = <T extends { id?: string }>(node: T) => !(synthetic && node.id === "__root__");
  const direction = cartesianTreeDirection(input.chartSpec);

  if (type.includes("radialdendrogram")) {
    const keyEncoding = input.chartSpec.encodings.key;
    const parentEncoding = input.chartSpec.encodings.parent;
    const thetaEncoding = input.chartSpec.encodings.theta ?? input.chartSpec.encodings.angle;
    if (!keyEncoding || !parentEncoding) {
      throw new Error("Radial Dendrogram renderer requires Node ID and Parent ID encodings.");
    }
    const guide = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide : null;
    const cx = guide?.origin.x ?? input.minX + input.width / 2;
    const cy = guide?.origin.y ?? input.minY + input.height / 2;
    const configuredLeafRadius = Number(nodeConfig.leafRadius ?? RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS);
    const baseLeafRadius = Math.max(
      8,
      (Number.isFinite(configuredLeafRadius)
        ? configuredLeafRadius
        : RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS)
        * (guide?.radiusScale ?? 1),
    );
    const innerRatio = Math.max(0, Math.min(guide?.innerRadiusRatio ?? 0, 0.98));
    const outerRatio = Math.max(innerRatio + 0.01, Math.min(guide?.outerRadiusRatio ?? 1, 1));
    const innerRadius = baseLeafRadius * innerRatio;
    const leafRadius = baseLeafRadius * outerRatio;
    const selectionRadius = leafRadius + RADIAL_DENDROGRAM_SELECTION_PADDING;
    const angleSpan = Math.max(1, Math.min(guide?.angleSpan ?? 360, 360));
    let renderedAngleSpan = angleSpan;
    const angleOffset = guide?.angleOffset ?? 0;
    const startAngle = (-270 + angleOffset) * Math.PI / 180;
    const spanRadians = angleSpan * Math.PI / 180;
    const radial = createRadialClusterLayout(input.dataset, {
      keyField: keyEncoding.field,
      parentField: parentEncoding.field,
      orderField: thetaEncoding?.field,
      startAngle,
      angleSpan: spanRadians,
      innerRadius,
      outerRadius: leafRadius,
    });
    const radialRoot = radial.root;
    const radialLeaves = radialRoot.leaves().filter(radial.visible) as RadialClusterNode[];
    const radialFrameFor = (node: RadialClusterNode) => nestedChildFrame(input, {
      rowKey: rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)),
      nodeKey: node.id,
      role: "node",
      index: node.data ? input.dataset.rows.indexOf(node.data) : undefined,
      markGroupId: `mark-group:${input.chartId}:node`,
    });
    const radialFrames = radialLeaves.map(radialFrameFor);
    const allRadialFrameRequirements = (radialRoot.descendants() as RadialClusterNode[]).flatMap((node) => {
      const frame = radialFrameFor(node);
      return frame ? [{ frame, radius: Math.max(1, node.y) }] : [];
    });
    if (allRadialFrameRequirements.length > 0 && radialLeaves.length > 1) {
      const baseStep = spanRadians / (radialLeaves.length - 1);
      const requiredStep = Math.max(
        baseStep,
        ...allRadialFrameRequirements.map(({ frame, radius }) =>
          2 * Math.asin(Math.min(0.98, nestedFrameExtent(frame) / radius)) + 0.08),
      );
      const expandedSpan = Math.max(spanRadians, requiredStep * (radialLeaves.length - 1));
      renderedAngleSpan = expandedSpan * 180 / Math.PI;
      const first = startAngle - (expandedSpan - spanRadians) / 2;
      radialLeaves.forEach((node, index) => {
        node.x = first + expandedSpan * index / Math.max(1, radialLeaves.length - 1);
      });
      radialRoot.eachAfter((node) => {
        if (!node.children?.length) return;
        const children = node.children as RadialClusterNode[];
        node.x = children.reduce((sum, child) => sum + child.x, 0) / children.length;
      });
    }
    const nodes = radialRoot.descendants().filter(radial.visible) as RadialClusterNode[];
    const radialLink = linkRadial<any, RadialClusterNode>()
      .angle((node) => node.x)
      .radius((node) => node.y);
    const links = radialRoot.links()
      .filter((link) => radial.visible(link.source) && radial.visible(link.target))
      .map((link) => {
        const sourceFrame = nestedChildFrame(input, {
          rowKey: rowKey(input.dataset, link.source.data, input.dataset.rows.indexOf(link.source.data)),
          nodeKey: link.source.id,
          role: "node",
          index: link.source.data ? input.dataset.rows.indexOf(link.source.data) : undefined,
          markGroupId: `mark-group:${input.chartId}:node`,
        });
        const targetFrame = nestedChildFrame(input, {
          rowKey: rowKey(input.dataset, link.target.data, input.dataset.rows.indexOf(link.target.data)),
          nodeKey: link.target.id,
          role: "node",
          index: link.target.data ? input.dataset.rows.indexOf(link.target.data) : undefined,
          markGroupId: `mark-group:${input.chartId}:node`,
        });
        if (!sourceFrame && !targetFrame) {
          return `<path data-mark-role="link" d="${radialLink(link as any) ?? ""}" fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
        }
        const radialPoint = (node: { x: number; y: number }) => ({
          x: Math.sin(node.x) * node.y,
          y: -Math.cos(node.x) * node.y,
        });
        const boundary = (node: { x: number; y: number }, frame: NonNullable<typeof sourceFrame>, toward: { x: number; y: number }) => {
          const center = radialPoint(node);
          return nestedFrameLinkEndpoint(center, toward, frame);
        };
        const sourceNode = link.source as RadialClusterNode;
        const targetNode = link.target as RadialClusterNode;
        const sourceCenter = radialPoint(sourceNode);
        const targetCenter = radialPoint(targetNode);
        const source = sourceFrame ? boundary(sourceNode, sourceFrame, targetCenter) : sourceCenter;
        const target = targetFrame ? boundary(targetNode, targetFrame, sourceCenter) : targetCenter;
        // Keep controls at or beyond both endpoints so a large embedded child
        // can only push the curve outward, never make it turn back inward.
        const endpointRadius = Math.max(
          sourceNode.y,
          targetNode.y,
          Math.hypot(source.x, source.y),
          Math.hypot(target.x, target.y),
        );
        const midpointRadius = endpointRadius;
        const controlSource = radialPoint({ x: sourceNode.x, y: midpointRadius });
        const controlTarget = radialPoint({ x: targetNode.x, y: midpointRadius });
        const path = `M${source.x},${source.y}C${controlSource.x},${controlSource.y} ${controlTarget.x},${controlTarget.y} ${target.x},${target.y}`;
        return `<path data-mark-role="link" d="${path}" fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
      })
      .join("");
    const marks = nodes.map((node) => {
      const color = nodeColor(node, typeof nodeConfig.color === "string"
        ? nodeConfig.color
        : node.children ? "#555" : "#999");
      const rotation = node.x * 180 / Math.PI - 90;
      return `<circle data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" data-row-key="${esc(rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)))}" data-angle="${node.x}" transform="rotate(${rotation}) translate(${node.y},0)" r="${nodeRadius(node)}" fill="${color}"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("/"))}</title></circle>`;
    }).join("");
    const labels = nodeLabelsVisible ? nodes.map((node) => {
      const onLeft = Math.sin(node.x) < 0;
      const rotation = node.x * 180 / Math.PI - 90;
      const label = node.id || "";
      const labelOnOutside = !onLeft === !node.children;
      const style = adaptiveLabel({ text: label, width: Math.max(12, node.y * 0.35), height: 16, background: "#ffffff", fontSize: 10, minFontSize: 6, maxFontSize: 10, padding: 1 });
      return style.text
        ? `<text data-mark-role="node-label" transform="rotate(${rotation}) translate(${node.y},0) rotate(${onLeft ? 180 : 0})" dy="0.31em" x="${labelOnOutside ? 6 : -6}" text-anchor="${labelOnOutside ? "start" : "end"}" paint-order="stroke" stroke="white" stroke-width="3" stroke-linejoin="round" fill="${style.color}" font-size="${style.fontSize}">${esc(style.text)}</text>`
        : "";
    }).join("") : "";
    return {
      content: `<g transform="translate(${cx} ${cy})" data-chart-id="${esc(input.chartId)}" data-chart-type="radial-dendrogram" data-renderer="observable-radial-cluster@3" data-angle-span="${renderedAngleSpan}" data-leaf-radius="${leafRadius}" data-selection-radius="${selectionRadius}">${links}${marks}${labels}</g>`,
      plotArea: { x: cx - leafRadius, y: cy - leafRadius, width: leafRadius * 2, height: leafRadius * 2 },
      polarArea: { startAngle: angleOffset, angleSpan: renderedAngleSpan, innerRadius, outerRadius: leafRadius },
    };
  }

  if (type.includes("treemap")) {
    const tilers = { binary: treemapBinary, squarify: treemapSquarify, "slice-dice": treemapSliceDice, slice: treemapSlice, dice: treemapDice } as const;
    const tileName = String(sharedConfig(input, "node").tile ?? "binary") as keyof typeof tilers;
    const color = scaleOrdinal<string, string>().domain(topNames).range(tableau);
    const vertical = direction === "down" || direction === "up";
    const layoutRoot = treemap<Dataset["rows"][number]>()
      .tile(tilers[tileName] ?? treemapBinary)
      .size(vertical ? [area.height, area.width] : [area.width, area.height])
      .padding(1)
      .round(true)(root.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)));
    const leaves = layoutRoot.leaves().filter(visible).map((node, index) => {
      const rawWidth = Math.max(0, node.x1 - node.x0);
      const rawHeight = Math.max(0, node.y1 - node.y0);
      const x = vertical ? area.x + node.y0 : direction === "left" ? area.x + area.width - node.x1 : area.x + node.x0;
      const y = vertical ? direction === "up" ? area.y + area.height - node.x1 : area.y + node.x0 : area.y + node.y0;
      const width = vertical ? rawHeight : rawWidth;
      const height = vertical ? rawWidth : rawHeight;
      const clipId = `treemap-${input.chartId.replace(/[^a-z0-9_-]/gi, "-")}-${index}`;
      const labelLines = (node.id ?? "").split(/(?=[A-Z][a-z])|\s+/g).filter(Boolean).concat(formatTick(node.value ?? 0));
      const fill = nodeColor(node, topAncestorColor(node, color));
      const labelPadding = 4;
      const lineHeight = 1.2;
      const availableWidth = Math.max(0, width - labelPadding * 2);
      const availableHeight = Math.max(0, height - labelPadding * 2);
      const preferredFontSize = 10;
      const widestLine = Math.max(...labelLines.map((line) => measureLabelWidth(line, preferredFontSize)), 0);
      const widthBound = widestLine > 0 ? preferredFontSize * availableWidth / widestLine : preferredFontSize;
      const heightBound = labelLines.length > 0 ? availableHeight / (labelLines.length * lineHeight) : preferredFontSize;
      // Labels that cannot remain legible inside their own tile are omitted;
      // the clip path remains a final guard against font-rendering differences.
      const fontSize = Math.floor(Math.min(preferredFontSize, widthBound, heightBound) * 10) / 10;
      const labels = fontSize >= 5
        ? labelLines.map((line, lineIndex) => {
          const lineCenter = height / 2 + (lineIndex - (labelLines.length - 1) / 2) * fontSize * lineHeight;
          return `<tspan x="${width / 2}" y="${lineCenter}" fill-opacity="${lineIndex === labelLines.length - 1 ? 0.7 : 1}">${esc(line)}</tspan>`;
        }).join("")
        : "";
      const label = labels
        ? `<text data-mark-role="node-label" clip-path="url(#${clipId})" x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${fontSize}" fill="${readableTextColor(fill)}">${labels}</text>`
        : "";
      return `<g transform="translate(${x} ${y})" data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" data-row-key="${esc(rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)))}"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("."))}\n${formatTick(node.value ?? 0)}</title><rect width="${width}" height="${height}" fill="${fill}" fill-opacity="0.6"/><clipPath id="${clipId}"><rect width="${width}" height="${height}"/></clipPath>${nodeLabelsVisible ? label : ""}</g>`;
    }).join("");
    return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="treemap" data-tile="${esc(tileName)}" data-tree-direction="${direction}" data-renderer="observable-treemap@2">${leaves}</g>`, plotArea: area };
  }

  if (type.includes("sunburst")) {
    const guide = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide : null;
    const cx = guide?.origin.x ?? area.x + area.width / 2;
    const cy = guide?.origin.y ?? area.y + area.height / 2;
    const radius = Math.max(1, Math.min(area.width, area.height) / 2 * (guide?.radiusScale ?? 1));
    const layoutRoot = partition<Dataset["rows"][number]>().size([Math.PI * 2, radius])(root.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)));
    type Node = ReturnType<typeof layoutRoot.descendants>[number];
    const arc = d3Arc<Node>()
      .startAngle((node) => node.x0)
      .endAngle((node) => node.x1)
      .padAngle((node) => Math.min((node.x1 - node.x0) / 2, 0.005))
      .padRadius(radius / 2)
      .innerRadius((node) => node.y0)
      .outerRadius((node) => Math.max(node.y0, node.y1 - 1));
    const nodes = layoutRoot.descendants().filter((node) => node.depth && visible(node));
    const marks = nodes.map((node) => `<path data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" data-row-key="${esc(rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)))}" d="${arc(node) ?? ""}" fill="${nodeColor(node, topAncestorColor(node, rainbow))}" fill-opacity="0.6"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("/"))}\n${formatTick(node.value ?? 0)}</title></path>`).join("");
    const labels = nodeLabelsVisible ? nodes.filter((node) => ((node.y0 + node.y1) / 2) * (node.x1 - node.x0) > 10).map((node) => {
      const angle = (node.x0 + node.x1) / 2 * 180 / Math.PI;
      const radiusPosition = (node.y0 + node.y1) / 2;
      const label = node.id ?? "";
      const style = adaptiveLabel({ text: label, width: Math.max(8, radiusPosition * (node.x1 - node.x0)), height: 16, background: nodeColor(node, topAncestorColor(node, rainbow)), fontSize: 10, minFontSize: 5, maxFontSize: 10, padding: 1 });
      return style.text
        ? `<text transform="rotate(${angle - 90}) translate(${radiusPosition} 0) rotate(${angle < 180 ? 0 : 180})" dy="0.35em" text-anchor="middle" font-size="${style.fontSize}" font-family="sans-serif" fill="${style.color}">${esc(style.text)}</text>`
        : "";
    }).join("") : "";
    return {
      content: `<g transform="translate(${cx} ${cy})" data-chart-id="${esc(input.chartId)}" data-chart-type="sunburst" data-renderer="observable-sunburst@2">${marks}<g pointer-events="none">${labels}</g></g>`,
      plotArea: { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 },
      polarArea: { startAngle: 0, angleSpan: 360, innerRadius: 0, outerRadius: radius },
    };
  }

  if (type.includes("icicle")) {
    const vertical = direction === "down" || direction === "up";
    const layoutRoot = partition<Dataset["rows"][number]>()
      .size(vertical ? [area.width, area.height] : [area.height, area.width])
      .padding(1)(root.sort((a, b) => b.height - a.height || (b.value ?? 0) - (a.value ?? 0)));
    const cells = layoutRoot.descendants().filter(visible).map((node) => {
      const rawWidth = Math.max(0, node.y1 - node.y0);
      const rawHeight = Math.max(0, node.x1 - node.x0);
      const x = vertical ? node.x0 : direction === "left" ? area.width - node.y1 : node.y0;
      // In a vertical partition, y is the depth axis (node.y), while x is
      // the leaf span. Mirror the depth interval for an upward-growing tree.
      const y = vertical ? direction === "up" ? area.height - node.y1 : node.y0 : node.x0;
      const width = vertical ? rawHeight : rawWidth;
      const height = vertical ? rawWidth : rawHeight;
      const fill = nodeColor(node, topAncestorColor(node, rainbow));
      const label = nodeLabelsVisible && height > 16
        ? adaptiveText(`${node.id ?? ""} ${formatTick(node.value ?? 0)}`, `x="4" y="13" font-family="sans-serif"`, width - 8, height - 4, fill, 10)
        : "";
      return `<g transform="translate(${area.x + x} ${area.y + y})" data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" data-row-key="${esc(rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)))}"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("/"))}\n${formatTick(node.value ?? 0)}</title><rect width="${width}" height="${height}" fill="${fill}" fill-opacity="0.6"/>${label}</g>`;
    }).join("");
    return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="icicle" data-tree-direction="${direction}" data-renderer="observable-icicle@2">${cells}</g>`, plotArea: area };
  }

  const leafAxis = cartesianTreeLeafAxis(direction);
  const horizontal = leafAxis === "y";
  const guide = input.coordinateGuide?.type === "Cartesian" ? input.coordinateGuide : null;
  const scaledWidth = Math.max(1, area.width * (guide?.xScale ?? 1));
  const scaledHeight = Math.max(1, area.height * (guide?.yScale ?? 1));
  const treeArea: ChartPlotArea = input.sharedPlotArea ?? {
    x: guide?.xDirection === -1 ? area.x + area.width - scaledWidth : area.x,
    y: guide?.yDirection === 1 ? area.y : area.y + area.height - scaledHeight,
    width: scaledWidth,
    height: scaledHeight,
  };
  const orderEncoding = input.chartSpec.encodings.category ?? input.chartSpec.encodings.key!;
  const orderValue = (node: { id?: string; data: Dataset["rows"][number] }) =>
    node.data[orderEncoding.field] ?? node.id ?? "";
  const compareOrder = (left: string, right: string) => {
    if (orderEncoding.type === "quantitative") {
      const difference = Number(left) - Number(right);
      if (Number.isFinite(difference) && difference !== 0) return difference;
    }
    if (orderEncoding.type === "temporal") {
      const difference = Date.parse(left) - Date.parse(right);
      if (Number.isFinite(difference) && difference !== 0) return difference;
    }
    return left.localeCompare(right, undefined, { numeric: true });
  };
  const subtreeOrder = new Map<object, string>();
  root.eachAfter((node) => {
    const values = node.children?.map((child) => subtreeOrder.get(child) ?? orderValue(child))
      ?? [orderValue(node)];
    subtreeOrder.set(node, values.slice().sort(compareOrder)[0] ?? orderValue(node));
  });
  root.sort((left, right) => compareOrder(
    subtreeOrder.get(left) ?? orderValue(left),
    subtreeOrder.get(right) ?? orderValue(right),
  ) || (left.id ?? "").localeCompare(right.id ?? ""));

  const layoutRoot = cluster<Dataset["rows"][number]>().size([1, 1])(root);
  const labelRoom = Math.min(140, (horizontal ? treeArea.width : treeArea.height) * 0.3);
  const leafRange: [number, number] = horizontal
    ? guide?.yDirection === 1
      ? [treeArea.y, treeArea.y + treeArea.height]
      : [treeArea.y + treeArea.height, treeArea.y]
    : guide?.xDirection === -1
      ? [treeArea.x + treeArea.width, treeArea.x]
      : [treeArea.x, treeArea.x + treeArea.width];
  let depthRange: [number, number] = direction === "right"
    ? [treeArea.x, treeArea.x + treeArea.width - labelRoom]
    : direction === "left"
      ? [treeArea.x + treeArea.width, treeArea.x + labelRoom]
      : direction === "down"
        ? [treeArea.y, treeArea.y + treeArea.height - labelRoom]
        : [treeArea.y + treeArea.height, treeArea.y + labelRoom];
  const depthLevels = Math.max(1, layoutRoot.height);
  const maxNodeRadius = Math.max(2.5, ...layoutRoot.descendants().map((node) => nodeRadius(node)));
  const depthFrames = layoutRoot.descendants().map((node) => nestedChildFrame(input, {
    rowKey: rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)),
    nodeKey: node.id,
    role: "node",
    index: node.data ? input.dataset.rows.indexOf(node.data) : undefined,
    markGroupId: `mark-group:${input.chartId}:node`,
  }));
  const depthSize = (frame: NonNullable<ReturnType<typeof nestedChildFrame>>) => horizontal ? frame.width : frame.height;
  const requiredDepthSpacing = Math.max(
    Math.abs((depthRange[1] - depthRange[0]) / depthLevels),
    ...depthFrames.map((frame) => frame ? depthSize(frame) + 12 : 0),
    maxNodeRadius * 2 + 12,
    24,
  );
  const depthSpan = requiredDepthSpacing * depthLevels;
  const depthDirection = depthRange[1] >= depthRange[0] ? 1 : -1;
  if (depthSpan > Math.abs(depthRange[1] - depthRange[0])) {
    depthRange = [depthRange[0], depthRange[0] + depthDirection * depthSpan];
  }
  const nativeLeafScale = scaleForEncoding(
    layoutRoot.leaves().map((node) => node.data),
    orderEncoding,
    leafRange,
  ).spec as ChartScaleSpec;
  const leafScale = input.sharedScales?.[leafAxis] ?? nativeLeafScale;
  const depthScale: ChartScaleSpec = {
    type: "linear",
    domain: [0, 1],
    range: depthRange,
  };
  const leafPositions = new Map<object, number>();
  const orderedLeaves = layoutRoot.leaves();
  const leafFrame = (node: typeof layoutRoot) => nestedChildFrame(input, {
    rowKey: rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)),
    nodeKey: node.id,
    role: "node",
    index: node.data ? input.dataset.rows.indexOf(node.data) : undefined,
    markGroupId: `mark-group:${input.chartId}:node`,
  });
  const nestedLeafFrames = orderedLeaves.map(leafFrame);
  const leafAxisSize = (frame: NonNullable<ReturnType<typeof leafFrame>>) => horizontal ? frame.height : frame.width;
  const baseLeafSpacing = orderedLeaves.length > 1
    ? Math.abs((leafRange[1] - leafRange[0]) / (orderedLeaves.length - 1))
    : 0;
  const requiredLeafSpacing = Math.max(
    baseLeafSpacing,
    ...depthFrames.map((frame) => frame ? leafAxisSize(frame) + 12 : 0),
    ...nestedLeafFrames.map((frame) => frame ? leafAxisSize(frame) + 12 : 0),
    maxNodeRadius * 2 + 12,
    18,
  );
  const expandedLeafRange: [number, number] = orderedLeaves.length > 1
    ? (() => {
      const span = requiredLeafSpacing * (orderedLeaves.length - 1);
      const center = (leafRange[0] + leafRange[1]) / 2;
      const directionSign = leafRange[1] >= leafRange[0] ? 1 : -1;
      return [center - directionSign * span / 2, center + directionSign * span / 2];
    })()
    : leafRange;
  // Expand the leaf axis for large nodes even without nested children. The
  // previous condition only used the expanded range for nested frames, so a
  // static node-size change could leave adjacent circles overlapping.
  const leafSpacingNeedsExpansion = nestedLeafFrames.some(Boolean)
    || requiredLeafSpacing > baseLeafSpacing + 1e-6;
  layoutRoot.eachAfter((node) => {
    if (!node.children?.length) {
      const leafIndex = orderedLeaves.indexOf(node);
      leafPositions.set(node, leafSpacingNeedsExpansion && leafIndex >= 0
        ? expandedLeafRange[0] + (expandedLeafRange[1] - expandedLeafRange[0]) * leafIndex / Math.max(1, orderedLeaves.length - 1)
        : areaAxisPosition(leafScale, orderValue(node)));
      return;
    }
    const positions = node.children
      .map((child) => leafPositions.get(child))
      .filter((value): value is number => value !== undefined);
    leafPositions.set(node, positions.reduce((sum, value) => sum + value, 0) / Math.max(1, positions.length));
  });
  const nodes = layoutRoot.descendants().filter(visible);
  const point = (node: typeof layoutRoot) => {
    const leafPosition = leafPositions.get(node) ?? leafRange[0];
    const depthPosition = areaValuePosition(depthScale, node.y);
    return horizontal
      ? { x: depthPosition, y: leafPosition }
      : { x: leafPosition, y: depthPosition };
  };
  const linkDirection = direction === "right" || direction === "down" ? 1 : -1;
  const axisLinkEndpoint = (
    center: { x: number; y: number },
    sign: number,
    frame: ReturnType<typeof nestedChildFrame>,
    node: typeof layoutRoot,
  ) => {
    const toward = horizontal
      ? { x: center.x + sign, y: center.y }
      : { x: center.x, y: center.y + sign };
    if (frame) return nestedFrameLinkEndpoint(center, toward, frame);
    const radius = nodeRadius(node);
    return horizontal
      ? { x: center.x + sign * radius, y: center.y }
      : { x: center.x, y: center.y + sign * radius };
  };
  const links = layoutRoot.links().filter((link) => visible(link.source) && visible(link.target)).map((link) => {
    const source = point(link.source);
    const target = point(link.target);
    const sourceFrame = nestedChildFrame(input, {
      rowKey: rowKey(input.dataset, link.source.data, input.dataset.rows.indexOf(link.source.data)),
      nodeKey: link.source.id,
      role: "node",
      index: link.source.data ? input.dataset.rows.indexOf(link.source.data) : undefined,
      markGroupId: `mark-group:${input.chartId}:node`,
    });
    const targetFrame = nestedChildFrame(input, {
      rowKey: rowKey(input.dataset, link.target.data, input.dataset.rows.indexOf(link.target.data)),
      nodeKey: link.target.id,
      role: "node",
      index: link.target.data ? input.dataset.rows.indexOf(link.target.data) : undefined,
      markGroupId: `mark-group:${input.chartId}:node`,
    });
    // Tree links leave and enter on the growth axis. Using the raw center-to-
    // center vector puts the endpoint on a diagonal point of the circle,
    // which becomes visibly detached when node size changes.
    const linkedSource = axisLinkEndpoint(source, linkDirection, sourceFrame, link.source);
    const linkedTarget = axisLinkEndpoint(target, -linkDirection, targetFrame, link.target);
    const path = horizontal
      ? `M${linkedSource.x},${linkedSource.y}C${(linkedSource.x + linkedTarget.x) / 2},${linkedSource.y} ${(linkedSource.x + linkedTarget.x) / 2},${linkedTarget.y} ${linkedTarget.x},${linkedTarget.y}`
      : `M${linkedSource.x},${linkedSource.y}C${linkedSource.x},${(linkedSource.y + linkedTarget.y) / 2} ${linkedTarget.x},${(linkedSource.y + linkedTarget.y) / 2} ${linkedTarget.x},${linkedTarget.y}`;
    return `<path data-mark-role="link" d="${path}" fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5"/>`;
  }).join("");
    const marks = nodes.map((node) => {
      const { x, y } = point(node);
      const fill = nodeColor(node, node.children ? "#555" : "#999");
      const isLeaf = !node.children?.length;
      const labelText = node.id ?? "";
      const labelStyle = adaptiveLabel({ text: labelText, width: Math.max(12, horizontal ? treeArea.width / Math.max(2, nodes.length) : treeArea.width * 0.22), height: 18, background: fill, fontSize: 10, minFontSize: 6, maxFontSize: 10, padding: 1 });
      const label = !nodeLabelsVisible
        ? ""
        : horizontal
        ? labelStyle.text ? `<text dy="0.31em" x="${(direction === "right") === isLeaf ? 6 : -6}" text-anchor="${(direction === "right") === isLeaf ? "start" : "end"}" font-size="${labelStyle.fontSize}" font-family="sans-serif" fill="#000000" stroke="white" paint-order="stroke">${esc(labelStyle.text)}</text>` : ""
        : labelStyle.text ? `<text y="${(direction === "down") === isLeaf ? 8 : -8}" text-anchor="middle" dominant-baseline="${(direction === "down") === isLeaf ? "hanging" : "auto"}" font-size="${labelStyle.fontSize}" font-family="sans-serif" fill="#000000" stroke="white" paint-order="stroke">${esc(labelStyle.text)}</text>` : "";
    return `<g transform="translate(${x} ${y})" data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" data-row-key="${esc(rowKey(input.dataset, node.data, input.dataset.rows.indexOf(node.data)))}"><circle r="${nodeRadius(node)}" fill="${fill}"/>${label}</g>`;
  }).join("");
  const scales = leafAxis === "x"
    ? { x: leafScale, y: depthScale }
    : { x: depthScale, y: leafScale };
  const layoutMinX = horizontal
    ? Math.min(depthRange[0], depthRange[1])
    : Math.min(expandedLeafRange[0], expandedLeafRange[1]);
  const layoutMaxX = horizontal
    ? Math.max(depthRange[0], depthRange[1])
    : Math.max(expandedLeafRange[0], expandedLeafRange[1]);
  const layoutMinY = horizontal
    ? Math.min(expandedLeafRange[0], expandedLeafRange[1])
    : Math.min(depthRange[0], depthRange[1]);
  const layoutMaxY = horizontal
    ? Math.max(expandedLeafRange[0], expandedLeafRange[1])
    : Math.max(depthRange[0], depthRange[1]);
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="dendrogram" data-tree-direction="${direction}" data-leaf-axis="${leafAxis}" data-renderer="observable-cluster@3">${links}${marks}</g>`,
    plotArea: {
      x: layoutMinX,
      y: layoutMinY,
      width: Math.max(1, layoutMaxX - layoutMinX),
      height: Math.max(1, layoutMaxY - layoutMinY),
    },
    scales,
  };
}

function renderCalendar(input: GenericRenderInput) {
  const dateEncoding = input.chartSpec.encodings.date;
  const valueEncoding = input.chartSpec.encodings.value;
  if (!dateEncoding || !valueEncoding) throw new Error("Calendar renderer requires Date and Daily value encodings.");
  const dated = input.dataset.rows.flatMap((row, index) => {
    const date = new Date(row[dateEncoding.field] ?? "");
    const value = numeric(row, valueEncoding);
    return Number.isFinite(date.getTime()) && Number.isFinite(value) ? [{ row, index, date, value }] : [];
  }).sort((left, right) => left.date.getTime() - right.date.getTime());
  const changes = dated.slice(1).flatMap((item, index) => {
    const previous = dated[index]!.value;
    const value = previous === 0 ? Number.NaN : (item.value - previous) / previous;
    return Number.isFinite(value) ? [{ ...item, change: value }] : [];
  });
  const yearGroups = new Map<number, typeof changes>();
  changes.forEach((item) => {
    const year = item.date.getUTCFullYear();
    const group = yearGroups.get(year) ?? [];
    group.push(item);
    yearGroups.set(year, group);
  });
  const years = Array.from(yearGroups.entries()).sort((left, right) => right[0] - left[0]);
  const left = 40.5;
  const cellSize = Math.max(1, Math.min((input.width - left - 2) / 53, input.height / Math.max(7, years.length * 7)));
  const yearHeight = cellSize * 7;
  const absChanges = changes.map((item) => Math.abs(item.change)).sort((a, b) => a - b);
  const maximum = quantileSorted(absChanges, 0.9975) ?? Math.max(1, ...absChanges);
  const color = scaleSequential((value) => globalGradientColor(value, [0, 1])).domain([-maximum || -1, maximum || 1]);
  const countDay = (day: number) => (day + 6) % 7;
  const pathMonth = (date: Date) => {
    const day = Math.max(0, Math.min(5, countDay(date.getUTCDay())));
    const week = utcMonday.count(utcYear(date), date);
    return `${day === 0 ? `M${week * cellSize},0` : day === 5 ? `M${(week + 1) * cellSize},0` : `M${(week + 1) * cellSize},0V${day * cellSize}H${week * cellSize}`}V${5 * cellSize}`;
  };
  const groups = years.map(([year, values], yearIndex) => {
    const originX = input.minX + left;
    const originY = input.minY + yearHeight * yearIndex + cellSize * 1.5;
    const labels = d3Range(1, 6).map((day) => adaptiveText("SMTWTFS"[day] ?? "", `x="-5" y="${(countDay(day) + 0.5) * cellSize}" dy="0.31em" text-anchor="end"`, Math.max(8, cellSize * 2), Math.max(8, cellSize), "#ffffff", 10)).join("");
    const cells = values.filter((item) => ![0, 6].includes(item.date.getUTCDay())).map((item) => `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="cell" data-mark-group-id="mark-group:${esc(input.chartId)}:cell" data-row-key="${esc(rowKey(input.dataset, item.row, item.index))}" data-change="${item.change}" x="${utcMonday.count(utcYear(item.date), item.date) * cellSize + 0.5}" y="${countDay(item.date.getUTCDay()) * cellSize + 0.5}" width="${Math.max(0, cellSize - 1)}" height="${Math.max(0, cellSize - 1)}" fill="${color(item.change)}"><title>${item.date.toISOString().slice(0, 10)}\n${(item.change * 100).toFixed(2)}%\n${formatTick(item.value)}</title></rect>`).join("");
    const first = values[0]?.date;
    const last = values.at(-1)?.date;
    const months = first && last ? utcMonths(utcMonth(first), last) : [];
    const monthMarks = months.map((month, monthIndex) => `${monthIndex ? `<path d="${pathMonth(month)}" fill="none" stroke="#fff" stroke-width="3"/>` : ""}${adaptiveText(month.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), `x="${utcMonday.count(utcYear(month), utcMonday.ceil(month)) * cellSize + 2}" y="-5"`, Math.max(12, cellSize * 4), Math.max(8, cellSize), "#ffffff", 10)}`).join("");
    return `<g transform="translate(${originX} ${originY})">${adaptiveText(String(year), `x="-5" y="-5" font-weight="bold" text-anchor="end"`, 30, Math.max(8, cellSize), "#ffffff", 10)}${labels}${cells}<g data-mark-role="month-boundaries">${monthMarks}</g></g>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="calendar" data-week-start="monday" data-weekends="excluded" data-renderer="observable-calendar@2" font-family="sans-serif">${groups}</g>`, plotArea: { x: input.minX + left, y: input.minY, width: cellSize * 53, height: yearHeight * years.length } };
}

function renderBoxplot(input: GenericRenderInput) {
  const xEncoding = cartesianAxisEncoding(input.chartSpec, "x");
  const yEncoding = cartesianAxisEncoding(input.chartSpec, "y");
  if (!xEncoding || !yEncoding) throw new Error("Box Plot renderer requires X and Y encodings.");
  const area = input.sharedPlotArea ?? plotArea(input, 30);
  type Observation = { row: Dataset["rows"][number]; rowIndex: number; x: number; y: number };
  const observations: Observation[] = input.dataset.rows.flatMap((row, rowIndex) => {
    const x = numeric(row, xEncoding);
    const y = numeric(row, yEncoding);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ row, rowIndex, x, y }] : [];
  });
  const thresholdCount = Math.max(1, input.width / 40);
  const rawBins = d3Bin<Observation, number>().thresholds(thresholdCount).value((datum) => datum.x)(observations).filter((bin) => bin.length);
  const bins = rawBins.map((bin) => {
    const sorted = bin.slice().sort((left, right) => left.y - right.y);
    const values = sorted.map((datum) => datum.y);
    const q1 = quantileSorted(values, 0.25) ?? values[0]!;
    const median = quantileSorted(values, 0.5) ?? values[0]!;
    const q3 = quantileSorted(values, 0.75) ?? values.at(-1)!;
    const iqr = q3 - q1;
    const low = Math.max(values[0]!, q1 - iqr * 1.5);
    const high = Math.min(values.at(-1)!, q3 + iqr * 1.5);
    return { ...bin, x0: bin.x0 ?? 0, x1: bin.x1 ?? 0, quartiles: [q1, median, q3] as const, range: [low, high] as const, outliers: sorted.filter((datum) => datum.y < low || datum.y > high) };
  });
  const xDomain = finiteDomain(bins.flatMap((bin) => [bin.x0, bin.x1]));
  const yDomain = finiteDomain(bins.flatMap((bin) => [bin.range[0], bin.range[1]]));
  const x = scaleLinear().domain(xDomain).rangeRound([area.x, area.x + area.width]);
  const y = scaleLinear().domain(yDomain).nice().range([area.y + area.height, area.y]);
  const marks = bins.map((bin, binIndex) => {
    const center = x((bin.x0 + bin.x1) / 2);
    const outliers = bin.outliers.map((datum, outlierIndex) => {
      const jitter = (((datum.rowIndex * 17 + outlierIndex * 13) % 41) / 40 - 0.5) * 4;
      return `<circle data-row-key="${esc(rowKey(input.dataset, datum.row, datum.rowIndex))}" r="2" cx="${jitter}" cy="${y(datum.y)}"/>`;
    }).join("");
    return `<g data-chart-id="${esc(input.chartId)}" data-mark-role="box" data-mark-group-id="mark-group:${esc(input.chartId)}:box" data-bin-index="${binIndex}" data-bin-x0="${bin.x0}" data-bin-x1="${bin.x1}"><path stroke="currentColor" d="M${center},${y(bin.range[1])}V${y(bin.range[0])}"/><path fill="#ddd" d="M${x(bin.x0) + 1},${y(bin.quartiles[2])}H${x(bin.x1)}V${y(bin.quartiles[0])}H${x(bin.x0) + 1}Z"/><path stroke="currentColor" stroke-width="2" d="M${x(bin.x0) + 1},${y(bin.quartiles[1])}H${x(bin.x1)}"/><g fill="currentColor" fill-opacity="0.2" stroke="none" transform="translate(${center} 0)">${outliers}</g></g>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="boxplot" data-binning="continuous" data-threshold-count="${thresholdCount}" data-renderer="observable-boxplot@2" text-anchor="middle">${marks}</g>`, plotArea: area, scales: { x: { type: "linear", domain: xDomain, range: [area.x, area.x + area.width] }, y: { type: "linear", domain: y.domain() as [number, number], range: [area.y + area.height, area.y] } } };
}

function isRegularGridAxis(values: number[]) {
  if (values.length < 3) return true;
  const step = values[1]! - values[0]!;
  const tolerance = Math.max(1, Math.abs(step)) * 1e-9;
  return values.slice(2).every((value, index) => Math.abs(value - values[index + 1]! - step) <= tolerance);
}

function renderContour(input: GenericRenderInput) {
  const xEncoding = cartesianAxisEncoding(input.chartSpec, "x");
  const yEncoding = cartesianAxisEncoding(input.chartSpec, "y");
  const valueEncoding = input.chartSpec.encodings.color ?? input.chartSpec.encodings.value;
  if (!xEncoding || !yEncoding || !valueEncoding) throw new Error("Contour renderer requires X, Y and Grid value encodings.");
  const area = input.sharedPlotArea ?? plotArea(input, 28);
  const samples = input.dataset.rows.flatMap((row) => {
    const xRaw = row[xEncoding.field]?.trim();
    const yRaw = row[yEncoding.field]?.trim();
    const valueRaw = row[valueEncoding.field]?.trim();
    if (!xRaw || !yRaw || !valueRaw) return [];
    const x = Number(xRaw);
    const y = Number(yRaw);
    const value = Number(valueRaw);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(value)
      ? [{ x, y, value }]
      : [];
  });
  const xValues = Array.from(new Set(samples.map((sample) => sample.x))).sort((a, b) => a - b);
  const yValues = Array.from(new Set(samples.map((sample) => sample.y))).sort((a, b) => b - a);
  if (xValues.length < 2 || yValues.length < 2) {
    throw new Error("Contour renderer requires at least a 2 x 2 grid.");
  }
  if (!isRegularGridAxis(xValues) || !isRegularGridAxis(yValues)) {
    throw new Error("Contour renderer requires evenly spaced X and Y grid coordinates.");
  }
  const lookup = new Map<string, number>();
  samples.forEach((sample) => {
    const key = `${sample.x}\u0000${sample.y}`;
    if (lookup.has(key)) throw new Error("Contour renderer requires exactly one value for each X/Y grid coordinate.");
    lookup.set(key, sample.value);
  });
  const grid = yValues.flatMap((yValue) => xValues.map((xValue) => lookup.get(`${xValue}\u0000${yValue}`)));
  if (grid.some((value) => value === undefined)) {
    throw new Error("Contour renderer requires a complete rectangular X/Y value grid.");
  }
  const values = grid as number[];
  if (values.some((value) => value <= 0)) {
    throw new Error("Contour renderer requires positive values for its logarithmic color scale.");
  }
  const thresholds = d3Range(1, 20).map((index) => 2 ** index);
  const contours = d3Contours().size([xValues.length, yValues.length]).thresholds(thresholds)(values);
  const color = scaleSequentialLog((value) => globalGradientColor(value, [0, 1])).domain([thresholds[0]!, thresholds.at(-1)!]);
  const gx = scaleLinear().domain([0.5, xValues.length - 0.5]).range([area.x, area.x + area.width]);
  const gy = scaleLinear().domain([0.5, yValues.length - 0.5]).range([area.y, area.y + area.height]);
  const path = geoPath();
  const clipId = `contour-clip-${input.chartId.replace(/[^a-z0-9_-]/gi, "-")}`;
  const marks = contours.map((contour) => {
    const transformed = {
      ...contour,
      coordinates: contour.coordinates.map((polygons) => polygons.map((points) => points.map(([x = 0, y = 0]) => [gx(x), gy(y)]))),
    };
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="contour" data-mark-group-id="mark-group:${esc(input.chartId)}:contour" data-value="${contour.value}" d="${path(transformed as any) ?? ""}" fill="${color(contour.value)}" stroke="#fff" stroke-opacity="0.5"><title>${formatTick(contour.value)}</title></path>`;
  }).join("");
  const xDomain = finiteDomain(xValues);
  const yDomain = finiteDomain(yValues);
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="contour" data-grid-width="${xValues.length}" data-grid-height="${yValues.length}" data-color-scale="sequential-log-magma" data-renderer="observable-contours@2"><defs><clipPath id="${clipId}"><rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}"/></clipPath></defs><g clip-path="url(#${clipId})">${marks}</g></g>`, plotArea: area, scales: { x: { type: "linear", domain: xDomain, range: [area.x, area.x + area.width] }, y: { type: "linear", domain: yDomain, range: [area.y + area.height, area.y] } } };
}

function renderHexbin(input: GenericRenderInput) {
  const xEncoding = cartesianAxisEncoding(input.chartSpec, "x");
  const yEncoding = cartesianAxisEncoding(input.chartSpec, "y");
  if (!xEncoding || !yEncoding) throw new Error("Hexbin renderer requires X and Y encodings.");
  const area = input.sharedPlotArea ?? plotArea(input, 30);
  const points = input.dataset.rows.flatMap((row, rowIndex) => {
    const x = numeric(row, xEncoding);
    const y = numeric(row, yEncoding);
    return x > 0 && y > 0 ? [{ row, rowIndex, x, y }] : [];
  });
  if (!points.length) throw new Error("Hexbin renderer requires positive X and Y values for logarithmic scales.");
  const xDomain = finiteDomain(points.map((point) => point.x), [1, 10]);
  const yDomain = finiteDomain(points.map((point) => point.y), [1, 10]);
  const x = scaleLog().domain(xDomain).range([area.x, area.x + area.width]);
  const y = scaleLog().domain(yDomain).rangeRound([area.y + area.height, area.y]);
  const configuredRadius = Math.max(2, Math.min(20, Number(sharedConfig(input, "hexagon").radius ?? 8)));
  const radius = configuredRadius * input.width / 928;
  const layout = hexbin<typeof points[number]>()
    .x((point) => x(point.x))
    .y((point) => y(point.y))
    .radius(radius)
    .extent([[area.x, area.y], [area.x + area.width, area.y + area.height]]);
  const bins = layout(points);
  const maximum = Math.max(1, ...bins.map((bin) => bin.length));
  const color = scaleSequential((value) => globalGradientColor(value, [0, 1])).domain([0, maximum / 2]);
  const marks = bins.map((bin) => {
    const indices = bin.map((point) => point.rowIndex);
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="hexagon" data-mark-group-id="mark-group:${esc(input.chartId)}:hexagon" data-count="${bin.length}" data-row-indices="${indices.join(",")}" transform="translate(${bin.x} ${bin.y})" d="${layout.hexagon()}" fill="${color(bin.length)}" stroke="black"><title>${bin.length}</title></path>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="hexbin" data-radius="${configuredRadius}" data-scale="log-log" data-source-row-count="${points.length}" data-renderer="observable-hexbin@2">${marks}</g>`, plotArea: area, scales: { x: { type: "log", domain: xDomain, range: [area.x, area.x + area.width] }, y: { type: "log", domain: yDomain, range: [area.y + area.height, area.y] } } };
}

function flowLinks(input: GenericRenderInput) {
  const sourceEncoding = input.chartSpec.encodings.source;
  const targetEncoding = input.chartSpec.encodings.target;
  const valueEncoding = input.chartSpec.encodings.value;
  if (!sourceEncoding || !targetEncoding) throw new Error("Flow renderer requires Source and Target encodings.");
  const links = new Map<string, { source: string; target: string; value: number }>();
  input.dataset.rows.forEach((row) => {
    const source = row[sourceEncoding.field] ?? "";
    const target = row[targetEncoding.field] ?? "";
    if (!source || !target) return;
    const id = `${source}\u0000${target}`;
    const current = links.get(id) ?? { source, target, value: 0 };
    current.value += Math.max(0, numeric(row, valueEncoding, 1));
    links.set(id, current);
  });
  return Array.from(links.values());
}

function renderForceDirected(input: GenericRenderInput) {
  const graph = input.dataset.graph;
  if (!graph) throw new Error("Force-Directed Graph requires separate nodes and edges tables.");
  const nodeIdField = input.chartSpec.encodings.key?.field
    ?? graph.nodes.columns.find((column) => column.name === "id" || column.name === "node_id")?.name
    ?? graph.nodes.columns[0]?.name;
  const sourceField = input.chartSpec.encodings.source?.field ?? "source";
  const targetField = input.chartSpec.encodings.target?.field ?? "target";
  if (!nodeIdField) throw new Error("Force-Directed Graph requires a node ID column.");
  const graphNodeDataset = {
    id: `${input.dataset.id}:nodes`,
    name: graph.nodes === input.dataset.graph?.nodes ? input.dataset.name : `${input.dataset.name}:nodes`,
    columns: graph.nodes.columns,
    rows: graph.nodes.rows,
  } as Dataset;

  const area = plotArea(input, 0);
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  const forceConfig = sharedConfig(input, "node");
  const numberConfig = (name: string, fallback: number) => {
    const value = Number(forceConfig[name]);
    return Number.isFinite(value) ? value : fallback;
  };
  const chargeStrength = Math.min(0, numberConfig("chargeStrength", -120));
  const linkDistance = Math.max(8, numberConfig("linkDistance", Math.min(area.width, area.height) * 0.18));
  const linkStrength = Math.max(0, numberConfig("linkStrength", 0.7));
  const centerStrength = Math.max(0, numberConfig("centerStrength", 0.08));
  const collisionRadius = Math.max(0, numberConfig("collisionRadius", 10));
  const nodeRows = graph.nodes.rows.flatMap((row, index) => {
    const id = (row[nodeIdField] ?? "").trim();
    return id ? [{ id, row, index, x: centerX, y: centerY }] : [];
  });
  const nodeIds = new Set(nodeRows.map((node) => node.id));
  const links = graph.edges.rows.flatMap((row, index) => {
    const source = (row[sourceField] ?? "").trim();
    const target = (row[targetField] ?? "").trim();
    return source && target && nodeIds.has(source) && nodeIds.has(target)
      ? [{ source, target, value: numeric(row, input.chartSpec.encodings.value, 1), index }]
      : [];
  });
  const sizeEncoding = input.chartSpec.encodings.size;
  const sizeDomain = finiteDomain(sizeEncoding
    ? nodeRows.map((node) => Number(node.row[sizeEncoding.field] ?? ""))
    : [], [1, 1]);
  const sizeMapping = isLinearSizeMapping(forceConfig.sizeMapping) ? forceConfig.sizeMapping : null;
  const radiusFor = (node: typeof nodeRows[number]) => {
    if (!sizeEncoding) return typeof forceConfig.size === "number" ? Math.max(1, forceConfig.size) : 6;
    const value = Number(node.row[sizeEncoding.field] ?? "");
    if (sizeMapping && Number.isFinite(value)) return mapSizeValue(value, sizeDomain, sizeMapping);
    if (sizeDomain[1] <= sizeDomain[0]) return 6;
    return scaleLinear().domain(sizeDomain).range([4, 11]).clamp(true)(value);
  };
  const nestedExtentFor = (node: typeof nodeRows[number]) => {
    const frame = nestedChildFrame(input, {
      rowKey: rowKey(graphNodeDataset, node.row, node.index),
      nodeKey: node.id,
      role: "node",
      index: node.index,
      markGroupId: `mark-group:${input.chartId}:node`,
    });
    return frame ? nestedFrameExtent(frame) : 0;
  };
  const seededNodes = nodeRows.map((node, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const distance = Math.min(area.width, area.height) * 0.28 * Math.sqrt((index + 1) / Math.max(nodeRows.length, 1));
    return { ...node, x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance };
  });
  // d3-force mutates link.source/link.target from ids into node objects. Keep
  // the original endpoint ids in `links` so the SVG data attributes remain
  // stable and can still resolve through the node index below.
  const simulationLinks = links.map((link) => ({ ...link }));
  const simulation = forceSimulation(seededNodes as any)
    .force("link", forceLink(simulationLinks as any)
      .id((node: any) => node.id)
      .distance(linkDistance)
      .strength(linkStrength))
    .force("charge", forceManyBody().strength(chargeStrength))
    .force("center", forceCenter(centerX, centerY))
    .force("x", forceX(centerX).strength(centerStrength))
    .force("y", forceY(centerY).strength(centerStrength))
    .force("collide", forceCollide((node: any) => Math.max(collisionRadius, radiusFor(node) + nestedExtentFor(node) + 6)))
    .stop();
  const simulationTicks = input.nestedChildFrames?.length ? 300 : 180;
  for (let tick = 0; tick < simulationTicks; tick += 1) simulation.tick();

  const colorEncoding = input.chartSpec.encodings.color;
  const colorDomain = colorEncoding
    ? Array.from(new Set(nodeRows.map((node) => node.row[colorEncoding.field] ?? "")))
    : [];
  const colors = scaleOrdinal<string, string>().domain(colorDomain).range(tableau);
  const numericColorDomain = visualDomain(nodeRows.map((node) => node.row), colorEncoding);
  const colorMapping = forceConfig.colorMapping;
  const nodeById = new Map(seededNodes.map((node) => [node.id, node]));
  const linkMarks = links.map((link) => {
    const source = nodeById.get(link.source);
    const target = nodeById.get(link.target);
    if (!source || !target) return "";
    const sourceRowKey = rowKey(graphNodeDataset, source.row, source.index);
    const targetRowKey = rowKey(graphNodeDataset, target.row, target.index);
    const sourceFrame = nestedChildFrame(input, {
      rowKey: sourceRowKey,
      nodeKey: source.id,
      role: "node",
      index: source.index,
      markGroupId: `mark-group:${input.chartId}:node`,
    });
    const targetFrame = nestedChildFrame(input, {
      rowKey: targetRowKey,
      nodeKey: target.id,
      role: "node",
      index: target.index,
      markGroupId: `mark-group:${input.chartId}:node`,
    });
    const sourcePoint = sourceFrame
      ? nestedFrameLinkEndpoint(source, target, sourceFrame)
      : source;
    const targetPoint = targetFrame
      ? nestedFrameLinkEndpoint(target, source, targetFrame)
      : target;
    return `<line data-chart-id="${esc(input.chartId)}" data-mark-role="link" data-mark-group-id="mark-group:${esc(input.chartId)}:link" data-source="${esc(link.source)}" data-target="${esc(link.target)}" x1="${sourcePoint.x}" y1="${sourcePoint.y}" x2="${targetPoint.x}" y2="${targetPoint.y}" stroke="#94a3b8" stroke-opacity="0.55" stroke-width="${Math.max(1, Math.min(4, link.value || 1))}"/>`;
  }).join("");
  const nodeMarks = seededNodes.map((node) => {
    const rawColor = colorEncoding ? node.row[colorEncoding.field] ?? "" : "";
    const mappedColor = isCategoricalColorMapping(colorMapping)
      ? colorMapping.values[rawColor]
      : isLinearColorMapping(colorMapping) && colorEncoding && numericColorDomain
        ? (() => {
          const value = parseVisualValue(rawColor, colorEncoding);
          return value === null ? undefined : mapColorValue(value, numericColorDomain, colorMapping);
        })()
        : undefined;
    const color = mappedColor
      ?? (colorEncoding ? colors(rawColor) : undefined)
      ?? (typeof forceConfig.color === "string" ? forceConfig.color : tableau[node.index % tableau.length]!);
    const radius = radiusFor(node);
    const label = node.row.label ?? node.id;
    const labelStyle = adaptiveLabel({ text: String(label), width: Math.max(18, area.width * 0.22), height: 18, background: "#ffffff", fontSize: 10, minFontSize: 6, maxFontSize: 10, padding: 1 });
    const labelMarkup = labelStyle.text ? `<text data-mark-role="node-label" pointer-events="none" x="${node.x + radius + 3}" y="${node.y}" dy="0.35em" font-size="${labelStyle.fontSize}" fill="${labelStyle.color}">${esc(labelStyle.text)}</text>` : "";
    return `<g data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id)}" data-row-key="${esc(rowKey(graphNodeDataset, node.row, node.index))}"><circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1.5"><title>${esc(String(label))}</title></circle>${labelMarkup}</g>`;
  }).join("");
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="force-directed-graph" data-renderer="observable-force-directed@1">${linkMarks}${nodeMarks}</g>`,
    plotArea: area,
  };
}

function renderChord(input: GenericRenderInput) {
  const links = flowLinks(input);
  const area = plotArea(input, 0);
  const names = Array.from(new Set(links.flatMap((link) => [link.source, link.target])));
  const nameIndex = new Map(names.map((name, index) => [name, index]));
  const matrix = Array.from({ length: names.length }, () => Array(names.length).fill(0) as number[]);
  links.forEach((link) => {
    const row = matrix[nameIndex.get(link.source)!]!;
    const target = nameIndex.get(link.target)!;
    row[target] = (row[target] ?? 0) + link.value;
  });
  const outerRadius = Math.max(12, Math.min(area.width, area.height) * 0.5 - 30);
  const innerRadius = Math.max(4, outerRadius - 20);
  const chords = d3Chord().padAngle(20 / innerRadius).sortSubgroups(descending)(matrix);
  const arc = d3Arc<typeof chords.groups[number]>().innerRadius(innerRadius).outerRadius(outerRadius);
  const ribbon = d3Ribbon<typeof chords[number], typeof chords[number]["source"]>().radius(innerRadius);
  const color = scaleOrdinal<number, string>().domain(d3Range(names.length)).range(tableau);
  const total = matrix.flat().reduce((sum, value) => sum + value, 0);
  const step = tickStep(0, total, 100);
  const majorStep = tickStep(0, total, 20);
  const groups = chords.groups.map((group) => {
    const k = group.value ? (group.endAngle - group.startAngle) / group.value : 0;
    const tickValues = step > 0 ? d3Range(0, group.value, step) : [];
    const tickMarks = tickValues.map((value) => {
      const angle = value * k + group.startAngle;
      const major = majorStep > 0 && Math.abs(value / majorStep - Math.round(value / majorStep)) < 1e-6;
      const tickLabel = formatTick(value);
      const label = major ? adaptiveText(tickLabel, `x="8" dy="0.35em" transform="${angle > Math.PI ? "rotate(180) translate(-16)" : ""}" text-anchor="${angle > Math.PI ? "end" : "start"}"`, Math.max(16, outerRadius * 0.22), 16, "#ffffff", 10) : "";
      return `<g transform="rotate(${angle * 180 / Math.PI - 90}) translate(${outerRadius} 0)"><line x2="6" stroke="currentColor"/>${label}</g>`;
    }).join("");
    return `<g data-mark-role="node" data-node-key="${esc(names[group.index] ?? "")}"><path d="${arc(group) ?? ""}" fill="${color(group.index)}"><title>${formatTick(group.value)} ${esc(names[group.index] ?? "")}</title></path><g data-mark-role="group-ticks">${tickMarks}</g></g>`;
  }).join("");
  const ribbons = chords.map((chord) => `<path data-chart-id="${esc(input.chartId)}" data-mark-role="link" data-mark-group-id="mark-group:${esc(input.chartId)}:link" data-source="${esc(names[chord.source.index] ?? "")}" data-target="${esc(names[chord.target.index] ?? "")}" d="${ribbon(chord) ?? ""}" fill="${color(chord.target.index)}" fill-opacity="0.7" stroke="white"><title>${formatTick(chord.source.value)} ${esc(names[chord.source.index] ?? "")} to ${esc(names[chord.target.index] ?? "")}</title></path>`).join("");
  return { content: `<g transform="translate(${area.x + area.width / 2} ${area.y + area.height / 2})" data-chart-id="${esc(input.chartId)}" data-chart-type="chord" data-ribbon-color="target" data-renderer="observable-chord@2" font-family="sans-serif">${groups}${ribbons}</g>`, plotArea: area };
}

function renderSankey(input: GenericRenderInput) {
  const links = flowLinks(input);
  const area = plotArea(input, 0);
  const names = Array.from(new Set(links.flatMap((link) => [link.source, link.target])));
  type NodeData = { name: string; category: string };
  type LinkData = { source: string; target: string; value: number };
  const graph: SankeyGraph<NodeData, LinkData> = {
    nodes: names.map((name) => ({ name, category: name.replace(/ .*/, "") })),
    links: links.map((link) => ({ ...link })),
  };
  const config = sharedConfig(input, "link");
  const alignmentName = String(config.nodeAlign ?? "justify");
  const alignment = { left: sankeyLeft, right: sankeyRight, center: sankeyCenter, justify: sankeyJustify }[alignmentName] ?? sankeyJustify;
  const layout = sankey<NodeData, LinkData>()
    .nodeId((node) => node.name)
    .nodeAlign(alignment)
    .nodeWidth(15)
    .nodePadding(10)
    .extent([[area.x + 1, area.y + 5], [area.x + area.width - 1, area.y + area.height - 5]]);
  const result = layout(graph);
  const color = scaleOrdinal<string, string>().range(globalPalette.categorical);
  const linkColor = String(config.linkColor ?? "source-target");
  const uid = `sankey-${input.chartId.replace(/[^a-z0-9_-]/gi, "-")}`;
  const path = sankeyLinkHorizontal<NodeData, LinkData>();
  const linkMarks = result.links.map((link, index) => {
    const source = typeof link.source === "object" ? link.source : result.nodes[Number(link.source)]!;
    const target = typeof link.target === "object" ? link.target : result.nodes[Number(link.target)]!;
    const gradientId = `${uid}-link-${index}`;
    const gradient = linkColor === "source-target" ? `<linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${source.x1}" x2="${target.x0}"><stop offset="0%" stop-color="${color(source.category)}"/><stop offset="100%" stop-color="${color(target.category)}"/></linearGradient>` : "";
    const stroke = linkColor === "source-target" ? `url(#${gradientId})` : linkColor === "source" ? color(source.category) : linkColor === "target" ? color(target.category) : "#aaa";
    return `<g data-chart-id="${esc(input.chartId)}" data-mark-role="link" data-mark-group-id="mark-group:${esc(input.chartId)}:link" data-source="${esc(source.name)}" data-target="${esc(target.name)}" data-value="${link.value}" style="mix-blend-mode:multiply"><defs>${gradient}</defs><path d="${path(link) ?? ""}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, link.width ?? 1)}" stroke-opacity="0.5"><title>${esc(source.name)} to ${esc(target.name)}\n${formatTick(link.value)}</title></path></g>`;
  }).join("");
  const nodes = result.nodes.map((node) => `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.name)}" x="${node.x0 ?? 0}" y="${node.y0 ?? 0}" width="${Math.max(1, (node.x1 ?? 0) - (node.x0 ?? 0))}" height="${Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0))}" fill="${color(node.category)}" stroke="#000"><title>${esc(node.name)}\n${formatTick(node.value ?? 0)}</title></rect>`).join("");
  const labels = result.nodes.map((node) => {
    const leftSide = (node.x0 ?? 0) < area.x + area.width / 2;
    return adaptiveText(node.name, `x="${leftSide ? (node.x1 ?? 0) + 6 : (node.x0 ?? 0) - 6}" y="${((node.y1 ?? 0) + (node.y0 ?? 0)) / 2}" dy="0.35em" text-anchor="${leftSide ? "start" : "end"}"`, Math.max(20, area.width * 0.25), Math.max(12, (node.y1 ?? 0) - (node.y0 ?? 0)), "#ffffff", 10);
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="sankey" data-node-align="${esc(alignmentName)}" data-link-color="${esc(linkColor)}" data-renderer="observable-sankey@2" font-family="sans-serif"><g fill="none">${linkMarks}</g><g>${nodes}</g><g>${labels}</g></g>`, plotArea: area };
}

export function renderAdvancedChart(input: GenericRenderInput) {
  const type = normalizedType(input.chartSpec.chartType);
  if (type.includes("forcedirected")) return renderForceDirected(input);
  if (type.includes("area") || type.includes("stream") || type.includes("horizon")) return renderArea(input);
  if (type.includes("parallel")) return renderParallel(input);
  if (["icicle", "sunburst", "treemap", "dendrogram"].some((name) => type.includes(name))) return renderHierarchy(input);
  if (type.includes("calendar")) return renderCalendar(input);
  if (type.includes("boxplot") || type.includes("boxandwhisker")) return renderBoxplot(input);
  if (type.includes("contour")) return renderContour(input);
  if (type.includes("hexbin")) return renderHexbin(input);
  if (type.includes("chord")) return renderChord(input);
  if (type.includes("sankey")) return renderSankey(input);
  throw new Error(`Unsupported advanced chart template: ${input.chartSpec.chartType}`);
}
