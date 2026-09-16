/** Parallel Coordinates with Box Plot and Line Chart blocks nested on every axis. */
export async function configure(context, compose = true) {
  const {
    MAX_ZOOM, MIN_ZOOM, applyNestedAppearance, axisBindingTarget, boundsFromNodeFrame,
    canvasNodes, canvasRef, chartDrilldown, chartRelationships, clamp,
    closeNestedPositionEditor, commitCompositionDrop, compositionDropZoneAtPoint,
    createCanvasItem, editingCompositionId, enterNestedDropLevel, findCanvasNode,
    implementedTemplateDefinitions, mergeBounds, nestedDropPath, nextTick,
    nodeLocalToSelectionScopePoint, openNestedPositionEditor, registerChartRelationship,
    renderChartNode, scheduleNestedChildLayout, setActiveDataset, setSelection,
    toSelectionScopePoint, useDatasetStore, viewPan, viewZoom,
  } = context;
  if (canvasNodes.value.length) return false;
  const response = await fetch("/site/gallery/cases/axis-distribution-profiles/data/multivariate_profiles.csv");
  if (!response.ok) throw new Error("Multivariate profile CSV unavailable");
  const dataset = await useDatasetStore().importDataset(new File(
    [await response.text()], "multivariate_profiles.csv", { type: "text/csv" },
  ));
  if (!dataset) throw new Error("Multivariate profile import failed");
  setActiveDataset(dataset.id);

  const create = async (chartType, frame) => {
    const candidate = implementedTemplateDefinitions.find((item) => item.chartType === chartType);
    if (!candidate) throw new Error(`Missing block: ${chartType}`);
    const created = (await createCanvasItem(candidate, { x: frame.x, y: frame.y }, false, dataset.id))?.[0];
    const node = created ? findCanvasNode(created.id) : null;
    if (!node?.chartSpec) throw new Error(`Unable to create ${chartType}`);
    Object.assign(node, frame, { scaleX: 1, scaleY: 1 });
    return node;
  };
  const fields = ["efficiency", "quality", "adoption", "resilience", "satisfaction"];
  const parallel = await create("ParallelCoordinatesPlot", { x: 90, y: 250, width: 1220, height: 650 });
  parallel.name = "Parallel Coordinates — service portfolio";
  parallel.chartSpec = {
    ...parallel.chartSpec,
    datasetId: dataset.id,
    encodings: { color: { field: "segment", type: "nominal" } },
    parallelFields: fields.map((field) => ({ field, type: "quantitative" })),
    renderer: undefined, scales: undefined, plotArea: undefined,
  };
  renderChartNode(parallel);
  registerChartRelationship(parallel);

  const box = await create("SingleBoxplot", { x: 1450, y: 380, width: 260, height: 220 });
  box.name = "Axis distributions";
  box.chartSpec = {
    ...box.chartSpec,
    datasetId: dataset.id,
    encodings: { y: { field: fields[0], type: "quantitative" }, color: { field: "segment", type: "nominal" } },
    axes: { x: { visible: false, labelsVisible: false }, y: { visible: false, labelsVisible: false } },
    renderer: undefined, scales: undefined, plotArea: undefined,
  };
  renderChartNode(box);
  registerChartRelationship(box);

  const line = await create("LineGraph", { x: 1450, y: 90, width: 280, height: 180 });
  line.name = "Axis observation profiles";
  line.chartSpec = {
    ...line.chartSpec,
    datasetId: dataset.id,
    encodings: { x: { field: "sample_index", type: "quantitative" }, y: { field: fields[0], type: "quantitative" } },
    axes: { x: { visible: false, labelsVisible: false }, y: { visible: false, labelsVisible: false } },
    renderer: undefined, scales: undefined, plotArea: undefined,
  };
  renderChartNode(line);
  registerChartRelationship(line);
  if (!parallel.renderedContent || !box.renderedContent || !line.renderedContent) {
    throw new Error("Axis profile blocks failed to render");
  }
  await nextTick();

  const relationshipBatch = (sourceId) => Object.values(chartRelationships.value.nestedRelationships)
    .filter((relationship) => relationship.parentChartId === parallel.id
      && relationship.parameters?.sourceChildId === sourceId);
  const fieldForRelationship = (relationship) => {
    try {
      const index = JSON.parse(relationship.parentDataKey ?? "{}").fallbackIndex ?? 0;
      return fields[index] ?? fields[0];
    } catch {
      return fields[0];
    }
  };
  const nestOnAxes = async (source, appearance) => {
    if (chartDrilldown.value?.nodeId !== parallel.id || chartDrilldown.value.level !== "part") {
      const plot = parallel.chartSpec.plotArea;
      const enterPoint = nodeLocalToSelectionScopePoint(parallel, {
        x: plot.x + plot.width / 2, y: plot.y + plot.height / 2,
      });
      const enterZone = compositionDropZoneAtPoint(enterPoint, source.id);
      if (!enterZone || !enterNestedDropLevel(enterZone)) throw new Error("Unable to enter Parallel axis level");
      await nextTick();
    }
    const parentElement = canvasRef.value?.querySelector(`[data-node-id="${parallel.id}"]`);
    const mark = parentElement?.querySelector('[data-mark-role="parallel-axis"] line');
    const rect = mark?.getBoundingClientRect();
    if (!rect) throw new Error("Parallel axis drop target unavailable");
    const point = toSelectionScopePoint(rect.left + rect.width / 2, rect.top + rect.height * 0.9);
    const detectedZone = compositionDropZoneAtPoint(point, source.id);
    const axisTargets = Array.from(parentElement.querySelectorAll('[data-mark-role="parallel-axis"]'))
      .slice(0, fields.length)
      .map((element, index) => {
        const axisRect = element.getBoundingClientRect();
        const topLeft = toSelectionScopePoint(axisRect.left, axisRect.top);
        const bottomRight = toSelectionScopePoint(axisRect.right, axisRect.bottom);
        const dataKey = JSON.stringify({ role: "parallel-axis", fallbackIndex: index });
        return {
          elementId: `mark:${parallel.id}:${encodeURIComponent(dataKey)}`,
          dataKey,
          bounds: { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y,
            width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y },
        };
      });
    const firstTarget = axisTargets[0];
    const zone = detectedZone?.type === "nested" && firstTarget ? { ...detectedZone,
      nestedTargets: axisTargets, bounds: firstTarget.bounds, targetDataKey: firstTarget.dataKey,
      targetElementId: firstTarget.elementId } : detectedZone;
    const committed = zone?.type === "nested" && zone.nestedTargets?.length === fields.length
      ? commitCompositionDrop(zone, source.id)
      : false;
    if (!committed) throw new Error(`Unable to nest ${source.name} on all ${fields.length} axes; zone=${zone?.type ?? "none"}; targets=${zone?.nestedTargets?.length ?? 0}; compatible=${zone?.compatible ?? false}`);
    const relationships = relationshipBatch(source.id);
    relationships.forEach((relationship) => {
      const child = findCanvasNode(relationship.childChartId);
      if (!child?.chartSpec) return;
      child.chartSpec = {
        ...child.chartSpec,
        encodings: { ...child.chartSpec.encodings, y: { field: fieldForRelationship(relationship), type: "quantitative" } },
        renderer: undefined, scales: undefined, plotArea: undefined,
      };
      renderChartNode(child);
      registerChartRelationship(child);
    });
    openNestedPositionEditor(relationships.map((relationship) => relationship.id));
    applyNestedAppearance(appearance);
    editingCompositionId.value = null;
    await nextTick();
  };

  if (compose) {
    await nestOnAxes(box, {
      parentAnchor: { x: 0.5, y: 0.52 }, childAnchor: { x: 0.5, y: 0.5 },
      offset: { x: 0, y: 18 }, scale: { x: 0.48, y: 0.48 }, rotation: 0,
      retainParent: true, callout: { enabled: false, scale: 1 },
      decorations: [{ id: "box-frame", kind: "rounded-rect", x: -0.06, y: -0.08, width: 1.12, height: 1.16,
        fill: "#ffffff", stroke: "#94a3b8", strokeWidth: 1.2, cornerRadius: 14, opacity: 0.88 }],
    });
    await nestOnAxes(line, {
      parentAnchor: { x: 0.5, y: 0 }, childAnchor: { x: 0.5, y: 1 },
      offset: { x: 0, y: -20 }, scale: { x: 0.5, y: 0.5 }, rotation: 0,
      retainParent: true, callout: { enabled: false, scale: 1 },
      decorations: [{ id: "line-frame", kind: "rounded-rect", x: -0.05, y: -0.08, width: 1.1, height: 1.16,
        fill: "#f8fafc", stroke: "#64748b", strokeWidth: 1.1, cornerRadius: 12, opacity: 0.94 }],
    });
    closeNestedPositionEditor();
    scheduleNestedChildLayout();
    await nextTick();
    await nextTick();
  }
  setSelection([]);
  chartDrilldown.value = null;
  nestedDropPath.value = [];
  axisBindingTarget.value = null;
  const bounds = canvasNodes.value.reduce((current, node) => mergeBounds(current,
    boundsFromNodeFrame(node.x, node.y, node.width, node.height, node.scaleX, node.scaleY, node.rotation)), null);
  const viewport = canvasRef.value?.getBoundingClientRect();
  if (bounds && viewport) {
    const zoom = clamp(Math.min((viewport.width - 80) / bounds.width, (viewport.height - 80) / bounds.height), MIN_ZOOM, MAX_ZOOM);
    viewZoom.value = zoom;
    viewPan.value = { x: (viewport.width - bounds.width * zoom) / 2 - bounds.minX * zoom,
      y: (viewport.height - bounds.height * zoom) / 2 - bounds.minY * zoom };
  }
  return true;
}
