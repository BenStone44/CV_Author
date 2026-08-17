# VisAnatomy CSV Data Engine 鲁棒性审计

审计日期：2026-08-17

## 结论

当前的 minimal hitting set 实现在本次真实数据采样中满足“修复后消除冲突、删除任一字段后重新失败、结果之间不存在包含关系”这三个核心性质；没有发现 inclusion-minimal 枚举的逻辑错误。

但当前系统还不能被视为对 `data/VisAnatomy/data_tables` 中所有可能输入都鲁棒。已确认的问题主要在 CSV 导入边界和缺失值策略，而不是 hitting set 定义本身：

1. 任意候选字段出现缺失值会让整个 grain 分析变成 `insufficient-data`，即使其他完整字段能够解决冲突。
2. 全空尾列不会在导入时删除，反而会被命名为 `Column N` 并加入默认候选，从而触发上述全局缺失失败。
3. 当前只识别 ISO `YYYY-MM-DD` 日期；真实语料中的 `M/D/YYYY` 等已确认日期会被推断为 nominal。
4. 多行表头、标题行和不齐行会被静默解释成普通扁平表。`RangeChart8.csv` 是已确认实例。
5. 合法的单列 CSV 会产生 `UndetectableDelimiter` 警告。数据未丢失，但提示具有误导性。

错误字段绑定、可通过补充 template constraint 解决的问题，以及字段绑定后的业务语义判别不在本次问题清单内。

## 审计范围和方法

目录中共有 393 个文件，约 35 MB，其中 351 个 CSV、41 个 JSON 和 1 个 Markdown；CSV 分属 44 个文件名前缀族。JSON 未读取。

为了避免整表读取大型文件，采用两层采样：

- Schema 扫描：351 个 CSV 全覆盖，每个文件只读取表头和最多 25 行，共读取 6,884 个数据行。
- Engine 扫描：每个文件族选择最小、中位、最大文件，并补入整体最大的 10 个文件，去重后为 126 个 CSV；每个文件最多读取 200 行，共读取 11,937 行，45 个文件被截断。
- Engine 扫描中的 grain 候选字段最多取 10 个；两个宽表触发此上限。因此结果不能证明宽表上的完整枚举能力。
- 最大文件是 `ConnectedScatterPlot5.csv`，约 2.3 MB、9,994 个数据行；样本中行数最多的文件是 `BoxAndWhisker7.csv`，约 53,939 个数据行。它们均未整表载入审计。

Chart 测试仅使用机械方式选择类型兼容字段来触发求解器路径，不能代表真实用户绑定。因此相关 `VALID` / `UNRESOLVABLE` 比率没有被用作正确率或缺陷证据。

## 测量结果

### Schema 层

| 指标 | 结果 |
| --- | ---: |
| 扫描 CSV | 351 |
| 读取数据行 | 6,884 |
| 最大采样列数 | 26 |
| 含任意缺失值的文件 | 24 |
| 排除全空列后仍有缺失的文件 | 19 |
| 含全空列的文件 | 6 |
| 重复或空表头文件 | 6 |
| 不齐行文件 | 1 |
| nominal 且符合日期启发式的候选列 | 50 |
| 被推断为 temporal 的列 | 18 |
| 解析警告文件 | 21 |

21 个解析警告全部是 `UndetectableDelimiter`，并且全部来自单列文件。这一批没有发现 Papa Parse 报告的其他错误类型。

6 个全空列实例是：

- `Calendar1.csv`：7 列
- `Other9.csv`：1 列
- `RangeChart8.csv`：17 列
- `SpiralPlot11.csv`：16 列
- `SpiralPlot4.csv`：12 列
- `ViolinPlot2.csv`：4 列

重复或空表头出现在 `Calendar1.csv`、`Heatmap7.csv`、`ParallelCoordinatesPlot1.csv`、`SpiralPlot11.csv`、`SpiralPlot4.csv` 和 `ViolinPlot2.csv`。其中 `ParallelCoordinatesPlot1.csv` 是真实的重复字段名 `cylinders`；其余主要是空表头或尾随空列。

唯一的不齐行文件是 `RangeChart8.csv`。前 25 行采样观察到 1、14、20、23、26 五种行宽。文件开头包含报告标题、发布时间、多层表头和数据，不是当前导入器假定的单表头扁平 CSV。

### Grain 层

在 126 个文件样本中构造了 112 个可执行的 key/value grain 检查：

| 状态 | 数量 |
| --- | ---: |
| `unique` | 45 |
| `conflict` | 39 |
| `unresolvable` | 26 |
| `insufficient-data` | 2 |

这些状态来自机械选择的 key/value，只用于覆盖算法路径，不能解释为 26 个文件本身“无解”。

对返回结果执行了 120 次性质校验，全部通过：

- 每个 repair 加入 key 后都使 key 决定 value；
- 每个 repair 删除任一字段后都不再决定 value；
- 任意两个 repair 之间不存在真子集关系；
- `unresolvable` 结果中确实存在空的可区分字段集合；
- `unique` 结果中确实不存在 value conflict group。

采样中单次 grain 检查最大返回 7 个 repair；单次最长约 21 ms。该时间只适用于最多 200 行、最多 10 个候选字段的样本，不代表全文件性能。

## 已确认问题

### P0：候选列缺失会污染整个 grain 分析

`analyzeCsvGrain` 默认把所有未绑定列作为候选，然后检查 key、value 和全部候选列。只要任一参与列的任一行为空，就丢弃全部行并返回 `insufficient-data`。

真实样本中已直接复现 3 个错误降级：

- `BarChart22.csv`
- `CirclePacking2.csv`
- `ParallelCoordinatesPlot10.csv`

