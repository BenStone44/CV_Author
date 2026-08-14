# Chart 升维说明

本文用于说明当前图表从基础形态向更高维度形态升级时，数据字段、视觉编码和图表结构如何变化。

## 1. 术语与记法

- **维度（Dimension）**：用于区分类别、系列或分段的字段，例如日期、地区、产品和部门。
- **度量（Measure）**：用于决定位置、长度或面积的数值字段，例如销售额、数量和利润。
- **升维**：在原有图表映射上增加一个可区分的数据字段，或增加一个明确的结构语义。
- **记法**：`X`、`Category` 表示类别轴；`Y`、`Measure` 表示度量；`Series`、`Group`、`Segment` 表示新增的分类字段。

## 2. Line Chart

### 2.1 升维路径

```text
Line Chart
└── Single Line
    └── Multiple Line (+ Series)
```

### 2.2 图表类型

#### Single Line（单折线）

- **基础映射**：`X × Y`
- **数据要求**：一个连续或有序的 X 字段，一个度量字段。
- **视觉表现**：所有数据点连接为一条线，用位置和线段变化表达度量趋势。
- **示例**：日期 × 日销售额。

#### Multiple Line（多折线）

- **升维方式**：在 Single Line 上增加一个 `Series` 分类字段。
- **映射**：`X × Y × Series`
- **视觉表现**：每个 Series 生成一条独立折线，并通过颜色、线型或图例区分。
- **示例**：日期 × 销售额 × 地区。
- **与 Single Line 的关系**：X 和 Y 的含义保持不变，只增加“同一坐标系内要比较哪些系列”的分类维度。

### 2.3 Line Chart 升维表

| 图表类型 | 基础字段 | 新增字段/语义 | 推荐编码 | 视觉结果 |
| --- | --- | --- | --- | --- |
| Single Line | `X`, `Y` | 无 | `x=X`, `y=Y` | 一条趋势线 |
| Multiple Line | `X`, `Y` | `Series` | `x=X`, `y=Y`, `color=Series` | 多条可比较的趋势线 |

## 3. Bar Chart

### 3.1 升维路径

```text
Bar Chart
└── Single Bar
    ├── Grouped Bar (+ Group)
    ├── Stacked Bar (+ Segment)
    ├── Divergent Bar (+ Direction/sign semantics)
    └── Divergent Stacked Bar (+ Segment + Direction/sign semantics)
```

### 3.2 图表类型

#### Single Bar（单柱状图）

- **基础映射**：`Category × Measure`
- **数据要求**：一个类别字段，一个度量字段。
- **视觉表现**：每个类别对应一根柱，柱长或柱高表达度量大小。
- **示例**：产品 × 销售额。

#### Grouped Bar（分组柱状图）

- **升维方式**：增加一个 `Group` 分类字段，在每个主类别内并列展示多个柱。
- **映射**：`Category × Group × Measure`
- **推荐编码**：`x=Category`, `y=Measure`, `color=Group`（横向柱状图可交换 X/Y）。
- **视觉结果**：同一 Category 下的不同 Group 并列，适合比较组间差异。
- **示例**：月份 × 地区 × 销售额。

#### Stacked Bar（堆叠柱状图）

- **升维方式**：增加一个 `Segment` 分类字段，在每个主类别内沿柱体方向堆叠。
- **映射**：`Category × Segment × Measure`
- **推荐编码**：`x=Category`, `y=Measure`, `color=Segment`。
- **视觉结果**：一根柱由多个 Segment 组成，整柱表达总量，各段表达构成。
- **示例**：月份 × 产品类型 × 销售额。

#### Divergent Bar（发散柱状图）

- **升级方式**：引入以零点为基准的正负方向语义；柱体向相反方向延伸。
- **映射**：`Category × Signed Measure`
- **推荐编码**：`x=Category`, `y=SignedMeasure`；可使用 `color=Direction` 或根据度量正负自动设置颜色。
- **视觉结果**：正值从零点向一侧延伸，负值向另一侧延伸，突出增减、盈亏或支持/反对等方向。
- **维度说明**：如果方向来自度量本身的正负号，Divergent Bar 不一定增加独立数据维度；如果有明确的 `Direction` 字段，则可视为增加一个分类维度。
- **示例**：部门 × 利润（正负）。

#### Divergent Stacked Bar（发散堆叠柱状图）

- **升维方式**：同时保留发散方向语义，并增加 `Segment` 分类字段进行堆叠。
- **映射**：`Category × Segment × Signed Measure`
- **推荐编码**：`x=Category`, `y=SignedMeasure`, `color=Segment`；正负方向由 Signed Measure 或 `Direction` 决定。
- **视觉结果**：每个 Category 有一条零基线，正负两侧分别由多个 Segment 堆叠组成。
- **示例**：部门 × 费用类型 × 预算偏差（正负）。

### 3.3 Bar Chart 升维表

| 图表类型 | 字段映射 | 相对 Single Bar 的变化 | 主要视觉编码 | 适用问题 |
| --- | --- | --- | --- | --- |
| Single Bar | `Category × Measure` | 基础形态 | 位置 + 长度/高度 | 各类别的单一数值比较 |
| Grouped Bar | `Category × Group × Measure` | 增加 `Group`，并列布局 | `color=Group`，组内并列 | 比较同一类别下的多个组 |
| Stacked Bar | `Category × Segment × Measure` | 增加 `Segment`，堆叠布局 | `color=Segment`，段落堆叠 | 查看总量及组成 |
| Divergent Bar | `Category × Signed Measure` | 增加零点和正负方向语义 | Signed Measure；可选 `color=Direction` | 查看正负、增减或偏差 |
| Divergent Stacked Bar | `Category × Segment × Signed Measure` | 增加 `Segment`，同时保留发散语义 | `color=Segment` + 正负方向 | 查看正负两侧的组成结构 |

## 4. 总览：从基础图表到升维图表

| 图表家族 | 基础图表 | 升一维 | 升两维 | 核心变化 |
| --- | --- | --- | --- | --- |
| Line Chart | Single Line：`X × Y` | Multiple Line：`X × Y × Series` | 当前未定义 | 增加系列字段，在同一坐标系绘制多条线 |
| Bar Chart | Single Bar：`Category × Measure` | Grouped / Stacked：增加 `Group` 或 `Segment`；Divergent：增加方向语义 | Divergent Stacked：`Category × Segment × Signed Measure` | 增加组内分类、组成分段，或正负方向结构 |

## 5. 升维判定规则

1. **新增分类字段**：如果增加 `Series`、`Group` 或 `Segment`，就是显式增加一个数据维度。
2. **新增布局结构**：Grouped 使用并列位置，Stacked 使用同一柱体内的分段位置；二者都依赖新增分类字段。
3. **新增方向语义**：Divergent 依赖零点和正负值。仅改变度量的符号解释时，不必强行增加字段；存在 `Direction`/`Polarity` 字段时，再将其作为独立维度处理。
4. **编码优先级**：先保证 `x`/`y`（或横向柱状图的 `y`/`x`）绑定正确，再使用 `color` 区分 Series、Group 或 Segment，避免仅靠颜色表达本应由位置或堆叠表达的结构。
