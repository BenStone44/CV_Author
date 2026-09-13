import type { ChartSpec, CoordinateChannel } from "../types";
import type {
  AxisBoundary,
  ChartBlockSpecification,
  DropAreaSpecification,
  ResolvedSpatialReference,
} from "./model";
import { resolveBlockSurface } from "./spatial";

export type BlockCompositionEligibility = {
  eligible: boolean;
  operation: "layer" | "concat";
  targetArea?: DropAreaSpecification;
  sharedChannels: CoordinateChannel[];
  reason?: "DROP_AREA_UNAVAILABLE" | "PARTNER_CAPABILITY_MISSING" | "SPATIAL_REFERENCE_MISMATCH";
};

function boundaryOf(area: DropAreaSpecification) {
  return "boundary" in area.geometry ? area.geometry.boundary : undefined;
}

function referencesCanMatch(source: ResolvedSpatialReference, target: ResolvedSpatialReference) {
  if (source.placement.channel !== target.placement.channel) return false;
  if (source.compatibility === "hierarchy-depth" || target.compatibility === "hierarchy-depth") {
    return source.compatibility === "hierarchy-depth" && target.compatibility === "hierarchy-depth";
  }
  if (source.compatibility === "geographic-projection" || target.compatibility === "geographic-projection") {
    return source.compatibility === "geographic-projection" && target.compatibility === "geographic-projection";
  }
  return source.exposure !== "internal" && target.exposure !== "internal";
}

/**
 * Specification-level composition gate. Dataset-dependent visible-domain
 * equality is intentionally evaluated afterwards by the composition engine.
 */
export function evaluateBlockComposition(
  source: ChartBlockSpecification,
  target: ChartBlockSpecification,
  sourceChartSpec: ChartSpec | null | undefined,
  targetChartSpec: ChartSpec | null | undefined,
  operation: "layer" | "concat",
  boundary?: AxisBoundary,
): BlockCompositionEligibility {
  const sourceSurface = resolveBlockSurface(source, sourceChartSpec);
  const targetSurface = resolveBlockSurface(target, targetChartSpec);
  const targetArea = targetSurface.dropAreas.find((area) =>
    area.operation === operation && (!boundary || boundaryOf(area) === boundary));
  if (!targetArea) return { eligible: false, operation, sharedChannels: [], reason: "DROP_AREA_UNAVAILABLE" };
  if (targetArea.requiresPartnerCapability
    && !source.composition.capabilities.includes(targetArea.requiresPartnerCapability)) {
    return { eligible: false, operation, targetArea, sharedChannels: [], reason: "PARTNER_CAPABILITY_MISSING" };
  }
  const targetReferences = operation === "layer" && targetArea.sharedReferenceIds.length === 0
    ? targetSurface.references.filter((reference) => reference.exposure !== "internal")
    : targetSurface.references.filter((reference) => targetArea.sharedReferenceIds.includes(reference.id));
  const pairs = targetReferences.flatMap((targetReference) => sourceSurface.references.flatMap((sourceReference) => {
    if (operation === "layer"
      && (sourceReference.semantic === "hierarchy-depth" || targetReference.semantic === "hierarchy-depth")) return [];
    if (sourceReference.conditionalPartnerCapability
      && !target.composition.capabilities.includes(sourceReference.conditionalPartnerCapability)) return [];
    return referencesCanMatch(sourceReference, targetReference)
      ? [{ sourceReference, targetReference }]
      : [];
  }));
  const channels = Array.from(new Set(pairs.flatMap(({ targetReference }) => {
    const channel = targetReference.placement.channel;
    return channel === "x" || channel === "y" || channel === "angle" || channel === "radius"
      ? [channel]
      : [];
  })));
  return channels.length
    ? { eligible: true, operation, targetArea, sharedChannels: channels }
    : { eligible: false, operation, targetArea, sharedChannels: [], reason: "SPATIAL_REFERENCE_MISMATCH" };
}
