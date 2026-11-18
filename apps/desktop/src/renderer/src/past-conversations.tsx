// The project's past conversations, in the assistant's log's place: each set aside when a new one started, listed by
// when and its first message, and one opened shown read-only as it was, the person's words and the agent's replies,
// each run of tools a line. What was done to the film is in Versions; this is what was said.

import { SystemMessage, usePreferences } from './preferences';
import { ArrowLeft, MessageSquare, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChatItem, PastConversation } from '../../shared/api';
import { Markdown } from './markdown';
import { reason } from './reason';

/** When a conversation was set aside, as the person reads a date and a time. */
const when = (at: number, chinese: boolean) =>
  new Date(at).toLocaleString(chinese ? 'zh-CN' : undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function PastConversations({ onClose }: { onClose(): void }) {
  const { t: tr, chinese } = usePreferences();
  const [list, setList] = useState<PastConversation[] | null>(null);
  const [open, setOpen] = useState<{ conversation: PastConversation; items: ChatItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    window.studio.pastConversations().then(setList, (e) => setError(reason(e)));
  }, []);
  async function show(conversation: PastConversation) {
    setError(null);
    try {
      setOpen({ conversation, items: await window.studio.pastConversation(conversation.id) });
    } catch (e) {
      setError(reason(e));
    }
  }
  return (
    <div className="log past-conversations">
      <div className="past-head">
        {open ? (
          <button type="button" className="button quiet" onClick={() => setOpen(null)}>
            <ArrowLeft size={14} />
            {tr("Past conversations")}
          </button>
        ) : (
          <strong>{tr("Past conversations")}</strong>
        )}
        <button type="button" className="icon-button" aria-label={tr("Back to this conversation")} data-tip={tr("Back to this conversation")} onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
      {open ? (
        <>
          <p className="note past-when">
            {when(open.conversation.at, chinese)} · {tr("Read only")}
          </p>
          {open.items.map((item, i) =>
            item.kind === 'user' ? (
              <p key={i} className="message user">
                {item.text}
              </p>
            ) : item.kind === 'assistant' ? (
              <div key={i} className="message assistant">
                <Markdown source={item.text} />
              </div>
            ) : item.kind === 'tool' ? (
              <p key={i} className="past-tool">
                <Wrench size={12} aria-hidden="true" /> {item.summary}
              </p>
            ) : item.kind === 'notice' ? (
              <p key={i} className="message notice">
                <SystemMessage text={item.text} />
              </p>
            ) : null,
          )}
        </>
      ) : list === null ? (
        <p className="note">{tr("Loading…")}</p>
      ) : list.length === 0 ? (
        <p className="note">{tr("A conversation is kept here when you start a new one.")}</p>
      ) : (
        <ul className="past-list">
          {list.map((conversation) => (
            <li key={conversation.id}>
              <button type="button" onClick={() => void show(conversation)}>
                <MessageSquare size={14} aria-hidden="true" />
                <span>
                  <strong>{conversation.title || tr("Untitled conversation")}</strong>
                  <small>
                    {when(conversation.at, chinese)} · {tr("{0} messages", {0: conversation.messages})}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
