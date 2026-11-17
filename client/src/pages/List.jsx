import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { adminToken, itemKeys, links, myLists, myName } from '../storage.js';
import CopyField from '../CopyField.jsx';
import Share from '../Share.jsx';
import Psst from '../Psst.jsx';
import { useTitle } from '../useTitle.js';
import { formatDateTime } from '../date.js';

const AVATARS = ['🎅', '🤶', '🧝', '⛄', '🦌', '👼', '🐧', '🍪'];
const lower = (s) => s.toLocaleLowerCase('pl');

/** Lista „kto co przynosi”. `asOrganizer` — wejście z linku organizatora (albo admin). */
export default function List({ asOrganizer = false }) {
  const { slug } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  // Nagłówki organizatora: klucz z linku / z tej przeglądarki, a w ostateczności sesja admina.
  const orgKey = asOrganizer ? hash.slice(1) || myLists.all().find((l) => l.slug === slug)?.key || '' : '';
  const token = asOrganizer ? adminToken.get() : null;
  // Gość, który sam założył tę listę w tej przeglądarce — podpowiemy mu panel organizatora.
  const savedOrgKey = asOrganizer ? '' : myLists.all().find((l) => l.slug === slug)?.key || '';
  const orgAuth = orgKey ? { 'x-organizer-key': orgKey } : token ? { authorization: `Bearer ${token}` } : null;

  const [data, setData] = useState(null);
  const [keys, setKeys] = useState(() => itemKeys.all(slug));
  // Ostatnio wpisane imię — podpowiadamy je w polach „Kto przyniesie?”.
  const [name, setName] = useState(myName.get);
  const emptyRow = () => ({ title: '', note: '' });
  // Kilka rzeczy naraz — każda osobno (zamiast „sałatka, ciasto, kompot” w jednym polu).
  const [form, setForm] = useState({ rows: [emptyRow()], who: null }); // who: null = ostatnio wpisane imię
  const titleInputs = useRef([]);
  const [claiming, setClaiming] = useState(null); // { id, who } — „Ja przyniosę” rozwinięte w wierszu
  const [needed, setNeeded] = useState('');
  const [editing, setEditing] = useState(null); // { id, title, note, who }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  useTitle(data ? `🥟 ${data.name}` : null);

  const organizer = Boolean(data?.organizer);

  const load = useCallback(() => {
    api
      .getList(slug, orgAuth ?? undefined)
      .then((d) => {
        setData(d);
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, orgKey, token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // Organizator z linku: zapamiętaj listę w tej przeglądarce.
  useEffect(() => {
    if (data?.organizer && orgKey) myLists.add({ slug, key: orgKey, name: data.name, createdAt: data.createdAt });
  }, [data, slug, orgKey]);

  const authFor = (item) => (organizer ? orgAuth : { 'x-item-key': keys[item.id] || '' });
  const canEdit = (item) => organizer || Boolean(keys[item.id]);

  function rememberKey(id, key) {
    if (!key) return;
    itemKeys.set(slug, id, key);
    setKeys(itemKeys.all(slug));
  }

  function forgetKey(id) {
    itemKeys.remove(slug, id);
    setKeys(itemKeys.all(slug));
  }

  function rememberName(value) {
    setName(value);
    myName.set(value);
  }

  async function run(action, success) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await action();
      if (res?.items) setData((d) => ({ ...d, items: res.items }));
      if (success) setNotice(success);
      return res;
    } catch (err) {
      setError(err.message);
      if (err.status === 404 || err.status === 409) load();
      return null;
    } finally {
      setBusy(false);
    }
  }

  const bringer = (form.who ?? name).trim();

  async function add(e) {
    e.preventDefault();
    if (!bringer) {
      setError('Wpisz, kto to przyniesie.');
      return;
    }
    const rows = form.rows.map((r) => ({ title: r.title.trim(), note: r.note.trim() })).filter((r) => r.title);
    if (!rows.length) return;
    const dups = rows
      .map((r) => data.items.find((i) => lower(i.title) === lower(r.title)))
      .filter(Boolean)
      .map((d) => `„${d.title}”${d.who ? ` (przynosi ${d.who})` : ''}`);
    if (dups.length && !window.confirm(`Już jest na liście: ${dups.join(', ')}. Dodać mimo to?`)) return;

    // Po kolei, żeby każda rzecz dostała swój klucz; przy błędzie w formularzu zostają tylko niedodane.
    const added = [];
    await run(async () => {
      let last;
      for (const r of rows) {
        last = await api.addItem(slug, null, { title: r.title, note: r.note, who: bringer });
        rememberKey(last.id, last.key);
        added.push(r.title);
      }
      return last;
    }, `Dopisane: ${bringer} — ${rows.map((r) => r.title).join(', ')}. Dziękujemy! 🎄`);
    if (added.length < rows.length) load(); // część poszła, część nie — pokaż aktualny stan
    if (added.length) {
      rememberName(bringer);
      const left = rows.slice(added.length);
      setForm({ rows: left.length ? left : [emptyRow()], who: null });
    }
  }

  function updateRow(i, changes) {
    setForm((f) => ({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...changes } : r)) }));
  }

  function addRow() {
    setForm((f) => ({ ...f, rows: [...f.rows, emptyRow()] }));
    setTimeout(() => titleInputs.current[form.rows.length]?.focus(), 0);
  }

  function removeRow(i) {
    setForm((f) => ({ ...f, rows: f.rows.length > 1 ? f.rows.filter((_, j) => j !== i) : [emptyRow()] }));
  }

  async function addNeeded(e) {
    e.preventDefault();
    const res = await run(() => api.addItem(slug, orgAuth, { title: needed, requested: true }));
    if (res) setNeeded('');
  }

  async function claim(e) {
    e.preventDefault();
    const item = data.items.find((i) => i.id === claiming.id);
    const who = claiming.who.trim();
    const res = await run(() => api.claimItem(slug, item.id, who), `Super! ${item.title} — przynosi ${who}. 🥟`);
    if (res) {
      rememberKey(item.id, res.key);
      rememberName(who);
      setClaiming(null);
    }
  }

  async function unclaim(item) {
    if (!window.confirm(`Zrezygnować z: ${item.title}? Wróci na listę potrzebnych rzeczy.`)) return;
    if (await run(() => api.unclaimItem(slug, authFor(item), item.id))) forgetKey(item.id);
  }

  async function remove(item) {
    if (!window.confirm(`Usunąć z listy: ${item.title}?`)) return;
    if (await run(() => api.removeItem(slug, authFor(item), item.id))) forgetKey(item.id);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const item = data.items.find((i) => i.id === editing.id);
    const changes = { title: editing.title, note: editing.note };
    if (organizer) changes.who = editing.who;
    if (await run(() => api.editItem(slug, authFor(item), item.id, changes))) setEditing(null);
  }

  async function deleteList() {
    if (!window.confirm(`Usunąć całą listę „${data.name}” na zawsze?`)) return;
    if (await run(() => api.deleteList(slug, orgAuth))) {
      myLists.remove(slug);
      navigate('/');
    }
  }

  if (loadError && !data) return <div className="card center"><p className="error">{loadError}</p></div>;
  if (!data) return <div className="card center"><p>Wczytuję… 🛷</p></div>;

  const open = data.items.filter((i) => !i.who);
  const taken = data.items.filter((i) => i.who);
  const people = [];
  for (const item of taken) {
    let group = people.find((g) => lower(g.who) === lower(item.who));
    if (!group) people.push((group = { who: item.who, items: [] }));
    group.items.push(item);
  }

  const itemRow = (item, { inGroup }) =>
    claiming?.id === item.id ? (
      <li key={item.id} className="item">
        <form className="item-edit" onSubmit={claim}>
          <span className="item-title">{item.title}</span>
          <label className="field">
            <span>Kto przyniesie?</span>
            <input
              value={claiming.who}
              onChange={(e) => setClaiming({ ...claiming, who: e.target.value })}
              placeholder="Wpisz swoje imię"
              maxLength={60}
              required
              autoFocus
            />
          </label>
          <div className="row-actions">
            <button className="btn small" disabled={busy || !claiming.who.trim()}>Potwierdź</button>
            <button type="button" className="btn ghost small" onClick={() => setClaiming(null)}>Anuluj</button>
          </div>
        </form>
      </li>
    ) : editing?.id === item.id ? (
      <li key={item.id} className="item">
        <form className="item-edit" onSubmit={saveEdit}>
          <label className="field">
            <span>Co</span>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={80} required autoFocus />
          </label>
          <label className="field">
            <span>Uwagi</span>
            <input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} maxLength={120} placeholder="np. na 10 osób" />
          </label>
          {organizer && (
            <label className="field">
              <span>Kto przynosi</span>
              <input
                value={editing.who}
                onChange={(e) => setEditing({ ...editing, who: e.target.value })}
                maxLength={60}
                placeholder={item.requested ? 'puste = jeszcze potrzebne' : ''}
                required={!item.requested}
              />
            </label>
          )}
          <div className="row-actions">
            <button className="btn small" disabled={busy}>Zapisz</button>
            <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Anuluj</button>
          </div>
        </form>
      </li>
    ) : (
      <li key={item.id} className={`item ${keys[item.id] ? 'mine' : ''}`}>
        <span className="item-text">
          <span className="item-title">{item.title}</span>
          {item.note && <span className="item-note">{item.note}</span>}
          {keys[item.id] && inGroup && <span className="item-badge">dodane przez Ciebie</span>}
          {organizer && <span className="item-date">dodane {formatDateTime(item.createdAt)}</span>}
        </span>
        <span className="row-actions">
          {!inGroup && (
            <button type="button" className="btn small" disabled={busy} onClick={() => { setEditing(null); setClaiming({ id: item.id, who: name }); }}>
              Ja przyniosę
            </button>
          )}
          {canEdit(item) && (
            <button
              type="button"
              className="btn ghost small"
              disabled={busy}
              onClick={() => { setClaiming(null); setEditing({ id: item.id, title: item.title, note: item.note, who: item.who ?? '' }); }}
              aria-label={`Zmień: ${item.title}`}
            >
              Zmień
            </button>
          )}
          {canEdit(item) && inGroup && item.requested && (
            <button type="button" className="btn danger small" disabled={busy} onClick={() => unclaim(item)} aria-label={`Rezygnuję z: ${item.title}`}>
              Rezygnuję
            </button>
          )}
          {(organizer || (canEdit(item) && !item.requested)) && (
            <button type="button" className="btn danger small" disabled={busy} onClick={() => remove(item)} aria-label={`Usuń: ${item.title}`}>
              Usuń
            </button>
          )}
        </span>
      </li>
    );

  return (
    <>
      <div className="card list-card">
        <h1 className="festive">{data.name}</h1>
        {organizer ? (
          <>
            <p className="muted intro">Panel organizatora — możesz dopisywać potrzebne rzeczy i poprawiać wszystkie wpisy.</p>
            <p className="muted intro">Lista założona {formatDateTime(data.createdAt)}</p>
            <CopyField label="🔗 Link do listy — wyślij rodzinie" value={links.list(slug)} />
            <Share url={links.list(slug)} text={`🥟 ${data.name} — wpisz, co przyniesiesz:`} />
            {orgKey && (
              <>
                <CopyField label="🗝️ Twój link organizatora — zachowaj dla siebie" value={links.listOrganizer(slug, orgKey)} />
                <p className="hint">Nie wysyłaj go rodzinie — kto go ma, może zmieniać i usuwać wszystkie wpisy.</p>
              </>
            )}
          </>
        ) : (
          <>
            <p className="intro">Zobacz, co już ktoś przynosi, i dopisz siebie. Dzięki temu nie będzie trzech makowców i zero barszczu. 🙂</p>
            {savedOrgKey && (
              <div className="notice">
                <p>🗝️ Ta lista została założona w tej przeglądarce.</p>
                <div className="notice-action">
                  <Link className="btn small" to={`/l/${slug}/organizator#${savedOrgKey}`}>Otwórz panel organizatora</Link>
                </div>
              </div>
            )}
          </>
        )}
        {asOrganizer && !organizer && <p className="error">Nieprawidłowy link organizatora — widzisz listę jak gość.</p>}

        {error && <p className="error" role="alert">{error}</p>}
        <p className="ok" role="status">{notice}</p>
      </div>

      {(open.length > 0 || organizer) && (
        <div className="card list-card">
          <h2>Jeszcze potrzebne 🙏</h2>
          {open.length === 0 ? (
            <p className="muted">Wszystko ma już kogoś. 🎉</p>
          ) : (
            <ul className="items">{open.map((i) => itemRow(i, { inGroup: false }))}</ul>
          )}
          {organizer && (
            <form className="add-person" onSubmit={addNeeded}>
              <label className="field">
                <span>Dopisz, czego potrzeba</span>
                <div className="copy-row">
                  <input value={needed} onChange={(e) => setNeeded(e.target.value)} placeholder="np. Kompot z suszu" maxLength={80} required />
                  <button className="btn small" disabled={busy || !needed.trim()}>+ Dodaj</button>
                </div>
              </label>
            </form>
          )}
        </div>
      )}

      <div className="card list-card">
        <h2>Kto co przynosi 🍲</h2>
        {people.length === 0 ? (
          <p className="muted">Jeszcze nikt się nie wpisał. Bądź pierwszy!</p>
        ) : (
          <ul className="groups">
            {people.map((g, gi) => (
              <li key={g.who} className="group">
                <h3 className="group-who">
                  <span className="avatar small green" aria-hidden="true">{AVATARS[gi % AVATARS.length]}</span>
                  <span className="group-name">{g.who}</span>
                </h3>
                <ul className="items">{g.items.map((i) => itemRow(i, { inGroup: true }))}</ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="card list-card" onSubmit={add}>
        <h2>Dopisz do listy ✍️</h2>
        <fieldset className="add-rows">
          <legend>Co przyniesiesz?</legend>
          <p className="hint">Każdą rzecz wpisz osobno — przyciskiem „+” dodasz kolejną.</p>
          <ol className="add-list">
            {form.rows.map((r, i) => (
              <li key={i} className="add-row">
                <div className="add-row-fields">
                  <input
                    ref={(el) => (titleInputs.current[i] = el)}
                    value={r.title}
                    onChange={(e) => updateRow(i, { title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && i === form.rows.length - 1 && r.title.trim()) {
                        e.preventDefault();
                        addRow();
                      }
                    }}
                    placeholder={['np. Sernik', 'np. Kompot', 'np. Śledzie'][i % 3]}
                    aria-label={`Rzecz ${i + 1}`}
                    maxLength={80}
                    required={i === 0}
                  />
                  <input
                    value={r.note}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    placeholder="uwagi (nieobowiązkowe)"
                    aria-label={`Uwagi do rzeczy ${i + 1}`}
                    maxLength={120}
                    className="add-row-note"
                  />
                </div>
                {form.rows.length > 1 && (
                  <button type="button" className="icon" onClick={() => removeRow(i)} aria-label={`Usuń rzecz ${i + 1}${r.title.trim() ? ` (${r.title.trim()})` : ''}`}>✕</button>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className="btn ghost small" onClick={addRow}>+ Dodaj kolejną rzecz</button>
        </fieldset>
        <label className="field">
          <span>Kto przyniesie?</span>
          <input
            value={form.who ?? name}
            onChange={(e) => setForm({ ...form, who: e.target.value })}
            placeholder="Wpisz swoje imię"
            maxLength={60}
            required
          />
        </label>
        <p className="hint">Możesz wpisać siebie albo kogoś innego — np. że wujek Zbyszek przyniesie śledzie.</p>
        <button className="btn big" disabled={busy || !form.rows.some((r) => r.title.trim()) || !bringer}>
          {form.rows.filter((r) => r.title.trim()).length > 1 ? 'Dopisz wszystko ✨' : 'Dopisz do listy ✨'}
        </button>
      </form>

      {organizer && (
        <div className="card list-card">
          <h2>Ustawienia listy</h2>
          <div className="actions">
            <button className="btn ghost small" onClick={load}>Odśwież</button>
            <button className="btn danger small" onClick={deleteList}>Usuń całą listę</button>
          </div>
        </div>
      )}

      {!organizer && !savedOrgKey && <Psst />}
    </>
  );
}
