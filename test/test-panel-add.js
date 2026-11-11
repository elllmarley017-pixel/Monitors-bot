const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { makeCtx, allHtml } = require('./helpers');
const DB_PATH = path.join(__dirname, 'test-panel-add.db');
const TEST_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function fakeClient(account) {
  return () => ({
    getAccount: async () => account,
  });
}

function failingClient(message) {
  return () => ({
    getAccount: async () => {
      throw new Error(message);
    },
  });
}

async function runTest() {
  console.log('Menjalankan pengujian alur Tambah Server...');

  const { initDb, closeDb } = require('../database/db');
  const panelStore = require('../database/panelStore');
  const stateStore = require('../database/stateStore');
  const { processPanelTextInput } = require('../handlers/panelHandler');

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  initDb(DB_PATH);

  const userId = 777001;
  const daftarServer = async () => {};

  // 1. URL tidak valid: tetap di langkah yang sama, beri penjelasan
  stateStore.updateState(userId, { pendingAction: { step: 'awaiting_url' } });
  const ctxBad = makeCtx(userId, { text: 'bukan url' });
  assert.strictEqual(
    await processPanelTextInput(ctxBad, stateStore.getPendingAction(userId), daftarServer),
    true
  );
  assert.ok(allHtml(ctxBad).includes('URL Panel Tidak Valid'), 'URL salah harus dijelaskan');
  assert.strictEqual(
    stateStore.getPendingAction(userId).step,
    'awaiting_url',
    'Pending tetap di awaiting_url agar user bisa mengirim ulang'
  );

  // 2. URL valid: lanjut ke langkah API key
  const ctxUrl = makeCtx(userId, { text: 'panel-satu.contoh.com' });
  await processPanelTextInput(ctxUrl, stateStore.getPendingAction(userId), daftarServer);
  const afterUrl = stateStore.getPendingAction(userId);
  assert.strictEqual(afterUrl.step, 'awaiting_api_key');
  assert.strictEqual(afterUrl.panelUrl, 'https://panel-satu.contoh.com');
  assert.ok(allHtml(ctxUrl).includes('Kirim Client API Key'), 'Bot harus meminta API key');
  assert.ok(!allHtml(ctxUrl).includes('panel bawaan'), 'Tidak boleh ada panel bawaan');

  // 3. Kunci salah awalan: pesan rahasia dihapus, panel tidak tersimpan
  const ctxPrefix = makeCtx(userId, { text: 'kunci-bukan-ptlc' });
  await processPanelTextInput(ctxPrefix, stateStore.getPendingAction(userId), daftarServer);
  assert.ok(
    ctxPrefix.calls.some((c) => c.method === 'deleteMessage' && c.payload.message_id === 99),
    'Pesan berisi kunci harus dihapus'
  );
  assert.ok(allHtml(ctxPrefix).includes('Server Gagal Ditambahkan'));
  assert.strictEqual(panelStore.countPanels(userId), 0, 'Panel tidak boleh tersimpan');

  // 4. Kredensial ditolak panel
  const ctxReject = makeCtx(userId, { text: 'ptlc_salah' });
  await processPanelTextInput(
    ctxReject,
    stateStore.getPendingAction(userId),
    daftarServer,
    { createClient: failingClient('Unauthorized'), secretHex: TEST_SECRET }
  );
  assert.ok(allHtml(ctxReject).includes('Unauthorized'), 'Pesan panel harus diteruskan');
  assert.strictEqual(panelStore.countPanels(userId), 0);

  // 5. Kredensial valid: panel tersimpan, jadi panel aktif, pending dibersihkan
  const ctxOk = makeCtx(userId, { text: 'ptlc_benar' });
  let daftarDipanggil = 0;
  await processPanelTextInput(
    ctxOk,
    stateStore.getPendingAction(userId),
    async () => { daftarDipanggil += 1; },
    { createClient: fakeClient({ username: 'hanztenzu', email: 'a@b.c' }), secretHex: TEST_SECRET }
  );

  assert.ok(allHtml(ctxOk).includes('Server Ditambahkan'));
  assert.strictEqual(panelStore.countPanels(userId), 1, 'Panel harus tersimpan');
  assert.strictEqual(stateStore.getPendingAction(userId), null, 'Pending harus dibersihkan');
  assert.strictEqual(daftarDipanggil, 1, 'Setelah tambah, daftar server game harus dimuat');

  const panel = panelStore.listPanels(userId)[0];
  assert.strictEqual(stateStore.getState(userId).activePanelId, panel.id, 'Panel baru jadi aktif');
  assert.strictEqual(
    panelStore.getPanelCredentials(userId, panel.id, TEST_SECRET).apiKey,
    'ptlc_benar',
    'Kredensial terdekripsi harus sesuai'
  );

  // 6. URL duplikat ditolak sebelum meminta kunci
  stateStore.updateState(userId, { pendingAction: { step: 'awaiting_url' } });
  const ctxDup = makeCtx(userId, { text: 'https://panel-satu.contoh.com/' });
  await processPanelTextInput(ctxDup, stateStore.getPendingAction(userId), daftarServer);
  assert.ok(allHtml(ctxDup).includes('sudah terdaftar'));
  assert.strictEqual(panelStore.countPanels(userId), 1);
  assert.strictEqual(stateStore.getPendingAction(userId), null, 'Alur duplikat dihentikan');

  // 7. Panel kedua: user bisa punya banyak server
  stateStore.updateState(userId, { pendingAction: { step: 'awaiting_url' } });
  const ctxDua = makeCtx(userId, { text: 'https://panel-dua.contoh.com' });
  await processPanelTextInput(ctxDua, stateStore.getPendingAction(userId), daftarServer);
  const ctxDuaKey = makeCtx(userId, { text: 'ptlc_dua' });
  await processPanelTextInput(
    ctxDuaKey,
    stateStore.getPendingAction(userId),
    daftarServer,
    { createClient: fakeClient({ username: 'kedua', email: 'k@d.c' }), secretHex: TEST_SECRET }
  );

  assert.strictEqual(panelStore.countPanels(userId), 2, 'User harus bisa punya dua panel');
  const panels = panelStore.listPanels(userId);
  assert.strictEqual(
    stateStore.getState(userId).activePanelId,
    panels[panels.length - 1].id,
    'Panel yang baru ditambahkan menjadi aktif'
  );

  closeDb();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  console.log('Pengujian Tambah Server LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
