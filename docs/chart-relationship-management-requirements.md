# Chart 关联管理需求草案

更新日期：2026-08-05  
状态：统一状态管理底座已实现，产品规则继续讨论  
适用范围：Chart、Chart 内元素组、坐标轴、Layer、Concat、Facet、Nested 及其生命周期管理

## 1. 文档目的

建立一套完整、独立、可扩展的 Chart 关联管理机制。关联关系不能依赖 SVG DOM 层级、画布 Group、视觉位置或临时选择状态推断，而应作为一等数据被显式保存、查询和修改。

需求已进入实现阶段。当前先建立统一关系状态与兼容接入，未确认的产品行为仍继续在本文档中讨论。

## 2. 背景与需求变更

当前项目已经保存部分 `coordinateSystem`、`compositionSpec`、`markGroups` 和 `nestedSpec` 信息，但它们仍分散在 CanvasNode 上，坐标轴的显示和编辑也依赖 Chart 节点自身的 `coordinateGuide`。

此前 R2 将坐标轴定义为“依附于元素、不能作为独立画布元素编辑”。本需求对该定义作出变更：

- 坐标轴是独立组件，有自己的 ID、配置、选择状态和编辑入口。
- 创建 Chart 时，系统根据 Chart 的坐标系自动创建默认坐标轴，并自动建立关联。
- 坐标轴与 Chart 的生命周期有关联，但坐标轴不再只是 Chart 内部的一段渲染信息。
- 一个坐标轴可以关联一个或多个 Chart；共享关系需要精确到具体通道。

旧 R2 中与上述内容冲突的约束，应在本需求确认后由新模型替代。

## 3. 核心目标

1. 独立管理 Chart 以及 Chart 之间的组合关系。
2. 管理同一个 Chart 内部的元素组及其配置传播关系。
3. 将坐标轴建模为可独立选择和编辑的组件。
4. 支持一个轴关联多个 Chart，并精确描述共享的是哪个通道。
5. 管理 Layer、Concat、Facet、Nested 等不同语义的组合关系。
6. 保证创建、组合、拆分、复制、删除和撤销后，关系数据仍然完整且可追溯。
7. 让后续新增 Chart 类型、坐标系或组合类型可以复用同一套关系机制。

## 4. 术语与边界

| 概念 | 定义 | 是否独立编辑 |
| --- | --- | --- |
| Chart | 一次具体的图表实例，包含模板、数据绑定、编码、样式和自身变换 | 是 |
| Mark | Chart 内实际渲染的一个元素，例如一条 line、一个 point 或一个 arc | 视现有元素编辑能力而定 |
| Element Group / Mark Group | 同一个 Chart 内具有相同语义角色或共享配置的一组 Mark | 通过组级配置编辑 |
| Axis | 坐标轴组件，例如 Cartesian X/Y，或 Polar angle/radius 等通道组件 | 是 |
| Coordinate Space | 描述一组轴如何共同定义绘图空间；不等同于某个 Chart 的父节点 | 建议作为关系实体管理 |
| Composition | Chart 之间的语义关系，包括 Layer、Concat、Facet、Nested | 是关系，不等同于普通 Canvas Group |
| Canvas Group | 仅用于画布层级、整体变换和 Group/Ungroup 的结构 | 是，但不表达 Chart 语义关系 |

重要边界：

- Chart 内元素组不等于 Canvas Group。
- Composition 不等于 Canvas Group。视觉上可以同时存在 Group，但业务关系必须独立保存。
- Axis 不等于 Chart，也不应继续只作为 Chart 的 `coordinateGuide` 字段存在。
- “共享 X”表示多个 Chart 引用同一个 X Axis 实体，而不只是拥有数值相同的 X 配置。

## 5. 建议的统一关系模型

以下为需求层面的建议模型，用于明确关系语义；字段名和 TypeScript 类型可在开发前再确认。

```text
Chart
  id
  template / chartType
  dataBinding
  encodings
  markGroupIds[]
  axisBindings[]
  compositionIds[]

MarkGroup
  id
  chartId
  role
  memberKeys[]
  sharedConfig
  overridePolicy

Axis
  id
  coordinateType
  channel
  config
  transform / layout
  bindings[]

AxisBinding
  axisId
  chartId
  channel
  role
  scalePolicy

Composition
  id
  type: layer | concat | facet | nested
  members[]
  typeSpecificConfig

NestedRelation
  id
  parentChartId
  parentElementId
  childChartId
  relationType
  parameters
  resolverVersion
```

