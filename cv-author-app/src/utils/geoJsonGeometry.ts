import type { GeoJsonFeature } from "../types";

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
