# Card List 与 Vega-Lite Encoding / Column Mapping 对比

本文档针对当前 Chart Template Card List 中实际展示的 10 张 Card，比较：

- 当前项目的 encoding contract；
- Vega-Lite 原生 encoding；
- encoding 与 CSV / Dataset column 的绑定方式；
- 后续更新 `encoding channels` 时需要保留的模板语义。

当前 Card List：Line Chart、Scatterplot、Pie Chart、Donut、Matrix、Single Bar、Grouped Bar、Stacked Bar、Divergent Bar、Divergent Stacked Bar。

> 结论：Vega-Lite 的 channel 是视觉变量，例如 `x`、`y`、`theta`、`color`；当前项目中的 `Group`、`Segment`、`Ring`、`Cell value`、`Angle components` 则包含模板语义或数据整形语义。两者不应继续共用同一层枚举。加入 CSV -> Cube 转换后，用户层应优先绑定 `measure + dimension/member`，而不是直接选择底层 CSV column。

## 1. Vega-Lite channel 如何对应 column

Vega-Lite 最基本的字段绑定形式如下：

```json
{
  "encoding": {
    "x": { "field": "date", "type": "temporal" },
    "y": { "field": "sales", "type": "quantitative", "aggregate": "sum" }
  }
}
```

这里 `date` 和 `sales` 都是输入数据对象中的属性名，也就是当前项目中的 `Dataset.columns[].name`。

| 绑定形式 | 是否对应输入 column | 含义 | 当前项目应如何理解 |
| --- | --- | --- | --- |
| `{ field: "sales", type: "quantitative" }` | 是，一对一指向 `sales` | 将一列映射到 channel | 对应当前 `ChartEncoding` |
| `{ field: "sales", aggregate: "sum" }` | 是，但输出为聚合结果 | 先按其余离散字段分组，再聚合该列 | `aggregate` 应属于 field definition，而不只是单独的旁路配置 |
| `{ field: "date", timeUnit: "yearmonth" }` | 来源是一列，语义是派生字段 | 从日期列计算年月 | 当前模型尚未表达 `timeUnit` |
| `{ field: "value", bin: true }` | 来源是一列，语义是分箱后的派生字段 | 连续值转区间 | 当前模型尚未表达 `bin` |
| `{ datum: 0 }` | 否 | 将固定数据值送入 scale | 不等于 column 绑定 |
| `{ value: "#2563eb" }` | 否 | 直接使用固定视觉值 | 对应当前面板中的 `Static` |
| CSV -> Cube 阶段执行 unpivot / fold | 间接对应多个输入 columns | 将宽表多列转为 dimension members + measure value | 推荐替代当前 Pie 的 `angleFields[]` |
| Chart spec 中执行 `transform: [{ fold: [...] }]` | 间接对应多个输入 columns | 图表临时将宽表多列转成长表两列 | 仅作为未经过 Cube 转换时的兼容方案 |

### 1.1 Column type 对照

| 当前 `DataColumnType` | Vega-Lite type | 说明 |
| --- | --- | --- |
| `nominal` | `nominal` / `N` | 无顺序类别 |
| 暂无 | `ordinal` / `O` | 有顺序类别；当前类型系统缺失 |
| `temporal` | `temporal` / `T` | 日期时间 |
| `quantitative` | `quantitative` / `Q` | 连续数值 |

### 1.2 Column 与 channel 的基数关系

| 场景 | 是否符合 Vega-Lite | 示例 |
| --- | --- | --- |
| 一个 channel 绑定一个 column | 是，最常见 | `y.field = "sales"` |
| 同一 column 同时绑定多个 channels | 是 | Grouped Bar 的 `group` 同时绑定 `xOffset` 与 `color` |
| 一个 channel 直接绑定多个 columns | 否 | `theta: ["sales", "profit"]` 不是合法 Vega-Lite encoding |
| 多个 columns 在导入阶段转为 Cube members，再绑定一个 channel | 是，推荐 | `water_kg/fat_kg/...` -> `component × weight`，然后 `theta.field = "weight"` |
| 多个 columns 在 Chart spec 中先 `fold`，再绑定一个 channel | 是，兼容方案 | `fold: ["sales", "profit"]`，然后 `theta.field = "value"` |
| channel 使用固定值，不绑定 column | 是 | `color.value = "#2563eb"` |

一个重要规则是：存在聚合时，未聚合的离散 encoding 会成为 group-by 维度。例如 `x=region`、`color=product`、`y=sum(sales)` 表示按 `(region, product)` 聚合 `sales`。

