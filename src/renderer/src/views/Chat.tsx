import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import { sound } from '../lib/sound'

const SUGGESTIONS = [
  '¿Que tengo esta semana?',
  '¿Que tareas tengo pendientes?',
  'Bloqueame dos horas de estudio manana por la tarde'
]

export default function Chat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calls, setCalls] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const refreshUsage = async (): Promise<void> => {
    const result = await window.jarvis.agent.usage()
    if (result.ok) setCalls(result.data.callsToday)
  }

  useEffect(() => {
    void refreshUsage()
    // La conversacion sobrevive a los reinicios, asi que se recupera al abrir.
    void window.jarvis.agent.history().then((r) => {
      if (r.ok && r.data.length > 0) setMessages(r.data)
    })
  }, [])

  const send = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    setInput('')
    setError(null)
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text: trimmed, at: new Date().toISOString() }
    ])

    const result = await window.jarvis.agent.send(trimmed)
    if (result.ok) {
      setMessages((prev) => [...prev, ...result.data])
    } else {
      setError(result.error)
    }
    setBusy(false)
    void refreshUsage()
  }

  const resolve = async (actionId: string, approved: boolean): Promise<void> => {
    sound.play(approved ? 'confirm' : 'cancel')
    setBusy(true)
    setError(null)

    // La tarjeta desaparece en cuanto se decide, para que no se pueda pulsar dos veces.
    setMessages((prev) =>
      prev.map((m) => (m.pendingAction?.id === actionId ? { ...m, pendingAction: undefined } : m))
    )

    const result = await window.jarvis.agent.confirm(actionId, approved)
    if (result.ok) {
      setMessages((prev) => [...prev, ...result.data])
    } else {
      setError(result.error)
    }
    setBusy(false)
    void refreshUsage()
  }

  const clear = async (): Promise<void> => {
    await window.jarvis.agent.reset()
    setMessages([])
    setError(null)
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <div>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            {calls > 0 ? `${calls} llamada(s) al modelo hoy` : 'Pideme lo que necesites'}
          </p>
        </div>
        {messages.length > 0 && <button onClick={clear}>Vaciar</button>}
      </div>

      <div className="chat-log">
        {messages.length === 0 && (
          <div className="empty">
            <p>Prueba con alguna de estas:</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}`}>
            <div className="bubble-text">{message.text}</div>

            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="tool-trace">
                {message.toolCalls.map((call, i) => (
                  <div key={`${call.name}-${i}`} className={call.ok ? '' : 'failed'}>
                    {call.ok ? '✓' : '✗'} {call.name} — {call.summary}
                  </div>
                ))}
              </div>
            )}

            {message.pendingAction && (
              <div className="confirm-card">
                <strong>{message.pendingAction.description}</strong>
                <ul>
                  {message.pendingAction.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <div className="row">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void resolve(message.pendingAction!.id, true)}
                  >
                    Confirmar
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void resolve(message.pendingAction!.id, false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && <div className="bubble assistant thinking">Pensando…</div>}
        {error && <div className="alert error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <input
          type="text"
          value={input}
          placeholder="Escribe aqui…"
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
    </div>
  )
}
