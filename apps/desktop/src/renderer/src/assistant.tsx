// The conversation with the agent: what the person asked, what the agent said (its Markdown
// drawn), and the tools it used between, each run of them folded into one line of plain words with
// the stills it looked at beside it. A still opens large and takes the film to its moment. Where a
// turn ends, what it changed in the film, with a way to undo it; a question the agent asks is a card
// whose answers send themselves. While the agent works, a message waits for its turn to end, or
// stops it and goes in its place.

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Check, ChevronDown, Clock, Loader, RotateCcw, Square, X } from 'lucide-react';
import {
  type AgentEvent,
  type AgentKind,
  type Agents,
  type ChatItem,
  MARK_NOTE,
  type Mark,
  type Reference,
  type ProviderView,
  type SentMark,
  applyEvent,
} from '../../shared/api';
import type { FilmInfo } from '../../shared/preview';
import { type Row, blocks, changeKey, changeLine, failingRun, filmChanges, running, workLine } from './activity';
import { Brief } from './brief';
import { Markdown } from './markdown';
import { elementName, timecode } from './preview';
import { reason } from './reason';

function apply(items: Row[], event: AgentEvent, before: FilmInfo | null): Row[] {
  // The turn rows stay where they are; the transcript's own items take the event as everywhere else.
  if (event.type === 'end') return [...applyEvent(items as ChatItem[], event), { kind: 'turn', before, checkpoint: event.checkpoint }];
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

/** A run of tool calls: one line saying what was done, or what is being done now, and the stills beside it. */
function Work({ tools, live, onStill }: { tools: Tool[]; live: boolean; onStill(tool: Tool): void }) {
  const now = live ? running(tools) : undefined;
  const failed = tools.some((tool) => tool.result && !tool.result.ok);
  const stills = tools.filter((tool) => tool.result?.image);
  return (
    <div className="work">
      <details className={`tool${failed && !now ? ' failed' : ''}`}>
        <summary>
          {now ? <Loader size={13} className="spin" /> : failed ? <X size={13} /> : <Check size={13} className="ok" />}
          <span>{now ? `Now: ${now.summary}…` : workLine(tools)}</span>
        </summary>
        <ol className="work-steps">
          {tools.map((tool) => (
            <li key={tool.id} className={tool.result && !tool.result.ok ? 'failed' : undefined}>
              <details>
                <summary>
                  {!tool.result ? <Loader size={12} className="spin" /> : tool.result.ok ? <Check size={12} className="ok" /> : <X size={12} />}
                  <span>{tool.summary}</span>
                </summary>
                {tool.result && !tool.result.image && <pre>{tool.result.text}</pre>}
              </details>
            </li>
          ))}
        </ol>
      </details>
      {stills.length > 0 && (
        <div className="work-stills">
          {stills.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="still"
              title={tool.at !== undefined ? `Open, and go to ${timecode(tool.at)}` : 'Open'}
              onClick={() => onStill(tool)}
            >
              <img src={tool.result!.image} alt={tool.result!.text} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ways to begin, for an empty conversation. */
const STARTS = [
  'A 30-second explainer on how a heat pump works',
  'A 15-second title sequence for a podcast episode',
  'Find a motion for a data story and show me three',
];

interface Props {
  active: ProviderView | undefined;
  /** The project's agent and the person's own coding agents (ADR 0008). */
  agents: Agents | null;
  onUseAgent(kind: AgentKind): void;
  ready: boolean;
  disabled: boolean;
  onSettings(): void;
  marks: Mark[];
  refs: Reference[];
  version: number;
  onRemoveRef(index: number): void;
  focusRequest: number;
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
}

/** The composer grows with its text to about eight lines. */
const COMPOSER_MAX = 180;

export function Assistant({
  active,
  agents,
  onUseAgent,
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
  onSeek,
  onSelect,
  film,
  onFresh,
  onUndone,
  onWorking,
  refs,
  version,
  onRemoveRef,
  focusRequest,
}: Props) {
  const [items, setItems] = useState<Row[]>([]);
  const current: AgentKind = agents?.current ?? 'built-in';
  const codex = agents?.harnesses.find((h) => h.kind === 'codex');
  /** Whether the menu of agents is open. */
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!picking) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest('.agent-picker'))) setPicking(false);
    };
    addEventListener('pointerdown', close);
    return () => removeEventListener('pointerdown', close);
  }, [picking]);
  /** A message waiting for the turn to end; `steer` stopped the turn for it. */
  const [queued, setQueued] = useState<{ text: string; steer: boolean } | null>(null);
  const [undoing, setUndoing] = useState(false);
  /** The film when the last message went, which the turn's end keeps. */
  const filmAtSend = useRef<FilmInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [following, setFollowing] = useState(true);
  const [working, setWorking] = useState(false);
  const [phase, setPhase] = useState<'thinking' | 'editing' | 'checking' | 'reviewing'>('thinking');
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
      if (event.type === 'phase') setPhase(event.phase);
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
      setQueued({ text, steer });
      setDraft('');
      if (steer) window.studio.stopAgent().catch((e) => setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]));
      return;
    }
    if (!text && !marks.length && !sending.length) return;
    await sendText(text, marks, sending);
  }

  async function sendText(text: string, sent: Mark[], refsSent: Reference[]) {
    if (working || !ready || disabled) return;
    const shown: SentMark[] = sent.map(({ t, end, note }) => ({ t, ...(end !== undefined ? { end } : {}), note }));
    filmAtSend.current = film;
    setFollowing(true);
    setPhase('thinking');
    setWorking(true);
    setItems((current) => [...current, { kind: 'user', text, marks: shown, refs: refsSent, version }]);
    // The composer is free for the next message while the turn runs; a message that fails comes back to it.
    setDraft((current) => (current.trim() === text ? '' : current));
    const giveBack = () => setDraft((current) => current || text);
    try {
      const outcome = await window.studio.sendMessage(text, sent, refsSent, version);
      setWorking(false);
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

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
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
  const failing = working ? failingRun(items) : null;

  async function clear() {
    try {
      await window.studio.clearConversation();
      setItems([]);
    } catch (e) {
      setItems((current) => [...current, { kind: 'notice', text: reason(e), error: true }]);
    }
  }

  return (
    <>
      <div className="head">
        <h2>Assistant</h2>
        <span className="spacer" />
        <button type="button" className="quiet" onClick={clear} disabled={working || items.length === 0}>
          New conversation
        </button>
      </div>
      <div
        className="log"
        ref={log}
        aria-live="polite"
        onScroll={(event) => {
          const el = event.currentTarget;
          setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 64);
        }}
      >
        {items.length === 0 && (
          <div className="starts">
            <p className="note">
              Give the film a direction, or point at a detail to refine it.
              {!ready && (
                <>
                  {' '}
                  First,{' '}
                  <button type="button" className="link" onClick={onSettings}>
                    set up a model
                  </button>
                  .
                </>
              )}
            </p>
            <Brief
              onUse={(text) => {
                setDraft(text);
                composer.current?.focus();
              }}
            />
            {STARTS.slice(0, 1).map((start) => (
              <button key={start} type="button" className="start" onClick={() => setDraft(start)}>
                {start}
              </button>
            ))}
          </div>
        )}
        {drawn.map((block, b) => {
          if (block.kind === 'work')
            return (
              <Work
                key={block.tools[0]!.id}
                tools={block.tools}
                live={working && b === drawn.length - 1}
                onStill={(tool) => {
                  if (tool.at !== undefined) onSeek(tool.at);
                  setShown({ image: tool.result!.image!, caption: tool.result!.text });
                }}
              />
            );
          if (block.kind === 'ask') {
            // Answered by any message after it; open while nothing but the turn's end follows it.
            const open = !working && drawn.slice(b + 1).every((next) => next.kind === 'item' && (next.item.kind === 'turn' || next.item.kind === 'notice'));
            return (
              <div key={block.tool.id} className="ask-card" role="group" aria-label="The agent asks">
                <span className="eyebrow">The agent asks</span>
                <p>{block.tool.ask.question}</p>
                {block.tool.ask.options.length > 0 && (
                  <div className="ask-options">
                    {block.tool.ask.options.map((option, n) => (
                      <button
                        key={option}
                        type="button"
                        className={`button${n === 0 ? ' primary' : ''}`}
                        disabled={!open || !ready || disabled}
                        onClick={() => void sendText(option, [], [])}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
                {open && <small>Or write your own answer below.</small>}
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
            if ((latest && working) || (!changes.length && !undoable)) return null;
            return (
              <div key={`turn-${i}`} className="turn-card">
                {changes.length > 0 && (
                  <>
                    <span className="eyebrow">{changeLine(changes)}</span>
                    <div className="turn-changes">
                      {changes.slice(0, 12).map((change, n) => (
                        <button
                          key={n}
                          type="button"
                          className={`change ${change.change}`}
                          disabled={change.change === 'removed'}
                          onClick={() => onSelect(change.ref)}
                        >
                          {change.ref.kind} · {change.ref.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {undoable && (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={working || undoing}
                    data-tip="Put the files back as they were before this turn, take the turn out of the conversation, and put your message back to change. History can undo this too."
                    onClick={() => void undo(item.checkpoint!)}
                  >
                    <RotateCcw size={13} />
                    Undo this turn
                  </button>
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
            const answered = answer ? { once: 'Allowed this once', session: 'Allowed for this session', deny: 'Denied' }[answer] : null;
            return (
              <div key={approval.id} className={`approval-card${answer === 'deny' ? ' denied' : ''}`} role="group" aria-label={approval.title}>
                <span className="eyebrow">{approval.title}</span>
                <pre>{approval.detail}</pre>
                {approval.reason && <p>{approval.reason}</p>}
                {answered || !working ? (
                  <small>{answered ?? 'Not answered: the turn ended'}</small>
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
                        {choice === 'once' ? 'Allow once' : choice === 'session' ? 'Allow for this session' : 'Deny'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <p key={i} className={`message ${item.kind}${item.kind === 'notice' && item.error ? ' error' : ''}`}>
                {item.text}
                {item.kind === 'user' &&
                  item.refs?.map((ref, n) => (
                    <span key={n} className="sent-ref" title={[ref.source, ref.detail ?? ref.path].filter(Boolean).join(' · ')}>
                      {ref.kind} · {ref.label}
                    </span>
                  ))}
                {item.kind === 'user' && item.marks.length > 0 && (
                  <span className="sent-marks">
                    {item.marks.map((mark, n) => (
                      <button
                        key={n}
                        type="button"
                        className="sent-mark"
                        title={mark.image ? `Open the frame sent, and go to ${when(mark)}` : `Go to ${when(mark)}`}
                        onClick={() => {
                          onSeek(mark.t);
                          if (mark.image) setShown({ image: mark.image, caption: `Mark ${n + 1}${mark.note ? ` · ${mark.note}` : ''}` });
                        }}
                      >
                        {mark.image && <img src={mark.image} alt={`Mark ${n + 1}`} />}
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
            <div>
              <Loader size={13} className="spin" />
              <strong>
                {phase === 'thinking'
                  ? 'Working through your idea'
                  : phase === 'editing'
                    ? 'Shaping the film'
                    : phase === 'checking'
                      ? 'Checking the scenes'
                      : 'Looking at the details'}
              </strong>
              <span className="mono">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            </div>
            {failing && failing.times >= 3 ? (
              <p className="warning">
                <AlertTriangle size={13} /> {failing.name} has failed {failing.times} times in a row. You can stop it and say what
                to try instead.
              </p>
            ) : (
              <p>
                {elapsed >= 60
                  ? 'Still working. You can stop at any time; file changes remain recoverable in History.'
                  : 'Your project stays on this computer. File changes are checkpointed as they happen.'}
              </p>
            )}
          </div>
        )}
      </div>
      {!following && (
        <button type="button" className="latest-messages quiet" onClick={() => setFollowing(true)}>
          Back to latest ↓
        </button>
      )}
      {sending.length > 0 && (
        <ul className="reference-cards" aria-label="References for the next message">
          {sending.map((ref, i) => (
            <li key={i} className={ref === selectionRef ? 'selection' : undefined}>
              <button
                type="button"
                className="reference-locate"
                onClick={() => ref.time !== undefined && onSeek(ref.time)}
                title={ref.detail ?? ref.path}
              >
                <span className="eyebrow">
                  {ref === selectionRef ? 'Selected · ' : ''}
                  {ref.kind}
                  {ref.scene ? ` · ${ref.scene}` : ''}
                </span>
                <strong>{ref.label}</strong>
                {ref.time !== undefined && <small className="mono">{timecode(ref.time)}</small>}
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={working}
                aria-label={`Remove reference ${ref.label}`}
                onClick={() => (ref === selectionRef ? onDropSelection() : onRemoveRef(i))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {marks.length > 0 && (
        <ul className="mark-tray" aria-label="Marks for the next message" onPointerLeave={() => onLight(null)}>
          {marks.map((mark, i) => (
            <li key={i} onPointerEnter={() => onLight(i)} onFocus={() => onLight(i)}>
              <button type="button" className="mark-locate" title={`Go to ${when(mark)}`} onClick={() => onSeek(mark.t)}>
                <span className="number">{i + 1}</span>
                <span className="mark-what">
                  <strong>{markLabel(mark)}</strong>
                  <small className="mono">{when(mark)}</small>
                </span>
              </button>
              <input
                ref={(field) => {
                  notes.current[i] = field;
                }}
                value={mark.note}
                maxLength={MARK_NOTE}
                disabled={working}
                aria-label={`What should change at mark ${i + 1}`}
                placeholder="What should change here?"
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
                aria-label={`Remove mark ${i + 1}`}
                onClick={() => onRemoveMark(i)}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {queued && (
        <div className="queued" role="status">
          <Clock size={13} />
          <span>
            <strong>{queued.steer ? 'Stopping, then sending' : 'Sends when the turn ends'}</strong>
            {queued.text}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Take the waiting message back"
            data-tip="Take it back"
            onClick={() => {
              setDraft(queued.text);
              setQueued(null);
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}
      <form className="composer" onSubmit={send}>
        <textarea
          ref={composer}
          value={draft}
          rows={1}
          placeholder={
            working
              ? marks.length || sending.length
                ? 'Marks and references wait until the turn ends'
                : 'Enter sends when the turn ends; Ctrl+Enter stops it and sends'
              : marks.length
                ? 'Anything else? Refer to marks by number (1, 2…)'
                : 'Ask for a film, or a change to this one'
          }
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="composer-actions">
          <span className="agent-picker">
            <button
              type="button"
              className="composer-model"
              aria-label={`Choose the agent, current: ${current === 'codex' ? 'Codex' : active ? `${active.model} by ${active.name}` : 'none set up'}`}
              aria-haspopup="menu"
              aria-expanded={picking}
              title={current === 'codex' ? `Codex${codex?.version ? ` ${codex.version}` : ''}` : active ? `${active.model} · ${active.name}` : 'Set up a model'}
              disabled={working || !agents}
              onClick={() => setPicking(!picking)}
            >
              <span>{!agents ? 'Finding the agent…' : current === 'codex' ? 'Codex' : active ? active.model : 'Set up a model'}</span>
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
                  <strong>{active ? active.model : 'Built-in agent'}</strong>
                  <span>{active ? `Built-in agent · ${active.name}` : 'Built-in agent · set up a model in Models'}</span>
                </button>
                {codex && (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={current === 'codex'}
                    disabled={codex.state !== 'ready'}
                    onClick={() => {
                      setPicking(false);
                      if (current !== 'codex') onUseAgent('codex');
                    }}
                  >
                    <strong>Codex</strong>
                    <span>{codex.state === 'ready' ? `Your Codex${codex.version ? ` ${codex.version}` : ''} · its own sign-in` : codex.hint}</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPicking(false);
                    onSettings();
                  }}
                >
                  <strong>Models…</strong>
                  <span>Providers and keys for the built-in agent</span>
                </button>
              </span>
            )}
          </span>
          {working ? (
            <button
              type="button"
              className="send"
              aria-label="Stop"
              data-tip="Stop"
              onClick={() => {
                window.studio.stopAgent().catch((e) => setItems((items) => [...items, { kind: 'notice', text: reason(e), error: true }]));
              }}
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="send"
              aria-label="Send"
              data-tip="Send"
              data-key="Enter"
              disabled={(!draft.trim() && !marks.length && !sending.length) || !ready || disabled}
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </form>
      {shown && (
        <div className="dialog-backdrop dim" role="presentation" onClick={() => setShown(null)}>
          <figure className="lightbox" role="dialog" aria-modal="true" aria-label="Still" onClick={(e) => e.stopPropagation()}>
            <img src={shown.image} alt={shown.caption} />
            <figcaption>{shown.caption}</figcaption>
            <button type="button" className="icon-button" aria-label="Close" data-tip="Close" data-key="Esc" onClick={() => setShown(null)}>
              <X size={16} />
            </button>
          </figure>
        </div>
      )}
    </>
  );
}
