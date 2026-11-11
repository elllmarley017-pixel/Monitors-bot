/**
 * Pembangun blok Rich Message (field `blocks`), termasuk tabel native.
 *
 * Dipakai untuk layar yang tabelnya harus benar-benar tabel Telegram, bukan
 * susunan HTML. Rich message hanya boleh memuat salah satu dari html, markdown,
 * atau blocks, jadi layar berbasis blok tidak boleh mencampur HTML.
 *
 * Semua tag dan field di sini sudah diverifikasi diterima API:
 * heading (size), paragraph, list, table (cells, is_bordered, is_striped),
 * divider, pre, blockquote, details, dan buttons.
 */

const { clampLabel } = require('./rich');

const MAX_BLOCKS = 500;

/** Judul blok. size 1 untuk judul utama, 2 dan 3 untuk subbagian. */
function heading(text, size = 2) {
  return { type: 'heading', text: String(text), size };
}

/** Paragraf. Boleh string biasa atau objek rich text (bold, code, dst). */
function paragraph(text) {
  return { type: 'paragraph', text };
}

/** Garis pemisah. */
function divider() {
  return { type: 'divider' };
}

/** Blok teks praformat. */
function pre(text, language) {
  const block = { type: 'pre', text: String(text) };
  if (language) block.language = language;
  return block;
}

/** Daftar berbutir. Item berupa string. */
function list(items) {
  return {
    type: 'list',
    items: items.map((item) => ({
      label: '•',
      blocks: [paragraph(String(item))],
    })),
  };
}

/** Sel tabel dengan perataan opsional. */
function cell(text, { header = false, align, colspan } = {}) {
  const value = { text };
  if (header) value.is_header = true;
  if (align) value.align = align;
  if (colspan) value.colspan = colspan;
  return value;
}

/**
 * Tabel native Telegram.
 * @param {Array<Array<object|string>>} rows
 * @param {{header?: boolean, bordered?: boolean, striped?: boolean}} [opts]
 *   header: baris pertama dijadikan baris kepala
 */
function table(rows, { header = false, bordered = true, striped = true } = {}) {
  const cells = rows.map((row, rowIndex) =>
    row.map((value) => {
      if (value && typeof value === 'object' && 'text' in value) return value;
      return cell(String(value), { header: header && rowIndex === 0 });
    })
  );

  const block = { type: 'table', cells };
  if (bordered) block.is_bordered = true;
  if (striped) block.is_striped = true;
  return block;
}

/** Ubah spesifikasi tombol tampilan menjadi tombol rich message. */
function toButton(item) {
  if (item.disabled) {
    return { text: clampLabel(item.text), disabled: true };
  }

  const button = { text: clampLabel(item.text) };
  if (item.style) button.style = item.style;
  if (item.url) button.url = item.url;
  else button.callback_data = item.data;
  return button;
}

/**
 * Blok tombol dari baris tombol tampilan.
 * Mengembalikan null bila tidak ada tombol, agar blok kosong tidak dikirim.
 */
function buttons(rows) {
  if (!rows || rows.length === 0) return null;
  const flat = rows.flat().filter(Boolean);
  if (flat.length === 0) return null;
  return { type: 'buttons', buttons: flat.map(toButton) };
}

/**
 * Susun daftar blok dan hentikan lebih awal bila melewati batas API.
 * @param {...(object|object[]|null|undefined|false)} parts
 */
function compose(...parts) {
  const blocks = [];
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part)) {
      blocks.push(...part.filter(Boolean));
    } else {
      blocks.push(part);
    }
  }

  if (blocks.length > MAX_BLOCKS) {
    throw new Error(`Rich message memuat ${blocks.length} blok, melewati batas ${MAX_BLOCKS}.`);
  }
  return blocks;
}

module.exports = {
  MAX_BLOCKS,
  heading,
  paragraph,
  divider,
  pre,
  list,
  cell,
  table,
  buttons,
  compose,
};
