export const SITE = {
  title: 'Gwiazdka — świąteczne losowanie prezentów online',
  description:
    'Darmowe losowanie prezentów na Wigilię dla rodziny i przyjaciół. Załóż losowanie, wyślij link — każdy wylosuje osobę, której zrobi prezent pod choinkę. Bez rejestracji.',
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Meta dla danej ścieżki SPA. `findDrawName(slug)` → nazwa losowania albo null. */
export function metaFor(pathname, findDrawName) {
  if (pathname === '/') return { status: 200, ...SITE, robots: 'index, follow' };

  if (pathname === '/admin') {
    return { status: 200, title: 'Biuro Mikołaja — Gwiazdka', description: SITE.description, robots: 'noindex, nofollow' };
  }

  const m = pathname.match(/^\/d\/([\w-]+)(\/organizator)?\/?$/);
  if (m) {
    const name = findDrawName(m[1]);
    if (!name) return { status: 404, title: 'Nie ma takiego losowania — Gwiazdka', description: SITE.description, robots: 'noindex' };
    return m[2]
      ? { status: 200, title: `Organizator: ${name} — Gwiazdka`, description: 'Panel organizatora losowania prezentów.', robots: 'noindex, nofollow' }
      : {
          status: 200,
          title: `🎁 ${name} — losowanie prezentów`,
          description: 'Wejdź, wybierz swoje imię i wylosuj osobę, której zrobisz prezent pod choinkę. 🎄',
          robots: 'noindex, nofollow',
        };
  }

  return { status: 404, title: 'Nie znaleziono — Gwiazdka', description: SITE.description, robots: 'noindex' };
}

export function renderHtml(template, { origin, pathname, title, description, robots }) {
  const url = origin + (pathname === '/' ? '/' : pathname);
  return template
    .replaceAll('__TITLE__', escapeHtml(title))
    .replaceAll('__DESCRIPTION__', escapeHtml(description))
    .replaceAll('__ROBOTS__', robots)
    .replaceAll('__URL__', escapeHtml(url))
    .replaceAll('__ORIGIN__', escapeHtml(origin));
}

// /d/ celowo NIE jest zablokowane: boty podglądu linków (Messenger, WhatsApp, X) respektują robots.txt
// i bez dostępu nie pokażą podglądu. Przed indeksowaniem chroni noindex (meta + X-Robots-Tag).
export const robotsTxt = (origin) =>
  `User-agent: *\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;

export const sitemapXml = (origin) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`;
