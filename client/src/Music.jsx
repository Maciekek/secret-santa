import { useEffect, useRef, useState } from 'react';

/*
 * Kolędy w tle — nagrania zespołów US Air Force Band (dzieła rządu USA = domena publiczna,
 * źródło: Wikimedia Commons, szczegóły w README). Pliki w client/public/music.
 * Domyślnie wyłączone: przeglądarki blokują autoplay, a WCAG 1.4.2 wymaga możliwości wyłączenia dźwięku.
 */
const TRACKS = [
  '/music/good-king-wenceslas.mp3',
  '/music/jingle-bells.mp3',
  '/music/o-christmas-tree.mp3',
  '/music/deck-the-halls.mp3',
  '/music/joy-to-the-world.mp3',
];
const VOLUME = 0.5;

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
    a.play().then(() => fadeTo(VOLUME)).catch(() => setOn(false));
  }

  function toggle() {
    if (on) {
      fadeTo(0, () => audio.current.pause());
      setOn(false);
    } else {
      play();
      setOn(true);
    }
  }

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
