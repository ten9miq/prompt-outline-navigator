// TOC interaction, destination recovery, scrolling, and collapse behavior.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const { SELECTORS, findConversationRoot, findRemountedHeading, getNavigationOffset, NAVIGATION_RECOVERY_FRAMES } = shared;

  class NavigationMethods {
    handleTocClick(event) {
      const earlierPromptLoader = event.target.closest('.toc-load-earlier');
      if (earlierPromptLoader) {
        this.cancelPendingNavigation?.();
        this.startEarlierPromptLoading();
        return;
      }

      this.cancelPendingNavigation?.();
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
        const requestId = ++this.navigationRequestId;
        this.pendingNavigationRequestId = requestId;
        this.setActive(null, group);
        this.scrollToDestination(destination);
        this.waitForSmoothScrollEnd(requestId, () => this.settleGroupDestination(group, requestId));
        return;
      }
      const requestId = ++this.navigationRequestId;
      this.pendingNavigationRequestId = requestId;
      this.setActive(null, group);
      this.recoverVirtualizedDestination(group, requestId, () => this.waitForGroupDestination(group, requestId));
    }

    navigateToHeading(heading, group) {
      const requestId = ++this.navigationRequestId;
      this.pendingNavigationRequestId = requestId;
      this.setActive(heading, group);
      const descriptor = shared.describeOutlineTarget(heading, group?.headings);
      const disclosure = heading.isConnected && shared.getWritingBlockDisclosure(heading);
      if (disclosure) {
        if (disclosure.button.getAttribute('aria-expanded') === 'false') disclosure.button.click();
        this.waitForWritingBlockExpansion(group, descriptor, requestId);
        return;
      }
      if (heading.isConnected) {
        this.scrollToDestination(heading);
        this.waitForSmoothScrollEnd(requestId, () => this.settleHeadingDestination(group, descriptor, requestId));
        return;
      }

      const prompt = this.getConnectedGroupDestination(group);
      if (prompt) {
        this.scrollToDestination(prompt, 'auto');
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
      const heading = findRemountedHeading(group?.headings, descriptor);
      return heading && !shared.getWritingBlockDisclosure(heading) ? heading : null;
    }

    waitForWritingBlockExpansion(group, descriptor, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= NAVIGATION_RECOVERY_FRAMES) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }
      const heading = this.findConnectedHeading(group, descriptor);
      if (heading) {
        this.setActive(heading, group);
        this.scrollToDestination(heading);
        this.waitForSmoothScrollEnd(requestId, () => this.settleHeadingDestination(group, descriptor, requestId));
        return;
      }
      requestAnimationFrame(() => this.waitForWritingBlockExpansion(group, descriptor, requestId, attempts + 1));
    }

    waitForHeadingDestination(group, descriptor, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= NAVIGATION_RECOVERY_FRAMES) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }
      const heading = this.findConnectedHeading(group, descriptor);
      if (heading) {
        this.setActive(heading, group);
        this.scrollToDestination(heading, 'auto');
        this.settleHeadingDestination(group, descriptor, requestId);
        return;
      }
      if (attempts > 0 && attempts % 30 === 0) this.retryGroupRecovery(group);
      requestAnimationFrame(() => this.waitForHeadingDestination(group, descriptor, requestId, attempts + 1));
    }

    settleHeadingDestination(group, descriptor, requestId, attempts = 0, stableFrames = 0) {
      const heading = this.findConnectedHeading(group, descriptor);
      if (!heading) {
        this.waitForHeadingDestination(group, descriptor, requestId, attempts);
        return;
      }
      this.settleDestination(
        heading,
        requestId,
        attempts,
        stableFrames,
        (nextStableFrames) => this.settleHeadingDestination(
          group,
          descriptor,
          requestId,
          attempts + 1,
          nextStableFrames
        ),
        () => this.setActive(heading, group)
      );
    }

    getConnectedGroupDestination(group) {
      const belongsToGroup = (element) => {
        if (!element?.isConnected || !this.thread?.contains(element)) return false;
        return element === group?.prompt || element === group?.assistant;
      };
      const destination = belongsToGroup(group?.prompt)
        ? group.prompt
        : (belongsToGroup(group?.assistant) ? group.assistant : null);
      if (destination) this.rememberGroupDestination(group, destination);
      return destination;
    }

    rememberGroupDestination(group, destination = null) {
      if (!group) return false;
      const target = destination || (group.prompt?.isConnected ? group.prompt : group.assistant);
      if (!target?.isConnected || !this.thread?.contains(target)) return false;
      const scroller = this.getConversationScrollContainer();
      if (!scroller) return false;
      const scrollerTop = (scroller.getBoundingClientRect?.().top || 0) + (scroller.clientTop || 0);
      const reverse = getComputedStyle(scroller).flexDirection === 'column-reverse';
      const delta = target.getBoundingClientRect().top - scrollerTop;
      const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const desired = scroller.scrollTop + delta;
      group.lastKnownScrollTop = reverse
        ? Math.max(-range, Math.min(0, desired))
        : Math.max(0, Math.min(range, desired));
      return true;
    }

    scrollToRememberedGroupDestination(group) {
      if (!Number.isFinite(group?.lastKnownScrollTop)) return false;
      const scroller = this.getConversationScrollContainer();
      if (!scroller) return false;
      const reverse = getComputedStyle(scroller).flexDirection === 'column-reverse';
      const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const top = reverse
        ? Math.max(-range, Math.min(0, group.lastKnownScrollTop))
        : Math.max(0, Math.min(range, group.lastKnownScrollTop));
      scroller.scrollTo({ top, behavior: 'auto' });
      return true;
    }

    retryGroupRecovery(group) {
      if (this.scrollToRememberedGroupDestination(group)) return true;
      return this.loadEarlierConversationTurns();
    }

    getConversationScrollContainer() {
      if (this.source && this.source.kind !== 'conversation') {
        let element = this.source.root;
        while (element) {
          if (/^(auto|scroll)$/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) return element;
          element = element.parentElement;
        }
        return null;
      }
      const thread = findConversationRoot(document);
      const explicitScroller = thread?.closest?.(SELECTORS.conversationScroll) ||
        thread?.querySelector?.(SELECTORS.conversationScroll) ||
        document.querySelector(SELECTORS.conversationScroll);
      const roots = [explicitScroller, thread, this.thread, document.querySelector(SELECTORS.main)];
      const visited = new Set();
      for (const root of roots) {
        let element = root;
        while (element) {
          if (!visited.has(element)) {
            visited.add(element);
            const overflowY = getComputedStyle(element).overflowY;
            if (/^(auto|scroll)$/.test(overflowY) && element.scrollHeight > element.clientHeight) return element;
          }
          element = element.parentElement;
        }
      }
      const documentScroller = document.scrollingElement;
      return documentScroller?.scrollHeight > documentScroller?.clientHeight ? documentScroller : null;
    }

    scrollConversationToStart() {
      const scroller = this.getConversationScrollContainer();
      if (!scroller) return false;
      const reverse = getComputedStyle(scroller).flexDirection === 'column-reverse';
      const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTo({ top: reverse ? -range : 0, behavior: 'auto' });
      return true;
    }

    scrollConversationToElement(element, behavior = 'smooth') {
      const scroller = this.getConversationScrollContainer();
      if (!scroller) {
        shared.getOutlineElement(element).scrollIntoView({ behavior, block: 'start' });
        return false;
      }
      const reverse = getComputedStyle(scroller).flexDirection === 'column-reverse';
      const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const offset = getNavigationOffset(window.innerHeight);
      const viewportTop = scroller.getBoundingClientRect().top + scroller.clientTop + offset;
      const desiredTop = scroller.scrollTop + element.getBoundingClientRect().top - viewportTop;
      const top = reverse
        ? Math.max(-range, Math.min(0, desiredTop))
        : Math.max(0, Math.min(range, desiredTop));
      scroller.scrollTo({ top, behavior });
      return true;
    }

    loadEarlierConversationTurns() {
      const currentThread = findConversationRoot(document);
      const oldestRenderedTurn = currentThread?.querySelector(SELECTORS.conversationTurn);
      if (oldestRenderedTurn?.isConnected) {
        this.scrollConversationToElement(oldestRenderedTurn, 'auto');
        return true;
      }
      return this.scrollConversationToStart();
    }

    startEarlierPromptLoading() {
      if (!this.hasEarlierConversationTurns()) {
        this.updateEarlierPromptLoader();
        return;
      }

      const requestId = ++this.earlierPromptLoadRequestId;
      if (this.earlierPromptLoader) {
        this.earlierPromptLoader.disabled = true;
        this.earlierPromptLoader.setAttribute('aria-busy', 'true');
      }

      this.scrollConversationToStart();
      requestAnimationFrame(() => {
        if (requestId !== this.earlierPromptLoadRequestId) return;
        this.finishEarlierPromptLoading();
      });
    }

    cancelEarlierPromptLoading() {
      this.earlierPromptLoadRequestId += 1;
      if (this.earlierPromptLoader) {
        this.earlierPromptLoader.disabled = false;
        this.earlierPromptLoader.removeAttribute('aria-busy');
      }
    }

    finishEarlierPromptLoading() {
      if (this.earlierPromptLoader) {
        this.earlierPromptLoader.disabled = false;
        this.earlierPromptLoader.removeAttribute('aria-busy');
      }
      this.updateEarlierPromptLoader();
    }

    recoverVirtualizedDestination(group, requestId, waitForDestination) {
      if (!this.retryGroupRecovery(group)) return;
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
        this.scrollToDestination(destination, 'auto');
        this.settleGroupDestination(group, requestId);
        return;
      }
      if (attempts > 0 && attempts % 30 === 0) this.retryGroupRecovery(group);
      requestAnimationFrame(() => this.waitForGroupDestination(group, requestId, attempts + 1));
    }

    settleGroupDestination(group, requestId, attempts = 0, stableFrames = 0) {
      const destination = this.getConnectedGroupDestination(group);
      if (!destination) {
        this.waitForGroupDestination(group, requestId, attempts);
        return;
      }
      this.settleDestination(
        destination,
        requestId,
        attempts,
        stableFrames,
        (nextStableFrames) => this.settleGroupDestination(
          group,
          requestId,
          attempts + 1,
          nextStableFrames
        ),
        () => this.setActive(null, group)
      );
    }

    settleDestination(element, requestId, attempts, stableFrames, continueSettling, onSettled) {
      if (requestId !== this.navigationRequestId || attempts >= NAVIGATION_RECOVERY_FRAMES) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }

      const scroller = this.getConversationScrollContainer();
      if (!scroller || !element?.isConnected) {
        requestAnimationFrame(() => continueSettling(0));
        return;
      }

      const reverse = getComputedStyle(scroller).flexDirection === 'column-reverse';
      const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const scrollerTop = scroller.getBoundingClientRect().top + (scroller.clientTop || 0);
      const viewportTop = scrollerTop + shared.getNavigationOffset(window.innerHeight);
      const targetTop = element.getBoundingClientRect().top;
      const desiredTop = scroller.scrollTop + targetTop - viewportTop;
      const top = reverse
        ? Math.max(-range, Math.min(0, desiredTop))
        : Math.max(0, Math.min(range, desiredTop));
      const scrollDelta = top - scroller.scrollTop;
      const alignmentDelta = targetTop - viewportTop;
      if (Math.abs(scrollDelta) > 2) {
        scroller.scrollTo({ top, behavior: 'auto' });
        requestAnimationFrame(() => continueSettling(0));
        return;
      }

      if (Math.abs(alignmentDelta) > 2) {
        if (stableFrames < 2) {
          requestAnimationFrame(() => continueSettling(stableFrames + 1));
          return;
        }
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        onSettled();
        this.scheduleActiveUpdate();
        return;
      }

      if (stableFrames < 2) {
        requestAnimationFrame(() => continueSettling(stableFrames + 1));
        return;
      }
      if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
      onSettled();
      this.scheduleActiveUpdate();
    }

    waitForSmoothScrollEnd(requestId, onComplete) {
      this.smoothScrollCleanup?.();
      const scroller = this.getConversationScrollContainer() || document.scrollingElement;
      if (!scroller) { onComplete(); return; }
      const eventTarget = scroller === globalThis.document?.scrollingElement ? document : scroller;
      let frame = null, startedAt = null, stableFrames = 0, moved = false, ended = false, cancelled = false;
      let lastTop = scroller.scrollTop, lastLeft = scroller.scrollLeft;
      const supportsScrollEnd = 'onscrollend' in eventTarget;
      let endTop = lastTop, endLeft = lastLeft;
      const onEnd = (event) => {
        if (event.target === eventTarget) { ended = true; endTop = scroller.scrollTop; endLeft = scroller.scrollLeft; }
      };
      const cleanup = () => {
        cancelled = true;
        if (frame !== null) cancelAnimationFrame(frame);
        eventTarget.removeEventListener?.('scrollend', onEnd);
        if (this.smoothScrollCleanup === cleanup) this.smoothScrollCleanup = null;
      };
      this.smoothScrollCleanup = cleanup;
      eventTarget.addEventListener?.('scrollend', onEnd);
      const finish = () => {
        cleanup();
        if (requestId === this.navigationRequestId) onComplete();
      };
      const sample = (now) => {
        if (cancelled) return;
        if (requestId !== this.navigationRequestId) { cleanup(); return; }
        if (scroller.isConnected === false) { finish(); return; }
        startedAt ??= now;
        const changed = Math.abs(scroller.scrollTop - lastTop) > 0.5 || Math.abs(scroller.scrollLeft - lastLeft) > 0.5;
        if (changed) {
          moved = true; stableFrames = 0;
          if (scroller.scrollTop !== endTop || scroller.scrollLeft !== endLeft) ended = false;
        }
        else stableFrames++;
        lastTop = scroller.scrollTop; lastLeft = scroller.scrollLeft;
        // Do not issue a corrective scroll while the native animation is moving.
        if ((moved || now - startedAt >= 150) &&
            (ended && stableFrames >= 2 || (!supportsScrollEnd || !moved) && stableFrames >= 6)) { finish(); return; }
        if (now - startedAt >= 4000) {
          cleanup();
          if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
          this.scheduleActiveUpdate();
          return;
        }
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
    }

    scrollToDestination(element, behavior = 'smooth') {
      const owner = shared.getOutlineElement(element);
      owner.classList.add('chatgpt-toc-scroll-target');
      this.scrollConversationToElement(element, behavior);
      this.flashDestination(element);
      setTimeout(() => owner.classList.remove('chatgpt-toc-scroll-target'), 1000);
    }

    cancelPendingNavigation() {
      this.smoothScrollCleanup?.();
      if (this.pendingNavigationRequestId === null) return;
      this.navigationRequestId += 1;
      this.pendingNavigationRequestId = null;
    }

    cancelNavigationOnUserInput(event) {
      if (event.type === 'keydown' &&
          !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(event.key)) return;
      this.cancelPendingNavigation();
    }

    flashDestination(element) {
      element = shared.getOutlineElement(element);
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
