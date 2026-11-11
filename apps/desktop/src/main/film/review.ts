import type { BuildResult, FilmReview } from '../../shared/api';
import type { Stage } from './capture';

/** Checks a fixed bundle. Sampling catches rendering failures, not every possible visual defect. */
export async function reviewBuild(
  build: BuildResult | null,
  open: (version: number) => Promise<Stage>,
  signal?: AbortSignal,
): Promise<FilmReview> {
  const review: FilmReview = { version: build?.version ?? 0, checkedFrames: 0, issues: [] };
  if (!build?.ok) {
    review.issues = (build?.errors.length ? build.errors : ['The film is not ready yet.']).map((text, i) => ({
      id: `build-${i}`,
      kind: 'build',
      severity: 'error',
      text,
    }));
    return review;
  }
  let stage: Stage | undefined;
  try {
    signal?.throwIfAborted();
    stage = await open(build.version);
    const film = stage.film;
    review.film = film;
    if (!Number.isInteger(film.width) || !Number.isInteger(film.height) || film.width % 2 || film.height % 2)
      review.issues.push({
        id: 'export-size',
        kind: 'export',
        severity: 'error',
        text: 'MP4 needs even, whole-pixel width and height. Ask the agent to adjust the film size.',
      });
    for (const scene of film.scenes)
      for (const layer of scene.layers) {
        if (layer.x < 0 || layer.y < 0 || layer.x + layer.w > film.width || layer.y + layer.h > film.height)
          review.issues.push({
            id: `bounds-${scene.id}-${layer.id}`,
            kind: 'layout',
            severity: 'warning',
            text: `Layer “${layer.id}” extends beyond the frame. This may be intentional.`,
            time: scene.start + scene.duration / 2,
            scene: scene.id,
          });
      }
    const times = [...new Set([0, ...film.scenes.map((s) => s.start + s.duration / 2), Math.max(0, film.seconds - 1 / film.fps)])];
    for (const time of times) {
      signal?.throwIfAborted();
      try {
        await stage.frame(time);
        review.checkedFrames++;
      } catch (error) {
        if (signal?.aborted) throw error;
        review.issues.push({
          id: 'drawing',
          kind: 'runtime',
          severity: 'error',
          text: error instanceof Error ? error.message : String(error),
          time,
          scene: film.scenes.find((s) => time >= s.start && time < s.start + s.duration)?.id,
        });
        break;
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    review.issues.push({ id: 'preview', kind: 'runtime', severity: 'error', text: error instanceof Error ? error.message : String(error) });
  } finally {
    stage?.close();
  }
  return review;
}
