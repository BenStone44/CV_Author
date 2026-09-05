import type { Point } from "../types";

export type SelectionControlFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

/** Fixed-screen Config/Split positions centered above any selected unit. */
export function selectionActionPositionsAbove(
  frame: SelectionControlFrame,
  viewZoom: number,
): { configure: Point; split: Point } {
  const zoom = Math.max(Math.abs(viewZoom), 0.0001);
  const centerX = frame.x + frame.width / 2;
  const radians = ((frame.rotation ?? 0) * Math.PI) / 180;
  const rotatedHeight = Math.abs(frame.width * Math.sin(radians))
    + Math.abs(frame.height * Math.cos(radians));
  const centerY = frame.y + frame.height / 2;
  const y = centerY - rotatedHeight / 2 - 30 / zoom;
  return {
    configure: { x: centerX - 27 / zoom, y },
    split: { x: centerX + 27 / zoom, y },
  };
}
