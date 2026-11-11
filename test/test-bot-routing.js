const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const TEST_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * Uji perakitan bot tanpa jaringan: update sintetis diproses oleh
 * instance bot yang sama dengan produksi (app.js), lalu seluruh panggilan
 * Bot API direkam.
 */

function makeUpdate(base) {
  return { update_id: base.update_id, ...base };
}

function attachRecorder(bot) {
  const calls = [];

  // Telegraf membuat instance Telegram baru untuk setiap update
  // (handleUpdate -> new Telegram(...)), jadi stub dipasang lewat bot.context
  // agar ctx.telegram pada setiap update memakai perekam ini.
  const record = (method, payload) => {
    calls.push({ method, payload });
    if (method === 'answerCallbackQuery' || method === 'deleteMessage') return true;
    return { message_id: 900 + calls.length, chat: { id: payload.chat_id } };
  };

  const fakeTelegram = {
    callApi: async (method, payload) => record(method, payload),
    // Context.answerCbQuery memakai alias camelCase dari method hasil generate.
    answerCbQuery: async (id, text, opts) => record('answerCallbackQuery', { text, ...opts }),
    sendDocument: async () => record('sendDocument', {}),
    getFileLink: async () => ({ href: 'https://example.com/file' }),
  };

  bot.botInfo = {
    id: 999,
    is_bot: true,
    first_name: 'Bot',
    username: 'testbot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  };
  bot.telegram.getMe = async () => bot.botInfo;
  bot.context = { telegram: fakeTelegram };

  return calls;
}

function htmls(calls) {
  return calls
    .filter((c) => c.method === 'sendRichMessage' || c.method === 'editMessageText')
    .map((c) => {
      const richMessage = c.payload.rich_message || {};
      return richMessage.html || JSON.stringify(richMessage.blocks || []);
    });
}

/** Payload rich_message dari panggilan terakhir. */
function lastRich(calls) {
  const call = [...calls]
    .reverse()
    .find((c) => c.method === 'sendRichMessage' || c.method === 'editMessageText');
  return call ? call.payload.rich_message : null;
}

function textMessage(userId, text, messageId = 1) {
  return makeUpdate({
    update_id: messageId,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private' },
      from: { id: userId, is_bot: false, first_name: 'Penguji' },
      text,
    },
  });
}

function callbackUpdate(userId, data, messageId = 50) {
  return makeUpdate({
    update_id: messageId + 1000,
    callback_query: {
      id: `cb-${messageId}`,
      from: { id: userId, is_bot: false, first_name: 'Penguji' },
      chat_instance: '1',
      data,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: userId, type: 'private' },
        from: { id: 999, is_bot: true, first_name: 'Bot' },
        text: 'pesan lama',
      },
    },
  });
}

function documentUpdate(userId, messageId = 77) {
  return makeUpdate({
    update_id: messageId + 2000,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private' },
      from: { id: userId, is_bot: false, first_name: 'Penguji' },
      document: { file_id: 'f1', file_unique_id: 'u1', file_name: 'a.txt', file_size: 10 },
    },
  });
}

