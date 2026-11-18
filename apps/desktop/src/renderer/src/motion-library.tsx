// The motion library, across the workspace in place of the stage, the timeline and the project tools, beside the
// assistant: the project's motions, then motionhub's whole catalogue as a grid of posters, narrowed by words and by
// tags; a poster pointed at plays its reel. One opened shows in a drawer at the right: its reel, what it is for, its
// colours, its components and its MOTION.md (for one the project holds), and what can be done with it. Applying asks
// first, then takes the motion if needed and asks the agent to restyle the film with it.

import { SystemMessage, Translated, usePreferences } from './preferences';
import { ArrowLeft, Loader, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogueMotion, MotionDetail, ProjectMotion } from '../../shared/api';
import { Dialog } from './dialog';
import { Markdown } from './markdown';
import { reason } from './reason';

/** A file of the open project, as the renderer may show it. */
const projectFile = (path: string) => `oms-preview://film/project/${path.split('/').map(encodeURIComponent).join('/')}`;

/**
 * What the agent is asked when a motion is applied: to restyle the film with it from its own folder, keeping what the
 * film says and when.
 */
export const applyRequest = (motion: { id: string; name: string }) =>
  `Apply the motion ${motion.id} ("${motion.name}") to this film. It is in motions/${motion.id}/: read its MOTION.md and use its colours, its type and those of its components that fit each scene. Keep the film's words, scenes, order and timing. Then check the result.`;

/** The catalogue's motions that hold every word typed (in their name, line, use or tags) and the tag chosen. */
export function narrowed(motions: CatalogueMotion[], words: string, tag: string | null): CatalogueMotion[] {
  const wanted = words.toLowerCase().split(/\s+/).filter(Boolean);
  return motions.filter((m) => {
    if (tag && !m.tags.includes(tag)) return false;
    const text = [m.name, m.line, m.fit, ...m.tags].join(' ').toLowerCase();
    return wanted.every((word) => text.includes(word));
  });
}

/** The tags most motions share, most first, for choosing among them: at most ten. */
export function commonTags(motions: CatalogueMotion[]): string[] {
  const counts = new Map<string, number>();
  for (const m of motions) for (const tag of m.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([tag]) => tag);
}

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

/** A reel as the catalogue serves it: its HTML player in a sandboxed frame, or a video. */
function Reel({ name, src, autoPlay }: { name: string; src: string; autoPlay: boolean }) {
  const { t: tr } = usePreferences();
  return src.startsWith('oms-preview://catalogue/') ? (
    <iframe className="reel-frame" title={tr("{0} reel", {0: name})} src={src} sandbox="allow-scripts" allow="autoplay; fullscreen" allowFullScreen />
  ) : (
    <video className="reel-player" src={src} controls={!autoPlay} autoPlay muted loop={autoPlay} playsInline />
  );
}

/** A motion as the library shows it: from the catalogue, the project, or both. */
type Shown = { id: string; name: string; line: string; fit: string; tags: string[]; poster: string | null; held: ProjectMotion | null };

/** A motion asked about before anything happens: applied to the film, or taken out of the project. */
type Confirm = { kind: 'apply' | 'remove'; id: string; name: string; held: boolean };

