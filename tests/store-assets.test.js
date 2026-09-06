const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', 'store-assets');

function readPngDimensions(name) {
  const data = fs.readFileSync(path.join(root, name));
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), colorType: data[25] };
}

test('Chrome Web Store images have the required dimensions', () => {
  assert.deepEqual(readPngDimensions('store-icon-128.png'), { width: 128, height: 128, colorType: 6 });
  assert.deepEqual(readPngDimensions('small-promo-440x280.png'), { width: 440, height: 280, colorType: 2 });
  assert.deepEqual(readPngDimensions('screenshot-light-1280x800.png'), { width: 1280, height: 800, colorType: 2 });
  assert.deepEqual(readPngDimensions('screenshot-dark-1280x800.png'), { width: 1280, height: 800, colorType: 2 });
  assert.deepEqual(readPngDimensions('marquee-1400x560.png'), { width: 1400, height: 560, colorType: 2 });
});
