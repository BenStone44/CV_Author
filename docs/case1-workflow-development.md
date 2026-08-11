# Case 1 数据驱动组合图开发文档

更新日期：2026-08-03

实现状态（2026-08-11）：Case 1 的 Phase 5-8 主流程已完成。当前应用支持基于通用 owner/member 协议的共享比例尺 Layer、point/row 标记选择、全数据集 Nested Pie 实例化，以及 Dataset 与画布语义状态的 localStorage 持久化和 Undo/Redo 恢复。ChartSpec、CompositionSpec、NestedSpec 是权威状态，SVG 仅作为可重建缓存。

## 1. 目标

使用 `case1.csv` 完成下面的数据驱动创作流程：

1. 拖入一个 Line Chart。
2. 点击 X 轴并绑定 `time`，点击 Y 轴并绑定 `weight_kg`。
3. 系统识别 `person` 是序列分组字段，为每个人生成一条折线。
4. LLM 根据图表模板和绑定结果生成 SVG `<g>` 的创建程序，生成结果替换原始静态 Line Chart。
5. 拖入一个 Scatterplot，将它与 Line Chart 进行 Layer 组合。
6. Layer 中两个图层共享 X/Y 比例尺，散点自动移动到对应的 `(time, weight_kg)` 位置。
7. 选择散点 mark，执行 Nested，打开嵌套图表编辑画布。
8. 在嵌套画布中拖入 Pie Chart，使 Pie Chart 中心与原散点中心重合。
9. 每个散点对应一个人和一个时间点；Pie Chart 的四个扇区分别绑定该记录的水、脂肪、肌肉和无机盐重量。

## 2. Case 1 数据语义

数据主键应为：

```text
(person, time)
```

字段角色：

| 字段 | 类型 | Case 1 中的角色 |
| --- | --- | --- |
| `person` | nominal | 折线 series、数据分组键 |
| `time` | temporal | 共享 X 轴 |
| `weight_kg` | quantitative | 共享 Y 轴 |
| `water_kg` | quantitative | Pie Chart 扇区值 |
| `fat_kg` | quantitative | Pie Chart 扇区值 |
| `muscle_kg` | quantitative | Pie Chart 扇区值 |
| `minerals_kg` | quantitative | Pie Chart 扇区值 |

当前数据满足：

```text
weight_kg = water_kg + fat_kg + muscle_kg + minerals_kg
```

嵌套 Pie Chart 需要把宽表中的四个组成字段转换成长表：

```text
(person, time, component, value)
```

其中 `component` 为 `water | fat | muscle | minerals`。

## 3. 当前实现能否支持

结论：Phase 1-3 已经可以完成单个 LineGraph 的 Dataset 绑定、series 确认和确定性重绘；Layer、Nested 和 LLM 仍未接入。

| 流程 | 当前状态 | 说明 |
| --- | --- | --- |
| 默认导入 `case1.csv` | 支持 | Dataset Store 保存数据、schema、主键和字段类型 |
| 拖入 Line Chart / Scatterplot / Pie Chart | 支持 | 未确认前保留静态 SVG 模板，LineGraph 确认后可确定性重绘 |
| 点击 X/Y 轴 | 支持 | Cartesian 图表具有独立 axis hit target 和 Encoding Inspector |
| 将数据列绑定到视觉通道 | 部分支持 | X/Y binding 保存到 ChartSpec，LineGraph 会根据完整 binding 重绘 |
| 自动推断 `person` series | 支持 | nominal 候选按组数、X 覆盖率和唯一性确定性评分 |
| LLM 生成并替换图表 | 不支持 | 没有 LLM 服务、生成协议或渲染器替换机制 |
| 选择 Line Chart 和 Scatterplot | 支持 | 仍只支持顶层 CanvasNode 多选 |
| Layer 后共享比例尺 | 不支持 | 当前 Layer 只是把所选 SVG 序列化为一个静态预览 |
| 选择单个点或 point mark | 不支持 | Group 的子节点不可交互，选择被限制为顶层节点 |
| Nested 打开子画布 | 不支持 | 当前 Nested 也是静态 SVG 合并，不存在编辑上下文 |
| Pie 中心锚定到散点 | 不支持 | 当前没有 parent anchor / child anchor 模型 |
| 每个点使用自己的四项组成数据 | 不支持 | 当前没有 mark 到数据行的稳定映射 |

