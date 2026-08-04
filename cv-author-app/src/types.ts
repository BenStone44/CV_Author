export type SvgCandidate = {
  id: string;
  name: string;
  chartType: string;
  coordinateSystem: CoordinateSystem;
  src: string;
  compositionType?: CompositionType;
  svgMarkup?: string;
  unavailable?: boolean;
};

export type CartesianCoordinateGuide = {
  type: "Cartesian";
  origin: Point;
  xDirection: 1 | -1;
  yDirection: 1 | -1;
  xScale?: number;
  yScale?: number;
};

export type PolarCoordinateGuide = {
  type: "Polar";
  origin: Point;
};

export type CoordinateGuide = CartesianCoordinateGuide | PolarCoordinateGuide;

export type ElementOrientation = {
  point: Point;
  direction: Point;
  confidence: number;
};

export type CompositionType = "layer" | "facet" | "concat" | "nested";

export type CoordinateSystem = "Cartesian" | "Polar" | "Geographic" | "None";
export type IconKind = "cartesian" | "polar" | "geographic" | "none";

export type DataColumnType = "nominal" | "temporal" | "quantitative";

export type DataColumn = {
  name: string;
  type: DataColumnType;
};

export type DataRow = Record<string, string>;

export type Dataset = {
  id: string;
  name: string;
  columns: DataColumn[];
  rows: DataRow[];
  primaryKey?: string[];
};

export type EncodingChannel = "x" | "y";
export type OptionalEncodingChannel = "color" | "size" | "shape";

export type ChartEncoding = {
  field: string;
  type: DataColumnType;
};

export type ChartPlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChartScaleSpec = {
  type: "utc" | "linear" | "point";
  domain: [string, string] | [number, number] | string[];
  range: [number, number];
  nice?: boolean;
};

export type ChartStyleTokens = {
  palette: string[];
  axisColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  lineWidth: number;
};

export type ChartRendererReference = {
  kind: "deterministic-line" | "llm";
  version: 1;
  status: "ready" | "error";
  error?: string;
};

export type GeneratedMarkMetadata = {
  role: string;
  markType: string;
  dataIndex?: number;
  [key: string]: unknown;
};

export type LlmRendererProvenance = {
  requestId: string;
  cacheKey: string;
  promptVersion: string;
  requestVersion: string;
  model: string;
  generatedAt: string;
  cacheHit: boolean;
};

export type LlmRendererState = {
  kind: "llm";
  version: 1;
  status: "ready" | "error";
  code: string;
  marks: GeneratedMarkMetadata[];
  provenance: LlmRendererProvenance;
  error?: string;
};

export type ChartSpec = {
  chartType: string;
  datasetId: string;
  encodings: Partial<Record<EncodingChannel | OptionalEncodingChannel, ChartEncoding>>;
  series?: ChartEncoding;
  scales?: Partial<Record<EncodingChannel, ChartScaleSpec>>;
  plotArea?: ChartPlotArea;
  styleTokens?: ChartStyleTokens;
  renderer?: ChartRendererReference;
};

export type LayerChildSpec = {
  nodeId: string;
  chartSpec: ChartSpec;
  role: "line" | "scatter";
};

export type LayerSpec = {
  type: "layer";
  datasetId: string;
  x: ChartEncoding;
  y: ChartEncoding;
  children: LayerChildSpec[];
};

export type NestedSpec = {
  type: "nested";
  parentRowKey: string;
  parentChartNodeId: string;
  valueFields: string[];
  innerChartType: "PieChart";
};

export type SemanticSelection = {
  nodeId: string;
  role: string;
  rowKey?: string;
  seriesKey?: string;
  time?: string;
  person?: string;
};

export type SeriesCandidate = {
  field: string;
  score: number;
  groupCount: number;
  averageGroupSize: number;
  coverage: number;
  xUniqueness: number;
};

export type AxisBindingTarget = {
  nodeId: string;
  channel: EncodingChannel;
};

export type CanvasBaseNode = {
  id: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  coordinateGuide?: CoordinateGuide | null;
  chartSpec?: ChartSpec | null;
  renderedContent?: string | null;
  llmRenderer?: LlmRendererState | null;
  layerSpec?: LayerSpec | null;
  nestedSpec?: NestedSpec | null;
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
  orientation?: ElementOrientation;
};

export type ParsedSvgGroupTemplateNode = {
  kind: "group";
  name?: string;
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
  orientation?: ElementOrientation;
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

export type RotateInteraction = {
  type: "rotate";
  startPoint: Point;
  center: Point;
  startAngle: number;
  itemIds: string[];
  snapshots: Record<string, { x: number; y: number; rotation: number }>;
  historyCommitted: boolean;
};

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

export type CoordinateOriginInteraction = {
  type: "coordinate-origin";
  nodeId: string;
  startPoint: Point;
  startOrigin: Point;
  historyCommitted: boolean;
};

export type CoordinateAxisScaleInteraction = {
  type: "coordinate-axis-scale";
  nodeId: string;
  axis: "x" | "y";
  startPoint: Point;
  startScale: number;
  historyCommitted: boolean;
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
  | RotateInteraction
  | CoordinateOriginInteraction
  | CoordinateAxisScaleInteraction
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
