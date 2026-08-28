import { describe, expect, it } from "vitest";
import { d3GalleryPlaceholderSvg, d3GalleryThumbnailUrl, withD3GalleryThumbnail } from "../utils/d3GalleryThumbnails";

describe("D3 Gallery thumbnails", () => {
  it("maps remaining gallery templates to immutable Observable thumbnails", () => {
    const url = d3GalleryThumbnailUrl("Calendar");
    expect(url).toBe("https://static.observableusercontent.com/thumbnail/d008c0aeb2e945aef84b41961dd335bf81d9e01aed81b0f3c14ee782683ebbe9.jpg");
    expect(d3GalleryPlaceholderSvg("Calendar")).toContain(`<image href="${url}"`);
  });

  it("preserves native SVG templates for core chart families", () => {
    const candidate = withD3GalleryThumbnail({
      id: "area",
      name: "Area Chart",
      chartType: "AreaChart",
      coordinateSystem: "Cartesian",
      src: "data:image/svg+xml,area",
      svgMarkup: "<svg><path/></svg>",
    });
    expect(d3GalleryThumbnailUrl("AreaChart")).toBeNull();
    expect(d3GalleryThumbnailUrl("MultiLineChart")).toBeNull();
    expect(candidate.src).toBe("data:image/svg+xml,area");
    expect(candidate.svgMarkup).toBe("<svg><path/></svg>");
  });

  it("leaves unknown templates unchanged", () => {
    const candidate = { id: "future", name: "Future", chartType: "Future", coordinateSystem: "CoordinateFree" as const, src: "preview" };
    expect(withD3GalleryThumbnail(candidate)).toBe(candidate);
  });

  it("preserves the local rect-grid SVG for Matrix", () => {
    const candidate = {
      id: "matrix",
      name: "Matrix",
      chartType: "MatrixDiagram",
      coordinateSystem: "Cartesian" as const,
      src: "data:image/svg+xml,matrix-grid",
      svgMarkup: "<svg><rect/></svg>",
    };
    expect(d3GalleryThumbnailUrl("MatrixDiagram")).toBeNull();
    expect(withD3GalleryThumbnail(candidate)).toBe(candidate);
  });
});
