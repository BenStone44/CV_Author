import { configureShowcase } from "../_shared/configureCase.js";

const definition = {
  slug: "retweet-community-hexbin",
  data: { kind: "graph", nodes: "retweet_users.csv", links: "retweet_links.csv", name: "retweet-community" },
  blocks: [
    {
      id: "users", chartType: "Hexbin", name: "Retweet communities — one user per hex",
      frame: { x: 80, y: 90, width: 1260, height: 500 },
      chartSpec: {
        encodings: {
          x: { field: "x", type: "quantitative" }, y: { field: "y", type: "quantitative" },
          color: { field: "community", type: "nominal" }, shape: { field: "user_type", type: "nominal" },
        },
        markGroups: [{ id: "retweet-user-hexagons", chartId: "retweet-users", role: "hexagon", memberKeys: [],
          allowOverrides: true, sharedConfig: { radius: 13.5 } }],
        axes: { x: { visible: false, labelsVisible: false }, y: { visible: false, labelsVisible: false } },
      },
    },
    {
      id: "retweets", chartType: "GraphLink", name: "Retweet relationships",
      frame: { x: 1450, y: 90, width: 1260, height: 500 },
      chartSpec: {
        encodings: {
          source: { field: "source", type: "nominal" }, target: { field: "target", type: "nominal" },
          value: { field: "weight", type: "quantitative" }, color: { field: "relation_type", type: "nominal" },
          size: { field: "weight", type: "quantitative" },
        },
      },
    },
  ],
  compositions: [{ type: "layer", target: "users", source: "retweets", sharedChannels: ["x", "y"] }],
};

export async function configure(context, compose = true) {
  return configureShowcase(context, definition, compose);
}
