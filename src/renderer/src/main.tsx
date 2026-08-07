import React from 'react'
import ReactDOM from 'react-dom/client'

// Las fuentes van empaquetadas dentro de la app, no descargadas de un CDN: asi
// se ven igual en cualquier equipo y funcionan sin conexion. Se importan antes
// que los estilos para que las reglas @font-face existan al aplicarlos.
//
// De Archivo se coge la variante "standard", que trae los dos ejes (grosor y
// anchura); el diseno usa los dos. De las otras dos basta el grosor.
import '@fontsource-variable/archivo/standard.css'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'

import App from './App'
import Hud from './views/Hud'
// Tailwind primero: sus utilidades van en capas, y styles.css va sin capa, asi
// que el sistema propio de la app gana siempre que los dos toquen lo mismo.
import './tailwind.css'
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
