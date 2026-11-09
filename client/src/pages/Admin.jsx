import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { adminToken, links } from '../storage.js';
import CopyField from '../CopyField.jsx';
import { useTitle } from '../useTitle.js';
import StatusList from '../StatusList.jsx';

export default function Admin() {
  const [token, setToken] = useState(adminToken.get);
  useTitle('Biuro Mikołaja');

  const logout = useCallback(() => {
    adminToken.set(null);
    setToken(null);
  }, []);

  if (!token) return <Login onLogin={(t) => { adminToken.set(t); setToken(t); }} />;
  return <Dashboard token={token} onUnauthorized={logout} />;
}

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      onLogin((await api.login(password)).token);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1 className="festive">Biuro Mikołaja 🧝</h1>
      <label className="field">
        <span>Hasło</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn">Zaloguj</button>
    </form>
  );
}

function Dashboard({ token, onUnauthorized }) {
  const [draws, setDraws] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const guard = useCallback(
    (err) => (err.status === 401 ? onUnauthorized() : setError(err.message)),
    [onUnauthorized],
  );

  const loadList = useCallback(() => api.adminDraws(token).then(setDraws).catch(guard), [token, guard]);
  useEffect(() => { loadList(); }, [loadList]);

  if (selected) {
    return <DrawDetails token={token} slug={selected} guard={guard} onBack={() => { setSelected(null); loadList(); }} />;
  }

  return (
    <div className="card">
      <div className="row-between">
        <h1 className="festive">Biuro Mikołaja</h1>
        <button className="btn ghost small" onClick={onUnauthorized}>Wyloguj</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!draws ? (
        <p>Wczytuję…</p>
      ) : draws.length === 0 ? (
        <p className="muted">Brak losowań.</p>
      ) : (
        <ul className="draws">
          {draws.map((d) => (
            <li key={d.slug}>
              <button className="draw-row" onClick={() => setSelected(d.slug)}>
                <span className="who">{d.drawn === d.total ? '🎉' : '🎄'} {d.name}</span>
                <span className="when">{d.drawn}/{d.total} wylosowało</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DrawDetails({ token, slug, guard, onBack }) {
  const [data, setData] = useState(null);

  const load = useCallback(() => api.adminDraw(token, slug).then(setData).catch(guard), [token, slug, guard]);
  useEffect(() => { load(); }, [load]);

  async function reshuffle() {
    if (!window.confirm('Rozlosować pary od nowa? Wszystkie dotychczasowe wyniki przepadną.')) return;
    api.adminReshuffle(token, slug).then((r) => setData({ ...data, ...r })).catch(guard);
  }

  async function remove() {
    if (!window.confirm(`Usunąć losowanie „${data.name}” na zawsze?`)) return;
    api.adminDelete(token, slug).then(onBack).catch(guard);
  }

  if (!data) return <div className="card"><p>Wczytuję…</p></div>;

  return (
    <div className="card">
      <button className="btn ghost small" onClick={onBack}>← Wszystkie losowania</button>
      <h1 className="festive">{data.name}</h1>
      <CopyField label="🔗 Link do losowania" value={links.draw(slug)} />
      <StatusList
        participants={data.participants}
        renderExtra={(p) => <PeekButton token={token} slug={slug} participant={p} guard={guard} />}
      />
      <p className="hint">Pary są zaszyfrowane w bazie. Żeby podejrzeć, kogo ktoś ma, przytrzymaj 🔒 — po puszczeniu znika.</p>
      <div className="actions">
        <button className="btn ghost small" onClick={load}>Odśwież</button>
        <button className="btn danger small" onClick={reshuffle}>Losuj od nowa</button>
        <button className="btn danger small" onClick={remove}>Usuń</button>
      </div>
    </div>
  );
}

/** Pokazuje parę tylko podczas przytrzymania — nic nie widać „na twarz”. */
function PeekButton({ token, slug, participant, guard }) {
  const [target, setTarget] = useState(null);
  const holding = useRef(false);

  async function down(e) {
    e.preventDefault();
    if (holding.current) return; // auto-repeat klawisza
    holding.current = true;
    try {
      const res = await api.adminReveal(token, slug, participant.id);
      if (holding.current) setTarget(res.target);
    } catch (err) {
      guard(err);
    }
  }

  function up() {
    holding.current = false;
    setTarget(null);
  }

  return (
    <button
      type="button"
      className={`peek ${target ? 'shown' : ''}`}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && down(e)}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && up()}
      onBlur={up}
      onContextMenu={(e) => e.preventDefault()}
      title="Przytrzymaj (myszą lub spacją), aby podejrzeć"
      aria-label={target ? `${participant.name} robi prezent dla: ${target}` : `Przytrzymaj, aby podejrzeć parę: ${participant.name}`}
    >
      {target ? `🎁 ${target}` : '🔒'}
    </button>
  );
}
