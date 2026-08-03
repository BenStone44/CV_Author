import { extent, group } from "d3-array";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import type {
  CartesianCoordinateGuide,
  ChartPlotArea,
  ChartScaleSpec,
  ChartSpec,
  ChartStyleTokens,
  Dataset,
  ParsedSvgTemplate,
  ParsedSvgTemplateNode,
} from "./types";

const fallbackPalette = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

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
  const fallback: ChartStyleTokens = {
    palette: [...fallbackPalette],
    axisColor: "#6b7280",
    textColor: "#374151",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 11,
    lineWidth: 2,
  };
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

export function renderLineChart(input: LineRenderInput): LineRenderResult {
  const { chartId, width, height, minX, minY, coordinateGuide, chartSpec, dataset } = input;
  const xEncoding = chartSpec.encodings.x;
  const yEncoding = chartSpec.encodings.y;
  const seriesEncoding = chartSpec.series;
  if (!xEncoding || xEncoding.type !== "temporal") {
    throw new Error("Line renderer requires a temporal X encoding.");
  }
  if (!yEncoding || yEncoding.type !== "quantitative") {
    throw new Error("Line renderer requires a quantitative Y encoding.");
  }
  if (!seriesEncoding || seriesEncoding.type !== "nominal") {
    throw new Error("Line renderer requires a nominal series encoding.");
  }

  const rows = dataset.rows
    .map((row) => ({
      row,
      x: Date.parse(row[xEncoding.field] ?? ""),
      y: Number(row[yEncoding.field] ?? ""),
      series: (row[seriesEncoding.field] ?? "").trim(),
    }))
    .filter((datum) => Number.isFinite(datum.x) && Number.isFinite(datum.y) && datum.series !== "");
  if (rows.length === 0) throw new Error("No valid rows remain after applying the line encodings.");

  const xDomain = finiteExtent(rows.map((datum) => datum.x));
  const yDomain = finiteExtent(rows.map((datum) => datum.y));
  if (!xDomain || !yDomain) throw new Error("Unable to calculate line chart scale domains.");

  const tokens = chartSpec.styleTokens ?? extractChartStyleTokens({
    viewBox: "0 0 1 1", width: 1, height: 1, minX: 0, minY: 0, nodes: [],
  });
  const fontSize = Math.max(9, Math.min(tokens.fontSize, Math.min(width, height) * 0.045));
  const legendHeight = Math.min(fontSize * 2.4, height * 0.16);
  const leftMargin = Math.min(Math.max(fontSize * 4.6, width * 0.11), width * 0.28);
  const rightMargin = Math.min(Math.max(fontSize * 1.8, width * 0.04), width * 0.15);
  const topMargin = Math.min(Math.max(fontSize * 1.4 + legendHeight, height * 0.12), height * 0.3);
  const bottomMargin = Math.min(Math.max(fontSize * 3.6, height * 0.14), height * 0.3);
  const plotArea: ChartPlotArea = {
    x: minX + leftMargin,
    y: minY + topMargin,
    width: Math.max(1, width - leftMargin - rightMargin),
    height: Math.max(1, height - topMargin - bottomMargin),
  };
  const plotRight = plotArea.x + plotArea.width;
  const plotBottom = plotArea.y + plotArea.height;
  const xRange: [number, number] = coordinateGuide.xDirection === 1
    ? [plotArea.x, plotRight]
    : [plotRight, plotArea.x];
  const yRange: [number, number] = coordinateGuide.yDirection === -1
    ? [plotBottom, plotArea.y]
    : [plotArea.y, plotBottom];
  const xScale = scaleUtc()
    .domain(xDomain.map((value) => new Date(value)) as [Date, Date])
    .range(xRange);
  const yScale = scaleLinear().domain(yDomain).nice(5).range(yRange);
  const resolvedYDomain = yScale.domain() as [number, number];
  const xTicks = xScale.ticks(Math.max(2, Math.min(6, Math.floor(plotArea.width / 80))));
  const yTicks = yScale.ticks(Math.max(2, Math.min(6, Math.floor(plotArea.height / 42))));
  const xAxisY = coordinateGuide.yDirection === -1 ? plotBottom : plotArea.y;
  const yAxisX = coordinateGuide.xDirection === 1 ? plotArea.x : plotRight;
  const xLabelY = xAxisY + (coordinateGuide.yDirection === -1 ? fontSize * 2.6 : -fontSize * 2.1);
  const yLabelX = yAxisX + (coordinateGuide.xDirection === 1 ? -fontSize * 3.2 : fontSize * 3.2);
  const clipId = `line-plot-${chartId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const grid = yTicks.map((value) => {
    const y = yScale(value);
    return `<line x1="${plotArea.x}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="${escapeXml(tokens.axisColor)}" stroke-opacity="0.16" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const xAxis = xTicks.map((value) => {
    const x = xScale(value);
    const label = value.toISOString().slice(0, 7);
    const tickEnd = xAxisY + (coordinateGuide.yDirection === -1 ? 5 : -5);
    const textY = xAxisY + (coordinateGuide.yDirection === -1 ? fontSize * 1.6 : -fontSize * 0.8);
    return `<g class="tick"><line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${tickEnd}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/><text x="${x}" y="${textY}" text-anchor="middle">${label}</text></g>`;
  }).join("");
  const yAxis = yTicks.map((value) => {
    const y = yScale(value);
    const tickEnd = yAxisX + (coordinateGuide.xDirection === 1 ? -5 : 5);
    const textX = yAxisX + (coordinateGuide.xDirection === 1 ? -fontSize * 0.8 : fontSize * 0.8);
    return `<g class="tick"><line x1="${yAxisX}" y1="${y}" x2="${tickEnd}" y2="${y}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/><text x="${textX}" y="${y}" text-anchor="${coordinateGuide.xDirection === 1 ? "end" : "start"}" dominant-baseline="middle">${Number(value.toPrecision(4))}</text></g>`;
  }).join("");

  const groupedRows = Array.from(group(rows, (datum) => datum.series).entries())
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }));
  const pathGenerator = line<(typeof rows)[number]>()
    .x((datum) => xScale(new Date(datum.x)))
    .y((datum) => yScale(datum.y));
  const seriesMarkup = groupedRows.map(([seriesKey, values], index) => {
    const ordered = [...values].sort((left, right) => left.x - right.x);
    const path = pathGenerator(ordered);
    if (!path) return "";
    const color = tokens.palette[index % tokens.palette.length] ?? fallbackPalette[index % fallbackPalette.length]!;
    const keys = ordered.map((datum) => rowKey(dataset, datum.row)).filter(Boolean);
    return `<g data-chart-id="${escapeXml(chartId)}" data-mark-role="series" data-series-key="${escapeXml(seriesKey)}" data-point-count="${ordered.length}" data-row-keys="${escapeXml(keys.join(","))}"><path d="${path}" fill="none" stroke="${escapeXml(color)}" stroke-width="${tokens.lineWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>`;
  }).join("");
  const legendItemWidth = plotArea.width / Math.max(groupedRows.length, 1);
  const legend = groupedRows.map(([seriesKey], index) => {
    const color = tokens.palette[index % tokens.palette.length] ?? fallbackPalette[index % fallbackPalette.length]!;
    const x = plotArea.x + legendItemWidth * index;
    const y = minY + fontSize * 1.25;
    return `<g transform="translate(${x} ${y})"><line x1="0" y1="0" x2="${fontSize * 1.5}" y2="0" stroke="${escapeXml(color)}" stroke-width="${tokens.lineWidth}" vector-effect="non-scaling-stroke"/><text x="${fontSize * 1.8}" y="0" dominant-baseline="middle">${escapeXml(seriesKey)}</text></g>`;
  }).join("");

  const content = `<g data-chart-id="${escapeXml(chartId)}" data-chart-type="line" data-renderer="deterministic-line@1" font-family="${escapeXml(tokens.fontFamily)}" font-size="${fontSize}" fill="${escapeXml(tokens.textColor)}"><defs><clipPath id="${clipId}"><rect x="${plotArea.x}" y="${plotArea.y}" width="${plotArea.width}" height="${plotArea.height}"/></clipPath></defs><g data-mark-role="legend">${legend}</g><g data-mark-role="grid">${grid}</g><g data-mark-role="x-axis" data-bound="true"><line class="axis-domain" x1="${plotArea.x}" y1="${xAxisY}" x2="${plotRight}" y2="${xAxisY}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/>${xAxis}<text class="axis-label" data-bound="true" x="${plotArea.x + plotArea.width / 2}" y="${xLabelY}" text-anchor="middle">${escapeXml(xEncoding.field)}</text></g><g data-mark-role="y-axis" data-bound="true"><line class="axis-domain" x1="${yAxisX}" y1="${plotArea.y}" x2="${yAxisX}" y2="${plotBottom}" stroke="${escapeXml(tokens.axisColor)}" vector-effect="non-scaling-stroke"/>${yAxis}<text class="axis-label" data-bound="true" x="${yLabelX}" y="${plotArea.y + plotArea.height / 2}" text-anchor="middle" transform="rotate(-90 ${yLabelX} ${plotArea.y + plotArea.height / 2})">${escapeXml(yEncoding.field)}</text></g><g data-mark-role="plot" clip-path="url(#${clipId})">${seriesMarkup}</g></g>`;
  return {
    content,
    plotArea,
    scales: {
      x: {
        type: "utc",
        domain: [new Date(xDomain[0]).toISOString(), new Date(xDomain[1]).toISOString()],
        range: xRange,
      },
      y: {
        type: "linear",
        domain: resolvedYDomain,
        range: yRange,
        nice: true,
      },
    },
  };
}
