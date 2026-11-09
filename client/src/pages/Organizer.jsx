import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { links, myDraws } from '../storage.js';
import CopyField from '../CopyField.jsx';
import { useTitle } from '../useTitle.js';
import StatusList from '../StatusList.jsx';

export default function Organizer() {
  const { slug } = useParams();
  const { hash } = useLocation();
  const key = hash.slice(1) || myDraws.all().find((d) => d.slug === slug)?.key || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useTitle(data ? `Organizator: ${data.name}` : null);

  const load = useCallback(() => {
    api.manage(slug, key).then(setData).catch((err) => setError(err.message));
  }, [slug, key]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (data) myDraws.add({ slug, key, name: data.name, createdAt: data.createdAt });
  }, [data, slug, key]);

  async function reshuffle() {
    const anyDrawn = data.participants.some((p) => p.drawnAt);
    const msg = anyDrawn
      ? 'Ktoś już losował! Ponowne losowanie unieważni WSZYSTKIE dotychczasowe wyniki i każdy będzie musiał losować od nowa. Kontynuować?'
      : 'Rozlosować pary od nowa?';
    if (!window.confirm(msg)) return;
    try {
      setData({ ...data, ...(await api.organizerReshuffle(slug, key)) });
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="card center"><p className="error">{error}</p></div>;
  if (!data) return <div className="card center"><p>Wczytuję… 🛷</p></div>;

  return (
    <div className="card">
      <h1 className="festive">{data.name}</h1>
      <p className="muted">Panel organizatora — widzisz kto losował, ale nie kogo wylosował. 🤫</p>
      <CopyField label="🔗 Link do losowania" value={links.draw(slug)} />
      <StatusList participants={data.participants} />
      <div className="actions">
        <button className="btn ghost small" onClick={load}>Odśwież</button>
        <button className="btn danger small" onClick={reshuffle}>Losuj pary od nowa</button>
      </div>
    </div>
  );
}
