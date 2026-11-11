# Pterodactyl Telegram Management Bot

Bot Telegram berbasis Node.js untuk mengelola server Pterodactyl Panel. Setiap user mendaftarkan panel miliknya sendiri, boleh lebih dari satu, dan seluruh antarmuka dikirim sebagai Rich Message Bot API 10.x dengan tombol native di dalam pesan. Tidak ada command yang perlu diketik dan tidak ada panel bawaan.

---

## Model Data

```
User Telegram
└── panels            satu baris per koneksi panel (URL + API Key terenkripsi)
    └── server game   daftar server yang terbaca dari panel aktif
```

- Tidak ada URL, kredensial, atau panel bawaan di kode maupun konfigurasi. Semua koneksi berasal dari input user.
- Panel aktif disimpan di state navigasi. Berpindah panel hanya mengubah pointer, bukan menautkan ulang.
- Alamat panel tidak pernah dikirim ke chat. Di layar, server ditandai nomor urut (`Server 1`, `Server 2`). URL hanya dipakai bot untuk memanggil API.
- Semua query penyimpanan memfilter `telegram_id`, jadi panel milik user lain tidak bisa dibaca, dipakai, atau dihapus.
- Sesi console, cache file manager, dan cache variabel startup dikunci oleh `userId` + `panelId`, sehingga identifier server game yang sama di dua panel tidak pernah berbagi sesi. Middleware juga membatalkan panel aktif yang bukan milik user tersebut.
- API key disimpan terenkripsi AES-256-GCM, satu ciphertext per panel.
- Database SQLite menyimpan semuanya, sehingga daftar server bertahan setelah bot restart.

---

## Cara Menggunakan Bot

1. Buka bot di Telegram, lalu tekan **Start** atau kirim `/start`.
2. Layar sambutan menampilkan penjelasan bot dan tabel **Informasi Bot** (Creator, Channel, Version).
3. Tekan **Tambah Server**.
4. Kirim alamat panel Pterodactyl Anda, misalnya `https://panel.domain-anda.com`.
5. Kirim **Client API Key** dari panel (menu Account, lalu API Credentials). Kunci diawali `ptlc_`.
6. Bot memvalidasi kunci ke panel. Bila valid, server tersimpan dan daftar server game langsung terbuka.
7. Pilih server game, lalu gunakan tombol Console, Kontrol Daya, File Manager, Startup, Info Server, atau Metrik.
8. Untuk menambah panel lain, buka **Daftar Server**, lalu **Tambah Server**. Untuk berpindah panel, tekan `Server 1`, `Server 2`, dan seterusnya.
9. Untuk melepas sebuah panel, tekan **Hapus** di sebelah panel yang dimaksud, lalu konfirmasi.

Setelah panel aktif, pesan teks biasa membuka Daftar Server Game. `/start` selalu mengembalikan ke layar sambutan. Perintah lain tidak dipakai, karena semua navigasi memakai tombol.

> Catatan: `/start` melepas alur input yang sedang menggantung (misalnya saat menunggu API Key). Ini disengaja agar user tidak terjebak di tengah alur.

---

## Alur Menu

| Menu | Fungsi |
|---|---|
| Beranda | Bila belum ada server: ajakan Tambah Server. Bila sudah ada: langsung Daftar Server |
| Tambah Server | Minta URL panel, lalu Client API Key, divalidasi lewat `getAccount()` sebelum disimpan |
| Daftar Server | Menampilkan semua koneksi panel sebagai Server 1, Server 2, dan seterusnya, dengan tombol Pilih dan Hapus |
| Pilih Server | Menjadikan panel aktif, lalu menampilkan daftar server game milik panel itu |
| Hapus Server | Konfirmasi terpisah, menghapus koneksi beserta API Key tersimpan |
| /start | Layar sambutan berisi penjelasan bot, tabel Informasi Bot, status akun, dan tombol masuk |

Semua fitur lain (console, kontrol daya, file manager, startup, info, metrik) selalu memakai panel aktif. Setiap layar punya jalan kembali ke Daftar Server.

---

## Format Pesan

Dua bentuk rich message dipakai:

- **HTML** untuk sebagian besar layar: judul, paragraf, daftar, kode, dan tombol.
- **Blok native** (`blocks`) untuk layar `/start`, karena tabelnya harus menjadi tabel Telegram sungguhan, bukan susunan tag HTML. Blok yang dipakai: `heading`, `paragraph`, `table` dengan baris kepala (`is_header`), `list`, `divider`, dan `buttons`.

