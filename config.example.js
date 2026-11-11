module.exports = {
  // Token Telegram Bot dari @BotFather
  BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',

  // Telegram User ID Pemilik Bot
  OWNER_ID: 1234567890,

  // Kunci enkripsi 32-byte hex (64 karakter) untuk AES-256-GCM
  // Buat dengan: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_SECRET: 'YOUR_64_CHAR_HEX_SECRET_KEY_HERE',

  // Lokasi database SQLite
  DB_PATH: './database/pterobot.db',
};
