# Publicar una versión

JARVIS se actualiza solo. Al abrirse comprueba si hay una versión nueva en
[jarvis-releases](https://github.com/AvatarGamer10/jarvis-releases), la descarga
en segundo plano y avisa con las notas del parche cuando está lista.

Este documento es para **publicar** esa versión nueva.

---

## Por qué hay dos repositorios

| Repositorio | Visibilidad | Qué contiene |
|---|---|---|
| `jarvis` | Privado | El código fuente |
| `jarvis-releases` | **Público** | Solo los instaladores y las notas |

`electron-updater` no puede leer releases de un repositorio privado sin llevar
un token de GitHub dentro del binario, y ese token lo puede extraer cualquiera
que abra el `.exe`. Separando los dos, el código sigue privado y lo único
público es lo que la app necesita descargar de todas formas.

---

## Pasos

### 1. Sube el número de versión

En `package.json`. **Es obligatorio**: si el número no sube, la app no detecta
nada nuevo.

```json
"version": "0.2.0"
```

Sigue [SemVer](https://semver.org/lang/es/): `0.1.1` para un arreglo, `0.2.0`
para funciones nuevas, `1.0.0` cuando la consideres terminada.

### 2. Escribe las notas del parche

Van en el cuerpo del release de GitHub y son **lo que el usuario lee en la app**.
Escríbelas para quien la usa, no para quien la programa:

> **Bien:** «Ahora puedes marcar tareas como hechas desde el chat.»
> **Mal:** «Refactor de ManualTaskService con búsqueda aproximada.»

Cuatro o cinco líneas como mucho. La app corta a 1.200 caracteres.

### 3. Publica

Necesitas un token de GitHub con permiso sobre `jarvis-releases`. El de `gh`
sirve:

```bash
$env:GH_TOKEN = (gh auth token); npm run publicar:win
```

Eso compila, genera el instalador y crea el release con el instalador y el
`latest.yml` que la app consulta.

Desde el Mac, para el DMG:

```bash
export GH_TOKEN=$(gh auth token) && npm run publicar:mac
```

### 4. Reporta el instalador a Microsoft (opcional pero recomendado)

Cada versión nueva es un binario que nadie ha visto, así que Defender puede
volver a marcarla como `Wacatac.B!ml`. Es un falso positivo —ver
[FALSO-POSITIVO.md](FALSO-POSITIVO.md)— y se limpia reportándolo:

1. Entra en [microsoft.com/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission)
2. Elige **Software developer**, no *Home customer*: va a una cola más rápida
3. Sube `release/JARVIS-<versión>-instalador.exe`
4. Marca que crees que es un falso positivo y adjunta el enlace a
   `FALSO-POSITIVO.md`

Suelen contestar en uno o dos días. Si publicas antes de que respondan, quien
descargue en ese hueco verá el aviso.

**La única forma de no tener que hacer esto cada vez es firmar el código**, y
eso cuesta dinero. Lo más barato hoy es Azure Trusted Signing (~10 €/mes),
aunque exige una validación de identidad que no todo el mundo puede pasar.

### 5. Repasa el release en GitHub

Se crea como **borrador**. Entra en
[releases](https://github.com/AvatarGamer10/jarvis-releases/releases), pega ahí
las notas del paso 2 y dale a *Publish release*. Hasta que no lo publiques,
nadie recibe la actualización.

---

## Dos límites que conviene tener claros

**En macOS la actualización automática no funciona sin firmar la app.** Es un
requisito de Apple, no una limitación nuestra: Squirrel.Mac rechaza cualquier
actualización sin firma ni notarización, y eso pide una cuenta de Apple
Developer (99 €/año). En Windows sí funciona sin firmar. Mientras tanto, en el
Mac hay que instalar el DMG a mano.

**La app no se degrada a una versión anterior.** Si publicas una versión rota,
la solución es publicar otra con un número más alto, no borrar la mala.

---

## Cómo probar que el ciclo funciona

1. Instala la versión actual con el instalador.
2. Sube la versión en `package.json` y cambia algo visible.
3. `npm run publicar:win` y publica el release en GitHub.
4. Abre la app instalada: a los pocos segundos debería aparecer abajo a la
   derecha el aviso de descarga y, al terminar, las notas del parche.
