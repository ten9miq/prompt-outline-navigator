// TOC Navigator for ChatGPT
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    thread: '#thread',
    main: 'main',
    userMessage: '[data-message-author-role="user"]',
    assistantMessage: '[data-message-author-role="assistant"]',
    headings: 'h1,h2,h3,h4,h5,h6',
    turn: '[data-message-id],[data-turn-id],[data-testid^="conversation-turn-"]',
    nativeTocItem: 'button[data-toc-item-index]',
    nativeTocActive: 'button[data-toc-item-index][data-toc-active]'
  });

  const PROMPT_LIMIT = 200;
  const ACTIVE_ROOT_MARGIN = '0px 0px -90% 0px';
  const STRUCTURE_SETTLE_DELAY = 120;

  function truncateText(value, limit = PROMPT_LIMIT) {
    const text = String(value || '').trim();
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  function elementMatchesOrContains(node, selector) {
    return node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)));
  }

  function pairConversationMessages(messages, getKey = () => null) {
    const pairs = [];
    const keyedPairIndexes = new Map();
    let pendingPrompt = null;
    for (const message of messages) {
      if (message.matches(SELECTORS.userMessage)) {
        pendingPrompt = message;
        continue;
      }
      if (pendingPrompt) {
        const key = getKey(message);
        const pair = key
          ? { prompt: pendingPrompt, assistant: message, key }
          : { prompt: pendingPrompt, assistant: message };
        if (key && keyedPairIndexes.has(key)) {
          pairs[keyedPairIndexes.get(key)] = pair;
        } else {
          if (key) keyedPairIndexes.set(key, pairs.length);
          pairs.push(pair);
        }
      }
      pendingPrompt = null;
    }
    return pairs;
  }

  function getNavigationOffset(viewportHeight) {
    return Math.max(72, Math.min(120, viewportHeight * 0.1));
  }

  function findActiveTrackingTarget(targets, activationY) {
    let low = 0;
    let high = targets.length - 1;
    let active = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (targets[middle].element.getBoundingClientRect().top <= activationY) {
        active = targets[middle];
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return active;
  }

  function getNativeTocIndex(element) {
    const value = element?.getAttribute?.('data-toc-item-index');
    if (!/^\d+$/.test(value || '')) return null;
    return Number(value);
  }

  function collectNativeTocItems(elements) {
    const items = new Map();
    for (const element of elements) {
      const index = getNativeTocIndex(element);
      if (index !== null && !items.has(index)) items.set(index, element);
    }
    return items;
  }

  function getPromptIndexFromTestId(testId) {
    const match = /^conversation-turn-(\d+)$/.exec(testId || '');
    return match ? Math.floor(Number(match[1]) / 2) : null;
  }

  function createArrow(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', direction === 'right' ? '4,3 8,6 4,9' : '3,4 6,8 9,4');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'currentColor');
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.append(polyline);
    return svg;
  }

  class ChatGPTTOC {
    constructor() {
      this.sidebar = null;
      this.tocContent = null;
      this.toggleButton = null;
      this.thread = null;
      this.appRoot = null;
      this.isVisible = true;

      this.groups = [];
      this.turnToGroup = new WeakMap();
      this.turnKeyToGroup = new Map();
      this.nativeIndexToGroup = new Map();
      this.nativeTocItems = new Map();
      this.promptToGroups = new WeakMap();
      this.headingToGroup = new WeakMap();
      this.headingToTocItem = new WeakMap();
      this.tocItemToHeading = new WeakMap();
      this.collapsedGroups = new WeakSet();
      this.collapsedHeadings = new WeakSet();
      this.destinationHighlightTimers = new WeakMap();

      this.activeHeading = null;
      this.activeGroup = null;
      this.activeUpdateFrame = null;
      this.structureSyncTimer = null;
      this.threadBindFrame = null;
      this.nativeSyncFrame = null;
      this.navigationRequestId = 0;
      this.pendingNavigationRequestId = null;
      this.boundScheduleActiveUpdate = () => this.scheduleActiveUpdate();

      this.conversationObserver = null;
      this.pageObserver = null;
      this.nativeTocObserver = null;
      this.themeObserver = null;
      this.headingObserver = this.createPositionObserver();
      this.promptObserver = this.createPositionObserver();

      this.init();
    }

    init() {
      this.createSidebar();
      this.addToggleButton();
      this.setSidebarVisible(true, { focus: false });
      this.observePage();
      this.observeTheme();
      this.observePositionChanges();
      this.observeNativeToc();
      this.bindCurrentThread();
    }

    createSidebar() {
      this.sidebar = document.createElement('aside');
      this.sidebar.id = 'chatgpt-toc-sidebar';
      this.sidebar.setAttribute('aria-labelledby', 'chatgpt-toc-title');

      const header = document.createElement('div');
      header.className = 'toc-header';

      const title = document.createElement('h2');
      title.id = 'chatgpt-toc-title';
      title.className = 'toc-title';
      title.textContent = 'Table of Contents';

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'toc-close';
      closeButton.setAttribute('aria-label', 'Close table of contents');
      closeButton.textContent = '×';
      closeButton.addEventListener('click', () => this.setSidebarVisible(false));

      this.tocContent = document.createElement('nav');
      this.tocContent.id = 'chatgpt-toc-content';
      this.tocContent.className = 'toc-content';
      this.tocContent.setAttribute('aria-label', 'Table of contents navigation');
      this.tocContent.addEventListener('click', (event) => this.handleTocClick(event));
      this.tocContent.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') &&
            event.target.matches('.toc-item, .toc-group-header')) {
          event.preventDefault();
          this.handleTocClick(event);
        }
      });

      header.append(title, closeButton);
      this.sidebar.append(header, this.tocContent);
      document.body.append(this.sidebar);
      this.showStatus('Waiting for a conversation…', 'toc-loading');
    }

    addToggleButton() {
      this.toggleButton = document.createElement('button');
      this.toggleButton.type = 'button';
      this.toggleButton.id = 'chatgpt-toc-toggle';
      this.toggleButton.title = 'Open Table of Contents';
      this.toggleButton.setAttribute('aria-label', 'Open table of contents');
      this.toggleButton.setAttribute('aria-controls', this.sidebar.id);
      this.toggleButton.textContent = '📋 TOC';
      this.toggleButton.addEventListener('click', () => this.setSidebarVisible(true));
      document.body.append(this.toggleButton);
    }

    setSidebarVisible(visible, options = {}) {
      this.isVisible = visible;
      this.sidebar.classList.toggle('is-open', visible);
      this.sidebar.setAttribute('aria-hidden', String(!visible));
      this.toggleButton.hidden = visible;
      this.toggleButton.setAttribute('aria-expanded', String(visible));
      document.body.classList.toggle('chatgpt-toc-open', visible);
      this.refreshAppRoot();

      if (visible && options.focus !== false) {
        this.sidebar.querySelector('.toc-close')?.focus();
      }
    }

    refreshAppRoot() {
      const main = document.querySelector(SELECTORS.main);
      if (!main) return;

      let candidate = main;
      while (candidate.parentElement && candidate.parentElement !== document.body) {
        candidate = candidate.parentElement;
      }

      if (candidate === this.sidebar || candidate === this.toggleButton) return;
      if (this.appRoot && this.appRoot !== candidate) {
        this.appRoot.classList.remove('chatgpt-toc-app-root');
      }
      this.appRoot = candidate;
      this.appRoot.classList.add('chatgpt-toc-app-root');
    }

    observePage() {
      this.pageObserver = new MutationObserver((records) => {
        const threadChanged = !this.thread?.isConnected || records.some((record) =>
          [...record.addedNodes, ...record.removedNodes]
            .some((node) => elementMatchesOrContains(node, SELECTORS.thread))
        );
        if (!threadChanged && this.appRoot?.isConnected) return;
        if (this.threadBindFrame !== null) return;
        this.threadBindFrame = requestAnimationFrame(() => {
          this.threadBindFrame = null;
          this.refreshAppRoot();
          this.bindCurrentThread();
        });
      });
      this.pageObserver.observe(document.body, { childList: true, subtree: true });
    }

    bindCurrentThread() {
      const nextThread = document.querySelector(SELECTORS.thread);
      if (nextThread === this.thread) return;

      this.conversationObserver?.disconnect();
      this.clearConversation();
      this.thread = nextThread;

      if (!this.thread) {
        this.showStatus('Waiting for a conversation…', 'toc-loading');
        return;
      }

      this.nativeTocItems = collectNativeTocItems(document.querySelectorAll(SELECTORS.nativeTocItem));
      this.scanConversation();
      this.syncNativeToc();
      this.conversationObserver = new MutationObserver((records) => this.handleConversationMutations(records));
      this.conversationObserver.observe(this.thread, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    scanConversation() {
      const responsePairs = this.collectResponsePairs();
      responsePairs.forEach(({ assistant, prompt, key }, index) => {
        const nativeIndex = this.resolveNativeIndex(prompt, assistant, index, responsePairs.length);
        const group = (key && this.turnKeyToGroup.get(key)) ||
          this.turnToGroup.get(assistant) ||
          (nativeIndex !== null && this.nativeIndexToGroup.get(nativeIndex));
        if (group) this.bindGroupToTurn(group, assistant, prompt, key || null);
        else this.addGroup(assistant, index, prompt, key || null, nativeIndex);
      });
      this.updateGroupOrderAndLabels();
      this.updateEmptyState();
      this.scheduleActiveUpdate();
    }

    collectResponsePairs() {
      const messages = this.thread.querySelectorAll(`${SELECTORS.userMessage},${SELECTORS.assistantMessage}`);
      return pairConversationMessages(messages, (assistant) => this.getStableTurnKey(assistant));
    }

    getStableTurnKey(message) {
      if (!message) return null;
      const turn = message.closest(SELECTORS.turn);
      if (!turn) return null;
      const messageId = turn.getAttribute('data-message-id');
      if (messageId) return `message:${messageId}`;
      const turnId = turn.getAttribute('data-turn-id');
      if (turnId) return `turn:${turnId}`;
      const testId = turn.getAttribute('data-testid');
      return testId?.startsWith('conversation-turn-') ? `test:${testId}` : null;
    }

    getPromptIndexFromElement(element) {
      const turn = element?.closest?.(SELECTORS.turn);
      return getPromptIndexFromTestId(turn?.getAttribute('data-testid'));
    }

    resolveNativeIndex(prompt, assistant, fallbackIndex, pairCount) {
      if (!this.nativeTocItems.size) return null;
      const parsed = this.getPromptIndexFromElement(prompt) ?? this.getPromptIndexFromElement(assistant);
      if (parsed !== null && this.nativeTocItems.has(parsed)) return parsed;
      return pairCount === this.nativeTocItems.size && this.nativeTocItems.has(fallbackIndex)
        ? fallbackIndex
        : null;
    }

    observeNativeToc() {
      this.nativeTocObserver = new MutationObserver((records) => {
        let activeChanged = false;
        const structureChanged = records.some((record) => {
          if (record.type === 'attributes') {
            if (!record.target.matches?.(SELECTORS.nativeTocItem)) return false;
            if (record.attributeName === 'data-toc-active') {
              activeChanged = true;
              return false;
            }
            return true;
          }
          return [...record.addedNodes, ...record.removedNodes]
            .some((node) => elementMatchesOrContains(node, SELECTORS.nativeTocItem));
        });
        if (structureChanged) this.scheduleNativeTocSync();
        else if (activeChanged) this.scheduleActiveUpdate();
      });
      this.nativeTocObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-toc-item-index', 'data-toc-active']
      });
    }

    scheduleNativeTocSync() {
      if (this.nativeSyncFrame !== null) return;
      this.nativeSyncFrame = requestAnimationFrame(() => {
        this.nativeSyncFrame = null;
        this.syncNativeToc();
      });
    }

    syncNativeToc() {
      const items = collectNativeTocItems(document.querySelectorAll(SELECTORS.nativeTocItem));
      if (!items.size) {
        this.nativeTocItems.clear();
        this.groups.forEach((group) => { group.nativeButton = null; });
        this.scheduleActiveUpdate();
        return;
      }

      this.nativeTocItems = items;
      for (const [index, group] of [...this.nativeIndexToGroup]) {
        if (!items.has(index)) {
          this.nativeIndexToGroup.delete(index);
          group.nativeIndex = null;
          group.nativeButton = null;
          if (!group.assistant) this.removeGroup(group);
        }
      }

      for (const [index, button] of items) {
        let group = this.nativeIndexToGroup.get(index);
        if (!group) {
          group = this.groups.find((candidate) => candidate.nativeIndex === null &&
            (this.getPromptIndexFromElement(candidate.prompt) ??
              this.getPromptIndexFromElement(candidate.assistant)) === index);
          if (!group && this.groups.length === items.size) {
            group = this.groups[index]?.nativeIndex === null ? this.groups[index] : null;
          }
          if (!group) group = this.addGroup(null, this.groups.length, null, null, index);
          group.nativeIndex = index;
          this.nativeIndexToGroup.set(index, group);
        }
        group.nativeButton = button;
      }

      this.syncNativePrompts();
      this.syncConversationStructure();
    }

    syncNativePrompts() {
      if (!this.thread || !this.nativeTocItems.size) return;
      const prompts = Array.from(this.thread.querySelectorAll(SELECTORS.userMessage));
      prompts.forEach((prompt, index) => {
        let nativeIndex = this.getPromptIndexFromElement(prompt);
        if (nativeIndex === null && prompts.length === this.nativeTocItems.size) nativeIndex = index;
        const group = this.nativeIndexToGroup.get(nativeIndex);
        if (group) this.setGroupPrompt(group, prompt);
      });
    }

    syncNativeTurns(assistants) {
      if (!this.nativeTocItems.size) return;
      assistants.forEach((assistant, index) => {
        let nativeIndex = this.getPromptIndexFromElement(assistant);
        if (nativeIndex === null && assistants.length === this.nativeTocItems.size) nativeIndex = index;
        const group = this.nativeIndexToGroup.get(nativeIndex);
        if (!group) return;
        const key = this.getStableTurnKey(assistant);
        this.bindGroupToTurn(group, assistant, group.prompt, key || group.key);
      });
    }

    handleConversationMutations(records) {
      const headingsToUpdate = new Set();
      const turnsToReconcile = new Set();
      const promptsToUpdate = new Set();
      let structureChanged = false;

      for (const record of records) {
        if (record.type === 'characterData') {
          const parent = record.target.parentElement;
          const heading = parent?.closest(SELECTORS.headings);
          const assistant = heading?.closest(SELECTORS.assistantMessage);
          if (heading && assistant && this.thread.contains(assistant)) {
            headingsToUpdate.add(heading);
            continue;
          }

          const user = parent?.closest(SELECTORS.userMessage);
          if (user && this.thread.contains(user)) promptsToUpdate.add(user);
          continue;
        }

        const changedNodes = [...record.addedNodes, ...record.removedNodes];
        if (changedNodes.some((node) =>
          elementMatchesOrContains(node, SELECTORS.assistantMessage) ||
          elementMatchesOrContains(node, SELECTORS.userMessage)
        )) {
          structureChanged = true;
        }

        const targetElement = record.target instanceof Element ? record.target : record.target.parentElement;
        const heading = targetElement?.closest(SELECTORS.headings);
        const assistant = targetElement?.closest(SELECTORS.assistantMessage);
        if (heading && assistant && this.thread.contains(assistant)) {
          headingsToUpdate.add(heading);
        } else if (assistant && changedNodes.some((node) => elementMatchesOrContains(node, SELECTORS.headings))) {
          turnsToReconcile.add(assistant);
        }

      }

      headingsToUpdate.forEach((heading) => this.updateHeading(heading));
      turnsToReconcile.forEach((assistant) => this.reconcileAssistantTurn(assistant));
      promptsToUpdate.forEach((prompt) => this.updatePrompt(prompt));
      if (structureChanged) {
        if (this.pendingNavigationRequestId !== null) this.syncConversationStructure();
        else this.scheduleStructureSync();
      }
    }

    scheduleStructureSync() {
      clearTimeout(this.structureSyncTimer);
      this.structureSyncTimer = setTimeout(() => {
        this.structureSyncTimer = null;
        this.syncConversationStructure();
      }, STRUCTURE_SETTLE_DELAY);
    }

    syncConversationStructure() {
      if (!this.thread?.isConnected) {
        this.bindCurrentThread();
        return;
      }

      const responsePairs = this.collectResponsePairs();
      const allAssistants = Array.from(this.thread.querySelectorAll(SELECTORS.assistantMessage));
      const liveAssistants = new Set(allAssistants);
      this.syncNativeTurns(allAssistants);

      responsePairs.forEach(({ assistant, prompt, key }, index) => {
        const nativeIndex = this.resolveNativeIndex(prompt, assistant, index, responsePairs.length);
        const group = (key && this.turnKeyToGroup.get(key)) ||
          this.turnToGroup.get(assistant) ||
          (nativeIndex !== null && this.nativeIndexToGroup.get(nativeIndex));
        if (group) {
          this.bindGroupToTurn(group, assistant, prompt, key || null);
        } else {
          this.addGroup(assistant, index, prompt, key || null, nativeIndex);
        }
      });
      this.syncNativePrompts();

      for (const group of [...this.groups]) {
        const replacement = group.key && this.turnKeyToGroup.get(group.key);
        if (group.assistant && !liveAssistants.has(group.assistant) && !group.nativeButton &&
            (!group.key || replacement === group)) {
          this.removeGroup(group);
        }
      }

      const seenGroups = new Set();
      const orderedGroups = [];
      allAssistants.forEach((assistant) => {
        const key = this.getStableTurnKey(assistant);
        const group = (key && this.turnKeyToGroup.get(key)) || this.turnToGroup.get(assistant);
        if (group && !seenGroups.has(group)) {
          seenGroups.add(group);
          orderedGroups.push(group);
        }
      });
      this.updateGroupOrderAndLabels(orderedGroups);
      this.updateEmptyState();
      this.scheduleActiveUpdate();
    }

    addGroup(assistant, index = this.groups.length, prompt = null, key = this.getStableTurnKey(assistant), nativeIndex = null) {
      if (assistant && this.turnToGroup.has(assistant)) return this.turnToGroup.get(assistant);
      if (key && this.turnKeyToGroup.has(key)) {
        const group = this.turnKeyToGroup.get(key);
        this.rebindGroup(group, assistant);
        this.setGroupPrompt(group, prompt);
        return group;
      }

      const section = document.createElement('section');
      section.className = 'toc-group';
      const header = document.createElement('div');
      header.className = 'toc-group-header';
      header.tabIndex = 0;
      header.setAttribute('role', 'button');
      header.setAttribute('aria-expanded', 'true');

      const textWrapper = document.createElement('span');
      textWrapper.className = 'toc-group-text';
      const title = document.createElement('span');
      title.className = 'toc-group-title';
      const promptText = document.createElement('span');
      promptText.className = 'toc-group-prompt';
      textWrapper.append(title, promptText);

      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'toc-group-collapse-icon';
      collapse.setAttribute('aria-label', 'Collapse prompt headings');
      collapse.append(createArrow('down'));

      const content = document.createElement('div');
      content.className = 'toc-group-content';
      header.append(textWrapper, collapse);
      section.append(header, content);

      const group = {
        key: null,
        assistant: null,
        prompt: null,
        headings: [],
        section,
        header,
        title,
        promptText,
        collapse,
        content,
        nativeIndex,
        nativeButton: null
      };
      this.groups.splice(Math.min(index, this.groups.length), 0, group);
      if (nativeIndex !== null) this.nativeIndexToGroup.set(nativeIndex, group);
      this.tocContent.append(section);
      this.bindGroupToTurn(group, assistant, prompt, key);
      return group;
    }

    rebindGroup(group, assistant) {
      this.bindGroupToTurn(group, assistant, group.prompt, this.getStableTurnKey(assistant) || group.key);
    }

    bindGroupToTurn(group, assistant, prompt, key) {
      if (group.assistant && group.assistant !== assistant) this.turnToGroup.delete(group.assistant);
      if (group.key && group.key !== key && this.turnKeyToGroup.get(group.key) === group) {
        this.turnKeyToGroup.delete(group.key);
      }
      group.assistant = assistant;
      group.key = key;
      if (assistant) this.turnToGroup.set(assistant, group);
      if (key) this.turnKeyToGroup.set(key, group);
      this.setGroupPrompt(group, prompt);
      if (assistant) this.reconcileAssistantTurn(assistant);
    }

    removeGroup(group) {
      group.headings.forEach((heading) => this.removeHeading(group, heading));
      if (group.prompt) {
        this.detachPrompt(group, group.prompt);
      }
      if (group.assistant) this.turnToGroup.delete(group.assistant);
      if (group.key && this.turnKeyToGroup.get(group.key) === group) {
        this.turnKeyToGroup.delete(group.key);
      }
      if (group.nativeIndex !== null && this.nativeIndexToGroup.get(group.nativeIndex) === group) {
        this.nativeIndexToGroup.delete(group.nativeIndex);
      }
      group.section.remove();
      this.groups = this.groups.filter((candidate) => candidate !== group);
      if (this.activeGroup === group) this.setActive(null, null);
    }

    setGroupPrompt(group, prompt) {
      if (group.prompt !== prompt) {
        if (group.prompt) this.detachPrompt(group, group.prompt);
        group.prompt = prompt;
        if (prompt) {
          let promptGroups = this.promptToGroups.get(prompt);
          if (!promptGroups) {
            promptGroups = new Set();
            this.promptToGroups.set(prompt, promptGroups);
            this.promptObserver?.observe(prompt);
          }
          promptGroups.add(group);
        }
      }
      if (prompt) group.promptText.textContent = truncateText(prompt.textContent);
      group.promptText.hidden = !group.promptText.textContent;
    }

    detachPrompt(group, prompt) {
      const promptGroups = this.promptToGroups.get(prompt);
      promptGroups?.delete(group);
      if (!promptGroups?.size) {
        this.promptObserver?.unobserve(prompt);
        this.promptToGroups.delete(prompt);
      }
    }

    updatePrompt(prompt) {
      this.promptToGroups.get(prompt)?.forEach((group) => {
        group.promptText.textContent = truncateText(prompt.textContent);
        group.promptText.hidden = !group.promptText.textContent;
      });
    }

    updateGroupOrderAndLabels(fallbackOrder = this.groups) {
      const originalIndexes = new Map(this.groups.map((group, index) => [group, index]));
      const fallbackIndexes = new Map(fallbackOrder.map((group, index) => [group, index]));
      this.groups.sort((left, right) => {
        if (left.nativeIndex !== null && right.nativeIndex !== null) return left.nativeIndex - right.nativeIndex;
        if (left.nativeIndex !== null) return -1;
        if (right.nativeIndex !== null) return 1;
        return (fallbackIndexes.get(left) ?? originalIndexes.get(left)) -
          (fallbackIndexes.get(right) ?? originalIndexes.get(right));
      });
      this.groups.forEach((group, index) => {
        const promptNumber = group.nativeIndex === null ? index + 1 : group.nativeIndex + 1;
        group.title.textContent = `Prompt ${promptNumber}`;
        this.tocContent.append(group.section);
      });
    }

    reconcileAssistantTurn(assistant) {
      let group = this.turnToGroup.get(assistant);
      if (!group) {
        const nativeIndex = this.getPromptIndexFromElement(assistant);
        group = this.nativeIndexToGroup.get(nativeIndex);
        if (group) {
          const key = this.getStableTurnKey(assistant);
          this.bindGroupToTurn(group, assistant, group.prompt, key || group.key);
          return;
        }
      }
      if (!group || !assistant.isConnected) return;

      const current = Array.from(assistant.querySelectorAll(SELECTORS.headings));
      const currentSet = new Set(current);
      group.headings.filter((heading) => !currentSet.has(heading)).forEach((heading) => this.removeHeading(group, heading));

      current.forEach((heading, index) => {
        if (!this.headingToTocItem.has(heading)) this.addHeading(group, heading, index);
        this.updateHeading(heading);
      });

      group.headings = current;
      current.forEach((heading) => group.content.append(this.headingToTocItem.get(heading)));
      this.refreshHeadingHierarchy(group);
      this.scheduleActiveUpdate();
    }

    addHeading(group, heading, index) {
      const item = document.createElement('div');
      item.className = 'toc-item';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      const text = document.createElement('span');
      text.className = 'toc-text';
      text.textContent = heading.textContent.trim();
      item.append(text);

      const nextHeading = group.headings[index];
      const nextItem = nextHeading ? this.headingToTocItem.get(nextHeading) : null;
      group.content.insertBefore(item, nextItem || null);
      group.headings.splice(index, 0, heading);
      this.headingToGroup.set(heading, group);
      this.headingToTocItem.set(heading, item);
      this.tocItemToHeading.set(item, heading);
      this.headingObserver?.observe(heading);
    }

    removeHeading(group, heading) {
      this.headingObserver?.unobserve(heading);
      const item = this.headingToTocItem.get(heading);
      item?.remove();
      this.headingToTocItem.delete(heading);
      this.headingToGroup.delete(heading);
      if (item) this.tocItemToHeading.delete(item);
      this.collapsedHeadings.delete(heading);
      group.headings = group.headings.filter((candidate) => candidate !== heading);
      if (this.activeHeading === heading) this.setActive(null, this.activeGroup);
    }

    updateHeading(heading) {
      const item = this.headingToTocItem.get(heading);
      if (!item) {
        const assistant = heading.closest(SELECTORS.assistantMessage);
        if (assistant) this.reconcileAssistantTurn(assistant);
        return;
      }
      item.querySelector('.toc-text').textContent = heading.textContent.trim();
    }

    refreshHeadingHierarchy(group) {
      group.headings.forEach((heading, index) => {
        const item = this.headingToTocItem.get(heading);
        const level = Number(heading.tagName.slice(1));
        const next = group.headings[index + 1];
        const hasChildren = Boolean(next && Number(next.tagName.slice(1)) > level);
        item.className = `toc-item toc-h${level}`;
        item.style.setProperty('--toc-level', String(level));
        item.setAttribute('aria-label', `Go to ${heading.textContent.trim() || heading.tagName}`);
        if (hasChildren) item.setAttribute('aria-expanded', String(!this.collapsedHeadings.has(heading)));
        else item.removeAttribute('aria-expanded');

        let collapse = item.querySelector('.toc-collapse-icon');
        if (hasChildren && !collapse) {
          collapse = document.createElement('button');
          collapse.type = 'button';
          collapse.className = 'toc-collapse-icon';
          collapse.setAttribute('aria-label', 'Collapse subheadings');
          item.append(collapse);
        } else if (!hasChildren && collapse) {
          collapse.remove();
          this.collapsedHeadings.delete(heading);
          collapse = null;
        }
        if (collapse) this.setArrow(collapse, this.collapsedHeadings.has(heading));
      });
      this.updateHeadingVisibility(group);
    }

    setArrow(container, collapsed) {
      container.replaceChildren(createArrow(collapsed ? 'right' : 'down'));
      const action = collapsed ? 'Expand' : 'Collapse';
      container.setAttribute('aria-label', `${action} ${container.closest('.toc-item') ? 'subheadings' : 'prompt headings'}`);
    }

    updateHeadingVisibility(group) {
      const collapsedLevels = [];
      group.headings.forEach((heading) => {
        const level = Number(heading.tagName.slice(1));
        while (collapsedLevels.length && collapsedLevels.at(-1) >= level) collapsedLevels.pop();
        this.headingToTocItem.get(heading).hidden = collapsedLevels.length > 0;
        if (this.collapsedHeadings.has(heading)) collapsedLevels.push(level);
      });
    }

    handleTocClick(event) {
      const groupCollapse = event.target.closest('.toc-group-collapse-icon');
      if (groupCollapse) {
        event.stopPropagation();
        const group = this.groups.find((candidate) => candidate.collapse === groupCollapse);
        if (group) this.toggleGroup(group);
        return;
      }

      const item = event.target.closest('.toc-item');
      if (item) {
        const heading = this.tocItemToHeading.get(item);
        if (!heading) return;
        if (event.target.closest('.toc-collapse-icon')) {
          event.stopPropagation();
          this.toggleHeading(heading);
        } else {
          const group = this.headingToGroup.get(heading);
          this.navigationRequestId += 1;
          this.pendingNavigationRequestId = null;
          this.setActive(heading, group);
          this.scrollToDestination(heading);
        }
        return;
      }

      const header = event.target.closest('.toc-group-header');
      const group = this.groups.find((candidate) => candidate.header === header);
      const destination = this.getConnectedGroupDestination(group);
      if (destination) {
        this.navigationRequestId += 1;
        this.pendingNavigationRequestId = null;
        this.setActive(null, group);
        this.scrollToDestination(destination);
        return;
      }
      if (group?.nativeButton?.isConnected) {
        const requestId = ++this.navigationRequestId;
        this.pendingNavigationRequestId = requestId;
        this.setActive(null, group);
        group.nativeButton.click();
        this.waitForGroupDestination(group, requestId);
        return;
      }
    }

    getConnectedGroupDestination(group) {
      if (group?.prompt?.isConnected) return group.prompt;
      return group?.assistant?.isConnected ? group.assistant : null;
    }

    waitForGroupDestination(group, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= 120) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }
      const destination = this.getConnectedGroupDestination(group);
      if (destination) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        this.scrollToDestination(destination);
        return;
      }
      requestAnimationFrame(() => this.waitForGroupDestination(group, requestId, attempts + 1));
    }

    scrollToDestination(element) {
      element.classList.add('chatgpt-toc-scroll-target');
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.flashDestination(element);
      setTimeout(() => element.classList.remove('chatgpt-toc-scroll-target'), 1000);
    }

    flashDestination(element) {
      const previousTimer = this.destinationHighlightTimers.get(element);
      if (previousTimer) clearTimeout(previousTimer);
      element.classList.remove('chatgpt-toc-target-highlight');
      void element.offsetWidth;
      element.classList.add('chatgpt-toc-target-highlight');
      const timer = setTimeout(() => {
        element.classList.remove('chatgpt-toc-target-highlight');
        this.destinationHighlightTimers.delete(element);
      }, 2400);
      this.destinationHighlightTimers.set(element, timer);
    }

    toggleGroup(group) {
      const collapsed = !this.collapsedGroups.has(group);
      if (collapsed) this.collapsedGroups.add(group);
      else this.collapsedGroups.delete(group);
      group.content.hidden = collapsed;
      group.header.setAttribute('aria-expanded', String(!collapsed));
      this.setArrow(group.collapse, collapsed);
    }

    toggleHeading(heading) {
      const group = this.headingToGroup.get(heading);
      if (!group) return;
      if (this.collapsedHeadings.has(heading)) this.collapsedHeadings.delete(heading);
      else this.collapsedHeadings.add(heading);
      this.refreshHeadingHierarchy(group);
    }

    createPositionObserver() {
      if (typeof IntersectionObserver === 'undefined') return null;
      return new IntersectionObserver(() => this.scheduleActiveUpdate(), {
        root: null,
        rootMargin: ACTIVE_ROOT_MARGIN,
        threshold: 0
      });
    }

    observePositionChanges() {
      window.addEventListener('scroll', this.boundScheduleActiveUpdate, { capture: true, passive: true });
      window.addEventListener('resize', this.boundScheduleActiveUpdate, { passive: true });
    }

    scheduleActiveUpdate() {
      if (this.activeUpdateFrame !== null) return;
      this.activeUpdateFrame = requestAnimationFrame(() => {
        this.activeUpdateFrame = null;
        this.updateActiveFromScrollPosition();
      });
    }

    getTrackingTargets() {
      const targets = [];
      this.groups.forEach((group) => {
        const prompt = group.prompt?.isConnected ? group.prompt : group.assistant;
        if (prompt?.isConnected) targets.push({ element: prompt, heading: null, group });
        group.headings.forEach((heading) => {
          if (heading.isConnected) targets.push({ element: heading, heading, group });
        });
      });
      return targets;
    }

    updateActiveFromScrollPosition() {
      const target = findActiveTrackingTarget(
        this.getTrackingTargets(),
        getNavigationOffset(window.innerHeight)
      );
      const nativeActive = document.querySelector(SELECTORS.nativeTocActive);
      const nativeGroup = this.nativeIndexToGroup.get(getNativeTocIndex(nativeActive));
      const group = nativeGroup || target?.group || null;
      const heading = target?.group === group ? target.heading : null;
      this.setActive(heading || null, group);
    }

    setActive(heading, group) {
      if (this.activeHeading === heading && this.activeGroup === group) return;
      this.headingToTocItem.get(this.activeHeading)?.classList.remove('active');
      this.activeGroup?.header.classList.remove('active');
      this.activeHeading = heading;
      this.activeGroup = group;
      const item = this.headingToTocItem.get(heading);
      item?.classList.add('active');
      group?.header.classList.add('active');
      const visibleItem = item && !item.hidden && !group?.content.hidden ? item : group?.header;
      this.ensureTocItemVisible(visibleItem);
    }

    ensureTocItemVisible(item) {
      if (!item || !this.isVisible) return;
      const containerRect = this.tocContent.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const margin = 12;
      if (itemRect.top < containerRect.top + margin) {
        this.tocContent.scrollTop -= containerRect.top + margin - itemRect.top;
      } else if (itemRect.bottom > containerRect.bottom - margin) {
        this.tocContent.scrollTop += itemRect.bottom - containerRect.bottom + margin;
      }
    }

    observeTheme() {
      const sync = () => {
        const dark = document.documentElement.classList.contains('dark') ||
          getComputedStyle(document.documentElement).colorScheme === 'dark' ||
          window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        this.sidebar.classList.toggle('dark-mode', Boolean(dark));
      };
      sync();
      this.themeObserver = new MutationObserver(sync);
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
      window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', sync);
    }

    updateEmptyState() {
      const status = this.tocContent.querySelector('.toc-status');
      if (this.groups.length) status?.remove();
      else this.showStatus('No responses found', 'toc-empty');
    }

    showStatus(message, className) {
      this.tocContent.replaceChildren();
      const status = document.createElement('div');
      status.className = `toc-status ${className}`;
      status.textContent = message;
      this.tocContent.append(status);
    }

    clearConversation() {
      this.headingObserver?.disconnect();
      this.promptObserver?.disconnect();
      this.groups.forEach((group) => group.section.remove());
      this.groups = [];
      this.turnToGroup = new WeakMap();
      this.turnKeyToGroup = new Map();
      this.nativeIndexToGroup = new Map();
      this.promptToGroups = new WeakMap();
      this.headingToGroup = new WeakMap();
      this.headingToTocItem = new WeakMap();
      this.tocItemToHeading = new WeakMap();
      this.activeHeading = null;
      this.activeGroup = null;
    }
  }

  function start() {
    if (!document.getElementById('chatgpt-toc-sidebar')) new ChatGPTTOC();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ChatGPTTOC,
      SELECTORS,
      truncateText,
      pairConversationMessages,
      getNavigationOffset,
      findActiveTrackingTarget,
      getNativeTocIndex,
      collectNativeTocItems,
      getPromptIndexFromTestId
    };
  }
})();
