# 2. The Studio is an Electron desktop app

> **Status:** Accepted — its preview line superseded by [0004](0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md) · **Date:** 2026-11-10

## Context

The Studio has to read and write a project folder, run Node child processes (Remotion's bundler and renderer, the
HyperFrames CLI, `npm install`), drive a headless Chromium to export, run ffmpeg, keep keys safe, and call model servers
without a server of ours in between. A web app cannot do the first five; a CLI that serves a local web page (Remotion's and
HyperFrames' way) can, but is installed only by people who already use a terminal.

## Decision

- **A desktop app on Electron**, for macOS, Windows and Linux. Its main process owns the disk, the network and child
  processes; the renderer runs with context isolation and no Node, and calls the main process through a typed preload
  bridge. A project's preview runs in a sandboxed `<webview>` on its own partition.
- **Electron over Tauri**: the Studio needs Node in any case (both upstream engines are Node tools, and so is the agent's
  shell), and Electron ships one Chromium for the UI, the preview and the native export, so a frame looks the same in all
  three on every platform. Tauri would add a Node sidecar and render with each platform's own web view.
- Keys are kept in the OS keychain through Electron's `safeStorage`.
- Built with electron-vite and packaged with electron-builder; signed and notarised builds are a first step, not a last.

## Consequences

- Easier: one install for people who never open a terminal; the same Chromium everywhere; no server to run or pay for.
- Harder: a download of a hundred megabytes or more; code-signing certificates for macOS and Windows; an update channel to
  maintain; Electron's security settings to keep right, since the preview runs code an agent wrote.
- Rules out: a hosted version of the Studio on this code base without a second shell, and a pure-CLI distribution as the
  primary one.
