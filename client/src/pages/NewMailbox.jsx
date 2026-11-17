import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { links, myMailboxes } from '../storage.js';
import CopyField from '../CopyField.jsx';
import Share from '../Share.jsx';
import { useTitle } from '../useTitle.js';

export default function NewMailbox() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  useTitle('Listy do Świętego Mikołaja');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.createMailbox(name);
      const entry = { slug: res.slug, key: res.organizerKey, name: name.trim(), createdAt: new Date().toISOString() };
      myMailboxes.add(entry);
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
        <h1 className="festive">Skrzynka gotowa! 📮</h1>
        <p>
          <strong>{created.name}</strong> — wyślij link rodzinie. Każdy napisze swój list do Mikołaja i wrzuci go do
          skrzynki, a potem będzie można je razem poczytać.
        </p>
        <CopyField label="🔗 Link do skrzynki — wyślij rodzinie" value={links.mailbox(created.slug)} />
        <Share url={links.mailbox(created.slug)} text={`✉️ ${created.name} — napisz list do Świętego Mikołaja:`} />
        <CopyField label="🗝️ Twój link organizatora — zachowaj dla siebie" value={links.mailboxOrganizer(created.slug, created.key)} />
        <p className="hint">Z linkiem organizatora możesz usuwać listy i całą skrzynkę. Zapisaliśmy go też w tej przeglądarce.</p>
        <div className="actions">
          <Link className="btn" to={`/p/${created.slug}/organizator#${created.key}`}>Otwórz skrzynkę</Link>
          <button className="btn ghost" onClick={() => { setCreated(null); setName(''); }}>Nowa skrzynka</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <Link className="back-link" to="/">← Wróć</Link>
      <h1 className="festive">Listy do Mikołaja ✉️</h1>
      <p>
        Załóż wspólną skrzynkę na listy do Świętego Mikołaja. Każdy — dzieci, dziadkowie, ciocie — napisze swój list,
        a w skrzynce będzie można je otwierać i czytać.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Nazwa skrzynki</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Listy Kowalskich 2026" maxLength={60} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn big" disabled={busy || !name.trim()}>
          {busy ? 'Elfy montują skrzynkę…' : 'Utwórz skrzynkę 📮'}
        </button>
      </form>
    </div>
  );
}
