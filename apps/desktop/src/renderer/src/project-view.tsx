// An open project: the top bar, and the workspace's panels on the ground: the assistant down
// the left, the stage in the middle, motions and the inspector on the right, the transport and
// timeline along the bottom. A folder with no film yet is offered one. The keys are SHORTCUTS,
// shown by ? or the keyboard button.

import {
  ChevronDown,
  Download,
  Keyboard,
  X,
  ListTree,
  Palette,
  Crosshair,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  FolderOpen,
  Maximize2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type BuildResult, MAX_MARKS, type Mark, type Project, type Providers, type Reference, type FilmReview } from '../../shared/api';
import { Assistant } from './assistant';
import { AssetsPanel } from './assets-panel';
import { ReviewPanel } from './review-panel';
import { ExportDialog } from './export-dialog';
import { Outline } from './outline';
import { HistoryPanel } from './history-panel';
import { Inspector } from './inspector';
import { LIMITS, Splitter, useLayout } from './layout';
import { Logo } from './logo';
import { MotionPanel } from './motion-panel';
import { Stage, Transport, usePlayer } from './preview';
import { reason } from './reason';

type Toast = { text: string; error: boolean; file?: string };

/** Every key the workspace answers, as the shortcuts dialog lists them. */
const SHORTCUTS: [keys: string[], what: string][] = [
  [['Space'], 'Play or pause'],
  [['←', '→'], 'Step a frame'],
  [['Shift', '←', '→'], 'Step a second'],
  [['C'], 'Pick an element, then mark a region, then put the tool down'],
  [['Esc'], 'Put the tool down, or close a dialog'],
  [['Enter'], 'Send the message'],
  [['Shift', 'Enter'], 'A new line in the message'],
  [['?'], 'Show these shortcuts'],
  [['F'], 'Focus the film or restore panels'],
];

