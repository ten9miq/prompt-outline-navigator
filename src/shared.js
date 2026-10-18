// Shared constants and side-effect-free helpers for Prompt Outline Navigator.
(() => {
  'use strict';

  const api = {
    SELECTORS: Object.freeze({
      thread: '[data-chatgpt-conversation-selection-target="true"][data-thread-find-target="conversation"],#thread',
      main: 'main',
      userMessage: '[data-message-author-role="user"],[data-chatgpt-search-unit-key][data-chatgpt-search-message-ids]:is(:has([data-user-message-bubble="true"]),[class~="group/user-message"])',
      promptText: '.whitespace-pre-wrap',
      assistantMessage: '[data-message-author-role="assistant"],[data-chatgpt-search-unit-key]:has([data-conversation-role="assistant"])',
      headings: 'h1,h2,h3,h4,h5,h6,[role="heading"][aria-level]',
      stableTurn: '[data-message-id],[data-turn-id],[data-turn-key]',
      conversationTurn: '[data-testid^="conversation-turn-"],[data-turn-key]',
      conversationScroll: '[data-app-action-timeline-scroll]',
      threadComposer: '[data-chatgpt-composer][data-composer-placement="thread"]',
      composer: '[data-chatgpt-composer],[data-thread-find-composer]',
      assistantContent: '[data-markdown-text-style="assistant-message"]',
      conversationIdentity: '[data-chatgpt-selection-conversation-id]',
      userPromptContent: '[data-user-message-bubble="true"]'
    }),
    PROMPT_LIMIT: 200,
    ACTIVE_ROOT_MARGIN: '0px 0px -90% 0px',
    STRUCTURE_SETTLE_DELAY: 120,
    NAVIGATION_RECOVERY_FRAMES: 300,
    TOC_TAIL_THRESHOLD: 8,
    SIDEBAR_VISIBILITY_KEY: 'sidebarVisible',
    SIDEBAR_WIDTH_KEY: 'sidebarWidth'
  };

  api.truncateText = (value, limit = api.PROMPT_LIMIT) => {
    const text = String(value || '').trim();
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  };

  api.getPromptText = (prompt) => {
    if (!prompt) return '';
    const observedBody = prompt.querySelector?.(api.SELECTORS.userPromptContent);
    const body = observedBody || prompt.querySelector?.(api.SELECTORS.promptText);
    if (body) return api.truncateText(body.textContent);
    return typeof prompt.querySelector === 'function' ? '' : api.truncateText(prompt.textContent);
  };

  api.EDITOR_SELECTOR = '[data-markdown-copy-content] .ProseMirror:not([data-composer-markdown])';
  const outlineMetadata = new WeakMap();
  const isOutlineContent = (element) => !element.hasAttribute('data-conversation-role') &&
    !element.closest?.('[hidden],[aria-hidden="true"],[inert],nav,button,[data-composer-markdown],[class*="PagePreview-"],[class*="PageThumbnail-"]');
  api.getOutlineText = (element) => outlineMetadata.get(element)?.text ?? element.textContent.trim();
  api.getOutlineLevel = (element) => outlineMetadata.get(element)?.level ??
    Math.max(1, Math.min(6, Number(element.getAttribute?.('aria-level') || element.tagName.slice(1)) || 1));
  const getFirstContentLine = (element) => {
    if (!element) return '';
    // textContent drops <br> boundaries. Work on a detached copy so the editor
    // and its selection are never changed while deriving the fallback label.
    const copy = element.cloneNode(true);
    copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    copy.querySelectorAll('p,div,li,blockquote,pre').forEach((block) => block.append('\n'));
    return copy.textContent.split(/\r\n|[\n\r\u2028\u2029]/).map((line) => line.trim()).find(Boolean) || '';
  };
  api.getEditorTitle = (editor) => {
    const card = editor.closest?.('[class~="group/writing-block-surface"]');
    const subject = card?.querySelector('textarea')?.value?.trim();
    const heading = Array.from(editor.querySelectorAll('h1,[role="heading"][aria-level="1"]'))
      .find(isOutlineContent)?.textContent.trim();
    if (subject || heading) return api.truncateText(subject || heading);
    for (const paragraph of editor.querySelectorAll('p')) {
      if (!isOutlineContent(paragraph)) continue;
      const opening = getFirstContentLine(paragraph);
      if (opening) return api.truncateText(opening, 80);
    }
    return api.truncateText(getFirstContentLine(editor) || 'Untitled document', 80);
  };
  api.collectOutlineTargets = (root) => {
    const targets = Array.from(root.querySelectorAll(api.SELECTORS.headings)).filter(isOutlineContent);
    targets.forEach((element) => outlineMetadata.delete(element));
    const editors = [root, ...root.querySelectorAll(api.EDITOR_SELECTOR)]
      .filter((element) => element.matches?.(api.EDITOR_SELECTOR) && isOutlineContent(element));
    for (const editor of editors) {
      const headings = targets.filter((element) => editor.contains(element));
      const title = api.getEditorTitle(editor);
      const firstHeading = headings[0];
      // A real level-one heading already serves as the document entry.
      const hasTitleHeading = firstHeading && api.getOutlineLevel(firstHeading) === 1 &&
        api.getOutlineText(firstHeading) === title;
      if (!hasTitleHeading) {
        outlineMetadata.set(editor, { text: title, level: 1 });
        targets.push(editor);
        headings.forEach((element) => outlineMetadata.set(element, {
          text: element.textContent.trim(), level: Math.min(6, api.getOutlineLevel(element) + 1)
        }));
      }
      if (!headings.length) {
        for (const paragraph of editor.querySelectorAll('p')) {
          const text = paragraph.textContent.trim();
          const bold = paragraph.querySelector('strong,b');
          if (!isOutlineContent(paragraph) || paragraph.closest('blockquote,pre,table,li') ||
              !bold || bold.textContent.trim() !== text || text.length > 100 ||
              !/^(?:\d+[.．、)）:：]|[（(]\d+[)）])\s*\S/.test(text)) continue;
          outlineMetadata.set(paragraph, { text, level: 2 });
          targets.push(paragraph);
        }
      }
    }
    return [...new Set(targets)].sort((left, right) => left === right ? 0 :
      left.compareDocumentPosition?.(right) & 2 ? 1 : -1);
  };

  api.elementMatchesOrContains = (node, selector) =>
    node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)));

  api.findConversationRoot = (doc = document) => {
    const candidates = Array.from(doc.querySelectorAll(api.SELECTORS.thread));
    if (!candidates.length) return null;
    const getStyle = doc.defaultView?.getComputedStyle?.bind(doc.defaultView) ||
      (typeof getComputedStyle === 'function' ? getComputedStyle : null);
    const visible = candidates.filter((element) => {
      const rects = element.getClientRects?.();
      if (rects && rects.length === 0) return false;
      const style = getStyle?.(element);
      return style?.display !== 'none' && style?.visibility !== 'hidden';
    });
    if (!visible.length) return null;
    const turnCount = (element) => element.querySelectorAll?.(api.SELECTORS.conversationTurn).length || 0;
    return visible.reduce((best, element) => turnCount(element) > turnCount(best) ? element : best);
  };

  api.hasVisibleDialog = (doc = document, documentRoot = null) => Array.from(
    doc.querySelectorAll('dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]')
  ).some((element) => {
    if (documentRoot && element.contains(documentRoot)) return false;
    if (element.closest('[hidden],[aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    const style = doc.defaultView.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  });

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

  api.isTocScrolledToEnd = (scrollTop, scrollHeight, clientHeight, threshold = api.TOC_TAIL_THRESHOLD) =>
    scrollHeight - clientHeight - scrollTop <= threshold;

  api.findActiveTrackingTarget = (targets, activationY) => {
    const orderedTargets = targets
      .map((target) => ({ target, top: target.element.getBoundingClientRect().top }))
      .sort((left, right) => left.top - right.top);
    let low = 0;
    let high = orderedTargets.length - 1;
    let active = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (orderedTargets[middle].top <= activationY) {
        active = orderedTargets[middle].target;
        low = middle + 1;
      } else high = middle - 1;
    }
    return active;
  };

  api.findActiveGroupRange = (ranges, activationY, maxGap) => {
    const orderedRanges = [...ranges].sort((left, right) =>
      left.top - right.top || left.bottom - right.bottom
    );
    let containing = null;
    let preceding = null;
    for (const range of orderedRanges) {
      if (range.top <= activationY) preceding = range;
      if (range.top <= activationY && range.bottom >= activationY) containing = range;
      if (range.top > activationY) break;
    }
    if (containing) return containing;
    return preceding && activationY - preceding.bottom <= maxGap ? preceding : null;
  };

  api.findRemountedHeading = (headings, descriptor) => {
    const indexed = headings?.[descriptor.index];
    if (indexed?.isConnected && indexed.tagName === descriptor.tagName) return indexed;
    return headings?.find((candidate) => candidate.isConnected &&
      candidate.tagName === descriptor.tagName && api.getOutlineText(candidate) === descriptor.text) || null;
  };

  api.shouldPreserveDisconnectedGroup = (group) => Boolean(group?.key);

  api.getConversationIdentity = (thread, pathname = '') => {
    const conversationId = thread?.querySelector?.(api.SELECTORS.conversationIdentity)
      ?.getAttribute?.('data-chatgpt-selection-conversation-id');
    return conversationId ? `conversation:${conversationId}` : `path:${pathname}`;
  };

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

  api.createPinIcon = (pinned) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = pinned
      ? 'M16 3H8l1 7-3 4v2h12v-2l-3-4 1-7M12 16v5'
      : 'M16 3h-5m4 4 .4-2.8M9.5 9.5 9 10l-3 4v2h10M12 16v5M3 3l18 18';
    for (const [name, value] of Object.entries({ d, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) path.setAttribute(name, value);
    svg.append(path);
    return svg;
  };

  globalThis.TOCNavigator = Object.assign(globalThis.TOCNavigator || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
