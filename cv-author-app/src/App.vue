<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X } from "@lucide/vue";
import { CanvasCoordinateGuideView, CanvasNodeView } from "./CanvasNodeView";
import CsvDataPanel from "./CsvDataPanel.vue";
import type {
  CanvasNode,
  CompositionType,
  EncodingChannel,
  SvgCandidate,
} from "./types";
import {
  useCanvasStore,
  coordinateOptions,
  compositionOptions,
  getFilterIconSvg,
} from "./useCanvasStore";

const canvasRef = ref<HTMLElement | null>(null);

const {
  selectedCoordinateSystems,
  toggleCoordinateSystem,
  selectedChartType,
  availableChartTypes,
  filteredCandidates,
  compositionCandidates,
  canvasNodes,
  viewZoom,
  viewPan,
  selectedIds,
  semanticSelection,
  axisBindingTarget,
  axisBindingNode,
  axisBindingColumns,
  axisBindingValue,
  axisBindingSeriesCandidates,
  axisBindingSeriesValue,
  axisBindingRendererError,
  contextMenu,
  draggedCandidateId,
  loadingDrop,
  importNotice,
  selectionBounds,
  selectionFrame,
  selectionRotation,
  rotationInputVisible,
  marqueeBounds,
  selectionUnits,
  isPanning,
  canUndo,
  canRedo,
  canCopy,
  canDelete,
  canPaste,
  canGroup,
  canCompose,
  canFacet,
  canUngroup,
  canMoveSelectionForward,
  canMoveSelectionBackward,
  scaleHandles,
  rotateHandle,
  onCanvasPointerDown,
  onCanvasDragOver,
  onCanvasDrop,
  onCanvasWheel,
  onCanvasContextMenu,
  onCanvasNodePointerDown,
  onSemanticMarkPointerDown,
  onCanvasNodeContextMenu,
  onScaleHandlePointerDown,
  onRotateHandlePointerDown,
  onCoordinateOriginPointerDown,
  onCoordinateAxisSelect,
  bindAxisField,
  clearAxisBinding,
  confirmSeriesField,
  clearSeriesBinding,
  closeAxisBinding,
  setSelectionRotation,
  onCandidateDragStart,
  onCandidateDragEnd,
  insertCompositionCandidate,
  undoCanvasChange,
  redoCanvasChange,
  clearCanvas,
  deleteSelectedNodes,
  reverseCoordinateAxis,
  copySelectedNodes,
  pasteClipboardNodes,
  groupSelectedItems,
  ungroupSelectedItems,
  dissolveSelectedGroups,
  createCompositionCandidate,
  reorderSelectedNodes,
  alignSelection,
  resetCanvasZoom,
} = useCanvasStore(canvasRef);

const activeCompositionType = ref<CompositionType | null>(null);
const seriesDraftField = ref("");
const activeCompositionOption = computed(() =>
  compositionOptions.find(
    (option) => option.value === activeCompositionType.value,
  ),
);
const activeCompositionCandidates = computed(() =>
  compositionCandidates.value.filter(
    (candidate) => candidate.compositionType === activeCompositionType.value,
  ),
);
const selectedCanvasNodesWithCoordinateGuides = computed(() =>
  canvasNodes.value.filter((node) =>
    selectedIds.value.includes(node.id)
    && !!node.coordinateGuide,
  ),
);
watch(
  [axisBindingTarget, axisBindingSeriesValue, axisBindingSeriesCandidates],
  ([target, confirmedField, candidates]) => {
    if (!target) {
      seriesDraftField.value = "";
      return;
    }
    const available = candidates.some((candidate) => candidate.field === seriesDraftField.value);
    if (confirmedField && candidates.some((candidate) => candidate.field === confirmedField)) {
      seriesDraftField.value = confirmedField;
    } else if (!available) {
      seriesDraftField.value = candidates[0]?.field ?? "";
    }
  },
  { immediate: true },
);

function openCompositionCandidates(type: CompositionType) {
  closeAxisBinding();
  createCompositionCandidate(type);
  activeCompositionType.value = type === "nested" ? null : type;
}

function closeCompositionCandidates() {
  activeCompositionType.value = null;
}

async function selectCompositionCandidate(candidate: SvgCandidate) {
  if (candidate.unavailable) return;
  await insertCompositionCandidate(candidate);
  closeCompositionCandidates();
}

function onCompositionKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeCompositionCandidates();
    closeAxisBinding();
  }
}

function onAxisFieldChange(event: Event) {
  const field = (event.target as HTMLSelectElement).value;
  if (field) bindAxisField(field);
  else if (axisBindingValue.value) clearAxisBinding();
  else closeAxisBinding();
}

