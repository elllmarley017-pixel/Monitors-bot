/**
 * Salin berkas ini menjadi config.local.js, lalu isi nilai sebenarnya.
 * config.local.js diabaikan git dan tidak pernah diunggah.
 */
module.exports = {
  // Token bot dari @BotFather
  BOT_TOKEN: 'ISI_TOKEN_BOT_DARI_BOTFATHER',

  // Telegram User ID pemilik bot
  OWNER_ID: 123456789,

  // Kunci enkripsi 32-byte hex (64 karakter) untuk API key di database
  // Buat dengan: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_SECRET: 'ISI_64_KARAKTER_HEX',
};
