/**
 * Navigasi tingkat atas: beranda dan daftar server panel.
 *
 * Dipakai oleh textRouter, handler panel, dan semua fallback ketika tidak ada
 * panel aktif. Dengan begitu tidak ada jalan buntu: user selalu diarahkan ke
 * Tambah Server atau Daftar Server.
 */

const panelStore = require('../database/panelStore');
const stateStore = require('../database/stateStore');
const V = require('../utils/views');
const { showView } = require('../utils/reply');

/** Layar Daftar Server. Bila belum ada panel, tampilkan ajakan Tambah Server. */
async function showDaftarPanel(ctx) {
  const panels = panelStore.listPanels(ctx.from.id);

  if (panels.length === 0) {
    return showView(ctx, V.berandaKosong({ isOwner: Boolean(ctx.state.isOwner) }));
  }

  const nav = stateStore.getState(ctx.from.id);
  return showView(ctx, V.daftarPanel({ panels, activePanelId: nav.activePanelId }));
}

/**
 * Layar /start: sapaan, tabel Informasi Bot, status akun, dan tombol masuk.
 * Dikirim sebagai blok native agar tabelnya tabel Telegram sungguhan.
 */
async function showWelcome(ctx) {
  const userId = ctx.from.id;
  const panels = panelStore.listPanels(userId);
  const nav = stateStore.getState(userId);
  const activeIndex = panels.findIndex((panel) => panel.id === nav.activePanelId);

  return showView(
    ctx,
    V.welcome({
      isOwner: Boolean(ctx.state.isOwner),
      panelCount: panels.length,
      activeNomor: activeIndex >= 0 ? activeIndex + 1 : null,
    })
  );
}

/** Beranda: Tambah Server bila kosong, Daftar Server bila sudah ada. */
async function showBeranda(ctx) {
  return showDaftarPanel(ctx);
}

module.exports = {
  showWelcome,
  showDaftarPanel,
  showBeranda,
};
