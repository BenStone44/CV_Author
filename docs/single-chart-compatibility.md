# Single-Chart Compatibility Engine

> 状态说明（2026-08-16）：本文档保留第一阶段设计背景，其中“从完整 Cube 补充未选字段”的规则已不再是现行行为。当前规范、26 个模板约束和最新验证结果以 [`selected-data-compatibility-report.md`](./selected-data-compatibility-report.md) 为准。Compatibility 现在只使用用户勾选字段及其成员过滤形成的数据投影；全局字段不得改变判别结果。

本文档定义 Compatibility Engine 第一阶段：判断一个 Data Cube 字段选择是否适合单个 Chart Template，并在不适合时给出可执行的字段补充或替代模板。组合关系（Layer、Concat、Facet、Nested）将在单图结果之上另行判断，不属于本阶段。

在进入本阶段前，`docs/channel-resolution.md` 定义的 Channel Resolution 必须先得到无歧义的字段绑定。Resolution 负责统一 native encoding、template-specific state 和 Cube slot；本文档负责判断这些已解析字段是否满足图表的数据语义。

对应实现：

- `cv-author-app/src/chartCompatibility.ts`
- `cv-author-app/src/chartCompatibility.test.ts`
- 原生 renderer channel contract：`cv-author-app/src/chartTemplates.ts`

## 1. 判断输入与结果

引擎输入由三部分组成：目标 `chartType`、`CubeResult`，以及当前部分选择：

```ts
type CubeFieldSelection = {
  dimensionIds: string[];
  measureIds: string[];
  dimensionMembers?: Record<string, string[]>;
};
```

Data Cube UI 的 `CubeSelectionState` 可通过 `cubeSelectionFromState()` 直接转换为上述输入。结果分为：

| 状态 | 含义 | 后续动作 |
| --- | --- | --- |
| `compatible` | 当前字段已填满语义必选 Channel，并满足成员数、符号或数据结构约束 | 可以生成该单图 |
| `incomplete` | 当前字段没有冲突，并且 Cube 中确实存在一组未选字段可以联合补全要求 | 返回缺失 Channel 和候选字段 |
| `incompatible` | 字段类型/数量无法映射，Cube 无法补全，或数据违反结构约束 | 返回原因并推荐替代模板 |

`incomplete` 不是逐 Channel 的局部猜测。引擎会验证候选字段能否在不重复占用字段的情况下联合填满全部必选 Channel，并在补全后再次检查结构约束。

## 2. 类型和数量记法

| 记法 | 含义 |
| --- | --- |
| `D-N` | nominal Cube dimension |
| `D-T` | temporal Cube dimension |
| `D-O` | ordinal Cube dimension |
| `M-Q` | quantitative Cube measure |
| `1D + 1M` | 语义上至少需要一个 dimension 和一个 measure |
| `0D + 2M` | 不要求 dimension，至少需要两个 measure |
| `R/T` | 必选 Channel 数 / 总 Channel 数 |

“语义必选”比 renderer 能否勉强绘制更严格。例如 Grouped Bar renderer 可以在没有 Group 时退化成普通 Bar，但 Compatibility Engine 将 Group 视为必选，因为缺少 Group 时该 Card 不再表达 grouped 语义。

## 3. 全部 26 个模板的单图要求

