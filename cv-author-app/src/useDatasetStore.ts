import { computed, ref, watch } from "vue";
import Papa from "papaparse";
import type { DataColumn, DataColumnType, DataRow, Dataset } from "./types";
import { inferCsvPrimaryKey } from "./csvDataEngine";

type ParsedCsv = {
  data: unknown[][];
  errors: Papa.ParseError[];
};

function normalizeStoredDataset(dataset: Dataset): Dataset {
  const available = new Set(dataset.columns.map((column) => column.name));
  const storedKeyValues = (dataset.primaryKey?.length ?? 0) > 0
    ? dataset.rows.map((row) => dataset.primaryKey!.map((field) => row[field]?.trim() ?? ""))
    : [];
  const storedKeyIsValid = storedKeyValues.length > 0
    && dataset.primaryKey!.every((field) => available.has(field))
    && storedKeyValues.every((values) => values.every(Boolean))
    && new Set(storedKeyValues.map((values) => JSON.stringify(values))).size === dataset.rows.length;
  return storedKeyIsValid
    ? dataset
    : { ...dataset, primaryKey: inferCsvPrimaryKey(dataset) };
}

const datasets = ref<Dataset[]>((() => {
  try {
    const raw = localStorage.getItem("cv-author-datasets-v1");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
        .filter((dataset) => dataset?.id !== "dataset:llm-demo")
        .map((dataset) => normalizeStoredDataset(dataset as Dataset))
      : [];
  } catch { return []; }
})());
const activeDatasetId = ref<string | null>(datasets.value[0]?.id ?? null);
const parseError = ref("");
const parseWarning = ref("");
const isLoading = ref(false);

watch(datasets, (value) => {
  try { localStorage.setItem("cv-author-datasets-v1", JSON.stringify(value)); } catch { /* storage is optional */ }
}, { deep: true, immediate: true });

const activeDataset = computed(() =>
  datasets.value.find((dataset) => dataset.id === activeDatasetId.value) ?? null,
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

async function importDataset(file: File) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    parseError.value = "Choose a CSV file.";
    return null;
  }

  isLoading.value = true;
  parseError.value = "";
  parseWarning.value = "";
  try {
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
  return datasets.value.find((dataset) => dataset.id === datasetId) ?? null;
}

function setActiveDataset(datasetId: string) {
  if (getDataset(datasetId)) activeDatasetId.value = datasetId;
}

function setColumnType(datasetId: string, columnName: string, type: DataColumnType) {
  datasets.value = datasets.value.map((dataset) => {
    if (dataset.id !== datasetId) return dataset;
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
    clearActiveDataset,
  };
}
