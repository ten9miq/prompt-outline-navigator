'use strict';

// Render only repository-owned fictional content, with the current runtime.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

async function main() {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = new Map([
    ['/c/store-demo', 'store-assets/source/demo.html'],
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css])
      .map((file) => [`/${file}`, file])
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    // Fulfill every request locally. No ChatGPT or other server is contacted.
    await page.route('**/*', (route) => {
      const file = files.get(new URL(route.request().url()).pathname);
      if (!file) return route.abort();
      return route.fulfill({
        body: fs.readFileSync(path.join(root, file)),
        contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript'
      });
    });
    for (const theme of ['light', 'dark']) {
      await page.goto(`https://chatgpt.com/c/store-demo?theme=${theme}`);
      await page.locator('#chatgpt-toc-sidebar:not([hidden]) .toc-item').last().waitFor();
      assert.equal(await page.locator('.toc-group').count(), 2);
      assert.equal(await page.locator('.toc-item').count(), 8);
      assert.match(await page.locator('#chatgpt-toc-content').innerText(), /Create a practical guide/);
      assert.deepEqual(errors, [], 'Sample must render without runtime errors');
      const file = path.join(root, 'store-assets', `screenshot-${theme}-1280x800.png`);
      await page.screenshot({ path: file });
      console.log(`${theme}: 1280x800, 2 prompt groups, 8 headings, no page/console errors: ${file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
