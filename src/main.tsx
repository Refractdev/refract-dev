import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import '@fontsource/geist-sans'
import '@fontsource/geist-mono'
import { App } from './App'

// Capturar installation_id da GitHub App antes de qualquer render
const params = new URLSearchParams(window.location.search)
const installationId = params.get('installation_id')
if (installationId) {
  localStorage.setItem('pending_installation_id', installationId)
  const cleanUrl = `${window.location.pathname}${window.location.hash}`
  window.history.replaceState({}, '', cleanUrl || '/')
}

/**
 * Renderer entry point for Refract.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
