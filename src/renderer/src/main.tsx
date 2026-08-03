import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Hud from './views/Hud'
import './styles.css'

/**
 * Las dos ventanas comparten un unico paquete y se distinguen por la URL con
 * la que las abre el proceso principal. Compilar dos entradas separadas
 * duplicaria React y todo lo demas para ganar muy poco.
 */
const esHud = new URLSearchParams(window.location.search).get('vista') === 'hud'

// El HUD es una ventana transparente: el fondo lo pone su propia tarjeta.
if (esHud) document.documentElement.dataset.ventana = 'hud'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{esHud ? <Hud /> : <App />}</React.StrictMode>
)
