# Changelog

Every key change to Open Motion Studio, newest first, by date. What counts as key and the entry format are in
`CLAUDE.md`, "The changelog".

## 2026-11-14 — A Remotion project exported from the Studio speaks the film's narration

- **What:** The Remotion export writes `@motionhub/remotion` 0.6 and `@motionhub/runtime` 0.8, gives a narrated film's
  speech to the binding as `src/voice.json`, and copies its clips into `public/voice/`; Remotion times the lines, plays
  the narration and ducks the sounds under it as the Studio's own export does.
- **Why:** A narrated film exported to Remotion lost its voice and its lines' timing.
- **Breaking:** None.
- **Upgrade:** Nothing; a project exported before keeps its versions.
- **Refs:** `apps/desktop/src/main/film/remotion-export.ts`, motionhub-dev/motionhub#109.

## 2026-11-14 — A film's lines are spoken in a voice the person chooses

- **What:** Models has Voices: Azure, ElevenLabs, MiniMax and OpenAI, each with how to get its key, its voices and a
  sentence to hear; there is no default voice. A film names its voice (`<Film voice="azure:zh-CN-XiaoxiaoNeural">`,
  `@motionhub/runtime` 0.8.0), and Voice in the top bar, or the agent's `voice_lines`, speaks its lines into the
  project's `voice/`, only those whose words changed. A voiced line lasts as long as its speech; the preview plays the
  narration, the export mixes it, and a `<Sound duck>` sinks under it; `captions="words"` lights each word as it is
  said. The agent lists voices with `list_voices`, and `check` names lines not yet spoken and speech cut short.
- **Why:** A film's script had no voice, and its captions no timing from speech.
- **Breaking:** None.
- **Upgrade:** Nothing; `@motionhub/runtime` moves from 0.7.0 to 0.8.0. A voice provider's key is sealed in
  `keys.json` like a model's.
- **Refs:** ADR 0011, ADR 0012, `docs/tech/sound-and-captions.md`, `apps/desktop/src/main/voice.ts`,
  `apps/desktop/src/main/narration.ts`, `apps/desktop/src/renderer/src/voice-dialog.tsx`.

## 2026-11-14 — A Remotion project exported from the Studio plays the film's sounds

- **What:** The Remotion export writes `@motionhub/remotion` 0.5 and `@motionhub/runtime` 0.7, plays the film's sounds
  with `<FilmAudio>` in `src/Root.tsx`, and copies each sound file into the project's `public/`. A film with `<Sound>`
  rendered by Remotion now carries them; before, it did not render there.
- **Why:** The Studio's films gained sounds, and an exported project should play what the film does.
- **Breaking:** None.
- **Upgrade:** Nothing; a project exported before keeps its versions.
- **Refs:** `apps/desktop/src/main/film/remotion-export.ts`, motionhub-dev/motionhub#107.

## 2026-11-14 — A film's lines are timed, shown as captions and exported as subtitles

- **What:** A `<Line>` can say when it is said (`at`, `dur`); lines that do not share their scene evenly.
  `<Film captions>` shows the line being said at the foot of the picture, in the preview and the export alike. Every
  MP4 export carries the lines as a subtitle track and writes them beside it as an `.srt` file. The timeline shows the
  lines on a Lines row.
- **Why:** A film's script had no timing and could not be read with the sound off.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/tech/sound-and-captions.md`, `apps/desktop/src/main/film/captions.ts`, `apps/desktop/src/renderer/src/timeline.tsx`.

## 2026-11-14 — A film plays music and sound effects, and exports with sound

- **What:** A film's `<Sound>` elements (`@motionhub/runtime` 0.7.0; ADR 0010) play in the preview, in step with the
  picture, and are mixed into the exported MP4 as AAC; a film with none exports picture only, as before. Assets take
  MP3, WAV, M4A and OGG files and play them; the timeline shows each sound on a Sound row with its waveform; the stage
  bar turns the preview's sound off; the export dialog says what is mixed; the agent learns `<Sound>`, and its `check`
  lists the sounds and fails on a missing file. Each file's waveform is kept in `.motion-studio/peaks/`.