## 2. 当前 channel 与 Vega-Lite 原生 channel 对比

| 当前名称 | 当前含义 | Vega-Lite 对应 | 与 column 的关系 | 更新建议 |
| --- | --- | --- | --- | --- |
| `x` | Cartesian 横向位置 | `x` | 直接绑定一列 | 保留 |
| `y` | Cartesian 纵向位置 | `y` | 直接绑定一列 | 保留 |
| `angle` | Pie / Donut 扇区角度 | `theta` | 通常绑定 quantitative 列 | 改为 `theta`；Vega-Lite 的 `angle` 是 mark 旋转角，不是扇区角度 |
| `radius` | Arc 外半径 | `radius` | 可绑定 quantitative 列 | 保留；如表达环带边界，还需 `radius2` |
| `ring` | Donut 同心环分组 | 无直接同名 channel | 当前绑定类别列后由 renderer 计算环序号 | 保留为模板角色；编译时转换为 `radius/radius2` 派生字段，或转换为 facet/layer |
| `row` | Matrix 的行坐标 | Matrix 中应为 `y` | 当前绑定类别列 | 不应直接映射到 Vega-Lite `row`；后者表示纵向 facet |
| `column` | Matrix 的列坐标 | Matrix 中应为 `x` | 当前绑定类别列 | 不应直接映射到 Vega-Lite `column`；后者表示横向 facet |
| `value` | Matrix 单元格数值 | 通常为 `color` | 当前绑定 quantitative 列 | 保留为模板角色；编译到 `color.field`，不是原生 channel |
| `color` | 颜色或分类系列 | `color`，也可细分为 `fill` / `stroke` | 可绑定列，也可使用固定值 | 保留；线图可进一步选择 `stroke`，实心 mark 可选择 `fill` |
| `size` | 点大小、线宽或柱宽 | `size` 或 `strokeWidth` | 通常绑定 quantitative 列，也可固定 | 不应对所有 mark 使用同一种语义；Line 建议编译为 `strokeWidth` |
| `shape` | 点形状或当前 Line 的预留样式 | `shape` | 通常绑定 nominal 列 | Scatter 保留；Line 路径本身不使用 shape，除非明确启用 point marks |
| `series` | renderer 内部分组字段 | 常由 `color`、`detail`、`strokeDash`、`xOffset/yOffset` 表达 | 通常绑定类别列 | 保留为模板角色，不加入原生 channel 枚举 |
| `angleFields[]` | 一个 Pie 选择多个数值列 | 无直接对应 | 多列选择 | 迁移为 Cube 的 `measure + component members`；只有原始宽表兼容路径才编译为 `fold` |

## 3. Card 逐项对比

表中的 `Q / T / N / O` 分别表示 quantitative、temporal、nominal、ordinal。

