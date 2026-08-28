<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import mapboxgl from "mapbox-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  ArcLayer,
  BitmapLayer,
  ColumnLayer,
  GeoJsonLayer,
  GridCellLayer,
  IconLayer,
  LineLayer,
  PathLayer,
  PointCloudLayer,
  PolygonLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer,
} from "@deck.gl/layers";
import {
  ContourLayer,
  GridLayer,
  HeatmapLayer,
  HexagonLayer,
  ScreenGridLayer,
} from "@deck.gl/aggregation-layers";
import {
  GreatCircleLayer,
  MVTLayer,
  TerrainLayer,
  TileLayer,
  TripsLayer,
} from "@deck.gl/geo-layers";
import { ScenegraphLayer, SimpleMeshLayer } from "@deck.gl/mesh-layers";
import "mapbox-gl/dist/mapbox-gl.css";
import type {
  DataRow,
  GeoJsonFeature,
  GeographicLayerBinding,
  GeographicLayerConfig,
  GeographicMapViewState,
} from "../types";
import { geoJsonFeatureIds } from "../utils/geoJsonGeometry";

const props = defineProps<{
  layerType: string;
  config: GeographicLayerConfig;
  binding?: GeographicLayerBinding;
  datasetRows: DataRow[];
  geometryFeatures: GeoJsonFeature[];
  mapStyleUrl: string;
  mapViewState?: GeographicMapViewState;
  width: number;
  height: number;
}>();

const emit = defineEmits<{
  interactionStart: [event: PointerEvent];
  viewStateChange: [state: GeographicMapViewState];
}>();

const mapContainer = ref<HTMLDivElement | null>(null);
let map: mapboxgl.Map | null = null;
let overlay: MapboxOverlay | null = null;
let initialViewFitted = false;
let userCameraInteraction = false;
const loadedExampleData = ref<Record<string, unknown[]>>({});

function onInteractionPointerDown(event: PointerEvent) {
  emit("interactionStart", event);
}

const mapboxStyle = "mapbox://styles/shifuchen/cm0yq9yda01fh01q03vmn75i5";
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";
const mapboxStaticImage = `https://api.mapbox.com/styles/v1/shifuchen/cm0yq9yda01fh01q03vmn75i5/static/0,20,1.1/640x360?access_token=${mapboxToken}`;
const deckglDarkStyle = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
const deckglLightStyle = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const deckglDataBase = "https://raw.githubusercontent.com/visgl/deck.gl-data/master";

type ExampleViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  maxZoom?: number;
  minZoom?: number;
  pitch?: number;
  bearing?: number;
  mapStyle?: string;
};

