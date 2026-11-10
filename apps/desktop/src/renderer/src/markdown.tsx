// The little Markdown the agent writes and a motion's MOTION.md is written in, drawn as React
// elements (never as HTML, so nothing in the text can run): headings, paragraphs, lists, code
// blocks, quotes, rules, and inline code, bold, italic and links. Anything else stays text.

import { Fragment, type ReactNode } from 'react';

/** Inline spans: `code`, **bold**, *italic* or _italic_, and [text](https://…). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, code, bold, italic, link, href] = match;
    const key = `${at}`;
    if (code) out.push(<code key={key}>{code.slice(1, -1)}</code>);
    else if (bold) out.push(<strong key={key}>{inline(bold.slice(2, -2))}</strong>);
    else if (italic) out.push(<em key={key}>{inline(italic.slice(1, -1))}</em>);
    else if (link && href)
      out.push(
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {whole.slice(1, whole.indexOf(']('))}
        </a>,
      );
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' };

/** The text as blocks, line by line. */
export function blocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i++;
      out.push({ kind: 'code', text: code.join('\n') });
    } else if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      out.push({ kind: 'heading', level, text: line.slice(level).trim() });
      i++;
    } else if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      out.push({ kind: 'rule' });
      i++;
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) {
        let item = lines[i++]!.replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        // a line indented under an item continues it
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) item += ` ${lines[i++]!.trim()}`;
        items.push(item);
      }
      out.push({ kind: 'list', ordered, items });
    } else if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) quote.push(lines[i++]!.replace(/^>\s?/, ''));
      out.push({ kind: 'quote', text: quote.join(' ') });
    } else {
      const paragraph: string[] = [];
      while (i < lines.length && lines[i]!.trim() && !/^(```|#{1,6}\s|>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]!)) paragraph.push(lines[i++]!.trim());
      out.push({ kind: 'paragraph', text: paragraph.join(' ') });
    }
  }
  return out;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      {blocks(source).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${Math.min(6, block.level + 2)}` as 'h3';
            return <Tag key={i}>{inline(block.text)}</Tag>;
          }
          case 'paragraph':
            return <p key={i}>{inline(block.text)}</p>;
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </Tag>
            );
          }
          case 'code':
            return (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            );
          case 'quote':
            return <blockquote key={i}>{inline(block.text)}</blockquote>;
          case 'rule':
            return <hr key={i} />;
          default:
            return <Fragment key={i} />;
        }
      })}
    </div>
  );
}
