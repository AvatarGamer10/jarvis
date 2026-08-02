# Imágenes de marca

Todo lo que hay en esta carpeta se copia tal cual al empaquetar y queda
disponible en la raíz de la app. Se puede cambiar el logo sin tocar código.

## Ficheros que espera la interfaz

| Fichero | Dónde sale | Tamaño recomendado |
|---|---|---|
| `logo.png` | Pantalla de bienvenida | ~680 px de ancho |
| `mark.png` | Icono junto a "JARVIS" en la barra lateral | 128 × 128 px |

Si alguno no existe, la app no se rompe: la bienvenida compone el nombre con
tipografía y la barra lateral muestra solo el texto.

## Importante: fondo transparente

La interfaz es oscura. Un PNG con fondo blanco se verá como un recuadro blanco
pegado encima. Exporta ambos **con transparencia**.

Para `mark.png` usa solo la cabeza del logo, sin el texto: a 26 px de alto las
letras no se leerían y solo ensucian.

## Icono de la aplicación

El icono de la barra de tareas y del instalador es otra cosa y va aparte, en
`build/` en la raíz del proyecto:

- `build/icon.png` — 512 × 512 px, para Linux y como origen del resto
- `build/icon.ico` — para Windows
- `build/icon.icns` — para macOS

`electron-builder` genera el `.ico` y el `.icns` a partir del PNG si solo dejas
ese, siempre que sea de 512 × 512 o mayor.