// These values mirror the initialViewState and map style from the matching
// deck.gl gallery/website example. They are intentionally kept separate from
// the canvas viewport zoom: wheel events inside the map change this view.
const exampleViewStates: Record<string, ExampleViewState> = {
  ArcLayer: { longitude: -100, latitude: 40.7, zoom: 3, maxZoom: 15, pitch: 30, bearing: 30, mapStyle: deckglDarkStyle },
  BitmapLayer: { longitude: -75.789, latitude: 41.874, zoom: 5, maxZoom: 9, mapStyle: deckglDarkStyle },
  ColumnLayer: { longitude: -122.4, latitude: 37.74, zoom: 10, maxZoom: 15, pitch: 30, mapStyle: deckglDarkStyle },
  ContourLayer: { longitude: -119.3, latitude: 35.6, zoom: 6, maxZoom: 20, mapStyle: deckglDarkStyle },
  GeoJsonLayer: { longitude: -123.13, latitude: 49.254, zoom: 11, maxZoom: 16, pitch: 45, mapStyle: deckglLightStyle },
  GreatCircleLayer: { longitude: -122.38, latitude: 37.6, zoom: 1, maxZoom: 20, pitch: 30, bearing: 0, mapStyle: deckglDarkStyle },
  GridCellLayer: { longitude: -1.415727, latitude: 52.232395, zoom: 6.6, minZoom: 5, maxZoom: 15, pitch: 40.5, bearing: -27, mapStyle: deckglDarkStyle },
  GridLayer: { longitude: -1.415727, latitude: 52.232395, zoom: 6.6, minZoom: 5, maxZoom: 15, pitch: 40.5, bearing: -27, mapStyle: deckglDarkStyle },
  HeatmapLayer: { longitude: -73.75, latitude: 40.73, zoom: 9, maxZoom: 16, mapStyle: deckglDarkStyle },
  HexagonLayer: { longitude: -1.4157, latitude: 52.2324, zoom: 6, minZoom: 5, maxZoom: 15, pitch: 40.5, mapStyle: deckglDarkStyle },
  IconLayer: { longitude: 0, latitude: 0, zoom: 3, maxZoom: 20, mapStyle: deckglLightStyle },
  LineLayer: { longitude: -0.11, latitude: 51.51, zoom: 8, maxZoom: 16, pitch: 50, bearing: 0, mapStyle: deckglDarkStyle },
  MVTLayer: { longitude: -122.4, latitude: 37.78, zoom: 11, maxZoom: 16, mapStyle: deckglLightStyle },
  PathLayer: { longitude: -0.11, latitude: 51.51, zoom: 8, maxZoom: 16, pitch: 50, bearing: 0, mapStyle: deckglDarkStyle },
  PointCloudLayer: { longitude: 0, latitude: 0, zoom: 5, maxZoom: 20, pitch: 45, bearing: -45, mapStyle: deckglDarkStyle },
  PolygonLayer: { longitude: -123.13, latitude: 49.254, zoom: 11, maxZoom: 16, pitch: 45, mapStyle: deckglLightStyle },
  ScatterplotLayer: { longitude: -74, latitude: 40.76, zoom: 11, maxZoom: 16, mapStyle: deckglLightStyle },
  ScreenGridLayer: { longitude: -119.3, latitude: 35.6, zoom: 6, maxZoom: 20, mapStyle: deckglDarkStyle },
  SolidPolygonLayer: { longitude: -123.13, latitude: 49.254, zoom: 11, maxZoom: 16, pitch: 45, mapStyle: deckglLightStyle },
  TerrainLayer: { longitude: -122.18, latitude: 46.2, zoom: 12.5, maxZoom: 20, pitch: 45, bearing: 120, mapStyle: deckglDarkStyle },
  TextLayer: { longitude: -122.4, latitude: 37.74, zoom: 11, maxZoom: 15, pitch: 30, bearing: 0, mapStyle: deckglDarkStyle },
  TileLayer: { longitude: -122.45, latitude: 37.78, zoom: 11, maxZoom: 16, mapStyle: deckglLightStyle },
  TripsLayer: { longitude: -74, latitude: 40.72, zoom: 13, maxZoom: 16, pitch: 45, bearing: 0, mapStyle: deckglDarkStyle },
  ScenegraphLayer: { longitude: -94.57, latitude: 39.1, zoom: 3.8, maxZoom: 16, mapStyle: deckglDarkStyle },
  SimpleMeshLayer: { longitude: 0, latitude: 0, zoom: 0, maxZoom: 20, pitch: 0, bearing: 0, mapStyle: deckglDarkStyle },
};

const exampleDataUrls = {
  arcCounties: `${deckglDataBase}/examples/arc/counties.json`,
  columns: `${deckglDataBase}/website/hexagons.json`,
  contours: `${deckglDataBase}/examples/screen-grid/ca-transit-stops.json`,
  geojson: `${deckglDataBase}/examples/geojson/vancouver-blocks.json`,
  flights: `${deckglDataBase}/website/flights.json`,
  lineFlights: `${deckglDataBase}/examples/line/heathrow-flights.json`,
  heatmap: `${deckglDataBase}/examples/screen-grid/uber-pickup-locations.json`,
  hexagons: `${deckglDataBase}/examples/3d-heatmap/heatmap-data.csv`,
  manhattan: `${deckglDataBase}/examples/scatterplot/manhattan.json`,
  stations: `${deckglDataBase}/website/bart-stations.json`,
  trips: `${deckglDataBase}/examples/trips/trips-v7.json`,
  scenegraph: "https://raw.githubusercontent.com/visgl/deck.gl/master/examples/website/scenegraph/all.json",
};

