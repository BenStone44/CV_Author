import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIRECTORY = path.resolve("../data");
const NODE_COUNT = 72;
const CORE_NODE_COUNT = 48;
const GRID_SIZE = 20;
const SEED = 0x5eedc0de;
const communities = ["Community A", "Community B", "Community C"];
const componentFields = ["channel_a", "channel_b", "channel_c", "channel_d", "channel_e"];

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = seededRandom(SEED);
const randomBetween = (minimum, maximum) => minimum + random() * (maximum - minimum);
const integerBetween = (minimum, maximum) => Math.floor(randomBetween(minimum, maximum + 1));
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value, digits = 4) => Number(value.toFixed(digits));

function splitWeight(weight) {
  const raw = componentFields.map(() => 0.25 + random() * 1.75);
  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  const parts = raw.map((value) => round(weight * value / rawTotal, 2));
  parts[parts.length - 1] = round(weight - parts.slice(0, -1).reduce((sum, value) => sum + value, 0), 2);
  return Object.fromEntries(componentFields.map((field, index) => [field, parts[index]]));
}

const anchors = [
  { x: 400, y: 410 },
  { x: 600, y: 425 },
  { x: 500, y: 610 },
];

const nodes = Array.from({ length: NODE_COUNT }, (_, index) => {
  const communityIndex = index < CORE_NODE_COUNT ? index % communities.length : integerBetween(0, communities.length - 1);
  const community = communities[communityIndex];
  const scattered = index >= CORE_NODE_COUNT;
  const anchor = anchors[communityIndex];
  const weight = scattered ? integerBetween(18, 82) : integerBetween(35, 125);
  const scatteredAngle = scattered ? randomBetween(-Math.PI, Math.PI) : 0;
  const scatteredRadius = scattered ? randomBetween(300, 440) : 0;
  const position = scattered
    ? {
      x: 500 + Math.cos(scatteredAngle) * scatteredRadius,
      y: 500 + Math.sin(scatteredAngle) * scatteredRadius,
    }
    : {
      x: anchor.x + randomBetween(-130, 130),
      y: anchor.y + randomBetween(-130, 130),
    };
  const components = splitWeight(weight);
  const dominantComponent = componentFields.reduce((best, field) =>
    components[field] > components[best] ? field : best, componentFields[0]);
  return {
    id: `N${String(index + 1).padStart(3, "0")}`,
    label: `Node ${String(index + 1).padStart(3, "0")}`,
    community,
    density: scattered ? "scattered" : "core",
    weight,
    ...components,
    dominant_component: dominantComponent,
    x: position.x,
    y: position.y,
    anchor_x: position.x,
    anchor_y: position.y,
  };
});

const edgesByKey = new Map();
function addEdge(sourceIndex, targetIndex, kind) {
  if (sourceIndex === targetIndex) return;
  const low = Math.min(sourceIndex, targetIndex);
  const high = Math.max(sourceIndex, targetIndex);
  const key = `${low}:${high}`;
  if (edgesByKey.has(key)) return;
  const source = nodes[low];
  const target = nodes[high];
  const crossCommunity = source.community !== target.community;
  edgesByKey.set(key, {
    source: source.id,
    target: target.id,
    weight: integerBetween(1, 8),
    kind: kind ?? (crossCommunity ? "cross" : "internal"),
  });
}

const coreByCommunity = communities.map((community) => nodes
  .map((node, index) => ({ node, index }))
  .filter((entry) => entry.index < CORE_NODE_COUNT && entry.node.community === community)
  .map((entry) => entry.index));
coreByCommunity.forEach((indexes) => {
  indexes.forEach((sourceIndex, position) => {
    [1, 3].forEach((offset) => addEdge(sourceIndex, indexes[(position + offset) % indexes.length], "internal"));
  });
});

for (let index = 0; index < 20; index += 1) {
  const communityIndexes = coreByCommunity[integerBetween(0, coreByCommunity.length - 1)];
  addEdge(
    communityIndexes[integerBetween(0, communityIndexes.length - 1)],
    communityIndexes[integerBetween(0, communityIndexes.length - 1)],
    "internal",
  );
}

for (let index = 0; index < 16; index += 1) {
  const source = integerBetween(0, CORE_NODE_COUNT - 1);
  let target = integerBetween(0, CORE_NODE_COUNT - 1);
  while (nodes[source].community === nodes[target].community) target = integerBetween(0, CORE_NODE_COUNT - 1);
  addEdge(source, target, "cross");
}

