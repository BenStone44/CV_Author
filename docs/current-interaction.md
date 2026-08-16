# CV Author 当前交互说明

更新时间：2026-08-06  
范围：`cv-author-app` 当前前端行为  
状态：用于后续讨论交互调整；本文只描述现状，不定义新的产品规则。

## 1. 页面结构

页面从上到下、从左到右分为三块：

1. 顶部是图表模板浏览区和坐标系筛选区。
2. 工作区左侧是 CSV 数据面板。
3. 工作区右侧是画布。画布内有网格背景、右上角浮动工具栏、图表对象和各种弹窗。

页面会自动加载 `data/case1.csv` 作为默认数据；项目状态和关系状态会写入浏览器 `localStorage`，刷新后尝试恢复。

## 2. 数据面板

- `Import CSV` 打开文件选择器，或可以把 CSV 文件拖到数据面板。
- 导入后显示文件名、行数、列数和最多 250 行预览。
- 每一列都可以通过下拉框改成 `nominal`、`temporal` 或 `quantitative`。
- 数据面板宽度在桌面端可根据表格内容展开；点击展开按钮展开，再次点击同一按钮收起。
- `Clear data` 清除当前数据和文件选择状态。
- 导入过程中导入按钮禁用；解析错误和警告显示在表格上方。

## 3. 图表模板与素材放置

### 3.1 筛选模板

左上角 `Coordinate` 筛选器可以在无筛选、`Cartesian`、`Polar` 等坐标系之间切换。当前筛选是单选式切换：再次点击当前选项会清空筛选。

### 3.2 拖入画布

- 顶部的已实现图表模板可以拖入画布。
- 画布也接受 SVG、PNG、JPEG、WebP、GIF、AVIF 文件。
- 新对象会放在拖放位置附近，并自动限制在画布范围内。
- 新建图表会自动绑定当前数据集，并作为独立 atomic Chart Unit 放置；有编码配置入口的图表会自动打开 Mark Encoding 面板。
- 模板拖放只负责创建 atomic unit，不会直接创建 Layer、Concat 或 Nested。
- 先分别完成每个 unit 的必需 Mark Encoding，再选中这些 unit 并使用工具栏创建 Composition。

## 4. 画布选择与移动

- 左键点击对象：选中对象并开始移动。
- `Shift`、`Ctrl` 或 `Cmd` 加点击：追加或取消选择。
- 在画布空白处左键拖动：框选对象。
- 中键拖动：平移画布。
- 鼠标滚轮：以光标位置为中心缩放画布。
- 右键对象：选中对象并打开上下文菜单。
- 右键画布空白处：清空当前选择并打开上下文菜单。
- 选择对象后显示选框、缩放手柄和旋转手柄；拖动手柄可以缩放或旋转。
- 旋转时可以使用出现的角度输入框输入整数角度。
- 选中多个对象时，工具栏提供左/中/右、上/中/下六种对齐方式。

### 4.1 组编辑

- 双击普通 Group 进入组内编辑模式。
- 组内编辑时可以选择、移动、框选组内对象。
- `Escape` 退出当前层级的组编辑；再次按可继续退出更外层组。
- 普通 Group 可以 `Group`、`Ungroup`；`Dissolve` 会把嵌套组递归展开成叶对象。
- 对渲染后的图表执行 `Ungroup` 时，会尝试从 SVG 内容拆出可编辑叶节点，因此可能失去原图表语义配置。

## 5. 右上角浮动工具栏

### 5.1 历史与画布

- Undo / Redo：撤销或恢复画布和图表配置变更。
- Delete：删除当前选中对象。
- Clear canvas：清空整个画布。
- Reset zoom：恢复 `100%` 缩放和原始平移位置。

### 5.2 组合

工具栏提供 `Layer`、`Facet`、`Concat`、`Nested` 四类组合入口。按钮是否可用由当前选择和图表类型决定。

- Layer：将坐标系、Dataset 和通道类型兼容的图表叠加到同一绘图区；每个成员保留自己的 X/Y Mark Encoding，兼容通道合并所有成员的 domain 后共享 scale。独立坐标轴组件只为共享通道渲染一次，所有 Chart renderer 都只输出 marks。
- Layer 的 owner 只承担共享坐标系的渲染与 frame，不再向其他成员复制字段、聚合或视觉配置。
- Layer 与其他编辑操作统一以 plot area 作为几何 bbox；刻度文字、轴标题、图例和模板留白不参与对齐、框选、缩放框或拆出区域计算。
- Facet：根据选中图表的数据维度创建多个小图。
- Concat：按投放边缘并列多个视图。拖入目标矩形的上/下边缘时共享 X，拖入左/右边缘时共享 Y；未共享通道仍保留各 Chart 自己的轴和 Encoding。
- Nested：需要先选中 Scatterplot 的具体数据点；直接点击入口时，如果没有点选择，会显示提示。

部分组合会先打开候选布局弹窗；候选项可以点击，也可以拖入画布。标记为 `Pending` 的候选项当前不可用。

### 5.3 Layer 整体变换

Layer 的共享坐标系、唯一坐标轴和所有 marks 是一个变换单元：

- 拖动任意成员都会同时移动所有成员与坐标轴。
- 拖拽位移不再要求整个 Chart bbox 留在画布内部，不存在随对象缩放而移动的内部停止边界。
- 缩放或旋转任意成员时，所有成员使用同一个 frame 同步变化。
- 共享轴的方向或 scale 变化会重新渲染全部成员 marks。
- 暂停通过拖出成员自动拆分 Layer；拖拽不会解除 Layer 或共享轴关系。

