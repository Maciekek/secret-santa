import { randomInt } from 'node:crypto';

const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // bez 0/o, 1/l — łatwiej przepisać z kartki

/** „Wigilia u Babci 2026!” → „wigilia-u-babci-2026” (max ~40 znaków, bez ucinania w pół słowa). */
export function slugify(text, max = 40) {
  const base = text
    .toLocaleLowerCase('pl')
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  return (cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut).replace(/-+$/, '');
}

/**
 * Czytelny, ale niezgadywalny adres: 6 losowych znaków + nazwa (32^6 ≈ 1 mld kombinacji).
 * Link jest jedynym „hasłem” do listy, więc sama nazwa nie wystarczy.
 */
export const readableSlug = (name, fallback) =>
  `${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}-${slugify(name) || fallback}`;
