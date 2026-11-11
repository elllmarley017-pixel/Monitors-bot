const assert = require('node:assert');

async function runTest() {
  console.log('Menjalankan pengujian pteroConsoleWs...');

  const { ConsoleSession, stripAnsi } = require('../services/pteroConsoleWs');

  // 1. Uji pembersihan ANSI escape sequences
  const rawWithAnsi = '\u001b[32m[INFO]\u001b[0m Server ready on port \u001b[1m3000\u001b[0m';
  const clean = stripAnsi(rawWithAnsi);
  assert.strictEqual(clean, '[INFO] Server ready on port 3000');

  // 2. Uji inisialisasi ConsoleSession
  const mockClient = {
    getWebsocketCredentials: async () => ({
      token: 'dummy_jwt',
      socket: 'wss://node.example.com:8443/api/servers/srv-123/ws',
    }),
    sendCommand: async () => {},
  };

  const session = new ConsoleSession(mockClient, 'srv-123');
  assert.strictEqual(session.serverId, 'srv-123');
  assert.strictEqual(session.isConnected(), false);

  // Tambah log ke buffer
  session.appendLog('\u001b[33mLine 1\u001b[0m');
  session.appendLog('Line 2');
  session.appendLog('Line 3');

  const logs = session.getRecentLogs(2);
  assert.strictEqual(logs.length, 2);
  assert.strictEqual(logs[0], 'Line 2');
  assert.strictEqual(logs[1], 'Line 3');

  console.log('Task 3 tests passed successfully!');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
