import { extractArticle, extractPageMetadata, extractSelection } from './shared/extract.js';

/**
 * Injected on demand by `chrome.scripting`, never as a registered content script. The bundle is
 * built as an IIFE because Chrome cannot inject an ES module here.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case 'NONO_EXTRACT':
      sendResponse(extractPageMetadata());
      return true;
    case 'NONO_EXTRACT_ARTICLE':
      sendResponse(extractArticle());
      return true;
    case 'NONO_EXTRACT_SELECTION':
      sendResponse(extractSelection());
      return true;
    default:
      return false;
  }
});
