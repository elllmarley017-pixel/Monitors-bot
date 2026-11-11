const assert = require('node:assert');
const { createClient } = require('../services/pteroClient');

// Kredensial uji dibaca dari environment, tidak pernah disimpan di repositori.
const LIVE_TEST_KEY = process.env.PTERO_TEST_API_KEY;
// Panel uji integrasi, bukan konfigurasi bot.
const LIVE_PANEL_URL = process.env.PTERO_TEST_PANEL_URL;

if (!LIVE_TEST_KEY || !LIVE_PANEL_URL) {
  console.error('Butuh PTERO_TEST_PANEL_URL dan PTERO_TEST_API_KEY untuk menjalankan uji integrasi.');
  process.exit(1);
}

async function runE2ETest() {
  console.log('Menjalankan integrasi End-to-End dengan panel Pterodactyl riil...');

  const client = createClient(LIVE_PANEL_URL, LIVE_TEST_KEY);

  // 1. Verifikasi akun
  console.log('1. Menguji getAccount()...');
  const account = await client.getAccount();
  assert.strictEqual(account.username, 'hanztenzu');
  console.log(`Akun terverifikasi: ${account.username} (${account.email})`);

  // 2. Verifikasi daftar server
  console.log('2. Menguji listServers()...');
  const { servers, pagination } = await client.listServers(1);
  assert.ok(servers.length > 0, 'Harus ada minimal 1 server');
  const targetServer = servers[0];
  console.log(`Server ditemukan: ${targetServer.name} [${targetServer.identifier}]`);

  // 3. Verifikasi pembacaan resource
  console.log('3. Menguji getServerResources()...');
  const stats = await client.getServerResources(targetServer.identifier);
  assert.ok(stats.current_state, 'Status server harus terdefinisi');
  console.log(`Status server: ${stats.current_state}`);

  // 4. Verifikasi pembacaan direktori file
  console.log('4. Menguji listFiles()...');
  const files = await client.listFiles(targetServer.identifier, '/');
  assert.ok(Array.isArray(files), 'Daftar file harus berupa array');
  console.log(`Jumlah file di root: ${files.length}`);

  // 5. Verifikasi pembacaan startup variables
  console.log('5. Menguji getStartup()...');
  const startup = await client.getStartup(targetServer.identifier);
  assert.ok(Array.isArray(startup.variables), 'Variabel startup harus berupa array');
  console.log(`Jumlah variabel startup: ${startup.variables.length}`);

  console.log('Integrasi E2E sukses 100%!');
}

runE2ETest().catch((err) => {
  console.error('Integrasi E2E gagal:', err);
  process.exit(1);
});
