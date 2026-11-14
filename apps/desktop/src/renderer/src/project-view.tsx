// An open project: the top bar, and the workspace's panels on the ground: the assistant down
// the left, the stage in the middle with its controls along its foot, the project tools on the
// right, the timeline along the bottom. A folder with no film yet is offered one. The keys are
// SHORTCUTS, shown by ? or the keyboard button.

import { ArrowLeft, ChevronDown, Download, Keyboard, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type AgentKind,
  type Agents,
  type BuildResult,
  MAX_MARKS,
  type Mark,
  type Project,
  type Providers,
  type Reference,
  type FilmReview,
  type SceneStills,
} from '../../shared/api';
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
import { Stage, usePlayer } from './preview';
import { Fold, Timeline } from './timeline';
import { reason } from './reason';

type Toast = { text: string; error: boolean; file?: string };

/** The height of the timeline folded to its head, in pixels. */
const FOLDED = 38;

/** Every key the workspace answers, by what it is for, as the shortcuts dialog lists them. */
const SHORTCUTS: [group: string, keys: string[], what: string][] = [
  ['Playing', ['Space'], 'Play or pause'],
  ['Playing', ['K'], 'Play or pause'],
  ['Playing', ['←', '→'], 'Step a frame'],
  ['Playing', ['Shift', '←', '→'], 'Step a second'],
  ['Playing', ['↑', '↓'], 'The previous or the next scene'],
  ['Playing', ['Home', 'End'], 'The start or the end'],
  ['Pointing', ['C'], 'Pick an element, then mark a region, then put the tool down'],
  ['Pointing', ['G'], 'Show or hide the safe-area guides'],
  ['Pointing', ['Esc'], 'Let a mark go, then put the tool down, then clear the selection'],
  ['Timeline', ['+', '−'], 'Zoom in or out (Ctrl and the wheel, about the pointer)'],
  ['Timeline', ['Shift', 'Z'], 'Fit the whole film'],
  ['Message', ['Enter'], 'Send the message; during a turn, add it to the turn (Claude Code) or keep it until the turn ends'],
  ['Message', ['Ctrl', 'Enter'], 'Stop the turn and send'],
  ['Message', ['Shift', 'Enter'], 'A new line in the message'],
  ['Workspace', ['['], 'Show or hide the assistant'],
  ['Workspace', [']'], 'Show or hide the project tools'],
  ['Workspace', ['\\'], 'Fold or show the timeline'],
  ['Workspace', ['F'], 'Focus the film or restore panels'],
  ['Workspace', ['?'], 'Show these shortcuts'],
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
        {[...new Set(SHORTCUTS.map(([group]) => group))].map((group) => (
          <section key={group}>
            <h3 className="eyebrow">{group}</h3>
            <dl>
              {SHORTCUTS.filter(([g]) => g === group).map(([, keys, what]) => (
                <div key={keys.join('+') + what}>
                  <dt>
                    {keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
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
  /** The places marked on the picture, and the stretches on the timeline, for the next message. */
  const [marks, setMarks] = useState<Mark[]>([]);
  /** The mark whose row in the composer is in hand, lit on the picture and the timeline. */
  const [lit, setLit] = useState<number | null>(null);
  /** Asks the composer to put the cursor in a mark's note: its index, and a count that makes each ask new. */
  const [noteRequest, setNoteRequest] = useState({ index: -1, n: 0 });
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
  /** The timeline's height as drawn, which can be more than the layout's, so its handle drags from what is seen. */
  const timelineSheet = useRef<HTMLElement>(null);
  const [timelineHeight, setTimelineHeight] = useState<number | null>(null);
  useEffect(() => {
    const element = timelineSheet.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setTimelineHeight(Math.round(element.getBoundingClientRect().height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [project.film]);
  const [selected, setSelected] = useState<Reference | null>(null);
  /** Whether the stage shows the safe-area guides. */
  const [guides, setGuides] = useState(false);
  /** What was last selected in a panel, which goes with the next message unless it is put aside. */
  const [selection, setSelection] = useState<Reference | null>(null);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [focusRequest, setFocusRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  /** What the agent's last turn changed (activity.ts changeKey), lit in the outline and the timeline for a moment. */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!fresh.size) return;
    const timer = setTimeout(() => setFresh(new Set()), 4000);
    return () => clearTimeout(timer);
  }, [fresh]);
  function restored() {
    setHistoryRevision((n) => n + 1);
    setMarks([]);
    setInspected(null);
  }
  const focusLayout = useRef({ assistant: true, side: true });
  function toggleFocus() {
    if (layout.assistant || showSide) {
      focusLayout.current = { assistant: layout.assistant, side: layout.side };
      setLayout({ assistant: false, side: false });
    } else setLayout(focusLayout.current);
  }
  /** Shows or hides the project tools; a compact window opens them only until it is resized. */
  function showTools(show: boolean) {
    if (compact) {
      setCompactSide(show);
      if (show && !layout.side) setLayout({ side: true });
    } else setLayout({ side: show });
  }
  /** Opens one of the project tools, showing them if they are hidden. */
  function openSide(panel: typeof side) {
    setSide(panel);
    if (!showSide) showTools(true);
  }
  const player = usePlayer(build);
  const active = providers?.providers.find((p) => p.id === providers.active);
  /** The project's agent and the person's own coding agents (ADR 0008). */
  const [agents, setAgents] = useState<Agents | null>(null);
  function refreshAgents() {
    window.studio.agents().then(setAgents, (e) => setToast({ text: reason(e), error: true }));
  }
  useEffect(() => {
    let live = true;
    window.studio.agents().then(
      (found) => live && setAgents(found),
      (e) => live && setToast({ text: reason(e), error: true }),
    );
    return () => {
      live = false;
    };
  }, [project.path]);
  // Nothing is sent until the project's agent is known: a project on Codex must not seem to be on the built-in one.
  const ready = !agents
    ? false
    : agents.current !== 'built-in'
      ? agents.harnesses.find((h) => h.kind === agents.current)?.state === 'ready'
      : !!active?.ready;
  /**
   * Counts the person's switches of agent, each of which starts a new conversation the assistant loads afresh. Not the
   * agent itself: finding it out when the project opens must not draw the assistant again and drop what is in it.
   */
  const [switches, setSwitches] = useState(0);
  async function useAgent(kind: AgentKind) {
    try {
      setAgents(await window.studio.useAgent(kind));
      setSwitches((n) => n + 1);
      setRefs([]);
      setMarks([]);
    } catch (e) {
      setToast({ text: reason(e), error: true });
    }
  }

  useEffect(() => {
    setBuild(null);
    setInspected(null);
    const stop = window.studio.onBuild(setBuild);
    void window.studio.lastBuild().then((last) => last && setBuild((b) => b ?? last));
    return stop;
  }, [project.path, project.film]);

  useEffect(() => window.studio.onExportProgress(setProgress), []);

  /** The scenes' frames for the timeline, of the build they were made from; asked for once a build has settled. */
  const [stills, setStills] = useState<{ version: number; scenes: SceneStills } | null>(null);
  const [stillsError, setStillsError] = useState('');
  useEffect(() => {
    if (!build?.ok) return;
    const version = build.version;
    let live = true;
    // A turn of the agent builds many times: only a build that stays a moment is photographed.
    const timer = setTimeout(() => {
      window.studio.sceneStills(version).then(
        (scenes) => {
          if (!live || !scenes) return;
          setStills({ version, scenes });
          setStillsError('');
        },
        (e) => live && setStillsError(reason(e)),
      );
    }, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [build?.ok, build?.version]);

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
      const film = player.film;
      if (event.key === '?') {
        setShortcuts((open) => !open);
      } else if (event.key === ' ' || event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        player.toggle();
      } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && film?.scenes.length) {
        event.preventDefault();
        // A scene back from a little way into one goes to its own start, as a player's previous does.
        const starts = film.scenes.map((s) => s.start);
        const to =
          event.key === 'ArrowUp'
            ? ([...starts].reverse().find((s) => s < player.t - 0.25) ?? 0)
            : (starts.find((s) => s > player.t + 0.001) ?? player.t);
        seek(to);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        if (film) seek(event.key === 'Home' ? 0 : Math.max(0, film.seconds - 1 / film.fps));
      } else if (event.key === '[') {
        setLayout({ assistant: !layout.assistant });
      } else if (event.key === ']') {
        showTools(!showSide);
      } else if (event.key === '\\') {
        setLayout({ folded: !layout.folded });
      } else if (event.key === 'g' || event.key === 'G') {
        setGuides((shown) => !shown);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        player.step(direction * (event.shiftKey ? (player.film?.fps ?? 30) : 1));
      } else if (event.key === 'f' || event.key === 'F') {
        toggleFocus();
      } else if (event.key === 'c' || event.key === 'C') {
        if (marks.length < MAX_MARKS) player.setTool(player.tool === null ? 'pick' : player.tool === 'pick' ? 'region' : null);
      } else if (event.key === 'Escape') {
        // One thing at a time: the tool goes down first, then the selection.
        if (player.tool) player.setTool(null);
        else {
          setSelected(null);
          setSelection(null);
        }
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

  /** The last check's issues, while it is of the build on screen. */
  const issues = review && review.version === build?.version ? review.issues : [];
  const found = issues.length;
  // The status opens the checks, where the build is looked at more closely.
  const status = (
    <button
      type="button"
      className={`status${!build ? ' busy' : !build.ok || issues.some((i) => i.severity === 'error') ? ' bad' : ''}`}
      data-tip="Checks"
      onClick={() => openSide('review')}
    >
      {!build ? 'Building…' : !build.ok ? 'Does not build' : found ? `Built · ${found} ${found === 1 ? 'issue' : 'issues'}` : 'Built'}
    </button>
  );

  useEffect(() => {
    if (!busy && (marks.length || refs.length))
      setToast({ text: 'The preview changed. Select references again for this version.', error: false });
    setMarks([]);
    setRefs([]);
    setSelected(null);
    setSelection(null);
    setInspected(null);
  }, [build?.version]);

  /** Selects a scene, a layer or a line in a panel: it is shown, and goes with the next message unless put aside. */
  function select(ref: Reference) {
    setSelected(ref);
    setSelection(ref);
    if (ref.time !== undefined) seek(ref.time);
  }

  function mark(next: Mark) {
    if (marks.length >= MAX_MARKS) return;
    setMarks([...marks, next]);
    setLayout({ assistant: true });
    // A stretch of time is said in the composer, which has room for it.
    if (next.end !== undefined) setNoteRequest((r) => ({ index: marks.length, n: r.n + 1 }));
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

  // The timeline is at least its chosen height and takes whatever the stage, no taller than its film, leaves.
  // Folded, it is its head and the stage takes the rest.
  const rows = layout.folded ? `minmax(0, 1fr) ${FOLDED}px` : `minmax(0, auto) minmax(${layout.bottom}px, 1fr)`;

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
        {/* A hidden panel is brought back from here; a shown one hides from its own head. */}
        {project.film && (!layout.assistant || !showSide) && (
          <div className="layout-tools">
            {!layout.assistant && (
              <button
                className="icon-button"
                aria-label="Show assistant"
                data-tip="Show assistant"
                data-key="["
                onClick={() => setLayout({ assistant: true })}
              >
                <PanelLeftOpen size={15} />
              </button>
            )}
            {!showSide && (
              <button className="icon-button" aria-label="Show project tools" data-tip="Show project tools" data-key="]" onClick={() => showTools(true)}>
                <PanelRightOpen size={15} />
              </button>
            )}
          </div>
        )}
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
                data-tip={busy ? 'Export when the agent has finished its turn' : undefined}
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
          style={{
            gridTemplateColumns: `${layout.assistant ? `${layout.left}px ` : ''}minmax(0, 1fr)${showSide ? ` ${layout.right}px` : ''}`,
            gridTemplateRows: rows,
          }}
        >
          <section className="sheet assistant" aria-label="Assistant" style={{ display: layout.assistant ? undefined : 'none' }}>
            <Assistant
              key={`${project.path}:${historyRevision}:${switches}`}
              active={active}
              agents={agents}
              onUseAgent={(kind) => void useAgent(kind)}
              onRefreshAgents={refreshAgents}
              ready={ready}
              disabled={importing || checking || progress !== null}
              onWorking={setBusy}
              refs={refs}
              version={build?.version ?? 0}
              focusRequest={focusRequest}
              onRemoveRef={(i) => setRefs((items) => items.filter((_, n) => n !== i))}
              onSettings={onSettings}
              marks={marks}
              onRemoveMark={(i) => {
                setMarks((m) => m.filter((_, j) => j !== i));
                setLit(null);
              }}
              onNoteMark={(i, note) => setMarks((m) => m.map((mark, j) => (j === i ? { ...mark, note } : mark)))}
              onLight={setLit}
              noteRequest={noteRequest}
              selection={selection}
              onDropSelection={() => setSelection(null)}
              onSent={() => {
                setMarks([]);
                setRefs([]);
                setSelection(null);
                setLit(null);
              }}
              onSeek={seek}
              onSelect={select}
              film={player.film}
              onFresh={(keys) => setFresh(new Set(keys))}
              onUndone={() => {
                setMarks([]);
                setInspected(null);
              }}
              onHide={() => setLayout({ assistant: false })}
              onHistory={() => openSide('history')}
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
            lit={lit}
            selected={selected}
            working={busy}
            guides={guides}
            onGuides={() => setGuides(!guides)}
            onFix={(label, detail) => reference({ kind: 'issue', label, detail })}
            disabled={busy || importing || checking || !build?.ok}
            onMark={(next) => {
              mark(next);
              const { element } = next;
              if (element) {
                setSelected({
                  kind: 'layer',
                  label: element.text || element.layer || 'Selected element',
                  scene: element.scene,
                  layer: element.layer,
                  time: next.t,
                });
                setInspected(next);
                setSide('inspector');
              }
            }}
          />
          <aside
            className="sheet side"
            aria-label="Project tools"
            style={{ gridColumn: layout.assistant ? 3 : 2, display: showSide ? undefined : 'none' }}
          >
            <div className="side-content">
              {/* The four tools at hand are tabs; History opens from the assistant and Checks from the status. */}
              <div className="side-tabs">
                {side === 'history' || side === 'review' ? (
                  <>
                    <button type="button" className="icon-button" aria-label="Back to the outline" data-tip="Back" onClick={() => setSide('outline')}>
                      <ArrowLeft size={15} />
                    </button>
                    <h2>{side === 'history' ? 'History' : 'Checks'}</h2>
                  </>
                ) : (
                  <nav aria-label="Project tools">
                    {(
                      [
                        { id: 'outline', label: 'Outline' },
                        { id: 'inspector', label: 'Inspector' },
                        { id: 'assets', label: 'Assets' },
                        { id: 'motions', label: 'Motions' },
                      ] as const
                    ).map(({ id, label }) => (
                      <button key={id} type="button" aria-pressed={side === id} onClick={() => setSide(id)}>
                        {label}
                      </button>
                    ))}
                  </nav>
                )}
                <span className="spacer" />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Hide project tools"
                  data-tip="Hide project tools"
                  data-key="]"
                  onClick={() => showTools(false)}
                >
                  <PanelRightClose size={15} />
                </button>
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
                <Outline
                  film={player.film}
                  selected={selected}
                  fresh={fresh}
                  t={player.t}
                  playing={player.playing}
                  onSelect={select}
                  onReference={reference}
                  onPlay={player.playRange}
                />
              ) : side === 'history' ? (
                <HistoryPanel
                  busy={busy || importing || checking || progress !== null}
                  revision={build?.version ?? 0}
                  onRestored={restored}
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
            ref={timelineSheet}
            className="sheet timeline-sheet"
            aria-label="Timeline"
            style={{ gridColumn: `${layout.assistant ? 2 : 1} / -1` }}
          >
            {!layout.folded && (
              <Splitter
                axis="y"
                sign={-1}
                value={timelineHeight ?? layout.bottom}
                limits={LIMITS.bottom}
                onChange={(value) => setLayout({ bottom: value })}
                label="Resize the timeline"
                style={{ top: -7 }}
              />
            )}
            {player.film && !layout.folded ? (
              <Timeline
                film={player.film}
                t={player.t}
                playing={player.playing}
                selected={selected}
                onSelect={select}
                marks={marks}
                lit={lit}
                fresh={fresh}
                issues={issues.filter((issue) => issue.time !== undefined)}
                onIssue={(issue) => {
                  seek(issue.time!);
                  reference({
                    kind: 'issue',
                    label: issue.severity === 'warning' ? 'Review this layout' : 'Fix this issue',
                    detail: issue.text,
                    time: issue.time,
                    scene: issue.scene,
                  });
                }}
                onRange={(start, end) => mark({ t: start, end, box: { x: 0, y: 0, w: 1, h: 1 }, element: null, note: '' })}
                onSeek={seek}
                onFold={(folded) => setLayout({ folded })}
                stills={stills?.scenes ?? null}
                stillsError={stillsError}
              />
            ) : (
              <div className="timeline-options">
                <span className="eyebrow">Timeline</span>
                <span className="spacer" />
                <Fold folded={layout.folded} onFold={(folded) => setLayout({ folded })} />
              </div>
            )}
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
            openSide('review');
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
