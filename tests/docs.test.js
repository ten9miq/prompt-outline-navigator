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
  assert.equal(englishFeatures.length, 12);
  assert.equal(japaneseFeatures.length, englishFeatures.length);
  assert.match(english, /## Development[\s\S]*## Origin/);
  assert.match(japanese, /## 開発[\s\S]*## 由来/);
  assert.deepEqual(english.match(/^#{2,3} /gm), japanese.match(/^#{2,3} /gm));
});

test('Gemini documentation separates unreleased support and detached-history limits', () => {
  assert.match(english, /Gemini support in this checkout is unreleased/);
  assert.match(japanese, /Gemini対応は未リリース/);
  assert.match(english, /not retained or recovered/);
  assert.match(japanese, /保持・復旧は未対応/);
  for (const readme of [english, japanese]) {
    assert.match(readme, /https:\/\/gemini\.google\.com\/\*/);
    assert.match(readme, /docs\/GEMINI_SUPPORT\.md/);
  }
  const publicDocs = ['README.md', 'README.ja.md', 'docs/RELEASE.md', 'docs/GEMINI_SUPPORT.md', 'docs/TOC_RELIABILITY.md']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
  assert.doesNotMatch(publicDocs, /https:\/\/gemini\.google\.com\/(?:app|notebook)\/[a-f0-9-]{8,}/i);
});

test('release-facing Markdown links resolve within the repository', () => {
  const files = ['README.md', 'README.ja.md', 'PRIVACY.md', 'PRIVACY.ja.md',
    'docs/RELEASE.md', 'docs/RELEASE_1.6.3.md', 'docs/GEMINI_SUPPORT.md', 'docs/PLAN.md', 'store-assets/README.md'];
  for (const name of files) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(name), target)), `${name}: ${target}`);
    }
  }
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
