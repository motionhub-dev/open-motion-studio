# Changelog

Every key change to Open Motion Studio, newest first, by date. What counts as key and the entry format are in
`CLAUDE.md`, "The changelog".

## 2026-11-10 — A film can be a HyperFrames project

- **What:** The home screen makes a HyperFrames project too: scaffolded with GSAP loaded from `node_modules`, installed
  with npm, previewed as its own `index.html` under HyperFrames' runtime with the Studio's bridge, written by the agent
  with a HyperFrames skill, and exported with the project's own `hyperframes render` and the Studio's ffmpeg. Taking a
  motion runs `motionhub-hyperframes`, which writes `assets/motion/`. The preview scheme now serves the project's own
  files (`/project/`) and the Studio's scripts (`/studio/`), allows inline scripts and fetches within itself, and is
  CORS-enabled, so a motion's fonts load in every engine. HyperFrames' usage telemetry is off for the commands the
  Studio runs.
- **Why:** Step 5 of the order of work: every engine in ADR 0001.
- **Breaking:** None.
- **Upgrade:** Nothing. A HyperFrames project needs Node.js and npm.
- **Refs:** `docs/tech/architecture.md` ("The engine contract"), ADR 0001, ADR 0004.

## 2026-11-10 — A film can be a Remotion project

- **What:** The home screen makes a native film or a Remotion project. A Remotion project is scaffolded (its
  compositions listed in `src/compositions.ts`, which `src/Root.tsx` registers) and installed with the person's npm; it
  previews in `@remotion/player` on the Studio's preview page, the agent writes it with a Remotion skill, and it exports
  with the project's own `remotion render`. Motions reach it through `@motionhub/remotion`. A folder holding a Remotion
  project opens as one. The engine contract is now code (`engines/engine.ts`).
- **Why:** Step 4 of the order of work: the person keeps the engine they know.
- **Breaking:** None.
- **Upgrade:** Nothing. A Remotion project needs Node.js and npm on the person's machine, and its first export downloads
  Remotion's headless Chrome.
- **Refs:** `docs/tech/architecture.md` ("The engine contract"), ADR 0001, ADR 0004.

## 2026-11-10 — The agent runs on any OpenAI Chat Completions server too

- **What:** A provider now names its protocol: Anthropic Messages or OpenAI Chat Completions. The Chat Completions
  translation keeps the agent's conversation in the Messages shape, so a project's conversation can move between
  providers. Presets for OpenRouter, OpenAI, DeepSeek, Gemini, Ollama and LM Studio join Anthropic and MiniMax; a provider
  says whether its model reads images, and a server on this computer needs no key.
- **Why:** Step 3 of the order of work: any model the person chooses.
- **Breaking:** A provider saved before this has no protocol and is treated as Messages; re-save it to set one.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/architecture.md` ("Providers"), ADR 0003.

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