| Card | Vega-Lite mark | 当前项目 contract | 推荐的 Vega-Lite encoding | Column 绑定与分组方式 | 主要差异 |
| --- | --- | --- | --- | --- | --- |
| Line Chart | `line` | `x` 必选；`y` 必选；`color/size/shape` 可选 | `x: field`；`y: field`；系列用 `color` 或 `detail`；线宽用 `strokeWidth` | `x` 通常 T/Q/O，`y` 通常 Q；类别列作为 series 会把数据拆成多条线 | 当前 `size` 实际表示线宽；`shape` 不作用于 line path；`color: Q` 是逐点连续色，不能自然代表稳定 series |
| Scatterplot | `point` / `circle` | `x/y` 必选；`color/size/shape` 可选 | `x`、`y`、`color`、`size`、`shape` | 每个 channel 各绑定一列；同一类别列可同时绑定 `color` 与 `shape` | 与 Vega-Lite 最接近；建议允许 O 类型 |
| Single Bar | `bar` | `x=Category`；`y=Value`；`color/size` 可选 | `x: category`；`y: aggregate(measure)`；`color` 可选 | `x` 为 N/O/T；`y` 为 Q，通常需要 `sum/mean` | 当前 renderer 默认把相同 category 的 y 求和，这一聚合应显式进入 field definition |
| Grouped Bar | `bar` | `x=Category`；`y=Value`；`color=Group` | `x: category`；`xOffset: group`；`y: aggregate(measure)`；`color: group` | 同一个 group column 通常同时绑定 `xOffset` 和 `color` | 当前把 Group 只存为 `color`，布局分组由 chart variant 隐式完成；Vega-Lite 需要显式 `xOffset` |
| Stacked Bar | `bar` | `x=Category`；`y=Value`；`color=Segment` | `x: category`；`y: aggregate(measure), stack: "zero"`；`color: segment` | segment column 是额外 group-by；`color` 同时决定堆叠分段 | 与 Vega-Lite 接近，但建议显式保存 `stack`，避免靠默认推断 |
| Divergent Bar | `bar` | 与 Single Bar 相同，但 y 允许正负 | `x: category`；`y: signed measure` | 正负值来自同一 Q column，零基线由 scale/domain 决定 | Vega-Lite 没有独立 divergent channel；它是数据与 scale 语义 |
| Divergent Stacked Bar | `bar` | 与 Stacked Bar 相同，但 y 允许正负 | `x: category`；`y: signed measure, stack: "zero"`；`color: segment` | 对 `(category, segment)` 聚合；正负值分别从零点堆叠 | “divergent-stacked”是模板 preset，不是新 channel |
| Pie Chart | `arc` | `angle`/`angleFields[]`；`color=Category`；`radius` | `theta: measure`；`color: component dimension`；所选 members 进入 filter/domain | Cube 中 `weight` 是 measure，`water/fat/muscle/minerals` 是 component members；每个 member 形成一个扇区 | `angle` 应改为 `theta`；Cube 路径下不再需要 `angleFields[]` |
| Donut | `arc` + `innerRadius` | `angle`；`color=Category`；`ring`；`radius` | `theta: measure`；`color: component dimension`；固定 `mark.innerRadius`；多环需额外 ring dimension | component members 决定扇区和颜色；另一个 dimension 可决定同心环 | Donut 本身不是独立 encoding；`ring` 也不是 Vega-Lite 原生 channel |
| Matrix | `rect` | `row`；`column`；`value`；`color` | `x: column category`；`y: row category`；`color: aggregate(cell value)` | row/column 两列共同定义 cell；value 列经聚合后控制颜色；无 value 时可用 `count()` | 当前 `row/column/value` 都是模板角色；Vega-Lite 的 `row/column` 会生成多个子视图，不是矩阵坐标 |

## 4. 典型 column mapping 示例

假设 CSV 包含：

| region | product | month | sales | profit |
| --- | --- | --- | ---: | ---: |
| East | A | 2026-01 | 120 | 20 |
| East | B | 2026-01 | 90 | -5 |

### 4.1 Grouped Bar：一个 column 同时驱动两个 channels

```json
{
  "mark": "bar",
  "encoding": {
    "x": { "field": "region", "type": "nominal" },
    "xOffset": { "field": "product" },
    "y": { "field": "sales", "type": "quantitative", "aggregate": "sum" },
    "color": { "field": "product", "type": "nominal" }
  }
}
```

`product` 只是一列，但同时承担组内位置和颜色两个视觉通道。模板层可以把它称为 `Group`，底层则展开为 `xOffset + color`。

### 4.2 Pie / Donut：CSV columns 先转为 Cube measure

原始宽表：

| person | date | weight_kg | water_kg | fat_kg | muscle_kg | minerals_kg |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| P1 | 2026-01 | 88 | 38.4 | 18.6 | 27.8 | 3.2 |

推荐在 CSV -> Cube 阶段将四个组成列转换成下面的逻辑 cell：

| person | date | component | weight |
| --- | --- | --- | ---: |
| P1 | 2026-01 | water | 38.4 |
| P1 | 2026-01 | fat | 18.6 |
| P1 | 2026-01 | muscle | 27.8 |
| P1 | 2026-01 | minerals | 3.2 |

也就是：

```text
person × date × component -> weight
```

此时用户的绑定过程可以表达为：

1. 选择 measure：`weight`。
2. 选择扇区 dimension：`component`。
3. 选择 members：`water`、`fat`、`muscle`、`minerals` 中的任意组合。
4. 可选地为每个 member 指定颜色。

编译后的 Vega-Lite 不需要多个 `theta` 字段：

```json
{
  "transform": [
    {
      "filter": {
        "field": "component",
        "oneOf": ["water", "fat", "muscle", "minerals"]
      }
    }
  ],
  "mark": "arc",
  "encoding": {
    "theta": { "field": "weight", "type": "quantitative", "aggregate": "sum" },
    "color": {
      "field": "component",
      "type": "nominal",
      "scale": {
        "domain": ["water", "fat", "muscle", "minerals"],
        "range": ["#3b82f6", "#f59e0b", "#ef4444", "#64748b"]
      }
    }
  }
}
```