`NestedRelation` 保存的是关系定义，不是解析后的绝对坐标。首个 `relationType` 是相对位置关系，其参数包含父/子锚点、偏移、尺寸/缩放和旋转；未来可以增加其他关系类型和参数结构。

关系示意：

```text
Chart A ----x----> Axis X1 <----x---- Chart B
Chart A ----y----> Axis Y1
Chart B ----y----> Axis Y2

Composition C1 (concat)
  members: [Chart A, Chart B]
  shared axes: [Axis X1]
```

这里的 `role` 用于区分主轴、次轴或未来的其他用途；`scalePolicy` 用于表达共享 domain、range、方向和显示策略是否完全一致。是否首期实现这些扩展字段，需要讨论后确定。

## 6. Chart 与内部元素组

### 6.1 已确认需求

1. 每个 Chart 必须具有稳定且唯一的 Chart ID。
2. Chart 内部的 Mark 必须能够追溯到所属 Chart。
3. 同一个 Chart 内具有相同语义或相同生成规则的 Mark，应归入稳定的 Mark Group。
4. Mark Group 至少保存所属 Chart、语义角色、成员身份和共享配置。
5. 编辑组内一个成员所代表的组级配置时，同组成员同步更新。
6. 数据更新导致 Mark 增减时，新 Mark 应自动进入正确的 Mark Group。
7. Chart 的复制、Facet 派生和 Nested 实例化不能造成 Mark Group ID 冲突。

### 6.2 建议规则

- Mark 使用稳定的数据键或语义键作为成员身份，避免依赖 SVG 元素顺序。
- 组级共享配置与单个 Mark override 分开保存。
- Composition 只关联 Chart 或明确的 Mark Group，不直接依赖临时生成的 SVG 节点。

### 6.3 待确认

- 哪些属性属于组级同步范围：样式、encoding、数据过滤、交互，还是全部可配置项。
- 是否允许单个 Mark 脱离同步并保留 override。
- 用户能否手动新建、合并、拆分 Mark Group。

## 7. Axis 独立组件

### 7.1 创建与默认关联

1. 创建 Cartesian Chart 时，默认同时创建 X Axis 和 Y Axis，并分别绑定到该 Chart 的 `x`、`y` 通道。
2. 创建 Polar Chart 时，根据最终通道定义自动创建对应 Axis；具体是 `angle + radius` 还是包含 `ring`，需要确认。
3. 不使用坐标轴的 Chart 不创建 Axis。
4. 自动创建只是一种默认行为；创建后 Axis 作为独立实体保存和编辑。
5. Chart 与 Axis 通过显式 `AxisBinding` 关联，不能通过位置或父子层级推断。

### 7.2 独立编辑

Axis 至少应支持独立选择并编辑以下配置：

- 数据字段或通道绑定。
- scale 类型、domain、range、方向和 reverse。
- 轴的位置、长度、原点或布局参数。
- tick、label、title、网格线和可见性等视觉配置。
- 与哪些 Chart 关联，以及在每个 Chart 中承担哪个通道。

其中当前尚未存在的编辑项可以分阶段实现，但关系模型不能阻止后续扩展。

### 7.3 一个 Axis 对应多个 Chart

1. 一个 X Axis 可以同时绑定多个 Chart 的 `x` 通道。
2. 一个 Y Axis 可以同时绑定多个 Chart 的 `y` 通道。
3. Axis 的编辑传播范围由 AxisBinding 决定，不由当前选中的 Chart 决定。
4. 未绑定到该 Axis 的通道不受编辑影响。
5. 多 Chart 共享同一 Axis 时，画布上只保留一个 Axis 组件实例，不重复绘制等价轴。

### 7.4 Axis 生命周期

已确认采用可独立存在的引用关系管理：

