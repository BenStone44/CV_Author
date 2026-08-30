import {
  arc as d3Arc,
  area as d3Area,
  bin as d3Bin,
  chord as d3Chord,
  cluster,
  contours as d3Contours,
  descending,
  interpolateBrBG,
  interpolateBuPu,
  interpolateMagma,
  interpolatePiYG,
  interpolateRainbow,
  line as d3Line,
  linkRadial,
  partition,
  quantileSorted,
  quantize,
  range as d3Range,
  ribbon as d3Ribbon,
  scaleLinear,
  scaleLog,
  scaleOrdinal,
  scalePoint,
  scaleSequential,
  scaleSequentialLog,
  scaleUtc,
  schemeBlues,
  schemeCategory10,
  schemeTableau10,
  stack,
  stackOffsetWiggle,
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
  createRadialClusterLayout,
  RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS,
  RADIAL_DENDROGRAM_SELECTION_PADDING,
  type RadialClusterNode,
} from "./radialClusterLayout";

const tableau = schemeTableau10;

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
) {
  if (points.length === 0) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const coordinates = points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ");
  return axisSwapped
    ? `M ${baseline} ${first.y} L ${first.x} ${first.y} ${coordinates} L ${baseline} ${last.y} Z`
    : `M ${first.x} ${baseline} L ${first.x} ${first.y} ${coordinates} L ${last.x} ${baseline} Z`;
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
    });
    const axisSwapped = input.chartSpec.axisSwapped === true;
    const valueScale = axisSwapped ? lineResult.scales.x : lineResult.scales.y;
    const baseline = areaValuePosition(valueScale, 0);
    const opacity = Number(sharedConfig(input, "area").opacity ?? 0.42);
    const marks = lineResult.series.map((series) => {
      const points = series.points.map(({ x, y }) => ({ x, y }));
      const path = areaPath(points, axisSwapped, baseline);
      if (!path) return "";
      const rowKeys = series.points.flatMap((point) => point.rowKeys);
      return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(series.key)}" data-point-count="${points.length}" data-row-keys="${esc(rowKeys.join(","))}" d="${path}" fill="${esc(series.color)}" fill-opacity="${opacity}" stroke="${esc(series.color)}" stroke-width="${series.lineWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"><title>${esc(series.key === "__single__" ? (cartesianAxisEncoding(input.chartSpec, "y")?.field ?? "") : series.key)}</title></path>`;
    }).join("");
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="area" data-axis-swapped="${axisSwapped}" data-renderer="deterministic-area@1">${marks}</g>`,
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
      .y1((datum) => y(Number(datum.value)));
    const palette = (schemeBlues[Math.max(3, bands)] ?? schemeBlues[9]!).slice(Math.max(0, 3 - bands));
    const uid = `horizon-${input.chartId.replace(/[^a-z0-9_-]/gi, "-")}`;
    const seriesGroups = seriesValues.map((series, seriesIndex) => {
      const top = input.minY + marginTop + seriesIndex * size;
      const pathId = `${uid}-path-${seriesIndex}`;
      const clipId = `${uid}-clip-${seriesIndex}`;
      const data = table.map((datum) => ({ x: datum.x ?? "", value: Number(datum[series] ?? 0) }));
      const uses = d3Range(bands).map((band) => `<use href="#${pathId}" fill="${palette[band] ?? palette.at(-1) ?? "#08306b"}" transform="translate(0 ${band * size})"/>`).join("");
      return `<g transform="translate(0 ${top})"><defs><clipPath id="${clipId}"><rect x="${input.minX}" y="${padding}" width="${width}" height="${Math.max(0, size - padding)}"/></clipPath><path id="${pathId}" d="${area(data) ?? ""}"/></defs><g clip-path="url(#${clipId})" data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(series)}">${uses}</g><text x="${input.minX + 4}" y="${(size + padding) / 2}" dy="0.35em" font-size="10" fill="currentColor">${esc(series === "__single__" ? yEncoding.field : series)}</text></g>`;
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
    const axis = axisTicks.filter((tick) => tick.position >= input.minX + marginLeft && tick.position < input.minX + width - marginRight).map((tick) => `<g class="tick" transform="translate(${tick.position} ${input.minY + marginTop})"><line y2="-6" stroke="currentColor"/><text y="-9" text-anchor="middle" font-size="10" fill="currentColor">${esc(tick.label)}</text></g>`).join("");
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="horizon" data-bands="${bands}" data-renderer="observable-horizon@2" font-family="sans-serif">${seriesGroups}<g data-mark-role="horizon-axis">${axis}</g></g>`,
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
  });
  // With one selected series, stacked area is the same visual contract as a
  // line with a filled baseline. Reuse the line's ordered points so duplicate
  // X rows follow the same path instead of entering d3.stack as duplicate
  // columns.
  if (seriesValues.length === 1) {
    const axisSwapped = input.chartSpec.axisSwapped === true;
    const valueScale = axisSwapped ? lineResult.scales.x : lineResult.scales.y;
    const baseline = areaValuePosition(valueScale, 0);
    const series = lineResult.series[0];
    if (series) {
      const path = areaPath(series.points.map(({ x, y }) => ({ x, y })), axisSwapped, baseline);
      const rowKeys = series.points.flatMap((point) => point.rowKeys);
      const opacity = Number(sharedConfig(input, "area").opacity ?? 0.42);
      const mark = `<path data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(series.key)}" data-point-count="${series.points.length}" data-row-keys="${esc(rowKeys.join(","))}" d="${path}" fill="${esc(series.color)}" fill-opacity="${opacity}" stroke="${esc(series.color)}" stroke-width="${series.lineWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"><title>${esc(series.key === "__single__" ? yEncoding.field : series.key)}</title></path>`;
      return {
        content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="${isStream ? "streamgraph" : isStacked ? "stacked" : "area"}" data-axis-swapped="${axisSwapped}" data-stack-offset="${isStream ? "wiggle" : "zero"}" data-stack-order="${isStream ? "inside-out" : "none"}" data-renderer="observable-area@3">${mark}</g>`,
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
  if (isStream) stackGenerator.offset(stackOffsetWiggle).order(stackOrderInsideOut);
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
      .y((_, index) => progressionPosition(String(table[index]?.x ?? "")))
      .x0((point) => valuePosition(point[0]))
      .x1((point) => valuePosition(point[1]))
    : d3Area<[number, number]>()
      .x((_, index) => progressionPosition(String(table[index]?.x ?? "")))
      .y0((point) => valuePosition(point[0]))
      .y1((point) => valuePosition(point[1]));
  const marks = layers.map((layer, index) => {
    const color = !isStacked && seriesValues.length === 1 ? "steelblue" : tableau[index % tableau.length]!;
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="area" data-mark-group-id="mark-group:${esc(input.chartId)}:area" data-series-key="${esc(seriesValues[index] ?? "")}" data-point-count="${layer.length}" d="${area(layer as Array<[number, number]>) ?? ""}" fill="${color}"><title>${esc(seriesValues[index] === "__single__" ? yEncoding.field : seriesValues[index] ?? "")}</title></path>`;
  }).join("");
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="area" data-area-variant="${isStream ? "streamgraph" : isStacked ? "stacked" : "area"}" data-axis-swapped="${axisSwapped}" data-stack-offset="${isStream ? "wiggle" : "zero"}" data-stack-order="${isStream ? "inside-out" : "none"}" data-renderer="observable-area@3">${marks}</g>`,
    plotArea: areaPlot,
    scales: axisSwapped
      ? { x: valueScale, y: progressionScale }
      : { x: progressionScale, y: valueScale },
  };
}

function renderParallel(input: GenericRenderInput) {
  const fields = input.chartSpec.parallelFields ?? [];
  if (fields.length < 2) throw new Error("Parallel Coordinates requires at least two numeric dimensions.");
  const marginTop = 20;
  const marginRight = 10;
  const marginBottom = 20;
  const marginLeft = 10;
  const area = {
    x: input.minX + marginLeft,
    y: input.minY + marginTop,
    width: Math.max(1, input.width - marginLeft - marginRight),
    height: Math.max(1, input.height - marginTop - marginBottom),
  };
  const y = scalePoint<string>().domain(fields.map((field) => field.field)).range([area.y, area.y + area.height]);
  const scales = new Map(fields.map((field) => {
    const domain = finiteDomain(input.dataset.rows.map((row) => numeric(row, field)));
    return [field.field, scaleLinear().domain(domain).range([area.x, area.x + area.width])] as const;
  }));
  const colorEncoding = input.chartSpec.encodings.color;
  const colorField = colorEncoding?.field ?? fields[0]!.field;
  const colorValues = input.dataset.rows.map((row) => Number(row[colorField] ?? "")).filter(Number.isFinite);
  const sequential = scaleSequential((value) => interpolateBrBG(1 - value)).domain(finiteDomain(colorValues));
  const categories = colorEncoding?.type === "nominal" || colorEncoding?.type === "ordinal"
    ? Array.from(new Set(input.dataset.rows.map((row) => row[colorField] ?? "")))
    : [];
  const ordinal = scaleOrdinal<string, string>().domain(categories).range(tableau);
  const line = d3Line<[string, number]>()
    .defined(([, value]) => Number.isFinite(value))
    .x(([field, value]) => scales.get(field)?.(value) ?? area.x)
    .y(([field]) => y(field) ?? area.y);
  const sortedRows = input.dataset.rows.slice().sort((left, right) => Number(left[colorField] ?? 0) - Number(right[colorField] ?? 0));
  const paths = sortedRows.map((row) => {
    const index = input.dataset.rows.indexOf(row);
    const points = fields.map((field) => [field.field, numeric(row, field)] as [string, number]);
    const stroke = colorEncoding?.type === "nominal" || colorEncoding?.type === "ordinal" ? ordinal(row[colorField] ?? "") : sequential(Number(row[colorField] ?? 0));
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="path" data-mark-group-id="mark-group:${esc(input.chartId)}:path" data-row-key="${esc(rowKey(input.dataset, row, index))}" d="${line(points) ?? ""}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-opacity="0.4"/>`;
  }).join("");
  const axes = fields.map((field) => {
    const scale = scales.get(field.field)!;
    const axisY = y(field.field) ?? area.y;
    const domain = scale.domain();
    const tickMarks = scale.ticks(Math.max(2, Math.floor(area.width / 100))).map((value) => `<g class="tick" transform="translate(${scale(value)} 0)"><line y2="6" stroke="currentColor"/><text y="18" text-anchor="middle" font-size="10" fill="currentColor">${esc(formatTick(value))}</text></g>`).join("");
    return `<g data-mark-role="parallel-axis" data-field="${esc(field.field)}" transform="translate(0 ${axisY})"><line x1="${area.x}" x2="${area.x + area.width}" stroke="currentColor"/>${tickMarks}<text x="${area.x}" y="-6" text-anchor="start" font-size="10" fill="currentColor" stroke="white" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${esc(field.field)}</text><title>${domain.map(formatTick).join(" - ")}</title></g>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="parallel" data-axis-orientation="horizontal" data-renderer="observable-parallel@1" font-family="sans-serif">${paths}${axes}</g>`, plotArea: area };
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
    ? scaleSequential(interpolateBuPu).domain(colorDomain as [number, number])
    : null;
  const sizeDomain = sizeEncoding
    ? finiteDomain(root.descendants().map((node) => Number(node.data[sizeEncoding.field] ?? "")))
    : [0, 1] as [number, number];
  const nodeRadius = (node: { data: Dataset["rows"][number] }) => {
    if (!sizeEncoding) {
      const configured = Number(nodeConfig.size);
      return Number.isFinite(configured) ? Math.max(2, Math.min(12, configured)) : 2.5;
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
  const rainbow = scaleOrdinal<string, string>().domain(topNames).range(quantize(interpolateRainbow, topNames.length + 1));
  const visible = <T extends { id?: string }>(node: T) => !(synthetic && node.id === "__root__");

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
    const nodes = radialRoot.descendants().filter(radial.visible) as RadialClusterNode[];
    const radialLink = linkRadial<any, RadialClusterNode>()
      .angle((node) => node.x)
      .radius((node) => node.y);
    const links = radialRoot.links()
      .filter((link) => radial.visible(link.source) && radial.visible(link.target))
      .map((link) => `<path data-mark-role="link" d="${radialLink(link as any) ?? ""}" fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`)
      .join("");
    const marks = nodes.map((node) => {
      const color = nodeColor(node, typeof nodeConfig.color === "string"
        ? nodeConfig.color
        : node.children ? "#555" : "#999");
      const rotation = node.x * 180 / Math.PI - 90;
      return `<circle data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" data-angle="${node.x}" transform="rotate(${rotation}) translate(${node.y},0)" r="${nodeRadius(node)}" fill="${color}"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("/"))}</title></circle>`;
    }).join("");
    const labels = nodeLabelsVisible ? nodes.map((node) => {
      const onLeft = Math.sin(node.x) < 0;
      const rotation = node.x * 180 / Math.PI - 90;
      const label = node.id || "";
      const labelOnOutside = !onLeft === !node.children;
      return `<text data-mark-role="node-label" transform="rotate(${rotation}) translate(${node.y},0) rotate(${onLeft ? 180 : 0})" dy="0.31em" x="${labelOnOutside ? 6 : -6}" text-anchor="${labelOnOutside ? "start" : "end"}" paint-order="stroke" stroke="white" stroke-width="3" stroke-linejoin="round" fill="currentColor" font-size="10">${esc(label)}</text>`;
    }).join("") : "";
    return {
      content: `<g transform="translate(${cx} ${cy})" data-chart-id="${esc(input.chartId)}" data-chart-type="radial-dendrogram" data-renderer="observable-radial-cluster@3" data-angle-span="${angleSpan}" data-leaf-radius="${leafRadius}" data-selection-radius="${selectionRadius}">${links}${marks}${labels}</g>`,
      plotArea: { x: cx - leafRadius, y: cy - leafRadius, width: leafRadius * 2, height: leafRadius * 2 },
      polarArea: { startAngle: angleOffset, angleSpan, innerRadius, outerRadius: leafRadius },
    };
  }

  if (type.includes("treemap")) {
    const tilers = { binary: treemapBinary, squarify: treemapSquarify, "slice-dice": treemapSliceDice, slice: treemapSlice, dice: treemapDice } as const;
    const tileName = String(sharedConfig(input, "node").tile ?? "binary") as keyof typeof tilers;
    const color = scaleOrdinal<string, string>().domain(topNames).range(tableau);
    const layoutRoot = treemap<Dataset["rows"][number]>()
      .tile(tilers[tileName] ?? treemapBinary)
      .size([area.width, area.height])
      .padding(1)
      .round(true)(root.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)));
    const leaves = layoutRoot.leaves().filter(visible).map((node, index) => {
      const x = area.x + node.x0;
      const y = area.y + node.y0;
      const width = Math.max(0, node.x1 - node.x0);
      const height = Math.max(0, node.y1 - node.y0);
      const clipId = `treemap-${input.chartId.replace(/[^a-z0-9_-]/gi, "-")}-${index}`;
      const labelLines = (node.id ?? "").split(/(?=[A-Z][a-z])|\s+/g).filter(Boolean).concat(formatTick(node.value ?? 0));
      const labels = labelLines.map((line, lineIndex) => `<tspan x="3" y="${(lineIndex === labelLines.length - 1 ? 1.4 : 1.1) + lineIndex * 0.9}em" fill-opacity="${lineIndex === labelLines.length - 1 ? 0.7 : 1}">${esc(line)}</tspan>`).join("");
      const fill = nodeColor(node, topAncestorColor(node, color));
      return `<g transform="translate(${x} ${y})" data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("."))}\n${formatTick(node.value ?? 0)}</title><rect width="${width}" height="${height}" fill="${fill}" fill-opacity="0.6"/><clipPath id="${clipId}"><rect width="${width}" height="${height}"/></clipPath>${nodeLabelsVisible ? `<text clip-path="url(#${clipId})" font-size="10" font-family="sans-serif">${labels}</text>` : ""}</g>`;
    }).join("");
    return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="treemap" data-tile="${esc(tileName)}" data-renderer="observable-treemap@2">${leaves}</g>`, plotArea: area };
  }

  if (type.includes("sunburst")) {
    const radius = Math.max(1, Math.min(area.width, area.height) / 2);
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
    const marks = nodes.map((node) => `<path data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}" d="${arc(node) ?? ""}" fill="${nodeColor(node, topAncestorColor(node, rainbow))}" fill-opacity="0.6"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("/"))}\n${formatTick(node.value ?? 0)}</title></path>`).join("");
    const labels = nodeLabelsVisible ? nodes.filter((node) => ((node.y0 + node.y1) / 2) * (node.x1 - node.x0) > 10).map((node) => {
      const angle = (node.x0 + node.x1) / 2 * 180 / Math.PI;
      const radiusPosition = (node.y0 + node.y1) / 2;
      return `<text transform="rotate(${angle - 90}) translate(${radiusPosition} 0) rotate(${angle < 180 ? 0 : 180})" dy="0.35em" text-anchor="middle" font-size="10" font-family="sans-serif">${esc(node.id ?? "")}</text>`;
    }).join("") : "";
    return { content: `<g transform="translate(${area.x + area.width / 2} ${area.y + area.height / 2})" data-chart-id="${esc(input.chartId)}" data-chart-type="sunburst" data-renderer="observable-sunburst@2">${marks}<g pointer-events="none">${labels}</g></g>`, plotArea: area };
  }

  if (type.includes("icicle")) {
    const layoutRoot = partition<Dataset["rows"][number]>().size([area.height, area.width]).padding(1)(root.sort((a, b) => b.height - a.height || (b.value ?? 0) - (a.value ?? 0)));
    const cells = layoutRoot.descendants().filter(visible).map((node) => {
      const width = Math.max(0, node.y1 - node.y0);
      const height = Math.max(0, node.x1 - node.x0);
      const label = nodeLabelsVisible && height > 16 ? `<text x="4" y="13" font-size="10" font-family="sans-serif"><tspan>${esc(node.id ?? "")}</tspan><tspan fill-opacity="0.7"> ${formatTick(node.value ?? 0)}</tspan></text>` : "";
      const fill = nodeColor(node, topAncestorColor(node, rainbow));
      return `<g transform="translate(${area.x + node.y0} ${area.y + node.x0})" data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}"><title>${esc(node.ancestors().reverse().map((item) => item.id).join("/"))}\n${formatTick(node.value ?? 0)}</title><rect width="${width}" height="${height}" fill="${fill}" fill-opacity="0.6"/>${label}</g>`;
    }).join("");
    return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="icicle" data-renderer="observable-icicle@2">${cells}</g>`, plotArea: area };
  }

  root.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  const leafCount = Math.max(1, root.leaves().length);
  const dx = area.height / (leafCount + 1);
  const labelRoom = Math.min(140, area.width * 0.3);
  const dy = Math.max(1, (area.width - labelRoom) / (root.height + 1));
  const layoutRoot = cluster<Dataset["rows"][number]>().nodeSize([dx, dy])(root);
  const nodes = layoutRoot.descendants().filter(visible);
  const xExtent = finiteDomain(nodes.map((node) => node.x));
  const offsetY = area.y + area.height / 2 - (xExtent[0] + xExtent[1]) / 2;
  const links = layoutRoot.links().filter((link) => visible(link.source) && visible(link.target)).map((link) => {
    const sx = area.x + link.source.y;
    const sy = offsetY + link.source.x;
    const tx = area.x + link.target.y;
    const ty = offsetY + link.target.x;
    return `<path data-mark-role="link" d="M${sx},${sy}C${(sx + tx) / 2},${sy} ${(sx + tx) / 2},${ty} ${tx},${ty}" fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5"/>`;
  }).join("");
  const marks = nodes.map((node) => {
    const x = area.x + node.y;
    const y = offsetY + node.x;
    const fill = nodeColor(node, node.children ? "#555" : "#999");
    const label = nodeLabelsVisible ? `<text dy="0.31em" x="${node.children ? -6 : 6}" text-anchor="${node.children ? "end" : "start"}" font-size="10" font-family="sans-serif" stroke="white" paint-order="stroke">${esc(node.id ?? "")}</text>` : "";
    return `<g transform="translate(${x} ${y})" data-chart-id="${esc(input.chartId)}" data-mark-role="node" data-mark-group-id="mark-group:${esc(input.chartId)}:node" data-node-key="${esc(node.id ?? "")}"><circle r="${nodeRadius(node)}" fill="${fill}"/>${label}</g>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="dendrogram" data-renderer="observable-cluster@2">${links}${marks}</g>`, plotArea: area };
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
  const color = scaleSequential(interpolatePiYG).domain([-maximum || -1, maximum || 1]);
  const countDay = (day: number) => (day + 6) % 7;
  const pathMonth = (date: Date) => {
    const day = Math.max(0, Math.min(5, countDay(date.getUTCDay())));
    const week = utcMonday.count(utcYear(date), date);
    return `${day === 0 ? `M${week * cellSize},0` : day === 5 ? `M${(week + 1) * cellSize},0` : `M${(week + 1) * cellSize},0V${day * cellSize}H${week * cellSize}`}V${5 * cellSize}`;
  };
  const groups = years.map(([year, values], yearIndex) => {
    const originX = input.minX + left;
    const originY = input.minY + yearHeight * yearIndex + cellSize * 1.5;
    const labels = d3Range(1, 6).map((day) => `<text x="-5" y="${(countDay(day) + 0.5) * cellSize}" dy="0.31em" text-anchor="end" font-size="10">${"SMTWTFS"[day]}</text>`).join("");
    const cells = values.filter((item) => ![0, 6].includes(item.date.getUTCDay())).map((item) => `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="cell" data-mark-group-id="mark-group:${esc(input.chartId)}:cell" data-row-key="${esc(rowKey(input.dataset, item.row, item.index))}" data-change="${item.change}" x="${utcMonday.count(utcYear(item.date), item.date) * cellSize + 0.5}" y="${countDay(item.date.getUTCDay()) * cellSize + 0.5}" width="${Math.max(0, cellSize - 1)}" height="${Math.max(0, cellSize - 1)}" fill="${color(item.change)}"><title>${item.date.toISOString().slice(0, 10)}\n${(item.change * 100).toFixed(2)}%\n${formatTick(item.value)}</title></rect>`).join("");
    const first = values[0]?.date;
    const last = values.at(-1)?.date;
    const months = first && last ? utcMonths(utcMonth(first), last) : [];
    const monthMarks = months.map((month, monthIndex) => `${monthIndex ? `<path d="${pathMonth(month)}" fill="none" stroke="#fff" stroke-width="3"/>` : ""}<text x="${utcMonday.count(utcYear(month), utcMonday.ceil(month)) * cellSize + 2}" y="-5" font-size="10">${month.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`).join("");
    return `<g transform="translate(${originX} ${originY})"><text x="-5" y="-5" font-weight="bold" text-anchor="end" font-size="10">${year}</text>${labels}${cells}<g data-mark-role="month-boundaries">${monthMarks}</g></g>`;
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

function contourPath(coordinates: number[][][][], x: (value: number) => number, y: (value: number) => number) {
  return coordinates.map((polygon) => polygon.map((ring) => ring.map(([px = 0, py = 0], index) => `${index ? "L" : "M"}${x(px)},${y(py)}`).join("") + "Z").join("")).join("");
}

function renderContour(input: GenericRenderInput) {
  const xEncoding = cartesianAxisEncoding(input.chartSpec, "x");
  const yEncoding = cartesianAxisEncoding(input.chartSpec, "y");
  const valueEncoding = input.chartSpec.encodings.color ?? input.chartSpec.encodings.value;
  if (!xEncoding || !yEncoding || !valueEncoding) throw new Error("Contour renderer requires X, Y and Grid value encodings.");
  const area = input.sharedPlotArea ?? plotArea(input, 28);
  const xValues = Array.from(new Set(input.dataset.rows.map((row) => numeric(row, xEncoding)).filter(Number.isFinite))).sort((a, b) => a - b);
  const yValues = Array.from(new Set(input.dataset.rows.map((row) => numeric(row, yEncoding)).filter(Number.isFinite))).sort((a, b) => b - a);
  const lookup = new Map(input.dataset.rows.map((row) => [`${numeric(row, xEncoding)}\u0000${numeric(row, yEncoding)}`, numeric(row, valueEncoding)]));
  const values = yValues.flatMap((yValue) => xValues.map((xValue) => lookup.get(`${xValue}\u0000${yValue}`) ?? Number.NaN));
  const clean = values.filter(Number.isFinite);
  const fallback = clean.length ? Math.min(...clean) : 0;
  const grid = values.map((value) => Number.isFinite(value) ? value : fallback);
  const valueDomain = finiteDomain(clean, [1, 2]);
  const positive = valueDomain[0] > 0;
  let thresholds: number[];
  if (positive) {
    const minPower = Math.ceil(Math.log2(valueDomain[0]));
    const maxPower = Math.floor(Math.log2(valueDomain[1]));
    const powers = d3Range(minPower, maxPower + 1).map((power) => 2 ** power);
    thresholds = powers.length > 19 ? powers.filter((_, index) => index % Math.ceil(powers.length / 19) === 0) : powers;
  } else {
    thresholds = ticks(valueDomain[0], valueDomain[1], 19);
  }
  if (!thresholds.length) thresholds = ticks(valueDomain[0], valueDomain[1], 10);
  const contours = xValues.length >= 2 && yValues.length >= 2
    ? d3Contours().size([xValues.length, yValues.length]).thresholds(thresholds)(grid)
    : [];
  const color = positive
    ? scaleSequentialLog(interpolateMagma).domain([Math.max(Number.MIN_VALUE, thresholds[0] ?? valueDomain[0]), thresholds.at(-1) ?? valueDomain[1]])
    : scaleSequential(interpolateMagma).domain(valueDomain);
  const gx = scaleLinear().domain([0, Math.max(1, xValues.length - 1)]).range([area.x, area.x + area.width]);
  const gy = scaleLinear().domain([0, Math.max(1, yValues.length - 1)]).range([area.y, area.y + area.height]);
  const marks = contours.map((contour) => `<path data-chart-id="${esc(input.chartId)}" data-mark-role="contour" data-mark-group-id="mark-group:${esc(input.chartId)}:contour" data-value="${contour.value}" d="${contourPath(contour.coordinates, gx, gy)}" fill="${color(contour.value)}" stroke="#fff" stroke-opacity="0.5"><title>${formatTick(contour.value)}</title></path>`).join("");
  const xDomain = finiteDomain(xValues);
  const yDomain = finiteDomain(yValues);
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="contour" data-grid-width="${xValues.length}" data-grid-height="${yValues.length}" data-color-scale="${positive ? "sequential-log-magma" : "sequential-magma"}" data-renderer="observable-contours@1">${marks}</g>`, plotArea: area, scales: { x: { type: "linear", domain: xDomain, range: [area.x, area.x + area.width] }, y: { type: "linear", domain: yDomain, range: [area.y + area.height, area.y] } } };
}

function renderHexbin(input: GenericRenderInput) {
  const xEncoding = cartesianAxisEncoding(input.chartSpec, "x");
  const yEncoding = cartesianAxisEncoding(input.chartSpec, "y");
  if (!xEncoding || !yEncoding) throw new Error("Hexbin renderer requires X and Y encodings.");
  const area = input.sharedPlotArea ?? plotArea(input, 30);
  const rows = input.dataset.rows.filter((row) => numeric(row, xEncoding) > 0 && numeric(row, yEncoding) > 0);
  const xDomain = finiteDomain(rows.map((row) => numeric(row, xEncoding)), [1, 10]);
  const yDomain = finiteDomain(rows.map((row) => numeric(row, yEncoding)), [1, 10]);
  if (xDomain[0] <= 0) xDomain[0] = Math.max(Number.MIN_VALUE, xDomain[1] / 100);
  if (yDomain[0] <= 0) yDomain[0] = Math.max(Number.MIN_VALUE, yDomain[1] / 100);
  const x = scaleLog().domain(xDomain).range([area.x, area.x + area.width]);
  const y = scaleLog().domain(yDomain).rangeRound([area.y + area.height, area.y]);
  const configuredRadius = Math.max(2, Math.min(20, Number(sharedConfig(input, "hexagon").radius ?? 8)));
  const radius = configuredRadius * input.width / 928;
  const layout = hexbin<Dataset["rows"][number]>()
    .x((row) => x(numeric(row, xEncoding)))
    .y((row) => y(numeric(row, yEncoding)))
    .radius(radius)
    .extent([[area.x, area.y], [area.x + area.width, area.y + area.height]]);
  const bins = layout(rows);
  const maximum = Math.max(1, ...bins.map((bin) => bin.length));
  const color = scaleSequential(interpolateBuPu).domain([0, maximum / 2]);
  const marks = bins.map((bin) => {
    const indices = bin.map((row) => input.dataset.rows.indexOf(row));
    return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="hexagon" data-mark-group-id="mark-group:${esc(input.chartId)}:hexagon" data-count="${bin.length}" data-row-indices="${indices.join(",")}" transform="translate(${bin.x} ${bin.y})" d="${layout.hexagon()}" fill="${color(bin.length)}" stroke="black"><title>${bin.length}</title></path>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="hexbin" data-radius="${configuredRadius}" data-scale="log-log" data-renderer="observable-hexbin@1">${marks}</g>`, plotArea: area, scales: { x: { type: "log", domain: xDomain, range: [area.x, area.x + area.width] }, y: { type: "log", domain: yDomain, range: [area.y + area.height, area.y] } } };
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
      return `<g transform="rotate(${angle * 180 / Math.PI - 90}) translate(${outerRadius} 0)"><line x2="6" stroke="currentColor"/>${major ? `<text x="8" dy="0.35em" transform="${angle > Math.PI ? "rotate(180) translate(-16)" : ""}" text-anchor="${angle > Math.PI ? "end" : "start"}" font-size="10">${esc(formatTick(value))}</text>` : ""}</g>`;
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
  const color = scaleOrdinal<string, string>().range(schemeCategory10);
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
    return `<text x="${leftSide ? (node.x1 ?? 0) + 6 : (node.x0 ?? 0) - 6}" y="${((node.y1 ?? 0) + (node.y0 ?? 0)) / 2}" dy="0.35em" text-anchor="${leftSide ? "start" : "end"}" font-size="10">${esc(node.name)}</text>`;
  }).join("");
  return { content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="sankey" data-node-align="${esc(alignmentName)}" data-link-color="${esc(linkColor)}" data-renderer="observable-sankey@2" font-family="sans-serif"><g fill="none">${linkMarks}</g><g>${nodes}</g><g>${labels}</g></g>`, plotArea: area };
}

export function renderAdvancedChart(input: GenericRenderInput) {
  const type = normalizedType(input.chartSpec.chartType);
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
