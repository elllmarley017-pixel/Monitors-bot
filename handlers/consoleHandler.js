const stateStore = require('../database/stateStore');
const { getConsoleSession } = require('../services/pteroConsoleWs');
const V = require('../utils/views');
const R = require('../utils/rich');
const { showView, sendView, notifyRich, answer } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

/**
 * Menampilkan console server: status koneksi, log terakhir, dan tombol kendali.
 * @param {import('telegraf').Context} ctx
 * @param {string} serverId
 */
async function showConsole(ctx, serverId) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  const session = getConsoleSession(ptero, serverId, {
    userId: ctx.from.id,
    panelId: ctx.state.panel?.id,
  });

  if (!session.isConnected()) {
    try {
      await session.connect();
    } catch (err) {
      console.warn(`WebSocket connect notice (${serverId}):`, err.message);
    }
  }

  return showView(
    ctx,
    V.consoleView({
      serverId,
      logs: session.getRecentLogs(16),
      connected: session.isConnected(),
      state: session.getStatus(),
    })
  );
}

/**
 * Mendaftarkan aksi console.
 * @param {import('telegraf').Telegraf} bot
 */
function registerConsoleHandlers(bot) {
  bot.action(/^con_view:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    return showConsole(ctx, ctx.match[1]);
  });

  bot.action(/^con_ref:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx, 'Memuat log terbaru...');
    return showConsole(ctx, ctx.match[1]);
  });

  bot.action(/^con_cmd:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    const serverId = ctx.match[1];
    stateStore.updateState(ctx.from.id, {
      pendingAction: { type: 'console_command', serverId },
    });
    return showView(ctx, V.kirimPerintah({ serverId }));
  });
}

/**
 * Memproses perintah console dari pesan teks.
 * @returns {Promise<boolean>}
 */
async function processConsoleCommandInput(ctx, pendingAction) {
  if (pendingAction.type !== 'console_command') return false;

  const { serverId } = pendingAction;
  const command = ctx.message?.text?.trim();
  const ptero = ctx.state.ptero;
  if (!command || !ptero) return false;

  stateStore.updateState(ctx.from.id, { pendingAction: null });

  const session = getConsoleSession(ptero, serverId, {
    userId: ctx.from.id,
    panelId: ctx.state.panel?.id,
  });
  try {
    await session.sendCommand(command);
    await notifyRich(ctx, R.compose(R.p(`Perintah dikirim: ${R.code(command)}`)));
    await new Promise((resolve) => setTimeout(resolve, 800));
    await showConsole(ctx, serverId);
    return true;
  } catch (err) {
    await sendView(
      ctx,
      V.hasilAksi({
        title: 'Perintah Gagal Dikirim',
        message: `Console menolak perintah: ${err.message}`,
      })
    );
    return true;
  }
}

module.exports = {
  showConsole,
  registerConsoleHandlers,
  processConsoleCommandInput,
};
