const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

async function openConversationFixture(page) {
  const root = path.resolve(__dirname, '..');
  const assets = new Map([
    ['/c/fixture', path.join(__dirname, 'browser-fixture.html')],
    ...['content.js', 'styles.css', 'src/shared.js', 'src/source-adapters.js', 'src/sidebar.js', 'src/conversation.js', 'src/navigation.js', 'src/active-tracker.js']
      .map((name) => [`/${name}`, path.join(root, name)])
  ]);
  await page.route('https://chatgpt.com/**', async (route) => {
    const file = assets.get(new URL(route.request().url()).pathname);
    if (!file) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/javascript' });
  });
  await page.goto('https://chatgpt.com/c/fixture');
}

test('browser fixture completes its anonymized conversation checks', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await openConversationFixture(page);

  const results = page.locator('#results');
  await expect(results).toHaveClass(/\b(pass|fail)\b/, { timeout: 10_000 });
  const output = await results.innerText();
  expect(output, output).toMatch(/^ALL \d+ BROWSER TESTS PASSED/);
  await expect(results).toHaveClass(/\bpass\b/);
  await expect(page).toHaveTitle(/PASS - Prompt Outline Navigator browser fixture/);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('reverse-scroll TOC navigation stays at the selected heading and survives an absent thread', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openConversationFixture(page);
  await expect(page.locator('#results')).toHaveClass(/\bpass\b/);

  await page.evaluate(() => {
    document.getElementById('thread').hidden = true;
    const thread = document.querySelector('[data-chatgpt-conversation-selection-target]');
    thread.hidden = false;
    const scroller = thread.querySelector('[data-app-action-timeline-scroll]');
    scroller.style.cssText = 'height:600px;overflow-y:auto;display:flex;flex-direction:column-reverse';
    const content = thread.querySelector('[data-thread-user-message-navigation-content]');
    content.style.flexShrink = '0';
    const assistant = thread.querySelector('[data-markdown-text-style="assistant-message"]');
    assistant.replaceChildren();
    for (const label of ['Upper destination', 'Lower destination']) {
      const heading = document.createElement('h2');
      heading.textContent = label;
      const spacer = document.createElement('p');
      spacer.style.height = '1400px';
      spacer.textContent = 'Conversation content';
      assistant.append(heading, spacer);
    }
    scroller.scrollTop = 0;
  });

  for (const label of ['Upper destination', 'Lower destination', 'Upper destination']) {
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-action-timeline-scroll]');
      globalThis.__motionSamples = [scroller.scrollTop];
      const capture = () => {
        globalThis.__motionSamples.push(scroller.scrollTop);
        globalThis.__motionFrame = requestAnimationFrame(capture);
      };
      globalThis.__motionFrame = requestAnimationFrame(capture);
    });
    await page.locator('.toc-item').filter({ hasText: label }).click();
    const alignment = () => page.evaluate((text) => {
      const scroller = document.querySelector('[data-app-action-timeline-scroll]');
      const heading = [...document.querySelectorAll('[data-markdown-text-style] h2')]
        .find((element) => element.textContent === text);
      return {
        scrollTop: scroller.scrollTop,
        delta: heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top
          - TOCNavigator.getNavigationOffset(innerHeight)
      };
    }, label);
    await expect.poll(async () => Math.abs((await alignment()).delta)).toBeLessThanOrEqual(2);
    const position = (await alignment()).scrollTop;
    const samples = await page.evaluate(() => {
      cancelAnimationFrame(globalThis.__motionFrame);
      return globalThis.__motionSamples;
    });
    const start = samples[0];
    expect(samples.some((top) => top > Math.min(start, position) + 2 && top < Math.max(start, position) - 2), JSON.stringify(samples)).toBe(true);
    expect(position).toBeLessThan(0);
    await page.waitForTimeout(1000);
    expect(Math.abs((await alignment()).scrollTop - position)).toBeLessThanOrEqual(2);
  }

  // A newer click must replace both the old animation and its delayed correction.
  await page.evaluate(async () => {
    document.querySelectorAll('.toc-item')[1].click();
    await new Promise(requestAnimationFrame);
    document.querySelectorAll('.toc-item')[0].click();
  });
  await expect.poll(() => page.evaluate(() => {
    const scroller = document.querySelector('[data-app-action-timeline-scroll]');
    const heading = document.querySelector('[data-markdown-text-style] h2');
    return Math.abs(heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - TOCNavigator.getNavigationOffset(innerHeight));
  })).toBeLessThanOrEqual(2);
  await page.waitForTimeout(400);
  const interruptedPosition = await page.evaluate(async () => {
    document.querySelectorAll('.toc-item')[1].click();
    await new Promise(requestAnimationFrame);
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    const scroller = document.querySelector('[data-app-action-timeline-scroll]');
    scroller.scrollTo({ top: -500, behavior: 'auto' });
    return scroller.scrollTop;
  });
  await page.waitForTimeout(400);
  expect(await page.locator('[data-app-action-timeline-scroll]').evaluate((e) => e.scrollTop)).toBeCloseTo(interruptedPosition, 0);

  const retainedGroups = await page.locator('.toc-group').count();
  await page.evaluate(() => {
    document.querySelector('[data-chatgpt-conversation-selection-target]').remove();
    document.getElementById('thread').remove();
    window.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.toc-group')).toHaveCount(retainedGroups);
  await expect(page.locator('#chatgpt-toc-sidebar')).not.toHaveAttribute('hidden');
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
});

