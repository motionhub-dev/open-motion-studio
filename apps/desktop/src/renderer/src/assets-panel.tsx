// The project's own images, type and sound, copied into media/. Each is dragged onto the picture (a mark asking for it
// there) or onto the composer (a reference), or added to the message with @; a sound plays in place and a typeface
// shows itself. A file the film's code names is marked In use.

import { SystemMessage, usePreferences } from './preferences';
import { AtSign, Image, Music, Pause, Play, Plus, RefreshCw, Type, X } from 'lucide-react';
import { type DragEvent, useEffect, useRef, useState } from 'react';
import type { Asset, Reference } from '../../shared/api';
import { reason } from './reason';
import { Dialog } from './dialog';

const source = (asset: Pick<Asset, 'path'>) => `oms-preview://film/project/${asset.path.split('/').map(encodeURIComponent).join('/')}`;

/** The type a dragged asset travels as, inside the Studio's window only. */
const ASSET_DRAG = 'application/x-oms-asset';

/** A reference to an asset for the next message, as every way of adding one makes it. */
export const assetReference = (asset: Pick<Asset, 'path' | 'name' | 'kind'>): Reference => ({
  kind: 'asset',
  label: asset.name,
  path: asset.path,
  detail: `Use this local ${asset.kind}: ${asset.path}`,
});

/** The asset a drop carries, or null for anything else: only a project file under media/ that the panel dragged. */
export function droppedAsset(event: DragEvent): Pick<Asset, 'path' | 'name' | 'kind'> | null {
  try {
    const asset = JSON.parse(event.dataTransfer.getData(ASSET_DRAG)) as Partial<Asset>;
    return typeof asset.path === 'string' &&
      asset.path.startsWith('media/') &&
      !asset.path.split('/').includes('..') &&
      typeof asset.name === 'string' &&
      (asset.kind === 'image' || asset.kind === 'font' || asset.kind === 'audio')
      ? { path: asset.path, name: asset.name, kind: asset.kind }
      : null;
  } catch {
    return null;
  }
}

