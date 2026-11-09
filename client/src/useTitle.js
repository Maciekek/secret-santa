import { useEffect } from 'react';

const SUFFIX = 'Gwiazdka';

/** Tytuł karty przy nawigacji w SPA (pierwsze wejście ustawia serwer). */
export function useTitle(title) {
  useEffect(() => {
    if (title) document.title = title.includes(SUFFIX) ? title : `${title} — ${SUFFIX}`;
  }, [title]);
}