## 6. 坐标轴与编码检查

### 6.1 打开方式

选中 atomic Chart Unit 后，点击画布上的 `Encoding` 按钮打开 Mark Encoding 面板。面板只编辑当前 Unit；共享坐标轴关系不会把字段配置传播到其他 Unit。

面板关闭方式：点击右上角关闭按钮、按 `Escape`，或选择其他交互入口。

### 6.2 Cartesian 图表

- 网格、轴线、刻度、刻度文字和轴标题由独立坐标轴组件渲染；它们共享 plot area、scale 与字体模型，不属于任何 Chart 的 `renderedContent`。共享通道不显示 owner 的字段标题，避免把单个 Mark 的语义错误地赋给整个轴。
- Cartesian 初始 plot area 使用居中的 4:3 区域；轴文字初始屏幕字号约为 8–9px，并补偿模板节点的初始 scale。
- X、Y 下拉框可以绑定或解除数据列。
- 每个 Chart 保存自己的 Encoding；共享 Axis 不会合并其他 Chart 的非共享 Encoding。
- 创建 Chart 时会根据模板和数据列类型生成初始默认 Encoding；用户可以在 Card 中继续调整。
- 下拉项会根据图表类型过滤不兼容的数据类型。
- 点击轴线上的反向控制可以反转轴方向；共享坐标轴的图表成员会同步更新。
- 拖动坐标原点可以调整绘图区原点。
- 拖动坐标轴末端的缩放手柄可以调整轴尺度。

Line chart 还可以选择 `Series` 字段：

- 选择一个 nominal 列后，在同一视图中绘制多条线。
- Multi-Line 可以在 `Y measures` 中勾选多个 Cube measures；系统将 measure identity 自动绑定为 Series。
- 选择 `Single line` 或点击继续按钮可清除 series。
- `Confirm encodings` 提交当前选择，并且只在此时运行 Compatibility Engine。确认后再次修改 Channel 或 measure 选择会使检查结果失效。

Stacked Area、Streamgraph 和 Horizon 使用相同的 `Y measures -> value-series` 绑定。渲染前系统把宽表 measures 转换为统一 value 与 measure identity，用户无需手动执行 fold。

Scatterplot 还可以设置可选的 `Color`、`Size`、`Shape` 编码；可以确认，也可以选择 `Continue without optional encodings`。

### 6.3 Polar / Pie 图表

- Polar 图表可以绑定 `Radius`。
- Pie 图表可以选择多个 quantitative 列作为 `Angle components`。
- Pie 半径支持 `Same radius` 和 `Per component` 两种模式。
- `Per component` 模式下可以为每个角度分量单独选择半径字段。
- 点击 `Confirm encodings` 后关闭编码面板。

## 7. Atomic Chart Unit 与 Composition

- Chart 模板拖入画布时只创建一个独立的 atomic unit，不会直接触发 Layer、Concat 或 Nested。
- X、Y 及其他数据 Channel 写入该 Unit 的 Mark Encoding；坐标轴只保存方向、scale、可见性和共享关系。
- 每个 Unit 必须先完成必需的 Mark Encoding，之后才能参与 Composition。
- Layer 会保留每个成员自己的字段。例如 `weight_kg` 和 `water_kg` 都保持为各自 Mark 的 Y Encoding；两者同为 quantitative 时可以共享 Y scale。
- Composition 只共享兼容的坐标通道，不会再把 owner 的 X/Y Encoding 覆盖到成员。

## 8. Dimension options

Dimension Options 当前暂时关闭：画布按钮、Encoding 面板入口、自动弹窗和推荐卡片均不显示。内部 recommendation 数据暂时保留，便于后续恢复时继续使用统一推断结果。

## 9. 嵌套 Point + Pie

先分别完成 Scatterplot 和 Pie atomic unit，再创建 Nested Composition：

- 选择 Point 的 X、Y 字段。
- 选择 Pie 半径字段。
- 勾选一个或多个 Pie 角度字段。
- `Create composition` 创建关系；`Cancel` 放弃。

创建后，子 Pie 会跟随父 Scatterplot 数据点；父图表重新渲染或坐标变化时，关系会重新解析。

## 10. 上下文菜单、快捷键与层级顺序

右键菜单提供：

- Copy / Paste。
- Group / Ungroup。
- Bring to front / Move forward / Move backward / Send to back。
- Delete。

快捷键：

- `Delete`：删除选择。
- `Ctrl/Cmd + C`：复制。
- `Ctrl/Cmd + V`：粘贴。
- `Ctrl/Cmd + Z`：撤销。
- `Ctrl/Cmd + Shift + Z`：重做。
- `Escape`：关闭弹窗、关闭上下文菜单，或退出组编辑。

输入框、下拉框获得焦点时，上述全局快捷键不会抢占输入操作。

## 11. 当前状态与后续讨论边界

以下是当前实现中的关键行为，后续调整时需要明确是否保留：

- Dimension Options 暂时关闭，当前交互中没有入口或自动弹窗。
- 编码绑定、轴反向、轴缩放、组合创建、对象移动和删除都会进入同一套画布 Undo/Redo 历史。
- `localStorage` 会自动保存画布和关系状态，但当前没有显式的保存/加载按钮。
- LLM renderer 入口代码存在，但当前被暂停，默认仍使用确定性渲染器。

后续恢复 Dimension Options 时，再确认它是一次性推荐还是可反复编辑，以及多选或组合图表下推荐项的作用范围。
