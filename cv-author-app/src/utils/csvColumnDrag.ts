import type { DataColumnType } from "../types";

export const csvColumnDragMime = "application/x-csv-column";

export type CsvColumnDragPayload = {
  datasetId: string;
  field: string;
  type: DataColumnType;
  /** Source table for graph datasets; omitted for a regular wide table. */
  table?: "nodes" | "edges";
};

let activeCsvColumnDragPayload: CsvColumnDragPayload | null = null;

export function encodeCsvColumnDragPayload(payload: CsvColumnDragPayload) {
  return JSON.stringify(payload);
}

export function decodeCsvColumnDragPayload(value: string | null | undefined): CsvColumnDragPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CsvColumnDragPayload>;
    if (
      typeof parsed.datasetId !== "string" || !parsed.datasetId
      || typeof parsed.field !== "string" || !parsed.field
      || (parsed.type !== "nominal" && parsed.type !== "ordinal" && parsed.type !== "quantitative")
    ) return null;
    const table = parsed.table === "nodes" || parsed.table === "edges" ? parsed.table : undefined;
    return { datasetId: parsed.datasetId, field: parsed.field, type: parsed.type, ...(table ? { table } : {}) };
  } catch {
    return null;
  }
}

export function beginCsvColumnDrag(payload: CsvColumnDragPayload) {
  activeCsvColumnDragPayload = payload;
}

export function endCsvColumnDrag() {
  activeCsvColumnDragPayload = null;
}

export function getActiveCsvColumnDrag() {
  return activeCsvColumnDragPayload;
}

/**
 * Some browsers hide custom DataTransfer types while a drag is in progress.
 * The in-page payload is therefore the authoritative signal for CSV drags.
 */
export function isCsvColumnDrag(dataTransfer: DataTransfer | null | undefined) {
  return !!getActiveCsvColumnDrag()
    || Array.from(dataTransfer?.types ?? []).includes(csvColumnDragMime)
    || !!decodeCsvColumnDragPayload(dataTransfer?.getData(csvColumnDragMime));
}
