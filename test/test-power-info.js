const assert = require('node:assert');

async function runTest() {
  console.log('Menjalankan pengujian layar power, info, dan metrik...');

  const V = require('../utils/views');
  const { renderView } = require('../utils/reply');

  // 1. Kontrol daya
  const powerHtml = renderView(
    V.powerMenu({ serverId: '2831e1e3', serverName: 'Server Alpha', state: 'running' })
  );
  assert.ok(powerHtml.includes('Server Alpha'));
  assert.ok(powerHtml.includes('ONLINE'));
  assert.ok(powerHtml.includes('data="pwr_act:2831e1e3:kill" style="danger"'), 'Force Kill harus danger');
  assert.ok(powerHtml.includes('data="pwr_act:2831e1e3:start" style="success"'), 'Start harus success');

  // 2. Info server
  const server = {
    identifier: 'srv-1',
    uuid: 'uuid-1234-5678',
    name: 'Server Alpha',
    node: 'Node Utama',
    docker_image: 'ghcr.io/parkervcp/yolks:nodejs_24',
    sftp_details: { ip: 'sftp.example.com', port: 2022 },
    limits: { memory: 1024, cpu: 100, disk: 5120 },
    relationships: {
      allocations: {
        data: [
          {
            attributes: {
              ip: '1.2.3.4',
              port: 25565,
              is_default: true,
              ip_alias: 'play.example.com',
            },
          },
        ],
      },
    },
  };

  const infoHtml = renderView(V.infoServer({ server }));
  assert.ok(infoHtml.includes('sftp.example.com:2022'));
  assert.ok(infoHtml.includes('1.2.3.4:25565'));
  assert.ok(infoHtml.includes('play.example.com'));
  assert.ok(infoHtml.includes('<details><summary>Batasan resource</summary>'), 'Batasan masuk details');

  // 3. Metrik
  const stats = {
    current_state: 'running',
    resources: {
      memory_bytes: 268435456,
      cpu_absolute: 5.5,
      disk_bytes: 536870912,
      network_rx_bytes: 1048576,
      network_tx_bytes: 2097152,
      uptime: 7200000,
    },
  };

  const metrikHtml = renderView(V.metrikServer({ server, stats }));
  assert.ok(metrikHtml.includes('256 MB'), 'RAM harus terformat');
  assert.ok(metrikHtml.includes('5.50%'), 'CPU harus terformat');
  assert.ok(metrikHtml.includes('2 jam'), 'Uptime harus terformat');
  assert.ok(metrikHtml.includes('1 MB'), 'Jaringan masuk harus terformat');

  console.log('Pengujian power, info, dan metrik LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
