import { computed, ref, watch } from "vue";
import Papa from "papaparse";
import type { DataColumn, DataColumnType, DataRow, Dataset } from "./types";

type ParsedCsv = {
  data: unknown[][];
  errors: Papa.ParseError[];
};

const datasets = ref<Dataset[]>((() => {
  try {
    const raw = localStorage.getItem("cv-author-datasets-v1");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((dataset) => dataset?.id !== "dataset:llm-demo")
      : [];
  } catch { return []; }
})());
const activeDatasetId = ref<string | null>(datasets.value[0]?.id ?? null);
const parseError = ref("");
const parseWarning = ref("");
const isLoading = ref(false);

watch(datasets, (value) => {
  try { localStorage.setItem("cv-author-datasets-v1", JSON.stringify(value)); } catch { /* storage is optional */ }
}, { deep: true });

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

function inferColumnType(values: string[]): DataColumnType {
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

function createPrimaryKey(columns: DataColumn[], rows: DataRow[]) {
  // Case 1 uses person + time. For other datasets, fall back to a unique
  // nominal/temporal pair when one can be identified safely.
  const preferred = ["person", "time"];
  if (preferred.every((field) => columns.some((column) => column.name === field))) {
    const keys = rows.map((row) => preferred.map((field) => row[field] ?? "").join("\u001f"));
    if (new Set(keys).size === keys.length) return preferred;
  }

  const nominal = columns.find((column) => column.type === "nominal")?.name;
  const temporal = columns.find((column) => column.type === "temporal")?.name;
  if (!nominal || !temporal) return undefined;
  const keys = rows.map((row) => `${row[nominal] ?? ""}\u001f${row[temporal] ?? ""}`);
  return new Set(keys).size === keys.length ? [nominal, temporal] : undefined;
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
    const columns = headers.map((name, index) => ({
      name,
      type: inferColumnType(rows.map((row) => row[name] ?? "")),
    } satisfies DataColumn));
    const dataset: Dataset = {
      id: `dataset:${crypto.randomUUID()}`,
      name: file.name,
      columns,
      rows,
      primaryKey: createPrimaryKey(columns, rows),
    };
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