这时颜色仍然只有一个 `color` channel，但每个 component member 都有自己的颜色。用户看到的是“给 water / fat / muscle / minerals 分别选色”，底层保存的是同一个离散 scale 的 `domain -> range` 映射。

若数据尚未转换为 Cube，当前 `angleFields = [water_kg, fat_kg, ...]` 仍可作为兼容输入，在 Chart compiler 中临时 `fold`；它不应成为新的主绑定模型。

### 4.3 Matrix：模板 Row / Column 不等于 Vega-Lite row / column

```json
{
  "mark": "rect",
  "encoding": {
    "x": { "field": "month", "type": "temporal", "timeUnit": "yearmonth" },
    "y": { "field": "product", "type": "nominal" },
    "color": { "field": "sales", "type": "quantitative", "aggregate": "sum" }
  }
}
```

在模板 UI 中可以继续显示 `Column = month`、`Row = product`、`Cell value = sales`，但保存或编译到 Vega-Lite 时应分别落到 `x`、`y`、`color`。

## 5. Cube-first 绑定模型

### 5.1 建议的数据语义

`a × b × c -> measure` 可以统一表示为：一组 dimension coordinates 唯一定位一个 cell，cell 中保存一个或多个 measure value。

```ts
type CubeSchema = {
  dimensions: Array<{
    id: string;
    members: Array<{ id: string; label: string }>;
  }>;
  measures: Array<{
    id: string;
    label: string;
    unit?: string;
  }>;
};

type CubeCell = {
  coordinates: Record<string, string>;
  measures: Record<string, number>;
};
```

体成分案例对应：

```ts
const schema = {
  dimensions: [
    { id: "person", members: [/* P1, P2, ... */] },
    { id: "date", members: [/* 2026-01, ... */] },
    { id: "component", members: ["water", "fat", "muscle", "minerals"] },
  ],
  measures: [
    { id: "weight", label: "Weight", unit: "kg" },
  ],
};
```

这里 `weight` 是 measure；`water/fat/muscle/minerals` 不是四个 measure，也不是四个 encoding channels，而是 `component` dimension 的四个 members。这样最符合“先选择 weight，再选择它的组成部分”的交互。

需要保持两个数据粒度约束：

- `weight_kg` 总量不能与四个 component 一起进入同一个 Pie，否则总量和分量会被重复计算。总量应由四个 component 聚合得到，或作为单独的 `weightTotal` measure 存在于更粗的 `(person, date)` grain。
- 当图表没有绑定 `person` 或 `date` 时，系统必须明确对这些剩余维度执行 filter、aggregate 或 facet，不能静默把所有人和所有日期相加。

### 5.2 建议的 Chart semantic binding

```ts
type CubeChartBinding = {
  measure: {
    measureId: string;
    aggregate?: "sum" | "avg";
  };
  roles: Record<string, {
    dimensionId: string;
    memberIds?: string[];
  }>;
  memberStyles?: Record<string, {
    color?: string;
  }>;
};
```

Pie / Donut 示例：

```json
{
  "measure": { "measureId": "weight", "aggregate": "sum" },
  "roles": {
    "slice": {
      "dimensionId": "component",
      "memberIds": ["water", "fat", "muscle", "minerals"]
    },
    "color": { "dimensionId": "component" }
  },
  "memberStyles": {
    "water": { "color": "#3b82f6" },
    "fat": { "color": "#f59e0b" },
    "muscle": { "color": "#ef4444" },
    "minerals": { "color": "#64748b" }
  }
}
```

`memberStyles` 应以稳定的 member id 为 key，而不是数组下标。这样用户取消并重新选择某个 component、排序改变或数据刷新时，颜色仍能稳定对应。

### 5.3 各 Card 的 Cube 绑定方式

| Card | 先选 measure | 再选 dimension / members | 编译到 Vega-Lite |
| --- | --- | --- | --- |
| Line | Y measure | X dimension；可选 Series dimension/members | `x`、`y`、`color/detail` |
| Scatter | X/Y measures 或 dimension + measure | 可选 Color/Shape dimension | `x`、`y`、`color`、`shape` |
| Single/Divergent Bar | Value measure | Category dimension/members | `y` + `x` |
| Grouped Bar | Value measure | Category dimension + Group dimension/members | `y` + `x` + `xOffset/color` |
| Stacked/Divergent Stacked Bar | Value measure | Category dimension + Segment dimension/members | `y(stack)` + `x` + `color` |
| Pie/Donut | Angle measure，例如 `weight` | Slice dimension + members，例如 `component -> water/fat/...` | `theta` + `color` + member filter/scale |
| Matrix | Cell measure | Column dimension + Row dimension/members | `color` + `x` + `y` |

