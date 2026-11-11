/**
 * Seluruh tampilan bot dalam bentuk { html, buttons }.
 *
 * Fungsi di sini murni: tidak memanggil API, tidak membaca database, sehingga
 * bisa diuji tanpa jaringan. Transport ada di utils/reply.js.
 *
 * Aturan tampilan:
 * - Satu judul h1 per layar, diikuti data ringkas dalam tabel.
 * - Data panjang (log, daftar variabel, alokasi port) masuk ke pre() atau details().
 * - Setiap layar punya jalan kembali, tidak ada tombol tanpa aksi.
 * - Gaya tombol mengikuti dampaknya: success untuk aksi membangun,
 *   danger untuk aksi merusak, primary untuk navigasi.
 */

const R = require('./rich');
const B = require('./blocks');
const { formatBytes, formatPercent, formatUptime, statusBadge } = require('./formatter');

const { f } = R;

function usageValue(usedBytes, limitMb) {
  const used = formatBytes(usedBytes || 0);
  if (!limitMb) return `${R.b(used)} / tanpa batas`;
  const limitBytes = limitMb * 1024 * 1024;
  const pct = limitBytes > 0 ? Math.min(100, Math.round(((usedBytes || 0) / limitBytes) * 100)) : 0;
  return `${R.b(used)} / ${formatBytes(limitBytes)} (${pct}%)`;
}

function cpuValue(cpuAbsolute, limitPercent) {
  const used = formatPercent(cpuAbsolute || 0);
  if (!limitPercent) return `${R.b(used)} / tanpa batas`;
  return `${R.b(used)} / ${limitPercent}%`;
}

function statusLine(state, extra = []) {
  const parts = [`Status ${R.b(statusBadge(state))}`, ...extra];
  return R.p(parts.join(' | '));
}

/* ------------------------------------------------------------------ */
/* Beranda, server panel, dan akun                                     */
/* ------------------------------------------------------------------ */

// Identitas bot yang tampil di layar /start. Bukan kredensial.
const BOT_INFO = {
  creator: '@HanzTenzX',
  channel: '@TenzXodiadores',
  version: '1.6.0',
};

const PEMBUKA =
  'Halo!! Saya adalah bot yang membantu mengatur dan memonitor Panel Pterodactyl secara otomatis. ' +
  'Dengan bot ini, Anda tidak perlu lagi mengakses panel server melalui browser karena seluruh ' +
  'pengelolaan server dapat dilakukan langsung melalui Telegram.';

/**
 * Layar /start.
 *
 * Dikirim sebagai rich message berbasis blok, bukan HTML, supaya tabel
 * Informasi Bot menjadi tabel Telegram sungguhan. skipEntityDetection dipakai
 * agar nama kreator dan kanal tampil apa adanya, tanpa menyebut pengguna lain.
 */
function welcome({ isOwner, panelCount = 0, activeNomor = null }) {
  return {
    skipEntityDetection: true,
    blocks: B.compose(
      B.heading('Pterodactyl Manager', 1),
      B.paragraph(PEMBUKA),
      B.heading('Informasi Bot', 2),
      B.table(
        [
          [B.cell('Info', { header: true }), B.cell('Desc', { header: true })],
          ['Creator', BOT_INFO.creator],
          ['Channel', BOT_INFO.channel],
          ['Version', BOT_INFO.version],
        ],
        { header: true }
      ),
      panelCount > 0
        ? B.compose(
            B.heading('Status Akun', 2),
            B.table([
              ['Server terhubung', String(panelCount)],
              ['Server aktif', activeNomor ? `Server ${activeNomor}` : 'Belum dipilih'],
            ]),
            B.paragraph('Pilih server pada Daftar Server untuk membuka dashboard kontrol.')
          )
        : B.compose(
            B.heading('Langkah Awal', 2),
            B.paragraph(
              'Belum ada server yang terhubung. Tambahkan panel Pterodactyl milik Anda untuk mulai memantau.'
            ),
            B.list([
              'Tekan Tambah Server.',
              'Kirim alamat panel Anda.',
              'Kirim Client API Key yang diawali ptlc_.',
            ])
          )
    ),
    buttons: [
      [{ text: 'Tambah Server', data: 'pnl_add', style: R.STYLE.SUCCESS }],
      ...(panelCount > 0
        ? [[{ text: 'Daftar Server', data: 'pnl_list', style: R.STYLE.PRIMARY }]]
        : []),
      ...(isOwner ? [[{ text: 'Menu Pemilik', data: 'owner_menu', style: R.STYLE.PRIMARY }]] : []),
    ],
  };
}

