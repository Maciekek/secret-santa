import { useEffect, useRef, useState } from 'react';

/*
 * Kolędy grane syntezatorem (Web Audio) — bez plików audio i bez praw autorskich:
 * wszystkie melodie są w domenie publicznej. Barwa: pozytywka / dzwoneczki.
 * Domyślnie wyłączone (przeglądarki i tak blokują autoplay, a WCAG 1.4.2 wymaga kontroli).
 */

// [nuta, długość w ćwierćnutach]; 'R' = pauza
const SONGS = [
  {
    name: 'Jingle Bells',
    bpm: 150,
    notes: [
      ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
      ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
      ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1], ['D5', 2], ['G5', 2],
      ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4],
      ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
      ['G5', 1], ['G5', 1], ['F5', 1], ['D5', 1], ['C5', 4],
    ],
  },
  {
    name: 'Cicha noc',
    bpm: 100, // ćwierćnuta z kropką ≈ 1.5
    notes: [
      ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['D5', 2], ['D5', 1], ['B4', 3],
      ['C5', 2], ['C5', 1], ['G4', 3],
      ['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1],
      ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1],
      ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['D5', 2], ['D5', 1], ['F5', 1.5], ['D5', 0.5], ['B4', 1],
      ['C5', 3], ['E5', 3],
      ['C5', 1.5], ['G4', 0.5], ['E4', 1], ['G4', 1.5], ['F4', 0.5], ['D4', 1],
      ['C4', 6],
    ],
  },
  {
    name: 'We Wish You a Merry Christmas',
    bpm: 140,
    notes: [
      ['G4', 1],
      ['C5', 1], ['C5', 0.5], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 1], ['A4', 1], ['A4', 1],
      ['D5', 1], ['D5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['B4', 1], ['G4', 1], ['G4', 1],
      ['E5', 1], ['E5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 1], ['A4', 1], ['G4', 0.5], ['G4', 0.5],
      ['A4', 1], ['D5', 1], ['B4', 1], ['C5', 3],
    ],
  },
];

const SEMITONES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function freq(note) {
  const [, letter, sharp, octave] = note.match(/^([A-G])(#?)(\d)$/);
  const n = SEMITONES[letter] + (sharp ? 1 : 0) + (Number(octave) - 4) * 12;
  return 440 * 2 ** (n / 12);
}

/** Jeden dźwięk pozytywki: sinus + delikatne alikwoty, szybki atak, długie wybrzmienie. */
function bell(ctx, out, time, hz, beat) {
  const env = ctx.createGain();
  const ring = Math.max(beat * 1.6, 0.9);
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(0.35, time + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, time + ring);
  env.connect(out);

  for (const [mult, level, type] of [[1, 1, 'sine'], [2, 0.25, 'sine'], [3, 0.08, 'triangle']]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz * mult;
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(time);
    osc.stop(time + ring + 0.05);
  }
}

/** Planuje całą piosenkę od `start`; zwraca czas jej końca. */
function schedule(ctx, out, song, start) {
  const beat = 60 / song.bpm;
  let t = start;
  for (const [note, len] of song.notes) {
    if (note !== 'R') bell(ctx, out, t, freq(note), len * beat);
    t += len * beat;
  }
  return t;
}

export default function Music() {
  const [on, setOn] = useState(false);
  const player = useRef(null);

  function start() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // głośność całości + lekkie echo dla „przestrzeni”
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1);
    master.connect(ctx.destination);
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();
    delay.delayTime.value = 0.28;
    feedback.gain.value = 0.25;
    master.connect(delay).connect(feedback).connect(delay);
    feedback.connect(ctx.destination);

    const p = { ctx, master, song: Math.floor(Math.random() * SONGS.length), timer: null };
    const next = (at) => {
      const end = schedule(ctx, master, SONGS[p.song], at);
      p.song = (p.song + 1) % SONGS.length;
      // dociągamy następną kolędę ~1 s przed końcem obecnej, z 2 s przerwy
      p.timer = setTimeout(() => next(end + 2), (end - ctx.currentTime - 1) * 1000);
    };
    next(ctx.currentTime + 0.1);
    player.current = p;
  }

  function stop() {
    const p = player.current;
    if (!p) return;
    player.current = null;
    clearTimeout(p.timer);
    const now = p.ctx.currentTime;
    p.master.gain.cancelScheduledValues(now);
    p.master.gain.setValueAtTime(p.master.gain.value, now);
    p.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    setTimeout(() => p.ctx.close(), 500);
  }

  function toggle() {
    if (on) stop();
    else start();
    setOn(!on);
  }

  // karta w tle → pauza; sprzątanie przy odmontowaniu
  useEffect(() => {
    const onVisibility = () => {
      const ctx = player.current?.ctx;
      if (ctx) document.hidden ? ctx.suspend() : ctx.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  return (
    <button type="button" className="music" onClick={toggle}>
      <span aria-hidden="true">{on ? '🔔' : '🎵'}</span> {on ? 'Wyłącz kolędy' : 'Włącz kolędy'}
    </button>
  );
}
