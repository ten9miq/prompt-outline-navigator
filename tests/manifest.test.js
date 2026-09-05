const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('manifest identifies the navigator and needs no extra permissions', () => {
  assert.equal(manifest.name, 'TOC Navigator for ChatGPT');
  assert.equal(manifest.version, '1.3.0');
  assert.deepEqual(manifest.permissions, []);
  assert.equal(manifest.key, undefined);
  assert.equal(manifest.update_url, undefined);
});

test('content script covers both supported ChatGPT hosts', () => {
  const [contentScript] = manifest.content_scripts;
  assert.deepEqual(contentScript.js, ['content.js']);
  assert.deepEqual(contentScript.css, ['styles.css']);
  assert.deepEqual(contentScript.matches, [
    'https://chat.openai.com/*',
    'https://chatgpt.com/*'
  ]);
});

test('sidecar reserves width without padding or reparenting styles', () => {
  assert.match(styles, /--chatgpt-toc-width:\s*200px/);
  assert.match(styles, /body\.chatgpt-toc-open\s*>\s*\.chatgpt-toc-app-root/);
  assert.match(styles, /calc\(100% - var\(--chatgpt-toc-width\)\)/);
  assert.doesNotMatch(styles, /padding-right/);
});