function berandaKosong({ isOwner }) {
  return {
    html: R.compose(
      R.h1('Pterodactyl Manager'),
      R.h2('Belum ada server'),
      R.p('Tambahkan server Pterodactyl milik Anda sendiri. Bot tidak memakai server bawaan siapa pun.'),
      R.p('Yang dibutuhkan: URL panel dan Client API Key dari akun Anda.'),
      R.steps([
        'Tekan Tambah Server.',
        'Kirim alamat panel Anda sebagai pesan berikutnya.',
        'Kirim Client API Key yang diawali ptlc_.',
      ]),
      R.aside(R.it('API Key dihapus dari chat begitu dibaca, lalu disimpan terenkripsi AES-256-GCM. Setiap user hanya melihat server miliknya sendiri.'))
    ),
    buttons: [
      [{ text: 'Tambah Server', data: 'pnl_add', style: R.STYLE.SUCCESS }],
      ...(isOwner ? [[{ text: 'Menu Pemilik', data: 'owner_menu', style: R.STYLE.PRIMARY }]] : []),
    ],
  };
}

function tambahUrl() {
  return {
    html: R.compose(
      R.h1('Tambah Server'),
      R.h2('Langkah 1 dari 2'),
      R.p('Kirim URL panel Pterodactyl Anda sebagai pesan teks.'),
      R.bullets([
        'Sertakan http:// atau https:// bila panel memakainya.',
        'Tanpa garis miring di akhir.',
        'Satu URL hanya bisa didaftarkan sekali per akun Telegram.',
      ]),
      R.aside(R.it('Contoh: https://panel.contoh.com'))
    ),
    buttons: [[{ text: 'Batal', data: 'panel_batal', style: R.STYLE.DANGER }]],
  };
}

function langkahApiKey({ nomor }) {
  return {
    html: R.compose(
      R.h1('Tambah Server'),
      R.h2('Langkah 2 dari 2'),
      R.p('Kirim Client API Key sebagai pesan teks. Bot menghapus pesan itu segera setelah dibaca.'),
      R.kvTable([
        ['Akan menjadi', `Server ${nomor}`],
        ['Awalan kunci', 'ptlc_'],
      ]),
      R.aside(
        R.b('Keamanan: '),
        'kunci disimpan terenkripsi AES-256-GCM dan tidak pernah ditampilkan kembali di chat.'
      )
    ),
    buttons: [[{ text: 'Batal', data: 'panel_batal', style: R.STYLE.DANGER }]],
  };
}

function panelDitambahkan({ account, nomor }) {
  return {
    html: R.compose(
      R.h1('Server Ditambahkan'),
      R.p(`Server ${nomor} tersimpan dan langsung aktif dipakai.`),
      R.kvTable([['Username panel', account.username]]),
      R.aside(R.it('Alamat panel tidak ditampilkan di chat. Koneksi disimpan terenkripsi.'))
    ),
    buttons: [],
  };
}

function panelGagal({ message, reason = 'duplicate' }) {
  const saran =
    reason === 'duplicate'
      ? 'URL ini sudah terdaftar. Gunakan Pilih Server untuk memakainya.'
      : 'Periksa URL panel dan API Key, lalu kirim ulang kunci yang benar.';

  return {
    html: R.compose(
      R.h1('Server Gagal Ditambahkan'),
      R.quote(message),
      R.p(saran),
      reason === 'duplicate'
        ? ''
        : R.bullets([
            'Kunci diawali ptlc_ dan masih aktif di panel.',
            'IP restriction pada kunci sudah dinonaktifkan.',
            'URL panel dapat dibuka dari browser.',
          ])
    ),
    buttons:
      reason === 'duplicate'
        ? [
            [{ text: 'Daftar Server', data: 'pnl_list', style: R.STYLE.PRIMARY }],
            [{ text: 'Tambah Server Lain', data: 'pnl_add', style: R.STYLE.SUCCESS }],
          ]
        : [[{ text: 'Batal', data: 'panel_batal', style: R.STYLE.DANGER }]],
  };
}

