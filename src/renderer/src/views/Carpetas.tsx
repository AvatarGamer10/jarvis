export default function Carpetas(): JSX.Element {
  return (
    <>
      <h1 className="page-title">Carpetas</h1>
      <p className="page-subtitle">Reglas para mantener tus archivos del colegio en su sitio.</p>

      <div className="alert info">
        Pendiente de la <strong>Fase 5</strong>.
      </div>

      <div className="card">
        <h3>Como funcionara</h3>
        <p className="meta" style={{ marginTop: 0 }}>
          Defines reglas del tipo «todo PDF de Descargas cuyo nombre contenga <em>Fisica</em> va a
          Colegio/Fisica». JARVIS te ensena primero la lista de movimientos y no toca nada hasta
          que la apruebas.
        </p>
        <div className="list-item">
          <div>Solo actua dentro de las carpetas que autorices</div>
          <span className="badge ok">Seguro</span>
        </div>
        <div className="list-item">
          <div>Nunca borra archivos, solo los mueve</div>
          <span className="badge ok">Seguro</span>
        </div>
        <div className="list-item">
          <div>Cada lote se puede deshacer</div>
          <span className="badge ok">Seguro</span>
        </div>
      </div>
    </>
  )
}
