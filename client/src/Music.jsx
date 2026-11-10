import { useEffect, useRef, useState } from 'react';

/*
 * Kolędy w tle — nagrania zespołów US Air Force Band (dzieła rządu USA = domena publiczna,
 * źródło: Wikimedia Commons, szczegóły w README). Pliki w client/public/music.
 * Startuje sama: od razu, jeśli przeglądarka pozwoli, a jeśli nie (blokada autoplay) — przy pierwszym
 * kliknięciu / klawiszu na stronie. Kto wyłączy, temu już sama nie włączy (localStorage).
 * Przycisk zawsze widoczny (WCAG 1.4.2).
 */
const TRACKS = [
  '/music/good-king-wenceslas.mp3',
  '/music/jingle-bells.mp3',
  '/music/o-christmas-tree.mp3',
  '/music/deck-the-halls.mp3',
  '/music/joy-to-the-world.mp3',
];
const VOLUME = 0.5;
const PREF = 'gwiazdka:muzyka';

const pref = {
  get: () => { try { return localStorage.getItem(PREF); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(PREF, v); } catch { /* ignore */ } },
};

export default function Music() {
  const [on, setOn] = useState(false);
  const audio = useRef(null);
  const track = useRef(Math.floor(Math.random() * TRACKS.length));
  const fade = useRef(null);

  function fadeTo(target, done) {
    clearInterval(fade.current);
    const a = audio.current;
    fade.current = setInterval(() => {
      const v = target > a.volume ? Math.min(target, a.volume + 0.05) : Math.max(target, a.volume - 0.05);
      a.volume = v;
      if (v === target) {
        clearInterval(fade.current);
        done?.();
      }
    }, 50);
  }

  function play() {
    const a = audio.current;
    if (!a.src) a.src = TRACKS[track.current];
    a.volume = 0;
    const p = a.play();
    p.then(() => fadeTo(VOLUME)).catch(() => setOn(false));
    return p;
  }

  function toggle() {
    if (on) {
      fadeTo(0, () => audio.current.pause());
      setOn(false);
      pref.set('off');
    } else {
      play();
      setOn(true);
      pref.set('on');
    }
  }

  // autostart: od razu albo przy pierwszej interakcji
  useEffect(() => {
    if (pref.get() === 'off') return;
    let alive = true;
    const events = ['pointerdown', 'keydown'];
    const stopWaiting = () => events.forEach((e) => document.removeEventListener(e, onFirst, true));
    function onFirst(e) {
      stopWaiting();
      if (e.target.closest?.('.music')) return; // klik w sam przycisk obsłuży toggle
      setOn(true);
      play();
    }
    setOn(true);
    play().catch(() => {
      if (alive) events.forEach((e) => document.addEventListener(e, onFirst, true));
    });
    return () => {
      alive = false;
      stopWaiting();
    };
  }, []);

  function next() {
    track.current = (track.current + 1) % TRACKS.length;
    audio.current.src = TRACKS[track.current];
    audio.current.play().catch(() => setOn(false));
  }

  // karta w tle → pauza, powrót → gra dalej
  useEffect(() => {
    const onVisibility = () => {
      if (!on) return;
      if (document.hidden) audio.current.pause();
      else play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [on]);

  useEffect(() => () => clearInterval(fade.current), []);

  return (
    <>
      <audio ref={audio} preload="none" onEnded={next} />
      <button type="button" className="music" onClick={toggle}>
        <span aria-hidden="true">{on ? '🔔' : '🎵'}</span> {on ? 'Wyłącz kolędy' : 'Włącz kolędy'}
      </button>
    </>
  );
}
