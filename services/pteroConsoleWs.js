const WebSocket = require('ws');

/**
 * Menghapus ANSI escape code dari string teks.
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
  if (!str) return '';
  return String(str).replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g,
    ''
  );
}

class ConsoleSession {
  /**
   * @param {object} pteroClient Instance PteroApiClient
   * @param {string} serverId
   */
  constructor(pteroClient, serverId) {
    this.pteroClient = pteroClient;
    this.serverId = serverId;
    this.ws = null;
    this.connected = false;
    this.logs = [];
    this.maxLogs = 60;
    this.serverStatus = 'offline';
    this.lastActivity = Date.now();
    this.autoCloseTimer = null;
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  appendLog(line) {
    const clean = stripAnsi(line).trimEnd();
    if (!clean) return;
    this.logs.push(clean);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.lastActivity = Date.now();
  }

  getRecentLogs(lines = 20) {
    return this.logs.slice(-lines);
  }

  getStatus() {
    return this.serverStatus;
  }

  async connect() {
    if (this.isConnected()) return;

    const creds = await this.pteroClient.getWebsocketCredentials(this.serverId);
    const { token, socket } = creds;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      try {
        this.ws = new WebSocket(socket, {
          origin: this.pteroClient.baseUrl,
        });
      } catch (err) {
        return reject(err);
      }

      this.ws.on('open', () => {
        // Kirim event autentikasi
        this.ws.send(JSON.stringify({ event: 'auth', args: [token] }));
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          const event = parsed.event;
          const args = parsed.args || [];

          if (event === 'auth success') {
            this.connected = true;
            // Minta log console terakhir
            this.ws.send(JSON.stringify({ event: 'send logs', args: [null] }));
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          } else if (event === 'status') {
            if (args[0]) this.serverStatus = args[0];
          } else if (event === 'console output') {
            for (const item of args) {
              this.appendLog(item);
            }
          } else if (event === 'token expiring') {
            // Perbarui token
            this.refreshToken().catch(() => {});
          } else if (event === 'token expired') {
            this.disconnect();
          }
        } catch {
          // Abaikan pesan yang bukan JSON
        }
      });

      this.ws.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
      });

      // Timeout koneksi 10 detik
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          if (this.connected) {
            resolve();
          } else {
            resolve(); // Fallback tanpa throw agar bot tetap bisa menampilkan tail
          }
        }
      }, 10000);
    });
  }

  async refreshToken() {
    if (!this.isConnected()) return;
    const creds = await this.pteroClient.getWebsocketCredentials(this.serverId);
    this.ws.send(JSON.stringify({ event: 'auth', args: [creds.token] }));
  }

  async sendCommand(command) {
    this.lastActivity = Date.now();
    if (this.isConnected()) {
      this.ws.send(JSON.stringify({ event: 'send command', args: [command] }));
    } else {
      // Fallback via HTTP Client API
      await this.pteroClient.sendCommand(this.serverId, command);
    }
  }

  disconnect() {
    this.connected = false;
    if (this.autoCloseTimer) {
      clearInterval(this.autoCloseTimer);
      this.autoCloseTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}

// Pool sesi console aktif.
// Kunci wajib memuat user dan panel: identifier server game hanya unik di dalam
// satu panel, jadi tanpa keduanya dua user bisa berbagi satu koneksi WebSocket.
const activeConsoleSessions = new Map();

function consoleSessionKey({ userId, panelId, serverId }) {
  return `${userId ?? 'anon'}:${panelId ?? 0}:${serverId}`;
}

function getConsoleSession(pteroClient, serverId, { userId, panelId } = {}) {
  const key = consoleSessionKey({ userId, panelId, serverId });
  const existing = activeConsoleSessions.get(key);
  if (existing && existing.isConnected()) {
    return existing;
  }

  const session = new ConsoleSession(pteroClient, serverId);
  activeConsoleSessions.set(key, session);
  return session;
}

module.exports = {
  stripAnsi,
  ConsoleSession,
  getConsoleSession,
  consoleSessionKey,
};
