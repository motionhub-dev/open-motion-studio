// The conversation with the agent: what the person asked, what the agent said (its Markdown
// drawn), and the tools it used between, each run of them folded into one line of plain words with
// the stills it looked at beside it. A still opens large and takes the film to its moment. Where a
// turn ends, what it changed in the film, with a way to undo it; a question the agent asks is a card
// whose answers send themselves. While the agent works, a message waits for its turn to end, or
// stops it and goes in its place.

import { SystemMessage, Translated, usePreferences } from './preferences';
import { type FormEvent, type KeyboardEvent, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, AtSign, Check, ChevronDown, Clock, Copy, History, Loader, PanelLeftClose, Plus, RotateCcw, Square, SquarePen, X } from 'lucide-react';
import {
  type AgentEvent,
  type AgentKind,
  type AgentSettings,
  type Agents,
  type ChatItem,
  type HarnessState,
  MARK_NOTE,
  type Mark,
  type Reference,
  type ProviderView,
  type SentMark,
  type UsageTotals,
  applyEvent,
} from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { PastConversations } from './past-conversations';
import {
  type Row,
  type Step,
  allTokens,
  blocks,
  changeKey,
  changeLine,
  failingRun,
  filmChanges,
  outcomeOf,
  running,
  tokenCount,
  tokenParts,
  turnFacts,
  turnLine,
  workedFor,
} from './activity';
import { Brief } from './brief';
import { Markdown } from './markdown';
import { elementName, timecode } from './preview';
import { assetReference, carriesAsset, droppedAsset } from './assets-panel';
import { reason } from './reason';
import { type Pickable, ReferencePicker, matchPicks, mentionAt, pickables, useProjectFiles } from './reference-picker';
import { ModelEffort, useAgentModels } from './settings';

function apply(items: Row[], event: AgentEvent, before: FilmInfo | null): Row[] {
  // The turn rows stay where they are; the transcript's own items take the event as everywhere else.
  if (event.type === 'end')
    return [
      ...applyEvent(items as ChatItem[], event),
      { kind: 'turn', before, checkpoint: event.checkpoint, files: event.files, outcome: outcomeOf(event.notice), usage: event.usage },
    ];
  if (event.type === 'tool-result' || event.type === 'approval-done')
    return items.map((item) => (item.kind === 'turn' ? item : applyEvent([item], event)[0]!));
  const last = items[items.length - 1];
  if (event.type === 'text' && last?.kind === 'assistant') return [...items.slice(0, -1), ...applyEvent([last], event)];
  return [...items, ...applyEvent([], event)];
}

/** When a mark is: its moment, or the stretch it spans. */
const when = (mark: { t: number; end?: number }) =>
  mark.end !== undefined ? `${timecode(mark.t)}–${timecode(mark.end)}` : timecode(mark.t);

/** What a mark is called in the composer: the element picked, a region, or a stretch of time. */
const markLabel = (mark: Mark) => (mark.end !== undefined ? 'A stretch' : mark.element ? elementName(mark.element) : 'A region');

/** Whether two references name the same thing. */
const same = (a: Reference, b: Reference) => JSON.stringify(a) === JSON.stringify(b);

type Tool = Extract<Row, { kind: 'tool' }>;

/** How many stills a run of tool calls shows in its row before the rest fold behind a count. */
const STILLS_SHOWN = 4;

/**
 * The stills a run shows, and how many it folds: all of them when they fit in the row or the person opened them,
 * else one fewer than the row, whose last place is the count of the rest.
 */
function shownStills<T>(stills: T[], open: boolean): { shown: T[]; folded: number } {
  if (open || stills.length <= STILLS_SHOWN) return { shown: stills, folded: 0 };
  return { shown: stills.slice(0, STILLS_SHOWN - 1), folded: stills.length - (STILLS_SHOWN - 1) };
}

/**
 * A turn's work as one block: a line saying what it did ("How it got there · read 2 files · edited 3 files"), or what
 * it is doing now; its steps under it (each tool call, and what the agent said between them), open while the turn
 * runs and folded when it ends, unless the person opened or folded it; and the stills it looked at in a row.
 */
function Work({ steps, tools, live, onStill }: { steps: Step[]; tools: Tool[]; live: boolean; onStill(tool: Tool): void }) {
  const { t: tr, system } = usePreferences();
  const now = live ? running(tools) : undefined;
  // A turn that fixed what failed on the way ended well: only a last call that failed marks the work as failing.
  const finished = tools.filter((tool) => tool.result);
  const failed = finished.length > 0 && !finished[finished.length - 1]!.result!.ok;
  const stills = tools.filter((tool) => tool.result?.image);
  const [open, setOpen] = useState(false);
  /** Whether the person opened or folded the steps themselves, which the turn's end then leaves alone. */
  const [unfolded, setUnfolded] = useState<boolean | null>(null);
  const { shown, folded } = shownStills(stills, open);
  return (
    <div className="work">
      <details
        className={`tool${failed && !live ? ' failed' : ''}`}
        open={unfolded ?? live}
        onToggle={(event) => {
          const now = event.currentTarget.open;
          if (now !== (unfolded ?? live)) setUnfolded(now);
        }}
      >
        <summary>
          {live ? <Loader size={13} className="spin" /> : failed ? <X size={13} /> : <Check size={13} className="ok" />}
          <span>
            {live ? (
              now ? <>{tr("Now: {0}…", {0: system(now.summary)})}</> : tr("Working…")
            ) : (
              <>
                <b>{tr("How it got there")}</b> · {turnLine(tools, tr)}
              </>
            )}
          </span>
          <ChevronDown size={13} className="work-fold" />
        </summary>
        <ol className="work-steps">
          {steps.map((step) =>
            step.kind === 'said' ? (
              <li key={`said-${step.index}`} className="said">
                {step.text}
              </li>
            ) : (
              <li key={step.id} className={step.result && !step.result.ok ? 'failed' : undefined}>
                <details>
                  <summary>
                    {!step.result ? <Loader size={12} className="spin" /> : step.result.ok ? <Check size={12} className="ok" /> : <X size={12} />}
                    <span><SystemMessage text={step.summary} /></span>
                  </summary>
                  {step.result && !step.result.image && <pre>{step.result.text}</pre>}
                </details>
              </li>
            ),
          )}
        </ol>
      </details>
      {stills.length > 0 && (
        <div className="work-stills">
          {shown.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="still"
              title={tool.at !== undefined ? tr("Open, and go to {0}", {0: timecode(tool.at)}) : tr("Open")}
              onClick={() => onStill(tool)}
            >
              <img src={tool.result!.image} alt={tool.result!.text} />
            </button>
          ))}
          {folded > 0 && (
            <button type="button" className="still more" aria-label={tr("Show {0} more stills", {0: folded})} onClick={() => setOpen(true)}>
              +{folded}
            </button>
          )}
          {open && (
            <button type="button" className="still more" onClick={() => setOpen(false)}>
              {tr("Fewer")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Copies the agent's answer, and says for a moment whether it did. */
function CopyButton({ text }: { text: string }) {
  const { t: tr } = usePreferences();
  const [said, setSaid] = useState<{ ok: boolean; why?: string } | null>(null);
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => setSaid(null), 1600);
    return () => clearTimeout(timer);
  }, [said]);
  return (
    <button
      type="button"
      className="button ghost"
      data-tip={said && !said.ok ? tr("Not copied: {0}", {0: said.why}) : tr("Copy the agent’s answer")}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setSaid({ ok: true }),
          (e: unknown) => setSaid({ ok: false, why: reason(e) }),
        )
      }
    >
      {said?.ok ? <Check size={13} /> : <Copy size={13} />}
      {said ? (said.ok ? tr("Copied") : tr("Not copied")) : tr("Copy")}
    </button>
  );
}

