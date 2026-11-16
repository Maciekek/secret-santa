// SQLite zapisuje datetime('now') w UTC jako „YYYY-MM-DD HH:MM:SS” — pokazujemy w czasie lokalnym.
const parse = (sqlDate) => new Date(`${sqlDate.replace(' ', 'T')}Z`);

/** „16.11.2026, 09:03” */
export const formatDateTime = (sqlDate) =>
  sqlDate
    ? parse(sqlDate).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

/** „16.11.2026” */
export const formatDate = (sqlDate) => (sqlDate ? parse(sqlDate).toLocaleDateString('pl-PL') : '');
