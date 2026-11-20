import { app, autoUpdater as nativeUpdater } from 'electron';
import updater from 'electron-updater';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { log } from './log';

export interface PreparedUpdate {
  prepareInstall(): Promise<() => void>;
}

const run = promisify(execFile);

async function writableImage(path: string) {
  try {
    if (!isAbsolute(path) || !(await lstat(path)).isFile()) return false;
    await access(path, constants.W_OK);
    await access(dirname(path), constants.W_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function signedMacApp() {
  try {
    await run('/usr/bin/codesign', ['--verify', '-R',
      'anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists',
      join(process.resourcesPath, '../..')]);
    return true;
  } catch {
    return false;
  }
}

function stageMacUpdate(): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      nativeUpdater.off('update-downloaded', staged);
      nativeUpdater.off('error', failed);
    };
    const staged = () => {
      cleanup();
      resolve(() => nativeUpdater.quitAndInstall());
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    nativeUpdater.once('update-downloaded', staged);
    nativeUpdater.once('error', failed);
    try { nativeUpdater.checkForUpdates(); }
    catch (error) { failed(error as Error); }
  });
}

async function replaceImage(image: string, downloadedFile: string, sha512: string) {
  if (!await writableImage(image)) throw new Error('AppImage is no longer writable');
  // Copy on the destination filesystem, then atomically replace the launcher at its existing path.
  const temporary = await mkdtemp(join(dirname(image), '.oms-update-'));
  try {
    const replacement = join(temporary, 'OpenMotionStudio.AppImage');
    await copyFile(downloadedFile, replacement, constants.COPYFILE_EXCL);
    const checksum = createHash('sha512');
    for await (const chunk of createReadStream(replacement)) checksum.update(chunk);
    if (checksum.digest('base64') !== sha512) throw new Error('AppImage checksum mismatch');
    await chmod(replacement, 0o755);
    const file = await open(replacement, 'r');
    try { await file.sync(); } finally { await file.close(); }
    await rename(replacement, image);
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
  return () => {
    app.relaunch({ execPath: image, args: process.argv.slice(1) });
    app.quit();
  };
}

export async function createUpdateDownloader() {
  if (!app.isPackaged || !['x64', 'arm64'].includes(process.arch)) return undefined;
  const image = process.platform === 'linux' ? process.env.APPIMAGE : undefined;
  const mac = process.platform === 'darwin' && await signedMacApp();
  if (!mac && (!image || !await writableImage(image))) return undefined;
  const client = updater.autoUpdater;
  client.autoDownload = false;
  client.autoInstallOnAppQuit = false;
  client.allowPrerelease = false;
  client.allowDowngrade = false;
  client.disableDifferentialDownload = true;
  client.logger = null;
  client.on('error', error => log('updates.updater-error', { code: (error as NodeJS.ErrnoException).code }));

  return async (version: string): Promise<PreparedUpdate> => {
    client.setFeedURL({
      provider: 'generic',
      url: `https://github.com/motionhubdev/openmotionstudio/releases/download/v${version}/`,
      channel: mac ? `latest-${process.arch}` : 'latest',
    });
    const result = await client.checkForUpdates();
    if (result?.updateInfo.version !== version || !result.isUpdateAvailable) throw new Error('Unexpected update version');
    const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
    const suffix = mac ? `mac-${process.arch}.zip` : `linux-${arch}.AppImage`;
    const expected = `OpenMotionStudio-${version}-${suffix}`;
    const archive = result.updateInfo.files.find(file => file.url === expected);
    if (!archive?.sha512 || result.updateInfo.files.some(file =>
      file.url !== expected && (!mac || file.url !== expected.replace(/\.zip$/, '.dmg')))) {
      throw new Error('Unexpected update artifact');
    }
    const files = await client.downloadUpdate();
    if (mac) return { prepareInstall: stageMacUpdate };
    const downloadedFile = files[0];
    if (!image || !downloadedFile) throw new Error('Missing downloaded AppImage');
    return { prepareInstall: () => replaceImage(image, downloadedFile, archive.sha512) };
  };
}
