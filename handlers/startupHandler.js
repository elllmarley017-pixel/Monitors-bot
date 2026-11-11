const stateStore = require('../database/stateStore');
const V = require('../utils/views');
const R = require('../utils/rich');
const { showView, notifyRich, sendView, answer } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

// Cache variabel startup per user agar tombol ubah bisa memakai indeks.
// kunci: `${userId}:${panelId}:${serverId}` => Array<variableItem>
const startupVarsCache = new Map();

/** Kunci cache wajib memuat user dan panel agar tidak lintas akun. */
function startupCacheKey(ctx, serverId) {
  return `${ctx.from.id}:${ctx.state.panel?.id || 0}:${serverId}`;
}

/** Tampilkan konfigurasi startup beserta variabel lingkungan. */
async function showStartup(ctx, serverId) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  stateStore.updateState(ctx.from.id, { activeServerId: serverId, pendingAction: null });

  try {
    const startup = await ptero.getStartup(serverId);
    startupVarsCache.set(startupCacheKey(ctx, serverId), startup.variables || []);
    return showView(ctx, V.startup({ serverId, startup }));
  } catch (err) {
    return showView(
      ctx,
      V.infoGagal({ serverId, message: err.message, title: 'Startup Config Gagal Dimuat' })
    );
  }
}

/** Daftarkan aksi startup. */
function registerStartupHandlers(bot) {
  bot.action(/^st_view:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    return showStartup(ctx, ctx.match[1]);
  });

  bot.action(/^st_edit:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const varIndex = parseInt(ctx.match[1], 10);
    const serverId = ctx.state.nav?.activeServerId;
    if (!serverId) return;

    const variables = startupVarsCache.get(startupCacheKey(ctx, serverId)) || [];
    const variable = variables[varIndex];
    if (!variable) {
      return answer(ctx, 'Variabel tidak ditemukan. Muat ulang konfigurasi.', { show_alert: true });
    }

    stateStore.updateState(ctx.from.id, {
      pendingAction: {
        type: 'startup_edit',
        serverId,
        envVar: variable.env_variable,
        varName: variable.name,
      },
    });

    return showView(ctx, V.editVariabel({ serverId, variable }));
  });
}

/**
 * Memproses nilai baru untuk variabel startup.
 * @returns {Promise<boolean>}
 */
async function processStartupTextInput(ctx, pendingAction) {
  if (pendingAction.type !== 'startup_edit') return false;

  const { serverId, envVar } = pendingAction;
  const ptero = ctx.state.ptero;
  const newValue = ctx.message?.text?.trim() ?? '';
  if (!ptero || !serverId) return false;

  stateStore.updateState(ctx.from.id, { pendingAction: null });

  try {
    await ptero.updateStartupVariable(serverId, envVar, newValue);
    await notifyRich(
      ctx,
      R.compose(R.p(`${R.code(envVar)} diubah menjadi ${R.code(newValue || '(kosong)')}.`))
    );
    await showStartup(ctx, serverId);
  } catch (err) {
    await sendView(ctx, V.hasilAksi({ title: 'Perubahan Variabel Gagal', message: err.message }));
  }
  return true;
}

module.exports = {
  startupCacheKey,
  showStartup,
  registerStartupHandlers,
  processStartupTextInput,
};
