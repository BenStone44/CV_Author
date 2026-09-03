import type { GeoJsonFeature } from "../types";

/** Parse a CSV-embedded GeoJSON position such as "[-73.98,40.75]". */
export function parseEmbeddedPoint(value: unknown): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [longitude, latitude]
      : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length >= 2) {
      const longitude = Number(parsed[0]);
      const latitude = Number(parsed[1]);
      return Number.isFinite(longitude) && Number.isFinite(latitude)
        ? [longitude, latitude]
        : null;
    }
  } catch {
    // Accept the common CSV-friendly "longitude latitude" form as well.
  }
  const parts = text.replace(/[\[\]()]/g, "").split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

/** IDs that may join a CSV placeholder value to one GeoJSON feature. */
export function geoJsonFeatureIds(feature: GeoJsonFeature) {
  const aliases = Array.isArray(feature.properties.ids)
    ? feature.properties.ids.filter((value): value is string | number =>
      typeof value === "string" || typeof value === "number")
    : [];
  return Array.from(new Set([feature.id, ...aliases.map(String)]))
    .map((value) => value.trim())
    .filter(Boolean);
}
