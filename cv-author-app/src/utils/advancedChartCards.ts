import {
  contours as d3Contours,
  geoPath,
  linkRadial,
  range as d3Range,
  scaleLinear,
  scaleLog,
  scaleSequential,
  scaleSequentialLog,
  ticks,
} from "d3";
import { hexbin } from "d3-hexbin";
import Papa from "papaparse";
import type { Dataset, SvgCandidate } from "../types";
import diamondsCsv from "../../../data/d3_hexbin_diamonds.csv?raw";
import { renderDefaultChartSvg } from "./defaultChartData";
import { globalGradientColor } from "./visualMapping";
import {
  createRadialClusterLayout,
  RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS,
  RADIAL_DENDROGRAM_SELECTION_PADDING,
  type RadialClusterNode,
} from "./radialClusterLayout";
import { globalPalette } from "../config/global";

const advancedPalette = globalPalette.categorical;

const frame = (content: string, viewBox = "0 0 320 180") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" font-family="sans-serif">${content}</svg>`;
const axis = `<g fill="none" stroke="#111" stroke-width="1"><path d="M28 18V152H304"/></g>`;

const calendarCells = Array.from({ length: 53 * 5 }, (_, index) => {
  const week = Math.floor(index / 5);
  const day = index % 5;
  const colors = globalPalette.categorical;
  return `<rect x="${42 + week * 5.08}" y="${54 + day * 18}" width="4.2" height="17" fill="${colors[(week * 3 + day * 2) % colors.length]}"/>`;
}).join("");

function observableContourTemplateSvg() {
  const width = 928;
  const height = 600;
  const viewWidth = width + 28;
  const q = 4;
  const x = scaleLinear().domain([-2, 2]).range([0, viewWidth]);
  const y = scaleLinear().domain([-2, 1]).range([height, 0]);
  const value = (px: number, py: number) =>
    (1 + (px + py + 1) ** 2 * (19 - 14 * px + 3 * px ** 2 - 14 * py + 6 * px * py + 3 * py ** 2))
    * (30 + (2 * px - 3 * py) ** 2 * (18 - 32 * px + 12 * px ** 2 + 48 * py - 36 * px * py + 27 * py ** 2));
  const x0 = -q / 2;
  const x1 = viewWidth + q;
  const y0 = -q / 2;
  const y1 = height + q;
  const columns = Math.ceil((x1 - x0) / q);
  const rows = Math.ceil((y1 - y0) / q);
  const values = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return value(x.invert(column * q + x0), y.invert(row * q + y0));
  });
  const thresholds = d3Range(1, 20).map((index) => 2 ** index);
  const color = scaleSequentialLog((value) => globalGradientColor(value, [0, 1])).domain([thresholds[0]!, thresholds.at(-1)!]);
  const path = geoPath();
  const contourMarks = d3Contours()
    .size([columns, rows])
    .thresholds(thresholds)(values)
    .map((contour) => ({
      ...contour,
      coordinates: contour.coordinates.map((polygons) => polygons.map((points) => points.map(([px = 0, py = 0]) => [
        -q + q * px,
        -q + q * py,
      ]))),
    }))
    .map((contour) => `<path d="${path(contour as any) ?? ""}" fill="${color(contour.value)}" stroke="#fff" stroke-opacity="0.5"/>`)
    .join("");
  const xTicks = ticks(-2, 2, 8).filter((tick) => tick !== -2 && tick !== 2)
    .map((tick) => `<g transform="translate(${x(tick)} ${height})"><line y2="-5" stroke="currentColor"/><text y="-8" text-anchor="middle" font-size="10">${tick}</text></g>`)
    .join("");
  const yTicks = ticks(-2, 1, 6).filter((tick) => tick !== -2 && tick !== 1)
    .map((tick) => `<g transform="translate(0 ${y(tick)})"><line x2="5" stroke="currentColor"/><text x="8" dy="0.32em" font-size="10">${tick}</text></g>`)
    .join("");
  return frame(`<g data-chart-type="contour" data-renderer="observable-contours@2"><g>${contourMarks}</g><g fill="currentColor">${xTicks}${yTicks}</g></g>`, `0 0 ${viewWidth} ${height}`);
}

type DiamondDatum = { carat: number; price: number };

