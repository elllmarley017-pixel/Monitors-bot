const assert = require('node:assert');

async function runTest() {
  console.log('Menjalankan pengujian layar startup config...');

  const V = require('../utils/views');
  const { renderView } = require('../utils/reply');

  const startup = {
    invocation: 'node index.js',
    variables: [
      {
        name: 'Command Run',
        env_variable: 'CMD_RUN',
        server_value: 'npm start',
        is_editable: true,
        description: 'Perintah utama',
      },
      {
        name: 'Auto Update',
        env_variable: 'AUTO_UPDATE',
        server_value: '0',
        is_editable: false,
        description: 'Pembaruan otomatis',
      },
    ],
  };

  const view = V.startup({ serverId: 'srv-1', startup });
  const html = renderView(view);

  assert.ok(html.includes('node index.js'), 'Invocation harus tampil');
  assert.ok(html.includes('CMD_RUN'), 'Nama variabel harus tampil');
  assert.ok(html.includes('npm start'), 'Nilai variabel harus tampil');
  assert.ok(html.includes('terkunci'), 'Variabel non-editable harus ditandai terkunci');

  // Hanya variabel editable yang mendapat tombol ubah
  const buttons = (view.buttons || []).flat();
  assert.ok(buttons.some((b) => b.data === 'st_edit:0'), 'Variabel editable harus punya tombol ubah');
  assert.ok(!buttons.some((b) => b.data === 'st_edit:1'), 'Variabel terkunci tidak boleh punya tombol ubah');

  // Tombol ubah wajib punya jalan kembali
  const edit = V.editVariabel({
    serverId: 'srv-1',
    variable: { name: 'Command Run', env_variable: 'CMD_RUN', server_value: 'npm start', description: 'x' },
  });
  const editButtons = (edit.buttons || []).flat();
  assert.ok(editButtons.some((b) => b.data === 'st_view:srv-1'), 'Layar ubah variabel harus punya tombol batal');

  console.log('Pengujian startup LULUS!');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
