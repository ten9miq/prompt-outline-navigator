const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts', 'build-store-package.ps1'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('store package command invokes the dedicated PowerShell builder', () => {
  assert.match(packageJson.scripts['package:store'], /scripts\/build-store-package\.ps1/);
});

test('store package is derived from manifest references and excludes development files', () => {
  assert.match(script, /contentScript\.js/);
  assert.match(script, /contentScript\.css/);
  assert.match(script, /manifest\.icons/);
  assert.match(script, /'LICENSE'/);
  assert.match(script, /tests\|docs\|store-assets\|scripts/);
  assert.match(script, /manifest\.json is not at the ZIP root/);
});
