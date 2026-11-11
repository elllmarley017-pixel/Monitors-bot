const config = require('./config');
const { initDb, closeDb } = require('./database/db');
const { createBot } = require('./app');

// Validasi konfigurasi utama
if (!config.BOT_TOKEN || config.BOT_TOKEN.includes('YOUR_BOT_TOKEN')) {
  console.error('Error: BOT_TOKEN belum dikonfigurasi di file config.js.');
  process.exit(1);
}

// Inisialisasi database SQLite sebelum ada update yang diproses
initDb(config.DB_PATH);

const bot = createBot(config.BOT_TOKEN);

// Penanganan graceful shutdown
function handleShutdown(signal) {
  console.log(`\nMenerima sinyal ${signal}. Menutup bot dan database...`);
  try {
    bot.stop(signal);
  } catch {}
  closeDb();
  process.exit(0);
}

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));

// Mulai bot
(async () => {
  try {
    const me = await bot.telegram.getMe();
    console.log('==================================================');
    console.log(`Bot @${me.username} (${me.first_name}) berhasil aktif!`);
    console.log(`Owner ID Terdaftar: ${config.OWNER_ID}`);
    console.log('Navigasi penuh lewat tombol rich message, tanpa command.');
    console.log('==================================================');

    await bot.launch({ dropPendingUpdates: true });
  } catch (err) {
    console.error('Gagal menjalankan bot:', err.message);
    process.exit(1);
  }
})();
