const path = require('node:path').posix;
const axios = require('axios');
const stateStore = require('../database/stateStore');
const V = require('../utils/views');
const R = require('../utils/rich');
const { formatBytes } = require('../utils/formatter');
const { showView, sendView, notifyRich, answer, removeMessage } = require('../utils/reply');
const { showDaftarPanel } = require('./nav');

// Cache daftar file yang sedang dibuka user.
// kunci: `${userId}:${panelId}:${serverId}:${cwd}` => Array<fileItem> urut seperti di layar.
const directoryCache = new Map();

const PAGE_SIZE = 6;
const MAX_PREVIEW_BYTES = 200 * 1024;
const MAX_TELEGRAM_DOWNLOAD = 20 * 1024 * 1024;

/**
 * Normalisasi path agar selalu berada di dalam root '/'.
 * Mencegah path traversal seperti '../../etc/passwd'.
 */
function sanitizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '/';
  const normalized = path.normalize(rawPath.replace(/\\/g, '/'));
  if (normalized === '.' || normalized === '') return '/';
  return path.resolve('/', normalized);
}

/** Folder induk dari path saat ini. */
function getParentPath(currentPath) {
  const clean = sanitizePath(currentPath);
  if (clean === '/') return '/';
  const parent = path.dirname(clean);
  return parent === '' ? '/' : parent;
}

/**
 * Menampilkan isi direktori.
 * @param {import('telegraf').Context} ctx
 * @param {string} serverId
 * @param {string} directory
 * @param {number} page
 */
