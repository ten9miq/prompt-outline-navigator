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
    resolveActiveTrackingSelection,
    getNativeTocIndex
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
      const selection = resolveActiveTrackingSelection(nativeGroup, target, this.groups);
      this.setActive(selection.heading, selection.group);
    }

    setActive(heading, group) {
      if (this.activeHeading === heading && this.activeGroup === group) return;
      this.headingToTocItem.get(this.activeHeading)?.classList.remove('active');
      this.activeGroup?.header.classList.remove('active', 'active-fallback');
      this.activeHeading = heading;
      this.activeGroup = group;
      const item = this.headingToTocItem.get(heading);
      item?.classList.add('active');
      if (group) {
        group.header.classList.add('active');
        group.header.classList.toggle('active-fallback', !item);
      }
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
  }

  const activeTrackerMethods = Object.getOwnPropertyDescriptors(ActiveTrackerMethods.prototype);
  delete activeTrackerMethods.constructor;
  globalThis.TOCNavigator = globalThis.TOCNavigator || {};
  globalThis.TOCNavigator.activeTrackerMethods = activeTrackerMethods;
  if (typeof module !== 'undefined' && module.exports) module.exports = activeTrackerMethods;
})();
