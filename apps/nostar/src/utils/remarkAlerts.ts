import type { Root, Blockquote } from 'mdast';

/** Recognize only an opening GitHub alert marker; ordinary quotations are unchanged. */
export default function remarkAlerts() {
  return (tree: Root) => {
    const visit = (node: Root | Blockquote | { children?: unknown[] }) => {
      if ('type' in node && node.type === 'blockquote') {
        const quote = node as Blockquote;
        const paragraph = quote.children[0];
        const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
        if (text?.type === 'text') {
          const marker = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/.exec(text.value);
          if (marker) {
            quote.data = { ...quote.data, hProperties: { 'data-markdown-alert': marker[1].toLowerCase() } };
            text.value = text.value.slice(marker[0].length);
            if (paragraph?.type === 'paragraph' && paragraph.children.every(child => child.type === 'text' && !child.value)) quote.children.shift();
          }
        }
      }
      for (const child of node.children ?? []) visit(child as Parameters<typeof visit>[0]);
    };
    visit(tree);
  };
}