for (let source = CORE_NODE_COUNT; source < NODE_COUNT; source += 1) {
  const sourceNode = nodes[source];
  const sourceAngle = Math.atan2(sourceNode.anchor_y - 500, sourceNode.anchor_x - 500);
  const candidates = nodes
    .map((node, index) => ({
      index,
      angularDistance: Math.abs(Math.atan2(
        Math.sin(Math.atan2(node.y - 500, node.x - 500) - sourceAngle),
        Math.cos(Math.atan2(node.y - 500, node.x - 500) - sourceAngle),
      )),
      sameCommunity: node.community === sourceNode.community,
    }))
    .filter((candidate) => candidate.index < CORE_NODE_COUNT)
    .sort((left, right) => Number(right.sameCommunity) - Number(left.sameCommunity)
      || left.angularDistance - right.angularDistance);
  const degree = source >= NODE_COUNT - 8 ? 1 : 2;
  for (let index = 0; index < degree; index += 1) {
    addEdge(source, candidates[index]?.index ?? integerBetween(0, CORE_NODE_COUNT - 1), "radial");
  }
}

const edges = Array.from(edgesByKey.values());
const simulationNodes = nodes.map((node, index) => ({ ...node, index }));
const simulationLinks = edges.map((edge) => ({ ...edge }));
const simulation = forceSimulation(simulationNodes)
  .randomSource(random)
  .force("link", forceLink(simulationLinks)
    .id((node) => node.id)
    .distance((edge) => edge.kind === "internal" ? 46 : edge.kind === "cross" ? 78 : 205)
    .strength((edge) => edge.kind === "internal" ? 0.64 : edge.kind === "cross" ? 0.26 : 0.18))
  .force("charge", forceManyBody().strength((node) => node.density === "core" ? -112 : -230))
  .force("center", forceCenter(500, 500))
  .force("x", forceX((node) => node.density === "core" ? anchors[communities.indexOf(node.community)].x : node.anchor_x)
    .strength((node) => node.density === "core" ? 0.016 : 0.028))
  .force("y", forceY((node) => node.density === "core" ? anchors[communities.indexOf(node.community)].y : node.anchor_y)
    .strength((node) => node.density === "core" ? 0.016 : 0.028))
  .force("collide", forceCollide((node) => 10 + (node.weight - 18) / (125 - 18) * 20))
  .stop();
for (let tick = 0; tick < 360; tick += 1) simulation.tick();

simulationNodes.forEach((node, index) => {
  const radialExpansion = node.density === "core" ? 1 : 1.05;
  const expandedX = 500 + (node.x - 500) * radialExpansion;
  const expandedY = 500 + (node.y - 500) * radialExpansion;
  nodes[index].layout_x = round(clamp(expandedX / 1000, 0.05, 0.95), 6);
  nodes[index].layout_y = round(clamp(expandedY / 1000, 0.05, 0.95), 6);
  delete nodes[index].x;
  delete nodes[index].y;
});

// The Matrix renderer uses a bounded 805 x 727 plot inside its 920 x 920
// frame. Resolve collisions in that actual aspect ratio so large Pie nodes do
// not overlap after normalized coordinates are projected to the screen.
const renderedPlotWidth = 805;
const renderedPlotHeight = 727;
const renderedWeightExtent = nodes.reduce((extent, node) => [
  Math.min(extent[0], node.weight),
  Math.max(extent[1], node.weight),
], [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
const renderedRadius = (node) => renderedWeightExtent[0] === renderedWeightExtent[1]
  ? 16
  : 8 + (node.weight - renderedWeightExtent[0]) / (renderedWeightExtent[1] - renderedWeightExtent[0]) * 16;
const relaxedNodes = nodes.map((node) => ({
  node,
  x: node.layout_x * renderedPlotWidth,
  y: node.layout_y * renderedPlotHeight,
  radius: renderedRadius(node),
}));
for (let iteration = 0; iteration < 1200; iteration += 1) {
  let overlapCount = 0;
  for (let leftIndex = 0; leftIndex < relaxedNodes.length; leftIndex += 1) {
    const left = relaxedNodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < relaxedNodes.length; rightIndex += 1) {
      const right = relaxedNodes[rightIndex];
      let dx = right.x - left.x;
      let dy = right.y - left.y;
      let distance = Math.hypot(dx, dy);
      const requiredDistance = (left.radius + right.radius) * 1.25 + 1;
      if (distance >= requiredDistance) continue;
      overlapCount += 1;
      if (distance < 1e-6) {
        const angle = (leftIndex * 31 + rightIndex * 17) * Math.PI / 180;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      const movement = (requiredDistance - distance) / 2;
      left.x -= dx / distance * movement;
      left.y -= dy / distance * movement;
      right.x += dx / distance * movement;
      right.y += dy / distance * movement;
    }
  }
  relaxedNodes.forEach((entry) => {
    entry.x = clamp(entry.x, entry.radius + 1, renderedPlotWidth - entry.radius - 1);
    entry.y = clamp(entry.y, entry.radius + 1, renderedPlotHeight - entry.radius - 1);
  });
  if (overlapCount === 0) break;
}
relaxedNodes.forEach((entry) => {
  entry.node.layout_x = round(entry.x / renderedPlotWidth, 6);
  entry.node.layout_y = round(entry.y / renderedPlotHeight, 6);
});

const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
  const row = Math.floor(index / GRID_SIZE);
  const column = index % GRID_SIZE;
  return {
    cell_id: `R${String(row + 1).padStart(2, "0")}-C${String(column + 1).padStart(2, "0")}`,
    row_group: `R${String(row + 1).padStart(2, "0")}`,
    column_group: `C${String(column + 1).padStart(2, "0")}`,
    ...Object.fromEntries(componentFields.map((field) => [field, 0])),
  };
});