/** How many of the last turns the conversation draws whole. */
const RECENT_TURNS = 3;

type Phase = 'thinking' | 'editing' | 'checking' | 'reviewing';
/** The phases a turn goes through, in the order the progress row shows them. */
const PHASES: [Phase, string][] = [
  ['thinking', 'Thinking'],
  ['editing', 'Editing'],
  ['checking', 'Checking'],
  ['reviewing', 'Looking'],
];

/** Ways to begin, for an empty conversation: each puts the start of a message in the box, or opens the brief. */
const STARTS: { title: string; line: string; draft?: string; panel?: 'motions' }[] = [
  { title: 'Explain an idea', line: 'How something works, step by step', draft: 'A 30-second explainer on how ' },
  { title: 'Introduce something', line: 'A product, a person, an event', draft: 'A 15-second introduction to ' },
  { title: 'Start from a look', line: 'A motion from motionhub to build on', panel: 'motions' },
  { title: 'Write a brief', line: 'What, for whom, how long, what shape' },
];

/**
 * The project's agent at the top of the assistant: its name and model, a dot for whether it can take a message, and a
 * menu to change the agent and, for the person's own, its model and effort.
 */
function AgentChip({
  active,
  agents,
  disabled,
  onUseAgent,
  onRefreshAgents,
  onAgentSettings,
  onSettings,
  openRequest,
}: Pick<Props, 'active' | 'agents' | 'onUseAgent' | 'onRefreshAgents' | 'onAgentSettings' | 'onSettings'> & { disabled: boolean; openRequest: number }) {
  const { t: tr } = usePreferences();
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!openRequest) return;
    onRefreshAgents();
    setPicking(true);
  }, [openRequest]);
  useEffect(() => {
    if (!picking) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest('.agent-picker'))) setPicking(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(false);
    };
    addEventListener('pointerdown', close);
    addEventListener('keydown', escape);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', escape);
    };
  }, [picking]);
  const current: AgentKind = agents?.current ?? 'built-in';
  const outside = agents?.harnesses.find((h) => h.kind === current);
  const own = outside?.state === 'ready' ? outside.kind : null;
  const { models } = useAgentModels(picking ? own : null);
  const chosen = own && agents ? agents.settings[own] : null;
  const state: HarnessState = outside ? outside.state : active?.ready ? 'ready' : active ? 'signed-out' : 'missing';
  const label = !agents
    ? tr("Finding the agent…")
    : outside
      ? `${outside.name}${chosen?.model ? ` · ${chosen.model}` : ''}`
      : (active?.model ?? tr("Set up a model"));
  const title = outside
    ? `${outside.name}${outside.version ? ` ${outside.version}` : ''}: ${tr(STATE_WORDS[state])}${chosen ? tr(" · model {0}, effort {1}", {0: chosen.model || tr('default'), 1: tr(chosen.effort || 'default')}) : ''}`
    : active
      ? `${active.model} · ${active.name}${active.ready ? '' : tr(': no key')}`
      : tr("Set up a model in Models");
  return (
    <span className="agent-picker">
      <button
        type="button"
        className="agent-chip"
        aria-label={tr("Choose the agent, current: {0}", {0: label})}
        aria-haspopup="menu"
        aria-expanded={picking}
        title={title}
        disabled={disabled || !agents}
        onClick={() => {
          if (!picking) onRefreshAgents();
          setPicking(!picking);
        }}
      >
        <span className={`state-dot ${state}`} aria-hidden="true" />
        <span className="agent-chip-name">{label}</span>
        <ChevronDown size={12} />
      </button>
      {picking && (
        <span className="menu agent-menu" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={current === 'built-in'}
            onClick={() => {
              setPicking(false);
              if (current !== 'built-in') onUseAgent('built-in');
              else onSettings();
            }}
          >
            <strong>{active ? active.model : tr("Built-in agent")}</strong>
            <span>{active ? tr("Built-in agent · {0}", {0: active.name}) : tr("Built-in agent · set up a model in Models")}</span>
          </button>
          {agents?.harnesses.map((harness) => (
            <button
              key={harness.kind}
              type="button"
              role="menuitemradio"
              aria-checked={current === harness.kind}
              disabled={harness.state !== 'ready'}
              onClick={() => {
                setPicking(false);
                if (current !== harness.kind) onUseAgent(harness.kind);
              }}
            >
              <strong>{harness.name}</strong>
              <span>{harness.state === 'ready' ? tr("Your {0}{1} · its own sign-in", {0: harness.name, 1: harness.version ? ` ${harness.version}` : ''}) : tr(harness.hint ?? '')}</span>
            </button>
          ))}
          {own && chosen && (
            <span className="agent-menu-settings">
              {models ? (
                <ModelEffort kind={own} models={models} value={chosen} onChange={(change) => onAgentSettings(own, { ...chosen, ...change })} />
              ) : (
                <span className="note">
                  <Loader size={12} className="spin" /> {tr("Asking")} {outside!.name} {tr("for its models…")}
                </span>
              )}
            </span>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setPicking(false);
              onSettings(own ?? undefined);
            }}
          >
            <strong>{tr("Models…")}</strong>
            <span>{own ? tr("Everything about how {0} runs", {0: outside!.name}) : tr("Providers and keys for the built-in agent")}</span>
          </button>
        </span>
      )}
    </span>
  );
}

