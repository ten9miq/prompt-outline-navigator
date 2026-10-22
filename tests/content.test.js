const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = path.join(__dirname, '..', 'content.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const source = manifest.content_scripts[0].js
  .map((filePath) => fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8'))
  .join('\n');
const {
  ChatGPTTOC,
  SELECTORS,
  truncateText,
  getPromptText,
  pairConversationMessages,
  getNavigationOffset,
  findActiveTrackingTarget,
  findActiveGroupRange,
  isTocScrolledToEnd,
  findRemountedHeading,
  shouldPreserveDisconnectedGroup,
  getConversationIdentity,
  findConversationRoot,
  resolveDarkTheme,
  SIDEBAR_VISIBILITY_KEY
} = require(sourcePath);

test('TOC tail detection includes non-scrollable content and a small rounding margin', () => {
  assert.equal(isTocScrolledToEnd(0, 100, 200), true);
  assert.equal(isTocScrolledToEnd(92, 200, 100), true);
  assert.equal(isTocScrolledToEnd(91, 200, 100), false);
});

test('TOC updates follow the tail only when it was already visible', () => {
  const atTail = { scrollTop: 0, scrollHeight: 100, clientHeight: 200 };
  const tailContext = { tocContent: atTail, preserveTocScrollOnActiveUpdate: false };
  const tailState = ChatGPTTOC.prototype.captureTocScrollState.call(tailContext);
  atTail.scrollHeight = 320;
  ChatGPTTOC.prototype.restoreTocScrollState.call(tailContext, tailState);
  assert.equal(atTail.scrollTop, 320);
  assert.equal(tailContext.preserveTocScrollOnActiveUpdate, false);

  const browsing = { scrollTop: 40, scrollHeight: 500, clientHeight: 100 };
  const browsingContext = { tocContent: browsing, preserveTocScrollOnActiveUpdate: false };
  const browsingState = ChatGPTTOC.prototype.captureTocScrollState.call(browsingContext);
  browsing.scrollHeight = 650;
  ChatGPTTOC.prototype.restoreTocScrollState.call(browsingContext, browsingState);
  assert.equal(browsing.scrollTop, 40);
  assert.equal(browsingContext.preserveTocScrollOnActiveUpdate, true);
});

test('active tracking does not override a preserved TOC browsing position', () => {
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  const heading = {};
  const item = { hidden: false, classList };
  const group = { header: { classList }, content: { hidden: false } };
  let ensureCalls = 0;
  const context = {
    activeHeading: null,
    activeGroup: null,
    headingToTocItem: new WeakMap([[heading, item]]),
    preserveTocScrollOnActiveUpdate: true,
    ensureTocItemVisible: () => { ensureCalls += 1; }
  };

  ChatGPTTOC.prototype.setActive.call(context, heading, group);
  assert.equal(ensureCalls, 0);
});

test('active tracking restores a lost heading highlight for the current selection', () => {
  const createClassList = (initial = []) => {
    const classes = new Set(initial);
    return {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    };
  };
  const heading = {};
  const item = { hidden: false, classList: createClassList() };
  const group = {
    header: { classList: createClassList(['active']) },
    content: { hidden: false }
  };
  const context = {
    activeHeading: heading,
    activeGroup: group,
    headingToTocItem: new WeakMap([[heading, item]]),
    preserveTocScrollOnActiveUpdate: true,
    ensureTocItemVisible() {}
  };

  ChatGPTTOC.prototype.setActive.call(context, heading, group);
  assert.equal(item.classList.contains('active'), true);
  assert.equal(group.header.classList.contains('active'), true);
  assert.equal(group.header.classList.contains('active-fallback'), false);
});

test('prompt and heading edge-case strings remain plain text inputs', () => {
  const values = [
    '<h1>タグ',
    '<div>test</div>',
    'A & B',
    '"quoted"',
    '< > & " \'',
    '<script>alert(1)</script>',
    '日本語 English 🚀'
  ];
  for (const value of values) assert.equal(truncateText(value), value);
});

test('long prompts are bounded without changing shorter prompts', () => {
  assert.equal(truncateText(' x '), 'x');
  assert.equal(truncateText('a'.repeat(201)), `${'a'.repeat(200)}…`);
});

test('raw writing blocks expose Markdown headings without treating code as headings', () => {
  const { parseMarkdownHeadings } = require(sourcePath);
  const markdown = ['Title', '# Summary', '```md', '## Code sample', '```', '~~~', '# Also code', '~~~~',
    '    # Indented code', '> # Quoted', '\\# Escaped', '####### Not a heading', '## Details ##', '### 日本語 🚀'].join('\r\n');
  const headings = parseMarkdownHeadings(markdown);
  assert.deepEqual(headings.map(({ text, level }) => ({ text, level })), [
    { text: 'Summary', level: 1 }, { text: 'Details', level: 2 }, { text: '日本語 🚀', level: 3 }
  ]);
  for (const heading of headings) assert.match(markdown.slice(heading.start, heading.end), /^#{1,6} /);
});

test('observed user bubble takes precedence over wrapper labels and controls', () => {
  const prompt = { querySelector: (selector) => selector === SELECTORS.userPromptContent ? { textContent: 'Anonymous prompt' } : { textContent: 'Edit Delete' } };
  assert.equal(getPromptText(prompt), 'Anonymous prompt');
});

test('prompt labels use the message body without attachment card text', () => {
  const body = { textContent: 'Actual prompt text' };
  const prompt = {
    textContent: 'attached.mdFileActual prompt text',
    querySelector: (selector) => selector === SELECTORS.promptText ? body : null
  };
  const attachmentOnly = {
    textContent: 'attached.mdFile',
    querySelector: () => null
  };

  assert.equal(getPromptText(prompt), 'Actual prompt text');
  assert.equal(getPromptText(attachmentOnly), '');
});

test('assistant role marker is not collected as response content', () => {
  const marker = { hasAttribute: (name) => name === 'data-conversation-role' };
  const heading = { hasAttribute: () => false };
  const assistant = { isConnected: true, querySelectorAll: () => [marker, heading] };
  const added = [], maps = new WeakMap();
  const group = { headings: [], content: { append() {} } };
  const context = {
    captureTocScrollState: () => null, restoreTocScrollState() {}, getPromptIndexFromElement: () => null,
    nativeIndexToGroup: new Map(), turnToGroup: new Map([[assistant, group]]), headingToTocItem: maps,
    addHeading: (g, h) => { added.push(h); g.headings.push(h); maps.set(h, {}); }, updateHeading() {},
    refreshHeadingHierarchy() {}, scheduleActiveUpdate() {}
  };
  ChatGPTTOC.prototype.reconcileAssistantTurn.call(context, assistant);
  assert.deepEqual(added, [heading]); assert.deepEqual(group.headings, [heading]);
});

test('DOM-dependent selectors are centralized', () => {
  assert.match(SELECTORS.thread, /\[data-chatgpt-conversation-selection-target\]\[data-thread-find-target="conversation"\]/);
  assert.match(SELECTORS.userMessage, /\[data-user-message-bubble="true"\]/);
  assert.match(SELECTORS.assistantMessage, /\[data-chatgpt-search-unit-key\]:has\(\[data-conversation-role="assistant"\]\)/);
  assert.equal(SELECTORS.promptText, '.whitespace-pre-wrap');
  assert.match(SELECTORS.headings, /h1,h2,h3,h4,h5,h6/);
  assert.match(SELECTORS.conversationTurn, /\[data-turn-key\]/);
  assert.doesNotMatch(SELECTORS.stableTurn, /data-testid/);
  assert.equal(SELECTORS.conversationScroll, '[data-app-action-timeline-scroll]');
  assert.equal(SELECTORS.threadComposer, '[data-chatgpt-composer][data-composer-placement="thread"]');
  assert.equal(SELECTORS.nativeTocItem, undefined);
  assert.equal(SELECTORS.nativeTocActive, undefined);
});

test('conversation identity uses rendered id and falls back to route path', () => {
  assert.equal(getConversationIdentity({ querySelector: () => ({ getAttribute: () => 'fixture-conversation' }) }, '/ignored'), 'conversation:fixture-conversation');
  assert.equal(getConversationIdentity({ querySelector: () => null }, '/c/fixture-route'), 'path:/c/fixture-route');
  assert.equal(getConversationIdentity({ getAttribute: () => 'conversation-at-root' }, '/c/fixture-route'), 'conversation:conversation-at-root');
  assert.equal(getConversationIdentity({ getAttribute: () => 'true' }, '/c/fixture-route'), 'path:/c/fixture-route');
});

test('fallback conversation identity ignores hidden descendant conversation IDs', () => {
  const identity = (id, hidden) => ({ getClientRects: () => [1],
    getAttribute: (name) => name === 'data-chatgpt-selection-conversation-id' ? id : name === 'aria-hidden' && hidden ? 'true' : null });
  const old = identity('old', true), current = identity('current', false);
  const root = { querySelectorAll: () => [old, current], querySelector: () => old };
  assert.equal(getConversationIdentity(root), 'conversation:current');
});

test('visible conversation root wins over hidden or empty home roots', () => {
  const candidate = (visible, turns) => ({ getClientRects: () => ({ length: visible ? 1 : 0 }), querySelectorAll: (selector) => selector === SELECTORS.conversationTurn ? Array(turns).fill({}) : [] });
  const hidden = candidate(false, 4), empty = candidate(true, 0), populated = candidate(true, 2);
  const doc = { querySelectorAll: () => [hidden, empty, populated], defaultView: { getComputedStyle: (el) => ({ display: el.getClientRects().length ? 'block' : 'none' }) } };
  assert.equal(findConversationRoot(doc), populated);
});

test('modern turn key remains stable when an assistant is remounted', () => {
  const makeAssistant = () => ({ closest: () => ({ getAttribute: (name) => name === 'data-turn-key' ? 'fixture-key' : null }) });
  assert.equal(ChatGPTTOC.prototype.getStableTurnKey.call({}, makeAssistant()), 'turn:fixture-key');
  assert.equal(ChatGPTTOC.prototype.getStableTurnKey.call({}, makeAssistant()), 'turn:fixture-key');
});

test('numeric turn test ids are not used as stable prompt identity', () => {
  const assistant = { closest: () => ({ getAttribute: (name) => name === 'data-testid' ? 'conversation-turn-44' : null }) };
  assert.equal(ChatGPTTOC.prototype.getStableTurnKey.call({}, assistant), null);
});

test('same-root conversation id changes reset the existing conversation state', () => {
  const previousDocument = globalThis.document, previousObserver = globalThis.MutationObserver, previousLocation = globalThis.location;
  let id = 'first', clears = 0, scans = 0, disconnects = 0;
  const thread = { isConnected: true, getClientRects: () => ({ length: 1 }), querySelector: (selector) => selector === SELECTORS.conversationIdentity ? { getAttribute: () => id } : null, querySelectorAll: () => [] };
  globalThis.document = { querySelectorAll: (selector) => selector === SELECTORS.thread ? [thread] : [], querySelector: () => null };
  globalThis.location = { pathname: '/c/reused-root' };
  globalThis.MutationObserver = class { observe() {} disconnect() { disconnects++; } };
  const context = { thread, conversationIdentity: 'conversation:first', conversationObserver: { disconnect() { disconnects++; } }, clearConversation() { clears++; }, scanConversation() { scans++; }, syncNativePrompts() {}, getConversationIdentity: ChatGPTTOC.prototype.getConversationIdentity };
  try {
    ChatGPTTOC.prototype.bindCurrentThread.call(context); assert.equal(clears, 0);
    id = 'second'; ChatGPTTOC.prototype.bindCurrentThread.call(context);
    assert.equal(context.conversationIdentity, 'conversation:second'); assert.equal(clears, 1); assert.equal(scans, 1); assert.equal(disconnects, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousObserver === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = previousObserver;
    if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;
  }
});

test('sidebar heading uses the extension branding', () => {
  assert.match(source, /title\.textContent = 'Prompt Outline Navigator'/);
  assert.match(source, /title\.title = title\.textContent/);
  assert.doesNotMatch(source, /title\.textContent = 'Table of Contents'/);
});

test('sidebar pin control uses state-dependent SVG icons', () => {
  assert.match(source, /api\.createPinIcon = \(pinned\)/);
  assert.match(source, /replaceChildren\(createPinIcon\(pinned\)\)/);
});

test('explicit ChatGPT theme overrides the operating-system preference', () => {
  assert.equal(resolveDarkTheme('dark', 'normal', false), true);
  assert.equal(resolveDarkTheme('light', 'normal', true), false);
  assert.equal(resolveDarkTheme('', 'dark', false), true);
  assert.equal(resolveDarkTheme('', 'light', true), false);
  assert.equal(resolveDarkTheme('', 'normal', true), true);
});

test('sidebar visibility is restored and persisted in extension storage', () => {
  assert.equal(SIDEBAR_VISIBILITY_KEY, 'sidebarVisible');
  assert.match(source, /await storage\.get\(SIDEBAR_VISIBILITY_KEY\)/);
  assert.match(source, /persist:\s*false/);
  assert.doesNotMatch(source, /addToggleButton|chatgpt-toc-toggle/);
});

test('sidebar visibility storage reads closed state and writes later changes', async () => {
  const previousChrome = globalThis.chrome;
  const writes = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ [SIDEBAR_VISIBILITY_KEY]: false }),
        set: async (value) => writes.push(value)
      }
    }
  };
  try {
    assert.equal(await ChatGPTTOC.prototype.loadSidebarVisibility(), false);
    await ChatGPTTOC.prototype.saveSidebarVisibility(true);
    assert.deepEqual(writes, [{ [SIDEBAR_VISIBILITY_KEY]: true }]);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test('sidebar width storage tolerates missing, invalid, and out-of-range values', async () => {
  const previousChrome = globalThis.chrome;
  try {
    for (const [stored, expected] of [[undefined, 200], ['320', 200], [NaN, 200], [Infinity, 200], [320, 320], [0, 160], [900, 600]]) {
      globalThis.chrome = { storage: { local: { get: async () => ({ sidebarWidth: stored }) } } };
      assert.equal(await ChatGPTTOC.prototype.loadSidebarWidth(), expected);
    }
    globalThis.chrome = { storage: { local: { get: async () => { throw new Error('unavailable'); } } } };
    assert.equal(await ChatGPTTOC.prototype.loadSidebarWidth(), 200);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test('a disconnected heading is replaced by its remounted counterpart', () => {
  const heading = (text, tagName, isConnected) => ({ textContent: text, tagName, isConnected });
  const stale = heading('Details', 'H2', false);
  const remounted = heading('Details', 'H2', true);
  const headings = [heading('Overview', 'H1', true), remounted];

  assert.equal(findRemountedHeading(headings, {
    index: 1,
    tagName: stale.tagName,
    text: stale.textContent
  }), remounted);
  assert.equal(findRemountedHeading([], { index: 0, tagName: 'H2', text: 'Details' }), null);
});

test('remounted navigation follows matching text and duplicate occurrence instead of a shifted index', () => {
  const { describeOutlineTarget } = require(sourcePath);
  const heading = (text) => ({ textContent: text, tagName: 'H2', isConnected: true });
  const old = heading('Details');
  const descriptor = describeOutlineTarget(old, [old]);
  old.isConnected = false;
  const inserted = heading('Inserted'), target = heading('Details');
  assert.equal(findRemountedHeading([inserted, target], descriptor), target);
  assert.equal(findRemountedHeading([inserted], descriptor), null);
  const first = heading('Repeated'), second = heading('Repeated');
  const duplicate = describeOutlineTarget(second, [first, second]);
  second.isConnected = false;
  const nextFirst = heading('Repeated'), nextSecond = heading('Repeated');
  assert.equal(findRemountedHeading([inserted, nextFirst, nextSecond], duplicate), nextSecond);
});

test('explicit visible conversation roots take priority over ancestor scroll panes', () => {
  const current = { getClientRects: () => [1], getAttribute: (name) => name === 'data-chatgpt-conversation-selection-target' ? 'current' : null,
    querySelectorAll: (selector) => selector === SELECTORS.conversationTurn ? [{}] : [] };
  let fallbackQueries = 0;
  const doc = { querySelectorAll: (selector) => {
    if (selector === SELECTORS.thread) return [current];
    fallbackQueries++;
    return [{ querySelector: () => ({ getAttribute: () => 'hidden-old-conversation' }) }];
  } };
  const root = findConversationRoot(doc);
  assert.equal(root, current);
  assert.equal(getConversationIdentity(root), 'conversation:current');
  assert.equal(fallbackQueries, 0);
});

test('stable turn groups survive temporary ChatGPT DOM virtualization', () => {
  assert.equal(shouldPreserveDisconnectedGroup({ key: 'test:conversation-turn-2' }), true);
  assert.equal(shouldPreserveDisconnectedGroup({ key: null }), false);
  assert.equal(shouldPreserveDisconnectedGroup(null), false);
});

test('virtualized group labels are based on the discovered TOC order', () => {
  const makeGroup = (promptIndex, nativeIndex = null) => ({
    nativeIndex,
    promptIndex,
    title: { textContent: '' },
    section: { promptIndex }
  });
  const promptTen = makeGroup(9, 9);
  const promptSix = makeGroup(5);
  const promptFive = makeGroup(4);
  const appended = [];
  const context = {
    groups: [promptTen, promptSix, promptFive],
    tocContent: { append: (section) => appended.push(section.promptIndex) },
    captureTocScrollState: () => null,
    restoreTocScrollState() {},
    updateEarlierPromptLoader() {}
  };

  ChatGPTTOC.prototype.updateGroupOrderAndLabels.call(context);

  assert.deepEqual(context.groups, [promptTen, promptSix, promptFive]);
  assert.deepEqual(appended, [9, 5, 4]);
  assert.equal(promptTen.title.textContent, 'Prompt 1');
  assert.equal(promptSix.title.textContent, 'Prompt 2');
  assert.equal(promptFive.title.textContent, 'Prompt 3');
});

test('sparse remounted turns do not move a late prompt ahead of cached earlier prompts', () => {
  const earlier = { lastKnownScrollTop: -2400, title: {}, section: {} };
  const cachedMiddle = { lastKnownScrollTop: -1500, title: {}, section: {} };
  const later = { lastKnownScrollTop: -300, title: {}, section: {} };
  const context = {
    groups: [cachedMiddle, earlier, later],
    tocContent: { append() {} },
    captureTocScrollState: () => null,
    restoreTocScrollState() {},
    updateEarlierPromptLoader() {}
  };
  ChatGPTTOC.prototype.updateGroupOrderAndLabels.call(context, [earlier, later]);
  assert.deepEqual(context.groups, [earlier, cachedMiddle, later]);
  assert.equal(later.title.textContent, 'Prompt 3');
});

test('cached group order survives a single live tail with missing or clamped equal positions', () => {
  for (const position of [null, 500]) {
    const groups = ['A', 'B', 'C'].map((id) => ({ id, lastKnownScrollTop: position, title: {}, section: {} }));
    const context = { groups, tocContent: { append() {} }, captureTocScrollState: () => null,
      restoreTocScrollState() {}, updateEarlierPromptLoader() {} };
    ChatGPTTOC.prototype.updateGroupOrderAndLabels.call(context, [groups[2]]);
    assert.deepEqual(context.groups.map((group) => group.id), ['A', 'B', 'C']);
  }
});

test('virtualized stable turns detach live nodes without discarding cached headings', () => {
  const prompt = {};
  const assistant = {};
  const heading = {};
  const detachedPrompts = [];
  const unobservedHeadings = [];
  const group = { prompt, assistant, headings: [heading] };
  const context = {
    detachPrompt: (candidateGroup, candidatePrompt) => detachedPrompts.push([candidateGroup, candidatePrompt]),
    turnToGroup: new WeakMap([[assistant, group]]),
    headingObserver: { unobserve: (candidate) => unobservedHeadings.push(candidate) },
    rememberGroupDestination() {}
  };

  ChatGPTTOC.prototype.disconnectGroupFromTurn.call(context, group);

  assert.equal(group.prompt, null);
  assert.equal(group.assistant, null);
  assert.deepEqual(group.headings, [heading]);
  assert.deepEqual(detachedPrompts, [[group, prompt]]);
  assert.deepEqual(unobservedHeadings, [heading]);
  assert.equal(context.turnToGroup.has(assistant), false);
});

test('rebinding a remounted assistant clears its stale group and heading ownership', () => {
  const assistant = {};
  const heading = { closest: () => assistant };
  const previousGroup = { assistant, headings: [heading], key: 'test:turn-8' };
  const indexedGroup = { assistant: null, headings: [], key: null, promptIndex: null };
  let reconciled = 0;
  const context = {
    turnToGroup: new Map([[assistant, previousGroup]]),
    turnKeyToGroup: new Map([['test:turn-8', previousGroup]]),
    removeHeading(group, candidate) {
      group.headings = group.headings.filter((item) => item !== candidate);
    },
    setGroupPrompt() {},
    getPromptIndexFromElement: () => 3,
    reconcileAssistantTurn: () => { reconciled += 1; },
    rememberGroupDestination() {}
  };

  ChatGPTTOC.prototype.bindGroupToTurn.call(
    context,
    indexedGroup,
    assistant,
    null,
    'test:turn-8'
  );

  assert.equal(previousGroup.assistant, null);
  assert.equal(previousGroup.key, null);
  assert.deepEqual(previousGroup.headings, []);
  assert.equal(indexedGroup.assistant, assistant);
  assert.equal(indexedGroup.promptIndex, null);
  assert.equal(context.turnToGroup.get(assistant), indexedGroup);
  assert.equal(context.turnKeyToGroup.get('test:turn-8'), indexedGroup);
  assert.equal(reconciled, 1);
});

test('the first resolved prompt label stays fixed across remounted prompt nodes', () => {
  const firstPrompt = { textContent: 'Original prompt' };
  const remountedPrompt = { textContent: 'Incorrect remounted prompt' };
  const promptText = { textContent: '', hidden: true };
  const group = { prompt: null, promptText, promptTextCaptured: false, nativeIndex: null };
  const context = {
    promptToGroups: new WeakMap(),
    promptObserver: { observe() {} },
    detachPrompt() {},
    getPromptIndexFromElement: () => null
  };

  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, firstPrompt);
  assert.equal(promptText.textContent, 'Original prompt');
  assert.equal(group.promptTextCaptured, true);

  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, remountedPrompt);
  assert.equal(group.prompt, remountedPrompt);
  assert.equal(promptText.textContent, 'Original prompt');

  remountedPrompt.textContent = 'Changed again while scrolling';
  ChatGPTTOC.prototype.updatePrompt.call(context, remountedPrompt);
  assert.equal(promptText.textContent, 'Original prompt');
});

test('stable prompt IDs preserve duplicate mounts and correct labels after disconnection', () => {
  const prompt = (id, text) => ({ id, textContent: text, isConnected: true });
  const context = { promptToGroups: new WeakMap(), promptObserver: { observe() {} }, detachPrompt() {}, getStableTurnKey: (p) => p.id };
  const group = { prompt: null, promptText: { textContent: '', hidden: true }, promptTextCaptured: false };
  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, prompt('u1', 'First resolved'));
  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, prompt('u1', 'Duplicate mount text'));
  assert.equal(group.promptText.textContent, 'First resolved');
  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, null);
  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, prompt('u2', 'Second prompt'));
  assert.equal(group.promptText.textContent, 'Second prompt');
});

