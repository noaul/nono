export function articleTextFromHtml(html: string) {
  const doc = document.implementation.createHTMLDocument('clip');
  const article = doc.createElement('div');
  article.innerHTML = html;
  doc.body.appendChild(article);
  return article.textContent || '';
}
