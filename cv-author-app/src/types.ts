export type SvgCandidate = {
  id: string;
  name: string;
  chartType: string;
  coordinateSystem: CoordinateSystem;
  src: string;
};

export type CoordinateSystem = "Cartesian" | "Polar" | "Geographic" | "None";
export type CoordinateFilter = "All" | CoordinateSystem;
export type IconKind = "all" | "cartesian" | "polar" | "geographic" | "none";

export type CanvasBaseNode = {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export type CanvasLeafNode = CanvasBaseNode & {
  kind: "leaf";
  candidateId: string;
  content: string;
  viewBox: string;
  contentMinX: number;
  contentMinY: number;
};

export type CanvasGroupNode = CanvasBaseNode & {
  kind: "group";
  children: CanvasNode[];
};

export type CanvasNode = CanvasLeafNode | CanvasGroupNode;

export type Point = {
  x: number;
  y: number;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type ParsedSvgLeafTemplateNode = {
  kind: "leaf";
  content: string;
  viewBox: string;
  bounds: Bounds;
  contentMinX: number;
  contentMinY: number;
};

export type ParsedSvgGroupTemplateNode = {
  kind: "group";
  bounds: Bounds;
  children: ParsedSvgTemplateNode[];
};

export type ParsedSvgTemplateNode =
  | ParsedSvgLeafTemplateNode
  | ParsedSvgGroupTemplateNode;

export type FlattenedSvgLeaf = {
  groupPath: string[];
  content: string;
  viewBox: string;
  bounds: Bounds;
  contentMinX: number;
  contentMinY: number;
};

export type ParsedSvgTemplate = {
  viewBox: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
  nodes: ParsedSvgTemplateNode[];
};

export type ScaleHandle = "nw" | "ne" | "sw" | "se";

export type MoveInteraction = {
  type: "move";
  startPoint: Point;
  startBounds: Bounds;
  itemIds: string[];
  snapshots: Record<string, Point>;
  historyCommitted: boolean;
};

export type MarqueeInteraction = {
  type: "marquee";
  startPoint: Point;
  currentPoint: Point;
};

export type PanInteraction = {
  type: "pan";
  startScreenPoint: Point;
  startPan: Point;
};

export type ScaleInteraction = {
  type: "scale";
  handle: ScaleHandle;
  startPoint: Point;
  startBounds: Bounds;
  itemIds: string[];
  snapshots: Record<
    string,
    { x: number; y: number; scaleX: number; scaleY: number }
  >;
  historyCommitted: boolean;
};

export type Interaction =
  | MoveInteraction
  | MarqueeInteraction
  | ScaleInteraction
  | PanInteraction;

export type CanvasHistorySnapshot = {
  nodes: CanvasNode[];
  selectedIds: string[];
};

export type ContextMenuState = {
  x: number;
  y: number;
  point: Point;
};

export type LayerOrderAction = "front" | "forward" | "backward" | "back";

export type SelectionUnit = {
  key: string;
  itemIds: string[];
  bounds: Bounds;
};

export type AbsoluteNodeFrame = {
  node: CanvasNode;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  bounds: Bounds;
};
