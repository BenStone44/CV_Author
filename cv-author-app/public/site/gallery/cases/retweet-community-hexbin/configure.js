import { configureShowcase } from "../_shared/configureCase.js";

const definition = {
  slug: "retweet-community-hexbin",
  data: { kind: "graph", nodes: "retweet_users.csv", links: "retweet_links.csv", name: "retweet-community" },
  blocks: [
    {
      id: "users", chartType: "Hexbin", name: "Retweet communities — one user per hex",
      frame: { x: 80, y: 90, width: 1180, height: 510 },
      chartSpec: {
        encodings: {
          x: { field: "x", type: "quantitative" }, y: { field: "y", type: "quantitative" },
          color: { field: "community", type: "nominal" }, shape: { field: "user_type", type: "nominal" },
        },
        markGroups: [{ id: "retweet-user-hexagons", chartId: "retweet-users", role: "hexagon", memberKeys: [],
          allowOverrides: true, sharedConfig: { radius: 8 } }],
        axes: { x: { visible: false, labelsVisible: false }, y: { visible: false, labelsVisible: false } },
      },
    },
    {
      id: "retweets", chartType: "GraphLink", name: "Retweet relationships",
      frame: { x: 1380, y: 90, width: 1180, height: 510 },
      chartSpec: {
        encodings: {
          source: { field: "source", type: "nominal" }, target: { field: "target", type: "nominal" },
          value: { field: "weight", type: "quantitative" }, color: { field: "relation_type", type: "nominal" },
          size: { field: "weight", type: "quantitative" },
        },
        markGroups: [{ id: "retweet-arcs", chartId: "retweet-links", role: "link", memberKeys: [],
          allowOverrides: true, sharedConfig: { curve: "arc" } }],
      },
    },
  ],
  compositions: [{ type: "layer", target: "users", source: "retweets", sharedChannels: ["x", "y"] }],
};

export async function configure(context, compose = true) {
  const loaded = await configureShowcase(context, definition, compose);
  if (loaded && compose) {
    const root = context.canvasNodes.value[0];
    if (root?.kind === "group" && root.compositionSpec?.type === "layer") {
      Object.assign(root, { x: 80, y: 90, width: 1180, height: 510, scaleX: 1, scaleY: 1 });
    }
    const viewport = context.canvasRef.value?.getBoundingClientRect();
    context.viewZoom.value = 1;
    if (viewport) context.viewPan.value = {
      x: (viewport.width - 1180) / 2 - 80,
      y: (viewport.height - 510) / 2 - 90,
    };
    await context.nextTick();
    await context.nextTick();
  }
  return loaded;
}