const points = [
  { position: [-74.006, 40.7128], value: 32, name: "New York" },
  { position: [-0.1276, 51.5072], value: 18, name: "London" },
  { position: [2.3522, 48.8566], value: 24, name: "Paris" },
  { position: [139.6917, 35.6895], value: 40, name: "Tokyo" },
  { position: [151.2093, -33.8688], value: 14, name: "Sydney" },
  { position: [116.4074, 39.9042], value: 36, name: "Beijing" },
];
const paths = [
  { path: [[-74.006, 40.7128], [-0.1276, 51.5072], [2.3522, 48.8566]], value: 7 },
  { path: [[139.6917, 35.6895], [116.4074, 39.9042], [151.2093, -33.8688]], value: 5 },
];
const arcs = [
  { sourcePosition: [-74.006, 40.7128], targetPosition: [139.6917, 35.6895], value: 12 },
  { sourcePosition: [2.3522, 48.8566], targetPosition: [116.4074, 39.9042], value: 8 },
];
const polygons = [
  { polygon: [[-80, 36], [-70, 36], [-70, 44], [-80, 44]], value: 1 },
  { polygon: [[-5, 48], [8, 48], [8, 53], [-5, 53]], value: 2 },
  { polygon: [[135, 32], [145, 32], [145, 40], [135, 40]], value: 3 },
] as const;
const pointCloudExampleData = Array.from({ length: 20_000 }, (_, index) => {
  const side = Math.ceil(Math.sqrt(20_000));
  const u = (index % side) / Math.max(side - 1, 1);
  const v = Math.floor(index / side) / Math.max(side - 1, 1);
  const x = (u - 0.5) * Math.PI * 2;
  const y = (v - 0.5) * Math.PI * 2;
  const z = Math.sin(x * x + y * y) * x / Math.PI;
  return {
    position: [x, y, z],
    normal: [0, 0, 1],
    color: [u * 128, v * 128, Math.max(0, z * 255)],
  };
});
const simpleMeshExampleData = Array.from({ length: 100 }, (_, index) => {
  const x = index % 10;
  const y = Math.floor(index / 10);
  return {
    position: [(x - 4.5) * 120, (y - 4.5) * 120],
    color: [(x / 9) * 255, 128, (y / 9) * 255],
    orientation: [(x / 9) * 60 - 30, 0, -90],
  };
});
type Coordinate = [number, number];

function collectCoordinates(value: unknown, result: Coordinate[]) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    result.push([value[0], value[1]]);
    return;
  }
  value.forEach((item) => collectCoordinates(item, result));
}

function layerCoordinates(layerType: string): Coordinate[] {
  switch (layerType) {
    case "ArcLayer":
    case "LineLayer":
    case "GreatCircleLayer":
      return arcs.flatMap((item) => [item.sourcePosition as Coordinate, item.targetPosition as Coordinate]);
    case "PathLayer":
    case "TripsLayer":
      return paths.flatMap((item) => item.path.map((position) => position as Coordinate));
    case "PolygonLayer":
    case "SolidPolygonLayer":
    case "GeoJsonLayer":
      return polygons.flatMap((item) => item.polygon.map((position) => position as Coordinate));
    default:
      return points.map((item) => item.position as Coordinate);
  }
}

function emitCurrentViewState() {
  if (!map) return;
  const center = map.getCenter();
  emit("viewStateChange", {
    longitude: center.lng,
    latitude: center.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  });
}

function fitMapToLayerData(options: { force?: boolean; persist?: boolean } = {}) {
  const force = options.force ?? false;
  if (!map || !map.isStyleLoaded() || (!force && (initialViewFitted || props.mapViewState))) return;
  const fittedFeatures = props.binding ? materializedBoundFeatures.value : [];
  if (fittedFeatures.length > 0) {
    const coordinates: Coordinate[] = [];
    fittedFeatures.forEach((feature) => collectCoordinates(feature.geometry.coordinates, coordinates));
    if (coordinates.length > 0) {
      const longitudes = coordinates.map(([longitude]) => longitude);
      const latitudes = coordinates.map(([, latitude]) => latitude);
      let minLongitude = Math.min(...longitudes);
      let maxLongitude = Math.max(...longitudes);
      let minLatitude = Math.min(...latitudes);
      let maxLatitude = Math.max(...latitudes);
      if (minLongitude === maxLongitude) {
        minLongitude -= 0.01;
        maxLongitude += 0.01;
      }
      if (minLatitude === maxLatitude) {
        minLatitude -= 0.01;
        maxLatitude += 0.01;
      }
      map.fitBounds(
        [[minLongitude, minLatitude], [maxLongitude, maxLatitude]],
        {
          padding: Math.max(24, Math.min(props.width, props.height) * 0.08),
          maxZoom: 12,
          duration: 0,
        },
      );
      initialViewFitted = true;
      if (options.persist) emitCurrentViewState();
      return;
    }
  }
  const exampleView = exampleViewStates[props.layerType];
  if (exampleView) {
    map.jumpTo({
      center: [exampleView.longitude, exampleView.latitude],
      zoom: exampleView.zoom,
      pitch: exampleView.pitch ?? 0,
      bearing: exampleView.bearing ?? 0,
    });
    initialViewFitted = true;
    if (options.persist) emitCurrentViewState();
    return;
  }
  const coordinates = layerCoordinates(props.layerType).filter(([longitude, latitude]) =>
    Number.isFinite(longitude) && Number.isFinite(latitude),
  );
  if (coordinates.length === 0) return;
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  let minLongitude = Math.min(...longitudes);
  let maxLongitude = Math.max(...longitudes);
  let minLatitude = Math.min(...latitudes);
  let maxLatitude = Math.max(...latitudes);
  // fitBounds needs a real extent for a single point or a straight line.
  if (minLongitude === maxLongitude) {
    minLongitude -= 2;
    maxLongitude += 2;
  }
  if (minLatitude === maxLatitude) {
    minLatitude -= 2;
    maxLatitude += 2;
  }
  map.fitBounds(
    [[minLongitude, minLatitude], [maxLongitude, maxLatitude]],
    {
      padding: Math.max(24, Math.min(props.width, props.height) * 0.08),
      maxZoom: 8,
      duration: 0,
    },
  );
  initialViewFitted = true;
  if (options.persist) emitCurrentViewState();
}

