# Cube-first Vega-Lite Binding Design

> 核心方案：持久化的是“模板语义 slot -> Cube source”，而不是“Vega-Lite channel -> CSV column”。Cube 查询先把任意数据形态标准化为稳定的 dimension fields、`seriesKey` 和 `value`，随后编译为 Vega-Lite encoding，或交给现有 SVG renderer 消费。这个架构借用 Vega-Lite 的映射思想，但不要求运行时必须使用 Vega-Lite。

## 1. Design Goal

CSV is an import format. It should not determine the vocabulary shown in the chart-binding UI.

The binding model should work for both of these equivalent data shapes:

```text
region × month × product -> revenue
```

and:

```text
region × month -> revenue, cost, profit
```

The first shape has a breakdown dimension (`product`). The second shape has a set of measures. Both should support the same user workflow:

```text
select a value -> select a breakdown -> select members -> configure visual style
```

The user should never need to choose `theta`, `xOffset`, `fold`, or a raw CSV field name in the primary binding flow.

## 2. Three Layers

| Layer | Responsibility | User-visible? | Example |
| --- | --- | --- | --- |
| Cube model | Describes dimensions, members, measures, units, hierarchies, and valid aggregation | Partly | `component -> water, fat, muscle` |
| Semantic chart binding | Describes what the chart means | Yes | `Pie: weight by component` |
| Vega-Lite compiler | Converts the semantic binding into query, transforms, and encodings | No | `theta=weight`, `color=component` |

The existing `ChartSpec.encodings` should remain useful as a renderer-level compatibility representation, but it should not be the primary source of meaning for Cube-backed charts.

## 3. Canonical Cube Model

### 3.1 Schema

```ts
type CubeDimension = {
  id: string;
  label: string;
  type: "nominal" | "ordinal" | "temporal";
  levels?: Array<{
    id: string;
    label: string;
    members: string[];
  }>;
  members: Array<{
    id: string;
    label: string;
    order?: number;
    parentId?: string;
  }>;
};

type CubeAggregation = "sum" | "avg" | "min" | "max" | "count" | "distinct" | "none";

type CubeMeasure = {
  id: string;
  label: string;
  type: "quantitative";
  unit?: string;
  grainDimensionIds: string[];
  aggregation: {
    default: CubeAggregation;
    additivity: "additive" | "semi-additive" | "non-additive";
    nonAdditiveDimensionIds?: string[];
  };
  groupId?: string;
  expression?: {
    language: "formula";
    formula: string;
    dependencies: string[];
  };
};

type CubeSchema = {
  version: 1;
  id: string;
  dimensions: CubeDimension[];
  measures: CubeMeasure[];
  measureGroups?: Array<{
    id: string;
    label: string;
    measureIds: string[];
  }>;
};

type CubeCell = {
  coordinates: Record<string, string>;
  values: Record<string, number | null>;
};

type CubeResult = {
  schema: CubeSchema;
  cells: CubeCell[];
};
```

`CubeCell.coordinates` identifies the grain. `CubeCell.values` contains one or more measures at that grain. A Cube may therefore represent either a breakdown dimension or a set of measures without changing the chart renderer.

### 3.2 Wide CSV conversion

For a CSV with:

```text
person,date,weight_kg,water_kg,fat_kg,muscle_kg,minerals_kg
```

the importer may produce:

```text
person × date × component -> weight
```

where the converter maps:

```text
water_kg    -> component=water,    measure=weight
fat_kg      -> component=fat,      measure=weight
muscle_kg   -> component=muscle,   measure=weight
minerals_kg -> component=minerals, measure=weight
```

Alternatively, a CSV such as:

```text
region,month,revenue,cost,profit
```

may remain at:

```text
region × month -> revenue, cost, profit
```

The semantic binding layer must support both forms.

## 4. Semantic Binding

### 4.1 Source references

