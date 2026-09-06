const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const iconSvg = fs.readFileSync(path.join(root, 'icons', 'toc_navigator_icon.svg'), 'utf8');

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('manifest identifies the navigator and only stores extension preferences', () => {
  assert.equal(manifest.name, 'TOC Navigator for ChatGPT');
  assert.equal(manifest.version, '1.3.26');
  assert.equal(manifest.author, 'ten9miq');
  assert.equal(packageJson.author, 'ten9miq');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.key, undefined);
  assert.equal(manifest.update_url, undefined);
});

test('navigator icons are transparent PNGs at every declared size', () => {
  for (const size of [16, 32, 48, 64, 128]) {
    const png = fs.readFileSync(path.join(root, 'icons', `toc_gpt_icon_${size}.png`));
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6, `${size}px icon must use RGBA color`);
  }
  assert.match(iconSvg, /#10a37f/);
  assert.match(iconSvg, /#6940c5/);
  assert.match(iconSvg, /#60a5fa/);
  assert.doesNotMatch(iconSvg, /<(?:linearGradient|radialGradient|text)\b/);
});

test('content script covers both supported ChatGPT hosts', () => {
  const [contentScript] = manifest.content_scripts;
  assert.deepEqual(contentScript.js, ['src/shared.js', 'src/sidebar.js', 'content.js']);
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

test('sidebar close button has a fixed centered hit area', () => {
  assert.match(styles, /\.toc-close\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?padding:\s*0;/);
  assert.match(styles, /\.toc-close svg \{ display: block; \}/);
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
  assert.match(styles, /\.toc-h2 \.toc-text \{ color: var\(--toc-h2-color\)/);
  assert.match(styles, /\.toc-h3 \.toc-text \{ color: var\(--toc-h3-color\)/);
  assert.match(styles, /\.toc-item\.active \{ color: #fff; background: #6940c5; border-left-color: #60a5fa; \}/);
  assert.match(styles, /\.toc-item\.active \.toc-text \{ color: #fff; \}/);
  assert.match(styles, /\.toc-group-header\.active[\s\S]*background: var\(--toc-active-prompt-bg\)/);
  assert.match(styles, /\.toc-item\.toc-h6 \{ padding-left: 30px; \}/);
  assert.match(styles, /-webkit-line-clamp: 5/);
});

test('active prompt colors adapt to light and dark backgrounds', () => {
  assert.match(styles, /--toc-active-prompt-color: #312e81/);
  assert.match(styles, /--toc-active-prompt-bg: #ede9fe/);
  assert.match(styles, /\.dark-mode#chatgpt-toc-sidebar[\s\S]*--toc-active-prompt-color: #fff/);
  assert.match(styles, /\.dark-mode#chatgpt-toc-sidebar[\s\S]*--toc-active-prompt-bg: #2b2f36/);
  assert.match(styles, /\.toc-group-header\.active \.toc-group-prompt \{ color: inherit; \}/);
  assert.ok(contrastRatio('#312e81', '#ede9fe') >= 4.5);
  assert.ok(contrastRatio('#ffffff', '#2b2f36') >= 4.5);
});

test('light and dark hierarchy palettes meet small-text contrast', () => {
  const light = ['#1f2937', '#08745b', '#0d6f5d', '#08745b', '#0b64a0', '#4b5563', '#5f5f5f', '#6b7280'];
  const dark = ['#a7adb5', '#35b58f', '#35b58f', '#32ad96', '#4f91c9', '#a7adb5', '#969da6', '#858d98'];
  for (const color of light) {
    assert.match(styles, new RegExp(`: ${color.replace('#', '\\#')}`));
    assert.ok(contrastRatio(color, '#ffffff') >= 4.5, `${color} must contrast with the light background`);
  }
  for (const color of dark) {
    assert.match(styles, new RegExp(`: ${color.replace('#', '\\#')}`));
    assert.ok(contrastRatio(color, '#212121') >= 4.5, `${color} must contrast with the dark background`);
  }
});

test('TOC navigation leaves top space and highlights the destination', () => {
  assert.match(styles, /scroll-margin-top: clamp\(72px, 10vh, 120px\)/);
  assert.match(styles, /\.chatgpt-toc-target-highlight/);
  assert.match(styles, /@keyframes chatgpt-toc-target-highlight/);
});
