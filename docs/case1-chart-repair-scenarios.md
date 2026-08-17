# Case 1 图表匹配与修复测试

本文件只描述基于真实 `data/case1.csv` 的场景测试。测试会读取完整的 40 行数据，把用户已经选择的字段绑定到 chart template，然后调用 `analyzeChartSpecRepairs` 判断当前绑定是否匹配，以及还需要添加哪些字段和角色绑定。

可执行测试位于：`cv-author-app/src/case1ChartRepair.test.ts`。

## 数据结构

`case1.csv` 包含以下字段：

| 字段 | 声明类型 | 数据角色示例 |
| --- | --- | --- |
| `id` | nominal | 每行唯一标识 |
| `person` | nominal | 人员分组 |
| `time` | temporal | 八个月份 |
| `weight_kg` | quantitative | 总体重 |
| `water_kg` | quantitative | 水分重量 |
| `fat_kg` | quantitative | 脂肪重量 |
| `muscle_kg` | quantitative | 肌肉重量 |
| `minerals_kg` | quantitative | 无机盐重量 |

当前实现把“已经绑定的字段”视为 `B`，把 CSV 中其他所有字段视为可用于修复的 `U`。因此下文的“选择字段”表示字段已经被绑定到指定角色，不表示其他 CSV 字段被禁止参与修复。

## 场景结果

### Case 1：选择 time + weight_kg，使用 LineGraph

- 当前绑定：`x=time`，`y=weight_kg`。
- 当前结果：`DIMENSION_OVERFLOW`。
- 原因：同一个月份包含五个人，不同人的 `weight_kg` 不同，所以 `time` 不能函数决定 `weight_kg`；LineGraph 契约禁止自动聚合。
- 极小修复：`series=id`、`series=person` 或 `series=muscle_kg`。
- 解释：这三个字段分别都能使 `time + series -> weight_kg`。`water_kg`、`fat_kg` 和 `minerals_kg` 在真实数据中不能单独解决所有冲突，因此没有返回。
- 需要确认：`id` 和 `muscle_kg` 在结构上合法，但通常不如 `person` 符合多折线的业务语义。当前算法按要求不做这种语义筛选。

### Case 2：选择 person + time + weight_kg，使用 MultiLineChart

- 当前绑定：`x=time`，`y=weight_kg`，`series=person`。
- 当前结果：`VALID`。
- 原因：三个角色类型兼容，`person` 在相同月份内产生分组，并且 `time + person -> weight_kg`。
- 修复：不需要添加字段，返回空修复集合。

### Case 3：选择 time + weight_kg，使用 Scatterplot

- 当前绑定：`x=time`，`y=weight_kg`。
- 当前结果：`VALID`。
- 原因：Scatterplot 允许同一个 X 对应多个 Y 点，不要求 `time -> weight_kg`，也不要求 series。
- 修复：不需要。

### Case 4：选择 time + weight_kg，使用 SingleBarChart

- 当前绑定：`x=time`，`y=weight_kg`。
- 当前结果：`VALID`。
- 原因：SingleBarChart 契约允许聚合，因此同一月份的五个体重值可以先聚合，不要求 `time -> weight_kg`。
- 修复：不需要。
- 需要确认：契约目前只声明“允许聚合”，没有在修复结果中指定应使用 `sum`、`mean` 还是其他聚合。

### Case 5：选择 person + weight_kg，使用 GroupedBarChart

- 当前绑定：`x=person`，`y=weight_kg`，缺少必需的 series。
- 当前结果：`DIMENSION_UNDERFLOW`。
- 极小修复：分别可以添加 `id`、`time`、`water_kg`、`fat_kg`、`muscle_kg` 或 `minerals_kg` 到 series。
- 原因：GroupedBarChart 允许聚合；这些字段的类型都被当前 series 契约接受，并且都能在 person 内产生划分。
- 需要确认：从业务表达看，`time` 最像合理的 grouped series；其他度量列和 `id` 虽然结构合法，但可能不适合成为颜色/分组系列。

### Case 6：选择 person + time + weight_kg，使用 GroupedBarChart

- 当前绑定：`x=person`，`y=weight_kg`，`series=time`。
- 当前结果：`VALID`。
- 原因：角色完整且类型兼容；每个人内部都有多个 time，person 与 time 也形成不同的划分结构。
- 修复：不需要。

### Case 7：选择 person + weight_kg，使用 MatrixDiagram

