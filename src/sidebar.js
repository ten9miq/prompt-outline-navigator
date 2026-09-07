// Sidebar creation, visibility, layout integration, and theme synchronization.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const { SELECTORS, SIDEBAR_VISIBILITY_KEY, resolveDarkTheme, createCloseIcon } = shared;

  const sidebarMethods = {
    createSidebar() {
      this.sidebar = document.createElement('aside');
      this.sidebar.id = 'chatgpt-toc-sidebar';
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
      this.isVisible = visible;
      this.sidebar.classList.toggle('is-open', visible);
      this.sidebar.setAttribute('aria-hidden', String(!visible));
      this.toggleButton.hidden = visible;
      this.toggleButton.setAttribute('aria-expanded', String(visible));
      document.body.classList.toggle('chatgpt-toc-open', visible);
      this.refreshAppRoot();
      if (options.persist !== false) this.saveSidebarVisibility(visible);
      if (visible && options.focus !== false) this.sidebar.querySelector('.toc-close')?.focus();
    },

    refreshAppRoot() {
      const main = document.querySelector(SELECTORS.main);
      if (!main) return;
      let candidate = main;
      while (candidate.parentElement && candidate.parentElement !== document.body) candidate = candidate.parentElement;
      if (candidate === this.sidebar || candidate === this.toggleButton) return;
      if (this.appRoot && this.appRoot !== candidate) this.appRoot.classList.remove('chatgpt-toc-app-root');
      this.appRoot = candidate;
      this.appRoot.classList.add('chatgpt-toc-app-root');
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