```ts
type CubeDimensionSelection = {
  kind: "dimension";
  dimensionId: string;
  memberIds?: string[];
  levelId?: string;
};

type CubeFilter =
  | {
      kind: "members";
      dimensionId: string;
      memberIds: string[];
      mode: "include" | "exclude";
    }
  | {
      kind: "range";
      dimensionId: string;
      minimum?: string | number;
      maximum?: string | number;
    };

type CubeValueSelection =
  | {
      kind: "measure";
      measureId: string;
    }
  | {
      kind: "measure-set";
      groupId?: string;
      measureIds: string[];
    };

type CubeDerivedSeriesSelection = {
  kind: "value-series";
  valueSlot: "x" | "y" | "value" | "theta" | "radius" | "cell";
};

type CubeBindingSource =
  | CubeDimensionSelection
  | CubeValueSelection
  | CubeDerivedSeriesSelection;
```

`measure` covers one value such as `weight`. A separate dimension slot supplies its breakdown, such as `component`. `measure-set` covers `revenue/cost/profit` when those are separate measures with no explicit breakdown dimension. A `measure-set` produces a derived `seriesKey`, which can be referenced through `value-series`.

### 4.2 Chart binding

```ts
type SemanticBindingSlot =
  | "x" | "y" | "value" | "theta" | "radius" | "cell"
  | "category" | "series" | "group" | "segment" | "slice" | "ring"
  | "row" | "column";

type CubeChartBinding = {
  version: 1;
  sourceId: string;
  slots: Partial<Record<SemanticBindingSlot, CubeBindingSource>>;
  filters?: CubeFilter[];
  aggregation?: Record<string, CubeAggregation>;
  visualMappings?: {
    color?: {
      sourceSlot?: SemanticBindingSlot;
      constant?: string;
      memberStyles?: Record<string, { color: string }>;
    };
    size?: {
      sourceSlot?: SemanticBindingSlot;
      constant?: number;
    };
    shape?: {
      sourceSlot?: SemanticBindingSlot;
      constant?: string;
    };
  };
  unresolvedDimensions?: Array<{
    dimensionId: string;
    policy: "filter" | "rollup" | "facet" | "detail";
  }>;
};
```

The names in `slots` are semantic template roles. They are not necessarily Vega-Lite channels. `visualMappings.color.sourceSlot = "slice"`, for example, means “use the slice keys for color”; it does not bind the component dimension a second time.

Single-measure Pie example:

```json
{
  "version": 1,
  "sourceId": "body-composition-cube",
  "slots": {
    "value": { "kind": "measure", "measureId": "weight" },
    "slice": {
      "kind": "dimension",
      "dimensionId": "component",
      "memberIds": ["water", "fat", "muscle", "minerals"]
    }
  },
  "visualMappings": {
    "color": {
      "sourceSlot": "slice",
      "memberStyles": {
        "dimension:component/member:water": { "color": "#3b82f6" },
        "dimension:component/member:fat": { "color": "#f59e0b" },
        "dimension:component/member:muscle": { "color": "#ef4444" },
        "dimension:component/member:minerals": { "color": "#64748b" }
      }
    }
  }
}
```

Measure-set Pie example:

```json
{
  "version": 1,
  "sourceId": "finance-cube",
  "slots": {
    "value": {
      "kind": "measure-set",
      "groupId": "financials",
      "measureIds": ["revenue", "cost", "profit"]
    },
    "slice": { "kind": "value-series", "valueSlot": "value" }
  },
  "visualMappings": {
    "color": { "sourceSlot": "slice" }
  }
}
```

### 4.3 Human-readable binding summaries

Every binding should produce a short semantic summary:

| Chart | Summary |
| --- | --- |
| Line | `revenue over month, split by product` |
| Grouped Bar | `revenue by region, grouped by product` |
| Stacked Bar | `revenue by region, segmented by product` |
| Pie | `weight by component: water, fat, muscle, minerals` |
| Donut | `weight by component, rings by person` |
| Matrix | `revenue by month × product` |

