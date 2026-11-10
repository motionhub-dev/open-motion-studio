# Architecture

> **Status:** Plan — steps 1 to 5 built, and step 6's marks and HyperFrames' timeline; signing waits for certificates · **Updated:** 2026-11-10

The components of the Studio and what each owns, the engine contract, the agent and its providers, what is expensive to change, and the order of work.

The decisions behind it are [ADR 0001](../adr/0001-the-studio-is-engine-neutral.md) (three engines behind one contract),
[ADR 0002](../adr/0002-the-studio-is-an-electron-desktop-app.md) (an Electron desktop app),
[ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md) (a built-in agent on the person's own model) and
[ADR 0004](../adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md) (where a film's code runs). What the
product is and is not is [positioning](../prd/positioning.md).

## Goal and non-goals

Goal: the smallest useful version in [positioning](../prd/positioning.md#the-smallest-useful-version), on all three engines,
packaged for macOS, Windows and Linux. Non-goals are positioning's; this plan adds one: no abstraction beyond the engine
contract below. Anything one engine needs and the others do not stays inside that engine's adapter.

## Components

One Electron app. Packages are split out only when something is published on its own.

```
apps/desktop/
  src/main/            Node: the only process that touches the disk, the network and child processes
    index.ts           the window, the open project, and a handler for every StudioApi method
    project.ts         open / create a folder, detect its engine, the recent list
    engines/
      engine.ts        the engine contract, and the engines in the order a folder is matched against them
      native.ts        film.tsx: start one, bundle it with esbuild on every change; native.md is its skill
      remotion.ts      a Remotion project: scaffold and npm install, a Player preview, export by its own CLI;
                       remotion-preview.tsx.txt is the preview page's entry, remotion.md its skill
      hyperframes.ts   a HyperFrames project: scaffold and npm install, its own page with its runtime as the
                       preview, export by its own CLI; hyperframes.md is its skill
      preview.ts       the oms-preview: scheme a film's page, the Studio's preview scripts, the film's bundle and
                       the project's own files are served on
      capture.ts       an offscreen window that photographs the film: stills, and native export through ffmpeg
    agent/
      loop.ts          one turn: call the model, run the tools it asks for, until it ends its turn
      model.ts         a call to the model: a Messages server through the official SDK, or Chat Completions
      openai.ts        the Chat Completions translation, to and from the Messages shape
      tools.ts         what the agent may do to the project
      marks.ts         the places a person marked on the picture, as the agent receives them
    providers.ts       the providers, and their keys sealed with safeStorage
    motions.ts         the catalogue and a project's motions, through @motionhub/cli's library
  src/preview/         the Studio's preview scripts: core.tsx (React, @motionhub/runtime and the native player),
                       hyperframes.ts (the bridge to a HyperFrames page) and pick.ts (pointing, on every page)
  src/preload/         the typed bridge the renderer calls (contextIsolation on, no Node in the renderer)
  src/shared/          what both sides agree on: StudioApi, and the preview bridge's messages
  src/renderer/        React UI
```

| Component | Owns | Never does |
| --- | --- | --- |
| `project` | The folder is the truth: files on disk, git if the person uses it. The Studio's own state for a project is `.motion-studio/` (the film's bundle in `build/`, the conversation in `session.json`), which a new project's `.gitignore` leaves out | Keep a copy of the project elsewhere |
| `engines/*` | Turning a project into a playable preview, a still at a time, and an MP4 | Know about the agent or the UI |
| `agent` | The conversation, the tools, what the agent may do | Hold a key longer than a turn, or write the Studio's state, a motion from motionhub, dependencies or git |
| `providers` | The providers in `settings.json` (userData); each key sealed with `safeStorage` in `keys.json`, opened for a call | Put a key in a reply to the renderer, a log, an error or a project |
| `motions` | Reading the public catalogue and taking a motion into a project, the way `@motionhub/cli get` does | Publish; a person's motion reaches the catalogue as a pull request to `motionhub-dev/motions` |
| renderer | Panels, selection, marks, settings | Reach the disk or network except through preload (posters from motionhub.dev are the one exception) |

## The engine contract

The one interface the Studio has more than one implementation of (`engines/engine.ts`), written from what native and
Remotion needed:

```ts
interface Engine {
  id: 'native' | 'remotion' | 'hyperframes';
  detect(dir): boolean;                                  // hyperframes.json or the package; remotion; film.tsx
  create(dir, log): Promise<void>;                       // a new project: its scaffold and, but for native, npm install
  watch(dir, onBuilt): Promise<Bundler>;                 // the preview's bundle (or, for HyperFrames, a new version per change)
  page(dir, version): Promise<string>;                   // the preview page, a whole HTML document
  exportFilm(dir, version, file, onProgress, signal);    // an MP4
  motionTaken(dir): Promise<void>;                       // after a motion is taken (HyperFrames writes assets/motion/)
  skill: string;                                         // what the agent is told about this engine
}
```

Stills are not an engine's: every preview page answers the bridge below, and `capture.ts` photographs any of them. A
motion is taken into a project the same way for every engine (below); `motionTaken` is what follows for an engine that
turns motions into files of its own. A `doctor` comes when an engine needs more than npm and its own packages.

- **The preview speaks one message protocol**, whatever the engine (`src/shared/preview.ts`): the Studio sends `play`,
  `pause`, `seek` and `pick(x, y)`, the page answers `ready` (the film's length and size), `time`, `error` and `picked`.
  The native core, the Remotion page and the HyperFrames bridge answer the first three and set `window.__omsFrame` (the
  film's size); `studio/pick.js`, loaded on every page, answers `pick` for all of them. Every page draws its frame whole
  and centred, so a point given as fractions of the frame is found the same way on any of them: the visible element
  drawn there, described by its path among its ancestors, its words and its `data-*` attributes, and its box. The page runs in a sandboxed frame on its own
  scheme ([ADR 0004](../adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md)), which serves the
  Studio's preview scripts at `/studio/`, the film's bundle at `/build/` and the project's own files at `/project/`
  (Remotion's `staticFile()` points into `/project/public`, a HyperFrames page resolves its paths there). It allows
  inline scripts and `data:` media, which HyperFrames pages and Remotion's Player use, lets the page fetch from the
  scheme alone, and answers with `access-control-allow-origin: *`, since a sandboxed frame's origin is null and its
  fonts are CORS requests.
- **Remotion and HyperFrames run from the project's own `node_modules`**, never from a copy bundled into the Studio. The
  Studio pins no version of either, a project upgrades on its own, and Remotion's licence is between the person and
  Remotion (the Studio says so where a Remotion project is created).
- **Native** (built) is `film.tsx` at the project's root, a React component that draws by `useTime()` from
  `@motionhub/runtime`, the way a motion's reel does, exporting `film = {seconds, width?, height?, fps?}` (1920×1080 at
  30 fps by default). esbuild bundles it into `.motion-studio/build/film.js` on every change of a file it imports,
  leaving React and the runtime to the preview core, which provides them to the bundle as `require`. The Studio plays it
  on the core's own clock; a still or an export opens the page with `?render=1` in an offscreen window, moves it to each
  frame's time (`window.__oms.seek`) and photographs it, and export pipes the frames to ffmpeg (shipped with the app) as
  H.264 High at level 4.1, BT.709, a key frame every two seconds, faststart. A motion's reel plays as a film unchanged.
- **Remotion** (built) is a Remotion 4 project run from its own `node_modules`. A new one is scaffolded
  (`src/index.ts`, `src/Root.tsx`, `src/compositions.ts`, `src/Film.tsx`, Remotion, `@remotion/player` and the motionhub
  binding pinned) and installed with the person's own npm, found through a login shell's PATH since an app opened from
  the Dock has none. The project lists its compositions in `src/compositions.ts`, which `Root.tsx` registers: the Player
  needs the component itself, and that list is the one public way to reach it, where Remotion's own composition registry
  is internal and changes between versions. The preview is the first composition in `@remotion/player`, on a page whose
  entry the Studio writes into `.motion-studio/remotion/` and bundles with esbuild from the project's packages. Export is
  the project's own `remotion render`, so it exports exactly as from a terminal, sound included; its progress is read
  from what it prints. The first export downloads Remotion's headless Chrome. The Studio shows Remotion's licence where
  a Remotion project is made.
- **HyperFrames** (built) is a HyperFrames 0.9 project run from its own `node_modules`. A new one is scaffolded
  (`index.html`, `hyperframes.json`, HyperFrames, GSAP and `@motionhub/hyperframes` pinned) and installed with npm, with
  GSAP loaded from `node_modules`, never a CDN, so the preview and the export need no network. The preview is the
  project's own `index.html`, given a `<base>` into `/project/`, HyperFrames' runtime (`hyperframe.runtime.iife.js`) ahead
  of its scripts and the Studio's bridge after them, which drives the runtime's `window.__player` and scales the
  fixed-size page to the frame. There is nothing to bundle: a change to any of the project's files is a new version of
  the preview. Export is the project's own `hyperframes render`, given the Studio's ffmpeg; its progress is read from the
  `@hf-progress` lines it prints. Every command the Studio runs for HyperFrames runs with its usage telemetry off
  (`HYPERFRAMES_NO_TELEMETRY`, `DO_NOT_TRACK`).
- **A motion is taken into a project the way `@motionhub/cli get` takes it** (built, through the CLI's own library): the
  whole package, checked against the index's SHA-256, into `motions/@<scope>/<slug>/`, recorded in `motions.lock.json`.
  The copy is the project's and is never changed; a project's own motions are `motions/<name>/`. Native imports a
  motion's `tokens.json` and `react/parts/` directly and wraps the film in `<MotionScope tokens>`; Remotion goes through
  `@motionhub/remotion` (`<MotionProvider tokens>`), and HyperFrames through `@motionhub/hyperframes`, whose
  `motionhub-hyperframes` the Studio runs after a motion is taken, writing `assets/motion/` (`motion.js`, `motion.css` and
  the motions' faces as local files).

## The agent

A loop of our own ([ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md)): the model is called with the
conversation and the tools, tool calls are executed in `main`, their results appended, until the model ends its turn.

- **Context** (built): the engine's skill (`engines/native.md`, `engines/remotion.md` or `engines/hyperframes.md`: the
  film's format, how to draw in a motion, how to work) as the system prompt. The agent finds the project's files and
  motions with its tools.
- **Marks** (built): the person picks an element on the picture or drags out a region, at most five for a message
  (`MAX_MARKS`). Each mark is the moment, the box in fractions of the frame and the element picked, if any; they go with
  the next message (`agent/marks.ts`) as a `<marks>` text describing each by number and, for a model that reads images,
  the frame at each moment photographed with its box outlined in red (`window.__omsMark` draws it on the render page).
  The conversation keeps them in the person's message; the assistant panel shows only their words and how many marks
  went with them.
- **Tools** (built): `list_files`, `read_file`, `write_file`, `edit_file`; `check` (builds the film and draws its start,
  middle and end, reporting any error); `still(time)` (the frame as a picture); `search_motions`, `use_motion`. A tool's
  mistake goes back to the model as a failed result, never as a thrown error. Planned: `shell`, which asks first, and
  `still` as measured layout in text for a model that does not read images.
- **Permissions**: the agent reads anything in the project and writes anything but `.motion-studio/`, `motions/@*/`,
  `node_modules/` and `.git/`, without asking; nothing it has now reaches outside the project.
- **The conversation** is kept in `.motion-studio/session.json` as the protocol's own messages (thinking blocks
  included), so it reopens with its project and is sent back exactly as it was. A tool call that was cut off or stopped
  is answered as not run, so the conversation stays valid.
- **A turn has a limit** of 40 model calls; a token budget the person sets is not built.

## Providers

Two protocols, every provider a preset over one of them:

| Protocol | Presets |
| --- | --- |
| Anthropic Messages | Anthropic, MiniMax, any compatible server |
| OpenAI Chat Completions | OpenAI, OpenRouter, DeepSeek, Gemini (its OpenAI-compatible endpoint), Ollama and LM Studio (local), any compatible server |

- **Both protocols are built.** The conversation is kept in the Messages shape whatever the provider speaks. A Messages
  server is called through the official SDK pointed at the provider's address; Anthropic's own API also gets
  server-side refusal fallbacks, `effort: high` and automatic caching of the conversation, and every Messages server
  gets its system prompt marked for caching. A Chat Completions server is called with `fetch` at
  `<address>/chat/completions`, streamed (`agent/openai.ts`): each tool use becomes a tool call, each tool result a
  `tool` message, and a still's picture follows those as a user message of its own (a `tool` message carries text only);
  the answer's text and tool-call fragments are assembled back into a message, `finish_reason` mapped to a stop reason
  (tool calls win over a server that says `stop`), and arguments that are not JSON reach the tool, which refuses them.
  No `max_tokens` is sent, since servers' ceilings differ; a reply cut off at the server's is reported.
- A provider is `{id, name, protocol, baseUrl, model, images}` in `settings.json` in the app's userData, with the active
  one. `images` says whether the model reads pictures: without it, a still reaches the model as its caption only. The
  presets are Anthropic, OpenRouter, OpenAI, DeepSeek, Gemini (its compatible endpoint), MiniMax, Ollama and LM Studio;
  where a service renames its models often, the model is left for the person to name.
- A key is sealed with Electron's `safeStorage` (the OS keychain's secret) and kept as ciphertext in `keys.json` beside
  the settings, opened only for a call, and never sent to the renderer. A system with no keychain refuses to keep a key.
  A server on this machine (Ollama, LM Studio) is called without one.

## The UI

Built: the launcher, a top bar, and the assistant, the stage, the motion panel and the transport with the timeline as
panels whose sizes the person drags and the app keeps; the look and the layout are [the design](../design.md). The
panels, built and planned, each a projection of the project:

| Panel | What it does | Writes |
| --- | --- | --- |
| **Assistant** | The conversation, tool calls folded, stills the agent took shown inline, the model picker, the turn's spend | Through the agent |
| **Preview** | The engine's preview with transport; the mark tools (pick an element, drag a region) attach to the next message, flagged on the scrubber (built) | Nothing |
| **Motion** | The project's motion, its components and their cards; the catalogue search and reels | Through `motion_use` |
| **Files** | The tree and a read-only CodeMirror view; open in the person's own editor | Nothing |
| **Timeline** | Read-only: the film's clips as the engine reports them (`FilmInfo.clips`), a lane per track, the playhead; a clip clicked seeks to its start. Built for HyperFrames, whose runtime lists them in `window.__clipManifest` | Nothing |
| **Export** | Queue, progress, open the file | Nothing |
| **Settings** | Providers and keys, models, permissions, engine checks (`doctor`) | App settings |

## What is expensive to change

- **The engine contract and the preview bridge protocol**: three adapters implement them.
- **The project layout and `.motion-studio/`**: people's folders hold them.
- **Where a motion's files go in each engine**, since people's projects will hold motions installed that way.
- **The provider settings and the keychain entries**, which people's machines hold.

Cheap to change at any time: every panel, the layout, the skills' wording, the presets.

## Order of work

Each step is a vertical slice that runs end to end before the next begins.

1. **Shell**: the Electron app opens and creates a folder, signed builds on all three platforms from CI. Packaging is
   settled first because signing and notarisation are what most often block a desktop app late. *Built*: the app opens a
   folder, makes an empty one a project (its `.motion-studio/`, ignored by git) and keeps ten recent projects;
   `.github/workflows/build.yml` runs the gate and packages a DMG and zip, an NSIS installer, and an AppImage and tarball,
   signed and notarised once the secrets in `CLAUDE.md` are set, unsigned until then.
2. **Native, one provider**: a native project, a motion from motionhub, the agent on one Anthropic-protocol model, the
   preview, `still`, export to MP4. This is the whole product on one engine. *Built*, and driven end to end in the app:
   a motion taken from a local copy of the catalogue and its reel played as a film, a turn of the agent against a
   scripted Messages server (write, check, still, reply), a 6 s film exported in about 13 s. Not yet: a turn on a real
   model, and the first frame a motion's own faces need (they fall back to the system's).
3. **Every provider**: the Chat Completions protocol, the presets, the keychain, the model picker; the same brief made on
   a Claude model, a DeepSeek model and a local model. *Built*, and a turn driven end to end in the app against a
   scripted Chat Completions server (write, check and a still sent back as a picture). Not yet: the same brief on real
   models, which needs their keys and a local model.
4. **Remotion**: the adapter, its skill, motions through `@motionhub/remotion`. *Built*, and driven end to end in the
   app: a new project made and installed, its composition previewed, an agent turn (write, check, still), an export by
   `remotion render`, and a motionhub reel played through `@motionhub/remotion`. The export was checked with a local
   headless Chrome, since this environment cannot reach Remotion's download host.
5. **HyperFrames**: the adapter, its skill, motions through `@motionhub/hyperframes`. *Built*, and driven end to end in
   the app: a new project made and installed, played, an agent turn (write, check, still), a motion taken and turned
   into `assets/motion/`, a page drawing one of its components in its own face, and an export by `hyperframes render`.
6. **Pointing**: marks, the pick bridge in each engine, the read-only timeline. *Marks built*, and driven in the app on
   all three engines: an element picked and a region dragged out on a native film, sent with a message, the agent given
   both described and each frame outlined; an element picked on a Remotion and a HyperFrames film. *Timeline built for
   HyperFrames*: its bridge reports the runtime's clips (`window.__clipManifest`) and frame rate with the film, and the
   preview draws them under the transport. *Not built*: a timeline for native and Remotion films, whose sequences are
   inside their React and are known only by running it.

What gates what: 2 gates everything (the contract is written against a working engine, then implemented twice more);
3 gates nothing else and can run beside 4 and 5.

## Open questions

- **Narration**: whether text-to-speech and voices ever belong in the Studio, and through which providers. Out of the
  first version.
- **Signing**: an Apple Developer ID and a Windows code-signing certificate, whose account they are under, and their cost.
- **ffmpeg**: the app ships `ffmpeg-static`'s build for now, which is GPL (it holds x264). Shipping it beside an
  Apache-2.0 app is aggregation, but owes its licence and an offer of its source; an LGPL build without x264 would need
  another H.264 encoder (the platform's own, or OpenH264).
- **Keys on Linux without a keyring**: refused today. Allowing them with a fixed secret, after the person agrees, is a
  choice for the person to make, not a default.
- **Fonts**: a motion's faces (its `react/fonts/` or `CREDITS.md`) are not loaded yet in a native film, so its type
  falls back to the system's faces. In Remotion, `MotionFonts` loads them from Google Fonts in the export, but the
  preview, which connects nowhere, falls back to the system's. In HyperFrames they are local files, so both have them.
- **Existing HyperFrames projects that load GSAP from a CDN** do not play in the preview, which connects nowhere; the
  agent's skill moves GSAP to `node_modules`.
- **The agent cannot install packages**: a Remotion or HyperFrames film that needs one more package asks the person
  to run npm. A
  `shell` tool that asks first would close this.
- **Telemetry**: none is planned; crash reports, if any, opt-in.

## How done is verified

One fixed brief, on each engine, with a motion from motionhub, made by the agent on a Claude model, a DeepSeek model and a
local model, exported to an MP4 that plays, from a packaged and signed build on macOS, Windows and Linux.
