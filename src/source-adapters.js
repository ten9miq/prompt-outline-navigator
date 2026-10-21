// Detect supported content by its structure, independently of its URL.
(() => {
  'use strict';
  const shared = typeof module !== 'undefined' && module.exports ? require('./shared.js') : globalThis.TOCNavigator;
  const DOCUMENT_SELECTOR = shared.EDITOR_SELECTOR;
  const FEED_SELECTOR = 'article[data-message-id]:has([data-message-id])';
  const isContentVisible = (element) => shared.isTocContent(element);
  const findTocSource = (doc = document) => {
    const documents = Array.from(doc.querySelectorAll(DOCUMENT_SELECTOR)).filter((element) =>
      isContentVisible(element, doc) && !element.closest('button,[data-composer-markdown],[class*="PagePreview-"],[class*="PageThumbnail-"]')
    );
    const conversation = shared.findConversationRoot(doc);
    // Embedded writing blocks belong to their conversation. A separate document
    // (for example, a Space editor beside a chat) can still be the active source.
    const standaloneDocuments = documents.filter((element) => !conversation?.contains(element));
    if (standaloneDocuments.length) return { kind: 'document', root: standaloneDocuments.at(-1) };
    if (conversation && isContentVisible(conversation, doc) &&
        (conversation.querySelector(shared.SELECTORS.conversationIdentity) ||
         conversation.querySelector(shared.SELECTORS.conversationTurn) ||
         conversation.querySelector(shared.SELECTORS.userMessage) ||
         conversation.querySelector(shared.SELECTORS.assistantMessage))) {
      return { kind: 'conversation', root: conversation };
    }
    if (documents.length) return { kind: 'document', root: documents.at(-1) };

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
      shared.isTocContent(article, { excludeDialogs: true })
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
