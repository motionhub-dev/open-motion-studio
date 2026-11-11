// The conversation with the agent: what the person asked, what the agent said (its Markdown
// drawn), and the tools it used between, with the stills it looked at. A still opens large and
// takes the film to its moment.

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Loader, Square, X } from 'lucide-react';
import type { AgentEvent, ChatItem, Mark, Reference, ProviderView } from '../../shared/api';
import { Brief } from './brief';
import { Markdown } from './markdown';
import { timecode } from './preview';
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

/** What a mark is called in the composer: the words or element picked, or the region, and its moment. */
function markLabel(mark: Mark): string {
  const what = mark.element
    ? mark.element.text
      ? `“${mark.element.text.slice(0, 28)}”`
      : mark.element.path.split(' > ').pop()
    : 'a region';
  return `${what} at ${mark.t.toFixed(1)} s`;
}

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
    if ((!text && !marks.length && !refs.length) || working || !ready || disabled) return;
    const sent = marks;
    setFollowing(true);
    setPhase('thinking');
    setWorking(true);
    setItems((current) => [...current, { kind: 'user', text, marks: sent.length, refs, version }]);
    try {
      const outcome = await window.studio.sendMessage(text, sent, refs, version);
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
                  <span key={n} className="sent-ref" title={ref.detail ?? ref.path}>
                    {ref.kind} · {ref.label}
                  </span>
                ))}
              {item.kind === 'user' && item.marks > 0 && (
                <span className="marked">
                  {item.marks} {item.marks === 1 ? 'mark' : 'marks'} on the picture
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
      {refs.length > 0 && (
        <ul className="reference-cards" aria-label="References for the next message">
          {refs.map((ref, i) => (
            <li key={i}>
              <button
                type="button"
                className="reference-locate"
                onClick={() => ref.time !== undefined && onSeek(ref.time)}
                title={ref.detail ?? ref.path}
              >
                <span className="eyebrow">
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
                onClick={() => onRemoveRef(i)}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {marks.length > 0 && (
        <ul className="chips" aria-label="Marks for the next message">
          {marks.map((mark, i) => (
            <li key={i}>
              <button type="button" className="quiet" onClick={() => onSeek(mark.t)}>
                <span className="number">{i + 1}</span> {markLabel(mark)}
              </button>
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
          placeholder={marks.length ? 'Say what should change at the marks (1, 2…)' : 'Ask for a film, or a change to this one'}
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
              disabled={(!draft.trim() && !marks.length && !refs.length) || !ready || disabled}
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
