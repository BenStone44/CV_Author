import { extent } from "d3-array";
import { scaleLinear, scaleLog, scalePoint, scaleUtc } from "d3-scale";
import { arc, pie } from "d3-shape";
import type { CartesianCoordinateGuide, ChartEncoding, ChartSpec, ChartTemplateKind, Dataset, LayerSpec, NestedSpec, ChartPlotArea, ChartScaleSpec, CoordinateGuide, MarkGroupSharedConfig } from "./types";
import { renderLineChart, type LineRenderInput } from "./lineRenderer";
import { getChartTemplateContract, normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";
import { resolvedPolarRadiusMode } from "./encodingConfig";
import {
  isLinearColorMapping,
  isLinearSizeMapping,
  mapColorValue,
  mapSizeValue,
  parseVisualValue,
  visualDomain,
} from "./visualMapping";
import {
  compileCubeValueSeries,
  cubeResultFromDataset,
  cubeSeriesColor,
  cubeBindingMeasureIds,
  type CubeChartBinding,
  type NormalizedCubeSeriesRow,
} from "./cubeModel";
import { renderAdvancedChart } from "./advancedRenderer";

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function key(dataset: Dataset, row: Record<string, string>) {
  return (dataset.primaryKey ?? []).map((field) => row[field] ?? "").join("|");
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

const palette = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];

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
  const mapping = config.colorMapping;
  if (encoding && domain && isLinearColorMapping(mapping)) {
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
  const xEncoding = input.chartSpec.encodings.x!;
  const yEncoding = input.chartSpec.encodings.y!;
  const xPosition = chartScalePosition(x);
  const yPosition = chartScalePosition(y);
  const colorEncoding = input.chartSpec.encodings.color;
  const sizeEncoding = input.chartSpec.encodings.size;
  const colorField = colorEncoding?.field;
  const sizeField = sizeEncoding?.field;
  const colorValues = colorField ? Array.from(new Set(input.dataset.rows.map((row) => row[colorField] ?? ""))) : [];
  const sizeValues = sizeField ? input.dataset.rows.map((row) => Number(row[sizeField] ?? "")).filter(Number.isFinite) : [];
  const sizeDomain = extent(sizeValues) as [number | undefined, number | undefined];
  const sizeScale = sizeDomain[0] === undefined || sizeDomain[1] === undefined
    ? () => 4
    : scaleLinear().domain(sizeDomain[0] === sizeDomain[1] ? [sizeDomain[0] - 1, sizeDomain[1] + 1] : sizeDomain as [number, number]).range([3, 9]);
  const config = groupConfig(input.chartSpec, "point");
  const colorDomain = visualDomain(input.dataset.rows, colorEncoding);
  const mappedSizeDomain = visualDomain(input.dataset.rows, sizeEncoding);
  const marks = input.dataset.rows.map((row, index) => {
    const xv = row[xEncoding.field] ?? "";
    const yv = row[yEncoding.field] ?? "";
    const cx = xPosition(xv);
    const cy = yPosition(yv);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return "";
    const rowKey = key(input.dataset, row) || String(index);
    const colorIndex = colorField ? Math.max(0, colorValues.indexOf(row[colorField] ?? "")) : 0;
    const radius = visualSize(
      row,
      sizeEncoding,
      mappedSizeDomain,
      config,
      sizeField ? sizeScale(Number(row[sizeField] ?? "")) : 4,
    );
    const color = visualColor(row, colorEncoding, colorDomain, config, palette[colorIndex % palette.length]!);
    return `<circle data-chart-id="${esc(input.chartId)}" data-mark-role="point" data-mark-group-id="mark-group:${esc(input.chartId)}:point" data-row-key="${esc(rowKey)}" data-series-key="${esc(input.chartSpec.series ? row[input.chartSpec.series.field] ?? "" : "")}" cx="${cx}" cy="${cy}" r="${radius}" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 0.88)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
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

function renderBarChart(input: GenericRenderInput) {
  const xEncoding = input.chartSpec.encodings.x;
  const yEncoding = input.chartSpec.encodings.y;
  if (!xEncoding || !yEncoding) throw new Error("Bar renderer requires both X and Y encodings.");
  if (yEncoding.type !== "quantitative") throw new Error("Bar renderer Y encoding must be quantitative.");
  const variant = normalizeBarChartVariant(input.chartSpec.chartType) ?? "single";
  const seriesEncoding = input.chartSpec.encodings.color?.type === "nominal"
    || input.chartSpec.encodings.color?.type === "temporal"
    ? input.chartSpec.encodings.color
    : input.chartSpec.series;
  const categoryValues = Array.from(new Set(input.dataset.rows.map((row) => row[xEncoding.field] ?? "").filter(Boolean)));
  const seriesValues = seriesEncoding
    ? Array.from(new Set(input.dataset.rows.map((row) => row[seriesEncoding.field] ?? "").filter(Boolean)))
    : ["__single__"];
  const groups = new Map<string, BarDatum>();
  input.dataset.rows.forEach((row) => {
    const category = row[xEncoding.field] ?? "";
    const series = seriesEncoding ? row[seriesEncoding.field] ?? "" : "__single__";
    const value = Number(row[yEncoding.field] ?? "");
    if (!category || !series || !Number.isFinite(value)) return;
    const groupKey = `${category}\u0000${series}`;
    const current = groups.get(groupKey);
    if (current) {
      current.value += value;
      current.rows.push(row);
    } else {
      groups.set(groupKey, { category, series, value, rows: [row] });
    }
  });
  const data = Array.from(groups.values());
  const aggregation = input.chartSpec.aggregations?.y ?? "sum";
  if (aggregation === "avg") data.forEach((datum) => { datum.value /= datum.rows.length; });

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
  const scaledPlotWidth = Math.max(1, basePlotArea.width * (guide?.xScale ?? 1));
  const scaledPlotHeight = Math.max(1, basePlotArea.height * (guide?.yScale ?? 1));
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
  const yDomain: [number, number] = input.sharedScales?.y?.type === "linear"
    ? input.sharedScales.y.domain as [number, number]
    : minimum === 0 && maximum === 0
      ? [0, 1]
      : [minimum - (minimum < 0 ? span * 0.04 : 0), maximum + (maximum > 0 ? span * 0.04 : 0)];
  const xScale: ChartScaleSpec = input.sharedScales?.x ?? { type: "point", domain: categoryValues, range: xRange };
  const yScale: ChartScaleSpec = input.sharedScales?.y ?? { type: "linear", domain: yDomain, range: yRange, nice: true };
  const xPosition = chartScalePosition(xScale);
  const yPosition = chartScalePosition(yScale);
  const zeroY = yPosition("0");
  const categoryBand = plotArea.width / Math.max(categoryValues.length, 1);
  const groupCount = variant === "grouped" ? Math.max(seriesValues.length, 1) : 1;
  const groupBand = categoryBand * 0.78 / groupCount;
  const defaultWidth = variant === "grouped" ? groupBand * 0.88 : categoryBand * 0.7;
  const config = groupConfig(input.chartSpec, "bar");
  const colorEncoding = input.chartSpec.encodings.color;
  const sizeEncoding = input.chartSpec.encodings.size;
  const colorDomain = visualDomain(input.dataset.rows, colorEncoding);
  const sizeDomain = visualDomain(input.dataset.rows, sizeEncoding);
  const stackOffsets = new Map<string, { positive: number; negative: number }>(
    categoryValues.map((category) => [category, { positive: 0, negative: 0 }]),
  );
  const marks = data.map((datum, index) => {
    const categoryCenter = xPosition(datum.category);
    if (!Number.isFinite(categoryCenter)) return "";
    const seriesIndex = Math.max(0, seriesValues.indexOf(datum.series));
    const representative = datum.rows[0] ?? {};
    const fallbackColor = palette[seriesIndex % palette.length]!;
    const color = visualColor(representative, colorEncoding, colorDomain, config, fallbackColor);
    const mappedWidth = visualSize(representative, sizeEncoding, sizeDomain, config, defaultWidth);
    const barWidth = Math.max(1, Math.min(mappedWidth, variant === "grouped" ? groupBand * 0.92 : categoryBand * 0.9));
    const centerX = variant === "grouped"
      ? categoryCenter + (seriesIndex - (groupCount - 1) / 2) * groupBand
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
    const startY = yPosition(String(startValue));
    const endY = yPosition(String(endValue));
    const rectY = Math.min(startY, endY);
    const height = Math.max(1, Math.abs(startY - endY));
    const keys = datum.rows.map((row, rowIndex) => key(input.dataset, row) || String(rowIndex)).join(",");
    return `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="bar" data-mark-group-id="mark-group:${esc(input.chartId)}:bar" data-row-keys="${esc(keys)}" data-category-key="${esc(datum.category)}" data-series-key="${esc(datum.series)}" data-value="${datum.value}" x="${centerX - barWidth / 2}" y="${rectY}" width="${barWidth}" height="${height}" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 0.9)}"/>`;
  }).join("");
  const zeroLine = (variant === "divergent" || variant === "divergent-stacked") && Number.isFinite(zeroY)
    ? `<line data-mark-role="zero-line" x1="${plotArea.x}" y1="${zeroY}" x2="${plotArea.x + plotArea.width}" y2="${zeroY}" stroke="${esc(input.chartSpec.styleTokens?.axisColor ?? "#64748b")}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    : "";
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="bar" data-bar-variant="${variant}" data-renderer="deterministic-bar@1">${zeroLine}${marks}</g>`,
    plotArea,
    scales: { x: xScale, y: yScale },
  };
}

