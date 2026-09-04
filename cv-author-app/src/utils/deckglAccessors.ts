export type DeckglAccessorContext = {
  index?: number;
  layer?: {
    props?: { data?: unknown };
  };
};

/** Resolve a deck.gl accessor, whose public value may be a callback or a constant. */
export function resolveDeckglNumericAccessor(
  accessor: unknown,
  datum: unknown,
  context: DeckglAccessorContext = {},
): number | null {
  try {
    const value = typeof accessor === "function"
      ? accessor(datum, {
        index: context.index ?? -1,
        data: context.layer?.props?.data,
        target: context.layer,
      })
      : accessor;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  catch {
    return null;
  }
}