### 当前 Layer/Nested 的实际行为

`useCanvasStore.ts` 中的 `createCompositionCandidate` 会：

1. 读取所选 CanvasNode。
2. 把它们按当前位置序列化成一个 SVG。
3. 创建一个 composition preview。
4. 用户选择 preview 后，再把静态 SVG 插入画布中心。

该过程不会共享 scale，不会重新计算 mark 位置，也不会保留父子数据关系。它适合视觉草图，不适合作为最终的语义组合引擎。

## 4. 必须先建立的核心模型

### 4.1 全局 Dataset Store

CSV 数据不能继续只存在于 `CsvDataPanel.vue`。需要建立共享数据状态：

```ts
type Dataset = {
  id: string;
  name: string;
  columns: DataColumn[];
  rows: DataRow[];
  primaryKey?: string[];
};

type DataColumn = {
  name: string;
  type: "nominal" | "temporal" | "quantitative";
};
```

数据面板、轴绑定面板、图表 renderer、Layer 和 Nested 必须读取同一个 Dataset。

### 4.2 语义 ChartNode

当前 CanvasNode 主要保存 SVG 内容和几何变换。需要给图表节点增加语义层，不能只保存最终 SVG：

```ts
type ChartSpec = {
  chartType: string;
  datasetId: string;
  encodings: Record<string, Encoding>;
  transforms: DataTransform[];
  scales: Record<string, ScaleSpec>;
  series?: Encoding;
  renderer: RendererReference;
};

type Encoding = {
  field: string;
  type: "nominal" | "temporal" | "quantitative";
};
```

建议让 CanvasNode 引用 ChartSpec，而不是把所有字段直接塞入 CanvasNode。

### 4.3 Mark 身份

生成的 SVG 必须带有稳定语义标识：

```html
<g data-chart-id="..." data-mark-role="series">
  <path data-series-key="Person_A" />
</g>

<circle
  data-mark-role="point"
  data-row-key="Person_A|2025-01-01"
/>
```

后续点选、Layer 和 Nested 应读取这些标识，不应通过颜色、DOM 顺序或视觉相似度猜测数据身份。

### 4.4 Scale 与 Plot Area

需要显式保存：

- X/Y scale 的类型、domain 和 range。
- 图表内部 plot area 的位置和尺寸。
- 独立坐标轴组件与 mark 使用的 scale ID；网格、刻度及全部轴文字由坐标轴组件统一渲染。
- Layer 中哪些通道共享 scale。

没有这个模型，Scatterplot 无法与 Line Chart 精确共享坐标。

## 5. Case 1 推荐交互流程

### 5.1 Line Chart 数据绑定

1. 用户拖入 Line Chart 模板。
2. 系统把它标记为 `unbound chart`，保留原 SVG 作为模板预览。
3. 用户点击 X 轴，打开 Encoding Inspector，选择 `time`。
4. 系统自动推断字段类型为 temporal。
5. 用户点击 Y 轴，选择 `weight_kg`。
6. 系统运行 series 推断，建议 `person`。
7. 用户确认后，生成 ChartSpec 并调用 renderer。
8. 新的语义化 SVG 在原位置、原尺寸和原层级替换模板 SVG。

轴绑定不应直接修改原始 SVG path。它应修改 ChartSpec，然后完整重绘 chart content。

### 5.2 `person` 推断算法

Case 1 不需要在渲染后识别“哪条线属于哪个人”。应在生成折线前推断分组字段。

候选字段应满足：

