import { describe, expect, it } from "vitest";
import {
  beginCsvColumnDrag,
  decodeCsvColumnDragPayload,
  encodeCsvColumnDragPayload,
  endCsvColumnDrag,
  getActiveCsvColumnDrag,
} from "../utils/csvColumnDrag";

describe("CSV column drag payload", () => {
  it("round-trips a typed column and rejects malformed payloads", () => {
    const payload = { datasetId: "dataset-1", field: "revenue", type: "quantitative" as const };
    expect(decodeCsvColumnDragPayload(encodeCsvColumnDragPayload(payload))).toEqual(payload);
    expect(decodeCsvColumnDragPayload('{"datasetId":"dataset-1","field":"revenue","type":"unknown"}')).toBeNull();
    expect(decodeCsvColumnDragPayload("not-json")).toBeNull();
  });

  it("tracks the active in-page drag for protected dragover events", () => {
    const payload = { datasetId: "dataset-1", field: "date", type: "temporal" as const };
    beginCsvColumnDrag(payload);
    expect(getActiveCsvColumnDrag()).toEqual(payload);
    endCsvColumnDrag();
    expect(getActiveCsvColumnDrag()).toBeNull();
  });
});
