/** Sankey whose ribbon marks each host a source/target-filtered Word Cloud. */
export async function configure(context, compose = true) {
  const {
    MAX_ZOOM, MIN_ZOOM, applyNestedAppearance, axisBindingTarget, boundsFromNodeFrame,
    canvasNodes, canvasRef, chartDrilldown, chartRelationships, clamp,
    closeNestedPositionEditor, commitCompositionDrop, compositionDropZoneAtPoint,
    createCanvasItem, editingCompositionId, findCanvasNode, implementedTemplateDefinitions,
    mergeBounds, nestedDropPath, nextTick, openNestedPositionEditor,
    registerChartRelationship, renderChartNode, scheduleNestedChildLayout,
    setActiveDataset, setSelection, toSelectionScopePoint, useDatasetStore, viewPan, viewZoom,
  } = context;
  if (canvasNodes.value.length) return false;
  const base = "/site/gallery/cases/keyword-flow-sankey/data/";
  const read = async (name) => {
    const response = await fetch(base + name);
    if (!response.ok) throw new Error(`Case data unavailable: ${name}`);
    return new File([await response.text()], name, { type: "text/csv" });
  };
  const dataset = await useDatasetStore().importGraphDataset(
    await read("flow_keywords.csv"), await read("keyword_flows.csv"), "keyword-flow",
  );
  if (!dataset) throw new Error("Keyword flow graph import failed");
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
  const sankey = await create("Sankey", { x: 80, y: 80, width: 1320, height: 820 });
  sankey.name = "Sankey — decision language flows";
  sankey.chartSpec = {
    ...sankey.chartSpec, datasetId: dataset.id,
    encodings: {
      source: { field: "source", type: "nominal" }, target: { field: "target", type: "nominal" },
      value: { field: "value", type: "quantitative" }, color: { field: "topic", type: "nominal" },
    },
    markGroups: [{ id: `mark-group:${sankey.id}:link`, chartId: sankey.id, role: "link", memberKeys: [],
      allowOverrides: true, sharedConfig: { nodeAlign: "justify", linkColor: "source-target" } }],
    renderer: undefined, scales: undefined, plotArea: undefined,
  };
  renderChartNode(sankey);
  registerChartRelationship(sankey);

  const cloud = await create("WordCloud", { x: 1510, y: 340, width: 650, height: 190 });
  cloud.name = "Ribbon keywords";
  cloud.chartSpec = {
    ...cloud.chartSpec, datasetId: dataset.id,
    encodings: {
      x: { field: "word", type: "nominal" }, y: { field: "weight", type: "quantitative" },
      color: { field: "topic", type: "nominal" },
    },
    renderer: undefined, scales: undefined, plotArea: undefined,
  };
  renderChartNode(cloud);
  registerChartRelationship(cloud);
  if (!sankey.renderedContent || !cloud.renderedContent) throw new Error("Keyword flow blocks failed to render");
  await nextTick();

  if (compose) {
    chartDrilldown.value = { nodeId: sankey.id, level: "part" };
    await nextTick();
    const parentElement = canvasRef.value?.querySelector(`[data-node-id="${sankey.id}"]`);
    const mark = parentElement?.querySelector(`[data-chart-id="${sankey.id}"][data-mark-role="link"] path`);
    const rect = mark?.getBoundingClientRect();
    if (!rect) throw new Error("Sankey ribbon drop target unavailable");
    const point = toSelectionScopePoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const zone = compositionDropZoneAtPoint(point, cloud.id);
    if (zone?.type !== "nested" || zone.nestedTargets?.length !== 8 || !commitCompositionDrop(zone, cloud.id)) {
      throw new Error(`Unable to nest Word Clouds on all eight Sankey ribbons (${zone?.nestedTargets?.length ?? 0} targets)`);
    }
    const relationships = Object.values(chartRelationships.value.nestedRelationships)
      .filter((relationship) => relationship.parentChartId === sankey.id);
    for (const relationship of relationships) {
      const child = findCanvasNode(relationship.childChartId);
      if (!child?.chartSpec) continue;
      let identity = {};
      try { identity = JSON.parse(relationship.parentDataKey ?? "{}"); } catch { /* no-op */ }
      child.chartSpec = {
        ...child.chartSpec,
        filters: { ...(child.chartSpec.filters ?? {}), source: identity.source ?? "", target: identity.target ?? "" },
        renderer: undefined, scales: undefined, plotArea: undefined,
      };
      renderChartNode(child);
      registerChartRelationship(child);
    }
    await nextTick();
    const linkMarks = Array.from(parentElement.querySelectorAll('[data-mark-role="link"]'));
    const anchorFractions = {
      "Evaluate→Adopt": 0.66,
      "Evaluate→Reject": 0.28,
      "Discuss→Adopt": 0.72,
    };
    const appearanceByRelationship = new Map();
    for (const relationship of relationships) {
      let identity = {};
      try { identity = JSON.parse(relationship.parentDataKey ?? "{}"); } catch { /* no-op */ }
      const linkMark = linkMarks.find((candidate) => candidate.getAttribute("data-source") === identity.source
        && candidate.getAttribute("data-target") === identity.target);
      const path = linkMark?.querySelector("path");
      const pathBounds = path?.getBBox();
      const strokeWidth = Number(path?.getAttribute("stroke-width") ?? 0);
      const identityKey = `${identity.source ?? ""}→${identity.target ?? ""}`;
      const pathFraction = anchorFractions[identityKey] ?? 0.5;
      const point = path && path.getTotalLength ? path.getPointAtLength(path.getTotalLength() * pathFraction) : null;
      const offset = pathBounds && point ? {
        x: point.x - (pathBounds.x + pathBounds.width / 2),
        y: point.y - (pathBounds.y + pathBounds.height / 2),
      } : { x: 0, y: 0 };
      if (identityKey === "Reconsider→Reject") offset.y -= 10;
      const scaleX = Math.max(0.55, Math.min(0.78, ((pathBounds?.width ?? 360) * 0.52) / cloud.width));
      const scaleY = Math.max(0.48, Math.min(1.05, (strokeWidth * 0.72) / cloud.height));
      const appearance = {
        parentAnchor: { x: 0.5, y: 0.5 }, childAnchor: { x: 0.5, y: 0.5 },
        offset, scale: { x: scaleX, y: scaleY }, rotation: 0,
        retainParent: true, callout: { enabled: false, scale: 1 }, decorations: [],
      };
      appearanceByRelationship.set(relationship.id, appearance);
      openNestedPositionEditor([relationship.id]);
      applyNestedAppearance(appearance);
      await nextTick();
    }
    appearanceByRelationship.forEach((appearance, relationshipId) => {
      const relationship = chartRelationships.value.nestedRelationships[relationshipId];
      if (relationship) relationship.parameters = { ...relationship.parameters, ...appearance };
    });
    editingCompositionId.value = null;
    closeNestedPositionEditor();
    scheduleNestedChildLayout();
    await nextTick();
    await nextTick();
    const undersizedCloud = Array.from(canvasRef.value?.querySelectorAll('[data-chart-type="word-cloud"]') ?? [])
      .map((element) => element.closest("[data-node-id]")?.getAttribute("data-node-id"))
      .map((nodeId) => nodeId ? findCanvasNode(nodeId) : null)
      .find((node) => node?.chartSpec?.chartType === "WordCloud" && node.scaleX < 0.3);
    if (undersizedCloud) {
      const center = {
        x: undersizedCloud.x + undersizedCloud.width * undersizedCloud.scaleX / 2,
        y: undersizedCloud.y + undersizedCloud.height * undersizedCloud.scaleY / 2,
      };
      Object.assign(undersizedCloud, {
        x: center.x - undersizedCloud.width * 0.68 / 2,
        y: center.y - undersizedCloud.height * 1.05 / 2,
        scaleX: 0.68,
        scaleY: 1.05,
      });
    }
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
