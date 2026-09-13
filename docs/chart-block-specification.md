# Chart Block Specification

状态：实现规范
版本：2
日期：2026-09-11

## 1. 目标

每一种可放入 Block List 的图表只由两个入口定义：

1. `BlockSpecification`：纯数据、可检查、可序列化的完整能力声明。
2. `ChartBlockTemplate`：继承统一基类的运行时模板，持有 specification，并负责创建默认实例和调用 renderer。

数据验证、字段容量、聚合、外部轴、组合兼容性、drop area、Nested target、family、preview 和 renderer 选择都必须从 specification 得到。业务模块不得再通过图表名称猜测这些能力。

`ChartBlockTemplate` 对象只作为不可变单例存在于 registry 中。Vue store、undo/redo 和持久化文件只保存普通 JSON；迁移完成后使用 `ChartBlockInstanceSpec`，兼容期仍可读取旧 `ChartSpec`，但任何阶段都不保存 class instance 或函数。

## 2. 领域边界

```text
ChartBlockTemplate registry
  -> BlockSpecification
       -> validate data and complete bindings
       -> resolve external spatial references
       -> enumerate legal composition intents
       -> materialize drop areas from instance geometry
  -> create ChartBlockInstanceSpec
       -> materialize raw CSV view
       -> render through the declared renderer

ChartBlockInstance | CompositeBlockInstance
  -> ResolvedComposableSurface
  -> may participate in another composition as one complete unit
```

以下状态不得写入 `BlockSpecification`：当前 dataset、用户绑定、filter、画布位置、计算后的 scale、plot bounds、render error 和选中状态。这些分别属于 instance spec、resolved render state 或 Canvas projection。

## 3. BlockSpecification

一个 block specification 必须包含：

- 稳定 block ID、schema/revision 和旧 chart type aliases。
- 非互斥 family 列表。
- 输入结构：tabular、hierarchy、graph 或 geographic。
- 完整 role contract：类型、最小/最大字段数、复用、基数和结构约束。
- materialization mode、aggregation policy 和 functional-dependency/uniqueness policy。
- semantic role 到 renderer channel 的映射。
- 坐标空间和全部 spatial reference。
- 每个 spatial reference 的语义、物理位置、domain resolver 和兼容策略。
- Layer/Concat/Facet/Nested 能力及全部 drop area 描述。
- progressive Enter 后可见的 structural target 和其 inherited context roles。
- renderer、preview、默认尺寸和可升级 block；默认 instance binding/transform 由对应 template 创建。

Specification 使用参数化几何而不是持久化绝对坐标。比如 `outside-edge-band` 声明相对哪个轴边界、固定屏幕 gap 和厚度规则；运行时用当前 frame、zoom 和 scale 解析成 `Bounds`。这保证 drop overlay 与 hit testing 使用同一几何来源。

## 4. Spatial references and drop areas

### 4.1 Reference kinds

- `axis`：Cartesian X/Y 或 Polar Angle/Radius。
- `derived-axis`：由结构生成的轴，例如 Dendrogram terminal leaves。
- `geographic-projection`：Mapbox/deck.gl 共享投影。
- `anchor-set`：可重复 mark/node 的 Nested anchor。
- `inherited`：本身没有独立位置，从另一 block 获得位置，例如 graph links。

每个 reference 声明以下性质：

- `exposure`: `external`、`internal` 或受条件限制的 `conditional`。
- `domain`: 字段、terminal leaves、hierarchy depth、projection 或 inherited positions。
- `compatibility`: categorical exact order、quantitative structural、tree leaf、hierarchy depth、geographic projection 或 inherited position。
- `placement`: 物理 channel、边界、方向和可视 axis presentation。

### 4.2 Drop-area rules

每个 drop area 声明：

- composition operation。
- geometry primitive 和 anchor reference。
- 共享 reference。
- before/after placement。
- 固定屏幕 gap 和参数化 thickness。
- availability condition。
- exclusive group。

Layer body 与 Concat area 必须几何互斥，并保持 10 screen pixels 的 neutral gap。Enter 是 scope navigation，不属于 composition；只有 Enter portal 可以覆盖 body，并明确先于 Layer 完成 scope transition。所有合法非 Nested areas 必须完整枚举；Nested 只呈现当前解析目标。

## 5. Tree special axes

Tree 的 leaf axis 和 depth axis 是不同的 spatial references：

