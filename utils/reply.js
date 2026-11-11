/**
 * Lapisan transport Rich Message.
 *
 * Telegraf 4 belum mengenal sendRichMessage maupun field rich_message, jadi
 * pemanggilan dilakukan lewat callApi() yang meneruskan payload apa adanya.
 *
 * Layar bisa berbentuk HTML ({ html, buttons }) atau blok native
 * ({ blocks, buttons }). Bentuk blok dipakai ketika tabel harus menjadi tabel
 * Telegram sungguhan, bukan susunan tag HTML.
 */

const rich = require('./rich');
const blocks = require('./blocks');

/**
 * Ubah layar menjadi payload rich_message.
 * @returns {{richMessage: object, extra: object}}
 */
function buildView(view) {
  // skip_entity_detection adalah field InputRichMessage, jadi harus berada di
  // dalam rich_message. Bila ditaruh di level method, API mengabaikannya dan
  // nama kanal berubah menjadi mention yang bisa menyebut pengguna lain.
  const opsi = view.skipEntityDetection ? { skip_entity_detection: true } : {};

  if (Array.isArray(view.blocks)) {
    const daftar = blocks.compose(view.blocks, blocks.buttons(view.buttons));
    return { richMessage: { blocks: daftar, ...opsi }, extra: {} };
  }

  return {
    richMessage: { html: rich.compose(view.html, rich.renderButtonRows(view.buttons)), ...opsi },
    extra: {},
  };
}

/**
 * Representasi layar sebagai objek rich_message.
 * Dipakai pengujian agar bisa memeriksa bentuk blok maupun HTML.
 */
function toRichMessage(view) {
  return buildView(view).richMessage;
}

/** Gabungkan isi HTML dengan baris tombol native, untuk layar berbasis HTML. */
function renderView(view) {
  return rich.compose(view.html, rich.renderButtonRows(view.buttons));
}

/** Kirim pesan rich ke chat saat ini. */
async function sendRichMessage(ctx, richMessage, extra = {}) {
  return ctx.telegram.callApi('sendRichMessage', {
    chat_id: ctx.chat.id,
    rich_message: richMessage,
    ...extra,
  });
}

/** Sunting pesan yang menjadi sumber callback menjadi rich message baru. */
async function editRichMessage(ctx, richMessage, extra = {}) {
  const message = ctx.callbackQuery && ctx.callbackQuery.message;
  if (!message) throw new Error('Tidak ada pesan callback untuk disunting.');

  return ctx.telegram.callApi('editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    rich_message: richMessage,
    ...extra,
  });
}

/**
 * Tampilkan rich message: sunting bila berasal dari tombol, kirim bila bukan.
 * Pesan lama yang tidak bisa disunting (misalnya sudah dihapus) diganti pesan baru.
 */
async function showRichMessage(ctx, richMessage, extra = {}) {
  if (ctx.callbackQuery) {
    try {
      return await editRichMessage(ctx, richMessage, extra);
    } catch (err) {
      console.error('Gagal menyunting rich message:', err.message);
    }
  }
  return sendRichMessage(ctx, richMessage, extra);
}

/** Tampilkan layar { html|blocks, buttons }. */
async function showView(ctx, view) {
  const { richMessage, extra } = buildView(view);
  return showRichMessage(ctx, richMessage, extra);
}

/** Kirim layar sebagai pesan baru, tanpa menyunting pesan lama. */
async function sendView(ctx, view) {
  const { richMessage, extra } = buildView(view);
  return sendRichMessage(ctx, richMessage, extra);
}

/** Kirim pesan HTML sederhana tanpa tombol (catatan status). */
async function sendRich(ctx, html, extra = {}) {
  return ctx.telegram.callApi('sendRichMessage', {
    chat_id: ctx.chat.id,
    rich_message: { html },
    ...extra,
  });
}

/** Sunting pesan callback menjadi HTML sederhana. */
async function editRich(ctx, html, extra = {}) {
  return editRichMessage(ctx, { html }, extra);
}

/** Tampilkan HTML sederhana: sunting bila dari tombol, kirim bila bukan. */
async function showRich(ctx, html, extra = {}) {
  return showRichMessage(ctx, { html }, extra);
}

/**
 * Kirim catatan singkat (status, hasil aksi) yang tidak perlu tombol.
 * Bila autoDelete diisi, pesan dihapus setelah jangka waktu tersebut.
 */
async function notifyRich(ctx, html, { autoDelete = 0 } = {}) {
  const sent = await sendRich(ctx, html);
  if (autoDelete > 0) {
    const timer = setTimeout(() => {
      ctx.telegram
        .callApi('deleteMessage', { chat_id: ctx.chat.id, message_id: sent.message_id })
        .catch(() => {});
    }, autoDelete);
    if (typeof timer.unref === 'function') timer.unref();
  }
  return sent;
}

/** Kirim catatan singkat dari layar tanpa tombol. */
async function notifyView(ctx, view, opts = {}) {
  const { richMessage, extra } = buildView({ ...view, buttons: [] });
  const sent = await sendRichMessage(ctx, richMessage, extra);
  if (opts.autoDelete > 0) {
    const timer = setTimeout(() => {
      ctx.telegram
        .callApi('deleteMessage', { chat_id: ctx.chat.id, message_id: sent.message_id })
        .catch(() => {});
    }, opts.autoDelete);
    if (typeof timer.unref === 'function') timer.unref();
  }
  return sent;
}

/** Jawab callback query tanpa menggantung indikator loading. */
async function answer(ctx, text, opts = {}) {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCbQuery(text, opts);
  } catch {
    // Callback query kedaluwarsa bukan kegagalan alur.
  }
}

/** Hapus pesan berdasarkan id. */
async function removeMessage(ctx, messageId) {
  if (!messageId) return;
  try {
    await ctx.telegram.callApi('deleteMessage', { chat_id: ctx.chat.id, message_id: messageId });
  } catch {
    // Pesan sudah tidak ada.
  }
}

module.exports = {
  buildView,
  toRichMessage,
  renderView,
  showView,
  sendView,
  sendRichMessage,
  editRichMessage,
  showRichMessage,
  sendRich,
  editRich,
  showRich,
  notifyRich,
  notifyView,
  answer,
  removeMessage,
};