Keduanya dikirim lewat `sendRichMessage` dan disunting lewat `editMessageText` dengan field `rich_message`. Telegraf 4 belum mengenal kedua API ini, jadi pemanggilan memakai `telegram.callApi`.

Tag dan blok berikut sudah diuji langsung ke API dan diterima:

- Blok: `h1`, `h2`, `h3`, `p`, `ul`/`ol` + `li`, `table bordered striped`, `pre`, `blockquote`, `aside`, `details`/`summary`, `hr`.
- Inline: `b`, `i`, `u`, `s`, `code`, `mark`, `a href`, `tg-spoiler`.
- Tombol: `tg-button-row` + `tg-button` dengan `type="callback_data"` atau `type="url"`, atribut `style="primary|success|danger"`, dan `disabled="true"` untuk indikator halaman.

Catatan hasil pengujian terhadap API sungguhan:

- Nama blok yang dipakai build ini adalah `heading` dengan field `size`, bukan `section_heading`.
- `<tg-button>` mengambil label dari isi tag. Atribut `text` ditolak dengan `RICH_MESSAGE_BUTTON_TEXT_EMPTY`.
- `style` hanya menerima `primary`, `success`, `danger`, dan `link`. Nilai lain ditolak `Invalid button style specified`.
- Block `buttons` memakai field `buttons`, bukan `rows`.

Berkas terkait:

- `utils/rich.js`: pembangun HTML dan tombol, escape wajib, penjaga batas 32768 karakter.
- `utils/blocks.js`: pembangun blok native, termasuk tabel Telegram (`cells`, `is_header`, `is_bordered`, `is_striped`).
- `utils/views.js`: 40 layar sebagai fungsi murni `{ html | blocks, buttons }`.
- `utils/reply.js`: transport `sendRichMessage`, `editMessageText`, dan jawaban callback. Field `skip_entity_detection` diletakkan di dalam `rich_message` agar nama kanal tidak berubah menjadi mention.

---

## Fitur

### Server Panel
- Tambah banyak panel per user, masing-masing dengan URL dan API Key sendiri.
- Validasi URL (normalisasi skema, host wajib ada) dan validasi kredensial ke panel sebelum disimpan.
- URL duplikat ditolak per user, tetapi user lain boleh memakai URL yang sama.
- Pilih panel untuk dijadikan aktif, hapus panel dengan konfirmasi.
- Panel yang dihapus otomatis melepas status aktif.

### Pengelolaan Server Game
- **Console:** log WebSocket real-time, pembersihan kode warna ANSI, pengiriman perintah, muat ulang.
- **Kontrol Daya:** Start, Restart, Stop, Force Kill, dengan status terbaru. Aksi merusak bergaya `danger`.
- **File Manager:** jelajah folder, pagination 6 item, proteksi path traversal, unduh ke Telegram (maks 20 MB), unggah, buat folder, ganti nama, hapus dengan konfirmasi, lihat dan edit isi file.
- **Startup:** perintah start, variabel lingkungan, editor untuk variabel `is_editable`.
- **Info dan Metrik:** identifier, UUID, node, SFTP, alokasi port, batasan resource, CPU, RAM, disk, jaringan, dan uptime.

---

## Struktur Folder

```
bot-monitor/
├── config.js                 # Nilai contoh, aman diunggah
├── config.local.js           # Kredensial asli (tidak di-commit)
├── config.local.example.js   # Template untuk config.local.js
├── index.js                  # Bootstrap: init DB dan launch
├── app.js                    # Perakitan bot, dipakai juga oleh pengujian
├── database/
│   ├── db.js                 # Skema SQLite, migrasi sesi lama, kolom state
│   ├── panelStore.js         # CRUD panel per user, enkripsi kredensial
│   └── stateStore.js         # State navigasi: panel aktif, server aktif, pendingAction
├── services/
│   ├── cryptoService.js      # AES-256-GCM
│   ├── pteroClient.js        # Wrapper Pterodactyl Client API
│   └── pteroConsoleWs.js     # WebSocket console tail
├── middleware/
│   ├── auth.js               # Memuat panel milik user dan client panel aktif
│   └── errorHandler.js
├── handlers/
│   ├── nav.js                # Beranda dan Daftar Server
│   ├── panelHandler.js       # Tambah, pilih, hapus server panel
│   ├── textRouter.js         # Routing pesan teks tanpa command
│   ├── serverListHandler.js  # Daftar server game pada panel aktif
│   ├── serverDashboard.js
│   ├── consoleHandler.js
│   ├── powerHandler.js
│   ├── fileManagerHandler.js
│   ├── startupHandler.js
│   └── serverInfoHandler.js
├── utils/
│   ├── formatter.js
│   ├── rich.js
│   ├── views.js
│   └── reply.js
└── test/
    ├── test-panels.js        # CRUD panel, isolasi user, persistensi
    ├── test-isolation.js     # Bukti tidak ada sesi yang dibagi antar user
    ├── test-unauth-state.js  # State sebelum user punya panel
    ├── test-panel-add.js     # Validasi URL dan kredensial, duplikat, multi panel
    ├── test-text-router.js   # Routing tanpa panel dan dengan panel aktif
    ├── test-rich.js          # Renderer, seluruh layar, dan tabel native /start
    ├── test-dashboard.js
    ├── test-power-info.js
    ├── test-file-manager.js
    ├── test-startup.js
    ├── test-bot-routing.js   # Update sintetis lewat instance bot produksi
    ├── test-ptero-client.js
    ├── test-console-ws.js
    ├── test-e2e.js           # Integrasi ke panel uji
    ├── fixtures.js
    └── helpers.js
```

