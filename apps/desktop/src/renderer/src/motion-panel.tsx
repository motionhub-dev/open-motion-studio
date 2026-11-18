// The motion panel: the project's motions as cards, one opened as its page (its colours, its
// components with their previews, its MOTION.md), and motionhub.dev's catalogue to take one
// from. A project's own images are read through the preview scheme's /project/.

import { SystemMessage, Translated, usePreferences } from './preferences';
import { ArrowLeft, Loader, Search, Play, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { CatalogueMotion, MotionDetail, ProjectMotion } from '../../shared/api';
import { Dialog } from './dialog';
import { Markdown } from './markdown';
import { reason } from './reason';

/** A file of the open project, as the renderer may show it. */
const projectFile = (path: string) => `oms-preview://film/project/${path.split('/').map(encodeURIComponent).join('/')}`;

function Poster({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img className="poster" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <span className="poster blank" aria-hidden="true">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Page({ id, onBack }: { id: string; onBack(): void }) {
  const { t: tr } = usePreferences();
  const [detail, setDetail] = useState<MotionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void window.studio.motionDetail(id).then(setDetail, (e) => setError(reason(e))), [id]);

  return (
    <div className="body">
      <button type="button" className="quiet back" onClick={onBack}>
        <ArrowLeft size={14} /> <Translated text="Motions" />
      </button>
      {error && (
        <p className="error" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
      {detail && (
        <>
          <Poster src={detail.motion.poster && projectFile(detail.motion.poster)} label={detail.motion.name} />
          <div className="motion-title">
            <strong>{detail.motion.name}</strong>
            <span className="path mono">
              {detail.motion.id}
              {detail.motion.version ? ` · ${detail.motion.version}` : ''}
            </span>
            {detail.motion.line && <p>{detail.motion.line}</p>}
          </div>
          {detail.colors.length > 0 && (
            <ul className="swatches" aria-label={tr("Colours")}>
              {detail.colors.map((color) => (
                <li key={color.name} title={`${color.name} ${color.value}`}>
                  <span style={{ background: color.value }} />
                  {color.name}
                </li>
              ))}
            </ul>
          )}
          {detail.components.length > 0 && (
            <>
              <span className="label">{tr("Components ·")} {detail.components.length}</span>
              <ul className="components">
                {detail.components.map((part) => (
                  <li key={part.file} title={part.line}>
                    <Poster src={part.preview && projectFile(part.preview)} label={part.name} />
                    <span>
                      {part.name}
                      {part.purpose && <span className="muted"> · {part.purpose}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {detail.markdown && (
            <>
              <span className="label">MOTION.md</span>
              <Markdown source={detail.markdown} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * What the agent is asked when a motion is applied: to restyle the film with it from its own folder, keeping what the
 * film says and when.
 */
export const applyRequest = (motion: { id: string; name: string }) =>
  `Apply the motion ${motion.id} ("${motion.name}") to this film. It is in motions/${motion.id}/: read its MOTION.md and use its colours, its type and those of its components that fit each scene. Keep the film's words, scenes, order and timing. Then check the result.`;

/** A motion asked about before anything happens: applied to the film, or taken out of the project. */
type Confirm = { kind: 'apply' | 'remove'; id: string; name: string; held: boolean };

export function MotionPanel({
  disabled = false,
  onBusy,
  canAsk,
  onAsk,
}: {
  disabled?: boolean;
  onBusy(value: boolean): void;
  /** Whether the agent can take a message now, which applying a motion sends. */
  canAsk: boolean;
  /** Sends the agent a request of the panel's own: a motion to apply. */
  onAsk(text: string): void;
}) {
  const { t: tr } = usePreferences();
  const [held, setHeld] = useState<ProjectMotion[]>([]);
  const [words, setWords] = useState('');
  const [found, setFound] = useState<CatalogueMotion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reel, setReel] = useState<{ name: string; src: string | null } | null>(null);
  const [reelError, setReelError] = useState('');
  const reelRequest = useRef(0);
  useEffect(
    () => () => {
      reelRequest.current++;
    },
    [],
  );
  async function preview(motion: { id: string; name: string }) {
    const request = ++reelRequest.current;
    setReel({ name: motion.name, src: null });
    setReelError('');
    try {
      const src = await window.studio.motionReel(motion.id);
      if (request !== reelRequest.current) return;
      setReel({ name: motion.name, src });
      if (!src) setReelError("This motion has no reel yet. Its poster and description are available in the catalogue.");
    } catch (e) {
      if (request === reelRequest.current) setReelError(reason(e));
    }
  }

  const refresh = () => window.studio.projectMotions().then(setHeld, (e) => setError(reason(e)));

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy('search');
    try {
      setFound(await window.studio.searchMotions(words));
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
    }
  }
  // The catalogue is there on opening, all of it: nobody has to know a word to search for first.
  useEffect(() => {
    void refresh();
    void search();
  }, []);

  /** Takes a motion into the project; true once it is there. */
  async function take(id: string): Promise<boolean> {
    if (disabled) return false;
    setError(null);
    setBusy(id);
    onBusy(true);
    try {
      await window.studio.useMotion(id);
      await refresh();
      return true;
    } catch (e) {
      setError(reason(e));
      return false;
    } finally {
      setBusy(null);
      onBusy(false);
    }
  }

  async function confirmed() {
    if (!confirm) return;
    const { kind, id, name } = confirm;
    setConfirm(null);
    if (kind === 'apply') {
      if (!holds.has(id) && !(await take(id))) return;
      onAsk(applyRequest({ id, name }));
      return;
    }
    setError(null);
    setBusy(id);
    onBusy(true);
    try {
      await window.studio.removeMotion(id);
      if (open === id) setOpen(null);
      await refresh();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
      onBusy(false);
    }
  }

  const holds = new Set(held.map((m) => m.id));
  const applyTip = canAsk ? tr("The assistant restyles the video with it") : tr("Waits until the agent is ready");
  const applyButton = (motion: { id: string; name: string }, used = false) => (
    <button
      type="button"
      className="button primary"
      disabled={disabled || busy !== null || !canAsk || used}
      data-tip={used ? tr("The video already uses it") : applyTip}
      onClick={() => setConfirm({ kind: 'apply', id: motion.id, name: motion.name, held: holds.has(motion.id) })}
    >
      {used ? tr("In use") : tr("Apply to the video")}
    </button>
  );

  return (
    <>
      {open ? (
        <Page id={open} onBack={() => setOpen(null)} />
      ) : (
        <div className="body motion-panel">
          <div className="panel-intro">
            <span className="eyebrow">{tr("A look to build on")}</span>
            <p>{tr("A motion brings colours, type and animated parts from motionhub. Apply one and the assistant restyles the video with it.")}</p>
          </div>
          {error && (
            <p className="error" role="alert">
              <SystemMessage text={error} error />
            </p>
          )}
          {held.length > 0 && (
            <>
              <span className="label">{tr("This project's motions")}</span>
              <ul className="motion-cards">
                {held.map((m) => (
                  <li key={m.id} className="motion-card">
                    <button type="button" className="motion-open" onClick={() => setOpen(m.id)} aria-label={tr("Open {0}", {0: m.name})}>
                      <Poster src={m.poster && projectFile(m.poster)} label={m.name} />
                      <span className="motion-title">
                        <strong>
                          {m.name}
                          <span className={`motion-state${m.used ? ' used' : ''}`}>{m.used ? tr("In use") : tr("Not used yet")}</span>
                        </strong>
                        {m.line && <p>{m.line}</p>}
                      </span>
                    </button>
                    <span className="motion-actions">
                      {!m.used && applyButton(m)}
                      {m.fromHub && (
                        <button type="button" className="icon-button" aria-label={tr("Preview {0}", {0: m.name})} data-tip={tr("Preview")} onClick={() => void preview(m)}>
                          <Play size={14} />
                        </button>
                      )}
                      {m.fromHub && !m.used && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={tr("Remove {0}", {0: m.name})}
                          data-tip={tr("Remove from the project")}
                          disabled={disabled || busy !== null}
                          onClick={() => setConfirm({ kind: 'remove', id: m.id, name: m.name, held: true })}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <span className="label">{tr("From motionhub")}</span>
          <form className="search" onSubmit={search}>
            <input
              type="search"
              value={words}
              placeholder={tr("Search motions")}
              aria-label={tr("Search motions")}
              onChange={(e) => setWords(e.target.value)}
            />
            <button type="submit" className="button" aria-label={tr("Search")} disabled={busy !== null}>
              {busy === 'search' ? <Loader size={14} className="spin" /> : <Search size={14} />}
            </button>
          </form>
          {found === null && busy === 'search' && <p className="note">{tr("Loading motionhub…")}</p>}
          {found && found.length === 0 && <p className="note">{tr("No motion has all of those words.")}</p>}
          <ul className="catalogue">
            {found?.map((m) => (
              <li key={m.id} className="motion-card" title={m.fit ? tr("For: {0}", {0: m.fit}) : m.line}>
                <button className="motion-preview" aria-label={tr("Preview {0}", {0: m.name})} onClick={() => void preview(m)}>
                  <Poster src={m.poster} label={m.name} />
                  <span>
                    <Play size={12} />
                    <Translated text="Preview" />
                  </span>
                </button>
                <span className="motion-title">
                  <strong>{m.name}</strong>
                  {(m.fit || m.line) && <p>{m.fit || m.line}</p>}
                </span>
                <span className="motion-actions">
                  {holds.has(m.id) ? (
                    <span className="note">{tr("In this project")}</span>
                  ) : (
                    <>
                      {applyButton(m)}
                      <button type="button" className="button quiet" disabled={disabled || busy !== null} onClick={() => void take(m.id)}>
                        {busy === m.id ? tr("Taking…") : tr("Add only")}
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirm && (
        <Dialog label={confirm.name} onClose={() => setConfirm(null)}>
          <div className="panel-head">
            <h2>{confirm.kind === 'apply' ? tr("Apply {0} to the video?", {0: confirm.name}) : tr("Remove {0}?", {0: confirm.name})}</h2>
          </div>
          <p className="note">
            {confirm.kind === 'apply'
              ? tr("The assistant uses its colours, type and the parts that fit each scene, keeping the video's words, scenes, order and timing. This takes a turn.")
              : tr("Its folder and its line in motions.lock.json are removed. It can be taken from motionhub again.")}
          </p>
          {confirm.kind === 'apply' && !confirm.held && <p className="note">{tr("It is added to the project first.")}</p>}
          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={() => setConfirm(null)}>
              <Translated text="Cancel" />
            </button>
            <button type="button" className="button primary" disabled={confirm.kind === 'apply' && !canAsk} onClick={() => void confirmed()}>
              {confirm.kind === 'apply' ? tr("Apply to the video") : tr("Remove")}
            </button>
          </div>
        </Dialog>
      )}
      {reel && (
        <Dialog
          label={tr("Preview {0}", {0: reel.name})}
          onClose={() => {
            reelRequest.current++;
            setReel(null);
          }}
        >
          <div className="panel-head">
            <h2>{reel.name}</h2>
            <button
              className="icon-button"
              aria-label={tr("Close motion preview")}
              onClick={() => {
                reelRequest.current++;
                setReel(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
          {reel.src?.startsWith('oms-preview://catalogue/') ? (
            <iframe
              className="reel-frame"
              title={tr("{0} reel", {0: reel.name})}
              src={reel.src}
              sandbox="allow-scripts"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          ) : reel.src ? (
            <video
              className="reel-player"
              src={reel.src}
              controls
              autoPlay
              muted
              playsInline
              onError={() => setReelError("This reel could not be played. Try another motion or retry later.")}
            />
          ) : (
            !reelError && <p className="note">{tr("Loading the reel…")}</p>
          )}
          {reelError && (
            <p className="note" role="status">
              <SystemMessage text={reelError} error />
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