This summary is the binding's semantic contract and should be visible in the encoding card.

## 5. Binding Interaction

### 5.1 Cube explorer

The Cube explorer should have two dynamic trees derived from `CubeSchema`:

```text
Dimensions
  Region
    East
    West
  Product
    A
    B

Measures
  Financials
    Revenue
    Cost
    Profit
```

Dimensions, measure groups, individual measures, and selected member sets are draggable binding sources. The UI does not synthesize fixed `person/date/weight` columns.

### 5.2 Template slots

When a Card is selected, the Encoding Card shows semantic slots in two sections:

```text
DATA
  Value       Weight (sum)
  Breakdown   Component: Water, Fat, Muscle, Minerals

APPEARANCE
  Color       By Breakdown
              Water     [swatch]
              Fat       [swatch]
              Muscle    [swatch]
              Minerals  [swatch]
```

Slot compatibility is determined by the template contract:

| Dropped source | Compatible slots |
| --- | --- |
| Dimension | category, series, group, segment, slice, ring, row, column; Cartesian x/y when allowed |
| Measure | value, x, y, theta, radius, cell |
| Measure group / selected measure set | value slots that support a derived series |
| Dimension member subset | Same dimension slots, with `memberIds` preconfigured |

Dropping a dimension opens its member selector. Dropping a measure group opens its measure selector. Appearance controls are generated only after the data slot has a stable series source.

The contract should be data-driven rather than implemented as conditions inside the UI:

```ts
type TemplateSlotContract = {
  id: SemanticBindingSlot;
  label: string;
  required: boolean;
  accepts: Array<"dimension" | "measure" | "measure-set" | "value-series">;
  supportsMemberSelection?: boolean;
};

type TemplateBindingContract = {
  templateId: string;
  slots: TemplateSlotContract[];
  unresolvedDimensionPolicies: Array<"filter" | "rollup" | "facet" | "detail">;
  compiler: "line" | "scatter" | "bar" | "arc" | "matrix";
};
```

This contract replaces the current assumption that every Card is fully described by a flat list of native-looking channels. It also provides one validation source for drag/drop, the Encoding Card, persistence validation, and compilation.

### 5.3 Binding workflow

1. Select or drag a measure into the Card's value slot.
2. Select a dimension, dimension members, or measure set as the breakdown.
3. Resolve remaining dimensions with filter, rollup, facet, or detail.
4. Configure colors or other styles for the resulting stable series keys.
5. Confirm the human-readable summary and preview.

## 6. Card-specific Binding Rules

| Card | Required semantic slots | Optional slots | Vega-Lite compilation |
| --- | --- | --- | --- |
| Line | `x` dimension/value, `y` measure/value | `series`, color, stroke width | `x`, `y`, `color/detail`, `strokeWidth` |
| Scatterplot | `x` dimension/value, `y` dimension/value | color, size, shape | `x`, `y`, `color`, `size`, `shape` |
| Single Bar | `category` dimension, `value` measure | `color`, `size` | `x`, `y` with aggregate |
| Grouped Bar | `category` dimension, `value` measure, `group` dimension | member colors | `x`, `xOffset`, `y`, `color` |
| Stacked Bar | `category` dimension, `value` measure, `segment` dimension | normalization | `x`, `y(stack)`, `color` |
| Divergent Bar | `category` dimension, signed `value` measure | `color` | normal bar with signed scale domain |
| Divergent Stacked Bar | `category`, signed `value`, `segment` | normalization | stacked bar with signed values |
| Pie | `value` measure/measure-set, `slice` dimension or derived value series | member colors, radius | `theta`, `color/detail`, `filter` |
| Donut | `value` measure/measure-set, `slice` dimension or derived value series | `ring`, member colors, radius | `theta`, `color/detail`, `innerRadius`, ring transform |
| Matrix | `row`, `column`, `cell` measure/value | color dimension, filters | `y`, `x`, `color` |