---

## Kebutuhan Sistem

- Node.js 22.5.0 atau lebih baru (butuh `node:sqlite`).
- Koneksi internet ke Telegram Bot API dan panel Pterodactyl milik user.

---

## Instalasi

```bash
cd ~/bot-monitor
npm install
```

Dependency: `telegraf`, `axios`, `ws`, `form-data`.

---

## Konfigurasi

Kredensial tidak disimpan di `config.js`, sehingga berkas itu aman untuk diunggah dan dibagikan. Nilai asli diletakkan di `config.local.js` yang diabaikan git.

1. Salin template:

   ```bash
   cp config.local.example.js config.local.js
   ```

2. Isi nilainya:

   ```javascript
   module.exports = {
     BOT_TOKEN: 'token_dari_botfather',
     OWNER_ID: 123456789,
     ENCRYPTION_SECRET: 'hasil_randomBytes_32_hex',
   };
   ```

3. Buat `ENCRYPTION_SECRET` acak:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

`config.js` memuat nilai contoh, lalu menimpanya dengan isi `config.local.js` bila berkas itu ada. Tanpa kredensial, bot menolak berjalan dan menampilkan cara mengisinya, jadi tidak ada nilai bawaan yang bisa dipakai tanpa sengaja.

Tidak ada URL panel di konfigurasi. Panel ditambahkan oleh user lewat menu Tambah Server.

Diabaikan git: `config.local.js` dan `database/*.db`.

---

## Pengujian

```bash
npm test
```

Integrasi ke panel uji (kredensial dibaca dari environment, tidak disimpan di repo):

```bash
PTERO_TEST_PANEL_URL=https://panel.contoh.com \
PTERO_TEST_API_KEY=ptlc_xxx \
node test/test-e2e.js
```

`test/test-rich.js` memeriksa seluruh layar: batas karakter, tombol tanpa aksi, panjang `callback_data`, gaya tombol yang sah, tidak adanya em dash, tidak adanya callback alur lama, dan tidak adanya alamat panel yang bocor ke chat.

---

## Migrasi dari Versi Satu Panel

Versi sebelumnya menyimpan satu sesi per user di tabel `sessions`. Saat `initDb` dijalankan, baris itu dipindahkan menjadi satu baris di tabel `panels`, lalu tabel lama dihapus. Panel hasil migrasi langsung ditandai aktif, jadi user lama tidak perlu menautkan ulang.

---

## Versi

Versi bot yang tampil di layar `/start` mengikuti `version` pada `package.json` (saat ini 1.6.0).

---

## Menjalankan Bot

```bash
node index.js
```

Log saat berhasil:

```
==================================================
Bot @[username_bot] berhasil aktif!
Owner ID Terdaftar: 123456789
Navigasi penuh lewat tombol rich message, tanpa command.
==================================================
```

Buka bot, kirim pesan apa saja, lalu tekan Tambah Server. `/start` tetap diterima sebagai pesan biasa.

Untuk log update per pesan, jalankan dengan `BOT_DEBUG=1`.

---

## Catatan Keamanan

- API Key dihapus dari chat setelah dibaca dan disimpan terenkripsi.
- Token bot tidak pernah ditampilkan di chat, termasuk di menu pemilik.
- Setiap query panel memfilter `telegram_id`, dan ini diuji di `test/test-panels.js`.
- Jika token atau API Key pernah tertulis di chat atau repositori, regenerasi keduanya di @BotFather dan panel.
