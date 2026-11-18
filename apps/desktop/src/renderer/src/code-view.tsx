// The code view: the project's files as a tree in the project tools, and the one opened across the stage, read-only,
// its syntax coloured. The film's code is the agent's to write; here it is read, copied, opened in the person's own
// editor, and pointed at: lines picked go with the next message, and a scene, layer or line of the outline brings
// the lines that write it into sight. What is shown is read again when the film is rebuilt or the window comes back.

import { usePreferences } from './preferences';
import { ArrowLeft, ChevronRight, Copy, ExternalLink, File, FileCode, Folder, Quote } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { parse, type TokenType } from 'sugar-high/core';
import { tokenize as css } from 'sugar-high/lang/css';
import { tokenize as markdown } from 'sugar-high/lang/markdown';
import { tokenize as typescript } from 'sugar-high/lang/typescript';
import type { ProjectFile, Reference } from '../../shared/api';
import { filmSpans, spanLines } from '../../shared/spans';
import { reason } from './reason';

/** A scene, a layer or a line of the outline whose lines the code view is asked to show; `n` counts the asks. */
export type CodeFocus = { target: { scene?: string; layer?: string; line?: string }; n: number };

/** The tokenizer for a file, by its extension: TypeScript (and JSX, and JSON) unless it is CSS or Markdown. */
const tokenizerFor = (path: string) => (/\.css$/i.test(path) ? css : /\.md$/i.test(path) ? markdown : typescript);

/** The lines picked, as a reference for the next message: where they are and what they say. */
export function codeReference(path: string, text: string, from: number, to: number): Reference {
  const place = `${path}:${from}${to > from ? `-${to}` : ''}`;
  const lines = text.split('\n').slice(from - 1, to).join('\n');
  return { kind: 'code', label: place, path, source: place, detail: `Lines ${from}${to > from ? `-${to}` : ''} of ${path}:\n${lines}`.slice(0, 4000) };
}

/** A file read, and read again when the film is rebuilt or the window comes back into focus. */
function useFile(path: string, revision: number) {
  const [file, setFile] = useState<{ path: string; text: string | null; error: string | null }>({ path, text: null, error: null });
  useEffect(() => {
    let live = true;
    const read = () =>
      window.studio.readProjectFile(path).then(
        (text) => live && setFile({ path, text, error: null }),
        (e) => live && setFile({ path, text: null, error: reason(e) }),
      );
    void read();
    addEventListener('focus', read);
    return () => {
      live = false;
      removeEventListener('focus', read);
    };
  }, [path, revision]);
  return file.path === path ? file : { path, text: null, error: null };
}

/** The lines a selection inside `pre` covers, by the rows it starts and ends in, or null. */
function pickedLines(pre: HTMLElement | null): { from: number; to: number } | null {
  const selection = getSelection();
  if (!pre || !selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return null;
  const row = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-line]');
  const a = row(selection.anchorNode);
  const b = row(selection.focusNode);
  if (!a || !b || !pre.contains(a) || !pre.contains(b)) return null;
  const [from, to] = [Number(a.dataset.line), Number(b.dataset.line)].sort((x, y) => x - y);
  return { from: from!, to: to! };
}

