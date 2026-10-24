const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const labels = (page) => page.locator('.toc-item .toc-text');
// Anonymous structure observed on Gemini, 2026-10-24. No account content.
const turn = (id, heading, prompt = 'Explain this topic') => `<div class="conversation-container" id="${id}">
  <user-query><user-query-content><div class="query-text"><h5 class="cdk-visually-hidden">You said</h5><p class="query-text-line">${prompt}</p></div>
    <button>Edit prompt</button></user-query-content></user-query>
  <model-response><h6>Gemini said</h6><model-thoughts><h2>Thinking heading</h2></model-thoughts>
    <model-response-content><message-content id="message-content-id-r_${id}"><div class="markdown"><h2 id="heading-${id}">${heading}</h2><p style="height:950px">Answer body</p></div></message-content></model-response-content>
    <button><h2>Toolbar heading</h2></button></model-response></div>`;

async function openGemini(page, body = turn('first', 'First section') + turn('second', 'Second section'), isolated = false) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://gemini.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>
    body {margin:0} chat-app-orchestrator,chat-app,main {display:block;width:100vw;height:100vh}
    nav {position:fixed;top:0;left:0;width:80px;height:80px;overflow:hidden}
    infinite-scroller {display:block;height:650px;overflow-y:scroll} user-query,model-response,model-response-content {display:block}
    [hidden] {display:none!important} .cdk-visually-hidden {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    </style></head><body class="light-theme"><chat-app-orchestrator><chat-app><main>
    <nav><infinite-scroller>${turn('nav', 'Navigation heading')}</infinite-scroller></nav>
    <infinite-scroller class="chat-history" data-test-id="chat-history-container">${body}</infinite-scroller>
    <rich-textarea contenteditable="true"><h2>Composer heading</h2></rich-textarea>
    <section id="canvas"><h2>Canvas heading</h2></section>
    </main></chat-app></chat-app-orchestrator></body></html>` }));
  await page.goto('https://gemini.google.com/app/fixture');
  await page.addStyleTag({ path: path.join(root, 'styles.css') });
  if (isolated) {
    const cdp = await page.context().newCDPSession(page);
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'toc-extension-fixture' });
    for (const script of manifest.content_scripts[0].js) {
      const result = await cdp.send('Runtime.evaluate', { expression: fs.readFileSync(path.join(root, script), 'utf8'), contextId: executionContextId });
      expect(result.exceptionDetails).toBeUndefined();
    }
  } else {
    for (const script of manifest.content_scripts[0].js) await page.addScriptTag({ path: path.join(root, script) });
  }
  await expect(page.locator('#chatgpt-toc-sidebar.is-open')).toBeVisible();
  return errors;
}

test('Gemini pairs prompts with response bodies and navigates its history pane', async ({ page }) => {
  const errors = await openGemini(page);
  await expect(page.locator('.toc-group-prompt')).toHaveText(['Explain this topic', 'Explain this topic']);
  await expect(labels(page)).toHaveText(['First section', 'Second section']);
  const history = page.locator('infinite-scroller.chat-history');
  await page.locator('.toc-item').nth(1).click();
  await expect.poll(() => history.evaluate((pane) => pane.scrollTop)).toBeGreaterThan(800);
  await expect.poll(() => page.locator('#heading-second').evaluate((el) => Math.abs(el.getBoundingClientRect().top - 90))).toBeLessThan(3);
  await page.locator('.toc-group-header').first().click();
  await expect.poll(() => history.evaluate((pane) => pane.scrollTop)).toBeLessThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('body').evaluate((body) => { body.classList.replace('light-theme', 'dark-theme'); });
  await expect(page.locator('#chatgpt-toc-sidebar')).toHaveClass(/dark-mode/);
  await page.locator('body').evaluate((body) => { body.classList.replace('dark-theme', 'light-theme'); });
  await expect(page.locator('#chatgpt-toc-sidebar')).not.toHaveClass(/dark-mode/);
  expect(errors).toEqual([]);
});

test('Gemini mobile inline code Canvas wraps controls inside its clipped preview', async ({ page }) => {
  const errors = await openGemini(page);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.addStyleTag({ content: `
    main {width:100%} inline-preview {display:block;width:948px;max-width:100%}
    chat-app.mobile inline-preview {width:348px}
    .inline-preview-container {display:flex;flex-direction:column;height:600px;overflow:hidden}
    .title-container {display:flex;align-items:center;gap:8px;height:72px;flex:none;padding:18px 28px;box-sizing:border-box}
    .title-wrapper {display:flex;flex:1 1 auto;min-width:0}
    .title-wrapper .title {flex:1;min-width:0;overflow:hidden}
    .title-wrapper button,.canvas-icon {width:36px;flex:none}
    .tab-group-container {display:flex;width:178px;flex:none}
    .tab-group-container button {width:50%} .canvas-export {width:174px;flex:none}
    .title-container button {height:36px;padding:0} .preview-body {flex:1;min-height:0}
  ` });
  await page.evaluate(() => {
    document.querySelector('chat-app').classList.add('mobile');
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<inline-preview><div class="inline-preview-container"><div class="title-container"><div class="title-wrapper"><span class="title">Layout audit</span><button>Saved</button></div><div class="tab-group-container"><button>Code</button><button>Preview</button></div><button class="canvas-export">Export</button><button class="canvas-icon">Share</button><button class="canvas-icon">Expand</button><button class="canvas-icon">Close</button></div><div class="preview-body">Preview</div></div></inline-preview>');
  });
  const controls = await page.locator('inline-preview button').evaluateAll((buttons) => {
    const bounds = document.querySelector('.inline-preview-container').getBoundingClientRect();
    return buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return r.left >= bounds.left && r.right <= bounds.right + 1 &&
        button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
  });
  expect(controls).toEqual(Array(7).fill(true));
  await expect(page.locator('.title-container')).toHaveCSS('flex-wrap', 'wrap');
  expect(await page.locator('.preview-body').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(300);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.querySelector('chat-app').classList.remove('mobile'));
  await expect(page.locator('.title-container')).toHaveCSS('flex-wrap', 'nowrap');
  expect(errors).toEqual([]);
});

test('Gemini new-chat absolute composer respects reserved width after SPA and late zero-state markers', async ({ page }) => {
  const errors = await openGemini(page);
  await expect(page.locator('.toc-group')).toHaveCount(2);
  await page.addStyleTag({ content: `
    main,chat-window,.chat-container {display:block;width:100%;box-sizing:border-box}
    input-container {position:relative;display:flex;justify-content:flex-end;width:100%;height:64px;padding:0 16px;box-sizing:border-box}
    .input-area-container {display:flex;max-width:660px}
    .input-area-container.is-zero-state {position:absolute;right:28px;margin-inline-end:-56px;transform:translateY(40px)}
    .input-area-container.is-mobile {position:relative;right:0;margin-inline-end:0;flex-direction:column}
    input-container:has(.input-area-container.is-mobile) {padding-inline:0}
    .input-area-container.is-mobile > input-area-v2 {margin-inline:16px}
    input-area-v2 {display:block} .input-area {position:relative;padding:12px 16px;box-sizing:border-box}
    rich-textarea,.ql-editor {display:block;width:100%;height:48px;box-sizing:border-box}
    .composer-tools {display:flex;justify-content:space-between} .composer-tools button {width:36px;height:32px}
  ` });
  await page.evaluate(() => {
    document.querySelector('main').innerHTML = '<chat-window class="center-input-layout"><div class="chat-container"><chat-window-content></chat-window-content><input-container><div class="input-area-container"><input-area-v2><div class="input-area"><rich-textarea><div class="ql-editor" role="textbox" contenteditable="true"></div></rich-textarea><div class="composer-tools"><button>Tools</button><button>Voice</button></div></div></input-area-v2></div></input-container></div></chat-window>';
    history.pushState({}, '', '/app');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.toc-group')).toHaveCount(0);
  await page.locator('.input-area-container').evaluate((el) => el.classList.add('is-zero-state'));
  const check = async () => {
    const result = await page.evaluate(() => {
      const parent = document.querySelector('input-container').getBoundingClientRect();
      const toc = document.querySelector('#chatgpt-toc-sidebar').getBoundingClientRect();
      const pinned = document.body.classList.contains('chatgpt-toc-open');
      const limit = pinned ? toc.left : innerWidth;
      const elements = [...document.querySelectorAll('.input-area-container,rich-textarea,.ql-editor,.composer-tools button')];
      return elements.map((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= parent.left - 1 && r.right <= Math.min(parent.right, limit) + 1 &&
          (el.tagName !== 'BUTTON' || el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)));
      });
    });
    expect(result).toEqual(Array(result.length).fill(true));
  };
  await check();
  await page.locator('.toc-pin').click();
  await expect(page.locator('body')).not.toHaveClass(/chatgpt-toc-open/);
  await page.mouse.move(100, 400);
  await expect(page.locator('#chatgpt-toc-sidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => page.locator('chat-app-orchestrator').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(1280);
  await check();
  await page.setViewportSize({ width: 640, height: 900 });
  await page.locator('.input-area-container').evaluate((el) => el.classList.add('is-mobile'));
  await expect.poll(() => page.locator('input-container').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(640);
  await check();
  await page.mouse.move(639, 400);
  await page.locator('.toc-pin').click();
  await expect.poll(() => page.locator('input-container').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(440);
  await check();
  expect(errors).toEqual([]);
});

test('Gemini response actions follow the widened text and gutters without submitting feedback', async ({ page }) => {
  const errors = await openGemini(page, turn('actions', 'Action alignment'));
  await page.addStyleTag({ content: `
    main,chat-window,chat-window-content {display:block;width:100%;box-sizing:border-box}
    .response-container-footer {width:100%;max-width:708px;margin-inline:auto}
    message-actions {display:block;width:100%;max-width:708px;margin-inline:max(-6px,calc(50% - 360px)) 6px}
    chat-app.mobile .response-container-footer {margin-inline:24px}
    chat-app.mobile .markdown > p {padding-inline:24px;box-sizing:border-box}
    .response-buttons {display:flex} .response-buttons button {width:32px;height:32px;flex:none}
  ` });
  await page.evaluate(() => {
    const history = document.querySelector('infinite-scroller.chat-history');
    const window = document.createElement('chat-window');
    window.innerHTML = '<chat-window-content></chat-window-content>';
    history.replaceWith(window);
    window.firstElementChild.append(history);
    const response = history.querySelector('model-response');
    response.insertAdjacentHTML('beforeend', '<div class="response-container-footer"><message-actions><div class="response-buttons"><button aria-label="Good response">+</button><button aria-label="Bad response">-</button><button aria-label="Copy">Copy</button><button aria-label="More">...</button></div></message-actions></div>');
    globalThis.__feedbackClicks = 0;
    response.querySelectorAll('message-actions button').forEach((button) => button.onclick = () => __feedbackClicks++);
  });
  const check = async (padding) => {
    await page.locator('.chat-history .response-container-footer').scrollIntoViewIfNeeded();
    const result = await page.evaluate(() => {
      const response = document.querySelector('.chat-history model-response');
      const paragraphElement = response.querySelector('.markdown > p');
      const paragraph = paragraphElement.getBoundingClientRect();
      const paragraphStyle = getComputedStyle(paragraphElement);
      const start = parseFloat(paragraphStyle.paddingInlineStart), end = parseFloat(paragraphStyle.paddingInlineEnd);
      const footer = response.querySelector('.response-container-footer');
      const fr = footer.getBoundingClientRect(),row = response.querySelector('message-actions').getBoundingClientRect();
      return {
        paragraph: { left: paragraph.left + start, right: paragraph.right - end, width: paragraph.width - start - end },
        footer: { left: fr.left, right: fr.right, padding: parseFloat(getComputedStyle(footer).paddingInlineStart) },
        row: { left: row.left, right: row.right, width: row.width },
        buttons: [...response.querySelectorAll('message-actions button')].map((button) => {
          const r = button.getBoundingClientRect();
          return r.left >= fr.left - 1 && r.right <= fr.right + 1 &&
            button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })
      };
    });
    expect(result.footer.padding).toBe(padding);
    expect(result.footer.left + padding).toBeCloseTo(result.paragraph.left, 0);
    expect(result.row.left).toBeCloseTo(result.paragraph.left - 6, 0);
    expect(result.row.width).toBeCloseTo(result.paragraph.width, 0);
    expect(result.buttons).toEqual([true, true, true, true]);
  };
  await check(32);
  await page.locator('.toc-pin').click();
  await page.mouse.move(100, 400);
  await expect(page.locator('#chatgpt-toc-sidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => page.locator('chat-app-orchestrator').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(1280);
  await check(32);
  await page.setViewportSize({ width: 640, height: 900 });
  await page.evaluate(() => document.querySelector('chat-app').classList.add('mobile'));
  await check(40);
  await page.mouse.move(639, 400);
  await page.locator('.toc-pin').click();
  await expect.poll(() => page.locator('chat-app-orchestrator').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(440);
  await check(40);
  expect(await page.evaluate(() => __feedbackClicks)).toBe(0);
  expect(errors).toEqual([]);
});

for (const pinned of [true, false]) {
  test(`Gemini mobile fullscreen Canvas preserves the ${pinned ? 'pinned' : 'hover'} preference without covering its toolbar`, async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__tocWrites = [];
      globalThis.chrome = { storage: { local: {
        get: async () => ({ sidebarVisible: true }),
        set: async (value) => __tocWrites.push(value)
      } } };
    });
    const errors = await openGemini(page);
    if (!pinned) await page.locator('.toc-pin').click();
    await page.mouse.move(100, 400);
    const writes = await page.evaluate(() => [...__tocWrites]);
    await page.setViewportSize({ width: 640, height: 900 });
    await page.addStyleTag({ content: `
      chat-app {position:relative;z-index:1}
      immersive-panel {display:block;width:100%;height:400px;background:white}
      chat-app.mobile immersive-panel {position:fixed;inset:0;width:100vw;height:100vh;z-index:2}
      .canvas-tools {position:absolute;top:8px;right:8px;display:flex;gap:8px}
      .canvas-tools button {width:64px;height:40px}
    ` });
    await page.evaluate(() => {
      document.querySelector('chat-app').classList.add('mobile');
      document.querySelector('main').insertAdjacentHTML('beforeend', '<chat-window class="full-width-immersive"><immersive-panel><div class="canvas-tools"><button id="canvas-export">Export</button><button id="canvas-share">Share</button><button id="canvas-close">Close</button></div></immersive-panel></chat-window>');
      document.getElementById('canvas-close').onclick = () => document.querySelector('immersive-panel').parentElement.remove();
    });
    await expect(page.locator('#chatgpt-toc-sidebar')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('#chatgpt-toc-hover-edge')).toHaveCSS('visibility', 'hidden');
    const hits = await page.locator('.canvas-tools button').evaluateAll((buttons) => buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }));
    expect(hits).toEqual([true, true, true]);
    await page.evaluate(() => document.querySelector('chat-app').classList.remove('mobile'));
    await expect(page.locator('#chatgpt-toc-sidebar')).toHaveCSS('visibility', 'visible');
    await page.evaluate(() => document.querySelector('chat-app').classList.add('mobile'));
    await page.locator('#canvas-close').click();
    await expect(page.locator('#chatgpt-toc-sidebar')).toHaveCSS('visibility', 'visible');
    expect(await page.evaluate(() => document.body.classList.contains('chatgpt-toc-open'))).toBe(pinned);
    expect(await page.evaluate(() => __tocWrites)).toEqual(writes);
    expect(errors).toEqual([]);
  });
}

test('Gemini incrementally updates headings, replaces responses, and deduplicates stable remounts', async ({ page }) => {
  const errors = await openGemini(page, turn('first', 'First section'));
  await expect(labels(page)).toHaveText(['First section']);
  await page.locator('#heading-first').evaluate((el) => { el.firstChild.data = 'Streaming section'; });
  await expect(labels(page)).toHaveText(['Streaming section']);
  await page.locator('.chat-history model-response-content .markdown').evaluate((body) => {
    body.insertAdjacentHTML('beforeend', '<h3>New streamed heading</h3>');
  });
  await expect(labels(page)).toHaveText(['Streaming section', 'New streamed heading']);
  await page.locator('.chat-history > .conversation-container').evaluate((el) => el.replaceWith(el.cloneNode(true)));
  await expect(page.locator('.toc-group')).toHaveCount(1);
  await expect(page.locator('.toc-group-prompt')).toHaveText('Explain this topic');
  await page.locator('.chat-history model-response-content').evaluate((el) => {
    const replacement = el.cloneNode(true);
    replacement.querySelector('message-content').id = 'message-content-id-r_replacement';
    replacement.querySelector('.markdown').innerHTML = '<h2>Regenerated section</h2>';
    el.replaceWith(replacement);
  });
  await expect(labels(page)).toHaveText(['Regenerated section']);
  await expect(page.locator('.toc-group')).toHaveCount(1);
  await page.locator('.chat-history').evaluate((history) => {
    const hidden = history.firstElementChild.cloneNode(true);
    hidden.hidden = true;
    hidden.querySelector('h2').textContent = 'Hidden alternative';
    history.append(hidden);
  });
  await expect(labels(page)).toHaveText(['Regenerated section']);
  expect(errors).toEqual([]);
});

test('Gemini clears stale groups on SPA changes and discovers late history panes and attachment prompts', async ({ page }) => {
  const errors = await openGemini(page);
  await expect(page.locator('.toc-group')).toHaveCount(2);
  await page.locator('.chat-history').evaluate((pane) => {
    pane.innerHTML = '';
    history.pushState({}, '', '/app');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.toc-group')).toHaveCount(0);
  await page.locator('.chat-history').evaluate((pane, html) => {
    pane.outerHTML = `<infinite-scroller id="late-history">${html}</infinite-scroller>`;
    history.pushState({}, '', '/app/new-conversation');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, turn('attachment', 'Attachment analysis', ''));
  await expect(page.locator('.toc-group')).toHaveCount(0);
  await page.locator('#late-history').evaluate((pane) => {
    pane.setAttribute('data-test-id', 'chat-history-container');
    pane.querySelector('.query-text').remove();
    pane.querySelector('user-query-content').insertAdjacentHTML('afterbegin', '<div class="file-preview-container"><button>sample.pdf</button></div>');
  });
  await expect(page.locator('.toc-group')).toHaveCount(1);
  await expect(labels(page)).toHaveText(['Attachment analysis']);
  await expect(page.locator('.toc-group-prompt')).toHaveText('');
  expect(errors).toEqual([]);
});

test('Gemini isolated-world SPA transitions handle URL-before-DOM and DOM-before-URL updates', async ({ page }) => {
  const errors = await openGemini(page, turn('first', 'Old conversation'), true);
  await expect(labels(page)).toHaveText(['Old conversation']);
  await page.evaluate(() => history.pushState({}, '', '/app/next-conversation'));
  await page.waitForTimeout(200);
  await page.locator('.chat-history').evaluate((pane, html) => { pane.innerHTML = html; }, turn('next', 'Next conversation'));
  await expect(labels(page)).toHaveText(['Next conversation']);
  await page.locator('.chat-history').evaluate((pane, html) => { pane.innerHTML = html; }, turn('third', 'Third conversation'));
  await expect(labels(page)).toHaveText(['Third conversation']);
  // No popstate or DOM mutation accompanies the delayed router update.
  await page.evaluate(() => history.pushState({}, '', '/app/third-conversation'));
  await expect(page.locator('.toc-group')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Gemini widens responses, queries, and sibling composers within the available chat pane', async ({ page }) => {
  const errors = await openGemini(page, turn('width', 'Width section'));
  await page.addStyleTag({ content: `
    main,chat-window,.chat-container {display:block;width:100%;box-sizing:border-box}
    .chat-container {padding:0 24px} chat-window-content {display:contents}
    .conversation-container {width:100%;max-width:708px;margin:auto}
    model-response-content .markdown {width:100%;max-width:700px}
    .markdown > :is(p,h2,ul,blockquote,pre,.table-shell) {max-width:708px;margin-inline:auto}
    .markdown ul {padding-inline-start:40px;box-sizing:border-box}
    .markdown blockquote {border-inline-start:3px solid gray;padding-inline-start:16px}
    .table-shell {overflow-x:auto} .table-shell table {min-width:900px}
    user-query {width:100%;max-width:708px}
    .user-query-container,.query-content,.query-bubble-with-status {display:block;width:100%}
    .query-stack {display:flex;flex-direction:column}
    .query-content {margin-inline:52px 8px;display:flex}
    infinite-scroller.chat-history {overflow-x:hidden}
    .user-query-bubble-with-background {display:block;width:100%;max-width:452px;padding:20px 28px;box-sizing:border-box}
    input-container {display:block;padding:0 16px} .input-area-container {width:100%;max-width:660px;margin:auto}
    input-area-v2,rich-textarea {display:block;width:100%;box-sizing:border-box}
    rich-textarea {padding:0 14px} .ql-editor {width:100%;box-sizing:border-box}
    immersive-panel .conversation-container {width:300px} immersive-panel .input-area-container {width:280px}
  ` });
  await page.evaluate(() => {
    const history = document.querySelector('infinite-scroller.chat-history');
    const main = document.querySelector('main');
    const window = document.createElement('chat-window');
    window.innerHTML = '<div class="chat-container"><chat-window-content></chat-window-content><input-container><div class="input-area-container"><input-area-v2><rich-textarea><div class="ql-editor" contenteditable="true">Input</div></rich-textarea><button>Tools</button></input-area-v2></div></input-container></div>';
    window.querySelector('chat-window-content').append(history);
    const query = history.querySelector('user-query-content');
    query.className = 'user-query-container';
    query.innerHTML = '<div class="user-query-container query-stack"><div class="file-preview-container"><button>sample.pdf</button></div><div class="query-content"><div class="query-bubble-with-status"><span class="user-query-bubble-with-background"><span class="horizontal-container"><div class="query-text"><p class="query-text-line">A long question ' + 'x'.repeat(400) + '</p><p class="query-text-line">Second line<br>After a line break</p></div></span></span></div></div><div class="luminous-actions-container"><button>Edit</button></div></div>';
    history.querySelector('.markdown').insertAdjacentHTML('beforeend', '<ul><li>List item<ul><li>Nested item</li></ul></li></ul><blockquote>Quoted paragraph</blockquote><pre><code>' + 'x'.repeat(400) + '</code></pre><div class="table-shell"><table><tr><td>Wide table</td></tr></table></div>');
    main.replaceChildren(window);
    main.insertAdjacentHTML('beforeend', '<immersive-panel><div class="conversation-container">Canvas</div><input-container><div class="input-area-container">Canvas input</div></input-container></immersive-panel>');
  });
  const sizes = () => page.evaluate(() => {
    const width = (selector) => document.querySelector(selector).getBoundingClientRect().width;
    return {
      answer: width('chat-window model-response-content .markdown'), query: width('chat-window .query-text'),
      answerPadding: parseFloat(getComputedStyle(document.querySelector('chat-window .markdown')).paddingInlineStart),
      paragraph: width('chat-window .markdown > p'), heading: width('chat-window .markdown > h2'), list: width('chat-window .markdown > ul'),
      composer: width('chat-window .ql-editor'), composerBox: width('chat-window .input-area-container'),
      canvas: width('immersive-panel .conversation-container'), canvasInput: width('immersive-panel .input-area-container'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  });
  const expectQuestionContained = async () => {
    const bounds = await page.evaluate(() => {
      const pane = document.querySelector('infinite-scroller.chat-history');
      const query = pane.querySelector('user-query');
      const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; };
      const paneBox = pane.getBoundingClientRect();
      const text = query.querySelector('.query-text');
      const ranges = [...text.querySelectorAll('.query-text-line')].flatMap((line) => {
        const range = document.createRange(); range.selectNodeContents(line);
        return [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ left: r.left, right: r.right }));
      });
      return {
        clip: { left: paneBox.left + pane.clientLeft, right: paneBox.left + pane.clientLeft + pane.clientWidth },
        outer: box(query), bubble: box(query.querySelector('.user-query-bubble-with-background')), text: box(text), ranges,
        controls: [...query.querySelectorAll('button')].map(box)
      };
    });
    for (const box of [bounds.outer, bounds.bubble, bounds.text, ...bounds.controls]) {
      expect(box.left).toBeGreaterThanOrEqual(bounds.clip.left - 1);
      expect(box.right).toBeLessThanOrEqual(bounds.clip.right + 1);
    }
    for (const range of bounds.ranges) {
      expect(range.left).toBeGreaterThanOrEqual(bounds.text.left - 1);
      expect(range.right).toBeLessThanOrEqual(bounds.text.right + 1);
    }
    expect(bounds.outer.right - bounds.bubble.right).toBeCloseTo(8, 0);
  };
  const baseline = await page.evaluate(() => {
    document.body.classList.remove('chatgpt-toc-gemini-wide');
    const width = (selector) => document.querySelector(selector).getBoundingClientRect().width;
    const result = { answer: width('chat-window model-response-content .markdown'), query: width('chat-window .query-text'), composer: width('chat-window .ql-editor') };
    document.body.classList.add('chatgpt-toc-gemini-wide');
    return result;
  });
  const pinned = await sizes();
  await expectQuestionContained();
  for (const field of ['answer', 'query', 'composer']) expect(pinned[field]).toBeGreaterThan(baseline[field] + 100);
  expect(pinned.answerPadding).toBe(32);
  for (const field of ['paragraph', 'heading', 'list']) expect(pinned[field]).toBeCloseTo(pinned.answer - 64, 0);
  expect(await page.locator('chat-window .markdown > ul').evaluate((el) => getComputedStyle(el).paddingInlineStart)).toBe('40px');
  expect(await page.locator('chat-window .markdown ul ul').evaluate((el) => getComputedStyle(el).paddingInlineStart)).toBe('40px');
  expect(await page.locator('chat-window .markdown > blockquote').evaluate((el) => ({ padding: getComputedStyle(el).paddingInlineStart, border: getComputedStyle(el).borderInlineStartWidth }))).toEqual({ padding: '16px', border: '3px' });
  expect(pinned).toMatchObject({ canvas: 300, canvasInput: 280, overflow: false });
  await page.locator('.toc-pin').click();
  await expect(page.locator('body')).not.toHaveClass(/chatgpt-toc-open/);
  await expect.poll(async () => (await sizes()).answer).toBeGreaterThan(pinned.answer + 150);
  expect((await sizes()).paragraph).toBeGreaterThan(pinned.paragraph + 150);
  expect((await sizes()).answerPadding).toBe(32);
  expect((await sizes()).composer).toBeGreaterThan(pinned.composer + 150);
  await expectQuestionContained();
  await page.setViewportSize({ width: 640, height: 900 });
  await expect.poll(async () => (await sizes()).overflow).toBe(false);
  expect((await sizes()).composerBox).toBeLessThan(640);
  await expectQuestionContained();
  expect((await sizes()).answerPadding).toBe(16);
  for (const field of ['paragraph', 'heading', 'list']) expect((await sizes())[field]).toBeCloseTo((await sizes()).answer - 32, 0);
  expect(await page.locator('chat-window .markdown pre').evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto')).toBe(true);
  expect(await page.locator('chat-window .table-shell').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.mouse.move(639, 400);
  await page.locator('.toc-pin').click();
  await expect(page.locator('body')).toHaveClass(/chatgpt-toc-open/);
  expect((await sizes()).answerPadding).toBe(16);
  expect((await sizes()).paragraph).toBeCloseTo((await sizes()).answer - 32, 0);
  expect((await sizes()).overflow).toBe(false);
  await expectQuestionContained();
  await page.setViewportSize({ width: 700, height: 900 });
  expect((await sizes()).answerPadding).toBe(16);
  await page.setViewportSize({ width: 701, height: 900 });
  expect((await sizes()).answerPadding).toBe(32);
  await page.evaluate(() => {
    history.pushState({}, '', '/notebook/fixture');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('body')).not.toHaveClass(/chatgpt-toc-gemini-wide/);
  expect(await page.locator('chat-window .markdown > p').evaluate((el) => getComputedStyle(el).maxWidth)).toBe('708px');
  expect((await sizes()).answerPadding).toBe(0);
  expect(errors).toEqual([]);
});
