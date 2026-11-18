/*
 * Powiadomienia push na telefon organizatora przez ntfy (https://ntfy.sh, darmowa aplikacja Android/iOS).
 * Kliknięcie powiadomienia otwiera WhatsApp z gotową wiadomością dla rodziny — wystarczy wybrać grupę.
 *
 * Włączenie: NTFY_TOPIC=<trudna-do-zgadnięcia-nazwa> w .env, a w aplikacji ntfy subskrypcja tego tematu.
 * Opcjonalnie: NTFY_URL (własny serwer ntfy), NTFY_TOKEN (temat z hasłem),
 * NTFY_EVENTS=listy,lista,losowanie (domyślnie tylko nowe listy do Mikołaja).
 */

export function createNotifier(env = process.env) {
  const topic = (env.NTFY_TOPIC || '').trim();
  const server = (env.NTFY_URL || 'https://ntfy.sh').replace(/\/+$/, '');
  const events = new Set((env.NTFY_EVENTS || 'listy').split(',').map((s) => s.trim()).filter(Boolean));
  const enabled = Boolean(topic);
  if (enabled) console.log(`[ntfy] powiadomienia włączone: ${server}/${topic} (${[...events].join(', ')})`);

  /**
   * @param event   'listy' | 'lista' | 'losowanie'
   * @param title   nagłówek powiadomienia
   * @param message treść powiadomienia
   * @param share   tekst wiadomości na WhatsApp (z linkiem) — kliknięcie powiadomienia go otwiera
   * @param url     link „Otwórz” (strona w aplikacji)
   */
  async function notify(event, { title, message, share, url }) {
    if (!enabled || !events.has(event)) return;
    const whatsapp = share ? `https://wa.me/?text=${encodeURIComponent(share)}` : undefined;
    const actions = [
      whatsapp && { action: 'view', label: 'Wyślij na WhatsApp', url: whatsapp },
      url && { action: 'view', label: 'Otwórz', url },
    ].filter(Boolean);
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.NTFY_TOKEN ? { authorization: `Bearer ${env.NTFY_TOKEN}` } : {}),
        },
        // JSON (a nie nagłówki) — polskie znaki w tytule działają tylko tak
        body: JSON.stringify({ topic, title, message, tags: ['christmas_tree'], click: whatsapp || url, actions }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) console.warn(`[ntfy] ${res.status} ${await res.text().catch(() => '')}`);
    } catch (err) {
      console.warn(`[ntfy] nie wysłano: ${err.message}`);
    }
  }

  return { enabled, notify };
}
