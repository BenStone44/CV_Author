import type { SvgCandidate } from "../types";

/** The style used by geographic templates before the appearance selector. */
export const deckglOriginalMapStyleUrl = "mapbox://styles/shifuchen/cm0yq9yda01fh01q03vmn75i5";
export const deckglLightMapStyleUrl = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
export const deckglDarkMapStyleUrl = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const mapboxAccessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";
const mapboxStaticImageUrl = `https://api.mapbox.com/styles/v1/shifuchen/cm0yq9yda01fh01q03vmn75i5/static/0,20,1.1/640x360?access_token=${mapboxAccessToken}`;

export type GeographicTemplateFamily = "point" | "line" | "area";

const geographicLayerFamilies: Record<string, GeographicTemplateFamily> = {
  ArcLayer: "line",
  BitmapLayer: "area",
  ColumnLayer: "point",
  ContourLayer: "area",
  GeoJsonLayer: "area",
  GridCellLayer: "area",
  GridLayer: "area",
  HeatmapLayer: "area",
  HexagonLayer: "area",
  IconLayer: "point",
  LineLayer: "line",
  MVTLayer: "area",
  PathLayer: "line",
  PointCloudLayer: "point",
  PolygonLayer: "area",
  ScatterplotLayer: "point",
  ScreenGridLayer: "area",
  TerrainLayer: "area",
  TileLayer: "area",
  TripsLayer: "line",
  GreatCircleLayer: "line",
  TextLayer: "point",
  SolidPolygonLayer: "area",
  SimpleMeshLayer: "point",
  ScenegraphLayer: "point",
};

export function getGeographicLayerFamily(layerType: string): GeographicTemplateFamily {
  return geographicLayerFamilies[layerType] ?? "point";
}

/** Local copies of the deck.gl gallery thumbnails shipped in public/. */
const deckglExampleImageSlugs: Record<string, string> = {
  ArcLayer: "arc-layer.png",
  BitmapLayer: "bitmap-layer.png",
  ColumnLayer: "column-layer.png",
  ContourLayer: "contour-layer.png",
  GeoJsonLayer: "geojson-layer.jpg",
  GridCellLayer: "grid_layer.png",
  GridLayer: "grid_layer.png",
  HeatmapLayer: "heatmap_layer.png",
  HexagonLayer: "hexagon-layer.jpg",
  IconLayer: "icon-layer.jpg",
  LineLayer: "line-layer.jpg",
  MVTLayer: "tile-layer.jpg",
  PathLayer: "path_layer.png",
  PointCloudLayer: "point-cloud-layer.jpg",
  PolygonLayer: "polygon_layer.png",
  ScatterplotLayer: "scatterplot-layer.jpg",
  ScreenGridLayer: "screengrid-layer.jpg",
  TerrainLayer: "terrain_layer.png",
  TileLayer: "tile-layer.jpg",
  TripsLayer: "trips_layer.png",
  GreatCircleLayer: "great-circle-layer.png",
  TextLayer: "text-layer.png",
  SolidPolygonLayer: "polygon_layer.png",
  SimpleMeshLayer: "column-layer.png",
  ScenegraphLayer: "scenegraph_layer.png",
};

export function deckglExampleImageUrl(layerType: string) {
  const slug = deckglExampleImageSlugs[layerType];
  return `/deckgl-examples/${slug ?? "scatterplot-layer.jpg"}`;
}