- **Why:** A film had no way to carry sound.
- **Breaking:** None.
- **Upgrade:** Nothing; `@motionhub/runtime` moves from 0.5.0 to 0.7.0.
- **Refs:** ADR 0010, `docs/tech/sound-and-captions.md`, `apps/desktop/src/main/film/mix.ts`, `apps/desktop/src/preview/sound.ts`.

## 2026-11-14 — Questions take the composer's place, failures say what to do, a new start

- **What:** A question the agent asks with answers now stands where the composer was, the conversation dimmed behind
  it, with its recommended answer marked and "Something else…" back to the box; answered, it stays as a dashed card
  with the answer. A failed turn is a card that offers what to do: Open Models (or Sign in, or Change the cap), Use
  another agent, and Try again with the message that is back in the box. An empty conversation offers four ways to
  start, the brief among them, and how to point at the picture.
- **Why:** A question was easy to miss in the conversation, a failure left the person to work out the next step, and
  the empty conversation said little.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/assistant.tsx`, `apps/desktop/src/main/agent/claude.ts`,
  `apps/desktop/src/shared/api.ts`, `docs/design.md`, `docs/tech/assistant-panel.md`.

## 2026-11-14 — Point at anything with @, import with +, one tray for the next message

- **What:** Typing @ in the composer (or its @ button) opens a picker over the film's scenes, layers and lines and the
  project's assets and motions, narrowed as you type; a pick joins the next message. + imports images or fonts into
  the project and adds them too. References and marks now sit in one tray over the composer with their count, and
  Send reads "Send 3". A motion in the project can be a reference.
- **Why:** Pointing the agent at a part of the film or the project took a trip to another panel.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/reference-picker.tsx`, `apps/desktop/src/renderer/src/assistant.tsx`,
  `apps/desktop/src/main/agent/references.ts`, `docs/design.md`.

## 2026-11-14 — Choose your coding agent's model and effort; the agent sits at the assistant's top

- **What:** Claude Code's model (an alias or a full name), effort, fallback model and cap per turn, and Codex's model
  (from its own list) and effort, are set in Models under Your coding agents and kept in the app's `settings.json`
  (`agents`). The project's agent is now a chip at the top of the assistant, with a dot for whether it can take a
  message; its menu changes the agent and, for Claude Code or Codex, its model and effort. The composer's picker is
  gone, and New conversation is an icon. A Claude Code turn stopped at its cap says so, and counts its tokens.
- **Why:** The person picks how their own agent runs, as they would in its own app, and sees which agent and model a
  project talks to before sending.
- **Breaking:** None.
- **Upgrade:** Nothing; unset settings leave each agent on its own defaults.
- **Refs:** `apps/desktop/src/main/providers.ts`, `apps/desktop/src/main/agent/claude.ts`,
  `apps/desktop/src/main/agent/codex.ts`, `apps/desktop/src/renderer/src/assistant.tsx`, `docs/tech/architecture.md`.

## 2026-11-14 — A turn reads as one block and ends with its outcome

- **What:** A turn's tool calls are one framed block ("How it got there · read 2 files · edited 1 file · checked
  twice"), open while it runs and folded after, with what the agent said between calls inside it and its answer
  under it; files are named in the project, never by their whole path. The turn's card says how it ended (Done,
  Stopped, Failed), its time and tokens, the files it changed, its last check, the film's new length and what changed,
  with Go back to before this and Copy. The last three turns are drawn whole, earlier ones behind "Show N earlier
  turns". While a turn runs, its phases show as a row of steps, and Send is a red Stop. A long answer no longer clips
  in a full conversation.
