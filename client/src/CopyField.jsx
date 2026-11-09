import { useState } from 'react';

export default function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      window.prompt('Skopiuj link:', value);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <label className="copy">
      <span>{label}</span>
      <div className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn small" onClick={copy} aria-live="polite">
          {copied ? 'Skopiowano ✓' : 'Kopiuj'}
        </button>
      </div>
    </label>
  );
}
