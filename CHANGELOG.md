# Changelog

Every key change to Open Motion Studio, newest first, by date. What counts as key and the entry format are in
`CLAUDE.md`, "The changelog".

## 2026-11-13 — A timeline to move about in, keys for the workspace, and aids for looking

- **What:** The timeline zooms about the pointer (Ctrl and the wheel, + and −, Shift+Z fits), follows the playhead
  while the film plays, brings back a playhead out of view, names the moment and scene under the pointer, and shows the
  last check's issues on its ruler, each one click from the assistant. New keys: K plays, ↑ ↓ go between scenes, Home
  and End to the ends, `[` `]` `\` show or hide the panels, G the safe-area guides; Esc does one thing at a time; the
  shortcuts dialog groups them. The outline follows the scene that plays, and a scene's layer can play alone.
- **Why:** So a longer film can be read and moved about in, and looked at closely, without the mouse.
- **Breaking:** Esc no longer puts the tool down and clears the selection at once: it does the first, then the second.
- **Upgrade:** Nothing.
- **Refs:** `docs/design.md`, `docs/tech/creator-workflow.md`, `apps/desktop/src/renderer/src/timeline.tsx`.

## 2026-11-13 — The agent's work reads as it happens, and a turn can be taken back

- **What:** Each run of the agent's tool calls reads as one line of plain words with its stills beside it, and the
  progress card warns when the same tool keeps failing. A turn's end says what it changed in the film and lights those
  scenes, layers and lines in the outline and the timeline; the last turn can be undone, files and conversation, with
  its message back in the composer. The agent can ask a question with answers to click (`ask_person`). While it works,
  a message waits for the turn or, with Ctrl+Enter, stops it; the stage says it is working, and Export waits. An error
  on the stage can go to the agent as an issue, and a turn that ends while the window is behind others notifies.
- **Why:** So the person can follow, steer and take back the agent's work without reading every tool call.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/creator-workflow.md`, `docs/tech/architecture.md` ("The agent"), `apps/desktop/src/renderer/src/activity.ts`.

## 2026-11-13 — The app has motionhub's icon and mark, and no menu bar in its window

- **What:** The window, the taskbar and the installers show motionhub's app icon instead of Electron's
  (`apps/desktop/resources/icon.png` and, for Windows, `icon.ico`, set in `electron-builder.yml` and on the window).
  The mark in the app and on the introduction page, and the page's favicon, are the brand's current ones, the mark
  in its own colour (`--mark`).
  The window has no File, Edit, View, Window menu bar on Windows and Linux; a Mac's menu bar keeps only the app's
  menu, Edit and Window.
- **Why:** The Studio was not recognisable in the taskbar, the dock or a window's title bar, and the default menu
  offered nothing the Studio's own controls do not, but reload and developer tools.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/design.md` ("Identity").

## 2026-11-13 — Marks say what should change, and point at time and source

- **What:** Picking an element or dragging a region on the picture opens a box beside it that asks what should change
  there, and a pick can step out to the element around it and back in. Dragging along the timeline's Marks lane marks
  a stretch of the film. Marks wait above the composer with their notes, lit on the picture and the timeline while in
  hand; a sent message shows each with the frame the model saw. What was last selected in the outline or timeline goes
  with the next message unless put aside, and every marked or referenced scene, layer and line tells the agent where
  film.tsx writes it.
- **Why:** Several precise changes in one message, each said where it applies, are what pointing at the film is for.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/creator-workflow.md`, `docs/tech/architecture.md` ("The agent"), `apps/desktop/src/main/agent/marks.ts`.

## 2026-11-11 — An introduction page at studio.motionhub.dev

- **What:** `site/` is the Studio's introduction: what it is, the path from a folder to an MP4, what makes it different,
  the film's format and how to get it, with screenshots of the app. A static-assets Worker serves it at
  `studio.motionhub.dev` (`site/wrangler.jsonc`), deployed by `.github/workflows/site.yml` on a push to main that
  changes it. It was first published on GitHub Pages, whose `motionhub-dev.github.io` address Chrome flags as a lookalike
  of `motionhub.dev`; that workflow is gone.
- **Why:** So the Studio has a page to point people at, under motionhub's own domain.
- **Breaking:** None.
- **Upgrade:** Add the `CLOUDFLARE_DEPLOY_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets (the account that holds
  `motionhub.dev`), then run the Site workflow; turn GitHub Pages off in Settings → Pages.