| 类别 | Template | 坐标系 | Channel 数 R/T | 必选 Channel 与类型 | 可选 Channel 与类型 | 最低数据维度 | 额外数据要求 |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| Lines | Single Line | Cartesian | 2/4 | X: D-N/T/O 或 M-Q；Y: M-Q | Size: M-Q；Shape: D-N/O | 1D + 1M | 每个 X 必须恰好对应一个 Y；若存在重复 X，必须先 filter/aggregate 或改用 Multi-Line |
| Lines | Multi-Line Chart | Cartesian | 3/5 | X: D-N/T/O 或 M-Q；Y: M-Q；Series: D-N/T/O | 每个 Series 的 Color、Stroke width、Shape 可编辑 | 2D + 1M | Series 至少 2 个 members；每个 `X × Series` 必须恰好对应一个 Y |
| Lines | Parallel Coordinates | Coordinate Free | 1/2 | Numeric dimensions: 至少 2 个 M-Q | Color: D-N/T/O 或 M-Q | 0D + 2M | 多个 measure 共用一个可多选 Channel |
| Areas | Area Chart | Cartesian | 2/3 | X: D-N/T/O 或 M-Q；Y: M-Q | Series: D-N/T/O | 1D + 1M | 单一面积序列 |
| Areas | Stacked Area | Cartesian | 3/3 | X: D-N/T/O 或 M-Q；Y: M-Q；Series: D-N/T/O | 无 | 2D + 1M | Series 至少 2 个 members |
| Areas | Streamgraph | Cartesian | 3/3 | X: D-N/T/O 或 M-Q；Y: M-Q；Series: D-N/T/O | 无 | 2D + 1M | Series 至少 2 个 members |
| Areas | Horizon Chart | Cartesian | 3/3 | X: D-N/T/O 或 M-Q；Y: M-Q；Series: D-N/T/O | 无 | 2D + 1M | Series 至少 2 个 members |
| Bars | Single Bar | Cartesian | 2/4 | Category: D-N/T/O；Value: M-Q | Color: D-N/T/O 或 M-Q；Size: M-Q | 1D + 1M | 无 |
| Bars | Grouped Bar | Cartesian | 3/4 | Category: D-N/T/O；Value: M-Q；Group: D-N/T/O | Size: M-Q | 2D + 1M | Group 至少 2 个 members |
| Bars | Stacked Bar | Cartesian | 3/4 | Category: D-N/T/O；Value: M-Q；Segment: D-N/T/O | Size: M-Q | 2D + 1M | Segment 至少 2 个 members |
| Bars | Divergent Bar | Cartesian | 2/4 | Category: D-N/T/O；Value: M-Q | Color: D-N/T/O 或 M-Q；Size: M-Q | 1D + 1M | Value 必须同时包含负值和正值 |
| Bars | Divergent Stacked Bar | Cartesian | 3/4 | Category: D-N/T/O；Value: M-Q；Segment: D-N/T/O | Size: M-Q | 2D + 1M | Segment 至少 2 个 members；Value 有正有负 |
| Bars | Calendar | Coordinate Free | 2/3 | Date: D-T；Daily value: M-Q | Color: D-N/O 或 M-Q | 1D + 1M | Date 必须是 temporal |
| Dots | Scatterplot | Cartesian | 2/5 | X/Y: D-N/T/O 或 M-Q | Color: D-N/T/O 或 M-Q；Size: M-Q；Shape: D-N/O | 通常 0D + 2M | 两个位置字段必须可分别占用 X/Y |
| Radial | Pie Chart | Polar | 1/3 | Angle: 1 个或多个 M-Q | Slice/Color: D-N/T/O；Radius: M-Q | 0D + 1M | Angle 支持 measure-set |
| Radial | Donut | Polar | 1/4 | Angle: 1 个或多个 M-Q | Slice/Color: D-N/T/O；Ring: D-N/T/O；Radius: M-Q | 0D + 1M | Angle 支持 measure-set |
| Analysis | Matrix | Cartesian | 2/4 | Row: D-N/T/O；Column: D-N/T/O | Cell value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | Row 与 Column 使用不同字段 |
| Analysis | Box Plot | Cartesian | 2/3 | Bin variable: M-Q；Distribution value: M-Q | Color: D-N/O 或 M-Q | 0D + 2M | 两个 quantitative 字段 |
| Analysis | Contour | Cartesian | 3/4 | X: M-Q；Y: M-Q；Grid value: M-Q | Color: D-N/O 或 M-Q | 0D + 3M | X x Y 必须构成完整、无重复的规则网格 |
| Analysis | Hexbin | Cartesian | 2/4 | X: M-Q；Y: M-Q | Color: D-N/O 或 M-Q；Size: M-Q | 0D + 2M | 两个 quantitative 位置字段 |
| Hierarchies | Icicle | Coordinate Free | 2/4 | Node ID: D-N/T/O；Parent ID: D-N/T/O | Node value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | ID 唯一、恰好一个 root、所有非空 parent 可解析 |
| Hierarchies | Sunburst | Coordinate Free | 2/4 | Node ID: D-N/T/O；Parent ID: D-N/T/O | Node value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | 同上 |
| Hierarchies | Treemap | Coordinate Free | 2/4 | Node ID: D-N/T/O；Parent ID: D-N/T/O | Node value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | 同上 |
| Hierarchies | Dendrogram | Coordinate Free | 2/4 | Node ID: D-N/T/O；Parent ID: D-N/T/O | Node value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | 同上 |
| Networks | Chord | Coordinate Free | 2/4 | Source: D-N/T/O；Target: D-N/T/O | Flow value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | Source 与 Target 使用不同字段 |
| Networks | Sankey | Coordinate Free | 2/4 | Source: D-N/T/O；Target: D-N/T/O | Flow value: M-Q；Color: D-N/O 或 M-Q | 2D + 0M | Source 与 Target 使用不同字段 |