function Shortcuts({ onClose }: { onClose(): void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="icon-button" aria-label="Close" data-tip="Close" data-key="Esc" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <dl>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what}>
              <dt>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Whether a key press belongs to a field the person is typing in. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

interface Props {
  project: Project;
  providers: Providers | null;
  onSettings(): void;
  onChange(project: Project): void;
  onClose(): void;
}

export function ProjectView({ project, providers, onSettings, onChange, onClose }: Props) {
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [review, setReview] = useState<FilmReview | null>(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** The places marked on the picture for the next message. */
  const [marks, setMarks] = useState<Mark[]>([]);
  /** The element last picked, which the inspector shows; it stays after its mark is sent. */
  const [inspected, setInspected] = useState<Mark | null>(null);
  const [side, setSide] = useState<'outline' | 'motions' | 'inspector' | 'history' | 'review' | 'assets'>('outline');
  const [shortcuts, setShortcuts] = useState(false);
  /** Whether the menu of other ways to export is open. */
  const [menu, setMenu] = useState(false);
  const [layout, setLayout] = useLayout();
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 1100px)').matches);
  const [compactSide, setCompactSide] = useState(false);
  useEffect(() => {
    const query = matchMedia('(max-width: 1100px)');
    const change = () => {
      setCompact(query.matches);
      setCompactSide(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const showSide = layout.side && (!compact || compactSide);
  const [selected, setSelected] = useState<Reference | null>(null);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [focusRequest, setFocusRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const focusLayout = useRef({ assistant: true, side: true });
  function toggleFocus() {
    if (layout.assistant || showSide) {
      focusLayout.current = { assistant: layout.assistant, side: layout.side };
      setLayout({ assistant: false, side: false });
    } else setLayout(focusLayout.current);
  }
  const player = usePlayer(build);
  const active = providers?.providers.find((p) => p.id === providers.active);

  useEffect(() => {
    setBuild(null);
    setInspected(null);
    const stop = window.studio.onBuild(setBuild);
    void window.studio.lastBuild().then((last) => last && setBuild((b) => b ?? last));
    return stop;
  }, [project.path, project.film]);

  useEffect(() => window.studio.onExportProgress(setProgress), []);

  // The export menu closes when the person clicks anywhere else.
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest('.export'))) setMenu(false);
    };
    addEventListener('pointerdown', close);
    return () => removeEventListener('pointerdown', close);
  }, [menu]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 12000 : 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && shortcuts) return setShortcuts(false);
      if (event.key === 'Escape' && menu) return setMenu(false);
      if (document.querySelector('dialog[open], [role=dialog]')) return;
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '?') {
        setShortcuts((open) => !open);
      } else if (event.key === ' ') {
        event.preventDefault();
        player.toggle();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        player.step(direction * (event.shiftKey ? (player.film?.fps ?? 30) : 1));
      } else if (event.key === 'f' || event.key === 'F') {
        toggleFocus();
      } else if (event.key === 'c' || event.key === 'C') {
        if (marks.length < MAX_MARKS) player.setTool(player.tool === null ? 'pick' : player.tool === 'pick' ? 'region' : null);
      } else if (event.key === 'Escape') {
        setSelected(null);
        player.setTool(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  async function checkFilm() {
    if (busy || importing || checking || progress !== null) return;
    setChecking(true);
    setCheckError('');
    try {
      setReview(await window.studio.reviewFilm());
    } catch (e) {
      setCheckError(reason(e));
    } finally {
      setChecking(false);
    }
  }

  async function exportFilm() {
    setToast(null);
    setProgress(0);
    try {
      const file = await window.studio.exportFilm();
      if (file) setToast({ text: `Exported ${file.split(/[/\\]/).pop()}`, error: false, file });
    } catch (e) {
      setToast({ text: reason(e), error: true });
    } finally {
      setProgress(null);
    }
  }

  async function exportRemotion() {
    if (busy || importing || checking || progress !== null) return;
    setImporting(true);
    setMenu(false);
    setToast(null);
    try {
      const folder = await window.studio.exportRemotion();
      if (folder) setToast({ text: `Exported a Remotion project to ${folder.split(/[/\\]/).pop()}`, error: false, file: folder });
    } catch (e) {
      setToast({ text: reason(e), error: true });
    } finally {
      setImporting(false);
    }
  }

  async function startFilm() {
    try {
      onChange(await window.studio.startFilm());
    } catch (e) {
      setToast({ text: reason(e), error: true });
    }
  }

  function seek(t: number) {
    if (player.playing) player.tell({ type: 'oms:pause' });
    player.seek(t);
  }

  const status = !build ? (
    <span className="status busy">Building…</span>
  ) : build.ok ? (
    <span className="status">Built</span>
  ) : (
    <span className="status bad">Does not build</span>
  );

  useEffect(() => {
    if (!busy && (marks.length || refs.length))
      setToast({ text: 'The preview changed. Select references again for this version.', error: false });
    setMarks([]);
    setRefs([]);
    setSelected(null);
    setInspected(null);
  }, [build?.version]);

  function select(ref: Reference) {
    setSelected(ref);
    if (ref.time !== undefined) seek(ref.time);
  }
  function reference(ref: Reference) {
    if (busy || importing || checking || progress !== null) return;
    if (!build?.ok && ref.kind !== 'asset' && ref.kind !== 'issue') {
      setToast({ text: 'Fix the current build before referencing the picture.', error: true });
      return;
    }
    if (refs.length >= 8) {
      setToast({ text: 'A message carries up to eight references. Remove one to add another.', error: false });
      return;
    }
    setLayout({ assistant: true });
    setRefs((current) => (current.some((r) => JSON.stringify(r) === JSON.stringify(ref)) ? current : [...current, ref]));
    setFocusRequest((n) => n + 1);
  }

  const bottom = layout.folded ? 46 : layout.bottom;

  return (
    <main className="project">
      <header className="topbar">
        <button
          type="button"
          className="icon-button"
          disabled={busy || importing || checking || progress !== null}
          aria-label="Close the project"
          data-tip="Close the project"
          onClick={onClose}
        >
          <Logo />
        </button>
        <span className="name" title={project.path}>
          {project.name}
        </span>
        {project.film && status}
        <span className="spacer" />
        <div className="layout-tools">
          <button
            className="icon-button"
            aria-label={layout.assistant ? 'Hide assistant' : 'Show assistant'}
            data-tip={layout.assistant ? 'Hide assistant' : 'Show assistant'}
            onClick={() => setLayout({ assistant: !layout.assistant })}
          >
            {layout.assistant ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label={showSide ? 'Hide project tools' : 'Show project tools'}
            data-tip={showSide ? 'Hide project tools' : 'Show project tools'}
            onClick={() => {
              if (compact) {
                setCompactSide(!showSide);
                if (!layout.side) setLayout({ side: true });
              } else setLayout({ side: !layout.side });
            }}
          >
            {showSide ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
          <button
            className="icon-button"
            aria-label="Focus the film"
            data-tip="Focus the film"
            data-key="F"
            aria-pressed={!layout.assistant && !showSide}
            onClick={toggleFocus}
          >
            <Maximize2 size={15} />
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Keyboard shortcuts"
          data-tip="Keyboard shortcuts"
          data-key="?"
          onClick={() => setShortcuts(true)}
        >
          <Keyboard size={16} />
        </button>
        {project.film &&
          (progress === null ? (
            <span className="export">
              <button
                type="button"
                className="button accent"
                onClick={() => {
                  setExportOpen(true);
                  void checkFilm();
                }}
                disabled={!build?.ok || busy || importing || checking}
              >
                <Download size={15} />
                Export
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Other ways to export"
                aria-expanded={menu}
                data-tip="Other ways to export"
                disabled={!build?.ok || busy || importing || checking}
                onClick={() => setMenu((open) => !open)}
              >
                <ChevronDown size={15} />
              </button>
              {menu && (
                <span className="menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void exportRemotion()}>
                    <strong>Remotion project…</strong>
                    <span>The film as a Remotion project, each scene a Series.Sequence</span>
                  </button>
                </span>
              )}
            </span>
          ) : (
            <button type="button" className="button" onClick={() => void window.studio.cancelExport()} data-tip="Cancel the export">
              <X size={14} />
              Exporting {Math.round(progress * 100)}%
            </button>
          ))}
      </header>

      {project.film ? (
        <div
          className="workspace"
          style={
            {
              '--left': `${layout.left}px`,
              '--right': `${layout.right}px`,
              '--bottom': `${bottom}px`,
              gridTemplateColumns: `${layout.assistant ? `${layout.left}px ` : ''}minmax(0, 1fr)${showSide ? ` ${layout.right}px` : ''}`,
            } as React.CSSProperties
          }
        >
          <section className="sheet assistant" aria-label="Assistant" style={{ display: layout.assistant ? undefined : 'none' }}>
            <Assistant
              key={`${project.path}:${historyRevision}`}
              active={active}
              ready={!!active?.ready}
              disabled={importing || checking || progress !== null}
              onWorking={setBusy}
              refs={refs}
              version={build?.version ?? 0}
              focusRequest={focusRequest}
              onRemoveRef={(i) => setRefs((items) => items.filter((_, n) => n !== i))}
              onSettings={onSettings}
              marks={marks}
              onRemoveMark={(i) => setMarks((m) => m.filter((_, j) => j !== i))}
              onSent={() => {
                setMarks([]);
                setRefs([]);
              }}
              onSeek={seek}
            />
            <Splitter
              axis="x"
              value={layout.left}
              limits={LIMITS.left}
              onChange={(left) => setLayout({ left })}
              label="Resize the assistant"
              style={{ right: -7 }}
            />
          </section>
          <Stage
            player={player}
            column={layout.assistant ? 2 : 1}
            build={build}
            marks={marks}
            selected={selected}
            disabled={busy || importing || checking || !build?.ok}
            onMark={(mark) => {
              setMarks((m) => (m.length < MAX_MARKS ? [...m, mark] : m));
              if (mark.element) {
                setSelected({
                  kind: 'layer',
                  label: mark.element.text || mark.element.layer || 'Selected element',
                  scene: mark.element.scene,
                  layer: mark.element.layer,
                  time: mark.t,
                });
                setInspected(mark);
                setSide('inspector');
              }
            }}
          />
          <aside
            className="sheet side"
            aria-label="Project tools"
            style={{ gridColumn: layout.assistant ? 3 : 2, display: showSide ? undefined : 'none' }}
          >
            <nav className="side-tools" aria-label="Workspace panels">
              {(
                [
                  { id: 'outline', label: 'Outline', icon: ListTree },
                  { id: 'motions', label: 'Motions', icon: Palette },
                  { id: 'assets', label: 'Assets', icon: FolderOpen },
                  { id: 'inspector', label: 'Inspector', icon: Crosshair },
                  { id: 'history', label: 'History', icon: History },
                  { id: 'review', label: 'Checks', icon: ShieldCheck },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="icon-button"
                  aria-pressed={side === id}
                  aria-label={label}
                  data-tip={label}
                  onClick={() => setSide(id)}
                >
                  <Icon size={17} />
                </button>
              ))}
            </nav>
            <div className="side-content">
              <div className="head">
                <h2>
                  {side === 'outline'
                    ? 'Outline'
                    : side === 'motions'
                      ? 'Motions'
                      : side === 'history'
                        ? 'History'
                        : side === 'review'
                          ? 'Checks'
                          : side === 'assets'
                            ? 'Assets'
                            : 'Inspector'}
                </h2>
              </div>
              {side === 'assets' ? (
                <AssetsPanel disabled={busy || checking || progress !== null} onBusy={setImporting} onReference={reference} />
              ) : side === 'review' ? (
                <ReviewPanel
                  review={review}
                  checking={checking}
                  stale={review?.version !== build?.version}
                  disabled={busy || progress !== null}
                  error={checkError}
                  onCheck={() => void checkFilm()}
                  onSeek={seek}
                  onReference={reference}
                />
              ) : side === 'outline' ? (
                <Outline film={player.film} selected={selected} onSelect={select} onReference={reference} onPlay={player.playRange} />
              ) : side === 'history' ? (
                <HistoryPanel
                  busy={busy || importing || checking || progress !== null}
                  revision={build?.version ?? 0}
                  onRestored={() => {
                    setHistoryRevision((n) => n + 1);
                    setMarks([]);
                    setInspected(null);
                  }}
                />
              ) : side === 'motions' ? (
                <MotionPanel onBusy={setImporting} disabled={busy || importing || checking || progress !== null} />
              ) : (
                <Inspector mark={inspected} film={player.film} onSeek={seek} />
              )}
            </div>
            <Splitter
              axis="x"
              sign={-1}
              value={layout.right}
              limits={LIMITS.right}
              onChange={(right) => setLayout({ right })}
              label="Resize the side panel"
              style={{ left: -7 }}
            />
          </aside>
          <section
            className="sheet transport-sheet"
            aria-label="Transport and timeline"
            style={{ gridColumn: `${layout.assistant ? 2 : 1} / -1` }}
          >
            {!layout.folded && (
              <Splitter
                axis="y"
                sign={-1}
                value={layout.bottom}
                limits={LIMITS.bottom}
                onChange={(value) => setLayout({ bottom: value })}
                label="Resize the timeline"
                style={{ top: -7 }}
              />
            )}
            <Transport
              selected={selected}
              onSelect={select}
              player={player}
              marks={marks}
              folded={layout.folded}
              onFold={(folded) => setLayout({ folded })}
            />
          </section>
        </div>
      ) : (
        <div className="empty">
          <p>This folder holds no film yet.</p>
          <button type="button" className="button primary" onClick={startFilm}>
            Start a film here
          </button>
        </div>
      )}

      {exportOpen && (
        <ExportDialog
          review={review}
          checking={checking}
          stale={review?.version !== build?.version}
          error={checkError}
          onCheck={() => void checkFilm()}
          onClose={() => setExportOpen(false)}
          onIssues={() => {
            setExportOpen(false);
            setSide('review');
          }}
          onExport={() => {
            setExportOpen(false);
            void exportFilm();
          }}
        />
      )}
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}

      {toast && (
        <div className={`toast${toast.error ? ' bad' : ''}`} role={toast.error ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          {toast.file && (
            <button type="button" className="button" onClick={() => void window.studio.showExported()}>
              Show in folder
            </button>
          )}
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setToast(null)} style={{ color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
