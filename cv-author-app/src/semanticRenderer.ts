import { scaleLinear, scaleUtc } from "d3-scale";
import type { ChartSpec, Dataset, LayerSpec, NestedSpec, ChartPlotArea, ChartScaleSpec } from "./types";
import { renderLineChart, type LineRenderInput } from "./lineRenderer";

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function key(dataset: Dataset, row: Record<string, string>) {
  return (dataset.primaryKey ?? []).map((field) => row[field] ?? "").join("|");
}

function scalesFromSpec(spec: ChartSpec) {
  const x = spec.scales?.x;
  const y = spec.scales?.y;
  if (!x || !y) return null;
  const xScale = scaleUtc().domain((x.domain as [string, string]).map((value) => new Date(value)) as [Date, Date]).range(x.range);
  const yScale = scaleLinear().domain(y.domain as [number, number]).range(y.range);
  return { xScale, yScale, plotArea: spec.plotArea as ChartPlotArea };
}

export function renderLayerChart(input: LineRenderInput & { layerSpec: LayerSpec; childCharts?: ChartSpec[] }) {
  const line = renderLineChart(input);
  const childCharts = input.layerSpec.children.map((child) => child.chartSpec);
  const scatter = input.layerSpec.children.find((child) => child.role === "scatter")?.chartSpec
    ?? childCharts.find((chart) => chart.chartType.replace(/[\s_-]/g, "").toLowerCase().includes("scatter"));
  const scales = scalesFromSpec({ ...input.chartSpec, scales: line.scales, plotArea: line.plotArea });
  if (!scales || !scatter) return { ...line, layerSpec: input.layerSpec };
  const xField = input.layerSpec.x.field;
  const yField = input.layerSpec.y.field;
  const points = input.dataset.rows.map((row) => {
    const x = Date.parse(row[xField] ?? "");
    const y = Number(row[yField] ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
    const rowKey = key(input.dataset, row);
    return `<circle data-mark-role="point" data-row-key="${esc(rowKey)}" data-person="${esc(row.person ?? "")}" data-time="${esc(row.time ?? "")}" cx="${scales.xScale(new Date(x))}" cy="${scales.yScale(y)}" r="4" fill="#111827" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }).join("");
  const markerGroup = `<g data-mark-role="points" data-point-count="${input.dataset.rows.length}">${points}</g>`;
  const content = line.content.replace(/<\/g><\/g>\s*$/, `${markerGroup}</g></g>`);
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
  const fields = input.nestedSpec.valueFields;
  const colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706"];
  const radius = Math.max(5, Math.min(input.width, input.height) * 0.018);
  const pies = input.dataset.rows.map((row) => {
    const x = Date.parse(row[input.baseSpec.encodings.x?.field ?? "time"] ?? "");
    const y = Number(row[input.baseSpec.encodings.y?.field ?? "weight_kg"] ?? "");
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
    const cx = scales.xScale(new Date(x));
    const cy = scales.yScale(y);
    const values = fields.map((field) => Math.max(0, Number(row[field] ?? "0")));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = values.map((value, index) => {
      const next = angle + (value / total) * Math.PI * 2;
      const large = next - angle > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${cx + Math.cos(angle) * radius} ${cy + Math.sin(angle) * radius} A ${radius} ${radius} 0 ${large} 1 ${cx + Math.cos(next) * radius} ${cy + Math.sin(next) * radius} Z`;
      angle = next;
      return `<path data-mark-role="pie-arc" data-pie-component="${esc(fields[index] ?? "")}" d="${d}" fill="${colors[index % colors.length]}"/>`;
    }).join("");
    return `<g data-mark-role="nested-pie" data-row-key="${esc(key(input.dataset, row))}" data-person="${esc(row.person ?? "")}" data-time="${esc(row.time ?? "")}" data-arc-count="${fields.length}">${arcs}</g>`;
  }).join("");
  const content = `<g data-chart-id="${esc(input.chartId)}" data-chart-type="nested-pie" data-mark-role="nested-pies">${pies}</g>`;
  return { content, plotArea: scales.plotArea, pointCount: input.dataset.rows.length };
}

export function restoreScaleSpec(spec: ChartSpec) {
  return spec.scales ? { x: { ...spec.scales.x } as ChartScaleSpec, y: { ...spec.scales.y } as ChartScaleSpec } : undefined;
}
