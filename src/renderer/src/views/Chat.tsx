export default function Chat(): JSX.Element {
  return (
    <>
      <h1 className="page-title">Chat</h1>
      <p className="page-subtitle">Habla con JARVIS en lenguaje natural.</p>

      <div className="alert info">
        Pendiente de la <strong>Fase 3</strong>: el bucle de herramientas con Gemini. Hasta
        entonces, Agenda y Tareas ya funcionan por su cuenta.
      </div>

      <div className="card">
        <h3>Lo que se podra pedir aqui</h3>
        <div className="list-item">
          <div>«¿Que tengo el jueves?»</div>
          <span className="badge dim">Agenda</span>
        </div>
        <div className="list-item">
          <div>«Bloqueame dos horas de estudio manana por la tarde»</div>
          <span className="badge dim">Agenda</span>
        </div>
        <div className="list-item">
          <div>«¿Que entrego esta semana?»</div>
          <span className="badge dim">Tareas</span>
        </div>
        <div className="list-item">
          <div>«Ordena la carpeta de descargas»</div>
          <span className="badge dim">Carpetas</span>
        </div>
      </div>
    </>
  )
}
