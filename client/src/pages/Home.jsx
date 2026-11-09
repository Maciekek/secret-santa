import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { links, myDraws } from '../storage.js';
import CopyField from '../CopyField.jsx';
import { useTitle } from '../useTitle.js';

export default function Home() {
  const [name, setName] = useState('');
  const [people, setPeople] = useState(['', '', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const inputs = useRef([]);
  useTitle('Gwiazdka — świąteczne losowanie prezentów online');

  const filled = people.map((p) => p.trim()).filter(Boolean);

  function update(i, value) {
    setPeople((list) => list.map((p, j) => (j === i ? value : p)));
  }

  function addPerson(focus = true) {
    setPeople((list) => [...list, '']);
    if (focus) setTimeout(() => inputs.current[people.length]?.focus(), 0);
  }

  function remove(i) {
    setPeople((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : ['']));
  }

  function onKeyDown(e, i) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === people.length - 1) addPerson();
    else inputs.current[i + 1]?.focus();
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.createDraw(name, filled);
      const entry = { slug: res.slug, key: res.organizerKey, name: name.trim(), createdAt: new Date().toISOString() };
      myDraws.add(entry);
      setCreated(entry);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="card">
        <h1 className="festive">Losowanie gotowe! 🎁</h1>
        <p>
          <strong>{created.name}</strong> — pary już rozlosowane i zamknięte w worku Mikołaja. Nikt (nawet Ty) ich nie
          widzi.
        </p>
        <CopyField label="🔗 Link do losowania — wyślij rodzinie" value={links.draw(created.slug)} />
        <CopyField label="🗝️ Twój link organizatora — zachowaj dla siebie" value={links.organizer(created.slug, created.key)} />
        <p className="hint">
          Link organizatora pokazuje, kto już losował (ale nie kogo wylosował). Zapisaliśmy go też w tej przeglądarce.
        </p>
        <div className="actions">
          <Link className="btn" to={`/d/${created.slug}/organizator#${created.key}`}>Panel organizatora</Link>
          <button className="btn ghost" onClick={() => { setCreated(null); setName(''); setPeople(['', '', '']); }}>
            Nowe losowanie
          </button>
        </div>
      </div>
    );
  }

  const mine = myDraws.all();

  return (
    <>
      <div className="card">
        <h1 className="festive">Kto komu robi prezent? 🎄</h1>
        <p>Załóż losowanie dla rodziny lub przyjaciół, dodaj osoby i wyślij im link. Każdy wylosuje jedną osobę — nikt siebie.</p>

        <form onSubmit={submit}>
          <label className="field">
            <span>Nazwa losowania</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Wigilia u Kowalskich 2026"
              maxLength={60}
              required
            />
          </label>

          <fieldset>
            <legend>Uczestnicy ({filled.length})</legend>
            <ul className="people">
              {people.map((p, i) => (
                <li key={i}>
                  <span className="bullet" aria-hidden="true">{['🎅', '🤶', '🦌', '⛄', '🧝', '🎁'][i % 6]}</span>
                  <input
                    ref={(el) => (inputs.current[i] = el)}
                    value={p}
                    onChange={(e) => update(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    placeholder={`Osoba ${i + 1}`}
                    aria-label={`Imię osoby ${i + 1}`}
                    maxLength={60}
                  />
                  <button type="button" className="icon" onClick={() => remove(i)} aria-label={`Usuń osobę ${i + 1}${p.trim() ? ` (${p.trim()})` : ''}`}>✕</button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn ghost small" onClick={() => addPerson()}>+ Dodaj osobę</button>
          </fieldset>

          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn big" disabled={busy || filled.length < 3 || !name.trim()}>
            {busy ? 'Elfy losują…' : 'Utwórz losowanie ✨'}
          </button>
          {filled.length < 3 && <p className="hint">Potrzeba co najmniej 3 osób.</p>}
        </form>
      </div>

      {mine.length > 0 && (
        <div className="card">
          <h2>Twoje losowania</h2>
          <ul className="plain">
            {mine.map((d) => (
              <li key={d.slug}>
                <Link to={`/d/${d.slug}/organizator#${d.key}`}>{d.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
