/**
 * Penangan error global untuk Telegraf.
 *
 * Pesan kesalahan dikirim sebagai teks biasa, bukan rich message, karena
 * kegagalan bisa saja berasal dari pemanggilan rich message itu sendiri.
 */
const KNOWN_NOISE = [
  'message is not modified',
  'query is too old',
  'message to edit not found',
  'message can\'t be edited',
];

function errorHandler(err, ctx) {
  const errMsg = err.message || '';

  if (KNOWN_NOISE.some((noise) => errMsg.includes(noise))) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('Data sudah yang terbaru.').catch(() => {});
    }
    return;
  }

  console.error(`[Error Handler] User ${ctx.from?.id}:`, errMsg);

  if (ctx.callbackQuery) {
    ctx.answerCbQuery('Terjadi kesalahan sistem.', { show_alert: true }).catch(() => {});
    return;
  }

  if (ctx.chat) {
    ctx.telegram
      .callApi('sendMessage', {
        chat_id: ctx.chat.id,
        text: `Terjadi kendala: ${errMsg}`,
      })
      .catch(() => {});
  }
}

module.exports = errorHandler;