1. 不是已经绑定的 X/Y 字段。
2. 是 nominal 字段。
3. 每个候选值包含多个时间点。
4. 同一个候选值内，`time` 基本唯一且可排序。
5. 各组对时间域的覆盖率较高。
6. 分组数量适合生成多条线。

Case 1 中 `person` 会得到最高分。LLM 可以解释或消除歧义，但基础推断应保持确定性，避免每次调用产生不同结果。

### 5.3 LLM 生成 `<g>` 创建程序

推荐协议：LLM 不直接返回任意网页脚本，而是返回受限的 renderer program 或声明式 AST，由本地 renderer 创建 SVG `<g>`。

输入至少包含：

- Chart template 的 anatomy。
- Dataset schema 和少量样例数据。
- 已确认的 encodings。
- plot area、scale 和样式约束。
- renderer API 版本。

输出至少包含：

- 可验证的程序或 AST。
- 使用到的字段列表。
- 生成的 mark roles。
- series key 和 row key 的写入规则。
- renderer 版本及生成来源。

如果必须执行 LLM 返回的 JavaScript，不能在主页面直接 `eval`。需要在 Web Worker 或隔离 iframe 中运行，并只暴露受限 SVG 创建 API。

### 5.4 Layer Line + Scatter

建议 Layer 的前置条件：

- 两个节点都是语义 ChartNode。
- 使用同一 Dataset，或存在明确 join。
- 坐标系兼容。
- X/Y encoding 类型兼容。

当 Line Chart 已绑定而 Scatterplot 未绑定时，Layer 可以询问是否继承 Line Chart 的 X/Y 和 Dataset；Case 1 默认继承。

Layer 的结果应是语义组合节点：

```ts
type LayerSpec = {
  type: "layer";
  children: string[];
  sharedScales: { x: boolean; y: boolean };
  axisOwner: string;
};
```

执行顺序：

1. 计算共享 temporal X scale 和 quantitative Y scale。
2. 确定唯一 plot area。
3. Line renderer 和 Point renderer 使用相同 scale/range。
4. 坐标轴只渲染一次。
5. Scatter 的每个点记录 `(person, time)` row key。
6. Layer 结果替换两个原始节点，或在确认后隐藏原节点并保留可逆引用。

### 5.5 Point 语义选择

需要区分三种选择层级：

1. Chart selection：选择整个图表。
2. Mark-role selection：选择所有 point marks。
3. Mark-instance selection：选择某个 `(person, time)` 的点。

Case 1 建议先选择 point mark role，再创建 Nested 模板。这样一次编辑会应用到所有散点；单击某个点只用于预览该记录的数据。

当前 CanvasNode 顶层选择机制不能承担这项功能，需要独立的 `semanticSelection` 状态。

### 5.6 Nested 编辑画布

Nested 不应继续复用“选择两个顶层图表后合并 SVG”的交互。建议流程：

1. 用户选择 Layer 中的 point mark role。
2. 点击 Nested。
3. 打开独立的 Nested Editor，并显示一个代表性 point/datum。
4. 用户拖入 Pie Chart。
5. 默认建立锚点：`parent.center -> child.center`。
6. 用户选择四个组成字段。
7. 系统建立 fold transform 和 Pie encoding。
8. 关闭或确认编辑器后，为每个散点实例化一个 Pie Chart。

NestedSpec 示例：

```ts
type NestedSpec = {
  type: "nested";
  parentChartId: string;
  parentMarkRole: "point";
  joinKey: ["person", "time"];
  anchor: {
    parent: "center";
    child: "center";
  };
  child: ChartSpec;
};
```

Pie Chart 的 transform：

```ts
{
  type: "fold",
  fields: ["water_kg", "fat_kg", "muscle_kg", "minerals_kg"],
  as: ["component", "value"]
}
```

Pie encodings：

```text
theta = value
color = component
```

每个 child view 只接收当前 parent point 的一行数据经过 fold 后得到的四行数据。

## 6. 主要技术难点

### 6.1 静态 SVG 模板与语义图表之间的边界