async function showDirectory(ctx, serverId, directory = '/', page = 1) {
  const ptero = ctx.state.ptero;
  if (!ptero) return showDaftarPanel(ctx);

  const userId = ctx.from.id;
  const cleanDir = sanitizePath(directory);

  stateStore.updateState(userId, {
    activeServerId: serverId,
    cwd: cleanDir,
    pendingAction: null,
  });

  try {
    const rawItems = await ptero.listFiles(serverId, cleanDir);

    // Folder di atas, lalu nama A-Z.
    const sorted = [...rawItems].sort((a, b) => {
      if (a.is_file === b.is_file) return a.name.localeCompare(b.name);
      return a.is_file ? 1 : -1;
    });

    directoryCache.set(cacheKeyOf(ctx, serverId, cleanDir), sorted);

    const totalItems = sorted.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (safePage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(startIndex, startIndex + PAGE_SIZE);
    const absIndexes = pageItems.map((_, idx) => startIndex + idx);

    return showView(
      ctx,
      V.direktori({
        serverId,
        dir: cleanDir,
        items: pageItems,
        page: safePage,
        totalPages,
        totalItems,
        absIndexes,
      })
    );
  } catch (err) {
    return showView(
      ctx,
      V.infoGagal({
        serverId,
        message: `Direktori ${cleanDir} gagal dibaca: ${err.message}`,
        title: 'File Manager Gagal Dimuat',
      })
    );
  }
}

/** Ambil item dari cache berdasarkan indeks absolut. */
function cacheKeyOf(ctx, serverId, cwd) {
  return `${ctx.from.id}:${ctx.state.panel?.id || 0}:${serverId}:${cwd}`;
}

function cachedItem(ctx, serverId, cwd, absIndex) {
  const items = directoryCache.get(cacheKeyOf(ctx, serverId, cwd)) || [];
  return items[absIndex];
}

/** File menu butuh item beserta absIndex agar tombol kembali tepat sasaran. */
function withIndex(item, absIndex) {
  return { ...item, absIndex };
}

/** Daftarkan seluruh aksi file manager. */
function registerFileManagerHandlers(bot) {
  bot.action(/^fm_view:([a-zA-Z0-9_\-]+):(\d+)$/, async (ctx) => {
    await answer(ctx);
    const serverId = ctx.match[1];
    const page = parseInt(ctx.match[2], 10) || 1;
    const cwd = ctx.state.nav?.cwd || '/';
    return showDirectory(ctx, serverId, cwd, page);
  });

  bot.action(/^fm_pg:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const page = parseInt(ctx.match[1], 10) || 1;
    const serverId = ctx.state.nav?.activeServerId;
    if (!serverId) return;
    return showDirectory(ctx, serverId, ctx.state.nav?.cwd || '/', page);
  });

  bot.action(/^fm_up:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    const serverId = ctx.match[1];
    const parent = getParentPath(ctx.state.nav?.cwd || '/');
    return showDirectory(ctx, serverId, parent, 1);
  });

  bot.action(/^fm_open:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const absIndex = parseInt(ctx.match[1], 10);
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'Daftar file sudah kedaluwarsa. Muat ulang folder.', { show_alert: true });
    }

    if (!item.is_file) {
      return showDirectory(ctx, serverId, path.join(cwd, item.name), 1);
    }

    return showView(
      ctx,
      V.fileMenu({
        serverId,
        item,
        filePath: path.join(cwd, item.name),
        absIndex,
      })
    );
  });

  bot.action(/^fm_act:view:(\d+)$/, async (ctx) => {
    const absIndex = parseInt(ctx.match[1], 10);
    const ptero = ctx.state.ptero;
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId || !ptero) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'File tidak ditemukan. Muat ulang folder.', { show_alert: true });
    }
    if (item.size > MAX_PREVIEW_BYTES) {
      return answer(ctx, 'File melebihi 200 KB. Pakai tombol Download.', { show_alert: true });
    }

    await answer(ctx, 'Membaca isi file...');

    try {
      const content = await ptero.getFileContents(serverId, path.join(cwd, item.name));
      const truncated = content.length > 3000;
      return showView(
        ctx,
        V.isiFile({
          item: withIndex(item, absIndex),
          filePath: path.join(cwd, item.name),
          content: truncated ? content.slice(0, 3000) : content,
          truncated,
        })
      );
    } catch (err) {
      return answer(ctx, `Gagal membaca file: ${err.message}`, { show_alert: true });
    }
  });

  bot.action(/^fm_act:edit:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const absIndex = parseInt(ctx.match[1], 10);
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'File tidak ditemukan. Muat ulang folder.', { show_alert: true });
    }

    const filePath = path.join(cwd, item.name);
    stateStore.updateState(ctx.from.id, {
      pendingAction: { type: 'file_edit', serverId, filePath, absIndex },
    });

    return showView(
      ctx,
      V.promptFile({
        title: `Edit ${item.name}`,
        path: filePath,
        description: 'Kirim isi lengkap file sebagai satu pesan. Isi lama akan ditimpa seluruhnya.',
        cancelData: `fm_open:${absIndex}`,
      })
    );
  });

  bot.action(/^fm_act:dl:(\d+)$/, async (ctx) => {
    const absIndex = parseInt(ctx.match[1], 10);
    const ptero = ctx.state.ptero;
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId || !ptero) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'File tidak ditemukan. Muat ulang folder.', { show_alert: true });
    }
    if (item.size > MAX_TELEGRAM_DOWNLOAD) {
      return answer(ctx, 'File melebihi 20 MB, batas unduh Telegram Bot API.', { show_alert: true });
    }

    await answer(ctx, 'Menyiapkan unduhan...');
    const status = await notifyRich(
      ctx,
      R.compose(R.p(`Mengunduh ${R.code(item.name)} dari server...`))
    );

    try {
      const downloadUrl = await ptero.getDownloadUrl(serverId, path.join(cwd, item.name));
      const response = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 45000 });
      const buffer = Buffer.from(response.data);

      await ctx.replyWithDocument(
        { source: buffer, filename: item.name },
        { caption: `File: ${item.name} (${formatBytes(item.size)})` }
      );
      await removeMessage(ctx, status.message_id);
    } catch (err) {
      await removeMessage(ctx, status.message_id);
      await sendView(
        ctx,
        V.hasilAksi({
          title: 'Unduhan Gagal',
          message: `Panel menolak unduhan: ${err.message}`,
        })
      );
    }
  });

  bot.action(/^fm_act:ren:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const absIndex = parseInt(ctx.match[1], 10);
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'Item tidak ditemukan. Muat ulang folder.', { show_alert: true });
    }

    stateStore.updateState(ctx.from.id, {
      pendingAction: { type: 'file_rename', serverId, cwd, oldName: item.name, absIndex },
    });

    return showView(
      ctx,
      V.promptFile({
        title: `Ganti Nama ${item.name}`,
        path: cwd,
        description: 'Kirim nama baru sebagai pesan teks.',
        cancelData: `fm_open:${absIndex}`,
      })
    );
  });

  bot.action(/^fm_act:del:(\d+)$/, async (ctx) => {
    await answer(ctx);
    const absIndex = parseInt(ctx.match[1], 10);
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'Item tidak ditemukan. Muat ulang folder.', { show_alert: true });
    }

    return showView(ctx, V.konfirmasiHapus({ item, absIndex }));
  });

  bot.action(/^fm_del_confirm:(\d+)$/, async (ctx) => {
    const absIndex = parseInt(ctx.match[1], 10);
    const ptero = ctx.state.ptero;
    const serverId = ctx.state.nav?.activeServerId;
    const cwd = ctx.state.nav?.cwd || '/';
    if (!serverId || !ptero) return;

    const item = cachedItem(ctx, serverId, cwd, absIndex);
    if (!item) {
      return answer(ctx, 'Item tidak ditemukan. Muat ulang folder.', { show_alert: true });
    }

    await answer(ctx, 'Menghapus item...');

    try {
      await ptero.deleteFiles(serverId, cwd, [item.name]);
      await notifyRich(ctx, R.compose(R.p(`${R.b(item.name)} dihapus dari ${R.code(cwd)}.`)));
      return showDirectory(ctx, serverId, cwd, 1);
    } catch (err) {
      return sendView(
        ctx,
        V.hasilAksi({ title: 'Hapus Gagal', message: `Panel menolak penghapusan: ${err.message}` })
      );
    }
  });

  bot.action(/^fm_mkdir:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    const serverId = ctx.match[1];
    const cwd = ctx.state.nav?.cwd || '/';

    stateStore.updateState(ctx.from.id, {
      pendingAction: { type: 'file_mkdir', serverId, cwd },
    });

    return showView(
      ctx,
      V.promptFile({
        title: 'Buat Folder Baru',
        path: cwd,
        description: 'Kirim nama folder baru sebagai pesan teks.',
        cancelData: `fm_view:${serverId}:1`,
      })
    );
  });

  bot.action(/^fm_upld:([a-zA-Z0-9_\-]+)$/, async (ctx) => {
    await answer(ctx);
    const serverId = ctx.match[1];
    const cwd = ctx.state.nav?.cwd || '/';

    stateStore.updateState(ctx.from.id, {
      pendingAction: { type: 'file_upload', serverId, cwd },
    });

    return showView(
      ctx,
      V.promptFile({
        title: 'Upload File',
        path: cwd,
        description: 'Kirim dokumen ke chat ini. Batas ukuran file adalah 20 MB.',
        cancelData: `fm_view:${serverId}:1`,
      })
    );
  });
}

