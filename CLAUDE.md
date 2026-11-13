# Open Motion Studio

An open-source (Apache-2.0) desktop IDE for making motion video with an agent: a person opens a folder, picks a motion
from motionhub.dev, talks to an agent on the model and provider of their choice, watches it play, points at what to
change, and exports an MP4. A film is `film.tsx`, drawn by the Studio's one engine, `@motionhub/runtime`
([ADR 0005](docs/adr/0005-the-studio-has-one-engine-its-own.md)). Read [`docs/prd/positioning.md`](docs/prd/positioning.md) and
[`docs/tech/architecture.md`](docs/tech/architecture.md) first; the decisions are in [`docs/adr/`](docs/adr/).

## Stage: Building

**This repository is in the Building stage**: nothing has shipped and nobody depends on it. Moving to another stage is the
developer's decision and a deliberate edit to this line, never something a task concludes.

- **Compatibility is not a constraint yet.** Change a settings shape, a file under `.motion-studio/`, an IPC channel or
  the film's format freely. Do not version them, keep an old field beside a new one, or write a shim for a caller that
  does not exist.
- **Build vertical slices, not layers.** One path working end to end (open a folder → agent → preview → MP4) teaches more
  than three layers that have never met. A layer with no caller is a guess with a build step.
- **Replace a wrong design; never wrap it.** No flag beside the old path.
- **Test the decisions, not the scaffolding.** Pin what would be expensive to get wrong silently: what reaches the disk
  and where, keys, the IPC surface, the preview bridge, the provider protocol translations. Leave code about to be
  rewritten uncovered on purpose.
- **Building is licence to change the design, not to land a red branch.** The gate runs before every push.

The floor holds in every stage: never lose a person's files, never leak a key, never swallow an error.

## The smallest change that works

The goal is a repository that stays easy to read, to change and to trust; the means is keeping it small. Every file,
concept and indirection is something the next reader has to load.

- **Extend before you add.** A new file, module, package, dependency, setting or IPC channel has to earn itself against
  putting the change where the code already is.
- **Build what was asked.** No option, abstraction or generalisation with one caller today, and no interface with one
  implementation: the engine contract was deleted for that reason when the Studio kept one engine (ADR 0005).
- **Deleting is part of the change.** Code, docs and tests a change made unreachable go in the same commit.
- **Small is the means, not the goal**: never buy a smaller diff with cryptic names, skipped tests, dropped error handling
  or a known bug. When the smallest version is the wrong answer, say so and let the developer choose before writing it.

## Language

**Everything a developer reads is English**: code, identifiers, comments, docs, test names, commit messages, PR text.
Words a user reads in the app will live in message files when the app is translated; until then the UI is English.

**Reply to the developer in Chinese** in a coding session: explanations, plans, questions and the report at the end of a
task. A commit message, a doc or a comment quoted inside the reply stays English. A message written in English, or an
explicit ask for English, switches the reply.

## Commands

Use the Node version in `.nvmrc` and the pnpm version in `package.json` (`corepack enable`). `pnpm install` from the root
downloads Electron.

```bash
pnpm dev              # the desktop app with hot reload (electron-vite)
pnpm typecheck        # the gate, in CI's order: typecheck → test → build
pnpm test
pnpm build            # the preview core into resources/preview/, then main, preload and renderer into out/
pnpm package          # an installer for this platform into apps/desktop/dist/ (unsigned without signing secrets)
```

**The gate is `pnpm typecheck && pnpm test && pnpm build`**, and CI (`.github/workflows/build.yml`) runs it on macOS,
Windows and Linux before packaging. Run it before every push. Tests are Vitest and live beside the code in
`__tests__/`; a suite that needs the DOM opts in with `// @vitest-environment jsdom`.

Signing is driven by CI secrets, and a build without them is unsigned: `CSC_LINK` and `CSC_KEY_PASSWORD` (the macOS
Developer ID certificate), `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` (notarisation), and
`WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` (Windows). Each is set whole or not at all: CI refuses a certificate without its
password, a password without its certificate, or part of Apple's credentials before it packages
(`apps/desktop/scripts/check-signing.mjs`). Never commit a certificate or a key.

