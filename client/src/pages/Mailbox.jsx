import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { adminToken, letterKeys, links, myMailboxes, myName, readLetters } from '../storage.js';
import CopyField from '../CopyField.jsx';
import Share from '../Share.jsx';
import Psst from '../Psst.jsx';
import { useTitle } from '../useTitle.js';
import { formatDateTime } from '../date.js';
import { useVisit } from '../visit.js';

const MAX_BODY = 3000;

/**
 * Skrzynka z listami do Świętego Mikołaja. Widok z adresu:
 * `/p/:slug` — pisanie, `/p/:slug/skrzynka` — skrzynka odbiorcza, `/p/:slug/skrzynka/:letterId` — otwarty list.
 * `asOrganizer` — to samo pod `/p/:slug/organizator/…` (link organizatora albo admin).
 */
export default function Mailbox({ asOrganizer = false, view = 'write' }) {
  const { slug, letterId } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  const orgKey = asOrganizer ? hash.slice(1) || myMailboxes.all().find((m) => m.slug === slug)?.key || '' : '';
  const token = asOrganizer ? adminToken.get() : null;
  const orgAuth = orgKey ? { 'x-organizer-key': orgKey } : token ? { authorization: `Bearer ${token}` } : null;
  const savedOrgKey = asOrganizer ? '' : myMailboxes.all().find((m) => m.slug === slug)?.key || '';

  const [data, setData] = useState(null);
  const [keys, setKeys] = useState(() => letterKeys.all(slug));
  const [read, setRead] = useState(() => readLetters.all(slug));
  const base = asOrganizer ? `/p/${slug}/organizator` : `/p/${slug}`;
  const tab = view; // 'write' | 'inbox'
  const openId = letterId ? Number(letterId) : null;
  const [form, setForm] = useState(() => ({ author: myName.get(), body: '' }));
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(null); // { author, body }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  useTitle(data ? (view === 'inbox' ? `📬 ${data.name} — skrzynka odbiorcza` : `✉️ ${data.name}`) : null);

  const organizer = Boolean(data?.organizer);
  const loggedOpen = useRef(null);
  useVisit('skrzynka', letterId ? null : slug, { kind: view === 'inbox' ? 'wejście do skrzynki odbiorczej' : 'wejście (pisanie listu)' });

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
    setEditing(null);
    navigate(`${base}/skrzynka/${letter.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Otwarty list (także z linku) = przeczytany w tej przeglądarce.
  useEffect(() => {
    if (!openId) loggedOpen.current = null;
    const letter = data?.letters.find((l) => l.id === openId);
    if (!openId || !letter) return;
    // do dziennika raz na otwarcie (dane odświeżają się co 15 s — nie logujemy wtedy ponownie)
    if (loggedOpen.current !== openId) {
      loggedOpen.current = openId;
      api.visit('skrzynka', slug, { letterId: letter.id, adminToken: adminToken.get() });
    }
    readLetters.add(slug, openId);
    setRead(readLetters.all(slug));
  }, [openId, data, slug]);

  // Zmiana widoku z nawigacji: czyścimy komunikaty i tryb edycji.
  useEffect(() => {
    setSent(false);
    setError('');
    setEditing(null);
  }, [view, openId]);

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
      navigate(`${base}/skrzynka`);
    }
  }

  async function deleteMailbox() {
    if (!window.confirm(`Usunąć całą skrzynkę „${data.name}” razem ze wszystkimi listami?`)) return;
    if (await run(() => api.deleteMailbox(slug, orgAuth))) {
      myMailboxes.remove(slug);
      navigate('/');
    }
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
            <CopyField label="📬 Link prosto do skrzynki odbiorczej — żeby poczytać listy" value={links.mailboxInbox(slug)} />
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

        <nav className="tabs" aria-label="Skrzynka">
          <Link to={base} className={`tab ${tab === 'write' ? 'active' : ''}`} aria-current={tab === 'write' ? 'page' : undefined}>
            <span aria-hidden="true">✍️</span> Napisz list
          </Link>
          <Link to={`${base}/skrzynka`} className={`tab ${tab === 'inbox' ? 'active' : ''}`} aria-current={tab === 'inbox' && !openId ? 'page' : undefined}>
            <span aria-hidden="true">📬</span> Skrzynka odbiorcza ({letters.length})
            {unread > 0 && <span className="tab-badge">nowe: {unread}</span>}
          </Link>
        </nav>
      </div>

      {error && <div className="card"><p className="error" role="alert">{error}</p></div>}

      {tab === 'write' &&
        (sent ? (
          <div className="card center">
            <div className="sent-icon" aria-hidden="true">✉️</div>
            <h2 className="festive">List poleciał do Laponii!</h2>
            <p role="status">Mikołaj już go czyta. Twój list jest też w skrzynce — możesz go jeszcze poprawić.</p>
            <div className="actions centered">
              <Link className="btn" to={`${base}/skrzynka`}>📬 Zobacz skrzynkę</Link>
              <button className="btn ghost" onClick={() => setSent(false)}>Napisz kolejny list</button>
            </div>
          </div>
        ) : (
          <form className="card letter-view" onSubmit={send}>
            <div className="parchment parchment-write">
              <h2 className="parchment-greeting">Drogi Święty Mikołaju,</h2>
              <label className="parchment-field">
                <span className="parchment-label">Treść listu</span>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  maxLength={MAX_BODY}
                  placeholder={'w tym roku byłem/am bardzo grzeczny/a…\nMarzę o…'}
                  required
                />
              </label>
              <p className="parchment-counter">{form.body.length} / {MAX_BODY}</p>
              <label className="parchment-field parchment-signature">
                <span className="parchment-label">Podpis — od kogo?</span>
                <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="np. Zosia, lat 6" maxLength={60} required />
              </label>
              <span className="wax-seal" aria-hidden="true">🎅</span>
            </div>
            <p className="hint">Listy w skrzynce mogą przeczytać wszyscy, którzy mają link.</p>
            <button className="btn big" disabled={busy || !form.body.trim() || !form.author.trim()}>
              {busy ? 'Renifery już lecą…' : 'Wyślij list ✉️'}
            </button>
          </form>
        ))}

      {tab === 'inbox' && opened && (
        <article className="card letter-view">
          <Link className="btn ghost small" to={`${base}/skrzynka`}>← Wróć do skrzynki</Link>
          {editing ? (
            <form onSubmit={saveEdit}>
              <div className="parchment parchment-write">
                <p className="parchment-greeting">Drogi Święty Mikołaju,</p>
                <label className="parchment-field">
                  <span className="parchment-label">Treść listu</span>
                  <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={8} maxLength={MAX_BODY} required autoFocus />
                </label>
                <p className="parchment-counter">{editing.body.length} / {MAX_BODY}</p>
                <label className="parchment-field parchment-signature">
                  <span className="parchment-label">Podpis</span>
                  <input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} maxLength={60} required />
                </label>
                <span className="wax-seal" aria-hidden="true">🎅</span>
              </div>
              <div className="row-actions">
                <button className="btn small" disabled={busy}>Zapisz</button>
                <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Anuluj</button>
              </div>
            </form>
          ) : (
            <>
              <h2 className="sr-only">List od: {opened.author}</h2>
              <div className="parchment">
                <p className="parchment-date">
                  {formatDateTime(opened.createdAt)}
                  {opened.updatedAt && ' · poprawiony'}
                </p>
                {!/^\s*(drogi|kochany|mi[lł]y|szanowny|święty|swiety|mikołaj|mikolaj|hej|cześć|czesc)/i.test(opened.body) && (
                  <p className="parchment-greeting">Drogi Święty Mikołaju,</p>
                )}
                <div className="parchment-body">{opened.body}</div>
                <p className="parchment-sign">{opened.author}</p>
                <span className="wax-seal" aria-hidden="true">🎅</span>
              </div>
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

      {tab === 'inbox' && openId && !opened && (
        <div className="card center">
          <p>Tego listu już nie ma w skrzynce. 📭</p>
          <Link className="btn" to={`${base}/skrzynka`}>Zobacz skrzynkę odbiorczą</Link>
        </div>
      )}

      {tab === 'inbox' && !openId && (
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
