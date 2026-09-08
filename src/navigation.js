// TOC interaction, destination recovery, scrolling, and collapse behavior.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const { SELECTORS, findRemountedHeading, NAVIGATION_RECOVERY_FRAMES } = shared;

  class NavigationMethods {
    handleTocClick(event) {
      const earlierPromptLoader = event.target.closest('.toc-load-earlier');
      if (earlierPromptLoader) {
        this.startEarlierPromptLoading();
        return;
      }

      this.cancelEarlierPromptLoading();

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
          this.navigateToHeading(heading, group);
        }
        return;
      }

      const header = event.target.closest('.toc-group-header');
      const group = this.groups.find((candidate) => candidate.header === header);
      if (!group) return;
      const destination = this.getConnectedGroupDestination(group);
      if (destination) {
        this.navigationRequestId += 1;
        this.pendingNavigationRequestId = null;
        this.setActive(null, group);
        this.scrollToDestination(destination);
        return;
      }
      const requestId = ++this.navigationRequestId;
      this.pendingNavigationRequestId = requestId;
      this.setActive(null, group);
      if (group.nativeButton?.isConnected) {
        group.nativeButton.click();
        this.waitForGroupDestination(group, requestId);
        return;
      }
      this.recoverVirtualizedDestination(group, requestId, () => this.waitForGroupDestination(group, requestId));
    }

    navigateToHeading(heading, group) {
      const requestId = ++this.navigationRequestId;
      this.pendingNavigationRequestId = null;
      this.setActive(heading, group);
      if (heading.isConnected) {
        this.scrollToDestination(heading);
        return;
      }

      const descriptor = {
        index: group?.headings.indexOf(heading) ?? -1,
        tagName: heading.tagName,
        text: heading.textContent.trim()
      };
      if (group?.nativeButton?.isConnected) {
        this.pendingNavigationRequestId = requestId;
        group.nativeButton.click();
        this.waitForHeadingDestination(group, descriptor, requestId);
        return;
      }

      const prompt = this.getConnectedGroupDestination(group);
      if (prompt) {
        this.pendingNavigationRequestId = requestId;
        this.scrollToDestination(prompt);
        this.waitForHeadingDestination(group, descriptor, requestId);
        return;
      }
      if (group) {
        this.recoverVirtualizedDestination(
          group,
          requestId,
          () => this.waitForHeadingDestination(group, descriptor, requestId)
        );
      }
    }

    findConnectedHeading(group, descriptor) {
      return findRemountedHeading(group?.headings, descriptor);
    }

    waitForHeadingDestination(group, descriptor, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= NAVIGATION_RECOVERY_FRAMES) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }
      const heading = this.findConnectedHeading(group, descriptor);
      if (heading) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        this.setActive(heading, group);
        this.scrollToDestination(heading);
        return;
      }
      if (attempts > 0 && attempts % 30 === 0) this.loadEarlierConversationTurns();
      requestAnimationFrame(() => this.waitForHeadingDestination(group, descriptor, requestId, attempts + 1));
    }

    getConnectedGroupDestination(group) {
      if (group?.prompt?.isConnected) return group.prompt;
      return group?.assistant?.isConnected ? group.assistant : null;
    }

    getConversationScrollContainer() {
      const roots = [
        document.querySelector(SELECTORS.thread),
        this.thread,
        document.querySelector(SELECTORS.main)
      ];
      const visited = new Set();
      for (const root of roots) {
        let element = root;
        while (element?.parentElement) {
          element = element.parentElement;
          if (visited.has(element)) continue;
          visited.add(element);
          const overflowY = getComputedStyle(element).overflowY;
          if (/^(auto|scroll)$/.test(overflowY) && element.scrollHeight > element.clientHeight) return element;
        }
      }
      const documentScroller = document.scrollingElement;
      return documentScroller?.scrollHeight > documentScroller?.clientHeight ? documentScroller : null;
    }

    scrollConversationToStart() {
      const scroller = this.getConversationScrollContainer();
      if (!scroller) return false;
      scroller.scrollTo({ top: 0, behavior: 'auto' });
      return true;
    }

    loadEarlierConversationTurns() {
      const currentThread = document.querySelector(SELECTORS.thread);
      const oldestRenderedTurn = currentThread?.querySelector(SELECTORS.conversationTurn);
      if (oldestRenderedTurn?.isConnected) {
        oldestRenderedTurn.scrollIntoView({ block: 'start', behavior: 'auto' });
        return true;
      }
      return this.scrollConversationToStart();
    }

    startEarlierPromptLoading() {
      if (!this.hasUnloadedEarlierPrompts()) {
        this.updateEarlierPromptLoader();
        return;
      }

      const requestId = ++this.earlierPromptLoadRequestId;
      if (this.earlierPromptLoader) {
        this.earlierPromptLoader.disabled = true;
        this.earlierPromptLoader.setAttribute('aria-busy', 'true');
      }

      this.earlierPromptLoadTargetIndex = null;
      this.loadNextUnresolvedPrompt();
      this.waitForEarlierPrompts(requestId);
    }

    cancelEarlierPromptLoading() {
      this.earlierPromptLoadRequestId += 1;
      this.earlierPromptLoadTargetIndex = null;
      if (this.earlierPromptLoader) {
        this.earlierPromptLoader.disabled = false;
        this.earlierPromptLoader.removeAttribute('aria-busy');
      }
    }

    getUnresolvedPromptGroups() {
      return this.groups
        .filter((group) => !group.contentCaptured &&
          (Number.isInteger(group.nativeIndex) || Number.isInteger(group.promptIndex)))
        .sort((left, right) => {
          const leftIndex = Number.isInteger(left.nativeIndex) ? left.nativeIndex : left.promptIndex;
          const rightIndex = Number.isInteger(right.nativeIndex) ? right.nativeIndex : right.promptIndex;
          return rightIndex - leftIndex;
        });
    }

    loadNextUnresolvedPrompt(force = false) {
      const group = this.getUnresolvedPromptGroups()[0];
      if (!group) {
        if (force || this.earlierPromptLoadTargetIndex !== -1) {
          this.earlierPromptLoadTargetIndex = -1;
          this.loadEarlierConversationTurns();
        }
        return;
      }

      const index = Number.isInteger(group.nativeIndex) ? group.nativeIndex : group.promptIndex;
      if (!force && this.earlierPromptLoadTargetIndex === index) return;
      this.earlierPromptLoadTargetIndex = index;
      if (group.nativeButton?.isConnected) group.nativeButton.click();
      else this.loadEarlierConversationTurns();
    }

    waitForEarlierPrompts(requestId, attempts = 0) {
      if (requestId !== this.earlierPromptLoadRequestId) return;

      if (!this.hasUnloadedEarlierPrompts()) {
        const firstGroup = this.nativeIndexToGroup.get(0) ||
          this.groups.find((group) => group.promptIndex === 0);
        const destination = this.getConnectedGroupDestination(firstGroup);
        this.finishEarlierPromptLoading();
        if (destination) this.scrollToDestination(destination);
        return;
      }

      if (attempts >= NAVIGATION_RECOVERY_FRAMES) {
        this.finishEarlierPromptLoading();
        this.updateEarlierPromptLoader();
        return;
      }

      const unresolvedIndexes = new Set(this.getUnresolvedPromptGroups().map((group) =>
        Number.isInteger(group.nativeIndex) ? group.nativeIndex : group.promptIndex
      ));
      if (!unresolvedIndexes.has(this.earlierPromptLoadTargetIndex)) this.loadNextUnresolvedPrompt();

      if (attempts > 0 && attempts % 30 === 0) {
        this.loadNextUnresolvedPrompt(true);
        this.syncConversationStructure();
      }
      requestAnimationFrame(() => this.waitForEarlierPrompts(requestId, attempts + 1));
    }

    finishEarlierPromptLoading() {
      this.earlierPromptLoadTargetIndex = null;
      if (this.earlierPromptLoader) {
        this.earlierPromptLoader.disabled = false;
        this.earlierPromptLoader.removeAttribute('aria-busy');
      }
      this.updateEarlierPromptLoader();
    }

    recoverVirtualizedDestination(group, requestId, waitForDestination) {
      if (!this.loadEarlierConversationTurns()) return;
      this.pendingNavigationRequestId = requestId;
      this.setActive(null, group);
      waitForDestination();
    }

    waitForGroupDestination(group, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= NAVIGATION_RECOVERY_FRAMES) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }
      const destination = this.getConnectedGroupDestination(group);
      if (destination) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        this.scrollToDestination(destination);
        return;
      }
      if (attempts > 0 && attempts % 30 === 0) this.loadEarlierConversationTurns();
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
  }

  const navigationMethods = Object.getOwnPropertyDescriptors(NavigationMethods.prototype);
  delete navigationMethods.constructor;
  globalThis.TOCNavigator = globalThis.TOCNavigator || {};
  globalThis.TOCNavigator.navigationMethods = navigationMethods;
  if (typeof module !== 'undefined' && module.exports) module.exports = navigationMethods;
})();
