import { expect, it, vi } from 'vitest';
import { reviewBuild } from '../review';
import type { Stage } from '../capture';
const film = {
  width: 1920,
  height: 1080,
  fps: 30,
  seconds: 6,
  layers: [],
  sounds: [],
  captions: false,
  voice: null,
  narration: [],
  speech: {},
  scenes: [
    { id: 'intro', start: 0, duration: 3, layers: [], lines: [] },
    { id: 'end', start: 3, duration: 3, layers: [], lines: [] },
  ],
};
const stage = () => ({ film, frame: vi.fn().mockResolvedValue({}), close: vi.fn() }) as unknown as Stage;
it('samples each scene and closes the renderer', async () => {
  const s = stage();
  const result = await reviewBuild({ ok: true, version: 4, errors: [] }, async () => s);
  expect(result.checkedFrames).toBe(4);
  expect(result.issues).toEqual([]);
  expect(s.frame).toHaveBeenCalledWith(1.5);
  expect(s.frame).toHaveBeenCalledWith(4.5);
  expect(s.close).toHaveBeenCalledOnce();
});
it('reports the failing moment and always releases the renderer', async () => {
  const s = stage();
  vi.mocked(s.frame).mockRejectedValue(new Error('Missing picture'));
  const result = await reviewBuild({ ok: true, version: 1, errors: [] }, async () => s);
  expect(result.issues).toMatchObject([{ kind: 'runtime', time: 0, text: 'Missing picture' }]);
  expect(s.close).toHaveBeenCalledOnce();
});
it('does not try to draw a failed bundle', async () => {
  const open = vi.fn();
  const r = await reviewBuild({ ok: false, version: 2, errors: ['Syntax error'] }, open);
  expect(open).not.toHaveBeenCalled();
  expect(r.issues[0]?.text).toBe('Syntax error');
});
it('distinguishes an export blocker from an intentional overflow warning', async () => {
  const s = stage();
  s.film = { ...film, width: 1919, scenes: [{ ...film.scenes[0]!, layers: [{ id: 'bleed', x: -10, y: 0, w: 100, h: 100, z: 0 }] }] };
  const r = await reviewBuild({ ok: true, version: 1, errors: [] }, async () => s);
  expect(r.issues.map((i) => i.severity)).toEqual(['error', 'warning']);
});
