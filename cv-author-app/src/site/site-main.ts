import { createApp } from 'vue'

import { loadApiCatalog } from './apiCatalog'
import { loadGalleryItems } from './galleryCases'
import WebsiteApp from './WebsiteApp.vue'
import './website.css'

const apiPage = window.location.pathname.replace(/\/+$/, '').endsWith('/api')

Promise.all([
  loadGalleryItems(),
  apiPage ? loadApiCatalog() : Promise.resolve(null),
]).then(([galleryItems, apiCatalog]) => {
  createApp(WebsiteApp, { galleryItems, apiCatalog }).mount('#app')
}).catch((error) => {
  console.error(error)
  const root = document.querySelector('#app')
  if (root) root.textContent = 'Website content could not load. Please refresh the page.'
})
