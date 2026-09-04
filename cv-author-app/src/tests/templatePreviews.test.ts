import { describe, expect, it } from "vitest";
import {
  deckglLightMapStyleUrl,
  geographicLayerDefinitions,
  geographicLayerTypes,
} from "../utils/geographicLayerCards";
import { withUniformTemplatePreview } from "../utils/templatePreviews";

describe("template catalog previews", () => {
  it("wraps SVG previews in one static 320 by 180 viewport", () => {
    const candidate = withUniformTemplatePreview({
      id: "square",
      name: "Square",
      chartType: "Square",
      coordinateSystem: "CoordinateFree",
      src: "old-preview",
      svgMarkup: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><circle cx="450" cy="450" r="400"/></svg>',
    });
    const previewMarkup = decodeURIComponent(candidate.src.split(",", 2)[1] ?? "");

    expect(previewMarkup).toContain('width="320" height="180" viewBox="0 0 320 180"');
    expect(previewMarkup).toContain('viewBox="0 0 900 900" preserveAspectRatio="xMidYMid meet"');
    expect(previewMarkup).toContain("<circle");
    expect(candidate.svgMarkup).toContain('viewBox="0 0 900 900"');
  });

  it("keeps geographic screenshot assets unchanged", () => {
    const candidate = {
      id: "map",
      name: "Map",
      chartType: "ScatterplotLayer",
      coordinateSystem: "Geographic" as const,
      src: "/deckgl-examples/scatterplot-layer.png",
      svgMarkup: '<svg viewBox="0 0 320 180"/>',
    };

    expect(withUniformTemplatePreview(candidate)).toBe(candidate);
  });

  it("uses one local PNG screenshot per Deck.gl template", () => {
    const sources = geographicLayerDefinitions.map((candidate) => candidate.src);

    expect(geographicLayerDefinitions).toHaveLength(geographicLayerTypes.length);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.every((source) => /^\/deckgl-examples\/[a-z0-9-]+\.png\?v=\d{8}-\d+$/.test(source))).toBe(true);
    expect(geographicLayerDefinitions.every((candidate) => candidate.mapStyleUrl === deckglLightMapStyleUrl)).toBe(true);
  });
});