- 删除 Chart 时，先移除该 Chart 的 AxisBinding。
- Axis 仍被其他 Chart 使用时，不删除 Axis。
- Axis 不再被任何 Chart 使用时，保留为未绑定的独立组件，不自动删除。
- 未绑定 Axis 仍可被选择、编辑，并可在之后重新关联到 Chart。
- Axis 只有在用户明确删除 Axis 本身时才被删除。
- 删除一个被多个 Chart 使用的 Axis 时，必须明确处理所有受影响的 Chart，不能留下失效引用。
- 复制单个 Chart 时，默认复制其独占 Axis；对于共享 Axis，是继续引用原 Axis 还是复制一套 Axis，需要确认。

## 8. Composition 关系管理

所有 Composition 均应具有独立 ID、类型、成员顺序和类型专属配置。一个 Chart 可以参加多个 Composition，但需要定义是否允许同类关系嵌套或交叉。

### 8.1 Layer

语义：多个 Chart 在同一绘图空间中叠加。

已确认规则：

- Layer 中多个 Chart 的 X 分别关联同一个 X Axis。
- Layer 中多个 Chart 的 Y 分别关联同一个 Y Axis。
- Layer 必须同时共享 X 和 Y，不支持只共享单一通道的 Layer。
- 创建 Layer 前必须确认所有成员均能同时共享 X、Y；任一通道不兼容时不能创建 Layer。
- 编辑共享 X Axis 时，传播到所有绑定该 X Axis 的 Layer 成员。
- 编辑共享 Y Axis 时，传播到所有绑定该 Y Axis 的 Layer 成员。
- Layer 成员的绘图区域、原点和空间变换需要保持一致。

建议不要只保存 `sharedChannels: [x, y]`，而应保存实际的共享 Axis ID，确保共享关系可查询、可替换、可解除。

### 8.2 Concat

语义：多个 Chart 按行、列或其他布局并列，允许按通道共享 Axis。

已确认规则：

- 一个 X Axis 可以对应多个 Concat 成员 Chart。
- Concat 可以只共享 X，此时各 Chart 的 Y Axis 独立。
- Concat 也应支持只共享 Y，此时各 Chart 的 X Axis 独立。
- 是否允许同时共享 X 和 Y，应由布局和用户配置决定，不能写死为单通道。
- 编辑共享轴只影响绑定到该 Axis 的 Chart。

示例：

```text
纵向 Concat，Chart A + Chart B
  Axis X1 -> Chart A.x, Chart B.x
  Axis Y1 -> Chart A.y
  Axis Y2 -> Chart B.y
```

### 8.3 Facet

语义：一个源 Chart 规范按字段拆分为多个同构视图实例。

已确认规则：

- 每个 Facet 单元格都创建一个完整的 Chart 实例，而不是只读或不可独立编辑的轻量派生。
- 每个单元格 Chart 拥有唯一 Chart ID、自己的配置、数据过滤条件、Mark Group 和 AxisBinding。
- 用户可以单独选择并编辑任意单元格 Chart，修改一个单元格不会强制修改其他单元格。
- Facet 关系仍需保存来源 Chart、facet key 和所有单元格 Chart ID，用于追溯其生成关系和管理整体布局。
- Facet 的批量统一编辑应是显式操作，不能因为单元格来自同一 Facet 就默认覆盖独立编辑结果。

Facet 关系至少需要保存：

- 源 Chart 或模板 Chart。
- facet field；二维 Facet 还包括 row field、column field。
- facet values 与单元格身份。
- 每个单元格对应的完整 Chart 实例身份。
- 行列布局、排序和空单元格策略。
- Axis/scale resolve 策略：shared、independent，以及共享到行、列还是整个 Facet。
- 源 Chart 配置变化是否向现有单元格传播，以及如何保护单元格的独立编辑结果。
- 整体批量编辑与单元格独立编辑的优先级。

Facet 不能只保存复制后的 Chart 列表，否则会丢失“这些 Chart 由同一规则派生”的关系。

### 8.4 Nested

语义：Nested 起源于父 Chart 中一个具体元素。用户将一个 Chart Card 拖到该元素上，创建一个新 Chart，并建立以父元素为关系源、新 Chart 为关系目标的结构性关系；它不是 Layer，也不应默认扩散到整个 Mark Group。

