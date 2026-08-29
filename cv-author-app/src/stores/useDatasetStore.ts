import { computed, ref } from "vue";
import Papa from "papaparse";
import type {
  DataColumn,
  DataColumnType,
  DataRow,
  Dataset,
  DatasetTable,
  GeoJsonFeature,
  GeoJsonGeometry,
  GeometrySource,
  GraphTables,
} from "../types";
import { inferCsvPrimaryKey } from "../utils/csvDataEngine";
import {
  DEFAULT_CHART_DATASET_ID,
  defaultChartDataset,
} from "../utils/defaultChartData";

type ParsedCsv = {
  data: unknown[][];
  errors: Papa.ParseError[];
};

// Datasets are session-scoped. Keep the store focused on the live source of
// truth and let callers import/load data explicitly when a new session starts.
const datasets = ref<Dataset[]>([]);
const activeDatasetId = ref<string | null>(datasets.value[0]?.id ?? null);
const parseError = ref("");
const parseWarning = ref("");
const isLoading = ref(false);
const geometrySources = ref<GeometrySource[]>([]);
const activeGeometrySourceId = ref<string | null>(null);

const activeDataset = computed(() =>
  datasets.value.find((dataset) => dataset.id === activeDatasetId.value) ?? null,
);
const activeGeometrySource = computed(() =>
  geometrySources.value.find((source) => source.id === activeGeometrySourceId.value) ?? null,
);

function isNumeric(value: string) {
  if (value.trim() === "") return false;
  const number = Number(value);
  return Number.isFinite(number);
}

function isTemporal(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value.trim())) return false;
  return Number.isFinite(Date.parse(value));
}

export function inferColumnType(values: string[]): DataColumnType {
  const nonEmptyValues = values.map((value) => value.trim()).filter(Boolean);
  if (nonEmptyValues.length === 0) return "nominal";
  if (nonEmptyValues.every(isNumeric)) return "quantitative";
  if (nonEmptyValues.every(isTemporal)) return "temporal";
  return "nominal";
}