function observableHexbinTemplateSvg() {
  const diamonds = Papa.parse<{ carat?: string; price?: string }>(diamondsCsv, {
    header: true,
    skipEmptyLines: "greedy",
  }).data.flatMap((row) => {
    const carat = Number(row.carat);
    const price = Number(row.price);
    return carat > 0 && price > 0 ? [{ carat, price }] : [];
  });
  const width = 928;
  const height = width;
  const marginTop = 20;
  const marginRight = 20;
  const marginBottom = 30;
  const marginLeft = 40;
  const xDomain = [Math.min(...diamonds.map((row) => row.carat)), Math.max(...diamonds.map((row) => row.carat))] as [number, number];
  const yDomain = [Math.min(...diamonds.map((row) => row.price)), Math.max(...diamonds.map((row) => row.price))] as [number, number];
  const x = scaleLog().domain(xDomain).range([marginLeft, width - marginRight]);
  const y = scaleLog().domain(yDomain).rangeRound([height - marginBottom, marginTop]);
  const radius = 8 * width / 928;
  const layout = hexbin<DiamondDatum>()
    .x((row) => x(row.carat))
    .y((row) => y(row.price))
    .radius(radius)
    .extent([[marginLeft, marginTop], [width - marginRight, height - marginBottom]]);
  const bins = layout(diamonds);
  const maximum = Math.max(1, ...bins.map((bin) => bin.length));
  const color = scaleSequential((value) => globalGradientColor(value, [0, 1])).domain([0, maximum / 2]);
  const marks = bins.map((bin) => `<path transform="translate(${bin.x} ${bin.y})" d="${layout.hexagon()}" fill="${color(bin.length)}" stroke="black" stroke-width="0.75"/>`).join("");
  const xTicks = [0.2, 0.5, 1, 2, 5].filter((tick) => tick >= xDomain[0] && tick <= xDomain[1])
    .map((tick) => `<g transform="translate(${x(tick)} ${height - marginBottom})"><line y2="5" stroke="currentColor"/><text y="14" text-anchor="middle" font-size="10">${tick}</text></g>`)
    .join("");
  const yTicks = [300, 1000, 3000, 10000].filter((tick) => tick >= yDomain[0] && tick <= yDomain[1])
    .map((tick) => `<g transform="translate(${marginLeft} ${y(tick)})"><line x2="-5" stroke="currentColor"/><text x="-8" dy="0.32em" text-anchor="end" font-size="10">${tick >= 1000 ? `${tick / 1000}k` : tick}</text></g>`)
    .join("");
  return frame(`<g data-chart-type="hexbin" data-renderer="observable-hexbin@2" data-source-row-count="${diamonds.length}"><g>${marks}</g><g fill="currentColor">${xTicks}${yTicks}<text x="${width - marginRight}" y="${height - marginBottom - 4}" text-anchor="end" font-size="12" font-weight="bold">Carats</text><text x="${marginLeft + 4}" y="${marginTop + 8}" font-size="12" font-weight="bold">$ Price</text></g></g>`, `0 0 ${width} ${height}`);
}

function radialClusterTemplateSvg() {
  const dataset: Dataset = {
    id: "template:radial-cluster",
    name: "Radial cluster template",
    columns: [
      { name: "id", type: "nominal" },
      { name: "parent", type: "nominal" },
    ],
    rows: [
      { id: "root", parent: "" },
      { id: "analytics", parent: "root" },
      { id: "cluster", parent: "analytics" },
      { id: "graph", parent: "analytics" },
      { id: "stats", parent: "analytics" },
      { id: "visual", parent: "root" },
      { id: "color", parent: "visual" },
      { id: "scale", parent: "visual" },
      { id: "shape", parent: "visual" },
      { id: "util", parent: "visual" },
    ],
  };
  const cx = 160;
  const cy = 90;
  const leafRadius = RADIAL_DENDROGRAM_DEFAULT_LEAF_RADIUS;
  const selectionRadius = leafRadius + RADIAL_DENDROGRAM_SELECTION_PADDING;
  const radial = createRadialClusterLayout(dataset, {
    keyField: "id",
    parentField: "parent",
    orderField: "id",
    startAngle: Math.PI / 2,
    angleSpan: Math.PI * 2,
    innerRadius: 0,
    outerRadius: leafRadius,
  });
  const nodes = radial.root.descendants().filter(radial.visible) as RadialClusterNode[];
  const radialLink = linkRadial<any, RadialClusterNode>()
    .angle((node) => node.x)
    .radius((node) => node.y);
  const links = radial.root.links()
    .filter((link) => radial.visible(link.source) && radial.visible(link.target))
    .map((link) => `<path d="${radialLink(link as any) ?? ""}"/>`)
    .join("");
  const marks = nodes.map((node) => {
    const rotation = node.x * 180 / Math.PI - 90;
    return `<circle transform="rotate(${rotation}) translate(${node.y},0)" r="2.5" fill="${node.children ? "#555" : "#999"}"/>`;
  }).join("");
  const labels = nodes.map((node) => {
    const onLeft = Math.sin(node.x) < 0;
    const rotation = node.x * 180 / Math.PI - 90;
    const labelOnOutside = !onLeft === !node.children;
    return `<text transform="rotate(${rotation}) translate(${node.y},0) rotate(${onLeft ? 180 : 0})" dy="0.31em" x="${labelOnOutside ? 6 : -6}" text-anchor="${labelOnOutside ? "start" : "end"}">${node.id ?? ""}</text>`;
  }).join("");
  return frame(`<g transform="translate(${cx} ${cy})" data-renderer="observable-radial-cluster@3" data-angle-span="360" data-leaf-radius="${leafRadius}" data-selection-radius="${selectionRadius}"><g fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5">${links}</g><g>${marks}</g><g stroke-linejoin="round" stroke-width="3" paint-order="stroke" stroke="white" fill="currentColor" font-size="8">${labels}</g></g>`);
}