## 4. 引擎判别顺序

1. 检查 dimension、measure 和 member 是否存在于当前 Cube。
2. 根据 source kind 和数据类型枚举合法 Channel assignments；同一字段不能占用两个 Channel。Pie/Donut Angle 与 Parallel Dimensions 是多字段 Channel，可在一个 Channel 中接收多个不同 measures。
3. 优先把字段放入基础位置/数值 Channel，再放入 Series、Color、Size、Shape 等后续 Channel。
4. 检查语义必选 Channel。若缺失，搜索 Cube 中尚未选择的字段能否联合补全。
5. 检查 value-level 约束：member 数量、正负值、单根层级、规则网格。
6. 输出状态、自动映射、缺失项、候选字段和具体失败原因。

## 5. Alternative Recommendation

`recommendSingleChartAlternatives()` 使用完全相同的字段选择评估其余 25 个模板，先排除 `incompatible`，再按以下顺序排序：

1. `compatible` 优先于仍需补字段的 `incomplete`。
2. 优先保留原模板的 family 和 visual style。
3. 比较三个设计维度：`coordinate-system`、`visual-style`、`data-dimensionality`。
4. 改变维度更少、缺失 Channel 更少的方案优先。

粒度冲突有一条更具体的优先规则：当 Single Line 因重复 X 失败时，`Multi-Line Chart` 会优先于改变图形语义但可立即生成的模板。推荐会明确指出缺失 Series 及其候选字段，使用户通过补充数据分组直接修复原有的趋势表达意图。

推荐结果会显式列出改变了哪些设计维度，使“换图”成为可解释的兼容性修复，而不是无依据地列出其他图表。

## 6. Case 1 数据

测试数据为 `data/case1.csv`，共 40 行：

该表的事实记录粒度是 `person × time`：5 个人分别在 8 个时间点各有一条记录。因而 `time` 本身不是记录键；对于任意一个 `time`，都会同时存在 5 个 `weight_kg`。只有 `person × time` 才能唯一定位一个体重值。

| Cube role | 字段 | 类型/范围 |
| --- | --- | --- |
| Dimension | `person` | nominal，5 members |
| Dimension | `time` | temporal，8 members |
| Measure | `weight_kg` | quantitative，全部为正值 |
| Measure | `water_kg` | quantitative，全部为正值 |
| Measure | `fat_kg` | quantitative，全部为正值 |
| Measure | `muscle_kg` | quantitative，全部为正值 |
| Measure | `minerals_kg` | quantitative，全部为正值 |

