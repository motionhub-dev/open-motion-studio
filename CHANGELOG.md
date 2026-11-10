# Changelog

Every key change to Open Motion Studio, newest first, by date. What counts as key and the entry format are in
`CLAUDE.md`, "The changelog".

## 2026-11-10 — Make a native film with an agent, a motion from motionhub, and export it

- **What:** A new project is a native film: `film.tsx`, a React component drawn by `useTime()` from `@motionhub/runtime`,
  bundled with esbuild on every change, played in a sandboxed frame on the `oms-preview:` scheme and exported to an H.264
  MP4 by photographing each frame offscreen and piping it to ffmpeg. The motion panel searches motionhub.dev and takes a
  motion into `motions/@<scope>/<slug>/` with `motions.lock.json`, as `@motionhub/cli` does. The assistant runs the
  Studio's own agent on a provider the person sets up (any server speaking the Anthropic Messages protocol; presets for
  Anthropic and MiniMax): it writes and edits the film, checks it, looks at stills and takes motions. Providers are kept
  in the app's `settings.json`, keys sealed with `safeStorage` in `keys.json`; a project's conversation in
  `.motion-studio/session.json`.
- **Why:** Step 2 of the order of work: the whole product on one engine.
- **Breaking:** None.
- **Upgrade:** Nothing. The app now ships esbuild and ffmpeg (`ffmpeg-static`, a GPL build: see the architecture's open
  questions).
- **Refs:** `docs/tech/architecture.md`, ADR 0004.

## 2026-11-10 — The desktop app opens and creates projects

- **What:** The Electron app (`apps/desktop`) opens a folder as a project, makes an empty folder a new project (its
  `.motion-studio/` state directory, added to `.gitignore`), and lists the ten most recent projects (kept in the app's
  `userData` as `recent-projects.json`). CI builds installers for macOS (DMG, zip), Windows (NSIS) and Linux (AppImage,
  tarball) on every push to `main`, tag and pull request.
- **Why:** Step 1 of the order of work: packaging and signing settled before the product is built on them.
- **Breaking:** None.
- **Upgrade:** Nothing. Signed builds need the secrets listed in `CLAUDE.md` ("Commands").
- **Refs:** `docs/tech/architecture.md` ("Order of work"), ADR 0002.