for (const preference of [true, false]) {
  test(`temporary page and dialog suspension preserves the ${preference ? 'open' : 'closed'} preference`, async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.__tocWrites = [];
      globalThis.chrome = { storage: { local: {
        get: async () => ({ sidebarVisible: true }),
        set: async (value) => globalThis.__tocWrites.push(value)
      } } };
    });
    await openConversationFixture(page);
    await expect(page.locator('#results')).toHaveClass(/\bpass\b/);
    if (!preference) await page.locator('.toc-close').click();
    await page.evaluate(() => { globalThis.__tocWrites = []; });
    const assertState = async (available) => {
      await expect.poll(() => page.evaluate(() => ({
        sidebarHidden: document.querySelector('#chatgpt-toc-sidebar').hidden,
        toggleHidden: document.querySelector('#chatgpt-toc-toggle').hidden,
        reserve: document.body.classList.contains('chatgpt-toc-open'),
        wide: document.body.classList.contains('chatgpt-toc-conversation')
      }))).toEqual({ sidebarHidden: !available, toggleHidden: !available || preference, reserve: available && preference, wide: available });
    };
    await assertState(true);
    const rootMarkerWrites = await page.evaluate(async () => {
      let writes = 0;
      const observer = new MutationObserver((records) => { writes += records.length; });
      observer.observe(document.querySelector('.chatgpt-toc-app-root'), { attributes: true, attributeFilter: ['class'] });
      for (let frame = 0; frame < 5; frame++) await new Promise(requestAnimationFrame);
      observer.disconnect();
      return writes;
    });
    expect(rootMarkerWrites).toBe(0);
    for (const pathname of ['/settings/general-settings', '/g/g-p-project/project', '/workspace/agents/task', '/']) {
      await page.evaluate((url) => { document.getElementById('thread').hidden = url !== '/settings/general-settings'; history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, pathname);
      await assertState(false);
      await page.evaluate(() => { document.getElementById('thread').hidden = false; history.pushState({}, '', '/g/g-p-project/c/fixture'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await assertState(true);
    }
    await page.evaluate(() => { history.pushState({}, '', '/new/unknown/conversation-route'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await assertState(true);
    await page.evaluate(() => {
      const dialog = document.createElement('div');
      dialog.id = 'modal-probe'; dialog.setAttribute('role', 'dialog');
      dialog.style.cssText = 'position:fixed;inset:0;background:white';
      document.body.append(dialog);
    });
    await assertState(false);
    await page.evaluate(() => { document.getElementById('modal-probe').hidden = true; });
    await assertState(true);
    // Zero prompts and a temporary root replacement are still a supported conversation.
    await page.evaluate(() => { document.getElementById('thread').replaceChildren(); });
    await assertState(true);
    await page.evaluate(() => { document.getElementById('thread').remove(); });
    await assertState(true);
    expect(await page.evaluate(() => globalThis.__tocWrites)).toEqual([]);
  });
}

test('initial composer widens independently of TOC and survives first-message rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openConversationFixture(page);
  await expect(page.locator('#results')).toHaveClass(/\bpass\b/);
  await page.evaluate(() => {
    document.getElementById('thread').hidden = true;
    const main = document.createElement('main');
    main.id = 'initial-composer-probe';
    main.style.cssText = 'width:100%;max-width:none;padding:0';
    main.innerHTML = '<div id="native-composer-cap" style="box-sizing:border-box;max-width:672px;width:100%;padding:20px;margin:auto"><div style="display:contents"><form data-chatgpt-composer data-composer-placement="home" style="height:50px"></form></div></div>';
    document.getElementById('app').append(main);
    history.pushState({}, '', '/project/initial');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const width = () => page.locator('#initial-composer-probe form').evaluate((e) => e.getBoundingClientRect().width);
  await expect.poll(width).toBe(960);
  await expect(page.locator('#chatgpt-toc-sidebar')).toHaveAttribute('hidden');
  await expect(page.locator('#chatgpt-toc-toggle')).toHaveAttribute('hidden');
  expect(await page.evaluate(() => document.body.classList.contains('chatgpt-toc-open'))).toBe(false);
  await page.evaluate(() => { document.getElementById('native-composer-cap').className = ''; });
  await expect.poll(width).toBe(960);
  await page.evaluate(() => {
    const dialog = document.createElement('div'); dialog.id = 'initial-modal';
    dialog.setAttribute('role', 'dialog'); dialog.style.cssText = 'position:fixed;inset:0'; document.body.append(dialog);
  });
  await expect.poll(width).toBe(632);
  await page.evaluate(() => { document.getElementById('initial-modal').remove(); });
  await expect.poll(width).toBe(960);
  // Simulate the DOM transition after the first message without posting anything.
  await page.evaluate(() => {
    document.getElementById('initial-composer-probe').remove();
    document.getElementById('thread').hidden = false;
    const form = document.createElement('form'); form.id = 'first-message-composer';
    form.setAttribute('data-chatgpt-composer', ''); form.setAttribute('data-composer-placement', 'thread');
    document.getElementById('thread').append(form);
    history.pushState({}, '', '/g/project/c/first-message'); window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('#chatgpt-toc-sidebar')).not.toHaveAttribute('hidden');
  expect(await page.evaluate(() => document.body.classList.contains('chatgpt-toc-wide'))).toBe(true);
  expect(await page.locator('#first-message-composer').evaluate((e) => getComputedStyle(e).getPropertyValue('--thread-content-max-width'))).toContain('min(80vw');
});

for (const kind of ['document', 'feed']) {
  test(`${kind} source detects its body on an unfamiliar URL and navigates both directions`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openConversationFixture(page);
    await expect(page.locator('#results')).toHaveClass(/\bpass\b/);
    await page.evaluate((mode) => {
      document.getElementById('thread').hidden = true;
      const main = document.createElement('main');
      main.id = 'adapter-fixture';
      const content = mode === 'document'
        ? '<section role="dialog"><div data-markdown-copy-content="true"><div class="ProseMirror" contenteditable="true"><h1>Document title</h1><h2>Upper destination</h2><p style="height:1200px">Document body</p><h2>Lower destination</h2><p style="height:1200px">Document end</p></div></div></section>'
        : '<article data-message-id="first"><button><h2>Quoted preview</h2></button><div data-message-id="first"><div data-content-search-unit-key="first"><div data-markdown-text-style="assistant-message"><h2>Upper destination</h2><p style="height:1200px">First message</p></div></div></div></article><article data-message-id="user"><div data-message-id="user"><div data-content-search-unit-key="user">Plain user message</div></div></article><article data-message-id="second"><div data-message-id="second"><div data-content-search-unit-key="second"><div data-markdown-text-style="assistant-message"><h2>Lower destination</h2><p style="height:1200px">Second message</p></div></div></div></article>';
      main.innerHTML = '<button><div class="ProseMirror"><h1>Card preview</h1></div></button><nav><h1>Navigation heading</h1></nav><div data-composer-markdown="true" class="ProseMirror"><h1>Composer heading</h1></div>' + (mode === 'feed' ? `<div class="messages-scroll" style="height:500px;overflow-y:auto">${content}</div>` : content);
      if (mode === 'document') main.querySelector('section').style.cssText = 'height:500px;overflow-y:auto';
      document.getElementById('app').append(main);
      history.pushState({}, '', `/new-content/${mode}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, kind);
    await expect(page.locator('.toc-group')).toHaveCount(kind === 'document' ? 1 : 3);
    await expect(page.locator('.toc-item')).toHaveCount(kind === 'document' ? 3 : 2);
    await expect(page.locator('#chatgpt-toc-sidebar')).not.toHaveAttribute('hidden');
    expect(await page.locator('#chatgpt-toc-sidebar').innerText()).not.toMatch(/Card preview|Quoted preview|Navigation heading|Composer heading/);
    for (const text of ['Upper destination', 'Lower destination', 'Upper destination']) {
      await page.locator('.toc-item').filter({ hasText: text }).click();
      await expect.poll(() => page.evaluate((label) => {
        const heading = [...document.querySelectorAll('#adapter-fixture h2')].find((e) => e.textContent === label);
        const scroller = document.querySelector('#adapter-fixture section,#adapter-fixture .messages-scroll') || document.getElementById('adapter-fixture');
        return Math.abs(heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop - TOCNavigator.getNavigationOffset(innerHeight));
      }, text)).toBeLessThanOrEqual(2);
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [1280, 1920]) {
  test(`layout fixture preserves content width and top clearance at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pathToFileURL(path.resolve(__dirname, 'layout-fixture.html')).href);
    const results = page.locator('#results');
    await expect(results).toHaveAttribute('data-result', 'PASS');
    expect(JSON.parse(await results.innerText()).passed).toBe(true);
  });

  test(`modern app shell and sibling composer respect the reserved width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pathToFileURL(path.resolve(__dirname, 'layout-fixture.html')).href);
    const dimensions = await page.evaluate(() => {
      const app = document.getElementById('app');
      app.replaceChildren();
      document.body.classList.add('chatgpt-toc-open', 'chatgpt-toc-conversation', 'chatgpt-toc-wide');
      const shell = document.createElement('div');
      shell.setAttribute('data-app-shell-frame', 'true');
      shell.style.width = '100vw';
      const titlebar = document.createElement('header');
      titlebar.setAttribute('data-app-shell-titlebar', 'true');
      titlebar.style.cssText = 'position:fixed;inset:0 0 auto;height:58px';
      shell.append(titlebar);
      const scroller = document.createElement('div');
      scroller.setAttribute('data-app-action-timeline-scroll', '');
      shell.append(scroller);
      app.append(shell);
      const createWrapper = () => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;box-sizing:border-box;padding:0 20px;margin:auto;max-width:calc(var(--thread-content-responsive-max-width, 800px) + 40px)';
        return wrapper;
      };
      const wrapper = createWrapper();
      wrapper.setAttribute('data-thread-user-message-navigation-content', 'true');
      const thread = document.createElement('div');
      thread.setAttribute('data-chatgpt-conversation-selection-target', 'true');
      thread.setAttribute('data-thread-find-target', 'conversation');
      wrapper.append(thread);
      scroller.append(wrapper);
      const footer = document.createElement('div');
      footer.setAttribute('data-thread-scroll-footer', 'true');
      const composerWrapper = createWrapper();
      const composer = document.createElement('form');
      composer.setAttribute('data-chatgpt-composer', '');
      composer.setAttribute('data-composer-placement', 'thread');
      composerWrapper.append(composer);
      footer.append(composerWrapper);
      scroller.append(footer);
      return {
        app: app.getBoundingClientRect().width,
        shell: shell.getBoundingClientRect().width,
        titlebarRight: titlebar.getBoundingClientRect().right,
        content: thread.getBoundingClientRect().width,
        composer: composer.getBoundingClientRect().width
      };
    });
    const wideWidth = Math.min(width * 0.8, width - 200 - 80);
    expect(dimensions.app).toBe(width - 200);
    expect(dimensions.shell).toBe(width - 200);
    expect(dimensions.titlebarRight).toBe(width - 200);
    expect(dimensions.content).toBeCloseTo(wideWidth, 0);
    expect(dimensions.composer).toBeCloseTo(wideWidth, 0);
  });
}
