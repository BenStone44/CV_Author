# 基于勾选数据的 Chart Compatibility 重构报告

日期：2026-08-16

## 1. 结论

Compatibility Engine 现在把用户勾选的数据视为封闭输入，不再使用未勾选的 Cube 列改变图表状态、补全必选 Channel，或生成粒度修复方案。

对于原始数据 `D`、勾选字段 `F` 和勾选成员过滤 `M`，判别输入严格定义为：

```text
P = project(F, filter(M, D))
```

增加一个未勾选列 `c` 必须保持结果不变：

```text
compatibility(project(F, D))
=
compatibility(project(F, D + c))
```

这个不变性覆盖状态、Issue、Channel Assignment 和 Missing Channel。未来可以另设全局字段发现服务，但它只能给出建议，不能反向改变核心 Compatibility 结果。

## 2. 状态语义

| 状态 | 新逻辑下的含义 |
|---|---|
| `compatible` | 必选 Channel 均由勾选字段填充，类型合法，并且过滤后的实际观测满足该模板的全部数据约束。 |
| `incomplete` | 勾选字段没有填满至少一个必选 Channel。`candidateFieldIds` 只允许包含已勾选但尚未分配的字段，绝不包含全局字段。 |
| `incompatible` | 勾选字段无法合法分配，或者完整 Assignment 违反实际数据关系约束。 |

当完整 Channel Assignment 存在但违反关系约束时，Engine 优先报告这个真实冲突，不再选择一个故意留空必选 Channel 的映射来掩盖冲突。

## 3. 数据约束原语

所有关系检查均在应用勾选成员过滤之后执行：

| 约束 | 基于实际数据的定义 |
|---|---|
| Complete observation | 过滤结果中至少有一行包含全部必选 Channel 的值。 |
| Functional dependency | `K -> V` 表示每个不同的 `K` key tuple 最多对应一个不同的 `V`；完全相同的重复行不构成冲突。 |
| Minimum members | 统计过滤后真实存在的不同值，不使用 Cube Schema 中声明的全部 member 数。 |
| Repeated Series | 每个 Series member 至少跨越两个不同 X；唯一行 ID 因而不能充当 Multi-Line Series。 |
| Signed measure | 过滤后的值至少包含一个负值和一个正值。 |
| Nonnegative angle | 过滤后的 Angle 全部非负，并至少有一个正值。 |
| Minimum observations | 仅在勾选投影中统计完整观测；可按模板要求统计 distinct tuple 或保留重复观测。 |
| Hierarchy | 去重后的 Key/Parent pair 具有唯一 Key、一个 root，并且所有 Parent reference 有效。 |
| Regular grid | 勾选 X/Y pair 覆盖勾选 X domain 与 Y domain 的完整笛卡尔积。 |

## 4. 各 Chart Template 约束

| Template | 必选勾选 Channel | 实际数据约束 |
|---|---|---|
| Single Line | X、Y | `X -> Y`；同一 X 可以重复，但不同 Y 只能有一个。 |
| Multi-Line Chart | X、Y、Series | `(X, Series) -> Y`；至少两个 Series；每个 Series 至少跨两个 X。 |
| Parallel Coordinates | Numeric dimensions，至少两个字段 | 所有勾选数值轴上至少有两条完整观测。 |
| Area Chart | X、Y | `X -> Y`。 |
| Stacked Area | X、Y、Series | `(X, Series) -> Y`；至少两个 Series；每个 Series 至少跨两个 X。 |
| Streamgraph | X、Y、Series | `(X, Series) -> Y`；至少两个 Series；每个 Series 至少跨两个 X。 |
| Horizon Chart | X、Y、Series | `(X, Series) -> Y`；至少两个 Series；每个 Series 至少跨两个 X。 |
| Single Bar | Category、Value | `Category -> Value`；如果需要聚合，必须先显式物化为每个 Category 一个值。 |
| Grouped Bar | Category、Group、Value | `(Category, Group) -> Value`；至少两个 Group member。 |
| Stacked Bar | Category、Segment、Value | `(Category, Segment) -> Value`；至少两个 Segment member。 |
| Divergent Bar | Category、Value | `Category -> Value`；勾选 Value 必须跨越零点。 |
| Divergent Stacked Bar | Category、Segment、Value | `(Category, Segment) -> Value`；至少两个 Segment；Value 跨越零点。 |
| Calendar | Date、Daily value | `Date -> Daily value`。 |
| Scatterplot | X、Y | 至少两个不同的完整 X/Y 观测。 |
| Pie Chart | Angle | 所有 Angle 非负，并至少存在一个正贡献。 |
| Donut | Angle | 所有 Angle 非负，并至少存在一个正贡献。 |
| Matrix | Row、Column | 如果选择 Cell value，则 `(Row, Column) -> Cell value`。 |
| Box Plot | X、Y | 至少五条完整观测以形成分布。 |
| Contour | X、Y、Grid value | X/Y 是完整网格，并满足 `(X, Y) -> Grid value`。 |
| Hexbin | X、Y | 至少两条完整的定量 X/Y 观测。 |
| Icicle | Node ID、Parent ID | 勾选 pair 构成合法的单 root adjacency hierarchy。 |
| Sunburst | Node ID、Parent ID | 勾选 pair 构成合法的单 root adjacency hierarchy。 |
| Treemap | Node ID、Parent ID | 勾选 pair 构成合法的单 root adjacency hierarchy。 |
| Dendrogram | Node ID、Parent ID | 勾选 pair 构成合法的单 root adjacency hierarchy。 |
| Chord | Source、Target | 至少一条勾选 link；选择 Value 时满足 `(Source, Target) -> Value`。 |
| Sankey | Source、Target | 至少一条勾选 link；选择 Value 时满足 `(Source, Target) -> Value`。 |

