const stateStore = require('../database/stateStore');
const V = require('../utils/views');
const { showView, answer } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

/**
 * Menampilkan daftar server milik akun yang tertaut.
 * @param {import('telegraf').Context} ctx
 * @param {number} page
 */
async function showServerList(ctx, page = 1) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  stateStore.updateState(ctx.from.id, {
    activeServerId: null,
    pendingAction: null,
    cwd: '/',
  });

  try {
    const { servers, pagination } = await ptero.listServers(page);

    if (!servers || servers.length === 0) {
      return showView(ctx, V.daftarServerKosong());
    }

    return showView(
      ctx,
      V.daftarServer({
        servers,
        page: pagination.current_page || page,
        totalPages: pagination.total_pages || 1,
        total: pagination.total || servers.length,
      })
    );
  } catch (err) {
    return showView(ctx, V.daftarServerGagal({ message: err.message }));
  }
}

/**
 * Mendaftarkan aksi daftar server.
 * @param {import('telegraf').Telegraf} bot
 */
function registerServerListHandlers(bot) {
  bot.action(/^srv_list:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const page = parseInt(ctx.match[1], 10) || 1;
    return showServerList(ctx, page);
  });
}

module.exports = {
  showServerList,
  registerServerListHandlers,
};
