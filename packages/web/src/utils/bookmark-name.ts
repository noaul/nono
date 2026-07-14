const MAX_BOOKMARK_LABEL_WIDTH = 9;

export function compactBookmarkLabel(value: string) {
  let width = 0;
  let result = '';

  for (const character of String(value || '').trim()) {
    const characterWidth = visualWidthOf(character);
    if (width + characterWidth > MAX_BOOKMARK_LABEL_WIDTH) return withEllipsis(result);
    result += character;
    width += characterWidth;
  }

  return result;
}

function withEllipsis(value: string) {
  const characters = [...value.trimEnd()];
  let width = characters.reduce((total, character) => total + visualWidthOf(character), 0);
  while (characters.length && width + visualWidthOf('…') > MAX_BOOKMARK_LABEL_WIDTH) {
    width -= visualWidthOf(characters.pop()!);
  }
  return `${characters.join('').trimEnd()}…`;
}

function visualWidthOf(character: string) {
  if (/\s/.test(character)) return 0.25;
  if (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u.test(character)) return 1;
  if (/[A-Za-z0-9]/.test(character)) return 0.55;
  return 0.45;
}
