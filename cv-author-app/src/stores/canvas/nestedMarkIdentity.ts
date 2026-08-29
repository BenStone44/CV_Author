type NestedMarkIdentity = {
  rowKey?: string;
  categoryKey?: string;
  seriesKey?: string;
  rowValue?: string;
  columnValue?: string;
  role?: string;
  fallbackIndex?: number;
};

export function nestedItemDataKey(element: Element, fallbackIndex: number, categoryOnly = false) {
  const identity: NestedMarkIdentity = {
    rowKey: categoryOnly ? undefined : element.getAttribute("data-row-key") ?? undefined,
    categoryKey: element.getAttribute("data-category-key") ?? undefined,
    seriesKey: categoryOnly ? undefined : element.getAttribute("data-series-key") ?? undefined,
    rowValue: element.getAttribute("data-row-value") ?? undefined,
    columnValue: element.getAttribute("data-column-value") ?? undefined,
    role: element.getAttribute("data-mark-role") ?? undefined,
  };
  if (!identity.rowKey && !identity.categoryKey && !identity.seriesKey && !identity.rowValue && !identity.columnValue) {
    identity.fallbackIndex = fallbackIndex;
  }
  return JSON.stringify(identity);
}

export function markMatchesNestedDataKey(element: Element, dataKey: string, fallbackIndex: number) {
  try {
    const identity = JSON.parse(dataKey) as NestedMarkIdentity;
    return (identity.rowKey === undefined || element.getAttribute("data-row-key") === identity.rowKey)
      && (identity.categoryKey === undefined || element.getAttribute("data-category-key") === identity.categoryKey)
      && (identity.seriesKey === undefined || element.getAttribute("data-series-key") === identity.seriesKey)
      && (identity.rowValue === undefined || element.getAttribute("data-row-value") === identity.rowValue)
      && (identity.columnValue === undefined || element.getAttribute("data-column-value") === identity.columnValue)
      && (identity.role === undefined || element.getAttribute("data-mark-role") === identity.role)
      && (identity.fallbackIndex === undefined || fallbackIndex === identity.fallbackIndex);
  } catch {
    return [
      element.getAttribute("data-row-key"),
      element.getAttribute("data-category-key"),
      element.getAttribute("data-series-key"),
    ].includes(dataKey);
  }
}
