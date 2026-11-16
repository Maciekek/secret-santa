import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { links, myLists } from '../storage.js';
import CopyField from '../CopyField.jsx';
import { useTitle } from '../useTitle.js';

const EXAMPLES = ['Barszcz', 'Pierogi', 'Karp', 'Makowiec', 'Sałatka jarzynowa', 'Kompot z suszu'];

export default function NewList() {
  const [name, setName] = useState('');
  const [items, setItems] = useState(['', '', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const inputs = useRef([]);
  useTitle('Kto co przynosi — wspólna lista');

  const filled = items.map((p) => p.trim()).filter(Boolean);

  function update(i, value) {
    setItems((list) => list.map((p, j) => (j === i ? value : p)));
  }

  function addItem() {
    setItems((list) => [...list, '']);
    setTimeout(() => inputs.current[items.length]?.focus(), 0);
  }

  function remove(i) {
    setItems((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : ['']));
  }

  function onKeyDown(e, i) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === items.length - 1) addItem();
    else inputs.current[i + 1]?.focus();
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.createList(name, filled);
      const entry = { slug: res.slug, key: res.organizerKey, name: name.trim(), createdAt: new Date().toISOString() };
      myLists.add(entry);
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
        <h1 className="festive">Lista gotowa! 🥟</h1>
        <p>
          <strong>{created.name}</strong> — wyślij link rodzinie. Każdy wpisze, co przyniesie, i zobaczy, czego jeszcze
          brakuje.
        </p>
        <CopyField label="🔗 Link do listy — wyślij rodzinie" value={links.list(created.slug)} />
        <CopyField label="🗝️ Twój link organizatora — zachowaj dla siebie" value={links.listOrganizer(created.slug, created.key)} />
        <p className="hint">
          Z linkiem organizatora możesz dopisywać potrzebne rzeczy i poprawiać wszystkie wpisy. Zapisaliśmy go też w tej
          przeglądarce.
        </p>
        <div className="actions">
          <Link className="btn" to={`/l/${created.slug}/organizator#${created.key}`}>Otwórz listę</Link>
          <button className="btn ghost" onClick={() => { setCreated(null); setName(''); setItems(['', '', '']); }}>
            Nowa lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <Link className="back-link" to="/">← Wróć</Link>
      <h1 className="festive">Kto co przynosi? 🥟</h1>
      <p>Załóż wspólną listę na święta. Goście sami wpiszą, co przyniosą — nic się nie zdubluje.</p>

      <form onSubmit={submit}>
        <label className="field">
          <span>Nazwa listy</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Wigilia u babci 2026"
            maxLength={60}
            required
          />
        </label>

        <fieldset>
          <legend>Czego potrzeba? (nieobowiązkowe)</legend>
          <p className="hint">Wpisz, co trzeba przynieść — goście zgłoszą się do konkretnych rzeczy. Możesz to też dodać później.</p>
          <ul className="people">
            {items.map((p, i) => (
              <li key={i}>
                <span className="bullet" aria-hidden="true">{['🥣', '🥟', '🐟', '🍰', '🥗', '🍹'][i % 6]}</span>
                <input
                  ref={(el) => (inputs.current[i] = el)}
                  value={p}
                  onChange={(e) => update(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  placeholder={`np. ${EXAMPLES[i % EXAMPLES.length]}`}
                  aria-label={`Potrzebna rzecz ${i + 1}`}
                  maxLength={80}
                />
                <button type="button" className="icon" onClick={() => remove(i)} aria-label={`Usuń pozycję ${i + 1}${p.trim() ? ` (${p.trim()})` : ''}`}>✕</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn ghost small" onClick={addItem}>+ Dodaj pozycję</button>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn big" disabled={busy || !name.trim()}>
          {busy ? 'Elfy piszą listę…' : 'Utwórz listę ✨'}
        </button>
      </form>
    </div>
  );
}
