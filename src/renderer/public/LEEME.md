# Imágenes de marca

Todo lo que hay en esta carpeta se copia tal cual al empaquetar y queda
disponible en la raíz de la app. Se puede cambiar el logo sin tocar código.

## Ficheros que espera la interfaz

| Fichero | Dónde sale | Tamaño recomendado |
|---|---|---|
| `logo.png` | Pantalla de bienvenida | ~680 px de ancho |
| `mark.png` | Centro del menú radial y botón de volver | 256 × 256 px |
| `fondo.png` | Fondo de toda la app | 1920 × 1080 px o más |

Si alguno no existe, la app no se rompe: la bienvenida compone el nombre con
tipografía, el anillo muestra una «J» y el fondo simplemente no se pinta.

## Sobre el fondo

`fondo.png` se pinta **muy oscurecido, desaturado y con desenfoque** (opacidad
30%, brillo 42%, saturación 62%). No es un capricho: la interfaz es oscura y
usa el naranja para señalar «esto vence hoy». Un fondo naranja a plena
intensidad se comería esa señal y dejaría el texto ilegible.

Si quieres que se note más o menos, el ajuste está en `body::after` dentro de
`src/renderer/src/styles.css`. Sube `opacity` con cuidado y comprueba que las
tareas de hoy siguen destacando.

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
