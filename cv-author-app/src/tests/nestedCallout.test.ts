import { describe, expect, it } from "vitest";
import type { RelativeNestedParameters } from "../types";
import { nestedCalloutGeometry, normalizeNestedCallout } from "../utils/nestedCallout";

const parameters: RelativeNestedParameters = {
  parentAnchor: { x: 0.5, y: 0.5 },
  childAnchor: { x: 0.5, y: 0.5 },
  offset: { x: 80, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  callout: { enabled: true, scale: 1.5 },
};

describe("nested message frame geometry", () => {
  it("centers the scalable rectangle around the child and points to the parent anchor", () => {
    const geometry = nestedCalloutGeometry({
      x: 100,
      y: 100,
      width: 80,
      height: 40,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }, parameters)!;

    expect(geometry.frame).toMatchObject({
      x: 80,
      y: 90,
      width: 120,
      height: 60,
      center: { x: 140, y: 120 },
    });
    expect(geometry.parentAnchor).toEqual({ x: 60, y: 120 });
    expect(geometry.arrowPath).toContain("L 60 120 L");
  });

  it("keeps legacy relationships disabled and clamps frame scale", () => {
    expect(normalizeNestedCallout(undefined)).toEqual({ enabled: false, scale: 1.2 });
    expect(normalizeNestedCallout({ enabled: true, scale: 20 })).toEqual({ enabled: true, scale: 3 });
  });
});
