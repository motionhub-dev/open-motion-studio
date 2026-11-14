# Architecture

> **Status:** Plan — steps 1 to 3 and 6 built, 7 under way; signing waits for certificates · **Updated:** 2026-11-13

The components of the Studio and what each owns, the film, the agent and its providers, what is expensive to change, and the order of work.

The decisions behind it are [ADR 0005](../adr/0005-the-studio-has-one-engine-its-own.md) (one engine, the Studio's own,
superseding [ADR 0001](../adr/0001-the-studio-is-engine-neutral.md)'s three),
[ADR 0002](../adr/0002-the-studio-is-an-electron-desktop-app.md) (an Electron desktop app),
[ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md) (a built-in agent on the person's own model),
[ADR 0004](../adr/0004-a-films-code-runs-in-a-sandboxed-frame-on-its-own-scheme.md) (where a film's code runs) and
[ADR 0008](../adr/0008-the-persons-own-coding-agent.md) (the person's own coding agent, as a second way in). What the
product is and is not is [positioning](../prd/positioning.md).

## Goal and non-goals

Goal: the smallest useful version in [positioning](../prd/positioning.md#the-smallest-useful-version), packaged for
macOS, Windows and Linux. Non-goals are positioning's; this plan adds one: no abstraction with a single implementation.

The current [creator workflow](creator-workflow.md) adds source checkpoints, structured references, bundled examples,
local materials and sampled export checks without changing the film format.

## Components

One Electron app. Packages are split out only when something is published on its own.

```
apps/desktop/
  src/main/            Node: the only process that touches the disk, the network and child processes
    index.ts           the window, the open project, and a handler for every StudioApi method
    project.ts         open / create a folder, whether it holds a film, the recent list
    history.ts         local checkpoints of the agent's source writes in .motion-studio/history.json, and restoring
                       one only when no file it touches was changed since (ADR 0007)
    examples.ts        the bundled starting films, each made once as an ordinary project in userData's Examples/
    assets.ts          images and fonts the person picks, copied into the project's media/ without overwriting, and
                       the list of what media/ holds
    film/
      film.ts          film.tsx: start one, bundle it with esbuild on every change; film.md is the agent's skill
      preview.ts       the oms-preview: scheme the film's page, the Studio's preview scripts, the film's bundle and
                       the project's own files are served on
      capture.ts       an offscreen window that photographs the film: stills, the timeline's scene frames, and export through ffmpeg
      remotion-export.ts  the film written as a Remotion project
      review.ts        the sampled check before an export: build errors, a size MP4 refuses, layers past the frame,
                       and a draw of the start, each scene's middle and the end
    agent/
      loop.ts          one turn: call the model, run the tools it asks for, until it ends its turn
      model.ts         a call to the model: a Messages server through the official SDK, or Chat Completions
      openai.ts        the Chat Completions translation, to and from the Messages shape
      tools.ts         what the agent may do to the project
      marks.ts         the places a person marked on the picture, as the agent receives them
      references.ts    the scenes, layers, lines, assets and issues a message refers to, checked and sent as a
                       <references> block with the build they were taken from, and where film.tsx writes each
      test-connection.ts  a provider's connection test: one call asking for a tool call, its time, never its key
    providers.ts       the providers, and their keys sealed with safeStorage
    motions.ts         the catalogue and a project's motions, through @motionhub/cli's library
  src/preview/         the Studio's preview scripts: core.tsx (React, @motionhub/runtime and the film's player)
                       and pick.ts (pointing at the picture)
  src/preload/         the typed bridge the renderer calls (contextIsolation on, no Node in the renderer)
  src/shared/          what both sides agree on: StudioApi, and the preview bridge's messages
  src/renderer/        React UI
site/                  the introduction page at studio.motionhub.dev: static HTML and screenshots of the app, no build,
                       served by a static-assets Worker (wrangler.jsonc; .github/workflows/site.yml deploys it on a push to main)
```

| Component | Owns | Never does |
| --- | --- | --- |
| `project` | The folder is the truth: files on disk, git if the person uses it. The Studio's own state for a project is `.motion-studio/` (the film's bundle in `build/`, the conversation in `session.json`, the checkpoints in `history.json`, the timeline's scene frames in `thumbs/`), which a new project's `.gitignore` leaves out | Keep a copy of the project elsewhere |
| `film/*` | Turning `film.tsx` into a playable preview, a still at a time, and an MP4 | Know about the agent or the UI |
| `agent` | The conversation, the tools, what the agent may do | Hold a key longer than a turn, or write the Studio's state, a motion from motionhub, dependencies or git |
| `providers` | The providers in `settings.json` (userData); each key sealed with `safeStorage` in `keys.json`, opened for a call | Put a key in a reply to the renderer, a log, an error or a project |
| `motions` | Reading the public catalogue and taking a motion into a project, the way `@motionhub/cli get` does | Publish; a person's motion reaches the catalogue as a pull request to `motionhub-dev/motions` |
| renderer | Panels, selection, marks, settings | Reach the disk or network except through preload (posters from motionhub.dev are the one exception) |

## The film

One engine, the Studio's own ([ADR 0005](../adr/0005-the-studio-has-one-engine-its-own.md)), in `src/main/film/`.

- **A film is `film.tsx`** at the project's root, a React component that draws by `useTime()` from `@motionhub/runtime`,
  exporting `film = {width?, height?, fps?}` (1920×1080 at 30 fps by default). A folder
  holds a film when it holds that file; one that does not is offered a starter.
- **It draws a `<Film>` of scenes** ([ADR 0006](../adr/0006-a-film-is-scenes-of-layers-and-lines.md)): `<Scene id
  duration>`s laid end to end, each holding `<Layer id x y w h z>`s (boxes of the frame, in its pixels, shown for the
  whole scene, whose content moves itself from `useTime()`, counted from the scene's start) and `<Line id>`s (what the
  scene says; nothing speaks them yet). A layer directly in `<Film>` is drawn across every scene. The scenes' durations
  are the film's length, so `film.seconds` is refused, and so is a film whose default export draws no `<Film>`. The preview core draws the film once, off the page, to learn its structure from what
  `<Film>` reports (`onFilm`), and sends it with the film (`FilmInfo.scenes`, `FilmInfo.layers`). esbuild bundles it into
  `.motion-studio/build/film.js` on every change of a file it imports, leaving React and the runtime to the preview core,
  which provides them to the bundle as `require`.
- **The preview speaks one message protocol** (`src/shared/preview.ts`): the Studio sends `play`, `pause`, `seek`,
  `play-range`, `pick(x, y, depth)` and `solo(layer)` (every other `<Layer>` hidden, for a layer played alone), the page answers `ready` (the film's length, size, frame rate and scenes), `time`, `error` and `picked`. The core
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
  seconds, faststart. A motion's reel plays as a film inside one scene. The timeline's scene frames are six small JPEGs
  a scene, evenly through it, photographed once a build has stood for a moment and kept in
  `.motion-studio/thumbs/<hash of the build>.json`, one file, replaced when the film changes.
- **A motion is taken into a project the way `@motionhub/cli get` takes it** (built, through the CLI's own library): the
  whole package, checked against the index's SHA-256, into `motions/@<scope>/<slug>/`, recorded in `motions.lock.json`.
  The copy is the project's and is never changed; a project's own motions are `motions/<name>/`. A film imports a
  motion's `tokens.json` and `react/parts/` directly and wraps itself in `<MotionScope tokens>`.

## Export

Two ways out, both from the top bar's Export: an MP4 (above), and, from the menu beside it, a **Remotion project**
(`film/remotion-export.ts`), for someone who wants to go on in Remotion or render there.

- **What is written**: into an empty folder outside the film's own, the project's files as they are (`.motion-studio/`,
  `node_modules/` and `.git/` left out), a `package.json` pinning Remotion 4, `@motionhub/remotion` and
  `@motionhub/runtime` (a project's own `package.json` keeps its dependencies), `src/index.ts`, `src/Root.tsx`, a
  `tsconfig.json` and a `README.md` unless the project has them, and `node_modules/` and `out/` in `.gitignore`.
  `film.tsx` is not changed.
- **Each scene is a `Series.Sequence`** in `src/Root.tsx`, one written on each line, holding `<FilmScene id>` around
  the film inside `@motionhub/remotion`'s `<MotionProvider>`: Remotion Studio tells sequences apart by where they are
  written, so made in a loop they would show as one row. Each scene's length comes from `film.tsx` (`sceneFrames`), and
  so does the composition's (`calculateMetadata` with `filmMetadata`); the scenes listed are the ones the film had when
  it was exported, from the build on screen, and `filmMetadata` names any the film has added, taken out or moved since.
- **Nothing is run**: the person runs npm and Remotion themselves. Remotion's licence is theirs and Remotion's; the
  README says so.

## The agent

A loop of our own ([ADR 0003](../adr/0003-a-built-in-agent-on-the-persons-own-model.md)): the model is called with the
conversation and the tools, tool calls are executed in `main`, their results appended, until the model ends its turn.

- **Context** (built): the skill (`film/film.md`: the film's format, how to draw in a motion, how to work) as the system
  prompt. The agent finds the project's files and
  motions with its tools.
- **Marks** (built): the person picks an element on the picture, drags out a region, or drags along the timeline's
  Marks lane for a stretch of time, at most five for a message (`MAX_MARKS`). A pick or a region opens a box beside it
  that asks what should change there; a pick can step out to the element around it and back in (`oms:pick`'s `depth`,
  answered with how many `levels` there are). Each mark is the moment (and a stretch's end), the box in fractions of
  the frame, the element picked, if any, and the person's note; they go with the next message (`agent/marks.ts`) as a
  `<marks>` text describing each by number, with where film.tsx writes its layer or scene, and, for a model that reads
  images, the frame at each moment photographed with its box outlined in red (`window.__omsMark` draws it on the
  render page; a stretch is shown by its middle). The conversation keeps them in the person's message; the assistant
  panel shows the person's words and each mark with its moment, its note and the frame the model saw.
- **References** (built): a scene, layer, line, asset or check issue sent with a message (`agent/references.ts`), at
  most eight. What was last selected in a panel goes with the next message unless put aside. A scene, layer or line
  carries where film.tsx writes it (`filmSpans`, by its literal id), so the agent reads those lines first.
- **Tools** (built): `list_files`, `read_file`, `write_file`, `edit_file`; `check` (builds the film and draws its start,
  the middle of each scene and its end, reporting any error, or each scene with its span, its layers' boxes and its
  lines); `still(time)` (the frame as a picture); `search_motions`, `use_motion`; `ask_person` (one question with up
  to four answers, which ends the turn: the person's answer is their next message). A tool's
  mistake goes back to the model as a failed result, never as a thrown error. Planned: `shell`, which asks first, and
  `still` as measured layout in text for a model that does not read images.
- **Permissions**: the agent reads anything in the project and writes anything but `.motion-studio/`, `motions/@*/`,
  `node_modules/` and `.git/`, without asking; nothing it has now reaches outside the project.
- **The conversation** is kept in `.motion-studio/session.json` as the protocol's own messages (thinking blocks
  included), so it reopens with its project and is sent back exactly as it was. A tool call that was cut off or stopped
  is answered as not run, so the conversation stays valid.
- **A turn ends** with the History entry of what it wrote, if anything. While nothing else has changed, that turn can
  be taken back (`undoTurn`): its files restored and the conversation cut back to before the person's message, whose
  words come back to the composer. When a turn ends while the window is not in front, a notification says so and the
  window flashes.
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

## External agents

> Under way ([ADR 0008](../adr/0008-the-persons-own-coding-agent.md)): Codex answers in the panel, works with the
> Studio's tools, and asks the person for what lies beyond its sandbox (steps 7.1 to 7.3: `harness.ts` for Codex,
> `codex.ts`, `studio-mcp.ts`, the turn's checkpoint, approval cards, the agent in the composer) and shows where it
> stands in Models, with Codex's sign-in started from there (7.5). Claude Code answers in the panel the same way,
> with the Studio's tools and a fixed set of its own (7.4).

A project's agent is the built-in one (above) or the person's own Claude Code or Codex, each driven through its own
headless protocol. Everything the person sees of the agent stays the same panel: their message with its marks and
references, the agent's words, its tool calls folded into lines, the turn's changes and its undo, its questions; what
changes is who runs the loop.

```
src/main/agent/
  claude.ts          Claude Code: `claude -p` with stream-json in and out, one process per open project, its
                     events translated into AgentEvent; it runs without the CLAUDECODE and CLAUDE_CODE_* variables a
                     Claude Code session the Studio was started from would pass on, which `claude` refuses
  codex.ts           Codex: `codex app-server`, JSON-RPC over stdio, its threads, turns, items and approvals
                     translated into AgentEvent and permission cards
  harness.ts         finding each CLI where its vendor installs it, its version against the range the Studio speaks,
                     whether it is signed in, and the one action for each state
  studio-mcp.ts      the MCP server one session reaches: check, still, search_motions, use_motion, ask_person,
                     over streamable HTTP (JSON answers, no event stream) on 127.0.0.1 at a random port behind a
                     secret path, refusing any request with an Origin, gone when the session ends
```

- **Starting**: the CLI is a child of the main process, its working folder the project, its environment the person's
  own minus anything of the Studio's (no key of a provider reaches it). Claude Code starts with `-p`, stream-json in
  and out, `--strict-mcp-config` and `--mcp-config` naming only the Studio's server, `--setting-sources ""`, the skill
  as `--append-system-prompt`, its allowed and disallowed tools, and `--session-id` or `--resume`. Codex starts
  `app-server`, and the Studio sends `initialize`, then `thread/start` or `thread/resume` with the skill as its
  instructions, its workspace sandbox and the Studio's MCP server in `-c` overrides.
- **A turn**: the Studio notes the project's writable files (as `ProjectHistory` would write them), sends the person's
  words, the `<marks>` and `<references>` text and each marked frame as an image (a user line on Claude Code's stdin,
  `turn/start` on Codex), and turns the events into the panel's: text deltas into `text`, tool calls and their results
  into `tool` and `tool-result` (a still from the Studio's MCP server keeps its picture). When the turn ends (Claude's
  `result`, Codex's `turn/completed`), every file that changed becomes the turn's checkpoint, and the turn ends with it
  as the built-in agent's does; a protected file that changed anyway is put back from the note and reported.
  `undoTurn` restores the files; the agent's memory of the turn stays, and the panel says so.
- **While it works**: a message sent during a turn goes into it (a further user line for Claude Code, which takes it
  mid-turn; for Codex, it waits for the turn as for the built-in agent). Stop interrupts (`turn/interrupt`; Claude Code's
  process is ended and resumed from its session for the next message).
- **Permissions**: Claude Code's tools are fixed at start, reading, searching, editing and writing in the project
  and the Studio's MCP tools, with edits to `.motion-studio/`, `motions/@*/`, `node_modules/` and `.git/` disallowed and
  no shell or web tool. Codex's approval requests (`item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/permissions/requestApproval`) become cards in the assistant; a file change
  whose paths are all in the project's writable files is approved without one, one into a protected path is declined.
  A card's answer (allow once, for the session, deny) goes back through `answerApproval`; Stop denies what is waiting.
  A permission is granted only as asked, for the turn or the session. Codex's ask before each MCP tool call (an
  elicitation) is granted for the Studio's own server and declined for any other. After the turn, the motions from
  motionhub (`motions/@*/`) are compared with a note taken before it, and whatever changed there is put back and said.
- **State** in `.motion-studio/agent.json`: which agent the project uses, its session or thread id, and the
  conversation as the panel showed it (the agent keeps its own record in its own form). Switching the agent starts
  the new one's conversation afresh; restoring History starts a new thread. Nothing of the person's sign-in is kept
  by the Studio anywhere: Codex says whether there is one through `account/read`.

## The UI

Built: the launcher, a top bar, and the assistant, the stage, the motion panel and the transport with the timeline as
panels whose sizes the person drags and the app keeps; the look and the layout are [the design](../design.md). The
panels, built and planned, each a projection of the project:

| Panel | What it does | Writes |
| --- | --- | --- |
| **Assistant** | The conversation, the agent's words as Markdown, each run of tool calls one line of plain words with its stills beside it (one clicked seeks to its moment and opens large), what each turn changed in the film, the agent's questions as cards, a message waiting for the turn or steering it (built); the turn's spend is planned | Through the agent |
| **Preview** | The film's preview with transport and full screen; the mark tools (pick an element, drag a region) ask what should change there and attach it to the next message, flagged on the timeline (built) | Nothing |
| **Motion** | The project's motions as poster cards; one opened shows its colours, its components with their previews and its MOTION.md (`motionDetail`); the catalogue search with Use (built). Reels are planned | Through `useMotion` |
| **Inspector** | The element last picked: its path, moment, scene and layer, box in the film's pixels, words, computed look (`PickedElement.styles`, which the agent also reads) and attributes (built) | Nothing |
| **Files** | The tree and a read-only CodeMirror view; open in the person's own editor | Nothing |
| **Timeline** | Read-only: a ruler to seek on (the moment under the pointer named with its scene), the film's scenes, each with a strip of its frames (a scene clicked seeks to its start), the marks (a drag along their lane marks a stretch), the check's issues at their moments (clicked, to the assistant) and the playhead; zoom about the pointer, a view that follows the playhead while it plays, and a chip that brings back a playhead out of view (built) | Nothing |
| **Export** | Queue, progress, open the file | Nothing |
| **Settings** | Providers and keys in two panes, with a connection test (`testProvider`: one call as the form stands, asking for a tool call, with the typed key or the stored one; the reply carries no key), and the person's own coding agents with where each stands and the one action that fixes it (built); permissions are planned | App settings |

## What is expensive to change

- **What the Studio runs**: the person's own coding agent, with the tools and permissions the Studio gives it
  (ADR 0008), is a promise to the people who connect one, and to the security of their machine.
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

7. **External agents** ([ADR 0008](../adr/0008-the-persons-own-coding-agent.md)), each slice driven end to
   end against a real signed-in agent before the next. Codex first, then Claude Code.
   1. *Codex answers*: find `codex` and check its version, start `app-server`, a thread for the project, a message's
      reply and tool calls in the panel; Stop interrupts. The agent choice in the composer, kept per project. *Built*,
      and driven in the app on a signed-in Codex 0.167.0: a title changed in `film.tsx`, its checkpoint restored from
      History, a turn stopped; the turn's checkpoint, change summary and Undo this turn came with it.
   2. *It sees the film*: the Studio's MCP server (`check`, `still`, the motions, `ask_person`), the skill as its
      instructions, marks and references in the message with their frames. *Built*, and driven on Codex 0.167.0: a
      turn that checked the film and looked at a still through the Studio's tools, the still shown in the panel.
      Codex adds a session's MCP servers to the person's own, so the session switches each of theirs off by name
      (`config/read`), with apps and plugins; it asks before each MCP tool call, which the Studio grants for its own.
   3. *Its work is recoverable*: the turn's checkpoint from the files that changed, the change summary, Undo this turn,
      protected paths declined, approval cards. *Built*, the checkpoint with 7.1; driven on Codex 0.167.0: a command
      that needed the network asked for, shown as a card, denied, and Codex told so.
   4. *Claude Code*: the same three on `claude -p` stream-json, its fixed tool set, and steering mid-turn. *Built*,
      but for steering (a message sent during a turn waits for it, as for the other agents): found in
      `~/.local/bin`, its sign-in read from `claude auth status` (signed in only with `claude auth login` in a
      terminal), one process per project with Read, Glob, Grep, Edit and Write, edits accepted, the Studio's MCP
      server allowed, and no setting sources; Stop ends the process and the next message resumes the session. Its
      events are pinned by a test against a stand-in process, and the developer drove it on a signed-in Claude Code;
      signed out, Models and the agent picker say so.
   5. *Models shows each agent's state*: not installed (the vendor's install command), not signed in (Codex's sign-in
      from the Studio, Claude Code's command), too old or too new, ready; and a failed turn says which. *Built* for
      Codex: not installed and too old link to OpenAI's own page, not signed in starts Codex's sign-in
      (`account/login/start`, its page opened in the person's browser, settled by `account/login/completed`), and Check
      again asks anew; a sign-in is remembered for a minute, a sign-out never. Driven in the app with Codex ready; the
      other states are covered by tests only, since signing the person out to see them was not wanted.

What gates what: 2 gates everything; 3 gates nothing else; 7 needs nothing after 3.

## Open questions

- **External agents** (ADR 0008), to settle in step 7's first slices:
  - which versions of `codex app-server`, still marked experimental, the Studio speaks, and how it hears that a newer
    one changed a message it relies on (its `generate-json-schema` output, checked against the Studio's in a test);
  - whether Codex's workspace sandbox keeps its commands inside the project on Windows, and what the Studio says when
    it does not;
  - how Claude Code may ask for a shell or the web through the Studio, so a headless turn can stop for the person;
  - how much of a reopened session the CLI gives back, and so whether the panel redraws a reopened conversation from
    it or keeps its own copy.

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