function colorToRgba(color: string | undefined, alpha = 255): [number, number, number, number] {
  const value = (color ?? "#2563eb").trim().replace(/^#/, "");
  const normalized = value.length === 3
    ? value.split("").map((part) => `${part}${part}`).join("")
    : value;
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed) || normalized.length !== 6) return [37, 99, 235, alpha];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255, alpha];
}

type BoundGeoJsonFeature = GeoJsonFeature & {
  properties: Record<string, unknown> & {
    __colorValue?: number;
    __sizeValue?: number;
  };
};

function boundGeometryFeatures(): BoundGeoJsonFeature[] {
  const binding = props.binding;
  if (!binding) return [];
  const aggregate = new Map<string, { colorValue: number; sizeValue: number }>();
  props.datasetRows.forEach((row) => {
    const id = (row[binding.idField] ?? "").trim();
    if (!id) return;
    const current = aggregate.get(id) ?? { colorValue: 0, sizeValue: 0 };
    const colorValue = binding.colorField ? Number(row[binding.colorField]) : 0;
    const sizeValue = binding.sizeField ? Number(row[binding.sizeField]) : 0;
    if (Number.isFinite(colorValue)) current.colorValue += colorValue;
    if (Number.isFinite(sizeValue)) current.sizeValue += sizeValue;
    aggregate.set(id, current);
  });
  return props.geometryFeatures.flatMap((feature) => {
    const values = geoJsonFeatureIds(feature).reduce((result, id) => {
      const match = aggregate.get(id);
      if (!match) return result;
      result.colorValue += match.colorValue;
      result.sizeValue += match.sizeValue;
      result.matched = true;
      return result;
    }, { colorValue: 0, sizeValue: 0, matched: false });
    if (!values.matched) return [];
    return [{
      ...feature,
      properties: {
        ...feature.properties,
        ...(binding.colorField ? { __colorValue: values.colorValue } : {}),
        ...(binding.sizeField ? { __sizeValue: values.sizeValue } : {}),
      },
    }];
  });
}

const materializedBoundFeatures = computed(boundGeometryFeatures);

