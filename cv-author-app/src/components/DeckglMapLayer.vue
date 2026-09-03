<script setup lang="ts">
// deck.gl's overloaded accessor types cannot express the heterogeneous layer
// stack assembled at runtime; the normalized layer data is validated before
// reaching this rendering boundary.
// @ts-nocheck
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, toRaw } from "vue";
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
  Dataset,
  DeckglNestedOverlay,
  DeckglPointTarget,
  GeoJsonFeature,
  GeographicLayerBinding,
  GeographicLayerConfig,
  GeographicMapViewState,
} from "../types";
import {
  bindGeoJsonFeatures,
  geoJsonFeatureBounds,
  geoJsonFeatureIds,
  geoJsonPolygonRecords,
  type BoundGeoJsonFeature,
} from "../utils/geoJsonGeometry";
import { isCsvColumnDrag } from "../utils/csvColumnDrag";
import { frontendPalette } from "../config/global";

const props = defineProps<{
  layerType: string;
  config: GeographicLayerConfig;
  binding?: GeographicLayerBinding;
  datasetRows: DataRow[];
  geometryFeatures: GeoJsonFeature[];
  dataset?: Dataset | null;
  mapStyleUrl: string;
  mapViewState?: GeographicMapViewState;
  width: number;
  height: number;
  layers?: Array<{
    id: string;
    layerType: string;
    config: GeographicLayerConfig;
    binding?: GeographicLayerBinding;
    datasetRows: DataRow[];
    geometryFeatures: GeoJsonFeature[];
    dataset?: Dataset | null;
  }>;
  nestedOverlays?: DeckglNestedOverlay[];
}>();

const emit = defineEmits<{
  viewStateChange: [state: GeographicMapViewState];
  pointHover: [target: DeckglPointTarget | null];
  pointSelect: [target: DeckglPointTarget];
  pointDrop: [target: DeckglPointTarget];
  columnDragOver: [event: DragEvent];
  columnDrop: [event: DragEvent];
}>();

const mapContainer = ref<HTMLDivElement | null>(null);
let map: mapboxgl.Map | null = null;
let overlay: MapboxOverlay | null = null;
let initialViewFitted = false;
let userCameraInteraction = false;
// Preserve deliberate user camera changes across reactive layer updates.
let userViewState = false;
let viewStateCommitTimer: number | null = null;
const loadedExampleData = ref<Record<string, unknown[]>>({});
const hoveredPoint = ref<{ layerId: string; rowKey: string } | null>(null);
let nestedProjectionFrame: number | null = null;

function onMapPointerDown(event: PointerEvent) {
  if (event.button === 0 && map?.isStyleLoaded()) {
    // Parent updates can arrive before Mapbox emits movestart. Mark the camera
    // as user-owned so those updates cannot fit the map during a drag.
    userViewState = true;
  }
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
  if (!map || !map.isStyleLoaded() || userViewState || (!force && (initialViewFitted || props.mapViewState))) return;
  const fittedFeatures = props.binding ? materializedBoundFeatures.value : [];
  if (fittedFeatures.length > 0) {
    const fittedBounds = geoJsonFeatureBounds(fittedFeatures);
    if (fittedBounds) {
      let {
        minLongitude,
        maxLongitude,
        minLatitude,
        maxLatitude,
      } = fittedBounds;
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
  const value = (color ?? frontendPalette.control.accentStrong).trim().replace(/^#/, "");
  const normalized = value.length === 3
    ? value.split("").map((part) => `${part}${part}`).join("")
    : value;
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed) || normalized.length !== 6) return [37, 99, 235, alpha];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255, alpha];
}

const materializedBoundFeatures = computed(() =>
  bindGeoJsonFeatures(props.binding, props.datasetRows, props.geometryFeatures),
);
const boundFeatureCache = new Map<string, {
  bindingKey: string;
  datasetRows: DataRow[];
  geometryFeatures: GeoJsonFeature[];
  features: BoundGeoJsonFeature[];
}>();

function bindingCacheKey(binding: GeographicLayerBinding | undefined) {
  return binding
    ? [binding.datasetId, binding.geometrySourceId, binding.idField,
      binding.colorField ?? "", binding.sizeField ?? "", binding.aggregation].join("\u0000")
    : "";
}