相对位置是当前首个需要实现的 Nested 关系类型，不是 Nested 能力的最终边界。关系的记录格式与解析机制必须允许后续增加更复杂的变化逻辑。

#### 8.4.1 创建流程

1. 用户从 Chart Card 列表拖动一个 Chart Card。
2. 系统命中父 Chart 内的一个具体元素，取得稳定的 `parentElementId`，同时保留其 `parentChartId`。
3. 系统创建待确认的子 Chart，并建立临时 Nested 关系。
4. 系统立即弹出 Nested 专用关系编辑面板。
5. 用户在面板中编辑新 Chart 与父元素之间的相对位置规则，并在画布中实时预览解析结果。
6. 用户确认后，保存子 Chart、Nested 关系类型、关系参数和解析版本；用户取消时，撤销本次临时创建，不留下子 Chart 或关系。

#### 8.4.2 专用关系编辑面板

该面板只服务于当前 Nested 关系。首期以相对位置为编辑内容，至少需要能够识别和编辑：

- 当前父元素与新 Chart。
- 父元素上的挂载点，以及新 Chart 自身用于对齐的锚点。
- 新 Chart 相对父元素的 X/Y 偏移。
- 新 Chart 相对父元素的尺寸或缩放。
- 新 Chart 相对父元素的旋转。
- 实时预览、确认和取消。

面板结构需要能够根据 `relationType` 展示不同的关系参数编辑器。是否还需要内嵌、覆盖、外置等位置模式，以及边界约束、自动避让等能力，继续讨论后确定。

#### 8.4.3 关系数据

Nested 关系至少需要保存：

- 父 Chart ID。
- 具体父元素的稳定 ID；必要时同时保存 data key / row key，保证重新渲染后仍能定位同一语义元素。
- 父元素所属 Mark Group ID，作为辅助语义信息，但不能替代具体元素 ID。
- 新建子 Chart 的 Chart ID 和来源 Chart Card/template ID。
- 父数据到子 Chart 数据的绑定或过滤规则。
- 关系类型 `relationType`。
- 与关系类型对应的可扩展参数 `parameters`；相对位置类型首期保存父元素锚点、子 Chart 锚点、偏移、尺寸/缩放和旋转。
- 关系解析器版本，用于后续规则升级和旧数据兼容。
- 子 Chart 自身 Axis 的创建、显示、共享和隐藏策略。
- 父元素或子 Chart 被删除时的关系清理规则。

当前已确认的基本单位是一个具体父元素和一个新建子 Chart 的关系。未来若增加“将同一种 Nested Chart 批量应用到整个 Mark Group”，应作为显式的批量功能另行定义，不能改变单元素拖放的语义。

#### 8.4.4 关系解析与跟随

1. 父元素是关系计算的源，新 Chart 是解析结果作用的目标。
2. 父元素移动、缩放或旋转时，系统必须重新解析 Nested 关系，使子 Chart 按已保存的规则持续跟随。
3. 父 Chart 或上层 Canvas Group 的变换最终影响父元素时，也必须触发同一套关系解析，不能依靠临时复制位置值实现。
4. 父元素重新渲染后，只要稳定元素身份仍存在，Nested 关系必须继续生效。
5. 持久化的事实来源是 `relationType + parameters + resolverVersion`；解析得到的绝对位置、尺寸和旋转可以缓存，但不能替代关系定义。
6. 用户在关系面板或画布上调整子 Chart 时，应更新关系参数，再由解析器产生结果，避免绝对变换与关系参数互相冲突。
7. 后续新增关系类型时，应通过新增解析规则扩展，不能要求迁移或重写所有现有 Nested 关系。

未来可能扩展的关系包括但不限于边缘吸附、内部布局、沿路径定位、边界约束和数据驱动变化；具体类型不在当前阶段提前固定。

## 9. 组合创建、解除与转换

### 9.1 创建组合

建议统一经过一个关系命令完成：

1. 校验所选 Chart 是否兼容目标 Composition。
2. 创建 Composition 实体。
3. 写入成员、顺序和类型专属配置。
4. 根据组合类型合并、保留或新建 Axis。
5. 更新 Chart 的 AxisBinding。
6. 更新布局但不把 Composition 降级成普通 Canvas Group。

### 9.2 解除组合

