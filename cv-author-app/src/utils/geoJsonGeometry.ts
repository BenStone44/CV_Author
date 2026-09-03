import type {
  DataRow,
  GeoJsonFeature,
  GeographicLayerBinding,
} from "../types";

export type BoundGeoJsonFeature = GeoJsonFeature & {
  properties: Record<string, unknown> & {
    __colorValue?: number;
    __sizeValue?: number;
  };
};

export type GeoJsonBounds = {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
};

export type GeoJsonPolygonRecord = {
  feature: BoundGeoJsonFeature;
  polygon: unknown;
};

export function canonicalGeoJsonJoinId(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^\d+(?:\.0+)?$/.test(trimmed)
    ? String(Math.trunc(numeric))
    : trimmed;
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

export function bindGeoJsonFeatures(
  binding: GeographicLayerBinding | undefined,
  datasetRows: DataRow[],
  geometryFeatures: GeoJsonFeature[],
): BoundGeoJsonFeature[] {
  if (!binding?.idField || geometryFeatures.length === 0) return [];
  const aggregate = new Map<string, { colorValue: number; sizeValue: number }>();
  datasetRows.forEach((row) => {
    const id = canonicalGeoJsonJoinId(row[binding.idField]);
    if (!id) return;
    const current = aggregate.get(id) ?? { colorValue: 0, sizeValue: 0 };
    const colorValue = binding.colorField ? Number(row[binding.colorField]) : 0;
    const sizeValue = binding.sizeField ? Number(row[binding.sizeField]) : 0;
    if (Number.isFinite(colorValue)) current.colorValue += colorValue;
    if (Number.isFinite(sizeValue)) current.sizeValue += sizeValue;
    aggregate.set(id, current);
  });
  return geometryFeatures.flatMap((feature) => {
    const values = Array.from(new Set(
      geoJsonFeatureIds(feature).map(canonicalGeoJsonJoinId),
    )).reduce((result, id) => {
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

export function geoJsonFeatureBounds(features: GeoJsonFeature[]): GeoJsonBounds | null {
  let bounds: GeoJsonBounds | null = null;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      const longitude = value[0];
      const latitude = value[1];
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
      if (!bounds) {
        bounds = {
          minLongitude: longitude,
          minLatitude: latitude,
          maxLongitude: longitude,
          maxLatitude: latitude,
        };
        return;
      }
      bounds.minLongitude = Math.min(bounds.minLongitude, longitude);
      bounds.minLatitude = Math.min(bounds.minLatitude, latitude);
      bounds.maxLongitude = Math.max(bounds.maxLongitude, longitude);
      bounds.maxLatitude = Math.max(bounds.maxLatitude, latitude);
      return;
    }
    value.forEach(visit);
  };
  features.forEach((feature) => visit(feature.geometry.coordinates));
  return bounds;
}

export function geoJsonPolygonRecords(features: BoundGeoJsonFeature[]): GeoJsonPolygonRecord[] {
  return features.flatMap((feature) => {
    if (feature.geometry.type === "Polygon") {
      return [{ feature, polygon: feature.geometry.coordinates }];
    }
    if (feature.geometry.type === "MultiPolygon") {
      return (feature.geometry.coordinates as unknown[]).map((polygon) => ({ feature, polygon }));
    }
    return [];
  });
}
