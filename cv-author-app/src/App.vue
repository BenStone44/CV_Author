<script setup lang="ts">
import { ref } from "vue";
import { CanvasNodeView } from "./CanvasNodeView";
import { useCanvasStore, coordinateOptions, getFilterIconSvg } from "./useCanvasStore";

const canvasRef = ref<HTMLElement | null>(null);

const {
  selectedCoordinateSystem,
  selectedChartType,
  availableChartTypes,
  filteredCandidates,
  removeFailedPreview,
  canvasNodes,
  viewZoom,
  viewPan,
  selectedIds,
  contextMenu,
  draggedCandidateId,
  loadingDrop,
  importNotice,
  selectionBounds,
  marqueeBounds,
  selectionUnits,
  isPanning,
  canUndo,
  canRedo,
  canCopy,
  canDelete,
  canPaste,
  canGroup,
  canUngroup,
  canMoveSelectionForward,
  canMoveSelectionBackward,
  scaleHandles,
  onCanvasPointerDown,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasWheel,
  onCanvasContextMenu,
  onCanvasNodePointerDown,
  onCanvasNodeContextMenu,
  onScaleHandlePointerDown,
  onCandidateDragStart,
  onCandidateDragEnd,
  undoCanvasChange,
  redoCanvasChange,
  clearCanvas,
  deleteSelectedNodes,
  copySelectedNodes,
  pasteClipboardNodes,
  groupSelectedItems,
  ungroupSelectedItems,
  reorderSelectedNodes,
  alignSelection,
  resetCanvasZoom,
} = useCanvasStore(canvasRef);
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar__top">
        <div class="sidebar__filters">
          <div class="filter-group filter-group--coordinate">
            <p class="filter-group__title">Coordinate</p>
            <div class="filters filters--compact">
              <button
                v-for="option in coordinateOptions"
                :key="option.value"
                class="filter-chip"
                :class="{ 'filter-chip--active': option.value === selectedCoordinateSystem }"
                type="button"
                @click="selectedCoordinateSystem = option.value"
              >
                <span
                  v-if="option.icon !== 'all'"
                  class="filter-chip__icon"
                  aria-hidden="true"
                  v-html="getFilterIconSvg(option.icon)"
                ></span>
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="sidebar__browser">
          <div class="filter-group filter-group--types">
            <p class="filter-group__title">Chart Type</p>
            <div class="filters filters--scroll">
              <button
                v-for="chartType in availableChartTypes"
                :key="chartType"
                class="filter-chip filter-chip--text"
                :class="{ 'filter-chip--active': chartType === selectedChartType }"
                type="button"
                @click="selectedChartType = chartType"
              >
                {{ chartType }}
              </button>
            </div>
          </div>

          <div class="candidate-list">
            <article
              v-for="candidate in filteredCandidates"
              :key="candidate.id"
              class="candidate-card"
              :title="candidate.name"
              draggable="true"
              @dragstart="onCandidateDragStart(candidate, $event)"
              @dragend="onCandidateDragEnd"
            >
              <div class="candidate-card__preview">
                <img
                  :src="candidate.src"
                  :alt="candidate.name"
                  loading="lazy"
                  draggable="false"
                  @error="removeFailedPreview(candidate.id)"
                />
              </div>
            </article>
          </div>
        </div>
      </div>
    </aside>

    <main class="workspace">
      <section
        ref="canvasRef"
        class="canvas-board"
        :class="{
          'canvas-board--dragging': draggedCandidateId,
          'canvas-board--panning': isPanning,
        }"
        @dragover="onCanvasDragOver"
        @drop="onCanvasDrop"
        @contextmenu="onCanvasContextMenu"
      >
        <div class="toolbar toolbar--floating">
          <button class="ghost-button" type="button" title="Undo (Ctrl/Cmd+Z)" :disabled="!canUndo" @click="undoCanvasChange">Undo</button>
          <button class="ghost-button" type="button" title="Redo (Ctrl/Cmd+Shift+Z)" :disabled="!canRedo" @click="redoCanvasChange">Redo</button>
          <button class="ghost-button" type="button" :disabled="!canGroup" @click="groupSelectedItems">Group</button>
          <button class="ghost-button" type="button" :disabled="!canUngroup" @click="ungroupSelectedItems">Ungroup</button>
          <button class="ghost-button" type="button" :disabled="selectionUnits.length < 2" @click="alignSelection('left')">Left</button>
          <button class="ghost-button" type="button" :disabled="selectionUnits.length < 2" @click="alignSelection('center-x')">Center X</button>
          <button class="ghost-button" type="button" :disabled="selectionUnits.length < 2" @click="alignSelection('right')">Right</button>
          <button class="ghost-button" type="button" :disabled="selectionUnits.length < 2" @click="alignSelection('top')">Top</button>
          <button class="ghost-button" type="button" :disabled="selectionUnits.length < 2" @click="alignSelection('center-y')">Center Y</button>
          <button class="ghost-button" type="button" :disabled="selectionUnits.length < 2" @click="alignSelection('bottom')">Bottom</button>
          <button class="ghost-button" type="button" :disabled="canvasNodes.length === 0" @click="clearCanvas">Clear</button>
          <button class="ghost-button" type="button" title="Reset zoom" :disabled="viewZoom === 1 && viewPan.x === 0 && viewPan.y === 0" @click="resetCanvasZoom">Reset Zoom</button>
        </div>

        <div
          v-if="contextMenu"
          class="context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          @contextmenu.stop.prevent
        >
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canCopy" @click="copySelectedNodes">Copy</button>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canPaste" @click="contextMenu && pasteClipboardNodes(contextMenu.point)">Paste</button>
          <div class="context-menu__separator" role="separator"></div>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canGroup" @click="groupSelectedItems">Group</button>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canUngroup" @click="ungroupSelectedItems">Ungroup</button>
          <div class="context-menu__separator" role="separator"></div>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canMoveSelectionForward" @click="reorderSelectedNodes('front')">Bring to front</button>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canMoveSelectionForward" @click="reorderSelectedNodes('forward')">Move forward</button>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canMoveSelectionBackward" @click="reorderSelectedNodes('backward')">Move backward</button>
          <button class="context-menu__item" type="button" role="menuitem" :disabled="!canMoveSelectionBackward" @click="reorderSelectedNodes('back')">Send to back</button>
          <div class="context-menu__separator" role="separator"></div>
          <button class="context-menu__item context-menu__item--danger" type="button" role="menuitem" :disabled="!canDelete" @click="deleteSelectedNodes">Delete</button>
        </div>

        <div v-if="canvasNodes.length === 0 && !loadingDrop" class="empty-state">
          Drag a library SVG or a local .svg file here.
        </div>
        <div v-if="loadingDrop" class="loading-state">Loading SVG...</div>
        <div v-if="importNotice" class="import-notice">{{ importNotice }}</div>

        <svg class="canvas-scene" preserveAspectRatio="none" @pointerdown="onCanvasPointerDown" @wheel="onCanvasWheel">
          <g :transform="`translate(${viewPan.x} ${viewPan.y}) scale(${viewZoom})`">
            <CanvasNodeView
              v-for="node in canvasNodes"
              :key="node.id"
              :node="node"
              :selected="selectedIds.includes(node.id)"
              :interactive="true"
              :on-node-pointer-down="onCanvasNodePointerDown"
              :on-node-context-menu="onCanvasNodeContextMenu"
            />
            <g class="selection-overlay">
              <rect
                v-if="marqueeBounds"
                class="marquee-box"
                :x="marqueeBounds.minX"
                :y="marqueeBounds.minY"
                :width="marqueeBounds.width"
                :height="marqueeBounds.height"
                :vector-effect="'non-scaling-stroke'"
              />
              <g v-if="selectionBounds">
                <rect
                  class="selection-box"
                  :x="selectionBounds.minX"
                  :y="selectionBounds.minY"
                  :width="selectionBounds.width"
                  :height="selectionBounds.height"
                  :vector-effect="'non-scaling-stroke'"
                />
                <circle
                  v-for="handle in scaleHandles"
                  :key="handle.key"
                  class="selection-handle"
                  :cx="handle.x"
                  :cy="handle.y"
                  :r="6 / viewZoom"
                  :vector-effect="'non-scaling-stroke'"
                  @pointerdown="onScaleHandlePointerDown(handle.key, $event)"
                />
              </g>
            </g>
          </g>
        </svg>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,0.95), rgba(255,255,255,0.68)),
    linear-gradient(135deg, #edf7ff 0%, #eef3f8 48%, #dce8f7 100%);
}
.sidebar {
  --browser-panel-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid rgba(24,33,47,0.08);
  background: rgba(248,251,255,0.86);
  backdrop-filter: blur(12px);
}
.sidebar__top {
  display: grid;
  grid-template-columns: 132px minmax(200px, 28%) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}