当前 26 个具体模板现在都至少有一条可执行的数据约束，同时仍保留 Channel 类型、必选性和容量约束。

## 5. 新例子与实测结果

### Example A：重复行与一 X 多 Y

勾选数据：

```text
time        value
2026-01-01  8
2026-01-01  8
2026-02-01  9
```

Single Line 为 `compatible`。January 的重复观测没有破坏 `time -> value`，因为它仍只有一个不同的 value。

如果把第二条 January value 改为 `10`，Single Line 变为 `incompatible`，Issue 为 `duplicate-x`，因为一个 X 对应了两个不同 Y。

### Example B：5 人 x 12 月 x 5 个重量类型

新 Fixture 包含 300 行，勾选列为 `month` 和 `weight`。第二份 Fixture 给每行增加唯一 nominal `row_id`，但不勾选该列。

| 判别 | 无 `row_id` | 增加但不勾选 `row_id` |
|---|---|---|
| Multi-Line：X=`month`、Y=`weight`、无 Series | `incomplete`，缺 Series，无候选字段 | 完全相同 |
| Missing Series candidate IDs | `[]` | `[]` |
| Status、Issues、Assignment | Baseline | 与 Baseline deep-equal |

选择 `person` 作为 Series 仍为 `incompatible`，因为保留五个重量类型时，`(month, person) -> weight` 不成立。

显式选择唯一 `row_id` 作为 Series 也为 `incompatible`：每个 ID 只跨一个 X，触发 `insufficient-series-points`。

### Example C：成员过滤

Case 1 中，勾选 `time + weight_kg` 作为 Single Line 时为 `incompatible`，因为同一 time 对应多个不同 weight。把勾选观测过滤到 `person = Person_A` 后，相同 X/Y 字段变为 `compatible`，因为过滤后的数据满足 `time -> weight_kg`。

### Example D：全部模板增加未勾选 ID

26 个模板分别具有一份 compatible Fixture。测试向每份 Fixture 注入唯一 nominal row ID，但不把它加入 Field Selection。26 个结果全部保持 deep-equal，包括 Status、Assignment、Issues 和 Missing Channels。

## 6. 实现变更

### Compatibility Core

`cv-author-app/src/chartCompatibility.ts` 现在：

- 只从勾选字段生成 Missing Channel candidate；
- 不再扫描所有 Cube 字段来决定 `incomplete` 或 `incompatible`；
- 使用 distinct value 的函数依赖，而不是原始重复 row key；
- 在所有关系检查之前应用勾选成员过滤；
- 优先报告完整 Assignment 的关系冲突；
- 为全部现有模板定义可执行约束。

### Resolution Planning

`cv-author-app/src/compatibilityResolution.ts` 现在携带 `selectedFieldIds`。Bind、Aggregate 和 Facet action 只能引用这份封闭选择中的字段，模板替代也复用完全相同的选择。

`cv-author-app/src/App.vue` 按 Chart 保存 `CsvDataPanel` 当前勾选字段，并把它合并到 Resolution State。即使整列全选而没有形成 value filter，该字段仍会进入“已勾选数据”边界；没有勾选的字段不会进入 Planner。

### Tests

`cv-author-app/src/chartCompatibility.test.ts` 新增：

- 全模板约束覆盖；
- 全模板未勾选 ID 不变性；
- 重复相同观测与冲突观测的函数依赖对照；
- 300 行 `5 x 12 x 5` Fixture；
- 显式唯一 ID Series 拒绝；
- 成员过滤后的关系判别。

`cv-author-app/src/compatibilityResolution.test.ts` 验证未勾选全局 dimension 不再进入 Aggregate、Facet 或 Bind repair。

## 7. 验证结果

2026-08-16 执行结果：

```text
定向 Compatibility 测试：2 files，23 tests passed
完整测试套件：          18 files，152 tests passed
Type check：            passed
Production build：      passed
```

## 8. 本次变更边界

一个 X 对应多个 Y 足以拒绝 Single Line，但仅有这个现象还不足以渲染完整 Multi-Line：跨 X 连接点仍需要勾选 Series 字段。因此只有 X/Y 的 Multi-Line 输入为 `incomplete`，而不是 `compatible`。这是 Encoding completeness 的区别，不意味着 Engine 可以查看未勾选的全局列。

全局字段发现被明确排除在 Compatibility Result 之外。如果未来重新加入，应当使用独立的 advisory result，并保证选中数据的 Compatibility Status 不变。
