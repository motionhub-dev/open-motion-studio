// The conversation with the agent: what the person asked, what the agent said (its Markdown
// drawn), and the tools it used between, with the stills it looked at. A still opens large and
// takes the film to its moment.

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Loader, Square, X } from 'lucide-react';
import { type AgentEvent, type ChatItem, MARK_NOTE, type Mark, type Reference, type ProviderView, type SentMark } from '../../shared/api';
import { Brief } from './brief';
import { Markdown } from './markdown';
import { elementName, timecode } from './preview';
import { reason } from './reason';

function apply(items: ChatItem[], event: AgentEvent): ChatItem[] {
  switch (event.type) {
    case 'phase':
      return items;
    case 'text': {
      const last = items[items.length - 1];
      if (last?.kind === 'assistant') return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: 'assistant', text: event.text }];
    }
    case 'tool':
      return [...items, { kind: 'tool', id: event.id, name: event.name, summary: event.summary, at: event.at }];
    case 'tool-result':
      return items.map((item) =>
        item.kind === 'tool' && item.id === event.id ? { ...item, result: { ok: event.ok, text: event.text, image: event.image } } : item,
      );
    case 'end':
      return event.notice ? [...items, { kind: 'notice', ...event.notice }] : items;
  }
}

/** When a mark is: its moment, or the stretch it spans. */
const when = (mark: { t: number; end?: number }) =>
  mark.end !== undefined ? `${timecode(mark.t)}–${timecode(mark.end)}` : timecode(mark.t);

/** What a mark is called in the composer: the element picked, a region, or a stretch of time. */
const markLabel = (mark: Mark) => (mark.end !== undefined ? 'A stretch' : mark.element ? elementName(mark.element) : 'A region');

/** Whether two references name the same thing. */
const same = (a: Reference, b: Reference) => JSON.stringify(a) === JSON.stringify(b);

/** Ways to begin, for an empty conversation. */
const STARTS = [
  'A 30-second explainer on how a heat pump works',
  'A 15-second title sequence for a podcast episode',
  'Find a motion for a data story and show me three',
];

interface Props {
  active: ProviderView | undefined;
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
}

/** The composer grows with its text to about eight lines. */
const COMPOSER_MAX = 180;

export function Assistant({
  active,
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
  onWorking,
  refs,
  version,
  onRemoveRef,
  focusRequest,
}: Props) {
  const [items, setItems] = useState<ChatItem[]>([]);
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
      setItems((current) => apply(current, event));
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

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !marks.length && !sending.length) || working || !ready || disabled) return;
    const sent = marks;
    const shown: SentMark[] = sent.map(({ t, end, note }) => ({ t, ...(end !== undefined ? { end } : {}), note }));
    setFollowing(true);
    setPhase('thinking');
    setWorking(true);
    setItems((current) => [...current, { kind: 'user', text, marks: shown, refs: sending, version }]);
    try {
      const outcome = await window.studio.sendMessage(text, sent, sending, version);
      setWorking(false);
      if (outcome.ok) {
        setDraft((current) => (current.trim() === text ? '' : current));
        onSent();
      }
    } catch (e) {
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
      void send();
    }
  }

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
        {items.map((item, i) =>
          item.kind === 'tool' ? (
            <details key={item.id} open={!!item.result?.image} className={`tool${item.result && !item.result.ok ? ' failed' : ''}`}>
              <summary>
                {!item.result ? (
                  <Loader size={13} className="spin" />
                ) : item.result.ok ? (
                  <Check size={13} className="ok" />
                ) : (
                  <X size={13} />
                )}
                <span>{item.summary}</span>
              </summary>
              {item.result?.image && (
                <button
                  type="button"
                  className="still"
                  title={item.at !== undefined ? `Open, and go to ${timecode(item.at)}` : 'Open'}
                  onClick={() => {
                    if (item.at !== undefined) onSeek(item.at);
                    setShown({ image: item.result!.image!, caption: item.result!.text });
                  }}
                >
                  <img src={item.result.image} alt={item.result.text} />
                </button>
              )}
              {item.result && !item.result.image && <pre>{item.result.text}</pre>}
            </details>
          ) : item.kind === 'assistant' ? (
            <div key={i} className="message assistant">
              <Markdown source={item.text} />
            </div>
          ) : (
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
          ),
        )}
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
            <p>
              {elapsed >= 60
                ? 'Still working. You can stop at any time; file changes remain recoverable in History.'
                : 'Your project stays on this computer. File changes are checkpointed as they happen.'}
            </p>
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
      <form className="composer" onSubmit={send}>
        <textarea
          ref={composer}
          value={draft}
          rows={1}
          placeholder={marks.length ? 'Anything else? Refer to marks by number (1, 2…)' : 'Ask for a film, or a change to this one'}
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="composer-actions">
          <button
            type="button"
            className="composer-model"
            aria-label={active ? `Choose model, current: ${active.model} by ${active.name}` : 'Set up a model'}
            aria-haspopup="dialog"
            title={active ? `${active.model} · ${active.name}` : 'Set up a model'}
            onClick={onSettings}
          >
            <span>{active ? active.model : 'Set up a model'}</span>
            <ChevronDown size={12} />
          </button>
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
