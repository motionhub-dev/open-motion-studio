import { SystemMessage, Translated, usePreferences } from './preferences';
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
  const { t: tr } = usePreferences();
  const blocked = !review || stale || review.issues.some((i) => i.severity === 'error');
  return (
    <Dialog label={tr("Export your film")} onClose={onClose} dismissible>
      <div className="panel-head">
        <h2>{tr("One last look.")}</h2>
        <button className="icon-button" aria-label={tr("Close export")} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <p className="export-lede">{tr("Your film, ready to leave the studio.")}</p>
      <div className="export-spec">
        <Download size={20} />
        <div>
          <strong>{tr("MP4 video")}</strong>
          <p>
            H.264 ·{' '}
            {review?.film?.sounds.length
              ? tr("AAC sound, {0} {1} mixed", {0: review.film.sounds.length, 1: review.film.sounds.length === 1 ? 'sound' : 'sounds'})
              : tr("picture only")}{' '}
            {tr("· original film size")}
          </p>
          {review?.film && review.film.scenes.some((scene) => scene.lines.length > 0) && (
            <p>
              {review.film.captions ? tr("Captions in the picture, and the lines") : tr("The lines")} {tr("as subtitles: a track in the video and an .srt file beside it")}
            </p>
          )}
          {review?.film && (
            <span className="mono">
              {review.film.width} × {review.film.height} · {review.film.fps} {tr('fps')} · {review.film.seconds.toFixed(1)} {tr("s")}
            </span>
          )}
        </div>
      </div>
      {checking ? (
        <p className="note working" role="status">
          <RefreshCw size={14} className="spin" />
          {tr("Checking the build and sampling your scenes…")}
        </p>
      ) : error ? (
        <p className="callout" role="alert">
          <SystemMessage text={error} error />
        </p>
      ) : stale ? (
        <p className="note">{tr("The film changed. Check the latest version before exporting.")}</p>
      ) : (
        review && (
          <div className="export-check">
            <Check size={14} />
            <p>
              {blocked ? tr("Some issues need attention before export.") : tr("{0} sampled frames draw successfully.", {0: review.checkedFrames})} {tr("Play the film to review the full motion.")}
            </p>
          </div>
        )
      )}
      <div className="dialog-actions">
        <button className="button" onClick={onClose}>
          {tr("Keep creating")}
        </button>
        {checking ? (
          <button className="button" disabled>
            {tr("Checking…")}
          </button>
        ) : error || stale || !review ? (
          <button className="button" onClick={onCheck}>
            <Translated text="Check again" />
          </button>
        ) : blocked ? (
          <button className="button primary" disabled={checking} onClick={onIssues}>
            {tr("Review issues")}
          </button>
        ) : (
          <button className="button accent" onClick={onExport}>
            <Download size={14} />
            {tr("Choose where to save")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
