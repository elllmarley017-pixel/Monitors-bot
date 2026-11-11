const assert = require('node:assert');

async function runTest() {
  console.log('Menjalankan pengujian fileManagerHandler helper functions...');

  const { sanitizePath, getParentPath } = require('../handlers/fileManagerHandler');

  // 1. Uji sanitasi path (mencegah path traversal)
  assert.strictEqual(sanitizePath('/'), '/');
  assert.strictEqual(sanitizePath('/src'), '/src');
  assert.strictEqual(sanitizePath('/src/utils'), '/src/utils');
  assert.strictEqual(sanitizePath('/../../../etc/passwd'), '/etc/passwd');
  assert.strictEqual(sanitizePath('//src//index.js'), '/src/index.js');
  assert.strictEqual(sanitizePath('/folder/../file.txt'), '/file.txt');

  // 2. Uji parent path resolution
  assert.strictEqual(getParentPath('/'), '/');
  assert.strictEqual(getParentPath('/src'), '/');
  assert.strictEqual(getParentPath('/src/utils'), '/src');
  assert.strictEqual(getParentPath('/home/container/test'), '/home/container');

  console.log('Task 7 tests passed successfully!');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
