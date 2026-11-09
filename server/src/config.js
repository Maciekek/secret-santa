const isProd = process.env.NODE_ENV === 'production';

function required(name, devFallback) {
  const value = process.env[name];
  if (value) return value;
  if (!isProd) return devFallback;
  throw new Error(`Brak wymaganej zmiennej środowiskowej ${name}`);
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || './data/gwiazdka.db',
  // Klucz do szyfrowania przypisań w bazie i podpisywania tokenów admina.
  secret: required('APP_SECRET', 'dev-secret-nie-uzywac-na-produkcji'),
  adminPassword: required('ADMIN_PASSWORD', 'admin'),
  staticDir: process.env.STATIC_DIR || null,
  // Publiczny adres (og:url, og:image, canonical, sitemap). Bez niego — host z żądania.
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null,
};

if (isProd && config.secret.length < 32) {
  throw new Error('APP_SECRET musi mieć co najmniej 32 znaki');
}
