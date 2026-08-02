# JARVIS

Asistente escolar de escritorio para Windows 11 y macOS 26. Entiende peticiones en lenguaje
natural y actúa sobre tu calendario, tus tareas de Google Classroom y tus carpetas locales.

- **Stack:** Electron + React + TypeScript
- **Cerebro:** Gemini (detrás de una interfaz intercambiable)
- **Sin SDKs pesados:** las APIs de Google y Gemini se llaman por REST con `fetch`

---

## Requisitos

- **Node.js 20 o superior** — `winget install OpenJS.NodeJS.LTS` en Windows,
  `brew install node` en macOS. Cierra y reabre la terminal después de instalarlo.
- Una cuenta de Google (la del colegio, la que usa Classroom).

---

## Fase 0 — Spike de acceso

**Haz esto antes que nada.** Comprueba que tu cuenta del colegio deja entrar a la app. Si el
administrador del centro bloquea las apps de terceros, mejor descubrirlo hoy que dentro de un mes.

### 1. Crear el proyecto en Google Cloud

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto
   nuevo llamado `JARVIS`.
2. En **APIs y servicios → Biblioteca**, habilita estas tres:
   - Google Classroom API
   - Google Calendar API
   - Google Drive API

### 2. Configurar la pantalla de consentimiento

1. **APIs y servicios → Pantalla de consentimiento de OAuth**.
2. Tipo de usuario: **Externo** (a menos que uses la cuenta del colegio y te deje elegir
   *Interno*, en cuyo caso es mejor).
3. Rellena nombre de la app, tu correo de contacto y guarda.
4. Añade tu propia cuenta como **usuario de prueba**.
5. **Importante:** vuelve a la pantalla de consentimiento y pulsa **"Publicar aplicación"**
   (estado *In production*). Seguirá saliendo el aviso de "app no verificada" —es normal y se
   acepta— pero evita que tu sesión **caduque cada 7 días**, que es lo que pasa en modo *Testing*.

### 3. Crear las credenciales

1. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación de escritorio**.
3. Copia el *Client ID* y el *Client secret*.

### 4. Conseguir la clave de Gemini

Ve a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) y crea una API key.

### 5. Rellenar el `.env` y ejecutar

Copia `.env.example` a `.env`, pega los cuatro valores y ejecuta:

```bash
node scripts/spike-google.mjs
```

Se abrirá el navegador. **Inicia sesión con la cuenta del colegio** — ese es justo el objetivo de
la prueba. Al terminar verás un veredicto con cuatro líneas. Si las cuatro dan OK, la Fase 0 está
superada y se puede seguir.

> El script no necesita `npm install`: solo usa módulos nativos de Node.

---

## Desarrollo

```bash
npm install
npm run dev
```

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas del organizador de carpetas (rutas, mover, deshacer) |
| `npm run typecheck` | Comprueba tipos de main, preload y renderer |
| `npm run build` | Compila a `out/` |
| `npm run build:win` | Instalador NSIS para Windows (ejecutar en Windows) |
| `npm run build:mac` | DMG universal para macOS (ejecutar en macOS) |

---

## Una limitación que conviene tener clara

**JARVIS no puede pulsar "Entregar" en Classroom por ti.** No es un fallo ni un permiso que
falte: la API de Google lo prohíbe por diseño. Tanto `studentSubmissions.turnIn` como
`modifyAttachments` exigen que la tarea haya sido *creada por la misma app* que llama:

> "This request must be made by the Developer Console project of the OAuth client ID used to
> create the corresponding course work item."

Como las tareas las crea el profesor desde la web de Classroom, ninguna app externa puede
entregarlas. Lo que sí hace JARVIS:

1. Te lista todas las tareas pendientes con su fecha y estado.
2. Sube tu archivo a Google Drive.
3. Te abre la tarea exacta en Classroom con el archivo ya listo para adjuntar.

Tú das los dos últimos clics.

---

## Notas sobre Gemini

El free tier ronda las 1.000–1.500 peticiones al día en los modelos Flash, con unas 15 por
minuto. Para uso personal sobra, pero **no es infinito**: si un bucle se descontrola te quedas
sin cuota hasta el día siguiente. Ajustes muestra un contador de llamadas para detectarlo.

Además, en el free tier **Google puede usar los prompts para entrenar sus modelos**. Por eso el
diseño manda al modelo el mínimo contexto necesario —títulos y fechas— y nunca ficheros enteros
ni rutas completas del disco.

Si algún día quieres cambiar de modelo, la interfaz `LLMProvider` en `src/main/agent/providers/`
aísla todo eso en un solo archivo.

---

## Estructura

```
src/
  main/
    auth/         OAuth con PKCE y renovación de token
    integrations/ Cliente REST de Google + Calendar y Classroom
    agent/        Cerebro: proveedor, bucle de herramientas y prompt
    organizer/    Organizador de carpetas (rutas, plan, ejecución, deshacer)
    store/        Ajustes en claro y credenciales cifradas
  preload/        Puente seguro entre main y renderer
  renderer/       Interfaz React
  shared/         Tipos compartidos por ambos lados
scripts/          Spike de la Fase 0
tests/            Pruebas del organizador
```

Todo lo sensible (tokens, claves, acceso a disco) vive **solo en el proceso main**. El renderer
nunca ve una credencial.

## Seguridad del organizador de carpetas

Es el único módulo que puede hacer daño real, así que va con varias capas:

- Solo actúa dentro de las **carpetas que autorizas explícitamente**. Las rutas se resuelven
  siguiendo enlaces simbólicos antes de comprobarlas, para que un enlace dentro de una carpeta
  autorizada no pueda apuntar fuera.
- **Nunca borra y nunca sobrescribe.** Si en el destino ya hay un archivo con ese nombre, añade
  un sufijo ` (2)`.
- Siempre simulacro primero: ves la tabla completa antes de que se mueva nada.
- Cada lote queda registrado y se puede deshacer.
- El agente no puede pasar rutas: solo pide un simulacro y aprueba el plan resultante por su id.

Todo esto está cubierto por `npm test`, incluido el caso de un plan manipulado que intenta
escribir en `C:\Windows`.
