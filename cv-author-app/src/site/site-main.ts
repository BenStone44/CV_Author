import { createApp } from 'vue'

import { loadGalleryItems } from './galleryCases'
import WebsiteApp from './WebsiteApp.vue'
import './website.css'

loadGalleryItems().then((galleryItems) => {
  createApp(WebsiteApp, { galleryItems }).mount('#app')
}).catch((error) => {
  console.error(error)
  const root = document.querySelector('#app')
  if (root) root.textContent = 'Gallery content could not load. Please refresh the page.'
})
