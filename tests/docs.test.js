const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const english = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const japanese = fs.readFileSync(path.join(root, 'README.ja.md'), 'utf8');
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
const languageLinks = '[English](README.md) | [日本語](README.ja.md)';

test('English and Japanese READMEs link to each other', () => {
  assert.match(english, new RegExp(languageLinks.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(japanese, new RegExp(languageLinks.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('translated READMEs retain matching feature coverage', () => {
  const englishFeatures = english.match(/^- /gm) || [];
  const japaneseFeatures = japanese.match(/^- /gm) || [];
  assert.equal(englishFeatures.length, 8);
  assert.equal(japaneseFeatures.length, englishFeatures.length);
  assert.match(english, /## Development[\s\S]*## Origin/);
  assert.match(japanese, /## 開発[\s\S]*## 由来/);
});

test('repository instructions require synchronized README maintenance', () => {
  assert.match(agents, /README\.md/);
  assert.match(agents, /README\.ja\.md/);
  assert.match(agents, /update both README files in the same commit/);
});

test('repository includes the upstream and current MIT copyright notices', () => {
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2025 Leo Zhang/);
  assert.match(license, /Copyright \(c\) 2026 ten9miq/);
  assert.match(english, /\[MIT License\]\(LICENSE\)/);
  assert.match(japanese, /\[MIT License\]\(LICENSE\)/);
});
