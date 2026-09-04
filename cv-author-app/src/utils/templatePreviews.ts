import type { SvgCandidate } from "../types";

export const TEMPLATE_PREVIEW_WIDTH = 320;
export const TEMPLATE_PREVIEW_HEIGHT = 180;

function svgViewBox(markup: string) {
  const match = markup.match(/<svg\b[^>]*\bviewBox=(['"])([^'"]+)\1/i);
  return match?.[2] ?? `0 0 ${TEMPLATE_PREVIEW_WIDTH} ${TEMPLATE_PREVIEW_HEIGHT}`;
}

function svgBody(markup: string) {
  return markup
    .replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");
}

/** Give every catalog SVG the same static 16:9 viewport without changing its canvas template. */
export function withUniformTemplatePreview(candidate: SvgCandidate): SvgCandidate {
  if (candidate.coordinateSystem === "Geographic" || !candidate.svgMarkup) return candidate;
  const previewMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_PREVIEW_WIDTH}" height="${TEMPLATE_PREVIEW_HEIGHT}" viewBox="0 0 ${TEMPLATE_PREVIEW_WIDTH} ${TEMPLATE_PREVIEW_HEIGHT}"><rect width="100%" height="100%" fill="#fefae0"/><svg width="${TEMPLATE_PREVIEW_WIDTH}" height="${TEMPLATE_PREVIEW_HEIGHT}" viewBox="${svgViewBox(candidate.svgMarkup)}" preserveAspectRatio="xMidYMid meet">${svgBody(candidate.svgMarkup)}</svg></svg>`;
  return {
    ...candidate,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewMarkup)}`,
  };
}
