import { describe, expect, it } from "vitest";
import { useChartRelationshipStore } from "./useChartRelationshipStore";
import type { ChartRelationshipState } from "./types";

describe("Chart relationship snapshots", () => {
  it("migrates legacy None axes to CoordinateFree when restoring a project", () => {
    const store = useChartRelationshipStore();
    store.restore({
      version: 1,
      charts: {},
      markGroups: {},
      axes: {
        legacy: {
          id: "legacy",
          coordinateType: "None",
          channel: "x",
          config: { origin: { x: 0, y: 0 }, direction: 1, scale: 1, visible: false },
        },
      },
      axisBindings: {},
      compositions: {},
      nestedRelationships: {},
    } as unknown as ChartRelationshipState);

    expect(store.state.value.axes.legacy?.coordinateType).toBe("CoordinateFree");
  });

  it("clones reactive Nested parameters before a canvas command records history", () => {
    const store = useChartRelationshipStore();
    store.dispatch({ type: "clear" });
    store.dispatch({
      type: "register-chart",
      chart: {
        id: "parent",
        nodeId: "parent",
        chartType: "Scatterplot",
        datasetId: "dataset",
        instanceKind: "canvas",
      },
    });
    store.dispatch({
      type: "register-chart",
      chart: {
        id: "child",
        nodeId: null,
        chartType: "PieChart",
        datasetId: "dataset",
        instanceKind: "nested-child",
      },
    });
    store.dispatch({
      type: "begin-nested",
      relationship: {
        id: "nested",
        parentChartId: "parent",
        parentElementId: "point:1",
        childChartId: "child",
        relationType: "relative-position",
        parameters: store.defaultRelativeParameters(),
        resolverVersion: 1,
      },
    });

    const snapshot = store.snapshot();

    expect(snapshot.nestedRelationships.nested?.parameters).toEqual(store.defaultRelativeParameters());
    expect(snapshot.nestedRelationships.nested?.parameters).not.toBe(
      store.state.value.nestedRelationships.nested?.parameters,
    );
  });

  it("creates a Layer from any charts with the same shareable coordinate system", () => {
    const store = useChartRelationshipStore();
    store.dispatch({ type: "clear" });
    store.dispatch({
      type: "register-chart",
      chart: {
        id: "pie",
        nodeId: "pie",
        chartType: "PieChart",
        datasetId: "dataset",
        instanceKind: "canvas",
      },
    });
    store.dispatch({
      type: "register-chart",
      chart: {
        id: "donut",
        nodeId: "donut",
        chartType: "DonutChart",
        datasetId: "dataset",
        instanceKind: "canvas",
      },
    });

    store.dispatch({
      type: "create-composition",
      composition: {
        id: "polar-layer",
        type: "layer",
        memberChartIds: ["pie", "donut"],
        sharedChannels: ["angle", "radius"],
      },
    });

    expect(store.state.value.compositions["polar-layer"]).toMatchObject({
      type: "layer",
      memberChartIds: ["pie", "donut"],
      sharedChannels: ["angle", "radius"],
    });
    expect(store.relationshipIssues.value).toEqual([]);
  });
});