解除组合不等同于 Ungroup。解除时需要：

- 删除 Composition 关系。
- 保留原 Chart 实例。
- 将共享 Axis 拆分为各 Chart 独立 Axis，或按用户选择继续共享。
- 保留各 Chart 当前视觉结果和数据绑定。
- Facet 单元格 Chart 与 Nested 子 Chart 需要明确是保留为普通 Chart，还是随关系解除而删除。

### 9.3 组合转换

Layer 转 Concat、Concat 转 Layer 等操作会改变 Axis 共享和布局语义。首期是否支持直接转换待确认；如果支持，必须通过关系迁移完成，不能只改变 `type` 字段。

## 10. Canvas Group 与关系管理的协作

1. Group/Ungroup 只改变画布结构，不创建或删除 Chart、Axis、Mark Group、Composition 关系。
2. Chart 或 Axis 即使被放入不同 Canvas Group，其业务关联仍然有效。
3. Group 的移动、缩放、旋转如何影响关联 Axis，需要由坐标空间和变换规则决定，不能靠复制坐标值临时同步。
4. 选择 Composition 成员、共享 Axis 或 Canvas Group 时，应能明确区分当前编辑对象。
5. bbox、对齐、层级顺序是否包含 Axis，需要作为独立交互规则确认。

## 11. 一致性与不变量

关系管理至少保证以下不变量：

1. 每个实体 ID 全局唯一。
2. 每个 Mark Group 必须指向一个存在的 Chart。
3. 每个 AxisBinding 两端的 Axis 和 Chart 必须存在。
4. 同一 Chart 的同一通道默认只绑定一个生效 Axis；如需双轴或多轴，应显式扩展角色模型。
5. Axis 的 coordinate type 与 Chart 的坐标系兼容。
6. Layer 声明共享 X/Y 时，其成员必须实际引用对应的同一 Axis ID。
7. Concat 声明共享某通道时，成员的该通道必须实际引用同一 Axis ID。
8. Facet 的每个单元格 Chart 必须能追溯到 Facet、源 Chart 和 facet key。
9. Nested 子 Chart 必须能追溯到 Nested、父 Chart 和具体 parent element ID。
10. 删除、复制、粘贴、撤销、重做、导入和导出后不得出现悬空引用或重复 ID。

## 12. 查询与编辑能力

统一关系层至少应支持以下查询：

- 给定 Chart，查找它的 Mark Group、Axis 和所有 Composition。
- 给定 Axis，查找所有绑定 Chart 及对应通道。
- 给定 Mark，查找所属 Chart 和 Mark Group。
- 给定 Composition，查找有序成员及其共享 Axis。
- 给定 Facet 单元格，查找源 Chart 和 facet key。
- 给定 Nested 子 Chart，查找父 Chart、具体父元素、关系类型、关系参数和解析版本。

统一编辑命令至少覆盖：

- 创建、更新和删除 AxisBinding。
- 共享 Axis、解除共享和替换 Axis。
- 创建和解除 Composition。
- 调整 Composition 成员顺序。
- 更新 Mark Group 共享配置。
- 完整参与 undo/redo 和持久化。

## 13. 交互需求草案

- 点击 Chart：选中 Chart，不隐式把共享 Axis 当作同一选择对象。
- 点击 Axis：选中 Axis，打开 Axis 独立编辑入口，并可查看它关联的 Chart。
- 点击 Composition：可查看类型、成员顺序、共享轴和类型专属配置。
- 编辑共享 Axis：界面应提示影响的 Chart 范围。
- 解除共享、删除共享 Axis、解除 Facet/Nested 等高影响操作：应明确展示后果。
- 画布上共享 Axis 只渲染一次，但选择任一关联 Chart 时应能定位到该 Axis。
- 将 Chart Card 拖到具体元素上：打开 Nested 专用关系编辑面板，并在确认前实时预览新 Chart 与元素关系的解析结果。

这些交互是建议基线，具体使用右侧属性面板、浮层还是关系面板，待 UI 方案确认。

## 14. 持久化与兼容性

