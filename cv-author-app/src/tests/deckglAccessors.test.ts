import { describe, expect, it } from "vitest";
import { resolveDeckglNumericAccessor } from "../utils/deckglAccessors";

describe("deck.gl accessors", () => {
  it("resolves both constant and callback numeric accessors", () => {
    expect(resolveDeckglNumericAccessor(12, {})).toBe(12);
    expect(resolveDeckglNumericAccessor(
      (datum: { radius: number }, info: { index: number }) => datum.radius + info.index,
      { radius: 7 },
      { index: 2 },
    )).toBe(9);
  });

  it("returns null for missing, invalid, or failing accessors", () => {
    expect(resolveDeckglNumericAccessor(undefined, {})).toBeNull();
    expect(resolveDeckglNumericAccessor("invalid", {})).toBeNull();
    expect(resolveDeckglNumericAccessor(() => { throw new Error("invalid accessor"); }, {})).toBeNull();
  });
});
