/**
 * Konfigurasi bot.
 *
 * Berkas ini berisi nilai contoh yang aman dan boleh diunggah. Kredensial asli
 * diletakkan di config.local.js, yang tidak diunggah ke repositori. Bila berkas
 * itu ada, nilainya menimpa nilai contoh di bawah.
 *
 * Cara mengisi:
 *   1. Salin config.local.example.js menjadi config.local.js
 *   2. Isi BOT_TOKEN, OWNER_ID, dan ENCRYPTION_SECRET milik Anda
 */

const fs = require('node:fs');
const path = require('node:path');

// Nilai contoh. BOT_TOKEN dan ENCRYPTION_SECRET sengaja dikosongkan agar bot
// menolak berjalan sebelum kredensial diisi.
const contoh = {
  BOT_TOKEN: '',
  OWNER_ID: 0,
  ENCRYPTION_SECRET: '',
  DB_PATH: './database/pterobot.db',
};

// Nilai asli dari berkas lokal, bila ada.
let lokal = {};
const berkasLokal = path.join(__dirname, 'config.local.js');
if (fs.existsSync(berkasLokal)) {
  lokal = require(berkasLokal);
}

module.exports = { ...contoh, ...lokal };