/** One file across the stage, read-only. Memoised: the workspace draws on every tick of the playhead. */
export const CodeView = memo(function CodeView({
  path,
  revision,
  focus,
  onClose,
  onReference,
}: {
  path: string;
  revision: number;
  focus: CodeFocus | null;
  onClose(): void;
  onReference(ref: Reference): void;
}) {
  const { t: tr } = usePreferences();
  const { text, error } = useFile(path, revision);
  const lines = useMemo(() => (text === null ? [] : parse(text, { tokenize: tokenizerFor(path) }).lines), [text, path]);
  const pre = useRef<HTMLPreElement>(null);
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState('');
  // The lines film.tsx writes the scene, layer or line asked for with, brought to the middle and lit.
  const lit = useMemo(() => (focus && text !== null && path === 'film.tsx' ? spanLines(filmSpans(text)(focus.target)) : null), [focus, text, path]);
  useEffect(() => {
    if (lit) pre.current?.querySelector(`[data-line="${lit.from}"]`)?.scrollIntoView({ block: 'center' });
  }, [lit, focus?.n]);
  useEffect(() => setPicked(null), [path, text]);
  // Esc goes back to the picture, unless a dialog or a menu is open over it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.dialog, .menu')) onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const gutter = `calc(${String(lines.length).length}ch + 28px)`;
  const range = picked && `${picked.from}${picked.to > picked.from ? `–${picked.to}` : ''}`;
  return (
    <div className="stage code-view">
      <div className="code-head">
        <button type="button" className="button quiet" onClick={onClose} data-tip={tr("Back to the picture")} data-key="Esc">
          <ArrowLeft size={14} />
          {tr("Picture")}
        </button>
        <h2 className="mono">{path}</h2>
        {text !== null && <span className="note">{tr("{0} lines", {0: lines.length})}</span>}
        <span className="spacer" />
        <button
          type="button"
          className="button quiet"
          disabled={!picked || text === null}
          data-tip={picked ? tr("Add these lines to your message") : tr("Select lines to add them to your message")}
          onClick={() => {
            if (!picked || text === null) return;
            onReference(codeReference(path, text, picked.from, picked.to));
            getSelection()?.removeAllRanges();
            setPicked(null);
          }}
        >
          <Quote size={14} />
          {range ? tr("Lines {0} to the message", {0: range}) : tr("Add lines")}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={tr("Copy")}
          data-tip={copied ? tr("Copied") : tr("Copy")}
          disabled={text === null}
          onClick={() =>
            text !== null &&
            navigator.clipboard.writeText(text).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              (e) => setProblem(reason(e)),
            )
          }
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={tr("Open in your editor")}
          data-tip={tr("Open in your editor")}
          onClick={() => window.studio.openProjectFile(path).catch((e) => setProblem(reason(e)))}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      <p className="code-note">{tr("Read only: the assistant writes the code. Select lines to point at them.")}</p>
      {(error || problem) && (
        <p className="callout" role="alert">
          {error || problem}
        </p>
      )}
      {text !== null && (
        <pre
          ref={pre}
          className="code-text"
          tabIndex={0}
          aria-label={tr("The code of {0}", {0: path})}
          onMouseUp={() => setPicked(pickedLines(pre.current))}
          onKeyUp={() => setPicked(pickedLines(pre.current))}
        >
          <code>
            {lines.map((line) => {
              const n = line.index + 1;
              const on = lit && n >= lit.from && n <= lit.to;
              return (
                <span key={line.index} data-line={n} className={`code-line${on ? ' lit' : ''}`}>
                  <span className="code-number" aria-hidden="true" style={{ width: gutter }}>
                    {n}
                  </span>
                  <span className="code-tokens">
                    {line.tokens.length === 0 || line.value === ''
                      ? ' '
                      : line.tokens.map((token, i) => (
                          <span key={i} className={`tok-${token.type as TokenType}`}>
                            {token.value}
                          </span>
                        ))}
                  </span>
                </span>
              );
            })}
          </code>
        </pre>
      )}
    </div>
  );
});

type TreeNode = { name: string; path: string; file?: ProjectFile; children: TreeNode[] };

/** Paths as a tree: folders first, then files, each by name. */
export function treeOf(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    let level = root;
    const parts = file.path.split('/');
    parts.forEach((name, i) => {
      const leaf = i === parts.length - 1;
      let node = level.find((n) => n.name === name && !n.file === !leaf);
      if (!node) level.push((node = { name, path: parts.slice(0, i + 1).join('/'), ...(leaf ? { file } : {}), children: [] }));
      level = node.children;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name)).map((n) => ({ ...n, children: sort(n.children) }));
  return sort(root);
}

/** Folders that start folded: what the film takes (its motions) and its media, which are not its own code. */
const FOLDED = new Set(['motions', 'media', 'voice']);

/** The project's files, in the project tools: a text file opens across the stage, anything else in its own program. */
export function CodeFiles({ revision, open, onOpen }: { revision: number; open: string | null; onOpen(path: string): void }) {
  const { t: tr } = usePreferences();
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [error, setError] = useState('');
  /** The folders the person turned from how they start (folded or open). */
  const [turned, setTurned] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const read = () =>
      window.studio.projectFiles().then(
        (found) => {
          if (!live) return;
          setFiles(found);
          setError('');
        },
        (e) => live && setError(reason(e)),
      );
    void read();
    addEventListener('focus', read);
    return () => {
      live = false;
      removeEventListener('focus', read);
    };
  }, [revision]);
  const tree = useMemo(() => treeOf(files ?? []), [files]);
  const isOpen = (node: TreeNode) => FOLDED.has(node.path) === turned.has(node.path);
  const toggle = (node: TreeNode) =>
    setTurned((current) => {
      const next = new Set(current);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  const draw = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) =>
      node.file ? (
        <li key={node.path}>
          <button
            type="button"
            className="code-file"
            aria-current={open === node.path ? 'page' : undefined}
            style={{ paddingLeft: 8 + depth * 14 }}
            data-tip={node.file.text ? undefined : tr("Opens in its own program")}
            onClick={() => (node.file!.text ? onOpen(node.path) : void window.studio.openProjectFile(node.path).catch((e) => setError(reason(e))))}
          >
            {node.file.text ? <FileCode size={13} /> : <File size={13} />}
            <span>{node.name}</span>
          </button>
        </li>
      ) : (
        <li key={node.path}>
          <button type="button" className="code-folder" aria-expanded={isOpen(node)} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(node)}>
            <ChevronRight size={12} />
            <Folder size={13} />
            <span>{node.name}</span>
          </button>
          {isOpen(node) && <ul>{draw(node.children, depth + 1)}</ul>}
        </li>
      ),
    );
  return (
    <div className="body code-files">
      <p className="note">{tr("The video's code, read-only. Open a file to read it beside the assistant.")}</p>
      {error && (
        <p className="callout" role="alert">
          {error}
        </p>
      )}
      {files === null ? <p className="note">{tr("Looking for your files…")}</p> : <ul className="code-tree">{draw(tree, 0)}</ul>}
    </div>
  );
}
