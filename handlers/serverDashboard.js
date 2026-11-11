const stateStore = require('../database/stateStore');
const V = require('../utils/views');
const { showView, answer } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

/**
 * Menampilkan dashboard server dengan status dan metrik terkini.
 * @param {import('telegraf').Context} ctx
 * @param {string} serverId
 */
async function showDashboard(ctx, serverId) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  stateStore.updateState(ctx.from.id, {
    activeServerId: serverId,
    pendingAction: null,
    cwd: '/',
  });

  try {
    const [server, stats] = await Promise.all([
      ptero.getServer(serverId),
      ptero.getServerResources(serverId).catch(() => ({ current_state: 'offline', resources: {} })),
    ]);

    return showView(ctx, V.dashboard({ server, stats }));
  } catch (err) {
    return showView(ctx, V.dashboardGagal({ serverId, message: err.message }));
  }
}

/**
 * Mendaftarkan aksi dashboard.
 * @param {import('telegraf').Telegraf} bot
 */
function registerServerDashboardHandlers(bot) {
  bot.action(/^srv_sel:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    return showDashboard(ctx, ctx.match[1]);
  });

  bot.action(/^dash:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx, 'Memuat status terbaru...');
    return showDashboard(ctx, ctx.match[1]);
  });
}

module.exports = {
  showDashboard,
  registerServerDashboardHandlers,
};