/** Whether a drag carries an asset, which a drop target then takes. */
export const carriesAsset = (event: DragEvent) => event.dataTransfer.types.includes(ASSET_DRAG);

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** A typeface shown in itself: loaded from the project under a name of its own. */
function Specimen({ asset }: { asset: Asset }) {
  const family = `oms-asset-${asset.path.replace(/[^a-z0-9]/gi, '-')}`;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const face = new FontFace(family, `url("${source(asset)}")`);
    face.load().then(
      (loaded) => {
        document.fonts.add(loaded);
        if (live) setReady(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [family]);
  return (
    <span className="font-preview" style={ready ? { fontFamily: `"${family}"` } : undefined}>
      {ready ? 'Aa 永' : <Type size={28} />}
    </span>
  );
}

export function AssetsPanel({
  disabled,
  onReference,
  onBusy,
}: {
  disabled: boolean;
  onReference(ref: Reference): void;
  onBusy(value: boolean): void;
}) {
  const { t: tr } = usePreferences();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [broken, setBroken] = useState(false);
  const [importing, setImporting] = useState(false);
  /** The sound playing in place, and each sound's length once known. */
  const [playing, setPlaying] = useState<string | null>(null);
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const sounds = useRef<Record<string, HTMLAudioElement | null>>({});
  useEffect(() => {
    let live = true;
    window.studio.projectAssets().then(
      (items) => {
        if (live) {
          setAssets(items);
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
  }, []);
  async function refresh() {
    setError('');
    setLoading(true);
    try {
      setAssets(await window.studio.projectAssets());
    } catch (e) {
      setError(reason(e));
    } finally {
      setLoading(false);
    }
  }
  async function bring() {
    if (disabled || importing) return;
    setImporting(true);
    onBusy(true);
    setError('');
    try {
      setAssets(await window.studio.importAssets());
    } catch (e) {
      setError(reason(e));
    } finally {
      setImporting(false);
      onBusy(false);
    }
  }
  function toggle(asset: Asset) {
    for (const [path, sound] of Object.entries(sounds.current)) if (path !== asset.path) sound?.pause();
    const sound = sounds.current[asset.path];
    if (!sound) return;
    if (sound.paused) void sound.play().catch((e) => setError(reason(e)));
    else sound.pause();
  }
  return (
    <div className="body assets-panel">
      <div className="panel-intro">
        <span className="eyebrow">{tr("Make it your own")}</span>
        <h2>{tr("Your images, type and sound.")}</h2>
        <p>{tr("Drag one onto the picture to put it there, or onto the message to talk about it.")}</p>
      </div>
      <div className="asset-actions">
        <button className="button" disabled={disabled || importing} onClick={() => void bring()}>
          <Plus size={14} />
          {importing ? tr("Importing…") : tr("Import files")}
        </button>
        <button
          className="icon-button"
          aria-label={tr("Refresh assets")}
          data-tip={tr("Refresh assets")}
          disabled={loading || importing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="note">
        {tr("Copied into")} <span className="mono">media/</span>{tr(". Originals stay where they are. Images, fonts, music and sound effects, up to 50 MB each.")}
      </p>
      {error && (
        <p role="alert" className="callout">
          <SystemMessage text={error} error />
        </p>
      )}
      {loading ? (
        <p className="note">{tr("Looking for your files…")}</p>
      ) : !assets.length ? (
        <div className="asset-empty">
          <Image size={28} />
          <strong>{tr("A place for your own material")}</strong>
          <p>{tr("A logo, a photograph, a typeface. Start with one file.")}</p>
        </div>
      ) : (
        <ul className="asset-grid">
          {assets.map((asset) => (
            <li
              key={asset.path}
              draggable={!disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData(ASSET_DRAG, JSON.stringify({ path: asset.path, name: asset.name, kind: asset.kind }));
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <button
                className="asset-card"
                onClick={() => {
                  setBroken(false);
                  setSelected(asset);
                }}
              >
                {asset.kind === 'image' ? (
                  <img src={source(asset)} alt="" draggable={false} />
                ) : asset.kind === 'font' ? (
                  <Specimen asset={asset} />
                ) : (
                  <span className="font-preview">
                    <Music size={28} />
                  </span>
                )}
                <strong>{asset.name}</strong>
                <small>
                  {asset.used && <span className="asset-used">{tr("In use")}</span>}
                  {tr(asset.kind)} · {lengths[asset.path] ? clock(lengths[asset.path]!) : size(asset.bytes)}
                </small>
              </button>
              {asset.kind === 'audio' && (
                <>
                  <audio
                    ref={(element) => {
                      sounds.current[asset.path] = element;
                    }}
                    src={source(asset)}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const seconds = e.currentTarget.duration;
                      if (Number.isFinite(seconds)) setLengths((current) => ({ ...current, [asset.path]: seconds }));
                    }}
                    onPlay={() => setPlaying(asset.path)}
                    onPause={() => setPlaying((current) => (current === asset.path ? null : current))}
                    onEnded={() => setPlaying(null)}
                  />
                  <button
                    type="button"
                    className="icon-button asset-play"
                    aria-label={playing === asset.path ? tr("Pause {0}", {0: asset.name}) : tr("Play {0}", {0: asset.name})}
                    data-tip={playing === asset.path ? tr("Pause") : tr("Play")}
                    onClick={() => toggle(asset)}
                  >
                    {playing === asset.path ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                </>
              )}
              <button
                type="button"
                className="icon-button asset-use"
                aria-label={tr("Add {0} to the message", {0: asset.name})}
                data-tip={tr("Add to your message")}
                disabled={disabled || importing}
                onClick={() => onReference(assetReference(asset))}
              >
                <AtSign size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <Dialog label={selected.name} onClose={() => setSelected(null)}>
          <div className="panel-head">
            <h2>{selected.name}</h2>
            <button className="icon-button" aria-label={tr("Close asset")} onClick={() => setSelected(null)}>
              <X size={16} />
            </button>
          </div>
          {selected.kind === 'image' && !broken ? (
            <img className="asset-large" src={source(selected)} alt={selected.name} onError={() => setBroken(true)} />
          ) : selected.kind === 'audio' && !broken ? (
            <audio className="asset-audio" controls src={source(selected)} onError={() => setBroken(true)} />
          ) : (
            <p className="note">
              {broken
                ? tr("This {0} could not be loaded. Refresh the asset list to check whether it is still in the project.", {0: tr(selected.kind === 'audio' ? 'sound' : 'image')})
                : tr("This font is available for the assistant to use in the film.")}
            </p>
          )}
          <p className="path mono">{selected.path}</p>
          <div className="dialog-actions">
            <button
              className="button primary"
              disabled={disabled || importing || broken}
              onClick={() => {
                onReference(assetReference(selected));
                setSelected(null);
              }}
            >
              {tr("Use in a message")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
