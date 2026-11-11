/**
 * Pembangun isi Rich Message (Bot API 10.x) berbasis HTML.
 *
 * Semua tag di sini sudah diverifikasi diterima API pada 2026-11-11:
 * h1-h3, p, b/i/u/s, code, pre, a, ul/ol/li, table (bordered/striped),
 * blockquote, aside, details/summary, hr, tg-button-row, tg-button.
 *
 * Aturan: setiap nilai dinamis wajib melewati esc() sebelum disisipkan.
 */

const { escapeHtml } = require('./formatter');

const STYLE = {
  PRIMARY: 'primary',
  SUCCESS: 'success',
  DANGER: 'danger',
};

const MAX_RICH_CHARS = 32768;
const MAX_BUTTON_TEXT = 64;

function esc(value) {
  return escapeHtml(value === null || value === undefined ? '' : String(value));
}

/** Teks tebal. */
function b(value) {
  return `<b>${esc(value)}</b>`;
}

/** Teks miring. */
function it(value) {
  return `<i>${esc(value)}</i>`;
}

/** Teks monospace sebaris. */
function code(value) {
  return `<code>${esc(value)}</code>`;
}

/** Teks bergaris bawah. */
function u(value) {
  return `<u>${esc(value)}</u>`;
}

/** Teks dengan coretan. */
function s(value) {
  return `<s>${esc(value)}</s>`;
}

/** Teks tersorot. */
function mark(value) {
  return `<mark>${esc(value)}</mark>`;
}

/** Teks tersembunyi sampai diketuk. */
function spoiler(value) {
  return `<tg-spoiler>${esc(value)}</tg-spoiler>`;
}

/** Tautan eksternal. */
function link(value, url) {
  return `<a href="${esc(url)}">${esc(value)}</a>`;
}

/** Sebutan pengguna berdasarkan ID Telegram. */
function mention(value, userId) {
  return `<a href="tg://user?id=${esc(userId)}">${esc(value)}</a>`;
}

/** Tandai potongan HTML siap pakai agar tidak di-escape dua kali. */
function f(html) {
  return { __inline: html };
}

/** Ubah nilai menjadi inline HTML: string di-escape, hasil f() dipakai apa adanya. */
function toInline(value) {
  if (value && typeof value === 'object' && typeof value.__inline === 'string') {
    return value.__inline;
  }
  return esc(value);
}

/* ------------------------------------------------------------------ */
/* Blok                                                                */
/* ------------------------------------------------------------------ */

function h1(value) {
  return `<h1>${esc(value)}</h1>`;
}

function h2(value) {
  return `<h2>${esc(value)}</h2>`;
}

function h3(value) {
  return `<h3>${esc(value)}</h3>`;
}

/** Paragraf; argumen sudah berupa potongan inline (b(), code(), dll). */
function p(...inline) {
  return `<p>${inline.join('')}</p>`;
}

function divider() {
  return '<hr>';
}

/** Daftar tidak berurut. Item string di-escape, item f() dipakai sebagai HTML. */
function bullets(items) {
  const rows = items.map((item) => `<li>${toInline(item)}</li>`).join('');
  return `<ul>${rows}</ul>`;
}

/** Daftar berurut. */
function steps(items) {
  const rows = items.map((item) => `<li>${toInline(item)}</li>`).join('');
  return `<ol>${rows}</ol>`;
}

/**
 * Tabel label/nilai dua kolom.
 * @param {Array<[string, string|number]>} rows
 */
