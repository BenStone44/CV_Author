# 图表数据粒度、唯一性与嵌套继承

本文档定义图表 contract 在数据物化、唯一性和 nested composition 中的
语义。实现位于
[`chartContracts.ts`](../cv-author-app/src/utils/chartContracts.ts)、
[`chartDataPipeline.ts`](../cv-author-app/src/utils/chartDataPipeline.ts) 与
[`useCanvasStore.ts`](../cv-author-app/src/stores/useCanvasStore.ts)。

## 基本模型

Channel 只预先声明它可接受的列类型：`N` 为 nominal，`O` 为 ordinal
（包括兼容规则允许的 temporal），`Q` 为 quantitative。`*` 表示当前
renderer 所需的最小绑定，`+` 表示该 channel 可绑定多个字段。

字段绑定之后，系统才解析它在本次物化中的角色。解析为 dimension 的
字段集合记为 `D(B)`；解析为 measure 的字段提供某个维度组合的数值。
因此 dimension/measure 不是 `x`、`y`、`color` 等 channel 的永久属性。

每个 contract 声明 `dataMode`：

| 模式 | 原始行的含义 | 通用唯一性 |
| --- | --- | --- |
| `grouped-scalar` | 一个 dimension 元组物化为一个标量 mark。 | `unique(D(B))` |
| `record` | 一条原始记录物化为一个 mark 或 path。允许重叠。 | 无 |
| `distribution` | dimension 元组形成一组观测，但组内值保留以计算分位数等统计量。 | 无 |
| `derived` | 先产生 bin、网格或插值场，再渲染其派生结果。 | 无 |
| `relational` | 行表示节点、边或父子关系。实体 ID 与关系有效性单独验证。 | 无 |

只有解析结果为 `grouped-scalar` 时，才应用
`unique(D(B))`。重复原始行会通过用户选择的 aggregation 合并；当不允许
aggregation 时，重复元组是明确的 grain conflict，不能用其他列替换。

## 各图表 Contract

### Grouped Scalar

这些图表按已绑定 dimension 的完整元组分组，产生一个标量 mark。`D(B)`
不是预先写死的 `x`、`color` 列表；它由当前绑定中实际解析为 dimension 的
字段组成。

| Chart type | 可接受 channel 类型 | 物化粒度 |
| --- | --- | --- |
| `LineGraph` | `x`: N/O/Q*; `y`: O/Q*; `color`: N/O; `size`: Q; `shape`: N | 每个 dimension 元组一个 line value；典型情况是 `x`，有 series 时为 `x x series`。 |
| `MultiLineChart` | `x`: N/O/Q*; `y`: O/Q*+; `color`: N/O; `size`: Q; `shape`: N | 每个 dimension 元组一个 line value；多 measure 可先物化 measure identity 作为派生 series dimension。 |
| `AreaChart` | `x`: N/O/Q*; `y`: Q*; `color`: N/O | 每个 dimension 元组一个 area value。 |
| `StackedAreaChart` | `x`: N/O/Q*; `y`: Q*; `color`: N/O* | 每个 dimension 元组一个 stacked area value。 |
| `Streamgraph` | `x`: N/O/Q*; `y`: Q*; `color`: N/O* | 每个 dimension 元组一个 stream value。 |
| `HorizonChart` | `x`: N/O/Q*; `y`: Q*; `color`: N/O* | 每个 dimension 元组一个 horizon value。 |
| `SingleBarChart` | `x`: N/O*; `y`: Q*; `color`: N/O/Q; `size`: Q | 每个 dimension 元组一个 bar。 |
| `GroupedBarChart` | `x`: N/O*; `y`: Q*; `color`: N/O*; `size`: Q | 通常为 `x x group` 的一个 bar。 |
| `StackedBarChart` | `x`: N/O*; `y`: Q*; `color`: N/O*; `size`: Q | 通常为 `x x segment` 的一个 stacked segment。 |
| `DivergentBarChart` | `x`: N/O*; `y`: Q*; `color`: N/O/Q; `size`: Q | 每个 dimension 元组一个 signed bar。 |
| `DivergentStackedBarChart` | `x`: N/O*; `y`: Q*; `color`: N/O*; `size`: Q | 每个 dimension 元组一个 signed stacked segment。 |
| `PieChart` | `theta`: Q; `segment`: N/O/Q*+; `radius`: Q | 每个 dimension 元组一个 slice；典型为 segment。 |
| `DonutChart` | `theta`: Q; `segment`: N/O/Q*+; `radius`: Q | 每个 dimension 元组一个 donut slice。 |
| `RadialBarChart` | `theta`: Q; `segment`: N/O*; `radius`: Q*; `color`: N/O/Q | 每个 dimension 元组一个 radial bar。 |
| `MatrixDiagram` | `x`: N/O*; `y`: N/O*; `color`: N/Q | 每个 dimension 元组一个 cell，典型为 `x x y`。 |
| `Calendar` | `date`: O*; `value`: Q*; `color`: N/Q | 每个 dimension 元组一个 daily cell。 |
| `Chord` | `source`: N/O/Q*; `target`: N/O/Q*; `value`: Q; `color`: N/Q | 每个 dimension 元组一个聚合后的 directed flow。 |
| `Sankey` | `source`: N/O/Q*; `target`: N/O/Q*; `value`: Q; `color`: N/Q | 每个 dimension 元组一个聚合后的 directed flow。 |

### 条件模式、记录、分布与派生图表

