import type { SvgCandidate } from "../types";

// Core templates already provide SVGs rendered from built-in data.
const thumbnailHashes: Record<string, string> = {
  ParallelCoordinatesPlot: "137c531fbab68c35e4713548f23b720c511234954380d23d9396c48a83e03d2d",
  Calendar: "d008c0aeb2e945aef84b41961dd335bf81d9e01aed81b0f3c14ee782683ebbe9",
  Boxplot: "bd4c5d003300d7c20d0a3af1055085deb043bbd2505c20acc1f95332f0591164",
  Contour: "500cadff2bd8b83135b5189668297c7f1c179900347911330660b2b83e9e9c39",
  Hexbin: "7c9f5bd32119c0575b9db52adc8f859c07891367f29ed5f463ad878602af67cf",
  Icicle: "6800ea153fbc5efdde82ed342b0ce8abfc6a7ebbb70b60944a084c790b6fea42",
  Sunburst: "5d33e22bc8da09a4495d5bfe0ff207610f2249dc33cbb98505058a4960e8d668",
  Treemap: "278516556172557a945111e81e0996b1e461364bc1402c57e412a33597d2f014",
  Dendrogram: "87ade408aa70f0875bf4b158dd986350d931884d5b6717cd7fc9b5d2680904c8",
  Chord: "204ffe6e4ebe39ce037c2caa5ac3c22bd630ea6dea19989833afa4d9c7531445",
  Sankey: "3074afcf13f0dfa574415acc4e293ba58d6da310e2f1a6d68aff493b9607ba1b",
};

export function d3GalleryThumbnailUrl(chartType: string) {
  const hash = thumbnailHashes[chartType];
  return hash ? `https://static.observableusercontent.com/thumbnail/${hash}.jpg` : null;
}

export function d3GalleryPlaceholderSvg(chartType: string) {
  const src = d3GalleryThumbnailUrl(chartType);
  if (!src) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><image href="${src}" x="0" y="0" width="320" height="200" preserveAspectRatio="xMidYMid slice"/></svg>`;
}

export function withD3GalleryThumbnail(candidate: SvgCandidate): SvgCandidate {
  // Data-backed previews are the source of truth for built-in templates. Do
  // not replace them with a remote image, otherwise the preview and the first
  // canvas render show different data and the SVG is no longer inspectable.
  if (candidate.svgMarkup?.includes("data-default-dataset-id=")) return candidate;
  const src = d3GalleryThumbnailUrl(candidate.chartType);
  const svgMarkup = d3GalleryPlaceholderSvg(candidate.chartType);
  return src && svgMarkup ? { ...candidate, src, svgMarkup } : candidate;
}
