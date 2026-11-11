/**
 * Fixture layar untuk pengujian dan pemeriksaan render langsung.
 * Dipakai test/test-rich.js dan .probe-views.js.
 */

const V = require('../utils/views');

function fixtures() {
  const server = {
    identifier: '2831e1e3',
    uuid: 'uuid-1234',
    name: 'hanztenzu-unli',
    node: 'Node-01',
    description: 'Server uji',
    docker_image: 'ghcr.io/parkervcp/yolks:nodejs_24',
    sftp_details: { ip: 'sftp.example.com', port: 2022 },
    limits: { memory: 1024, cpu: 100, disk: 5120, swap: 0, io: 500 },
    relationships: {
      allocations: {
        data: [{ attributes: { ip: '1.2.3.4', port: 3303, is_default: true, ip_alias: 'play.example.com' } }],
      },
    },
  };
  const stats = {
    current_state: 'running',
    resources: {
      memory_bytes: 524288000,
      cpu_absolute: 15.2,
      disk_bytes: 1048576000,
      network_rx_bytes: 1048576,
      network_tx_bytes: 2097152,
      uptime: 3600000,
    },
  };
  const item = { name: 'config.json', is_file: true, size: 2048, mimetype: 'application/json', modified_at: '2026-11-11T10:00:00+00:00', absIndex: 0 };
  const panels = [
    { id: 1, panelUrl: 'https://panel-satu.contoh.com', label: '', createdAt: '2026-11-11T10:00:00Z' },
    { id: 2, panelUrl: 'https://panel-dua.contoh.com', label: '', createdAt: '2026-11-11T11:00:00Z' },
  ];

  return {
    'start tanpa server': V.welcome({ isOwner: true, panelCount: 0 }),
    'start dengan server': V.welcome({ isOwner: false, panelCount: 2, activeNomor: 2 }),
    'beranda kosong': V.berandaKosong({ isOwner: true }),
    'beranda kosong non-owner': V.berandaKosong({ isOwner: false }),
    'tambah url': V.tambahUrl(),
    'url tidak valid': V.urlTidakValid({ message: 'URL panel tidak memiliki host yang valid.' }),
    'langkah api key': V.langkahApiKey({ nomor: 1 }),
    'panel ditambahkan': V.panelDitambahkan({ account: { username: 'hanztenzu' }, nomor: 1 }),
    'panel gagal verifikasi': V.panelGagal({ message: 'Unauthorized', reason: 'verify' }),
    'panel gagal duplikat': V.panelGagal({ message: 'URL ini sudah terdaftar pada akun Anda.', reason: 'duplicate' }),
    'panel batal': V.panelBatal(),
    'daftar panel': V.daftarPanel({ panels, activePanelId: 2 }),
    'daftar panel belum dipilih': V.daftarPanel({ panels, activePanelId: null }),
    'konfirmasi hapus panel': V.konfirmasiHapusPanel({ panel: panels[0], nomor: 1 }),
    'menu owner': V.menuOwner({ users: [{ telegram_id: 123456789, panel_count: 2 }], ownerId: 123456789 }),
    'menu owner kosong': V.menuOwner({ users: [], ownerId: 123456789 }),
    'daftar server game': V.daftarServer({
      servers: [{ identifier: '2831e1e3', name: 'hanztenzu-unli' }],
      page: 1,
      totalPages: 2,
      total: 3,
    }),
    'daftar server game kosong': V.daftarServerKosong(),
    'daftar server game gagal': V.daftarServerGagal({ message: 'timeout' }),
    dashboard: V.dashboard({ server, stats }),
    'dashboard gagal': V.dashboardGagal({ serverId: '2831e1e3', message: 'not found' }),
    'power menu': V.powerMenu({ serverId: '2831e1e3', serverName: 'hanztenzu-unli', state: 'running' }),
    'power gagal': V.powerGagal({ serverId: '2831e1e3', message: 'gagal' }),
    console: V.consoleView({ serverId: '2831e1e3', logs: ['[10:00] Done (1.2s)'], connected: true, state: 'running' }),
    'console tanpa log': V.consoleView({ serverId: '2831e1e3', logs: [], connected: false, state: 'offline' }),
    'kirim perintah': V.kirimPerintah({ serverId: '2831e1e3' }),
    'info server': V.infoServer({ server }),
    metrik: V.metrikServer({ server, stats }),
    'info gagal': V.infoGagal({ serverId: '2831e1e3', message: 'gagal', title: 'Info Gagal' }),
    direktori: V.direktori({
      serverId: '2831e1e3',
      dir: '/plugins',
      items: [item, { name: 'world', is_file: false }],
      page: 2,
      totalPages: 3,
      totalItems: 14,
      absIndexes: [6, 7],
    }),
    'direktori kosong': V.direktori({ serverId: '2831e1e3', dir: '/', items: [], page: 1, totalPages: 1, totalItems: 0, absIndexes: [] }),
    'menu file': V.fileMenu({ serverId: '2831e1e3', item, filePath: '/plugins/config.json', absIndex: 3 }),
    'menu folder': V.fileMenu({ serverId: '2831e1e3', item: { name: 'world', is_file: false, modified_at: null }, filePath: '/world', absIndex: 4 }),
    'isi file': V.isiFile({ item, filePath: '/plugins/config.json', content: '{"a":1}', truncated: false }),
    'prompt file': V.promptFile({ title: 'Ganti Nama', description: 'Kirim nama baru.', path: '/plugins', cancelData: 'fm_open:3' }),
    'konfirmasi hapus': V.konfirmasiHapus({ item, absIndex: 3 }),
    startup: V.startup({
      serverId: '2831e1e3',
      startup: {
        invocation: 'node index.js',
        variables: [
          { name: 'Main File', env_variable: 'MAIN_FILE', server_value: 'index.js', is_editable: true, description: 'File utama' },
          { name: 'Version', env_variable: 'VERSION', server_value: '', is_editable: false, description: 'Versi runtime' },
        ],
      },
    }),
    'edit variabel': V.editVariabel({ serverId: '2831e1e3', variable: { name: 'Main File', env_variable: 'MAIN_FILE', server_value: 'index.js', description: 'File utama' } }),
    'hasil aksi': V.hasilAksi({ title: 'Tersimpan', message: 'Perubahan disimpan.' }),
  };
}

module.exports = fixtures;
