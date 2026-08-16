# Channel Resolution

本文档说明用户在 Encoding Panel 或 Data Cube 中设定 Channel 后，系统如何得到唯一、可渲染的 `ChartSpec`。这里的 **resolution** 只回答“每个 Channel 最终绑定哪个字段”；字段组合是否具有正确的数据粒度，则由 Compatibility Engine 继续判断。

## 1. 两阶段判断

| 阶段 | 核心问题 | 典型错误 |
| --- | --- | --- |
| Channel Resolution | X、Y、Series 等 Channel 的唯一 source 是什么？各状态表示是否一致？ | native encoding 与 Cube slot 不一致、同一字段占两个数据 Channel、旧 Series 残留 |
| Compatibility | 已解析的字段组合能否表达目标模板语义？ | Single Line 出现重复 X、Contour 不是规则网格、Hierarchy 不构成单根树 |

例如 Case 1 的 `time -> X` 和 `weight_kg -> Y` 可以完成 Channel Resolution，因为两个 Channel 都有明确字段；但它仍不能通过 Single Line Compatibility，因为一个 `time` 对应 5 个 `weight_kg`。加入 `person -> Series` 后，Multi-Line 的 `X × Series` 才与事实粒度一致。

## 2. ChartSpec 中的三层表示

同一个语义绑定可能出现在三处：

| 表示 | 用途 | 例子 |
| --- | --- | --- |
| Native encoding | renderer 使用的可视 Channel | `encodings.x = time` |
| Template-specific state | 多字段或变体专用结构 | `angleFields = [water, fat]`、`series = person` |
| Cube semantic slot | Data Cube 的数据角色、members 和 aggregation | `slots.x = time`、`slots.series = person` |

这些表示不是三个独立选择。一次用户操作只有一个语义 source，系统必须同步更新相关表示。若旧项目中的多个表示指向不同字段，系统返回 `conflicting-sources`，而不是静默选择其中一个。

## 3. Channel 到存储位置的映射

| Template | 可见 Channel | Native / specialized state | Cube slot |
| --- | --- | --- | --- |
| Single Line | X | `encodings.x` | `x` |
| Single Line | Y | `encodings.y` | `y` |
| Multi-Line | Series | `series` + `seriesFields` | `series` |
| Bar | Category | `encodings.x` | `category` |
| Grouped Bar | Group | `encodings.color` | `group` |
| Stacked Bar | Segment | `encodings.color` | `segment` |
| Matrix | Column | `encodings.column` + X alias | `column` |
| Matrix | Row | `encodings.row` + Y alias | `row` |
| Matrix | Cell value | `encodings.value` | `cell` |
| Pie / Donut | Theta | `angleFields` | `theta` |
| Pie / Donut | Slice | `encodings.color` + X alias | `slice` |
| Pie / Donut | R | `encodings.radius` | `radius` |
| Parallel Coordinates | Numeric dimensions | `parallelFields` | 当前无 Cube slot |
| Hierarchy / Calendar / Flow | 模板专用 Channel | `encodings.*` | 当前无 Cube slot |

Matrix 和 Polar 中的 X/Y 是历史 renderer alias，不是额外 Channel。Resolver 会把同一 alias 组视为一个语义 Channel，并要求别名值一致。

## 4. 一次设定操作的处理顺序

1. 从具体 Card 的 Channel config 读取允许的数据类型，而不是只读取共享 renderer contract。
2. 验证字段存在且类型合法。例如 Multi-Line Series 接受 nominal 或 temporal dimension，不接受 quantitative measure。
3. 检查该字段是否已经占用另一个互斥的数据 Channel。样式 Channel 可以复用字段，位置、分组和数值 Channel 不可以。
4. 更新 native encoding 或 template-specific state。
5. 若该 Channel 有 Cube slot，以同一个 source 同步更新 slot。普通 Cartesian 标量轴仍只接收一个字段；Multi-Line、Stacked Area、Streamgraph 和 Horizon 的 Y 可以完整保存 measure-set，并同步生成 `series = value-series(y)`。
6. 删除被替换 source 不再使用的 aggregation metadata。
7. Series 字段改绑到 X/Y 时，同时清除 `series`、`seriesFields` 和 Cube `series` slot。
8. 重新执行 resolution diagnostics；存在歧义则停止渲染并记录明确错误。
9. Resolution 通过后只检查必选 Channel并更新预览。用户点击 Confirm 后，才把已确认状态交给 Compatibility Engine 判断结构约束并生成 Resolve 选项。

