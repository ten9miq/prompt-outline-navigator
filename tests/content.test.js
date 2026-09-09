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
  getNativeTocIndex,
  collectNativeTocItems,
  getPromptIndexFromTestId,
  findRemountedHeading,
  canCreateConversationGroup,
  shouldPreserveDisconnectedGroup,
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

test('DOM-dependent selectors are centralized', () => {
  assert.equal(SELECTORS.thread, '#thread');
  assert.equal(SELECTORS.promptText, '.whitespace-pre-wrap');
  assert.equal(SELECTORS.assistantMessage, '[data-message-author-role="assistant"]');
  assert.equal(SELECTORS.headings, 'h1,h2,h3,h4,h5,h6');
  assert.equal(SELECTORS.conversationTurn, '[data-testid^="conversation-turn-"]');
  assert.equal(SELECTORS.nativeTocItem, 'button[data-toc-item-index]');
  assert.equal(SELECTORS.nativeTocActive, 'button[data-toc-item-index][data-toc-active]');
});

test('sidebar heading uses the extension branding', () => {
  assert.match(source, /title\.textContent = 'Prompt Outline Navigator'/);
  assert.match(source, /title\.title = title\.textContent/);
  assert.doesNotMatch(source, /title\.textContent = 'Table of Contents'/);
});

