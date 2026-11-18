import { useEffect } from 'react';
import { api } from './api.js';
import { adminToken } from './storage.js';

/**
 * Jedno zgłoszenie „wejście” do dziennika aktywności na wejście na stronę (nie przy odświeżaniu co 15 s).
 * Wizyty zalogowanego admina serwer pomija.
 */
export function useVisit(area, slug, { kind, actor, details } = {}) {
  useEffect(() => {
    if (!slug) return;
    api.visit(area, slug, { kind, actor, details, adminToken: adminToken.get() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, slug, kind, details]);
}
