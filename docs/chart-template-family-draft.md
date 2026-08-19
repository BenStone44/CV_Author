# Chart Templates Family Draft

状态：已确认，已按 family 分组到 Chart templates。

这份文档保留了确认前的原始标注、空位和重复项；应用侧已将当前已实现模板按 family 合并到 Chart templates 中。

## 标记规则

- `已实现`：当前应用有对应的 template 定义、数据契约和渲染路径。
- `未实现`：当前应用没有对应的 template 实现；数据集中的同名示例不算应用模板。
- `别名映射`：原始名称映射到当前实现使用的名称。

## 原始标注

下面保留原始列顺序、空位和重复标注，便于逐项检查。

```text
barchart	linechart	areachart	point	rect	arc	violin	dotplot	radar	circlepacking	contour	hexbin	word_cloud	chord	voronoi	sankey	parallel_coordinates	storyline	graph	tree	sunburst/icicle	treemap	dendrogram	Calendar	boxplot
plain bar	single-line	plain area	scatterplot	matrix			dotplot			contour	hexbin			voronoi	sankey	parallel_coordinates	storyline	graph	tree	icicle	treemap	dendrogram		boxplot
grouped bar	multi-line	stacked area	bubble chart
stacked bar	step line	streamgraph	density plot
normalized stacked bar		horizon chart
divergent bar		normalized stacked areachart










stacked bar		radar	bubble chart		donut			radar					chord						tree	sunburst		dendrogram		boxplot
plain bar		plain area	scatterplot	pie
		stacked area
		streamgraph
		horizon chart
		density chart







	geo path	geo area	geo point						contour				voronoi				graph
```

## 实现状态核对

### 第一组标注

| 原始列 | 模板 | 状态 | 当前代码对应 |
| --- | --- | --- | --- |
| barchart | plain bar | 已实现 | `SingleBarChart` |
| barchart | grouped bar | 已实现 | `GroupedBarChart` |
| barchart | stacked bar | 已实现 | `StackedBarChart` |
| barchart | normalized stacked bar | 未实现 | - |
| barchart | divergent bar | 已实现 | `DivergentBarChart` |
| linechart | single-line | 别名映射，已实现 | `LineGraph` |
| linechart | multi-line | 别名映射，已实现 | `MultiLineChart` |
| linechart | step line | 未实现 | - |
| areachart | plain area | 别名映射，已实现 | `AreaChart` |
| areachart | stacked area | 别名映射，已实现 | `StackedAreaChart` |
| areachart | streamgraph | 已实现 | `Streamgraph` |
| areachart | density plot | 未实现 | - |
| areachart | horizon chart | 已实现 | `HorizonChart` |
| areachart | normalized stacked areachart | 未实现 | - |
| point | scatterplot | 已实现 | `Scatterplot` |
| point | bubble chart | 未实现 | - |
| rect | matrix | 已实现 | `MatrixDiagram` |
| arc | pie | 别名映射，已实现 | `PieChart` |
| arc | donut | 别名映射，已实现 | `DonutChart` |
| violin | violin | 未实现 | - |
| dotplot | dotplot | 未实现 | - |
| radar | radar | 未实现 | - |
| circlepacking | circlepacking | 未实现 | - |
| contour | contour | 已实现 | `Contour` |
| hexbin | hexbin | 已实现 | `Hexbin` |
| word_cloud | word cloud | 未实现 | - |
| chord | chord | 已实现 | `Chord` |
| voronoi | voronoi | 未实现 | - |
| sankey | sankey | 已实现 | `Sankey` |
| parallel_coordinates | parallel coordinates | 已实现 | `ParallelCoordinatesPlot` |
| storyline | storyline | 未实现 | - |
| graph | graph | 未实现 | - |
| tree | tree | 未实现 | - |
| sunburst/icicle | sunburst | 已实现 | `Sunburst` |
| sunburst/icicle | icicle | 已实现 | `Icicle` |
| treemap | treemap | 已实现 | `Treemap` |
| dendrogram | dendrogram | 已实现 | `Dendrogram` |
| Calendar | Calendar | 已实现 | `Calendar` |
| boxplot | boxplot | 别名映射，已实现 | `Boxplot` / `BoxAndWhisker` |

### 第二组重复标注

| 原始列 | 模板 | 状态 | 当前代码对应 |
| --- | --- | --- | --- |
| barchart | stacked bar | 已实现 | `StackedBarChart` |
| barchart | plain bar | 已实现 | `SingleBarChart` |
| areachart | radar | 未实现 | - |
| areachart | plain area | 别名映射，已实现 | `AreaChart` |
| areachart | stacked area | 别名映射，已实现 | `StackedAreaChart` |
| areachart | streamgraph | 已实现 | `Streamgraph` |
| areachart | horizon chart | 已实现 | `HorizonChart` |
| areachart | density chart | 未实现 | - |
| point | bubble chart | 未实现 | - |
| point | scatterplot | 已实现 | `Scatterplot` |
| rect | pie | 别名映射，已实现 | `PieChart` |
| arc | donut | 别名映射，已实现 | `DonutChart` |
| radar | radar | 未实现 | - |
| chord | chord | 已实现 | `Chord` |
| tree | tree | 未实现 | - |
| sunburst/icicle | sunburst | 已实现 | `Sunburst` |
| dendrogram | dendrogram | 已实现 | `Dendrogram` |
| boxplot | boxplot | 别名映射，已实现 | `Boxplot` / `BoxAndWhisker` |

### 地理标注

| 原始列 | 模板 | 状态 | 当前代码对应 |
| --- | --- | --- | --- |
| linechart | geo path | 未实现 | - |
| areachart | geo area | 未实现 | - |
| point | geo point | 未实现 | - |
| contour | contour | 已实现 | `Contour` |
| voronoi | voronoi | 未实现 | - |
| graph | graph | 未实现 | - |

## 当前实现依据

实现状态按 `src/useCanvasStore.ts` 中的基础模板定义、`src/advancedChartCards.ts` 中的高级模板定义、`src/chartTemplates.ts` 中的 template contract，以及 `src/advancedRenderer.ts` / `src/semanticRenderer.ts` 中的渲染入口核对。

原始标注部分没有根据坐标系重新排列条目，也没有把重复条目去重；UI 分组使用实现状态核对中的 family 映射。