1. Chart、Axis、Mark Group、Composition 和 Binding 均需进入统一序列化数据。
2. 导入时应进行关系完整性校验，并对旧数据执行迁移。
3. 当前保存在 CanvasNode 上的 `coordinateGuide`、`coordinateSystem`、`compositionSpec`、`markGroups` 和 `nestedSpec` 需要迁移到新关系模型或建立明确的兼容层。
4. 渲染器应读取关系模型得到 Axis 和组合语义，不应反向解析 SVG 得出关系。
5. 历史记录应以一次完整关系命令为原子单位，避免撤销后只恢复视觉节点而未恢复关系。

## 15. 首期建议范围

建议首期先建立完整关系底座，并打通现有 Cartesian Chart：

1. 独立 Chart、Mark Group、Axis、AxisBinding、Composition 数据模型。
2. 创建 Chart 时自动创建 X/Y Axis。
3. Axis 独立选择和现有字段、方向、scale 编辑能力迁移。
4. Layer 的 X/Y 共享。
5. Concat 的单通道或双通道共享。
6. Facet 的源 Chart、派生单元格和 scale resolve 关系。
7. Nested 的父 Chart、具体父元素、子 Chart 与位置配置关系。
8. 创建、解除、删除、复制、撤销和持久化的一致性处理。

Polar Axis、双 Y 轴、跨 Composition 复用 Axis、手工创建无绑定 Axis 等能力，可以在模型兼容的前提下另行排期。

## 16. 待讨论问题

以下问题会实质影响数据模型或交互，需要在开发前确认：

1. 复制一个参与共享 Axis 的 Chart 时，新 Chart 默认继续共享原 Axis，还是获得 Axis 副本？
2. 删除共享 Axis 时，是阻止删除、同时解绑所有 Chart，还是为各 Chart 自动创建替代 Axis？
3. Concat 的共享 Axis 是系统根据排列方向自动决定，还是创建组合时由用户选择？
4. Facet 的 Axis 默认是全局共享、按行/列共享，还是每个单元格独立？
5. Facet 源 Chart 后续变化是否传播到已经独立编辑过的单元格；如果传播，冲突如何处理？
6. Nested 子 Chart 默认显示自己的 Axis、继承父空间，还是默认隐藏 Axis？
7. Nested 关系面板首期除锚点、偏移、尺寸和旋转外，是否需要“内嵌 / 覆盖 / 外置”等位置模式？
8. 父元素被数据更新移除时，其 Nested 子 Chart 是一并删除、转为普通 Chart，还是保留为失联状态？
9. 一个父元素是否允许关联多个 Nested 子 Chart？
10. 一个 Chart 是否需要支持主/次 X、主/次 Y 等多 Axis？首期是否考虑双 Y 轴？
11. Axis 的可编辑范围首期包含哪些：数据绑定、scale、方向、位置、tick/label/title、样式、网格线？
12. Axis 能否被自由移动到与关联 Chart 不重合的位置；若能，Chart 移动时 Axis 是否跟随？
13. Canvas Group 整体变换时，位于 Group 外但关联其 Chart 的 Axis 如何跟随？
14. Composition 是否允许嵌套，例如 Facet 的单元格内部是 Layer，或 Concat 成员本身是 Nested？
15. 解除 Facet/Nested 后，完整 Chart 实例应保留为普通 Chart，还是随关系一并删除？

## 17. 初步验收标准

1. 新建 Cartesian Chart 后，可以看到并分别选中 X Axis、Y Axis；两者有独立 ID 和配置。
2. 单独编辑 Axis 时，关联 Chart 根据绑定关系更新。
3. Axis 解除所有 Chart 绑定后仍保留在画布中，并可独立编辑或重新绑定。
4. 两个 Chart 创建 Layer 后，其 X 指向同一个 X Axis，Y 指向同一个 Y Axis，且各共享 Axis 只显示一次。
5. 不能创建只共享 X 或只共享 Y 的 Layer。
6. 两个 Chart 创建只共享 X 的 Concat 后，X Axis 为同一实体，Y Axis 保持两个独立实体。
7. 编辑 Concat 的共享 X Axis 只影响绑定该轴的 Chart，不改变各自 Y Axis。
8. Facet 每个单元格都是可单独选择、配置和绑定 Axis 的完整 Chart，并可追溯到 Facet ID、来源 Chart 和 facet key。
9. 将 Chart Card 拖到具体元素后会打开 Nested 关系编辑面板；确认后，新 Chart 可追溯到父 Chart 和具体父元素，并按保存的关系规则渲染。
10. 取消 Nested 位置编辑时，不留下临时子 Chart 或 Nested 关系。
11. 父元素移动、缩放、旋转或因上层变换而变化时，子 Chart 根据关系解析结果持续跟随。
12. 保存和重新加载后，Nested 仍由关系类型、参数和解析版本恢复，而不是只恢复一次性的绝对位置。
13. Group/Ungroup 不破坏任何 Chart、Axis 或 Composition 关系。
14. 删除任一 Composition 成员后，其余成员和 AxisBinding 不出现悬空引用。
15. 复制、粘贴、撤销、重做、保存和加载后，实体身份与关系保持一致。

