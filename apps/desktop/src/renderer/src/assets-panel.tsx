import { Image, Music, Plus, RefreshCw, Type, MessageSquare, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Asset, Reference } from '../../shared/api';
import { reason } from './reason';
import { Dialog } from './dialog';
const source = (asset: Asset) => `oms-preview://film/project/${asset.path.split('/').map(encodeURIComponent).join('/')}`;
export function AssetsPanel({
  disabled,
  onReference,
  onBusy,
}: {
  disabled: boolean;
  onReference(ref: Reference): void;
  onBusy(value: boolean): void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [broken, setBroken] = useState(false);
  const [importing, setImporting] = useState(false);
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
  return (
    <div className="body assets-panel">
      <div className="panel-intro">
        <span className="eyebrow">Make it your own</span>
        <h2>Your images, type and sound.</h2>
        <p>Bring images, fonts, music and sound effects into the project, then tell the assistant how to use them.</p>
      </div>
      <div className="asset-actions">
        <button className="button" disabled={disabled || importing} onClick={() => void bring()}>
          <Plus size={14} />
          {importing ? 'Importing…' : 'Import files'}
        </button>
        <button
          className="icon-button"
          aria-label="Refresh assets"
          data-tip="Refresh assets"
          disabled={loading || importing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="note">
        Copied into <span className="mono">media/</span>. Originals stay where they are. Images and fonts, up to 50 MB each.
      </p>
      {error && (
        <p role="alert" className="callout">
          {error}
        </p>
      )}
      {loading ? (
        <p className="note">Looking for your files…</p>
      ) : !assets.length ? (
        <div className="asset-empty">
          <Image size={28} />
          <strong>A place for your own material</strong>
          <p>A logo, a photograph, a typeface. Start with one file.</p>
        </div>
      ) : (
        <ul className="asset-grid">
          {assets.map((asset) => (
            <li key={asset.path}>
              <button
                className="asset-card"
                onClick={() => {
                  setBroken(false);
                  setSelected(asset);
                }}
              >
                {asset.kind === 'image' ? (
                  <img src={source(asset)} alt="" loading="lazy" />
                ) : (
                  <span className="font-preview">{asset.kind === 'audio' ? <Music size={28} /> : <Type size={28} />}</span>
                )}
                <strong>{asset.name}</strong>
                <small>
                  {asset.kind} ·{' '}
                  {asset.bytes < 1024 * 1024
                    ? `${Math.max(1, Math.round(asset.bytes / 1024))} KB`
                    : `${(asset.bytes / 1024 / 1024).toFixed(1)} MB`}
                </small>
              </button>
              <button
                className="quiet asset-use"
                disabled={disabled || importing}
                onClick={() =>
                  onReference({ kind: 'asset', label: asset.name, path: asset.path, detail: `Use this local ${asset.kind}: ${asset.path}` })
                }
              >
                <MessageSquare size={12} />
                Use in a message
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <Dialog label={selected.name} onClose={() => setSelected(null)}>
          <div className="panel-head">
            <h2>{selected.name}</h2>
            <button className="icon-button" aria-label="Close asset" onClick={() => setSelected(null)}>
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
                ? `This ${selected.kind === 'audio' ? 'sound' : 'image'} could not be loaded. Refresh the asset list to check whether it is still in the project.`
                : 'This font is available for the assistant to use in the film.'}
            </p>
          )}
          <p className="path mono">{selected.path}</p>
          <div className="dialog-actions">
            <button
              className="button primary"
              disabled={disabled || importing || broken}
              onClick={() => {
                onReference({ kind: 'asset', label: selected.name, path: selected.path });
                setSelected(null);
              }}
            >
              Use in a message
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
