import { useState } from 'react';
import { api } from './api.js';

const fmt = (sqlDate) => (sqlDate ? new Date(`${sqlDate.replace(' ', 'T')}Z`).toLocaleString('pl-PL') : '');
const MIN_PEOPLE = 3;

/**
 * Lista uczestników ze statusem.
 * - `renderExtra(p)` — dodatkowy element w wierszu (admin: podgląd pary).
 * - `edit` = { slug, auth, onUpdated(participants) } — włącza edycję listy (organizator / admin).
 */
export default function StatusList({ participants, renderExtra, edit }) {
  const drawn = participants.filter((p) => p.drawnAt).length;
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await action();
      edit.onUpdated(res.participants);
      if (res.reset?.length) {
        setNotice(
          `Do ponownego losowania: ${res.reset.join(', ')}. Wylosowana wcześniej osoba wypadła z listy — ` +
            'daj znać, żeby weszli w link i wylosowali jeszcze raz.',
        );
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (await run(() => api.addParticipant(edit.slug, edit.auth, newName))) setNewName('');
  }

  async function rename(e) {
    e.preventDefault();
    if (await run(() => api.renameParticipant(edit.slug, edit.auth, renaming.id, renaming.name))) setRenaming(null);
  }

  function remove(p) {
    const msg =
      `Usunąć ${p.name} z losowania?` +
      (drawn > 0
        ? `\n\nKto już losował, zachowa swój wynik — chyba że wylosował(a) ${p.name}. Wtedy będzie musiał(a) losować ponownie.`
        : '');
    if (window.confirm(msg)) run(() => api.removeParticipant(edit.slug, edit.auth, p.id));
  }

  const canRemove = participants.length > MIN_PEOPLE;

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
      <div className="row-between">
        <p className="muted">Wylosowało {drawn} z {participants.length}</p>
        {edit && (
          <button
            type="button"
            className={`btn small ${editing ? '' : 'ghost'}`}
            aria-pressed={editing}
            onClick={() => { setEditing((v) => !v); setRenaming(null); setError(''); }}
          >
            {editing ? '✓ Gotowe' : '✏️ Edytuj listę osób'}
          </button>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <p className="notice" role="status" hidden={!notice}>{notice && <>⚠️ {notice}</>}</p>

      <ul className="status">
        {participants.map((p) => (
          <li key={p.id} className={p.drawnAt ? 'done' : ''}>
            {editing && renaming?.id === p.id ? (
              <form className="rename" onSubmit={rename}>
                <input
                  value={renaming.name}
                  onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  aria-label={`Nowe imię dla ${p.name}`}
                  maxLength={60}
                  autoFocus
                  required
                />
                <button className="btn small" disabled={busy}>Zapisz</button>
                <button type="button" className="btn ghost small" onClick={() => setRenaming(null)}>Anuluj</button>
              </form>
            ) : (
              <>
                <span className="who"><span aria-hidden="true">{p.drawnAt ? '✅' : '⏳'}</span> {p.name}</span>
                <span className="when">{p.drawnAt ? fmt(p.drawnAt) : 'jeszcze nie losował/a'}</span>
                {editing ? (
                  <span className="row-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={busy}
                      onClick={() => setRenaming({ id: p.id, name: p.name })}
                      aria-label={`Zmień imię: ${p.name}`}
                    >
                      Zmień imię
                    </button>
                    <button
                      type="button"
                      className="btn danger small"
                      disabled={busy || !canRemove}
                      onClick={() => remove(p)}
                      aria-label={`Usuń: ${p.name}`}
                    >
                      Usuń
                    </button>
                  </span>
                ) : (
                  renderExtra?.(p)
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <>
          {!canRemove && <p className="hint">Losowanie musi mieć co najmniej {MIN_PEOPLE} osoby, więc nikogo więcej nie usuniesz.</p>}
          <form className="add-person" onSubmit={add}>
            <label className="field">
              <span>Dodaj osobę</span>
              <div className="copy-row">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Imię" maxLength={60} required />
                <button className="btn small" disabled={busy || !newName.trim()}>+ Dodaj</button>
              </div>
            </label>
          </form>
          <p className="hint">
            Zmiana imienia nie zmienia par. Po dodaniu lub usunięciu osoby pary tych, którzy jeszcze nie losowali,
            są losowane od nowa — kto już losował, zachowuje swój wynik.
          </p>
        </>
      )}
    </>
  );
}