function numericExtent(features: BoundGeoJsonFeature[], field: "__colorValue" | "__sizeValue") {
  const values = features
    .map((feature) => feature.properties[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? [Math.min(...values), Math.max(...values)] as const : null;
}

function normalizedValue(value: unknown, extent: readonly [number, number] | null) {
  if (typeof value !== "number" || !extent) return 0.65;
  return extent[0] === extent[1] ? 0.65 : (value - extent[0]) / (extent[1] - extent[0]);
}

function mappedColor(value: unknown, extent: readonly [number, number] | null) {
  const target = colorToRgba(props.config.color, 230);
  const t = Math.max(0, Math.min(1, normalizedValue(value, extent)));
  const start = [219, 234, 254];
  return [
    Math.round(start[0]! + (target[0] - start[0]!) * t),
    Math.round(start[1]! + (target[1] - start[1]!) * t),
    Math.round(start[2]! + (target[2] - start[2]!) * t),
    target[3],
  ] as [number, number, number, number];
}

function geometryCenter(feature: GeoJsonFeature): [number, number] {
  const coordinates = feature.geometry.coordinates;
  if (feature.geometry.type === "Point") return coordinates as [number, number];
  if (feature.geometry.type === "MultiPoint") return (coordinates as [number, number][])[0] ?? [0, 0];
  const rings = feature.geometry.type === "MultiPolygon"
    ? (coordinates as number[][][][]).flatMap((polygon) => polygon[0] ?? [])
    : (coordinates as number[][][])[0] ?? [];
  if (!rings.length) return [0, 0];
  const total = rings.reduce<[number, number]>(
    (result, position) => [result[0] + position[0]!, result[1] + position[1]!],
    [0, 0],
  );
  return [total[0] / rings.length, total[1] / rings.length];
}

function polygonRecords(features: BoundGeoJsonFeature[]) {
  return features.flatMap((feature) => {
    if (feature.geometry.type === "Polygon") return [{ feature, polygon: feature.geometry.coordinates }];
    if (feature.geometry.type === "MultiPolygon") {
      return (feature.geometry.coordinates as number[][][][]).map((polygon) => ({ feature, polygon }));
    }
    return [];
  });
}

function layerOptions(layerType: string): any {
  const common = { id: `deckgl-example-${layerType}` };
  const configuredColor = colorToRgba(props.config.color, 220);
  const configuredPointSize = Number.isFinite(props.config.size) ? Math.max(props.config.size ?? 8, 1) : 8;
  const boundFeatures = materializedBoundFeatures.value;
  const colorExtent = numericExtent(boundFeatures, "__colorValue");
  const sizeExtent = numericExtent(boundFeatures, "__sizeValue");
  const featureColor = (feature: BoundGeoJsonFeature) => props.binding?.colorField
    ? mappedColor(feature.properties.__colorValue, colorExtent)
    : configuredColor;
  const featureSize = (feature: BoundGeoJsonFeature) => props.binding?.sizeField
    ? 4 + normalizedValue(feature.properties.__sizeValue, sizeExtent) * 28
    : configuredPointSize;
  switch (layerType) {
    case "ArcLayer":
      return new ArcLayer({ ...common, data: loadedExampleData.value.ArcLayer ?? [], getSourcePosition: (d: { source: number[] }) => d.source, getTargetPosition: (d: { target: number[] }) => d.target, getSourceColor: [37, 99, 235], getTargetColor: [249, 115, 22], getWidth: 4 });
    case "BitmapLayer":
      return new BitmapLayer({ ...common, image: "https://docs.mapbox.com/mapbox-gl-js/assets/radar.gif", bounds: [[-80.425, 37.936], [-80.425, 46.437], [-71.516, 46.437], [-71.516, 37.936]] });
    case "ColumnLayer":
      return new ColumnLayer({ ...common, data: exampleDataUrls.columns, diskResolution: 12, radius: configuredPointSize * 25, elevationScale: 5000, extruded: true, getPosition: (d: { centroid: number[] }) => d.centroid, getElevation: (d: { value: number }) => d.value, getFillColor: configuredColor });
    case "ContourLayer":
      return new ContourLayer({ ...common, data: exampleDataUrls.contours, getPosition: (d: number[]) => d, contours: [{ threshold: 1, color: [255, 0, 0], strokeWidth: 4 }, { threshold: 5, color: [0, 255, 0], strokeWidth: 2 }] });
    case "GeoJsonLayer":
      return new GeoJsonLayer({
        ...common,
        data: props.binding ? boundFeatures : exampleDataUrls.geojson,
        opacity: 0.86,
        filled: true,
        stroked: true,
        extruded: false,
        getFillColor: props.binding ? featureColor : configuredColor,
        getLineColor: [255, 255, 255, 210],
        getLineWidth: 1,
        lineWidthMinPixels: 0.6,
        pickable: true,
      });
    case "GridCellLayer":
      return new GridCellLayer({ ...common, data: exampleDataUrls.contours, cellSize: 2000, extruded: true, getPosition: (d: number[]) => d, getFillColor: configuredColor, getElevation: 300 });
    case "GridLayer":
      return new GridLayer({ ...common, data: loadedExampleData.value.GridLayer ?? [], cellSize: 2000, extruded: true, getPosition: (d: number[]) => d, getColorWeight: 1, getElevationWeight: 1, elevationScale: 50 });
    case "HeatmapLayer":
      return new HeatmapLayer({ ...common, data: exampleDataUrls.heatmap, getPosition: (d: number[]) => [d[0], d[1]], getWeight: (d: number[]) => d[2] ?? 1, intensity: 1, threshold: 0.03, radiusPixels: 30 });
    case "HexagonLayer":
      return new HexagonLayer({ ...common, data: loadedExampleData.value.HexagonLayer ?? [], radius: 1000, elevationRange: [0, 1000], elevationScale: 250, extruded: true, getPosition: (d: number[]) => d });
    case "IconLayer":
      return new IconLayer({
        ...common,
        data: "https://api.github.com/repos/visgl/deck.gl/contributors?per_page=100",
        getIcon: (d: { avatar_url: string }) => ({ url: d.avatar_url, width: 128, height: 128 }),
        getPosition: (_d: { contributions: number }, info: { index: number }) => [
          (info.index % 10 - 5) * 12,
          (Math.floor(info.index / 10) - 5) * 12,
        ],
        getSize: (d: { contributions: number }) => Math.log(d.contributions + 1) * 1.4,
        sizeUnits: "common",
        pickable: true,
      });
    case "LineLayer":
      return new LineLayer({ ...common, data: exampleDataUrls.lineFlights, opacity: 0.8, getSourcePosition: (d: { start: number[] }) => d.start, getTargetPosition: (d: { end: number[] }) => d.end, getColor: [239, 68, 68], getWidth: 8 });
    case "MVTLayer":
      return new MVTLayer({ ...common, data: `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}.vector.pbf?access_token=${mapboxToken}`, getFillColor: configuredColor, getLineColor: [15, 53, 80], getLineWidth: 1 });
    case "PathLayer":
      return new PathLayer({ ...common, data: exampleDataUrls.lineFlights, getPath: (d: { start: number[]; end: number[] }) => [d.start, d.end], getColor: [124, 58, 237], getWidth: 6, widthMinPixels: 2 });
    case "PointCloudLayer":
      return new PointCloudLayer({ ...common, data: pointCloudExampleData, coordinateSystem: "cartesian", getPosition: (d: { position: number[] }) => d.position, getNormal: (d: { normal: number[] }) => d.normal, getColor: configuredColor, pointSize: configuredPointSize });
    case "PolygonLayer":
    case "SolidPolygonLayer":
      return new (layerType === "PolygonLayer" ? PolygonLayer : SolidPolygonLayer)({
        ...common,
        data: props.binding ? polygonRecords(boundFeatures) : loadedExampleData.value[layerType] ?? [],
        getPolygon: props.binding
          ? (datum: { polygon: unknown }) => datum.polygon
          : (datum: number[][]) => datum,
        getFillColor: props.binding
          ? (datum: { feature: BoundGeoJsonFeature }) => featureColor(datum.feature)
          : configuredColor,
        getLineColor: [255, 255, 255, 210],
        getLineWidth: 1,
        lineWidthMinPixels: 0.6,
        stroked: true,
        filled: true,
      });
    case "ScatterplotLayer":
      return new ScatterplotLayer({
        ...common,
        data: props.binding ? boundFeatures : exampleDataUrls.manhattan,
        radiusUnits: "pixels",
        radiusMinPixels: 1,
        getPosition: props.binding
          ? (feature: BoundGeoJsonFeature) => geometryCenter(feature)
          : (datum: number[]) => [datum[0], datum[1], 0],
        getRadius: props.binding
          ? featureSize
          : configuredPointSize,
        getFillColor: props.binding
          ? featureColor
          : configuredColor,
        getLineColor: [255, 255, 255],
        lineWidthMinPixels: 1,
        stroked: true,
      });
    case "ScreenGridLayer":
      return new ScreenGridLayer({ ...common, data: exampleDataUrls.heatmap, getPosition: (d: number[]) => [d[0], d[1]], getWeight: (d: number[]) => d[2] ?? 1, cellSizePixels: 32 });
    case "TerrainLayer":
      return new TerrainLayer({ ...common, elevationData: "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N40/N40W075.hgt.gz", texture: mapboxStaticImage, bounds: [-75, 40, -74, 41], meshMaxError: 2 });
    case "TileLayer":
      return new TileLayer({
        ...common,
        data: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        renderSubLayers: (tile: any) => {
          const bounds = tile.tile.boundingBox;
          return new BitmapLayer({
            ...tile,
            id: `${tile.id}-bitmap`,
            image: tile.data,
            bounds: [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]],
          });
        },
      });
    case "TripsLayer":
      return new TripsLayer({ ...common, data: exampleDataUrls.trips, getPath: (d: { path: number[][] }) => d.path, getTimestamps: (d: { timestamps: number[] }) => d.timestamps, getColor: [249, 115, 22], widthMinPixels: 4, trailLength: 180, currentTime: 0 });
    case "GreatCircleLayer":
      return new GreatCircleLayer({ ...common, data: exampleDataUrls.flights, getSourcePosition: (d: { from: { coordinates: number[] } }) => d.from.coordinates, getTargetPosition: (d: { to: { coordinates: number[] } }) => d.to.coordinates, getStrokeColor: [8, 145, 178], getWidth: 4 });
    case "TextLayer":
      return new TextLayer({ ...common, data: exampleDataUrls.stations, getPosition: (d: { coordinates: number[] }) => d.coordinates, getText: (d: { name: string }) => d.name, getSize: 14, getColor: [15, 23, 42], getPixelOffset: [0, -24] });
    case "SimpleMeshLayer":
      return new SimpleMeshLayer({ ...common, data: simpleMeshExampleData, mesh: "https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/mesh/minicooper.obj", coordinateSystem: "cartesian", getPosition: (d: { position: number[] }) => d.position, getColor: (d: { color: number[] }) => d.color, getOrientation: (d: { orientation: number[] }) => d.orientation });
    case "ScenegraphLayer":
      return new ScenegraphLayer({ ...common, data: loadedExampleData.value.ScenegraphLayer ?? [], scenegraph: "https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/scenegraph-layer/airplane.glb", getPosition: (d: number[]) => [d[5] ?? 0, d[6] ?? 0, d[7] ?? 0], getOrientation: (d: number[]) => [0, -(d[10] ?? 0), 90], sizeScale: 25, pickable: true });
    default:
      return new ScatterplotLayer({ ...common, data: points, getPosition: (d: typeof points[number]) => d.position, getRadius: 25000, getFillColor: [37, 99, 235, 190] });
  }
}

function updateOverlay() {
  if (!overlay) return;
  overlay.setProps({ layers: [layerOptions(props.layerType)] });
}

async function loadExampleData(layerType: string) {
  if (layerType === "ScenegraphLayer") {
    try {
      const response = await fetch(exampleDataUrls.scenegraph);
      if (!response.ok) return;
      const payload = await response.json() as { states?: number[][] };
      loadedExampleData.value = { ...loadedExampleData.value, ScenegraphLayer: payload.states ?? [] };
      updateOverlay();
    } catch {
      // The layer remains empty when the remote example data is unavailable.
    }
    return;
  }
  if (layerType === "ArcLayer") {
    try {
      const response = await fetch(exampleDataUrls.arcCounties);
      if (!response.ok) return;
      const collection = await response.json() as { features?: Array<{ properties?: { name?: string; centroid?: number[]; flows?: Record<string, number> } }> };
      const features = collection.features ?? [];
      const selected = features.find((feature) => feature.properties?.name === "Los Angeles, CA") ?? features[0];
      const flows = selected?.properties?.flows ?? {};
      const source = selected?.properties?.centroid;
      const arcs = source
        ? Object.entries(flows).flatMap(([targetId, value]) => {
          const target = features[Number(targetId)]?.properties?.centroid;
          return target ? [{ source, target, value }] : [];
        })
        : [];
      loadedExampleData.value = { ...loadedExampleData.value, ArcLayer: arcs };
      updateOverlay();
    } catch {
      // The layer remains empty when the remote example data is unavailable.
    }
    return;
  }
  if (layerType === "PolygonLayer" || layerType === "SolidPolygonLayer") {
    try {
      const response = await fetch(exampleDataUrls.geojson);
      if (!response.ok) return;
      const collection = await response.json() as {
        features?: Array<{
          geometry?:
            | { type?: "Polygon"; coordinates?: number[][][] }
            | { type?: "MultiPolygon"; coordinates?: number[][][][] };
        }>;
      };
      const polygons = collection.features?.flatMap((feature) => {
        const geometry = feature.geometry;
        if (!geometry?.coordinates) return [];
        return geometry.type === "MultiPolygon"
          ? geometry.coordinates.flatMap((polygon) => polygon[0] ? [polygon[0]] : [])
          : geometry.coordinates[0] ? [geometry.coordinates[0]] : [];
      }) ?? [];
      loadedExampleData.value = { ...loadedExampleData.value, [layerType]: polygons };
      updateOverlay();
    } catch {
      // The layer remains empty when the remote example data is unavailable.
    }
    return;
  }
  if (layerType !== "GridLayer" && layerType !== "HexagonLayer") return;
  try {
    const response = await fetch(exampleDataUrls.hexagons);
    if (!response.ok) return;
    const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
    const rows = lines.slice(1).flatMap((line) => {
      const [longitude, latitude] = line.split(",").map(Number);
      return Number.isFinite(longitude) && Number.isFinite(latitude)
        ? [[longitude, latitude]]
        : [];
    });
    loadedExampleData.value = { ...loadedExampleData.value, [layerType]: rows };
    updateOverlay();
  } catch {
    // The layer remains empty when the remote example data is unavailable.
  }
}

onMounted(() => {
  if (!mapContainer.value) return;
  mapboxgl.accessToken = mapboxToken;
  const exampleView = exampleViewStates[props.layerType] ?? exampleViewStates.ScatterplotLayer!;
  const savedView = props.mapViewState;
  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: props.mapStyleUrl || exampleView.mapStyle || mapboxStyle,
    center: [savedView?.longitude ?? exampleView.longitude, savedView?.latitude ?? exampleView.latitude],
    zoom: savedView?.zoom ?? exampleView.zoom,
    minZoom: exampleView.minZoom,
    maxZoom: exampleView.maxZoom,
    pitch: savedView?.pitch ?? exampleView.pitch ?? 0,
    bearing: savedView?.bearing ?? exampleView.bearing ?? 0,
    // The template is embedded in the canvas, so keep the map chrome limited
    // to the controls that are useful for changing the view.
    attributionControl: false,
    interactive: true,
    pitchWithRotate: true,
  });
  map.dragPan.enable();
  map.dragRotate.enable();
  map.scrollZoom.enable();
  map.touchZoomRotate.enableRotation();
  map.addControl(
    new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
    "top-right",
  );
  overlay = new MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(overlay);
  const persistViewState = () => {
    if (!map || !userCameraInteraction) return;
    userCameraInteraction = false;
    emitCurrentViewState();
  };
  map.on("movestart", (event) => {
    userCameraInteraction = !!event.originalEvent;
  });
  map.on("moveend", persistViewState);
  map.once("load", () => {
    fitMapToLayerData();
    updateOverlay();
    void loadExampleData(props.layerType);
  });
});

