// TOC Navigator for ChatGPT
(() => {
  'use strict';

  const SELECTORS = Object.freeze({
    thread: '#thread',
    main: 'main',
    userMessage: '[data-message-author-role="user"]',
    assistantMessage: '[data-message-author-role="assistant"]',
    headings: 'h1,h2,h3,h4,h5,h6',
    turn: '[data-testid^="conversation-turn-"],[data-turn-id],[data-turn]'
  });

  const PROMPT_LIMIT = 200;
  const ACTIVE_ROOT_MARGIN = '0px 0px -90% 0px';

  function truncateText(value, limit = PROMPT_LIMIT) {
    const text = String(value || '').trim();
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  function elementMatchesOrContains(node, selector) {
    return node instanceof Element && (node.matches(selector) || Boolean(node.querySelector(selector)));
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
      this.promptToGroups = new WeakMap();
      this.headingToGroup = new WeakMap();
      this.headingToTocItem = new WeakMap();
      this.tocItemToHeading = new WeakMap();
      this.collapsedGroups = new WeakSet();
      this.collapsedHeadings = new WeakSet();

      this.visibleHeadings = new Map();
      this.visiblePrompts = new Map();
      this.activeHeading = null;
      this.activeGroup = null;
      this.activeUpdateFrame = null;
      this.clearActiveTimer = null;
      this.structureSyncFrame = null;
      this.threadBindFrame = null;

      this.conversationObserver = null;
      this.pageObserver = null;
      this.themeObserver = null;
      this.headingObserver = this.createPositionObserver('heading');
      this.promptObserver = this.createPositionObserver('prompt');

      this.init();
    }

    init() {
      this.createSidebar();
      this.addToggleButton();
      this.setSidebarVisible(true, { focus: false });
      this.observePage();
      this.observeTheme();
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

      this.scanConversation();
      this.conversationObserver = new MutationObserver((records) => this.handleConversationMutations(records));
      this.conversationObserver.observe(this.thread, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    scanConversation() {
      const assistants = Array.from(this.thread.querySelectorAll(SELECTORS.assistantMessage));
      assistants.forEach((assistant, index) => this.addGroup(assistant, index));
      this.updateGroupOrderAndLabels(assistants);
      this.updateEmptyState();
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

        const user = targetElement?.closest(SELECTORS.userMessage);
        if (user && !assistant) promptsToUpdate.add(user);
      }

      headingsToUpdate.forEach((heading) => this.updateHeading(heading));
      turnsToReconcile.forEach((assistant) => this.reconcileAssistantTurn(assistant));
      promptsToUpdate.forEach((prompt) => this.updatePrompt(prompt));
      if (structureChanged) this.scheduleStructureSync();
    }

    scheduleStructureSync() {
      if (this.structureSyncFrame !== null) return;
      this.structureSyncFrame = requestAnimationFrame(() => {
        this.structureSyncFrame = null;
        this.syncConversationStructure();
      });
    }

    syncConversationStructure() {
      if (!this.thread?.isConnected) {
        this.bindCurrentThread();
        return;
      }

      const assistants = Array.from(this.thread.querySelectorAll(SELECTORS.assistantMessage));
      const liveAssistants = new Set(assistants);
      for (const group of [...this.groups]) {
        if (!liveAssistants.has(group.assistant)) this.removeGroup(group);
      }

      assistants.forEach((assistant, index) => {
        const group = this.turnToGroup.get(assistant);
        if (group) this.setGroupPrompt(group, this.findPromptForAssistant(assistant));
        else this.addGroup(assistant, index);
      });

      this.updateGroupOrderAndLabels(assistants);
      this.updateEmptyState();
    }

    addGroup(assistant, index = this.groups.length) {
      if (this.turnToGroup.has(assistant)) return this.turnToGroup.get(assistant);

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

      const group = { assistant, prompt: null, headings: [], section, header, title, promptText, collapse, content };
      this.groups.splice(Math.min(index, this.groups.length), 0, group);
      this.turnToGroup.set(assistant, group);
      this.setGroupPrompt(group, this.findPromptForAssistant(assistant));
      this.tocContent.append(section);
      this.reconcileAssistantTurn(assistant);
      return group;
    }

    removeGroup(group) {
      group.headings.forEach((heading) => this.removeHeading(group, heading));
      if (group.prompt) {
        this.detachPrompt(group, group.prompt);
      }
      this.turnToGroup.delete(group.assistant);
      group.section.remove();
      this.groups = this.groups.filter((candidate) => candidate !== group);
      if (this.activeGroup === group) this.setActive(null, null);
    }

    findPromptForAssistant(assistant) {
      const messages = this.thread.querySelectorAll(`${SELECTORS.userMessage},${SELECTORS.assistantMessage}`);
      let latestUser = null;
      for (const message of messages) {
        if (message === assistant) return latestUser;
        if (message.matches(SELECTORS.userMessage)) latestUser = message;
      }
      return null;
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
      group.promptText.textContent = truncateText(prompt?.textContent || 'Response without a preceding prompt');
    }

    detachPrompt(group, prompt) {
      const promptGroups = this.promptToGroups.get(prompt);
      promptGroups?.delete(group);
      if (!promptGroups?.size) {
        this.promptObserver?.unobserve(prompt);
        this.promptToGroups.delete(prompt);
        this.visiblePrompts.delete(prompt);
      }
    }

    updatePrompt(prompt) {
      this.promptToGroups.get(prompt)?.forEach((group) => {
        group.promptText.textContent = truncateText(prompt.textContent);
      });
    }

    updateGroupOrderAndLabels(assistants) {
      const ordered = assistants.map((assistant) => this.turnToGroup.get(assistant)).filter(Boolean);
      this.groups = ordered;
      ordered.forEach((group, index) => {
        group.title.textContent = `Prompt ${index + 1}`;
        this.tocContent.append(group.section);
      });
    }

    reconcileAssistantTurn(assistant) {
      const group = this.turnToGroup.get(assistant);
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
      this.visibleHeadings.delete(heading);
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
        } else heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const header = event.target.closest('.toc-group-header');
      const group = this.groups.find((candidate) => candidate.header === header);
      const destination = group?.prompt || group?.assistant;
      destination?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    createPositionObserver(type) {
      if (typeof IntersectionObserver === 'undefined') return null;
      return new IntersectionObserver((entries) => {
        const visible = type === 'heading' ? this.visibleHeadings : this.visiblePrompts;
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.set(entry.target, entry.boundingClientRect.top);
          else visible.delete(entry.target);
        });
        this.scheduleActiveUpdate();
      }, { root: null, rootMargin: ACTIVE_ROOT_MARGIN, threshold: 0 });
    }

    scheduleActiveUpdate() {
      if (this.activeUpdateFrame !== null) return;
      this.activeUpdateFrame = requestAnimationFrame(() => {
        this.activeUpdateFrame = null;
        this.updateActiveFromIntersections();
      });
    }

    updateActiveFromIntersections() {
      const closest = (entries) => [...entries.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]?.[0] || null;
      const heading = closest(this.visibleHeadings);
      const prompt = closest(this.visiblePrompts);
      const group = heading
        ? this.headingToGroup.get(heading)
        : this.groups.find((candidate) => candidate.prompt === prompt);
      if (heading || group) {
        clearTimeout(this.clearActiveTimer);
        this.setActive(heading, group);
        return;
      }
      const activeSource = this.activeHeading || this.activeGroup?.prompt || this.activeGroup?.assistant;
      if (this.isWithinDeactivationBand(activeSource)) return;
      clearTimeout(this.clearActiveTimer);
      this.clearActiveTimer = setTimeout(() => this.setActive(null, null), 180);
    }

    isWithinDeactivationBand(element) {
      if (!element?.isConnected) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom > window.innerHeight * -0.05 && rect.top < window.innerHeight * 0.15;
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
      this.promptToGroups = new WeakMap();
      this.headingToGroup = new WeakMap();
      this.headingToTocItem = new WeakMap();
      this.tocItemToHeading = new WeakMap();
      this.visibleHeadings.clear();
      this.visiblePrompts.clear();
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

  if (typeof module !== 'undefined' && module.exports) module.exports = { ChatGPTTOC, SELECTORS, truncateText };
})();