export function MotionLibrary({
  disabled,
  revision,
  onBusy,
  canAsk,
  onAsk,
  onClose,
}: {
  disabled: boolean;
  /** The film's build, whose change may mean the film uses another motion. */
  revision: number;
  onBusy(value: boolean): void;
  /** Whether the agent can take a message now, which applying a motion sends. */
  canAsk: boolean;
  onAsk(text: string): void;
  /** Back to the picture. */
  onClose(): void;
}) {
  const { t: tr } = usePreferences();
  const [held, setHeld] = useState<ProjectMotion[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueMotion[] | null>(null);
  const [words, setWords] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** Each reel's address once asked for (null: none), so a poster pointed at again plays at once. */
  const [reels, setReels] = useState<Record<string, string | null>>({});
  const [pointed, setPointed] = useState<string | null>(null);
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = () => window.studio.projectMotions().then(setHeld, (e) => setError(reason(e)));
  useEffect(() => void refresh(), [revision]);
  useEffect(() => {
    window.studio.searchMotions('').then(setCatalogue, (e) => {
      setCatalogue([]);
      setError(reason(e));
    });
  }, []);
  // Esc closes the drawer, then the library; not while a dialog is open over them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.dialog')) return;
      if (open) setOpen(null);
      else onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => () => void (hover.current && clearTimeout(hover.current)), []);

  async function reel(id: string): Promise<string | null> {
    if (id in reels) return reels[id] ?? null;
    try {
      const src = await window.studio.motionReel(id);
      setReels((current) => ({ ...current, [id]: src }));
      return src;
    } catch {
      setReels((current) => ({ ...current, [id]: null }));
      return null;
    }
  }
  /** A poster pointed at for a moment plays its reel, when the reel is a video. */
  function point(id: string | null) {
    if (hover.current) clearTimeout(hover.current);
    setPointed(null);
    if (!id) return;
    hover.current = setTimeout(() => {
      void reel(id).then((src) => src && setPointed(id));
    }, 350);
  }

  const holds = new Map(held.map((m) => [m.id, m]));
  const fromHub = new Map((catalogue ?? []).map((m) => [m.id, m]));
  const shown = (id: string): Shown | null => {
    const hub = fromHub.get(id);
    const own = holds.get(id) ?? null;
    if (!hub && !own) return null;
    return {
      id,
      name: hub?.name ?? own!.name,
      line: hub?.line ?? own!.line,
      fit: hub?.fit ?? '',
      tags: hub?.tags ?? [],
      poster: hub?.poster ?? (own?.poster ? projectFile(own.poster) : null),
      held: own,
    };
  };
  const tags = useMemo(() => commonTags(catalogue ?? []), [catalogue]);
  const found = useMemo(() => narrowed(catalogue ?? [], words, tag), [catalogue, words, tag]);
  const opened = open ? shown(open) : null;

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
      await refresh();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(null);
      onBusy(false);
    }
  }

  const card = (m: Shown) => (
    <li key={m.id}>
      <button
        type="button"
        className={`library-card${open === m.id ? ' open' : ''}`}
        aria-pressed={open === m.id}
        title={m.fit ? tr("For: {0}", {0: m.fit}) : m.line}
        onClick={() => setOpen(open === m.id ? null : m.id)}
        onPointerEnter={() => point(m.id)}
        onPointerLeave={() => point(null)}
        onFocus={() => point(m.id)}
        onBlur={() => point(null)}
      >
        <span className="library-poster">
          <Poster src={m.poster} label={m.name} />
          {pointed === m.id && reels[m.id] && !reels[m.id]!.startsWith('oms-preview://catalogue/') && (
            <video src={reels[m.id]!} autoPlay muted loop playsInline aria-hidden="true" />
          )}
          {m.held && <span className={`motion-state${m.held.used ? ' used' : ''}`}>{m.held.used ? tr("In use") : tr("In this project")}</span>}
        </span>
        <strong>{m.name}</strong>
        {(m.fit || m.line) && <span className="library-line">{m.fit || m.line}</span>}
      </button>
    </li>
  );

  const ours = held.map((m) => shown(m.id)).filter((m): m is Shown => !!m);
  return (
    <div className="centre-view motion-library">
      <div className="library-head">
        <button type="button" className="button quiet" onClick={onClose} data-tip={tr("Back to the picture")} data-key="Esc">
          <ArrowLeft size={14} />
          {tr("Picture")}
        </button>
        <h2>
          <Translated text="Motions" />
        </h2>
        <label className="library-search">
          <Search size={14} />
          <input
            type="search"
            value={words}
            placeholder={tr("Search motions")}
            aria-label={tr("Search motions")}
            onChange={(e) => setWords(e.target.value)}
          />
        </label>
        <span className="spacer" />
        <span className="note">{tr("A motion brings colours, type and animated parts from motionhub. Apply one and the assistant restyles the video with it.")}</span>
      </div>
      {tags.length > 0 && (
        <div className="library-tags" role="group" aria-label={tr("Tags")}>
          <button type="button" className="chip" aria-pressed={tag === null} onClick={() => setTag(null)}>
            {tr("All")}
          </button>
          {tags.map((name) => (
            <button key={name} type="button" className="chip" aria-pressed={tag === name} onClick={() => setTag(tag === name ? null : name)}>
              {name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="callout" role="alert">
          <SystemMessage text={error} error />
        </p>
      )}
      <div className={`library-body${opened ? ' with-detail' : ''}`}>
        <div className="library-scroll">
          {ours.length > 0 && (
            <section>
              <h3 className="label">{tr("This project's motions")}</h3>
              <ul className="library-grid">{ours.map(card)}</ul>
            </section>
          )}
          <section>
            <h3 className="label">
              {tr("From motionhub")}
              {catalogue && <span className="note"> · {found.length}</span>}
            </h3>
            {catalogue === null ? (
              <p className="note">
                <Loader size={14} className="spin" /> {tr("Loading motionhub…")}
              </p>
            ) : found.length === 0 ? (
              <p className="note">{tr("No motion has all of those words.")}</p>
            ) : (
              <ul className="library-grid">{found.map((m) => card(shown(m.id)!))}</ul>
            )}
          </section>
        </div>
        {opened && (
          <Detail
            key={opened.id}
            motion={opened}
            reel={reel}
            busy={busy}
            disabled={disabled}
            canAsk={canAsk}
            onApply={() => setConfirm({ kind: 'apply', id: opened.id, name: opened.name, held: !!opened.held })}
            onTake={() => void take(opened.id)}
            onRemove={() => setConfirm({ kind: 'remove', id: opened.id, name: opened.name, held: true })}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
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
    </div>
  );
}

/** A motion opened: its reel playing, what it is for, and for one the project holds, its colours, parts and notes. */
function Detail({
  motion,
  reel,
  busy,
  disabled,
  canAsk,
  onApply,
  onTake,
  onRemove,
  onClose,
}: {
  motion: Shown;
  reel(id: string): Promise<string | null>;
  busy: string | null;
  disabled: boolean;
  canAsk: boolean;
  onApply(): void;
  onTake(): void;
  onRemove(): void;
  onClose(): void;
}) {
  const { t: tr } = usePreferences();
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  const [detail, setDetail] = useState<MotionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void reel(motion.id).then(setSrc);
  }, [motion.id]);
  useEffect(() => {
    if (!motion.held) return setDetail(null);
    window.studio.motionDetail(motion.id).then(setDetail, (e) => setError(reason(e)));
  }, [motion.id, motion.held?.version]);
  const used = motion.held?.used ?? false;
  return (
    <aside className="library-detail" aria-label={motion.name}>
      <div className="library-detail-head">
        <strong>{motion.name}</strong>
        <button type="button" className="icon-button" aria-label={tr("Close")} data-tip={tr("Close")} data-key="Esc" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="library-detail-scroll">
        <div className="library-reel">
          {src === undefined ? (
            <p className="note">
              <Loader size={14} className="spin" /> {tr("Loading the reel…")}
            </p>
          ) : src ? (
            <Reel name={motion.name} src={src} autoPlay={false} />
          ) : (
            <Poster src={motion.poster} label={motion.name} />
          )}
        </div>
        <p className="path mono">
          {motion.id}
          {motion.held?.version ? ` · ${motion.held.version}` : ''}
        </p>
        {motion.line && <p>{motion.line}</p>}
        {motion.fit && <p className="note">{tr("For: {0}", {0: motion.fit})}</p>}
        {motion.tags.length > 0 && (
          <ul className="library-detail-tags">
            {motion.tags.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        {error && (
          <p className="error" role="alert">
            <SystemMessage text={error} error />
          </p>
        )}
        {detail && detail.colors.length > 0 && (
          <>
            <span className="label">{tr("Colours")}</span>
            <ul className="swatches">
              {detail.colors.map((color) => (
                <li key={color.name} title={`${color.name} ${color.value}`}>
                  <span style={{ background: color.value }} />
                  {color.name}
                </li>
              ))}
            </ul>
          </>
        )}
        {detail && detail.components.length > 0 && (
          <>
            <span className="label">
              {tr("Components ·")} {detail.components.length}
            </span>
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
        {detail?.markdown && (
          <>
            <span className="label">MOTION.md</span>
            <Markdown source={detail.markdown} />
          </>
        )}
        {!motion.held && <p className="note">{tr("Its colours, parts and notes show once it is in the project.")}</p>}
      </div>
      <div className="library-detail-actions">
        <button
          type="button"
          className="button primary"
          disabled={disabled || busy !== null || !canAsk || used}
          data-tip={used ? tr("The video already uses it") : canAsk ? tr("The assistant restyles the video with it") : tr("Waits until the agent is ready")}
          onClick={onApply}
        >
          {used ? tr("In use") : tr("Apply to the video")}
        </button>
        {!motion.held && (
          <button type="button" className="button" disabled={disabled || busy !== null} onClick={onTake}>
            {busy === motion.id ? tr("Taking…") : tr("Add only")}
          </button>
        )}
        {motion.held?.fromHub && !used && (
          <button type="button" className="button ghost" disabled={disabled || busy !== null} onClick={onRemove} data-tip={tr("Remove from the project")}>
            <Trash2 size={14} />
            {tr("Remove")}
          </button>
        )}
        {motion.held && !motion.held.fromHub && <span className="note">{tr("The project's own motion")}</span>}
      </div>
    </aside>
  );
}
