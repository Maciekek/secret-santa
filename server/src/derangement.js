import crypto from 'node:crypto';

/**
 * Losowa permutacja bez punktów stałych (nikt nie losuje siebie).
 * Zwraca tablicę `targets`, gdzie targets[i] to indeks osoby, której prezent robi osoba i.
 * Fisher–Yates + odrzucanie: średnio ~e prób, rozkład jednostajny po wszystkich derangementach.
 */
export function derangement(n) {
  if (n < 2) throw new Error('Potrzeba co najmniej 2 osób');
  for (;;) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (p.every((target, i) => target !== i)) return p;
  }
}
