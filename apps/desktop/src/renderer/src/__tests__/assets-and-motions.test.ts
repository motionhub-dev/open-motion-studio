import { describe, expect, it } from 'vitest';
import type { DragEvent } from 'react';
import { assetReference, droppedAsset } from '../assets-panel';
import { applyRequest } from '../motion-panel';

/** A drop carrying `data` as the panel's asset type. */
const drop = (data: string) => ({ dataTransfer: { getData: () => data, types: ['application/x-oms-asset'] } }) as unknown as DragEvent;

describe('an asset dragged from the panel', () => {
  it('is taken only as a project file under media/ of a kind the panel lists', () => {
    const logo = { path: 'media/logo.png', name: 'logo.png', kind: 'image' };
    expect(droppedAsset(drop(JSON.stringify({ ...logo, extra: 1 })))).toEqual(logo);
    for (const bad of [
      { ...logo, path: '../secret.png' },
      { ...logo, path: 'media/../film.tsx' },
      { ...logo, path: 'film.tsx' },
      { ...logo, kind: 'video' },
      { ...logo, name: 3 },
    ])
      expect(droppedAsset(drop(JSON.stringify(bad)))).toBeNull();
    expect(droppedAsset(drop('not json'))).toBeNull();
  });

  it('goes with the message as the same reference the panel makes', () => {
    expect(assetReference({ path: 'media/bed.mp3', name: 'bed.mp3', kind: 'audio' })).toEqual({
      kind: 'asset',
      label: 'bed.mp3',
      path: 'media/bed.mp3',
      detail: 'Use this local audio: media/bed.mp3',
    });
  });
});

it('asks the agent to restyle the film with a motion from its folder, keeping what it says and when', () => {
  const text = applyRequest({ id: '@someone/paper-cut', name: 'Paper Cut' });
  expect(text).toContain('Apply the motion @someone/paper-cut ("Paper Cut")');
  expect(text).toContain('motions/@someone/paper-cut/');
  expect(text).toContain("Keep the film's words, scenes, order and timing.");
});
