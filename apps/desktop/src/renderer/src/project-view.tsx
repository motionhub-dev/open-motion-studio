// An open project: the top bar, and the workspace's panels on the ground: the assistant down
// the left, the stage in the middle with its controls along its foot, the project tools on the
// right, the timeline along the bottom. A folder with no film yet is offered one. The keys are
// SHORTCUTS, shown by ? or the keyboard button.

import { SystemMessage, Translated, usePreferences } from './preferences';
import { translate } from '../../shared/i18n';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  FolderOpen,
  Home,
  Mic,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  SquareArrowDownLeft,
  SquareArrowOutUpRight,
  X,
  Sparkles,
  GitCommitVertical,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  type AgentKind,
  type VoiceKind,
  type AgentSettings,
  type Agents,
  type BuildResult,
  MAX_MARKS,
  ofPicture,
  type Mark,
  type Project,
  type ProjectTask,
  type Providers,
  type Reference,
  type FilmReview,
  type SceneStills,
} from '../../shared/api';
import { Assistant, type AssistantHandle } from './assistant';
import { AssetsPanel, assetReference } from './assets-panel';
import { CodeFiles, type CodeFocus, CodeView } from './code-view';
import { ReviewPanel } from './review-panel';
import { ExportDialog } from './export-dialog';
import { VoiceView } from './voice-view';
import { type Hovered, Outline } from './outline';
import { HistoryPanel } from './history-panel';
import { LIMITS, Splitter, useLayout } from './layout';
import { MotionLibrary } from './motion-library';
import { Stage, usePlayer } from './preview';
import { Fold, Timeline } from './timeline';
import { reason } from './reason';

type Toast = { text: string; error: boolean; file?: string };

/** The width of a side panel put away to its rail, in pixels. */
const RAIL = 40;
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
  ['Workspace', ['Ctrl/⌘', 'Shift', 'N'], 'Open this film in an editor window'],
  ['App', ['Ctrl/⌘', 'N'], 'Start a new film'],
  ['App', ['Ctrl/⌘', 'O'], 'Open a project folder'],
  ['App', ['Ctrl/⌘', ','], 'Open Settings'],
];