这套交互中，用户不需要知道 `theta`、`xOffset` 或 `fold`。Card 只询问 measure、分组维度和成员；template compiler 再产生 Vega-Lite encoding。

### 5.4 与当前 Cube 实现的迁移关系

当前 `cubeBinding.ts` 已经接近这个交互，但 `CubeBindingPayload.values` 保存的仍然是 `water_kg/fat_kg/...` 等原始 column names，Pie 最终也仍写入 `angleFields[]`。

建议未来 payload 改为传递稳定的 Cube identity：

```ts
type CubeBindingPayload = {
  measureId: string;
  role?: "x" | "y" | "value" | "slice" | "color" | "group" | "segment";
  dimensionId?: string;
  memberIds?: string[];
  aggregation?: "sum" | "avg";
};
```

| 当前实现 | Cube-first 实现 |
| --- | --- |
| `dimension: "weight"` | `measureId: "weight"` |
| `values: ["water_kg", "fat_kg", ...]` | `dimensionId: "component"` + `memberIds: ["water", "fat", ...]` |
| `bindCubeFieldsToPie()` 写入 `angleFields[]` | 保存 `CubeChartBinding`，由 compiler 生成 `theta/color/filter` |
| 颜色按字段顺序自动取 palette | `component` member id 映射到稳定颜色，可有 Cube 默认值和 Chart override |
| 只认识固定的 `person/date/weight` | 从 `CubeSchema.dimensions/measures` 动态生成选择器 |

颜色建议分两级保存：Cube schema 可以提供 component 的默认颜色，单个 Chart 的 `memberStyles` 只保存覆盖值。这样不同图表默认保持 water/fat 等颜色一致，同时仍允许用户在当前 Pie 或 Donut 中单独调整。

## 6. 对更新 encoding channels 的建议

建议将模型拆成两层：

| 层 | 负责什么 | 建议内容 |
| --- | --- | --- |
| Vega-Lite channel 层 | 最终视觉映射 | `x`、`y`、`xOffset`、`yOffset`、`theta`、`theta2`、`radius`、`radius2`、`color/fill/stroke`、`size/strokeWidth`、`shape`、`detail`、`order`、`row/column/facet` 等 |
| Template role 层 | Card 对用户表达的图表语义 | `category`、`measure`、`group`、`segment`、`series`、`ring`、`matrixRow`、`matrixColumn`、`cellValue`、`angleComponents` |

模板 role 再通过 compiler / resolver 展开为 Vega-Lite channel：

| Template role | Card 上下文 | 编译结果 |
| --- | --- | --- |
| `group` | Grouped Bar | 同一 field -> `xOffset` + `color` |
| `segment` | Stacked Bar | field -> `color`，measure channel 设置 `stack` |
| `matrixColumn` | Matrix | field -> `x` |
| `matrixRow` | Matrix | field -> `y` |
| `cellValue` | Matrix | field -> `color` |
| `angleComponents` | Pie 原始宽表兼容 | fields -> `fold`，派生 value -> `theta`，派生 key -> `color/detail` |
| `slice` | Pie / Donut Cube 绑定 | measure -> `theta`；dimension -> `color/detail`；members -> filter/domain |
| `ring` | Multi-ring Donut | field -> 派生环序号与 `radius/radius2`，或 facet/layer |

这样可以避免两个现有歧义：Matrix 的 `column` 被误认为 facet column，以及 Pie 的 `angle` 被误认为 Vega-Lite 的 mark rotation channel。

## 7. 当前实现依据与参考

项目内依据：

- Card List：`cv-author-app/src/useCanvasStore.ts` 中的 `implementedTemplateDefinitions`；
- 当前 channel contract：`cv-author-app/src/chartTemplates.ts`；
- 当前别名解析：`cv-author-app/src/encodingConfig.ts`；
- renderer 的实际字段消费：`cv-author-app/src/semanticRenderer.ts`。

Vega-Lite 官方参考：

- [Encoding](https://vega.github.io/vega-lite/docs/encoding.html)
- [Arc / Pie / Donut](https://vega.github.io/vega-lite/docs/arc.html)
- [Bar](https://vega.github.io/vega-lite/docs/bar.html)
- [Fold Transform](https://vega.github.io/vega-lite/docs/fold.html)
