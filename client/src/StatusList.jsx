const fmt = (sqlDate) => (sqlDate ? new Date(`${sqlDate.replace(' ', 'T')}Z`).toLocaleString('pl-PL') : '');

/** Lista uczestników ze statusem; `renderExtra` pozwala adminowi dodać przycisk podglądu. */
export default function StatusList({ participants, renderExtra }) {
  const drawn = participants.filter((p) => p.drawnAt).length;
  return (
    <>
      <div
        className="progress"
        role="progressbar"
        aria-label="Postęp losowania"
        aria-valuemin={0}
        aria-valuemax={participants.length}
        aria-valuenow={drawn}
        aria-valuetext={`${drawn} z ${participants.length} osób wylosowało`}
      >
        <div style={{ width: `${(drawn / participants.length) * 100}%` }} />
      </div>
      <p className="muted">Wylosowało {drawn} z {participants.length}</p>
      <ul className="status">
        {participants.map((p) => (
          <li key={p.id} className={p.drawnAt ? 'done' : ''}>
            <span className="who"><span aria-hidden="true">{p.drawnAt ? '✅' : '⏳'}</span> {p.name}</span>
            <span className="when">{p.drawnAt ? fmt(p.drawnAt) : 'jeszcze nie losował/a'}</span>
            {renderExtra?.(p)}
          </li>
        ))}
      </ul>
    </>
  );
}
