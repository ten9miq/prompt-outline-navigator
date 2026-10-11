// Scroll-position tracking and active TOC item synchronization.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const {
    SELECTORS,
    ACTIVE_ROOT_MARGIN,
    getNavigationOffset,
    findActiveTrackingTarget,
    findActiveGroupRange
  } = shared;

  class ActiveTrackerMethods {
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
      this.boundCancelNavigation ||= (event) => this.cancelNavigationOnUserInput(event);
      window.addEventListener('wheel', this.boundCancelNavigation, { capture: true, passive: true });
      window.addEventListener('touchstart', this.boundCancelNavigation, { capture: true, passive: true });
      window.addEventListener('pointerdown', this.boundCancelNavigation, { capture: true, passive: true });
      window.addEventListener('keydown', this.boundCancelNavigation, true);
    }

    scheduleActiveUpdate() {
      if (this.activeUpdateFrame !== null) return;
      this.activeUpdateFrame = requestAnimationFrame(() => {
        this.activeUpdateFrame = null;
        try {
          this.updateActiveFromScrollPosition();
        } finally {
          this.preserveTocScrollOnActiveUpdate = false;
        }
      });
    }

    isLiveConversationElement(element) {
      return Boolean(element?.isConnected && this.thread?.contains(element));
    }

    getLiveGroupRanges(viewportHeight) {
      const ranges = [];
      const groupsWithAssistant = new Set();
      if (!this.thread?.isConnected) return ranges;
      const assistants = this.source && this.source.kind !== 'conversation'
        ? this.groups.map((group) => group.assistant).filter((element) => element?.isConnected)
        : this.thread.querySelectorAll(SELECTORS.assistantMessage);
      assistants.forEach((assistant) => {
        const group = this.turnToGroup.get(assistant);
        if (!group || groupsWithAssistant.has(group)) return;

        const turn = this.source && this.source.kind !== 'conversation' ? null : assistant.closest(SELECTORS.conversationTurn);
        const assistantRect = (turn || assistant).getBoundingClientRect();
        if (assistantRect.bottom <= assistantRect.top) return;

        const prompt = this.isLiveConversationElement(group.prompt) ? group.prompt : null;
        const promptTurn = prompt?.closest(SELECTORS.conversationTurn);
        const promptRect = (promptTurn || prompt)?.getBoundingClientRect();
        ranges.push({
          group,
          assistant,
          top: promptRect ? Math.min(promptRect.top, assistantRect.top) : assistantRect.top,
          bottom: Math.max(promptRect?.bottom ?? assistantRect.bottom, assistantRect.bottom)
        });
        groupsWithAssistant.add(group);
      });

      this.groups.forEach((group) => {
        if (groupsWithAssistant.has(group)) return;
        const prompt = this.isLiveConversationElement(group.prompt) ? group.prompt : null;
        const promptTurn = prompt?.closest(SELECTORS.conversationTurn);
        const promptRect = (promptTurn || prompt)?.getBoundingClientRect();
        if (promptRect && promptRect.bottom > promptRect.top &&
            promptRect.bottom >= 0 && promptRect.top <= viewportHeight) {
          ranges.push({ group, assistant: null, top: promptRect.top, bottom: promptRect.bottom });
        }
      });
      return ranges;
    }

    getActiveHeadingInRange(range, activationY) {
      const targets = Array.from(range.assistant?.querySelectorAll(SELECTORS.headings) || [])
        .filter((heading) => this.headingToTocItem.has(heading))
        .map((heading) => ({ element: heading, heading, group: range.group }));
      return findActiveTrackingTarget(targets, activationY)?.heading || null;
    }

    updateActiveFromScrollPosition() {
      this.updateEarlierPromptLoader?.();
      if (!this.thread?.isConnected) {
        this.setActive(null, null);
        return;
      }
      if (this.pendingNavigationRequestId !== null && this.activeGroup) {
        this.setActive(this.activeHeading, this.activeGroup);
        return;
      }
      const activationY = getNavigationOffset(window.innerHeight);
      const ranges = this.getLiveGroupRanges(window.innerHeight);
      const activeRange = findActiveGroupRange(
        ranges,
        activationY,
        Math.max(96, window.innerHeight * 0.15)
      );
      if (activeRange) {
        const heading = this.getActiveHeadingInRange(activeRange, activationY);
        this.setActive(heading, activeRange.group);
        return;
      }

      if (this.activeGroup) {
        this.setActive(this.activeHeading, this.activeGroup);
        return;
      }

      this.setActive(null, this.groups[0] || null);
    }

    setActive(heading, group) {
      const item = this.headingToTocItem.get(heading);
      const sameSelection = this.activeHeading === heading && this.activeGroup === group;
      const headingStateMatches = !heading || item?.classList.contains('active');
      const groupStateMatches = !group || group.header.classList.contains('active');
      const fallbackStateMatches = !group
        || group.header.classList.contains('active-fallback') === !item;
      if (sameSelection && headingStateMatches && groupStateMatches && fallbackStateMatches) return;
      this.headingToTocItem.get(this.activeHeading)?.classList.remove('active');
      this.activeGroup?.header.classList.remove('active', 'active-fallback');
      this.activeHeading = heading;
      this.activeGroup = group;
      item?.classList.add('active');
      if (group) {
        group.header.classList.add('active');
        group.header.classList.toggle('active-fallback', !item);
      }
      const visibleItem = item && !item.hidden && !group?.content.hidden ? item : group?.header;
      if (!this.preserveTocScrollOnActiveUpdate) this.ensureTocItemVisible(visibleItem);
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
  }

  const activeTrackerMethods = Object.getOwnPropertyDescriptors(ActiveTrackerMethods.prototype);
  delete activeTrackerMethods.constructor;
  globalThis.TOCNavigator = globalThis.TOCNavigator || {};
  globalThis.TOCNavigator.activeTrackerMethods = activeTrackerMethods;
  if (typeof module !== 'undefined' && module.exports) module.exports = activeTrackerMethods;
})();
