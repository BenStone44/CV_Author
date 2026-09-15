<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { Check, Circle, Copy, CornerDownLeft, Maximize2, MessageSquare, Minus, Plus, Redo2, RotateCcw, Square, Trash2, Undo2, X } from "@lucide/vue";
import type { NestedAppearanceDraft, NestedDecoration } from "../types";
import { nestedCalloutGeometry } from "../utils/nestedCallout";
import { nestedDecorationBounds, nestedDecorationMarkup, normalizeNestedAppearance } from "../utils/nestedDecorations";
type AlignmentMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

type Preview = { content: string; viewBox: string; width: number; height: number };
const props = defineProps<{
  editor: {
    parentName: string; childName: string; instanceCount: number;
    parent: { width: number; height: number };
    child: { width: number; height: number };
    parameters: NestedAppearanceDraft;
  };
  parentPreview: Preview | null;
  childPreview: Preview | null;
}>();
const emit = defineEmits<{ apply: [draft: NestedAppearanceDraft]; cancel: [] }>();
const initial = normalizeNestedAppearance(props.editor.parameters);
const draft = shallowRef(initial);
const history = shallowRef<NestedAppearanceDraft[]>([]);
const future = shallowRef<NestedAppearanceDraft[]>([]);
const selectedId = ref("child");
const board = ref<SVGSVGElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const snap = ref(false);
const view = shallowRef({ x: -320, y: -210, width: 640, height: 420 });
const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.width} ${view.value.height}`);
const selected = computed(() => draft.value.decorations.find((item) => item.id === selectedId.value));
const sizePercent = computed(() => Math.round(Math.max(props.editor.child.width * draft.value.scale.x, props.editor.child.height * draft.value.scale.y) / 360 * 100));
const parentSize = {
  width: props.parentPreview?.width ?? props.editor.parent.width,
  height: props.parentPreview?.height ?? props.editor.parent.height,
};
const childBox = computed(() => {
  const d = draft.value;
  const width = Math.max(0.01, props.editor.child.width * d.scale.x);
  const height = Math.max(0.01, props.editor.child.height * d.scale.y);
  const angle = d.rotation * Math.PI / 180;
  const ax = (d.childAnchor.x - 0.5) * width;
  const ay = (d.childAnchor.y - 0.5) * height;
  return {
    x: (d.parentAnchor.x - 0.5) * parentSize.width + d.offset.x - (ax * Math.cos(angle) - ay * Math.sin(angle)) - width / 2,
    y: (d.parentAnchor.y - 0.5) * parentSize.height + d.offset.y - (ax * Math.sin(angle) + ay * Math.cos(angle)) - height / 2,
    width, height,
  };
});
const childTransform = computed(() => {
  const b = childBox.value;
  return `translate(${b.x} ${b.y}) rotate(${draft.value.rotation} ${b.width / 2} ${b.height / 2})`;
});
const callout = computed(() => nestedCalloutGeometry({ ...childBox.value, scaleX: 1, scaleY: 1, rotation: draft.value.rotation }, draft.value));
const selectedBox = computed(() => selected.value ? nestedDecorationBounds(selected.value, childBox.value.width, childBox.value.height) : { x: 0, y: 0, width: childBox.value.width, height: childBox.value.height });
const anchors = Array.from({ length: 9 }, (_, index) => ({ x: index % 3 / 2, y: Math.floor(index / 3) / 2 }));
const anchorLabels = ["Top left", "Top center", "Top right", "Middle left", "Center", "Middle right", "Bottom left", "Bottom center", "Bottom right"];
const names = { "rounded-rect": "Rounded frame", circle: "Circle frame", bubble: "Speech bubble" };
const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(initial));

function record(previous: NestedAppearanceDraft) {
  history.value = [...history.value.slice(-39), previous];
  future.value = [];
}
function edit(patch: Partial<NestedAppearanceDraft>, remember = true) {
  const next = normalizeNestedAppearance({ ...draft.value, ...patch });
  if (JSON.stringify(next) === JSON.stringify(draft.value)) return;
  if (remember) record(draft.value);
  draft.value = next;
}
function editDecoration(patch: Partial<NestedDecoration>, remember = true) {
  edit({ decorations: draft.value.decorations.map((item) => item.id === selectedId.value ? { ...item, ...patch } : item) }, remember);
}
function addDecoration(kind: NestedDecoration["kind"]) {
  const id = `decoration-${crypto.randomUUID()}`;
  const item: NestedDecoration = {
    id, kind, x: -0.1, y: -0.1, width: 1.2, height: 1.2,
    fill: "#ffffff", stroke: "#64748b", strokeWidth: 1.5, cornerRadius: 12, opacity: 1,
  };
  if (kind === "circle") item.y = (childBox.value.height - childBox.value.width * 1.2) / (2 * childBox.value.height);
  edit({ decorations: [...draft.value.decorations, item] });
  selectedId.value = id;
}
function removeDecoration() {
  if (!selected.value) return;
  edit({ decorations: draft.value.decorations.filter((item) => item.id !== selectedId.value) });
  selectedId.value = "child";
}
function duplicateDecoration() {
  if (!selected.value) return;
  const copy = { ...selected.value, id: `decoration-${crypto.randomUUID()}`, x: selected.value.x + 0.08, y: selected.value.y + 0.08 };
  edit({ decorations: [...draft.value.decorations, copy] });
  selectedId.value = copy.id;
}
function moveDecoration(direction: number) {
  const items = draft.value.decorations.slice();
  const index = items.findIndex((item) => item.id === selectedId.value);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  const item = items.splice(index, 1)[0]!;
  items.splice(target, 0, item);
  edit({ decorations: items });
}
function undo() {
  const previous = history.value.at(-1);
  if (!previous) return;
  future.value = [...future.value, draft.value];
  history.value = history.value.slice(0, -1);
  draft.value = previous;
  if (!selected.value) selectedId.value = "child";
}
function redo() {
  const next = future.value.at(-1);
  if (!next) return;
  history.value = [...history.value, draft.value];
  future.value = future.value.slice(0, -1);
  draft.value = next;
}
function number(event: Event) { return Number((event.target as HTMLInputElement).value); }
function setSize(value: number) {
  if (!Number.isFinite(value)) return;
  const scale = Math.max(1, Math.min(100, value)) / 100 * 360 / Math.max(props.editor.child.width, props.editor.child.height, 1);
  edit({ scale: { x: scale, y: scale } });
}
function setOffset(axis: "x" | "y", value: number) {
  if (Number.isFinite(value)) edit({ offset: { ...draft.value.offset, [axis]: value } });
}
function setDecorationNumber(field: "x" | "y" | "width" | "height" | "cornerRadius" | "strokeWidth" | "opacity", value: number, divisor = 1) {
  if (Number.isFinite(value)) editDecoration({ [field]: value / divisor });
}
function align(mode: AlignmentMode) {
  const horizontal = ["left", "center-x", "right"].includes(mode);
  const axis = horizontal ? "x" : "y";
  const value = ["left", "top"].includes(mode) ? 0 : ["right", "bottom"].includes(mode) ? 1 : 0.5;
  edit({ parentAnchor: { ...draft.value.parentAnchor, [axis]: value }, childAnchor: { ...draft.value.childAnchor, [axis]: value }, offset: { ...draft.value.offset, [axis]: 0 } });
}
defineExpose({ align });

function fit() {
  const b = childBox.value;
  const boxes = [{ x: 0, y: 0, width: b.width, height: b.height }, ...draft.value.decorations.map((item) => {
    const box = nestedDecorationBounds(item, b.width, b.height);
    return { ...box, height: box.height + (item.kind === "bubble" ? Math.min(box.width, box.height) * 0.2 : 0) };
  })];
  const angle = draft.value.rotation * Math.PI / 180;
  const points = boxes.flatMap((box) => [
    [box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height],
  ].map(([x = 0, y = 0]) => ({
    x: b.x + b.width / 2 + (x - b.width / 2) * Math.cos(angle) - (y - b.height / 2) * Math.sin(angle),
    y: b.y + b.height / 2 + (x - b.width / 2) * Math.sin(angle) + (y - b.height / 2) * Math.cos(angle),
  })));
  points.push({ x: -parentSize.width / 2, y: -parentSize.height / 2 }, { x: parentSize.width / 2, y: parentSize.height / 2 });
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = Math.max(maxX - minX, (maxY - minY) * 640 / 420, 60) * 1.35;
  const height = width * 420 / 640;
  view.value = { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}
function zoom(factor: number) {
  const v = view.value;
  const width = Math.max(20, Math.min(50000, v.width * factor));
  const height = width * 420 / 640;
  view.value = { x: v.x + (v.width - width) / 2, y: v.y + (v.height - height) / 2, width, height };
}
function point(event: PointerEvent) {
  const matrix = board.value?.getScreenCTM();
  return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
}
let drag: { pointerId: number; start: DOMPoint; draft: NestedAppearanceDraft; view: typeof view.value; mode: "move" | "resize" | "pan" } | null = null;
function startDrag(event: PointerEvent, id: string, mode: "move" | "resize" | "pan" = "move") {
  if (event.button !== 0) return;
  const start = point(event);
  if (!start || !board.value) return;
  if (mode !== "pan") selectedId.value = id;
  drag = { pointerId: event.pointerId, start, draft: draft.value, view: view.value, mode };
  board.value.focus({ preventScroll: true });
  board.value.setPointerCapture(event.pointerId);
}
function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = point(event);
  if (!current) return;
  const dx = current.x - drag.start.x;
  const dy = current.y - drag.start.y;
  if (drag.mode === "pan") {
    view.value = { ...view.value, x: view.value.x - dx, y: view.value.y - dy };
    return;
  }
  const round = (value: number) => snap.value ? Math.round(value / 4) * 4 : value;
  if (selectedId.value === "child") {
    edit({ offset: { x: round(drag.draft.offset.x + dx), y: round(drag.draft.offset.y + dy) } }, false);
    return;
  }
  const original = drag.draft.decorations.find((item) => item.id === selectedId.value);
  if (!original) return;
  const angle = -draft.value.rotation * Math.PI / 180;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  const b = childBox.value;
  editDecoration(drag.mode === "resize"
    ? { width: Math.max(0.05, original.width + localX / b.width), height: Math.max(0.05, original.height + localY / b.height) }
    : { x: round(original.x * b.width + localX) / b.width, y: round(original.y * b.height + localY) / b.height }, false);
}
function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (event.type === "pointercancel") draft.value = drag.draft;
  else if (drag.mode !== "pan" && JSON.stringify(drag.draft) !== JSON.stringify(draft.value)) record(drag.draft);
  drag = null;
  if (board.value?.hasPointerCapture(event.pointerId)) board.value.releasePointerCapture(event.pointerId);
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { emit("cancel"); return; }
  if ((event.target as HTMLElement).matches("input, select, textarea")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault(); removeDecoration();
  } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (selected.value) editDecoration({ x: selected.value.x + dx / childBox.value.width, y: selected.value.y + dy / childBox.value.height });
    else edit({ offset: { x: draft.value.offset.x + dx, y: draft.value.offset.y + dy } });
  }
}
let previousFocus: HTMLElement | null = null;
onMounted(() => { previousFocus = document.activeElement as HTMLElement | null; fit(); dialog.value?.focus(); });
onBeforeUnmount(() => { drag = null; previousFocus?.focus(); });
</script>

<template>
  <aside ref="dialog" class="nested-studio" role="dialog" aria-modal="false" aria-labelledby="nested-studio-title" tabindex="-1" @click.stop @pointerdown.stop @keydown.stop="keydown">
    <header class="studio-header">
      <div><span class="studio-eyebrow">COMPOSITION STUDIO</span><h2 id="nested-studio-title">Make it your own<span class="draft-badge">Draft</span></h2><p>{{ editor.parentName }} <span aria-hidden="true">↳</span> {{ editor.childName }}</p></div>
      <button class="icon-button" aria-label="Cancel nested changes" title="Cancel" @click="emit('cancel')"><X :size="18" /></button>
    </header>
    <div class="studio-body">
      <section class="studio-workspace" aria-label="Nested preview canvas">
        <div class="canvas-tools">
          <div class="tool-group"><button title="Add rounded frame" @click="addDecoration('rounded-rect')"><Square :size="16" /> Frame</button><button title="Add circle frame" @click="addDecoration('circle')"><Circle :size="16" /> Circle</button><button title="Add speech bubble" @click="addDecoration('bubble')"><MessageSquare :size="16" /> Bubble</button></div>
          <div class="tool-group"><button class="icon-button" :disabled="!history.length" aria-label="Undo draft change" title="Undo" @click="undo"><Undo2 :size="16" /></button><button class="icon-button" :disabled="!future.length" aria-label="Redo draft change" title="Redo" @click="redo"><Redo2 :size="16" /></button></div>
        </div>
        <div class="canvas-surface">
          <svg ref="board" :viewBox="viewBox" class="studio-canvas" role="group" aria-label="Drag the child or a decoration. Use arrow keys to move the selected element." tabindex="0" @pointerdown.prevent="startDrag($event, '', 'pan')" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @wheel.prevent="zoom($event.deltaY > 0 ? 1.1 : 1 / 1.1)">
            <g :opacity="draft.retainParent ? 1 : 0.18" pointer-events="none">
              <svg v-if="parentPreview" :x="-parentSize.width / 2" :y="-parentSize.height / 2" :width="parentSize.width" :height="parentSize.height" :viewBox="parentPreview.viewBox" overflow="visible"><g v-html="parentPreview.content" /></svg>
              <rect v-else :x="-parentSize.width / 2" :y="-parentSize.height / 2" :width="parentSize.width" :height="parentSize.height" rx="8" fill="#e2e8f0" stroke="#94a3b8" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
            </g>
            <path v-if="callout" :d="callout.outlinePath" fill="white" stroke="#64748b" pointer-events="none" vector-effect="non-scaling-stroke" />
            <g :transform="childTransform">
              <g v-for="item in draft.decorations" :key="item.id" :data-decoration-id="item.id" class="canvas-decoration" @pointerdown.stop.prevent="startDrag($event, item.id)">
                <g pointer-events="all" v-html="nestedDecorationMarkup(item, childBox.width, childBox.height)" />
              </g>
              <g class="canvas-child" @pointerdown.stop.prevent="startDrag($event, 'child')">
                <svg v-if="childPreview" :width="childBox.width" :height="childBox.height" :viewBox="childPreview.viewBox" overflow="visible" pointer-events="none"><g v-html="childPreview.content" /></svg>
                <rect :width="childBox.width" :height="childBox.height" fill="transparent" stroke="none" />
                <text v-if="!childPreview" :x="childBox.width / 2" :y="childBox.height / 2" text-anchor="middle" font-size="12" fill="#64748b">Child chart</text>
              </g>
              <!-- Selection hit testing sits above the chart, independently of visual layer order. -->
              <rect :x="selectedBox.x" :y="selectedBox.y" :width="selectedBox.width" :height="selectedBox.height" :fill="selected ? 'transparent' : 'none'" stroke="#0d9488" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" :pointer-events="selected ? 'all' : 'none'" :class="{ 'decoration-move-surface': selected }" :aria-label="selected ? `Drag ${names[selected.kind]}` : undefined" @pointerdown.stop.prevent="selected && startDrag($event, selected.id)" />
              <rect v-if="selected" :x="selectedBox.x + selectedBox.width - view.width / 160" :y="selectedBox.y + selectedBox.height - view.width / 160" :width="view.width / 80" :height="view.width / 80" fill="#0d9488" stroke="white" vector-effect="non-scaling-stroke" class="resize-handle" @pointerdown.stop.prevent="startDrag($event, selected.id, 'resize')" />
            </g>
          </svg>
          <div class="canvas-caption"><span class="status-dot" /> Local preview</div>
          <div class="zoom-tools"><button class="icon-button" aria-label="Zoom out" @click="zoom(1.25)"><Minus :size="15" /></button><button class="icon-button" aria-label="Fit composition in preview" title="Fit to view" @click="fit"><Maximize2 :size="15" /></button><button class="icon-button" aria-label="Zoom in" @click="zoom(0.8)"><Plus :size="15" /></button></div>
        </div>
        <div class="canvas-help"><span>{{ selected ? `Drag ${names[selected.kind].toLowerCase()} · switch elements in Layers` : 'Drag to move · scroll to zoom · arrow keys to nudge' }}</span><label><input v-model="snap" type="checkbox" /> Snap</label></div>
      </section>
      <section class="studio-properties" aria-label="Nested element properties">
        <div class="property-section"><div class="section-title">LAYERS <span>{{ draft.decorations.length + 1 }}</span></div>
          <button class="layer-item" :class="{ active: selectedId === 'child' }" @click="selectedId = 'child'"><CornerDownLeft :size="15" /><span>{{ editor.childName }}</span><small>Chart</small></button>
          <button v-for="item in [...draft.decorations].reverse()" :key="item.id" class="layer-item" :class="{ active: selectedId === item.id }" @click="selectedId = item.id"><Circle v-if="item.kind === 'circle'" :size="15" /><MessageSquare v-else-if="item.kind === 'bubble'" :size="15" /><Square v-else :size="15" /><span>{{ names[item.kind] }}</span></button>
          <p v-if="!draft.decorations.length" class="empty-hint">Add a frame above to give your chart a backdrop.</p>
        </div>
        <div v-if="selected" class="property-section">
          <div class="section-title">{{ names[selected.kind] }}<div class="tool-group"><button class="icon-button" aria-label="Duplicate decoration" title="Duplicate" @click="duplicateDecoration"><Copy :size="14" /></button><button class="icon-button" aria-label="Delete decoration" title="Delete" @click="removeDecoration"><Trash2 :size="14" /></button></div></div>
          <div class="field-grid"><label>X %<input type="number" :value="Math.round(selected.x * 100)" @change="setDecorationNumber('x', number($event), 100)" /></label><label>Y %<input type="number" :value="Math.round(selected.y * 100)" @change="setDecorationNumber('y', number($event), 100)" /></label><label>{{ selected.kind === 'circle' ? 'Diameter %' : 'Width %' }}<input type="number" min="5" max="800" :value="Math.round(selected.width * 100)" @change="setDecorationNumber('width', number($event), 100)" /></label><label v-if="selected.kind !== 'circle'">Height %<input type="number" min="5" max="800" :value="Math.round(selected.height * 100)" @change="setDecorationNumber('height', number($event), 100)" /></label></div>
          <div class="color-row"><label>Fill <input type="color" :value="selected.fill === 'none' ? '#ffffff' : selected.fill" @input="editDecoration({ fill: ($event.target as HTMLInputElement).value })" /></label><label>Stroke <input type="color" :value="selected.stroke === 'none' ? '#64748b' : selected.stroke" @input="editDecoration({ stroke: ($event.target as HTMLInputElement).value })" /></label></div>
          <label class="checkbox-label"><input type="checkbox" :checked="selected.fill === 'none'" @change="editDecoration({ fill: ($event.target as HTMLInputElement).checked ? 'none' : '#ffffff' })" /> Transparent fill</label>
          <div class="field-grid"><label>Stroke<input type="number" min="0" max="12" step="0.5" :value="selected.strokeWidth" @change="setDecorationNumber('strokeWidth', number($event))" /></label><label v-if="selected.kind !== 'circle'">Corners<input type="number" min="0" max="80" :value="selected.cornerRadius" @change="setDecorationNumber('cornerRadius', number($event))" /></label><label>Opacity %<input type="number" min="0" max="100" :value="Math.round(selected.opacity * 100)" @change="setDecorationNumber('opacity', number($event), 100)" /></label></div>
          <div class="order-buttons"><button :disabled="draft.decorations[0]?.id === selected.id" @click="moveDecoration(-1)">Send back</button><button :disabled="draft.decorations.at(-1)?.id === selected.id" @click="moveDecoration(1)">Bring forward</button></div>
        </div>
        <div v-else class="property-section">
          <div class="section-title">CHILD TRANSFORM<button class="icon-button" aria-label="Reset child position" title="Center child" @click="edit({ parentAnchor: { x: .5, y: .5 }, childAnchor: { x: .5, y: .5 }, offset: { x: 0, y: 0 } })"><RotateCcw :size="14" /></button></div>
          <label class="size-control">Size<div><input type="range" min="1" max="100" :value="sizePercent" @input="setSize(number($event))" /><input type="number" min="1" max="100" aria-label="Child size percent" :value="sizePercent" @change="setSize(number($event))" /><span>%</span></div></label>
          <div class="field-grid"><label>Offset X<input type="number" :value="Math.round(draft.offset.x)" @change="setOffset('x', number($event))" /></label><label>Offset Y<input type="number" :value="Math.round(draft.offset.y)" @change="setOffset('y', number($event))" /></label><label>Rotation °<input type="number" min="-360" max="360" :value="draft.rotation" @change="edit({ rotation: number($event) })" /></label></div>
          <div class="anchor-fields"><div v-for="side in (['parentAnchor', 'childAnchor'] as const)" :key="side"><span>{{ side === 'parentAnchor' ? 'Parent anchor' : 'Child anchor' }}</span><div class="anchor-grid"><button v-for="(anchor, index) in anchors" :key="index" :aria-label="`${side === 'parentAnchor' ? 'Parent' : 'Child'}: ${anchorLabels[index]}`" :title="anchorLabels[index]" :aria-pressed="draft[side].x === anchor.x && draft[side].y === anchor.y" :class="{ active: draft[side].x === anchor.x && draft[side].y === anchor.y }" @click="edit({ [side]: anchor })"><i /></button></div></div></div>
          <label class="checkbox-label"><input type="checkbox" :checked="draft.retainParent" @change="edit({ retainParent: ($event.target as HTMLInputElement).checked })" /> Show parent element</label>
          <label class="checkbox-label"><input type="checkbox" :checked="draft.callout.enabled" @change="edit({ callout: { ...draft.callout, enabled: ($event.target as HTMLInputElement).checked } })" /> Connect frame to parent</label>
          <label v-if="draft.callout.enabled" class="legacy-scale">Frame padding<input type="number" min="105" max="300" :value="Math.round(draft.callout.scale * 100)" @change="edit({ callout: { ...draft.callout, scale: number($event) / 100 } })" />%</label>
        </div>
      </section>
    </div>
    <footer class="studio-footer"><span>{{ changed ? 'Unapplied changes' : 'Ready to customize' }} · {{ editor.instanceCount }} {{ editor.instanceCount === 1 ? 'instance' : 'instances' }}</span><div><button class="cancel-button" @click="emit('cancel')">Cancel</button><button class="apply-button" @click="emit('apply', normalizeNestedAppearance(draft))"><Check :size="16" /> Apply to {{ editor.instanceCount > 1 ? `all ${editor.instanceCount}` : 'instance' }}</button></div></footer>
  </aside>
</template>

<style scoped src="./NestedConfigEditor.css"></style>
