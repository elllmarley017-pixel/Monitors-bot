const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, 'test-unauth.db');

async function runTest() {
  console.log('Menjalankan pengujian stateStore untuk user tanpa panel...');

  const { initDb, closeDb } = require('../database/db');
  const stateStore = require('../database/stateStore');
  const panelStore = require('../database/panelStore');

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  initDb(DB_PATH);

  const userId = 555001;

  // User baru: tidak ada panel dan tidak ada state
  assert.strictEqual(panelStore.countPanels(userId), 0, 'User baru tidak punya panel');
  const stateAwal = stateStore.getState(userId);
  assert.strictEqual(stateAwal.activePanelId, null);
  assert.strictEqual(stateAwal.cwd, '/');
  assert.strictEqual(stateAwal.pendingAction, null);

  // Bot menyimpan pendingAction sebelum user memasukkan API key
  stateStore.updateState(userId, {
    pendingAction: { step: 'awaiting_api_key', panelUrl: 'https://panel.contoh.com' },
  });

  assert.strictEqual(panelStore.countPanels(userId), 0, 'Panel belum ada saat kunci belum valid');

  const pending = stateStore.getPendingAction(userId);
  assert.ok(pending, 'pendingAction harus tersimpan untuk user tanpa panel');
  assert.strictEqual(pending.step, 'awaiting_api_key');
  assert.strictEqual(pending.panelUrl, 'https://panel.contoh.com');

  // Field lain tidak ikut berubah saat pendingAction diperbarui
  stateStore.updateState(userId, { activeServerId: 'srv-1', cwd: '/home/container' });
  assert.ok(stateStore.getPendingAction(userId), 'pendingAction harus bertahan');
  assert.strictEqual(stateStore.getState(userId).cwd, '/home/container');

  // Panel aktif dicatat terpisah dari server game aktif
  stateStore.updateState(userId, { activePanelId: 42, activeServerId: null, cwd: '/' });
  const state = stateStore.getState(userId);
  assert.strictEqual(state.activePanelId, 42);
  assert.strictEqual(state.activeServerId, null);

  // Pending action dibersihkan tanpa menyentuh state navigasi
  stateStore.updateState(userId, { pendingAction: null });
  assert.strictEqual(stateStore.getPendingAction(userId), null);
  assert.strictEqual(stateStore.getState(userId).activePanelId, 42);

  // Isolasi state antar user
  assert.strictEqual(stateStore.getState(556001).activePanelId, null);

  closeDb();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  console.log('Pengujian stateStore LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
