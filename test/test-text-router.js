const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { makeCtx, allHtml } = require('./helpers');
const DB_PATH = path.join(__dirname, 'test-router.db');

async function runTest() {
  console.log('Menjalankan pengujian routing pesan teks...');

  const { initDb, closeDb } = require('../database/db');
  const panelStore = require('../database/panelStore');
  const stateStore = require('../database/stateStore');
  const { handleTextUpdate } = require('../handlers/textRouter');
  const config = require('../config');

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  initDb(DB_PATH);

  const userId = 888001;

  // 1. Tanpa panel: pesan apa pun mengarah ke Tambah Server
  const ctxBaru = makeCtx(userId, { text: 'halo' });
  ctxBaru.state = { session: null, ptero: null, nav: stateStore.getState(userId), isOwner: false };
  let daftarDipanggil = 0;
  await handleTextUpdate(ctxBaru, { showServerList: async () => { daftarDipanggil += 1; } });

  const htmlBaru = allHtml(ctxBaru);
  assert.ok(htmlBaru.includes('Belum ada server'), 'Tanpa panel harus diarahkan ke Tambah Server');
  assert.ok(htmlBaru.includes('Tambah Server'), 'Tombol Tambah Server harus ada');
  assert.ok(!htmlBaru.includes('/start'), 'Tidak boleh menyebut command');
  assert.strictEqual(daftarDipanggil, 0, 'Daftar server game tidak boleh dimuat tanpa panel');

  // 2. /start membuka layar sambutan, bukan menu biasa
  const ctxStart = makeCtx(888003, { text: '/start' });
  ctxStart.state = { ptero: null, nav: stateStore.getState(888003), isOwner: false };
  await handleTextUpdate(ctxStart, { showServerList: async () => {} });

  const startPayload = ctxStart.calls.find((c) => c.method === 'sendRichMessage').payload.rich_message;
  assert.ok(Array.isArray(startPayload.blocks), '/start harus mengirim blok native');
  assert.ok(
    JSON.stringify(startPayload.blocks).includes('Informasi Bot'),
    '/start harus menampilkan Informasi Bot'
  );

  // 2b. /start@namabot juga dikenali
  const ctxStartNamed = makeCtx(888004, { text: '/start@contohbot' });
  ctxStartNamed.state = { ptero: null, nav: stateStore.getState(888004), isOwner: false };
  await handleTextUpdate(ctxStartNamed, { showServerList: async () => {} });
  assert.ok(
    JSON.stringify(ctxStartNamed.calls[0].payload.rich_message).includes('Informasi Bot'),
    '/start@namabot harus membuka layar sambutan'
  );

  // 3. Alur Tambah Server aktif: input API key harus diproses, bukan jatuh ke menu
  stateStore.updateState(userId, {
    pendingAction: { step: 'awaiting_api_key', panelUrl: 'https://panel.contoh.com' },
  });
  const ctxKey = makeCtx(userId, { text: 'ptlc_invalid_for_test' });
  ctxKey.state = { ptero: null, nav: stateStore.getState(userId), isOwner: false };
  await handleTextUpdate(ctxKey, { showServerList: async () => {} });

  const htmlKey = allHtml(ctxKey);
  assert.ok(htmlKey.includes('Server Gagal Ditambahkan'), 'Kunci tidak valid harus dilaporkan');
  assert.ok(!htmlKey.includes('Belum ada server'), 'Tidak boleh kembali ke beranda saat alur aktif');

  // 4. Panel aktif: pesan biasa membuka daftar server game dari panel itu
  stateStore.updateState(userId, { pendingAction: null });
  const panel = panelStore.addPanel(
    userId,
    { panelUrl: 'https://panel-aktif.contoh.com', apiKey: 'ptlc_aktif' },
    config.ENCRYPTION_SECRET
  );
  stateStore.updateState(userId, { activePanelId: panel.id });

  const ctxAktif = makeCtx(userId, { text: 'menu' });
  ctxAktif.state = { ptero: { dummy: true }, nav: stateStore.getState(userId), isOwner: false };
  let halaman = null;
  await handleTextUpdate(ctxAktif, {
    showServerList: async (_ctx, page) => { halaman = page; },
  });
  assert.strictEqual(halaman, 1, 'Dengan panel aktif, daftar server game harus dimuat');

  closeDb();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  console.log('Routing pesan teks LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