/**
 * Memproses input teks untuk aksi file manager.
 * @returns {Promise<boolean>}
 */
async function processFileManagerTextInput(ctx, pendingAction) {
  const ptero = ctx.state.ptero;
  const text = ctx.message?.text?.trim();
  if (!ptero || !text) return false;

  if (pendingAction.type === 'file_mkdir') {
    const { serverId, cwd } = pendingAction;
    stateStore.updateState(ctx.from.id, { pendingAction: null });

    const folderName = text.replace(/[/\\]/g, '').trim();
    if (!folderName) {
      await sendView(ctx, V.hasilAksi({ title: 'Nama Folder Tidak Valid', message: 'Nama folder tidak boleh kosong atau berisi garis miring.' }));
      return true;
    }

    try {
      await ptero.createFolder(serverId, cwd, folderName);
      await notifyRich(ctx, R.compose(R.p(`Folder ${R.b(folderName)} dibuat di ${R.code(cwd)}.`)));
      await showDirectory(ctx, serverId, cwd, 1);
    } catch (err) {
      await sendView(ctx, V.hasilAksi({ title: 'Buat Folder Gagal', message: err.message }));
    }
    return true;
  }

  if (pendingAction.type === 'file_rename') {
    const { serverId, cwd, oldName } = pendingAction;
    stateStore.updateState(ctx.from.id, { pendingAction: null });

    const newName = text.replace(/[/\\]/g, '').trim();
    if (!newName) {
      await sendView(ctx, V.hasilAksi({ title: 'Nama Tidak Valid', message: 'Nama baru tidak boleh kosong atau berisi garis miring.' }));
      return true;
    }

    try {
      await ptero.renameFile(serverId, cwd, oldName, newName);
      await notifyRich(ctx, R.compose(R.p(`${R.b(oldName)} diganti menjadi ${R.b(newName)}.`)));
      await showDirectory(ctx, serverId, cwd, 1);
    } catch (err) {
      await sendView(ctx, V.hasilAksi({ title: 'Ganti Nama Gagal', message: err.message }));
    }
    return true;
  }

  if (pendingAction.type === 'file_edit') {
    const { serverId, filePath } = pendingAction;
    stateStore.updateState(ctx.from.id, { pendingAction: null });

    try {
      await ptero.writeFileContents(serverId, filePath, ctx.message.text);
      await notifyRich(ctx, R.compose(R.p(`Perubahan ${R.code(filePath)} disimpan.`)));
      await showDirectory(ctx, serverId, getParentPath(filePath), 1);
    } catch (err) {
      await sendView(ctx, V.hasilAksi({ title: 'Simpan Gagal', message: err.message }));
    }
    return true;
  }

  return false;
}

