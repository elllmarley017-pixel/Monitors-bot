const V = require('../utils/views');
const { showView, answer } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

/** Tampilkan detail server: alokasi port, image, dan batasan resource. */
async function showInfo(ctx, serverId) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  try {
    const server = await ptero.getServer(serverId);
    return showView(ctx, V.infoServer({ server }));
  } catch (err) {
    return showView(ctx, V.infoGagal({ serverId, message: err.message, title: 'Info Server Gagal Dimuat' }));
  }
}

/** Tampilkan metrik CPU, RAM, disk, dan jaringan. */
async function showResources(ctx, serverId) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  try {
    const [server, stats] = await Promise.all([
      ptero.getServer(serverId),
      ptero.getServerResources(serverId),
    ]);
    return showView(ctx, V.metrikServer({ server, stats }));
  } catch (err) {
    return showView(ctx, V.infoGagal({ serverId, message: err.message, title: 'Metrik Gagal Dimuat' }));
  }
}

/** Daftarkan aksi info dan metrik. */
function registerServerInfoHandlers(bot) {
  bot.action(/^inf_view:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    return showInfo(ctx, ctx.match[1]);
  });

  bot.action(/^res_view:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx, 'Memperbarui metrik...');
    return showResources(ctx, ctx.match[1]);
  });
}

module.exports = {
  showInfo,
  showResources,
  registerServerInfoHandlers,
};