/** What the dot beside the agent says. */
const STATE_WORDS: Record<HarnessState, string> = { unknown: 'Status unavailable', ready: 'ready', 'signed-out': 'not signed in', old: 'needs an update', missing: 'not installed' };

interface Props {
  ref?: Ref<AssistantHandle>;
  active: ProviderView | undefined;
  /** The project's agent and the person's own coding agents (ADR 0008). */
  agents: Agents | null;
  onUseAgent(kind: AgentKind): void;
  /** Asks again where the person's own agents stand, as the agent menu opens. */
  onRefreshAgents(): void;
  /** Saves how one of the person's own agents runs. */
  onAgentSettings<K extends keyof AgentSettings>(kind: K, settings: AgentSettings[K]): void;
  ready: boolean;
  disabled: boolean;
  /** Opens Models, on one of the person's own agents when one is named. */
  onSettings(agent?: Exclude<AgentKind, 'built-in'>): void;
  marks: Mark[];
  refs: Reference[];
  version: number;
  onRemoveRef(index: number): void;
  /** Adds a reference to the next message (the @ picker's picks). */
  onReference(ref: Reference): void;
  /** Imports images or fonts into the project and adds them to the next message. */
  onImport(): void;
  /** Opens the project's assets or the motion library beside the stage. */
  onOpenPanel(panel: 'assets' | 'motions'): void;
  focusRequest: number;
  /** What the person asked for on Home when they created the project: the first message, sent once it can go. */
  brief: string | null;
  /** The brief has gone, or the person sent something else first; it must not go again. */
  onBriefTaken(): void;
  onRemoveMark(index: number): void;
  onNoteMark(index: number, note: string): void;
  /** The mark whose row is in hand, or null. */
  onLight(index: number | null): void;
  /** Puts the cursor in a mark's note. */
  noteRequest: { index: number; n: number };
  /** What was last selected in a panel, which goes with the message unless put aside. */
  selection: Reference | null;
  onDropSelection(): void;
  onSent(): void;
  /** An asset dropped on the composer, to go with the next message. */
  onDropAsset(ref: Reference): void;
  onWorking(working: boolean): void;
  /** Takes the film to a moment. */
  onSeek(t: number): void;
  /** Selects a scene, a layer or a line a turn changed. */
  onSelect(ref: Reference): void;
  /** The film as the preview has it now, to tell what a turn changed. */
  film: FilmInfo | null;
  /** The keys (changeKey) of what the last turn changed, for the outline and the timeline to light. */
  onFresh(keys: string[]): void;
  /** The last turn was taken back: its files are as they were before it. */
  onUndone(): void;
  /** Hides the assistant; the top bar and [ bring it back. */
  onHide(): void;

}

/** What the workspace asks of the assistant. */
export interface AssistantHandle {
  /** Sends words of the workspace's own, without what is in the tray. */
  send(text: string): void;
  /** Sends the composer and its tray, as the send button does. */
  submit(): void;
}

/** The composer grows with its text to about eight lines. */
const COMPOSER_MAX = 180;

