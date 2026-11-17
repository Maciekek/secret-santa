export const SITE = {
  title: 'Gwiazdka — świąteczny organizator: losowanie prezentów i lista, kto co przynosi',
  description:
    'Darmowy świąteczny organizator dla rodziny i przyjaciół: losowanie prezentów na Wigilię, wspólna lista, kto co przynosi, i listy do Świętego Mikołaja. Załóż, wyślij link — bez rejestracji.',
};

const PAGES = {
  '/losowanie': {
    title: 'Losowanie prezentów online — Gwiazdka',
    description:
      'Darmowe losowanie prezentów na Wigilię. Załóż losowanie, wyślij link — każdy wylosuje osobę, której zrobi prezent pod choinkę. Nikt nie wylosuje siebie.',
  },
  '/poczta': {
    title: 'Listy do Świętego Mikołaja online — Gwiazdka',
    description:
      'Wspólna skrzynka na listy do Świętego Mikołaja. Każdy pisze swój list i wrzuca go do skrzynki, a reszta może je przeczytać. Bez rejestracji.',
  },
    '/lista': {
    title: 'Kto co przynosi na Wigilię — wspólna lista — Gwiazdka',
    description:
      'Wspólna lista na święta: każdy wpisuje, co przyniesie, i widzi, czego jeszcze brakuje. Bez dublowania sałatek i bez rejestracji.',
  },
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Meta dla danej ścieżki SPA. `find.draw(slug)` / `find.list(slug)` → nazwa albo null. */
export function metaFor(pathname, find) {
  if (pathname === '/') return { status: 200, ...SITE, robots: 'index, follow' };
  if (PAGES[pathname]) return { status: 200, ...PAGES[pathname], robots: 'index, follow' };

  if (pathname === '/admin') {
    return { status: 200, title: 'Biuro Mikołaja — Gwiazdka', description: SITE.description, robots: 'noindex, nofollow' };
  }

  const m = pathname.match(/^\/d\/([\w-]+)(\/organizator)?\/?$/);
  if (m) {
    const name = find.draw(m[1]);
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

  const l = pathname.match(/^\/l\/([\w-]+)(\/organizator)?\/?$/);
  if (l) {
    const name = find.list(l[1]);
    if (!name) return { status: 404, title: 'Nie ma takiej listy — Gwiazdka', description: SITE.description, robots: 'noindex' };
    return l[2]
      ? { status: 200, title: `Organizator: ${name} — Gwiazdka`, description: 'Panel organizatora listy „kto co przynosi”.', robots: 'noindex, nofollow' }
      : {
          status: 200,
          title: `🥟 ${name} — kto co przynosi`,
          description: 'Wpisz, co przyniesiesz na święta, i zobacz, czego jeszcze brakuje. 🎄',
          robots: 'noindex, nofollow',
        };
  }

  const p = pathname.match(/^\/p\/([\w-]+)(\/organizator)?\/?$/);
  if (p) {
    const name = find.mailbox?.(p[1]);
    if (!name) return { status: 404, title: 'Nie ma takiej skrzynki — Gwiazdka', description: SITE.description, robots: 'noindex' };
    return p[2]
      ? { status: 200, title: `Organizator: ${name} — Gwiazdka`, description: 'Panel organizatora skrzynki na listy do Mikołaja.', robots: 'noindex, nofollow' }
      : {
          status: 200,
          title: `✉️ ${name} — listy do Mikołaja`,
          description: 'Napisz list do Świętego Mikołaja i wrzuć go do wspólnej skrzynki. 🎅',
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
  <url><loc>${origin}/losowanie</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${origin}/lista</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${origin}/poczta</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>
`;