test('sidebar close control uses a centered SVG instead of a font glyph', () => {
  assert.match(source, /(?:function createCloseIcon\(\)|api\.createCloseIcon =)/);
  assert.match(source, /closeButton\.append\(createCloseIcon\(\)\)/);
  assert.doesNotMatch(source, /closeButton\.textContent = '×'/);
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
  assert.match(source, /this\.toggleButton\.hidden = true/);
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

test('native prompt TOC indices are parsed and deduplicated in DOM order', () => {
  const button = (value) => ({ getAttribute: (name) => name === 'data-toc-item-index' ? value : null });
  const first = button('0');
  const duplicate = button('0');
  const second = button('1');
  const invalid = button('-1');
  const items = collectNativeTocItems([first, duplicate, invalid, second]);

  assert.equal(getNativeTocIndex(first), 0);
  assert.equal(getNativeTocIndex(invalid), null);
  assert.deepEqual([...items.keys()], [0, 1]);
  assert.equal(items.get(0), first);
});

test('conversation turn test ids map user and assistant nodes to one prompt index', () => {
  assert.equal(getPromptIndexFromTestId('conversation-turn-1', 'user'), 0);
  assert.equal(getPromptIndexFromTestId('conversation-turn-2', 'assistant'), 0);
  assert.equal(getPromptIndexFromTestId('conversation-turn-7', 'user'), 3);
  assert.equal(getPromptIndexFromTestId('conversation-turn-8', 'assistant'), 3);
  assert.equal(getPromptIndexFromTestId('conversation-turn-6', 'user'), 3);
  assert.equal(getPromptIndexFromTestId('conversation-turn-7', 'assistant'), 3);
  assert.equal(getPromptIndexFromTestId('conversation-turn-x'), null);
});

test('conversation turn indices remain authoritative while the native TOC is absent', () => {
  const prompt = {};
  const assistant = {};
  const context = {
    nativeTocItems: new Map(),
    getPromptIndexFromElement: (element) => element === prompt || element === assistant ? 5 : null
  };

  assert.equal(
    ChatGPTTOC.prototype.resolveNativeIndex.call(context, prompt, assistant, 0, 1),
    5
  );
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

test('native TOC authority prevents unmatched fallback groups', () => {
  assert.equal(canCreateConversationGroup(null, 5), false);
  assert.equal(canCreateConversationGroup(3, 5), true);
  assert.equal(canCreateConversationGroup(null, 0), true);
});

test('stable turn groups survive temporary ChatGPT DOM virtualization', () => {
  assert.equal(shouldPreserveDisconnectedGroup({ key: 'test:conversation-turn-2' }), true);
  assert.equal(shouldPreserveDisconnectedGroup({ key: null }), false);
  assert.equal(shouldPreserveDisconnectedGroup(null), false);
});

test('native TOC reconciliation removes a keyed duplicate for an indexed prompt', () => {
  const canonical = { nativeIndex: 3, promptIndex: 3, key: 'message:canonical' };
  const duplicate = { nativeIndex: null, promptIndex: 3, key: 'message:remounted' };
  const disconnected = { nativeIndex: null, promptIndex: 8, key: 'message:disconnected' };
  const removed = [];
  const context = {
    groups: [canonical, duplicate, disconnected],
    nativeTocItems: new Map([[3, {}]]),
    nativeIndexToGroup: new Map([[3, canonical]]),
    removeGroup(group) { removed.push(group); }
  };

  ChatGPTTOC.prototype.removeNonNativeGroups.call(context);
  assert.deepEqual(removed, [duplicate]);
});

test('a partial native TOC snapshot does not discard previously discovered prompt groups', () => {
  const oldButton = { isConnected: false };
  const currentButton = { isConnected: true };
  const replacementButton = { isConnected: true };
  const firstGroup = { nativeIndex: 0, nativeButton: oldButton };
  const secondGroup = { nativeIndex: 1, nativeButton: currentButton };
  let cleanupCalls = 0;
  const context = {
    nativeTocItems: new Map([[0, oldButton], [1, currentButton]]),
    nativeIndexToGroup: new Map([[0, firstGroup], [1, secondGroup]]),
    groups: [firstGroup, secondGroup],
    addGroup() { throw new Error('No group should be recreated'); },
    removeNonNativeGroups() { cleanupCalls += 1; }
  };

  ChatGPTTOC.prototype.reconcileNativeTocItems.call(
    context,
    new Map([[1, replacementButton]])
  );

  assert.equal(context.nativeTocItems.size, 2);
  assert.equal(context.nativeTocItems.get(0), oldButton);
  assert.equal(context.nativeIndexToGroup.get(0), firstGroup);
  assert.equal(firstGroup.nativeIndex, 0);
  assert.equal(firstGroup.nativeButton, null);
  assert.equal(secondGroup.nativeButton, replacementButton);
  assert.equal(cleanupCalls, 1);
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
  assert.equal(indexedGroup.promptIndex, 3);
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

test('a mismatched native prompt cannot become the fixed group label', () => {
  const prompt = { textContent: 'Prompt from another group' };
  const promptText = { textContent: '', hidden: true };
  const group = { prompt: null, promptText, promptTextCaptured: false, nativeIndex: 2 };
  const context = {
    promptToGroups: new WeakMap(),
    promptObserver: { observe() {} },
    detachPrompt() {},
    getPromptIndexFromElement: () => 8
  };

  ChatGPTTOC.prototype.setGroupPrompt.call(context, group, prompt);
  assert.equal(promptText.textContent, '');
  assert.equal(group.promptTextCaptured, false);
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
    scrollingElement: null
  };
  globalThis.getComputedStyle = (element) => ({ overflowY: element.overflowY });
  try {
    assert.equal(ChatGPTTOC.prototype.getConversationScrollContainer.call({ thread: staleThread }), scroller);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test('virtualized navigation scrolls the conversation container to its start', () => {
  const calls = [];
  const scroller = { scrollTo: (options) => calls.push(options) };
  const context = { getConversationScrollContainer: () => scroller };

  assert.equal(ChatGPTTOC.prototype.scrollConversationToStart.call(context), true);
  assert.deepEqual(calls, [{ top: 0, behavior: 'auto' }]);
  assert.equal(ChatGPTTOC.prototype.scrollConversationToStart.call({ getConversationScrollContainer: () => null }), false);
});

test('virtualized navigation loads earlier turns through the oldest rendered turn', () => {
  const previousDocument = globalThis.document;
  const scrollCalls = [];
  const oldestRenderedTurn = {
    isConnected: true,
    scrollIntoView: (options) => scrollCalls.push(options)
  };
  const currentThread = {
    querySelector: (selector) => selector === SELECTORS.conversationTurn ? oldestRenderedTurn : null
  };
  globalThis.document = {
    querySelector: (selector) => selector === SELECTORS.thread ? currentThread : null
  };
  try {
    assert.equal(ChatGPTTOC.prototype.loadEarlierConversationTurns.call({}), true);
    assert.deepEqual(scrollCalls, [{ block: 'start', behavior: 'auto' }]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('virtualized navigation falls back when no rendered turn is available', () => {
  const previousDocument = globalThis.document;
  const fallbackCalls = [];
  globalThis.document = { querySelector: () => null };
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

test('earlier prompt loading is based on the first prompt rather than numbered placeholders', () => {
  const unloadedFirst = { nativeIndex: 0, promptIndex: 0, contentCaptured: false };
  const loadedFirst = { nativeIndex: 0, promptIndex: 0, contentCaptured: true };
  const laterPrompt = { nativeIndex: null, promptIndex: 4, contentCaptured: true };
  const unloadedLaterPrompt = { nativeIndex: 3, promptIndex: 3, contentCaptured: false };

  assert.equal(ChatGPTTOC.prototype.hasUnloadedEarlierPrompts.call({ groups: [unloadedFirst, laterPrompt] }), true);
  assert.equal(ChatGPTTOC.prototype.hasUnloadedEarlierPrompts.call({ groups: [loadedFirst, laterPrompt] }), false);
  assert.equal(ChatGPTTOC.prototype.hasUnloadedEarlierPrompts.call({
    groups: [loadedFirst, unloadedLaterPrompt, laterPrompt]
  }), false);
  assert.equal(ChatGPTTOC.prototype.hasUnloadedEarlierPrompts.call({ groups: [laterPrompt] }), true);
  assert.equal(ChatGPTTOC.prototype.hasUnloadedEarlierPrompts.call({
    groups: [{ nativeIndex: null, promptIndex: null, contentCaptured: true }]
  }), false);
});

test('earlier prompt loading prefers ChatGPT native Prompt 1 navigation', () => {
  let nativeClicks = 0;
  let fallbackLoads = 0;
  let waits = 0;
  const loader = {
    disabled: false,
    setAttribute(name, value) { this[name] = value; }
  };
  const context = {
    earlierPromptLoadRequestId: 2,
    earlierPromptLoader: loader,
    nativeTocItems: new Map([[0, { isConnected: true, click() { nativeClicks += 1; } }]]),
    hasUnloadedEarlierPrompts: () => true,
    updateEarlierPromptLoader() {},
    loadEarlierConversationTurns() { fallbackLoads += 1; },
    waitForEarlierPrompts(requestId) {
      waits += 1;
      assert.equal(requestId, 3);
    }
  };

  ChatGPTTOC.prototype.startEarlierPromptLoading.call(context);
  assert.equal(context.earlierPromptLoadRequestId, 3);
  assert.equal(loader.disabled, true);
  assert.equal(loader['aria-busy'], 'true');
  assert.equal(nativeClicks, 1);
  assert.equal(fallbackLoads, 0);
  assert.equal(waits, 1);
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

test('group navigation only uses a connected destination with the same prompt index', () => {
  const prompt = { isConnected: true };
  const assistant = { isConnected: true };
  const group = { nativeIndex: 5, prompt, assistant };
  const promptIndexes = new Map([[prompt, 5], [assistant, 2]]);
  const context = {
    thread: { contains: () => true },
    getPromptIndexFromElement: (element) => promptIndexes.get(element),
    rememberGroupDestination() {}
  };

  assert.equal(ChatGPTTOC.prototype.getConnectedGroupDestination.call(context, group), prompt);
  promptIndexes.set(prompt, 3);
  promptIndexes.set(assistant, 5);
  assert.equal(ChatGPTTOC.prototype.getConnectedGroupDestination.call(context, group), assistant);
  promptIndexes.set(assistant, 4);
  assert.equal(ChatGPTTOC.prototype.getConnectedGroupDestination.call(context, group), null);
});

test('virtualized prompt recovery prefers its remembered position over page start', () => {
  const group = { lastKnownScrollTop: 1234 };
  const calls = [];
  const scroller = { scrollTo: (options) => calls.push(options) };
  const context = {
    getConnectedNativeButton: () => null,
    scrollToRememberedGroupDestination:
      ChatGPTTOC.prototype.scrollToRememberedGroupDestination,
    getConversationScrollContainer: () => scroller,
    loadEarlierConversationTurns() { throw new Error('must not jump to the oldest turn'); }
  };

  assert.equal(ChatGPTTOC.prototype.retryGroupRecovery.call(context, group), true);
  assert.deepEqual(calls, [{ top: 1234, behavior: 'auto' }]);
});

test('navigation settling corrects a native TOC scroll that lands on the wrong response', () => {
  const previousWindow = globalThis.window;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const scrollCalls = [];
  const continuationCalls = [];
  globalThis.window = { innerHeight: 1200 };
  globalThis.requestAnimationFrame = (callback) => callback();
  const scroller = {
    scrollTop: 100,
    scrollTo: (options) => scrollCalls.push(options)
  };
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
  }

  assert.deepEqual(scrollCalls, [{ top: 880, behavior: 'auto' }]);
  assert.deepEqual(continuationCalls, [0]);
  assert.equal(context.pendingNavigationRequestId, 3);
});

test('only a user followed by its first assistant creates a response pair', () => {
  const message = (role, id) => ({ id, matches: (selector) => selector === `[data-message-author-role="${role}"]` });
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
    { prompt: firstPrompt, assistant: firstAssistant },
    { prompt: secondPrompt, assistant: secondAssistant }
  ]);
});

test('virtualized messages with different prompt indices are not paired', () => {
  const createMessage = (role, id) => ({
    id,
    matches: (selector) => selector === `[data-message-author-role="${role}"]`
  });
  const prompt = createMessage('user', 'prompt');
  const assistant = createMessage('assistant', 'assistant');
  const indexes = new Map([[prompt, 1], [assistant, 4]]);

  assert.deepEqual(
    pairConversationMessages([prompt, assistant], () => null, (item) => indexes.get(item) ?? null),
    []
  );
});

test('remounted assistants with the same stable turn key are deduplicated', () => {
  const message = (role, id, turnKey) => ({
    id,
    turnKey,
    matches: (selector) => selector === `[data-message-author-role="${role}"]`
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

test('group tracking uses assistant coverage and ignores a far offscreen prompt fragment', () => {
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
      contains: (element) => live.has(element),
      querySelectorAll: () => [assistant]
    },
    nativeIndexToGroup: new Map([[1, group]]),
    turnToGroup: new Map([[assistant, staleMappedGroup]]),
    getPromptIndexFromElement: (element) => element === assistant || element === prompt ? 1 : 0,
    isLiveConversationElement: ChatGPTTOC.prototype.isLiveConversationElement
  };

  assert.deepEqual(ChatGPTTOC.prototype.getLiveGroupRanges.call(context, 900), [
    { group, assistant, top: -450, bottom: 700 }
  ]);
});

test('active tracking keeps the current hierarchy selection during a transient remount gap', () => {
  const group = { id: 'current-group' };
  const heading = { id: 'current-heading' };
  const updates = [];
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { innerHeight: 900 };
    ChatGPTTOC.prototype.updateActiveFromScrollPosition.call({
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
  assert.match(source, /STRUCTURE_SETTLE_DELAY/);
  assert.match(source, /turnKeyToGroup/);
  assert.match(source, /getStableTurnKey/);
  assert.match(source, /scrollToDestination/);
  assert.match(source, /flashDestination/);
  assert.match(source, /syncNativeToc/);
  assert.match(source, /syncNativeTurns/);
  assert.match(source, /nativeButton\.click\(\)/);
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
  assert.match(source, /removeNonNativeGroups/);
  assert.match(source, /reconcileNativeTocItems/);
  assert.match(source, /syncConversationStructure\(\{ nativeTocReady: true \}\)/);
  assert.doesNotMatch(source, /nativeTocItems\.clear\(\)/);
  assert.match(source, /closest\?\.\(SELECTORS\.conversationTurn\)/);
  assert.match(source, /dataset\.tocVersion/);
  assert.match(source, /classList\.remove\('toc-h1', 'toc-h2', 'toc-h3', 'toc-h4', 'toc-h5', 'toc-h6'\)/);
  assert.doesNotMatch(source, /item\.className\s*=\s*`toc-item toc-h/);
  assert.doesNotMatch(source, /nativeLabel/);
  assert.doesNotMatch(source, /attributeFilter: \[[^\]]*aria-label/);
  assert.doesNotMatch(source, /Response without a preceding prompt/);
});