## 5. 当前诊断规则

### `conflicting-sources`

同一 Channel 的 native/specialized source 与 Cube slot 不一致。例如 `encodings.x = time`，但 `slots.x = person`。系统不再根据 renderer 类型选择其中一个，因为这会造成面板、摘要和最终图形表达不同含义。用户重新设定该 Channel 后，两处会被原子地改成同一字段。

### `duplicate-data-field`

同一字段占用了两个互斥数据 Channel。例如 `value -> X` 且 `value -> Y`，或 `person -> X` 且 `person -> Series`。Panel 操作会拒绝前一种重复选择；当用户明确把现有 Series 字段改绑到 X/Y 时，系统将其视为移动操作并清除旧 Series。

### 类型不匹配

具体 Card 决定类型要求。Single Bar 的 Color 是可选样式，不会被误解为 Category；Grouped Bar 的 Color 是 Group 数据 Channel。Single Line 不暴露 Series，Multi-Line 则要求 nominal/temporal Series。

### scalar 与 measure-set

模板 contract 决定 value slot 是否接受 measure-set。Multi-Line、Stacked Area、Streamgraph 和 Horizon 将多个 Y measures 保存为一个集合，并在渲染前物化为 `__cube_value__` 和 `__cube_measure__`；普通 X/Y、R 和 Cell value 仍解析为一个字段。Theta 与 Parallel dimensions 继续使用各自的多选形式。

### stale metadata

字段被替换或 slot 被清空后，如果旧 measure 已不再被任何 slot 引用，其 aggregation 会同时删除。Series 清空时只删除该 Series 对应的 decision，不再误删其他 dimension decisions。

## 6. Resolution 后的三种状态

| 状态 | 条件 | UI / renderer 行为 |
| --- | --- | --- |
| Resolved and complete | 无 resolution issue，且必选 Channel 齐全 | 可以进入 Compatibility 与 renderer |
| Resolved but incomplete | source 无冲突，但缺少必选 Channel | 保留 D3 图片占位，Confirm 不可用 |
| Ambiguous | 存在 source conflict 或 duplicate field | Confirm 不可用，renderer 保存 error，不猜测字段 |

## 7. 已覆盖的回归案例

- Panel 把 Line Y 从 `weight` 改为 `water` 时，`encodings.y` 与 Cube `slots.y` 同步替换。
- 新 Y 试图复用 X 的 `time` 时拒绝该操作，并保留原 Y。
- `person` 从 Multi-Line Series 改绑到 X 时，native Series、`seriesFields` 和 Cube Series 一起清除。
- Multi-Line 或 Stacked Area 的 Cartesian Y 接收 `[weight, water]` 时，Cube 原子保存整个 measure-set，并以 measure identity 作为派生 Series；Single Line 仍只接受一个可见 measure。
- Pie Theta 从 `weight` 改为 `fat`、Slice 从 `component` 改为 `person` 时，specialized state、aliases、Cube slots 和 renderer metadata 保持一致。
- measure source 被替换或清空后，旧 aggregation 不再残留。

对应自动化测试位于：

- `cv-author-app/src/encodingConfig.test.ts`
- `cv-author-app/src/cubeModel.test.ts`
- `cv-author-app/src/useCanvasStore.test.ts`

## 8. 与 Compatibility Engine 的统一

Channel Resolution 在编辑过程中持续保证 source 唯一和必选 Channel 完整，但不会实时调用 Compatibility Engine。用户点击 Confirm 后，统一模块才以不可变状态为输入：当前模板、用户明确设定的 Channel 绑定、成员筛选、按维度聚合决策和 Facet 决策。Compatibility 不得为了得到可行结果而把用户的字段偷偷换到另一个 Channel；例如用户指定 `id -> Parent ID` 时，引擎不能自动把它改回 `id -> Node ID`。确认后若继续修改任一绑定，上一次检查立即失效，需要再次 Confirm。