function onSeriesFieldChange(event: Event) {
  seriesDraftField.value = (event.target as HTMLSelectElement).value;
}

function confirmSeriesDraft() {
  if (seriesDraftField.value) confirmSeriesField(seriesDraftField.value);
}

function openAxisBinding(node: CanvasNode, channel: EncodingChannel) {
  closeCompositionCandidates();
  onCoordinateAxisSelect(node, channel);
}

onMounted(() => {
  window.addEventListener("keydown", onCompositionKeyDown);
  window.addEventListener("click", closeCompositionCandidates);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onCompositionKeyDown);
  window.removeEventListener("click", closeCompositionCandidates);
});
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
                :class="{
                  'filter-chip--active': selectedCoordinateSystems.has(
                    option.value,
                  ),
                }"
                type="button"
                @click="toggleCoordinateSystem(option.value)"
              >
                <span
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
                :class="{
                  'filter-chip--active': chartType === selectedChartType,
                }"
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
              :class="{ 'candidate-card--generated': candidate.compositionType }"
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
                />
                <span
                  v-if="candidate.compositionType"
                  class="candidate-card__badge"
                >
                  {{ candidate.compositionType }}
                </span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </aside>

    <div class="workbench">
      <CsvDataPanel />
      <main class="workspace">
      <section
        ref="canvasRef"
        class="canvas-board"
        :style="{
          backgroundPosition: `${viewPan.x}px ${viewPan.y}px, ${viewPan.x}px ${viewPan.y}px, 0 0`,
          backgroundSize: `${24 * viewZoom}px ${24 * viewZoom}px, ${24 * viewZoom}px ${24 * viewZoom}px, 100% 100%`,
        }"
        :class="{
          'canvas-board--dragging': draggedCandidateId,
          'canvas-board--panning': isPanning,
        }"
        @dragover="onCanvasDragOver"
        @drop="onCanvasDrop"
        @contextmenu="onCanvasContextMenu"
      >
        <div class="toolbar toolbar--floating">
          <div class="icon-tools" role="group" aria-label="History">
            <button
              class="icon-button"
              type="button"
              title="Undo (Ctrl/Cmd+Z)"
              aria-label="Undo"
              :disabled="!canUndo"
              @click="undoCanvasChange"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              aria-label="Redo"
              :disabled="!canRedo"
              @click="redoCanvasChange"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="15 14 20 9 15 4" />
                <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Delete"
              aria-label="Delete"
              :disabled="!canDelete"
              @click="deleteSelectedNodes"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Clear canvas"
              aria-label="Clear canvas"
              :disabled="canvasNodes.length === 0"
              @click="clearCanvas"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 4L9 10" />
                <path d="M9 10L3 19" />
                <path d="M9 10L14 15" />
                <path d="M3 19L14 15" />
                <line x1="5" y1="18" x2="6" y2="21" />
                <line x1="8" y1="17" x2="9" y2="20" />
                <line x1="11" y1="16" x2="12" y2="19" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Reset zoom"
              aria-label="Reset zoom"
              :disabled="viewZoom === 1 && viewPan.x === 0 && viewPan.y === 0"
              @click="resetCanvasZoom"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              </svg>
            </button>
          </div>
          <div class="group-tools" role="group" aria-label="Grouping">
            <button
              class="ghost-button"
              type="button"
              :disabled="!canGroup"
              @click="groupSelectedItems"
            >
              Group
            </button>
            <button
              class="ghost-button"
              type="button"
              :disabled="!canUngroup"
              @click="ungroupSelectedItems"
            >
              Ungroup
            </button>
            <button
              class="ghost-button"
              type="button"
              title="Dissolve all nested groups"
              :disabled="!canUngroup"
              @click="dissolveSelectedGroups"
            >
              Dissolve
            </button>
          </div>
          <div class="composition-tools" role="group" aria-label="Composition">
            <button
              v-for="option in compositionOptions"
              :key="option.value"
              class="ghost-button composition-button"
              type="button"
              :title="option.description"
              :disabled="option.value === 'facet' ? !canFacet : !canCompose"
              @click.stop="openCompositionCandidates(option.value)"
            >
              <svg
                v-if="option.value === 'layer'"
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <rect x="2.5" y="5.5" width="9" height="9" rx="1" />
                <rect x="6.5" y="2.5" width="9" height="9" rx="1" />
              </svg>
              <svg
                v-else-if="option.value === 'facet'"
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <rect x="2.5" y="2.5" width="5" height="5" rx="0.75" />
                <rect x="10.5" y="2.5" width="5" height="5" rx="0.75" />
                <rect x="2.5" y="10.5" width="5" height="5" rx="0.75" />
                <rect x="10.5" y="10.5" width="5" height="5" rx="0.75" />
              </svg>
              <svg
                v-else-if="option.value === 'concat'"
                viewBox="0 0 18 18"
                aria-hidden="true"
              >
                <rect x="2.5" y="3" width="5" height="12" rx="1" />
                <rect x="10.5" y="3" width="5" height="12" rx="1" />
                <path d="M8.5 9h1" />
              </svg>
              <svg v-else viewBox="0 0 18 18" aria-hidden="true">
                <rect x="2.5" y="2.5" width="13" height="13" rx="1" />
                <rect x="6" y="6" width="6" height="6" rx="0.75" />
              </svg>
              <span>{{ option.label }}</span>
            </button>
          </div>
          <div class="alignment-tools" role="group" aria-label="Alignment">
            <button
              class="icon-button"
              type="button"
              title="Align left"
              aria-label="Align left"
              :disabled="selectionUnits.length < 2"
              @click="alignSelection('left')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 2.5v11M6 4.5h7M6 8h5M6 11.5h7" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Align center horizontally"
              aria-label="Align center horizontally"
              :disabled="selectionUnits.length < 2"
              @click="alignSelection('center-x')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2.5v11M4 4.5h8M5.5 8h5M4 11.5h8" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Align right"
              aria-label="Align right"
              :disabled="selectionUnits.length < 2"
              @click="alignSelection('right')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13 2.5v11M3 4.5h7M5 8h5M3 11.5h7" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Align top"
              aria-label="Align top"
              :disabled="selectionUnits.length < 2"
              @click="alignSelection('top')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 3h11M4.5 6v7M8 6v5M11.5 6v7" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Align center vertically"
              aria-label="Align center vertically"
              :disabled="selectionUnits.length < 2"
              @click="alignSelection('center-y')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 8h11M4.5 4v8M8 5.5v5M11.5 4v8" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              title="Align bottom"
              aria-label="Align bottom"
              :disabled="selectionUnits.length < 2"
              @click="alignSelection('bottom')"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 13h11M4.5 3v7M8 5v5M11.5 3v7" />
              </svg>
            </button>
          </div>
        </div>

        <aside
          v-if="axisBindingTarget"
          class="encoding-inspector"
          role="dialog"
          aria-modal="false"
          :aria-label="`${axisBindingTarget.channel.toUpperCase()} axis encoding`"
          @click.stop
          @pointerdown.stop
        >
          <header class="encoding-inspector__header">
            <div class="encoding-inspector__heading">
              <strong>{{ axisBindingTarget.channel.toUpperCase() }} AXIS</strong>
              <span>{{ axisBindingNode?.chartSpec?.chartType ?? axisBindingNode?.name }}</span>
            </div>
            <button
              class="encoding-inspector__close"
              type="button"
              title="Close"
              aria-label="Close axis binding"
              @click="closeAxisBinding"
            >
              <X :size="16" :stroke-width="1.6" aria-hidden="true" />
            </button>
          </header>

          <label v-if="axisBindingColumns.length" class="encoding-inspector__field">
            <span>Column</span>
            <select :value="axisBindingValue" @change="onAxisFieldChange">
              <option value="">
                {{ axisBindingValue ? "Clear binding" : "Select column" }}
              </option>
              <option
                v-for="column in axisBindingColumns"
                :key="column.name"
                :value="column.name"
              >
                {{ column.name }} ({{ column.type }})
              </option>
            </select>
          </label>
          <p v-else class="encoding-inspector__empty">
            Import a CSV to bind this axis.
          </p>

          <section
            v-if="axisBindingNode?.chartSpec?.encodings.x && axisBindingNode?.chartSpec?.encodings.y"
            class="encoding-inspector__series"
          >
            <div class="encoding-inspector__series-heading">
              <span>Series</span>
              <span v-if="axisBindingSeriesCandidates[0]" class="encoding-inspector__suggestion">
                Suggested
              </span>
            </div>
            <select
              v-if="axisBindingSeriesCandidates.length"
              :value="seriesDraftField"
              @change="onSeriesFieldChange"
            >
              <option
                v-for="candidate in axisBindingSeriesCandidates"
                :key="candidate.field"
                :value="candidate.field"
              >
                {{ candidate.field }} ({{ candidate.groupCount }} groups)
              </option>
            </select>
            <p v-else class="encoding-inspector__empty">
              No nominal series field is available.
            </p>
            <p v-if="axisBindingRendererError" class="encoding-inspector__error">
              {{ axisBindingRendererError }}
            </p>
            <div v-if="axisBindingSeriesCandidates.length" class="encoding-inspector__actions">
              <button
                v-if="axisBindingSeriesValue"
                class="encoding-inspector__secondary"
                type="button"
                @click="clearSeriesBinding"
              >
                Clear
              </button>
              <button
                class="encoding-inspector__confirm"
                type="button"
                :disabled="!seriesDraftField"
                @click="confirmSeriesDraft"
              >
                Confirm series
              </button>
            </div>
          </section>
        </aside>

        <aside
          v-if="activeCompositionType"
          class="composition-popover"
          role="dialog"
          aria-modal="false"
          :aria-label="`${activeCompositionOption?.label ?? ''} candidates`"
          @click.stop
        >
          <header class="composition-popover__header">
            <div>
              <strong>{{ activeCompositionOption?.label }}</strong>
              <span> candidates</span>
            </div>
            <button
              class="composition-popover__close"
              type="button"
              title="Close"
              aria-label="Close candidate list"
              @click="closeCompositionCandidates"
            >
              <svg viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          </header>
          <div class="composition-candidate-list">
            <article
              v-for="candidate in activeCompositionCandidates"
              :key="candidate.id"
              class="composition-candidate"
              :class="{
                'composition-candidate--unavailable': candidate.unavailable,
              }"
              :title="candidate.name"
              :draggable="!candidate.unavailable"
              role="button"
              :tabindex="candidate.unavailable ? -1 : 0"
              :aria-disabled="candidate.unavailable || undefined"
              @click="selectCompositionCandidate(candidate)"
              @keydown.enter.prevent="selectCompositionCandidate(candidate)"
              @keydown.space.prevent="selectCompositionCandidate(candidate)"
              @dragstart="onCandidateDragStart(candidate, $event)"
              @dragend="onCandidateDragEnd"
            >
              <div class="composition-candidate__preview">
                <img
                  :src="candidate.src"
                  :alt="candidate.name"
                  draggable="false"
                />
              </div>
              <span class="composition-candidate__name">{{ candidate.name }}</span>
              <span
                v-if="candidate.unavailable"
                class="composition-candidate__status"
              >
                Pending
              </span>
            </article>
          </div>
        </aside>
        <aside v-if="semanticSelection" class="semantic-inspector" data-testid="semantic-inspector">
          <strong>Selected {{ semanticSelection.role }}</strong>
          <span v-if="semanticSelection.person">{{ semanticSelection.person }}</span>
          <span v-if="semanticSelection.time">{{ semanticSelection.time }}</span>
        </aside>

        <div
          v-if="contextMenu"
          class="context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          @contextmenu.stop.prevent
        >
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canCopy"
            @click="copySelectedNodes"
          >
            Copy
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canPaste"
            @click="contextMenu && pasteClipboardNodes(contextMenu.point)"
          >
            Paste
          </button>
          <div class="context-menu__separator" role="separator"></div>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canGroup"
            @click="groupSelectedItems"
          >
            Group
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canUngroup"
            @click="ungroupSelectedItems"
          >
            Ungroup
          </button>
          <div class="context-menu__separator" role="separator"></div>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canMoveSelectionForward"
            @click="reorderSelectedNodes('front')"
          >
            Bring to front
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canMoveSelectionForward"
            @click="reorderSelectedNodes('forward')"
          >
            Move forward
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canMoveSelectionBackward"
            @click="reorderSelectedNodes('backward')"
          >
            Move backward
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="!canMoveSelectionBackward"
            @click="reorderSelectedNodes('back')"
          >
            Send to back
          </button>
          <div class="context-menu__separator" role="separator"></div>
          <button
            class="context-menu__item context-menu__item--danger"
            type="button"
            role="menuitem"
            :disabled="!canDelete"
            @click="deleteSelectedNodes"
          >
            Delete
          </button>
        </div>

        <div
          v-if="canvasNodes.length === 0 && !loadingDrop"
          class="empty-state"
        >
          Drag a library SVG or a local .svg file here.
        </div>
        <div v-if="loadingDrop" class="loading-state">Loading SVG...</div>
        <div v-if="importNotice" class="import-notice">{{ importNotice }}</div>

        <svg
          class="canvas-scene"
          preserveAspectRatio="none"
          @pointerdown="onCanvasPointerDown"
          @wheel="onCanvasWheel"
        >
          <g
            :transform="`translate(${viewPan.x} ${viewPan.y}) scale(${viewZoom})`"
          >
            <CanvasNodeView
              v-for="node in canvasNodes"
              :key="node.id"
              :node="node"
              :selected="selectedIds.includes(node.id)"
              :interactive="true"
              :on-node-pointer-down="onCanvasNodePointerDown"
              :on-node-context-menu="onCanvasNodeContextMenu"
              :on-mark-pointer-down="onSemanticMarkPointerDown"
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
              <g v-if="selectionFrame && rotateHandle">
                <rect
                  class="selection-box"
                  :x="selectionFrame.x"
                  :y="selectionFrame.y"
                  :width="selectionFrame.width"
                  :height="selectionFrame.height"
                  :transform="`rotate(${selectionFrame.rotation} ${selectionFrame.x + selectionFrame.width / 2} ${selectionFrame.y + selectionFrame.height / 2})`"
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
                <line
                  class="rotate-stem"
                  :x1="rotateHandle.stemX"
                  :y1="rotateHandle.stemY"
                  :x2="rotateHandle.x"
                  :y2="rotateHandle.y"
                />
                <circle
                  class="rotate-handle"
                  :cx="rotateHandle.x"
                  :cy="rotateHandle.y"
                  :r="6 / viewZoom"
                  :vector-effect="'non-scaling-stroke'"
                  title="Rotate"
                  @pointerdown="onRotateHandlePointerDown"
                />
              </g>
            </g>
            <CanvasCoordinateGuideView
              v-for="node in selectedCanvasNodesWithCoordinateGuides"
              :key="`coordinate-guide-${node.id}`"
              :node="node"
              :view-zoom="viewZoom"
              :on-origin-pointer-down="onCoordinateOriginPointerDown"
              :on-axis-reverse="reverseCoordinateAxis"
              :on-axis-select="openAxisBinding"
            />
          </g>
        </svg>
        <label
          v-if="selectionBounds && rotationInputVisible && rotateHandle"
          class="rotation-input"
          :style="{
            left: `${viewPan.x + rotateHandle.x * viewZoom}px`,
            top: `${viewPan.y + rotateHandle.y * viewZoom}px`,
          }"
        >
          <span>Angle</span>
          <input
            type="number"
            step="1"
            :value="Math.round(selectionRotation)"
            @change="
              setSelectionRotation(
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
          <span>°</span>
        </label>
      </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(
      circle at top left,
      rgba(255, 255, 255, 0.95),
      rgba(255, 255, 255, 0.68)
    ),
    linear-gradient(135deg, #edf7ff 0%, #eef3f8 48%, #dce8f7 100%);
}
.sidebar {
  --browser-panel-height: 170px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px 4px;
  border-bottom: 1px solid rgba(24, 33, 47, 0.08);
  background: rgba(248, 251, 255, 0.86);
  backdrop-filter: blur(12px);
}
.sidebar__top {
  display: grid;
  grid-template-columns: 132px minmax(200px, 28%) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}
.sidebar__filters {
  display: flex;
  min-width: 0;
  height: var(--browser-panel-height);
}
.sidebar__browser {
  --candidate-card-width: 118px;
  --candidate-card-height: 80px;
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
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filters--compact {
  display: grid;
  grid-template-columns: 1fr;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.filter-group--types {
  min-width: 0;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow: hidden;
}
.filter-group--coordinate .filter-chip,
.filter-group--types .filter-chip {
  gap: 6px;
  min-height: 30px;
  padding: 5px 10px;
  font-size: 13px;
}
.filter-group--coordinate .filter-chip__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}
.filter-group--coordinate .filter-chip__icon :deep(svg) {
  width: 14px;
  height: 14px;
}
.filter-group__title {
  margin: 0;
  color: #516176;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font: inherit;
  cursor: pointer;
  justify-content: flex-start;
  transition:
    box-shadow 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}
.filter-chip:hover {
  box-shadow: 0 0 0 3px rgba(28, 126, 214, 0.1);
}
.filter-chip--active {
  border-color: transparent;
  background: linear-gradient(135deg, #1c7ed6, #1554b2);
  color: #fff;
}
.filter-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.filter-chip__icon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}
.filter-chip--text {
  gap: 0;
}
.filters--scroll {
  display: flex;
  flex-wrap: wrap;
  flex: 1 1 auto;
  align-content: start;
  width: 100%;
  min-height: 0;
  height: auto;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 4px;
}
.filter-group--types .filter-chip--text {
  width: auto;
  max-width: 100%;
  justify-content: flex-start;
}
.candidate-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--candidate-card-width));
  grid-auto-rows: var(--candidate-card-height);
  gap: var(--candidate-gap);
  justify-content: start;
  align-content: start;
  box-sizing: border-box;
  height: var(--browser-panel-height);
  max-height: var(--browser-panel-height);
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 4px;
}
.candidate-card {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--candidate-card-height);
  padding: 1px;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  cursor: grab;
  box-shadow: 0 6px 18px rgba(45, 89, 126, 0.07);
  transition:
    box-shadow 160ms ease,
    border-color 160ms ease;
}
.candidate-card:hover {
  border-color: rgba(28, 126, 214, 0.3);
  box-shadow: 0 0 0 3px rgba(28, 126, 214, 0.1);
}
.candidate-card:active {
  cursor: grabbing;
}
.candidate-card__preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--candidate-preview-width);
  height: var(--candidate-preview-height);
  min-height: 0;
  overflow: hidden;
  padding: 0;
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    rgba(223, 237, 252, 0.9),
    rgba(255, 255, 255, 0.92)
  );
}
.candidate-card__preview img {
  width: var(--candidate-image-width);
  max-width: none;
  height: auto;
  flex: 0 0 auto;
  pointer-events: none;
}
.candidate-card--generated .candidate-card__preview img {
  width: 100%;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
}
.candidate-card__badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(21, 84, 178, 0.88);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-transform: uppercase;
  pointer-events: none;
}
.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 10px;
}
.workbench {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.icon-tools,
.alignment-tools {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  padding: 2px 0;
}
.group-tools {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.composition-tools {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.composition-tools .composition-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  min-height: 34px;
  padding: 7px 9px;
  border-radius: 7px;
  font-size: 13px;
}
.composition-button svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.composition-button:hover:not(:disabled) {
  border-color: rgba(28, 126, 214, 0.35);
  background: #edf5fc;
  color: #1554b2;
}
.group-tools .ghost-button {
  padding: 10px 6px;
  font-size: 13px;
}
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  padding: 0;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.8);
  color: #223041;
  cursor: pointer;
}
.icon-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.icon-button:hover:not(:disabled) {
  border-color: rgba(28, 126, 214, 0.35);
  background: #edf5fc;
  color: #1554b2;
}
.icon-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.toolbar--floating {
  position: absolute;
  top: 16px;
  right: 16px;
  width: min(232px, calc(100% - 32px));
  z-index: 3;
  padding: 10px 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 32px rgba(45, 89, 126, 0.12);
}
.ghost-button {
  width: 100%;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  color: #223041;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.toolbar--floating .ghost-button {
  box-sizing: border-box;
}
.ghost-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.composition-popover {
  position: absolute;
  top: 16px;
  right: 264px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100% - 296px));
  max-height: min(440px, calc(100% - 32px));
  min-width: 260px;
  padding: 12px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.2);
  backdrop-filter: blur(12px);
}
.encoding-inspector {
  position: absolute;
  top: 16px;
  right: 264px;
  z-index: 5;
  width: min(280px, calc(100% - 296px));
  min-width: 220px;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.2);
  backdrop-filter: blur(12px);
}
.semantic-inspector {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 5;
  display: grid;
  gap: 4px;
  min-width: 150px;
  padding: 10px 12px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  color: #516176;
  font-size: 11px;
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.16);
}
.semantic-inspector strong { color: #18212f; font-size: 12px; }
.encoding-inspector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.encoding-inspector__heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.encoding-inspector__heading strong {
  color: #18212f;
  font-size: 12px;
  letter-spacing: 0.08em;
}
.encoding-inspector__heading span {
  overflow: hidden;
  color: #6b7889;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.encoding-inspector__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5b6a80;
  cursor: pointer;
}
.encoding-inspector__close:hover {
  background: #edf5fc;
  color: #1554b2;
}
.encoding-inspector__field {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  color: #516176;
  font-size: 11px;
}
.encoding-inspector__field select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font: inherit;
  cursor: pointer;
}
.encoding-inspector__field select:focus {
  border-color: rgba(28, 126, 214, 0.7);
  outline: 2px solid rgba(28, 126, 214, 0.12);
}
.encoding-inspector__series {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(24, 33, 47, 0.1);
}
.encoding-inspector__series-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #516176;
  font-size: 11px;
}
.encoding-inspector__suggestion {
  color: #1554b2;
  font-weight: 700;
}
.encoding-inspector__series select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 6px;
  background: #fff;
  color: #223041;
  font: inherit;
}
.encoding-inspector__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.encoding-inspector__actions button {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.encoding-inspector__secondary {
  border: 1px solid rgba(24, 33, 47, 0.14);
  background: #fff;
  color: #516176;
}
.encoding-inspector__confirm {
  border: 1px solid #1554b2;
  background: #1554b2;
  color: #fff;
  font-weight: 700;
}
.encoding-inspector__confirm:disabled {
  cursor: default;
  opacity: 0.45;
}
.encoding-inspector__error {
  margin: 0;
  color: #b42318;
  font-size: 11px;
  line-height: 1.4;
}
.canvas-scene :deep(.axis-domain[data-bound="true"]) {
  stroke: #1c7ed6;
  stroke-width: 2.2;
}
.canvas-scene :deep(.axis-label[data-bound="true"]) {
  fill: #1554b2;
  font-weight: 700;
}
.encoding-inspector__empty {
  margin: 12px 0 0;
  color: #6b7889;
  font-size: 12px;
  line-height: 1.45;
}
.composition-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  color: #304255;
  font-size: 13px;
}
.composition-popover__header strong {
  color: #18212f;
  font-size: 14px;
}
.composition-popover__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5b6a80;
  cursor: pointer;
}
.composition-popover__close:hover {
  background: #edf5fc;
  color: #1554b2;
}
.composition-popover__close svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.composition-candidate-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-height: 0;
  margin-top: 8px;
  overflow-y: auto;
}
.composition-candidate {
  position: relative;
  display: grid;
  grid-template-rows: 94px 20px;
  gap: 6px;
  min-width: 0;
  padding: 7px;
  border: 1px solid rgba(24, 33, 47, 0.09);
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}
.composition-candidate:hover {
  border-color: rgba(28, 126, 214, 0.34);
  box-shadow: 0 0 0 3px rgba(28, 126, 214, 0.1);
}
.composition-candidate:active {
  cursor: grabbing;
}
.composition-candidate--unavailable {
  opacity: 0.58;
  cursor: not-allowed;
}
.composition-candidate--unavailable:hover {
  border-color: rgba(24, 33, 47, 0.09);
  box-shadow: none;
}
.composition-candidate__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  border-radius: 6px;
  background: #eef4f8;
}
.composition-candidate__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.composition-candidate__name {
  overflow: hidden;
  color: #516176;
  font-size: 11px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.composition-candidate__status {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(24, 33, 47, 0.78);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.3;
  text-transform: uppercase;
  pointer-events: none;
}
.context-menu {
  position: absolute;
  z-index: 6;
  display: grid;
  width: 196px;
  padding: 6px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.2);
}
.context-menu__item {
  min-height: 36px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #223041;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.context-menu__item:hover:not(:disabled) {
  background: #edf5fc;
}
.context-menu__item--danger {
  color: #c43d3d;
}
.context-menu__item--danger:hover:not(:disabled) {
  background: #fff0f0;
}
.context-menu__item:disabled {
  color: #9aa6b5;
  cursor: not-allowed;
}
.context-menu__separator {
  height: 1px;
  margin: 5px 6px;
  background: rgba(24, 33, 47, 0.1);
}
.canvas-board {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 28px;
  background:
    linear-gradient(rgba(28, 126, 214, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(28, 126, 214, 0.06) 1px, transparent 1px),
    linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%);
  background-size:
    24px 24px,
    24px 24px,
    100% 100%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}
