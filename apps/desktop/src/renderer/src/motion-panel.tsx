// The motion panel: the project's motions as cards, one opened as its page (its colours, its
// components with their previews, its MOTION.md), and motionhub.dev's catalogue to take one
// from. A project's own images are read through the preview scheme's /project/.

import { ArrowLeft, Loader, Search, Play, X } from 'lucide-react';
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
  const [detail, setDetail] = useState<MotionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void window.studio.motionDetail(id).then(setDetail, (e) => setError(reason(e))), [id]);

  return (
    <div className="body">
      <button type="button" className="quiet back" onClick={onBack}>
        <ArrowLeft size={14} /> Motions
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
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
            <ul className="swatches" aria-label="Colours">
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
              <span className="label">Components · {detail.components.length}</span>
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

export function MotionPanel({ disabled = false, onBusy }: { disabled?: boolean; onBusy(value: boolean): void }) {
  const [held, setHeld] = useState<ProjectMotion[]>([]);
  const [words, setWords] = useState('');
  const [found, setFound] = useState<CatalogueMotion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reel, setReel] = useState<{ name: string; src: string | null } | null>(null);
  const [reelError, setReelError] = useState('');
  const reelRequest = useRef(0);
  useEffect(
    () => () => {
      reelRequest.current++;
    },
    [],
  );
  async function preview(motion: CatalogueMotion) {
    const request = ++reelRequest.current;
    setReel({ name: motion.name, src: null });
    setReelError('');
    try {
      const src = await window.studio.motionReel(motion.id);
      if (request !== reelRequest.current) return;
      setReel({ name: motion.name, src });
      if (!src) setReelError('This motion has no reel yet. Its poster and description are available in the catalogue.');
    } catch (e) {
      if (request === reelRequest.current) setReelError(reason(e));
    }
  }

  const refresh = () => window.studio.projectMotions().then(setHeld, (e) => setError(reason(e)));
  useEffect(() => void refresh(), []);

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

  async function use(id: string) {
    if (disabled) return;
    setError(null);
    setBusy(id);
    onBusy(true);
    try {
      await window.studio.useMotion(id);
      await refresh();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
      onBusy(false);
    }
  }

  const holds = new Set(held.map((m) => m.id));

  return (
    <>
      {open ? (
        <Page id={open} onBack={() => setOpen(null)} />
      ) : (
        <div className="body">
          {held.length === 0 ? (
            <p className="note">None in this project yet. Take one from motionhub, or let the film draw freely.</p>
          ) : (
            <ul className="motion-cards">
              {held.map((m) => (
                <li key={m.id}>
                  <button type="button" className="motion-card" onClick={() => setOpen(m.id)}>
                    <Poster src={m.poster && projectFile(m.poster)} label={m.name} />
                    <span className="motion-title">
                      <strong>{m.name}</strong>
                      <span className="path mono">
                        {m.id}
                        {m.version ? ` · ${m.version}` : ''}
                      </span>
                      {m.line && <p>{m.line}</p>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <span className="label">motionhub</span>
          <form className="search" onSubmit={search}>
            <input
              type="search"
              value={words}
              placeholder="Search motions"
              aria-label="Search motions"
              onChange={(e) => setWords(e.target.value)}
            />
            <button type="submit" className="button" aria-label="Search" disabled={busy !== null}>
              {busy === 'search' ? <Loader size={14} className="spin" /> : <Search size={14} />}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {found && found.length === 0 && <p className="note">No motion has all of those words.</p>}
          <ul className="catalogue">
            {found?.map((m) => (
              <li key={m.id} className="motion-card" title={m.fit ? `For: ${m.fit}` : m.line}>
                <button className="motion-preview" aria-label={`Preview ${m.name}`} onClick={() => void preview(m)}>
                  <Poster src={m.poster} label={m.name} />
                  <span>
                    <Play size={12} />
                    Preview
                  </span>
                </button>
                <span className="motion-title">
                  <strong>{m.name}</strong>
                  <span className="path mono">{m.id}</span>
                </span>
                <button type="button" className="button" disabled={disabled || busy !== null || holds.has(m.id)} onClick={() => use(m.id)}>
                  {holds.has(m.id) ? 'In this project' : busy === m.id ? 'Taking…' : 'Use'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {reel && (
        <Dialog
          label={`Preview ${reel.name}`}
          onClose={() => {
            reelRequest.current++;
            setReel(null);
          }}
        >
          <div className="panel-head">
            <h2>{reel.name}</h2>
            <button
              className="icon-button"
              aria-label="Close motion preview"
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
              title={`${reel.name} reel`}
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
              onError={() => setReelError('This reel could not be played. Try another motion or retry later.')}
            />
          ) : (
            !reelError && <p className="note">Loading the reel…</p>
          )}
          {reelError && (
            <p className="note" role="status">
              {reelError}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
