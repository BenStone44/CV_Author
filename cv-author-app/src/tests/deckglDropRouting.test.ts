import { describe, expect, it } from "vitest";
import { isGraphLinkTemplateDrag } from "../utils/deckglDropRouting";

function transfer(candidateId: string) {
  return {
    getData: (format: string) => format === "application/x-svg-candidate" ? candidateId : "",
  };
}

describe("deck.gl drop routing", () => {
  it("passes every built-in Graph Link variant to the whole-map drop handler", () => {
    expect(isGraphLinkTemplateDrag(transfer("builtin-template:graph-link"))).toBe(true);
    expect(isGraphLinkTemplateDrag(transfer("builtin-template:graph-link-geographic"))).toBe(true);
  });

  it("keeps ordinary template drops available for point nesting", () => {
    expect(isGraphLinkTemplateDrag(transfer("builtin-template:pie"))).toBe(false);
  });

  it("uses the active drag metadata when browser payloads are hidden", () => {
    expect(isGraphLinkTemplateDrag(transfer(""), true)).toBe(true);
  });
});