## 7. Normalization Before Vega-Lite Compilation

The compiler first converts every `CubeValueSelection` into a common long-form stream. Generated fields use reserved, collision-safe names rather than assuming that the source does not already contain `value` or `seriesKey`:

```text
coordinates... | __cv_series_key | __cv_value | __cv_measure_id | __cv_dimension_id
```

Examples:

```text
person | date    | component | __cv_series_key | __cv_value
P1     | 2026-01 | water     | water           | 38.4
P1     | 2026-01 | fat       | fat             | 18.6
```

and:

```text
region | month | __cv_measure_id | __cv_series_key | __cv_value
East   | Jan   | revenue        | revenue         | 120
East   | Jan   | profit         | profit          | 20
```

This is equivalent to Vega-Lite's `fold` output, but it happens as a Cube query/normalization step. Vega-Lite or the existing renderer receives stable generated value and series fields instead of raw CSV columns.

### 7.1 Selection semantics

| User action | Cube operation |
| --- | --- |
| Choose a measure | Select one `CubeMeasure` |
| Choose a breakdown | Add a dimension to `groupBy` / `seriesKey` |
| Check members | Add a dimension-member filter |
| Pick a color per member | Build a stable `domain -> range` style mapping |
| Leave a dimension unresolved | Require an explicit `filter`, `rollup`, `facet`, or `detail` policy |
| Choose sum/average | Validate against measure grain and aggregation metadata |

## 8. Vega-Lite Compiler Mapping

| Semantic binding | Vega-Lite output |
| --- | --- |
| Value measure | `{ field: "__cv_value", type: "quantitative", aggregate }` |
| Category dimension | `{ field: "<dimensionId>", type: "nominal" }` |
| Temporal dimension | `{ field: "<dimensionId>", type: "temporal" }` |
| Series / group dimension | `color`, `detail`, `xOffset`, or `yOffset` depending on Card |
| Slice dimension | `color` plus `theta` value |
| Measure set | normalized `__cv_series_key` + `__cv_value` fields |
| Member filter | `transform.filter` or query predicate before compilation |
| Member colors | discrete scale `domain` and `range` |
| Donut | `mark: { type: "arc", innerRadius: ... }` |
| Matrix | `x`, `y`, `color` on `rect`; never Vega-Lite facet `row/column` |

## 9. Invariants

1. A chart binding references Cube identities, never positional column indexes.
2. One semantic source may compile to multiple Vega-Lite channels. For example, Grouped Bar's group dimension compiles to both `xOffset` and `color`.
3. One Vega-Lite channel receives one normalized field. Multiple source measures are normalized before compilation.
4. Member colors are keyed by qualified stable ids such as `dimension:component/member:water` or `measure:revenue`, never array indexes.
5. Total measures and component measures cannot be selected into the same additive composition unless the schema explicitly declares the relationship.
6. Every unbound Cube dimension has an explicit policy: filter, rollup, facet, or detail.
7. Aggregation is validated using measure grain and additivity metadata; semi-additive or non-additive measures must not silently use `sum` across invalid dimensions.
8. The rendered `ChartSpec.encodings` is a derived compatibility artifact, not the source of semantic truth.

## 10. Migration Path

1. Add a `CubeResult` adapter that can produce the schema/cell representation from the current `Dataset`.
2. Replace hard-coded `CubeDimension` values with dynamic schema dimensions and measures.
3. Add `CubeChartBinding` to `ChartSpec` while retaining existing `encodings` during migration.
4. Normalize `measure + breakdown` and `measure-set` selections to `value + seriesKey` rows.
5. Compile normalized rows to Vega-Lite-style `x/y/theta/color/xOffset` encodings.
6. Make the Encoding Card render semantic roles and member selectors; show native channel names only in diagnostics.
7. Remove Pie's primary dependency on `angleFields[]` after compatibility data can be migrated.