function Shortcuts({ onClose, onSettings }: { onClose(): void; onSettings(): void }) {
  const { t: tr } = usePreferences();
  // The editor's bar has no Settings button: its row here opens them, as well as naming the key.
  const actions: Record<string, () => void> = { 'Open Settings': onSettings };
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Keyboard shortcuts")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2><Translated text="Keyboard shortcuts" /></h2>
          <button type="button" className="icon-button" aria-label={tr("Close")} data-tip={tr("Close")} data-key="Esc" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="shortcut-groups">
        {[...new Set(SHORTCUTS.map(([group]) => group))].map((group) => (
          <section key={group}>
            <h3 className="eyebrow">{tr(group)}</h3>
            <dl>
              {SHORTCUTS.filter(([g]) => g === group).map(([, keys, what]) => (
                <div key={keys.join('+') + what}>
                  <dt>
                    {keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>
                    {actions[what] ? (
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          onClose();
                          actions[what]?.();
                        }}
                      >
                        {tr(what)}
                      </button>
                    ) : (
                      tr(what)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The project's title and its menu, about this project alone: rename it (a double-click on the title does too), copy
 * it as a new project, and move it between the main window and a window of its own; and where its folder is, which
 * opens it. Home and the other projects are reached from Home.
 */
function ProjectMenu({ project, onError, onVersions }: { project: Project; onError(error: unknown): void; onVersions(): void }) {
  const { t: tr } = usePreferences();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [open, setOpen] = useState(false);
  /** The name being typed while the title is being renamed. */
  const [naming, setNaming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stop = window.studio.onTasks(setTasks);
    window.studio.tasks().then(setTasks, onError);
    return stop;
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', key); };
  }, [open]);

  const separate = tasks.find((task) => task.project.path === project.path)?.separate ?? false;
  /** Closes the menu and runs one of its actions, saying what went wrong. */
  const act = (action: () => Promise<unknown>) => {
    setOpen(false);
    action().catch(onError);
  };
  /** Ends renaming: a new name renames the folder (main process), the same or an empty one changes nothing. */
  function rename(name: string) {
    if (naming === null) return;
    setNaming(null);
    const next = name.trim();
    if (next && next !== project.name) window.studio.libraryAction(project.path, 'rename', next).catch(onError);
  }

  return (
    <div className="project-switcher" ref={ref}>
      {naming !== null ? (
        <input
          className="project-rename"
          aria-label={tr("Project name")}
          value={naming}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setNaming(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') rename(naming);
            if (event.key === 'Escape') setNaming(null);
          }}
          onBlur={() => rename(naming)}
        />
      ) : (
        <button
          type="button"
          className="project-switcher-button"
          aria-label={tr("Project menu")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onDoubleClick={() => {
            setOpen(false);
            setNaming(project.name);
          }}
        >
          <span className="name" title={project.path}>{project.name}</span>
          <ChevronDown size={13} />
        </button>
      )}
      {open && (
        <div className="menu project-menu" role="menu">
          <span className="menu-label">{tr("This project")}</span>
          <button type="button" role="menuitem" className="icon-item" onClick={() => { setOpen(false); setNaming(project.name); }}>
            <Pencil size={15} aria-hidden="true" />
            {tr("Rename…")}
          </button>
          <button type="button" role="menuitem" className="icon-item" onClick={() => act(() => window.studio.libraryAction(project.path, 'duplicate'))}>
            <Copy size={15} aria-hidden="true" />
            {tr("Duplicate as a new project")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="icon-item"
            onClick={() => {
              setOpen(false);
              onVersions();
            }}
          >
            <GitCommitVertical size={15} aria-hidden="true" />
            {tr("Versions…")}
          </button>
          {separate ? (
            <button type="button" role="menuitem" className="icon-item" onClick={() => act(() => window.studio.openTask(project.path, false))}>
              <SquareArrowDownLeft size={15} aria-hidden="true" />
              {tr("Move back to the main window")}
            </button>
          ) : (
            <button type="button" role="menuitem" className="icon-item" onClick={() => act(() => window.studio.newWindow())}>
              <SquareArrowOutUpRight size={15} aria-hidden="true" />
              {tr("Open in its own window")}
              <kbd>{'Ctrl/⌘ Shift N'}</kbd>
            </button>
          )}
          <hr />
          {/* Where the project is: its folder, written out, and a way to open it. */}
          <button
            type="button"
            role="menuitem"
            className="icon-item folder-item"
            title={project.path}
            onClick={() => act(() => window.studio.libraryAction(project.path, 'show'))}
          >
            <FolderOpen size={15} aria-hidden="true" />
            <span className="folder-text">
              <b>{tr("Show in folder")}</b>
              <span className="mono">{project.display}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Whether a key press belongs to a field the person is typing in. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

interface Props {
  project: Project;
  providers: Providers | null;
  /** Opens Models, on one of the person's own coding agents when one is named. */
  settingsOpen?: boolean;
  onGlobalSettings(): void;
  onSettings(agent?: Exclude<AgentKind, 'built-in'>): void;
  /** Opens Models on a voice provider. */
  onVoiceSettings(kind: VoiceKind): void;
  /** Changes each time Models closes, which may have changed how the agents run. */
  modelsClosed: number;
  onChange(project: Project): void;
  onClose(): void;
}

export function ProjectView({ onGlobalSettings, settingsOpen, project, providers, onSettings, onVoiceSettings, modelsClosed, onChange, onClose }: Props) {
  const { t, t: tr } = usePreferences();
  const [build, setBuild] = useState<BuildResult | null>(null);
  const [review, setReview] = useState<FilmReview | null>(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const assistant = useRef<AssistantHandle>(null);
  /** A mark was added to be sent at once: the message goes once the tray has it. */
  const [applying, setApplying] = useState(false);
  useEffect(() => {
    if (!applying) return;
    setApplying(false);
    assistant.current?.submit();
  }, [applying]);
  const [progress, setProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  /** The places marked on the picture, and the stretches on the timeline, for the next message. */
  const [marks, setMarks] = useState<Mark[]>([]);
  /** The mark whose row in the composer is in hand, lit on the picture and the timeline. */
  const [lit, setLit] = useState<number | null>(null);
  /** Asks the composer to put the cursor in a mark's note: its index, and a count that makes each ask new. */
  const [noteRequest, setNoteRequest] = useState({ index: -1, n: 0 });
  const [side, setSide] = useState<'outline' | 'code' | 'history' | 'review' | 'assets'>('outline');
  /**
   * What is across the workspace in place of the picture, or null for the picture: a file of code (and the lines it is
   * asked to show), in the stage's place; or the motion library or the voice, over the stage, the timeline and the
   * project tools.
   */
  const [centre, setCentre] = useState<{ kind: 'code'; path: string; focus: CodeFocus | null } | { kind: 'motions' } | { kind: 'voice' } | null>(null);
  const closeCentre = useCallback(() => setCentre(null), []);
  const code = centre?.kind === 'code' ? centre : null;
  const library = centre?.kind === 'motions';
  const voicing = centre?.kind === 'voice';
  /** A view that takes the timeline's and the project tools' places too. */
  const wide = library || voicing;
  // The code view wants height, not the timeline: it folds the timeline to its head while it is open, and opens it
  // again on leaving, unless the person had folded it themselves.
  const foldedForCode = useRef(false);
  useEffect(() => {
    if (code && !layout.folded) {
      foldedForCode.current = true;
      setLayout({ folded: true });
    } else if (!code && foldedForCode.current) {
      foldedForCode.current = false;
      setLayout({ folded: false });
    }
  }, [code !== null]);
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
  /** The layer under the pointer in the outline or on the timeline, shown in both and on the picture. */
  const [hovered, setHovered] = useState<Hovered>(null);
  /** Whether the stage shows the safe-area guides. */
  const [guides, setGuides] = useState(false);
  /** What was last selected in a panel, which goes with the next message unless it is put aside. */
  const [selection, setSelection] = useState<Reference | null>(null);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [focusRequest, setFocusRequest] = useState(0);
  /** What the person asked for on Home when they created this project, until the assistant sends it. */
  const [brief, setBrief] = useState<string | null>(null);
  useEffect(() => {
    window.studio.takeBrief().then(setBrief, (e) => setToast({ text: reason(e), error: true }));
  }, []);
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
  /** Asks the project's agent to give the film a voice (the selected one, or one it chooses) and speak its lines. */
  /** Sends the agent a request of the workspace's own (a size, a motion to apply), with the assistant in view. */
  function ask(text: string) {
    setLayout({ assistant: true });
    assistant.current?.send(text);
  }
  function generateNarration(voice?: string) {
    setLayout({ assistant: true });
    assistant.current?.send(
      `Generate narration for this film. ${voice ? `Use my selected voice ${JSON.stringify(voice)}; do not choose a different voice.` : 'Choose a suitable voice from my configured voice providers, matching the script’s language and tone.'} Keep the existing script, adding narration lines only if needed. Apply the voice, generate the speech and check the result.`,
    );
  }
  /** Opens one of the project tools, showing them if they are hidden. */
  /** Files from the computer are being dragged over the workspace, which says it will import them. */
  const [fileDrop, setFileDrop] = useState(false);
  /** How many assets and motions the project holds, for their tabs; counted again when either may have changed. */
  const [counts, setCounts] = useState<{ assets: number; motions: number } | null>(null);
  useEffect(() => {
    if (importing) return;
    let live = true;
    Promise.all([window.studio.projectAssets(), window.studio.projectMotions()]).then(
      ([assets, motions]) => live && setCounts({ assets: assets.length, motions: motions.length }),
      (e: unknown) => console.error('Counting the assets and motions failed:', e),
    );
    return () => {
      live = false;
    };
  }, [importing, build?.version]);
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
  }, [project.path, modelsClosed]);
  async function saveAgentSettings<K extends keyof AgentSettings>(kind: K, settings: AgentSettings[K]) {
    try {
      setAgents(await window.studio.saveAgentSettings(kind, settings));
    } catch (e) {
      setToast({ text: reason(e), error: true });
    }
  }
  // Nothing is sent until the project's agent is known: a project on Codex must not seem to be on the built-in one.
  const ready = !agents
    ? false
    : agents.current !== 'built-in'
      ? agents.harnesses.find((h) => h.kind === agents.current)?.state === 'ready'
      : !!active?.ready;
  /** Whether the agent can take a request of the workspace's own now. */
  const canAsk = ready && !busy && !importing && !checking && progress === null;
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

  useEffect(() => {
    if (settingsOpen) player.tell({ type: 'oms:pause' });
  }, [settingsOpen]);

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
      if (document.querySelector('.studio-settings')) return;
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
      if (file) setToast({ text: translate("Exported {0}", false, {0: file.split(/[/\\]/).pop()}), error: false, file });
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
      if (folder) setToast({ text: translate("Exported a Remotion project to {0}", false, {0: folder.split(/[/\\]/).pop()}), error: false, file: folder });
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
      data-tip={tr("Checks")}
      onClick={() => openSide('review')}
    >
      {!build ? tr("Building…") : !build.ok ? tr("Does not build") : found ? tr("Built · {0} {1}", {0: found, 1: found === 1 ? 'issue' : 'issues'}) : tr("Built")}
    </button>
  );

  useEffect(() => {
    if (!busy && (marks.length || refs.length))
      setToast({ text: "The preview changed. Select references again for this version.", error: false });
    setMarks([]);
    setRefs([]);
    setSelected(null);
    setSelection(null);
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
    if (!build?.ok && ofPicture(ref)) {
      setToast({ text: "Fix the current build before referencing the picture.", error: true });
      return;
    }
    if (refs.length >= 8) {
      setToast({ text: "A message carries up to eight references. Remove one to add another.", error: false });
      return;
    }
    setLayout({ assistant: true });
    setRefs((current) => (current.some((r) => JSON.stringify(r) === JSON.stringify(ref)) ? current : [...current, ref]));
    setFocusRequest((n) => n + 1);
  }
  /**
   * Imports images, fonts or sounds into the project's assets (picked, or dropped on the window), and puts the new ones
   * in the next message's tray.
   */
  async function importForMessage(dropped?: File[]) {
    if (busy || importing || checking || progress !== null) return;
    setImporting(true);
    try {
      const before = new Set((await window.studio.projectAssets()).map((a) => a.path));
      const after = dropped ? await window.studio.importDroppedAssets(dropped) : await window.studio.importAssets();
      const added = after.filter((a) => !before.has(a.path));
      if (!added.length) return;
      const room = 8 - refs.length;
      setRefs((current) => [
        ...current,
        ...added.slice(0, room).map(assetReference),
      ]);
      if (added.length > room) {
        setToast({ text: translate("Imported {0} files; a message carries up to eight references, so {1} wait in Assets.", false, {0: added.length, 1: added.length - room}), error: false });
      }
      setFocusRequest((n) => n + 1);
    } catch (e) {
      setToast({ text: reason(e), error: true });
    } finally {
      setImporting(false);
    }
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
          aria-label={tr("Home")}
          data-tip={tr("Back to home")}
          onClick={onClose}
        >
          <Home size={18} />
        </button>
        <ChevronRight size={14} className="muted" aria-hidden="true" />
        <ProjectMenu project={project} onError={(e) => setToast({ text: reason(e), error: true })} onVersions={() => openSide('history')} />
        {project.film && status}
        <span className="spacer" />
        <button
          type="button"
          className="icon-button"
          aria-label={t("Keyboard shortcuts")}
          data-tip={t("Keyboard shortcuts")}
          data-key="?"
          onClick={() => setShortcuts(true)}
        >
          <CircleHelp size={16} />
        </button>
        {project.film && (
          <button
            type="button"
            className="button"
            data-tip={tr("A look from motionhub to apply to the video")}
            aria-pressed={library}
            onClick={() => setCentre(library ? null : { kind: 'motions' })}
          >
            <Sparkles size={15} />
            <Translated text="Motions" />
            {counts?.motions ? <span className="tab-count">{counts.motions}</span> : null}
          </button>
        )}
        {player.film && (player.film.voice || player.film.scenes.some((scene) => scene.lines.length > 0)) && (
          <button
            type="button"
            className="button"
            data-tip={tr("Speak the film’s lines in its voice")}
            aria-pressed={voicing}
            onClick={() => setCentre(voicing ? null : { kind: 'voice' })}
          >
            <Mic size={15} />
            <Translated text="Voice" />
          </button>
        )}
        {project.film &&
          (progress === null ? (
            <span className="export">
              <button
                type="button"
                className="button accent"
                data-tip={busy ? tr("Export when the agent has finished its turn") : undefined}
                onClick={() => {
                  setExportOpen(true);
                  void checkFilm();
                }}
                disabled={!build?.ok || busy || importing || checking}
              >
                <Download size={15} />
                <Translated text="Export MP4" />
              </button>
              <button
                type="button"
                className="button accent export-more"
                aria-label={t("Other ways to export")}
                aria-expanded={menu}
                data-tip={t("Other ways to export")}
                disabled={!build?.ok || busy || importing || checking}
                onClick={() => setMenu((open) => !open)}
              >
                <ChevronDown size={15} />
              </button>
              {menu && (
                <span className="menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void exportRemotion()}>
                    <strong><Translated text="Remotion project…" /></strong>
                    <span>{tr("The film as a Remotion project, each scene a Series.Sequence")}</span>
                  </button>
                </span>
              )}
            </span>
          ) : (
            <button type="button" className="button" onClick={() => void window.studio.cancelExport()} data-tip={tr("Cancel the export")}>
              <X size={14} />
              {tr("Exporting")} {Math.round(progress * 100)}%
            </button>
          ))}
      </header>

      {project.film ? (
        <div
          className={`workspace${fileDrop ? ' file-drop' : ''}`}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = busy || importing || checking || progress !== null ? 'none' : 'copy';
            setFileDrop(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileDrop(false);
          }}
          onDrop={(event) => {
            setFileDrop(false);
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            void importForMessage([...event.dataTransfer.files]);
          }}
          style={{
            // A panel put away keeps a rail in its column, as the folded timeline keeps its head.
            gridTemplateColumns: `${layout.assistant ? layout.left : RAIL}px minmax(0, 1fr) ${showSide ? layout.right : RAIL}px`,
            // The library takes the stage's row and the timeline's as one.
            gridTemplateRows: wide ? 'minmax(0, 1fr)' : rows,
          }}
        >
          {!layout.assistant && (
            <button
              type="button"
              className="sheet rail rail-assistant"
              aria-label={t("Show assistant")}
              data-tip={t("Show assistant")}
              data-key="["
              onClick={() => setLayout({ assistant: true })}
            >
              <PanelLeftOpen size={15} />
              <span>{t("Assistant")}</span>
              {busy && <span className="rail-working" aria-hidden="true" />}
            </button>
          )}
          <section className="sheet assistant" aria-label={t("Assistant")} style={{ display: layout.assistant ? undefined : 'none' }}>
            <Assistant
              ref={assistant}
              key={`${project.path}:${historyRevision}:${switches}`}
              active={active}
              agents={agents}
              onUseAgent={(kind) => void useAgent(kind)}
              onRefreshAgents={refreshAgents}
              onAgentSettings={(kind, settings) => void saveAgentSettings(kind, settings)}
              ready={ready}
              disabled={importing || checking || progress !== null}
              onWorking={setBusy}
              refs={refs}
              version={build?.version ?? 0}
              focusRequest={focusRequest}
              brief={brief}
              onBriefTaken={() => setBrief(null)}
              onReference={reference}
              onImport={() => void importForMessage()}
              onOpenPanel={(panel) => (panel === 'motions' ? setCentre({ kind: 'motions' }) : openSide(panel))}
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
              onDropAsset={reference}
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
              onUndone={() => setMarks([])}
              onHide={() => setLayout({ assistant: false })}
            />
            <Splitter
              axis="x"
              value={layout.left}
              limits={LIMITS.left}
              onChange={(left) => setLayout({ left })}
              label={tr("Resize the assistant")}
              style={{ right: -7 }}
            />
          </section>
          {code && (
            <CodeView path={code.path} revision={build?.version ?? 0} focus={code.focus} onClose={closeCentre} onReference={reference} />
          )}
          {voicing && player.film && (
            <VoiceView
              film={player.film}
              t={player.t}
              playing={player.playing}
              canGenerate={canAsk}
              busy={!build?.ok || busy || importing || checking || progress !== null}
              onSetUp={onVoiceSettings}
              onGenerate={(voice) => {
                // The agent's turn is seen on the picture and in the assistant, so the voice makes way for it.
                setCentre(null);
                generateNarration(voice);
              }}
              onPlay={(start, end) => player.playRange(start, end)}
              onReference={reference}
              onClose={closeCentre}
            />
          )}
          {library && (
            <MotionLibrary
              disabled={busy || importing || checking || progress !== null}
              revision={build?.version ?? 0}
              onBusy={setImporting}
              canAsk={canAsk}
              onAsk={(text) => {
                // The restyle is seen on the picture, so the library makes way for it.
                setCentre(null);
                ask(text);
              }}
              onClose={closeCentre}
            />
          )}
          <Stage
            hidden={centre !== null}
            player={player}
            build={build}
            marks={marks}
            lit={lit}
            selected={selected}
            hovered={hovered}
            working={busy}
            guides={guides}
            onGuides={() => setGuides(!guides)}
            onFix={(label, detail) => reference({ kind: 'issue', label, detail })}
            disabled={busy || importing || checking || !build?.ok}
            canApply={canAsk}
            onAsk={ask}
            onDropAsset={(asset, next) => {
              mark(next);
              reference(assetReference(asset));
            }}
            onMark={(next, apply) => {
              mark(next);
              if (apply) setApplying(true);
              const { element } = next;
              if (element) {
                setSelected({
                  kind: 'layer',
                  label: element.text || element.layer || tr("Selected element"),
                  scene: element.scene,
                  layer: element.layer,
                  time: next.t,
                });
              }
            }}
          />
          {!showSide && !wide && (
            <button
              type="button"
              className="sheet rail rail-side"
              aria-label={t("Show project tools")}
              data-tip={t("Show project tools")}
              data-key="]"
              onClick={() => showTools(true)}
            >
              <PanelRightOpen size={15} />
              <span>{t("Project tools")}</span>
            </button>
          )}
          <aside className="sheet side" aria-label={tr("Project tools")} style={{ display: showSide && !wide ? undefined : 'none' }}>
            <div className="side-content">
              {/* The four tools at hand are tabs; History opens from the assistant and Checks from the status. */}
              <div className="side-tabs">
                {side === 'history' || side === 'review' ? (
                  <>
                    <button type="button" className="icon-button" aria-label={tr("Back to the outline")} data-tip={tr("Back")} onClick={() => setSide('outline')}>
                      <ArrowLeft size={15} />
                    </button>
                    <h2>{side === 'history' ? tr("Versions") : tr("Checks")}</h2>
                  </>
                ) : (
                  <nav aria-label={tr("Project tools")}>
                    {(
                      [
                        { id: 'outline', label: tr("Outline") },
                        { id: 'assets', label: tr("Assets") },
                        { id: 'code', label: tr("Code") },
                      ] as const
                    ).map(({ id, label }) => {
                      const count = id === 'assets' ? counts?.assets : undefined;
                      return (
                        <button key={id} type="button" aria-pressed={side === id} onClick={() => setSide(id)}>
                          {label}
                          {count ? <span className="tab-count">{count}</span> : null}
                        </button>
                      );
                    })}
                  </nav>
                )}
                <span className="spacer" />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={tr("Hide project tools")}
                  data-tip={tr("Hide project tools")}
                  data-key="]"
                  onClick={() => showTools(false)}
                >
                  <PanelRightClose size={15} />
                </button>
              </div>
              {side === 'assets' ? (
                <AssetsPanel disabled={busy || checking || progress !== null} revision={build?.version ?? 0} onBusy={setImporting} onReference={reference} />
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
                  stills={stills?.scenes ?? null}
                  hovered={hovered}
                  onHover={setHovered}
                  onSelect={select}
                  onReference={reference}
                  onPlay={player.playRange}
                  onCode={(target) =>
                    setCentre((was) => ({ kind: 'code', path: 'film.tsx', focus: { target, n: (was?.kind === 'code' ? (was.focus?.n ?? 0) : 0) + 1 } }))
                  }
                />
              ) : side === 'history' ? (
                <HistoryPanel
                  busy={busy || importing || checking || progress !== null}
                  revision={build?.version ?? 0}
                  onRestored={restored}
                />
              ) : side === 'code' ? (
                <CodeFiles revision={build?.version ?? 0} open={code?.path ?? null} onOpen={(path) => setCentre({ kind: 'code', path, focus: null })} />
              ) : null}
            </div>
            <Splitter
              axis="x"
              sign={-1}
              value={layout.right}
              limits={LIMITS.right}
              onChange={(right) => setLayout({ right })}
              label={tr("Resize the side panel")}
              style={{ left: -7 }}
            />
          </aside>
          <section
            ref={timelineSheet}
            className="sheet timeline-sheet"
            style={wide ? { display: 'none' } : undefined}
            aria-label={t("Timeline")}
          >
            {!layout.folded && (
              <Splitter
                axis="y"
                sign={-1}
                value={timelineHeight ?? layout.bottom}
                limits={LIMITS.bottom}
                onChange={(value) => setLayout({ bottom: value })}
                label={tr("Resize the timeline")}
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
                    label: issue.severity === 'warning' ? tr("Review this layout") : tr("Fix this issue"),
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
                hovered={hovered}
                onHover={setHovered}
              />
            ) : (
              // Folded, its whole head brings the timeline back.
              <div
                className={`timeline-options${layout.folded ? ' folded' : ''}`}
                onClick={layout.folded ? () => setLayout({ folded: false }) : undefined}
              >
                <span className="eyebrow"><Translated text="Timeline" /></span>
                <span className="spacer" />
                <Fold folded={layout.folded} onFold={(folded) => setLayout({ folded })} />
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="empty">
          <p>{tr("This folder holds no film yet.")}</p>
          <button type="button" className="button primary" onClick={startFilm}>
            {tr("Start a film here")}
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
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} onSettings={onGlobalSettings} />}

      {toast && (
        <div className={`toast${toast.error ? ' bad' : ''}`} role={toast.error ? 'alert' : 'status'}>
          <span><SystemMessage text={toast.text} error={toast.error} /></span>
          {toast.file && (
            <button type="button" className="button" onClick={() => void window.studio.showExported()}>
              {tr("Show in folder")}
            </button>
          )}
          <button type="button" className="icon-button" aria-label={t("Dismiss")} onClick={() => setToast(null)} style={{ color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
