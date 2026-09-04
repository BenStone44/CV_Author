import { createApp } from 'vue'
import App from './components/App.vue'
import DeckglThumbnailCapture from './components/DeckglThumbnailCapture.vue'
import './style.css'
import {
  frontendPaletteCssVariables,
  frontendTypographyCssVariables,
} from './config/global'

for (const [name, value] of Object.entries({
  ...frontendPaletteCssVariables,
  ...frontendTypographyCssVariables,
})) {
  document.documentElement.style.setProperty(name, value)
}

const query = new URLSearchParams(window.location.search)
const rootComponent = query.has('deckgl-thumbnail') ? DeckglThumbnailCapture : App

createApp(rootComponent).mount('#app')
