# CV Author 交互调整需求记录

更新日期：2026-08-06  
状态：已实现首版，仍保留产品细节待讨论项  
现状参考：`docs/current-interaction.md`

## 1. 文档边界

本文记录后续目标交互。当前代码已实现本轮三项需求的首版；未明确的产品细节仍以本文“尚待确认的问题”为准。当前可观察到的完整交互继续以 `current-interaction.md` 为参考。

本轮确认三个调整方向：

1. 坐标轴绑定和 Chart Encoding 统一到一个 Card。
2. 支持从 Layer 中拖出 Chart，完成 Layer 合成的逆向拆分。
3. 扩展 Concat 投放区域，并根据投放边缘创建对应方向的共享轴拼接。

## R1. Axis Binding 与 Encoding 使用同一个 Card

### R1.1 目标

坐标轴绑定和 Encoding 绑定不再作为割裂的交互入口，而是在同一个配置 Card 中完成。

这个 Card 同时表达两类信息：

- Axis Binding：Chart 使用哪个坐标轴，以及 Chart 的通道如何连接到坐标轴。
- Chart Encoding：数据字段如何绑定到当前 Chart 的位置、大小、颜色、形状等视觉通道。

### R1.2 Chart 级 Encoding 所有权

每个 Chart 都必须拥有自己的 Encoding 配置。即使多个 Chart 共享同一个坐标轴，也不能把它们的全部 Encoding 合并成一份公共配置。

需要明确区分：

- 坐标轴可以被多个 Chart 共享。
- 每个 Chart 的 Encoding 仍然独立存在。
- Chart 绑定到共享轴，不等于 Chart 的全部 Encoding 与其他 Chart 同步。

例如，两个 Chart 可以共享 X Axis，但它们仍分别保存自己的：

- X 字段绑定。
- Y 字段绑定。
- Series。
- Color。
- Size。
- Shape。
- Pie/Polar 的 Angle、Radius 等图表专属 Encoding。

共享轴要求相关通道在语义和 scale 上兼容，但不改变 Encoding 的 Chart 级所有权。

### R1.3 每个 Chart 的默认值

每一种 Chart 模板都需要定义自己的默认 Encoding。创建 Chart 时，Card 中应立即显示该 Chart 的默认配置，而不是只显示空白项。

默认值至少需要按 Chart 类型写清楚以下内容：

- 支持哪些 Encoding 通道。
- 哪些通道必填。
- 每个通道的初始值或默认推断规则。
- 哪些默认值来自模板。
- 哪些默认值来自当前数据集的字段类型推断。
- 哪些 Encoding 可以为空。
- 哪些 Encoding 会参与共享坐标轴兼容性判断。

后续文档需要为每个已实现 Chart 单独列出默认值。目前至少应覆盖：

- Line chart。
- Scatterplot。
- Matrix / Heatmap。
- Pie。
- Donut。
- 其他已经出现在 Chart templates 中的模板。

在逐 Chart 默认值尚未确认前，不在本文中假设具体字段选择规则。

### R1.4 Card 的上下文

Card 应绑定到明确的目标 Chart。多选或共享坐标轴场景下，Card 仍需让用户知道当前正在编辑哪一个 Chart。

当一个 Axis 关联多个 Chart 时，Card 至少需要表达：

- 当前 Axis 的身份和通道。
- 该 Axis 当前关联的 Chart 列表。
- 当前正在编辑的 Chart。
- 当前 Chart 自己的 Encoding。
- 修改某项时，影响当前 Chart、共享 Axis，还是所有关联 Chart。

### R1.5 验收方向

- 用户从一个 Card 中完成 Axis Binding 和当前 Chart 的 Encoding 设置。
- 切换 Chart 后，Card 显示对应 Chart 自己的 Encoding 和默认值。
- 两个 Chart 共享 Axis 时，修改一个 Chart 的非共享 Encoding 不影响另一个 Chart。
- 共享通道发生不兼容时，界面必须阻止提交或明确提示后果。
- Card 中不存在无法判断作用对象的控件。

## R2. 从 Layer 中拖出 Chart，完成逆向拆分

### R2.1 目标

Layer 不只支持“拖入合成”，还必须支持“拖出拆分”。拖出是 Layer 合成的逆向操作。

### R2.2 基本场景

当同一个坐标空间或共享坐标轴中包含两个 Chart 时，用户拖动其中一个 Chart：

1. 拖动开始后，原 Layer 的有效区域仍然显示。
2. Chart 仍位于 Layer 有效区域内时，保持 Layer 关系和共享坐标轴关系。
3. Chart 离开 Layer 有效区域后，从该 Layer 中拆分。
4. 被拖出的 Chart 解除与原共享坐标轴的绑定。
5. 剩余 Chart 继续保留原坐标轴和自身配置。
6. 被拖出的 Chart 成为可独立编辑和移动的 Chart。

### R2.3 拆分后的关系

拆分必须修改语义关系，而不只是视觉上把 Chart 移远：

