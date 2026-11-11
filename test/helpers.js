/**
 * Bantuan pengujian: ctx tiruan yang merekam pemanggilan Bot API.
 *
 * Transport bot memakai telegram.callApi (sendRichMessage / editMessageText),
 * jadi ctx palsu harus meniru lapisan itu, bukan ctx.reply.
 */

function makeCtx(userId, { text, hasCallback = false, chatId = userId, messageId = 10 } = {}) {
  const calls = [];

  const ctx = {
    from: { id: userId },
    chat: { id: chatId, type: 'private' },
    state: {},
    message:
      text !== undefined
        ? { text, message_id: 99, chat: { id: chatId, type: 'private' } }
        : undefined,
    callbackQuery: hasCallback
      ? { id: 'cb1', data: 'x', message: { message_id: messageId, chat: { id: chatId, type: 'private' } } }
      : undefined,
    answerCbQuery: async (msg, opts) => {
      calls.push({ method: 'answerCbQuery', payload: { text: msg, ...opts } });
      return true;
    },
    replyWithDocument: async () => {
      calls.push({ method: 'sendDocument', payload: {} });
      return { message_id: 700 };
    },
    telegram: {
      callApi: async (method, payload) => {
        calls.push({ method, payload });
        if (method === 'deleteMessage' || method === 'answerCallbackQuery') return true;
        return { message_id: 500 + calls.length, chat: ctx.chat };
      },
      getFileLink: async () => ({ href: 'https://example.com/file' }),
    },
    calls,
  };

  return ctx;
}

/** Kumpulan HTML yang benar-benar dikirim atau disunting. */
function sentHtmls(ctx) {
  return ctx.calls
    .filter((call) => call.method === 'sendRichMessage' || call.method === 'editMessageText')
    .map((call) => (call.payload.rich_message && call.payload.rich_message.html) || '');
}

/** Gabungan seluruh HTML, memudahkan pencarian teks lintas pesan. */
function allHtml(ctx) {
  return sentHtmls(ctx).join('\n');
}

module.exports = { makeCtx, sentHtmls, allHtml };
