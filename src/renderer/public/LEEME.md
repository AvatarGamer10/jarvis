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

`fondo.png` se pinta algo atenuado y con un desenfoque leve. La razón es que la
interfaz usa el naranja para señalar «esto vence hoy»: un fondo naranja a plena
intensidad competiría con esa señal.

La legibilidad la defiende el **viñeteado** —los bordes se oscurecen, que es
donde no hay contenido— y el fondo propio de cada tarjeta, en lugar de aplastar
la imagen entera.

**El nivel se elige desde la app**, en Ajustes → Apariencia → Imagen de fondo:
*Sin fondo · Sutil · Medio · Marcado*. Los valores de cada nivel están en
`styles.css`, en las reglas `:root[data-fondo='…']`.

Si subes la intensidad, comprueba que las tareas de hoy siguen destacando.

## Icono de la aplicación

El icono de la barra de tareas y del instalador es otra cosa: no sale de aquí,
lo **dibuja por código** `scripts/generar-recursos.mjs` en cada empaquetado.