function panelBatal() {
  return {
    html: R.compose(
      R.h1('Penambahan Dibatalkan'),
      R.p('Tidak ada server baru yang disimpan.')
    ),
    buttons: [[{ text: 'Tambah Server', data: 'pnl_add', style: R.STYLE.SUCCESS }]],
  };
}

function urlTidakValid({ message }) {
  return {
    html: R.compose(
      R.h1('URL Panel Tidak Valid'),
      R.quote(message),
      R.p('Kirim ulang URL panel sebagai pesan teks, atau batalkan penambahan.'),
      R.aside(R.it('Contoh yang benar: https://panel.contoh.com'))
    ),
    buttons: [[{ text: 'Batal', data: 'panel_batal', style: R.STYLE.DANGER }]],
  };
}

function daftarPanel({ panels, activePanelId }) {
  const rows = [];
  panels.forEach((panel, index) => {
    const nomor = index + 1;
    rows.push([
      {
        text: activePanelId === panel.id ? `Server ${nomor} (aktif)` : `Server ${nomor}`,
        data: `pnl_use:${panel.id}`,
        style: R.STYLE.SUCCESS,
      },
      { text: 'Hapus', data: `pnl_hapus:${panel.id}`, style: R.STYLE.DANGER },
    ]);
  });

  rows.push([{ text: 'Tambah Server', data: 'pnl_add', style: R.STYLE.SUCCESS }]);

  const activeIndex = panels.findIndex((panel) => panel.id === activePanelId);

  return {
    html: R.compose(
      R.h1('Daftar Server'),
      R.kvTable([
        ['Server terdaftar', String(panels.length)],
        ['Server aktif', activeIndex >= 0 ? `Server ${activeIndex + 1}` : 'Belum dipilih'],
      ]),
      R.p('Pilih server untuk membuka daftar server game di dalamnya, atau hapus bila sudah tidak dipakai.'),
      R.aside(R.it('Alamat panel tidak ditampilkan di chat. Nomor urut dipakai sebagai penanda.')),
      R.aside(R.it('Setiap koneksi disimpan terpisah, jadi berpindah server tidak perlu memasukkan API Key lagi.'))
    ),
    buttons: rows,
  };
}

function konfirmasiHapusPanel({ panel, nomor }) {
  return {
    html: R.compose(
      R.h1('Hapus Server'),
      R.p(`Server ${nomor} akan dihapus dari bot.`),
      R.quote('API Key yang tersimpan ikut dihapus. Server game di panel tidak terpengaruh, dan Anda bisa menambahkannya lagi kapan saja.')
    ),
    buttons: [
      [{ text: 'Ya, Hapus Server Ini', data: `pnl_hapus_ok:${panel.id}`, style: R.STYLE.DANGER }],
      [{ text: 'Batal', data: 'pnl_list', style: R.STYLE.PRIMARY }],
    ],
  };
}

function menuOwner({ users, ownerId }) {
  const rows = users.slice(0, 10).map((u) => [
    String(u.telegram_id),
    `${u.panel_count} server`,
  ]);

  return {
    html: R.compose(
      R.h1('Menu Pemilik'),
      R.kvTable([
        ['Pengguna terdaftar', String(users.length)],
        ['Owner ID', String(ownerId)],
        ['Total koneksi server', String(users.reduce((sum, u) => sum + Number(u.panel_count || 0), 0))],
      ]),
      users.length > 0
        ? R.details(`${users.length} pengguna terdaftar`, R.kvTable(rows))
        : R.p('Belum ada pengguna yang menambahkan server.'),
      R.aside(R.it('Daftar dibatasi 10 baris pertama. Kunci API dan token bot tidak ditampilkan.'))
    ),
    buttons: [[{ text: 'Kembali', data: 'pnl_list', style: R.STYLE.PRIMARY }]],
  };
}