| Block state | Leaf reference | Leaf boundary | Depth reference |
| --- | --- | --- | --- |
| Dendrogram `right` | Y | right terminal boundary | internal X |
| Dendrogram `left` | Y | left terminal boundary | internal X |
| Dendrogram `down` | X | bottom terminal boundary | internal Y |
| Dendrogram `up` | X | top terminal boundary | internal Y |
| RadialDendrogram | Angle | terminal outer circle | internal Radius |

Leaf domain 从 `key`/`parent` 关系中的 terminal nodes 得到。Cartesian Tree 按 `category`、再按 `key` 排序；Polar Tree 按 `theta/angle`、再按 `key` 排序。即使 key 为数字，它仍然是 categorical structural domain。

普通 Tree Concat 只开放 leaf reference 对应的 Cartesian 方向，不开放 depth 方向：

- right/left Dendrogram 在 left 与 right 外侧产生 horizontal Concat area，共享 Y；可见 leaf axis 仍位于各自 terminal boundary。
- down/up Dendrogram 在 top 与 bottom 外侧产生 vertical Concat area，共享 X；可见 leaf axis 仍位于各自 terminal boundary。
- RadialDendrogram 只在 outer annulus 产生 radial Concat area，共享 Angle。

Tree 的 Layer body 也只能共享 leaf reference，不能把内部 depth reference 当成另一条普通轴。

Depth reference 默认是 internal，不能与普通图表 Layer/Concat。唯一例外是 Sunburst 与 RadialDendrogram 的显式 `hierarchy-depth` Angular Concat。该条件 reference 共享 Radius，domain 使用最大可见深度和共同 outer radius，不通过节点名称推断层级。

Tree leaf axis 是 structural axis。其 tick position 是 terminal-node center，label 是 terminal-node label，baseline 可以不绘制。Concat 后 shared axis 仍归 Tree 所有并位于 terminal boundary；companion view 只对齐到该 domain，不创建 union domain。

## 6. Data and composition decisions

### 6.1 Unified role bindings: long and wide tables

Long/wide is not a permanent property of a Dataset. The same raw CSV can be
long-form for one block and require a chart-local fold for another. Every role
therefore declares its allowed `bindingModes` in the block specification:

- `field`: zero/one direct CSV field.
- `fold`: an explicit set of two or more source fields becomes derived key/value
  rows.
- `repeat`: an explicit field set remains separate, as in Parallel Coordinates;
  no fold is performed.

The Encoding Config panel must not decide these modes from chart names. It
uses one dropdown component for every role. A `field`-only role shows radio
selection in the dropdown; a role declaring `fold` or `repeat` shows checkboxes
in that same dropdown and, only when the specification permits more than one
materialization, a materialization selector. Candidate compatibility, minimum
and maximum selection count, and available materializations all come from the
registered block role. The panel emits one mutation shape:

```ts
{
  roleId: ChartEncodingChannel
  fields: string[]
  materialization: "direct" | "fold" | "repeat"
}
```

One selected field uses `field` when that mode exists. Multiple selected fields
use the declared `fold` or `repeat` mode. If both are legal, the user chooses
explicitly; no dataset-wide long/wide checkbox and no unrelated field scan is
allowed.

The panel does not call a store-specific encoding branch. Its mutation is sent
to the registered `ChartBlockTemplate.configureRoleBinding()`, which compiles
the selection against that template's own specification. New canvas charts are
also initialized through `ChartBlockTemplate.createChartSpec()`, retaining
`blockId` and `blockRevision` in authored JSON. Thus creation and later encoding
configuration share the same template boundary while the class instance itself
remains outside persistence and undo state.

`SingleBarChart` also declares `field + fold` for its Y role. Selecting several
wide quantitative columns produces one generated series and uses the
specification's `grouped-series` presentation. Grouped and stacked bar blocks
declare their own fold presentation rather than relying on a panel checkbox or
chart-name branch.

Fold execution is represented only by an ordered `ChartFoldTransform` in
`ChartSpec.dataTransforms`. Its `sourceFields`, stable key/value outputs and
`operation: "fold"` lineage are explicit. The role binding references those
derived outputs and the transform ID; it does not duplicate the source-field
set. Execution order is:

```text
raw CSV -> inherited context -> filters -> fold -> aggregate/bin -> bindings -> renderer
```

