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
- Cartesian 图表共享统一的 X/Y 坐标轴组件。Matrix 的 `Column/Row` 在坐标系统内分别映射为 `X/Y`，不是另一套坐标轴。
- Pie 支持多选 Angle components；其他单值 Channel 使用统一字段选择组件。

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

五种 Bar Card 共用同一套 Channel contract 和 Bar renderer。Card 决定柱子的布局语义，`Color` 在不同变体中显示为 Color、Group 或 Segment。

### Single Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Category` (`X`) | 是 | nominal、temporal | 每根柱所属类别 |
| `Value` (`Y`) | 是 | quantitative | 柱高和数值 |
| `Color` | 否 | nominal、temporal、quantitative | 柱色或连续颜色映射 |
| `Bar width` (`Size`) | 否 | quantitative | 映射柱宽；未绑定时使用静态宽度 |

升维：增加分类字段后升级为 Grouped Bar，并把该字段绑定到 `Color`。

### Grouped Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Category` (`X`) | 是 | nominal、temporal | 主类别 |
| `Value` (`Y`) | 是 | quantitative | 每个组的柱高 |
| `Group` (`Color`) | 否 | nominal、temporal、quantitative | 在主类别内生成并列柱；通常绑定分类字段 |
| `Bar width` (`Size`) | 否 | quantitative | 映射组内柱宽 |

### Stacked Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Category` (`X`) | 是 | nominal、temporal | 主类别 |
| `Value` (`Y`) | 是 | quantitative | 每个分段的长度 |
| `Segment` (`Color`) | 否 | nominal、temporal、quantitative | 在柱内生成堆叠分段；通常绑定分类字段 |
| `Bar width` (`Size`) | 否 | quantitative | 映射整根柱的宽度 |

### Divergent Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Category` (`X`) | 是 | nominal、temporal | 每根发散柱所属类别 |
| `Value` (`Y`) | 是 | quantitative | 正负值决定零基线两侧的方向和长度 |
| `Color` | 否 | nominal、temporal、quantitative | 柱色或连续颜色映射 |
| `Bar width` (`Size`) | 否 | quantitative | 映射柱宽 |

升维：增加分类字段后升级为 Divergent Stacked Bar，并把该字段绑定到 `Color`。

### Divergent Stacked Bar

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Category` (`X`) | 是 | nominal、temporal | 主类别 |
| `Value` (`Y`) | 是 | quantitative | 正负值分别在零基线两侧堆叠 |
| `Segment` (`Color`) | 否 | nominal、temporal、quantitative | 生成正负两侧的组成分段 |
| `Bar width` (`Size`) | 否 | quantitative | 映射整根柱的宽度 |

## 5. Pie Chart Card

### Pie Chart

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Angle components` | 是 | quantitative | 一个或多个数值字段决定扇区角度 |
| `Category` (`Color`) | 否 | nominal、temporal | 按类别分组并分配颜色 |
| `Outer radius` (`Radius`) | 否 | quantitative | 映射扇区外半径 |

Pie 的 Radius 有两种组合方式：

- `Shared`：全部 Angle components 共用一个 Radius 字段。
- `Per component`：每个 Angle component 独立选择 Radius 字段。

## 6. Donut Chart Card

### Donut Chart

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Angle` | 是 | quantitative | 扇区角度 |
| `Category` (`Color`) | 否 | nominal、temporal | 扇区分类和颜色 |
| `Ring` | 否 | nominal、temporal | 按字段生成同心环系列 |
| `Outer radius` (`Radius`) | 否 | quantitative | 映射外半径 |

## 7. Matrix Card

### Matrix

| Channel | 必选 | 接受类型 | 作用 |
| --- | --- | --- | --- |
| `Row` | 是 | nominal、temporal | 矩阵行；映射到统一 Cartesian Y 轴 |
| `Column` | 是 | nominal、temporal | 矩阵列；映射到统一 Cartesian X 轴 |
| `Cell value` (`Value`) | 否 | quantitative | 单元格连续颜色和透明度的数值来源 |
| `Color` | 否 | quantitative、nominal | 单元格颜色字段；未绑定时使用静态颜色 |

## 8. Card 与 Config 组合关系

| Card | 通用字段选择 | 视觉静态值/映射 | 专用配置 |
| --- | --- | --- | --- |
| Line Chart | X、Y、Color、Size、Shape | Color、Size | 无 |
| Scatterplot | X、Y、Color、Size、Shape | Color、Size | 无 |
| 5 种 Bar | X、Y、Color、Size | Color、Size | 变体化 Channel 标签 |
| Pie Chart | Color | Color | 多 Angle、Radius 模式、分组件 Radius |
| Donut Chart | Angle、Color、Ring、Radius | Color | 无 |
| Matrix | Row、Column、Value、Color | Color | Row/Column 到共享 X/Y 轴映射 |

实现中，`EncodingChannelField` 负责单个 Channel，`EncodingConfigPanel` 根据 contract 组合 Channel，并为 Pie 插入专用配置区。Store 的 `setChartEncoding` 负责把真实 Channel 写回 Chart Spec 及共享坐标关系。
