# Architecture

> **Status:** Plan — step 1 built, signing waits for certificates · **Updated:** 2026-11-10

The components of the Studio and what each owns, the engine contract, the agent and its providers, what is expensive to change, and the order of work.

The decisions behind it are [ADR 0001](../adr/0001-the-studio-is-engine-neutral.md) (three engines behind one contract),
[ADR 0002](../adr/0002-the-studio-is-an-electron-desktop-app.md) (an Electron desktop app) and
[ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md) (a built-in agent on the person's own model). What the
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
    project.ts         open / create a folder, detect its engine, watch its files (chokidar)
    engines/           the engine contract and its three adapters
      native/          bundles and plays @motionhub/runtime compositions; exports by seeking Chromium + ffmpeg
      remotion/        drives the project's own Remotion (its bundler, studio server and renderer)
      hyperframes/     drives the project's own HyperFrames CLI (preview, render)
    agent/             the loop, its tools, its sessions
    providers/         two protocols: anthropic-messages.ts, openai-chat.ts; presets; keys in the OS keychain
    motionhub.ts       search the catalogue, fetch a package, check its SHA-256, install it into a project
  src/preload/         the typed bridge the renderer calls (contextIsolation on, no Node in the renderer)
  src/renderer/        React UI
skills/                what the agent is told: the core skill, and one skill per engine
```

| Component | Owns | Never does |
| --- | --- | --- |
| `project` | The folder is the truth: files on disk, git if the person uses it. The Studio's own state for a project is `.motion-studio/` (sessions, marks' stills, export queue), which `init` adds to `.gitignore` | Keep a copy of the project elsewhere |
| `engines/*` | Turning a project into a playable preview, a still at a time, and an MP4 | Know about the agent or the UI |
| `agent` | The conversation, the tools, what the agent may do without asking | Hold a key, or call a provider except through `providers` |
| `providers` | Speaking to a model server; the key, read from the keychain at the moment of a call | Store a key in a file, or send anything to a server the person did not configure |
| `motionhub` | Reading the public catalogue and installing a motion as the engine wants it | Publish; a person's motion reaches the catalogue as a pull request to `motionhub-dev/motions` |
| renderer | Panels, selection, marks, settings | Reach the disk or network except through preload |

## The engine contract

The one interface the Studio has more than one implementation of. Each adapter is a module in `engines/<id>/` exporting:

```ts
interface Engine {
  id: 'native' | 'remotion' | 'hyperframes';
  detect(dir): Promise<boolean>;                  // package.json deps, config files
  create(dir, opts): Promise<void>;               // a new project, with the engine's own scaffold
  doctor(dir): Promise<Check[]>;                  // node, its own dependencies installed, ffmpeg, Chromium
  useMotion(dir, pack): Promise<InstallReport>;   // where its components and tokens go in this engine
  preview(dir): Promise<Preview>;                 // a URL the renderer frames, and a stop()
  still(dir, t, size?): Promise<Png>;             // what the agent looks at
  render(dir, opts, onProgress): Promise<Mp4>;    // export
  skill: string;                                  // the engine's skill file, given to the agent with the core one
}
```

- **The preview speaks one message protocol**, whatever the engine: the Studio injects a small bridge script into the
  previewed page (`seek`, `play`, `pause`, `time`, `duration`, `pick(x, y)` → the element under a point and its
  component). Remotion's player, HyperFrames' `window.__timelines` and the native clock each answer it in the adapter.
  The renderer frames the preview in a sandboxed `<webview>` on its own partition, since its code is the agent's.
- **Remotion and HyperFrames run from the project's own `node_modules`**, never from a copy bundled into the Studio. The
  Studio pins no version of either, a project upgrades on its own, and Remotion's licence is between the person and
  Remotion (the Studio says so where a Remotion project is created).
- **Native** is a composition file (`src/main.tsx`) that draws with `@motionhub/runtime` only (`useTime`, `Sequence`,
  `interpolate`, `Easing`, tokens), the way a motion's reel does. The Studio bundles it with esbuild, plays it with its own
  clock, and exports by seeking each frame in an offscreen Chromium and piping it to ffmpeg (shipped with the app). This is
  the engine the Studio owns, and so the one that is built first.
- **A motion is installed by copying**, as the motionhub format intends: its `react/parts/` into the project, its tokens
  in the engine's form (Remotion values through `@motionhub/remotion`, CSS variables and eases through
  `@motionhub/hyperframes`, `@motionhub/runtime`'s provider for native), and `MOTION.md` beside them for the agent. The
  copy is the project's: changing it does not change the catalogue's.

## The agent

A loop of our own ([ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md)): the model is called with the
conversation and the tools, tool calls are executed in `main`, their results appended, until the model ends its turn.

- **Context**: the core skill, the engine's skill, the project's motion (`MOTION.md` and its components' `meta`), the file
  tree, and what the person attached (marks, selected element, files).
- **Tools**: `read`, `write`, `edit`, `list`, `search` inside the project; `still(t)` (an image to a model that reads
  images, the measured layout in text to one that does not); `check` (the engine's type check and build); `render`;
  `motion_search`, `motion_show`, `motion_use`; `shell` for the rest (installing a package, the engine's own CLI).
- **Permissions**: reading and writing inside the project need no approval; `shell`, network outside the provider and
  anything outside the folder ask, with "always for this project" remembered in `.motion-studio/`.
- **Sessions** are JSONL in `.motion-studio/sessions/`, so a conversation reopens with its project.
- **A turn has limits**: a number of model calls and a token budget the person sets, shown as it is spent.

## Providers

Two protocols, every provider a preset over one of them:

| Protocol | Presets |
| --- | --- |
| Anthropic Messages | Anthropic, MiniMax, any compatible server |
| OpenAI Chat Completions | OpenAI, OpenRouter, DeepSeek, Gemini (its OpenAI-compatible endpoint), Ollama and LM Studio (local), any compatible server |

- A provider is `{id, protocol, baseUrl, models[]}` in the app's settings; its key lives in the OS keychain (Electron
  `safeStorage`) and nowhere else. A model records whether it reads images and whether it calls tools; one that cannot call
  tools is refused for the agent.
- The loop speaks one internal message shape; each protocol module translates to and from it, streaming included (a tool
  call's arguments stream as they come).
- Prompt caching is used where the protocol has it (Anthropic's `cache_control`, OpenRouter's pass-through).

## The UI

A dockable layout (dockview), each panel a projection of the project:

| Panel | What it does | Writes |
| --- | --- | --- |
| **Assistant** | The conversation, tool calls folded, stills the agent took shown inline, the model picker, the turn's spend | Through the agent |
| **Preview** | The engine's preview with transport; the mark tools (pick an element, drag a region) attach to the next message | Nothing |
| **Motion** | The project's motion, its components and their cards; the catalogue search and reels | Through `motion_use` |
| **Files** | The tree and a read-only CodeMirror view; open in the person's own editor | Nothing |
| **Timeline** | Read-only: the composition's sequences as the engine reports them, seekable | Nothing (v1) |
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
   preview, `still`, export to MP4. This is the whole product on one engine.
3. **Every provider**: the Chat Completions protocol, the presets, the keychain, the model picker; the same brief made on
   a Claude model, a DeepSeek model and a local model.
4. **Remotion**: the adapter, its skill, motions through `@motionhub/remotion`.
5. **HyperFrames**: the adapter, its skill, motions through `@motionhub/hyperframes`.
6. **Pointing**: marks, the pick bridge in each engine, the read-only timeline.

What gates what: 2 gates everything (the contract is written against a working engine, then implemented twice more);
3 gates nothing else and can run beside 4 and 5.

## Open questions

- **Narration**: whether text-to-speech and voices ever belong in the Studio, and through which providers. Out of the
  first version.
- **Signing**: an Apple Developer ID and a Windows code-signing certificate, whose account they are under, and their cost.
- **ffmpeg**: which build is shipped and its licence (an LGPL build keeps the app Apache-2.0 compatible).
- **Telemetry**: none is planned; crash reports, if any, opt-in.
- **Native's composition format**: whether a native composition is a single file or a scene list, decided in step 2 on
  real projects.

## How done is verified

One fixed brief, on each engine, with a motion from motionhub, made by the agent on a Claude model, a DeepSeek model and a
local model, exported to an MP4 that plays, from a packaged and signed build on macOS, Windows and Linux.