| Chart type | 可接受 channel 类型 | 数据模式与约束 |
| --- | --- | --- |
| `Scatterplot` | `x`: N/O/Q*; `y`: N/O/Q*; `color`: N/O/Q; `size`: Q | 默认 `record`。当 `x` 和 `y` 都解析为 dimension 时切换为 `grouped-scalar`，应用 `unique(x, y)` 并将重复坐标物化为一个点；任一坐标为 measure 时保留逐行点和重叠。 |
| `ParallelCoordinatesPlot` | `dimensions`: N/O/Q*+; `color`: N/O/Q | `record`；每行一条 polyline，`dimensions` 选择轴而非记录 key。 |
| `Boxplot` | `x`: Q*; `y`: Q*; `color`: N/Q | `distribution`；按 dimension 分组，但必须保留所有 `y` 值计算 quartile/whisker。 |
| `Contour` | `x`: Q*; `y`: Q*; `color`: Q* | `derived`；网格冲突与 interpolation 由 contour transform 验证，不使用通用 uniqueness。 |
| `Hexbin` | `x`: Q*; `y`: Q* | `derived`；原始点先进入 hexagonal bins，重复坐标有效。 |

### 关系图表

| Chart type | 可接受 channel 类型 | 关系约束 |
| --- | --- | --- |
| `Icicle` | `key`: N/O/Q*; `parent`: N/O/Q*; `value`: Q; `color`: N/Q; `size`: Q | 节点 ID 为 `key`；`parent` 必须可解析、每节点至多一个 parent，并满足 root/acyclic 规则。 |
| `Sunburst` | 同 Icicle | 同 Icicle。 |
| `Treemap` | 同 Icicle | 同 Icicle。 |
| `Dendrogram` | `key`: N/O/Q*; `parent`: N/O/Q*; `value`: Q; `color`: N/Q; `size`: Q; `category`: N/O/Q | `category` 仅影响 leaf order，不参与节点 identity。 |
| `RadialDendrogram` | `key`: N/O/Q*; `parent`: N/O/Q*; `theta`: N/O/Q; `color`: N/Q; `size`: Q | `theta` 仅影响 leaf order，不参与节点 identity。 |
| `ForceDirectedGraph` | `key`: N/O/Q; `source`: N/O/Q*; `target`: N/O/Q*; `value`: Q; `color`: N/O/Q; `size`: Q | nodes 与 edges 是不同实体。默认 nested context 为 node `key`。 |
| `GraphLink` | `source`: N/O/Q*; `target`: N/O/Q*; `value`: Q; `color`: N/O/Q; `size`: Q | 每行是 directed link；parallel links 可由关系 contract 决定是否允许。 |
| `GraphLinkPolar` | 同 GraphLink | 同 GraphLink。 |

## Nested 的默认筛选继承

Nested relationship 不把 inherited context 写回 child 的可编辑
`dataTransforms`；它保存在 relationship 的
`InheritedFilterContext[]` 中，并在 child materialization 时与 child-local
filters 以 AND 组合。detach relationship 时，这些 inherited filters 随关系
消失，child-local transforms 保持不变。

默认策略由 parent contract 的 `nestedContext` 声明：

| Parent 策略 | 继承字段 | 取值来源 |
| --- | --- | --- |
| `bound-dimensions` | 已解析为 parent dimension 的完整 `D(B)`。 | 被嵌套 parent mark 的 materialized row 中对应的原始列值。 |
| `node-id` | parent 的 `key` field。 | 被嵌套 graph/tree node 的原始 node ID。 |
| `none` | 无默认筛选。 | 无。 |

继承的是 CSV/物化数据中的 **column value**，不是视觉编码结果。也就是说，
它不会继承屏幕位置、bar 宽度、颜色、axis scale、D3 arc angle 或 label。
父子必须使用同一 dataset identity，且 child 中存在同名、类型兼容的列；否则
relationship 解析为 `UNRESOLVABLE`，不会猜测替代字段。

对于 grouped-scalar parent，默认规则非常直接：child 接收 parent 的完整
`D(B)` 等值筛选。

```text
parent grouped mark -> D(B) column values -> child equality filters
```

例如：

- Single Bar 的 parent mark 来自 `x = "2025"`，child 默认继承
  `x == "2025"` 对应的原始字段和值。
- Stacked Bar 的 parent mark 来自 `x = "2025"` 和
  `color = "North"` 两个 dimension，child 默认继承这两个字段的等值条件。
  这里的 `color` 指绑定的 CSV 列和值，而不是最终绘制出来的色值。
- ForceDirectedGraph 中 child 嵌入某个 node 时，只继承该 node 的 `key`
  原始值；不会把 edge 的 `source`、`target` 或力导向坐标当作默认筛选。

child 已有相同字段的 `nest-clue` 会被具体 parent 值填充。child 的 hard
filter 与继承值冲突时，系统必须暴露 conflict，而不能静默覆盖任一侧。

## Contract 表示

静态的下列表示不足以表达绑定后 grain：

```ts
uniqueness?: { channels: string[] }
```

实现使用 data mode、条件模式和 nested policy。概念上对应：

```ts
type ChartDataMode =
  | "grouped-scalar"
  | "record"
  | "distribution"
  | "derived"
  | "relational";

type ChartGrainContract = {
  dataMode: ChartDataMode;
  dataModeConditions?: Array<{
    dimensionChannels: ChartEncodingChannel[];
    resolveAs: ChartDataMode;
  }>;
  nestedContext: "bound-dimensions" | "node-id" | "none";
};
```

因此 compatibility 和 aggregation 均先解析 binding 的 mode，再应用该 mode
的通用规则，而不是在算法中为某个 chart name 写特殊分支。
