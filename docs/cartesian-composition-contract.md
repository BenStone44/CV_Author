# Cartesian Composition Contract

本文档定义直角坐标系下 `layer`、`concat`、`facet` 和 `nested` 的规范行为。
它是 composition 合法性、拖放命中、层级进入和 facet 上下文继承的共同契约。

## 1. 基本对象

普通 Chart 和已经完成的 Composite 都是可组合单元。组合操作必须引用单元本身，
不能把已有 Composite 展开成叶子 Chart、覆盖其内部 composition，或把 facet cell
当成外层组合成员。

每个可组合单元向父层暴露一个外部接口：

```ts
type CartesianCompositionUnit = {
  unitId: string
  bounds: Bounds
  x?: CartesianAxisSignature
  y?: CartesianAxisSignature
}

type CartesianAxisSignature =
  | {
      channel: "x" | "y"
      kind: "categorical"
      names: string[]
    }
  | {
      channel: "x" | "y"
      kind: "quantitative"
    }
  | {
      channel: "x" | "y"
      kind: "temporal"
      // Temporal compatibility continues to use the existing policy until a
      // separate temporal composition contract is defined.
    }
```

`unitId` 指向普通 Chart 或 Composite root。父 composition 只引用这些 root ID；
成员 Chart 仍由原有 Composite 持有。

## 2. 轴兼容性

`layer` 和 `concat` 可以共享 X、Y，或者只共享其中一个轴。每个共享轴独立验证，
不能因为另一轴兼容而放宽当前轴的约束。

### 2.1 Nominal 和 Ordinal

Nominal 与 Ordinal 统一按 categorical axis 处理。它们不要求来自同一个 dataset
或同名 column，但它们最终表示的 name list 必须一致。

name list 是 Chart-local data view 执行 inherited context、filter、aggregate/bin 后，
再应用显式排序所得的去重可见名称列表。比较的是解析后的名称和顺序，而不是 column
名称：

```text
region = [East, West]  与  area = [East, West]  -> compatible
region = [East, West]  与  area = [West, East]  -> incompatible
region = [East, West]  与  area = [East, North] -> incompatible
```

因此，共享 categorical axis 不得通过取并集补齐缺失名称，也不得因为两侧字段类型都
是 nominal/ordinal 就直接判定兼容。

### 2.2 Quantitative

两个轴只要都解析为 quantitative 且值可按数值处理，就具备结构上的拼合资格。它们
不要求来自同一个 column，也不要求原始 domain 相同：

```text
weight_kg : quantitative  与  water_kg : quantitative -> structurally eligible
```

这种判断只代表可以构造共享数值 scale，不代表两个量在业务语义、单位或量纲上等价。
系统不得替用户推断这种等价性。最终是否共享该 quantitative axis 必须由用户的明确
组合选择决定。

### 2.3 合法共享集合

对 X、Y 分别验证后，保留所有非空合法共享集合，不评分、不排序、不自动丢弃：

```text
X compatible, Y incompatible -> {X}
X incompatible, Y compatible -> {Y}
X compatible, Y compatible   -> {X}, {Y}, {X,Y}
```

对于 `concat`，空间方向直接表达共享轴：左右 concat 共享 Y，上下 concat 共享 X。
对于 `layer`，如果存在多个合法共享集合，界面必须让用户确认共享 X、Y 还是 X+Y；
不能仅因为两轴都 structurally eligible 就静默选择 X+Y。

## 3. Composition 运算

### 3.1 Layer

`layer(A, B, sharedAxes)` 将成员投影到同一 plot frame，并只同步 `sharedAxes` 中的
scale。每个成员继续拥有自己的 dataset、Chart-local transforms、encoding 和 mark。

创建后，Layer 对父层表现为一个 Composite root。外层操作不得直接命中内部 member；
用户进入该 Layer 后，member 才重新成为当前 scope 的顶层目标。

### 3.2 Concat

`concat(A, B, direction)` 建立空间相邻关系：

- `left` / `right`：共享 Y；
- `top` / `bottom`：共享 X。

Concat 是例外的开放式空间容器。它不把所有相邻视图收缩为一个不可分的轴接口；
每个直接成员继续暴露自己的边界，用于追加同方向成员、建立交叉方向连接或形成 corner。
但是，Concat 的成员可以是普通 Chart，也可以是 Layer、Facet 或 Nested 的 Composite
root，不能展开这些成员的内部结构。

### 3.3 Facet

Facet 由一个 categorical field 创建重复 Chart，同时产生一个新的外部轴：

- `facet column(field)`：外部 X 由 `field` 的 nominal/ordinal name list 定义；
  外部 Y 继承被 facet 单元的外部 Y；
- `facet row(field)`：外部 Y 由 `field` 的 nominal/ordinal name list 定义；
  外部 X 继承被 facet 单元的外部 X。

Facet 创建后是一个 Composite root，而不是若干互不相关的 cell。后续 `concat` 和
`layer` 必须验证并使用 Facet 的上述外部轴签名，不得只读取任意一个 cell 的轴，
也不得用外层 composition 覆盖内部 facet 关系。

每个 facet cell 必须显式保存固定上下文：

