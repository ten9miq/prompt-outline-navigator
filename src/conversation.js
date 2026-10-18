// Conversation DOM discovery, synchronization, and TOC rendering.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const {
    SELECTORS,
    STRUCTURE_SETTLE_DELAY,
    getPromptText,
    elementMatchesOrContains,
    pairConversationMessages,
    findConversationRoot,
    shouldPreserveDisconnectedGroup,
    createArrow
  } = shared;

  class ConversationMethods {
    observePage() {
      const schedulePageSync = () => {
        if (this.threadBindFrame !== null) return;
        this.threadBindFrame = requestAnimationFrame(() => {
          this.threadBindFrame = null;
          this.refreshAppRoot();
          this.bindCurrentThread();
          this.updateSidebarAvailability();
          this.updateEarlierPromptLoader();
        });
      };
      this.pageObserver = new MutationObserver(schedulePageSync);
      window.addEventListener('popstate', schedulePageSync);
      window.addEventListener('hashchange', schedulePageSync);
      window.addEventListener('resize', schedulePageSync, { passive: true });
      const syncEditedContent = (event) => {
        const editor = event.target.closest?.(shared.EDITOR_SELECTOR);
        const card = event.target.closest?.('[class~="group/writing-block-surface"]');
        if (this.thread && ((this.thread.contains(event.target) && (editor || card)) || card?.contains(this.thread))) {
          this.scheduleStructureSync();
        }
      };
      document.addEventListener('input', syncEditedContent, true);
      document.addEventListener('change', syncEditedContent, true);
      this.pageObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-chatgpt-selection-conversation-id', 'class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-modal', 'role']
      });
    }

    bindCurrentThread() {
      const pathname = globalThis.location?.pathname || '';
      const nextSource = shared.findTocSource(document);
      if (!nextSource && this.source && this.sourcePath === pathname) return;
      const nextThread = nextSource?.root || null;
      const nextIdentity = nextSource?.kind === 'conversation' ? this.getConversationIdentity(nextThread)
        : `${nextSource?.kind || 'none'}:${pathname}`;
      if (nextThread === this.thread && nextIdentity === this.conversationIdentity) {
        this.source = nextSource;
        this.sourcePath = pathname;
        return;
      }

      this.conversationObserver?.disconnect();
      this.clearConversation();
      this.thread = nextThread;
      this.source = nextSource;
      this.sourcePath = pathname;
      this.conversationIdentity = nextIdentity;

      if (!this.thread) {
        this.showStatus('No table of contents items', 'toc-empty');
        return;
      }

      this.scanConversation();
      this.conversationObserver = new MutationObserver((records) => this.handleConversationMutations(records));
      this.conversationObserver.observe(this.thread, {
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['role', 'aria-level', 'hidden', 'aria-hidden'],
        subtree: true
      });
    }

    getConversationIdentity(thread) {
      return shared.getConversationIdentity(thread, globalThis.location?.pathname || '');
    }

    scanConversation() {
      const responsePairs = this.collectResponsePairs();
      responsePairs.forEach(({ assistant, prompt, key }, index) => {
        const group = (key && this.turnKeyToGroup.get(key)) ||
          this.turnToGroup.get(assistant) ||
          null;
        if (group) this.bindGroupToTurn(group, assistant, prompt, key || null);
        else this.addGroup(assistant, index, prompt, key || null);
      });
      this.updateGroupOrderAndLabels();
      this.updateEmptyState();
      this.scheduleActiveUpdate();
    }

    collectResponsePairs() {
      if (this.source && this.source.kind !== 'conversation') return shared.getSourceBlocks(this.source);
      const messages = this.thread.querySelectorAll(`${SELECTORS.userMessage},${SELECTORS.assistantMessage}`);
      return pairConversationMessages(
        messages,
        (assistant) => this.getStableTurnKey(assistant)
      );
    }

    getStableTurnKey(message) {
      if (!message) return null;
      const turn = message.closest(SELECTORS.stableTurn);
      if (!turn) return null;
      const messageId = turn.getAttribute('data-message-id');
      if (messageId) return `message:${messageId}`;
      const turnId = turn.getAttribute('data-turn-id');
      if (turnId) return `turn:${turnId}`;
      const turnKey = turn.getAttribute('data-turn-key');
      if (turnKey) return `turn:${turnKey}`;
      return null;
    }

    handleConversationMutations(records) {
      if (this.source && this.source.kind !== 'conversation') {
        this.scheduleStructureSync();
        return;
      }
      const headingsToUpdate = new Set();
      const turnsToReconcile = new Set();
      const promptsToUpdate = new Set();
      let structureChanged = false;

      for (const record of records) {
        const editedElement = record.target instanceof Element ? record.target : record.target.parentElement;
        if (editedElement?.closest(shared.EDITOR_SELECTOR) ||
            [...(record.addedNodes || []), ...(record.removedNodes || [])].some((node) =>
              elementMatchesOrContains(node, shared.EDITOR_SELECTOR)) || record.type === 'attributes') {
          structureChanged = true;
        }
        if (record.type === 'characterData') {
          const parent = record.target.parentElement;
          const heading = parent?.closest(SELECTORS.headings);
          const assistant = heading?.closest(SELECTORS.assistantMessage);
          if (heading && !heading.hasAttribute('data-conversation-role') && assistant && this.thread.contains(assistant)) {
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
        if (heading && !heading.hasAttribute('data-conversation-role') && assistant && this.thread.contains(assistant)) {
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

    syncConversationStructure(options = {}) {
      if (!this.thread?.isConnected) {
        this.bindCurrentThread();
        return;
      }

      const responsePairs = this.collectResponsePairs();
      const allAssistants = this.source && this.source.kind !== 'conversation'
        ? responsePairs.map((pair) => pair.assistant)
        : Array.from(this.thread.querySelectorAll(SELECTORS.assistantMessage));
      const liveAssistants = new Set(allAssistants);

      responsePairs.forEach(({ assistant, prompt, key }, index) => {
        const group = (key && this.turnKeyToGroup.get(key)) ||
          this.turnToGroup.get(assistant) ||
          null;
        if (group) {
          this.bindGroupToTurn(group, assistant, prompt, key || null);
        } else this.addGroup(assistant, index, prompt, key || null);
      });

      for (const group of [...this.groups]) {
        if (group.assistant && !liveAssistants.has(group.assistant)) {
          if (shouldPreserveDisconnectedGroup(group)) this.disconnectGroupFromTurn(group);
          else this.removeGroup(group);
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

    addGroup(assistant, index = this.groups.length, prompt = null, key = this.getStableTurnKey(assistant)) {
      if (assistant && this.turnToGroup.has(assistant)) return this.turnToGroup.get(assistant);
      if (key && this.turnKeyToGroup.has(key)) {
        const group = this.turnKeyToGroup.get(key);
        this.rebindGroup(group, assistant);
        this.setGroupPrompt(group, prompt);
        return group;
      }

      const tocScrollState = this.captureTocScrollState();

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
        promptTextCaptured: false,
        contentCaptured: Boolean(assistant || prompt),
        collapse,
        content,
        lastKnownScrollTop: null
      };
      this.groups.splice(Math.min(index, this.groups.length), 0, group);
      this.tocContent.append(section);
      this.bindGroupToTurn(group, assistant, prompt, key);
      this.restoreTocScrollState(tocScrollState);
      return group;
    }

    rebindGroup(group, assistant) {
      this.bindGroupToTurn(group, assistant, group.prompt, this.getStableTurnKey(assistant) || group.key);
    }

    bindGroupToTurn(group, assistant, prompt, key) {
      const previousGroup = assistant ? this.turnToGroup.get(assistant) : null;
      if (previousGroup && previousGroup !== group) {
        previousGroup.headings
          .filter((heading) => heading.closest(SELECTORS.assistantMessage) === assistant)
          .forEach((heading) => this.removeHeading(previousGroup, heading));
        if (previousGroup.assistant === assistant) previousGroup.assistant = null;
        if (key && previousGroup.key === key) {
          if (this.turnKeyToGroup.get(key) === previousGroup) this.turnKeyToGroup.delete(key);
          previousGroup.key = null;
        }
      }
      if (group.assistant && group.assistant !== assistant) this.turnToGroup.delete(group.assistant);
      if (group.key && group.key !== key && this.turnKeyToGroup.get(group.key) === group) {
        this.turnKeyToGroup.delete(group.key);
      }
      group.assistant = assistant;
      group.key = key;
      if (assistant || prompt) group.contentCaptured = true;
      if (assistant) this.turnToGroup.set(assistant, group);
      if (key) this.turnKeyToGroup.set(key, group);
      this.setGroupPrompt(group, prompt);
      if (assistant && this.source && this.source.kind !== 'conversation' &&
          (this.source.kind === 'document' || !group.promptTextCaptured)) {
        const label = this.source.kind === 'document' ? shared.getEditorTitle(assistant) : assistant.textContent;
        group.promptText.textContent = shared.truncateText(label);
        group.promptText.hidden = !group.promptText.textContent;
        group.promptTextCaptured = Boolean(group.promptText.textContent);
      }
      if (assistant) this.reconcileAssistantTurn(assistant);
      this.rememberGroupDestination(group);
    }

    disconnectGroupFromTurn(group) {
      this.rememberGroupDestination(group);
      if (group.prompt) {
        this.detachPrompt(group, group.prompt);
        group.prompt = null;
      }
      if (group.assistant) {
        this.turnToGroup.delete(group.assistant);
        group.assistant = null;
      }
      group.headings.forEach((heading) => this.headingObserver?.unobserve(heading));
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
      if (prompt && !group.promptTextCaptured) {
        const text = getPromptText(prompt);
        if (text) {
          group.promptText.textContent = text;
          group.promptTextCaptured = true;
        }
      }
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
        if (group.promptTextCaptured) return;
        const text = getPromptText(prompt);
        if (!text) return;
        group.promptText.textContent = text;
        group.promptTextCaptured = true;
        group.promptText.hidden = !group.promptText.textContent;
      });
    }

    updateGroupOrderAndLabels(fallbackOrder = this.groups) {
      const tocScrollState = this.captureTocScrollState();
      const originalIndexes = new Map(this.groups.map((group, index) => [group, index]));
      const fallbackIndexes = new Map(fallbackOrder.map((group, index) => [group, index]));
      this.groups.sort((left, right) => {
        if (Number.isFinite(left.lastKnownScrollTop) && Number.isFinite(right.lastKnownScrollTop)) {
          const positionDelta = left.lastKnownScrollTop - right.lastKnownScrollTop;
          if (Math.abs(positionDelta) > 2) return positionDelta;
        }
        return (fallbackIndexes.get(left) ?? originalIndexes.get(left)) -
          (fallbackIndexes.get(right) ?? originalIndexes.get(right));
      });
      this.groups.forEach((group, index) => {
        group.title.textContent = this.source?.kind === 'document' ? 'Document'
          : `${this.source?.kind === 'feed' ? 'Message' : 'Prompt'} ${index + 1}`;
        this.tocContent.append(group.section);
      });
      this.updateEarlierPromptLoader();
      this.restoreTocScrollState(tocScrollState);
    }

    updateEarlierPromptLoader() {
      const shouldShow = this.hasEarlierConversationTurns();
      if (!shouldShow) {
        this.earlierPromptLoader?.remove();
        return;
      }

      if (!this.earlierPromptLoader) {
        const loader = document.createElement('button');
        loader.type = 'button';
        loader.className = 'toc-load-earlier';
        loader.textContent = 'Go to conversation start';
        loader.setAttribute('aria-label', 'Go to conversation start');
        this.earlierPromptLoader = loader;
      }
      if (!this.earlierPromptLoader.isConnected) this.tocContent.prepend(this.earlierPromptLoader);
    }

    hasEarlierConversationTurns() {
      if (this.source?.kind !== 'conversation' || !this.thread?.isConnected) return false;
      // Cached earlier groups can outlive the DOM nodes that ChatGPT virtualizes.
      const firstLiveGroup = this.groups.findIndex((group) =>
        group.prompt?.isConnected || group.assistant?.isConnected);
      if (firstLiveGroup > 0) return true;

      const firstTurn = this.thread.querySelector(SELECTORS.conversationTurn);
      if (!firstTurn) return false;
      // The current virtualizer reserves omitted turns with a leading inline
      // margin inside its relative, fixed-height list. This offset is independent
      // of scrollTop, so scrolling within a fully rendered response is ignored.
      for (let element = firstTurn; element && element !== this.thread; element = element.parentElement) {
        const parent = element.parentElement;
        if (parseFloat(element.style.marginTop) > 2 && parent?.style.height &&
            parent.classList.contains('relative') && parent.classList.contains('shrink-0')) return true;
      }
      return false;
    }

    reconcileAssistantTurn(assistant) {
      const tocScrollState = this.captureTocScrollState();
      try {
        const group = this.turnToGroup.get(assistant);
        if (!group || !assistant.isConnected) return;

        const current = shared.collectOutlineTargets(assistant);
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
      } finally {
        this.restoreTocScrollState(tocScrollState);
      }
    }

    addHeading(group, heading, index) {
      const item = document.createElement('div');
      item.className = 'toc-item';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      const text = document.createElement('span');
      text.className = 'toc-text';
      text.textContent = shared.getOutlineText(heading);
      text.title = text.textContent;
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
      const tocScrollState = this.captureTocScrollState();
      try {
        const item = this.headingToTocItem.get(heading);
        if (!item) {
          const assistant = heading.closest(SELECTORS.assistantMessage);
          if (assistant) this.reconcileAssistantTurn(assistant);
          return;
        }
        const text = item.querySelector('.toc-text');
        text.textContent = shared.getOutlineText(heading);
        text.title = text.textContent;
      } finally {
        this.restoreTocScrollState(tocScrollState);
      }
    }

    refreshHeadingHierarchy(group) {
      group.headings.forEach((heading, index) => {
        const item = this.headingToTocItem.get(heading);
        const level = shared.getOutlineLevel(heading);
        const next = group.headings[index + 1];
        const hasChildren = Boolean(next && shared.getOutlineLevel(next) > level);
        item.classList.remove('toc-h1', 'toc-h2', 'toc-h3', 'toc-h4', 'toc-h5', 'toc-h6');
        item.classList.add('toc-item', `toc-h${level}`);
        item.style.setProperty('--toc-level', String(level));
        item.setAttribute('aria-label', `Go to ${shared.getOutlineText(heading) || heading.tagName}`);
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
        const level = shared.getOutlineLevel(heading);
        while (collapsedLevels.length && collapsedLevels.at(-1) >= level) collapsedLevels.pop();
        this.headingToTocItem.get(heading).hidden = collapsedLevels.length > 0;
        if (this.collapsedHeadings.has(heading)) collapsedLevels.push(level);
      });
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
      this.smoothScrollCleanup?.();
      this.navigationRequestId += 1;
      this.pendingNavigationRequestId = null;
      this.headingObserver?.disconnect();
      this.promptObserver?.disconnect();
      this.groups.forEach((group) => group.section.remove());
      this.earlierPromptLoader?.remove();
      this.earlierPromptLoader = null;
      this.earlierPromptLoadRequestId += 1;
      this.groups = [];
      this.turnToGroup = new WeakMap();
      this.turnKeyToGroup = new Map();
      this.promptToGroups = new WeakMap();
      this.headingToGroup = new WeakMap();
      this.headingToTocItem = new WeakMap();
      this.tocItemToHeading = new WeakMap();
      this.activeHeading = null;
      this.activeGroup = null;
    }
  }

  const conversationMethods = Object.getOwnPropertyDescriptors(ConversationMethods.prototype);
  delete conversationMethods.constructor;
  globalThis.TOCNavigator = globalThis.TOCNavigator || {};
  globalThis.TOCNavigator.conversationMethods = conversationMethods;
  if (typeof module !== 'undefined' && module.exports) module.exports = conversationMethods;
})();