/* ------------------------------------------------------------------ */
/* Daftar server                                                       */
/* ------------------------------------------------------------------ */

function daftarServer({ servers, page, totalPages, total }) {
  const buttons = servers.map((server) => [
    {
      text: `[${server.identifier}] ${server.name}`,
      data: `srv_sel:${server.identifier}`,
      style: R.STYLE.PRIMARY,
    },
  ]);

  const navRow = [];
  if (page > 1) navRow.push({ text: 'Sebelumnya', data: `srv_list:${page - 1}`, style: R.STYLE.PRIMARY });
  if (totalPages > 1) navRow.push({ text: `Halaman ${page}/${totalPages}`, disabled: true });
  if (page < totalPages) navRow.push({ text: 'Berikutnya', data: `srv_list:${page + 1}`, style: R.STYLE.PRIMARY });
  if (navRow.length > 0) buttons.push(navRow);

  buttons.push([
    { text: 'Muat Ulang', data: `srv_list:${page}`, style: R.STYLE.PRIMARY },
    { text: 'Server Panel', data: 'pnl_list', style: R.STYLE.PRIMARY },
  ]);

  return {
    html: R.compose(
      R.h1('Daftar Server Game'),
      R.kvTable([
        ['Total server', String(total)],
        ['Halaman', `${page} dari ${totalPages}`],
      ]),
      R.p('Pilih server untuk membuka dashboard kontrol.'),
      servers.length === 0 ? R.quote('Tidak ada server pada halaman ini.') : ''
    ),
    buttons,
  };
}

function daftarServerKosong() {
  return {
    html: R.compose(
      R.h1('Daftar Server Game'),
      R.h2('Belum ada server'),
      R.p('Panel ini belum memiliki server game, atau kunci API tidak punya izin subuser.'),
      R.bullets([
        'Pastikan server sudah dibuat di panel.',
        'Bila Anda subuser, minta pemilik server menambahkan izin akses.',
      ])
    ),
    buttons: [
      [
        { text: 'Muat Ulang', data: 'srv_list:1', style: R.STYLE.PRIMARY },
        { text: 'Server Panel', data: 'pnl_list', style: R.STYLE.PRIMARY },
      ],
    ],
  };
}

