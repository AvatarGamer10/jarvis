# Informe: detección `Trojan:Win32/Wacatac.B!ml`

**Aplicación:** JARVIS — asistente escolar de escritorio
**Fichero:** `JARVIS-0.4.0-instalador.exe` (85,8 MB)
**SHA-256:** `81a97cd882c6bda895680631ce6509a1bac68dd997f40d6eb932dc8697b3b7c9`
**Detectado por:** Microsoft Defender, al descargar desde GitHub
**Fecha:** 3 de agosto de 2026

---

## Resumen

Windows Defender marca el instalador como `Trojan:Win32/Wacatac.B!ml`. **Es un
falso positivo.**

El sufijo `!ml` indica que la detección viene de un **modelo de aprendizaje
automático**, no de una firma de malware concreto. `Wacatac.B!ml` no identifica
una familia de troyanos: es la etiqueta genérica donde Defender agrupa binarios
que su modelo considera sospechosos por su forma, sin reconocer nada específico
dentro.

Es la detección de falso positivo más frecuente de Defender, y afecta
sistemáticamente a ejecutables recién compilados, sin firmar y con poca
difusión.

---

## Por qué es un falso positivo

### 1. Ningún motor lo detecta

VirusTotal: **0 detecciones sobre 72 motores**, incluido el motor de Microsoft.

### 2. El código es propio y verificable

La aplicación se compila desde código fuente escrito para este proyecto. No
incluye binarios de terceros descargados de sitios no oficiales; todas las
dependencias vienen de npm y están declaradas en `package.json` y bloqueadas
por versión y hash en `package-lock.json`.

### 3. La compilación es reproducible

Cualquiera puede clonar el repositorio, ejecutar `npm ci && npm run build:win` y
obtener un instalador equivalente.

### 4. No hace nada oculto

Todo el comportamiento de red y de disco está a la vista en el código y se
describe en detalle más abajo. No hay ofuscación, ni empaquetadores, ni carga
dinámica de código descargado.

---

## Por qué VirusTotal y Defender local dan resultados distintos

No se contradicen: **son motores distintos**.

| | VirusTotal | Defender en el equipo |
|---|---|---|
| Motor | Estático, sin nube | Estático **+ modelos en la nube** |
| Detección | Firmas conocidas | Firmas **+ heurística ML** |
| Resultado | 0/72 | `Wacatac.B!ml` |

Las detecciones `!ml` se calculan en los servidores de Microsoft y solo se
aplican si el equipo tiene la protección en la nube activada. En el equipo
afectado está activa (`MAPSReporting = 2`).

---

## Qué características disparan el modelo

Lo que sigue es la lista honesta de todo lo que, en este instalador, un modelo
de ML puede interpretar como sospechoso — y por qué cada cosa está ahí.

### Factores dominantes

**1. El ejecutable no está firmado digitalmente.**
Es, con diferencia, el factor de mayor peso. Firmar requiere un certificado de
pago (200–400 €/año para uno OV). Es un proyecto personal sin presupuesto.

**2. Prevalencia nula.**
El modelo pondera cuántos equipos en el mundo han visto ese binario. Un fichero
recién compilado que ha descargado una persona puntúa como «desconocido», y
desconocido pesa hacia sospechoso. **Cada versión nueva vuelve a partir de cero.**

**3. Instalador NSIS.**
NSIS es el formato de instalador más usado también por malware real, así que su
estructura está sobrerrepresentada en los datos de entrenamiento.

### Comportamientos que un heurístico penaliza

| Comportamiento | Por qué lo hace JARVIS | Dónde está |
|---|---|---|
| Escribe en `%APPDATA%` | Guarda ajustes, tareas apuntadas y el historial para deshacer movimientos de archivos | `src/main/store/` |
| Crea claves de registro | Entrada de desinstalación y, si el usuario lo activa, arranque con el sistema | NSIS y `app.setLoginItemSettings` |
| Puede arrancar con el sistema | Para poder lanzar el resumen diario a la hora fijada | `src/main/index.ts` |
| Se ejecuta oculto al arrancar | Con el argumento `--oculto` va a la bandeja sin robar el foco | `src/main/index.ts` |
| Vive en la bandeja sin ventana | Cerrar la ventana no mata el proceso, para poder avisar a su hora | `src/main/tray.ts` |
| **Descarga y ejecuta otro ejecutable** | Actualización automática desde GitHub Releases | `src/main/updater.ts` |
| Conexiones salientes a varios dominios | Google (Calendar, Classroom, Drive), GitHub (actualizaciones), Hugging Face (modelo de voz), `127.0.0.1:11434` (Ollama) | `src/main/integrations/`, `src/renderer/src/lib/transcripcion.ts` |
| Abre un servidor local temporal | Recibe la respuesta de Google en el inicio de sesión OAuth (PKCE con loopback, que es el flujo que Google exige para aplicaciones de escritorio) | `src/main/auth/google-oauth.ts` |
| Registra un atajo global de teclado | `Ctrl+Alt+J` abre el botón flotante | `src/main/index.ts` |
| Captura el micrófono | Función de voz, previa autorización del sistema | `src/renderer/src/lib/microfono.ts` |
| Ventana siempre encima y sin marco | El botón flotante | `src/main/hud.ts` |
| Ejecuta WebAssembly | Whisper transcribe la voz **dentro del equipo**, sin enviar audio a ningún servidor | `src/renderer/src/lib/transcripcion.ts` |
| Mueve archivos del usuario | El organizador de carpetas, solo dentro de las carpetas que el usuario autoriza explícitamente, sin borrar nunca y con opción de deshacer | `src/main/organizer/` |
| Lanza varios procesos hijos | Arquitectura normal de Electron: un proceso principal y varios de renderizado | — |
| Payload comprimido | El `.asar` de Electron y la compresión interna de NSIS se parecen, estáticamente, a un binario empaquetado | — |

La combinación **«se autoactualiza descargando ejecutables + arranca con el
sistema + vive en segundo plano + sin firmar»** es exactamente el perfil de un
descargador de malware. La diferencia es la intención y el origen, que un modelo
estadístico no puede evaluar.

---

## Mitigaciones ya aplicadas

- `requestedExecutionLevel: asInvoker` — declara que no necesita permisos de
  administrador
- Instalación por usuario, no para todo el equipo (`perMachine: false`)
- `allowElevation: false`
- Metadatos completos: nombre de editor, producto, descripción, copyright y
  versión
- Los permisos que puede pedir la interfaz están restringidos: solo micrófono
  (`setPermissionRequestHandler`)
- Política de seguridad de contenido estricta en la versión empaquetada

## Lo que no se puede mitigar

Quitar la actualización automática, el arranque con el sistema o la ejecución en
segundo plano significaría quitar las funciones correspondientes. **La única
solución completa es firmar el código.**

---

## Cómo verificarlo de forma independiente

1. **VirusTotal** — subir el instalador y comprobar el número de detecciones.
2. **Compilar desde el código** — clonar el repositorio privado,
   `npm ci && npm run build:win`, y comparar comportamiento.
3. **Revisar el tráfico de red** — con Wireshark o el monitor de recursos, ver
   que solo contacta con los dominios listados arriba.
4. **Comprobar la pestaña Behavior de VirusTotal** — muestra actividad de
   instalador, sin inyección en procesos, sin persistencia oculta, sin cifrado
   de ficheros del usuario ni contacto con servidores de mando y control.

---

## Reporte a Microsoft

Enviado a través de
[microsoft.com/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission)
como *Software developer*, marcando falso positivo.