nodes.forEach((node) => {
  const sigma = node.density === "core" ? 1.05 : 0.72;
  const candidates = cells.flatMap((cell, index) => {
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    const dx = column + 0.5 - node.layout_x * GRID_SIZE;
    const dy = row + 0.5 - node.layout_y * GRID_SIZE;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > 9 * sigma * sigma) return [];
    return [{ cell, kernel: Math.exp(-distanceSquared / (2 * sigma * sigma)) }];
  });
  const kernelTotal = candidates.reduce((sum, candidate) => sum + candidate.kernel, 0);
  candidates.forEach(({ cell, kernel }) => {
    const share = kernel / kernelTotal;
    componentFields.forEach((field) => {
      cell[field] += node[field] * share;
    });
  });
});

cells.forEach((cell) => {
  componentFields.forEach((field) => {
    cell[field] = round(cell[field], 2);
  });
  cell.heat_value = round(componentFields.reduce((sum, field) => sum + cell[field], 0), 2);
});

function csv(headers, rows) {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => row[header]).join(",")).join("\n")}\n`;
}

const nodeHeaders = [
  "id", "label", "community", "density", "weight",
  ...componentFields, "dominant_component", "layout_x", "layout_y",
];
const edgeHeaders = ["source", "target", "weight", "kind"];
const heatHeaders = ["cell_id", "row_group", "column_group", ...componentFields, "heat_value"];

await Promise.all([
  writeFile(path.join(DATA_DIRECTORY, "matrix_force_nodes.csv"), csv(nodeHeaders, nodes), "utf8"),
  writeFile(path.join(DATA_DIRECTORY, "matrix_force_edges.csv"), csv(edgeHeaders, edges), "utf8"),
  writeFile(path.join(DATA_DIRECTORY, "matrix_force_heatmap.csv"), csv(heatHeaders, cells), "utf8"),
]);

const degree = new Map(nodes.map((node) => [node.id, 0]));
edges.forEach((edge) => {
  degree.set(edge.source, degree.get(edge.source) + 1);
  degree.set(edge.target, degree.get(edge.target) + 1);
});
const heatValues = cells.map((cell) => cell.heat_value);
const clearanceViolations = nodes.flatMap((node, index) => nodes.slice(index + 1).flatMap((other) => {
  const distance = Math.hypot(
    (node.layout_x - other.layout_x) * renderedPlotWidth,
    (node.layout_y - other.layout_y) * renderedPlotHeight,
  );
  return distance + 0.5 < (renderedRadius(node) + renderedRadius(other)) * 1.25
    ? [`${node.id}:${other.id}`]
    : [];
}));
console.log(JSON.stringify({
  seed: SEED,
  nodes: nodes.length,
  coreNodes: nodes.filter((node) => node.density === "core").length,
  scatteredNodes: nodes.filter((node) => node.density === "scattered").length,
  edges: edges.length,
  crossOrRadialEdges: edges.filter((edge) => edge.kind !== "internal").length,
  radialEdges: edges.filter((edge) => edge.kind === "radial").length,
  degreeRange: [Math.min(...degree.values()), Math.max(...degree.values())],
  heatRange: [Math.min(...heatValues), Math.max(...heatValues)],
  clearanceViolations: clearanceViolations.length,
}, null, 2));
