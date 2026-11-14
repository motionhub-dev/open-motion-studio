import { Check, Download, RefreshCw, X } from 'lucide-react';
import type { FilmReview } from '../../shared/api';
import { Dialog } from './dialog';
export function ExportDialog({
  review,
  checking,
  stale,
  error,
  onCheck,
  onClose,
  onExport,
  onIssues,
}: {
  review: FilmReview | null;
  checking: boolean;
  stale: boolean;
  error: string;
  onCheck(): void;
  onClose(): void;
  onExport(): void;
  onIssues(): void;
}) {
  const blocked = !review || stale || review.issues.some((i) => i.severity === 'error');
  return (
    <Dialog label="Export your film" onClose={onClose} dismissible>
      <div className="panel-head">
        <h2>One last look.</h2>
        <button className="icon-button" aria-label="Close export" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <p className="export-lede">Your film, ready to leave the studio.</p>
      <div className="export-spec">
        <Download size={20} />
        <div>
          <strong>MP4 video</strong>
          <p>
            H.264 ·{' '}
            {review?.film?.sounds.length
              ? `AAC sound, ${review.film.sounds.length} ${review.film.sounds.length === 1 ? 'sound' : 'sounds'} mixed`
              : 'picture only'}{' '}
            · original film size
          </p>
          {review?.film && review.film.scenes.some((scene) => scene.lines.length > 0) && (
            <p>
              {review.film.captions ? 'Captions in the picture, and the lines' : 'The lines'} as subtitles: a track in the video and an .srt file beside it
            </p>
          )}
          {review?.film && (
            <span className="mono">
              {review.film.width} × {review.film.height} · {review.film.fps} fps · {review.film.seconds.toFixed(1)} s
            </span>
          )}
        </div>
      </div>
      {checking ? (
        <p className="note working" role="status">
          <RefreshCw size={14} className="spin" />
          Checking the build and sampling your scenes…
        </p>
      ) : error ? (
        <p className="callout" role="alert">
          {error}
        </p>
      ) : stale ? (
        <p className="note">The film changed. Check the latest version before exporting.</p>
      ) : (
        review && (
          <div className="export-check">
            <Check size={14} />
            <p>
              {blocked ? 'Some issues need attention before export.' : `${review.checkedFrames} sampled frames draw successfully.`} Play the
              film to review the full motion.
            </p>
          </div>
        )
      )}
      <div className="dialog-actions">
        <button className="button" onClick={onClose}>
          Keep creating
        </button>
        {checking ? (
          <button className="button" disabled>
            Checking…
          </button>
        ) : error || stale || !review ? (
          <button className="button" onClick={onCheck}>
            Check again
          </button>
        ) : blocked ? (
          <button className="button primary" disabled={checking} onClick={onIssues}>
            Review issues
          </button>
        ) : (
          <button className="button accent" onClick={onExport}>
            <Download size={14} />
            Choose where to save
          </button>
        )}
      </div>
    </Dialog>
  );
}
