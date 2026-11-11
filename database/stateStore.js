/**
 * State navigasi per user: panel aktif, server aktif, direktori, dan
 * pendingAction untuk alur yang menunggu input teks.
 *
 * State terpisah dari kredensial panel karena alur Tambah Server berjalan
 * sebelum user memiliki panel sama sekali.
 */

const { getDb } = require('./db');

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getStateRow(telegramId) {
  const db = getDb();
  return db.prepare('SELECT * FROM user_states WHERE telegram_id = ?').get(telegramId);
}

/**
 * Baca state navigasi user, dengan nilai bawaan bila belum ada.
 * @param {number} telegramId
 */
function getState(telegramId) {
  const row = getStateRow(telegramId);
  return {
    activePanelId: row && row.active_panel_id !== null ? Number(row.active_panel_id) : null,
    activeServerId: row ? row.active_server_id : null,
    cwd: (row && row.cwd) || '/',
    pendingAction: row ? parseJson(row.pending_action) : null,
  };
}

/**
 * Perbarui state. Hanya field yang dikirim yang berubah.
 * Aman dipanggil untuk user yang belum memiliki panel.
 * @param {number} telegramId
 * @param {{activePanelId?: number|null, activeServerId?: string|null, cwd?: string, pendingAction?: object|null}} updates
 */
function updateState(telegramId, updates) {
  const db = getDb();
  const now = new Date().toISOString();
  const current = getState(telegramId);

  const activePanelId = 'activePanelId' in updates ? updates.activePanelId : current.activePanelId;
  const activeServerId = 'activeServerId' in updates ? updates.activeServerId : current.activeServerId;
  const cwd = 'cwd' in updates ? updates.cwd : current.cwd;
  const pendingAction = 'pendingAction' in updates
    ? (updates.pendingAction ? JSON.stringify(updates.pendingAction) : null)
    : (current.pendingAction ? JSON.stringify(current.pendingAction) : null);

  db.prepare(`
    INSERT INTO user_states (telegram_id, active_panel_id, active_server_id, cwd, pending_action, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      active_panel_id = excluded.active_panel_id,
      active_server_id = excluded.active_server_id,
      cwd = excluded.cwd,
      pending_action = excluded.pending_action,
      updated_at = excluded.updated_at
  `).run(telegramId, activePanelId, activeServerId, cwd, pendingAction, now);
}

/**
 * pendingAction user, atau null.
 * @param {number} telegramId
 */
function getPendingAction(telegramId) {
  return getState(telegramId).pendingAction;
}

/** Hapus seluruh state user. */
function deleteState(telegramId) {
  const db = getDb();
  db.prepare('DELETE FROM user_states WHERE telegram_id = ?').run(telegramId);
}

module.exports = {
  getState,
  updateState,
  getPendingAction,
  deleteState,
};
