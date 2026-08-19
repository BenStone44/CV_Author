import { describe, expect, it } from "vitest";
import { d3GalleryPlaceholderSvg, d3GalleryThumbnailUrl, withD3GalleryThumbnail } from "../utils/d3GalleryThumbnails";

describe("D3 Gallery thumbnails", () => {
  it("maps implemented templates to immutable Observable thumbnails", () => {
    const url = d3GalleryThumbnailUrl("AreaChart");
    expect(url).toBe("https://static.observableusercontent.com/thumbnail/621c926e03757f3473aa2d0257e7eb0666ee01b22c73a658ce7357fea1d91afe.jpg");
    expect(d3GalleryPlaceholderSvg("AreaChart")).toContain(`<image href="${url}"`);
    expect(d3GalleryThumbnailUrl("MultiLineChart")).toBe("https://static.observableusercontent.com/thumbnail/b0d4966110427b06bfdf7a84396cce6267e52cabf0805ba466618f2758cb56b5.jpg");
  });

  it("uses the same image for the card and unbound canvas placeholder", () => {
    const candidate = withD3GalleryThumbnail({
      id: "area",
      name: "Area Chart",
      chartType: "AreaChart",
      coordinateSystem: "Cartesian",
      src: "old-preview",
      svgMarkup: "<svg/>",
    });
    expect(candidate.src).toContain("static.observableusercontent.com/thumbnail/");
    expect(candidate.svgMarkup).toContain(candidate.src);
    expect(candidate.svgMarkup).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("leaves unknown templates unchanged", () => {
    const candidate = { id: "future", name: "Future", chartType: "Future", coordinateSystem: "CoordinateFree" as const, src: "preview" };
    expect(withD3GalleryThumbnail(candidate)).toBe(candidate);
  });
});