export const advancedTemplateSvgs = {
  AreaChart: frame(`${axis}<path d="M28 152L28 125L62 113L96 121L130 91L164 101L198 66L232 79L266 39L304 56L304 152Z" fill="#4f8fc4" fill-opacity=".8" stroke="#2563eb" stroke-width="1.5"/><g fill="#fff" stroke="#2563eb" stroke-width="2"><circle cx="28" cy="125" r="3"/><circle cx="62" cy="113" r="3"/><circle cx="96" cy="121" r="3"/><circle cx="130" cy="91" r="3"/><circle cx="164" cy="101" r="3"/><circle cx="198" cy="66" r="3"/><circle cx="232" cy="79" r="3"/><circle cx="266" cy="39" r="3"/><circle cx="304" cy="56" r="3"/></g>`),
  StackedAreaChart: frame(`${axis}<path d="M28 152L28 123L62 116L96 127L130 107L164 114L198 92L232 102L266 76L304 87L304 152Z" fill="#4e79a7" stroke="#355f86" stroke-width="1"/><path d="M28 123L28 93L62 79L96 101L130 68L164 83L198 50L232 67L266 38L304 54L304 87L266 76L232 102L198 92L164 114L130 107L96 127L62 116L28 123Z" fill="#f28e2c" stroke="#c56d18" stroke-width="1"/><path d="M28 93L28 73L62 55L96 76L130 43L164 57L198 25L232 40L266 18L304 32L304 54L266 38L232 67L198 50L164 83L130 68L96 101L62 79L28 93Z" fill="#e15759" stroke="#b83d42" stroke-width="1"/><g fill="#fff" stroke="#b83d42" stroke-width="1.5"><circle cx="28" cy="73" r="2.5"/><circle cx="96" cy="76" r="2.5"/><circle cx="164" cy="57" r="2.5"/><circle cx="232" cy="40" r="2.5"/><circle cx="304" cy="32" r="2.5"/></g>`),
  Streamgraph: frame(`${axis}<path d="M28 81L58 69L88 74L118 61L148 73L178 55L208 67L238 48L268 61L304 57L304 91L268 92L238 88L208 96L178 91L148 101L118 91L88 100L58 91L28 94Z" fill="#4e79a7"/><path d="M28 94L58 91L88 100L118 91L148 101L178 91L208 96L238 88L268 92L304 91L304 119L268 112L238 121L208 110L178 123L148 112L118 126L88 112L58 119L28 111Z" fill="#f28e2c"/><path d="M28 81L58 69L88 74L118 61L148 73L178 55L208 67L238 48L268 61L304 57L304 39L268 43L238 30L208 47L178 36L148 51L118 42L88 56L58 49L28 60Z" fill="#e15759"/>`),
  HorizonChart: frame(`<g font-size="7" fill="#111"><text x="42" y="12">Jan</text><text x="156" y="12">Jul</text><text x="276" y="12">Dec</text></g><g transform="translate(0 20)"><g><rect x="20" y="1" width="286" height="31" fill="#f7fbff"/><path d="M20 32L20 26L52 19L84 27L116 14L148 23L180 10L212 20L244 7L276 18L306 11L306 32Z" fill="${advancedPalette[0]!}"/><path d="M20 32L52 25L84 33L116 20L148 29L180 16L212 26L244 13L276 24L306 17" fill="none" stroke="${advancedPalette[1]!}" stroke-width="6" clip-path="url(#hc)"/><text x="24" y="18" font-size="8">Series A</text></g><g transform="translate(0 38)"><rect x="20" y="1" width="286" height="31" fill="#f7fbff"/><path d="M20 32L20 20L52 27L84 17L116 25L148 11L180 22L212 8L244 18L276 12L306 24L306 32Z" fill="${advancedPalette[2]!}"/><text x="24" y="18" font-size="8">Series B</text></g><g transform="translate(0 76)"><rect x="20" y="1" width="286" height="31" fill="#f7fbff"/><path d="M20 32L20 27L52 12L84 22L116 9L148 20L180 6L212 18L244 11L276 25L306 15L306 32Z" fill="${advancedPalette[3]!}"/><text x="24" y="18" font-size="8">Series C</text></g><g transform="translate(0 114)"><rect x="20" y="1" width="286" height="31" fill="#f7fbff"/><path d="M20 32L20 18L52 25L84 10L116 20L148 7L180 17L212 5L244 22L276 13L306 21L306 32Z" fill="${advancedPalette[4]!}"/><text x="24" y="18" font-size="8" fill="#fff">Series D</text></g></g>`),
  ParallelCoordinatesPlot: frame(`<g fill="none" stroke="#111" stroke-width="0.8"><path d="M20 31H306M20 71H306M20 111H306M20 151H306"/></g><g font-size="8"><text x="20" y="25">economy</text><text x="20" y="65">cylinders</text><text x="20" y="105">horsepower</text><text x="20" y="145">weight</text></g><g fill="none" stroke-width="1.3" stroke-opacity="0.42"><path d="M48 31L250 71L184 111L269 151" stroke="#543005"/><path d="M287 31L81 71L116 111L58 151" stroke="#003c30"/><path d="M170 31L221 71L72 111L192 151" stroke="#bf812d"/><path d="M75 31L145 71L257 111L118 151" stroke="#01665e"/><path d="M225 31L48 71L201 111L241 151" stroke="#80cdc1"/></g>`),
  Icicle: frame(`<g fill-opacity="0.6"><rect x="8" y="5" width="48" height="170" fill="#ccc"/><rect x="57" y="5" width="67" height="76" fill="${advancedPalette[0]!}"/><rect x="57" y="82" width="67" height="93" fill="${advancedPalette[1]!}"/><rect x="125" y="5" width="91" height="38" fill="${advancedPalette[0]!}"/><rect x="125" y="44" width="91" height="37" fill="${advancedPalette[0]!}"/><rect x="125" y="82" width="91" height="45" fill="${advancedPalette[1]!}"/><rect x="125" y="128" width="91" height="47" fill="${advancedPalette[1]!}"/><rect x="217" y="5" width="95" height="20" fill="${advancedPalette[0]!}"/><rect x="217" y="26" width="95" height="17" fill="${advancedPalette[0]!}"/><rect x="217" y="44" width="95" height="37" fill="${advancedPalette[0]!}"/><rect x="217" y="82" width="95" height="23" fill="${advancedPalette[1]!}"/><rect x="217" y="106" width="95" height="21" fill="${advancedPalette[1]!}"/><rect x="217" y="128" width="95" height="47" fill="${advancedPalette[1]!}"/></g><g font-size="7"><text x="12" y="16">root</text><text x="61" y="16">analytics</text><text x="61" y="94">visualization</text></g>`),
  Sunburst: frame(`<g transform="translate(160 90)" fill-opacity="0.6"><path d="M0-28A28 28 0 0 1 26 10L53 20A57 57 0 0 0 0-57Z" fill="${advancedPalette[0]!}"/><path d="M26 10A28 28 0 0 1-17 22L-35 45A57 57 0 0 0 53 20Z" fill="${advancedPalette[1]!}"/><path d="M-17 22A28 28 0 0 1 0-28V-57A57 57 0 0 0-35 45Z" fill="${advancedPalette[2]!}"/><path d="M0-59A84 84 0 0 1 78 31L55 22A59 59 0 0 0 0-59Z" fill="${advancedPalette[0]!}"/><path d="M78 31A84 84 0 0 1 13 83L9 58A59 59 0 0 0 55 22Z" fill="${advancedPalette[1]!}"/><path d="M13 83A84 84 0 0 1-79 28L-55 20A59 59 0 0 0 9 58Z" fill="${advancedPalette[2]!}"/><path d="M-79 28A84 84 0 0 1 0-84V-59A59 59 0 0 0-55 20Z" fill="${advancedPalette[2]!}"/></g>`),
  Treemap: frame(`<g fill-opacity="0.6"><rect x="5" y="5" width="184" height="104" fill="#4e79a7"/><rect x="5" y="110" width="184" height="65" fill="#4e79a7"/><rect x="190" y="5" width="125" height="78" fill="#f28e2c"/><rect x="190" y="84" width="77" height="91" fill="#e15759"/><rect x="268" y="84" width="47" height="91" fill="#76b7b2"/></g><g font-size="9"><text x="9" y="18">flare.analytics</text><text x="9" y="31" fill-opacity="0.7">12,840</text><text x="194" y="18">display</text><text x="194" y="31" fill-opacity="0.7">5,772</text></g>`),
  Dendrogram: frame(`<g fill="none" stroke="#555" stroke-opacity="0.4" stroke-width="1.5"><path d="M20 90C48 90 48 45 76 45M20 90C48 90 48 135 76 135M76 45C108 45 108 25 140 25M76 45C108 45 108 65 140 65M76 135C108 135 108 112 140 112M76 135C108 135 108 155 140 155M140 25C182 25 182 16 224 16M140 25C182 25 182 35 224 35M140 65C182 65 182 56 224 56M140 65C182 65 182 75 224 75M140 112C182 112 182 103 224 103M140 112C182 112 182 122 224 122M140 155C182 155 182 146 224 146M140 155C182 155 182 165 224 165"/></g><g fill="#999" font-size="8">${[[20,90,"root"],[76,45,"analytics"],[76,135,"vis"],[224,16,"cluster"],[224,35,"graph"],[224,56,"layout"],[224,75,"stats"],[224,103,"color"],[224,122,"scale"],[224,146,"shape"],[224,165,"util"]].map(([x,y,label]) => `<circle cx="${x}" cy="${y}" r="2.5"/><text x="${Number(x)+6}" y="${Number(y)+3}" fill="#111">${label}</text>`).join("")}</g>`),
  RadialDendrogram: radialClusterTemplateSvg(),
  RadialBarChart: frame(`<g transform="translate(160 90)">${[42,58,35,66,49,73,54,62,38,69,45,76].map((radius, index) => { const start = index * Math.PI * 2 / 12; const end = (index + .72) * Math.PI * 2 / 12; const x0 = Math.sin(start) * 28; const y0 = -Math.cos(start) * 28; const x1 = Math.sin(end) * 28; const y1 = -Math.cos(end) * 28; const x2 = Math.sin(end) * radius; const y2 = -Math.cos(end) * radius; const x3 = Math.sin(start) * radius; const y3 = -Math.cos(start) * radius; return `<path d="M${x0} ${y0}A28 28 0 0 1 ${x1} ${y1}L${x2} ${y2}A${radius} ${radius} 0 0 0 ${x3} ${y3}Z" fill="${advancedPalette[index % advancedPalette.length]!}" fill-opacity=".9"/>`; }).join("")}</g>`),
  Calendar: frame(`<text x="36" y="43" text-anchor="end" font-size="9" font-weight="bold">2025</text><g font-size="7" text-anchor="end"><text x="36" y="65">M</text><text x="36" y="83">T</text><text x="36" y="101">W</text><text x="36" y="119">T</text><text x="36" y="137">F</text></g><g font-size="7"><text x="42" y="43">Jan</text><text x="108" y="43">Apr</text><text x="175" y="43">Jul</text><text x="241" y="43">Oct</text></g><g stroke="#fff" stroke-width="0.8">${calendarCells}</g>`),
  Boxplot: frame(`${axis}<g stroke="#111"><path d="M46 48V132M73 41V139M100 35V125M127 53V143M154 29V117M181 46V135M208 38V129M235 56V145M262 42V122M289 31V137"/></g><g fill="#ddd">${[46,73,100,127,154,181,208,235,262,289].map((x, index) => `<rect x="${x-10}" y="${55 + index%3*8}" width="20" height="${48-index%2*10}"/>`).join("")}</g><g stroke="#111" stroke-width="2">${[46,73,100,127,154,181,208,235,262,289].map((x,index) => `<path d="M${x-10} ${76+index%4*5}H${x+10}"/>`).join("")}</g><g fill="#111" fill-opacity="0.2"><circle cx="101" cy="24" r="2"/><circle cx="154" cy="139" r="2"/><circle cx="236" cy="31" r="2"/></g>`),
  Contour: observableContourTemplateSvg,
  Hexbin: observableHexbinTemplateSvg,
  // Keep the legacy fallback on the same data-backed renderer as the catalog.
  Chord: () => renderDefaultChartSvg("Chord") ?? frame(""),
  Sankey: frame(`<defs><linearGradient id="sg1" x1="0" x2="1"><stop stop-color="#1f77b4"/><stop offset="1" stop-color="#2ca02c"/></linearGradient><linearGradient id="sg2" x1="0" x2="1"><stop stop-color="#ff7f0e"/><stop offset="1" stop-color="#d62728"/></linearGradient></defs><g fill="none" stroke-opacity="0.5"><path d="M42 39C115 39 115 75 190 75S252 43 286 43" stroke="url(#sg1)" stroke-width="22"/><path d="M42 123C115 123 115 102 190 102S252 130 286 130" stroke="url(#sg2)" stroke-width="18"/><path d="M42 56C116 56 116 121 190 121S251 66 286 66" stroke="url(#sg1)" stroke-width="10"/></g><g stroke="#000"><rect x="27" y="25" width="15" height="45" fill="#1f77b4"/><rect x="27" y="108" width="15" height="36" fill="#ff7f0e"/><rect x="190" y="61" width="15" height="72" fill="#2ca02c"/><rect x="286" y="29" width="15" height="52" fill="#d62728"/><rect x="286" y="115" width="15" height="31" fill="#9467bd"/></g><g font-size="8"><text x="46" y="49">source</text><text x="46" y="129">supply</text><text x="209" y="99">process</text><text x="282" y="54" text-anchor="end">use</text><text x="282" y="134" text-anchor="end">loss</text></g>`),
} as const;

