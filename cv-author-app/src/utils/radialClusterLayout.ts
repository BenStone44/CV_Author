import { cluster, stratify, type HierarchyNode } from "d3";
import type { Dataset } from "../types";

export type RadialClusterNode = HierarchyNode<Dataset["rows"][number]> & {
  x: number;
  y: number;
};

type RadialClusterLayoutOptions = {
  keyField: string;
  parentField: string;
  orderField: string;
  startAngle: number;
  angleSpan: number;
  innerRadius: number;
  outerRadius: number;
};

export function createRadialClusterLayout(
  dataset: Dataset,
  options: RadialClusterLayoutOptions,
) {
  const rows = dataset.rows.filter((row) => (row[options.keyField] ?? "").trim());
  const ids = new Set(rows.map((row) => row[options.keyField] ?? ""));
  const roots = rows.filter((row) => !ids.has(row[options.parentField] ?? ""));
  const synthetic = roots.length !== 1;
  const normalized = synthetic ? [
    { [options.keyField]: "__root__", [options.parentField]: "" },
    ...rows.map((row) => roots.includes(row) ? { ...row, [options.parentField]: "__root__" } : row),
  ] : rows;
  const hierarchy = stratify<Dataset["rows"][number]>()
    .id((row) => row[options.keyField] ?? "")
    .parentId((row) => row[options.parentField] || null)(normalized)
    .sort((left, right) => {
      const leftName = left.data[options.orderField] || left.id || "";
      const rightName = right.data[options.orderField] || right.id || "";
      return leftName.localeCompare(rightName, "en", { numeric: true });
    });
  const radiusSpan = Math.max(0, options.outerRadius - options.innerRadius);
  const layout = cluster<Dataset["rows"][number]>()
    .size([options.angleSpan, radiusSpan])
    .separation((left, right) => (left.parent === right.parent ? 1 : 2) / Math.max(left.depth, 1));
  const root = layout(hierarchy) as RadialClusterNode;
  root.each((node) => {
    const radialNode = node as RadialClusterNode;
    radialNode.x += options.startAngle;
    radialNode.y += options.innerRadius;
  });
  const visible = (node: { id?: string }) => !(synthetic && node.id === "__root__");
  return { root, synthetic, visible };
}