- 当前绑定：`row=person`，`value=weight_kg`，缺少 column。
- 当前结果：`DIMENSION_UNDERFLOW`。
- 极小修复：`column=id` 或 `column=time`。
- 原因：Matrix column 只接受 nominal/temporal 字段；二者都能在 person 内继续划分数据。其余组成字段是 quantitative，不能绑定到 column。
- 需要确认：`id` 会产生 40 个稀疏列，结构上合法但通常不是可读的矩阵维度；当前契约尚未设置最大基数限制。

### Case 8：选择 person + time + weight_kg，使用 MatrixDiagram

- 当前绑定：`row=person`，`column=time`，`value=weight_kg`。
- 当前结果：`VALID`。
- 原因：person 形成五行，time 形成八列，两个维度相互独立，weight_kg 可以作为单元格值。
- 修复：不需要。

### Case 9：只选择 person，使用 PieChart

- 当前绑定：`color=person`，缺少必需的 angle 度量。
- 当前结果：`DIMENSION_UNDERFLOW`。
- 极小修复：可以把 `weight_kg`、`water_kg`、`fat_kg`、`muscle_kg` 或 `minerals_kg` 中任意一个绑定到 angle。
- 原因：五个字段都是 quantitative，满足 Pie angle 的类型要求；PieChart 允许按 person 聚合重复记录。
- 需要确认：修复结果没有说明跨八个月应采用哪种聚合方式。

### Case 10：只选择 weight_kg，使用 PieChart

- 当前绑定：`angle=weight_kg`，没有 color/slice 维度。
- 当前结果：`VALID`。
- 原因：当前 PieChart 契约只要求一个 quantitative angle，slice 是可选角色。
- 修复：不需要。
- 需要确认：虽然槽位契约合法，但没有 slice 时最终可能只得到一个聚合扇区；“契约合法”不一定等于“图表表达有用”。

### Case 11：只选择 weight_kg，使用 CalendarHeatmap

- 当前绑定：`value=weight_kg`，缺少 date。
- 当前结果：`DIMENSION_UNDERFLOW`。
- 唯一极小修复：`date=time`。
- 原因：Case 1 中只有 time 是 temporal 字段，能够满足 Calendar 的 date 角色。

### Case 12：把 person 错绑到 date，使用 CalendarHeatmap

- 当前绑定：`date=person`，`value=weight_kg`。
- 当前结果：`UNRESOLVABLE`，issues 包含 `TYPE_MISMATCH`。
- 原因：person 是 nominal，Calendar date 只接受 temporal；当前修复模型只允许添加字段，不能删除或替换已经绑定错误的字段。
- 需要确认：完整交互应返回“把 date 从 person 替换为 time”的 replacement repair，而不是仅仅返回无解。

### Case 13：选择 weight_kg + water_kg + fat_kg，使用 ContourPlot

- 当前绑定：`x=weight_kg`，`y=water_kg`，`value=fat_kg`。
- 当前结果：`VALID`。
- 原因：三个角色都要求 quantitative，字段类型匹配；weight 与 water 在真实数据中的分区结构并不完全等价。
- 修复：不需要。
- 需要确认：类型和结构合法不代表这三个健康指标一定适合表达为连续空间上的等高线，这仍属于业务语义判断。

## 从真实 Case 1 暴露的问题

1. **结构合法候选过宽。** LineGraph 会返回 `id` 和 `muscle_kg`，GroupedBarChart 会把多个度量列作为 series。算法遵守“不做业务语义判断”，但图表角色契约是否应收紧需要确认。
2. **缺少基数约束。** MatrixDiagram 接受 `id` 作为 column，会形成 40 列；当前契约没有阻止结构合法但不可读的结果。
3. **聚合策略信息不足。** Bar 和 Pie 只知道“允许聚合”，修复结果没有携带具体的 `sum`、`mean` 或 `count` 选择。
4. **修复操作只有添加。** 错误绑定无法通过替换或移除修复，Calendar 的 `person -> date` 因此被报告为 `UNRESOLVABLE`。
5. **槽位合法性与表达有效性不同。** 单字段 Pie 和健康指标 Contour 都能通过契约，但可能不是用户想要的图表表达。
6. **候选字段范围需要明确。** 当前测试把未绑定的全部 CSV 字段作为 `U`。如果产品语义是“只能使用用户预先选中的列”，API 需要额外接收 selected-field scope。
