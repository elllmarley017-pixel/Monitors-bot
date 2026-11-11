/**
 * Pengelolaan server panel: tambah, daftar, pilih, dan hapus.
 *
 * Satu user boleh mendaftarkan banyak panel. Kredensial tiap panel disimpan
 * terpisah dan dienkripsi. Memilih panel hanya mengubah state aktif, sehingga
 * berpindah server tidak perlu memasukkan API Key lagi.
 */

const config = require('../config');
const panelStore = require('../database/panelStore');
const stateStore = require('../database/stateStore');
const { createClient } = require('../services/pteroClient');
const V = require('../utils/views');
const R = require('../utils/rich');
const { showView, sendView, notifyRich, answer, removeMessage } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

/** Daftarkan aksi pengelolaan server panel. */
function registerPanelHandlers(bot, showServerList) {
  bot.action('pnl_list', async (ctx) => {
    await answer(ctx);
    return showDaftarPanel(ctx);
  });

  bot.action('pnl_add', async (ctx) => {
    await answer(ctx);
    stateStore.updateState(ctx.from.id, { pendingAction: { step: 'awaiting_url' } });
    return showView(ctx, V.tambahUrl());
  });

  bot.action('panel_batal', async (ctx) => {
    await answer(ctx, 'Penambahan dibatalkan.');
    stateStore.updateState(ctx.from.id, { pendingAction: null });
    return showDaftarPanel(ctx);
  });

  bot.action(/^pnl_use:(\d+)$/, async (ctx) => {
    const panelId = parseInt(ctx.match[1], 10);
    const userId = ctx.from.id;
    const panels = panelStore.listPanels(userId);
    const nomor = panels.findIndex((item) => item.id === panelId) + 1;
    const panel = panels.find((item) => item.id === panelId);

    if (!panel) {
      return answer(ctx, 'Server tidak ditemukan. Muat ulang daftar.', { show_alert: true });
    }

    const credentials = panelStore.getPanelCredentials(userId, panelId, config.ENCRYPTION_SECRET);
    if (!credentials) {
      return answer(ctx, 'Kredensial server ini tidak bisa dibaca. Hapus lalu tambahkan ulang.', {
        show_alert: true,
      });
    }

    stateStore.updateState(userId, {
      activePanelId: panelId,
      activeServerId: null,
      cwd: '/',
      pendingAction: null,
    });

    // Segarkan konteks agar pemanggilan berikutnya pada update ini memakai panel baru.
    ctx.state.panel = { id: panelId, panelUrl: credentials.panelUrl, label: credentials.label };
    ctx.state.ptero = createClient(credentials.panelUrl, credentials.apiKey);

    await answer(ctx, `Server ${nomor} aktif.`);
    return showServerList(ctx, 1);
  });

  bot.action(/^pnl_hapus:(\d+)$/, async (ctx) => {
    const panelId = parseInt(ctx.match[1], 10);
    const panels = panelStore.listPanels(ctx.from.id);
    const nomor = panels.findIndex((item) => item.id === panelId) + 1;
    const panel = panels.find((item) => item.id === panelId);

    if (!panel) {
      return answer(ctx, 'Server tidak ditemukan. Muat ulang daftar.', { show_alert: true });
    }

    await answer(ctx);
    return showView(ctx, V.konfirmasiHapusPanel({ panel, nomor }));
  });

  bot.action(/^pnl_hapus_ok:(\d+)$/, async (ctx) => {
    const panelId = parseInt(ctx.match[1], 10);
    const userId = ctx.from.id;
    const panels = panelStore.listPanels(userId);
    const nomor = panels.findIndex((item) => item.id === panelId) + 1;

    if (!panelStore.deletePanel(userId, panelId)) {
      return answer(ctx, 'Server tidak ditemukan. Muat ulang daftar.', { show_alert: true });
    }

    const nav = stateStore.getState(userId);
    if (nav.activePanelId === panelId) {
      stateStore.updateState(userId, {
        activePanelId: null,
        activeServerId: null,
        cwd: '/',
        pendingAction: null,
      });
    }

    await answer(ctx, `Server ${nomor} dihapus.`);
    return showDaftarPanel(ctx);
  });

  bot.action('owner_menu', async (ctx) => {
    if (!ctx.state.isOwner) {
      return answer(ctx, 'Menu ini hanya untuk pemilik bot.', { show_alert: true });
    }
    await answer(ctx);
    return showView(
      ctx,
      V.menuOwner({
        users: panelStore.listUsersWithPanels(),
        ownerId: config.OWNER_ID,
      })
    );
  });
}

