import React from 'react'
import ReactDOM from 'react-dom/client'

// Fonts are bundled inside the app rather than fetched from a CDN: they look
// the same on every machine and work with no connection. Imported before the
// styles so the @font-face rules exist by the time those are applied.
//
// Archivo comes in the "standard" variant, which carries both axes (weight and
// width); the design uses both. For the others, weight alone is enough.
import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/inter/wght.css'

import App from './App'
import Hud from './views/Hud'
// Tailwind first: its utilities are in layers and styles.css is not, so the
// app's own system wins wherever the two touch the same thing.
import './tailwind.css'
import './styles.css'
import { routeHubThroughProxy } from './lib/hub-fetch'

// Before anything can ask for a model. See lib/hub-fetch.ts.
routeHubThroughProxy()

/**
 * Both windows share one bundle and are told apart by the URL the main process
 * opens them with. Building two separate entry points would duplicate React
 * and everything else for very little gain.
 */
const isHud = new URLSearchParams(window.location.search).get('view') === 'hud'

// The HUD is a transparent window: its own card supplies the background.
if (isHud) document.documentElement.dataset.window = 'hud'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isHud ? <Hud /> : <App />}</React.StrictMode>
)
