/**
 * Penyimpanan koneksi panel Pterodactyl milik user.
 *
 * Setiap baris terikat pada satu telegram_id, dan semua query memfilter
 * telegram_id sehingga user tidak mungkin membaca panel milik user lain.
 * API key disimpan terenkripsi AES-256-GCM, tidak pernah dalam bentuk asli.
 */

const { getDb } = require('./db');
const cryptoService = require('../services/cryptoService');

/**
 * Normalisasi URL panel: wajib http/https, tanpa garis miring di akhir.
 * @param {string} rawUrl
 * @returns {string}
 */
function normalizePanelUrl(rawUrl) {
  const denganSkema = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const parsed = new URL(denganSkema);
  if (!parsed.hostname) throw new Error('URL panel tidak memiliki host yang valid.');
  parsed.hash = '';
  parsed.search = '';
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
}

/**
 * Daftar panel milik user, tanpa kredensial.
 * @param {number} telegramId
 * @returns {Array<{id: number, label: string, panelUrl: string, createdAt: string}>}
 */
function listPanels(telegramId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, label, panel_url, created_at FROM panels
       WHERE telegram_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(telegramId);

  return rows.map((row) => ({
    id: row.id,
    label: row.label || '',
    panelUrl: row.panel_url,
    createdAt: row.created_at,
  }));
}

/**
 * Jumlah panel milik user.
 * @param {number} telegramId
 */
function countPanels(telegramId) {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS total FROM panels WHERE telegram_id = ?').get(telegramId);
  return row ? Number(row.total) : 0;
}

/**
 * Cari panel milik user berdasarkan URL yang sudah dinormalisasi.
 * @param {number} telegramId
 * @param {string} panelUrl
 */
function findPanelByUrl(telegramId, panelUrl) {
  const db = getDb();
  const row = db
    .prepare('SELECT id, label, panel_url FROM panels WHERE telegram_id = ? AND panel_url = ?')
    .get(telegramId, normalizePanelUrl(panelUrl));
  if (!row) return null;
  return { id: row.id, label: row.label || '', panelUrl: row.panel_url };
}

/**
 * Ambil kredensial panel milik user, didekripsi.
 * Mengembalikan null bila panel tidak ada atau milik user lain.
 * @param {number} telegramId
 * @param {number} panelId
 * @param {string} secretHex
 * @returns {{id: number, label: string, panelUrl: string, apiKey: string}|null}
 */
function getPanelCredentials(telegramId, panelId, secretHex) {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM panels WHERE id = ? AND telegram_id = ?')
    .get(panelId, telegramId);
  if (!row) return null;

  try {
    const apiKey = cryptoService.decrypt(
      { iv: row.api_key_iv, authTag: row.api_key_tag, content: row.api_key_content },
      secretHex
    );
    return {
      id: row.id,
      label: row.label || '',
      panelUrl: row.panel_url,
      apiKey,
    };
  } catch (err) {
    console.error(`Gagal mendekripsi panel ${panelId} milik user ${telegramId}:`, err.message);
    return null;
  }
}

/**
 * Simpan panel baru. URL duplikat untuk user yang sama ditolak.
 * @param {number} telegramId
 * @param {{panelUrl: string, apiKey: string, label?: string}} data
 * @param {string} secretHex
 * @returns {{id: number, panelUrl: string, label: string}}
 */
function addPanel(telegramId, { panelUrl, apiKey, label = '' }, secretHex) {
  const db = getDb();
  const cleanUrl = normalizePanelUrl(panelUrl);

  const existing = findPanelByUrl(telegramId, cleanUrl);
  if (existing) {
    const err = new Error('Panel dengan URL ini sudah terdaftar.');
    err.code = 'PANEL_EXISTS';
    throw err;
  }

  const encrypted = cryptoService.encrypt(apiKey, secretHex);
  const now = new Date().toISOString();

  const result = db
    .prepare(`
      INSERT INTO panels (telegram_id, label, panel_url, api_key_iv, api_key_tag, api_key_content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(telegramId, label, cleanUrl, encrypted.iv, encrypted.authTag, encrypted.content, now);

  return { id: Number(result.lastInsertRowid), panelUrl: cleanUrl, label };
}

/**
 * Hapus panel milik user.
 * @param {number} telegramId
 * @param {number} panelId
 * @returns {boolean} true bila ada baris yang terhapus
 */
function deletePanel(telegramId, panelId) {
  const db = getDb();
  const result = db.prepare('DELETE FROM panels WHERE id = ? AND telegram_id = ?').run(panelId, telegramId);
  return Number(result.changes) > 0;
}

/**
 * Ringkasan user terdaftar untuk menu pemilik: satu baris per user.
 * @returns {Array<{telegram_id: number, panel_count: number, last_added: string}>}
 */
function listUsersWithPanels() {
  const db = getDb();
  return db
    .prepare(`
      SELECT telegram_id, COUNT(*) AS panel_count, MAX(created_at) AS last_added
      FROM panels GROUP BY telegram_id ORDER BY last_added DESC
    `)
    .all();
}

module.exports = {
  normalizePanelUrl,
  listPanels,
  countPanels,
  findPanelByUrl,
  getPanelCredentials,
  addPanel,
  deletePanel,
  listUsersWithPanels,
};
