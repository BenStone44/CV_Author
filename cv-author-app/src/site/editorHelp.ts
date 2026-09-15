import { createApp } from 'vue'
import GalleryEditorHelp from './GalleryEditorHelp.vue'
import { loadGalleryItems } from './galleryCases'

const query = new URLSearchParams(window.location.search)
const starter = query.get('starter')
const completedCase = query.get('case')

if ((starter || completedCase) && !query.has('deckgl-thumbnail')) {
  void loadGalleryItems().then((items) => {
    const item = items.find((candidate) => completedCase
      ? new URL(candidate.caseHref!, window.location.origin).searchParams.get('case') === completedCase
      : new URL(candidate.tryHref, window.location.origin).searchParams.get('starter') === starter)
    if (item?.editorHelp) {
      createApp(GalleryEditorHelp, { item, completed: !!completedCase }).mount('#gallery-editor-help')
    }
  }).catch(() => {
    // Help metadata is optional; the editor can still load its example.
  })
}
