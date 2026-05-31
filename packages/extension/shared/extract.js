export function extractPageMetadata(doc = document) {
  const read = (selector) => doc.querySelector(selector)?.content || '';
  const text = String(doc.body?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    title: doc.title || read('meta[property="og:title"]'),
    description: read('meta[name="description"]') || read('meta[property="og:description"]'),
    ogTitle: read('meta[property="og:title"]'),
    ogImage: read('meta[property="og:image"]'),
    content: text.slice(0, 500),
  };
}
