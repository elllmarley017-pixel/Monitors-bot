const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Enkripsi teks menggunakan AES-256-GCM.
 * @param {string} text Teks yang akan dienkripsi
 * @param {string} secretHex Kunci rahasia 32-byte hex (64 karakter)
 * @returns {{ iv: string, authTag: string, content: string }}
 */
function encrypt(text, secretHex) {
  if (!text || typeof text !== 'string') {
    throw new Error('Teks untuk enkripsi harus berupa string');
  }
  const key = Buffer.from(secretHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Kunci enkripsi harus berukuran 32 bytes (64 karakter hex)');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    content: encrypted,
  };
}

/**
 * Dekripsi data terenkripsi AES-256-GCM.
 * @param {{ iv: string, authTag: string, content: string }} encrypted
 * @param {string} secretHex
 * @returns {string}
 */
function decrypt(encrypted, secretHex) {
  if (!encrypted || !encrypted.iv || !encrypted.authTag || !encrypted.content) {
    throw new Error('Format data terenkripsi tidak valid');
  }
  const key = Buffer.from(secretHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Kunci enkripsi harus berukuran 32 bytes (64 karakter hex)');
  }

  const iv = Buffer.from(encrypted.iv, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
};