- 移除被拖出 Chart 的 Layer membership。
- 移除它与原共享 Axis 的 AxisBinding。
- 保留该 Chart 自己的 Encoding。
- 为被拖出 Chart 建立独立可用的坐标轴关系，或进入明确的未绑定状态。
- 更新原 Layer 的成员和共享关系。
- 如果 Layer 只剩一个 Chart，Layer 关系应自动结束。

“拆分后自动获得独立坐标轴”还是“先进入未绑定状态”，需要后续确认；不能由实现自行假定。

### R2.4 反馈与提交时机

- 拖动过程中持续显示 Layer 区域，用于说明“留在区域内即保持合成”。
- 离开区域时应有明确的拆分预览状态。
- 建议在拖动结束时提交拆分，避免仅仅经过边界就产生不可预期的关系修改。
- 整个拖出拆分应作为一个 Undo/Redo 操作。
- 如果用户把 Chart 拖回有效区域后再松手，应继续保持 Layer，不产生拆分。

### R2.5 验收方向

- Layer 内任一可独立拆分的 Chart 都能被拖出。
- 在 Layer 区域内移动不会误拆分。
- 离开区域并完成拖动后，Chart 不再受原共享轴修改影响。
- 原 Layer 和剩余 Chart 不出现空成员、失效 AxisBinding 或重复轴。
- Undo 后恢复原位置、Layer membership 和共享 AxisBinding。

## R3. Concat 的矩形边缘投放区域

### R3.1 目标

Concat 投放区域不应只落在坐标轴线本身，而应覆盖坐标系矩形绘图区的四条边缘，形成更容易命中的边缘带。

### R3.2 四边规则

以目标 Chart 的矩形坐标区域为基准：

| 投放区域 | 新 Chart 的位置 | 共享通道 |
| --- | --- | --- |
| 上边缘 | 拼接到目标 Chart 上方 | Shared X |
| 下边缘 | 拼接到目标 Chart 下方 | Shared X |
| 左边缘 | 拼接到目标 Chart 左侧 | Shared Y |
| 右边缘 | 拼接到目标 Chart 右侧 | Shared Y |

因此：

- 上、下边缘是共享 X 的 Concat 区域。
- 左、右边缘是共享 Y 的 Concat 区域。
- 区域应是有可见宽度的矩形边缘带，而不是要求用户精确命中轴线。

### R3.3 拖入后的行为

Chart 拖入有效边缘并放下后：

- 创建 Concat Composition。
- 根据命中的边缘确定新 Chart 位于上、下、左或右。
- 创建或复用对应的共享 Axis。
- 上下拼接只共享 X；左右拼接只共享 Y。
- 未共享的另一个通道继续使用各 Chart 自己的 Axis。
- 两个 Chart 保留各自的 Encoding 配置。

### R3.4 交互反馈

- 拖动进入边缘带时，高亮对应的完整边缘区域。
- 高亮应能区分 Shared X 和 Shared Y。
- 预览应表达最终拼接方向，而不只是显示“可以 Concat”。
- 不兼容时显示无效区域，并说明是字段、scale、坐标系还是通道不兼容。
- 当光标位于角落、同时接近两条边时，需要稳定地选择一个方向，避免高亮抖动。

### R3.5 验收方向

- 四条边都可以触发 Concat，不要求精确落在轴线上。
- 上下放置产生 Shared X，左右放置产生 Shared Y。
- 新 Chart 出现在命中边缘对应的方向。
- Concat 后共享轴只影响绑定到该轴的通道。
- 不共享的通道仍可在 R1 的 Card 中独立编辑。
- Undo 一次可以完整撤销新 Chart 的放置、Concat 和共享轴关系。

## 4. 三项需求之间的关系

三个需求共同依赖清晰的状态所有权：

```text
Chart
  owns -> Encodings + chart defaults
  binds -> Axis through AxisBinding

Layer
  groups -> Charts in one coordinate space
  shares -> compatible Axes
  inverse -> drag Chart out to detach

Concat
  arranges -> Charts by top / bottom / left / right
  shares X -> top / bottom
  shares Y -> left / right
```

R1 负责让用户看清并编辑 Chart 与 Axis 的配置；R2、R3 负责通过直接拖拽修改 Chart、AxisBinding 和 Composition 关系。三者必须使用同一套关系状态，不能只更新画面位置。

## 5. 尚待确认的问题

以下内容暂未被定义为最终规则：

1. R1 Card 是固定侧栏、浮动 Card，还是锚定到 Chart/Axis 的弹层。
2. 各 Chart 模板的具体默认 Encoding 和字段推断顺序。
3. 修改共享 Axis 的字段或 scale 时，关联 Chart 的 Encoding 如何同步或校验。
4. Layer 拆分后，被拖出 Chart 自动创建独立轴，还是暂时成为未绑定 Chart。
5. Layer 有三个及以上 Chart 时，拖出一个成员后的边界与剩余 Layer 布局。
6. Concat 边缘带的具体厚度，以及缩放状态下是否保持固定屏幕像素宽度。
7. Concat 角落区域如何决定上/下/左/右优先级。
8. 已经处于 Layer 或 Concat 中的 Chart，是否允许直接拖入另一个组合，以及冲突时的规则。

在上述问题确认前，本文不把任何一种候选方案标记为已确认行为。
