import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeftIcon } from '@/components/icons';
import { LargeTitle } from '@/components/ui';
import { parseInline, parseMarkdown, type Block } from '@/lib/markdown';

export const metadata: Metadata = { title: 'Configurar el iPhone' };

/** docs/iphone.md, read when the page is prerendered (build time); null if it isn't there. */
function readGuide(): string | null {
  try {
    return readFileSync(join(process.cwd(), 'docs', 'iphone.md'), 'utf8');
  } catch {
    return null;
  }
}

const back = (
  <Link href="/ajustes" className="ui-bar-button app-back">
    <ChevronLeftIcon />
    Ajustes
  </Link>
);

function inline(text: string): ReactNode[] {
  return parseInline(text).map((part, i) => {
    switch (part.kind) {
      case 'link':
        return (
          <a key={i} href={part.href} target="_blank" rel="noreferrer">
            {part.text}
          </a>
        );
      case 'strong':
        return <strong key={i}>{part.text}</strong>;
      case 'code':
        return <code key={i}>{part.text}</code>;
      default:
        return part.text;
    }
  });
}

function block(b: Block, i: number): ReactNode {
  if (b.kind === 'paragraph') return <p key={i}>{inline(b.text)}</p>;
  if (b.kind === 'heading') {
    // The page's large title already says what the guide is; its own "# " title is skipped.
    if (b.level === 1) return null;
    const H = b.level === 2 ? 'h2' : 'h3';
    return (
      <H key={i} id={b.id}>
        {inline(b.text)}
      </H>
    );
  }
  const List = b.ordered ? 'ol' : 'ul';
  return (
    <List key={i}>
      {b.items.map((lines, j) => (
        <li key={j}>
          {lines.map((line, k) => (
            <span key={k}>
              {k > 0 && <br />}
              {inline(line)}
            </span>
          ))}
        </li>
      ))}
    </List>
  );
}

export default function IphoneGuidePage() {
  const guide = readGuide();
  return (
    <LargeTitle title="Configurar el iPhone" leading={back}>
      <article className="app-doc">
        {guide ? parseMarkdown(guide).map(block) : <p>La guía estará aquí muy pronto.</p>}
      </article>
    </LargeTitle>
  );
}