test('prompt capture uses the rendered message without relying on a turn index', () => {
  const prompt = { textContent: 'Prompt from another group' };
  const promptText = { textContent: '', hidden: true };
  const group = { prompt: null, promptText, promptTextCaptured: false, nativeIndex: 2 };
  const context = {
    promptToGroups: new WeakMap(),
    promptObserver: { observe() {} },
    detachPrompt() {},
  };

  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, prompt);
  assert.equal(promptText.textContent, 'Prompt from another group');
  assert.equal(group.promptTextCaptured, true);
});

test('navigation recovery prefers the current DOM thread over a stale instance reference', () => {
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const scroller = { parentElement: null, scrollHeight: 2000, clientHeight: 800, overflowY: 'auto' };
  const wrapper = { parentElement: scroller, scrollHeight: 2000, clientHeight: 800, overflowY: 'visible' };
  const currentThread = { parentElement: wrapper };
  const staleThread = { parentElement: null };
  globalThis.document = {
    querySelector: (selector) => selector === SELECTORS.thread ? currentThread : null,
    querySelectorAll: (selector) => selector === SELECTORS.thread ? [currentThread] : [],
    scrollingElement: null
  };
  globalThis.getComputedStyle = (element) => ({ overflowY: element.overflowY, flexDirection: 'column' });
  try {
    assert.equal(ChatGPTTOC.prototype.getConversationScrollContainer.call({ thread: staleThread }), scroller);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test('reverse conversation scrolling retains negative offsets and maps target geometry', () => {
  const previousGetComputedStyle = globalThis.getComputedStyle, previousWindow = globalThis.window, calls = [];
  const scroller = { scrollTop: -757, scrollHeight: 3920, clientHeight: 705, clientTop: 0, scrollTo: (value) => calls.push(value), getBoundingClientRect: () => ({ top: 100 }) };
  globalThis.getComputedStyle = () => ({ flexDirection: 'column-reverse' }); globalThis.window = { innerHeight: 1000 };
  try { ChatGPTTOC.prototype.scrollConversationToElement.call({ getConversationScrollContainer: () => scroller }, { getBoundingClientRect: () => ({ top: 250 }) }, 'auto'); assert.deepEqual(calls[0], { top: -707, behavior: 'auto' }); }
  finally { if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = previousGetComputedStyle; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('conversation root is detected as the scroller when it owns overflow', () => {
  const previousDocument = globalThis.document, previousStyle = globalThis.getComputedStyle;
  const root = { parentElement: null, scrollHeight: 1800, clientHeight: 800, overflowY: 'auto', getClientRects: () => ({ length: 1 }), querySelectorAll: () => [] };
  globalThis.document = { querySelectorAll: (selector) => selector === SELECTORS.thread ? [root] : [], querySelector: () => null, scrollingElement: null };
  globalThis.getComputedStyle = (el) => ({ overflowY: el.overflowY, flexDirection: 'column' });
  try { assert.equal(ChatGPTTOC.prototype.getConversationScrollContainer.call({ thread: null }), root); }
  finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; if (previousStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = previousStyle; }
});

test('virtualized navigation scrolls the conversation container to its start', () => {
  const calls = [];
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const scroller = { scrollHeight: 2000, clientHeight: 800, flexDirection: 'column', scrollTo: (options) => calls.push(options) };
  globalThis.getComputedStyle = (element) => ({ flexDirection: element.flexDirection });
  const context = { getConversationScrollContainer: () => scroller };

  try {
    assert.equal(ChatGPTTOC.prototype.scrollConversationToStart.call(context), true);
    assert.deepEqual(calls, [{ top: 0, behavior: 'auto' }]);
    scroller.flexDirection = 'column-reverse';
    assert.equal(ChatGPTTOC.prototype.scrollConversationToStart.call(context), true);
    assert.deepEqual(calls[1], { top: -1200, behavior: 'auto' });
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
  assert.equal(ChatGPTTOC.prototype.scrollConversationToStart.call({ getConversationScrollContainer: () => null }), false);
});

test('virtualized navigation loads earlier turns through the oldest rendered turn', () => {
  const previousDocument = globalThis.document;
  const scrollCalls = [];
  const oldestRenderedTurn = { isConnected: true };
  const currentThread = {
    querySelector: (selector) => selector === SELECTORS.conversationTurn ? oldestRenderedTurn : null,
    getClientRects: () => ({ length: 1 }),
    querySelectorAll: (selector) => selector === SELECTORS.conversationTurn ? [oldestRenderedTurn] : []
  };
  globalThis.document = {
    querySelector: (selector) => selector === SELECTORS.thread ? currentThread : null,
    querySelectorAll: (selector) => selector === SELECTORS.thread ? [currentThread] : []
  };
  try {
    const context = { scrollConversationToElement: (...args) => scrollCalls.push(args) };
    assert.equal(ChatGPTTOC.prototype.loadEarlierConversationTurns.call(context), true);
    assert.deepEqual(scrollCalls, [[oldestRenderedTurn, 'auto']]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('virtualized navigation falls back when no rendered turn is available', () => {
  const previousDocument = globalThis.document;
  const fallbackCalls = [];
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
  const context = {
    scrollConversationToStart: () => {
      fallbackCalls.push(true);
      return true;
    }
  };
  try {
    assert.equal(ChatGPTTOC.prototype.loadEarlierConversationTurns.call(context), true);
    assert.equal(fallbackCalls.length, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('earlier content navigation scrolls the conversation to its beginning', () => {
  let scrollsToStart = 0;
  let finishes = 0;
  const loader = {
    disabled: false,
    setAttribute(name, value) { this[name] = value; }
  };
  const context = {
    earlierPromptLoadRequestId: 2,
    earlierPromptLoader: loader,
    hasEarlierConversationTurns: () => true,
    scrollConversationToStart() { scrollsToStart += 1; },
    finishEarlierPromptLoading() { finishes += 1; }
  };
  const previousRAF = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => callback();
  try {
    ChatGPTTOC.prototype.startEarlierPromptLoading.call(context);
    assert.equal(context.earlierPromptLoadRequestId, 3);
    assert.equal(loader.disabled, true);
    assert.equal(loader['aria-busy'], 'true');
    assert.equal(scrollsToStart, 1);
    assert.equal(finishes, 1);
  } finally {
    if (previousRAF === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRAF;
  }
});

test('conversation-start control detects omitted earlier turns instead of scroll position', () => {
  const list = { style: { height: '2000px' }, classList: { contains: () => true } };
  const turn = { style: { marginTop: '' } };
  const offset = { style: { marginTop: '0px' }, parentElement: list };
  const thread = { isConnected: true, querySelector: () => turn };
  turn.parentElement = offset;
  list.parentElement = thread;
  const context = { source: { kind: 'conversation' }, thread, groups: [{ assistant: { isConnected: true } }] };
  const hasEarlier = () => ChatGPTTOC.prototype.hasEarlierConversationTurns.call(context);
  assert.equal(hasEarlier(), false);
  offset.style.marginTop = '1200px';
  assert.equal(hasEarlier(), true);
  context.source.kind = 'document';
  assert.equal(hasEarlier(), false);
  context.source.kind = 'conversation';
  offset.style.marginTop = '0px';
  context.groups.unshift({ assistant: null, prompt: null });
  assert.equal(hasEarlier(), true);
  context.groups[0].prompt = { isConnected: true };
  assert.equal(hasEarlier(), false);
});

test('conversation-start control is removed when no earlier turns are omitted', () => {
  let removed = 0;
  const scroller = { scrollHeight: 1200, clientHeight: 600, scrollTop: 0 };
  const context = Object.assign(Object.create(ChatGPTTOC.prototype), {
    groups: [{}],
    earlierPromptLoader: { remove() { removed += 1; } },
    getConversationScrollContainer: () => scroller
  });
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ flexDirection: 'column' });
  try {
    ChatGPTTOC.prototype.updateEarlierPromptLoader.call(context);
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
  assert.equal(removed, 1);
});

test('normal TOC navigation cancels a pending earlier prompt load', () => {
  const heading = { isConnected: true };
  const item = {};
  const group = {};
  const loader = {
    disabled: true,
    removeAttribute(name) { delete this[name]; },
    'aria-busy': 'true'
  };
  const context = {
    earlierPromptLoadRequestId: 7,
    earlierPromptLoader: loader,
    groups: [group],
    tocItemToHeading: new WeakMap([[item, heading]]),
    headingToGroup: new WeakMap([[heading, group]]),
    cancelEarlierPromptLoading: ChatGPTTOC.prototype.cancelEarlierPromptLoading,
    navigateToHeading(candidateHeading, candidateGroup) {
      assert.equal(this.earlierPromptLoadRequestId, 8);
      assert.equal(candidateHeading, heading);
      assert.equal(candidateGroup, group);
    }
  };
  const target = {
    closest(selector) {
      if (selector === '.toc-load-earlier' || selector === '.toc-group-collapse-icon' || selector === '.toc-collapse-icon') return null;
      if (selector === '.toc-item') return item;
      return null;
    }
  };

  ChatGPTTOC.prototype.handleTocClick.call(context, { target });
  assert.equal(loader.disabled, false);
  assert.equal(loader['aria-busy'], undefined);
});

test('connected prompt navigation keeps settling after an earlier prompt load is cancelled', () => {
  const header = {};
  const destination = { isConnected: true };
  const group = { header, prompt: destination };
  const calls = [];
  const context = {
    groups: [group],
    navigationRequestId: 9,
    pendingNavigationRequestId: null,
    earlierPromptLoadRequestId: 4,
    earlierPromptLoader: null,
    cancelEarlierPromptLoading: ChatGPTTOC.prototype.cancelEarlierPromptLoading,
    getConnectedGroupDestination: () => destination,
    setActive: (...args) => calls.push(['active', ...args]),
    scrollToDestination: (element) => calls.push(['scroll', element]),
    waitForSmoothScrollEnd: (_requestId, onComplete) => onComplete(),
    settleGroupDestination: (candidateGroup, requestId) => calls.push(['settle', candidateGroup, requestId])
  };
  const event = {
    target: {
      closest: (selector) => selector === '.toc-group-header' ? header : null
    }
  };

  ChatGPTTOC.prototype.handleTocClick.call(context, event);

  assert.equal(context.earlierPromptLoadRequestId, 5);
  assert.equal(context.navigationRequestId, 10);
  assert.equal(context.pendingNavigationRequestId, 10);
  assert.deepEqual(calls, [
    ['active', null, group],
    ['scroll', destination],
    ['settle', group, 10]
  ]);
});

test('connected heading navigation keeps settling against delayed native scrolling', () => {
  const heading = {
    isConnected: true,
    tagName: 'H2',
    textContent: 'Target heading'
  };
  const group = { headings: [heading] };
  const calls = [];
  const context = {
    navigationRequestId: 2,
    pendingNavigationRequestId: null,
    setActive: (...args) => calls.push(['active', ...args]),
    scrollToDestination: (element) => calls.push(['scroll', element]),
    waitForSmoothScrollEnd: (_requestId, onComplete) => onComplete(),
    settleHeadingDestination: (candidateGroup, descriptor, requestId) =>
      calls.push(['settle', candidateGroup, descriptor, requestId])
  };

  ChatGPTTOC.prototype.navigateToHeading.call(context, heading, group);

  assert.equal(context.navigationRequestId, 3);
  assert.equal(context.pendingNavigationRequestId, 3);
  assert.deepEqual(calls, [
    ['active', heading, group],
    ['scroll', heading],
    ['settle', group, { element: heading, index: 0, tagName: 'H2', text: 'Target heading', occurrence: 0 }, 3]
  ]);
});

test('cached prompt header starts recovery without a native ChatGPT TOC button', () => {
  const header = {};
  const group = { header, nativeButton: null };
  const recoveryCalls = [];
  const activeCalls = [];
  const context = {
    groups: [group],
    navigationRequestId: 4,
    pendingNavigationRequestId: null,
    earlierPromptLoadRequestId: 0,
    earlierPromptLoader: null,
    cancelEarlierPromptLoading: ChatGPTTOC.prototype.cancelEarlierPromptLoading,
    getConnectedGroupDestination: () => null,
    getConnectedNativeButton: () => null,
    setActive: (...args) => activeCalls.push(args),
    recoverVirtualizedDestination: (...args) => recoveryCalls.push(args),
    waitForGroupDestination: () => {}
  };
  const event = {
    target: {
      closest: (selector) => selector === '.toc-group-header' ? header : null
    }
  };

  assert.doesNotThrow(() => ChatGPTTOC.prototype.handleTocClick.call(context, event));
  assert.equal(context.navigationRequestId, 5);
  assert.equal(context.pendingNavigationRequestId, 5);
  assert.deepEqual(activeCalls, [[null, group]]);
  assert.equal(recoveryCalls.length, 1);
  assert.equal(recoveryCalls[0][0], group);
  assert.equal(recoveryCalls[0][1], 5);
  assert.equal(typeof recoveryCalls[0][2], 'function');
});

test('group navigation trusts stable group ownership over sparse branched turn numbers', () => {
  const prompt = { isConnected: true };
  const assistant = { isConnected: true };
  const group = { nativeIndex: 5, prompt, assistant };
  const context = {
    thread: { contains: () => true },
    rememberGroupDestination() {}
  };

  assert.equal(ChatGPTTOC.prototype.getConnectedGroupDestination.call(context, group), prompt);
  prompt.isConnected = false;
  assert.equal(ChatGPTTOC.prototype.getConnectedGroupDestination.call(context, group), assistant);
  assistant.isConnected = false;
  assert.equal(ChatGPTTOC.prototype.getConnectedGroupDestination.call(context, group), null);
});

test('reverse-scroll recovery remembers an upper destination as a negative position', () => {
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ flexDirection: 'column-reverse' });
  const target = { isConnected: true, getBoundingClientRect: () => ({ top: -1500 }) };
  const group = { prompt: target };
  const scroller = {
    scrollTop: -200, scrollHeight: 4000, clientHeight: 800, clientTop: 0,
    getBoundingClientRect: () => ({ top: 100 })
  };
  const context = { thread: { contains: (node) => node === target }, getConversationScrollContainer: () => scroller };
  try {
    assert.equal(ChatGPTTOC.prototype.rememberGroupDestination.call(context, group), true);
    assert.equal(group.lastKnownScrollTop, -1800);
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test('virtualized prompt recovery prefers its remembered position over page start', () => {
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ flexDirection: 'column' });
  const group = { lastKnownScrollTop: 1234 };
  const calls = [];
  const scroller = { scrollTop: 0, scrollHeight: 3000, clientHeight: 800, scrollTo: (options) => calls.push(options) };
  const context = {
    getConnectedNativeButton: () => null,
    scrollToRememberedGroupDestination:
      ChatGPTTOC.prototype.scrollToRememberedGroupDestination,
    getConversationScrollContainer: () => scroller,
    loadEarlierConversationTurns() { throw new Error('must not jump to the oldest turn'); }
  };

  try {
    assert.equal(ChatGPTTOC.prototype.retryGroupRecovery.call(context, group), true);
    assert.deepEqual(calls, [{ top: 1234, behavior: 'auto' }]);
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test('virtualized recovery narrows stale positions in both directions and reverse scrollers', () => {
  const previousGetComputedStyle = globalThis.getComputedStyle;
  try {
    for (const { reverse, forward, start, anchorTop, expected } of [
      { reverse: false, forward: true, start: 1500, anchorTop: 1000, expected: [2750, 3375] },
      { reverse: false, forward: false, start: 2000, anchorTop: 1000, expected: [500, 250] },
      { reverse: true, forward: true, start: -2500, anchorTop: -3000, expected: [-1250, -625] },
      { reverse: true, forward: false, start: -500, anchorTop: -1000, expected: [-2500, -3250] }
    ]) {
      globalThis.getComputedStyle = () => ({ flexDirection: reverse ? 'column-reverse' : 'column' });
      const calls = [];
      const scroller = { scrollTop: start, scrollHeight: 4500, clientHeight: 500,
        getBoundingClientRect: () => ({ top: 40 }),
        scrollTo({ top }) { calls.push(top); this.scrollTop = top; } };
      const prompt = { isConnected: true, getBoundingClientRect: () => ({ top: anchorTop - scroller.scrollTop + 40 }) };
      const live = { prompt };
      const target = { lastKnownScrollTop: 200 };
      const context = { groups: forward ? [live, target] : [target, live],
        thread: { contains: (element) => element === prompt }, getConversationScrollContainer: () => scroller };
      const recovery = {};
      assert.equal(ChatGPTTOC.prototype.seekVirtualizedGroup.call(context, target, recovery), true);
      assert.equal(ChatGPTTOC.prototype.seekVirtualizedGroup.call(context, target, recovery), true);
      assert.deepEqual(calls, expected);
    }
  } finally {
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test('a new navigation request starts with its own remembered destination', () => {
  const group = {};
  const calls = [];
  const context = { navigationRequestId: 1,
    scrollToRememberedGroupDestination: () => { calls.push('remembered'); return true; },
    seekVirtualizedGroup: () => { calls.push('seek'); return true; } };
  ChatGPTTOC.prototype.retryGroupRecovery.call(context, group);
  ChatGPTTOC.prototype.retryGroupRecovery.call(context, group);
  context.navigationRequestId++;
  ChatGPTTOC.prototype.retryGroupRecovery.call(context, group);
  assert.deepEqual(calls, ['remembered', 'seek', 'remembered']);
});

test('navigation settling corrects a destination after the initial scroll', () => {
  const previousWindow = globalThis.window;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const scrollCalls = [];
  const continuationCalls = [];
  globalThis.window = { innerHeight: 1200 };
  globalThis.requestAnimationFrame = (callback) => callback();
  const scroller = {
    scrollTop: 100,
    scrollHeight: 3000,
    clientHeight: 800,
    clientTop: 0,
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTo: (options) => scrollCalls.push(options)
  };
  globalThis.getComputedStyle = () => ({ flexDirection: 'column' });
  const context = {
    navigationRequestId: 3,
    pendingNavigationRequestId: 3,
    getConversationScrollContainer: () => scroller
  };
  const element = {
    isConnected: true,
    getBoundingClientRect: () => ({ top: 900 })
  };

  try {
    ChatGPTTOC.prototype.settleDestination.call(
      context,
      element,
      3,
      0,
      0,
      (stableFrames) => continuationCalls.push(stableFrames),
      () => { throw new Error('not settled yet'); }
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousAnimationFrame;
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }

  assert.deepEqual(scrollCalls, [{ top: 880, behavior: 'auto' }]);
  assert.deepEqual(continuationCalls, [0]);
  assert.equal(context.pendingNavigationRequestId, 3);
});

test('an upper TOC heading click stays at a negative reverse-scroll position through settling', () => {
  const previousWindow = globalThis.window;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;
  const queuedFrames = [];
  const scrollCalls = [];
  let timerId = 0;
  const scroller = {
    scrollTop: -100,
    scrollHeight: 3000,
    clientHeight: 2000,
    clientTop: 0,
    getBoundingClientRect: () => ({ top: 100 }),
    scrollTo({ top }) {
      scrollCalls.push(top);
      this.scrollTop = top;
    }
  };
  const heading = {
    isConnected: true,
    tagName: 'H2',
    textContent: 'Earlier response',
    offsetWidth: 0,
    classList: { add() {}, remove() {} },
    getBoundingClientRect: () => ({ top: 50 - scroller.scrollTop })
  };
  const group = { headings: [heading] };
  const item = {};
  const context = Object.assign(Object.create(ChatGPTTOC.prototype), {
    navigationRequestId: 5,
    pendingNavigationRequestId: 5,
    earlierPromptLoadRequestId: 0,
    earlierPromptLoader: null,
    destinationHighlightTimers: new WeakMap(),
    tocItemToHeading: new Map([[item, heading]]),
    headingToGroup: new Map([[heading, group]]),
    getConversationScrollContainer: () => scroller,
    setActive() {},
    scheduleActiveUpdate() {}
  });
  const event = { target: { closest: (selector) => selector === '.toc-item' ? item : null } };
  globalThis.window = { innerHeight: 900 };
  globalThis.getComputedStyle = () => ({ flexDirection: 'column-reverse' });
  globalThis.requestAnimationFrame = (callback) => { queuedFrames.push(callback); return queuedFrames.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.setTimeout = () => ++timerId;
  globalThis.clearTimeout = () => {};

  try {
    ChatGPTTOC.prototype.handleTocClick.call(context, event);
    for (let frame = 0; queuedFrames.length && frame < 24; frame++) queuedFrames.shift()(frame * 20);
    assert.equal(context.navigationRequestId, 7);
    assert.ok(scrollCalls.length > 0);
    assert.ok(scrollCalls.every((top) => top < 0), `scroll calls should stay above the reverse-scroll bottom: ${scrollCalls}`);
    assert.equal(scroller.scrollTop, -140);
    assert.equal(context.pendingNavigationRequestId, null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousAnimationFrame;
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
    if (previousCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    if (previousSetTimeout === undefined) delete globalThis.setTimeout;
    else globalThis.setTimeout = previousSetTimeout;
    if (previousClearTimeout === undefined) delete globalThis.clearTimeout;
    else globalThis.clearTimeout = previousClearTimeout;
  }
});

test('user scroll events cancel delayed destination retries', () => {
  const previousWindow = globalThis.window;
  const listeners = new Map();
  globalThis.window = { addEventListener: (type, listener) => listeners.set(type, listener) };
  const context = Object.assign(Object.create(ChatGPTTOC.prototype), {
    navigationRequestId: 9,
    pendingNavigationRequestId: 9,
    boundScheduleActiveUpdate() {}
  });
  try {
    ChatGPTTOC.prototype.observePositionChanges.call(context);
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      assert.equal(typeof listeners.get(type), 'function');
    }
    listeners.get('wheel')({ type: 'wheel' });
    assert.equal(context.navigationRequestId, 10);
    assert.equal(context.pendingNavigationRequestId, null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  assert.doesNotThrow(() => ChatGPTTOC.prototype.settleDestination.call(
    context, { isConnected: true }, 9, 0, 0, () => { throw new Error('stale retry ran'); }, () => {}
  ));
});

test('conversation reset invalidates pending virtualized navigation retries', () => {
  const context = Object.assign(Object.create(ChatGPTTOC.prototype), {
    navigationRequestId: 12,
    pendingNavigationRequestId: 12,
    earlierPromptLoadRequestId: 3,
    earlierPromptLoader: null,
    headingObserver: { disconnect() {} },
    promptObserver: { disconnect() {} },
    groups: [],
    turnToGroup: new WeakMap(),
    turnKeyToGroup: new Map(),
    promptToGroups: new WeakMap(),
    headingToGroup: new WeakMap(),
    headingToTocItem: new WeakMap(),
    tocItemToHeading: new WeakMap(),
    activeHeading: {},
    activeGroup: {}
  });
  ChatGPTTOC.prototype.clearConversation.call(context);
  assert.equal(context.navigationRequestId, 13);
  assert.equal(context.pendingNavigationRequestId, null);
  assert.equal(context.activeGroup, null);
});

test('rendered responses survive missing prompts and multiple assistants per prompt', () => {
  const message = (role, id) => ({ id, matches: (selector) => selector.split(',').includes(`[data-message-author-role="${role}"]`) });
  const orphan = message('assistant', 'orphan');
  const firstPrompt = message('user', 'user-1');
  const firstAssistant = message('assistant', 'assistant-1');
  const duplicateAssistant = message('assistant', 'assistant-duplicate');
  const secondPrompt = message('user', 'user-2');
  const secondAssistant = message('assistant', 'assistant-2');

  assert.deepEqual(pairConversationMessages([
    orphan,
    firstPrompt,
    firstAssistant,
    duplicateAssistant,
    secondPrompt,
    secondAssistant
  ]), [
    { prompt: null, assistant: orphan },
    { prompt: firstPrompt, assistant: firstAssistant },
    { prompt: firstPrompt, assistant: duplicateAssistant },
    { prompt: secondPrompt, assistant: secondAssistant }
  ]);
});

test('virtualized messages pair by DOM order without synthetic prompt indices', () => {
  const createMessage = (role, id) => ({
    id,
    matches: (selector) => selector.split(',').includes(`[data-message-author-role="${role}"]`)
  });
  const prompt = createMessage('user', 'prompt');
  const assistant = createMessage('assistant', 'assistant');
  const indexes = new Map([[prompt, 1], [assistant, 4]]);

  assert.deepEqual(pairConversationMessages([prompt, assistant]), [{ prompt, assistant }]);
});

test('remounted assistants with the same stable turn key are deduplicated', () => {
  const message = (role, id, turnKey) => ({
    id,
    turnKey,
    matches: (selector) => selector.split(',').includes(`[data-message-author-role="${role}"]`)
  });
  const oldPrompt = message('user', 'old-user');
  const oldAssistant = message('assistant', 'old-assistant', 'turn-2');
  const newPrompt = message('user', 'new-user');
  const newAssistant = message('assistant', 'new-assistant', 'turn-2');

  assert.deepEqual(
    pairConversationMessages(
      [oldPrompt, oldAssistant, newPrompt, newAssistant],
      (assistant) => assistant.turnKey
    ),
    [{ prompt: newPrompt, assistant: newAssistant, key: 'turn-2' }]
  );
});

test('active tracking chooses exactly the last item above the navigation line', () => {
  const target = (top, id) => ({ id, element: { getBoundingClientRect: () => ({ top }) } });
  const first = target(-800, 'first');
  const previous = target(40, 'previous');
  const current = target(90, 'current');
  const next = target(240, 'next');

  assert.equal(findActiveTrackingTarget([first, previous, current, next], 100), current);
  assert.equal(findActiveTrackingTarget([next, first, current, previous], 100), current);
  assert.equal(findActiveTrackingTarget([first, previous, current, next], 50), previous);
  assert.equal(findActiveTrackingTarget([first, previous, current, next], -900), null);
});

test('active tracking chooses a containing response range and rejects distant stale prompts', () => {
  const stale = { id: 'stale', top: -30000, bottom: -29950 };
  const current = { id: 'current', top: -500, bottom: 900 };
  const next = { id: 'next', top: 940, bottom: 1500 };

  assert.equal(findActiveGroupRange([next, stale, current], 100, 120), current);
  assert.equal(findActiveGroupRange([stale], 100, 120), null);
  assert.equal(findActiveGroupRange([{ id: 'near', top: 20, bottom: 80 }], 100, 40).id, 'near');
  assert.equal(findActiveGroupRange([{ id: 'far', top: 0, bottom: 40 }], 100, 40), null);
});

test('group tracking uses stable ownership for active positioning', () => {
  const group = { prompt: null, assistant: null };
  const promptOnlyGroup = { prompt: null, assistant: null };
  const staleMappedGroup = { prompt: null, assistant: null };
  const assistant = {
    isConnected: true,
    closest: () => null,
    getBoundingClientRect: () => ({ top: -400, bottom: 700 })
  };
  const prompt = {
    isConnected: true,
    closest: () => null,
    getBoundingClientRect: () => ({ top: -450, bottom: -410 })
  };
  const stalePrompt = {
    isConnected: true,
    closest: () => null,
    getBoundingClientRect: () => ({ top: -30000, bottom: -29950 })
  };
  group.prompt = prompt;
  group.assistant = assistant;
  promptOnlyGroup.prompt = stalePrompt;
  const live = new Set([prompt, assistant, stalePrompt]);
  const context = {
    groups: [promptOnlyGroup, group, staleMappedGroup],
    thread: {
      isConnected: true,
      contains: (element) => live.has(element),
      querySelectorAll: () => [assistant]
    },
    turnToGroup: new Map([[assistant, group]]),
    isLiveConversationElement: ChatGPTTOC.prototype.isLiveConversationElement
  };

  assert.deepEqual(ChatGPTTOC.prototype.getLiveGroupRanges.call(context, 900), [
    { group, assistant, top: -450, bottom: 700 }
  ]);
});

test('active tracking skips safely while no conversation root is bound', () => {
  const updates = [];
  const context = {
    thread: null,
    activeGroup: { id: 'stale-group' },
    activeHeading: { id: 'stale-heading' },
    updateEarlierPromptLoader() {},
    setActive: (heading, group) => updates.push([heading, group])
  };
  assert.doesNotThrow(() => ChatGPTTOC.prototype.updateActiveFromScrollPosition.call(context));
  assert.deepEqual(updates, [[null, null]]);
  assert.deepEqual(ChatGPTTOC.prototype.getLiveGroupRanges.call({ thread: null }, 800), []);
});

test('active tracking keeps the current hierarchy selection during a transient remount gap', () => {
  const group = { id: 'current-group' };
  const heading = { id: 'current-heading' };
  const updates = [];
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { innerHeight: 900 };
    ChatGPTTOC.prototype.updateActiveFromScrollPosition.call({
      thread: { isConnected: true, querySelectorAll: () => [] },
      activeGroup: group,
      activeHeading: heading,
      getLiveGroupRanges: () => [],
      setActive: (nextHeading, nextGroup) => updates.push([nextHeading, nextGroup])
    });
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  assert.deepEqual(updates, [[heading, group]]);
});

test('active tracking keeps the requested prompt selected while navigation is settling', () => {
  const group = { id: 'requested-group' };
  const heading = { id: 'requested-heading' };
  const updates = [];
  ChatGPTTOC.prototype.updateActiveFromScrollPosition.call({
    thread: { isConnected: true, querySelectorAll: () => [] },
    pendingNavigationRequestId: 12,
    activeGroup: group,
    activeHeading: heading,
    setActive: (nextHeading, nextGroup) => updates.push([nextHeading, nextGroup])
  });

  assert.deepEqual(updates, [[heading, group]]);
});

test('navigation line uses ten percent of the viewport within safe limits', () => {
  assert.equal(getNavigationOffset(600), 72);
  assert.equal(getNavigationOffset(900), 90);
  assert.equal(getNavigationOffset(1600), 120);
});

test('dynamic content never uses innerHTML and polling is absent', () => {
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /new WeakMap/);
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /0px 0px -90% 0px/);
  assert.match(source, /collectResponsePairs/);
  assert.match(source, /findActiveTrackingTarget/);
  assert.match(source, /findActiveGroupRange/);
  assert.match(source, /addEventListener\('scroll'/);
  assert.match(source, /addEventListener\('wheel'/);
  assert.match(source, /addEventListener\('touchstart'/);
  assert.match(source, /addEventListener\('pointerdown'/);
  assert.match(source, /STRUCTURE_SETTLE_DELAY/);
  assert.match(source, /turnKeyToGroup/);
  assert.match(source, /getStableTurnKey/);
  assert.match(source, /scrollToDestination/);
  assert.match(source, /flashDestination/);
  assert.doesNotMatch(source, /data-toc-item-index|nativeIndex|nativeToc|nativeButton/);
  assert.match(source, /getConnectedGroupDestination/);
  assert.match(source, /waitForGroupDestination/);
  assert.match(source, /navigateToHeading/);
  assert.match(source, /findConnectedHeading/);
  assert.match(source, /waitForHeadingDestination/);
  assert.match(source, /disconnectGroupFromTurn/);
  assert.match(source, /recoverVirtualizedDestination/);
  assert.match(source, /getConversationScrollContainer/);
  assert.match(source, /scrollConversationToStart/);
  assert.match(source, /loadEarlierConversationTurns/);
  assert.match(source, /pendingNavigationRequestId/);
  assert.doesNotMatch(source, /getPromptIndexFromTestId|conversation-turn-\d/);
  assert.match(source, /dataset\.tocVersion/);
  assert.match(source, /classList\.remove\('toc-h1', 'toc-h2', 'toc-h3', 'toc-h4', 'toc-h5', 'toc-h6'\)/);
  assert.doesNotMatch(source, /item\.className\s*=\s*`toc-item toc-h/);
  assert.doesNotMatch(source, /nativeLabel/);
  assert.doesNotMatch(source, /attributeFilter: \[[^\]]*aria-label/);
  assert.doesNotMatch(source, /Response without a preceding prompt/);
});