现有 SVG 的节点拆分主要服务于视觉编辑，并不保证能识别 axis、mark、legend 或 plot area。需要决定：

- 模板只负责样式参考，由 renderer 重建图表；或
- 在原 SVG 上进行 anatomy 标注后局部替换。

推荐第一种。保留模板的颜色、字体和线型作为 style tokens，但由确定性 renderer 重建 axes 和 marks。

### 6.2 LLM 输出的可重复性和安全性

风险包括：

- 同一输入生成不同结构。
- 代码语法正确但 scale 或 data join 错误。
- 返回危险或无限循环代码。
- API 延迟导致画布状态与请求上下文不一致。

必须增加 schema validation、超时、取消、版本号、缓存、错误回退和 sandbox。LLM 结果不能成为唯一数据语义来源。

### 6.3 Layer 的可逆性

Layer 不能只把两个 SVG 扁平化，否则之后无法选择 point layer 或修改 encoding。组合节点需要保留 children spec，并纳入 Undo/Redo 和序列化。

### 6.4 Nested 的实例数量和性能

Case 1 当前有 40 个 parent points，每个 Pie 有 4 个扇区，即至少 160 个 arc marks。数据增大后需要：

- 模板只保存一份，实例按数据生成。
- 避免每个 Pie 创建独立 Vue 组件树。
- 使用 keyed SVG data join 或批量 renderer。
- 对尺寸过小的 Pie 设置最小可见半径或聚合策略。

### 6.5 数据更新传播

替换 CSV 或修改 binding 后，更新链应为：

```text
Dataset -> ChartSpec -> Shared scales -> Layer marks -> Nested child data -> SVG
```

不能把渲染后的 SVG 当成唯一状态，否则任何上游修改都无法可靠传播。

## 7. 推荐实施阶段

每个阶段应单独确认后再开始，不建议同时开发 LLM、Layer 和 Nested。

### Phase 0：冻结 Case 1 交互与数据约定

- [x] 确认 `(person, time)` 为主键。
- [x] 确认 `weight_kg` 为四项组成之和。
- [x] 确认 Nested 是应用到全部 points，单点只做预览。
- [x] 确认 Layer/Nested 操作是替换原节点还是生成新节点：创建新的语义组合节点，保留 child specs，Undo 可恢复原节点。
- [x] 确认 LLM 输出采用受限 AST，不执行任意 JavaScript。

验收：本文档中的交互没有未决歧义。Phase 3 之前的实现继续保留原始模板树，语义渲染结果作为可重建缓存。

### Phase 1：全局数据与字段类型

- [x] 把 CSV 状态从 `CsvDataPanel` 移到 Dataset Store。
- [x] 实现 nominal/temporal/quantitative 类型推断。
- [x] 建立 Dataset ID、row key 和 schema。
- [x] 数据面板显示推断类型。
- [x] 数据面板允许手动修正类型。

验收：已完成。共享接口位于 `src/useDatasetStore.ts`，任何画布模块都能通过 Dataset ID 读取 Case 1 数据和 schema，数据面板表头可手动修正字段类型。

### Phase 2：ChartSpec 与轴绑定 UI

- [x] 为图表节点增加 ChartSpec 引用。
- [x] 给 X/Y axis 添加独立 hit target。
- [x] 实现 Encoding Inspector 和列选择。
- [x] 支持绑定 `time` 与 `weight_kg`。
- [x] 绑定变化纳入 Undo/Redo。

验收：已完成。Cartesian 图表会关联当前 Dataset；用户点击坐标轴后可配置 X=`time`、Y=`weight_kg`，绑定结果保存在节点的 ChartSpec 中，并支持 Undo/Redo。

### Phase 3：确定性 Line Renderer 与 series 推断

- [x] 实现 `person` 候选评分。
- [x] 增加 series 确认 UI。
- [x] 使用 `d3-scale`、`d3-shape` 和 `d3-array` 生成 axes 和 paths。
- [x] 给每条线写入 `data-series-key`。
- [x] 在原位置替换静态模板，同时保留样式 tokens。

