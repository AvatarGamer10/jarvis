import { useEffect, useState } from 'react'
import type { AuthStatus, ModeloRecomendado, ProgresoDescarga } from '@shared/types'
import { sound } from '../lib/sound'

const MARK = 'JARVIS'
const PASOS = ['bienvenida', 'google', 'cerebro', 'listo'] as const
type Paso = (typeof PASOS)[number]

interface Props {
  onDone: () => void
}

/**
 * Configuracion guiada del primer arranque.
 *
 * Solo aparece una vez en la vida de la instalacion: la marca vive en
 * settings.json, dentro de la carpeta de datos del usuario, que ni el
 * instalador ni el actualizador tocan.
 *
 * Esta escrito para alguien que no ha configurado nada tecnico nunca: una sola
 * decision por pantalla, sin jerga, y todo se puede saltar. Un tutorial que no
 * deja avanzar es peor que no tenerlo.
 */
export default function Onboarding({ onDone }: Props): JSX.Element {
  const [paso, setPaso] = useState<Paso>('bienvenida')
  const [hayLogo, setHayLogo] = useState(true)

  const avanzar = (siguiente: Paso): void => {
    sound.play('nav')
    setPaso(siguiente)
  }

  const terminar = (): void => {
    sound.play('start')
    onDone()
  }

  return (
    <div className="intro">
      <div className="intro-pasos" aria-hidden="true">
        {PASOS.map((p) => (
          <span key={p} className={`intro-punto ${p === paso ? 'activo' : ''}`} />
        ))}
      </div>

      {paso === 'bienvenida' && (
        <>
          {hayLogo ? (
            <img
              className="intro-logo"
              src="./logo.png"
              alt="JARVIS"
              onError={() => setHayLogo(false)}
            />
          ) : (
            <h1 className="intro-mark" aria-label={MARK}>
              {MARK.split('').map((letra, i) => (
                <span key={`${letra}-${i}`} aria-hidden="true" style={{ animationDelay: `${180 + i * 70}ms` }}>
                  {letra}
                </span>
              ))}
            </h1>
          )}

          <p className="intro-line">
            Lo que entregas, lo que tienes hoy y donde va cada archivo. En una sola ventana.
          </p>

          <button className="intro-start" onClick={() => avanzar('google')} autoFocus>
            Empezar
          </button>

          <p className="intro-note">SON DOS MINUTOS, UNA SOLA VEZ</p>
        </>
      )}

      {paso === 'google' && <PasoGoogle onSiguiente={() => avanzar('cerebro')} />}
      {paso === 'cerebro' && <PasoCerebro onSiguiente={() => avanzar('listo')} />}

      {paso === 'listo' && (
        <>
          <h2 className="intro-titulo">Todo listo</h2>
          <p className="intro-line">Esto es lo que encontraras dentro:</p>

          <div className="intro-tour">
            {[
              ['Chat', 'Pidele las cosas hablando, como a una persona.'],
              ['Agenda', 'Tu semana y el resumen de cada dia.'],
              ['Tareas', 'Lo que tienes que entregar, ordenado por urgencia.'],
              ['Carpetas', 'Reglas para que cada archivo acabe en su sitio.']
            ].map(([titulo, texto]) => (
              <div key={titulo}>
                <strong>{titulo}</strong>
                <span>{texto}</span>
              </div>
            ))}
          </div>

          <button className="intro-start" onClick={terminar} autoFocus>
            Entrar
          </button>

          <p className="intro-note">PUEDES CAMBIARLO TODO EN AJUSTES</p>
        </>
      )}
    </div>
  )
}

// --- Paso: cuenta de Google --------------------------------------------------

