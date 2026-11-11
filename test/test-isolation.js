const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, 'test-isolation.db');
const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

async function runTest() {
  console.log('Menjalankan pengujian isolasi sesi antar user...');

  const { initDb, closeDb } = require('../database/db');
  const panelStore = require('../database/panelStore');
  const stateStore = require('../database/stateStore');
  const { authMiddleware } = require('../middleware/auth');
  const { consoleSessionKey, getConsoleSession } = require('../services/pteroConsoleWs');
  const { cacheKeyOf } = require('../handlers/fileManagerHandler');
  const { startupCacheKey } = require('../handlers/startupHandler');

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  initDb(DB_PATH);

  const userA = 610001;
  const userB = 610002;
  const URL_SAMA = 'https://panel-bersama.contoh.com';

  // 1. URL sama untuk dua user menghasilkan baris dan kredensial berbeda
  const panelA = panelStore.addPanel(userA, { panelUrl: URL_SAMA, apiKey: 'ptlc_punya_a' }, SECRET);
  const panelB = panelStore.addPanel(userB, { panelUrl: URL_SAMA, apiKey: 'ptlc_punya_b' }, SECRET);
  assert.notStrictEqual(panelA.id, panelB.id, 'Dua user harus punya baris panel berbeda');
  assert.strictEqual(panelStore.getPanelCredentials(userA, panelA.id, SECRET).apiKey, 'ptlc_punya_a');
  assert.strictEqual(panelStore.getPanelCredentials(userB, panelB.id, SECRET).apiKey, 'ptlc_punya_b');
  assert.strictEqual(
    panelStore.getPanelCredentials(userA, panelB.id, SECRET),
    null,
    'User A tidak boleh memakai panel milik user B'
  );

  // 2. State navigasi terpisah
  stateStore.updateState(userA, { activePanelId: panelA.id, activeServerId: 'srv-sama' });
  stateStore.updateState(userB, { activePanelId: panelB.id, activeServerId: 'srv-sama' });
  assert.strictEqual(stateStore.getState(userA).activePanelId, panelA.id);
  assert.strictEqual(stateStore.getState(userB).activePanelId, panelB.id);

  // 3. Middleware menolak state yang menunjuk panel milik user lain
  stateStore.updateState(userB, { activePanelId: panelA.id });
  const ctxPalsu = {
    from: { id: userB },
    state: {},
    callbackQuery: undefined,
    chat: { id: userB },
    reply: async () => {},
    telegram: { callApi: async () => ({}) },
  };
  await authMiddleware(ctxPalsu, async () => {});
  assert.strictEqual(ctxPalsu.state.ptero, null, 'Panel milik user lain tidak boleh dipakai');
  assert.strictEqual(ctxPalsu.state.panel, null);
  assert.strictEqual(
    stateStore.getState(userB).activePanelId,
    null,
    'State yang menunjuk panel asing harus dibersihkan'
  );

  // 4. Pool sesi console tidak boleh dibagi antar user maupun antar panel
  const kunciA = consoleSessionKey({ userId: userA, panelId: panelA.id, serverId: 'srv-sama' });
  const kunciB = consoleSessionKey({ userId: userB, panelId: panelB.id, serverId: 'srv-sama' });
  const kunciA2 = consoleSessionKey({ userId: userA, panelId: 999, serverId: 'srv-sama' });
  assert.notStrictEqual(kunciA, kunciB, 'Kunci console harus memuat user dan panel');
  assert.notStrictEqual(kunciA, kunciA2, 'Panel berbeda tidak boleh berbagi kunci console');

  const sesiA = getConsoleSession({ dummy: true }, 'srv-sama', { userId: userA, panelId: panelA.id });
  // Tandai seolah tersambung agar pool memakai ulang instance yang sama.
  sesiA.connected = true;
  sesiA.ws = { readyState: 1 };
  const sesiALagi = getConsoleSession({ dummy: true }, 'srv-sama', { userId: userA, panelId: panelA.id });
  const sesiB = getConsoleSession({ dummy: true }, 'srv-sama', { userId: userB, panelId: panelB.id });
  assert.strictEqual(sesiA, sesiALagi, 'User dan panel yang sama boleh memakai sesi yang sama');
  assert.notStrictEqual(sesiA, sesiB, 'User berbeda wajib memakai sesi console berbeda');

  // 5. Kunci cache file manager dan startup memuat user serta panel
  const ctxA = { from: { id: userA }, state: { panel: { id: panelA.id } } };
  const ctxB = { from: { id: userB }, state: { panel: { id: panelB.id } } };
  assert.notStrictEqual(
    cacheKeyOf(ctxA, 'srv-sama', '/'),
    cacheKeyOf(ctxB, 'srv-sama', '/'),
    'Cache file manager tidak boleh berbagi antar user'
  );
  assert.notStrictEqual(
    cacheKeyOf(ctxA, 'srv-sama', '/'),
    cacheKeyOf({ from: { id: userA }, state: { panel: { id: 999 } } }, 'srv-sama', '/'),
    'Cache file manager tidak boleh berbagi antar panel'
  );
  assert.notStrictEqual(
    startupCacheKey(ctxA, 'srv-sama'),
    startupCacheKey(ctxB, 'srv-sama'),
    'Cache startup tidak boleh berbagi antar user'
  );

  // 6. Menghapus panel user A tidak menyentuh panel user B
  panelStore.deletePanel(userA, panelA.id);
  assert.strictEqual(panelStore.countPanels(userA), 0);
  assert.strictEqual(panelStore.countPanels(userB), 1);
  assert.strictEqual(
    panelStore.getPanelCredentials(userB, panelB.id, SECRET).apiKey,
    'ptlc_punya_b'
  );

  closeDb();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  console.log('Pengujian isolasi sesi antar user LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
