# deck.gl Canvas Node Contract

本文档定义 Mapbox/deck.gl 可视对象在 Canvas、Composition 和 Nested 中的边界。

## 1. deck.gl Node 是完整可视单元

一个 deck.gl node 同时拥有地图 viewport、Mapbox view state、GeoJSON ID join、一个或多个
deck.gl layers、selection frame 和 relationship context。Canvas 操作必须以该 node 为完整单元，
不能把 WebGL layer、地图底图或内部 picked feature 当作普通 SVG child。

- 移动、缩放、旋转作用于外部 viewport frame。
- 地图平移、缩放、旋转仍由 Mapbox 在 viewport 内处理。
- CSV drop、feature picking 和 point-nested hit testing 属于地图内部交互。
- Canvas selection、composition、Config 和 Split 属于地图外部结构交互。

内部地图手势与外部 Canvas 手势不能共享同一命中面。外部 frame edges 可以启动 Canvas move；
Config 和整体 composition Split 控件必须居中放在地图矩形正上方，保持固定屏幕尺寸和间距，
不能覆盖可拖动、可缩放、可拾取的地图区域。该位置与其他 chart、极坐标系及 Tree 一致。
Concat link 自己的边界 Split 是另一种 link 操作，仍留在所属连接边界。

普通 selection overlay 不显示 Enter。Enter 只在 composition 拖拽期间作为进入当前 scope 的
drop portal 出现，地图、极坐标系或其他 chart 被普通选中时都不得在内部绘制 Enter 按钮。

## 2. deck.gl Layer Stack

Layer composition 保留每个成员自己的 layer type、config、dataset binding 和 GeoJSON ID join，
同时让它们共享一个 Mapbox viewport、map style 和 view state。`deckglLayerStack[0]` 是可见 owner；
其余成员是同一地图实例中的渲染层，不再创建相互覆盖的独立 Mapbox DOM。

Layer stack 在父 scope 中是完整 Composite unit。选择、移动、删除、复制和后续 Nested 操作必须
以 owner/stack 为整体，不能从地图表面直接选中隐藏 member。针对某个 picked feature 的事件仍应
携带真实 `layerId`，以便 encoding 和 nested relationship 归属正确的成员层。

### 尚未实现：Layer Split

当前 deck.gl Layer 可以建立和继续追加，但尚未实现把 stack 拆回多个独立地图 viewport 的
结构操作。界面不得把普通 Composition Split 描述为已经支持 deck.gl Layer split。

未来实现必须作为一次 undoable transaction：

1. 为每个 layer member 恢复独立 viewport frame、map view state 和 selection ownership；
2. 保留各自 config、dataset、GeoJSON binding、nested relationships 和 z-order；
3. 清除共享 `deckglLayerStack`，但不能删除 layer 或复制 relationship；
4. 定义拆分后的确定性排布，不能让多个交互地图完全重叠；
5. 增加 Layer → Split → Undo/Redo、带 nested child 的 split、不同 GeoJSON binding 和多层顺序测试。

## 3. Nested Message Frame

消息框属于 Nested relationship，不属于 child ChartSpec 或 deck.gl layer config。关系可保存：

```ts
callout?: {
  enabled: boolean
  scale: number
}
```

启用后，矩形 frame 围绕 child 的几何中心等比扩张；因此 child 在 frame 中始终上下、左右居中。
`scale` 只改变 frame，不改变 child chart 的 scale。消息箭头从 frame 边缘出发，终点是关系解析后
的真实 parent anchor；用于摆放 child 的 `offset` 不能被误当成 parent anchor。

同一模型必须同时用于 SVG parent 和 deck.gl point parent。对 deck.gl parent，地图投影变化时必须
重新投影 child、frame 和箭头；不得把 callout 烘焙进 child SVG。关闭或 detach relationship 时，
frame 与箭头随关系一起消失，child 的本地 transforms/encodings 保持不变。
