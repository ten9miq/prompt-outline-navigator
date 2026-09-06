// TOC interaction, destination recovery, scrolling, and collapse behavior.
(() => {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : globalThis.TOCNavigator;
  const { findRemountedHeading } = shared;

  class NavigationMethods {
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
        } else {
          const group = this.headingToGroup.get(heading);
          this.navigateToHeading(heading, group);
        }
        return;
      }

      const header = event.target.closest('.toc-group-header');
      const group = this.groups.find((candidate) => candidate.header === header);
      const destination = this.getConnectedGroupDestination(group);
      if (destination) {
        this.navigationRequestId += 1;
        this.pendingNavigationRequestId = null;
        this.setActive(null, group);
        this.scrollToDestination(destination);
        return;
      }
      if (group?.nativeButton?.isConnected) {
        const requestId = ++this.navigationRequestId;
        this.pendingNavigationRequestId = requestId;
        this.setActive(null, group);
        group.nativeButton.click();
        this.waitForGroupDestination(group, requestId);
      }
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
      }
    }

    findConnectedHeading(group, descriptor) {
      return findRemountedHeading(group?.headings, descriptor);
    }

    waitForHeadingDestination(group, descriptor, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= 120) {
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
      requestAnimationFrame(() => this.waitForHeadingDestination(group, descriptor, requestId, attempts + 1));
    }

    getConnectedGroupDestination(group) {
      if (group?.prompt?.isConnected) return group.prompt;
      return group?.assistant?.isConnected ? group.assistant : null;
    }

    waitForGroupDestination(group, requestId, attempts = 0) {
      if (requestId !== this.navigationRequestId || attempts >= 120) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        return;
      }
      const destination = this.getConnectedGroupDestination(group);
      if (destination) {
        if (this.pendingNavigationRequestId === requestId) this.pendingNavigationRequestId = null;
        this.scrollToDestination(destination);
        return;
      }
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
