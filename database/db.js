const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

let dbInstance = null;

/**
 * Inisialisasi koneksi SQLite dan buat skema tabel.
 * @param {string} customPath Path database opsional
 * @returns {DatabaseSync}
 */
function initDb(customPath) {
  const dbPath = customPath || path.resolve(__dirname, 'pterobot.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new DatabaseSync(dbPath);

  // Satu baris = satu koneksi panel milik satu user.
  // Kredensial disimpan terenkripsi, dan URL unik per user.
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      panel_url TEXT NOT NULL,
      api_key_iv TEXT NOT NULL,
      api_key_tag TEXT NOT NULL,
      api_key_content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (telegram_id, panel_url)
    );
  `);

  // Tabel state navigasi, terpisah dari kredensial.
  // Dipisah karena user harus bisa menyimpan pendingAction sebelum
  // memiliki panel sama sekali (alur input URL dan API key).
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS user_states (
      telegram_id INTEGER PRIMARY KEY,
      active_panel_id INTEGER DEFAULT NULL,
      active_server_id TEXT DEFAULT NULL,
      cwd TEXT DEFAULT '/',
      pending_action TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureStateColumn('active_panel_id', 'INTEGER DEFAULT NULL');
  migrateLegacySessions();

  return dbInstance;
}

/**
 * Skema lama menyimpan satu sesi per user di tabel sessions.
 * Baris itu dipindahkan menjadi satu panel agar user tidak perlu menautkan ulang.
 */
function migrateLegacySessions() {
  const db = dbInstance;
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
    .get();
  if (!table) return;

  const rows = db.prepare('SELECT * FROM sessions').all();
  const now = new Date().toISOString();
  for (const row of rows) {
    const hasil = db.prepare(`
      INSERT OR IGNORE INTO panels (
        telegram_id, label, panel_url, api_key_iv, api_key_tag, api_key_content, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.telegram_id,
      '',
      row.panel_url,
      row.api_key_iv,
      row.api_key_tag,
      row.api_key_content,
      row.created_at || now
    );

    // Pertahankan pengalaman user lama: panel hasil migrasi langsung aktif.
    if (Number(hasil.changes) > 0) {
      db.prepare(`
        UPDATE user_states SET active_panel_id = ?, updated_at = ?
        WHERE telegram_id = ? AND active_panel_id IS NULL
      `).run(Number(hasil.lastInsertRowid), now, row.telegram_id);
    }
  }

  db.exec('DROP TABLE sessions');
}

/**
 * Menambahkan kolom baru pada tabel lama tanpa menghapus data.
 * @param {string} column
 * @param {string} definition
 */
function ensureStateColumn(column, definition) {
  const db = dbInstance;
  const columns = db.prepare('PRAGMA table_info(user_states)').all();
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE user_states ADD COLUMN ${column} ${definition}`);
}

/**
 * Mendapatkan instance database aktif.
 * @returns {DatabaseSync}
 */
function getDb() {
  if (!dbInstance) {
    return initDb();
  }
  return dbInstance;
}

/**
 * Menutup database.
 */
function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  initDb,
  getDb,
  closeDb,
};
