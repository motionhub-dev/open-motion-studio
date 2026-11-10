# Architecture

> **Status:** Plan — steps 1 to 3 and 6 built; signing waits for certificates · **Updated:** 2026-11-10

The components of the Studio and what each owns, the film, the agent and its providers, what is expensive to change, and the order of work.

The decisions behind it are [ADR 0005](../adr/0005-the-studio-has-one-engine-its-own.md) (one engine, the Studio's own,
superseding [ADR 0001](../adr/0001-the-studio-is-engine-neutral.md)'s three),
[ADR 0002](../adr/0002-the-studio-is-an-electron-desktop-app.md) (an Electron desktop app),
[ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md) (a built-in agent on the person's own model) and
[ADR 0004](../adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md) (where a film's code runs). What the
product is and is not is [positioning](../prd/positioning.md).

## Goal and non-goals

Goal: the smallest useful version in [positioning](../prd/positioning.md#the-smallest-useful-version), packaged for
macOS, Windows and Linux. Non-goals are positioning's; this plan adds one: no abstraction with a single implementation.

## Components

One Electron app. Packages are split out only when something is published on its own.

```
apps/desktop/
  src/main/            Node: the only process that touches the disk, the network and child processes
    index.ts           the window, the open project, and a handler for every StudioApi method
    project.ts         open / create a folder, whether it holds a film, the recent list
    film/
      film.ts          film.tsx: start one, bundle it with esbuild on every change; film.md is the agent's skill
      preview.ts       the oms-preview: scheme the film's page, the Studio's preview scripts, the film's bundle and
                       the project's own files are served on
      capture.ts       an offscreen window that photographs the film: stills, and export through ffmpeg
    agent/
      loop.ts          one turn: call the model, run the tools it asks for, until it ends its turn
      model.ts         a call to the model: a Messages server through the official SDK, or Chat Completions
      openai.ts        the Chat Completions translation, to and from the Messages shape
      tools.ts         what the agent may do to the project
      marks.ts         the places a person marked on the picture, as the agent receives them
    providers.ts       the providers, and their keys sealed with safeStorage
    motions.ts         the catalogue and a project's motions, through @motionhub/cli's library
  src/preview/         the Studio's preview scripts: core.tsx (React, @motionhub/runtime and the film's player)
                       and pick.ts (pointing at the picture)
  src/preload/         the typed bridge the renderer calls (contextIsolation on, no Node in the renderer)
  src/shared/          what both sides agree on: StudioApi, and the preview bridge's messages
  src/renderer/        React UI
```

| Component | Owns | Never does |
| --- | --- | --- |
| `project` | The folder is the truth: files on disk, git if the person uses it. The Studio's own state for a project is `.motion-studio/` (the film's bundle in `build/`, the conversation in `session.json`), which a new project's `.gitignore` leaves out | Keep a copy of the project elsewhere |
| `film/*` | Turning `film.tsx` into a playable preview, a still at a time, and an MP4 | Know about the agent or the UI |
| `agent` | The conversation, the tools, what the agent may do | Hold a key longer than a turn, or write the Studio's state, a motion from motionhub, dependencies or git |
| `providers` | The providers in `settings.json` (userData); each key sealed with `safeStorage` in `keys.json`, opened for a call | Put a key in a reply to the renderer, a log, an error or a project |
| `motions` | Reading the public catalogue and taking a motion into a project, the way `@motionhub/cli get` does | Publish; a person's motion reaches the catalogue as a pull request to `motionhub-dev/motions` |
| renderer | Panels, selection, marks, settings | Reach the disk or network except through preload (posters from motionhub.dev are the one exception) |

## The film

One engine, the Studio's own ([ADR 0005](../adr/0005-the-studio-has-one-engine-its-own.md)), in `src/main/film/`.

- **A film is `film.tsx`** at the project's root, a React component that draws by `useTime()` from `@motionhub/runtime`,
  the way a motion's reel does, exporting `film = {width?, height?, fps?}` (1920×1080 at 30 fps by default). A folder
  holds a film when it holds that file; one that does not is offered a starter.
- **It draws a `<Film>` of scenes** ([ADR 0006](../adr/0006-a-film-is-scenes-of-layers-and-lines.md)): `<Scene id
  duration>`s laid end to end, each holding `<Layer id x y w h z>`s (boxes of the frame, in its pixels, shown for the
  whole scene, whose content moves itself from `useTime()`, counted from the scene's start) and `<Line id>`s (what the
  scene says; nothing speaks them yet). A layer directly in `<Film>` is drawn across every scene. The scenes' durations
  are the film's length, so a `<Film>` with `film.seconds` too is refused; a film drawn as one component, as a reel is,
  gives `film.seconds` instead. The preview core draws the film once, off the page, to learn its structure from what
  `<Film>` reports (`onFilm`), and sends it with the film (`FilmInfo.scenes`, `FilmInfo.layers`). esbuild bundles it into
  `.motion-studio/build/film.js` on every change of a file it imports, leaving React and the runtime to the preview core,
  which provides them to the bundle as `require`.
- **The preview speaks one message protocol** (`src/shared/preview.ts`): the Studio sends `play`, `pause`, `seek` and
  `pick(x, y)`, the page answers `ready` (the film's length, size, frame rate and scenes), `time`, `error` and `picked`. The core
  answers the first three and sets `window.__omsFrame` (the film's size); `studio/pick.js` answers `pick` with the
  visible element drawn there, described by its path among its ancestors, its words, its `data-*` attributes, its
  computed look and the scene and layer it is drawn in, and its box. The page draws its frame whole and centred, so a point given as fractions of the frame is
  found the same way in the preview and in a render.
- **The page runs in a sandboxed frame on its own scheme**
  ([ADR 0004](../adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md)), which serves the Studio's preview
  scripts at `/studio/`, the film's bundle and its assets at `/build/` and the project's own files at `/project/`. Its
  policy allows scripts from the scheme alone (none inline), inline styles and `data:` media, lets the page fetch from the
  scheme alone, and answers with `access-control-allow-origin: *`, since a sandboxed frame's origin is null and its fonts
  are CORS requests.
- **Playing, stills and export**: the Studio plays the film on the core's own clock; a still or an export opens the page
  with `?render=1` in an offscreen window, moves it to each frame's time (`window.__oms.seek`) and photographs it, and
  export pipes the frames to ffmpeg (shipped with the app) as H.264 High at level 4.1, BT.709, a key frame every two
  seconds, faststart. A motion's reel plays as a film unchanged.
- **A motion is taken into a project the way `@motionhub/cli get` takes it** (built, through the CLI's own library): the
  whole package, checked against the index's SHA-256, into `motions/@<scope>/<slug>/`, recorded in `motions.lock.json`.
  The copy is the project's and is never changed; a project's own motions are `motions/<name>/`. A film imports a
  motion's `tokens.json` and `react/parts/` directly and wraps itself in `<MotionScope tokens>`.

## The agent

A loop of our own ([ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md)): the model is called with the
conversation and the tools, tool calls are executed in `main`, their results appended, until the model ends its turn.

- **Context** (built): the skill (`film/film.md`: the film's format, how to draw in a motion, how to work) as the system
  prompt. The agent finds the project's files and
  motions with its tools.
- **Marks** (built): the person picks an element on the picture or drags out a region, at most five for a message
  (`MAX_MARKS`). Each mark is the moment, the box in fractions of the frame and the element picked, if any; they go with
  the next message (`agent/marks.ts`) as a `<marks>` text describing each by number and, for a model that reads images,
  the frame at each moment photographed with its box outlined in red (`window.__omsMark` draws it on the render page).
  The conversation keeps them in the person's message; the assistant panel shows only their words and how many marks
  went with them.
- **Tools** (built): `list_files`, `read_file`, `write_file`, `edit_file`; `check` (builds the film and draws its start,
  the middle of each scene and its end, reporting any error, or each scene with its span, its layers' boxes and its
  lines); `still(time)` (the frame as a picture); `search_motions`, `use_motion`. A tool's
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
  the settings, opened only for a call, and never sent to the renderer. On Linux without a keyring Electron seals with a
  fixed secret, and Models says so.
  A server on this machine (Ollama, LM Studio) is called without one.

## The UI

Built: the launcher, a top bar, and the assistant, the stage, the motion panel and the transport with the timeline as
panels whose sizes the person drags and the app keeps; the look and the layout are [the design](../design.md). The
panels, built and planned, each a projection of the project:

| Panel | What it does | Writes |
| --- | --- | --- |
| **Assistant** | The conversation, the agent's words as Markdown, tool calls folded, stills the agent took inline (one clicked seeks to its moment and opens large); the turn's spend is planned | Through the agent |
| **Preview** | The film's preview with transport; the mark tools (pick an element, drag a region) attach to the next message, flagged on the scrubber (built) | Nothing |
| **Motion** | The project's motions as poster cards; one opened shows its colours, its components with their previews and its MOTION.md (`motionDetail`); the catalogue search with Use (built). Reels are planned | Through `useMotion` |
| **Inspector** | The element last picked: its path, moment, scene and layer, box in the film's pixels, words, computed look (`PickedElement.styles`, which the agent also reads) and attributes (built) | Nothing |
| **Files** | The tree and a read-only CodeMirror view; open in the person's own editor | Nothing |
| **Timeline** | Read-only: a ruler to seek on, the film's scenes (a scene clicked seeks to its start; its lines on hover), the marks and the playhead (built) | Nothing |
| **Export** | Queue, progress, open the file | Nothing |
| **Settings** | Providers and keys in two panes, with a connection test (`testProvider`: one call as the form stands, asking for a tool call, with the typed key or the stored one; the reply carries no key) (built); permissions are planned | App settings |

## What is expensive to change

- **The film's format** (`film.tsx` and its `film` export) and **the project layout and `.motion-studio/`**: people's
  folders hold them.
- **Where a motion's files go**, since people's projects will hold motions installed that way.
- **The provider settings and the keychain entries**, which people's machines hold.

Cheap to change at any time: every panel, the layout, the skills' wording, the presets.

## Order of work

Each step is a vertical slice that runs end to end before the next begins.

1. **Shell**: the Electron app opens and creates a folder, signed builds on all three platforms from CI. Packaging is
   settled first because signing and notarisation are what most often block a desktop app late. *Built*: the app opens a
   folder, makes an empty one a project (its `.motion-studio/`, ignored by git) and keeps ten recent projects;
   `.github/workflows/build.yml` runs the gate and packages a DMG and zip, an NSIS installer, and an AppImage and tarball,
   signed and notarised once the secrets in `CLAUDE.md` are set, unsigned until then.
2. **A film, one provider**: a film, a motion from motionhub, the agent on one Anthropic-protocol model, the preview,
   `still`, export to MP4. This is the whole product. *Built*, and driven end to end in the app:
   a motion taken from a local copy of the catalogue and its reel played as a film, a turn of the agent against a
   scripted Messages server (write, check, still, reply), a 6 s film exported in about 13 s. Not yet: a turn on a real
   model, and the first frame a motion's own faces need (they fall back to the system's).
3. **Every provider**: the Chat Completions protocol, the presets, the keychain, the model picker; the same brief made on
   a Claude model, a DeepSeek model and a local model. *Built*, and a turn driven end to end in the app against a
   scripted Chat Completions server (write, check and a still sent back as a picture). Not yet: the same brief on real
   models, which needs their keys and a local model.
4. **Remotion** and 5. **HyperFrames**: built as adapters behind an engine contract, driven end to end, then removed
   with the contract ([ADR 0005](../adr/0005-the-studio-has-one-engine-its-own.md)). The git history keeps them.
6. **Pointing**: marks, the pick bridge, the read-only timeline. *Marks built*, and driven in the app: an element picked
   and a region dragged out, sent with a message, the agent given both described and each frame outlined. *Timeline
   built*: a ruler, the film's scenes, the marks and the playhead.

What gates what: 2 gates everything; 3 gates nothing else.

## Open questions

- **Narration**: whether text-to-speech and voices ever belong in the Studio, and through which providers. Out of the
  first version.
- **Signing**: an Apple Developer ID and a Windows code-signing certificate, whose account they are under, and their cost.
- **ffmpeg**: the app ships `ffmpeg-static`'s build for now, which is GPL (it holds x264). Shipping it beside an
  Apache-2.0 app is aggregation, but owes its licence and an offer of its source; an LGPL build without x264 would need
  another H.264 encoder (the platform's own, or OpenH264).
- **Keys on Linux without a keyring**: kept today with Electron's fixed secret, which Models warns of. Whether to ask the
  person first, or refuse, is still open.
- **Fonts**: a motion's faces (its `react/fonts/` or `CREDITS.md`) are not loaded yet in a film, so its type falls back
  to the system's faces.
- **Telemetry**: none is planned; crash reports, if any, opt-in.

## How done is verified

One fixed brief, with a motion from motionhub, made by the agent on a Claude model, a DeepSeek model and a
local model, exported to an MP4 that plays, from a packaged and signed build on macOS, Windows and Linux.