function cachedBoundFeatures(
  cacheKey: string,
  binding: GeographicLayerBinding | undefined,
  datasetRows: DataRow[],
  geometryFeatures: GeoJsonFeature[],
) {
  const rawRows = toRaw(datasetRows);
  const rawFeatures = toRaw(geometryFeatures);
  const nextBindingKey = bindingCacheKey(binding);
  const cached = boundFeatureCache.get(cacheKey);
  if (cached
    && cached.bindingKey === nextBindingKey
    && cached.datasetRows === rawRows
    && cached.geometryFeatures === rawFeatures) return cached.features;
  const features = bindGeoJsonFeatures(binding, datasetRows, geometryFeatures);
  boundFeatureCache.set(cacheKey, {
    bindingKey: nextBindingKey,
    datasetRows: rawRows,
    geometryFeatures: rawFeatures,
    features,
  });
  return features;
}

function numericExtent(features: unknown[], field: string) {
  const values = features
    .map((feature) => (feature as BoundGeoJsonFeature).properties[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? [Math.min(...values), Math.max(...values)] as const : null;
}

function normalizedValue(value: unknown, extent: readonly [number, number] | null) {
  if (typeof value !== "number" || !extent) return 0.65;
  return extent[0] === extent[1] ? 0.65 : (value - extent[0]) / (extent[1] - extent[0]);
}

function mappedColor(value: unknown, extent: readonly [number, number] | null, config = props.config) {
  const target = colorToRgba(config.color, 230);
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

function graphNodePositions(
  dataset: Dataset | null | undefined,
  binding: GeographicLayerBinding | undefined,
  geometryFeatures: GeoJsonFeature[],
) {
  const graph = dataset?.graph;
  if (!graph || !binding) return new Map<string, [number, number]>();
  const idField = graph.nodes.columns
    .find((column) => ["id", "node_id", "hex_id", "key"].includes(column.name.toLowerCase()))?.name;
  if (!idField) return new Map<string, [number, number]>();
  const positionsByGeometryId = new Map(
    geometryFeatures.flatMap((feature) => geoJsonFeatureIds(feature).map((id) => [id, geometryCenter(feature)] as const)),
  );
  return new Map(graph.nodes.rows.flatMap((row) => {
    const id = (row[idField] ?? "").trim();
    const position = positionsByGeometryId.get((row[binding.idField] ?? "").trim());
    return id && position ? [[id, position] as const] : [];
  }));
}

function graphPointRecords(
  dataset: Dataset | null | undefined,
  binding: GeographicLayerBinding | undefined,
  geometryFeatures: GeoJsonFeature[],
) {
  return Array.from(graphNodePositions(dataset, binding, geometryFeatures), ([rowKey, position]) => ({ rowKey, position }));
}

function pointTargetFromPick(info: any, layerId: string): DeckglPointTarget | null {
  const object = info?.object as { position?: unknown; rowKey?: unknown } | null;
  const position = Array.isArray(object?.position)
    && Number.isFinite(object.position[0])
    && Number.isFinite(object.position[1])
    ? [Number(object.position[0]), Number(object.position[1])] as [number, number]
    : null;
  if (!object || !position) return null;
  const radius = Number(info.layer?.props?.getRadius?.(object));
  const point = info?.pixel ?? [info?.x, info?.y];
  const containerRect = mapContainer.value?.getBoundingClientRect();
  return {
    layerId,
    rowKey: typeof object.rowKey === "string" ? object.rowKey : String(info.index ?? ""),
    position,
    radius: Number.isFinite(radius) ? Math.max(radius, 1) : 8,
    clientX: (containerRect?.left ?? 0) + Number(point?.[0] ?? 0),
    clientY: (containerRect?.top ?? 0) + Number(point?.[1] ?? 0),
  };
}

function onScatterplotHover(info: any, layerId: string) {
  const target = pointTargetFromPick(info, layerId);
  const next = target ? { layerId: target.layerId, rowKey: target.rowKey } : null;
  if (hoveredPoint.value?.layerId !== next?.layerId || hoveredPoint.value?.rowKey !== next?.rowKey) {
    hoveredPoint.value = next;
    emit("pointHover", target);
    updateOverlay();
  }
}

function pickScatterplotPoint(event: DragEvent) {
  const rect = mapContainer.value?.getBoundingClientRect();
  if (!overlay || !rect) return null;
  const info = overlay.pickObject({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  const layerId = String(info?.layer?.id ?? "").replace(/^deckgl-example-/, "");
  const target = layerId ? pointTargetFromPick(info, layerId) : null;
  return target ? { ...target, clientX: event.clientX, clientY: event.clientY } : null;
}

function onMapDragOver(event: DragEvent) {
  if (isCsvColumnDrag(event.dataTransfer)) {
    event.stopPropagation();
    emit("columnDragOver", event);
    return;
  }
  event.preventDefault();
  const target = pickScatterplotPoint(event);
  if (event.dataTransfer) event.dataTransfer.dropEffect = target ? "copy" : "none";
  onScatterplotHover({ object: target ? { position: target.position, rowKey: target.rowKey } : null }, target?.layerId ?? "");
}

function onMapDrop(event: DragEvent) {
  if (isCsvColumnDrag(event.dataTransfer)) {
    event.stopPropagation();
    emit("columnDrop", event);
    return;
  }
  event.preventDefault();
  const target = pickScatterplotPoint(event);
  if (!target) return;
  event.stopPropagation();
  emit("pointDrop", target);
}

function nestedOverlayTransform(nested: DeckglNestedOverlay) {
  const point = map?.project(nestedPointPosition(nested));
  if (!point) return "translate(-10000 -10000)";
  const parameters = nested.parameters;
  const anchorX = point.x + (parameters.parentAnchor.x - 0.5) * nested.parentRadius * 2 + parameters.offset.x;
  const anchorY = point.y + (parameters.parentAnchor.y - 0.5) * nested.parentRadius * 2 + parameters.offset.y;
  const scaleX = parameters.scale.x;
  const scaleY = parameters.scale.y;
  const childX = anchorX - parameters.childAnchor.x * nested.width * scaleX;
  const childY = anchorY - parameters.childAnchor.y * nested.height * scaleY;
  return `translate(${childX} ${childY}) rotate(${parameters.rotation} ${nested.width * scaleX / 2} ${nested.height * scaleY / 2}) scale(${scaleX} ${scaleY})`;
}

function updateNestedOverlayProjection() {
  nestedProjectionFrame = null;
  const container = mapContainer.value;
  if (!container) return;
  const overlays = new Map(
    (props.nestedOverlays ?? []).map((nested) => [nested.relationshipId, nested]),
  );
  container.querySelectorAll<SVGGElement>("[data-nested-relationship-id]").forEach((element) => {
    const nested = overlays.get(element.dataset.nestedRelationshipId ?? "");
    if (nested) element.setAttribute("transform", nestedOverlayTransform(nested));
  });
}

function scheduleNestedOverlayProjection() {
  if (!props.nestedOverlays?.length || nestedProjectionFrame !== null) return;
  nestedProjectionFrame = requestAnimationFrame(updateNestedOverlayProjection);
}

function nestedPointPosition(nested: DeckglNestedOverlay): [number, number] {
  const layer = props.layers?.find((item) => item.id === nested.parentNodeId);
  const feature = cachedBoundFeatures(
    layer?.id ?? nested.parentNodeId,
    layer?.binding,
    layer?.datasetRows ?? [],
    layer?.geometryFeatures ?? [],
  ).find((item) => item.id === nested.parentDataKey);
  if (feature) return geometryCenter(feature);
  const graphPoint = graphPointRecords(
    layer?.dataset,
    layer?.binding,
    layer?.geometryFeatures ?? [],
  ).find((item) => item.rowKey === nested.parentDataKey);
  return graphPoint?.position ?? [0, 0];
}

function graphLineRecords(
  dataset: Dataset | null | undefined,
  binding: GeographicLayerBinding | undefined,
  geometryFeatures: GeoJsonFeature[],
) {
  const graph = dataset?.graph;
  if (!graph) return [];
  const sourceField = graph.edges.columns
    .find((column) => ["source", "from", "source_id"].includes(column.name.toLowerCase()))?.name;
  const targetField = graph.edges.columns
    .find((column) => ["target", "to", "target_id"].includes(column.name.toLowerCase()))?.name;
  if (!sourceField || !targetField) return [];
  const positions = graphNodePositions(dataset, binding, geometryFeatures);
  return graph.edges.rows.flatMap((row) => {
    const start = positions.get((row[sourceField] ?? "").trim());
    const end = positions.get((row[targetField] ?? "").trim());
    const value = Number(row.value ?? 1);
    return start && end ? [{ start, end, value: Number.isFinite(value) ? value : 1 }] : [];
  });
}

function layerOptions(layerType: string, layer?: NonNullable<typeof props.layers>[number]): any {
  const common = { id: `deckgl-example-${layer?.id ?? layerType}` };
  const config = layer?.config ?? props.config;
  const binding = layer?.binding ?? props.binding;
  const datasetRows = layer?.datasetRows ?? props.datasetRows;
  const geometryFeatures = layer?.geometryFeatures ?? props.geometryFeatures;
  const dataset = layer?.dataset ?? props.dataset;
  const configuredColor = colorToRgba(config.color, 220);
  const configuredPointSize = Number.isFinite(config.size) ? Math.max(config.size ?? 8, 1) : 8;
  const boundFeatures = layer
    ? cachedBoundFeatures(layer.id, binding, datasetRows, geometryFeatures)
    : materializedBoundFeatures.value;
  const colorExtent = numericExtent(boundFeatures, "__colorValue");
  const sizeExtent = numericExtent(boundFeatures, "__sizeValue");
  const featureColor = (feature: BoundGeoJsonFeature) => binding?.colorField
    ? mappedColor(feature.properties.__colorValue, colorExtent, config)
    : configuredColor;
  const featureSize = (feature: BoundGeoJsonFeature) => binding?.sizeField
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
        data: binding ? boundFeatures : exampleDataUrls.geojson,
        opacity: 0.86,
        filled: true,
        stroked: true,
        extruded: false,
        getFillColor: binding ? featureColor : configuredColor,
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
      if (dataset?.graph) {
        const graphLines = graphLineRecords(dataset, binding, geometryFeatures);
        return new LineLayer({ ...common, data: graphLines, opacity: 0.82, getSourcePosition: (d: { start: number[] }) => d.start, getTargetPosition: (d: { end: number[] }) => d.end, getColor: configuredColor, getWidth: (d: { value: number }) => Math.max(1, Math.min(12, d.value || 2)) });
      }
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
        data: binding ? geoJsonPolygonRecords(boundFeatures) : loadedExampleData.value[layerType] ?? [],
        getPolygon: binding
          ? (datum: { polygon: unknown }) => datum.polygon
          : (datum: number[][]) => datum,
        getFillColor: binding
          ? (datum: { feature: BoundGeoJsonFeature }) => featureColor(datum.feature)
          : configuredColor,
        getLineColor: [255, 255, 255, 210],
        getLineWidth: 1,
        lineWidthMinPixels: 0.6,
        stroked: true,
        filled: true,
      });
    case "ScatterplotLayer":
      const graphPoints = config.link ? graphPointRecords(dataset, binding, geometryFeatures) : [];
      const hasPointRecords = !!binding || graphPoints.length > 0;
      const pointData = graphPoints.length > 0
        ? graphPoints.map((point) => ({ ...point, layerId: layer?.id ?? layerType }))
        : binding
          ? boundFeatures.map((feature) => ({
            ...feature,
            position: geometryCenter(feature),
            rowKey: feature.id,
            layerId: layer?.id ?? layerType,
          }))
          : points.map((point, index) => ({
            position: point.position,
            rowKey: String(index),
            layerId: layer?.id ?? layerType,
          }));
      const scatterplot = new ScatterplotLayer({
        ...common,
        data: hasPointRecords ? pointData : exampleDataUrls.manhattan,
        radiusUnits: "pixels",
        radiusMinPixels: 1,
        getPosition: hasPointRecords
          ? (point: { position: [number, number] }) => point.position
          : (point: number[]) => [point[0], point[1]],
        getRadius: graphPoints.length > 0
          ? configuredPointSize
          : binding
            ? (point: BoundGeoJsonFeature) => featureSize(point)
            : configuredPointSize,
        getFillColor: graphPoints.length > 0
          ? configuredColor
          : binding
            ? (point: BoundGeoJsonFeature) => featureColor(point)
            : configuredColor,
        getLineColor: (point: { layerId: string; rowKey: string }) =>
          hoveredPoint.value?.layerId === point.layerId && hoveredPoint.value?.rowKey === point.rowKey
            ? [15, 23, 42, 255]
            : [255, 255, 255, 255],
        getLineWidth: (point: { layerId: string; rowKey: string }) =>
          hoveredPoint.value?.layerId === point.layerId && hoveredPoint.value?.rowKey === point.rowKey ? 3 : 1,
        lineWidthMinPixels: 1,
        stroked: true,
        pickable: true,
        onHover: (info: any) => onScatterplotHover(info, layer?.id ?? layerType),
        onClick: (info: any) => {
          const target = pointTargetFromPick(info, layer?.id ?? layerType);
          if (target) emit("pointSelect", target);
        },
      });
      const graphLines = config.link ? graphLineRecords(dataset, binding, geometryFeatures) : [];
      return graphLines.length > 0
        ? [
          new LineLayer({
            ...common,
            id: `${common.id}-links`,
            data: graphLines,
            opacity: 0.82,
            getSourcePosition: (line: typeof graphLines[number]) => line.start,
            getTargetPosition: (line: typeof graphLines[number]) => line.end,
            getColor: [100, 116, 139, 190],
            getWidth: (line: typeof graphLines[number]) => Math.max(1, Math.min(12, line.value)),
            widthMinPixels: 1,
          }),
          scatterplot,
        ]
        : scatterplot;
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
  const layers = props.layers?.length ? props.layers : [{
    id: "primary",
    layerType: props.layerType,
    config: props.config,
    binding: props.binding,
    datasetRows: props.datasetRows,
    geometryFeatures: props.geometryFeatures,
  }];
  overlay.setProps({ layers: layers.flatMap((layer) => {
    const rendered = layerOptions(layer.layerType, layer);
    return Array.isArray(rendered) ? rendered : [rendered];
  }) });
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

function loadAllExampleData() {
  const layerTypes = props.layers?.map((layer) => layer.layerType) ?? [props.layerType];
  layerTypes.forEach((layerType) => { void loadExampleData(layerType); });
}

let referenceSequence = 0;
const referenceIds = new WeakMap<object, number>();
function referenceId(value: unknown) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return 0;
  const rawValue = toRaw(value as object);
  const existing = referenceIds.get(rawValue);
  if (existing) return existing;
  referenceSequence += 1;
  referenceIds.set(rawValue, referenceSequence);
  return referenceSequence;
}

// App creates lightweight layer wrapper objects during render. Watch the data
// and options they point to, not wrapper identity or every cell in large CSVs.
const layerRenderSignature = computed(() => JSON.stringify((props.layers ?? []).map((layer) => [
  layer.id,
  layer.layerType,
  layer.config.size ?? null,
  layer.config.color ?? null,
  layer.config.link ?? null,
  bindingCacheKey(layer.binding),
  referenceId(layer.datasetRows),
  layer.datasetRows.length,
  referenceId(layer.geometryFeatures),
  layer.geometryFeatures.length,
  referenceId(layer.dataset),
  layer.dataset?.graph?.nodes.rows.length ?? 0,
  layer.dataset?.graph?.edges.rows.length ?? 0,
])));
const layerTypeSignature = computed(() =>
  (props.layers ?? []).map((layer) => layer.layerType).join("\u0000"),
);
function nestedOverlayInputs() {
  return (props.nestedOverlays ?? []).map((nested) => [
    nested.relationshipId,
    nested.parentNodeId,
    nested.parentDataKey,
    nested.content,
    nested.width,
    nested.height,
    nested.parentRadius,
    nested.parameters.parentAnchor.x,
    nested.parameters.parentAnchor.y,
    nested.parameters.childAnchor.x,
    nested.parameters.childAnchor.y,
    nested.parameters.offset.x,
    nested.parameters.offset.y,
    nested.parameters.scale.x,
    nested.parameters.scale.y,
    nested.parameters.rotation,
    nested.parameters.retainParent,
  ]);
}

function sameNestedOverlayInputs(left: unknown[][], right: unknown[][]) {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return !!other && entry.length === other.length
      && entry.every((value, valueIndex) => value === other[valueIndex]);
  });
}

function componentInputSnapshot() {
  return {
    layerType: props.layerType,
    configSize: props.config.size,
    configColor: props.config.color,
    configLink: props.config.link,
    layerRender: layerRenderSignature.value,
    layerTypes: layerTypeSignature.value,
    join: [
      props.binding?.datasetId ?? "",
      props.binding?.geometrySourceId ?? "",
      props.binding?.idField ?? "",
    ].join("\u0000"),
    colorField: props.binding?.colorField,
    sizeField: props.binding?.sizeField,
    datasetRows: referenceId(props.datasetRows),
    geometryFeatures: referenceId(props.geometryFeatures),
    width: props.width,
    height: props.height,
    nestedOverlays: nestedOverlayInputs(),
  };
}

let previousInput = componentInputSnapshot();

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
  // Keep deck.gl in its own canvas/context. Sharing Mapbox's WebGL state can
  // leave enabled attributes and aggregation textures bound inconsistently.
  overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay);
  const persistViewState = () => {
    if (!map || !userCameraInteraction) return;
    userCameraInteraction = false;
    userViewState = true;
    // Mapbox can emit several moveend events during a wheel gesture. Keep the
    // camera local to Mapbox until interaction settles, then commit once.
    if (viewStateCommitTimer !== null) window.clearTimeout(viewStateCommitTimer);
    viewStateCommitTimer = window.setTimeout(() => {
      viewStateCommitTimer = null;
      emitCurrentViewState();
    }, 120);
  };
  map.on("movestart", (event) => {
    if (event.originalEvent) userCameraInteraction = true;
  });
  map.on("moveend", persistViewState);
  map.on("move", scheduleNestedOverlayProjection);
  map.once("load", () => {
    fitMapToLayerData();
    updateOverlay();
    loadAllExampleData();
  });
});

