# Imágenes de marca

Todo lo que hay en esta carpeta se copia tal cual al empaquetar y queda
disponible en la raíz de la app. Se puede cambiar el logo sin tocar código.

## Ficheros que espera la interfaz

| Fichero | Dónde sale | Tamaño | Fondo |
|---|---|---|---|
| `logo.png` | Bienvenida, centro del anillo y botón de volver | ≥ 512 px, cuadrado | **Transparente** |
| `fondo.png` | Fondo de toda la app | ≥ 1920 px de ancho | Opaco |

Un solo logo para todo: al no llevar texto, sirve igual a 340 px en la
bienvenida que a 26 px en el botón de volver.

Si alguno no existe, la app no se rompe: la bienvenida compone el nombre con
tipografía, el anillo muestra una «J» y el fondo simplemente no se pinta.

## Importante: fondo transparente

La interfaz es oscura. Un PNG con fondo blanco se verá como un recuadro blanco
pegado encima. Exporta `logo.png` **con transparencia**.

Para comprobarlo, desde la raíz del proyecto:

```bash
node scripts/verificar-imagenes.mjs
```

No mira solo si el fichero existe: descodifica los píxeles y comprueba que hay
transparencia de verdad. Un PNG exportado con fondo blanco es técnicamente
válido y pasaría cualquier comprobación superficial.

## Sobre el fondo

`fondo.png` se pinta **muy oscurecido, desaturado y con desenfoque** (opacidad
30%, brillo 42%, saturación 62%). No es un capricho: la interfaz usa el naranja
para señalar «esto vence hoy». Un fondo naranja a plena intensidad se comería
esa señal y dejaría el texto ilegible.

Si quieres que se note más o menos, el ajuste está en `.app-fondo` dentro de
`src/renderer/src/styles.css`. Sube `opacity` con cuidado y comprueba que las
tareas de hoy siguen destacando.

## Icono de la aplicación

El icono de la barra de tareas y del instalador es otra cosa: no sale de aquí,
lo **dibuja por código** `scripts/generar-recursos.mjs` en cada empaquetado.
