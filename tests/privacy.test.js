const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const english = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
const japanese = fs.readFileSync(path.join(root, 'PRIVACY.ja.md'), 'utf8');

test('privacy policies link to each language version', () => {
  assert.match(english, /\[日本語\]\(PRIVACY\.ja\.md\)/);
  assert.match(japanese, /\[English\]\(PRIVACY\.md\)/);
});

test('privacy policies describe local-only conversation processing and stored preference', () => {
  assert.match(english, /processed locally in the browser only/i);
  assert.match(english, /not collected by the developer/i);
  assert.match(english, /chrome\.storage\.local/);
  assert.match(japanese, /ブラウザー内だけで処理/);
  assert.match(japanese, /開発者による収集/);
  assert.match(japanese, /chrome\.storage\.local/);
});

test('privacy policies identify supported sites and prohibit remote code', () => {
  for (const policy of [english, japanese]) {
    assert.match(policy, /https:\/\/chatgpt\.com\/\*/);
    assert.match(policy, /https:\/\/chat\.openai\.com\/\*/);
  }
  assert.match(english, /does not download or execute remote code/i);
  assert.match(japanese, /リモートコードのダウンロードや実行は行いません/);
});