const mapFrame = (layerType: string, content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" font-family="sans-serif">
  <rect width="320" height="180" rx="8" fill="#dbeafe"/>
  <rect x="7" y="7" width="306" height="166" rx="6" fill="#bfe3ee" stroke="#0f3550" stroke-width="2"/>
  <image href="${mapboxStaticImageUrl}" x="9" y="9" width="302" height="162" preserveAspectRatio="xMidYMid slice"/>
  <g opacity=".2" stroke="#fff" stroke-width=".7" stroke-dasharray="2 3"><path d="M34 9V171M82 9V171M130 9V171M178 9V171M226 9V171M274 9V171"/><path d="M9 42H311M9 76H311M9 110H311M9 144H311"/></g>
  <g><rect x="14" y="14" width="126" height="18" rx="4" fill="#0f3550" opacity=".92"/><text x="21" y="26" fill="#fff" font-size="8" font-weight="700">deck.gl / ${layerType}</text><rect x="276" y="14" width="28" height="18" rx="4" fill="#fff" opacity=".9"/><text x="283" y="26" fill="#0f3550" font-size="8" font-weight="700">+ -</text><text x="15" y="164" fill="#fff" font-size="7" opacity=".9">example data · © Mapbox © OSM</text></g>
  ${content}
</svg>`;

const layerContent: Record<string, string> = {
  ArcLayer: `<g fill="none" stroke-linecap="round"><path d="M53 105Q143 20 257 87" stroke="#2563eb" stroke-width="5"/><path d="M72 121Q151 55 228 112" stroke="#f97316" stroke-width="3"/><circle cx="53" cy="105" r="5" fill="#1d4ed8"/><circle cx="257" cy="87" r="5" fill="#1d4ed8"/><circle cx="72" cy="121" r="4" fill="#ea580c"/><circle cx="228" cy="112" r="4" fill="#ea580c"/></g>`,
  BitmapLayer: `<rect x="102" y="42" width="116" height="78" fill="#f59e0b" opacity=".3"/><path d="M102 101l30-31 20 16 21-25 45 59H102Z" fill="#15803d" opacity=".75"/><circle cx="164" cy="67" r="12" fill="#0ea5e9" opacity=".75"/>`,
  ColumnLayer: `<g fill="#2563eb" opacity=".85"><path d="M67 116l8-27 8 27Z"/><path d="M104 112l8-48 8 48Z"/><path d="M141 118l8-62 8 62Z"/><path d="M178 109l8-34 8 34Z"/><path d="M215 113l8-53 8 53Z"/></g>`,
  ContourLayer: `<g fill="none" stroke-linecap="round"><path d="M72 98C79 55 123 41 158 61s72 8 88 40-16 49-52 40-55 16-89-2-39-21-33-41Z" stroke="#2563eb" stroke-width="3"/><path d="M94 96c5-27 32-38 58-22s49 7 59 27-14 28-36 21-40 14-61-1-23-14-20-25Z" stroke="#f97316" stroke-width="3"/><path d="M116 93c4-14 20-22 36-12s27 5 33 16-8 15-21 11-24 8-37-1-12-8-11-14Z" stroke="#dc2626" stroke-width="3"/></g>`,
  GeoJsonLayer: `<g fill="#60a5fa" fill-opacity=".55" stroke="#1d4ed8" stroke-width="1.3"><path d="M22 45l31-16 25 9-8 27-27 8-21-12Z"/><path d="M102 39l34-12 24 16-11 26-38-5Z"/><path d="M188 38l35-8 34 16-10 31-40-6-21-16Z"/><path d="M96 106l39-15 29 14-13 28-44 3Z"/></g>`,
  GridCellLayer: `<g fill="#2563eb" fill-opacity=".7">${Array.from({ length: 18 }, (_, i) => { const x = 75 + (i % 6) * 24; const y = 61 + Math.floor(i / 6) * 24; return `<rect x="${x}" y="${y}" width="20" height="20"/>`; }).join("")}</g>`,
  GridLayer: `<g fill="#7c3aed" fill-opacity=".55" stroke="#fff" stroke-width="1">${Array.from({ length: 25 }, (_, i) => { const x = 83 + (i % 5) * 26; const y = 54 + Math.floor(i / 5) * 22; return `<rect x="${x}" y="${y}" width="23" height="19"/>`; }).join("")}</g>`,
  HeatmapLayer: `<g fill="#ef4444" opacity=".35"><circle cx="119" cy="75" r="34"/><circle cx="168" cy="91" r="42"/><circle cx="213" cy="75" r="29"/></g><g fill="#f97316" opacity=".55"><circle cx="123" cy="76" r="20"/><circle cx="168" cy="91" r="27"/><circle cx="211" cy="76" r="18"/></g><g fill="#facc15"><circle cx="124" cy="76" r="8"/><circle cx="168" cy="91" r="11"/><circle cx="211" cy="76" r="7"/></g>`,
  HexagonLayer: `<g fill="#0f766e" stroke="#ccfbf1" stroke-width="1">${[[105,63,10],[126,63,14],[147,63,8],[116,80,18],[137,80,13],[158,80,16],[105,98,12],[126,98,17],[147,98,10],[168,98,14]].map(([x,y,r]) => `<path d="M${x} ${y! - r!}l${r! * .87} ${r! / 2}v${r!}L${x} ${y! + r!}l${-r! * .87} ${-r! / 2}v${-r!}Z"/>`).join("")}</g>`,
  IconLayer: `<g fill="#dc2626" stroke="#fff" stroke-width="2"><path d="M88 58l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2Z"/><path d="M182 75l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2Z"/><path d="M231 52l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2Z"/></g>`,
  MVTLayer: `<g fill="#22c55e" fill-opacity=".65" stroke="#166534" stroke-width="1"><path d="M31 50h43v24H31Z"/><path d="M80 43h38v30H80Z"/><path d="M133 45h45v26h-45Z"/><path d="M192 46h48v29h-48Z"/><path d="M247 52h42v25h-42Z"/><path d="M54 87h54v27H54Z"/><path d="M120 84h42v31h-42Z"/><path d="M174 88h54v27h-54Z"/></g>`,
  PathLayer: `<g fill="none" stroke-linecap="round"><path d="M26 117C75 99 80 52 129 67s52 51 91 28 46-37 78-35" stroke="#7c3aed" stroke-width="4"/><path d="M42 132c46-18 56-15 81-39s43-5 66 11 55 7 92-19" stroke="#db2777" stroke-width="2"/></g>`,
  PointCloudLayer: `<g fill="#0f172a" opacity=".8">${Array.from({ length: 58 }, (_, i) => { const x = 76 + (i * 37) % 168; const y = 54 + (i * 23) % 64; return `<circle cx="${x}" cy="${y}" r="${i % 4 === 0 ? 2.4 : 1.5}"/>`; }).join("")}</g>`,
  PolygonLayer: `<g fill="#f97316" fill-opacity=".55" stroke="#c2410c" stroke-width="1.2"><path d="M46 62l38-16 28 21-18 35-39-10Z"/><path d="M137 46l41-10 22 29-21 31-45-15Z"/><path d="M217 83l37-25 26 22-17 35-39 5Z"/></g>`,
  ScatterplotLayer: `<g fill="#2563eb" fill-opacity=".8" stroke="#fff" stroke-width="1.5">${[[79,63,5],[107,97,8],[139,72,4],[166,108,7],[192,65,6],[220,91,10],[248,61,5],[266,111,7]].map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`,
  ScreenGridLayer: `<g fill="#be123c" fill-opacity=".58">${Array.from({ length: 20 }, (_, i) => { const x = 75 + (i % 5) * 28; const y = 55 + Math.floor(i / 5) * 22; return `<rect x="${x}" y="${y}" width="25" height="19"/>`; }).join("")}</g>`,
  TerrainLayer: `<path d="M28 120l43-56 28 23 35-42 30 38 31-20 57 57Z" fill="#65a30d" opacity=".68"/><path d="M28 120l43-56 28 23 35-42 30 38 31-20 57 57" fill="none" stroke="#3f6212" stroke-width="1.5"/>`,
  TileLayer: `<g stroke="#fff" stroke-width="2" fill="#38bdf8" fill-opacity=".4"><path d="M45 48h70v45H45Z"/><path d="M116 48h70v45h-70Z"/><path d="M187 48h70v45h-70Z"/><path d="M45 95h70v40H45Z"/><path d="M116 95h70v40h-70Z"/><path d="M187 95h70v40h-70Z"/></g>`,
  TripsLayer: `<g fill="none" stroke-linecap="round"><path d="M44 119C81 91 93 65 130 75s47 43 83 17 39-40 69-31" stroke="#f97316" stroke-width="5"/><path d="M55 135c39-26 50-15 81-38s55 17 83 8 43-24 64-17" stroke="#fde047" stroke-width="2"/><circle cx="130" cy="75" r="5" fill="#fff" stroke="#ea580c" stroke-width="2"/><circle cx="213" cy="92" r="5" fill="#fff" stroke="#ea580c" stroke-width="2"/></g>`,
  GreatCircleLayer: `<g fill="none" stroke-linecap="round"><path d="M52 116Q157-7 267 99" stroke="#0891b2" stroke-width="3"/><path d="M52 116Q154 44 267 99" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="52" cy="116" r="5" fill="#0e7490"/><circle cx="267" cy="99" r="5" fill="#0e7490"/></g>`,
  TextLayer: `<g fill="#0f172a" font-size="10" font-weight="600"><text x="59" y="57">West</text><text x="143" y="47">Central</text><text x="220" y="118">East</text></g>`,
  LineLayer: `<g stroke="#334155" stroke-width="3" stroke-linecap="round"><path d="M43 123L91 82l41 22 42-49 51 28 42-30"/><path d="M59 137l47-22 49 8 35-28 48 12" stroke="#f43f5e" stroke-width="2"/></g>`,
  SolidPolygonLayer: `<path d="M54 111l29-50 48-14 42 31 38-19 51 37-26 36-60-8-52 17Z" fill="#a855f7" fill-opacity=".58" stroke="#7e22ce" stroke-width="2"/>`,
  SimpleMeshLayer: `<g fill="#0f766e" stroke="#134e4a" stroke-width="1"><path d="M91 114l18-43 22 7 9 39Z"/><path d="M149 111l15-55 28 16-4 43Z"/><path d="M208 116l14-39 21 11 7 31Z"/></g>`,
  ScenegraphLayer: `<g fill="#2563eb" stroke="#1e3a8a" stroke-width="1"><path d="M92 116l12-28 12 7 9 21Z"/><path d="M154 116l12-34 15 9 5 25Z"/><path d="M216 116l10-25 14 8 5 17Z"/></g>`,
};

const layerNames = [
  "ArcLayer",
  "BitmapLayer",
  "ColumnLayer",
  "ContourLayer",
  "GeoJsonLayer",
  "GridCellLayer",
  "GridLayer",
  "HeatmapLayer",
  "HexagonLayer",
  "IconLayer",
  "LineLayer",
  "MVTLayer",
  "PathLayer",
  "PointCloudLayer",
  "PolygonLayer",
  "ScatterplotLayer",
  "ScreenGridLayer",
  "TerrainLayer",
  "TileLayer",
  "TripsLayer",
  "GreatCircleLayer",
  "TextLayer",
  "SolidPolygonLayer",
  "SimpleMeshLayer",
  "ScenegraphLayer",
] as const;

export const geographicLayerDefinitions: SvgCandidate[] = layerNames.map((layerType) => {
  const svgMarkup = mapFrame(layerType, layerContent[layerType] ?? "");
  const canvasPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="transparent"/></svg>`;
  return {
    id: `deckgl-layer:${layerType}`,
    name: layerType,
    chartType: layerType,
    coordinateSystem: "Geographic",
    // Use the corresponding official deck.gl/pydeck gallery image for the card. The
    // transparent SVG remains the canvas placeholder because the live map is
    // rendered by Mapbox + deck.gl after insertion.
    src: deckglExampleImageUrl(layerType),
    // The visible canvas map is rendered by Mapbox + deck.gl. This markup is
    // only a transparent geometry placeholder for the existing CanvasNode model.
    svgMarkup: canvasPlaceholder,
    library: "deck.gl",
    layerType,
    // Start geographic templates with the neutral light basemap. Users can
    // switch to the dark basemap from the encoding inspector.
    mapStyleUrl: deckglLightMapStyleUrl,
    renderMode: "static-layer",
    defaultWidth: 480,
  } satisfies SvgCandidate;
});