function kvTable(rows, { striped = true } = {}) {
  const body = rows
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${toInline(value)}</td></tr>`)
    .join('');
  const attrs = striped ? 'bordered striped' : 'bordered';
  return `<table ${attrs}>${body}</table>`;
}

/** Blok kode; isi di-escape sehingga karakter khusus aman. */
function pre(text, language) {
  const body = esc(text);
  if (language) return `<pre><code class="language-${esc(language)}">${body}</code></pre>`;
  return `<pre>${body}</pre>`;
}

/** Kutipan. */
function quote(...inline) {
  return `<blockquote>${inline.join('')}</blockquote>`;
}

/** Catatan samping. */
function aside(...inline) {
  return `<aside>${inline.join('')}</aside>`;
}

/** Bagian yang bisa dibuka-tutup. */
function details(summary, ...inline) {
  return `<details><summary>${esc(summary)}</summary>${inline.join('')}</details>`;
}

/* ------------------------------------------------------------------ */
/* Tombol native                                                       */
/* ------------------------------------------------------------------ */

function clampLabel(text) {
  const value = String(text);
  if (value.length <= MAX_BUTTON_TEXT) return value;
  return `${value.slice(0, MAX_BUTTON_TEXT - 3)}...`;
}

/**
 * Tombol callback native.
 * @param {string} label
 * @param {string} data callback_data
 * @param {'primary'|'success'|'danger'} [style]
 */
function btn(label, data, style) {
  const styleAttr = style ? ` style="${style}"` : '';
  return `<tg-button type="callback_data" data="${esc(data)}"${styleAttr}>${esc(clampLabel(label))}</tg-button>`;
}

/** Tombol tautan eksternal. */
function urlBtn(label, url) {
  return `<tg-button type="url" url="${esc(url)}">${esc(clampLabel(label))}</tg-button>`;
}

/**
 * Tombol nonaktif, dipakai untuk indikator halaman agar tidak ada kontrol mati.
 */
function inertBtn(label) {
  return `<tg-button type="callback_data" data="noop" disabled="true">${esc(clampLabel(label))}</tg-button>`;
}

/**
 * Satu baris tombol.
 * @param {string[]} buttons hasil btn()/urlBtn()/inertBtn()
 * @param {'start'|'center'|'end'} [align]
 */
function row(buttons, align) {
  const alignAttr = align ? ` align="${align}"` : '';
  return `<tg-button-row${alignAttr}>${buttons.join('')}</tg-button-row>`;
}

/** Gabungkan beberapa baris tombol. */
function buttonRows(rows) {
  return rows.join('');
}

/**
 * Ubah spesifikasi tombol menjadi HTML native.
 * Bentuk yang didukung:
 *   { text, data, style }  tombol callback
 *   { text, url }          tombol tautan
 *   { text, disabled: true } tombol nonaktif (indikator)
 * @param {Array<Array<object>>} rows
 * @returns {string}
 */
function renderButtonRows(rows) {
  if (!rows || rows.length === 0) return '';
  return rows
    .filter((rowItems) => rowItems && rowItems.length > 0)
    .map((rowItems) =>
      row(
        rowItems.map((item) => {
          if (item.disabled) return inertBtn(item.text);
          if (item.url) return urlBtn(item.text, item.url);
          return btn(item.text, item.data, item.style);
        }),
        rowItems.length === 1 ? 'start' : undefined
      )
    )
    .join('');
}

/**
 * Susun seluruh isi pesan. Bagian kosong otomatis dilewati.
 * @param {...(string|false|null|undefined)} parts
 */
function compose(...parts) {
  const html = parts
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('\n');
  return assertWithinLimit(html);
}

function assertWithinLimit(html) {
  const size = Buffer.byteLength(html, 'utf8');
  if (size <= MAX_RICH_CHARS) return html;
  throw new Error(
    `Isi rich message ${size} byte melewati batas ${MAX_RICH_CHARS} byte.`
  );
}

module.exports = {
  STYLE,
  MAX_RICH_CHARS,
  esc,
  f,
  toInline,
  clampLabel,
  b,
  it,
  code,
  u,
  s,
  mark,
  spoiler,
  link,
  mention,
  h1,
  h2,
  h3,
  p,
  divider,
  bullets,
  steps,
  kvTable,
  pre,
  quote,
  aside,
  details,
  btn,
  urlBtn,
  inertBtn,
  row,
  buttonRows,
  renderButtonRows,
  compose,
};
