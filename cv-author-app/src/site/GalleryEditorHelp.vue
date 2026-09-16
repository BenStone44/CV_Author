<script setup lang="ts">
import { ref } from 'vue'
import type { GalleryItem } from './galleryCases'

const props = defineProps<{ item: GalleryItem; completed: boolean }>()
const isOpen = ref(!props.completed)
const helpButton = ref<HTMLButtonElement | null>(null)

function closeHelp() {
  isOpen.value = false
  helpButton.value?.focus()
}
</script>

<template>
  <header class="gallery-editor-bar" @keydown.esc.stop="closeHelp">
    <a class="gallery-editor-back" :href="`/gallery/example/?example=${item.slug}`" target="_blank" rel="noopener">← Gallery example</a>
    <span class="gallery-editor-title">{{ item.title }}</span>
    <button
      ref="helpButton"
      class="gallery-editor-help-button"
      type="button"
      :aria-expanded="isOpen"
      aria-controls="gallery-creation-help"
      @click="isOpen = !isOpen"
    ><span aria-hidden="true">?</span> Help · How to create</button>

    <section v-if="isOpen" id="gallery-creation-help" class="gallery-creation-help" aria-labelledby="gallery-help-title">
      <div class="gallery-help-heading">
        <div>
          <p class="gallery-help-eyebrow">STEP-BY-STEP GUIDE</p>
          <h1 id="gallery-help-title">How to create this example</h1>
        </div>
        <button class="gallery-help-close" type="button" aria-label="Close help" @click="closeHelp">×</button>
      </div>
      <div class="gallery-help-content">
        <p v-if="completed" class="gallery-help-intro">You are viewing the finished example. Open the starter to follow these steps with separate blocks.</p>
        <p class="gallery-help-intro">{{ item.editorHelp?.introduction }}</p>
        <p class="gallery-help-tip">Hold the mouse button while dragging. Move the pointer onto the named drop zone, then release when its label appears. If a block is offscreen, scroll down over the canvas to zoom out. Close Help whenever you need more room; reopen it from the top bar.</p>
        <ol class="gallery-help-steps">
          <li v-for="(step, index) in item.editorHelp?.steps" :key="step.title">
            <span class="gallery-help-number" aria-hidden="true">{{ index + 1 }}</span>
            <div>
              <h2>{{ step.title }}</h2>
              <p class="gallery-help-route"><strong>{{ step.source }}</strong><span aria-hidden="true"> → </span><span class="gallery-help-sr"> to </span>{{ step.target }}</p>
              <p>{{ step.action }}</p>
              <p class="gallery-help-result">{{ step.result }}</p>
            </div>
          </li>
        </ol>
        <details class="gallery-help-preview">
          <summary>See the finished layout</summary>
          <img :src="item.image" :alt="`Finished ${item.title} composition`" />
        </details>
        <p class="gallery-help-tip">Dropped in the wrong place? Use Undo in the canvas toolbar, then try the step again.</p>
        <div class="gallery-help-links">
          <a v-if="completed" :href="item.tryHref" target="_blank" rel="noopener">Open starter ↗</a>
          <a v-else :href="item.caseHref" target="_blank" rel="noopener">Open finished example ↗</a>
          <button type="button" @click="closeHelp">Continue on canvas</button>
        </div>
      </div>
    </section>
  </header>
</template>

<style>
/* This website-owned bar reserves space only on Gallery editor entries. */
body:has(.gallery-editor-bar) #app > .app-shell {
  height: calc(100dvh - 56px);
  min-height: calc(100dvh - 56px);
}
</style>

<style scoped>
.gallery-editor-bar {
  position: relative;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 20px;
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid #d9c7a3;
  background: #fffef7;
  color: #432818;
  font: 400 13px/1.5 Arial, sans-serif;
}
.gallery-editor-bar button, .gallery-editor-bar a { font: inherit; }
.gallery-editor-bar a { color: #71401f; text-underline-offset: 3px; }
.gallery-editor-bar button { cursor: pointer; }
.gallery-editor-bar :is(a, button, summary):focus-visible { outline: 3px solid #99582a; outline-offset: 3px; }
.gallery-editor-back { white-space: nowrap; }
.gallery-editor-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gallery-editor-help-button {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid #99582a;
  border-radius: 8px;
  background: #fffbee;
  color: #432818;
}
.gallery-editor-help-button > span { display: grid; place-items: center; width: 19px; height: 19px; border: 1px solid currentColor; border-radius: 50%; }
.gallery-editor-help-button:hover, .gallery-help-links button:hover { background: #fefae0; }
.gallery-creation-help {
  position: absolute;
  top: 64px;
  right: 16px;
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100dvh - 80px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #d9c7a3;
  border-radius: 12px;
  background: #fffdf6;
  box-shadow: 0 12px 36px #43281826;
}
.gallery-help-heading { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px; border-bottom: 1px solid #e9dfcd; }
.gallery-help-eyebrow { margin: 0 0 4px; color: #80502d; font-size: 10px; font-weight: 700; letter-spacing: .1em; }
.gallery-help-heading h1 { margin: 0; font-size: 18px; line-height: 1.4; }
.gallery-help-close { margin-left: auto; min-width: 32px; height: 32px; border: 0; border-radius: 6px; background: #f4ecdb; color: #432818; font-size: 22px !important; }
.gallery-help-content { padding: 16px 20px 20px; overflow-y: auto; overscroll-behavior: contain; }
.gallery-help-intro { margin: 0 0 12px; }
.gallery-help-tip { padding: 10px 12px; border-radius: 6px; background: #f5efdf; font-size: 12px; }
.gallery-help-steps { display: grid; gap: 18px; margin: 20px 0; padding: 0; list-style: none; }
.gallery-help-steps li { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 10px; }
.gallery-help-number { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #432818; color: #fffdf6; font-size: 12px; }
.gallery-help-steps h2 { margin: 1px 0 7px; font-size: 14px; line-height: 1.5; }
.gallery-help-steps p { margin: 7px 0 0; overflow-wrap: anywhere; }
.gallery-help-route { padding: 8px 10px; border-left: 2px solid #bd8a50; background: #fbf4e4; }
.gallery-help-result { color: #795033; font-size: 12px; }
.gallery-help-preview summary { padding: 8px 0; cursor: pointer; font-weight: 700; }
.gallery-help-preview img { display: block; width: 100%; height: 220px; object-fit: contain; background: white; border: 1px solid #e9dfcd; }
.gallery-help-links { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; }
.gallery-help-links button { padding: 8px 10px; border: 1px solid #99582a; border-radius: 6px; background: #fffbee; color: #432818; }
.gallery-help-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 640px) {
  .gallery-editor-bar { padding: 0 12px; gap: 12px; }
  .gallery-editor-title { display: none; }
  .gallery-editor-help-button { padding: 8px; }
  .gallery-creation-help { right: 8px; width: calc(100vw - 16px); }
}
</style>
