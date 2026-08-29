import type {
  ElementOrientation,
  ParsedSvgTemplateNode,
  Point,
} from "../../types";

export function countTemplateNodes(nodes: ParsedSvgTemplateNode[]): number {
  return nodes.reduce((count, node) => node.kind === "leaf"
    ? count + 1
    : count + 1 + countTemplateNodes(node.children), 0);
}

export function collectElementOrientations(node: ParsedSvgTemplateNode): ElementOrientation[] {
  if (node.kind === "leaf") return node.orientation ? [node.orientation] : [];
  return node.children.flatMap(collectElementOrientations);
}

export function solveOrientationCenter(
  orientations: ElementOrientation[],
  usePerpendicularDirection: boolean,
): { point: Point; error: number } | null {
  const solve = (items: ElementOrientation[]) => {
    let a = 0, b = 0, c = 0, rhsX = 0, rhsY = 0, totalWeight = 0;
    items.forEach((orientation) => {
      const direction = usePerpendicularDirection
        ? { x: -orientation.direction.y, y: orientation.direction.x }
        : orientation.direction;
      const normal = { x: -direction.y, y: direction.x };
      const weight = Math.max(0.01, orientation.confidence * orientation.confidence);
      const projection = normal.x * orientation.point.x + normal.y * orientation.point.y;
      a += weight * normal.x * normal.x;
      b += weight * normal.x * normal.y;
      c += weight * normal.y * normal.y;
      rhsX += weight * normal.x * projection;
      rhsY += weight * normal.y * projection;
      totalWeight += weight;
    });
    const determinant = a * c - b * b;
    if (items.length < 3 || totalWeight <= 0 || determinant <= (a + c) * 0.000001) return null;
    return {
      x: (rhsX * c - b * rhsY) / determinant,
      y: (a * rhsY - b * rhsX) / determinant,
    };
  };
  const distanceToLine = (orientation: ElementOrientation, point: Point) => {
    const direction = usePerpendicularDirection
      ? { x: -orientation.direction.y, y: orientation.direction.x }
      : orientation.direction;
    return Math.abs(-direction.y * (point.x - orientation.point.x)
      + direction.x * (point.y - orientation.point.y));
  };

  const initial = solve(orientations);
  if (!initial) return null;
  const distances = orientations.map((orientation) => distanceToLine(orientation, initial));
  const sortedDistances = [...distances].sort((left, right) => left - right);
  const median = sortedDistances[Math.floor(sortedDistances.length / 2)] ?? 0;
  const threshold = Math.max(median * 2.5, 0.5);
  const inliers = orientations.filter((_, index) => (distances[index] ?? Infinity) <= threshold);
  const point = solve(inliers.length >= 3 ? inliers : orientations) ?? initial;
  let weightedError = 0;
  let totalWeight = 0;
  orientations.forEach((orientation) => {
    const weight = Math.max(0.01, orientation.confidence * orientation.confidence);
    const distance = distanceToLine(orientation, point);
    weightedError += weight * distance * distance;
    totalWeight += weight;
  });
  return { point, error: Math.sqrt(weightedError / Math.max(totalWeight, 0.0001)) };
}

export function estimatePolarOrigin(node: ParsedSvgTemplateNode): Point {
  const fallback = {
    x: node.bounds.minX + node.bounds.width / 2,
    y: node.bounds.minY + node.bounds.height / 2,
  };
  const orientations = collectElementOrientations(node)
    .filter((orientation) => orientation.confidence >= 0.12)
    .slice(0, 600);
  const candidates = [
    solveOrientationCenter(orientations, false),
    solveOrientationCenter(orientations, true),
  ].filter((candidate): candidate is { point: Point; error: number } => !!candidate)
    .filter(({ point }) =>
      point.x >= node.bounds.minX - node.bounds.width * 0.15
      && point.x <= node.bounds.maxX + node.bounds.width * 0.15
      && point.y >= node.bounds.minY - node.bounds.height * 0.15
      && point.y <= node.bounds.maxY + node.bounds.height * 0.15,
    )
    .sort((left, right) => left.error - right.error);
  const best = candidates[0];
  const maximumUsefulError = Math.max(node.bounds.width, node.bounds.height) * 0.2;
  return best && best.error <= maximumUsefulError ? best.point : fallback;
}