## Architecture rules

The shape is [`docs/tech/architecture.md`](docs/tech/architecture.md). What every change keeps true:

- **The main process is the only one that touches the disk, the network and child processes.** The renderer runs with
  `contextIsolation`, `sandbox` and no Node; it reaches the main process only through the preload bridge
  (`apps/desktop/src/preload/`), whose API type is `StudioApi` in `src/shared/api.ts`. A new capability is a new method
  there, validated in the main process: the renderer is not trusted with paths it was not given by a dialog.
- **A film's code is an agent's**: it runs only in a sandboxed frame or an offscreen window on the `oms-preview:` scheme,
  which serves nothing but the Studio's preview scripts, the film's build and the project's own files and lets it reach
  nothing beyond the scheme, and never gets the preload bridge
  ([ADR 0004](docs/adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md)). The renderer's one network
  exception is posters from motionhub.dev.
- **The folder is the truth.** The Studio's own state for a project is `.motion-studio/` inside it, ignored by git; the
  app's own state (recent projects, settings) is in Electron's `userData`. Nothing else is written.
- **A key is sealed with `safeStorage`** (the OS keychain's secret) and kept only as ciphertext in `keys.json` in
  userData, opened at the moment of a call. Never in plain text in a file, a log, an IPC reply, an error message or a
  project.
- **The Studio runs no program the person installed but the coding agent they connect**: it bundles, plays and exports
  a film itself (`src/main/film/`, with the ffmpeg it ships), and starts no npm, Node or project CLI. The one exception
  is the person's own Claude Code or Codex, driven through an ACP adapter the Studio fetches pinned by checksum, never
  from a project or PATH, and never with their credentials in its hands
  ([ADR 0008](docs/adr/0008-the-persons-own-coding-agent-through-acp.md), planned).
- **The motion format is motionhub's**, specified in `github.com/motionhub-dev/motions`; a change to it lands there
  first. A project keeps its motions as `@motionhub/cli` does (`motions/@<scope>/<slug>/` and `motions.lock.json`), and
  the Studio never changes a copy taken from the hub.

## Documentation

`docs/README.md` is the index and `docs/design.md` the visual system (colour, type, the workspace's layout; a colour is
a token in `styles.css` and nowhere else); every other document is in exactly one category, named by the question it answers: `docs/prd/`
(what is built, for whom, why), `docs/tech/` (how it is built), `docs/adr/` (`NNNN-kebab-title.md`: which decision was
taken and what it cost), `docs/ops/` (how it is released and operated). Nothing else sits at the top of `docs/`, and the
root holds `README.md`, `CLAUDE.md`, `CHANGELOG.md` and no other prose.

- Names are lowercase kebab-case English, with no date, version or status in them.
- Every document opens with its title, one status line and one sentence saying which question it answers:
  `> **Status:** Current · **Updated:** YYYY-MM-DD` (`Draft`, `Plan`, `Current`, `Superseded by [x](x.md)`, `Archived`).
  An ADR's is `> **Status:** Accepted · **Date:** YYYY-MM-DD`; once accepted only its status changes.
- Conclusion first. Git is the version history: no version line or revision table inside a document.
- **A change that makes a document wrong fixes it in the same commit** and moves its `Updated`; adding, moving or deleting
  a document updates `docs/README.md` (one line each) and every link to it.
- **A plan is a document with `Status: Plan`** in the category it changes; when its work lands it is rewritten to
  describe what was built, or deleted. Working notes, status reports and session summaries are not documents.
- **A decision gets an ADR when undoing it later would be expensive**: a file or wire format, the film's format, where
  keys live, the shape of the app or its distribution.

## The changelog

`CHANGELOG.md` records every key change, newest first: a format or setting people's machines hold, a dependency moving a
major version, a platform or distribution change, the stage, and anything a user sees. A refactor, a test or a typo does
not. Each entry is `## YYYY-MM-DD — what changed` with `- **What:**`, `- **Why:**`, `- **Breaking:**` (or `None`),
`- **Upgrade:**` (or `Nothing`) and `- **Refs:**`, written in the commit that makes the change.
