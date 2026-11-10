// The conversation with the agent: what the person asked, what the agent said, and the
// tools it used between, with the stills it looked at.

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Loader, Square, X } from 'lucide-react';
import type { AgentEvent, ChatItem, EngineId, Mark } from '../../shared/api';
import { reason } from './reason';

function apply(items: ChatItem[], event: AgentEvent): ChatItem[] {
  switch (event.type) {
    case 'text': {
      const last = items[items.length - 1];
      if (last?.kind === 'assistant') return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: 'assistant', text: event.text }];
    }
    case 'tool':
      return [...items, { kind: 'tool', id: event.id, name: event.name, summary: event.summary }];
    case 'tool-result':
      return items.map((item) =>
        item.kind === 'tool' && item.id === event.id
          ? { ...item, result: { ok: event.ok, text: event.text, image: event.image } }
          : item,
      );
    case 'end':
      return event.notice ? [...items, { kind: 'notice', ...event.notice }] : items;
  }
}

/** What a mark is called in the composer: the words or element picked, or the region, and its moment. */
function markLabel(mark: Mark): string {
  const what = mark.element ? (mark.element.text ? `“${mark.element.text.slice(0, 28)}”` : mark.element.path.split(' > ').pop()) : 'a region';
  return `${what} at ${mark.t.toFixed(1)} s`;
}

/** Ways to begin, for an empty conversation, by the engine the film is written for. */
const STARTS: Record<EngineId, string[]> = {
  native: ['A 30-second explainer on how a heat pump works', 'Find a motion for a data story and show me three'],
  remotion: ['A 20-second product teaser with three feature cards', 'Find a motion for a data story and show me three'],
  hyperframes: ['A 15-second title sequence for a podcast episode', 'Find a motion for a data story and show me three'],
};

interface Props {
  ready: boolean;
  engine: EngineId;
  onSettings(): void;
  marks: Mark[];
  onRemoveMark(index: number): void;
  onSent(): void;
}

export function Assistant({ ready, engine, onSettings, marks, onRemoveMark, onSent }: Props) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState('');
  const [working, setWorking] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.studio.conversation().then(setItems);
    return window.studio.onAgentEvent((event) => {
      setItems((current) => apply(current, event));
      if (event.type === 'end') setWorking(false);
    });
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [items]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !marks.length) || working) return;
    const sent = marks;
    setDraft('');
    setWorking(true);
    onSent();
    setItems((current) => [...current, { kind: 'user', text, marks: sent.length }]);
    try {
      await window.studio.sendMessage(text, sent);
    } catch (e) {
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
      <div className="log" ref={log} aria-live="polite">
        {items.length === 0 && (
          <div className="starts">
            <p className="note">
              Say what the film is about, who it is for and how long it runs.
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
            {STARTS[engine].map((start) => (
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
                {!item.result ? <Loader size={13} className="spin" /> : item.result.ok ? <Check size={13} className="ok" /> : <X size={13} />}
                <span>{item.summary}</span>
              </summary>
              {item.result?.image && <img src={item.result.image} alt={item.result.text} />}
              {item.result && !item.result.image && <pre>{item.result.text}</pre>}
            </details>
          ) : (
            <p key={i} className={`message ${item.kind}${item.kind === 'notice' && item.error ? ' error' : ''}`}>
              {item.text}
              {item.kind === 'user' && item.marks > 0 && (
                <span className="marked">
                  {item.marks} {item.marks === 1 ? 'mark' : 'marks'} on the picture
                </span>
              )}
            </p>
          ),
        )}
        {working && (
          <p className="note working">
            <Loader size={13} className="spin" /> Working…
          </p>
        )}
      </div>
      {marks.length > 0 && (
        <ul className="chips" aria-label="Marks for the next message">
          {marks.map((mark, i) => (
            <li key={i}>
              <span className="number">{i + 1}</span> {markLabel(mark)}
              <button type="button" className="quiet" aria-label={`Remove mark ${i + 1}`} onClick={() => onRemoveMark(i)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          rows={2}
          placeholder={marks.length ? 'Say what should change at the marks (1, 2…)' : 'Ask for a film, or a change to this one'}
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        {working ? (
          <button type="button" className="send" aria-label="Stop" title="Stop" onClick={() => void window.studio.stopAgent()}>
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="send" aria-label="Send" title="Send (Enter)" disabled={(!draft.trim() && !marks.length) || !ready}>
            <ArrowUp size={16} />
          </button>
        )}
      </form>
    </>
  );
}
