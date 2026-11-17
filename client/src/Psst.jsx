import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'gwiazdka:psst-ukryte';

/** Mała karteczka w rogu: „Psst… załóż własną”. Można ją zamknąć (pamiętane w przeglądarce). */
export default function Psst() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  if (hidden) return null;

  function close() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="psst" aria-label="Podpowiedź">
      <button type="button" className="psst-close" onClick={close} aria-label="Zamknij podpowiedź">✕</button>
      <p className="psst-title">Psst… 🤫</p>
      <p>
        Też organizujesz święta? Załóż własne losowanie prezentów, listę „kto co przynosi” albo skrzynkę na listy do
        Mikołaja — za darmo i bez rejestracji. Wyślesz rodzinie link i po kłopocie.
      </p>
      <Link className="btn small" to="/">Zobacz, jak to działa ✨</Link>
    </aside>
  );
}
