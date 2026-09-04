import type { SvgCandidate } from "../types";

export const deckglLightMapStyleUrl = "mapbox://styles/shifuchen/cmtmopiqi00eo01sn25fq6efl";
export const deckglDarkMapStyleUrl = "mapbox://styles/shifuchen/clhswk0lv000y01pgc15v0wfv";

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

/** Uniform PNG screenshots generated from the app's Mapbox + deck.gl renderer. */
const deckglExampleImageSlugs: Record<string, string> = {
  ArcLayer: "arc-layer.png",
  BitmapLayer: "bitmap-layer.png",
  ColumnLayer: "column-layer.png",
  ContourLayer: "contour-layer.png",
  GeoJsonLayer: "geojson-layer.png",
  GridCellLayer: "grid-cell-layer.png",
  GridLayer: "grid-layer.png",
  HeatmapLayer: "heatmap-layer.png",
  HexagonLayer: "hexagon-layer.png",
  IconLayer: "icon-layer.png",
  LineLayer: "line-layer.png",
  MVTLayer: "mvt-layer.png",
  PathLayer: "path-layer.png",
  PointCloudLayer: "point-cloud-layer.png",
  PolygonLayer: "polygon-layer.png",
  ScatterplotLayer: "scatterplot-layer.png",
  ScreenGridLayer: "screen-grid-layer.png",
  TerrainLayer: "terrain-layer.png",
  TileLayer: "tile-layer.png",
  TripsLayer: "trips-layer.png",
  GreatCircleLayer: "great-circle-layer.png",
  TextLayer: "text-layer.png",
  SolidPolygonLayer: "solid-polygon-layer.png",
  SimpleMeshLayer: "simple-mesh-layer.png",
  ScenegraphLayer: "scenegraph-layer.png",
};

export function deckglExampleImageUrl(layerType: string) {
  const slug = deckglExampleImageSlugs[layerType];
  return `/deckgl-examples/${slug ?? "scatterplot-layer.png"}?v=20260904-2`;
}

export const geographicLayerTypes = [
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

export const geographicLayerDefinitions: SvgCandidate[] = geographicLayerTypes.map((layerType) => {
  const canvasPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="transparent"/></svg>`;
  return {
    id: `deckgl-layer:${layerType}`,
    name: layerType,
    chartType: layerType,
    coordinateSystem: "Geographic",
    // The catalog uses the generated screenshot. The transparent SVG remains
    // only as the geometry placeholder required by the canvas node model.
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
