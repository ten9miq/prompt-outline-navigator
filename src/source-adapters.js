// Detect supported content by its structure, independently of its URL.
(() => {
  'use strict';
  const shared = typeof module !== 'undefined' && module.exports ? require('./shared.js') : globalThis.TOCNavigator;
  const DOCUMENT_SELECTOR = '[data-markdown-copy-content] .ProseMirror:not([data-composer-markdown])';
  const FEED_SELECTOR = 'article[data-message-id]:has([data-message-id])';
  const isContentVisible = (element, doc) => {
    if (element.closest?.('[hidden],[aria-hidden="true"],[inert],nav,#chatgpt-toc-sidebar')) return false;
    if (element.getClientRects?.().length === 0) return false;
    const style = doc.defaultView?.getComputedStyle(element);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  };
  const findTocSource = (doc = document) => {
    const documents = Array.from(doc.querySelectorAll(DOCUMENT_SELECTOR)).filter((element) =>
      isContentVisible(element, doc) && !element.closest('button,[data-composer-markdown],[class*="PagePreview-"],[class*="PageThumbnail-"]')
    );
    if (documents.length) return { kind: 'document', root: documents.at(-1) };

    const conversation = shared.findConversationRoot(doc);
    if (conversation && isContentVisible(conversation, doc) &&
        (conversation.querySelector(shared.SELECTORS.conversationIdentity) ||
         conversation.querySelector(shared.SELECTORS.conversationTurn) ||
         conversation.querySelector(shared.SELECTORS.userMessage))) {
      return { kind: 'conversation', root: conversation };
    }

    const messages = Array.from(doc.querySelectorAll(FEED_SELECTOR)).filter((element) =>
      isContentVisible(element, doc) && !element.closest('button,[role="dialog"],[role="alertdialog"],[data-composer-markdown]')
    );
    let scroller = messages[0]?.parentElement;
    while (scroller) {
      const overflow = doc.defaultView?.getComputedStyle(scroller).overflowY;
      if (/^(auto|scroll)$/.test(overflow) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const root = scroller || messages[0]?.closest('main,[role="main"],[role="log"]');
    return root ? { kind: 'feed', root } : null;
  };
  const getSourceBlocks = (source) => {
    if (!source) return [];
    if (source.kind === 'document') return [{ assistant: source.root, prompt: null, key: null }];
    if (source.kind !== 'feed') return [];
    return Array.from(source.root.querySelectorAll(FEED_SELECTOR)).filter((article) =>
      isContentVisible(article, article.ownerDocument) && !article.closest('button')
    ).map((article) => {
      const id = article.getAttribute('data-message-id');
      const body = Array.from(article.querySelectorAll('[data-message-id]'))
        .find((element) => element.getAttribute('data-message-id') === id) || article;
      return { assistant: body, prompt: null, key: `message:${id}` };
    });
  };
  const api = { findTocSource, getSourceBlocks };
  Object.assign(shared, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
