(function () {
  function readMeta(selector) {
    return document.querySelector(selector)?.content || '';
  }

  function extractPageMetadata() {
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      title: document.title || readMeta('meta[property="og:title"]'),
      description: readMeta('meta[name="description"]') || readMeta('meta[property="og:description"]'),
      ogTitle: readMeta('meta[property="og:title"]'),
      ogImage: readMeta('meta[property="og:image"]'),
      content: text.slice(0, 500),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'NONO_EXTRACT') return false;
    sendResponse(extractPageMetadata());
    return true;
  });
})();