function normalizeHeaders(sourceHeaders: string[], columnCount: number) {
  const used = new Map<string, number>();
  return Array.from({ length: columnCount }, (_, index) => {
    const baseName = sourceHeaders[index]?.trim() || `Column ${index + 1}`;
    const count = used.get(baseName) ?? 0;
    used.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}_${count + 1}`;
  });
}

function parseFile(file: File) {
  return new Promise<ParsedCsv>((resolve, reject) => {
    Papa.parse<unknown[]>(file, {
      skipEmptyLines: "greedy",
      complete: (result) => resolve({ data: result.data, errors: result.errors }),
      error: reject,
    });
  });
}

function jsonValueToString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupportedGeoJsonGeometry(value: unknown): value is GeoJsonGeometry {
  if (!isRecord(value) || typeof value.type !== "string" || !("coordinates" in value)) return false;
  return value.type === "Point"
    || value.type === "MultiPoint"
    || value.type === "Polygon"
    || value.type === "MultiPolygon";
}

export function parseGeometrySource(source: string, name = "geometry.geojson"): GeometrySource {
  let payload: unknown;
  try {
    payload = JSON.parse(source) as unknown;
  } catch {
    throw new Error("Unable to read the GeoJSON file.");
  }
  if (!isRecord(payload) || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("GeoJSON must be a FeatureCollection.");
  }
  const features = payload.features.map((value, index) => {
    const geometry = isRecord(value) ? value.geometry : null;
    if (!isRecord(value) || value.type !== "Feature" || !isSupportedGeoJsonGeometry(geometry)) {
      throw new Error(`GeoJSON feature ${index + 1} has an unsupported geometry.`);
    }
    const properties = isRecord(value.properties) ? value.properties : {};
    const rawId = value.id ?? properties.id;
    if (typeof rawId !== "string" && typeof rawId !== "number") {
      throw new Error(`GeoJSON feature ${index + 1} needs an explicit id.`);
    }
    const id = String(rawId).trim();
    if (!id) throw new Error(`GeoJSON feature ${index + 1} has an empty id.`);
    return {
      type: "Feature",
      id,
      properties: { ...properties, id },
      geometry,
    } satisfies GeoJsonFeature;
  });
  const ids = new Set<string>();
  features.forEach((feature) => {
    if (ids.has(feature.id)) throw new Error(`GeoJSON contains duplicate feature id ${feature.id}.`);
    ids.add(feature.id);
  });
  return { id: `geometry:${crypto.randomUUID()}`, name, features };
}

async function importGeometrySource(file: File) {
  parseError.value = "";
  try {
    const geometrySource = parseGeometrySource(await file.text(), file.name);
    geometrySources.value = [...geometrySources.value, geometrySource];
    activeGeometrySourceId.value = geometrySource.id;
    return geometrySource;
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : "Unable to read the GeoJSON file.";
    return null;
  }
}

function getGeometrySource(sourceId: string) {
  return geometrySources.value.find((source) => source.id === sourceId) ?? null;
}

function setActiveGeometrySource(sourceId: string) {
  if (getGeometrySource(sourceId)) activeGeometrySourceId.value = sourceId;
}

function parseGraphTable(value: unknown, label: "nodes" | "edges"): DatasetTable {
  if (!Array.isArray(value)) {
    throw new Error(`Graph JSON "${label}" must be an array.`);
  }

  const sourceRows = value.map((row, index) => {
    if (!isRecord(row)) {
      throw new Error(`Graph JSON "${label}" row ${index + 1} must be an object.`);
    }
    return row;
  });
  const sourceHeaders = Array.from(
    new Set(sourceRows.flatMap((row) => Object.keys(row))),
  );
  const headers = normalizeHeaders(sourceHeaders, sourceHeaders.length);
  const rows: DataRow[] = sourceRows.map((sourceRow) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        jsonValueToString(sourceRow[sourceHeaders[index] ?? ""]),
      ]),
    ),
  );
  const columns = headers.map((name) => ({
    name,
    type: inferColumnType(rows.map((row) => row[name] ?? "")),
  } satisfies DataColumn));
  return { columns, rows };
}

export function parseGraphDataset(source: string, name = "graph.json"): Dataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("Unable to read the Graph JSON file.");
  }
  const payload = isRecord(parsed) && isRecord(parsed.graph) ? parsed.graph : parsed;
  if (!isRecord(payload)) {
    throw new Error('Graph JSON must contain "nodes" and "edges" arrays.');
  }
  const graph: GraphTables = {
    nodes: parseGraphTable(payload.nodes, "nodes"),
    edges: parseGraphTable(payload.edges, "edges"),
  };
  return {
    id: `dataset:${crypto.randomUUID()}`,
    name,
    columns: [],
    rows: [],
    graph,
  };
}

async function importDataset(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "json") {
    parseError.value = "Choose a CSV or Graph JSON file.";
    return null;
  }

  isLoading.value = true;
  parseError.value = "";
  parseWarning.value = "";
  try {
    if (extension === "json") {
      const dataset = parseGraphDataset(await file.text(), file.name);
      datasets.value = [...datasets.value, dataset];
      activeDatasetId.value = dataset.id;
      return dataset;
    }
    const result = await parseFile(file);
    const parsedRows = result.data.map((row) =>
      row.map((cell) => (cell == null ? "" : String(cell))),
    );
    const columnCount = parsedRows.reduce(
      (maximum, row) => Math.max(maximum, row.length),
      0,
    );
    if (parsedRows.length === 0 || columnCount === 0) {
      parseError.value = "The CSV file is empty.";
      return null;
    }

    const headers = normalizeHeaders(parsedRows[0] ?? [], columnCount);
    const rows: DataRow[] = parsedRows.slice(1).map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      ),
    );
    const columns = headers.map((name) => ({
      name,
      type: inferColumnType(rows.map((row) => row[name] ?? "")),
    } satisfies DataColumn));
    const parsedDataset: Dataset = {
      id: `dataset:${crypto.randomUUID()}`,
      name: file.name,
      columns,
      rows,
    };
    const dataset = { ...parsedDataset, primaryKey: inferCsvPrimaryKey(parsedDataset) };
    datasets.value = [...datasets.value, dataset];
    activeDatasetId.value = dataset.id;
    parseWarning.value = result.errors.length > 0
      ? `${result.errors.length} parsing warning${result.errors.length === 1 ? "" : "s"}`
      : "";
    return dataset;
  } catch (error) {
    parseError.value = error instanceof Error
      ? error.message
      : "Unable to read the CSV file.";
    return null;
  } finally {
    isLoading.value = false;
  }
}

function clearActiveDataset() {
  if (activeDatasetId.value) {
    datasets.value = datasets.value.filter((item) => item.id !== activeDatasetId.value);
  }
  activeDatasetId.value = null;
  parseError.value = "";
  parseWarning.value = "";
}

function getDataset(datasetId: string) {
  if (datasetId === DEFAULT_CHART_DATASET_ID) return defaultChartDataset;
  return datasets.value.find((dataset) => dataset.id === datasetId) ?? null;
}

function setActiveDataset(datasetId: string) {
  if (getDataset(datasetId)) activeDatasetId.value = datasetId;
}

function setColumnType(
  datasetId: string,
  columnName: string,
  type: DataColumnType,
  table?: "nodes" | "edges",
) {
  datasets.value = datasets.value.map((dataset) => {
    if (dataset.id !== datasetId) return dataset;
    if (table && dataset.graph) {
      return {
        ...dataset,
        graph: {
          ...dataset.graph,
          [table]: {
            ...dataset.graph[table],
            columns: dataset.graph[table].columns.map((column) =>
              column.name === columnName ? { ...column, type } : column,
            ),
          },
        },
      };
    }
    return {
      ...dataset,
      columns: dataset.columns.map((column) =>
        column.name === columnName ? { ...column, type } : column,
      ),
    };
  });
}

export function useDatasetStore() {
  return {
    datasets,
    activeDataset,
    activeDatasetId,
    getDataset,
    setActiveDataset,
    setColumnType,
    parseError,
    parseWarning,
    isLoading,
    importDataset,
    geometrySources,
    activeGeometrySource,
    activeGeometrySourceId,
    importGeometrySource,
    getGeometrySource,
    setActiveGeometrySource,
    clearActiveDataset,
  };
}
