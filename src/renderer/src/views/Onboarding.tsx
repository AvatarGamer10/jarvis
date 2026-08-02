import { useState } from 'react'
import { sound } from '../lib/sound'

const MARK = 'JARVIS'

interface Props {
  onDone: () => void
}

/**
 * Primera pantalla. Solo aparece una vez: al pulsar Comenzar se guarda la
 * marca en los ajustes y no vuelve.
 *
 * La entrada esta orquestada en una secuencia (halo → logo → frase → boton)
 * en vez de animar todo a la vez. Un movimiento con orden se lee como
 * intencion; cinco a la vez, como ruido.
 */
export default function Onboarding({ onDone }: Props): JSX.Element {
  // El logo se sirve desde public/, asi que se puede cambiar sin tocar codigo.
  // Si el fichero no esta, se muestra el nombre compuesto con tipografia.
  const [hasLogo, setHasLogo] = useState(true)

  const start = (): void => {
    sound.play('start')
    onDone()
  }

  return (
    <div className="intro">
      {hasLogo ? (
        <img
          className="intro-logo"
          src="./logo.png"
          alt="JARVIS, tu asistente escolar"
          onError={() => setHasLogo(false)}
        />
      ) : (
        <h1 className="intro-mark" aria-label={MARK}>
          {MARK.split('').map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              aria-hidden="true"
              // Cada letra entra 70 ms despues de la anterior: el nombre se
              // escribe solo en lugar de aparecer de golpe.
              style={{ animationDelay: `${180 + index * 70}ms` }}
            >
              {letter}
            </span>
          ))}
        </h1>
      )}

      <p className="intro-line">
        Lo que entregas, lo que tienes hoy y donde va cada archivo. En una sola ventana.
      </p>

      <button className="intro-start" onClick={start} autoFocus>
        Comenzar
      </button>

      <p className="intro-note">TODO SE QUEDA EN ESTE ORDENADOR</p>
    </div>
  )
}
