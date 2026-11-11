const assert = require('node:assert');

async function runTest() {
  console.log('Menjalankan pengujian pteroClient dan formatter...');

  const { createClient } = require('../services/pteroClient');
  const formatter = require('../utils/formatter');

  // 1. Uji formatter
  assert.strictEqual(formatter.formatBytes(0), '0 B');
  assert.strictEqual(formatter.formatBytes(1024), '1 KB');
  assert.strictEqual(formatter.formatBytes(1048576), '1 MB');
  assert.strictEqual(formatter.formatBytes(1073741824), '1 GB');
  assert.strictEqual(formatter.formatPercent(12.3456), '12.35%');
  assert.strictEqual(formatter.escapeHtml('<b>Test & "quote"</b>'), '&lt;b&gt;Test &amp; &quot;quote&quot;&lt;/b&gt;');
  assert.strictEqual(formatter.statusBadge('running'), 'ONLINE');
  assert.strictEqual(formatter.statusBadge('offline'), 'OFFLINE');
  assert.strictEqual(formatter.statusBadge('starting'), 'STARTING');

  // 2. Uji inisialisasi Client
  const client = createClient('https://panel.contoh.com', 'ptlc_dummy_key');
  assert.strictEqual(client.baseUrl, 'https://panel.contoh.com');

  // 3. Uji sanitasi error
  const errMessage = client.formatError({
    response: {
      status: 403,
      data: { errors: [{ detail: 'Access denied test' }] },
    },
  });
  assert.ok(errMessage.includes('Access denied test'), 'Pesan error detail harus terbawa');

  console.log('Task 2 tests passed successfully!');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
