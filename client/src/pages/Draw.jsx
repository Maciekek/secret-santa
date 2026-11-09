import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { myResults } from '../storage.js';
import { useTitle } from '../useTitle.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ROLL_FRAMES = ['Mikołaj grzebie w worku…', 'Elfy sprawdzają listę…', 'Jeszcze chwilka…', 'Mam!'];

export default function Draw() {
  const { slug } = useParams();
  const [draw, setDraw] = useState(null);
  const [results, setResults] = useState(() => myResults.all(slug));
  const [viewing, setViewing] = useState(null); // imię, którego wynik jest pokazany
  const [meId, setMeId] = useState('');
  const [error, setError] = useState('');
  const [rolling, setRolling] = useState(null);
  const timer = useRef();
  useTitle(draw ? `🎁 ${draw.name}` : null);

  function load() {
    return api
      .getDraw(slug)
      .then((d) => {
        setDraw(d);
        // Organizator rozlosował od nowa → wyniki z localStorage tych osób są nieaktualne.
        const saved = myResults.all(slug);
        const valid = saved.filter((r) => d.participants.some((p) => p.name === r.name && p.drawn));
        if (valid.length !== saved.length) {
          myResults.set(slug, valid);
          setResults(valid);
          setError('Losowanie zostało powtórzone przez organizatora — trzeba wylosować jeszcze raz.');
        }
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function start(me) {
    setError('');
    const rollMs = reducedMotion() ? 800 : 2600;

    // Animacja celowo bez imion — nic nie może sugerować, kto kogo ma.
    let i = 0;
    setRolling(ROLL_FRAMES[0]);
    timer.current = setInterval(
      () => setRolling(ROLL_FRAMES[Math.min(++i, ROLL_FRAMES.length - 1)]),
      rollMs / ROLL_FRAMES.length,
    );

    try {
      const [res] = await Promise.all([api.draw(slug, me.id), new Promise((r) => setTimeout(r, rollMs))]);
      const entry = { name: res.name, target: res.target, drawnAt: new Date().toISOString() };
      myResults.add(slug, entry);
      setResults(myResults.all(slug));
      setViewing(res.name);
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(timer.current);
      setRolling(null);
      setMeId('');
      load();
    }
  }

  function backToList() {
    setViewing(null);
    setMeId('');
    setError('');
    load();
  }

  if (!draw) {
    return (
      <div className="card center" role="status">
        {error ? <p className="error">{error}</p> : <p>Wczytuję saniami… 🛷</p>}
      </div>
    );
  }

  if (rolling) {
    return (
      <div className="card center">
        <h1 className="sr-only">Trwa losowanie</h1>
        <div className="sack" aria-hidden="true">🎅</div>
        <div className="gifts-fly" aria-hidden="true">
          <span>🎁</span><span>🧸</span><span>⭐</span><span>🍪</span><span>🎁</span>
        </div>
        <p className="roller" role="status" aria-live="polite">{rolling}</p>
      </div>
    );
  }

  const shown = results.find((r) => r.name === viewing);
  if (shown) return <Result result={shown} drawName={draw.name} onNext={backToList} anyoneLeft={draw.participants.some((p) => !p.drawn)} />;

  const me = draw.participants.find((p) => String(p.id) === meId);

  // Krok 2: potwierdzenie i losowanie
  if (me) {
    return (
      <div className="card center">
        <div className={`avatar big ${tone(me.id)}`} aria-hidden="true">{avatar(me.id)}</div>
        <FocusHeading as="h1" className="festive">Cześć, {me.name}!</FocusHeading>
        <p className="lead">Mikołaj ma w worku imię osoby, której zrobisz prezent pod choinkę.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn big" onClick={() => start(me)}>Losuj! 🎁</button>
        <button className="btn ghost back" onClick={backToList}>
          ← To nie ja, wróć
        </button>
      </div>
    );
  }

  // Krok 1: kim jesteś?
  const free = draw.participants.filter((p) => !p.drawn);
  const mine = new Set(results.map((r) => r.name));

  return (
    <div className="card">
      <h1 className="festive">{draw.name}</h1>

      {free.length === 0 ? (
        <p className="ok">Wszyscy już wylosowali. Wesołych Świąt! 🎉</p>
      ) : (
        <>
          <FocusHeading className="question">Kim jesteś? 🎅</FocusHeading>
          <p className="lead">Kliknij swoje imię.</p>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      <ul className="players">
        {draw.participants.map((p) => {
          const isMine = mine.has(p.name);
          const disabled = p.drawn && !isMine;
          return (
            <li key={p.id}>
              <button
                type="button"
                className={`player ${isMine ? 'mine' : ''}`}
                disabled={disabled}
                aria-label={
                  isMine ? `${p.name} — pokaż mój wynik` : p.drawn ? `${p.name} — już losował(a)` : `${p.name} — losuj`
                }
                onClick={() => {
                  setError('');
                  if (isMine) setViewing(p.name);
                  else setMeId(String(p.id));
                }}
              >
                <span className={`avatar ${tone(p.id)}`} aria-hidden="true">
                  {isMine ? '🎁' : p.drawn ? '✓' : avatar(p.id)}
                </span>
                <span className="player-name">{p.name}</span>
                {isMine && <span className="player-note">pokaż mój wynik</span>}
                {disabled && <span className="player-note">już losował/a</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {free.length > 0 && (
        <p className="hint">
          Wybierz tylko siebie. Z jednego komputera może losować kilka osób — każda po kolei klika swoje imię.
        </p>
      )}
    </div>
  );
}

/** Nagłówek, który dostaje fokus po zmianie kroku — czytnik ekranu ogłasza nowy widok. */
function FocusHeading({ as: Tag = 'h2', className, children }) {
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);
  return (
    <Tag ref={ref} tabIndex={-1} className={className}>
      {children}
    </Tag>
  );
}

const AVATARS = ['🎅', '🤶', '🦌', '⛄', '🧝', '🐧', '🦊', '🐻‍❄️', '👼', '🍪', '🧸', '⭐'];
const TONES = ['red', 'green', 'gold'];
const avatar = (id) => AVATARS[id % AVATARS.length];
const tone = (id) => TONES[id % TONES.length];

function Result({ result, drawName, onNext, anyoneLeft }) {
  return (
    <div className="card center">
      <FocusHeading as="h1" className="festive">Ho ho ho, {result.name}!</FocusHeading>
      <p className="muted">{drawName}</p>
      <p className="lead">W tym roku robisz prezent dla:</p>
      <div className="gift">
        <span className="gift-name"><span aria-hidden="true">🎁 </span>{result.target}</span>
      </div>
      <p className="hint">
        Zapamiętaj lub zapisz to imię. Wynik zostaje też w tej przeglądarce — zobaczysz go ponownie, klikając swoje imię.
      </p>
      <button className="btn big" onClick={onNext}>
        {anyoneLeft ? 'Losuje następna osoba' : 'Wróć do listy'}
      </button>
      {anyoneLeft && <p className="hint">Wynik się schowa, zanim następna osoba usiądzie do komputera.</p>}
    </div>
  );
}