function daftarServerGagal({ message }) {
  return {
    html: R.compose(
      R.h1('Gagal Memuat Daftar Server Game'),
      R.quote(message),
      R.p('Periksa koneksi panel, lalu muat ulang. Bila panel sudah tidak dipakai, hapus lewat Daftar Server.')
    ),
    buttons: [
      [
        { text: 'Coba Lagi', data: 'srv_list:1', style: R.STYLE.SUCCESS },
        { text: 'Server Panel', data: 'pnl_list', style: R.STYLE.PRIMARY },
      ],
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard server                                                    */
/* ------------------------------------------------------------------ */

function dashboard({ server, stats }) {
  const serverId = server.identifier;
  const state = stats?.current_state || 'offline';
  const res = stats?.resources || {};
  const uptime = state === 'running' && res.uptime ? formatUptime(res.uptime) : 'Tidak berjalan';

  const body = R.compose(
    R.h1(server.name),
    R.p(`ID ${R.code(serverId)} | Node ${R.code(server.node || '-')}`),
    statusLine(state, [`Uptime ${R.b(uptime)}`]),
    R.kvTable([
      ['RAM', f(usageValue(res.memory_bytes, server.limits?.memory))],
      ['CPU', f(cpuValue(res.cpu_absolute, server.limits?.cpu))],
      ['Disk', f(usageValue(res.disk_bytes, server.limits?.disk))],
    ]),
    server.description ? R.details('Deskripsi server', R.p(server.description)) : ''
  );

  return {
    html: body,
    buttons: [
      [
        { text: 'Console', data: `con_view:${serverId}`, style: R.STYLE.PRIMARY },
        { text: 'Kontrol Daya', data: `pwr_menu:${serverId}`, style: R.STYLE.PRIMARY },
      ],
      [
        { text: 'File Manager', data: `fm_view:${serverId}:1`, style: R.STYLE.PRIMARY },
        { text: 'Startup', data: `st_view:${serverId}`, style: R.STYLE.PRIMARY },
      ],
      [
        { text: 'Info Server', data: `inf_view:${serverId}`, style: R.STYLE.PRIMARY },
        { text: 'Metrik', data: `res_view:${serverId}`, style: R.STYLE.PRIMARY },
      ],
      [
        { text: 'Muat Ulang', data: `dash:${serverId}`, style: R.STYLE.PRIMARY },
        { text: 'Server di Panel', data: 'srv_list:1', style: R.STYLE.PRIMARY },
      ],
      [{ text: 'Daftar Server Panel', data: 'pnl_list', style: R.STYLE.PRIMARY }],
    ],
  };
}

function dashboardGagal({ serverId, message }) {
  return {
    html: R.compose(
      R.h1('Dashboard Tidak Tersedia'),
      R.p(`Server ${R.code(serverId)} gagal dimuat.`),
      R.quote(message),
      R.p('Server mungkin sedang dihapus, atau kunci API kehilangan izin.')
    ),
    buttons: [
      [
        { text: 'Coba Lagi', data: `dash:${serverId}`, style: R.STYLE.SUCCESS },
        { text: 'Server di Panel', data: 'srv_list:1', style: R.STYLE.PRIMARY },
      ],
      [{ text: 'Daftar Server Panel', data: 'pnl_list', style: R.STYLE.PRIMARY }],
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Kontrol daya                                                        */
/* ------------------------------------------------------------------ */

function powerMenu({ serverId, serverName, state }) {
  return {
    html: R.compose(
      R.h1('Kontrol Daya'),
      R.p(serverName),
      R.kvTable([
        ['ID server', serverId],
        ['Status', f(R.b(statusBadge(state)))],
      ]),
      R.h3('Efek setiap aksi'),
      R.bullets([
        f(`${R.b('Start')} menyalakan server yang sedang berhenti.`),
        f(`${R.b('Restart')} memuat ulang proses tanpa mengubah data.`),
        f(`${R.b('Stop')} mematikan server secara normal agar data tersimpan.`),
        f(`${R.b('Force Kill')} menghentikan proses seketika, berisiko data rusak.`),
      ])
    ),
    buttons: [
      [
        { text: 'Start', data: `pwr_act:${serverId}:start`, style: R.STYLE.SUCCESS },
        { text: 'Restart', data: `pwr_act:${serverId}:restart`, style: R.STYLE.PRIMARY },
      ],
      [
        { text: 'Stop', data: `pwr_act:${serverId}:stop`, style: R.STYLE.DANGER },
        { text: 'Force Kill', data: `pwr_act:${serverId}:kill`, style: R.STYLE.DANGER },
      ],
      [{ text: 'Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY }],
    ],
  };
}

function powerGagal({ serverId, message }) {
  return {
    html: R.compose(
      R.h1('Kontrol Daya Gagal Dimuat'),
      R.quote(message)
    ),
    buttons: [[{ text: 'Kembali ke Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY }]],
  };
}

/* ------------------------------------------------------------------ */
/* Console                                                             */
/* ------------------------------------------------------------------ */

function consoleView({ serverId, logs, connected, state }) {
  const raw = logs && logs.length > 0 ? logs.join('\n') : 'Belum ada keluaran baru dari server.';
  // Log server bisa sangat panjang dalam satu baris; potong agar isi pesan
  // tetap jauh di bawah batas 32768 karakter rich message.
  const body = raw.length > 2800 ? `...${raw.slice(-2800)}` : raw;
  const truncated = raw.length > 2800;

  return {
    html: R.compose(
      R.h1('Live Console'),
      R.p(`Server ${R.code(serverId)} | ${R.b(statusBadge(state))}`),
      R.p(
        connected
          ? 'WebSocket tersambung. Keluaran di bawah diperbarui saat Anda menekan Muat Ulang.'
          : 'WebSocket sedang menyambung ulang. Log lama tetap ditampilkan.'
      ),
      R.pre(body),
      truncated ? R.aside(R.it('Log lama dipotong agar pesan tetap ringan. Baris terbaru ada di bawah.')) : '',
      R.aside(R.it('Log dibatasi 16 baris terakhir agar pesan tetap ringan.'))
    ),
    buttons: [
      [
        { text: 'Muat Ulang', data: `con_ref:${serverId}`, style: R.STYLE.PRIMARY },
        { text: 'Kirim Perintah', data: `con_cmd:${serverId}`, style: R.STYLE.PRIMARY },
      ],
      [{ text: 'Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY }],
    ],
  };
}

function kirimPerintah({ serverId }) {
  return {
    html: R.compose(
      R.h1('Kirim Perintah Console'),
      R.p(`Perintah dikirim ke server ${R.code(serverId)} apa adanya, tanpa awalan garis miring.`),
      R.quote('Kirim perintah sebagai pesan teks. Pesan Anda tetap tersimpan di chat.')
    ),
    buttons: [[{ text: 'Batal', data: `con_view:${serverId}`, style: R.STYLE.DANGER }]],
  };
}

/* ------------------------------------------------------------------ */
/* Info dan metrik                                                     */
/* ------------------------------------------------------------------ */

function infoServer({ server }) {
  const allocations = server.relationships?.allocations?.data || [];
  const allocRows = allocations.map((a) => {
    const attr = a.attributes;
    const label = attr.ip_alias ? `${attr.ip}:${attr.port} (${attr.ip_alias})` : `${attr.ip}:${attr.port}`;
    return [label, attr.is_default ? 'Default' : 'Tambahan'];
  });

  const sftp = server.sftp_details ? `${server.sftp_details.ip}:${server.sftp_details.port}` : '-';

  return {
    html: R.compose(
      R.h1(server.name),
      R.h2('Info Server'),
      R.kvTable([
        ['ID singkat', server.identifier],
        ['UUID', server.uuid || '-'],
        ['Node', server.node || '-'],
        ['SFTP', sftp],
        ['Docker image', server.docker_image || '-'],
      ]),
      R.h3('Alokasi port'),
      allocRows.length > 0
        ? R.kvTable(allocRows)
        : R.p('Belum ada alokasi port pada server ini.'),
      R.details(
        'Batasan resource',
        R.kvTable([
          ['RAM', server.limits?.memory ? `${server.limits.memory} MB` : 'Tanpa batas'],
          ['CPU', server.limits?.cpu ? `${server.limits.cpu}%` : 'Tanpa batas'],
          ['Disk', server.limits?.disk ? `${server.limits.disk} MB` : 'Tanpa batas'],
          ['Swap', server.limits?.swap ? `${server.limits.swap} MB` : 'Nonaktif'],
          ['IO block', server.limits?.io || '-'],
        ])
      )
    ),
    buttons: [[{ text: 'Kembali ke Dashboard', data: `dash:${server.identifier}`, style: R.STYLE.PRIMARY }]],
  };
}

function metrikServer({ server, stats }) {
  const serverId = server.identifier;
  const state = stats?.current_state || 'offline';
  const res = stats?.resources || {};
  const uptime = res.uptime ? formatUptime(res.uptime) : 'Tidak berjalan';

  return {
    html: R.compose(
      R.h1('Metrik Resource'),
      R.p(server.name),
      statusLine(state),
      R.kvTable([
        ['Uptime', uptime],
        ['CPU', f(cpuValue(res.cpu_absolute, server.limits?.cpu))],
        ['RAM', f(usageValue(res.memory_bytes, server.limits?.memory))],
        ['Disk', f(usageValue(res.disk_bytes, server.limits?.disk))],
        ['Jaringan masuk', formatBytes(res.network_rx_bytes || 0)],
        ['Jaringan keluar', formatBytes(res.network_tx_bytes || 0)],
      ])
    ),
    buttons: [
      [
        { text: 'Muat Ulang', data: `res_view:${serverId}`, style: R.STYLE.PRIMARY },
        { text: 'Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY },
      ],
    ],
  };
}

function infoGagal({ serverId, message, title }) {
  return {
    html: R.compose(R.h1(title || 'Data Server Gagal Dimuat'), R.quote(message)),
    buttons: [[{ text: 'Kembali ke Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY }]],
  };
}

/* ------------------------------------------------------------------ */
/* File manager                                                        */
/* ------------------------------------------------------------------ */

function itemLabel(item) {
  if (!item.is_file) return `${item.name}/`;
  return `${item.name} (${formatBytes(item.size)})`;
}

function direktori({ serverId, dir, items, page, totalPages, totalItems, absIndexes }) {
  const buttons = [];

  if (dir !== '/') {
    buttons.push([{ text: 'Folder Induk', data: `fm_up:${serverId}`, style: R.STYLE.PRIMARY }]);
  }

  items.forEach((item, idx) => {
    buttons.push([
      { text: itemLabel(item), data: `fm_open:${absIndexes[idx]}`, style: R.STYLE.PRIMARY },
    ]);
  });

  const navRow = [];
  if (page > 1) navRow.push({ text: 'Sebelumnya', data: `fm_pg:${page - 1}`, style: R.STYLE.PRIMARY });
  if (totalPages > 1) navRow.push({ text: `${page}/${totalPages}`, disabled: true });
  if (page < totalPages) navRow.push({ text: 'Berikutnya', data: `fm_pg:${page + 1}`, style: R.STYLE.PRIMARY });
  if (navRow.length > 0) buttons.push(navRow);

  buttons.push([
    { text: 'Folder Baru', data: `fm_mkdir:${serverId}`, style: R.STYLE.SUCCESS },
    { text: 'Upload', data: `fm_upld:${serverId}`, style: R.STYLE.SUCCESS },
  ]);
  buttons.push([
    { text: 'Muat Ulang', data: `fm_view:${serverId}:${page}`, style: R.STYLE.PRIMARY },
    { text: 'Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY },
  ]);

  return {
    html: R.compose(
      R.h1('File Manager'),
      R.p(`Server ${R.code(serverId)}`),
      R.kvTable([
        ['Direktori', dir],
        ['Total item', String(totalItems)],
        ['Halaman', `${page} dari ${totalPages}`],
      ]),
      totalItems === 0
        ? R.quote('Folder ini kosong. Buat folder baru atau unggah file lewat tombol di bawah.')
        : R.p('Pilih item untuk membuka folder atau melihat aksi file.')
    ),
    buttons,
  };
}

function fileMenu({ serverId, item, filePath, absIndex }) {
  const modified = item.modified_at ? item.modified_at.slice(0, 19).replace('T', ' ') : '-';
  const buttons = [];

  if (item.is_file) {
    buttons.push([
      { text: 'Lihat Isi', data: `fm_act:view:${absIndex}`, style: R.STYLE.PRIMARY },
      { text: 'Edit', data: `fm_act:edit:${absIndex}`, style: R.STYLE.PRIMARY },
    ]);
    buttons.push([{ text: 'Download ke Chat', data: `fm_act:dl:${absIndex}`, style: R.STYLE.PRIMARY }]);
  }

  buttons.push([
    { text: 'Ganti Nama', data: `fm_act:ren:${absIndex}`, style: R.STYLE.PRIMARY },
    { text: 'Hapus', data: `fm_act:del:${absIndex}`, style: R.STYLE.DANGER },
  ]);
  buttons.push([{ text: 'Kembali ke Folder', data: `fm_view:${serverId}:1`, style: R.STYLE.PRIMARY }]);

  return {
    html: R.compose(
      R.h1(item.name),
      R.p(item.is_file ? 'File' : 'Folder'),
      R.kvTable([
        ['Lokasi', filePath],
        ...(item.is_file ? [['Ukuran', formatBytes(item.size)]] : []),
        ...(item.is_file ? [['Tipe', item.mimetype || 'tidak diketahui']] : []),
        ['Terakhir diubah', modified],
      ])
    ),
    buttons,
  };
}

function isiFile({ item, filePath, content, truncated }) {
  return {
    html: R.compose(
      R.h1(item.name),
      R.p(filePath),
      R.pre(content),
      truncated ? R.aside(R.it('Isi dipotong pada 3000 karakter. Unduh file untuk melihat seluruhnya.')) : ''
    ),
    buttons: [[{ text: 'Kembali ke Menu File', data: `fm_open:${item.absIndex}`, style: R.STYLE.PRIMARY }]],
  };
}

function promptFile({ title, description, path, cancelData, extra = [] }) {
  const rows = path ? [['Lokasi', path], ...extra] : [...extra];
  return {
    html: R.compose(
      R.h1(title),
      rows.length > 0 ? R.kvTable(rows) : '',
      R.p(description)
    ),
    buttons: [[{ text: 'Batal', data: cancelData, style: R.STYLE.DANGER }]],
  };
}

function konfirmasiHapus({ item, absIndex }) {
  return {
    html: R.compose(
      R.h1('Hapus Item'),
      R.p(`Item ${R.b(item.name)} akan dihapus permanen dari server.`),
      R.quote('Folder yang dihapus ikut membawa seluruh isinya. Tindakan ini tidak bisa dibatalkan.')
    ),
    buttons: [
      [{ text: 'Ya, Hapus', data: `fm_del_confirm:${absIndex}`, style: R.STYLE.DANGER }],
      [{ text: 'Batal', data: `fm_open:${absIndex}`, style: R.STYLE.PRIMARY }],
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Startup                                                             */
/* ------------------------------------------------------------------ */

function startup({ serverId, startup }) {
  const variables = startup.variables || [];
  const buttons = [];

  variables.forEach((v, idx) => {
    if (!v.is_editable) return;
    buttons.push([
      { text: `Ubah ${v.env_variable}`, data: `st_edit:${idx}`, style: R.STYLE.PRIMARY },
    ]);
  });

  buttons.push([
    { text: 'Muat Ulang', data: `st_view:${serverId}`, style: R.STYLE.PRIMARY },
    { text: 'Dashboard', data: `dash:${serverId}`, style: R.STYLE.PRIMARY },
  ]);

  const varRows = variables.map((v) => [
    `${v.name} (${v.env_variable})`,
    f(`${R.code(v.server_value === '' || v.server_value === null ? '(kosong)' : v.server_value)}${v.is_editable ? '' : ' terkunci'}`),
  ]);

  return {
    html: R.compose(
      R.h1('Startup Config'),
      R.p(`Server ${R.code(serverId)}`),
      R.h3('Perintah start'),
      R.pre(startup.invocation || '-'),
      R.h3('Variabel lingkungan'),
      varRows.length > 0 ? R.kvTable(varRows) : R.p('Tidak ada variabel pada server ini.'),
      buttons.length > 2
        ? R.aside(R.it('Tombol Ubah hanya muncul untuk variabel yang diizinkan panel.'))
        : ''
    ),
    buttons,
  };
}

function editVariabel({ serverId, variable }) {
  return {
    html: R.compose(
      R.h1('Ubah Variabel'),
      R.kvTable([
        ['Nama', variable.name],
        ['Variabel', variable.env_variable],
        ['Nilai sekarang', variable.server_value === '' ? '(kosong)' : variable.server_value],
      ]),
      R.p(variable.description || 'Tidak ada deskripsi untuk variabel ini.'),
      R.p('Kirim nilai baru sebagai pesan teks. Nilai lama akan diganti seluruhnya.')
    ),
    buttons: [[{ text: 'Batal', data: `st_view:${serverId}`, style: R.STYLE.DANGER }]],
  };
}

/* ------------------------------------------------------------------ */
/* Catatan hasil aksi                                                  */
/* ------------------------------------------------------------------ */

function hasilAksi({ title, message, detail }) {
  return {
    html: R.compose(R.h1(title), message ? R.p(message) : '', detail || ''),
  };
}

module.exports = {
  BOT_INFO,
  welcome,
  berandaKosong,
  tambahUrl,
  langkahApiKey,
  panelDitambahkan,
  panelGagal,
  panelBatal,
  urlTidakValid,
  daftarPanel,
  konfirmasiHapusPanel,
  menuOwner,
  daftarServer,
  daftarServerKosong,
  daftarServerGagal,
  dashboard,
  dashboardGagal,
  powerMenu,
  powerGagal,
  consoleView,
  kirimPerintah,
  infoServer,
  metrikServer,
  infoGagal,
  direktori,
  fileMenu,
  isiFile,
  promptFile,
  konfirmasiHapus,
  startup,
  editVariabel,
  hasilAksi,
  itemLabel,
};
