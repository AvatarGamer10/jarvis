; Personalizacion del instalador de Windows.
;
; NSIS deja cambiar imagenes, colores y textos, pero no el marco de la ventana:
; los botones y la tipografia los pone Windows. El objetivo aqui no es que
; parezca la app, sino que parezca de alguien en lugar de generico.
;
; electron-builder inserta estas macros en puntos concretos de su plantilla.
; Se usan `!ifndef` porque si la plantilla ya definiera alguna, redefinirla
; aborta la compilacion.

!macro customHeader
  !ifndef MUI_BGCOLOR
    !define MUI_BGCOLOR "0C1522"
  !endif
  !ifndef MUI_TEXTCOLOR
    !define MUI_TEXTCOLOR "E6EDF6"
  !endif

  ; La cabecera de las paginas interiores tambien va oscura, si no la franja
  ; blanca de arriba canta muchisimo contra el panel lateral.
  !ifndef MUI_HEADER_TRANSPARENT_TEXT
    !define MUI_HEADER_TRANSPARENT_TEXT
  !endif
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "JARVIS"
  !define MUI_WELCOMEPAGE_TEXT "Tu asistente escolar: lo que entregas, lo que tienes hoy y donde va cada archivo.$\r$\n$\r$\nJARVIS funciona en tu ordenador. Tus horarios y tus archivos no se envian a ningun servidor.$\r$\n$\r$\nPulsa Siguiente para instalarlo."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "JARVIS esta listo"
  !define MUI_FINISHPAGE_TEXT "Al abrirlo por primera vez te pedira conectar tu cuenta de Google.$\r$\n$\r$\nSi cierras la ventana, JARVIS se queda en la bandeja del sistema para poder avisarte por las mananas."
  !define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  !define MUI_FINISHPAGE_RUN_TEXT "Abrir JARVIS ahora"
  !insertmacro MUI_PAGE_FINISH
!macroend
