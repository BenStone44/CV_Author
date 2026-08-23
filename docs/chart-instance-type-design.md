# Chart Instance Type 设计

状态：设计草案  
日期：2026-08-23

## 1. 目标

增加一个描述“具体一次图表实例”的 TypeScript 类型。它应同时回答以下问题：

1. 这是哪个图表实例，来自哪个数据集和画布节点？
2. 它使用的是普通 `ChartSpec`，还是一个 composite 的配置？
3. 它在画布中的整体边界是什么？
4. 它的坐标空间是直角坐标还是极坐标，坐标空间占据什么几何范围？
5. 坐标空间内部真正可绘制的 chart 内容范围是什么？

该类型是可持久化、可直接交给 renderer 的实例描述，不替换现有 `ChartSpec`、`CompositionSpec` 或 `CanvasNode`。建议使用一个扁平的 instance list 保存所有实例；嵌套关系通过 instance ID 表达，而不是通过 TypeScript 对象递归嵌套。这样输入文件被解析后，可以先按 ID 建索引，再从 root instance 开始直接渲染。

## 2. 术语和边界

| 概念 | 含义 |
| --- | --- |
| `ChartSpec` | 一个非 composite 图表的配置，包含 chart type、dataset、encoding、scale、样式等 |
| composite config | Layer、Concat、Facet、Nested 等组合关系及其成员 instance ID；不是把多个子图压平为一个 `ChartSpec` |
| chart instance | 一个可定位、可渲染、可选择的具体图表实例；可能是普通图表、composite 根实例或 composite 子实例 |
| outer bounds | 实例在画布坐标中的整体外框，包含实例变换后的范围 |
| coordinate bounds | 坐标系本身的几何范围；直角坐标对应 plot/轴空间，极坐标对应中心、角度和半径范围 |
| inner bounds | 坐标系内部实际承载 marks 的范围；不包含坐标轴标题、tick、图例等外部装饰 |

`outer bounds`、`coordinate bounds` 和 `inner bounds` 必须使用同一坐标空间。持久化实例统一使用画布绝对坐标；局部坐标只在命中区域计算的中间过程使用，不能写入直接渲染文件。

## 3. 建议的 TypeScript 定义

以下是建议的公共类型。名称可在实现阶段按项目现有命名调整，但判别字段和层次应保持不变。

```ts
import type {
  Bounds,
  CanvasNode,
  ChartSpec,
  CompositionSpec,
  LayerSpec,
  NestedSpec,
  Point,
} from "../types";

export type ChartInstanceId = string;

/** Coordinate kinds covered by the first instance geometry model. */
export type ChartInstanceCoordinateSystem = "Cartesian" | "Polar";

export type ChartInstanceKind =
  | "single"
  | "composite-root"
  | "composite-member"
  | "nested-child";

/** Configuration owned by the composite instance; members are referenced by ID. */
export type CompositeCompositionConfig = Omit<CompositionSpec, "members">;
export type CompositeLayerConfig = Omit<LayerSpec, "children">;
export type CompositeNestedConfig = Omit<NestedSpec, "parentChartNodeId"> & {
  parentInstanceId?: ChartInstanceId;
};

export type CompositeChartConfig =
  | {
      type: "layer" | "concat" | "facet";
      composition: CompositeCompositionConfig;
      layer?: CompositeLayerConfig;
      memberInstanceIds: ChartInstanceId[];
    }
  | {
      type: "nested";
      composition?: CompositeCompositionConfig;
      nested: CompositeNestedConfig;
      memberInstanceIds: ChartInstanceId[];
    };

export type ChartInstanceSpec =
  | {
      kind: "chart";
      chart: ChartSpec;
    }
  | {
      kind: "composite";
      composite: CompositeChartConfig;
    };

export type CartesianCoordinateBounds = {
  type: "Cartesian";
  /** The rendered plot area in the selected bounds space. */
  plot: Bounds;
  /** Optional axis extents. They are separate from the mark plot area. */
  xAxis?: Bounds;
  yAxis?: Bounds;
};

export type PolarCoordinateBounds = {
  type: "Polar";
  origin: Point;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  angleSpan: number;
  /** Axis/ring envelope, which may be larger than the occupied marks. */
  envelope: Bounds;
};

export type ChartCoordinateBounds =
  | CartesianCoordinateBounds
  | PolarCoordinateBounds;

export type ChartInnerBounds = {
  /** Bounds occupied by marks/data content only. */
  marks: Bounds;
  /** Optional per-mark or per-group bounds for hit testing and selection. */
  markGroups?: Record<string, Bounds>;
};

export type ChartInstanceBounds = {
  /** Direct-rendering files use canvas coordinates. */
  space: "canvas";
  /** Exact geometry represented by `.canvas-object-hit-target`. */
  outer: Bounds;
  coordinate: ChartCoordinateBounds;
  inner: ChartInnerBounds;
};

export type ChartInstance = {
  id: ChartInstanceId;
  /** Optional editor linkage; direct rendering must not depend on it. */
  nodeId?: string;
  kind: ChartInstanceKind;
  datasetId: string | null;
  coordinateSystem: ChartInstanceCoordinateSystem;
  spec: ChartInstanceSpec;
  /** Runtime renderer snapshot; group children are reconstructed from IDs. */
  renderNode: CanvasNode;
  bounds: ChartInstanceBounds;
  /** Optional links for composite and nested instances. */
  parentInstanceId?: ChartInstanceId;
  compositionId?: string;
  /** Versioned snapshot metadata, useful when geometry is recalculated. */
  revision: number;
};

/** Canonical serialized input for direct rendering. */
export type ChartInstanceDocument = {
  version: 1;
  coordinateSpace: "canvas";
  rootInstanceIds: ChartInstanceId[];
  instances: ChartInstance[];
};
```