- **Why:** The work split a turn into many lines and buried its answer, outside agents' paths named the person's
  folders, and the end said little of what the turn did.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/assistant.tsx`, `apps/desktop/src/renderer/src/activity.ts`, `docs/design.md`.

## 2026-11-14 — Every turn says its tokens and time, and is logged

- **What:** Each turn of every agent ends with its time and tokens (input, cached, cache written, output, reasoning,
  model calls), shown on the turn's card ("Worked for 1m 12s · 18.4k tokens", the parts on hover), with the project's
  total beside the assistant's title. Each turn is also appended as one JSON line to the project's
  `.motion-studio/usage.jsonl` (ADR 0009), with Claude Code's reported cost there, never shown. Chat Completions
  providers' cached prompt and reasoning tokens are now read too.
- **Why:** To track and tune the agents' turns, and so the person sees what a turn took.
- **Breaking:** None.
- **Upgrade:** Nothing; a project's log starts with its next turn, and git already leaves `.motion-studio/` out.
- **Refs:** ADR 0009, `apps/desktop/src/main/usage.ts`, `docs/tech/assistant-panel.md`.

## 2026-11-14 — The outline follows the playhead and shows the film

- **What:** The outline is one row a scene (a frame of it, its first line, number, start and length) on a rail that
  marks the scenes played, the one playing and how far into it the playhead is. The scene playing opens and the one
  left closes, unless the person folded it; Collapse all / Expand all sits at the top, the film's own layers in a group
  of their own. Layers are listed by name, topmost first; a scene's first line is its title and no longer repeated, and
  the "Script · read only" and size labels are gone. A layer hovered in the outline or on the timeline is lit in both
  and drawn on the picture.
- **Why:** The outline listed each title twice and every layer's size, showed no picture, and barely said where the
  playhead was.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/outline.tsx`, `docs/design.md`.

## 2026-11-14 — Words sent to Claude Code while it works go into its turn

- **What:** On a project that talks to the person's own Claude Code, Enter during a turn sends the words into that
  turn at once, shown where they were sent, instead of keeping them for the turn's end; Ctrl+Enter still stops the turn
  and sends. A message with marks or references, and every message to Codex or the built-in agent, still waits. The
  Studio starts Claude Code with `--replay-user-messages`, to tell a message taken into the turn from one Claude Code
  runs after it.
- **Why:** Claude Code takes a message mid-turn, so a correction reaches it before it goes further the wrong way.
- **Breaking:** None.
- **Upgrade:** Nothing; a running Claude Code session gets the new flag when it is next started.
- **Refs:** `apps/desktop/src/main/agent/claude.ts`, `docs/tech/architecture.md`, ADR 0008.

## 2026-11-14 — A film is set in its motions' own faces

- **What:** The faces a motion carries (`react/fonts/fonts.json` and its WOFF2 files) are loaded in the preview before
  the film draws, and a still or an export waits for them, so type set with a motion's `var(--font-<name>)` is in that
  face rather than the system's. Each build writes them as `.motion-studio/build/fonts.css`; an entry that is not a
  WOFF2 beside its list is left out and logged. The agent is told the faces are there.
- **Why:** Every film made in a motion with its own type fell back to the system's faces.
- **Breaking:** None.
- **Upgrade:** Nothing; the next build of a project writes its faces.
- **Refs:** `apps/desktop/src/main/motions.ts`, `apps/desktop/src/preview/core.tsx`, `docs/tech/architecture.md`.

## 2026-11-13 — Each scene on the timeline shows its frames, and the stage goes full screen

- **What:** A scene's block on the timeline is its title over a strip of its frames. They are photographed once a
  build has stood for a moment and kept in the project's `.motion-studio/thumbs/`, one file named by the build's hash,
  replaced when the film changes. The stage's controls end with full screen, which Esc leaves.
- **Why:** A film's shape reads at a glance from its pictures, not from scene names; and a film is judged at its size.
- **Breaking:** None.
- **Upgrade:** Nothing. A project gains `.motion-studio/thumbs/`, which git already leaves out with the rest of
  `.motion-studio/`.
- **Refs:** `apps/desktop/src/main/film/capture.ts`, `apps/desktop/src/renderer/src/timeline.tsx`, `docs/tech/architecture.md`.

## 2026-11-13 — The timeline shows what is selected and what changed

- **What:** A selected scene has a heavier cobalt ring, and the scene of a selected layer a thin one; a selected layer
  span is solid cobalt on a cobalt tint, and a span the last turn changed is tinted green as well as ringed. The empty
  Marks lane says that dragging along it marks a stretch.
