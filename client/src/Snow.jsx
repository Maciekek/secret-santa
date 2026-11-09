import { useEffect, useMemo, useState } from 'react';

const FLAKES = ['❄', '❅', '❆', '•'];

export default function Snow({ count = 40 }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        char: FLAKES[i % FLAKES.length],
        left: Math.random() * 100,
        size: 0.6 + Math.random() * 1.2,
        duration: 8 + Math.random() * 12,
        delay: -Math.random() * 20,
        drift: (Math.random() - 0.5) * 80,
      })),
    [count],
  );

  return (
    <div className="snow" aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          style={{
            left: `${f.left}%`,
            fontSize: `${f.size}rem`,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            '--drift': `${f.drift}px`,
          }}
        >
          {f.char}
        </span>
      ))}
    </div>
  );
}

const KEY = 'gwiazdka:bez-sniegu';
const readOff = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** WCAG 2.2.2: ruchomą dekorację musi dać się zatrzymać. */
export function SnowToggle() {
  const [off, setOff] = useState(readOff);
  useEffect(() => {
    document.documentElement.classList.toggle('no-snow', off);
    try {
      localStorage.setItem(KEY, off ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [off]);
  return (
    <button type="button" className="snow-toggle" aria-pressed={!off} onClick={() => setOff((v) => !v)}>
      {off ? '❄ Włącz padający śnieg' : '❄ Wyłącz padający śnieg'}
    </button>
  );
}
