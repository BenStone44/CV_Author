# Chart Card Encoding Channels

本文档是当前 Chart Template 区全部 Card 的 Encoding 配置清单。Encoding 面板以这里对应的 `chartTemplateContracts` 为唯一配置来源；同一种渲染器可以被多个 Card 复用，但每张 Card 仍保留自己的名称、默认形态和 Channel 语义。

## 1. 通用规则

### 1.1 字段类型

| 类型 | 含义 | 常见字段 |
| --- | --- | --- |
| `nominal` | 无连续大小关系的类别 | person、region、product |
| `temporal` | 日期或时间 | date、month、timestamp |
| `quantitative` | 可计算的数值 | weight、sales、profit |

### 1.2 配置行为

- 标有 `必选` 的 Channel 未绑定时，图表不生成数据 marks。
- `Color`、`Size`、`Shape` 等视觉 Channel 未绑定列时使用静态值。
- 数值或时间字段绑定到 `Color`、`Size` 时可配置线性映射。
- Cartesian 图表共享统一的 X/Y 坐标轴组件。Matrix 的列/行维度分别写入 `X/Y`，不是 Vega-Lite 的 facet `column/row` 通道。
- Pie 支持多选 Theta measures；其他单值 Channel 使用统一字段选择组件。
- 顶部模板浏览器按 mark family 显示 Bar、Line、Area、Point、Rect、Arc、Contour、Hexbin、Chord、Sankey、Parallel coordinates、Hierarchy、Treemap、Dendrogram、Calendar、Boxplot 等类别 Card。类别 Card 内最多展示四个模板缩略图；少于四个时自动铺满。点击类别 Card 后在下拉菜单中显示并允许拖拽该类全部模板。

## 2. Line Chart Card

### Line Chart

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal、quantitative | 点在横轴上的位置 |
| `Y` | 是 | temporal、quantitative | 点在纵轴上的位置 |
| `Color` | 否 | nominal、quantitative | nominal 可拆分多条线；quantitative 可映射线色 |
| `Size` | 否 | quantitative | 映射线宽；未绑定时使用静态线宽 |
| `Shape` | 否 | nominal | 保留为线图的可选样式 Channel |

升维：基础形态是 Single Line；绑定分类 `Color` 或确认 Series 后成为 Multiple Line。

## 3. Scatterplot Card

### Scatterplot

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal、quantitative | 点的横向位置 |
| `Y` | 是 | nominal、temporal、quantitative | 点的纵向位置 |
| `Color` | 否 | nominal、temporal、quantitative | 区分类别或映射连续颜色 |
| `Size` | 否 | quantitative | 映射点半径；未绑定时使用静态点大小 |
| `Shape` | 否 | nominal | 区分类别形状 |

## 4. Bar Chart Cards

五种 Bar Card 共用同一套 Channel contract 和 Bar renderer。Card 决定柱子的布局语义，`Color` 在不同变体中承担普通颜色、分组或堆叠分段语义。

### Single Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal | 每根柱所属类别 |
| `Y` | 是 | quantitative | 柱高和数值 |
| `Color` | 否 | nominal、temporal、quantitative | 柱色或连续颜色映射 |
| `Size` | 否 | quantitative | 映射柱宽；未绑定时使用静态宽度 |

升维：增加分类字段后升级为 Grouped Bar，并把该字段绑定到 `Color`。

### Grouped Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal | 主类别 |
| `Y` | 是 | quantitative | 每个组的柱高 |
| `Color` | 是 | nominal、temporal | 在主类别内区分并列组 |
| `Size` | 否 | quantitative | 映射组内柱宽 |

### Stacked Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal | 主类别 |
| `Y` | 是 | quantitative | 每个分段的长度 |
| `Color` | 是 | nominal、temporal | 在柱内区分堆叠分段 |
| `Size` | 否 | quantitative | 映射整根柱的宽度 |

面板中的 `Segment` 是 `Color` 的模板语义。除绑定一个分类字段外，也支持多选定量列；多列会先折叠成长表，再以派生的 segment member 通过标准 `color` 通道堆叠。

### Divergent Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal | 每根发散柱所属类别 |
| `Y` | 是 | quantitative | 正负值决定零基线两侧的方向和长度 |
| `Color` | 否 | nominal、temporal、quantitative | 柱色或连续颜色映射 |
| `Size` | 否 | quantitative | 映射柱宽 |

升维：增加分类字段后升级为 Divergent Stacked Bar，并把该字段绑定到 `Color`。

### Divergent Stacked Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal | 主类别 |
| `Y` | 是 | quantitative | 正负值分别在零基线两侧堆叠 |
| `Color` | 是 | nominal、temporal | 生成正负两侧的组成分段 |
| `Size` | 否 | quantitative | 映射整根柱的宽度 |

Divergent Stacked Bar 使用相同的多列 Segment 机制，正负值分别从零基线两侧堆叠。

## 5. Pie Chart Card

### Pie Chart

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Theta` | 是 | quantitative | 一个或多个数值字段决定扇区角度 |
| `Color` | 否 | nominal、temporal | 按类别分组并分配颜色 |
| `R` (`Radius`) | 否 | quantitative | 映射扇区外半径 |

Pie 的 Radius 有两种组合方式：

- `Shared`：全部 Theta measures 共用一个 Radius 字段。
- `Per component`：每个 Theta measure 独立选择 Radius 字段。

## 6. Donut Chart Card

### Donut Chart

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Theta` | 是 | quantitative | 扇区角度 |
| `Color` | 否 | nominal、temporal | 扇区分类和颜色 |
| `Ring` | 否 | nominal、temporal | 按字段生成同心环系列 |
| `R` (`Radius`) | 否 | quantitative | 映射外半径 |

