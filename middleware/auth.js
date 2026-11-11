const config = require('../config');
const panelStore = require('../database/panelStore');
const stateStore = require('../database/stateStore');
const { createClient } = require('../services/pteroClient');

/**
 * Middleware pemuatan konteks per update.
 *
 * - `ctx.state.panels`  daftar server panel milik user (tanpa kredensial)
 * - `ctx.state.nav`     state navigasi (panel aktif, server aktif, cwd)
 * - `ctx.state.panel`   panel aktif bila ada
 * - `ctx.state.ptero`   client Pterodactyl untuk panel aktif, atau null
 *
 * Tidak ada panel bawaan: tanpa panel aktif, semua handler mengarahkan user
 * ke menu Tambah Server atau Daftar Server.
 */
async function authMiddleware(ctx, next) {
  const userId = ctx.from?.id;
  if (!userId) return;

  ctx.state.isOwner = Number(userId) === Number(config.OWNER_ID);

  const panels = panelStore.listPanels(userId);
  const nav = stateStore.getState(userId);

  // Panel aktif bisa saja sudah dihapus; bersihkan agar tidak menunjuk baris mati.
  let activePanelId = nav.activePanelId;
  if (activePanelId && !panels.some((panel) => panel.id === activePanelId)) {
    activePanelId = null;
    stateStore.updateState(userId, { activePanelId: null, activeServerId: null, cwd: '/' });
  }

  const credentials = activePanelId
    ? panelStore.getPanelCredentials(userId, activePanelId, config.ENCRYPTION_SECRET)
    : null;

  if (activePanelId && !credentials) {
    activePanelId = null;
    stateStore.updateState(userId, { activePanelId: null, activeServerId: null, cwd: '/' });
  }

  ctx.state.panels = panels;
  ctx.state.nav = { ...nav, activePanelId };
  ctx.state.panel = credentials
    ? { id: credentials.id, panelUrl: credentials.panelUrl, label: credentials.label }
    : null;
  ctx.state.ptero = credentials ? createClient(credentials.panelUrl, credentials.apiKey) : null;

  return next();
}

module.exports = {
  authMiddleware,
};
