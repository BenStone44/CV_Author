export type SvgCandidate = {
  id: string;
  name: string;
  chartType: string;
  coordinateSystem: CoordinateSystem;
  src: string;
  compositionType?: CompositionType;
  svgMarkup?: string;
  unavailable?: boolean;
  renderMode?: "static-layer";
  defaultWidth?: number;
  mapStyleUrl?: string;
  /** Optional source metadata for libraries that provide template components. */
  library?: string;
  layerType?: string;
};

/** Appearance controls shared by the editable geographic point/area templates. */
export type GeographicLayerConfig = {
  size?: number;
  color?: string;
};

/** Persisted Mapbox camera state for geographic canvas nodes. */
export type GeographicMapViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export type GeoJsonGeometry = {
  type: "Point" | "MultiPoint" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type GeoJsonFeature = {
  type: "Feature";
  id: string;
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

export type GeometrySource = {
  id: string;
  name: string;
  features: GeoJsonFeature[];
};

export type GeographicLayerBinding = {
  datasetId: string;
  geometrySourceId: string;
  idField: string;
  colorField?: string;
  sizeField?: string;
  aggregation: "sum";
};

export type CartesianCoordinateGuide = {
  type: "Cartesian";
  origin: Point;
  xDirection: 1 | -1;
  yDirection: 1 | -1;
  xScale?: number;
  yScale?: number;
  /** Whether Cartesian axes (lines, ticks, labels, and titles) are rendered. */
  showAllAxes?: boolean;
  showXLine?: boolean;
  showYLine?: boolean;
  /** Per-axis tick/label visibility. Falls back to showDiscreteLabels. */
  showXLabels?: boolean;
  showYLabels?: boolean;
  showDiscreteLabels?: boolean;
  xDiscreteSpacing?: number;
  yDiscreteSpacing?: number;
};

export type PolarCoordinateGuide = {
  type: "Polar";
  origin: Point;
  /** Final chart radius in node-local coordinates, populated after rendering. */
  radius?: number;
  radiusScale?: number;
  ringScale?: number;
  angleSpan?: number;
  angleOffset?: number;
  innerRadiusRatio?: number;
  outerRadiusRatio?: number;
  showThetaLine?: boolean;
  showRadiusLine?: boolean;
  showDiscreteLabels?: boolean;
};

export type CoordinateGuide = CartesianCoordinateGuide | PolarCoordinateGuide;

export type ElementOrientation = {
  point: Point;
  direction: Point;
  confidence: number;
};

export type CompositionType = "layer" | "facet" | "concat" | "nested";

export type CoordinateSystem = "Cartesian" | "Polar" | "Geographic" | "CoordinateFree";
export type IconKind = "cartesian" | "polar" | "geographic" | "coordinate-free";

/**
 * CSV semantic types. `temporal` remains a read-compatibility value for
 * projects saved before ordinal was introduced; new data uses ordinal for
 * ordered discrete values (including date strings) or quantitative for
 * numeric timestamps.
 */
export type DataColumnType = "nominal" | "ordinal" | "quantitative" | "temporal";

export function isDataColumnTypeCompatible(accepts: readonly DataColumnType[], type: DataColumnType) {
  return accepts.includes(type)
    || (type === "ordinal" && (accepts.includes("nominal") || accepts.includes("temporal")));
}

export type DataColumn = {
  name: string;
  type: DataColumnType;
};

export type DataRow = Record<string, string>;

export type ChartValueFilterTransform = {
  id: string;
  kind: "filter";
  mode: "values";
  field: string;
  values: string[];
  single: boolean;
  purpose?: "filter" | "facet-clue" | "nest-clue" | "nested-context";
};

export type ChartNumericFilterTransform = {
  id: string;
  kind: "filter";
  mode: "numeric";
  field: string;
  operator: "top" | "bottom" | "gte" | "gt" | "lte" | "lt" | "eq" | "between";
  value: number;
  upperValue?: number;
};

export type ChartGroupAggregateTransform = {
  id: string;
  kind: "aggregate";
  mode: "group";
  groupField: string;
  valueField: string;
  operation: "sum" | "avg";
  outputField: string;
};

export type ChartBinAggregateTransform = {
  id: string;
  kind: "aggregate";
  mode: "bin";
  field: string;
  method: "equal-width" | "fixed-width" | "quantile";
  parameter: number;
  outputField: string;
};

export type ChartGroupValueOrderTransform = {
  id: string;
  kind: "order";
  mode: "group-value";
  groupField: string;
  valueField: string;
  operation: "sum" | "avg";
  direction: "source" | "ascending" | "descending";
  limit?: number;
};

export type ChartDataTransform =
  | ChartValueFilterTransform
  | ChartNumericFilterTransform
  | ChartGroupAggregateTransform
  | ChartBinAggregateTransform
  | ChartGroupValueOrderTransform;

export type DatasetTable = {
  columns: DataColumn[];
  rows: DataRow[];
};

export type GraphTables = {
  nodes: DatasetTable;
  edges: DatasetTable;
};

export type Dataset = {
  id: string;
  name: string;
  columns: DataColumn[];
  rows: DataRow[];
  primaryKey?: string[];
  graph?: GraphTables;
};

export type EncodingChannel = "x" | "y";
/** Vega-Lite polar channels use theta/radius. `angle` remains a legacy read alias. */
export type PolarEncodingChannel = "theta" | "radius" | "ring" | "angle";
export type MatrixEncodingChannel = "row" | "column" | "value";
export type StructuredEncodingChannel =
  | "key"
  | "parent"
  | "source"
  | "target"
  | "date"
  | "category"
  | "segment"
  | "dimensions";
export type OptionalEncodingChannel = "color" | "size" | "shape";
export type ChartEncodingChannel =
  | EncodingChannel
  | PolarEncodingChannel
  | MatrixEncodingChannel
  | StructuredEncodingChannel
  | OptionalEncodingChannel;
export type CoordinateChannel = EncodingChannel | PolarEncodingChannel;
export type ChartTemplateKind =
  | "line"
  | "scatter"
  | "bar"
  | "pie"
  | "donut"
  | "matrix"
  | "area"
  | "parallel"
  | "hierarchy"
  | "calendar"
  | "boxplot"
  | "contour"
  | "hexbin"
  | "flow";

export type ChartEncoding = {
  field: string;
  type: DataColumnType;
};

export type ChartNumericFilter = {
  topN?: number;
  binCount?: number;
};

export type ChartPlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChartPolarArea = {
  startAngle: number;
  angleSpan: number;
  innerRadius: number;
  outerRadius: number;
};

export type ChartScaleSpec = {
  type: "utc" | "linear" | "log" | "point";
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

export type LinearColorStop = {
  offset: number;
  color: string;
};

export type LinearSizeStop = {
  offset: number;
  size: number;
};

export type LinearColorMapping = {
  type: "linear";
  stops: LinearColorStop[];
  /** Optional explicit numeric domain for continuous color values. */
  domain?: [number, number];
};

export type LinearSizeMapping = {
  type: "linear";
  stops: LinearSizeStop[];
};

export type CategoricalColorMapping = {
  type: "categorical";
  values: Record<string, string>;
};

export type LineSeriesShape = "solid" | "dashed" | "dotted";

export type SeriesMemberStyle = {
  color?: string;
  strokeWidth?: number;
  shape?: LineSeriesShape;
};

export type SeriesStyleMapping = {
  type: "series-style";
  values: Record<string, SeriesMemberStyle>;
};

export type MarkGroupConfigValue =
  | string
  | number
  | boolean
  | LinearColorMapping
  | LinearSizeMapping
  | CategoricalColorMapping
  | SeriesStyleMapping;

export type MarkGroupSharedConfig = Record<string, MarkGroupConfigValue>;

export type ChartRendererReference = {
  kind: "deterministic-chart" | "deterministic-line" | "llm";
  version: 1 | 2 | 3;
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
  templateId?: ChartTemplateKind;
  datasetId: string;
  axisSwapped?: boolean;
  encodings: Partial<Record<ChartEncodingChannel, ChartEncoding>>;
  aggregations?: Partial<Record<ChartEncodingChannel, "sum" | "avg">>;
  /** Aggregations inferred from repeated visual keys during data preparation. */
  autoAggregations?: Partial<Record<ChartEncodingChannel, "sum" | "avg">>;
  dimensionAggregations?: Record<string, "sum" | "avg">;
  valueFields?: ChartEncoding[];
  angleFields?: ChartEncoding[];
  parallelFields?: ChartEncoding[];
  flattenFields?: string[];
  radiusMode?: "shared" | "per-component";
  componentRadiusFields?: Record<string, ChartEncoding>;
  series?: ChartEncoding;
  seriesFields?: ChartEncoding[];
  scales?: Partial<Record<EncodingChannel, ChartScaleSpec>>;
  plotArea?: ChartPlotArea;
  polarArea?: ChartPolarArea;
  styleTokens?: ChartStyleTokens;
  renderer?: ChartRendererReference;
  filters?: Record<string, string>;
  valueFilters?: Record<string, string[]>;
  numericFilters?: Record<string, ChartNumericFilter>;
  dataTransforms?: ChartDataTransform[];
  markGroups?: MarkGroupSpec[];
  dimensionRecommendations?: DimensionRecommendation[];
  dimensionDecisions?: Record<string, "aggregate" | "series" | "flatten" | "facet" | "nested" | "filter">;
};

export type MarkGroupSpec = {
  id: string;
  chartId: string;
  role: string;
  memberKeys: string[];
  seriesField?: string;
  sharedConfig: MarkGroupSharedConfig;
  allowOverrides?: boolean;
};

export type CoordinateSystemMember = {
  nodeId: string;
  channels: CoordinateChannel[];
};

export type CoordinateSystemSpec = {
  id: string;
  type: CoordinateSystem;
  ownerNodeId: string;
  members: CoordinateSystemMember[];
  sharedChannels: CoordinateChannel[];
  /** Maximum rendered outer radius across a Polar composition's members. */
  polarOuterRadius?: number;
};

export type DimensionRecommendation = {
  id: string;
  strategy: "series" | "flatten" | "facet" | "nested";
  field: string;
  valueCount: number;
  estimatedMarkCount: number;
  sharedChannels: CoordinateChannel[];
  label: string;
  flattenFields?: string[];
  facetDirection?: "row" | "column";
  facetCoordinateSystem?: "Cartesian" | "Polar";
  facetThetaField?: string;
  facetRadiusField?: string;
  facetGrid?: {
    rowField: string;
    columnField: string;
    rowValues: string[];
    columnValues: string[];
  };
};

export type LayerChildSpec = {
  nodeId: string;
  chartSpec: ChartSpec;
  role: string;
};

export type LayerSpec = {
  type: "layer";
  datasetId: string;
  x?: ChartEncoding;
  y?: ChartEncoding;
  children: LayerChildSpec[];
};

export type CompositionMemberSpec = {
  nodeId: string;
  sourceNodeId: string;
  chartType?: string;
  sharedChannels: CoordinateChannel[];
};

export type CompositionSpec = {
  id: string;
  type: "layer" | "concat" | "facet" | "nested";
  members: CompositionMemberSpec[];
  sharedChannels: CoordinateChannel[];
  direction?: "horizontal" | "vertical" | "radial" | "angular";
  polarAngleSpan?: number;
  polarAngleOffset?: number;
  /** Maximum rendered outer radius across Polar composition members. */
  polarOuterRadius?: number;
  facetField?: string;
  facetValues?: string[];
  facetDirection?: "row" | "column";
  facetRowGap?: number;
  facetColumnGap?: number;
  facetCoordinateSystem?: "Cartesian" | "Polar";
  facetThetaField?: string;
  facetRadiusField?: string;
  facetGrid?: {
    rowField: string;
    columnField: string;
    rowValues: string[];
    columnValues: string[];
  };
};

export type ChartDropZone = {
  targetNodeId: string;
  type: "layer" | "concat" | "nested";
  sharedChannels: CoordinateChannel[];
  bounds: Bounds;
  outline?: Point[];
  compatible: boolean;
  targetRowKey?: string;
  targetElementId?: string;
  targetMarkGroupId?: string;
  targetDataKey?: string;
  nestedAction?: "embed" | "enter";
  /** Hovering this portal edits an existing concat/layer before resolving the drop. */
  enterCompositionId?: string;
  enterBounds?: Bounds;
  targetChildMarkIndexes?: number[];
  nestedTargets?: Array<{
    elementId: string;
    markGroupId?: string;
    dataKey: string;
    rowKey?: string;
    bounds: Bounds;
  }>;
  direction?: "horizontal" | "vertical" | "radial" | "angular";
  concatPosition?: "before" | "after";
};

export type DataBindingDropZone =
  | {
    type: "geographic-body";
    targetNodeId: string;
    fieldName: string;
    compatible: boolean;
    bounds: Bounds;
  }
  | {
    type: "chart-body";
    targetNodeId: string;
    fieldName: string;
    compatible: boolean;
    bounds: Bounds;
  }
  | {
    type: "series-item";
    targetNodeId: string;
    fieldName: string;
    label: string;
    compatible: boolean;
    bounds: Bounds;
    frame: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      center: Point;
    };
  }
  | {
    type: "polar-axis";
    targetNodeId: string;
    channel: "angle" | "radius";
    path: string;
    labelPosition: Point;
    compatible: boolean;
    fieldName?: string;
  }
  | {
    type: "polar-slice";
    targetNodeId: string;
    channel: "angle";
    center: Point;
    radiusX: number;
    radiusY: number;
    rotation: number;
    compatible: boolean;
  }
  | {
    type: "cartesian-axis";
    targetNodeId: string;
    channel: EncodingChannel;
    start: Point;
    end: Point;
    compatible: boolean;
    fieldName?: string;
  };

export type NestedBindingTarget = {
  nodeId: string;
  rowKey: string;
  clientX: number;
  clientY: number;
};

export type NestedBindingConfig = {
  xField: string;
  yField: string;
  radiusField: string;
  angleFields: string[];
};

export type NestedSpec = {
  type: "nested";
  groupId?: string;
  parentRowKey: string;
  parentRowKeys?: string[];
  parentChartNodeId: string;
  parentMarkGroupId?: string;
  valueFields: string[];
  radiusField?: string;
  innerChartType: "PieChart";
};

export type ChartRelationshipInstanceKind = "canvas" | "facet-cell" | "nested-child" | "virtual";

export type ChartRelationshipRecord = {
  id: string;
  nodeId: string | null;
  chartType: string;
  datasetId: string | null;
  instanceKind: ChartRelationshipInstanceKind;
  sourceChartId?: string;
  sourceTemplateId?: string;
  facetKey?: string;
  markGroupIds: string[];
  axisBindingIds: string[];
  compositionIds: string[];
};

export type RelationshipMarkGroup = {
  id: string;
  chartId: string;
  role: string;
  memberKeys: string[];
  sharedConfig: MarkGroupSharedConfig;
  allowOverrides: boolean;
};

export type AxisRole = "primary" | "secondary";

export type AxisComponentConfig = {
  origin: Point;
  direction: 1 | -1;
  scale: number;
  visible: boolean;
  title?: string;
  tickCount?: number;
  showGrid?: boolean;
  style?: Record<string, string | number | boolean>;
};

export type AxisComponent = {
  id: string;
  coordinateType: CoordinateSystem;
  channel: CoordinateChannel;
  config: AxisComponentConfig;
  createdWithChartId?: string;
};

export type AxisBinding = {
  id: string;
  axisId: string;
  chartId: string;
  channel: CoordinateChannel;
  role: AxisRole;
  scalePolicy: "shared" | "independent";
};

export type FacetCellRelationship = {
  chartId: string;
  facetKey: string;
  rowValue?: string;
  columnValue?: string;
};

export type RelationshipComposition = {
  id: string;
  type: CompositionType;
  memberChartIds: string[];
  sharedAxisIds: string[];
  sharedChannels: CoordinateChannel[];
  direction?: "horizontal" | "vertical" | "radial" | "angular";
  sourceChartId?: string;
  facetField?: string;
  facetRowField?: string;
  facetColumnField?: string;
  facetCells?: FacetCellRelationship[];
};

export type NestedAnchor = {
  x: number;
  y: number;
};

export type RelativeNestedParameters = {
  parentAnchor: NestedAnchor;
  childAnchor: NestedAnchor;
  offset: Point;
  scale: Point;
  rotation: number;
  retainParent?: boolean;
  batchId?: string;
  sourceChildId?: string;
  sourceChildName?: string;
  sourceFrame?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
};

export type NestedRelationParameters = RelativeNestedParameters | Record<string, unknown>;

export type InheritedFilterContext = {
  parentChartId: string;
  parentDataKey?: string;
  parentField: string;
  childField: string;
  value: string | number;
  filterMode?: "values" | "numeric";
  source: "facet-cell" | "parent-row" | "parent-filter";
};

export type NestedRelationship = {
  id: string;
  parentChartId: string;
  parentElementId: string;
  parentMarkGroupId?: string;
  parentDataKey?: string;
  childChartId: string;
  inheritedFilterContexts?: InheritedFilterContext[];
  relationType: "relative-position" | (string & {});
  parameters: NestedRelationParameters;
  resolverVersion: number;
  status: "draft" | "active";
};

export type NestedElementFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export type ResolvedNestedTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export type ChartRelationshipState = {
  version: 1;
  charts: Record<string, ChartRelationshipRecord>;
  markGroups: Record<string, RelationshipMarkGroup>;
  axes: Record<string, AxisComponent>;
  axisBindings: Record<string, AxisBinding>;
  compositions: Record<string, RelationshipComposition>;
  nestedRelationships: Record<string, NestedRelationship>;
};

export type RelationshipEntityType = "chart" | "mark-group" | "axis" | "composition" | "nested";

export type RelationshipSelection = {
  type: RelationshipEntityType;
  id: string;
} | null;

export type ChartRelationshipCommand =
  | { type: "register-chart"; chart: Omit<ChartRelationshipRecord, "markGroupIds" | "axisBindingIds" | "compositionIds"> & Partial<Pick<ChartRelationshipRecord, "markGroupIds" | "axisBindingIds" | "compositionIds">>; coordinateGuide?: CoordinateGuide | null; channels?: CoordinateChannel[] }
  | { type: "unregister-chart"; chartId: string; keepAxes?: boolean }
  | { type: "sync-mark-groups"; chartId: string; groups: MarkGroupSpec[] }
  | { type: "update-mark-group"; groupId: string; sharedConfig?: MarkGroupSharedConfig; memberKeys?: string[]; allowOverrides?: boolean }
  | { type: "create-axis"; axis: AxisComponent }
  | { type: "update-axis"; axisId: string; changes: Partial<Omit<AxisComponent, "id" | "config">> & { config?: Partial<AxisComponentConfig> } }
  | { type: "delete-axis"; axisId: string; replacement?: "unbind" | "individual" }
  | { type: "bind-axis"; axisId: string; chartId: string; channel: CoordinateChannel; role?: AxisRole; scalePolicy?: "shared" | "independent" }
  | { type: "unbind-axis"; chartId: string; channel: CoordinateChannel; role?: AxisRole }
  | { type: "share-axis"; chartIds: string[]; channel: CoordinateChannel; axisId?: string }
  | { type: "create-composition"; composition: Omit<RelationshipComposition, "sharedAxisIds"> & { sharedAxisIds?: string[] } }
  | { type: "update-composition"; compositionId: string; changes: Partial<Pick<RelationshipComposition, "memberChartIds" | "direction" | "facetField" | "facetRowField" | "facetColumnField" | "facetCells">> }
  | { type: "remove-composition"; compositionId: string; keepSharedAxes?: boolean }
  | { type: "begin-nested"; relationship: Omit<NestedRelationship, "status"> }
  | { type: "update-nested"; relationshipId: string; changes: Partial<Pick<NestedRelationship, "relationType" | "parameters" | "resolverVersion">> }
  | { type: "commit-nested"; relationshipId: string }
  | { type: "cancel-nested"; relationshipId: string }
  | { type: "select-entity"; selection: Exclude<RelationshipSelection, null> | null }
  | { type: "replace-state"; state: ChartRelationshipState }
  | { type: "clear" };

export type SemanticSelection = {
  nodeId: string;
  role: string;
  markGroupId?: string;
  rowKey?: string;
  seriesKey?: string;
  categoryKey?: string;
  level?: "item" | "part";
  partCount?: number;
  bounds?: Bounds;
};

export type ChartDrilldown = {
  nodeId: string;
  level: "item" | "part";
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
  channel: CoordinateChannel;
  clientX?: number;
  clientY?: number;
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
  coordinateSystem?: CoordinateSystemSpec | null;
  chartSpec?: ChartSpec | null;
  renderedContent?: string | null;
  llmRenderer?: LlmRendererState | null;
  layerSpec?: LayerSpec | null;
  nestedSpec?: NestedSpec | null;
  compositionSpec?: CompositionSpec | null;
  /** Logical layer kind for non-semantic visual objects. */
  layerKind?: "deckgl";
  /** Concrete deck.gl layer constructor used by a geographic visual object. */
  deckglLayerType?: string;
  /** Mapbox style used by a geographic deck.gl visual object. */
  mapStyleUrl?: string;
  /** User-controlled Mapbox camera, preserved across remounts. */
  mapViewState?: GeographicMapViewState;
  /** User-editable appearance for geographic point and area templates. */
  deckglConfig?: GeographicLayerConfig;
  /** CSV-to-GeoJSON join and optional aggregate visual channels. */
  deckglBinding?: GeographicLayerBinding;
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

export type NestedRenderPlacement = {
  relationshipId: string;
  parentChartId: string;
  parentMarkGroupId?: string;
  parentDataKey?: string;
  retainParent: boolean;
  child: CanvasNode;
};

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

export type ChartInstanceId = string;
export type ChartInstanceCoordinateSystem = "Cartesian" | "Polar";

export type CompositeCompositionConfig = Omit<CompositionSpec, "members">;
export type CompositeLayerConfig = Omit<LayerSpec, "children">;
export type CompositeNestedConfig = Omit<NestedSpec, "parentChartNodeId"> & {
  parentInstanceId?: ChartInstanceId;
};

export type CompositeChartConfig =
  | {
    type: "layer" | "concat" | "facet";
    composition: CompositeCompositionConfig;
    layer?: CompositeLayerConfig;
    memberInstanceIds: ChartInstanceId[];
  }
  | {
    type: "nested";
    composition?: CompositeCompositionConfig;
    nested: CompositeNestedConfig;
    memberInstanceIds: ChartInstanceId[];
  };

export type ChartInstanceSpec =
  | { kind: "chart"; chart: ChartSpec }
  | { kind: "composite"; composite: CompositeChartConfig };

export type ChartInstanceKind =
  | "single"
  | "composite-root"
  | "composite-member"
  | "nested-child";

export type CartesianCoordinateBounds = {
  type: "Cartesian";
  plot: Bounds;
  xAxis?: Bounds;
  yAxis?: Bounds;
};

export type PolarCoordinateBounds = {
  type: "Polar";
  origin: Point;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  angleSpan: number;
  envelope: Bounds;
};

export type ChartCoordinateBounds = CartesianCoordinateBounds | PolarCoordinateBounds;

export type ChartInnerBounds = {
  marks: Bounds;
  markGroups?: Record<string, Bounds>;
};

export type ChartInstanceBounds = {
  space: "canvas";
  /** This is the same geometry used by `.canvas-object-hit-target`. */
  outer: Bounds;
  coordinate: ChartCoordinateBounds;
  inner: ChartInnerBounds;
};

export type ChartInstance = {
  id: ChartInstanceId;
  nodeId?: string;
  kind: ChartInstanceKind;
  datasetId: string | null;
  coordinateSystem: ChartInstanceCoordinateSystem;
  spec: ChartInstanceSpec;
  /** Runtime renderer snapshot; group children are reconstructed from instance IDs. */
  renderNode: CanvasNode;
  bounds: ChartInstanceBounds;
  parentInstanceId?: ChartInstanceId;
  compositionId?: string;
  revision: number;
};

export type ChartInstanceDocument = {
  version: 1;
  coordinateSpace: "canvas";
  rootInstanceIds: ChartInstanceId[];
  instances: ChartInstance[];
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
  scopeGroupId?: string;
  historyCommitted: boolean;
};

export type MoveInteraction = {
  type: "move";
  startPoint: Point;
  itemIds: string[];
  snapshots: Record<string, Point>;
  scopeGroupId?: string;
  historyCommitted: boolean;
  transformOnly?: boolean;
  deferred?: boolean;
  nestedRelationshipIds?: string[];
};

export type MarqueeInteraction = {
  type: "marquee";
  startPoint: Point;
  currentPoint: Point;
  scopeGroupId?: string;
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
  scopeGroupId?: string;
  historyCommitted: boolean;
};

export type CoordinateAxisScaleInteraction = {
  type: "coordinate-axis-scale";
  nodeId: string;
  axis: CoordinateChannel;
  startPoint: Point;
  startScale: number;
  scopeGroupId?: string;
  historyCommitted: boolean;
};

export type PolarAngleInteraction = {
  type: "polar-angle";
  nodeId: string;
  startPoint: Point;
  scopeGroupId?: string;
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
  scopeGroupId?: string;
  historyCommitted: boolean;
};

export type Interaction =
  | MoveInteraction
  | MarqueeInteraction
  | ScaleInteraction
  | RotateInteraction
  | CoordinateOriginInteraction
  | CoordinateAxisScaleInteraction
  | PolarAngleInteraction
  | PanInteraction;

export type CanvasHistorySnapshot = {
  instanceDocument: ChartInstanceDocument;
  nodes?: CanvasNode[];
  selectedIds: string[];
  editingGroupPath?: string[];
  relationships?: ChartRelationshipState;
};

export type CanvasHistoryPatchChange = {
  nodeId: string;
  role: string;
  field: string;
  before: MarkGroupConfigValue;
  after: MarkGroupConfigValue;
};

export type CanvasHistoryPatch = {
  kind: "mark-config";
  changes: CanvasHistoryPatchChange[];
  selectedIds: string[];
  editingGroupPath?: string[];
};

export type CanvasHistoryPositionChange = {
  nodeId: string;
  before: Point;
  after: Point;
};

export type CanvasHistoryPositionPatch = {
  kind: "position";
  changes: CanvasHistoryPositionChange[];
};

export type CanvasHistoryEntry = CanvasHistorySnapshot | CanvasHistoryPatch | CanvasHistoryPositionPatch;

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