使用默认候选时三个文件均为 `insufficient-data`；只限制为完整候选字段后，同一 key/value 分析可以正常返回。这证明失败不是 key/value 本身必然不可分析，而是无关候选列的缺失造成的全局污染。

这与原算法“数据不存在缺失值”的前提一致，但该前提不符合实际输入语料：轻量全量扫描中有 24/351 个文件出现缺失，排除全空列后仍有 19 个。

建议后续把缺失策略写进算法契约。一个保守方向是：key/value 缺失单独报告；候选字段缺失不应全局终止，而应在冲突对层面决定该字段是否能提供可靠区分。不能在未定义缺失语义前简单把空值当成普通类别。

### P0：导入器保留全空列，放大缺失问题

导入器按所有行中的最大列数建列，并把空表头改名为 `Column N`，但不会删除全空列。对 `Calendar1.csv`、`SpiralPlot11.csv` 等常见的尾随逗号导出，这会生成多个完全为空的伪字段。

这些伪字段随后进入 `analyzeCsvGrain` 的默认候选集合，稳定触发 `insufficient-data`。这是可在导入边界安全处理的问题：只删除“所有数据行均为空”的列不会损失观测值；空表头但有数据的列（例如 `Heatmap7.csv` 的索引列）仍应保留并规范命名。

### P0：非扁平 CSV 被静默误解析

`RangeChart8.csv` 证明输入集合中存在带标题行和多层表头的表格导出。当前逻辑把第一行 `Energy Information Administration` 当成唯一表头，再按后续最大行宽补出 26 列，生成的数据集结构不可信。

这类问题不能由 hitting set 或 chart constraint 修复。导入层至少需要结构预检并明确拒绝或要求用户选择表头行；只有在定义多层表头规范后才能自动展开。静默接受会让后续所有“匹配/修复”结果失去意义。

### P1：日期类型推断覆盖不足

当前 temporal 推断只接受 `YYYY-MM-DD` 开头的格式。轻量扫描筛出 50 个 nominal 候选列：其中 80% 以上非空值带日期分隔特征并可被 `Date.parse` 接受。该启发式也可能命中 ID，因此 50 不是日期真值数量；人工检查小样本后确认的误判包括：

- `AreaChart7.csv` 的 `date`：`1/1/1998`
- `Calendar9.csv` 的 `date`：`4/1/2012`
- `CandlestickChart8.csv` 的 `Date`：`11/17/2017`
- `GanttChart4.csv` 的 `Start Date`：`4/1/2017`
- `ConnectedScatterPlot5.csv` 的 `Order Date` / `Ship Date`

这会让 temporal-only role 出现错误 underflow/type mismatch。它属于导入类型推断，不是 grain hitting set 错误，也不能仅靠增加图表模板数量解决。扩展时应采用明确、无歧义的格式集合和一致性检查，避免直接信任环境相关的宽松 `Date.parse`。

### P2：单列 CSV 的解析警告是误报

21 个单列文件全部收到 `UndetectableDelimiter`，包括 `BoxAndWhisker3.csv`、`DensityPlot3.csv`、`PolarAreaChart5.csv`、多份 `WaffleChart*.csv` 等。Papa Parse 仍正确产生单列数据，因此这是提示分类问题，不是解析失败。

导入器当前只显示警告数量，没有区分“合法单列、无需分隔符”和真正可疑的解析问题。应在确认只有一列且行宽一致时抑制该警告。

### P2：重复表头规范化安全但信息不足

`ParallelCoordinatesPlot1.csv` 含两个 `cylinders` 表头。当前会把第二个改为 `cylinders_2`，能够避免对象键覆盖，机械行为安全；但系统不会告诉用户发生过重命名。由于不做业务语义判断，算法不应猜测两列含义，只需保留 provenance/警告。

## 未判定为缺陷的结果

- 126 个样本中 64 个没有得到唯一 primary key。这符合“不凭业务语义在多个等价标识符中强选”的原则，不是错误。
- 机械 chart 绑定得到的 17 个 `UNRESOLVABLE` 被排除。例如 `GroupedBarChart23.csv` 中 `Country_Code` 与 `Country_Name` 结构等价，机械选择两者作为不同维度不代表算法应替用户选择 `Medal_Type`。
- `MatrixDiagram6.csv` 等类型不兼容案例可能通过完善 template constraint 处理，按当前决策不计入核心算法问题。
- 算法不会判断 `product`、`region`、`channel` 哪个在业务上最正确；保留全部结构合法的极小候选是预期行为。

## 尚未被本次审计证明的能力

当前 conflict-pair 构造在单个 key group 内是二次复杂度，所有 minimal hitting sets 的输出规模在最坏情况下是指数级；chart repair 的字段组合和角色分配同样是组合搜索。本次按要求没有整表读取大文件，并对宽表限制为 10 个候选，因此不能声称以下能力已经验证：

- 约 54,000 行文件在低基数 key 下的 conflict-pair 构造性能；
- 21 至 26 列宽表上的全部极小 hitting set 枚举；
- 极端情况下 repair 数量爆炸时的内存、取消和超时行为。

这是已知的规模风险，不是本次采样中观察到的错误。后续性能验证应使用合成最坏情况和明确资源上限，不能通过减少结果数量来破坏“返回所有 inclusion-minimal repairs”的语义。

## 建议顺序

1. 先修导入边界：删除全空列，识别/拒绝不齐行和多行表头，区分合法单列警告。
2. 明确定义缺失值语义，再把候选字段缺失从全局失败改为冲突对级处理。
3. 扩展明确日期格式的类型推断并增加这些真实文件格式的测试。
4. 保持现有 minimal hitting set 语义；增加合成规模测试和资源保护，但不要用 top-k 或最短集合替代全部极小集合。