function resolvedPolarEncodings(spec: ChartSpec) {
  return {
    value: spec.encodings.angle ?? spec.encodings.y,
    category: spec.encodings.color ?? spec.encodings.x,
    radius: spec.encodings.radius,
    ring: spec.encodings.ring ?? spec.series,
  };
}

function compileCubeRadiusRows(
  cube: ReturnType<typeof cubeResultFromDataset>,
  binding: CubeChartBinding,
  measureId: string,
  preserveSlice: boolean,
) {
  const slots = { ...binding.slots, value: { kind: "measure" as const, measureId } };
  const slice = slots.slice;
  const filters = [...(binding.filters ?? [])];
  if (!preserveSlice || slice?.kind === "value-series") {
    if (slice?.kind === "dimension" && slice.memberIds?.length) {
      filters.push({
        kind: "members",
        dimensionId: slice.dimensionId,
        memberIds: [...slice.memberIds],
        mode: "include",
      });
    }
    delete slots.slice;
  }
  return compileCubeValueSeries(cube, {
    ...binding,
    slots,
    filters,
  }, "value", "slice");
}

function matchingCubeRadiusValue(
  angleRow: NormalizedCubeSeriesRow,
  radiusRows: NormalizedCubeSeriesRow[],
) {
  const matchingRow = angleRow.dimensionId
    ? radiusRows.find((row) => row.dimensionId === angleRow.dimensionId && row.memberId === angleRow.memberId)
    : radiusRows[0];
  return matchingRow?.value ?? Number.NaN;
}