当前 `CoordinateSystem` 还包含 `Geographic` 和 `CoordinateFree`。由于本设计的 bounds 只有 Cartesian/Polar 两种几何定义，第一版实例工厂遇到这两类坐标应返回“不支持”结果，不能强行套用矩形坐标；未来需要时再新增对应的 bounds 分支。实现文件若需要读取现有类型，可以使用 `Extract<CoordinateSystem, ChartInstanceCoordinateSystem>` 做类型收窄。

### 3.1 为什么 `spec` 使用判别联合

普通图表只能保存一个 `ChartSpec`；composite 必须保存组合算子、成员及其关系配置。如果把二者都设计成可选字段，例如 `chartSpec?` 和 `compositionSpec?`，会允许“两个都没有”或“两个都有但互相矛盾”的无效状态。`spec.kind` 让 TypeScript 在读取时自动收窄，并在构造时强制二选一。

composite 根实例的 `spec` 只保存组合配置和 `memberInstanceIds`；每个成员 instance 在同一个 list 中单独保存自己的 `ChartSpec`。这符合当前项目的关系式组合模型：组合不是把子图的 encoding 合并成一个大 spec。

### 3.2 统一存储方式

`ChartInstanceDocument.instances` 是唯一的实例存储容器。推荐约束如下：

- 每个 instance ID 在 list 中唯一。
- 叶子实例的 `spec.kind` 为 `"chart"`，必须携带可渲染的 `ChartSpec`。
- composite 实例的 `spec.kind` 为 `"composite"`，只携带组合类型、组合配置和成员 ID，不复制成员 spec。
- `parentInstanceId` 表示直接父实例；根实例不设置该字段，并列在 `rootInstanceIds` 中。
- composite 的 `memberInstanceIds` 必须指向同一 document 中的实例；禁止悬空 ID 和循环引用。
- 每个 instance 自己保存完整的 `bounds`。父 composite 的 `outer` 可以由成员 bounds 合并得到，但仍建议持久化，以便选择和布局无需重新计算。
- 持久化的 composite config 必须使用 `CompositeCompositionConfig`、`CompositeLayerConfig` 和 `CompositeNestedConfig` 这类规范化快照；其中不能残留 `nodeId`/CanvasNode 引用，成员关系统一由 instance ID 表示。

这种结构能表达任意深度的 Layer/Facet/Nested，也能保持文件格式统一：读取时只需建立 `Map<ChartInstanceId, ChartInstance>`，不需要区分嵌套 JSON 与非嵌套 JSON。

`ChartInstanceDocument` 和每个 `ChartInstanceBounds` 的持久化版本固定使用 canvas 坐标。

关键点是：**bounding box 放在每一个 `ChartInstance.bounds` 上**。不额外建立 `boundingBoxes` 表，也不把 bounding box 只放在 composite 根节点上。这样任意子实例都能独立命中、选择和渲染；父实例的边界只是组合布局的汇总结果。

最小的扁平文件形态如下：