.canvas-board--dragging {
  outline: 2px dashed rgba(28, 126, 214, 0.48);
  outline-offset: -10px;
}
.canvas-board--panning {
  cursor: grabbing;
}
.canvas-board--panning .canvas-scene {
  cursor: grabbing;
}
.empty-state,
.loading-state {
  position: absolute;
  inset: 30% auto auto 50%;
  padding: 18px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  color: #5b6a80;
  transform: translate(-50%, -50%);
  box-shadow: 0 18px 40px rgba(45, 89, 126, 0.12);
  z-index: 1;
}
.import-notice {
  position: absolute;
  right: 20px;
  bottom: 20px;
  max-width: min(420px, calc(100% - 40px));
  padding: 12px 14px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  color: #304255;
  box-shadow: 0 14px 32px rgba(45, 89, 126, 0.14);
  z-index: 2;
}
.canvas-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.canvas-object {
  cursor: move;
  user-select: none;
  touch-action: none;
}
.canvas-object :deep(*) {
  pointer-events: none;
}
.canvas-object :deep(.semantic-rendered-content),
.canvas-object :deep(.semantic-rendered-content *) {
  pointer-events: all;
}
.canvas-object--selected {
  filter: drop-shadow(0 10px 18px rgba(28, 126, 214, 0.18));
}
.coordinate-guide-layer {
  overflow: visible;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-guide) {
  overflow: visible;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-line),