onUpdated(() => {
  const current = componentInputSnapshot();
  const prior = previousInput;
  previousInput = current;

  const hasLayerStack = !!props.layers?.length;
  const layerTypeChanged = current.layerType !== prior.layerType;
  const joinChanged = current.join !== prior.join;
  const rowsChanged = current.datasetRows !== prior.datasetRows;
  const featuresChanged = current.geometryFeatures !== prior.geometryFeatures;
  const primaryOverlayChanged = layerTypeChanged
    || current.configSize !== prior.configSize
    || current.configColor !== prior.configColor
    || current.configLink !== prior.configLink
    || joinChanged
    || current.colorField !== prior.colorField
    || current.sizeField !== prior.sizeField
    || rowsChanged
    || featuresChanged;

  if (current.layerRender !== prior.layerRender || (!hasLayerStack && primaryOverlayChanged)) {
    updateOverlay();
  }
  if (current.layerTypes !== prior.layerTypes || (!hasLayerStack && layerTypeChanged)) {
    loadAllExampleData();
  }

  if (joinChanged) {
    // A new ID join is an explicit request to show different geometry. It must
    // not inherit a stale camera lock from selecting or panning the empty map.
    userViewState = false;
    initialViewFitted = false;
    fitMapToLayerData({ force: true, persist: true });
  } else if (rowsChanged && props.binding && !userViewState) {
    initialViewFitted = false;
    fitMapToLayerData({ force: true, persist: true });
  } else if (featuresChanged) {
    initialViewFitted = false;
    if (!userViewState) {
      fitMapToLayerData({ force: !!props.binding, persist: !!props.binding });
    }
  } else if (!hasLayerStack && layerTypeChanged) {
    initialViewFitted = false;
    fitMapToLayerData();
  }

  if (current.width !== prior.width || current.height !== prior.height) {
    requestAnimationFrame(() => map?.resize());
  }
  if (!sameNestedOverlayInputs(current.nestedOverlays, prior.nestedOverlays)) {
    scheduleNestedOverlayProjection();
  }
});

onBeforeUnmount(() => {
  if (viewStateCommitTimer !== null) window.clearTimeout(viewStateCommitTimer);
  viewStateCommitTimer = null;
  if (nestedProjectionFrame !== null) cancelAnimationFrame(nestedProjectionFrame);
  nestedProjectionFrame = null;
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
    @pointerdown.capture="onMapPointerDown"
    @dragover.capture="onMapDragOver"
    @drop.capture="onMapDrop"
  >
    <svg
      v-if="nestedOverlays?.length"
      class="deckgl-nested-overlay"
      :width="width"
      :height="height"
      aria-hidden="true"
    >
      <g
        v-for="nested in nestedOverlays"
        :key="nested.relationshipId"
        class="deckgl-nested-overlay__child"
        :data-nested-relationship-id="nested.relationshipId"
        :transform="nestedOverlayTransform(nested)"
        v-html="nested.content"
      />
    </svg>
  </div>
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

.deckgl-nested-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: visible;
  pointer-events: none;
}

.deckgl-nested-overlay__child {
  pointer-events: none;
}
</style>
