import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import '@fontsource/geist-sans'
import '@fontsource/geist-mono'
import { App } from './App'

/**
 * Renderer entry point for Refract.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