统一模块返回三层信息：当前状态为什么是 `compatible`、`incomplete` 或 `incompatible`；从当前状态可以执行的下一步动作；以及每个动作之后是否仍存在一条到达 `compatible` 的路径。界面只推荐有可行后继的动作，同时保留被剪枝动作及其失败原因用于调试。当前动作包括绑定缺失 Channel、按未表达维度聚合、按该维度 Facet，以及更换模板。

## 9. 多步 Resolve 与前瞻遍历

一次 Resolve 不一定能完成图表。例如 Grouped Bar 只有 `time -> Category` 时，Value 和 Group 都缺失。搜索器会建立如下状态图，而不是只检查当前点击在类型上是否合法：

```text
S0: Category=time
├─ Value=weight_kg
│  └─ Group=person       -> compatible
└─ Group=person
   └─ Value=weight_kg    -> compatible
```

因此两个第一步都可以推荐。相反，如果某个 nominal 字段虽然能绑定 Group，但它在当前数据中只有一个成员，后续无法满足 Group 至少两个成员的约束，这条分支会被剪枝。搜索使用规范化状态 key 防止模板切换形成环，并通过最大深度和最大状态数限制遍历规模。

每次前进都会把完整状态压入 Resolve session 的 history，而不是只记录按钮名称。`back` 弹出一个状态并重新计算该节点的可选分支；`reset` 回到根状态。这样用户可以在第二步发现不合适时回到第一步，选择另一条仍然可行的路径。Resolve session 的回退语义独立于最终提交后的全局 Canvas Undo；纯搜索阶段不会修改 `ChartSpec`。

## 10. 三类数据粒度修复

以 Case 1 的 `time -> X`、`weight_kg -> Y` 为例，Single Line 的显式 Channel 已经解析完成，但同一个 `time` 有多个人的体重值，所以违反“一 X 一 Y”。搜索器会把未表达的 `person` 识别为粒度来源，并验证三种不同语义的修复，而不是把它们都称为“解决重复值”。

**Aggregate 的语义。** 选择 `AVG over person` 表示分析对象是每个时间点的人群平均体重。`person` 不再作为可视维度，Y 仍代表 `weight_kg`，但每个 X 的多个事实被先聚合为一个值。搜索器会在模拟聚合后的 Cube 上重新检查唯一粒度。

**Series / Multi-Line 的语义。** 选择 Multi-Line 并把 `person` 绑定到 Series，表示要比较每个人随时间的体重变化。X 是时间，Y 是体重，Series 区分人；唯一性要求从“一 X 一 Y”变为每个 `X × Series` 恰好一个 Y。这是一条两步路径：先更换模板，再补齐 Series，只有第二步也可完成时第一步才会被推荐。

**Facet 的语义。** 选择 `Facet by person` 表示每个人拥有独立视图。每个子图中 X 仍是时间、Y 仍是体重；`person` 的语义由图内 Channel 移到视图划分。引擎逐个检查所有 person 分区，只有每个分区都兼容时才接受该动作。

## 11. 已执行的遍历案例

| Case | 初始状态 | 遍历结论 | 自动化结果 |
| --- | --- | --- | --- |
| Single Line 重复 X | `time -> X`, `weight_kg -> Y` | `AVG/SUM over person`、`Facet by person`、`Multi-Line -> person as Series` 均有兼容终点 | PASS |
| Grouped Bar 两个缺失 Channel | `time -> Category` | 先选 Value 或先选 Group 都可；两条路径均在第二步完成 | PASS |
| Group 成员数死分支 | `constant_group` 与 `real_group` 都是 nominal | 只有拥有两个成员的 `real_group` 保留；单成员分支因 `insufficient-members` 被剪枝 | PASS |
| 两步后回退 | 先 Value、再 Group | 连续 back 精确恢复前一步与根状态；之后可改选 Group、再选另一 Value | PASS |
| Multi-Line 状态抽取 | X、Y 存于 native encoding，Series 存于 specialized state | 统一为 `x=time, y=weight_kg, color=person` 的显式 compatibility assignment | PASS |

对应自动化测试位于 `cv-author-app/src/compatibilityResolution.test.ts`。底层 API 位于 `cv-author-app/src/compatibilityResolution.ts`，其中搜索与 session 都是纯函数；实际 UI 只有在用户执行动作时才调用现有 Canvas mutation。
