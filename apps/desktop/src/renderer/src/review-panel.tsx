import { SystemMessage, usePreferences } from './preferences';
import { AlertCircle, Check, Crosshair, MessageSquare, RefreshCw } from 'lucide-react';
import type { FilmReview, Reference } from '../../shared/api';
import { timecode } from './preview';
export function ReviewPanel({
  review,
  checking,
  stale,
  disabled,
  error,
  onCheck,
  onSeek,
  onReference,
}: {
  review: FilmReview | null;
  checking: boolean;
  stale: boolean;
  disabled: boolean;
  error: string;
  onCheck(): void;
  onSeek(t: number): void;
  onReference(ref: Reference): void;
}) {
  const { t: tr } = usePreferences();
  return (
    <div className="body review-panel">
      <div className="panel-intro">
        <span className="eyebrow">{tr("A second look")}</span>
        <h2>{tr("Ready for the next step?")}</h2>
        <p>{tr("Check the build, sample each scene, and look for export blockers.")}</p>
      </div>
      <button className="button" disabled={disabled || checking} onClick={onCheck}>
        <RefreshCw size={14} className={checking ? 'spin' : undefined} />
        {checking ? tr("Checking scenes…") : tr("Check the film")}
      </button>
      {error && (
        <p role="alert" className="callout">
          <SystemMessage text={error} error />
        </p>
      )}
      {stale && review && <p className="note">{tr("The film has changed since this check. Run it again for the current version.")}</p>}
      {review && !stale && (
        <>
          <div className={`review-summary${review.issues.some((i) => i.severity === 'error') ? ' has-errors' : ''}`} role="status">
            {review.issues.some((i) => i.severity === 'error') ? <AlertCircle size={17} /> : <Check size={17} />}
            <div>
              <strong>
                {review.issues.some((i) => i.severity === 'error') ? tr("A few things need attention") : tr("Sampled frames draw successfully")}
              </strong>
              <p>
                {review.checkedFrames} {tr("frames checked.")} {review.issues.filter((i) => i.severity === 'warning').length} {tr("structural warnings.")}
              </p>
            </div>
          </div>
          <p className="note">{tr("Sampling does not check every frame or judge the design. Play the film before exporting.")}</p>
          <ul className="issue-list">
            {review.issues.map((issue) => (
              <li key={issue.id}>
                <span className="eyebrow">
                  {issue.severity === 'warning'
                    ? tr("Worth a look")
                    : issue.kind === 'build'
                      ? tr("Build error")
                      : issue.kind === 'export'
                        ? tr("Export blocker")
                        : tr("Drawing error")}
                </span>
                <p><SystemMessage text={issue.text} error={issue.severity === 'error'} /></p>
                <div className="issue-actions">
                  {issue.time !== undefined && (
                    <button className="quiet" onClick={() => onSeek(issue.time!)}>
                      <Crosshair size={12} />
                      {timecode(issue.time)}
                    </button>
                  )}
                  <button
                    className="quiet"
                    onClick={() =>
                      onReference({
                        kind: 'issue',
                        label: issue.severity === 'warning' ? tr("Review this layout") : tr("Fix this issue"),
                        detail: issue.text,
                        time: issue.time,
                        scene: issue.scene,
                      })
                    }
                  >
                    <MessageSquare size={12} />
                    {tr("Bring to assistant")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
