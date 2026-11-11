const stateStore = require('../database/stateStore');
const { processPanelTextInput } = require('./panelHandler');
const { processConsoleCommandInput } = require('./consoleHandler');
const { processFileManagerTextInput } = require('./fileManagerHandler');
const { processStartupTextInput } = require('./startupHandler');
const { showWelcome, showDaftarPanel } = require('./nav');

// /start dari tombol bawaan Telegram, dengan atau tanpa nama bot.
const START_PATTERN = /^\/start(?:@[A-Za-z0-9_]+)?$/i;

/**
 * Merutekan pesan teks masuk.
 *
 * Bot tidak memakai command lain selain /start. Pesan teks biasa membuka menu,
 * kecuali sedang ada pendingAction yang menunggu input.
 *
 * Tanpa panel aktif, menu yang tampil adalah Tambah Server atau Daftar Server,
 * sehingga tidak ada fitur yang bisa dipakai tanpa koneksi milik user sendiri.
 *
 * @param {import('telegraf').Context} ctx
 * @param {{ showServerList: (ctx: object, page: number) => Promise<any> }} deps
 */
async function handleTextUpdate(ctx, deps) {
  const userId = ctx.from.id;
  const teks = ctx.message?.text?.trim() || '';

  // /start selalu membuka layar sambutan, sekaligus melepas alur input yang
  // mungkin sedang menggantung supaya user tidak terjebak di tengah alur.
  if (START_PATTERN.test(teks)) {
    stateStore.updateState(userId, { pendingAction: null });
    return showWelcome(ctx);
  }

  const pendingAction = stateStore.getPendingAction(userId);

  if (pendingAction) {
    const panelHandled = await processPanelTextInput(ctx, pendingAction, deps.showServerList);
    if (panelHandled) return;

    const consoleHandled = await processConsoleCommandInput(ctx, pendingAction);
    if (consoleHandled) return;

    const fileHandled = await processFileManagerTextInput(ctx, pendingAction);
    if (fileHandled) return;

    const startupHandled = await processStartupTextInput(ctx, pendingAction);
    if (startupHandled) return;
  }

  if (!ctx.state.ptero) {
    return showDaftarPanel(ctx);
  }

  return deps.showServerList(ctx, 1);
}

module.exports = {
  handleTextUpdate,
};