async function runTest() {
  console.log('Menjalankan pengujian perakitan bot dan routing update...');

  const { initDb, closeDb } = require('../database/db');
  const { createBot } = require('../app');
  const panelStore = require('../database/panelStore');
  const stateStore = require('../database/stateStore');

  const testDbPath = path.join(__dirname, 'test-routing.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  initDb(testDbPath);

  const bot = createBot('123456:TEST_TOKEN');
  const calls = attachRecorder(bot);

  const userId = 424242;

  // 1. Pesan teks apa pun dari user baru membuka beranda bertombol
  await bot.handleUpdate(textMessage(userId, 'apa saja'));
  let html = htmls(calls).join('\n');
  assert.ok(html.includes('Pterodactyl Manager'), 'Pesan biasa harus membuka beranda');
  assert.ok(html.includes('tg-button-row'), 'Beranda harus memakai tombol native');
  assert.ok(calls.some((c) => c.method === 'sendRichMessage'), 'Beranda dikirim via sendRichMessage');

  // 2. /start membuka layar sambutan berbasis blok dengan tabel native
  calls.length = 0;
  await bot.handleUpdate(textMessage(userId, '/start', 2));
  const startRich = lastRich(calls);
  assert.ok(startRich && Array.isArray(startRich.blocks), '/start harus memakai blok native');
  assert.strictEqual(startRich.html, undefined, '/start tidak boleh memakai HTML');

  const startText = htmls(calls).join('\n');
  assert.ok(startText.includes('Halo!!'), 'Teks pembuka harus tampil');
  assert.ok(startText.includes('Informasi Bot'), 'Judul Informasi Bot harus tampil');
  assert.ok(startText.includes('@HanzTenzX') && startText.includes('1.6.0'), 'Isi tabel harus tampil');
  assert.ok(!startText.includes('https://'), 'Layar /start tidak boleh memuat alamat panel');

  const startTable = startRich.blocks.find((b) => b.type === 'table');
  assert.ok(startTable && startTable.cells.length === 4, 'Tabel Informasi Bot harus 4 baris');
  assert.ok(
    startRich.blocks.some((b) => b.type === 'buttons' && b.buttons.some((x) => x.callback_data === 'pnl_add')),
    'Tombol Tambah Server harus ada di layar /start'
  );

  // 2b. /start saat alur input menggantung melepas pendingAction
  stateStore.updateState(userId, { pendingAction: { step: 'awaiting_url' } });
  calls.length = 0;
  await bot.handleUpdate(textMessage(userId, '/start', 3));
  assert.strictEqual(stateStore.getPendingAction(userId), null, '/start harus melepas alur yang menggantung');

  // 3. Tombol Tambah Server membalas callback dan menyunting pesan menjadi langkah 1
  calls.length = 0;
  await bot.handleUpdate(callbackUpdate(userId, 'pnl_add'));
  assert.ok(
    calls.some((c) => c.method === 'answerCallbackQuery'),
    'Callback harus dijawab agar indikator loading berhenti'
  );
  html = htmls(calls).join('\n');
  assert.ok(html.includes('Langkah 1 dari 2'), 'Langkah 1 harus tampil');
  assert.ok(html.includes('Kirim URL panel'), 'Instruksi URL panel harus ada');
  assert.ok(
    calls.some((c) => c.method === 'editMessageText' && c.payload.message_id === 50),
    'Navigasi tombol harus menyunting pesan yang sama'
  );

  // 3b. Batal mengembalikan ke beranda tanpa menyisakan pendingAction
  calls.length = 0;
  await bot.handleUpdate(callbackUpdate(userId, 'panel_batal', 51));
  html = htmls(calls).join('\n');
  assert.ok(html.includes('Belum ada server'), 'Batal harus kembali ke beranda');
  assert.strictEqual(stateStore.getPendingAction(userId), null, 'Pending harus dibersihkan');

  // 4. Tombol lama yang tidak dikenal tetap dijawab dan diarahkan ke menu
  calls.length = 0;
  await bot.handleUpdate(callbackUpdate(userId, 'aksi_lama:9'));
  const answered = calls.find((c) => c.method === 'answerCallbackQuery');
  assert.ok(answered && /kedaluwarsa/i.test(answered.payload.text || ''), 'Tombol usang harus diberi tahu');
  assert.ok(htmls(calls).join('\n').includes('Pterodactyl Manager'), 'Tombol usang diarahkan ke beranda');

  // 5. Tombol daftar server game tanpa panel tidak boleh jadi jalan buntu
  calls.length = 0;
  await bot.handleUpdate(callbackUpdate(userId, 'srv_list:1'));
  assert.ok(
    htmls(calls).join('\n').includes('Belum ada server'),
    'Tanpa panel, tombol daftar server game harus kembali ke beranda'
  );

  // 5b. Daftar Server menampilkan pilih, hapus, dan tambah
  const panel = panelStore.addPanel(
    userId,
    { panelUrl: 'https://panel-routing.contoh.com', apiKey: 'ptlc_routing' },
    TEST_SECRET
  );
  calls.length = 0;
  await bot.handleUpdate(callbackUpdate(userId, 'pnl_list', 52));
  const panelHtml = htmls(calls).join('\n');
  assert.ok(panelHtml.includes('Daftar Server'), 'Layar Daftar Server harus muncul');
  assert.ok(panelHtml.includes(`pnl_use:${panel.id}`), 'Server harus bisa dipilih');
  assert.ok(panelHtml.includes(`pnl_hapus:${panel.id}`), 'Server harus bisa dihapus');
  assert.ok(panelHtml.includes('pnl_add'), 'Tombol Tambah Server harus ada');

  // 6. Dokumen tanpa alur upload memberi arahan, bukan diam
  calls.length = 0;
  await bot.handleUpdate(documentUpdate(userId));
  assert.ok(htmls(calls).join('\n').includes('Upload Belum Aktif'), 'Dokumen liar harus dijelaskan');

  closeDb();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('Pengujian perakitan bot dan routing LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
