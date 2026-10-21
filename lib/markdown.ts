/**
 * Just enough Markdown for docs/iphone.md (shown at /ajustes/iphone): headings, paragraphs,
 * numbered and bulleted lists (indented lines continue an item), links, bare URLs, bold, code.
 * Produces data, not HTML, so the page renders it with plain React elements.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'strong'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: number; text: string; id: string | undefined }
  | { kind: 'paragraph'; text: string }
  /** Each item is its lines (the first, then indented continuations). */
  | { kind: 'list'; ordered: boolean; items: string[][] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Extract<Block, { kind: 'list' }> | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
    list = null;
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    const ordered = ORDERED.exec(line);
    const bullet = BULLET.exec(line);
    if (heading) {
      flush();
      const step = /^(\d+)\./.exec(heading[2]);
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2], id: step ? `paso-${step[1]}` : undefined });
    } else if (ordered || bullet) {
      const isOrdered = Boolean(ordered);
      if (paragraph.length || !list || list.ordered !== isOrdered) {
        flush();
        list = { kind: 'list', ordered: isOrdered, items: [] };
        blocks.push(list);
      }
      list.items.push([(ordered ?? bullet)![1]]);
    } else if (list && /^\s/.test(raw)) {
      list.items[list.items.length - 1].push(line);
    } else {
      list = null;
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const INLINE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.kind === 'text') last.text += t;
    else out.push({ kind: 'text', text: t });
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    pushText(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1]) out.push({ kind: 'link', text: m[1], href: m[2] });
    else if (m[3]) {
      // A sentence's final punctuation is not part of the URL.
      const url = m[3].replace(/[.,;:]+$/, '');
      out.push({ kind: 'link', text: url, href: url });
      pushText(m[3].slice(url.length));
    } else if (m[4]) out.push({ kind: 'strong', text: m[4] });
    else out.push({ kind: 'code', text: m[5] });
  }
  pushText(text.slice(at));
  return out;
}
