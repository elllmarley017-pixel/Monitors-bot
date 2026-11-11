const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const TEST_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DB_PATH = path.join(__dirname, 'test-panels.db');

async function runTest() {
  console.log('Menjalankan pengujian panelStore: enkripsi, isolasi user, dan persistensi...');

  const cryptoService = require('../services/cryptoService');
  const { initDb, closeDb, getDb } = require('../database/db');
  const panelStore = require('../database/panelStore');

  // 1. Enkripsi dan dekripsi dasar
  const plaintext = 'ptlc_test_secret_key_12345';
  const encrypted = cryptoService.encrypt(plaintext, TEST_SECRET);
  assert.ok(encrypted.iv && encrypted.authTag && encrypted.content, 'Bagian ciphertext harus lengkap');
  assert.notStrictEqual(encrypted.content, plaintext, 'Ciphertext tidak boleh sama dengan plaintext');
  assert.strictEqual(cryptoService.decrypt(encrypted, TEST_SECRET), plaintext);

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  initDb(DB_PATH);

  const userA = 999001;
  const userB = 999002;

  // 2. Normalisasi URL
  assert.strictEqual(panelStore.normalizePanelUrl('panel.contoh.com'), 'https://panel.contoh.com');
  assert.strictEqual(panelStore.normalizePanelUrl('https://panel.contoh.com/'), 'https://panel.contoh.com');
  assert.strictEqual(panelStore.normalizePanelUrl('http://panel.contoh.com///'), 'http://panel.contoh.com');
  assert.throws(() => panelStore.normalizePanelUrl('   '), /host|Invalid URL/i);

  // 3. Tambah dua panel untuk user A
  const panel1 = panelStore.addPanel(
    userA,
    { panelUrl: 'https://panel-satu.contoh.com', apiKey: 'ptlc_satu' },
    TEST_SECRET
  );
  const panel2 = panelStore.addPanel(
    userA,
    { panelUrl: 'https://panel-dua.contoh.com', apiKey: 'ptlc_dua' },
    TEST_SECRET
  );
  assert.ok(panel1.id !== panel2.id, 'Setiap panel harus punya id sendiri');

  const daftar = panelStore.listPanels(userA);
  assert.strictEqual(daftar.length, 2, 'User A harus punya dua panel');
  assert.deepStrictEqual(daftar.map((p) => p.panelUrl).sort(), [
    'https://panel-dua.contoh.com',
    'https://panel-satu.contoh.com',
  ]);

  // 4. Kredensial tersimpan terpisah dan benar
  const kredensial1 = panelStore.getPanelCredentials(userA, panel1.id, TEST_SECRET);
  const kredensial2 = panelStore.getPanelCredentials(userA, panel2.id, TEST_SECRET);
  assert.strictEqual(kredensial1.apiKey, 'ptlc_satu');
  assert.strictEqual(kredensial2.apiKey, 'ptlc_dua');

  // 5. API key tidak tersimpan dalam bentuk asli
  const baris = getDb().prepare('SELECT * FROM panels WHERE id = ?').get(panel1.id);
  assert.ok(!JSON.stringify(baris).includes('ptlc_satu'), 'API key tidak boleh tersimpan polos');

  // 6. Isolasi antar user
  const panelB = panelStore.addPanel(
    userB,
    { panelUrl: 'https://panel-satu.contoh.com', apiKey: 'ptlc_milik_b' },
    TEST_SECRET
  );
  assert.strictEqual(panelStore.listPanels(userB).length, 1, 'User B hanya melihat panelnya sendiri');
  assert.strictEqual(
    panelStore.getPanelCredentials(userB, panel1.id, TEST_SECRET),
    null,
    'User B tidak boleh membaca panel milik user A'
  );
  assert.strictEqual(
    panelStore.deletePanel(userB, panel1.id),
    false,
    'User B tidak boleh menghapus panel milik user A'
  );
  assert.strictEqual(panelStore.listPanels(userA).length, 2, 'Panel user A harus tetap utuh');

  // 7. URL duplikat ditolak per user, bukan lintas user
  assert.throws(
    () => panelStore.addPanel(userA, { panelUrl: 'https://panel-satu.contoh.com', apiKey: 'x' }, TEST_SECRET),
    /sudah terdaftar/
  );
  assert.ok(panelB.id, 'URL sama boleh dipakai user lain');

  // 8. Persistensi setelah koneksi database ditutup dan dibuka ulang
  const idSebelum = panel2.id;
  closeDb();
  initDb(DB_PATH);

  const setelahRestart = panelStore.listPanels(userA);
  assert.strictEqual(setelahRestart.length, 2, 'Panel harus bertahan setelah restart');
  assert.strictEqual(
    panelStore.getPanelCredentials(userA, idSebelum, TEST_SECRET).apiKey,
    'ptlc_dua',
    'Kredensial harus tetap bisa didekripsi setelah restart'
  );

  // 9. Hapus panel dan pastikan panel lain tidak terpengaruh
  assert.strictEqual(panelStore.deletePanel(userA, idSebelum), true);
  assert.strictEqual(panelStore.listPanels(userA).length, 1);
  assert.strictEqual(panelStore.countPanels(userA), 1);

  // 10. Ringkasan pemilik menghitung jumlah panel per user
  const ringkasan = panelStore.listUsersWithPanels();
  const barisA = ringkasan.find((u) => u.telegram_id === userA);
  assert.strictEqual(Number(barisA.panel_count), 1);

  closeDb();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  console.log('Pengujian panelStore LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