export function Assistant({
  ref,
  active,
  agents,
  onUseAgent,
  onRefreshAgents,
  onAgentSettings,
  ready,
  disabled,
  onSettings,
  marks,
  onRemoveMark,
  onNoteMark,
  onLight,
  noteRequest,
  selection,
  onDropSelection,
  onSent,
  onDropAsset,
  onSeek,
  onSelect,
  film,
  onFresh,
  onUndone,
  onHide,
  onWorking,
  refs,
  version,
  onRemoveRef,
  onReference,
  onImport,
  onOpenPanel,
  focusRequest,
  brief,
  onBriefTaken,
}: Props) {
  const { t: tr } = usePreferences();
  const [items, setItems] = useState<Row[]>([]);
  const current: AgentKind = agents?.current ?? 'built-in';
  /** A message waiting for the turn to end; `steer` stopped the turn for it. */
  const [queued, setQueued] = useState<{ text: string; steer: boolean } | null>(null);
  const [undoing, setUndoing] = useState(false);
  /** Whether the person asked to see the turns before the last few. */
  const [showEarlier, setShowEarlier] = useState(false);
  /** The film when the last message went, which the turn's end keeps. */
  const filmAtSend = useRef<FilmInfo | null>(null);
  /** An asset is being dragged over the composer, which says it will take it. */
  const [dropping, setDropping] = useState(false);
  /** The + menu is open. */
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!adding) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest('.add-picker'))) setAdding(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && setAdding(false);
    addEventListener('pointerdown', close);
    addEventListener('keydown', escape);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', escape);
    };
  }, [adding]);
  /** The project's past conversations are shown in the log's place. */
  const [past, setPast] = useState(false);
  /** The project's turns added up, from its usage log, for the header. */
  const [usage, setUsage] = useState<UsageTotals | null>(null);
  const refreshUsage = () =>
    window.studio.projectUsage().then(setUsage, (e) => setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]));
  useEffect(() => void refreshUsage(), []);
  const [draft, setDraft] = useState('');
  /** The question (its tool id) the person chose to answer in their own words. */
  const [answeringOwn, setAnsweringOwn] = useState<string | null>(null);
  /** Asks the agent menu to open, from an error card's Use another agent. */
  const [agentMenu, setAgentMenu] = useState(0);
  /** Whether the empty conversation shows the brief. */
  const [briefing, setBriefing] = useState(false);
  /** The @ being typed in the draft (where it starts, what follows it), while the picker is open; the match in hand. */
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [pickAt, setPickAt] = useState(0);
  const files = useProjectFiles(mention !== null);
  const matches = mention ? matchPicks(pickables(film, files.assets, files.motions), mention.query) : [];
  /** Takes the @ and what follows it out of the draft, and adds the pick to the tray. */
  function pick(chosen: Pickable) {
    if (!mention) return;
    setDraft((current) => current.slice(0, mention.start) + current.slice(mention.start + 1 + mention.query.length));
    setMention(null);
    onReference(chosen.ref);
  }
  /** Opens the picker from its button: an @ where the caret is, as if typed. */
  function startMention() {
    const field = composer.current;
    const at = field?.selectionStart ?? draft.length;
    const spaced = at > 0 && !/\s/.test(draft[at - 1]!) ? ' @' : '@';
    const next = draft.slice(0, at) + spaced + draft.slice(at);
    setDraft(next);
    setMention({ start: at + spaced.length - 1, query: '' });
    setPickAt(0);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(at + spaced.length, at + spaced.length);
    });
  }
  const [following, setFollowing] = useState(true);
  const [working, setWorking] = useState(false);
  const [phase, setPhase] = useState<Phase>('thinking');
  /** The phases the running turn has been through, ticked in the progress row. */
  const [seen, setSeen] = useState<Set<Phase>>(new Set(['thinking']));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!working) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [working]);
  useEffect(() => onWorking(working), [working, onWorking]);
  const [shown, setShown] = useState<{ image: string; caption: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const notes = useRef<(HTMLInputElement | null)[]>([]);
  // The selection goes with the message as a reference, unless it is one already or there is no room.
  const selectionRef = selection && !refs.some((r) => same(r, selection)) && refs.length < 8 ? selection : null;
  const sending = selectionRef ? [...refs, selectionRef] : refs;
  /** How many marks and references the next message carries. */
  const tray = marks.length + sending.length;

  useEffect(() => {
    if (noteRequest.n) notes.current[noteRequest.index]?.focus();
  }, [noteRequest]);

  useEffect(() => {
    if (focusRequest) composer.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(COMPOSER_MAX, field.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && setShown(null);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [shown]);

  useEffect(() => {
    let live = true;
    let events = 0;
    const stop = window.studio.onAgentEvent((event) => {
      events++;
      const before = filmAtSend.current;
      setItems((current) => apply(current, event, before));
      if (event.type === 'end') setWorking(false);
      if (event.type === 'phase') {
        setPhase(event.phase);
        setSeen((now) => (now.has(event.phase) ? now : new Set(now).add(event.phase)));
      }
    });
    window.studio.conversation().then(
      (items) => {
        if (live && events === 0) setItems(items);
      },
      (e) => {
        if (live) setItems((current) => [...current, { kind: 'notice', text: reason(e), error: true }]);
      },
    );
    return () => {
      live = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (following) log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [items, following]);

  // What the last turn changed: the film when its message went against the film the preview has now.
  const lastTurn = [...items].reverse().find((item) => item.kind === 'turn');
  const lastChanges = lastTurn?.kind === 'turn' && lastTurn.before && film ? filmChanges(lastTurn.before, film) : [];
  const lastKeys = lastChanges.map((c) => changeKey(c.ref)).join('|');
  useEffect(() => {
    if (lastKeys && !working) onFresh(lastKeys.split('|'));
  }, [lastKeys, working]);

  // The brief waits in the composer, where the person sees it, and goes by itself once the agent and the film are ready.
  useEffect(() => {
    if (brief) setDraft((current) => current || brief);
  }, [brief]);
  useEffect(() => {
    if (brief && ready && !disabled && !working && version > 0) void sendText(brief, [], []);
  }, [brief, ready, disabled, working, version]);

  // A message that waited for the turn goes as soon as the turn ends.
  useEffect(() => {
    if (!working && queued) {
      setQueued(null);
      void sendText(queued.text, [], []);
    }
  }, [working]);

  async function send(event?: FormEvent, steer = false) {
    event?.preventDefault();
    const text = draft.trim();
    if (working) {
      // Marks and references belong to the preview on screen, which the turn is changing.
      if (!text || marks.length || sending.length || queued) return;
      setDraft('');
      // Claude Code takes words mid-turn: they go in at once, and wait only when its turn has just ended.
      if (!steer && current === 'claude') {
        try {
          if (await window.studio.steerAgent(text)) {
            setItems((items) => [...items, { kind: 'user', text, marks: [] }]);
            return;
          }
        } catch (e) {
          setDraft((current) => current || text);
          setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]);
          return;
        }
      }
      setQueued({ text, steer });
      if (steer) window.studio.stopAgent().catch((e) => setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]));
      return;
    }
    if (!text && !marks.length && !sending.length) return;
    await sendText(text, marks, sending);
  }

  async function sendText(text: string, sent: Mark[], refsSent: Reference[]) {
    if (working || !ready || disabled) return;
    // Whatever goes first, the brief has had its turn: it is in the composer for the person to send, or it is this.
    if (brief) onBriefTaken();
    const shown: SentMark[] = sent.map(({ t, end, note }) => ({ t, ...(end !== undefined ? { end } : {}), note }));
    filmAtSend.current = film;
    setFollowing(true);
    setPhase('thinking');
    setSeen(new Set(['thinking']));
    setWorking(true);
    setItems((current) => [...current, { kind: 'user', text, marks: shown, refs: refsSent, version }]);
    // The composer is free for the next message while the turn runs; a message that fails comes back to it.
    setDraft((current) => (current.trim() === text ? '' : current));
    const giveBack = () => setDraft((current) => current || text);
    try {
      const outcome = await window.studio.sendMessage(text, sent, refsSent, version);
      setWorking(false);
      void refreshUsage();
      if (outcome.ok) onSent();
      else giveBack();
    } catch (e) {
      giveBack();
      try {
        setItems(await window.studio.conversation());
      } catch {
        /* Keep the visible conversation when the disk is unavailable. */
      }
      setItems((current) => [...current, { kind: 'notice', text: reason(e), error: true }]);
      setWorking(false);
    }
  }

  // Workspace actions use the same conversation, progress and error handling as a message from the composer.
  useImperativeHandle(ref, () => ({ send: (text: string) => void sendText(text, [], []), submit: () => void send() }));

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && !event.nativeEvent.isComposing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return;
      }
      if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        setPickAt((at) => (at + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (matches.length && (event.key === 'Enter' || event.key === 'Tab')) {
        event.preventDefault();
        pick(matches[Math.min(pickAt, matches.length - 1)]!);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(undefined, working && (event.ctrlKey || event.metaKey));
    }
  }

  async function undo(checkpoint: string) {
    if (working || undoing) return;
    setUndoing(true);
    try {
      const { text } = await window.studio.undoTurn(checkpoint);
      setItems(await window.studio.conversation());
      // The message comes back to the composer, to change and send again.
      setDraft((current) => current || text);
      composer.current?.focus();
      onUndone();
    } catch (e) {
      setItems((current) => [...current, { kind: 'notice', text: reason(e), error: true }]);
    } finally {
      setUndoing(false);
    }
  }

  const drawn = blocks(items);
  /** Where the person's last message is drawn: what follows it is the turn that runs while the agent works. */
  const lastAsked = drawn.findLastIndex((block) => block.kind === 'item' && block.item.kind === 'user');
  // The last turns are drawn whole; earlier ones wait behind a button.
  const asked = drawn.flatMap((block, b) => (block.kind === 'item' && block.item.kind === 'user' ? [b] : []));
  const firstShown = showEarlier || asked.length <= RECENT_TURNS ? 0 : asked[asked.length - RECENT_TURNS]!;
  const earlier = asked.filter((b) => b < firstShown).length;
  const failing = working ? failingRun(items) : null;
  /** The agent's question still waiting for its answer: the last one, open while nothing but the turn's end follows it. */
  const askAt = drawn.findLastIndex((block) => block.kind === 'ask');
  const pendingAsk =
    askAt >= 0 && !working && drawn.slice(askAt + 1).every((next) => next.kind === 'item' && (next.item.kind === 'turn' || next.item.kind === 'notice'))
      ? (drawn[askAt] as Extract<(typeof drawn)[number], { kind: 'ask' }>)
      : null;
  /** Whether the person chose to write their own answer to it, which brings the composer back. */
  const ownAnswer = !!pendingAsk && answeringOwn === pendingAsk.tool.id;
  /** The question's options stand in the composer's place, the conversation dimmed behind them. */
  const asking = !!pendingAsk && pendingAsk.tool.ask.options.length > 0 && !ownAnswer;

  async function clear() {
    try {
      await window.studio.clearConversation();
      setItems([]);
      setShowEarlier(false);
    } catch (e) {
      setItems((current) => [...current, { kind: 'notice', text: reason(e), error: true }]);
    }
  }

  return (
    <>
      <div className="head">
        <button type="button" className="icon-button" aria-label={tr("Hide assistant")} data-tip={tr("Hide assistant")} data-key="[" onClick={onHide}>
          <PanelLeftClose size={15} />
        </button>
        <h2 className="visually-hidden"><Translated text="Assistant" /></h2>
        <span className="spacer" />
        {usage && usage.turns > 0 && (
          <span
            className="usage-total"
            title={tr("This project, {0} {1}: {2}{3}", {0: usage.turns, 1: usage.turns === 1 ? 'turn' : 'turns', 2: tokenParts(usage, tr), 3: usage.voicedCharacters ? tr(". Voiced {0} characters, {1} s of speech", {0: usage.voicedCharacters, 1: usage.voicedSeconds.toFixed(1)}) : ''})}
          >
            {tokenCount(allTokens(usage))} {tr("tokens")}
          </span>
        )}

        <button
          type="button"
          className="icon-button"
          aria-label={tr("Past conversations")}
          aria-pressed={past}
          data-tip={tr("Past conversations")}
          onClick={() => setPast(!past)}
        >
          <History size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={tr("New conversation")}
          data-tip={tr("New conversation")}
          onClick={clear}
          disabled={working || items.length === 0}
        >
          <SquarePen size={15} />
        </button>
      </div>
      {past && <PastConversations onClose={() => setPast(false)} />}
      <div
        hidden={past}
        className={`log${asking ? ' dimmed' : ''}`}
        ref={log}
        aria-live="polite"
        onScroll={(event) => {
          const el = event.currentTarget;
          setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 64);
        }}
      >
        {items.length === 0 && (
          <div className="starts">
            <h3>{tr("What should this film do?")}</h3>
            {!ready && (
              <p className="note">
                {tr("First,")}{' '}
                <button type="button" className="link" onClick={() => onSettings()}>
                  {tr("set up a model")}
                </button>
                {tr(", or pick your own agent above.")}
              </p>
            )}
            <div className="start-grid">
              {STARTS.map((start) => (
                <button
                  key={tr(start.title)}
                  type="button"
                  className={`start${start.draft === undefined && !start.panel && briefing ? ' selected' : ''}`}
                  onClick={() => {
                    if (start.panel) return onOpenPanel(start.panel);
                    if (start.draft === undefined) return setBriefing(!briefing);
                    setDraft(tr(start.draft));
                    requestAnimationFrame(() => {
                      composer.current?.focus();
                      composer.current?.setSelectionRange(start.draft!.length, start.draft!.length);
                    });
                  }}
                >
                  <strong>{tr(start.title)}</strong>
                  <span>{tr(start.line)}</span>
                </button>
              ))}
            </div>
            {briefing && (
              <Brief
                onUse={(text) => {
                  setDraft(text);
                  setBriefing(false);
                  composer.current?.focus();
                }}
              />
            )}
            <p className="hint point-hint">
              {tr("Point at the picture:")} <kbd>C</kbd> {tr("picks a thing on it, and a drag along the timeline's Marks row marks a stretch. @ in the box points at a scene, a layer, a line, an asset or a motion.")}
            </p>
          </div>
        )}
        {earlier > 0 && (
          <button type="button" className="quiet earlier-turns" onClick={() => setShowEarlier(true)}>
            {tr("Show")} {earlier} {tr("earlier")} {earlier === 1 ? 'turn' : 'turns'}
          </button>
        )}
        {drawn.map((block, b) => {
          if (b < firstShown) return null;
          if (block.kind === 'work')
            return (
              <Work
                key={block.tools[0]!.id}
                steps={block.steps}
                tools={block.tools}
                live={working && b > lastAsked}
                onStill={(tool) => {
                  if (tool.at !== undefined) onSeek(tool.at);
                  setShown({ image: tool.result!.image!, caption: tool.result!.text });
                }}
              />
            );
          if (block.kind === 'ask') {
            // Answered by the person's next message; until then its options take the composer's place.
            const reply = drawn.slice(b + 1).find((next) => next.kind === 'item' && next.item.kind === 'user');
            return (
              <div key={block.tool.id} className="ask-card" role="group" aria-label={tr("The agent asks")}>
                <span className="eyebrow">{tr("The agent asks")}</span>
                <p>{block.tool.ask.question}</p>
                {reply?.kind === 'item' && reply.item.kind === 'user' ? (
                  <small>{tr("Answered:")} {reply.item.text}</small>
                ) : (
                  block === pendingAsk && <small>{ownAnswer ? tr("Write your answer below.") : tr("Answer below.")}</small>
                )}
              </div>
            );
          }
          const { item, index: i } = block;
          if (item.kind === 'turn') {
            // What this turn changed: the film when its message went against the film when the next one went, or now.
            const nextTurn = items.slice(i + 1).find((row) => row.kind === 'turn');
            const after = nextTurn?.kind === 'turn' ? nextTurn.before : film;
            const changes = item.before && after ? filmChanges(item.before, after) : [];
            const latest = item === lastTurn;
            // Only the last turn can be undone from here, and not while another is changing the film: History has the rest.
            const undoable = latest && !working && item.checkpoint;
            // Every turn says what it took; one that changed nothing and cannot be undone says only that.
            if ((latest && working) || (!changes.length && !undoable && !item.usage)) return null;
            const { answer, check } = turnFacts(items, i);
            // The film's length, where the turn changed it.
            const longer = item.before && after && Math.abs(after.seconds - item.before.seconds) >= 0.05 ? after.seconds - item.before.seconds : 0;
            return (
              <div key={`turn-${i}`} className={`turn-card ${item.outcome}`}>
                <div className="turn-line">
                  <strong>{item.outcome === 'done' ? tr("Done") : item.outcome === 'stopped' ? tr("Stopped") : tr("Failed")}</strong>
                  {item.usage && (
                    <span className="turn-took" title={tokenParts(item.usage, tr)}>
                      {workedFor(item.usage.seconds, tr)} · {tokenCount(allTokens(item.usage))} {tr("tokens")}
                    </span>
                  )}
                  {!!item.files && <span>{item.files === 1 ? tr("1 file") : tr("{0} files", {0: item.files})}</span>}
                  {check !== undefined && (
                    <span className={check ? 'pass' : 'fail'}>{check ? tr("✓ Check: no problems") : tr("✕ Check: problems left")}</span>
                  )}
                  {longer !== 0 && after && (
                    <span>
                      {tr("film")} {after.seconds.toFixed(1)} {tr('s')} ({longer > 0 ? '+' : '−'}
                      {Math.abs(longer).toFixed(1)})
                    </span>
                  )}
                </div>
                {changes.length > 0 && (
                  <>
                    <span className="eyebrow">{changeLine(changes, tr)}</span>
                    <div className="turn-changes">
                      {changes.slice(0, 12).map((change, n) => (
                        <button
                          key={n}
                          type="button"
                          className={`change ${change.change}`}
                          title={`${tr(change.ref.kind)} · ${change.ref.label}`}
                          disabled={change.change === 'removed'}
                          onClick={() => onSelect(change.ref)}
                        >
                          {tr(change.ref.kind)} · {change.ref.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {(undoable || answer) && (
                  <div className="turn-actions">
                    {undoable && (
                      <button
                        type="button"
                        className="button"
                        disabled={working || undoing}
                        data-tip={tr("Put the files back as they were before this turn, take the turn out of the conversation, and put your message back to change. History can undo this too.")}
                        onClick={() => void undo(item.checkpoint!)}
                      >
                        <RotateCcw size={13} />
                        {tr("Go back to before this")}
                      </button>
                    )}
                    {answer && <CopyButton text={answer} />}
                  </div>
                )}
              </div>
            );
          }
          if (item.kind === 'assistant')
            return (
              <div key={i} className="message assistant">
                <Markdown source={item.text} />
              </div>
            );
          if (item.kind === 'approval') {
            const { approval, answer } = item;
            const answered = answer ? { once: tr("Allowed this once"), session: tr("Allowed for this session"), deny: tr("Denied") }[answer] : null;
            return (
              <div key={approval.id} className={`approval-card${answer === 'deny' ? ' denied' : ''}`} role="group" aria-label={tr(approval.title)}>
                <span className="eyebrow"><SystemMessage text={approval.title} /></span>
                <pre>{approval.detail}</pre>
                {approval.reason && <p>{approval.reason}</p>}
                {answered || !working ? (
                  <small>{answered ?? tr("Not answered: the turn ended")}</small>
                ) : (
                  <div className="ask-options">
                    {(['once', 'session', 'deny'] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className={`button${choice === 'deny' ? ' primary' : ''}`}
                        disabled={!working}
                        onClick={() =>
                          window.studio
                            .answerApproval(approval.id, choice)
                            .catch((e) => setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]))
                        }
                      >
                        {choice === 'once' ? tr("Allow once") : choice === 'session' ? tr("Allow for this session") : tr("Deny")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (item.kind === 'notice' && item.error) {
            // Only the last turn's failure offers what to do (its outcome card may follow); an earlier one is history.
            const last = !working && items.slice(i + 1).every((row) => row.kind === 'turn');
            const returned = last && draft.trim() !== '';
            const models = item.need !== undefined || current === 'built-in';
            return (
              <div key={i} className="error-card" role="alert">
                <p><SystemMessage text={item.text} error /></p>
                {returned && <small>{tr("Your message is back in the box below.")}</small>}
                {last && (
                  <div className="ask-options">
                    {models && (
                      <button type="button" className="button primary" onClick={() => onSettings(current === 'built-in' ? undefined : current)}>
                        {item.need === 'sign-in' && current === 'codex' ? tr("Sign in") : item.need === 'cap' ? tr("Change the cap") : tr("Open Models")}
                      </button>
                    )}
                    {(item.need === 'sign-in' || item.need === 'setup') && (
                      <button type="button" className="button" onClick={() => setAgentMenu((n) => n + 1)}>
                        {tr("Use another agent")}
                      </button>
                    )}
                    {returned && (
                      <button type="button" className={`button${models ? '' : ' primary'}`} disabled={!ready || disabled} onClick={() => void send()}>
                        {tr("Try again")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }
          return (
            <p key={i} className={`message ${item.kind}`}>
                {item.kind === 'notice' ? <SystemMessage text={item.text} /> : item.text}
                {item.kind === 'user' &&
                  item.refs?.map((ref, n) => (
                    <span key={n} className="sent-ref" title={[ref.source, ref.detail ?? ref.path].filter(Boolean).join(' · ')}>
                      {tr(ref.kind)} · {ref.label}
                    </span>
                  ))}
                {item.kind === 'user' && item.marks.length > 0 && (
                  <span className="sent-marks">
                    {item.marks.map((mark, n) => (
                      <button
                        key={n}
                        type="button"
                        className="sent-mark"
                        title={mark.image ? tr("Open the frame sent, and go to {0}", {0: when(mark)}) : tr("Go to {0}", {0: when(mark)})}
                        onClick={() => {
                          onSeek(mark.t);
                          if (mark.image) setShown({ image: mark.image, caption: tr("Mark {0}{1}", {0: n + 1, 1: mark.note ? ` · ${mark.note}` : ''}) });
                        }}
                      >
                        {mark.image && <img src={mark.image} alt={tr("Mark {0}", {0: n + 1})} />}
                        <span className="number">{n + 1}</span>
                        <span className="sent-mark-text">
                          <small className="mono">{when(mark)}</small>
                          {mark.note && <span>{mark.note}</span>}
                        </span>
                      </button>
                    ))}
                  </span>
                )}
              </p>
          );
        })}
        {working && (
          <div className="agent-progress" role="status">
            <ol className="phases" aria-label={tr("Where the turn is")}>
              {PHASES.map(([key, label]) => (
                <li key={key} className={key === phase ? 'on' : seen.has(key) ? 'done' : undefined}>
                  {seen.has(key) && key !== phase && <Check size={11} />}
                  {tr(label)}
                </li>
              ))}
            </ol>
            <div>
              <Loader size={13} className="spin" />
              <strong>
                {phase === 'thinking'
                  ? tr("Working through your idea")
                  : phase === 'editing'
                    ? tr("Shaping the film")
                    : phase === 'checking'
                      ? tr("Checking the scenes")
                      : tr("Looking at the details")}
              </strong>
              <span className="mono">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            </div>
            {failing && failing.times >= 3 && (
              <p className="warning">
                <AlertTriangle size={13} /> {failing.name} {tr("has failed")} {failing.times} {tr("times in a row. You can stop it and say what to try instead.")}
              </p>
            )}
          </div>
        )}
      </div>
      {!following && (
        <button type="button" className="latest-messages quiet" onClick={() => setFollowing(true)}>
          {tr("Back to latest ↓")}
        </button>
      )}
      {tray > 0 && (
        <div className="tray" aria-label={tr("What the next message carries")}>
          <div className="tray-head">
            <span className="label">{tr("With the next message")}</span>
            <span className="mono">{tray}</span>
          </div>
      {sending.length > 0 && (
        <ul className="reference-cards" aria-label={tr("References for the next message")}>
          {sending.map((ref, i) => (
            <li key={i} className={ref === selectionRef ? 'selection' : undefined}>
              <button
                type="button"
                className="reference-locate"
                onClick={() => ref.time !== undefined && onSeek(ref.time)}
                title={ref.detail ?? ref.path}
              >
                <span className="eyebrow">
                  {ref === selectionRef ? tr("Selected · ") : ''}
                  {tr(ref.kind)}
                  {ref.scene && (
                    <>
                      {' · '}
                      <span className="verbatim">{ref.scene}</span>
                    </>
                  )}
                </span>
                <strong>{ref.label}</strong>
                {ref.time !== undefined && <small className="mono">{timecode(ref.time)}</small>}
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={working}
                aria-label={tr("Remove reference {0}", {0: ref.label})}
                onClick={() => (ref === selectionRef ? onDropSelection() : onRemoveRef(i))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {marks.length > 0 && (
        <ul className="mark-tray" aria-label={tr("Marks for the next message")} onPointerLeave={() => onLight(null)}>
          {marks.map((mark, i) => (
            <li key={i} onPointerEnter={() => onLight(i)} onFocus={() => onLight(i)}>
              <button type="button" className="mark-locate" title={tr("Go to {0}", {0: when(mark)})} onClick={() => onSeek(mark.t)}>
                <span className="number">{i + 1}</span>
                <span className="mark-what">
                  <strong>{mark.element ? markLabel(mark) : tr(markLabel(mark))}</strong>
                  <small className="mono">
                    {when(mark)}
                    {mark.changes?.length ? ` · ${tr("{0} changes", {0: mark.changes.length})}` : ''}
                  </small>
                </span>
              </button>
              <input
                ref={(field) => {
                  notes.current[i] = field;
                }}
                value={mark.note}
                maxLength={MARK_NOTE}
                disabled={working}
                aria-label={tr("What should change at mark {0}", {0: i + 1})}
                placeholder={tr("What should change here?")}
                onChange={(e) => onNoteMark(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    composer.current?.focus();
                  }
                }}
              />
              <button
                type="button"
                className="quiet"
                disabled={working}
                aria-label={tr("Remove mark {0}", {0: i + 1})}
                onClick={() => onRemoveMark(i)}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
        </div>
      )}
      {queued && (
        <div className="queued" role="status">
          <Clock size={13} />
          <span>
            <strong>{queued.steer ? tr("Stopping, then sending") : tr("Sends when the turn ends")}</strong>
            {queued.text}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={tr("Take the waiting message back")}
            data-tip={tr("Take it back")}
            onClick={() => {
              setDraft(queued.text);
              setQueued(null);
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}
      {asking && pendingAsk && (
        <div className="question-sheet" role="group" aria-label={tr("The agent asks")}>
          <span className="eyebrow">{tr("The agent asks")}</span>
          <p>{pendingAsk.tool.ask.question}</p>
          <div className="question-options">
            {pendingAsk.tool.ask.options.map((option, n) => (
              <button key={option} type="button" disabled={!ready || disabled} onClick={() => void sendText(option, [], [])}>
                <span>{option}</span>
                {n === 0 && <small>{tr("Recommended")}</small>}
              </button>
            ))}
            <button
              type="button"
              className="own"
              onClick={() => {
                setAnsweringOwn(pendingAsk.tool.id);
                requestAnimationFrame(() => composer.current?.focus());
              }}
            >
              <span>{tr("Something else…")}</span>
            </button>
          </div>
        </div>
      )}
      <form
        className={`composer${dropping ? ' dropping' : ''}`}
        onSubmit={send}
        hidden={asking}
        onDragOver={(event) => {
          if (!carriesAsset(event) || working) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(event) => {
          setDropping(false);
          const asset = droppedAsset(event);
          if (!asset || working) return;
          event.preventDefault();
          onDropAsset(assetReference(asset));
        }}
      >
        {mention && (
          <ReferencePicker
            matches={matches}
            active={Math.min(pickAt, matches.length - 1)}
            loading={files.loading}
            error={files.error}
            onPick={pick}
            onHover={setPickAt}
          />
        )}
        <textarea
          ref={composer}
          value={draft}
          rows={1}
          placeholder={
            working
              ? marks.length || sending.length
                ? tr("Marks and references wait until the turn ends")
                : current === 'claude'
                  ? tr("Enter adds to the turn; Ctrl+Enter stops it and sends")
                  : tr("Enter sends when the turn ends; Ctrl+Enter stops it and sends")
              : marks.length
                ? tr("Anything else? Refer to marks by number (1, 2…)")
                : tr("Ask for a film, or a change to this one")
          }
          aria-label={tr("Message")}
          onChange={(e) => {
            setDraft(e.target.value);
            setMention(mentionAt(e.target.value, e.target.selectionStart));
            setPickAt(0);
          }}
          onBlur={() => setMention(null)}
          onKeyDown={onKey}
        />
        <div className="composer-actions">
          {/* What can go with a message: a file from the computer, one of the project's, or a look from the library. */}
          <span className="add-picker">
            <button
              type="button"
              className="icon-button"
              aria-label={tr("Add to the message")}
              aria-haspopup="menu"
              aria-expanded={adding}
              data-tip={tr("Add files, assets or a motion")}
              disabled={working || disabled}
              onClick={() => setAdding(!adding)}
            >
              <Plus size={15} />
            </button>
            {adding && (
              <span className="menu add-menu" role="menu">
                {(
                  [
                    ['Import files…', 'Images, fonts and sounds from your computer', () => onImport()],
                    ['From the assets', 'Drag one onto the picture or the message', () => onOpenPanel('assets')],
                    ['From the motion library', 'A look from motionhub to apply', () => onOpenPanel('motions')],
                  ] as const
                ).map(([label, line, act]) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAdding(false);
                      act();
                    }}
                  >
                    {tr(label)}
                    <span>{tr(line)}</span>
                  </button>
                ))}
              </span>
            )}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={tr("Point at a scene, layer, line, asset or motion")}
            data-tip={tr("Point at something")}
            data-key="@"
            disabled={working}
            onPointerDown={(e) => e.preventDefault()}
            onClick={startMention}
          >
            <AtSign size={15} />
          </button>
          <span className="spacer" />
          {/* What the message goes to, beside the button that sends it. */}
          <AgentChip
            active={active}
            agents={agents}
            disabled={working}
            onUseAgent={onUseAgent}
            onRefreshAgents={onRefreshAgents}
            onAgentSettings={onAgentSettings}
            onSettings={onSettings}
            openRequest={agentMenu}
          />
          {working ? (
            <button
              type="button"
              className="send stop"
              aria-label={tr("Stop")}
              data-tip={tr("Stop")}
              onClick={() => {
                window.studio.stopAgent().catch((e) => setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]));
              }}
            >
              <Square size={11} fill="currentColor" />
              <Translated text="Stop" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label={tr("Send")}
              data-tip={tr("Send")}
              data-key="Enter"
              className={tray ? 'send with-tray' : 'send'}
              disabled={(!draft.trim() && !marks.length && !sending.length) || !ready || disabled}
            >
              {tray > 0 && <span>{tr("Send")} {tray}</span>}
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </form>
      {shown && (
        <div className="dialog-backdrop dim" role="presentation" onClick={() => setShown(null)}>
          <figure className="lightbox" role="dialog" aria-modal="true" aria-label={tr("Still")} onClick={(e) => e.stopPropagation()}>
            <img src={shown.image} alt={shown.caption} />
            <figcaption>{shown.caption}</figcaption>
            <button type="button" className="icon-button" aria-label={tr("Close")} data-tip={tr("Close")} data-key="Esc" onClick={() => setShown(null)}>
              <X size={16} />
            </button>
          </figure>
        </div>
      )}
    </>
  );
}