- **Why:** Selection and change were faint on the timeline, and marking a stretch was found only by trying.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/timeline.tsx`, `docs/design.md`.

## 2026-11-13 — A turn says how long it took, and the agent's steps step back

- **What:** The card where a turn ends opens with how long it took (`Worked for 1m 12s`). The line for a run of the
  agent's tool calls is a size smaller than its words.
- **Why:** The agent's answer is what a person reads; its steps are there to open when wanted.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/assistant.tsx`, `apps/desktop/src/renderer/src/activity.ts`.

## 2026-11-13 — What is typed while a project opens is kept

- **What:** The assistant is no longer drawn again once the project's agent is found, a few seconds after the project
  opens; only a switch of agent starts it afresh.
- **Why:** Words typed into the composer in those first seconds, and stills opened, were dropped.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-13 — The stills an agent looked at take one row

- **What:** The stills under a run of the agent's tools are one row of four small thumbnails; past four, the row shows
  three and a count of the rest, which opens them all.
- **Why:** A turn that checked many frames filled the assistant with pictures and pushed its answer out of view.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/assistant.tsx`, `docs/design.md`.

## 2026-11-13 — The workspace gives the film and the timeline the room

- **What:** The stage is no taller than its film where there is room, and its foot carries play, the time, loop and the
  pointing tools as labelled buttons (Pick, Region, Guides); the timeline takes the height the stage leaves, with its
  own head (zoom, fit, follow, fold). The project tools are four labelled tabs (Outline, Inspector, Assets, Motions);
  History opens from the assistant's head and Checks from the status in the top bar, which counts the last check's
  issues. Each panel hides from its own head and comes back from the top bar; the top bar's focus button is gone (F
  stays). The right panel is at least 280 px wide.
- **Why:** The picture sat in a tall dark box with its controls in another panel, and the side panel's rail and
  headings pushed its content down; the space now goes to the film and the timeline.
- **Breaking:** None.
- **Upgrade:** Nothing. A stored right-panel width under 280 px opens at 280 px.
- **Refs:** `docs/design.md`, `apps/desktop/src/renderer/src/project-view.tsx`, `apps/desktop/src/renderer/src/preview.tsx`.

## 2026-11-13 — A project can talk to the person's own Claude Code

- **What:** The agent picker and Models also offer the person's own Claude Code, when it is installed where
  Anthropic's installer puts it (`~/.local/bin`), new enough and signed in. The Studio drives it through `claude -p`
  with stream-json, with the film's skill appended to its system prompt, the Studio's tools as its only MCP server,
  none of the person's settings, hooks or other servers, and only Read, Glob, Grep, Edit and Write of its own tools;
  its turns are checkpointed from the files that changed as Codex's are. It signs in only with `claude auth login`.
- **Why:** So a person who already uses Claude Code makes films with it, on their own sign-in (ADR 0008).
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/adr/0008-the-persons-own-coding-agent.md`, `apps/desktop/src/main/agent/claude.ts`.

## 2026-11-13 — A project can talk to the person's own Codex

- **What:** The composer's agent picker offers the person's own Codex, when it is installed (where OpenAI's installer
  puts it), new enough and signed in. The Studio drives it through `codex app-server` with the film's skill as its
  instructions and the Studio's tools (check, still, the motions, a question card) as its only MCP server, the
  person's other Codex servers, apps and plugins switched off for the session; its words, commands, file changes and
  stills show in the panel, its turns are checkpointed from the files that changed, and Stop interrupts it. The
  project's choice, Codex's thread and the panel's conversation are kept in `.motion-studio/agent.json`. What Codex
  asks to do outside its sandbox (a command, files elsewhere, the network) is a card the person answers: allow once,
  for the session, or deny. A motion from motionhub that it changes is put back after the turn. Models lists Codex
  under Your coding agents with where it stands, links to OpenAI's page to install or update it, and signs in to it
  through Codex itself.
- **Why:** So a person who already uses Codex makes films with it, on their own plan and sign-in (ADR 0008).
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `docs/adr/0008-the-persons-own-coding-agent.md`, `docs/tech/architecture.md` ("External agents"),
  `apps/desktop/src/main/agent/codex.ts`.

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
