const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const labels = (page) => page.locator('.toc-item .toc-text');
const item = (page, text) => page.locator('.toc-item').filter({ hasText: new RegExp(`^${text}$`) });
const turn = (id, body, prompt = 'Original prompt') => `<article data-turn-key="${id}">
  <div data-message-author-role="user"><div class="whitespace-pre-wrap">${prompt}</div></div>
  <div data-message-author-role="assistant" data-id="${id}">${body}</div></article>`;
const documentBody = '<h1>Document title</h1><h2>Summary</h2><p style="height:1100px">Body</p><h2 id="details">Details</h2><p style="height:800px">End</p>';
const card = (state = '') => `<section data-oai-writing-block-surface class="group/writing-block-surface">
  <div id="document-region" ${state}><div data-markdown-copy-content><div class="ProseMirror">${documentBody}</div></div></div>
  <button id="disclosure" aria-controls="document-region" aria-expanded="${state ? 'false' : 'true'}">Expand document</button></section>`;

async function openFixture(page, body, expectedGroups = (body.match(/data-id=/g) || []).length, setup) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('https://chatgpt.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><title>Lifecycle fixture</title><style>
      body{margin:0} #thread{position:fixed;top:40px;left:0;width:800px;height:500px;overflow-y:auto}
      [hidden]{display:none!important} h1,h2,p{margin:20px 0}
      </style></head><body><div id="app"><main><div id="thread" data-app-action-timeline-scroll>${body}</div></main></div></body></html>`
  }));
  await page.goto('https://chatgpt.com/c/fixture');
  if (setup) await page.evaluate(setup);
  await page.addStyleTag({ path: path.join(root, 'styles.css') });
  for (const script of manifest.content_scripts[0].js) {
    if (script === 'content.js') {
      await page.evaluate(() => {
        globalThis.__reconciles = [];
        const reconcile = TOCNavigator.conversationMethods.reconcileAssistantTurn;
        const original = reconcile.value;
        reconcile.value = function (assistant, ...args) {
          __reconciles.push(assistant?.getAttribute('data-id'));
          return original.call(this, assistant, ...args);
        };
        globalThis.__destinations = [];
        const scroll = TOCNavigator.navigationMethods.scrollToDestination;
        const originalScroll = scroll.value;
        scroll.value = function (destination, ...args) {
          __destinations.push(destination.id || TOCNavigator.getOutlineText(destination));
          return originalScroll.call(this, destination, ...args);
        };
      });
    }
    await page.addScriptTag({ path: path.join(root, script) });
  }
  if (expectedGroups !== null) await expect(page.locator('.toc-group')).toHaveCount(expectedGroups);
  return errors;
}

test('visible and assistant-only roots and nested legacy message IDs select distinct responses', async ({ page }) => {
  const hidden = `<div aria-hidden="true" data-chatgpt-conversation-selection-target="old" data-thread-find-target="conversation">${turn('old-1', '<h2>Hidden one</h2>')}${turn('old-2', '<h2>Hidden two</h2>')}</div>`;
  const visible = `<div data-chatgpt-conversation-selection-target="current" data-thread-find-target="conversation">${turn('current', '<h2>Current answer</h2>')}</div>`;
  const errors = await openFixture(page, hidden + visible, 1, () => document.getElementById('thread').removeAttribute('id'));
  await expect(labels(page)).toHaveText(['Current answer']);
  errors.push(...await openFixture(page, '<div data-message-author-role="assistant" data-id="only"><h2>Assistant only</h2></div>', null));
  await expect.soft(labels(page)).toHaveText(['Assistant only']);
  const wrapper = (id, text) => `<div data-chatgpt-search-unit-key="${id}"><h4 data-conversation-role="assistant">Assistant</h4><div data-message-author-role="assistant" data-message-id="${id}" data-id="${id}"><h2>${text}</h2></div></div>`;
  errors.push(...await openFixture(page, `<article data-turn-key="shared">${wrapper('answer1', 'First answer')}${wrapper('answer2', 'Second answer')}</article>`, null));
  await expect.soft(labels(page)).toHaveText(['First answer', 'Second answer']);
  expect(errors).toEqual([]);
});

test('late user roles correct inherited prompts while same-ID prompt remounts retain resolved labels', async ({ page }) => {
  const body = `<article data-turn-key="first"><div id="first-user" data-message-id="u1" data-message-author-role="user"><div class="whitespace-pre-wrap">First resolved</div></div><div data-id="a1" data-message-author-role="assistant"><h2>First answer</h2></div></article>
    <article data-turn-key="second"><div id="late-user" data-message-id="u2"><div class="whitespace-pre-wrap">Second</div></div><div data-id="a2" data-message-author-role="assistant"><h2>Second answer</h2></div></article>`;
  const errors = await openFixture(page, body);
  await expect(page.locator('.toc-group-prompt').first()).toHaveText('First resolved');
  await page.locator('#late-user').evaluate((user) => user.setAttribute('data-message-author-role', 'user'));
  await expect.soft(page.locator('.toc-group-prompt')).toHaveText(['First resolved', 'Second']);
  await page.locator('#first-user').evaluate((user) => {
    const remount = user.cloneNode(true);
    remount.querySelector('.whitespace-pre-wrap').textContent = 'Remounted replacement text';
    user.replaceWith(remount);
  });
  await page.waitForTimeout(200);
  await expect(page.locator('.toc-group-prompt').first()).toHaveText('First resolved');
  await expect(labels(page)).toHaveText(['First answer', 'Second answer']);
  expect(errors).toEqual([]);
});

test('hidden connected responses disappear while virtualized history retains A B C order', async ({ page }) => {
  const errors = await openFixture(page, turn('a', '<h2>A</h2>') + turn('b', '<h2>B</h2>') + turn('c', '<h2>C</h2>'));
  await expect(labels(page)).toHaveText(['A', 'B', 'C']);
  await page.locator('[data-id="a"]').evaluate((assistant) => assistant.hidden = true);
  await page.locator('#thread').evaluate((thread, added) => thread.insertAdjacentHTML('beforeend', added), turn('d', '<h2>D</h2>'));
  await expect.soft(labels(page)).toHaveText(['B', 'C', 'D']);
  // Connected hidden content is different from DOM virtualization.
  await page.locator('[data-id="a"]').evaluate((assistant) => assistant.hidden = false);
  await expect(labels(page)).toHaveText(['A', 'B', 'C', 'D']);
  await page.locator('[data-turn-key="d"]').evaluate((entry) => entry.hidden = true);
  await expect.soft(labels(page)).toHaveText(['A', 'B', 'C']);
  errors.push(...await openFixture(page, turn('a', '<h2>A</h2>') + turn('b', '<h2>B</h2>') + turn('c', '<h2>C</h2>')));
  await page.locator('[data-turn-key="a"]').evaluate((entry) => entry.remove());
  await expect(labels(page)).toHaveText(['A', 'B', 'C']);
  await page.waitForTimeout(200);
  await page.locator('[data-turn-key="b"]').evaluate((entry) => entry.remove());
  await page.waitForTimeout(200);
  await expect(labels(page)).toHaveText(['A', 'B', 'C']);
  expect(errors).toEqual([]);
});

test('feed sources exclude dialog previews and composer drafts', async ({ page }) => {
  const article = (id, label) => `<article data-message-id="${id}"><div data-message-id="${id}" data-id="${id}"><h2>${label}</h2><p>Body</p></div></article>`;
  const body = article('normal', 'Normal article') + `<div role="dialog">${article('preview', 'Dialog preview')}</div><div data-composer-markdown>${article('draft', 'Composer draft')}</div>`;
  const errors = await openFixture(page, body, 1, () => document.getElementById('thread').removeAttribute('id'));
  await expect(labels(page)).toHaveText(['Normal article']);
  await expect(page.locator('.toc-group')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('scroll-marker conversations discover staged bodies before role markers and message IDs arrive', async ({ page }) => {
  const user = (id, text) => `<div data-chatgpt-search-unit-key="${id}:user"><div data-user-message-bubble="true">${text}</div></div>`;
  const body = user('one', 'First staged prompt') + '<div id="staged-one" data-chatgpt-search-unit-key="one:assistant"><div data-markdown-text-style="assistant-message"><h2>First staged answer</h2></div></div>' +
    user('two', 'Second staged prompt') + '<div id="staged-two" data-chatgpt-search-unit-key="two:assistant"></div>';
  const errors = await openFixture(page, body, 1, () => document.getElementById('thread').removeAttribute('id'));
  await expect(labels(page)).toHaveText(['First staged answer']);
  await page.locator('#staged-two').evaluate((unit) => unit.innerHTML = '<div data-markdown-text-style="assistant-message"><h2>Second staged answer</h2></div>');
  await expect(labels(page)).toHaveText(['First staged answer', 'Second staged answer']);
  await expect(page.locator('.toc-group-prompt')).toHaveText(['First staged prompt', 'Second staged prompt']);
  await page.evaluate(() => {
    for (const [index, id] of ['staged-one', 'staged-two'].entries()) {
      const unit = document.getElementById(id);
      unit.setAttribute('data-chatgpt-search-message-ids', `staged-answer-${index}`);
      unit.insertAdjacentHTML('afterbegin', '<h4 data-conversation-role="assistant">Assistant</h4>');
    }
    for (const unit of document.querySelectorAll('[data-chatgpt-search-unit-key$=":user"]')) {
      unit.setAttribute('data-chatgpt-search-message-ids', `${unit.dataset.chatgptSearchUnitKey}-id`);
    }
  });
  await page.waitForTimeout(200);
  await expect(page.locator('.toc-group')).toHaveCount(2);
  await expect(labels(page)).toHaveText(['First staged answer', 'Second staged answer']);
  await expect(page.locator('.toc-group-prompt')).toHaveText(['First staged prompt', 'Second staged prompt']);
  expect(errors).toEqual([]);
});

test('same-conversation root remount retains virtualized A B C history', async ({ page }) => {
  const errors = await openFixture(page, turn('a', '<h2>A</h2>') + turn('b', '<h2>B</h2>') + turn('c', '<h2>C</h2>'), 3, () => {
    document.getElementById('thread').setAttribute('data-chatgpt-conversation-selection-target', 'history-fixture');
    document.getElementById('thread').setAttribute('data-thread-find-target', 'conversation');
  });
  await expect(labels(page)).toHaveText(['A', 'B', 'C']);
  await page.evaluate(() => {
    document.querySelector('[data-turn-key="a"]').remove();
    document.querySelector('[data-turn-key="b"]').remove();
  });
  await page.waitForTimeout(200);
  await expect(labels(page)).toHaveText(['A', 'B', 'C']);
  await page.locator('#thread').evaluate((thread) => thread.replaceWith(thread.cloneNode(true)));
  await page.waitForTimeout(200);
  await expect(page.locator('#thread [data-message-author-role="assistant"]')).toHaveCount(1);
  await expect(page.locator('.toc-group')).toHaveCount(3);
  await expect(labels(page)).toHaveText(['A', 'B', 'C']);
  expect(errors).toEqual([]);
});

test('regenerated answer replaces cached old message and same-ID remount stays unique', async ({ page }) => {
  const errors = await openFixture(page, `<article data-turn-key="regeneration"><div data-message-author-role="user"><div class="whitespace-pre-wrap">Regenerate this answer</div></div><div data-message-author-role="assistant" data-message-id="old" data-id="old"><h2>Old answer</h2></div></article>`);
  await expect(labels(page)).toHaveText(['Old answer']);
  await page.locator('[data-turn-key="regeneration"]').evaluate((entry) => {
    entry.querySelector('[data-message-author-role="assistant"]').remove();
    entry.insertAdjacentHTML('beforeend', '<div data-message-author-role="assistant" data-message-id="new" data-id="new"><h2>New answer</h2></div>');
  });
  await expect(labels(page)).toHaveText(['New answer']);
  await expect(page.locator('.toc-group')).toHaveCount(1);
  await expect(page.locator('.toc-group-prompt')).toHaveText(['Regenerate this answer']);
  await page.locator('[data-message-id="new"]').evaluate((assistant) => {
    const replacement = assistant.cloneNode(true);
    replacement.querySelector('h2').textContent = 'Remounted new answer';
    assistant.replaceWith(replacement);
  });
  await expect(labels(page)).toHaveText(['Remounted new answer']);
  await expect(page.locator('.toc-group')).toHaveCount(1);
  expect(errors).toEqual([]);
});

async function installDelayedExpansion(page) {
  await page.evaluate(() => {
    globalThis.__expansionFinished = false;
    document.getElementById('disclosure').addEventListener('click', (event) => {
      const region = document.getElementById('document-region');
      event.currentTarget.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        region.removeAttribute('hidden');
        region.removeAttribute('aria-hidden');
        region.removeAttribute('inert');
        region.replaceChildren(...[...region.childNodes].map((node) => node.cloneNode(true)));
        globalThis.__expansionFinished = true;
      }, 200);
    });
  });
}

async function expectAligned(page, selector) {
  await expect.poll(() => page.locator(selector).evaluate((heading) => Math.abs(
    heading.getBoundingClientRect().top - document.getElementById('thread').getBoundingClientRect().top -
    TOCNavigator.getNavigationOffset(innerHeight)
  ))).toBeLessThanOrEqual(2);
}

for (const state of ['hidden', 'aria-hidden="true"', 'inert']) {
  test(`initially folded document (${state}) retains its prompt and survives delayed remount`, async ({ page }) => {
    const errors = await openFixture(page, turn('original', card(state)));
    await installDelayedExpansion(page);
    await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details']);
    await expect(page.locator('.toc-group-prompt')).toHaveText('Original prompt');
    await page.evaluate(() => {
      globalThis.__outlineSnapshots = [];
      const observer = new MutationObserver(() => __outlineSnapshots.push(
        [...document.querySelectorAll('.toc-item .toc-text')].map((node) => node.textContent)));
      observer.observe(document.querySelector('.toc-content'), { childList: true, subtree: true, characterData: true });
    });
    await item(page, 'Details').click();
    await expect(page.locator('#disclosure')).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.evaluate(() => __expansionFinished)).toBe(true);
    await expectAligned(page, '#details');
    await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details']);
    expect(await page.evaluate(() => __outlineSnapshots.every((snapshot) =>
      snapshot.join('|') === 'Document title|Summary|Details'))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('raw, rich, partial revision, repeated folds and real heading deletion remain consistent', async ({ page }) => {
  const raw = '<section data-oai-writing-block-surface class="group/writing-block-surface"><div id="document-region"><div id="copy" data-markdown-copy-content># Document title\n## Summary\nBody\n## Details\nEnd</div></div><button id="disclosure" aria-controls="document-region" aria-expanded="true">Expand</button></section>';
  const errors = await openFixture(page, turn('original', raw));
  await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details']);
  await page.locator('#copy').evaluate((copy, html) => { copy.innerHTML = `<div class="ProseMirror">${html}</div>`; }, documentBody);
  await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details']);
  await installDelayedExpansion(page);
  await page.evaluate(() => {
    document.getElementById('document-region').setAttribute('aria-hidden', 'true');
    document.getElementById('document-region').setAttribute('inert', '');
    document.getElementById('disclosure').setAttribute('aria-expanded', 'false');
  });
  await page.locator('#thread').evaluate((thread, revision) => thread.insertAdjacentHTML('beforeend', revision),
    turn('revision', '<h2>Revised paragraph</h2><div hidden><h2>Hidden pane</h2></div><div aria-hidden="true"><h2>Hidden aria pane</h2></div><button><h2>Preview control</h2></button><div class="PagePreview-fixture"><h2>Preview heading</h2></div><div data-composer-markdown><h2>Composer heading</h2></div>', 'Revise paragraph'));
  await expect(page.locator('.toc-group')).toHaveCount(2);
  await expect(page.locator('.toc-group-prompt')).toHaveText(['Original prompt', 'Revise paragraph']);
  await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details', 'Revised paragraph']);
  await item(page, 'Details').click();
  await expect.poll(() => page.evaluate(() => __expansionFinished)).toBe(true);
  await expectAligned(page, '#details');
  await page.evaluate(() => {
    document.getElementById('document-region').hidden = true;
    document.getElementById('disclosure').setAttribute('aria-expanded', 'false');
  });
  await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details', 'Revised paragraph']);
  await page.locator('#details').evaluate((heading) => heading.remove());
  await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Revised paragraph']);
  await expect(page.locator('.toc-group')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('ordinary token appends and text-node updates never reconcile unrelated turns', async ({ page }) => {
  const errors = await openFixture(page, turn('stable', '<h2>Stable heading</h2><p>Stable text</p>') +
    turn('stream', '<h2>Stream heading</h2><p id="tokens">Initial token</p>', 'Stream prompt'));
  await expect(labels(page)).toHaveText(['Stable heading', 'Stream heading']);
  await page.evaluate(() => {
    __reconciles.length = 0;
    globalThis.__tokenUpdates = 0;
    globalThis.__tokenTimer = setInterval(() => {
      const paragraph = document.getElementById('tokens');
      paragraph.append(` token ${++__tokenUpdates}`);
      paragraph.firstChild.data = `Updated ${__tokenUpdates}`;
    }, 25);
  });
  try {
    await expect.poll(() => page.evaluate(() => __tokenUpdates)).toBeGreaterThanOrEqual(20);
    await expect(page.locator('#tokens')).toContainText('Updated');
    await expect(labels(page)).toHaveText(['Stable heading', 'Stream heading']);
    expect(await page.evaluate(() => __reconciles.filter((id) => id !== 'stream'))).toEqual([]);
  } finally {
    await page.evaluate(() => clearInterval(__tokenTimer));
  }
  // The observer must still discover a genuine outline mutation after the stream.
  await page.locator('[data-id="stream"]').evaluate((assistant) => assistant.insertAdjacentHTML('beforeend', '<h2>New section</h2>'));
  await expect(labels(page)).toHaveText(['Stable heading', 'Stream heading', 'New section']);
  expect(errors).toEqual([]);
});

for (const cancellation of ['new click', 'conversation change']) {
  test(`a ${cancellation} cancels delayed document navigation`, async ({ page }) => {
    const errors = await openFixture(page, turn('original', card('aria-hidden="true" inert')) +
      turn('next', '<h2 id="next-heading">Next answer</h2><p style="height:1200px">Next body</p>', 'Next prompt'));
    await installDelayedExpansion(page);
    await expect(labels(page)).toHaveText(['Document title', 'Summary', 'Details', 'Next answer']);
    await item(page, 'Details').click();
    await expect(page.locator('#disclosure')).toHaveAttribute('aria-expanded', 'true');
    // Observe only scroll requests after the newer user action.
    await page.evaluate(() => { __destinations.length = 0; });
    if (cancellation === 'new click') {
      await item(page, 'Next answer').click();
      await expectAligned(page, '#next-heading');
    } else {
      await page.locator('#thread').evaluate((thread, replacement) => {
        const next = thread.cloneNode(false);
        next.innerHTML = replacement;
        thread.replaceWith(next);
        history.pushState({}, '', '/c/next-fixture');
        dispatchEvent(new PopStateEvent('popstate'));
      }, turn('replacement', '<div style="height:200px"></div><h2 id="replacement-heading">Replacement answer</h2><p style="height:1200px">Replacement body</p>', 'Replacement prompt'));
      await expect(labels(page)).toHaveText(['Replacement answer']);
      await item(page, 'Replacement answer').click();
      await expectAligned(page, '#replacement-heading');
    }
    await expect.poll(() => page.evaluate(() => __expansionFinished)).toBe(true);
    // Give queued recovery animation frames time to expose a stale scroll.
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __destinations)).not.toContain('details');
    await expectAligned(page, cancellation === 'new click' ? '#next-heading' : '#replacement-heading');
    await expect(labels(page)).toHaveText(cancellation === 'new click'
      ? ['Document title', 'Summary', 'Details', 'Next answer'] : ['Replacement answer']);
    expect(errors).toEqual([]);
  });
}