/**
 * Memproses dokumen Telegram untuk diunggah ke server.
 * @returns {Promise<boolean>}
 */
async function processFileManagerDocument(ctx, pendingAction) {
  if (pendingAction?.type !== 'file_upload') return false;

  const doc = ctx.message?.document;
  if (!doc) return false;

  const ptero = ctx.state.ptero;
  const { serverId, cwd } = pendingAction;
  if (!ptero || !serverId) return false;

  stateStore.updateState(ctx.from.id, { pendingAction: null });

  const fileName = doc.file_name || `upload_${Date.now()}`;
  const fileSize = doc.file_size || 0;

  if (fileSize > MAX_TELEGRAM_DOWNLOAD) {
    await sendView(
      ctx,
      V.hasilAksi({
        title: 'File Terlalu Besar',
        message: 'Telegram membatasi bot mengunduh file maksimal 20 MB.',
      })
    );
    return true;
  }

  const status = await notifyRich(
    ctx,
    R.compose(R.p(`Mengunggah ${R.code(fileName)} (${formatBytes(fileSize)}) ke ${R.code(cwd)}...`))
  );

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 45000 });

    await ptero.uploadFile(serverId, cwd, fileName, Buffer.from(response.data));

    await removeMessage(ctx, status.message_id);
    await notifyRich(ctx, R.compose(R.p(`${R.b(fileName)} tersimpan di ${R.code(cwd)}.`)));
    await showDirectory(ctx, serverId, cwd, 1);
  } catch (err) {
    await removeMessage(ctx, status.message_id);
    await sendView(ctx, V.hasilAksi({ title: 'Upload Gagal', message: err.message }));
  }
  return true;
}

module.exports = {
  sanitizePath,
  getParentPath,
  cacheKeyOf,
  showDirectory,
  registerFileManagerHandlers,
  processFileManagerTextInput,
  processFileManagerDocument,
};
