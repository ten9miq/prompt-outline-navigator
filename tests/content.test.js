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
  pairConversationMessages,
  getNavigationOffset,
  findActiveTrackingTarget,
  getNativeTocIndex,
  collectNativeTocItems,
  getPromptIndexFromTestId,
  findRemountedHeading,
  canCreateConversationGroup,
  resolveDarkTheme,
  SIDEBAR_VISIBILITY_KEY
} = require(sourcePath);

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

test('DOM-dependent selectors are centralized', () => {
  assert.equal(SELECTORS.thread, '#thread');
  assert.equal(SELECTORS.assistantMessage, '[data-message-author-role="assistant"]');
  assert.equal(SELECTORS.headings, 'h1,h2,h3,h4,h5,h6');
  assert.equal(SELECTORS.conversationTurn, '[data-testid^="conversation-turn-"]');
  assert.equal(SELECTORS.nativeTocItem, 'button[data-toc-item-index]');
  assert.equal(SELECTORS.nativeTocActive, 'button[data-toc-item-index][data-toc-active]');
});

test('sidebar heading uses the extension branding', () => {
  assert.match(source, /title\.textContent = 'Prompt Outline Navigator'/);
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
  assert.equal(findActiveTrackingTarget([first, previous, current, next], 50), previous);
  assert.equal(findActiveTrackingTarget([first, previous, current, next], -900), null);
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
  assert.match(source, /pendingNavigationRequestId/);
  assert.match(source, /removeNonNativeGroups/);
  assert.match(source, /reconcileNativeTocItems/);
  assert.match(source, /syncConversationStructure\(\{ nativeTocReady: true \}\)/);
  assert.doesNotMatch(source, /nativeTocItems\.clear\(\)/);
  assert.match(source, /closest\?\.\(SELECTORS\.conversationTurn\)/);
  assert.match(source, /dataset\.tocVersion/);
  assert.doesNotMatch(source, /nativeLabel/);
  assert.doesNotMatch(source, /attributeFilter: \[[^\]]*aria-label/);
  assert.doesNotMatch(source, /Response without a preceding prompt/);
});