## 7. 判别案例与实际结果

以下结果由 `chartCompatibility.test.ts` 直接读取 `case1.csv` 并调用引擎得到。

| Case | 当前选择 | 目标模板 | 实际状态 | 结果与理由 | Actionable alternative |
| ---: | --- | --- | --- | --- | --- |
| 1a | D: `time`; M: `weight_kg` | Single Line | `incompatible` | `time -> X`、`weight_kg -> Y` 的类型合法，但每个 X 有 5 个 Y，违反单线粒度 | 加入明确的 person filter/aggregation，或改用 Multi-Line |
| 1b | D: `time`; M: `weight_kg` | Multi-Line Chart | `incomplete` | X/Y 可绑定，但缺必选 Series；Cube 候选为 `person` | 选入 `person -> Series` |
| 1c | D: `time`, `person`; M: `weight_kg` | Multi-Line Chart | `compatible` | `time -> X`，`person -> Series`，`weight_kg -> Y`；每个 `X × Series` 唯一 | 不需要替代 |
| 2 | D: `time`; M: `weight_kg` | Grouped Bar | `incomplete` | Category/Value 可绑定，但缺 Group；候选为 `person` | 选入 `person`，或改用 `Single Bar` |
| 3 | D: `time`; M: `weight_kg` | Divergent Bar | `incompatible` | `weight_kg` 没有负值，不能形成零点两侧结构 | `Single Bar`，保留 Cartesian 与 Bar family |
| 4 | D: `person`, `time`; M: `weight_kg` | Matrix | `compatible` | 两个 dimensions 分别映射 Row/Column，measure 映射 Cell value | 不需要替代 |
| 5 | M: `weight_kg`, `water_kg`, `fat_kg` | Parallel Coordinates | `compatible` | 三个 measure 共同映射 Numeric dimensions | 不需要替代 |
| 6 | M: `weight_kg`, `water_kg`, `fat_kg` | Contour | `incompatible` | 三个字段虽为 quantitative，但任意 X x Y 组合都不是完整规则网格 | `Hexbin`，保留 Cartesian 与 density style |
| 7 | D: `person`; M: `weight_kg` | Calendar | `incomplete` | 缺 temporal Date；Cube 候选为 `time` | 选入 `time`，或改用类别型单图 |
| 8 | D: `person`, `time`; M: `weight_kg` | Sunburst | `incompatible` | `person/time` 不能形成唯一 ID、单 root、可解析 Parent 的 adjacency list | 改用 Matrix 或 Flow 类模板，或提供真实 ID/Parent 字段 |

### 7.1 Case 1a：Single Line 的粒度冲突

这个选择表面上想表达“体重如何随时间变化”：`time` 是 temporal dimension，绑定 X Channel 后表示观测时间与连接顺序；`weight_kg` 是 quantitative measure，绑定 Y Channel 后表示折线高度和体重数值。然而 Single Line 的每个 X 位置只能有一个确定的 Y。Case 1 的事实粒度是 `person × time`，所以同一个 `time` 实际对应 5 个人的 5 个不同体重值。未绑定 `person` 时，系统既不知道应该连接哪一个人的点，也不能自行决定求和、平均或选择某个人；renderer 中任何隐式平均都会改变数据语义。因此该选择虽然字段类型匹配，仍因 `duplicate-x` 粒度冲突被判为 `incompatible`。只有显式筛选到一个 person，或明确声明按 time 的 aggregation 后，它才可能成为合法 Single Line。

### 7.2 Case 1b/1c：Multi-Line 的人员序列语义

