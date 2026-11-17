import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { adminToken, letterKeys, links, myMailboxes, myName, readLetters } from '../storage.js';
import CopyField from '../CopyField.jsx';
import Share from '../Share.jsx';
import Psst from '../Psst.jsx';
import { useTitle } from '../useTitle.js';
import { formatDateTime } from '../date.js';

const MAX_BODY = 3000;

/** Skrzynka z listami do Świętego Mikołaja. `asOrganizer` — wejście z linku organizatora (albo admin). */
export default function Mailbox({ asOrganizer = false }) {
  const { slug } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  const orgKey = asOrganizer ? hash.slice(1) || myMailboxes.all().find((m) => m.slug === slug)?.key || '' : '';
  const token = asOrganizer ? adminToken.get() : null;
  const orgAuth = orgKey ? { 'x-organizer-key': orgKey } : token ? { authorization: `Bearer ${token}` } : null;
  const savedOrgKey = asOrganizer ? '' : myMailboxes.all().find((m) => m.slug === slug)?.key || '';

  const [data, setData] = useState(null);
  const [keys, setKeys] = useState(() => letterKeys.all(slug));
  const [read, setRead] = useState(() => readLetters.all(slug));
  const [tab, setTab] = useState('write'); // 'write' | 'inbox'
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(() => ({ author: myName.get(), body: '' }));
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(null); // { author, body }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  useTitle(data ? `✉️ ${data.name}` : null);

  const organizer = Boolean(data?.organizer);

  const load = useCallback(() => {
    api
      .getMailbox(slug, orgAuth ?? undefined)
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

  useEffect(() => {
    if (data?.organizer && orgKey) myMailboxes.add({ slug, key: orgKey, name: data.name, createdAt: data.createdAt });
  }, [data, slug, orgKey]);

  const canEdit = (letter) => organizer || Boolean(keys[letter.id]);
  const authFor = (letter) => (organizer ? orgAuth : { 'x-item-key': keys[letter.id] || '' });

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const res = await action();
      if (res?.letters) setData((d) => ({ ...d, letters: res.letters }));
      return res;
    } catch (err) {
      setError(err.message);
      if (err.status === 404) load();
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function send(e) {
    e.preventDefault();
    const res = await run(() => api.sendLetter(slug, { author: form.author, body: form.body }));
    if (res) {
      letterKeys.set(slug, res.id, res.key);
      setKeys(letterKeys.all(slug));
      myName.set(form.author.trim());
      setForm({ author: form.author, body: '' });
      setSent(true);
    }
  }

  function open(letter) {
    setOpenId(letter.id);
    setEditing(null);
    readLetters.add(slug, letter.id);
    setRead(readLetters.all(slug));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveEdit(e) {
    e.preventDefault();
    const letter = data.letters.find((l) => l.id === openId);
    if (await run(() => api.editLetter(slug, authFor(letter), letter.id, editing))) setEditing(null);
  }

  async function remove(letter) {
    if (!window.confirm(`Usunąć list od: ${letter.author}?`)) return;
    if (await run(() => api.removeLetter(slug, authFor(letter), letter.id))) {
      letterKeys.remove(slug, letter.id);
      setKeys(letterKeys.all(slug));
      setOpenId(null);
    }
  }

  async function deleteMailbox() {
    if (!window.confirm(`Usunąć całą skrzynkę „${data.name}” razem ze wszystkimi listami?`)) return;
    if (await run(() => api.deleteMailbox(slug, orgAuth))) {
      myMailboxes.remove(slug);
      navigate('/');
    }
  }

  function showTab(next) {
    setTab(next);
    setOpenId(null);
    setSent(false);
    setError('');
  }

  if (loadError && !data) return <div className="card center"><p className="error">{loadError}</p></div>;
  if (!data) return <div className="card center"><p>Wczytuję… 🛷</p></div>;

  const letters = data.letters;
  const opened = letters.find((l) => l.id === openId);
  const isRead = (l) => read.includes(l.id) || Boolean(keys[l.id]); // własny list = przeczytany
  const unread = letters.filter((l) => !isRead(l)).length;

  return (
    <>
      <div className="card list-card">
        <h1 className="festive">{data.name}</h1>
        {organizer ? (
          <>
            <p className="muted intro">Panel organizatora — możesz usuwać listy i całą skrzynkę.</p>
            <p className="muted intro">Skrzynka założona {formatDateTime(data.createdAt)}</p>
            <CopyField label="🔗 Link do skrzynki — wyślij rodzinie" value={links.mailbox(slug)} />
            <Share url={links.mailbox(slug)} text={`✉️ ${data.name} — napisz list do Świętego Mikołaja:`} />
            {orgKey && (
              <>
                <CopyField label="🗝️ Twój link organizatora — zachowaj dla siebie" value={links.mailboxOrganizer(slug, orgKey)} />
                <p className="hint">Nie wysyłaj go rodzinie — kto go ma, może usuwać listy.</p>
              </>
            )}
          </>
        ) : (
          <>
            <p className="intro">Napisz list do Świętego Mikołaja i wrzuć go do skrzynki. Listy innych możesz otworzyć i przeczytać. 🎅</p>
            {savedOrgKey && (
              <div className="notice">
                <p>🗝️ Ta skrzynka została założona w tej przeglądarce.</p>
                <div className="notice-action">
                  <Link className="btn small" to={`/p/${slug}/organizator#${savedOrgKey}`}>Otwórz panel organizatora</Link>
                </div>
              </div>
            )}
          </>
        )}
        {asOrganizer && !organizer && <p className="error">Nieprawidłowy link organizatora — widzisz skrzynkę jak gość.</p>}

        <div className="tabs" role="tablist" aria-label="Skrzynka">
          <button type="button" role="tab" aria-selected={tab === 'write'} className={`tab ${tab === 'write' ? 'active' : ''}`} onClick={() => showTab('write')}>
            <span aria-hidden="true">✍️</span> Napisz list
          </button>
          <button type="button" role="tab" aria-selected={tab === 'inbox'} className={`tab ${tab === 'inbox' ? 'active' : ''}`} onClick={() => showTab('inbox')}>
            <span aria-hidden="true">📬</span> Skrzynka ({letters.length})
            {unread > 0 && <span className="tab-badge">nowe: {unread}</span>}
          </button>
        </div>
      </div>

      {error && <div className="card"><p className="error" role="alert">{error}</p></div>}

      {tab === 'write' &&
        (sent ? (
          <div className="card center">
            <div className="sent-icon" aria-hidden="true">✉️</div>
            <h2 className="festive">List poleciał do Laponii!</h2>
            <p role="status">Mikołaj już go czyta. Twój list jest też w skrzynce — możesz go jeszcze poprawić.</p>
            <div className="actions centered">
              <button className="btn" onClick={() => showTab('inbox')}>📬 Zobacz skrzynkę</button>
              <button className="btn ghost" onClick={() => setSent(false)}>Napisz kolejny list</button>
            </div>
          </div>
        ) : (
          <form className="card letter-paper" onSubmit={send}>
            <h2 className="festive letter-head">Drogi Święty Mikołaju…</h2>
            <label className="field">
              <span>Treść listu</span>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={10}
                maxLength={MAX_BODY}
                placeholder={'W tym roku byłem/am bardzo grzeczny/a…\nMarzę o…'}
                required
              />
            </label>
            <p className="hint counter">{form.body.length} / {MAX_BODY}</p>
            <label className="field">
              <span>Podpis — od kogo?</span>
              <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="np. Zosia, lat 6" maxLength={60} required />
            </label>
            <p className="hint">Listy w skrzynce mogą przeczytać wszyscy, którzy mają link.</p>
            <button className="btn big" disabled={busy || !form.body.trim() || !form.author.trim()}>
              {busy ? 'Renifery już lecą…' : 'Wyślij list ✉️'}
            </button>
          </form>
        ))}

      {tab === 'inbox' && opened && (
        <article className="card letter-paper">
          <button className="btn ghost small" onClick={() => setOpenId(null)}>← Wróć do skrzynki</button>
          {editing ? (
            <form onSubmit={saveEdit}>
              <label className="field">
                <span>Treść listu</span>
                <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={10} maxLength={MAX_BODY} required autoFocus />
              </label>
              <label className="field">
                <span>Podpis</span>
                <input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} maxLength={60} required />
              </label>
              <div className="row-actions">
                <button className="btn small" disabled={busy}>Zapisz</button>
                <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Anuluj</button>
              </div>
            </form>
          ) : (
            <>
              <h2 className="festive letter-head">List od: {opened.author}</h2>
              <p className="muted letter-date">
                {formatDateTime(opened.createdAt)}
                {opened.updatedAt && ' · poprawiony'}
              </p>
              <div className="letter-body">{opened.body}</div>
              <p className="letter-sign">— {opened.author}</p>
              {canEdit(opened) && (
                <div className="actions">
                  <button className="btn ghost small" disabled={busy} onClick={() => setEditing({ author: opened.author, body: opened.body })}>
                    Popraw list
                  </button>
                  <button className="btn danger small" disabled={busy} onClick={() => remove(opened)}>Usuń list</button>
                </div>
              )}
            </>
          )}
        </article>
      )}

      {tab === 'inbox' && !opened && (
        <div className="card list-card">
          <h2>Skrzynka odbiorcza 📬</h2>
          {letters.length === 0 ? (
            <p className="muted intro">Pusto… Mikołaj czeka na pierwszy list! ✍️</p>
          ) : (
            <ul className="envelopes">
              {letters.map((l) => {
                const done = isRead(l);
                return (
                  <li key={l.id}>
                    <button type="button" className={`envelope ${done ? 'read' : ''} ${keys[l.id] ? 'mine' : ''}`} onClick={() => open(l)}>
                      <span className="envelope-icon" aria-hidden="true">{done ? '📭' : '💌'}</span>
                      <span className="envelope-from">{l.author}</span>
                      <span className="envelope-date">{formatDateTime(l.createdAt)}</span>
                      <span className="envelope-note">{keys[l.id] ? 'Twój list' : done ? 'przeczytany' : 'otwórz'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {organizer && (
        <div className="card">
          <h2>Ustawienia skrzynki</h2>
          <div className="actions">
            <button className="btn ghost small" onClick={load}>Odśwież</button>
            <button className="btn danger small" onClick={deleteMailbox}>Usuń całą skrzynkę</button>
          </div>
        </div>
      )}

      {!organizer && !savedOrgKey && <Psst />}
    </>
  );
}
