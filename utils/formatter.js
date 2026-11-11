/**
 * Utilitas pemformatan teks, angka, dan status server.
 */

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0%';
  return `${Number(value).toFixed(decimals)}%`;
}

function formatUptime(ms) {
  if (!ms || ms <= 0) return '0 detik';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} detik`);

  return parts.join(' ');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status) {
  if (!status) return 'UNKNOWN';
  const s = String(status).toLowerCase();
  if (s === 'running') return 'ONLINE';
  if (s === 'offline') return 'OFFLINE';
  if (s === 'starting') return 'STARTING';
  if (s === 'stopping') return 'STOPPING';
  return s.toUpperCase();
}

module.exports = {
  formatBytes,
  formatPercent,
  formatUptime,
  escapeHtml,
  statusBadge,
};
