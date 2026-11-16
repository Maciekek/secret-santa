import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Wysyłka linku dla rodziny: systemowe „Udostępnij” (telefon: Messenger, WhatsApp, SMS…),
 * bezpośrednio WhatsApp / SMS, oraz kod QR do zeskanowania z ekranu.
 * Tylko dla linków, które wolno rozesłać — nigdy dla linku organizatora.
 */
export default function Share({ url, text }) {
  const [qr, setQr] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.share);
  const message = `${text} ${url}`;

  useEffect(() => {
    if (!showQr || qr) return;
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#2b1d1a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [showQr, qr, url]);

  async function nativeShare() {
    try {
      await navigator.share({ text, url });
    } catch {
      /* anulowane */
    }
  }

  return (
    <div className="share">
      <div className="share-buttons">
        {canShare && (
          <button type="button" className="btn small" onClick={nativeShare}>
            <span aria-hidden="true">📤</span> Udostępnij
          </button>
        )}
        <a className="btn ghost small" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
          WhatsApp
        </a>
        <a className="btn ghost small" href={`sms:?&body=${encodeURIComponent(message)}`}>
          SMS
        </a>
        <button type="button" className="btn ghost small" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
          <span aria-hidden="true">📱</span> {showQr ? 'Schowaj kod QR' : 'Kod QR'}
        </button>
      </div>

      {showQr && (
        <div className="qr">
          {qr ? (
            <>
              <img src={qr} alt={`Kod QR z linkiem: ${url}`} width="240" height="240" />
              <p className="hint">Zeskanuj aparatem w telefonie — otworzy się ta sama strona.</p>
              <a className="btn ghost small" href={qr} download="gwiazdka-kod-qr.png">Pobierz obrazek</a>
            </>
          ) : (
            <p className="hint">{qr === '' ? 'Nie udało się utworzyć kodu QR.' : 'Tworzę kod…'}</p>
          )}
        </div>
      )}
    </div>
  );
}