- **Refs:** `site/index.html`, `site/wrangler.jsonc`, `docs/tech/architecture.md`.

## 2026-11-11 — An exported Remotion project takes @motionhub/remotion 0.4.0

- **What:** A film exported as a Remotion project pins `@motionhub/remotion` 0.4.0 instead of 0.3.0. Its film's scenes
  play as before, and a component of a motion at `motion/0.6` can be given a composition whose props Remotion Studio
  edits (`paramsSchema`, `paramDefaults`).
- **Why:** 0.4.0 is the binding that reads a component's parameters (motionhub `motion/0.6`).
- **Breaking:** None.
- **Upgrade:** Nothing; a project exported before keeps 0.3.0 until its `package.json` is changed.
- **Refs:** `apps/desktop/src/main/film/remotion-export.ts`.

## 2026-11-10 — Model selection moves into the composer

- **What:** The active model and Models entry point now sit in the assistant composer, below the message and beside Send.
  Long model names truncate with their full model/provider name on hover; the top bar keeps project-level controls.
- **Why:** Model choice belongs to the conversation it controls.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/design.md`.

## 2026-11-10 — A more recoverable creator workspace

- **What:** Local source checkpoints and conflict-aware restore; a scene/layer/script outline connected to the preview,
  scoped scene playback, structural message references, a zoomable read-only layer timeline and focus mode. Added
  activity feedback, sampled checks and export preflight, bundled films, a prompt brief, local image/font import and
  cached Motion reels. Compile errors keep the last compiled preview with a visible notice. New dialogs contain focus.
- **Why:** Creators need to understand a film, point at precise changes and safely explore alternatives.
- **Breaking:** The internal preload API now carries references and build ids when sending a message. Numbered preview
  bundles and local checkpoint state are maintained by the app; the film format is unchanged.
- **Upgrade:** Nothing. Checkpoints start with future agent source writes; existing work is not reconstructed.
- **Refs:** `docs/tech/creator-workflow.md`, `docs/adr/0007-local-checkpoints-track-agent-source-writes.md`, `docs/design.md`.

## 2026-11-10 — Export a film as a Remotion project

- **What:** The menu beside Export writes the film as a Remotion project into an empty folder: the project's files as
  they are, and a Remotion entry whose one composition draws each scene in a `Series.Sequence` of its own, named by its
  id, so the scenes are clips on Remotion Studio's timeline. Their lengths, and the composition's, come from `film.tsx`
  (`@motionhub/remotion` 0.3.0's `sceneFrames` and `filmMetadata`, `@motionhub/runtime` 0.6.0's `<FilmScene>`); a
  scene added, taken out or moved in `film.tsx` afterwards is named in Remotion's error until `src/Root.tsx` places it.
- **Why:** So a film can go on, or be rendered, in Remotion without being rewritten.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/architecture.md` ("Export"), `apps/desktop/src/main/film/remotion-export.ts`.

## 2026-11-10 — A film is scenes of layers and lines

- **What:** A film draws a `<Film>` of `<Scene id duration>`s, each holding `<Layer id x y w h z>`s (boxes of the frame)
  and `<Line id>`s (what it says), from `@motionhub/runtime` 0.5.0; the scenes' durations are its length, so `film`
  keeps only its size and rate. A new film starts as two scenes. The timeline shows the scenes, a pick names the scene
  and layer it is in (in the Inspector and to the agent), and `check` draws each scene and outlines them. There is no
  declared animation: a layer's content moves itself. Every film draws a `<Film>`: one drawn as one component, or one
  that gives `film.seconds`, is refused with a message saying how to write it. `film.width`, `height` and `fps` are
  checked.
- **Why:** The Studio and the agent knew nothing of what a film was made of (ADR 0006).
- **Breaking:** A film written before this, one component with `film.seconds`, no longer plays; wrap it in
  `<Film><Scene id="main" duration={…}>…</Scene></Film>` and take `seconds` out of `film`, or ask the agent to.
- **Upgrade:** Nothing.
- **Refs:** `docs/adr/0006-a-film-is-scenes-of-layers-and-lines.md`, `docs/tech/architecture.md` ("The film").

## 2026-11-10 — The Studio keeps one engine, its own

