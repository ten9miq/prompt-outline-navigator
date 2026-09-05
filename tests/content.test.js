const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = path.join(__dirname, '..', 'content.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const {
  SELECTORS,
  truncateText,
  pairConversationMessages,
  getNavigationOffset,
  findActiveTrackingTarget
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
  assert.match(source, /allAssistants\.filter\(\(assistant\) => this\.turnToGroup\.has\(assistant\)\)/);
  assert.match(source, /STRUCTURE_SETTLE_DELAY/);
  assert.match(source, /scrollToDestination/);
  assert.match(source, /flashDestination/);
});