```ts
type FacetCellContext = {
  facetCompositionId: string
  values: Array<{
    field: string
    value: string
    source: "facet-cell"
  }>
}
```

一维 Facet 保存一个 field/value；二维 Facet 同时保存 row 和 column 的 field/value。
此上下文属于 Facet 与 cell 的关系，不应复制成用户可编辑的 child-local filter。

### 3.4 Nested

Nested child 放入 facet cell 或该 cell 内的具体 mark 时，必须继承该位置的
`FacetCellContext`。如果同时落在具体 parent row/mark 上，再加入更具体的 parent-row
上下文：

```text
facet-cell context
  AND parent-row context
  AND child-local filters
  -> child aggregate/bin transforms
  -> child encodings
```

继承值存放在 parent-child relationship 上。移动或 detach child 不得改写其本地
transform；detach 只移除关系拥有的 inherited context。若 facet context、parent-row
context 和 child-local filter 对同一字段给出不同值，返回显式 conflict，不能用后写值
覆盖，也不能静默渲染空图。

Nested 创建后同样对外表现为一个 Composite root；只有进入它以后，内部当前层的
Chart/Composite 才能成为新的组合目标。

## 4. Composite 层级与 Enter

除 Concat 的开放式空间容器行为外，完成 composition 后的内容在其父 scope 中是一个
整体。一个 closed Composite root 暴露以下命中区域：

```text
                         top: Concat / share X
                   +---------------------------+
                   |                           |
 left: Concat / Y  |       body: Layer         | right: Concat / Y
                   |       +-----------+       |
                   |       |   Enter   |       |
                   |       +-----------+       |
                   +---------------------------+
                        bottom: Concat / share X
```

- 四周只表示 `concat`，并由方向决定共享轴；
- 内部表示 `layer`；
- `concat` 必须完全位于外框之外，并与内部 `layer` 保留 10 个屏幕像素的中性空带；空带不提交任何操作；
- 拖拽期间的中央 `Enter` portal 是导航入口，不创建 composition；
- `Enter` 优先于内部 Layer zone；
- 父 scope 不得同时暴露 closed Composite 的 root 和内部成员作为竞争目标。

上述 `Enter` 只属于 composition drag overlay。普通 selection overlay 不为 Chart、Composite
或任何坐标系绘制 Enter 按钮。普通选中时，Config 与整体 composition Split 统一居中绘制在
所选单元外框正上方，并保持固定屏幕尺寸；Concat link 的边界 Split 仍归连接边界所有。

进入一个 Chart 或 Composite 后，命中计算切换到该对象的内部 scope。只有该 scope 的
直接顶层 Chart/Composite 才高亮合法 drop zone；孙级内容在继续 `Enter` 前不可命中。
退出后恢复父 scope，并重新把该 Composite 当作整体。

## 5. 拖放反馈

拖动 Chart 或 Composite 时，当前 scope 内所有结构合法的 drop zone 应直接可见，
并显示将创建的 composition type：

- `Layer · X`、`Layer · Y` 或 `Layer · X + Y`；
- `Concat · share X` 或 `Concat · share Y`；
- `Enter`。

不合法区域可以显示为 disabled 提示，但 drop 不得改变状态。若一个 Layer body 对应
多个合法共享集合，应在提交前呈现全部选择并等待用户确认。高亮仅反映结构合法性，
不能把 quantitative compatibility 描述成业务语义兼容。

## 6. 状态与原子性

每次组合操作必须作为一个 undoable transaction 写入：

- 新 Composite root 或 Concat link；
- 成员引用和外部 axis signatures；
- shared-axis binding；
- Facet cell context；
- Nested inherited context。

Undo 必须只撤销本次操作拥有的关系和上下文。任何递归组合都必须满足：

1. 父 composition 引用 child root，不引用其叶子成员；
2. 一个 child root 可以追溯到其直接 parent；
3. 不能形成 composition cycle；
4. 重新绑定字段、修改 filter/facet 或 parent row 后，外部轴签名和 inherited context
   必须在 mutation boundary 重新解析；
5. 轴不再兼容时返回 conflict/unresolvable，不静默拆分、替换字段或删除 transform。

## 7. 最小验收矩阵

实现至少覆盖以下情况：

| 场景 | 预期 |
| --- | --- |
| 不同 nominal columns，name list 相同 | 该轴可共享 |
| nominal/ordinal name list 缺项、增项或顺序不同 | 该轴不可共享 |
| 不同 quantitative columns | 作为候选保留，等待用户选择 |
| X/Y 都合法 | Layer 返回 `{X}`、`{Y}`、`{X,Y}` 三种选择 |
| 左右/上下 Concat | 分别只验证 Y/X |
| column Facet 再参与 Concat/Layer | X 使用 facet field；Y 继承 child Y |
| row Facet 再参与 Concat/Layer | Y 使用 facet field；X 继承 child X |
| Facet 再组合 | 保留 Facet root 和全部 cell context，不压平 |
| 在 Facet cell 放置 Nested child | relationship 含该 cell 的固定 filter context |
| Composite 未 Enter | 内部 member 不可命中 |
| Composite Enter 后 | 只显示内部直接顶层的合法 zone |
| Enter 与 Layer body 重叠 | Enter 优先且不产生 composition |