验收：已完成。Case 1 稳定生成 5 条线，每条线包含 8 个按时间排序的点；renderer metadata 写入 `data-mark-role="series"`、`data-series-key` 和 `data-point-count`。纯逻辑回归测试位于 `cv-author-app/src/lineRenderer.test.ts`，浏览器回归脚本位于 `cv-author-app/scripts/verify-phase3.mjs`。

### Phase 4：LLM Renderer Adapter

- [ ] 定义请求/响应 schema。
- [ ] 增加服务端 API，密钥不进入浏览器。
- [ ] 验证和隔离执行生成程序。
- [ ] 加入 loading、cancel、retry、fallback 和 cache。
- [ ] 保存 prompt/version/provenance，便于复现。

验收：LLM 失败时不会破坏原图；相同输入可从缓存恢复；输出包含完整 mark metadata。

### Phase 5：语义 Layer

- [x] 为 Scatterplot 建立 point renderer。
- [x] 实现未绑定图层继承已有 binding。
- [x] 实现共享 plot area 与 X/Y scales。
- [x] 只保留一套 axes。
- [x] LayerSpec 保留两个 child specs。
- [x] 为每个 point 写入 `(person, time)` row key。

验收：Line 与 Point 精确重合；修改 scale、数据或画布尺寸后两层同步更新。

### Phase 6：Mark 选择

- [x] 增加 chart / mark role / mark instance 三层选择。
- [x] 支持点击 point 并查看绑定数据。
- [x] 支持选择全部 point marks 作为 Nested parent。
- [x] 明确高亮与顶层 CanvasNode 选择的优先级。

验收：点击任一点能得到正确的 `person` 和 `time`，且不会误移动整个 Layer。

### Phase 7：Nested Editor 与 Pie Renderer

- [x] Nested 按钮接受一个 parent mark role，而不是两个顶层节点。
- [x] 创建 popup Nested Editor 和独立编辑上下文。
- [x] 支持拖入 Pie Chart 模板。
- [x] 实现 center-to-center anchor。
- [x] 实现四字段 fold transform。
- [x] 为每个 point 实例化对应 Pie。
- [x] 支持 Pie 尺寸、颜色和最小半径设置。

验收：40 个散点生成 40 个 Pie，每个 Pie 有 4 个扇区，扇区之和等于该点的 `weight_kg`。

### Phase 8：持久化、历史与错误处理

- [x] Dataset、ChartSpec、LayerSpec、NestedSpec 可保存/加载。
- [x] 所有语义操作支持 Undo/Redo。
- [x] CSV schema 不兼容时给出明确错误。
- [x] 删除 parent、child 或 dataset 时维护引用完整性。
- [ ] 增加 Case 1 的端到端回归测试。

验收：刷新或重新打开项目后可以恢复完整 Case 1；Undo 能逐步返回到原始模板。

## 8. 当前进度与下一项开发任务

Phase 1、Phase 2、Phase 3、Phase 5、Phase 6、Phase 7 和 Phase 8 的 Case 1 主流程已完成。Phase 4（LLM Renderer Adapter）仍按原计划延后，当前语义流程使用确定性本地 renderer。

原因：Layer、Nested 和后续 LLM 都必须依赖同一套 ChartSpec、scale、mark metadata 和数据更新链。确定性 renderer 是这些能力的基础，不能让 LLM 输出成为唯一语义来源。

## 9. 建议暂缓的功能

以下功能不应进入 Case 1 的首个闭环：

- 多 Dataset join UI。
- 独立双 Y 轴。
- 多层嵌套。
- Geographic/Polar Nested。
- 任意字段计算表达式。
- 对生成代码进行自由文本编辑。
- 大数据 Canvas/WebGL 渲染。

Case 1 的首个闭环应只覆盖：一个 Dataset、Cartesian Line + Point Layer、point-to-pie Nested、共享 X/Y scale 和四字段 fold。
