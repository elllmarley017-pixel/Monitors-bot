const assert = require('node:assert');

const R = require('../utils/rich');
const V = require('../utils/views');
const { renderView, toRichMessage } = require('../utils/reply');

const fixtures = require('./fixtures');

const ALLOWED_STYLES = new Set([R.STYLE.PRIMARY, R.STYLE.SUCCESS, R.STYLE.DANGER]);

function collectButtons(view) {
  return (view.buttons || []).flat();
}

/**
 * Representasi layar sebagai teks, untuk layar HTML maupun blok.
 * Layar berbasis blok tidak punya string HTML, jadi payload-nya diserialkan.
 */
function renderedText(view) {
  if (Array.isArray(view.blocks)) return JSON.stringify(toRichMessage(view));
  return renderView(view);
}

async function runTest() {
  console.log('Menjalankan pengujian renderer dan seluruh layar rich message...');

  // 1. Escape wajib untuk nilai dinamis
  assert.strictEqual(R.esc('<b> & "x"'), '&lt;b&gt; &amp; &quot;x&quot;');
  assert.ok(R.p(R.code('<script>')).includes('&lt;script&gt;'), 'Isi code harus di-escape');

  // 2. Tombol native membawa field yang benar
  assert.ok(R.btn('A', 'x:1', R.STYLE.DANGER).includes('style="danger"'));
  assert.ok(R.btn('A', 'x:1').includes('type="callback_data"'));
  assert.ok(R.inertBtn('1/2').includes('disabled="true"'));
  assert.ok(R.btn('A'.repeat(80), 'x:1').length < 160, 'Label panjang harus dipotong');

  // 3. Setiap layar harus valid: tombol bergaya sah, callback_data <= 64 byte
  const screens = fixtures();
  for (const [name, view] of Object.entries(screens)) {
    const html = renderedText(view);
    assert.ok(html.length > 0, `${name}: layar kosong`);
    assert.ok(
      Buffer.byteLength(html, 'utf8') <= R.MAX_RICH_CHARS,
      `${name}: melewati batas karakter rich message`
    );
    assert.ok(!html.includes('\u2014'), `${name}: mengandung em dash`);

    for (const button of collectButtons(view)) {
      assert.ok(button.text && String(button.text).trim().length > 0, `${name}: tombol tanpa label`);
      assert.ok(String(button.text).length <= 64, `${name}: label tombol melebihi 64 karakter`);

      if (button.disabled) continue;
      assert.ok(button.data || button.url, `${name}: tombol tanpa aksi (tombol mati)`);
      if (button.data) {
        assert.ok(
          Buffer.byteLength(button.data, 'utf8') <= 64,
          `${name}: callback_data melebihi 64 byte (${button.data})`
        );
      }
      if (button.style) {
        assert.ok(ALLOWED_STYLES.has(button.style), `${name}: gaya tombol tidak dikenal (${button.style})`);
      }
    }
  }

  // 4. Indikator halaman harus nonaktif, bukan tombol yang menganggur
  const list = fixtures()['daftar server game'];
  const flat = collectButtons(list);
  const indicator = flat.find((button) => /^Halaman|^\d+\/\d+$/.test(String(button.text)));
  assert.ok(indicator && indicator.disabled === true, 'Indikator halaman harus disabled');

  // 5. Navigasi wajib ada di layar yang punya submenu
  const dashboard = fixtures().dashboard;
  const dashes = collectButtons(dashboard);
  for (const target of ['Console', 'Kontrol Daya', 'File Manager', 'Startup', 'Info Server', 'Metrik']) {
    assert.ok(dashes.some((button) => button.text === target), `Dashboard kehilangan tombol ${target}`);
  }
  assert.ok(dashes.some((button) => button.data === 'srv_list:1'), 'Dashboard harus punya jalan ke daftar server game');
  assert.ok(dashes.some((button) => button.data === 'pnl_list'), 'Dashboard harus punya jalan ke daftar server panel');

  // 6. Aksi merusak memakai gaya danger
  const power = collectButtons(fixtures()['power menu']);
  assert.strictEqual(power.find((button) => button.text === 'Stop').style, R.STYLE.DANGER);
  assert.strictEqual(power.find((button) => button.text === 'Force Kill').style, R.STYLE.DANGER);
  assert.strictEqual(power.find((button) => button.text === 'Start').style, R.STYLE.SUCCESS);

  // 7. Status dan angka masuk ke keluaran
  const dashHtml = renderedText(fixtures().dashboard);
  assert.ok(dashHtml.includes('ONLINE'));
  assert.ok(dashHtml.includes('15.20%'));
  assert.ok(dashHtml.includes('hanztenzu-unli'));
  assert.ok(dashHtml.includes('<table bordered striped>'));

  // 8. Layar file manager memakai indeks absolut, bukan indeks halaman
  const dir = fixtures().direktori;
  const dirButtons = collectButtons(dir);
  assert.ok(dirButtons.some((button) => button.data === 'fm_open:6'), 'Indeks absolut item pertama harus 6');
  assert.ok(dirButtons.some((button) => button.data === 'fm_up:2831e1e3'), 'Folder induk harus tersedia');
  assert.ok(!collectButtons(fixtures()['direktori kosong']).some((button) => button.data.startsWith('fm_up:')), 'Root tidak boleh punya tombol folder induk');

  // 9. Server panel: pilih, hapus, dan tambah tersedia di satu layar
  const panelView = fixtures()['daftar panel'];
  const panelButtons = collectButtons(panelView);
  assert.ok(panelButtons.some((b) => b.data === 'pnl_use:1'), 'Setiap server harus bisa dipilih');
  assert.ok(panelButtons.some((b) => b.data === 'pnl_hapus:1'), 'Setiap server harus bisa dihapus');
  assert.ok(panelButtons.some((b) => b.data === 'pnl_add'), 'Tombol Tambah Server wajib ada');
  assert.strictEqual(
    panelButtons.find((b) => b.data === 'pnl_hapus:1').style,
    R.STYLE.DANGER,
    'Hapus server memakai gaya danger'
  );

  // 10. Konfirmasi hapus server tidak langsung menghapus
  const hapusButtons = collectButtons(fixtures()['konfirmasi hapus panel']);
  assert.ok(hapusButtons.some((b) => b.data === 'pnl_hapus_ok:1'), 'Konfirmasi harus memakai langkah terpisah');
  assert.ok(hapusButtons.some((b) => b.data === 'pnl_list'), 'Harus ada jalan batal');

  // 11. Tidak ada lagi callback alur lama berbasis satu sesi
  const semua = Object.values(fixtures()).flatMap(collectButtons);
  for (const usang of ['auth_start', 'auth_logout', 'auth_logout_confirm', 'auth_use_default_url', 'auth_cancel']) {
    assert.ok(!semua.some((b) => b.data === usang), `Callback lama ${usang} masih dipakai`);
  }

  // 12. Beranda tanpa server tidak boleh menyebut panel bawaan siapa pun
  const beranda = renderedText(fixtures()['beranda kosong']);
  assert.ok(beranda.includes('Tambah Server'));
  assert.ok(!/panel bawaan|URL default/i.test(beranda), 'Tidak boleh ada panel bawaan');

  // 13. Alamat panel tidak boleh tampil di layar mana pun
  const layarTanpaUrl = [
    'beranda kosong',
    'daftar panel',
    'daftar panel belum dipilih',
    'konfirmasi hapus panel',
    'panel ditambahkan',
    'panel gagal verifikasi',
    'panel gagal duplikat',
    'langkah api key',
    'menu owner',
    'daftar server game',
    'dashboard',
  ];
  const semuaLayar = fixtures();
  for (const nama of layarTanpaUrl) {
    const html = renderedText(semuaLayar[nama]);
    assert.ok(!html.includes('https://'), `${nama}: alamat panel bocor ke chat`);
    assert.ok(!html.includes('http://'), `${nama}: alamat panel bocor ke chat`);
    assert.ok(!/\.my\.id|\.contoh\.com/i.test(html), `${nama}: host panel bocor ke chat`);
  }

  // 14. Layar /start memakai blok native, bukan HTML
  const start = fixtures()['start tanpa server'];
  assert.ok(Array.isArray(start.blocks), 'Layar /start harus berbentuk blok native');
  assert.strictEqual(start.html, undefined, 'Layar /start tidak boleh memakai HTML');
  assert.strictEqual(start.skipEntityDetection, true, 'Sebutan kanal tidak boleh memicu mention');

  const startPayload = toRichMessage(start);
  assert.ok(startPayload.blocks, 'Payload /start harus memuat blocks');
  assert.strictEqual(startPayload.html, undefined, 'Payload /start tidak boleh memuat html');

  const tabelBlok = startPayload.blocks.filter((b) => b.type === 'table');
  assert.strictEqual(tabelBlok.length, 1, 'Tabel Informasi Bot harus satu blok tabel native');

  const cells = tabelBlok[0].cells;
  assert.strictEqual(cells.length, 4, 'Tabel harus berisi baris kepala dan tiga baris data');
  assert.deepStrictEqual(
    cells[0].map((c) => c.text),
    ['Info', 'Desc'],
    'Baris kepala harus Info dan Desc'
  );
  assert.deepStrictEqual(cells.map((r) => r[0].text), ['Info', 'Creator', 'Channel', 'Version']);
  assert.deepStrictEqual(cells.map((r) => r[1].text), [
    'Desc',
    '@HanzTenzX',
    '@TenzXodiadores',
    '1.6.0',
  ]);

  // Teks pembuka harus utuh
  const pembuka = startPayload.blocks.find(
    (b) => b.type === 'paragraph' && String(b.text).startsWith('Halo!!')
  );
  assert.ok(pembuka, 'Teks pembuka harus ada di layar /start');
  assert.ok(String(pembuka.text).includes('memonitor Panel Pterodactyl secara otomatis'));
  assert.ok(String(pembuka.text).includes('langsung melalui Telegram'));

  // Tombol masuk tersedia dan tetap native
  const startButtons = startPayload.blocks.find((b) => b.type === 'buttons');
  assert.ok(startButtons, 'Layar /start harus punya blok tombol');
  assert.ok(startButtons.buttons.some((b) => b.callback_data === 'pnl_add'), 'Tombol Tambah Server harus ada');
  assert.ok(startButtons.buttons.some((b) => b.callback_data === 'owner_menu'), 'Pemilik harus melihat Menu Pemilik');
  assert.ok(
    startButtons.buttons.every((b) => b.callback_data || b.url || b.disabled),
    'Tidak boleh ada tombol tanpa aksi'
  );

  // Tanpa server, tombol Daftar Server tidak ditampilkan
  assert.ok(
    !startButtons.buttons.some((b) => b.callback_data === 'pnl_list'),
    'Tanpa server, tombol Daftar Server tidak perlu tampil'
  );

  // Dengan server, tombol Daftar Server muncul dan status akun ditampilkan
  const startAdaServer = toRichMessage(fixtures()['start dengan server']);
  assert.ok(
    startAdaServer.blocks
      .find((b) => b.type === 'buttons')
      .buttons.some((b) => b.callback_data === 'pnl_list'),
    'Dengan server, tombol Daftar Server harus ada'
  );
  const statusCells = startAdaServer.blocks
    .filter((b) => b.type === 'table')
    .flatMap((b) => b.cells)
    .map((r) => r[0].text);
  assert.ok(statusCells.includes('Server terhubung'), 'Status akun harus tampil saat sudah ada server');

  console.log('Pengujian rich message lulus.');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