## 18. 开发与验证约束

- 用户已明确要求开始统一状态管理实现。
- 尚未确认的产品语义继续只更新本文档，不在实现中自行确定高影响行为。
- 开发过程中不由助手自行运行测试、构建或其他验证命令；仅在用户明确要求时执行。
- 实施过程中的未确认产品行为应先回到本文档讨论，不自行决定高影响语义。

## 19. 统一状态管理实现

### 19.1 唯一关系入口

统一关系状态由 `cv-author-app/src/useChartRelationshipStore.ts` 管理。后续 Chart、Mark Group、Axis、AxisBinding、Composition 和 Nested 的创建、修改、解除、删除和选择必须通过该 store 的 `dispatch(command)` 执行，不能再直接新增另一套散落在组件中的关系状态。

```text
UI / Canvas command
  -> useChartRelationshipStore.dispatch(command)
  -> normalized relationship state
  -> query / resolver
  -> CanvasNode compatibility projection
  -> current renderer
```

### 19.2 当前统一状态

- `charts`：Chart 实例及来源、实例类型和反向关系 ID。
- `markGroups`：Chart 内元素组与共享配置。
- `axes`：可脱离 Chart 独立存在的 Axis 组件。
- `axisBindings`：Axis 与 Chart 通道的显式关联。
- `compositions`：Layer、Concat、Facet、Nested 的成员、顺序和共享轴。
- `nestedRelationships`：父元素、子 Chart、关系类型、参数、解析版本和草稿状态。

### 19.3 当前统一命令

- Chart 注册、注销。
- Mark Group 同步和组配置更新。
- Axis 创建、更新、删除、绑定、解绑和多 Chart 共享。
- Composition 创建、更新、解除和成员顺序更新。
- Nested 草稿创建、参数更新、确认和取消。
- 统一关系实体选择。
- 完整状态替换、清空、快照和恢复。

### 19.4 已接入 Canvas 的行为

- 创建 Chart 时自动注册 Chart，并根据模板契约创建默认 Axis 和 AxisBinding。
- Layer 统一强制共享 X/Y Axis。
- Concat 根据指定通道共享 Axis。
- Facet 单元格注册为完整 Chart，并保存来源 Chart 与 facet key/row/column。
- Nested 拖放先建立 draft；确认时创建 Nested Composition，取消时恢复草稿前状态。
- Axis origin、scale、reverse 的编辑通过 AxisBinding 查找传播范围。
- Mark Group 配置更新通过统一命令同步。
- 删除 Chart 时解除 Binding，但无引用 Axis 继续独立保留。
- 统一关系状态进入 undo/redo 和本地持久化；Nested draft 不进入持久化结果。
- 旧项目缺少统一关系状态时，可从现有 CanvasNode 关系字段迁移。

### 19.5 兼容边界

当前渲染器仍读取 CanvasNode 上的 `coordinateGuide`、`coordinateSystem`、`compositionSpec`、`markGroups` 和 `nestedSpec`。这些字段现在作为统一 store 的兼容投影保留，不再被视为新的关系事实来源。后续渲染器迁移完成后，可以逐步移除该兼容层。

Nested 关系解析器已经支持按 `relationType + resolverVersion` 注册。首个 `relative-position@1` 会根据父元素的位置、缩放和旋转解析子 Chart 变换；更复杂的关系类型继续通过同一解析器注册机制扩展。