.coordinate-guide-layer :deep(.coordinate-axis-arrowhead) {
  fill: none;
  stroke: #111;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.coordinate-guide-layer :deep(.coordinate-axis-arrowhead) {
  stroke-linejoin: round;
}
.coordinate-guide-layer :deep(.coordinate-axis-line--tail) {
  opacity: 0.72;
}
.coordinate-guide-layer :deep(.coordinate-axis-hit-target) {
  fill: none;
  stroke: transparent;
  stroke-width: 18;
  pointer-events: stroke;
  cursor: pointer;
  touch-action: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-line--bound) {
  stroke: #1c7ed6;
}
.coordinate-guide-layer :deep(.coordinate-axis-binding-label) {
  fill: #1554b2;
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 0;
  pointer-events: none;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.94);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.coordinate-guide-layer :deep(.coordinate-origin-handle) {
  fill: #111;
  stroke: none;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-origin-hit-target) {
  fill: transparent;
  stroke: transparent;
  pointer-events: all;
  cursor: grab;
  touch-action: none;
}
.coordinate-guide-layer :deep(.coordinate-origin-hit-target:active) {
  cursor: grabbing;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-control) {
  opacity: 0.42;
  pointer-events: all;
  cursor: pointer;
  touch-action: none;
  transition: opacity 120ms ease;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-hit-target) {
  fill: transparent;
  stroke: transparent;
  pointer-events: all;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-outline) {
  fill: rgba(255, 255, 255, 0.82);
  stroke: #111;
  stroke-width: 1.3;
  stroke-dasharray: 3 3;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-icon) {
  fill: none;
  stroke: #111;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-control:hover .coordinate-axis-reverse-icon) {
  stroke-width: 2.3;
}
.coordinate-guide-layer :deep(.coordinate-axis-reverse-control:hover) {
  opacity: 1;
}
.coordinate-guide-layer :deep(.polar-coordinate-ring) {
  fill: none;
  stroke: rgba(17, 17, 17, 0.62);
  stroke-width: 1.4;
}
.coordinate-guide-layer :deep(.polar-coordinate-spoke) {
  stroke: rgba(17, 17, 17, 0.78);
  stroke-width: 1.5;
}
.coordinate-guide-layer :deep(.polar-coordinate-origin) {
  fill: #111;
  stroke: none;
}
.selection-overlay {
  pointer-events: none;
  overflow: visible;
}
.selection-box {
  fill: rgba(28, 126, 214, 0.06);
  stroke: #1c7ed6;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}
.marquee-box {
  fill: rgba(28, 126, 214, 0.12);
  stroke: #1c7ed6;
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}
.selection-handle {
  fill: #fff;
  stroke: #1c7ed6;
  stroke-width: 2;
  pointer-events: all;
  cursor: nwse-resize;
}
.rotate-stem {
  stroke: #1c7ed6;
  stroke-width: 1.2;
  stroke-dasharray: 3 2;
  pointer-events: none;
}
.rotate-handle {
  fill: #fff;
  stroke: #1c7ed6;
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}
.rotate-handle:active {
  cursor: grabbing;
}
.rotation-input {
  position: absolute;
  left: 16px;
  bottom: auto;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #516176;
  font-size: 12px;
  box-shadow: 0 8px 20px rgba(45, 89, 126, 0.12);
  backdrop-filter: blur(8px);
  transform: translate(10px, calc(-100% - 10px));
}
.rotation-input input {
  width: 58px;
  height: 28px;
  padding: 3px 6px;
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 5px;
  color: #223041;
  font: inherit;
  text-align: right;
}
@media (max-width: 1320px) {
  .sidebar__top {
    grid-template-columns: 132px minmax(200px, 30%) minmax(0, 1fr);
  }
  .sidebar__browser {
    grid-template-columns: minmax(190px, 32%) minmax(0, 1fr);
  }
}
@media (max-width: 960px) {
  .sidebar {
    padding: 16px;
  }
  .sidebar__top {
    grid-template-columns: 1fr;
  }
  .sidebar__browser {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
  .candidate-card {
    min-height: 88px;
  }
  .canvas-board {
    min-height: 520px;
  }
  .toolbar--floating {
    right: 12px;
    top: 12px;
    width: min(220px, calc(100% - 24px));
  }
  .composition-popover {
    top: 256px;
    right: 12px;
    width: min(360px, calc(100% - 24px));
    min-width: 0;
    max-height: calc(100% - 268px);
  }
  .encoding-inspector {
    top: 256px;
    right: 12px;
    width: min(280px, calc(100% - 24px));
    min-width: 0;
  }
}
@media (max-width: 760px) {
  .app-shell {
    height: auto;
    overflow: visible;
  }
  .workbench {
    flex-direction: column;
    overflow: visible;
  }
}
</style>
