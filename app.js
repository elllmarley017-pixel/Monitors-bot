/**
 * Perakitan bot: middleware, handler, dan fallback.
 *
 * Dipisah dari index.js agar pengujian bisa memanggil handleUpdate()
 * pada instance bot yang sama persis dengan yang dipakai produksi.
 */

const { Telegraf } = require('telegraf');
const stateStore = require('./database/stateStore');
const { authMiddleware } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const { registerPanelHandlers } = require('./handlers/panelHandler');
const { showDaftarPanel } = require('./handlers/nav');
const { registerServerListHandlers, showServerList } = require('./handlers/serverListHandler');
const { registerServerDashboardHandlers } = require('./handlers/serverDashboard');
const { registerConsoleHandlers } = require('./handlers/consoleHandler');
const { registerPowerHandlers } = require('./handlers/powerHandler');
const { registerServerInfoHandlers } = require('./handlers/serverInfoHandler');
const {
  registerFileManagerHandlers,
  processFileManagerDocument,
} = require('./handlers/fileManagerHandler');
const { registerStartupHandlers } = require('./handlers/startupHandler');
const { handleTextUpdate } = require('./handlers/textRouter');

const R = require('./utils/rich');
const { sendView, answer } = require('./utils/reply');

/**
 * Bangun instance bot lengkap tanpa menjalankannya.
 * @param {string} token
 * @returns {import('telegraf').Telegraf}
 */
function createBot(token) {
  const bot = new Telegraf(token);

  bot.catch(errorHandler);

  // Log ringkas per update, aktif hanya bila BOT_DEBUG=1.
  if (process.env.BOT_DEBUG === '1') {
    bot.use((ctx, next) => {
      const jenis = ctx.callbackQuery ? `callback ${ctx.callbackQuery.data}` : ctx.updateType;
      console.log(`[update] user=${ctx.from?.id} jenis=${jenis}`);
      return next();
    });
  }

  bot.use(authMiddleware);

  registerPanelHandlers(bot, showServerList);
  registerServerListHandlers(bot);
  registerServerDashboardHandlers(bot);
  registerConsoleHandlers(bot);
  registerPowerHandlers(bot);
  registerServerInfoHandlers(bot);
  registerFileManagerHandlers(bot);
  registerStartupHandlers(bot);

  // Semua pesan teks membuka menu, kecuali sedang menunggu input tertentu.
  bot.on('text', (ctx) => handleTextUpdate(ctx, { showServerList }));

  // Dokumen dipakai untuk upload file ke server.
  bot.on('document', async (ctx) => {
    const pendingAction = stateStore.getPendingAction(ctx.from.id);

    if (pendingAction && pendingAction.type === 'file_upload') {
      const uploaded = await processFileManagerDocument(ctx, pendingAction);
      if (uploaded) return;
    }

    return sendView(ctx, {
      html: R.compose(
        R.h1('Upload Belum Aktif'),
        R.p('Buka File Manager, pilih folder tujuan, lalu tekan Upload sebelum mengirim file.')
      ),
      buttons: [[{ text: 'Buka Daftar Server', data: 'srv_list:1', style: R.STYLE.PRIMARY }]],
    });
  });

  /**
   * Tombol dari pesan lama bisa menunjuk aksi yang sudah tidak ada.
   * Fallback ini memastikan tombol seperti itu tetap dijawab, bukan diam.
   */
  bot.on('callback_query', async (ctx) => {
    await answer(ctx, 'Menu ini sudah kedaluwarsa. Berikut menu terbaru.');
    return showDaftarPanel(ctx);
  });

  return bot;
}

module.exports = { createBot };