Multi-Line 表达“每个人的体重分别如何随时间变化”。X Channel 仍绑定 `time`，用于排列所有观测时间；Y Channel 绑定 `weight_kg`，用于表示各点的体重数值；必选 Series Channel 绑定 `person`，把记录拆成 5 条相互独立的人员序列，并为每条线提供稳定的颜色、线宽和线型样式。仅选择 `time` 与 `weight_kg` 时，系统能判断 Cube 中的 `person` 可补全 Series，所以结果是 `incomplete`；加入 `person` 后，`time × person` 与原表粒度一致，每个 `X × Series` 恰好定位一个 Y，结果才是 `compatible`。这里 Series 不是装饰性 Color，而是决定哪些点可以被同一条线连接的数据分组 Channel。

### 7.3 Case 2：Grouped Bar 缺少分组维度

这个例子原本希望比较“每个时间类别中的多个组及其体重数值”，但当前只选择了 `time` 和 `weight_kg`。在 Grouped Bar 中，Category/X Channel 绑定 `time`，语义是每一组并列柱所属的主类别；Value/Y Channel 绑定 `weight_kg`，语义是柱子的高度；Group/Color Channel 应绑定第二个分类 dimension，用于在每个时间类别内部拆出多根并列柱并区分颜色。当前 Cube 中的 `person` 正好可以承担 Group 语义，例如在每个月内并列显示五个人的体重，但它尚未被选择，因此结果是 `incomplete` 而不是类型冲突。如果用户不想加入 `person`，Single Bar 是更合适的替代，因为它只需要 Category 和 Value，能保留“按时间比较体重”的含义而不虚构分组结构。

### 7.4 Case 3：Divergent Bar 缺少正负方向语义

这个例子尝试用 Divergent Bar 表达“体重值相对于零点向两个方向发散”。`time` 绑定 Category/X Channel，表示每根柱对应的时间类别；`weight_kg` 绑定 Value/Y Channel，决定柱子的方向和长度。Divergent Bar 的核心语义不是普通的数值比较，而是同一 measure 中的负值和正值分别位于零基线两侧，例如亏损与盈利、减少与增加。Case 1 的 `weight_kg` 全部为正值，因此虽然字段类型是 quantitative，数据值却无法形成发散结构，结果为 `incompatible`。Single Bar 可以保留 `time -> Category` 和 `weight_kg -> Value` 的映射，只去掉不成立的正负方向语义，所以它是首选替代；如果用户真正需要 Divergent Bar，应先构造相对基准的变化量，例如 `weight_kg - baseline_weight`。

### 7.5 Case 4：Matrix 的人员与时间交叉语义

这个例子表达“每个人在每个时间点对应的体重是多少”。`person` 和 `time` 是两个离散索引 dimension，分别占据 Matrix 的 Row 与 Column Channel；二者谁作为行、谁作为列只改变阅读方向，不改变交叉关系的语义。`weight_kg` 绑定 Cell value Channel，表示每个 `person x time` 交叉单元格中的定量值，并通过单元格颜色或透明度呈现大小。由于 Case 1 的粒度是 `person + time`，每个交叉位置能够定位一条体重记录，Row、Column 和 Cell value 三个角色都有明确来源，因此结果为 `compatible`。这里 Matrix 的 X/Y 坐标不是连续数值轴，而是两个 dimension 的离散成员排列。

### 7.6 Case 5：Parallel Coordinates 的多测量属性语义

这个例子表达“同一条身体观测记录在多个定量属性上的联合模式”。选择的 `weight_kg`、`water_kg` 和 `fat_kg` 都是 quantitative measures，它们共同绑定到可多选的 Numeric dimensions Channel；该 Channel 会为每个 measure 建立一条独立数值轴，每条数据记录依次穿过三个轴上的对应数值并形成一条路径。因此这里的“dimensions”是平行坐标图中的视觉轴集合，不是 Data Cube 的 categorical dimensions：三个输入在 Cube 中仍然都是 measures。若再选择 `person` 作为 Color Channel，就可以用颜色区分人员；当前没有 Color 时，图表只表达各条记录的多变量数值形状。因为至少两个 quantitative measures 的要求已满足，所以结果为 `compatible`。