function PasoGoogle({ onSiguiente }: { onSiguiente: () => void }): JSX.Element {
  const [estado, setEstado] = useState<AuthStatus | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.jarvis.auth.status().then((r) => {
      if (r.ok) setEstado(r.data)
    })
  }, [])

  const conectar = async (): Promise<void> => {
    setOcupado(true)
    setError(null)
    const r = await window.jarvis.auth.signIn()
    if (r.ok) {
      setEstado(r.data)
      sound.play('confirm')
    } else {
      setError(r.error)
    }
    setOcupado(false)
  }

  const conectado = estado?.connected === true

  return (
    <>
      <h2 className="intro-titulo">Tu cuenta de Google</h2>
      <p className="intro-line">
        JARVIS necesita tu permiso para leer tu calendario y tus tareas. Se abrira el navegador
        para que inicies sesion.
      </p>

      <div className="intro-caja">
        {conectado ? (
          <>
            <div className="intro-ok">Conectado como {estado?.email}</div>
            <p className="hint">Ya puedes seguir.</p>
          </>
        ) : (
          <>
            <button className="primary" onClick={conectar} disabled={ocupado}>
              {ocupado ? 'Esperando al navegador…' : 'Conectar con Google'}
            </button>
            {error && <p className="hint intro-error">{error}</p>}
            <p className="hint">
              Google avisara de que no ha verificado la aplicacion. Es normal: la has instalado tu.
              Pulsa <strong>Configuracion avanzada</strong> y luego <strong>Ir a JARVIS</strong>.
            </p>
          </>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        <button className={conectado ? 'primary' : ''} onClick={onSiguiente}>
          {conectado ? 'Siguiente' : 'Ahora no, seguir'}
        </button>
      </div>

      {!conectado && (
        <p className="intro-note">SIN ESTO, LA AGENDA SE QUEDA VACIA. SE PUEDE HACER DESPUES.</p>
      )}
    </>
  )
}

// --- Paso: el cerebro --------------------------------------------------------

function PasoCerebro({ onSiguiente }: { onSiguiente: () => void }): JSX.Element {
  const [instalado, setInstalado] = useState<boolean | null>(null)
  const [modelos, setModelos] = useState<string[]>([])
  const [recomendados, setRecomendados] = useState<ModeloRecomendado[]>([])
  const [descarga, setDescarga] = useState<ProgresoDescarga | null>(null)
  const [prueba, setPrueba] = useState<{ ok: boolean; detalle: string } | null>(null)
  const [probando, setProbando] = useState(false)

  useEffect(() => {
    void window.jarvis.ollama.recommended().then((r) => {
      if (r.ok) setRecomendados(r.data)
    })
    return window.jarvis.ollama.onProgress(setDescarga)
  }, [])

  /**
   * Mientras Ollama no aparezca, se comprueba cada 3 segundos. Asi el usuario
   * lo instala en otra ventana y al volver ya esta detectado, sin tener que
   * acordarse de pulsar nada.
   */
  useEffect(() => {
    let vivo = true

    const mirar = async (): Promise<void> => {
      const r = await window.jarvis.ollama.isRunning()
      if (!vivo) return
      const activo = r.ok && r.data
      setInstalado(activo)

      if (activo) {
        const m = await window.jarvis.agent.ollamaModels()
        if (vivo && m.ok) setModelos(m.data)
      }
    }

    void mirar()
    const id = setInterval(() => void mirar(), 3000)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])

  // Al terminar una descarga, refrescar la lista para que aparezca ya elegido.
  useEffect(() => {
    if (!descarga?.terminado || descarga.error) return
    sound.play('done')
    void window.jarvis.agent.ollamaModels().then((r) => {
      if (r.ok) setModelos(r.data)
    })
  }, [descarga?.terminado])

  const elegir = async (nombre: string): Promise<void> => {
    sound.play('confirm')
    await window.jarvis.settings.update({ ollamaModel: nombre })
    setModelos((previos) => [nombre, ...previos.filter((m) => m !== nombre)])
    // Cambiar de modelo invalida la prueba anterior.
    setPrueba(null)
  }

  const probar = async (): Promise<void> => {
    setProbando(true)
    setPrueba(null)
    const r = await window.jarvis.ollama.probar()
    if (r.ok) {
      setPrueba(r.data)
      sound.play(r.data.ok ? 'done' : 'cancel')
    } else {
      setPrueba({ ok: false, detalle: r.error })
    }
    setProbando(false)
  }

  const descargar = (nombre: string): void => {
    sound.play('nav')
    setDescarga({
      modelo: nombre,
      fase: 'Preparando',
      porcentaje: 0,
      descargado: 0,
      total: 0,
      terminado: false
    })
    void window.jarvis.ollama.pull(nombre)
  }

  const hayModelo = modelos.length > 0
  const descargando = descarga !== null && !descarga.terminado
  const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(1)

  return (
    <>
      <h2 className="intro-titulo">El cerebro</h2>
      <p className="intro-line">
        Para entenderte cuando le escribas, JARVIS usa un programa llamado Ollama que funciona
        dentro de tu ordenador. Nada de lo que le digas sale de aqui.
      </p>

      <div className="intro-caja">
        {instalado === null && <p className="hint">Buscando Ollama…</p>}

        {instalado === false && (
          <>
            <div className="intro-falta">Falta instalar Ollama</div>
            <p className="hint" style={{ maxWidth: '42ch' }}>
              Pulsa el boton, instalalo como cualquier otro programa y vuelve aqui. Te detectare
              solo, no hace falta que hagas nada mas.
            </p>
            <button
              className="primary"
              onClick={() => void window.jarvis.shell.openExternal('https://ollama.com/download')}
            >
              Descargar Ollama
            </button>
            <p className="hint intro-latido">Comprobando cada pocos segundos…</p>
          </>
        )}

        {instalado === true && descargando && descarga && (
          <>
            <div className="intro-ok">Ollama funcionando</div>
            <p className="hint">
              {descarga.fase} {descarga.modelo}
              {descarga.total > 0 && ` · ${gb(descarga.descargado)} de ${gb(descarga.total)} GB`}
            </p>
            <div className="update-bar" style={{ width: '100%' }}>
              <div className="update-bar-fill" style={{ width: `${descarga.porcentaje}%` }} />
            </div>
            <button onClick={() => void window.jarvis.ollama.cancelPull()}>Cancelar</button>
          </>
        )}

        {instalado === true && !descargando && descarga?.error && (
          <p className="hint intro-error">{descarga.error}</p>
        )}

        {instalado === true && !descargando && hayModelo && (
          <>
            <div className="intro-ok">Ollama listo, usando {modelos[0]}</div>
            {modelos.length > 1 && (
              <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
                {modelos.map((m) => (
                  <button
                    key={m}
                    className={m === modelos[0] ? 'primary' : ''}
                    onClick={() => void elegir(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {/* Que exista no significa que sirva: hay modelos que no saben
                usar herramientas y fallan al primer mensaje util. */}
            {prueba === null && (
              <button onClick={probar} disabled={probando} style={{ marginTop: 10 }}>
                {probando ? 'Probandolo…' : 'Comprobar que funciona'}
              </button>
            )}
            {prueba && (
              <p className={`hint ${prueba.ok ? '' : 'intro-error'}`} style={{ marginTop: 8 }}>
                {prueba.ok ? '✓ ' : ''}
                {prueba.detalle}
              </p>
            )}
          </>
        )}

        {instalado === true && !descargando && !hayModelo && (
          <>
            <div className="intro-ok">Ollama funcionando</div>
            <p className="hint">Falta descargar un modelo. Yo me encargo, elige cual:</p>
            <div className="intro-modelos">
              {recomendados.map((m) => (
                <button key={m.nombre} onClick={() => descargar(m.nombre)}>
                  <strong>{m.etiqueta}</strong>
                  <span>{m.descripcion}</span>
                  <em>
                    {m.nombre} · {m.gigas} GB
                  </em>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        <button className={hayModelo ? 'primary' : ''} onClick={onSiguiente} disabled={descargando}>
          {hayModelo ? 'Siguiente' : 'Ahora no, seguir'}
        </button>
      </div>

      {!hayModelo && !descargando && (
        <p className="intro-note">SIN ESTO, TODO FUNCIONA MENOS EL CHAT</p>
      )}
    </>
  )
}
