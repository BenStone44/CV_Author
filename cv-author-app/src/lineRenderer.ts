import { extent, group } from "d3-array";
import { scaleLinear, scalePoint, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import type {
  CartesianCoordinateGuide,
  ChartEncoding,
  ChartPlotArea,
  ChartScaleSpec,
  ChartSpec,
  ChartStyleTokens,
  Dataset,
  ParsedSvgTemplate,
  ParsedSvgTemplateNode,
} from "./types";

const fallbackPalette = [
  "rgba(0,143,251,0.9)",
  "rgba(0,227,150,0.9)",
  "rgba(254,176,25,0.9)",
  "rgba(255,69,96,0.9)",
  "rgba(119,93,208,0.9)",
  "rgba(0,227,150,0.9)",
];
const linechartTemplateStyle: ChartStyleTokens = {
  palette: fallbackPalette,
  axisColor: "#373d3f",
  textColor: "#373d3f",
  fontFamily: "Helvetica, Arial, sans-serif",
  fontSize: 12,
  lineWidth: 5,
};

export type LineRenderResult = {
  content: string;
  plotArea: ChartPlotArea;
  scales: { x: ChartScaleSpec; y: ChartScaleSpec };
};

export type LineRenderInput = {
  chartId: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
  coordinateGuide: CartesianCoordinateGuide;
  chartSpec: ChartSpec;
  dataset: Dataset;
};

export function isLineChartType(chartType: string) {
  return chartType.replace(/[\s_-]/g, "").toLowerCase() === "linegraph";
}

function collectTemplateContent(nodes: ParsedSvgTemplateNode[]): string[] {
  return nodes.flatMap((node) => node.kind === "leaf"
    ? [node.content]
    : collectTemplateContent(node.children));
}

function presentationValue(element: Element, name: string) {
  const direct = element.getAttribute(name)?.trim();
  if (direct) return direct;
  const style = element.getAttribute("style") ?? "";
  const declaration = style
    .split(";")
    .map((item) => item.split(":"))
    .find(([property]) => property?.trim().toLowerCase() === name);
  return declaration?.slice(1).join(":").trim() || "";
}

function isVisiblePaint(value: string) {
  const normalized = value.replace(/\s/g, "").toLowerCase();
  return !!normalized
    && normalized !== "none"
    && normalized !== "transparent"
    && normalized !== "rgba(0,0,0,0)"
    && !normalized.endsWith(",0)");
}

export function extractChartStyleTokens(template: ParsedSvgTemplate): ChartStyleTokens {
  const fallback: ChartStyleTokens = { ...linechartTemplateStyle, palette: [...linechartTemplateStyle.palette] };
  if (typeof DOMParser === "undefined") return fallback;

  const document = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${collectTemplateContent(template.nodes).join("")}</svg>`,
    "image/svg+xml",
  );
  const elements = Array.from(document.querySelectorAll("path, polyline, line, circle"));
  const paints: string[] = [];
  for (const element of elements) {
    for (const property of ["stroke", "fill"]) {
      const value = presentationValue(element, property);
      if (isVisiblePaint(value) && !paints.includes(value)) paints.push(value);
    }
  }
  const text = document.querySelector("text");
  const firstLine = elements.find((element) => isVisiblePaint(presentationValue(element, "stroke")));
  const parsedFontSize = Number.parseFloat(text ? presentationValue(text, "font-size") : "");
  const parsedLineWidth = Number.parseFloat(firstLine ? presentationValue(firstLine, "stroke-width") : "");
  return {
    palette: [...paints, ...fallbackPalette.filter((color) => !paints.includes(color))].slice(0, 8),
    axisColor: fallback.axisColor,
    textColor: text && isVisiblePaint(presentationValue(text, "fill"))
      ? presentationValue(text, "fill")
      : fallback.textColor,
    fontFamily: (text ? presentationValue(text, "font-family") : "") || fallback.fontFamily,
    fontSize: Number.isFinite(parsedFontSize) ? parsedFontSize : fallback.fontSize,
    lineWidth: Number.isFinite(parsedLineWidth) ? parsedLineWidth : fallback.lineWidth,
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function finiteExtent(values: number[]) {
  const domain = extent(values);
  if (domain[0] === undefined || domain[1] === undefined) return null;
  if (domain[0] === domain[1]) {
    const padding = Math.abs(domain[0]) * 0.05 || 1;
    return [domain[0] - padding, domain[1] + padding] as [number, number];
  }
  return domain as [number, number];
}

function rowKey(dataset: Dataset, row: Record<string, string>) {
  const fields = dataset.primaryKey ?? [];
  return fields.length > 0
    ? fields.map((field) => row[field] ?? "").join("|")
    : "";
}

type ParsedAxisValue = string | number | Date;

function parseAxisValue(value: string, type: ChartEncoding["type"]): ParsedAxisValue | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === "nominal") return trimmed;
  if (type === "quantitative") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function uniqueDomain(values: ParsedAxisValue[]) {
  return Array.from(new Set(values.map((value) => String(value))));
}

function tickValues<T>(values: T[], maximum: number) {
  if (values.length <= maximum) return values;
  const stride = (values.length - 1) / (maximum - 1);
  return Array.from({ length: maximum }, (_, index) => values[Math.round(index * stride)]!);
}

export function renderLineChart(input: LineRenderInput): LineRenderResult {
  const { chartId, width, height, minX, minY, coordinateGuide, chartSpec, dataset } = input;
  const xEncoding = chartSpec.encodings.x;
  const yEncoding = chartSpec.encodings.y;
  const seriesEncoding = chartSpec.series;
  if (!xEncoding || !yEncoding) throw new Error("Line renderer requires both X and Y encodings.");
  if (seriesEncoding && seriesEncoding.type !== "nominal") {
    throw new Error("Line renderer series encoding must be nominal.");
  }

  const rows = dataset.rows
    .map((row) => ({
      row,
      x: parseAxisValue(row[xEncoding.field] ?? "", xEncoding.type),
      y: parseAxisValue(row[yEncoding.field] ?? "", yEncoding.type),
      series: seriesEncoding ? (row[seriesEncoding.field] ?? "").trim() : "__single__",
    }))
    .filter((datum): datum is { row: Record<string, string>; x: ParsedAxisValue; y: ParsedAxisValue; series: string } =>
      datum.x !== null && datum.y !== null && datum.series !== "",
    );
  if (rows.length === 0) throw new Error("No valid rows remain after applying the line encodings.");

  // The Linechart template is the visual source of truth. Candidate SVGs may
  // carry unrelated thin strokes, so do not let their extracted tokens win.
  const tokens: ChartStyleTokens = {
    ...chartSpec.styleTokens,
    ...linechartTemplateStyle,
    palette: [...linechartTemplateStyle.palette],
  };
  const fontSize = Math.max(9, Math.min(tokens.fontSize, Math.min(width, height) * 0.045));
  const legendHeight = Math.min(fontSize * 2.4, height * 0.16);
  const leftMargin = Math.min(Math.max(fontSize * 4.6, width * 0.11), width * 0.28);
  const rightMargin = Math.min(Math.max(fontSize * 1.8, width * 0.04), width * 0.15);
  const topMargin = Math.min(Math.max(fontSize * 1.4 + legendHeight, height * 0.12), height * 0.3);
  const bottomMargin = Math.min(Math.max(fontSize * 3.6, height * 0.14), height * 0.3);
  const basePlotX = minX + leftMargin;
  const basePlotY = minY + topMargin;
  const basePlotWidth = width - leftMargin - rightMargin;
  const basePlotHeight = height - topMargin - bottomMargin;
  const scaledPlotWidth = Math.max(1, basePlotWidth * (coordinateGuide.xScale ?? 1));
  const scaledPlotHeight = Math.max(1, basePlotHeight * (coordinateGuide.yScale ?? 1));
  const plotArea: ChartPlotArea = {
    // Keep the coordinate origin fixed while the opposing endpoint is dragged.
    x: coordinateGuide.xDirection === 1
      ? basePlotX
      : basePlotX + basePlotWidth - scaledPlotWidth,
    y: coordinateGuide.yDirection === -1
      ? basePlotY + basePlotHeight - scaledPlotHeight
      : basePlotY,
    width: scaledPlotWidth,
    height: scaledPlotHeight,
  };
  const plotRight = plotArea.x + plotArea.width;
  const plotBottom = plotArea.y + plotArea.height;
  const xRange: [number, number] = coordinateGuide.xDirection === 1
    ? [plotArea.x, plotRight]
    : [plotRight, plotArea.x];
  const yRange: [number, number] = coordinateGuide.yDirection === -1
    ? [plotBottom, plotArea.y]
    : [plotArea.y, plotBottom];
  const makeScale = (encoding: ChartEncoding, values: ParsedAxisValue[], range: [number, number]) => {
    if (encoding.type === "nominal") {
      const domain = uniqueDomain(values);
      const scale = scalePoint<string>().domain(domain).range(range).padding(0.5);
      return {
        position: (value: ParsedAxisValue) => scale(value as string) ?? 0,
        domain,
        ticks: tickValues(domain, 6) as ParsedAxisValue[],
        type: "point" as const,
      };
    }
    if (encoding.type === "temporal") {
      const domain = finiteExtent(values.map((value) => (value as Date).getTime()));
      if (!domain) throw new Error("Unable to calculate a temporal scale domain.");
      const scale = scaleUtc().domain(domain.map((value) => new Date(value)) as [Date, Date]).range(range);
      return {
        position: (value: ParsedAxisValue) => scale(value as Date),
        domain,
        ticks: scale.ticks(6) as ParsedAxisValue[],
        type: "utc" as const,
      };
    }
    const domain = finiteExtent(values as number[]);
    if (!domain) throw new Error("Unable to calculate a quantitative scale domain.");
    const scale = scaleLinear().domain(domain).nice(5).range(range);
    return {
      position: (value: ParsedAxisValue) => scale(value as number),
      domain: scale.domain() as [number, number],
      ticks: scale.ticks(6) as ParsedAxisValue[],
      type: "linear" as const,
    };
  };
  const xAxisScale = makeScale(xEncoding, rows.map((datum) => datum.x), xRange);
  const yAxisScale = makeScale(yEncoding, rows.map((datum) => datum.y), yRange);
  const xTicks = tickValues(xAxisScale.ticks, Math.max(2, Math.min(6, Math.floor(plotArea.width / 80))));
  const yTicks = tickValues(yAxisScale.ticks, Math.max(2, Math.min(6, Math.floor(plotArea.height / 42))));
  const xAxisY = coordinateGuide.yDirection === -1 ? plotBottom : plotArea.y;
  const yAxisX = coordinateGuide.xDirection === 1 ? plotArea.x : plotRight;
  const xLabelY = xAxisY + (coordinateGuide.yDirection === -1 ? fontSize * 2.6 : -fontSize * 2.1);
  const yLabelX = yAxisX + (coordinateGuide.xDirection === 1 ? -fontSize * 3.2 : fontSize * 3.2);
  const clipId = `line-plot-${chartId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const grid = yTicks.map((value) => {
    const y = yAxisScale.position(value);
    return `<line x1="${plotArea.x}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="${escapeXml(tokens.axisColor)}" stroke-opacity="0.16" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const xAxis = xTicks.map((value) => {
    const x = xAxisScale.position(value);
    const label = xEncoding.type === "temporal"
      ? (value as Date).toISOString().slice(0, 7)
      : String(value);
    const tickEnd = xAxisY + (coordinateGuide.yDirection === -1 ? 5 : -5);
    const textY = xAxisY + (coordinateGuide.yDirection === -1 ? fontSize * 1.6 : -fontSize * 0.8);
    return `<g class="tick"><line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${tickEnd}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/><text x="${x}" y="${textY}" text-anchor="middle">${escapeXml(label)}</text></g>`;
  }).join("");
  const yAxis = yTicks.map((value) => {
    const y = yAxisScale.position(value);
    const tickEnd = yAxisX + (coordinateGuide.xDirection === 1 ? -5 : 5);
    const textX = yAxisX + (coordinateGuide.xDirection === 1 ? -fontSize * 0.8 : fontSize * 0.8);
    const label = yEncoding.type === "temporal"
      ? (value as Date).toISOString().slice(0, 7)
      : yEncoding.type === "quantitative"
        ? Number(value).toPrecision(4)
        : String(value);
    return `<g class="tick"><line x1="${yAxisX}" y1="${y}" x2="${tickEnd}" y2="${y}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/><text x="${textX}" y="${y}" text-anchor="${coordinateGuide.xDirection === 1 ? "end" : "start"}" dominant-baseline="middle">${escapeXml(label)}</text></g>`;
  }).join("");

  const groupedRows = Array.from(group(rows, (datum) => datum.series).entries())
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }));
  const pathGenerator = line<(typeof rows)[number]>()
    .x((datum) => xAxisScale.position(datum.x))
    .y((datum) => yAxisScale.position(datum.y));
  const seriesMarkup = groupedRows.map(([seriesKey, values], index) => {
    const ordered = xEncoding.type === "nominal"
      ? [...values]
      : [...values].sort((left, right) => Number(left.x) - Number(right.x));
    const path = pathGenerator(ordered);
    if (!path) return "";
    const color = tokens.palette[index % tokens.palette.length] ?? fallbackPalette[index % fallbackPalette.length]!;
    const keys = ordered.map((datum) => rowKey(dataset, datum.row)).filter(Boolean);
    return `<g data-chart-id="${escapeXml(chartId)}" data-mark-role="series" data-series-key="${escapeXml(seriesKey)}" data-point-count="${ordered.length}" data-row-keys="${escapeXml(keys.join(","))}"><path d="${path}" fill="none" stroke="${escapeXml(color)}" stroke-width="${tokens.lineWidth}" stroke-linecap="butt" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="stroke: ${escapeXml(color)}; stroke-width: ${tokens.lineWidth}px; stroke-linecap: butt; stroke-linejoin: round; fill: none;"/></g>`;
  }).join("");
  const legendItemWidth = plotArea.width / Math.max(groupedRows.length, 1);
  const legend = seriesEncoding ? groupedRows.map(([seriesKey], index) => {
    const color = tokens.palette[index % tokens.palette.length] ?? fallbackPalette[index % fallbackPalette.length]!;
    const x = plotArea.x + legendItemWidth * index;
    const y = minY + fontSize * 1.25;
    return `<g transform="translate(${x} ${y})"><line x1="0" y1="0" x2="${fontSize * 1.5}" y2="0" stroke="${escapeXml(color)}" stroke-width="${tokens.lineWidth}" vector-effect="non-scaling-stroke"/><text x="${fontSize * 1.8}" y="0" dominant-baseline="middle">${escapeXml(seriesKey)}</text></g>`;
  }).join("") : "";

  const content = `<g data-chart-id="${escapeXml(chartId)}" data-chart-type="line" data-renderer="deterministic-line@1" font-family="${escapeXml(tokens.fontFamily)}" font-size="${fontSize}" fill="${escapeXml(tokens.textColor)}"><defs><clipPath id="${clipId}"><rect x="${plotArea.x}" y="${plotArea.y}" width="${plotArea.width}" height="${plotArea.height}"/></clipPath></defs><g data-mark-role="legend">${legend}</g><g data-mark-role="grid">${grid}</g><g data-mark-role="x-axis" data-bound="true"><line class="axis-domain" x1="${plotArea.x}" y1="${xAxisY}" x2="${plotRight}" y2="${xAxisY}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/>${xAxis}<text class="axis-label" data-bound="true" x="${plotArea.x + plotArea.width / 2}" y="${xLabelY}" text-anchor="middle">${escapeXml(xEncoding.field)}</text></g><g data-mark-role="y-axis" data-bound="true"><line class="axis-domain" x1="${yAxisX}" y1="${plotArea.y}" x2="${yAxisX}" y2="${plotBottom}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/>${yAxis}<text class="axis-label" data-bound="true" x="${yLabelX}" y="${plotArea.y + plotArea.height / 2}" text-anchor="middle" transform="rotate(-90 ${yLabelX} ${plotArea.y + plotArea.height / 2})">${escapeXml(yEncoding.field)}</text></g><g data-mark-role="plot" clip-path="url(#${clipId})">${seriesMarkup}</g></g>`;
  return {
    content,
    plotArea,
    scales: {
      x: {
        type: xAxisScale.type,
        domain: xAxisScale.type === "utc"
          ? (xAxisScale.domain as [number, number]).map((value) => new Date(value).toISOString()) as [string, string]
          : xAxisScale.domain,
        range: xRange,
      },
      y: {
        type: yAxisScale.type,
        domain: yAxisScale.domain,
        range: yRange,
        nice: yAxisScale.type === "linear" || undefined,
      },
    },
  };
}