.sidebar__filters { display: flex; min-width: 0; height: var(--browser-panel-height); }
.sidebar__browser {
  --candidate-card-width: 118px;
  --candidate-card-height: 92px;
  --candidate-gap: 10px;
  --candidate-preview-width: 104px;
  --candidate-preview-height: 68px;
  --candidate-image-width: 176px;
  grid-column: 2 / 4;
  display: grid;
  grid-template-columns: minmax(244px, 32%) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow: hidden;
}
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters--compact { display: grid; grid-template-columns: 1fr; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.filter-group--types { min-width: 0; height: var(--browser-panel-height); max-height: var(--browser-panel-height); min-height: 0; overflow: hidden; }
.filter-group--coordinate .filter-chip,
.filter-group--types .filter-chip { gap: 6px; min-height: 30px; padding: 5px 10px; font-size: 13px; }
.filter-group--coordinate .filter-chip__icon { width: 14px; height: 14px; flex: 0 0 14px; }
.filter-group--coordinate .filter-chip__icon :deep(svg) { width: 14px; height: 14px; }
.filter-group__title { margin: 0; color: #516176; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(24,33,47,0.08);
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font: inherit;
  cursor: pointer;
  justify-content: flex-start;
  transition: transform 160ms ease, background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}
.filter-chip:hover { transform: translateY(-1px); }
.filter-chip--active { border-color: transparent; background: linear-gradient(135deg, #1c7ed6, #1554b2); color: #fff; }
.filter-chip__icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: 0 0 16px; }
.filter-chip__icon :deep(svg) { width: 16px; height: 16px; display: block; }
.filter-chip--text { gap: 0; }
.filters--scroll {
  display: flex; flex-wrap: wrap; flex: 1 1 auto; align-content: start;
  width: 100%; min-height: 0; height: auto; box-sizing: border-box;
  overflow-x: hidden; overflow-y: auto; padding-right: 4px;
}
.filter-group--types .filter-chip--text { width: auto; max-width: 100%; justify-content: flex-start; }
.candidate-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--candidate-card-width));
  grid-auto-rows: var(--candidate-card-height);
  gap: var(--candidate-gap);
  justify-content: start; align-content: start; box-sizing: border-box;
  height: var(--browser-panel-height); max-height: var(--browser-panel-height); min-height: 0;
  overflow-x: hidden; overflow-y: auto; padding-right: 4px;
}
.candidate-card {
  display: flex; align-items: center; justify-content: center;
  height: var(--candidate-card-height); padding: 6px; min-width: 0; min-height: 0;
  border: 1px solid rgba(24,33,47,0.08); border-radius: 14px;
  background: rgba(255,255,255,0.9); cursor: grab;
  box-shadow: 0 6px 18px rgba(45,89,126,0.07);
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}
.candidate-card:hover { transform: translateY(-2px); border-color: rgba(28,126,214,0.3); box-shadow: 0 10px 24px rgba(45,89,126,0.1); }
.candidate-card:active { cursor: grabbing; }
.candidate-card__preview {
  display: flex; align-items: center; justify-content: center;
  width: var(--candidate-preview-width); height: var(--candidate-preview-height);
  min-height: 0; overflow: hidden; padding: 0; border-radius: 10px;
  background: linear-gradient(135deg, rgba(223,237,252,0.9), rgba(255,255,255,0.92));
}
.candidate-card__preview img { width: var(--candidate-image-width); max-width: none; height: auto; flex: 0 0 auto; pointer-events: none; }
.workspace { display: flex; flex-direction: column; flex: 1; min-width: 0; padding: 24px; }
.toolbar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.toolbar--floating {
  position: absolute; top: 16px; right: 16px;
  width: min(232px, calc(100% - 32px)); z-index: 3;
  padding: 10px 12px; border: 1px solid rgba(24,33,47,0.08); border-radius: 18px;
  background: rgba(255,255,255,0.82); backdrop-filter: blur(12px);
  box-shadow: 0 14px 32px rgba(45,89,126,0.12);
}
.ghost-button {
  width: 100%; min-width: 0; padding: 10px 14px;
  border: 1px solid rgba(24,33,47,0.1); border-radius: 12px;
  background: rgba(255,255,255,0.8); color: #223041; font: inherit;
  white-space: nowrap; cursor: pointer;
}
.ghost-button:disabled { opacity: 0.45; cursor: not-allowed; }
.context-menu {
  position: absolute; z-index: 6; display: grid; width: 196px; padding: 6px;
  border: 1px solid rgba(24,33,47,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.98); box-shadow: 0 18px 40px rgba(45,89,126,0.2);
}
.context-menu__item {
  min-height: 36px; padding: 8px 10px; border: 0; border-radius: 6px;
  background: transparent; color: #223041; font: inherit; text-align: left; cursor: pointer;
}
.context-menu__item:hover:not(:disabled) { background: #edf5fc; }
.context-menu__item--danger { color: #c43d3d; }
.context-menu__item--danger:hover:not(:disabled) { background: #fff0f0; }
.context-menu__item:disabled { color: #9aa6b5; cursor: not-allowed; }
.context-menu__separator { height: 1px; margin: 5px 6px; background: rgba(24,33,47,0.1); }
.canvas-board {
  position: relative; flex: 1; min-height: 680px; overflow: hidden;
  border: 1px solid rgba(24,33,47,0.08); border-radius: 28px;
  background:
    linear-gradient(rgba(28,126,214,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28,126,214,0.06) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
  background-size: 24px 24px, 24px 24px, 100% 100%;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.7);
}
.canvas-board--dragging { outline: 2px dashed rgba(28,126,214,0.48); outline-offset: -10px; }
.canvas-board--panning { cursor: grabbing; }
.canvas-board--panning .canvas-scene { cursor: grabbing; }
.empty-state,
.loading-state {
  position: absolute; inset: 30% auto auto 50%; padding: 18px 20px;
  border-radius: 16px; background: rgba(255,255,255,0.9); color: #5b6a80;
  transform: translate(-50%, -50%); box-shadow: 0 18px 40px rgba(45,89,126,0.12); z-index: 1;
}
.import-notice {
  position: absolute; right: 20px; bottom: 20px;
  max-width: min(420px, calc(100% - 40px)); padding: 12px 14px;
  border: 1px solid rgba(24,33,47,0.08); border-radius: 14px;
  background: rgba(255,255,255,0.94); color: #304255;
  box-shadow: 0 14px 32px rgba(45,89,126,0.14); z-index: 2;
}
.canvas-scene { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.canvas-object { cursor: move; user-select: none; touch-action: none; }
.canvas-object :deep(*) { pointer-events: none; }
.canvas-object--selected { filter: drop-shadow(0 10px 18px rgba(28,126,214,0.18)); }
.selection-overlay { pointer-events: none; overflow: visible; }
.selection-box { fill: rgba(28,126,214,0.06); stroke: #1c7ed6; stroke-width: 1.5; stroke-dasharray: 6 4; }
.marquee-box { fill: rgba(28,126,214,0.12); stroke: #1c7ed6; stroke-width: 1.2; stroke-dasharray: 4 4; }
.selection-handle { fill: #fff; stroke: #1c7ed6; stroke-width: 2; pointer-events: all; cursor: nwse-resize; }
@media (max-width: 1320px) {
  .sidebar__top { grid-template-columns: 132px minmax(200px, 30%) minmax(0, 1fr); }
  .sidebar__browser { grid-template-columns: minmax(190px, 32%) minmax(0, 1fr); }
}
@media (max-width: 960px) {
  .sidebar { padding: 16px; }
  .sidebar__top { grid-template-columns: 1fr; }
  .sidebar__browser { grid-column: auto; grid-template-columns: 1fr; }
  .candidate-card { min-height: 88px; }
  .canvas-board { min-height: 520px; }
  .toolbar--floating { right: 12px; top: 12px; width: min(220px, calc(100% - 24px)); }
}
</style>
