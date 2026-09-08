// Shared constants and side-effect-free helpers for Prompt Outline Navigator.
(() => {
  'use strict';

  const api = {
    SELECTORS: Object.freeze({
      thread: '#thread',
      main: 'main',
      userMessage: '[data-message-author-role="user"]',
      assistantMessage: '[data-message-author-role="assistant"]',
      headings: 'h1,h2,h3,h4,h5,h6',
      turn: '[data-message-id],[data-turn-id],[data-testid^="conversation-turn-"]',
      conversationTurn: '[data-testid^="conversation-turn-"]',
      nativeTocItem: 'button[data-toc-item-index]',
      nativeTocActive: 'button[data-toc-item-index][data-toc-active]'
    }),
    PROMPT_LIMIT: 200,
    ACTIVE_ROOT_MARGIN: '0px 0px -90% 0px',
    STRUCTURE_SETTLE_DELAY: 120,
    SIDEBAR_VISIBILITY_KEY: 'sidebarVisible'
  };

  api.truncateText = (value, limit = api.PROMPT_LIMIT) => {
    const text = String(value || '').trim();
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  };

  api.elementMatchesOrContains = (node, selector) =>
    node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)));

  api.pairConversationMessages = (messages, getKey = () => null) => {
    const pairs = [];
    const keyedPairIndexes = new Map();
    let pendingPrompt = null;
    for (const message of messages) {
      if (message.matches(api.SELECTORS.userMessage)) {
        pendingPrompt = message;
        continue;
      }
      if (pendingPrompt) {
        const key = getKey(message);
        const pair = key ? { prompt: pendingPrompt, assistant: message, key } : { prompt: pendingPrompt, assistant: message };
        if (key && keyedPairIndexes.has(key)) pairs[keyedPairIndexes.get(key)] = pair;
        else {
          if (key) keyedPairIndexes.set(key, pairs.length);
          pairs.push(pair);
        }
      }
      pendingPrompt = null;
    }
    return pairs;
  };

  api.getNavigationOffset = (viewportHeight) => Math.max(72, Math.min(120, viewportHeight * 0.1));

  api.findActiveTrackingTarget = (targets, activationY) => {
    let low = 0;
    let high = targets.length - 1;
    let active = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (targets[middle].element.getBoundingClientRect().top <= activationY) {
        active = targets[middle];
        low = middle + 1;
      } else high = middle - 1;
    }
    return active;
  };

  api.resolveActiveTrackingSelection = (nativeGroup, target, groups) => {
    const group = nativeGroup || target?.group || groups[0] || null;
    return {
      group,
      heading: target?.group === group ? target.heading : null
    };
  };

  api.getNativeTocIndex = (element) => {
    const value = element?.getAttribute?.('data-toc-item-index');
    return /^\d+$/.test(value || '') ? Number(value) : null;
  };

  api.collectNativeTocItems = (elements) => {
    const items = new Map();
    for (const element of elements) {
      const index = api.getNativeTocIndex(element);
      if (index !== null && !items.has(index)) items.set(index, element);
    }
    return items;
  };

  api.getPromptIndexFromTestId = (testId, role = null) => {
    const match = /^conversation-turn-(\d+)$/.exec(testId || '');
    if (!match) return null;
    const turnIndex = Number(match[1]);
    if (role === 'user') return Math.floor(turnIndex / 2);
    if (role === 'assistant') return turnIndex > 0 && turnIndex % 2 === 0 ? (turnIndex / 2) - 1 : Math.floor(turnIndex / 2);
    return Math.max(0, Math.floor((turnIndex - 1) / 2));
  };

  api.findRemountedHeading = (headings, descriptor) => {
    const indexed = headings?.[descriptor.index];
    if (indexed?.isConnected && indexed.tagName === descriptor.tagName) return indexed;
    return headings?.find((candidate) => candidate.isConnected &&
      candidate.tagName === descriptor.tagName && candidate.textContent.trim() === descriptor.text) || null;
  };

  api.canCreateConversationGroup = (nativeIndex, nativeTocCount) => nativeIndex !== null || nativeTocCount === 0;

  api.resolveDarkTheme = (className, colorScheme, prefersDark) => {
    const classes = String(className || '').split(/\s+/);
    if (classes.includes('dark')) return true;
    if (classes.includes('light')) return false;
    const scheme = String(colorScheme || '').trim().toLowerCase();
    if (scheme === 'dark') return true;
    if (scheme === 'light') return false;
    return Boolean(prefersDark);
  };

  api.createArrow = (direction) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', direction === 'right' ? '4,3 8,6 4,9' : '3,4 6,8 9,4');
    for (const [name, value] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) polyline.setAttribute(name, value);
    svg.append(polyline);
    return svg;
  };

  api.createCloseIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const [name, value] of Object.entries({ d: 'M2.5 2.5l7 7m0-7-7 7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round' })) path.setAttribute(name, value);
    svg.append(path);
    return svg;
  };

  globalThis.TOCNavigator = Object.assign(globalThis.TOCNavigator || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
