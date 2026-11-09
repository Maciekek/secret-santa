import crypto from 'node:crypto';

export function createCrypto(secret) {
  const encKey = crypto.createHash('sha256').update(`enc:${secret}`).digest();
  const macKey = crypto.createHash('sha256').update(`mac:${secret}`).digest();

  return {
    /** AES-256-GCM; wynik: base64url(iv | tag | ciphertext). */
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
      const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
    },

    decrypt(payload) {
      const buf = Buffer.from(payload, 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
    },

    hash(value) {
      return crypto.createHmac('sha256', macKey).update(String(value)).digest('base64url');
    },

    issueAdminToken(ttlMs = 12 * 60 * 60 * 1000) {
      const exp = Date.now() + ttlMs;
      return `${exp}.${this.hash(`admin:${exp}`)}`;
    },

    verifyAdminToken(token) {
      if (typeof token !== 'string') return false;
      const [exp, sig] = token.split('.');
      if (!exp || !sig || Number(exp) < Date.now()) return false;
      return safeEqual(sig, this.hash(`admin:${exp}`));
    },
  };
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url');
}
