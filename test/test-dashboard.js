const assert = require('node:assert');

async function runTest() {
  console.log('Menjalankan pengujian layar dashboard server...');

  const V = require('../utils/views');
  const { renderView } = require('../utils/reply');

  const server = {
    identifier: '2831e1e3',
    name: 'test-node-server',
    node: 'Node-1',
    description: 'Server Pengujian',
    limits: { memory: 1024, disk: 5120, cpu: 100 },
  };

  const stats = {
    current_state: 'running',
    resources: {
      memory_bytes: 524288000,
      cpu_absolute: 15.2,
      disk_bytes: 1048576000,
      uptime: 3600000,
    },
  };

  const html = renderView(V.dashboard({ server, stats }));

  assert.ok(html.includes('test-node-server'), 'Nama server harus termuat');
  assert.ok(html.includes('2831e1e3'), 'Identifier harus termuat');
  assert.ok(html.includes('ONLINE'), 'Status harus ONLINE');
  assert.ok(html.includes('15.20%'), 'Penggunaan CPU harus terformat');
  assert.ok(html.includes('<table bordered striped>'), 'Metrik harus disajikan sebagai tabel');
  assert.ok(html.includes('style="primary"'), 'Tombol navigasi memakai gaya primary');

  // Status berhenti tidak boleh menampilkan uptime palsu
  const offline = renderView(
    V.dashboard({ server, stats: { current_state: 'offline', resources: {} } })
  );
  assert.ok(offline.includes('OFFLINE'));
  assert.ok(offline.includes('Tidak berjalan'));

  console.log('Pengujian dashboard LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