### 7.7 Case 6：Contour 缺少规则空间网格语义

这个例子尝试把 `weight_kg`、`water_kg` 和 `fat_kg` 分别解释为 Contour 的 X、Y 和 Grid value Channel。X 与 Y 的语义不是任意两个相关数值，而是规则二维采样网格的两个坐标；Grid value 的语义是在每一个 X/Y 网格位置测得的标量，等高线连接具有相同标量值的位置。Case 1 中每行是一次身体观测，三个 measure 是同一记录的不同属性，`weight_kg x water_kg` 等组合形成的是稀疏散点而不是完整笛卡尔网格，因此即使三个字段都是 quantitative，仍然不具备等高线所需的空间采样语义，结果为 `incompatible`。Hexbin 可以继续使用两个 measure 作为 X/Y，将记录聚合为空间六边形密度，并可用第三个 measure 驱动 Color 或 Size，因此更符合这组数据的散点分布语义。

### 7.8 Case 7：Calendar 缺少日期定位语义

这个例子当前选择了 `person` 和 `weight_kg`，希望生成 Calendar，但 Calendar 的每个单元格必须先由日期定位。Daily value Channel 可以绑定 `weight_kg`，表示某一天对应的体重值；`person` 可以作为可选 Color 或筛选 dimension，用于区分人员或限定某个人的数据，但 nominal 的 `person` 不能替代 Date Channel，因为它无法确定年份、星期和日期格位置。Cube 中尚未选择的 `time` 是 temporal dimension，能够绑定 Date Channel，因此当前状态为可补全的 `incomplete`。加入 `time` 后，Date 决定单元格位置、Daily value 决定该日期的数值表现，而 `person` 仍需要明确采用 Color、filter 或 facet 中的一种策略，以避免同一天多个人的记录重叠。

### 7.9 Case 8：Sunburst 缺少父子层级语义

这个例子尝试把 `person`、`time` 和 `weight_kg` 用于 Sunburst。Sunburst 的 Node ID Channel 要求每行提供唯一节点标识，Parent ID Channel 要求每个非根节点引用另一个已存在节点，并且全部记录最终形成一个单根树；可选 Node value Channel 才负责决定扇区面积。虽然 `person` 和 `time` 都是 dimensions，`weight_kg` 也是合法的 quantitative value，但 Case 1 的 `person/time` 表达的是观测粒度而不是父子关系：人员不是日期的父节点，日期也没有引用人员或其他日期的 parent key，而且字段中不存在唯一根节点。因此这不是简单的 Channel 缺失，而是数据关系语义不成立，结果为 `incompatible`。若要使用 Sunburst，需要真实的 `node_id`、`parent_id` 和可选 `value` 数据；若只想表达人员与时间的交叉观测，则 Matrix 更自然，若数据确实表示来源到去向的关系，则可考虑 Chord 或 Sankey。

## 8. 测试覆盖结果

自动化测试包括：

- 26 个当前模板均存在独立 requirement，且模板 ID 无重复。
- 每个模板都有至少一组最小合法 Cube selection 被判为 `compatible`。
- Data Cube UI 部分选择能正确转换为 engine input。
- value-level 约束只读取所选 dimension members 对应的 Cube cells。
- 上述 Case 1 场景的状态、映射、失败原因和可执行替代结果均有断言；Line 额外覆盖重复 X、缺失 Series 和合法 `X × Series` 三种状态。
- 专用 fixture 覆盖 signed measure、hierarchy adjacency、regular grid 和 source-target flow。

执行命令：

```bash
cd cv-author-app
npm test -- --run src/chartCompatibility.test.ts
```

当前结果：`1` 个 test file、`14` 个 tests 全部通过。完整项目回归为 `17` 个 test files、`139` 个 tests 全部通过。