```json
{
  "version": 1,
  "coordinateSpace": "canvas",
  "rootInstanceIds": ["chart-root"],
  "instances": [
    {
      "id": "chart-root",
      "kind": "composite-root",
      "spec": {
        "kind": "composite",
        "composite": {
          "type": "layer",
          "composition": { "id": "comp-1", "type": "layer", "sharedChannels": ["x", "y"] },
          "memberInstanceIds": ["chart-line", "chart-points"]
        }
      },
      "bounds": { "space": "canvas", "outer": {}, "coordinate": {}, "inner": {} },
      "nodeId": "canvas-node-root",
      "datasetId": "sales",
      "coordinateSystem": "Cartesian",
      "revision": 0
    },
    {
      "id": "chart-line",
      "kind": "composite-member",
      "parentInstanceId": "chart-root",
      "spec": { "kind": "chart", "chart": {} },
      "bounds": { "space": "canvas", "outer": {}, "coordinate": {}, "inner": {} },
      "nodeId": "canvas-node-line",
      "datasetId": "sales",
      "coordinateSystem": "Cartesian",
      "revision": 0
    }
  ]
}
```

上例中的 `{}` 仅表示文档结构位置，实际文件必须写入完整 `Bounds` 和 `ChartSpec`。生产格式不应重复保存 composite 的成员对象；`memberInstanceIds` 是唯一关系来源。

### 3.3 为什么 bounds 分成三层

- `outer` 对应实例的画布选择/变换边界，可用于移动、缩放和旋转。
- `coordinate` 对应坐标空间。Cartesian 使用 `plot`，Polar 使用中心、角度、内外半径和包络矩形。
- `inner.marks` 对应真正的图内内容，用于 hit testing、数据标记选择和内部布局。

因此直角坐标的轴标题可以落在 `outer` 内但不进入 `inner.marks`；极坐标的空心圆洞属于 `coordinate` 的 `innerRadius`，但不应误算成 mark 内容。

## 4. 输入文件到渲染

`ChartInstanceDocument` 应作为 renderer 的高层输入，处理流程固定为：

1. 解析 JSON，校验 `version`、唯一 ID、root ID、父子关系和 composite 引用。
2. 建立 `instancesById` 索引，并从 `rootInstanceIds` 开始遍历。
3. 叶子实例使用自身的 `datasetId + ChartSpec + bounds` 调用现有确定性 renderer。
4. composite 实例按 `memberInstanceIds` 的顺序渲染子实例，并应用自身的 composition config、共享坐标和布局关系。
5. 输出 SVG/Canvas；渲染过程中可以生成临时 DOM 或 mark geometry，但不回写输入 document。

因此，直接渲染所需的信息必须在文件中存在：叶子 chart spec、dataset 引用、实例 bounds、坐标参数、组合关系和 root 顺序。不能依赖 CanvasNode 的父子顺序、SVG DOM 或运行时选择状态推断关系。

当前实现入口为 `createChartInstance(node)`、`createChartInstanceDocument(nodes)` 和 `restoreCanvasNodesFromChartInstanceDocument(document)`；`useCanvasStore` 暴露的 `chartInstanceDocument` ref 是 canonical instance 快照。每个 instance 的 `renderNode` 保存现有 SVG 编辑器恢复所需的节点运行时字段，composite 的 children 不重复保存，而是按 `memberInstanceIds` 重建。版本 3 localStorage 和撤销/重做历史都保存 instance document 与 relationships。所有 bounds 仍使用 `getCanvasObjectHitTargetBounds` 几何来源。

## 5. 坐标与边界计算规则

### 5.1 直角坐标

1. `outer` 使用节点 frame 经过 `x/y/scale/rotation` 后的轴对齐包围盒。
2. `coordinate.plot` 优先取 `ChartSpec.plotArea`，并转换到 `bounds.space`。
3. `inner.marks` 只包含 mark 的实际占据范围；不包括 Cartesian 轴、tick、标题和图例。
4. 如果尚未完成渲染，不能伪造 mark bounds；应使用 `inner.marks` 缺省策略或增加未来的 `status` 字段，而不是返回不准确的零矩形。

### 5.2 极坐标

1. `origin`、`innerRadius` 和 `outerRadius` 来自 `CoordinateGuide`/`ChartPolarArea` 的最终解析值。
2. 使用 `startAngle`、`endAngle` 以及圆周上的 `0/90/180/270` 候选角，计算扇区/圆环的轴对齐 envelope；不能直接使用节点的矩形 frame 代替。
3. `outer` 和 `coordinate.envelope` 都是上述极坐标几何的 envelope；它们不是普通矩形选择框旋转后的近似值。
4. `inner.marks` 是 marks 实际占据的扇区、圆环或点的包围盒；如果 renderer 没有更细的 mark geometry，使用同一个 envelope。
5. 角度单位统一为度，角度方向沿用现有 renderer 约定；不要在实例类型中混用弧度。

### 5.3 Composite

