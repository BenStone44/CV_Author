import type { NestedAppearanceDraft, NestedDecoration } from "../types";
import type { NestedCalloutChildFrame } from "./nestedCallout";
import { normalizeNestedCallout } from "./nestedCallout";

const finite = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
const color = (value: string | undefined, fallback: string) =>
  value === "none" || /^#[\da-f]{6}$/i.test(value ?? "") ? value! : fallback;

export function normalizeNestedDecorations(values: readonly NestedDecoration[] | undefined): NestedDecoration[] {
  const ids = new Set<string>();
  return (values ?? []).flatMap((value, index) => {
    if (!value || !["rounded-rect", "circle", "bubble"].includes(value.kind)) return [];
    let id = typeof value.id === "string" && /^[\w-]+$/.test(value.id) ? value.id : `decoration-${index}`;
    while (ids.has(id)) id += "-copy";
    ids.add(id);
    return [{
      id, kind: value.kind,
      x: finite(value.x, -0.1, -8, 8), y: finite(value.y, -0.1, -8, 8),
      width: finite(value.width, 1.2, 0.05, 8), height: finite(value.height, 1.2, 0.05, 8),
      fill: color(value.fill, "#ffffff"), stroke: color(value.stroke, "#64748b"),
      strokeWidth: finite(value.strokeWidth, 1.5, 0, 12),
      cornerRadius: finite(value.cornerRadius, 12, 0, 80), opacity: finite(value.opacity, 1, 0, 1),
    }];
  });
}

export function normalizeNestedAppearance(value: NestedAppearanceDraft): NestedAppearanceDraft {
  const anchor = (point: { x: number; y: number }) => ({
    x: finite(point.x, 0.5, 0, 1), y: finite(point.y, 0.5, 0, 1),
  });
  return {
    parentAnchor: anchor(value.parentAnchor), childAnchor: anchor(value.childAnchor),
    offset: { x: finite(value.offset.x, 0, -10000, 10000), y: finite(value.offset.y, 0, -10000, 10000) },
    scale: { x: finite(value.scale.x, 1, 0.001, 100), y: finite(value.scale.y, 1, 0.001, 100) },
    rotation: finite(value.rotation, 0, -360, 360), retainParent: value.retainParent,
    callout: normalizeNestedCallout(value.callout), decorations: normalizeNestedDecorations(value.decorations),
  };
}

export function nestedDecorationBounds(decoration: NestedDecoration, width: number, height: number) {
  const w = decoration.width * width;
  return {
    x: decoration.x * width, y: decoration.y * height,
    width: w, height: decoration.kind === "circle" ? w : decoration.height * height,
  };
}

/** Shared by the draft canvas, SVG editor/export, and map overlays. */
export function nestedDecorationMarkup(decoration: NestedDecoration, width: number, height: number) {
  const box = nestedDecorationBounds(decoration, width, height);
  const style = `fill="${decoration.fill}" stroke="${decoration.stroke}" stroke-width="${decoration.strokeWidth}" opacity="${decoration.opacity}" vector-effect="non-scaling-stroke"`;
  if (decoration.kind === "circle") {
    return `<circle cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}" r="${box.width / 2}" ${style}/>`;
  }
  const r = Math.min(decoration.cornerRadius, box.width / 2, box.height / 2);
  if (decoration.kind === "rounded-rect") {
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${r}" ${style}/>`;
  }
  const { x, y, width: w, height: h } = box;
  const tail = Math.min(w, h) * 0.2;
  const d = `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + w * 0.55} L ${x + w * 0.3} ${y + h + tail} L ${x + w * 0.35} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
  return `<path d="${d}" ${style}/>`;
}

export function nestedDecorationsMarkup(child: NestedCalloutChildFrame, decorations: readonly NestedDecoration[] | undefined) {
  const values = normalizeNestedDecorations(decorations);
  if (!values.length) return "";
  const width = Math.abs(child.width * child.scaleX);
  const height = Math.abs(child.height * child.scaleY);
  return `<g transform="translate(${child.x} ${child.y}) rotate(${child.rotation} ${width / 2} ${height / 2})">${values.map((value) => nestedDecorationMarkup(value, width, height)).join("")}</g>`;
}