watch(() => props.layerType, () => {
  initialViewFitted = false;
  updateOverlay();
  fitMapToLayerData();
  void loadExampleData(props.layerType);
});
watch(() => [props.config.size, props.config.color], updateOverlay);
watch(() => [
  props.binding?.datasetId,
  props.binding?.geometrySourceId,
  props.binding?.idField,
], () => {
  initialViewFitted = false;
  updateOverlay();
  fitMapToLayerData({ force: true, persist: true });
});
watch(() => props.datasetRows, () => {
  updateOverlay();
  if (!props.binding) return;
  initialViewFitted = false;
  fitMapToLayerData({ force: true, persist: true });
});
watch(() => props.geometryFeatures, () => {
  initialViewFitted = false;
  updateOverlay();
  fitMapToLayerData({
    force: !!props.binding,
    persist: !!props.binding,
  });
});
watch(() => [props.width, props.height], () => {
  requestAnimationFrame(() => map?.resize());
});

onBeforeUnmount(() => {
  overlay?.finalize();
  overlay = null;
  map?.remove();
  map = null;
});
</script>

<template>
  <div
    ref="mapContainer"
    class="deckgl-map-layer"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-label="Mapbox map with deck.gl example layer"
    @pointerdown.capture="onInteractionPointerDown"
  />
</template>

<style scoped>
.deckgl-map-layer {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(15, 53, 80, 0.72);
  border-radius: 7px;
  background: #bfe3ee;
  box-shadow: 0 8px 24px rgba(15, 53, 80, 0.16);
  pointer-events: auto;
}

.deckgl-map-layer :deep(.mapboxgl-ctrl-logo),
.deckgl-map-layer :deep(.mapboxgl-ctrl-attrib) {
  display: none;
}
</style>