const definitions: Array<[keyof typeof advancedTemplateSvgs, string, string, SvgCandidate["coordinateSystem"]]> = [
  ["AreaChart", "Area Chart", "AreaChart", "Cartesian"],
  ["StackedAreaChart", "Stacked Area", "StackedAreaChart", "Cartesian"],
  ["Streamgraph", "Streamgraph", "Streamgraph", "Cartesian"],
  ["HorizonChart", "Horizon Chart", "HorizonChart", "Cartesian"],
  ["ParallelCoordinatesPlot", "Parallel Coordinates", "ParallelCoordinatesPlot", "CoordinateFree"],
  ["Icicle", "Icicle", "Icicle", "CoordinateFree"],
  ["Sunburst", "Sunburst", "Sunburst", "Polar"],
  ["Treemap", "Treemap", "Treemap", "CoordinateFree"],
  ["Dendrogram", "Dendrogram", "Dendrogram", "Cartesian"],
  ["RadialDendrogram", "Radial Dendrogram", "RadialDendrogram", "Polar"],
  ["RadialBarChart", "Radial Bar Chart", "RadialBarChart", "Polar"],
  ["Calendar", "Calendar", "Calendar", "CoordinateFree"],
  ["Boxplot", "Box Plot", "Boxplot", "Cartesian"],
  ["Contour", "Contour", "Contour", "Cartesian"],
  ["Hexbin", "Hexbin", "Hexbin", "Cartesian"],
  ["Chord", "Chord", "Chord", "CoordinateFree"],
  ["Sankey", "Sankey", "Sankey", "CoordinateFree"],
];

export const advancedTemplateDefinitions: SvgCandidate[] = definitions.map(([key, name, chartType, coordinateSystem]) => {
  const fallback = advancedTemplateSvgs[key];
  const svgMarkup = renderDefaultChartSvg(chartType)
    ?? (typeof fallback === "function" ? fallback() : fallback);
  return {
    id: `builtin-template:${chartType.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`,
    name,
    chartType,
    coordinateSystem,
    svgMarkup,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
  };
});