/**
 * Memproses input teks alur Tambah Server.
 * @param {import('telegraf').Context} ctx
 * @param {{step: string, panelUrl?: string}} pendingAction
 * @param {(ctx: object, page: number) => Promise<any>} showServerList
 * @param {{createClient?: Function}} [deps] Titik suntik untuk pengujian
 * @returns {Promise<boolean>} true bila pesan sudah ditangani
 */
async function processPanelTextInput(ctx, pendingAction, showServerList, deps = {}) {
  const userId = ctx.from.id;
  const teks = ctx.message?.text?.trim();
  if (!teks) return false;

  if (pendingAction.step === 'awaiting_url') {
    let panelUrl;
    try {
      panelUrl = panelStore.normalizePanelUrl(teks);
    } catch (err) {
      await sendView(ctx, V.urlTidakValid({ message: err.message }));
      return true;
    }

    const duplikat = panelStore.findPanelByUrl(userId, panelUrl);
    if (duplikat) {
      stateStore.updateState(userId, { pendingAction: null });
      await sendView(
        ctx,
        V.panelGagal({
          message: 'URL ini sudah terdaftar pada akun Anda.',
          reason: 'duplicate',
        })
      );
      return true;
    }

    stateStore.updateState(userId, { pendingAction: { step: 'awaiting_api_key', panelUrl } });
    await sendView(ctx, V.langkahApiKey({ nomor: panelStore.countPanels(userId) + 1 }));
    return true;
  }

  if (pendingAction.step === 'awaiting_api_key') {
    const apiKey = teks;
    const panelUrl = pendingAction.panelUrl;

    // Pesan berisi kunci dihapus lebih dulu, sebelum proses jaringan apa pun.
    await removeMessage(ctx, ctx.message.message_id);

    if (!apiKey.startsWith('ptlc_')) {
      await sendView(
        ctx,
        V.panelGagal({
          message: 'Kunci tidak diawali ptlc_. Ini bukan Client API Key.',
          reason: 'verify',
        })
      );
      return true;
    }

    const verifying = await notifyRich(ctx, R.compose(R.p('Memeriksa kredensial ke panel...')));

    try {
      const buatClient = deps.createClient || createClient;
      const client = buatClient(panelUrl, apiKey);
      const account = await client.getAccount();

      const panel = panelStore.addPanel(userId, { panelUrl, apiKey }, config.ENCRYPTION_SECRET);

      stateStore.updateState(userId, {
        activePanelId: panel.id,
        activeServerId: null,
        cwd: '/',
        pendingAction: null,
      });

      await removeMessage(ctx, verifying.message_id);
      const nomor = panelStore.countPanels(userId);
      await sendView(ctx, V.panelDitambahkan({ account, nomor }));

      ctx.state.panel = { id: panel.id, panelUrl, label: panel.label };
      ctx.state.ptero = client;
      await showServerList(ctx, 1);
      return true;
    } catch (err) {
      await removeMessage(ctx, verifying.message_id);
      const duplicate = err.code === 'PANEL_EXISTS';
      await sendView(
        ctx,
        V.panelGagal({
          message: err.message,
          reason: duplicate ? 'duplicate' : 'verify',
        })
      );
      return true;
    }
  }

  return false;
}

module.exports = {
  registerPanelHandlers,
  processPanelTextInput,
};