For Grouped Bar, Stacked Bar, Multi-Line and other multi-series blocks, `series`
is a first-class data role. A long table binds one categorical field directly
to `series`; a wide-table Y selection folds column names into the same `series`
role and values into Y. Fold must not use `color` as its key role. `color`, line
style and stroke width belong to `seriesPresentation.itemProperties` and are
edited per resolved Series/Legend item. They are not additional CSV bindings
unless a different block explicitly declares a field-encoding role for them.

`Group item`, `Segment item`, `Stack item`, and `Series` were presentation
labels for this same role. The specification and Encoding Config now expose
one `Series` label. Grouped, stacked and line behavior is selected by
`seriesPresentation.layout`; it does not create chart-specific binding state.

If fold would generate a key role such as `series` or `segment` that already has
an explicit binding, the mutation reports a conflict. It must not clear the
existing binding, substitute a field, or choose a preferred interpretation.

New panel mutations use `roleBindings`; legacy `valueFields`, `angleFields`,
`parallelFields`, `series`, and `seriesFields` are read through the centralized
binding adapter when a saved chart has not yet been migrated. Temporary
renderer projections are produced at the mutation/materialization boundary and
must not become another capability source. Some existing renderer, inference,
and saved-document consumers still read those projections during the migration
period; they are compatibility work, not block capability declarations.

`validateBlockData(specification, instanceSpec, dataset)` 检查完整 proposed binding，并返回：

- `VALID`
- `DIMENSION_OVERFLOW`
- `DIMENSION_UNDERFLOW`
- `TYPE_MISMATCH`
- `UNRESOLVABLE`

它必须检查 role count、type、field reuse、cardinality、partition、aggregation 和 functional dependency。互动式 column drop 只验证被拖入的 `inputColumn`，不扫描其他字段替代。

`enumerateCompositionIntents(source, target)` 首先要求两个 atomic block 都是 `VALID`，然后：

1. 从当前 scope 解析 target specification 的全部 drop areas。
2. 从 source/target 解析 external spatial signatures。
3. 按 drop area 指定的 shared references 检查 compatibility。
4. 返回全部合法 intent，不评分、不排序、不截断。
5. commit 使用产生 visible drop area 的同一 source、target、reference 和 geometry。

## 7. Instance and composite persistence

Atomic instance 保存：

- `blockId` 和 `blockRevision`。
- dataset identity。
- role bindings。
- ordered `dataTransforms`。
- local coordinate state 和 appearance。
- renderer options。

Resolved scale、axis signature、drop bounds 和 mark geometry 是可重算状态，不写入 authored block specification。

Composite instance 继续以 member/root ID 建立 Layer、Concat、Facet 和 Nested 关系。外层 composition 只消费 child root 的 `ResolvedComposableSurface`；未 Enter 时不得读取其内部 leaf members。

## 8. Source layout

```text
src/chart-blocks/
  model.ts                 # specification, instance and result types
  ChartBlockTemplate.ts    # inheritable base class
  registryCore.ts          # registry implementation
  registry.ts              # unique block registry
  spatial.ts               # reference and drop-area resolvers
  validation.ts            # complete binding validation
  composition.ts           # specification-level composition gate

src/utils/
  chartContracts.ts        # core block specifications + legacy data projection
  geographicLayerCards.ts  # geographic block specifications + catalog projection
```

每个 block 最终只暴露：

```text
<block>/specification.ts
<block>/template.ts
```

共享 renderer 可以被多个 template 调用，但不能成为隐藏的 chart capability source。

## 9. Migration requirements

- 旧 `ChartContract`、catalog category 和 renderer lookup 必须由 registry 投影，而不是维护第二份定义。
- legacy `ChartSpec` 通过 `ChartBlockTemplate.fromLegacyChartSpec` 转换；在现有保存格式完成迁移前，兼容 store 仍可保存旧结构，但不得成为 block capability source。
- `dataTransforms` 是唯一的新 transform source。旧 filter 字段只允许在 adapter 中读取。
- 宽表选择必须编译为带 lineage 的 `fold` data transform；`repeat` 只表达字段集合，不改变 raw rows。
- Encoding Config 只消费 role `bindingModes`，不得按 Pie、Line、Area、Bar 或 Parallel 名称选择控件或 materialization。
- 所有 core、hierarchy、graph 和 geographic catalog entries 都必须有唯一 registered block。
- registry 必须验证 block ID、alias、renderer、family、role、reference 和 drop-area 引用完整性。
- Tree、Polar、Geographic 和 CoordinateFree 必须进入同一 instance coordinate union，不能回退成 Cartesian。
