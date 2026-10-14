// Prompt Outline Navigator bootstrap and shared instance state.
(() => {
  'use strict';

  const isCommonJS = typeof module !== 'undefined' && module.exports;
  const shared = isCommonJS ? require('./src/shared.js') : globalThis.TOCNavigator;
  if (isCommonJS) require('./src/source-adapters.js');
  const sidebarMethods = isCommonJS ? require('./src/sidebar.js') : globalThis.TOCNavigator.sidebarMethods;
  const conversationMethods = isCommonJS ? require('./src/conversation.js') : globalThis.TOCNavigator.conversationMethods;
  const navigationMethods = isCommonJS ? require('./src/navigation.js') : globalThis.TOCNavigator.navigationMethods;
  const activeTrackerMethods = isCommonJS ? require('./src/active-tracker.js') : globalThis.TOCNavigator.activeTrackerMethods;

  class ChatGPTTOC {
    constructor() {
      this.sidebar = null;
      this.tocContent = null;
      this.toggleButton = null;
      this.thread = null;
      this.source = null;
      this.sourcePath = null;
      this.conversationIdentity = null;
      this.appRoot = null;
      this.isVisible = true;
      this.sidebarPreferenceVisible = true;
      this.sidebarAvailabilityState = null;

      this.groups = [];
      this.turnToGroup = new WeakMap();
      this.turnKeyToGroup = new Map();
      this.earlierPromptLoader = null;
      this.earlierPromptLoadRequestId = 0;
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
      this.navigationRequestId = 0;
      this.pendingNavigationRequestId = null;
      this.preserveTocScrollOnActiveUpdate = false;
      this.boundScheduleActiveUpdate = () => this.scheduleActiveUpdate();

      this.conversationObserver = null;
      this.pageObserver = null;
      this.themeObserver = null;
      this.headingObserver = this.createPositionObserver();
      this.promptObserver = this.createPositionObserver();

      void this.init();
    }

    async init() {
      this.createSidebar();
      this.addToggleButton();
      const [visible, width] = await Promise.all([this.loadSidebarVisibility(), this.loadSidebarWidth()]);
      this.setSidebarWidth(width);
      this.setSidebarVisible(visible, { focus: false, persist: false });
      this.observePage();
      this.observeTheme();
      this.observePositionChanges();
      this.bindCurrentThread();
    }
  }

  Object.assign(ChatGPTTOC.prototype, sidebarMethods);
  Object.defineProperties(ChatGPTTOC.prototype, conversationMethods);
  Object.defineProperties(ChatGPTTOC.prototype, navigationMethods);
  Object.defineProperties(ChatGPTTOC.prototype, activeTrackerMethods);

  function start() {
    if (!document.getElementById('chatgpt-toc-sidebar')) new ChatGPTTOC();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  if (isCommonJS) module.exports = { ChatGPTTOC, ...shared };
})();
