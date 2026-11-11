const V = require('../utils/views');
const { showView, answer } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

/**
 * Menampilkan menu kontrol daya beserta status server terkini.
 * @param {import('telegraf').Context} ctx
 * @param {string} serverId
 */
async function showPowerMenu(ctx, serverId) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  try {
    const [server, stats] = await Promise.all([
      ptero.getServer(serverId),
      ptero.getServerResources(serverId).catch(() => ({ current_state: 'offline' })),
    ]);

    return showView(
      ctx,
      V.powerMenu({
        serverId,
        serverName: server.name,
        state: stats.current_state,
      })
    );
  } catch (err) {
    return showView(ctx, V.powerGagal({ serverId, message: err.message }));
  }
}

/**
 * Mendaftarkan aksi kontrol daya.
 * @param {import('telegraf').Telegraf} bot
 */
function registerPowerHandlers(bot) {
  bot.action(/^pwr_menu:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    return showPowerMenu(ctx, ctx.match[1]);
  });

  bot.action(/^pwr_act:([a-zA-Z0-9_\-]+):(start|stop|restart|kill)$/, async (ctx) => {
    const serverId = ctx.match[1];
    const signal = ctx.match[2];
    const ptero = ctx.state.ptero;
    if (!ptero) return showDaftarPanel(ctx);

    await answer(ctx, `Mengirim sinyal ${signal.toUpperCase()}...`);

    try {
      await ptero.sendPowerAction(serverId, signal);
      // Panel butuh sekitar satu detik untuk memperbarui current_state.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return showPowerMenu(ctx, serverId);
    } catch (err) {
      const view = V.powerGagal({
        serverId,
        message: `Sinyal ${signal.toUpperCase()} gagal dikirim: ${err.message}`,
      });
      return showView(ctx, view);
    }
  });
}

module.exports = {
  showPowerMenu,
  registerPowerHandlers,
};
