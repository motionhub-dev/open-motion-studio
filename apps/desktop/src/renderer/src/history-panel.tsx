import { SystemMessage, usePreferences } from './preferences';
import { History, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Checkpoint } from '../../shared/api';
import { Dialog } from './dialog';
import { reason } from './reason';

export function HistoryPanel({ busy, revision, onRestored }: { busy: boolean; revision: number; onRestored(): void }) {
  const { t: tr, chinese } = usePreferences();
  const [entries, setEntries] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Checkpoint | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (busy) return;
    let live = true;
    window.studio.history().then(
      (items) => {
        if (live) {
          setEntries(items);
          setLoading(false);
        }
      },
      (e) => {
        if (live) {
          setError(reason(e));
          setLoading(false);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [revision, busy]);
  useEffect(() => {
    if (!chosen || restoring) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChosen(null);
    };
    addEventListener('keydown', escape);
    return () => removeEventListener('keydown', escape);
  }, [chosen, restoring]);
  async function restore() {
    if (!chosen || busy || restoring) return;
    setRestoring(true);
    setError('');
    try {
      await window.studio.restoreCheckpoint(chosen.id);
      setChosen(null);
      onRestored();
    } catch (e) {
      setError(reason(e));
    } finally {
      setRestoring(false);
    }
  }
  return (
    <div className="body history-panel">
      <div className="panel-intro">
        <History size={18} />
        <h2>{tr("Room to explore")}</h2>
        <p>{tr("Source changes have a way back. Imported media and Motion libraries are kept.")}</p>
      </div>
      {error && (
        <p className="callout" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
      {loading ? (
        <p className="note">{tr("Loading checkpoints…")}</p>
      ) : !entries.length ? (
        <p className="note">{tr("Checkpoints appear when the agent changes a file. No setup needed.")}</p>
      ) : (
        <ol className="history-list">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              <div className="history-heading">
                <span className="eyebrow">{entry.restored ? tr("Restoration") : i === 0 ? tr("Latest change") : tr("Checkpoint")}</span>
                <time dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString(chinese ? 'zh-CN' : 'en', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <strong>{entry.restored ? tr("Restored before “{0}”", {0: entry.label}) : entry.label}</strong>
              <details>
                <summary>
                  {entry.files.length} {tr(entry.files.length === 1 ? 'file' : 'files')} {tr("changed")}
                </summary>
                <ul>
                  {entry.files.map((file) => (
                    <li key={file} className="mono">
                      {file}
                    </li>
                  ))}
                </ul>
              </details>
              <button
                className="button"
                disabled={busy || restoring}
                onClick={() => {
                  setError('');
                  setChosen(entry);
                }}
              >
                <RotateCcw size={13} />
                {entry.restored ? tr("Undo this restoration") : tr("Restore before this change")}
              </button>
            </li>
          ))}
        </ol>
      )}
      {chosen && (
        <Dialog label={tr("Restore checkpoint")} dismissible={!restoring} onClose={() => setChosen(null)}>
          <section className="restore-dialog">
            <div className="panel-head">
              <h2 id="restore-title">{tr("Return to this checkpoint?")}</h2>
              <button autoFocus className="icon-button" aria-label={tr("Keep working")} disabled={restoring} onClick={() => setChosen(null)}>
                <X size={16} />
              </button>
            </div>
            <p>
              {chosen.restored
                ? tr("Undo this restoration and the agent changes after it.")
                : tr("Undo “{0}” and the agent changes after it.", {0: chosen.label})}{' '}
              {tr("This also starts a fresh conversation.")}
            </p>
            <p className="note">
              {tr("A new checkpoint keeps your current work recoverable. If an affected file was edited outside the agent, nothing is restored.")}
            </p>
            {error && (
              <p role="alert" className="callout">
                <SystemMessage text={error} error />
              </p>
            )}
            <div className="dialog-actions">
              <button className="button" disabled={restoring} onClick={() => setChosen(null)}>
                {tr("Keep working")}
              </button>
              <button className="button primary" disabled={restoring || busy} onClick={() => void restore()}>
                {restoring ? tr("Restoring…") : tr("Restore checkpoint")}
              </button>
            </div>
          </section>
        </Dialog>
      )}
    </div>
  );
}
