// Shared constants and side-effect-free helpers for Prompt Outline Navigator.
(() => {
  'use strict';

  // Gemini's history pane excludes its navigation, input, and Canvas surface.
  const geminiHistory = 'infinite-scroller:is(.chat-history,[data-test-id="chat-history-container"])';
  const api = {
    SELECTORS: Object.freeze({
      thread: `[data-chatgpt-conversation-selection-target][data-thread-find-target="conversation"],#thread,${geminiHistory}`,
      main: 'main',
      userMessage: `[data-message-author-role="user"],[data-chatgpt-search-unit-key]:is(:has([data-user-message-bubble="true"]),[class~="group/user-message"]),${geminiHistory} user-query`,
      promptText: '.whitespace-pre-wrap',
      assistantMessage: `[data-message-author-role="assistant"],[data-chatgpt-search-unit-key]:has([data-conversation-role="assistant"]),[data-chatgpt-search-unit-key]:has([data-markdown-text-style="assistant-message"]),${geminiHistory} model-response model-response-content`,
      headings: 'h1,h2,h3,h4,h5,h6,[role="heading"][aria-level]',
      stableTurn: '[data-message-id],[data-turn-id],[data-turn-key]',
      conversationTurn: `[data-testid^="conversation-turn-"],[data-turn-key],${geminiHistory} .conversation-container`,
      conversationScroll: `[data-app-action-timeline-scroll],${geminiHistory}`,
      threadComposer: '[data-chatgpt-composer][data-composer-placement="thread"]',
      composer: '[data-chatgpt-composer],[data-thread-find-composer]',
      assistantContent: '[data-markdown-text-style="assistant-message"]',
      conversationIdentity: '[data-chatgpt-selection-conversation-id]',
      userPromptContent: '[data-user-message-bubble="true"]',
      geminiHistory,
      geminiPromptText: '.query-text'
    }),
    SOURCE_ATTRIBUTES: Object.freeze([
      'data-chatgpt-conversation-selection-target', 'data-thread-find-target',
      'data-chatgpt-selection-conversation-id', 'data-chatgpt-selection-message-id',
      'data-message-author-role', 'data-chatgpt-search-unit-key', 'data-chatgpt-search-message-ids',
      'data-conversation-role', 'data-user-message-bubble', 'data-markdown-text-style', 'data-markdown-copy-content', 'data-composer-markdown',
      'data-oai-writing-block-surface',
      'data-turn-key', 'data-turn-id', 'data-message-id', 'data-testid', 'data-test-id',
      'role', 'aria-level', 'hidden', 'aria-hidden', 'inert', 'class', 'id', 'aria-controls', 'aria-expanded', 'contenteditable'
    ]),
    MESSAGE_ATTRIBUTES: Object.freeze(['data-message-author-role', 'data-chatgpt-search-unit-key', 'data-chatgpt-search-message-ids',
      'data-conversation-role', 'data-user-message-bubble', 'data-markdown-text-style', 'data-message-id', 'data-turn-id', 'data-turn-key', 'data-chatgpt-selection-message-id']),
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
    if (prompt.matches?.('user-query')) {
      const body = prompt.querySelector(api.SELECTORS.geminiPromptText)?.cloneNode(true);
      if (!body) return '';
      body.querySelectorAll('.cdk-visually-hidden,.screen-reader-user-query-label').forEach((label) => label.remove());
      body.querySelectorAll('.query-text-line').forEach((line) => line.append('\n'));
      return api.truncateText(body.textContent);
    }
    const observedBody = prompt.querySelector?.(api.SELECTORS.userPromptContent);
    const body = observedBody || prompt.querySelector?.(api.SELECTORS.promptText);
    if (body) return api.truncateText(body.textContent);
    return typeof prompt.querySelector === 'function' ? '' : api.truncateText(prompt.textContent);
  };

  api.WRITING_BLOCK_SELECTOR = '[data-oai-writing-block-surface],[class~="group/writing-block-surface"]';
  api.RAW_EDITOR_SELECTOR = `:is(${api.WRITING_BLOCK_SELECTOR}) [data-markdown-copy-content]:not(.ProseMirror):not(:has(.ProseMirror))`;
  api.EDITOR_SELECTOR = `[data-markdown-copy-content] .ProseMirror:not([data-composer-markdown]),${api.RAW_EDITOR_SELECTOR}`;
  const outlineMetadata = new WeakMap();
  api.getOutlineElement = (target) => outlineMetadata.get(target)?.owner || target;
  api.isTextOutlineTarget = (target) => Boolean(outlineMetadata.get(target)?.owner);
  api.getWritingBlockRegion = (target) => {
    const owner = api.getOutlineElement(target);
    const card = owner?.closest?.(api.WRITING_BLOCK_SELECTOR);
    if (!card) return null;
    for (const button of card.querySelectorAll('button[aria-controls][aria-expanded]')) {
      if (button.closest(api.WRITING_BLOCK_SELECTOR) !== card) continue;
      const ids = button.getAttribute('aria-controls').trim().split(/\s+/);
      const region = Array.from(card.querySelectorAll('[id]')).find((element) =>
        ids.includes(element.id) && element.contains(owner));
      if (region) return { button, region, card };
    }
    return null;
  };
  api.getWritingBlockDisclosure = (target) => {
    const disclosure = api.getWritingBlockRegion(target);
    return disclosure && (disclosure.button.getAttribute('aria-expanded') === 'false' ||
      disclosure.region.hidden || disclosure.region.getAttribute('aria-hidden') === 'true') ? disclosure : null;
  };
  // Inclusion and navigability are different states: a collapsed document still
  // belongs in its prompt's outline, but must be expanded before navigation.
  api.isTocContent = (target, { allowCollapsed = false, excludeDialogs = false } = {}) => {
    const element = api.getOutlineElement(target);
    if (!element || element.closest?.(
      'nav,button,#chatgpt-toc-sidebar,[data-composer-markdown],[class*="PagePreview-"],[class*="PageThumbnail-"]'
    )) return false;
    if (excludeDialogs && element.closest?.('[role="dialog"],[role="alertdialog"]')) return false;
    const disclosure = allowCollapsed ? api.getWritingBlockDisclosure(element) : null;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor === disclosure?.region) continue;
      if (ancestor.hasAttribute?.('hidden') || ancestor.getAttribute?.('aria-hidden') === 'true') return false;
    }
    const anchor = disclosure?.card || element;
    if (anchor.getClientRects?.().length === 0) return false;
    const getStyle = element.ownerDocument?.defaultView?.getComputedStyle;
    const style = getStyle?.call(element.ownerDocument.defaultView, anchor);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  };
  const isOutlineContent = (element) => !element.hasAttribute('data-conversation-role') &&
    api.isTocContent(element, { allowCollapsed: true });
  api.getOutlineText = (element) => outlineMetadata.get(element)?.text ?? element.textContent.trim();
  api.getOutlineLevel = (element) => outlineMetadata.get(element)?.level ??
    Math.max(1, Math.min(6, Number(element.getAttribute?.('aria-level') || element.tagName.slice(1)) || 1));
  api.parseMarkdownHeadings = (text) => {
    const headings = [];
    let fence = null;
    for (const match of text.matchAll(/[^\r\n]*(?:\r\n|[\r\n]|$)/g)) {
      const line = match[0].replace(/[\r\n]+$/, '');
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        continue;
      }
      if (marker) { fence = marker[1]; continue; }
      const heading = line.match(/^ {0,3}(#{1,6})[\t ]+(.+?)\s*$/);
      if (!heading) continue;
      const label = heading[2].replace(/[\t ]+#+[\t ]*$/, '').trim();
      if (label) headings.push({ text: label, level: heading[1].length, start: match.index, end: match.index + line.length });
    }
    return headings;
  };
  const textOutlineCache = new WeakMap();
  // Keep React/editor-owned text untouched. Ranges supply heading-line geometry;
  // the owning block supplies DOM operations such as destination highlighting.
  const collectTextOutlineTargets = (owner) => {
    if (owner.children.length) return [];
    const text = owner.textContent;
    const cached = textOutlineCache.get(owner);
    if (cached?.text === text && cached.targets.every((target) => target.isConnected)) {
      cached.targets.forEach((target) => { outlineMetadata.get(target).level = outlineMetadata.get(target).baseLevel; });
      return cached.targets;
    }
    const nodes = [];
    const walker = owner.ownerDocument.createTreeWalker(owner, 4 /* SHOW_TEXT */);
    let node, offset = 0;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: offset, end: offset + node.length });
      offset += node.length;
    }
    const targets = api.parseMarkdownHeadings(text).map((heading) => {
      const first = nodes.find((part) => part.end > heading.start);
      const last = nodes.find((part) => part.end >= heading.end);
      const range = owner.ownerDocument.createRange();
      range.setStart(first.node, heading.start - first.start);
      range.setEnd(last.node, heading.end - last.start);
      const target = {
        tagName: `H${heading.level}`,
        get isConnected() { return owner.isConnected && !range.collapsed && range.startContainer.nodeType === 3 && owner.contains(range.startContainer); },
        closest: (selector) => owner.closest(selector),
        getBoundingClientRect: () => range.getBoundingClientRect()
      };
      outlineMetadata.set(target, { ...heading, baseLevel: heading.level, owner });
      return target;
    });
    textOutlineCache.set(owner, { text, targets });
    return targets;
  };
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
    const card = editor.closest?.(api.WRITING_BLOCK_SELECTOR);
    const subject = card?.querySelector('textarea')?.value?.trim();
    const heading = Array.from(editor.querySelectorAll('h1,[role="heading"][aria-level="1"]'))
      .find(isOutlineContent)?.textContent.trim();
    if (subject || heading) return api.truncateText(subject || heading);
    if (editor.matches?.(api.RAW_EDITOR_SELECTOR) && !editor.children.length) {
      const opening = getFirstContentLine(editor);
      return api.truncateText(api.parseMarkdownHeadings(opening)[0]?.text || opening || 'Untitled document', 80);
    }
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
      targets.push(...collectTextOutlineTargets(editor));
      const headings = targets.filter((element) => editor.contains(api.getOutlineElement(element)));
      const title = api.getEditorTitle(editor);
      const firstHeading = headings[0];
      // A real level-one heading already serves as the document entry.
      const hasTitleHeading = firstHeading && api.getOutlineLevel(firstHeading) === 1 &&
        api.getOutlineText(firstHeading) === title;
      if (!hasTitleHeading) {
        outlineMetadata.set(editor, { text: title, level: 1 });
        targets.push(editor);
        headings.forEach((element) => outlineMetadata.set(element, {
          ...outlineMetadata.get(element), text: api.getOutlineText(element), level: Math.min(6, api.getOutlineLevel(element) + 1)
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
    return [...new Set(targets)].sort((left, right) => {
      const leftOwner = api.getOutlineElement(left), rightOwner = api.getOutlineElement(right);
      if (leftOwner === rightOwner) return (outlineMetadata.get(left)?.start ?? -1) - (outlineMetadata.get(right)?.start ?? -1);
      return leftOwner.compareDocumentPosition?.(rightOwner) & 2 ? 1 : -1;
    });
  };

  api.elementMatchesOrContains = (node, selector) =>
    node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)));

  api.findConversationRoot = (doc = document) => {
    const visible = Array.from(doc.querySelectorAll(api.SELECTORS.thread))
      .filter((element) => api.isTocContent(element, { excludeDialogs: true }));
    const turnCount = (element) => (element.querySelectorAll?.(api.SELECTORS.conversationTurn).length || 0) +
      (element.querySelectorAll?.(`${api.SELECTORS.userMessage},${api.SELECTORS.assistantMessage}`).length || 0);
    const populated = visible.filter((element) => turnCount(element));
    if (populated.length) return populated.reduce((best, element) => turnCount(element) > turnCount(best) ? element : best);
    // A scroll pane can contain cached roots from other conversations. Use it
    // only when no populated, explicit conversation root is available.
    const fallback = Array.from(doc.querySelectorAll(api.SELECTORS.conversationScroll)).find((element) =>
      api.isTocContent(element, { excludeDialogs: true }) && api.collectConversationMessages(element).length);
    return fallback || visible[0] || null;
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

  api.pairConversationMessages = (messages, getKey = () => null, getScope = null) => {
    const pairs = [];
    const keyedPairIndexes = new Map();
    let pendingPrompt = null;
    let previousAssistant = null;
    for (const message of messages) {
      if (message.matches(api.SELECTORS.userMessage)) {
        pendingPrompt = message;
        previousAssistant = null;
        continue;
      }
      // An attachment prompt may not be recognized yet, or its DOM may already
      // be virtualized away. Neither should suppress a rendered response.
      if (previousAssistant && getScope && (!getScope(message) || getScope(message) !== getScope(previousAssistant))) pendingPrompt = null;
      const key = getKey(message);
      const pair = key ? { prompt: pendingPrompt, assistant: message, key } : { prompt: pendingPrompt, assistant: message };
      if (key && keyedPairIndexes.has(key)) pairs[keyedPairIndexes.get(key)] = pair;
      else {
        if (key) keyedPairIndexes.set(key, pairs.length);
        pairs.push(pair);
      }
      previousAssistant = message;
    }
    return pairs;
  };

  api.collectConversationMessages = (root) => Array.from(root.querySelectorAll(
    `${api.SELECTORS.userMessage},${api.SELECTORS.assistantMessage}`
  )).filter((message) => {
    if (!api.isTocContent(message, { excludeDialogs: true })) return false;
    // Modern search-unit wrappers can contain legacy author-role wrappers.
    // Treat the outer message as the owner, rather than pairing both copies.
    const selector = message.matches(api.SELECTORS.userMessage) ? api.SELECTORS.userMessage : api.SELECTORS.assistantMessage;
    const owner = message.parentElement?.closest(selector);
    return !owner || !root.contains(owner);
  });

  api.getConversationMessageOwner = (element, selector, root) => {
    let owner = element.closest?.(selector);
    if (!owner || !root?.contains(owner)) return null;
    for (let parent = owner.parentElement?.closest(selector); parent && root.contains(parent); parent = owner.parentElement?.closest(selector)) owner = parent;
    return owner;
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
    if (descriptor.element?.isConnected && headings?.includes(descriptor.element)) return descriptor.element;
    const indexed = headings?.[descriptor.index];
    const matches = headings?.filter((candidate) => candidate.isConnected &&
      candidate.tagName === descriptor.tagName && api.getOutlineText(candidate) === descriptor.text) || [];
    if (descriptor.occurrence != null) return matches[descriptor.occurrence] || null;
    return matches.includes(indexed) ? indexed : matches[0] || null;
  };

  api.describeOutlineTarget = (heading, headings = []) => ({
    element: heading, index: headings.indexOf(heading), tagName: heading.tagName, text: api.getOutlineText(heading),
    occurrence: headings.filter((candidate) => candidate.tagName === heading.tagName &&
      api.getOutlineText(candidate) === api.getOutlineText(heading)).indexOf(heading)
  });

  // Gemini can replace history after the URL has changed. Its disconnected
  // turns cannot safely be distinguished from a previous conversation, so only
  // ChatGPT's supported virtualized history is cached across disconnections.
  api.shouldPreserveDisconnectedGroup = (group, source = null) => Boolean(group?.key) &&
    !source?.root?.matches?.(api.SELECTORS.geminiHistory);

  api.getConversationIdentity = (thread, pathname = '') => {
    const selectionId = thread?.getAttribute?.('data-chatgpt-conversation-selection-target');
    const identities = thread?.querySelectorAll?.(api.SELECTORS.conversationIdentity);
    const renderedIdentity = identities?.length ? Array.from(identities).find((element) => api.isTocContent(element))
      : thread?.querySelector?.(api.SELECTORS.conversationIdentity);
    const conversationId = (selectionId && !['true', 'false'].includes(selectionId) ? selectionId : null) ||
      renderedIdentity?.getAttribute?.('data-chatgpt-selection-conversation-id');
    return conversationId ? `conversation:${conversationId}` : `path:${pathname}`;
  };

  api.resolveDarkTheme = (className, colorScheme, prefersDark) => {
    const classes = String(className || '').split(/\s+/);
    if (classes.includes('dark') || classes.includes('dark-theme')) return true;
    if (classes.includes('light') || classes.includes('light-theme')) return false;
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