- Layer：根实例的 `coordinate` 通常是共享坐标空间；`memberInstanceIds` 指向各子实例，子实例保留各自 `inner.marks`。
- Concat：每个成员有自己的坐标空间；根实例的 `outer` 是成员外框的合并结果，根实例不应伪造一个不存在的共享 `plot`。
- Facet：每个 facet cell 是独立的 `composite-member` 或 `nested-child` 实例；`facetKey` 建议放入后续扩展的实例关系字段，而不是编码进 ID。
- Nested：子实例通过 `parentInstanceId` 和 `NestedSpec` 关联；子实例的 bounds 在同一 `space` 下解析后保存。

## 6. 与现有类型的映射

| 新类型字段 | 当前来源 |
| --- | --- |
| `id` | Canvas node/relationship chart 的稳定 ID |
| `nodeId` | 可选的 `CanvasNode.id` 编辑器链接；直接 renderer 不依赖它 |
| `spec.chart` | `CanvasNode.chartSpec` |
| `spec.composite.composition` | 从 `CanvasNode.compositionSpec` 或关系状态中的 `RelationshipComposition` 规范化得到，去除成员 node ID |
| `spec.composite.layer` | 从 `CanvasNode.layerSpec` 规范化得到，成员改由 instance ID 引用 |
| `spec.composite.nested` | 从 `CanvasNode.nestedSpec` 规范化得到，父 chart 改由 instance ID 引用 |
| `coordinateSystem` | `CanvasNode.coordinateGuide.type` 或 `CoordinateSystemSpec.type` |
| `bounds.outer` | `boundsFromNodeFrame` / `getNodeSelectionBounds` 的实例化结果 |
| Cartesian `plot` | `ChartSpec.plotArea` |
| Polar 几何 | `CoordinateGuide`、`ChartPolarArea`、`getPolarOccupiedGeometry` |
| `inner.marks` | renderer 输出的 mark/mark-group 几何；不能用 SVG 外框代替 |

关系状态中的 `ChartRelationshipRecord` 继续保存关系索引；`ChartInstance` 不应复制完整的关系图，也不应成为关系状态的替代品。

## 7. 生命周期与一致性

1. 创建或导入 chart 时生成实例，初始 `revision` 为 0。
2. encoding、组合关系、坐标系或尺寸变化导致几何重算时，生成新的不可变快照或递增 `revision`。
3. `ChartSpec` 和 composite config 是配置来源；`bounds` 是派生数据，不应反向修改 spec。
4. 删除 CanvasNode 时同步删除对应实例；复制 chart 时生成新的 `id` 和 `nodeId`，不能复用成员实例 ID。
5. 尚未渲染完成的实例应通过未来的 `status: "draft" | "ready" | "stale"` 标识；在该字段加入前，调用方不得把缺省 bounds 当作有效几何。

## 8. 暂不纳入第一版的内容

- 把每一个 SVG 元素都建模为 `ChartInstance`。
- 在实例中保存完整数据集或 materialized long rows；实例只引用 `datasetId`。
- 把坐标轴、图例、标题建成实例的子 chart；它们仍属于布局/关系组件。
- 用实例类型替代 `CanvasNode`、`ChartSpec` 或 `ChartRelationshipState`。
- 为 composite 重新发明一套与 `CompositionSpec` 不兼容的配置字段。

## 9. 待确认问题

1. `bounds.space` 第一版是否固定为 `canvas`，还是需要同时持久化 local bounds？
2. `inner.marks` 是否需要精确到每个 mark，还是只保留 mark group 包围盒？
3. Concat 根实例的 `coordinate` 是否允许使用联合类型（多个坐标空间），还是只在成员实例上记录坐标？
4. `CompositeChartConfig` 是否直接复用 `CompositionSpec`，还是需要从关系状态生成一个稳定的快照配置？
5. 是否在第一版加入 `status`、`computedAt` 和 renderer 版本，以处理渲染尚未完成或缓存失效的实例？

## 10. 推荐实现顺序

1. 在 `src/types.ts` 增加上述纯类型和 `ChartInstanceDocument`，先不改变现有 CanvasNode 数据结构。
2. 增加 document 校验器，拒绝悬空引用、重复 ID 和循环引用。
3. 增加一个纯函数，从现有 node/spec/guide 派生扁平 instance list。
4. 增加 document renderer：先渲染单图 Cartesian/Polar，再按 ID 遍历 Layer/Concat/Facet/Nested。
5. 为 bounds 计算增加独立测试，分别验证旋转后的 outer bounds、Polar 扇区 envelope、Cartesian plot/mark 边界以及嵌套实例的坐标空间一致性。