## 7. Matrix Card

### Matrix

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal | 矩阵列；对应列维度 |
| `Y` | 是 | nominal、temporal | 矩阵行；对应行维度 |
| `Color` | 否 | quantitative、nominal | 单元格数值或分类颜色来源 |

## 8. Card 与 Config 组合关系

| Card | 通用字段选择 | 视觉静态值/映射 | 专用配置 |
| --- | --- | --- | --- |
| Line Chart | X、Y、Color、Size、Shape | Color、Size | 无 |
| Scatterplot | X、Y、Color、Size、Shape | Color、Size | 无 |
| 5 种 Bar | X、Y、Color、Size | Color、Size | 变体化堆叠/分组语义 |
| Pie Chart | Theta、Color、Radius | Color、Radius | 多 Theta measure、Radius 模式、分组件 Radius |
| Donut Chart | Theta、Color、Ring、Radius | Color、Radius | Ring 是模板扩展角色 |
| Matrix | X、Y、Color | Color | X/Y 到共享坐标轴映射 |

实现中，`EncodingChannelField` 负责单个 Channel，`EncodingConfigPanel` 根据 contract 组合 Channel，并为 Pie 插入专用配置区。Store 的 `setChartEncoding` 只把真实 Channel 写回 atomic Chart Unit 的 Mark Encoding；共享坐标关系在后续 Composition 阶段单独建立。

## 9. Area Cards

Area Chart、Stacked Area、Streamgraph 与 Horizon Chart 共用 Area renderer：

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `X` | 是 | nominal、temporal、quantitative | 横向顺序 |
| `Y` | 是 | quantitative | 面积高度 |
| `Color` | 否 | nominal、temporal | 拆分面积层 |

Area Chart 使用官方示例的 `steelblue` 单面积；Stacked Area 使用 Tableau 10 与零基线；Streamgraph 使用 `stackOffsetWiggle` 和 `stackOrderInsideOut`。Horizon 按 Series 生成 25px 基准高度的行，并使用 `schemeBlues` 折叠色带；`Bands` 可编辑，默认 7。

## 10. Parallel Coordinates Card

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Numeric dimensions` | 是，至少两个 | quantitative，多选 | 生成平行数值轴 |
| `Color` | 否 | nominal、temporal、quantitative | 区分记录 |

与 Gallery 示例一致，每个 Numeric dimension 是一条水平数值轴，各轴从上到下排列。记录沿这些水平轴连接；连续 Color 使用反向 BrBG 色阶。

## 11. Hierarchy Cards

Icicle、Sunburst、Treemap 与 Dendrogram 共用 Hierarchy contract 和 D3 hierarchy 数据模型。

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Node ID` | 是 | nominal、temporal、quantitative | 节点唯一标识 |
| `Parent ID` | 是 | nominal、temporal、quantitative | 父节点标识；根节点留空 |
| `Node value` | 否 | quantitative | 节点权重；未绑定时按节点计数 |
| `Color` | 否 | nominal、quantitative | 节点颜色 |

Icicle、Sunburst 按根节点的一级子树使用 Rainbow 色阶；Treemap 只绘制叶节点、使用 Tableau 10，并提供 `Binary`、`Squarify`、`Slice-dice`、`Slice`、`Dice` tiling；Dendrogram 使用 Gallery 的 Cluster layout 和水平 link。

## 12. Statistical And Density Cards

| Card | 必选 Channel | 可选 Channel |
| --- | --- | --- |
| Calendar | `Date` (temporal)、`Daily value` (quantitative) | `Color` |
| Box Plot | `Bin variable` (`X` quantitative)、`Distribution value` (`Y` quantitative) | `Color` |
| Contour | `X`、`Y`、`Grid value` (quantitative) | `Color` |
| Hexbin | `X`、`Y` (quantitative) | `Color`、`Size` |

- Calendar 按 Date 排序，用相邻两行 Daily value 计算百分比变化；以 Monday 为周起点、过滤周末、年份倒序，并绘制月份边界。
- Box Plot 使用 `d3.bin().thresholds(width / 40)` 对连续 X 分箱，再在每个 bin 内计算 Y 的四分位数、1.5 IQR whisker 和 outlier。
- Contour 要求 X/Y 构成规则网格，Grid value 进入 `d3.contours()`；正值数据使用 sequential-log Magma 与白色等高线。
- Hexbin 与 Gallery 示例一致使用 X/Y log scale、BuPu 颜色和黑色边框；`Radius` 默认 8，并按图宽相对 928px 基准缩放。

## 13. Relationship Cards

Chord 与 Sankey 共用 Flow contract；Chord 以矩阵生成 arc/ribbon，Sankey 以有向边生成分层节点与流带。

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Source` | 是 | nominal、temporal、quantitative | 边起点 |
| `Target` | 是 | nominal、temporal、quantitative | 边终点 |
| `Flow value` | 否 | quantitative | 边权重；未绑定时每行计为 1 |
| `Color` | 否 | nominal、quantitative | 节点或连线颜色 |

Chord 使用 `padAngle(20 / innerRadius)`、subgroup descending、target-colored ribbon 和 group ticks。Sankey 默认 `justify`、15px node width、10px padding，并保留 Node alignment 与 Link color 两个简单配置；Link color 默认 source-target gradient。

## 14. D3 Gallery 对齐

这 15 张新增 Card 的布局、默认色阶、排序、stack/partition/bin/contour/flow 算法均取自 Observable D3 Gallery 对应示例。模板只把示例中的固定数据字段替换为上述 Encoding bindings，并保留少量原示例已有的可编辑参数；画布尺寸变化时按同一算法重新计算几何。
