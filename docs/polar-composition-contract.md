# Polar Composition Contract

本文档把直角坐标系的 composition 规则规范化到极坐标系，并定义坐标型 Tree 的特殊叶轴。
Composite 层级、Enter、原子性和 Nested 规则继续遵循
[`cartesian-composition-contract.md`](./cartesian-composition-contract.md)；本文只定义极坐标映射和 Tree 例外。

## 1. 极坐标外部接口

普通 Polar Chart 和完成的 Polar Composite 都以完整单元参与组合，并暴露两个可能共享的轴：

```ts
type PolarCompositionUnit = {
  unitId: string
  bounds: PolarOccupiedGeometry
  angle?: PolarAxisSignature
  radius?: PolarAxisSignature
}
```

`angle` 与直角坐标的 categorical X/Y 使用相同的 domain 兼容规则；`radius` 与直角坐标的
quantitative X/Y 使用相同的结构兼容规则。兼容性比较解析后的轴签名，不比较 dataset ID、
column 名称或 Chart 名称。

- nominal/ordinal：有序可见 name list 必须相同；不能取并集补齐。
- quantitative：两侧都是 quantitative 即具有结构拼合资格，但不代表单位或业务语义相同。
- temporal：沿用现有 temporal policy，直到有独立契约。
- 每个轴独立验证；保留所有合法的非空共享集合，不评分、不截断。

## 2. Polar 运算映射

| 空间操作 | 共享轴 | Drop zone |
| --- | --- | --- |
| Layer | 用户确认的 `angle`、`radius` 或两者 | 已占用扇区内部 |
| Radial Concat | `angle` | 与图形留空带后的外环；Donut 也可使用留空带后的内环 |
| Angular Concat | `radius` | 外圆之外、沿已占用角范围起止射线的独立扇形提示带 |

同一个命中点只能解析为一种操作。Layer body、内外环形 Concat zone、起止角 Concat zone
互斥，不能依赖分支顺序决定结果。Layer 与任意 Concat zone 之间保持 10 个屏幕像素的
中性空带，空带不提交操作；Angular Concat 位于 Radial Concat 外侧的独立半径带，避免两种
Concat 视觉相叠。拖动开始及每次 Enter 后，应枚举并画出当前 scope 中全部合法的非 Nested
Polar zones；Nested 仍只画当前命中的一个。

普通 selection overlay 不在 Polar Chart 或 Polar Composite 内部绘制 Enter。Enter 仅在
composition 拖拽时作为 scope navigation portal 出现。Config 与整体 composition Split
统一居中放在 Polar 单元外框正上方，不能占用扇区、极轴或半径控制区域。

Angular Concat 的成员共享 origin 和 radial frame，并占据互不重叠的角区间。Radial Concat
的成员共享 origin 和 angular frame，并占据互不重叠的半径区间。三个及以上成员必须按
link 关系得到唯一 slot，不能因多个 source 指向同一 target 而重叠。

## 3. 坐标型 Tree

`Dendrogram` 是 Cartesian Tree；`RadialDendrogram` 是 Polar Tree。它们不是
CoordinateFree hierarchy。Tree 的两个几何方向有特殊含义：一个是终端叶节点的排列轴，
另一个是层级深度轴。只有叶轴可作为外部 composition channel，深度轴属于 Tree 的内部结构。

| Tree | 布局方向 | 外部叶轴 | 内部深度轴 |
| --- | --- | --- | --- |
| Dendrogram | `left` / `right` | Y | X |
| Dendrogram | `up` / `down` | X | Y |
| RadialDendrogram | radial | Angle | Radius |

叶值由 `key`/`parent` 层级中的终端节点确定：没有成为任何节点 parent 的 key 是 leaf。
Cartesian Tree 使用 `category`（缺失时使用 `key`）决定叶序；Polar Tree 使用 `theta` 或
`angle`（缺失时使用 `key`）决定叶序。即使 key 是数字，叶轴仍是 categorical structural
axis，不应变成连续数值轴。

## 4. Tree Concat 的叶值过滤

Tree 与普通 Chart 沿叶轴 Concat 时，Tree 的有序 leaf list 是共享轴 domain。普通 Chart
可以在本地数据视图中还包含 branch/root 值，只要它完整包含相同且同序的 leaf list；建立
Concat 后，渲染时自动把该普通 Chart 的视图限制到 leaf list。

```text
Tree leaves       = [Leaf A, Leaf B, Leaf C]
Companion values  = [Root, Branch, Leaf A, Leaf B, Leaf C]
Rendered companion= [Leaf A, Leaf B, Leaf C]
```

该限制属于 Concat relationship 的结构上下文，不写入或覆盖 companion 的用户本地 filter、
aggregate/bin transform 或 encoding。解除 Concat 后自动消失。若 companion 缺少任何 leaf、
叶序冲突，或字段无法通过 lineage 解析，则组合为 incompatible/`UNRESOLVABLE`，不能扫描其他
column、补值或静默换字段。

Tree 的深度轴不能用于 Layer 或 Concat。Tree template 本身仍遵循其 declarative contract；
当前 Dendrogram 与 RadialDendrogram 不开放 Layer composition。

## 5. 最小验收矩阵

| 场景 | 预期 |
| --- | --- |
| Pie/Donut 的 angle name list 相同 | 可 Radial Concat，共享 Angle |
| 两个 Polar radius 都为 quantitative | 可作为 Angular Concat 候选 |
| Donut 内/外侧和起/止角都合法 | 同时画出四个 Concat zone，并与 Layer body 互斥 |
| RadialDendrogram + companion，叶值完整 | 只允许共享 Angle，并过滤 companion 到 leaves |
| RadialDendrogram 尝试共享 Radius | 拒绝；Radius 是深度轴 |
| 横向 Dendrogram + companion | 只允许共享 Y |
| 纵向 Dendrogram + companion | 只允许共享 X |
| companion 缺 leaf 或叶序不同 | 拒绝组合，不取并集 |
| closed Polar Composite 再组合 | 作为整体引用；未 Enter 不暴露内部成员 |
