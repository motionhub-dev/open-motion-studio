import { describe, expect, it, vi } from 'vitest';
import { StudioUpdates } from '../updates';

function release(tag_name: string, flags = {}) {
  return { ok: true, json: async () => ({ tag_name, ...flags }) };
}

describe('Studio release checks', () => {
  it.each([
    ['0.9.9', 'v0.10.0', '0.10.0'],
    ['1.0.0', 'v1.0.0', null],
    ['1.1.0', 'v1.0.9', null],
    ['1.0.0-beta.2', 'v1.0.0', '1.0.0'],
    ['1.0.0+build.1', 'v1.0.0', null],
  ])('compares installed %s with %s', async (installed, tag, available) => {
    const updates = new StudioUpdates(installed!, async () => release(tag!), vi.fn());
    await updates.check();
    expect(updates.state).toMatchObject({ available, status: 'checked' });
  });

  it('coalesces checks and dismisses only the version the person saw', async () => {
    const request = vi.fn().mockResolvedValue(release('v0.2.0'));
    const updates = new StudioUpdates('0.1.0', request, vi.fn());
    await Promise.all([updates.check(), updates.check()]);
    expect(request).toHaveBeenCalledTimes(1);
    updates.dismiss('0.2.0');
    await updates.check();
    expect(updates.state.dismissed).toBe(updates.state.available);
    request.mockResolvedValueOnce(release('v0.3.0'));
    await updates.check();
    updates.dismiss('0.2.0');
    expect(updates.state.available).toBe('0.3.0');
    expect(updates.state.dismissed).toBe('0.2.0');
  });

  it('retains a known update through a failed check and allows retry', async () => {
    const request = vi.fn().mockResolvedValue(release('v1.0.0'));
    const updates = new StudioUpdates('0.1.0', request, vi.fn());
    await updates.check();
    request.mockRejectedValueOnce(new Error('offline'));
    await updates.check();
    expect(updates.state).toMatchObject({ available: '1.0.0', status: 'error' });
    await updates.check();
    expect(updates.state.status).toBe('checked');
  });

  it.each([{ draft: true }, { prerelease: true }])('skips unpublished or prerelease builds', async flags => {
    const updates = new StudioUpdates('0.1.0', async () => release('v1.0.0', flags), vi.fn());
    await updates.check();
    expect(updates.state.available).toBeNull();
  });
});

describe('Prepared desktop updates', () => {
  it('downloads once and prepares installation only after an explicit request', async () => {
    const restart = vi.fn();
    const prepareInstall = vi.fn().mockResolvedValue(restart);
    const download = vi.fn().mockResolvedValue({ prepareInstall });
    const updates = new StudioUpdates('1.0.0', async () => release('v1.1.0'), vi.fn(), download);
    await Promise.all([updates.check(), updates.check()]);
    expect(updates.state).toMatchObject({ status: 'ready', available: '1.1.0' });
    updates.dismiss('1.1.0');
    await updates.check();
    expect(updates.state.dismissed).toBe('1.1.0');
    expect(download).toHaveBeenCalledExactlyOnceWith('1.1.0');
    expect(prepareInstall).not.toHaveBeenCalled();
    expect(await updates.prepareInstall()).toBe(restart);
    expect(updates.state.status).toBe('installing');
    await expect(updates.prepareInstall()).rejects.toThrow();
    expect(restart).not.toHaveBeenCalled();
  });

  it('retains the manual download path through failed downloads and installation preparation', async () => {
    const download = vi.fn()
      .mockRejectedValueOnce(new Error('invalid download'))
      .mockResolvedValue({ prepareInstall: () => Promise.reject(new Error('invalid installer')) });
    const updates = new StudioUpdates('1.0.0', async () => release('v1.1.0'), vi.fn(), download);
    await updates.check();
    expect(updates.state).toMatchObject({ status: 'download-error', available: '1.1.0' });
    await updates.check();
    expect(updates.state.status).toBe('ready');
    await expect(updates.prepareInstall()).rejects.toThrow('invalid installer');
    expect(updates.state).toMatchObject({ status: 'download-error', available: '1.1.0' });
    await updates.check();
    expect(updates.state.status).toBe('ready');
  });
});
