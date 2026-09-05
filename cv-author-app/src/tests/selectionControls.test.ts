import { describe, expect, it } from "vitest";
import { selectionActionPositionsAbove } from "../utils/selectionControls";

describe("selection structural controls", () => {
  it("places Config and Split above every selected chart at fixed screen offsets", () => {
    const frame = { x: 100, y: 80, width: 400, height: 300 };

    expect(selectionActionPositionsAbove(frame, 1)).toEqual({
      configure: { x: 273, y: 50 },
      split: { x: 327, y: 50 },
    });
    expect(selectionActionPositionsAbove(frame, 2)).toEqual({
      configure: { x: 286.5, y: 65 },
      split: { x: 313.5, y: 65 },
    });
  });

  it("stays above the visible bounds of a rotated chart", () => {
    expect(selectionActionPositionsAbove({
      x: 100,
      y: 80,
      width: 400,
      height: 300,
      rotation: 90,
    }, 1)).toEqual({
      configure: { x: 273, y: 0 },
      split: { x: 327, y: 0 },
    });
  });
});
