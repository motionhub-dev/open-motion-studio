# 4. A film's code runs in a sandboxed frame on its own scheme

> **Status:** Accepted · **Date:** 2026-11-10

## Context

A film is code an agent wrote, and it imports code from motions other people published. The Studio plays it beside its
own UI, which reaches the disk and the keys through the preload bridge, and photographs it for stills and export, where
the same time must draw the same frame every time. [ADR 0002](0002-the-studio-is-an-electron-desktop-app.md) planned a
`<webview>` on its own partition for this. Electron discourages `<webview>` (an extra guest process with its own
lifecycle and quirks), and a partition alone does not stop the page reaching the network.

## Decision

- **A film's page is served on `oms-preview:`**, a standard, secure scheme the main process answers: the page, the
  preview core (React, `@motionhub/runtime`, the player) and the film's bundle and assets from the open project's
  `.motion-studio/build/`, nothing else, under a policy that loads only from that scheme and connects nowhere
  (`connect-src 'none'`).
- **In the app it runs in an `<iframe sandbox="allow-scripts">`**: an opaque origin, no preload bridge, no Node, no
  navigation of the app. It talks to the Studio only by the preview bridge's messages (`src/shared/preview.ts`).
- **Stills and export open the same page in an offscreen window** on its own partition (`oms-render`), sandboxed, with no
  preload, and move it frame by frame through `window.__oms.seek`.

## Consequences

- Easier: one page for preview, stills and export, so what the person watches is what is exported; no extra process
  type; the scheme serves only the build, so a film cannot read the project's other files, let alone the disk.
- Harder: a film cannot fetch anything at play time (a font, an image, data from an API): what it shows must be in the
  project, imported, and bundled. The frame runs in the app's renderer process, so the isolation is the sandbox and the
  origin, not a process boundary; the renderer holds no key, which is what keeps that acceptable.
- Rules out: films that load remote resources, and giving a film any capability of the app.
- Supersedes ADR 0002's line on the preview; the rest of 0002 stands.
