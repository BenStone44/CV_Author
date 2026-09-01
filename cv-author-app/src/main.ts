import { createApp } from 'vue'
import App from './components/App.vue'
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

createApp(App).mount('#app')
