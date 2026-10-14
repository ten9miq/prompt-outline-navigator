// Sidebar creation, visibility, layout integration, and theme synchronization.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const {
    SELECTORS,
    SIDEBAR_VISIBILITY_KEY,
    SIDEBAR_WIDTH_KEY,
    findConversationRoot,
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
      this.sidebarTop = 0;
      this.sidebarPositionPath = globalThis.location?.pathname || '';
      this.setupSidebarDragging(header, title);
      this.setupSidebarResizing();
      this.setupSidebarHover();
      this.showStatus('No table of contents items', 'toc-empty');
    },

    setSidebarTop(top) {
      const maximum = Math.max(0, window.innerHeight - 120);
      this.sidebarTop = Math.max(0, Math.min(maximum, top));
      const value = `${this.sidebarTop}px`;
      if (this.sidebar.style.getPropertyValue('--chatgpt-toc-top-offset') !== value) {
        this.sidebar.style.setProperty('--chatgpt-toc-top-offset', value);
      }
    },

    resetSidebarPosition() {
      this.cancelSidebarDrag?.();
      this.setSidebarTop(0);
    },

    setupSidebarDragging(header, title) {
      let drag = null;
      header.title = 'Drag to move temporarily. Double-click to reset width and vertical position.';
      title.tabIndex = 0;
      title.setAttribute('aria-description', 'Drag or use Up and Down to move. Home returns to the top.');
      const finish = (cancel = false) => {
        if (!drag) return;
        const previous = drag;
        drag = null;
        header.classList.remove('is-dragging');
        if (cancel) this.setSidebarTop(previous.top);
        if (header.hasPointerCapture(previous.id)) header.releasePointerCapture(previous.id);
      };
      this.cancelSidebarDrag = () => finish(true);
      header.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !event.isPrimary || event.target.closest('button')) return;
        event.preventDefault();
        title.focus({ preventScroll: true });
        drag = { id: event.pointerId, y: event.clientY, top: this.sidebarTop };
        header.setPointerCapture(event.pointerId);
        header.classList.add('is-dragging');
      });
      header.addEventListener('pointermove', (event) => {
        if (drag?.id !== event.pointerId) return;
        this.setSidebarTop(drag.top + event.clientY - drag.y);
      });
      header.addEventListener('pointerup', (event) => {
        if (drag?.id === event.pointerId) finish();
      });
      header.addEventListener('pointercancel', (event) => {
        if (drag?.id === event.pointerId) finish(true);
      });
      header.addEventListener('lostpointercapture', () => finish());
      window.addEventListener('blur', this.cancelSidebarDrag);
      window.addEventListener('resize', () => {
        finish();
        this.setSidebarTop(this.sidebarTop);
      }, { passive: true });
      header.addEventListener('dblclick', (event) => {
        if (event.target.closest('button')) return;
        this.resetSidebarPosition();
        this.setSidebarWidth(200, true);
      });
      title.addEventListener('keydown', (event) => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Escape') finish(true);
        else if (event.key === 'Home') this.resetSidebarPosition();
        else this.setSidebarTop(this.sidebarTop + (event.key === 'ArrowDown' ? 10 : -10));
      });
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

    async loadSidebarWidth() {
      try {
        const saved = await globalThis.chrome?.storage?.local?.get(SIDEBAR_WIDTH_KEY);
        const width = saved?.[SIDEBAR_WIDTH_KEY];
        return typeof width === 'number' && Number.isFinite(width) ? Math.max(160, Math.min(600, width)) : 200;
      } catch {
        return 200;
      }
    },

    setSidebarWidth(width, persist = false) {
      this.sidebarWidth = Math.max(160, Math.min(600, width));
      const applied = Math.min(this.sidebarWidth, Math.max(80, window.innerWidth - 80));
      const value = `${applied}px`;
      if (document.documentElement.style.getPropertyValue('--chatgpt-toc-width') !== value) {
        document.documentElement.style.setProperty('--chatgpt-toc-width', value);
      }
      this.resizeHandle.setAttribute('aria-valuenow', String(applied));
      this.resizeHandle.setAttribute('aria-valuemin', String(Math.min(160, applied)));
      this.resizeHandle.setAttribute('aria-valuemax', String(Math.min(600, Math.max(80, window.innerWidth - 80))));
      if (persist) {
        try {
          Promise.resolve(globalThis.chrome?.storage?.local?.set({ [SIDEBAR_WIDTH_KEY]: this.sidebarWidth })).catch(() => {});
        } catch { /* Storage may be unavailable after an extension reload. */ }
      }
    },

    setupSidebarResizing() {
      const handle = document.createElement('div');
      handle.className = 'toc-resize-handle';
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', 'Resize table of contents');
      handle.setAttribute('aria-valuemin', '160');
      handle.setAttribute('aria-valuemax', '600');
      handle.title = 'Drag to resize. Double-click to hide.';
      this.resizeHandle = handle;
      this.sidebar.append(handle);
      this.sidebarWidth = 200;
      let drag = null;
      const finish = (cancel = false) => {
        if (!drag) return;
        const previous = drag;
        drag = null;
        document.body.classList.remove('chatgpt-toc-resizing');
        this.setSidebarWidth(cancel ? previous.width : this.sidebarWidth, !cancel && this.sidebarWidth !== previous.width);
        if (handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
        if (this.sidebarHoverVisible && !this.sidebar.matches(':hover')) this.setSidebarHoverVisible(false);
      };
      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        drag = { id: event.pointerId, x: event.clientX, width: this.sidebarWidth };
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('chatgpt-toc-resizing');
      });
      handle.addEventListener('pointermove', (event) => {
        if (drag?.id === event.pointerId) this.setSidebarWidth(drag.width + drag.x - event.clientX);
      });
      handle.addEventListener('pointerup', (event) => { if (drag?.id === event.pointerId) finish(); });
      handle.addEventListener('pointercancel', (event) => { if (drag?.id === event.pointerId) finish(true); });
      handle.addEventListener('lostpointercapture', () => finish());
      window.addEventListener('blur', () => finish(true));
      window.addEventListener('resize', () => { finish(); this.setSidebarWidth(this.sidebarWidth); }, { passive: true });
      handle.addEventListener('dblclick', () => this.setSidebarVisible(false));
      handle.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Escape') finish(true);
        else if (event.key === 'Enter') this.setSidebarVisible(false);
        else this.setSidebarWidth(this.sidebarWidth + (event.key === 'ArrowLeft' ? 10 : -10), true);
      });
    },

    setSidebarHoverVisible(visible) {
      clearTimeout(this.sidebarHoverTimer);
      this.sidebarHoverVisible = Boolean(visible) && !this.sidebarPreferenceVisible;
      this.updateSidebarAvailability();
    },

    setupSidebarHover() {
      const edge = document.createElement('div');
      edge.id = 'chatgpt-toc-hover-edge';
      edge.hidden = true;
      edge.setAttribute('aria-hidden', 'true');
      document.body.append(edge);
      this.hoverEdge = edge;
      edge.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch') this.setSidebarHoverVisible(true);
      });
      const leave = (event) => {
        if (this.sidebar.contains(event.relatedTarget) || edge.contains(event.relatedTarget)) return;
        clearTimeout(this.sidebarHoverTimer);
        this.sidebarHoverTimer = setTimeout(() => {
          if (!document.body.classList.contains('chatgpt-toc-resizing')) this.setSidebarHoverVisible(false);
        }, 180);
      };
      edge.addEventListener('pointerleave', leave);
      this.sidebar.addEventListener('pointerenter', () => clearTimeout(this.sidebarHoverTimer));
      this.sidebar.addEventListener('pointerleave', leave);
      this.sidebar.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.sidebarHoverVisible) this.setSidebarHoverVisible(false);
      });
      window.addEventListener('blur', () => this.setSidebarHoverVisible(false));
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
      clearTimeout(this.sidebarHoverTimer);
      this.sidebarHoverVisible = false;
      this.sidebarPreferenceVisible = Boolean(visible);
      this.updateSidebarAvailability();
      if (options.persist !== false) this.saveSidebarVisibility(visible);
      if (this.isVisible && options.focus !== false) this.sidebar.querySelector('.toc-close')?.focus();
    },

    updateSidebarAvailability() {
      const pathname = globalThis.location?.pathname || '';
      if (this.sidebarPositionPath !== pathname) {
        this.sidebarPositionPath = pathname;
        this.resetSidebarPosition();
        this.sidebarHoverVisible = false;
      }
      const source = shared.findTocSource(document);
      const kind = source?.kind || (this.sourcePath === pathname ? this.source?.kind : null);
      const homeComposer = Array.from(document.querySelectorAll('[data-chatgpt-composer][data-composer-placement="home"]'))
        .find((element) => element.getBoundingClientRect().width > 0 && !element.closest('[hidden],[aria-hidden="true"],[inert]'));
      const wide = kind === 'conversation' || !kind && Boolean(homeComposer);
      this.refreshHomeComposerRoot(wide ? homeComposer : null);
      // Hover previews overlay the page; only the saved open state reserves width.
      const pinned = this.sidebarPreferenceVisible;
      const visible = pinned || Boolean(this.sidebarHoverVisible);
      const state = `${pinned}:${visible}:${kind || 'none'}:${wide}`;
      if (this.sidebarAvailabilityState === state) return;
      this.sidebarAvailabilityState = state;
      this.isVisible = visible;
      this.sidebar.hidden = false;
      this.sidebar.classList.toggle('is-open', visible);
      this.sidebar.setAttribute('aria-hidden', String(!visible));
      this.sidebar.inert = !visible;
      if (!visible && this.sidebar.contains(document.activeElement)) document.activeElement.blur();
      this.toggleButton.hidden = visible;
      this.toggleButton.setAttribute('aria-expanded', String(visible));
      this.hoverEdge.hidden = pinned;
      document.body.classList.toggle('chatgpt-toc-open', pinned);
      document.body.classList.toggle('chatgpt-toc-conversation', kind === 'conversation');
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
