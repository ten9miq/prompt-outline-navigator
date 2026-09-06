const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('manifest identifies the navigator and needs no extra permissions', () => {
  assert.equal(manifest.name, 'TOC Navigator for ChatGPT');
  assert.equal(manifest.version, '1.3.18');
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
  assert.match(styles, /body\.chatgpt-toc-open\s*>\s*\.chatgpt-toc-app-root\s*>\s*:first-child/);
  assert.match(styles, /calc\(100vw - var\(--chatgpt-toc-width\)\)/);
  assert.match(styles, /min-width:\s*0\s*!important/);
  assert.doesNotMatch(styles, /padding-right/);
});

test('ChatGPT modal overlays remain above the sidebar and toggle', () => {
  assert.match(styles, /#chatgpt-toc-sidebar\s*\{[\s\S]*?z-index:\s*40/);
  assert.match(styles, /#chatgpt-toc-toggle\s*\{[\s\S]*?z-index:\s*40/);
  assert.doesNotMatch(styles, /z-index:\s*(?:9999|10000)/);
});

test('conversation and composer use ChatGPT content-width variables for wide mode', () => {
  assert.match(styles, /--chatgpt-toc-content-max-width:\s*80vw/);
  assert.match(styles, /#thread\s*\{\s*--wide-content-max-width:/);
  assert.match(styles, /--thread-content-max-width:\s*var\(--wide-content-max-width\)\s*!important/);
  assert.match(styles, /#thread-bottom-container \[class\*="max-w-\(--thread-content-max-width\)"\]/);
  assert.match(styles, /\[data-turn="assistant"\] \.markdown\.prose[\s\S]*max-width:\s*none\s*!important/);
  assert.doesNotMatch(styles, /body\s*>\s*div\s*>\s*div\.flex/);
});

test('legacy Stylus and UserScript appearance is integrated', () => {
  assert.match(styles, /background:\s*var\(--bg-primary/);
  assert.match(styles, /\.toc-h2 \.toc-text \{ color: #10a37f/);
  assert.match(styles, /\.toc-h3 \.toc-text \{ color: #2196f3/);
  assert.match(styles, /\.toc-item\.active \{ color: #fff; background: #6940c5; border-left-color: #60a5fa; \}/);
  assert.match(styles, /\.toc-group-header\.active[\s\S]*background: #2b2f36;[\s\S]*outline: 2px solid #6940c5/);
  assert.match(styles, /\.toc-item\.toc-h6 \{ padding-left: 30px; \}/);
  assert.match(styles, /-webkit-line-clamp: 5/);
});

test('TOC navigation leaves top space and highlights the destination', () => {
  assert.match(styles, /scroll-margin-top: clamp\(72px, 10vh, 120px\)/);
  assert.match(styles, /\.chatgpt-toc-target-highlight/);
  assert.match(styles, /@keyframes chatgpt-toc-target-highlight/);
});