- **What:** Remotion and HyperFrames projects are no longer made or opened, and the engine contract is gone: a film is
  `film.tsx` drawn by `@motionhub/runtime`, bundled, played and exported by the Studio (`src/main/film/`). The launcher
  has Open folder and New film, with no engine to choose; the top bar and recent projects show no engine; the timeline
  shows the ruler, the marks and the playhead (the clips lanes were HyperFrames'). `Project.engine` is `Project.film`,
  `createProject()` takes nothing, `onCreateProgress` and `FilmInfo.clips` are gone, and the preview page's policy no
  longer allows inline scripts.
- **Why:** The benefits of three engines were a developer's (bringing an existing project), and their cost was every
  picture feature built three times, the skill tuned three ways and two upstreams to follow (ADR 0005).
- **Breaking:** A Remotion or HyperFrames project made with an earlier build is opened as a folder with no film, and is
  offered a `film.tsx`; its own files are untouched. Open it with Remotion's or HyperFrames' own tools.
- **Upgrade:** Nothing.
- **Refs:** `docs/adr/0005-the-studio-has-one-engine-its-own.md`, `docs/prd/positioning.md`, `docs/tech/architecture.md`.

## 2026-11-10 — An inspector, keyboard shortcuts, tooltips, and a Mac window without a title bar

- **What:** The right panel has Motions and Inspector tabs; an element picked on the picture opens in the inspector
  with its path, moment, position and size in the film's pixels, words, look and attributes. A pick now reports the
  element's computed font, size, weight, colour, and background, opacity and transform where set
  (`PickedElement.styles`), and the agent reads them with the mark. ? (or the keyboard button) lists the shortcuts.
  Controls show their tips, with their keys, in one layer no panel clips. On macOS the window has no title bar: its
  buttons sit over the top bar, which moves the window.
- **Why:** P3 of the visual direction.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/design.md`, `apps/desktop/src/renderer/src/{inspector,tooltip}.tsx`, `apps/desktop/src/preview/pick.ts`.

## 2026-11-10 — The assistant reads as Markdown, motions open as pages, Models tests a connection

- **What:** The assistant draws the agent's replies as Markdown, and a still clicked seeks the film to its moment and
  opens large; the composer grows with its text. The Motions panel shows posters, and a motion opened is its page: its
  colours, its components with their previews, its MOTION.md (`motionDetail`). Models is two panes, providers and the
  selected one's form, starting a new one from a service card, with **Test connection** (`testProvider`), which makes one
  call as the form stands and says whether the model answered and called a tool.
- **Why:** P2 of the visual direction.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/design.md`, `apps/desktop/src/renderer/src/`, `apps/desktop/src/main/agent/test-connection.ts`.

## 2026-11-10 — The Studio wears motionhub's paper and ink

- **What:** A visual layer from one set of tokens, light and dark (`docs/design.md`): motionhub's colours, Inter and
  JetBrains Mono shipped with the app, Lucide icons. The launcher has a card per engine and recent projects with their
  engine and path. The workspace has a top bar (the project, its engine, whether it builds, the model, Export with its
  progress), panels whose sizes are dragged and remembered, the film on ink with the marking tools over it, a transport
  with frame steps, a mm:ss.cc clock and looping, and the timeline along the bottom with a ruler, the clips, the marks and
  the playhead. Keys: Space, ← →, C, Esc. An export ends in a toast with Show in folder (`showExported`).
- **Why:** P1 of the visual direction: the Studio looked like a prototype.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/design.md`, `apps/desktop/src/renderer/src/`.

## 2026-11-10 — A HyperFrames film has a read-only timeline

- **What:** Under the preview of a HyperFrames film, its clips as its runtime lists them, a lane per track, with the
  playhead; clicking a clip seeks to its start. The bridge reports the clips and the frame rate with the film
  (`FilmInfo.clips`). Native and Remotion films show no timeline.
- **Why:** Step 6's timeline, where an engine already knows its clips.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/architecture.md` ("The UI").

## 2026-11-10 — Point at the picture for the agent

- **What:** Two tools on the preview, Pick and Region, mark an element or a region of the picture at the moment shown,
  up to five for the next message. The marks are flagged on the scrubber and listed above the message box. The agent
  receives each described (its moment, its box, the element's path, words and `data-*` attributes) and, where the model
  reads images, the frame at that moment with the mark outlined in red. One script on every preview page
  (`studio/pick.js`) answers for all three engines. `sendMessage` takes the marks.
- **Why:** Step 6 of the order of work: a person who cannot say which thing is wrong points at it.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/architecture.md` ("The agent", "The engine contract").

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
