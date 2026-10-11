// Sidebar creation, visibility, layout integration, and theme synchronization.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const {
    SELECTORS,
    SIDEBAR_VISIBILITY_KEY,
    findConversationRoot,
    hasVisibleDialog,
    resolveDarkTheme,
    isTocScrolledToEnd,
    createCloseIcon
  } = shared;

  const sidebarMethods = {
    createSidebar() {
      this.sidebar = document.createElement('aside');
      this.sidebar.id = 'chatgpt-toc-sidebar';
      this.sidebar.hidden = true;
      this.sidebar.setAttribute('aria-labelledby', 'chatgpt-toc-title');
      const extensionVersion = globalThis.chrome?.runtime?.getManifest?.().version;
      if (extensionVersion) this.sidebar.dataset.tocVersion = extensionVersion;

      const header = document.createElement('div');
      header.className = 'toc-header';
      const title = document.createElement('h2');
      title.id = 'chatgpt-toc-title';
      title.className = 'toc-title';
      title.textContent = 'Prompt Outline Navigator';
      title.title = title.textContent;
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'toc-close';
      closeButton.setAttribute('aria-label', 'Close table of contents');
      closeButton.append(createCloseIcon());
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
    },

    addToggleButton() {
      this.toggleButton = document.createElement('button');
      this.toggleButton.type = 'button';
      this.toggleButton.id = 'chatgpt-toc-toggle';
      this.toggleButton.title = 'Open Table of Contents';
      this.toggleButton.setAttribute('aria-label', 'Open table of contents');
      this.toggleButton.setAttribute('aria-controls', this.sidebar.id);
      this.toggleButton.textContent = '📋 TOC';
      this.toggleButton.hidden = true;
      this.toggleButton.addEventListener('click', () => this.setSidebarVisible(true));
      document.body.append(this.toggleButton);
    },

    async loadSidebarVisibility() {
      const storage = globalThis.chrome?.storage?.local;
      if (!storage?.get) return true;
      try {
        const saved = await storage.get(SIDEBAR_VISIBILITY_KEY);
        return saved?.[SIDEBAR_VISIBILITY_KEY] !== false;
      } catch {
        return true;
      }
    },

    saveSidebarVisibility(visible) {
      const storage = globalThis.chrome?.storage?.local;
      if (!storage?.set) return;
      try {
        return Promise.resolve(storage.set({ [SIDEBAR_VISIBILITY_KEY]: Boolean(visible) })).catch(() => {});
      } catch {
        return undefined;
      }
    },

    setSidebarVisible(visible, options = {}) {
      this.sidebarPreferenceVisible = Boolean(visible);
      this.updateSidebarAvailability();
      if (options.persist !== false) this.saveSidebarVisibility(visible);
      if (this.isVisible && options.focus !== false) this.sidebar.querySelector('.toc-close')?.focus();
    },

    updateSidebarAvailability() {
      const pathname = globalThis.location?.pathname || '';
      const source = shared.findTocSource(document);
      if (source) this.sidebarConversationPath = pathname;
      const suppressed = /^\/settings(?:\/|$)/.test(pathname) ||
        /^#(?:settings|\/settings)(?:\b|\/)/.test(globalThis.location?.hash || '') ||
        hasVisibleDialog(document, source?.kind === 'document' ? source.root : null);
      const available = this.sidebarConversationPath === pathname && !suppressed;
      const kind = source?.kind || (this.sourcePath === pathname ? this.source?.kind : null);
      const homeComposer = Array.from(document.querySelectorAll('[data-chatgpt-composer][data-composer-placement="home"]'))
        .find((element) => element.getBoundingClientRect().width > 0 && !element.closest('[hidden],[aria-hidden="true"],[inert]'));
      const wide = !suppressed && (available && kind === 'conversation' || !kind && Boolean(homeComposer));
      this.refreshHomeComposerRoot(wide ? homeComposer : null);
      const visible = available && this.sidebarPreferenceVisible;
      const state = `${available}:${visible}:${kind || 'none'}:${wide}`;
      if (this.sidebarAvailabilityState === state) return;
      this.sidebarAvailabilityState = state;
      this.isVisible = visible;
      this.sidebar.hidden = !available;
      this.sidebar.classList.toggle('is-open', visible);
      this.sidebar.setAttribute('aria-hidden', String(!visible));
      this.toggleButton.hidden = !available || this.sidebarPreferenceVisible;
      this.toggleButton.setAttribute('aria-expanded', String(visible));
      document.body.classList.toggle('chatgpt-toc-open', visible);
      document.body.classList.toggle('chatgpt-toc-conversation', available && (source?.kind || this.source?.kind) === 'conversation');
      document.body.classList.toggle('chatgpt-toc-wide', wide);
      this.refreshAppRoot();
    },

    refreshHomeComposerRoot(composer) {
      let root = null;
      for (let element = composer?.parentElement; element && element !== document.body; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display !== 'contents' && style.maxWidth !== 'none' && element.getBoundingClientRect().width > 0) {
          root = element;
          break;
        }
      }
      if (root === this.homeComposerRoot && (!root || root.classList.contains('chatgpt-toc-home-composer-root'))) return;
      this.homeComposerRoot?.classList.remove('chatgpt-toc-home-composer-root');
      this.homeComposerRoot = root;
      root?.classList.add('chatgpt-toc-home-composer-root');
    },

    captureTocScrollState() {
      if (!this.tocContent) return null;
      return {
        scrollTop: this.tocContent.scrollTop,
        followTail: isTocScrolledToEnd(
          this.tocContent.scrollTop,
          this.tocContent.scrollHeight,
          this.tocContent.clientHeight
        )
      };
    },

    restoreTocScrollState(state) {
      if (!state || !this.tocContent) return;
      if (state.followTail) {
        this.tocContent.scrollTop = this.tocContent.scrollHeight;
        return;
      }
      this.tocContent.scrollTop = state.scrollTop;
      this.preserveTocScrollOnActiveUpdate = true;
    },

    refreshAppRoot() {
      const thread = findConversationRoot(document);
      const main = thread?.closest('main,[role="main"]') ||
        document.querySelector('[role="main"]') ||
        document.querySelector(SELECTORS.main);
      if (!main) return;
      let candidate = main;
      while (candidate.parentElement && candidate.parentElement !== document.body) candidate = candidate.parentElement;
      if (candidate === this.sidebar || candidate === this.toggleButton) return;
      if (this.appRoot && this.appRoot !== candidate) this.appRoot.classList.remove('chatgpt-toc-app-root');
      this.appRoot = candidate;
      if (!this.appRoot.classList.contains('chatgpt-toc-app-root')) this.appRoot.classList.add('chatgpt-toc-app-root');
    },

    observeTheme() {
      const sync = () => {
        const root = document.documentElement;
        const dark = resolveDarkTheme(
          root.className,
          getComputedStyle(root).colorScheme,
          window.matchMedia?.('(prefers-color-scheme: dark)').matches
        );
        this.sidebar.classList.toggle('dark-mode', dark);
      };
      sync();
      this.themeObserver = new MutationObserver(sync);
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
      window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', sync);
    }
  };

  globalThis.TOCNavigator = globalThis.TOCNavigator || {};
  globalThis.TOCNavigator.sidebarMethods = sidebarMethods;
  if (typeof module !== 'undefined' && module.exports) module.exports = sidebarMethods;
})();