function renderPolarChart(input: GenericRenderInput, donut: boolean) {
  const { value, category, radius, ring } = resolvedPolarEncodings(input.chartSpec);
  const angleFields = donut ? [] : input.chartSpec.angleFields ?? [];
  const cubeThetaSlot = input.chartSpec.cubeBinding?.slots.theta ? "theta" : "value";
  if (!value && angleFields.length === 0 && !input.chartSpec.cubeBinding?.slots[cubeThetaSlot]) throw new Error(`${donut ? "Donut" : "Pie"} renderer requires a Theta encoding.`);
  const minX = input.minX;
  const minY = input.minY;
  const cx = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.origin.x : minX + input.width / 2;
  const cy = input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.origin.y : minY + input.height / 2;
  const config = groupConfig(input.chartSpec, "arc");
  const staticRadiusRatio = typeof config.outerRadius === "number"
    ? Math.max(0.15, Math.min(config.outerRadius, 1))
    : 1;
  const outerRadius = Math.max(8, Math.min(input.width, input.height) * 0.38
    * (input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.radiusScale ?? 1 : 1)
    * staticRadiusRatio);
  const colorDomain = visualDomain(input.dataset.rows, category);
  const angleSpan = input.coordinateGuide?.type === "Polar"
    ? Math.max(1, Math.min(input.coordinateGuide.angleSpan ?? 360, 360))
    : 360;
  const layoutStartAngle = -270 * Math.PI / 180;
  const layoutEndAngle = layoutStartAngle + angleSpan * Math.PI / 180;
  if (input.chartSpec.cubeBinding?.slots[cubeThetaSlot]) {
    const cube = cubeResultFromDataset(input.dataset);
    const binding = input.chartSpec.cubeBinding;
    const compiled = compileCubeValueSeries(
      cube,
      binding,
      cubeThetaSlot,
      "slice",
    );
    if (compiled.errors.length > 0) throw new Error(compiled.errors.join(" "));
    const componentValues = compiled.rows.map((row) => row.value);
    if (componentValues.length === 0) throw new Error(`${donut ? "Donut" : "Pie"} Cube binding has no numeric values.`);
    const layout = pie<number>()
      .sort(null)
      .value((datum) => datum)
      .startAngle(layoutStartAngle)
      .endAngle(layoutEndAngle)(componentValues);
    const innerRadius = donut ? outerRadius * 0.44 : 0;
    const radiusMode = resolvedPolarRadiusMode(input.chartSpec);
    const radiusSource = binding.slots.radius;
    const cubeRadiusField = radiusSource?.kind === "measure" ? radiusSource.measureId : radius?.field;
    const mappedRadiusRows = radiusMode === "mapped" && cubeRadiusField
      ? compileCubeRadiusRows(cube, binding, cubeRadiusField, binding.slots.slice?.kind === "dimension")
      : { rows: [], errors: [] };
    if (mappedRadiusRows.errors.length > 0) throw new Error(mappedRadiusRows.errors.join(" "));
    const componentRadiusValues = compiled.rows.map((row) => radiusMode === "mapped"
      ? matchingCubeRadiusValue(row, mappedRadiusRows.rows)
      : Number.NaN);
    const radiusDomainValues = componentRadiusValues.filter(Number.isFinite);
    const radiusDomain = extent(radiusDomainValues) as [number | undefined, number | undefined];
    const radiusScale = radiusDomain[0] === undefined || radiusDomain[1] === undefined || radiusDomain[0] === radiusDomain[1]
      ? () => outerRadius
      : scaleLinear().domain(radiusDomain as [number, number]).range([outerRadius * 0.42, outerRadius]);
    const arcs = layout.map((datum, index) => {
      const row = compiled.rows[index]!;
      const fallbackColor = palette[index % palette.length]!;
      const color = cubeSeriesColor(input.chartSpec.cubeBinding, row.styleKey)
        ?? visualColor({}, category, null, config, fallbackColor);
      const radiusValue = componentRadiusValues[index] ?? Number.NaN;
      const componentOuterRadius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : outerRadius;
      const path = arc<any>().innerRadius(innerRadius).outerRadius(componentOuterRadius);
      return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="arc" data-mark-group-id="mark-group:${esc(input.chartId)}:arc" data-category-key="${esc(row.seriesKey)}" data-series-key="${esc(row.seriesKey)}" data-theta-field="${esc(row.measureId)}" data-theta-value="${row.value}" data-angle-field="${esc(row.measureId)}" data-angle-value="${row.value}" data-cube-style-key="${esc(row.styleKey)}" data-radius-mode="${radiusMode}" data-radius-field="${esc(cubeRadiusField ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" d="${path(datum) ?? ""}" transform="translate(${cx} ${cy})" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 1)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }).join("");
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="${donut ? "donut" : "pie"}" data-renderer="deterministic-cube-polar@1" data-theta-fields="${esc(cubeBindingMeasureIds(input.chartSpec.cubeBinding, cubeThetaSlot).join("|"))}" data-angle-fields="${esc(cubeBindingMeasureIds(input.chartSpec.cubeBinding, cubeThetaSlot).join("|"))}" data-radius-mode="${radiusMode}">${arcs}</g>`,
      plotArea: { x: cx - outerRadius, y: cy - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
      scales: undefined,
    };
  }
  if (angleFields.length > 0) {
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
    const components = Array.from(flattenedGroups.values()).flatMap((flattened) =>
      angleFields.map((encoding) => ({
        field: encoding.field,
        flattenValues: flattened.values,
        rows: flattened.rows,
        value: flattened.rows.reduce((sum, row) => sum + Math.max(0, Number(row[encoding.field] ?? "0")), 0),
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
      : scaleLinear().domain(radiusDomain as [number, number]).range([outerRadius * 0.42, outerRadius]);
    const arcs = layout.map((datum, index) => {
      const component = components[index];
      const field = component?.field ?? String(index + 1);
      const categoryKey = [...(component?.flattenValues ?? []), field].join(" / ");
      const radiusValue = componentRadiusValues[index] ?? Number.NaN;
      const componentOuterRadius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : outerRadius;
      const path = arc<any>().innerRadius(0).outerRadius(componentOuterRadius);
      const representativeRow = component?.rows[0] ?? input.dataset.rows[index] ?? {};
      const color = visualColor(representativeRow, category, colorDomain, config, palette[index % palette.length]!);
      return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="arc" data-mark-group-id="mark-group:${esc(input.chartId)}:arc" data-category-key="${esc(categoryKey)}" data-theta-field="${esc(field)}" data-theta-value="${componentValues[index] ?? 0}" data-angle-field="${esc(field)}" data-angle-value="${componentValues[index] ?? 0}" data-flatten-fields="${esc(flattenFields.join("|"))}" data-flatten-values="${esc((component?.flattenValues ?? []).join("|"))}" data-radius-mode="${radiusMode}" data-radius-field="${esc(radius?.field ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" d="${path(datum) ?? ""}" transform="translate(${cx} ${cy})" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 1)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }).join("");
    return {
      content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="pie" data-renderer="deterministic-chart@1" data-theta-fields="${esc(angleFields.map((encoding) => encoding.field).join("|"))}" data-angle-fields="${esc(angleFields.map((encoding) => encoding.field).join("|"))}" data-flatten-fields="${esc(flattenFields.join("|"))}" data-radius-mode="${radiusMode}">${arcs}</g>`,
      plotArea: { x: cx - outerRadius, y: cy - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
      scales: undefined,
    };
  }
  if (!value) throw new Error(`${donut ? "Donut" : "Pie"} renderer requires an angle/value encoding.`);
  const ringValues = ring ? Array.from(new Set(input.dataset.rows.map((row) => row[ring.field] ?? ""))).filter(Boolean) : ["__single__"];
  const ringWidth = outerRadius / Math.max(ringValues.length + (donut ? 1 : 0), 1) * (input.coordinateGuide?.type === "Polar" ? input.coordinateGuide.ringScale ?? 1 : 1);
  const arcs = ringValues.map((ringKey, ringIndex) => {
    const rows = ring ? input.dataset.rows.filter((row) => (row[ring.field] ?? "") === ringKey) : input.dataset.rows;
    const values = rows.map((row) => Math.max(0, Number(row[value.field] ?? "0")));
    const layout = pie<number>()
      .sort(null)
      .value((datum) => datum)
      .startAngle(layoutStartAngle)
      .endAngle(layoutEndAngle)(values);
    const inner = donut || ring ? ringWidth * (ringIndex + (donut ? 1 : 0)) : 0;
    const outer = ring ? inner + ringWidth * 0.92 : outerRadius;
    const radiusValues = radius
      ? rows.map((row) => Number(row[radius.field] ?? "")).filter(Number.isFinite)
      : [];
    const radiusDomain = extent(radiusValues) as [number | undefined, number | undefined];
    const radiusScale = radiusDomain[0] === undefined || radiusDomain[1] === undefined || radiusDomain[0] === radiusDomain[1]
      ? () => outer
      : scaleLinear()
        .domain(radiusDomain as [number, number])
        .range([inner + (outer - inner) * 0.48, outer]);
    return layout.map((datum, index) => {
      const row = rows[index]!;
      const categoryKey = category ? row[category.field] ?? "" : String(index + 1);
      const color = visualColor(row, category, colorDomain, config, palette[index % palette.length]!);
      const radiusValue = radius ? Number(row[radius.field] ?? "") : Number.NaN;
      const rowOuterRadius = Number.isFinite(radiusValue) ? radiusScale(radiusValue) : outer;
      const path = arc<any>().innerRadius(inner).outerRadius(rowOuterRadius);
      return `<path data-chart-id="${esc(input.chartId)}" data-mark-role="arc" data-mark-group-id="mark-group:${esc(input.chartId)}:arc" data-row-key="${esc(key(input.dataset, row) || String(index))}" data-series-key="${esc(ringKey)}" data-category-key="${esc(categoryKey)}" data-radius-field="${esc(radius?.field ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" d="${path(datum) ?? ""}" transform="translate(${cx} ${cy})" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? 1)}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }).join("");
  }).join("");
  return {
    content: `<g data-chart-id="${esc(input.chartId)}" data-chart-type="${donut ? "donut" : "pie"}" data-renderer="deterministic-chart@1">${arcs}</g>`,
    plotArea: { x: cx - outerRadius, y: cy - outerRadius, width: outerRadius * 2, height: outerRadius * 2 },
    scales: undefined,
  };
}

function renderMatrixChart(input: GenericRenderInput) {
  const rowEncoding = input.chartSpec.encodings.row ?? input.chartSpec.encodings.y;
  const columnEncoding = input.chartSpec.encodings.column ?? input.chartSpec.encodings.x;
  const valueEncoding = input.chartSpec.encodings.value;
  const colorEncoding = input.chartSpec.encodings.color ?? valueEncoding;
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
  const scaledPlotWidth = Math.max(1, basePlotArea.width * (guide?.xScale ?? 1));
  const scaledPlotHeight = Math.max(1, basePlotArea.height * (guide?.yScale ?? 1));
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
  const numeric = valueEncoding ? input.dataset.rows.map((row) => Number(row[valueEncoding.field] ?? "")).filter(Number.isFinite) : [];
  const domain = extent(numeric) as [number | undefined, number | undefined];
  const opacity = domain[0] === undefined || domain[1] === undefined || domain[0] === domain[1]
    ? () => 0.72
    : scaleLinear().domain(domain as [number, number]).range([0.18, 0.95]);
  const config = groupConfig(input.chartSpec, "cell");
  const colorDomain = visualDomain(input.dataset.rows, colorEncoding);
  const colorValues = colorEncoding?.type === "nominal" || colorEncoding?.type === "temporal"
    ? Array.from(new Set(input.dataset.rows.map((row) => row[colorEncoding.field] ?? "")))
    : [];
  const cells = input.dataset.rows.map((row, index) => {
    const rowKey = row[rowEncoding.field] ?? "";
    const columnKey = row[columnEncoding.field] ?? "";
    const rowIndex = rowValues.indexOf(rowKey);
    const columnIndex = columnValues.indexOf(columnKey);
    if (rowIndex < 0 || columnIndex < 0) return "";
    const alpha = valueEncoding ? opacity(Number(row[valueEncoding.field] ?? "")) : 0.72;
    const colorIndex = colorEncoding ? Math.max(0, colorValues.indexOf(row[colorEncoding.field] ?? "")) : 0;
    const color = visualColor(row, colorEncoding, colorDomain, config, palette[colorIndex % palette.length] ?? "#2563eb");
    const centerX = xPosition(columnKey);
    const centerY = yPosition(rowKey);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return "";
    return `<rect data-chart-id="${esc(input.chartId)}" data-mark-role="cell" data-mark-group-id="mark-group:${esc(input.chartId)}:cell" data-row-key="${esc(key(input.dataset, row) || String(index))}" data-row-value="${esc(rowKey)}" data-column-value="${esc(columnKey)}" x="${centerX - cellWidth / 2 + 0.5}" y="${centerY - cellHeight / 2 + 0.5}" width="${Math.max(1, cellWidth - 1)}" height="${Math.max(1, cellHeight - 1)}" fill="${esc(color)}" fill-opacity="${Number(config.opacity ?? alpha)}"/>`;
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
  sharedPlotArea?: ChartPlotArea;
  sharedScales?: Partial<{ x: ChartScaleSpec; y: ChartScaleSpec }>;
};

export type DeterministicChartResult = {
  content: string;
  plotArea: ChartPlotArea;
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
export const deterministicChartPipelines: Record<ChartTemplateKind, ChartPipeline> = {
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
  parallel: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  hierarchy: { coordinateSystem: "CoordinateFree", render: renderAdvancedChart },
  calendar: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  boxplot: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  contour: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  hexbin: { coordinateSystem: "Cartesian", render: renderAdvancedChart },
  flow: { coordinateSystem: "CoordinateFree", render: renderAdvancedChart },
};

export function renderDeterministicChart(input: GenericRenderInput) {
  const template = normalizeChartTemplate(input.chartSpec.chartType);
  if (!template) throw new Error(`Unsupported chart template: ${input.chartSpec.chartType}`);
  const pipeline = deterministicChartPipelines[template];
  const coordinateSystem = getChartTemplateContract(input.chartSpec.chartType)?.coordinateSystem ?? pipeline.coordinateSystem;
  if (coordinateSystem !== "CoordinateFree") requireCoordinateGuide(input, coordinateSystem);
  return pipeline.render(input);
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
  const markerGroup = `<g data-mark-role="points" data-point-count="${input.dataset.rows.length}">${scatterResult.content}</g>`;
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
  const groupId = input.nestedSpec.groupId ?? `nested-pie-group:${input.nestedSpec.parentChartNodeId}`;
  const colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706"];
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
    const x = row[input.baseSpec.encodings.x?.field ?? "time"] ?? "";
    const y = row[input.baseSpec.encodings.y?.field ?? "weight_kg"] ?? "";
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
    return `<g data-mark-role="nested-pie" data-mark-group-id="${esc(groupId)}" data-composition-group-id="${esc(groupId)}" data-row-key="${esc(key(input.dataset, row))}" data-person="${esc(row.person ?? "")}" data-time="${esc(row.time ?? "")}" data-radius-field="${esc(radiusField ?? "")}" data-radius-value="${Number.isFinite(radiusValue) ? radiusValue : ""}" data-arc-count="${fields.length}">${arcs}</g>`;
  }).join("");
  const content = `<g data-chart-id="${esc(input.chartId)}" data-chart-type="nested-pie" data-mark-role="nested-pies" data-composition-group-id="${esc(groupId)}" data-parent-mark-group-id="${esc(input.nestedSpec.parentMarkGroupId ?? "")}">${pies}</g>`;
  return { content, plotArea: scales.plotArea, pointCount: rows.length };
}

export function restoreScaleSpec(spec: ChartSpec) {
  return spec.scales ? {
    ...(spec.scales.x ? { x: { ...spec.scales.x } as ChartScaleSpec } : {}),
    ...(spec.scales.y ? { y: { ...spec.scales.y } as ChartScaleSpec } : {}),
  } : undefined;
}
