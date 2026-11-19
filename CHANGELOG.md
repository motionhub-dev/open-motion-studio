# Changelog

Every key change to OpenMotionStudio, newest first, by date. What counts as key and the entry format are in
`CLAUDE.md`, "The changelog".

## 2026-11-19 — Windows releases are signed through SignPath Foundation

- **What:** A Windows release built by CI (a `v*` tag, or a run that prepares a draft release) sends its program and then its installer to SignPath, which signs both with SignPath Foundation's certificate once an approver accepts; CI stops unless both carry a valid signature. The `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` secrets are gone, replaced by the `SIGNPATH_API_TOKEN` secret and the `SIGNPATH_ORGANIZATION_ID` variable. The code signing policy, team roles and privacy statement are in `docs/ops/code-signing.md`, linked from the README and from the download section of studio.motionhub.dev.
- **Why:** A code-signing certificate's key now has to live in hardware, so a `.pfx` in a secret can no longer be had; SignPath Foundation signs open-source releases for free, from CI only.
- **Breaking:** None.
- **Upgrade:** Nothing. Builds stay unsigned until the SignPath settings are set; pushes and pull requests are never signed.
- **Refs:** `.github/workflows/build.yml`, `apps/desktop/scripts/check-signing.mjs`, `docs/ops/code-signing.md`, `site/index.html`.

## 2026-11-18 — The Studio has its own mark

- **What:** The app's icon, its window and tray icon and Home's logo are the Studio's own mark, the eased square: a rounded square split by an ease-in-out curve into deep and mid vermilion, in place of motionhub's two balls. Export stays vermilion, in the mark's colour, and marks on the picture stay cobalt.
- **Why:** The Studio needs a face of its own beside the catalogue's.
- **Breaking:** None.
- **Upgrade:** Nothing. A new install shows the new icon; a pinned shortcut may keep the old one until the system refreshes its icon cache.
- **Refs:** `apps/desktop/resources/icon.svg`, `icon.png`, `icon.ico`, `docs/design.md`.

## 2026-11-18 — The website shows the real Studio

- **What:** studio.motionhub.dev is rebuilt as one film in a dark screening room, with a transport bar at the foot carrying the timecode and the scenes. Its first screen says what the Studio is beside a 24-second loop of the real app (brief, build, mark the frame, edit, compare) whose five steps light as it plays. Then a 93-second tour of one real project with chapters and English and Chinese captions; one brief made in the Studio with three MotionHub looks (Riso Pop, Stage Light, Night Diagram, by SuoSi); the real first and revised cuts at the same instant; what the person owns, told as end credits; and the Studio beside generative video, Remotion and HyperFrames in three sentences. The page wears the Studio's eased-square mark.
- **Why:** Creators decide on what they see: the first screen has to show the app doing the work.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `site/index.html`, `site/studio.css`, `site/studio.js`, `site/favicon.svg`, `site/media/`.

## 2026-11-18 — Check for Studio updates (v0.1.1)

- **What:** General settings shows the installed version and checks GitHub for newer stable releases. Installed apps also check in the background unless the preference is switched off. A dismissible notice opens the official download page.
- **Why:** Creators can find a new desktop release while their project continues running.
- **Breaking:** None.
- **Upgrade:** Install a desktop build containing this change to see the new controls.
- **Refs:** `apps/desktop/src/main/updates.ts`, `apps/desktop/src/renderer/src/updates.tsx`.

## 2026-11-18 — First desktop release (v0.1.0)

- **What:** OpenMotionStudio packages the editor for macOS (Apple silicon and Intel), Windows (x64) and Linux (x64 and arm64).
- **Why:** People can start from a sample film, use a motion from motionhub, direct edits on the preview and export an MP4 from the installed app.
- **Breaking:** None.
- **Upgrade:** First install. Choose the download for your operating system and processor.
- **Refs:** `apps/desktop/package.json`, `apps/desktop/electron-builder.yml`, `.github/workflows/build.yml`.

## 2026-11-18 — The timeline folds while code is read

- **What:** Opening a file in the code view folds the timeline to its head, and leaving the code view opens it again,
  unless it was folded before.
- **Why:** Code is read line by line down the page; the timeline took a third of its height and showed nothing of it.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-18 — Past conversations are kept; History is Versions

- **What:** New conversation keeps the one before in the project's `.motion-studio/conversations/` (as it was shown,
  without stills), and the assistant's clock opens Past conversations: those kept, newest first, each read as it was.
  The turns' checkpoints the clock used to open are now Versions, opened from the project's title menu.
- **Why:** The clock beside New conversation read as the conversation's history but showed the film's checkpoints, and
  New conversation threw the conversation away with no way back to it.
- **Breaking:** None. A conversation cleared before this is not recovered.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/main/conversations.ts`, `apps/desktop/src/renderer/src/past-conversations.tsx`,
  `apps/desktop/src/renderer/src/project-view.tsx` (`ProjectMenu`).

## 2026-11-18 — The film's voice is chosen and heard in the voice view

- **What:** The voice view lists the voices of each provider set up, searched by name, language or id; each is heard
  saying the film's own first line, and Use this voice has the agent give the film that voice and speak its lines
  again. Only keys and new providers are left to Settings. Every line voiced shows once, not as a disabled button too.
- **Why:** Choosing a voice meant leaving the film for Settings and back, and hearing it say a sentence the film never
  says.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/voice-view.tsx` (`VoicePicker`).

## 2026-11-18 — Voice is a view of its own

- **What:** Voice (配音) opens across the workspace beside the assistant, as the motion library does, instead of in
  the side panel: the script read straight through, a card for each scene with Play this scene and a row for each
  line in large type, played in place, added to the message with @, and lit while it is said; at the right, what the
  voice still needs, or the voice and voicing the lines waiting. The script shows while the voice is being set up.
- **Why:** In the side panel the script was a narrow list, and it was hidden until a voice could speak.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/voice-view.tsx` (replacing `voice-panel.tsx`), `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-18 — The motion library is a view of its own

- **What:** Motions (动效库) opens across the workspace beside the assistant, in place of the stage, the timeline and
  the project tools, instead of in the side panel: a search and tag chips over a grid of large posters (a poster
  pointed at plays its reel), the project's motions first, and a drawer for the motion opened, with its reel, what it
  is for, its colours, components and MOTION.md and its actions. Picture or Esc go back; applying a motion goes back
  to the picture to show the restyle.
- **Why:** In the side panel a motion could only be seen one poster and one dialog at a time.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/motion-library.tsx` (replacing `motion-panel.tsx`),
  `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-17 — Settings are in Home's sidebar

- **What:** Home's sidebar lists Settings' sections (General, Model Providers, Coding Agents, Voice Services,
  Diagnostics) at its foot, apart from the pages of work above, and each opens as one of Home's pages instead of a
  page over Home. The workspace folder is part of General, in the editor's Settings too. Home's header gear and the workspace row at the sidebar's foot are gone. Settings opened from a
  setup step or Ctrl/⌘ , has a back arrow to where the person was; leaving with unsaved edits asks first. In the
  editor Settings is still a page of its own.
- **Why:** Home's sidebar held three rows and a wide gap, and Settings covered Home with a second sidebar of its own.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/home.tsx`, `apps/desktop/src/renderer/src/settings.tsx` (`embedded`),
  `apps/desktop/src/renderer/src/app.tsx`.

## 2026-11-17 — The motion library opens from the top bar

- **What:** Motions (动效库) is a button in the editor's top bar beside Voice, with how many motions the project holds,
  and opens its panel in the project tools as Voice does, with a back arrow and its title. Its tab is gone: the
  project tools are Outline, Assets and Code.
- **Why:** Applying a motion restyles the whole video, as voicing it speaks the whole video; it was the third of four
  tabs, where few found it.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-17 — A read-only code view

- **What:** A Code tab lists the project's files; a code file opens across the stage in place of the picture,
  read-only, with line numbers and its syntax coloured, Copy and Open in your editor. A scene, layer or line of the
  outline shows the lines of film.tsx that write it, and lines selected go with the next message as a reference
  (`film.tsx:3-5`, with their text). The assistant stays beside it.
- **Why:** The film is code the agent writes, and there was no way to read it, or point at a part of it, without
  leaving the Studio.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/code-view.tsx`, `apps/desktop/src/main/files.ts`, `apps/desktop/src/shared/spans.ts`;
  `sugar-high` 2.6.0 (a dev dependency, bundled into the renderer).

## 2026-11-17 — Assets are renamed, trashed and kept current

- **What:** A file the video does not use is renamed (its extension kept) or moved to the system's trash from its
  dialog in Assets; one it uses says why it cannot be. Assets say how many files the video leaves out, with Show only
  these. The list is read again when the window comes back into focus or the film is rebuilt, and its refresh button
  is gone.
- **Why:** A file once imported could only be renamed or cleared away in the file manager, and the list showed what
  was there only after a press of refresh.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/main/assets.ts` (`renameAsset`, `trashAsset`), `apps/desktop/src/renderer/src/assets-panel.tsx`.

## 2026-11-17 — Assets and motions are reached from the composer and by dropping files

- **What:** The composer's + opens Import files…, From the assets and From the motion library. Files from the
  computer dropped anywhere on the workspace are imported into `media/` and go with the next message. The Assets and
  Motions tabs say how many they hold, and Start from a look opens the motion library.
- **Why:** Both panels sat behind the Outline with nothing in the way of making a film leading to them.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/assistant.tsx`, `apps/desktop/src/renderer/src/project-view.tsx`,
  `apps/desktop/src/preload/index.ts` (`importDroppedAssets`).

## 2026-11-17 — Motions are applied to the video, and assets dragged where they go

- **What:** The Motions panel (动效库 in Chinese) opens on motionhub's whole catalogue instead of an empty search, and
  a motion is applied to the video: it is taken into the project if needed and the agent is asked, after a
  confirmation, to restyle the film with it, keeping the film's words, scenes and timing. The project's motions are
  marked in use or not, preview their reel, and one from the hub the film does not use can be removed (its folder
  and its line in `motions.lock.json`). Assets are dragged onto the picture (a mark there asking for the file) or
  onto the composer; a sound plays in place with its length, a typeface shows itself, and a file the film uses is
  marked In use. The Chinese tray now says 一个区域 for a region.
- **Why:** Use and Import only copied files into the project, so nothing on screen changed, and the catalogue showed
  nothing until someone guessed a word to search for.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/motion-panel.tsx`, `apps/desktop/src/renderer/src/assets-panel.tsx`,
  `apps/desktop/src/main/motions.ts` (`removeMotion`), `apps/desktop/src/main/project.ts` (`projectSource`).

## 2026-11-17 — Home's covers are sharp and whole

- **What:** A project's cover is kept with its long side at 1280 px (it was 640 px wide) and drawn whole on the stage's
  dark: a portrait or square film shows its full frame instead of a cropped, enlarged middle. A cover taken smaller
  before is taken again the next time the project is opened.
- **Why:** On a high-density screen Home's large card enlarged a 640 px cover about twice, and a portrait film's
  cover was cropped to its middle third and enlarged again, so it looked blurred.
- **Breaking:** None.
- **Upgrade:** Nothing: a project opened once has its new cover.
- **Refs:** `apps/desktop/src/main/film/capture.ts` (`COVER_SIDE`, `jpegSize`), `apps/desktop/src/renderer/src/styles.css`
  (`.project-art`).

## 2026-11-17 — Home's header switches the theme and the language

- **What:** Home's header has the language as 中文 or EN and the theme as one icon (a moon in light, a sun in dark),
  each switching to the other at a click and saved as the preference Settings holds; Follow system stays in Settings.
  Its New video button is removed: the prompt below it, a template and Ctrl/⌘ N make one. Open project moves into the
  prompt, beside Start creating.
- **Why:** The look and the language were three clicks away, and New video said twice what Home's prompt is for.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/home.tsx` (`Home`).

## 2026-11-17 — The Chinese interface says 视频, not 影片

- **What:** Every Chinese label, message and hint that named the film (`film.tsx`) as 影片 names it 视频, counted with
  个 (这个视频, 第一个视频): 新建视频, 导出视频, 视频预览 and the rest. The English is unchanged.
- **Why:** 影片 reads as a cinema film; what people make here are videos, and 视频 is the word they use for them.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/shared/translations.ts`, `docs/design.md`.

## 2026-11-17 — A film made without a name is film-<id>

- **What:** New film, and a film whose brief leaves no usable name, makes its folder `film-` and six random letters and
  digits (`film-k3x9q2`) instead of `Untitled film`, `Untitled film 2`, …; a taken one is drawn again. Names given
  (a brief's first line, a template's name, a copy) are kept as they were, numbered when taken.
- **Why:** A folder name with a space has to be quoted in a shell and escaped in a URL, and numbered untitled films
  said nothing a random ID does not.
- **Breaking:** None. Existing projects keep their folders.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/main/project.ts` (`newFilmName`, `createInWorkspace`).

## 2026-11-17 — The outline's row actions say what they do

- **What:** A row's actions in the outline sit on the row in its colour, muted until pointed at, instead of in a
  floating box with a shadow. Adding a row to the message is @, as in the composer, instead of a speech bubble; playing
  a layer alone is ▷ in a square instead of stacked squares. They show on hover or keyboard focus, and no longer stay over a row's
  end after it is clicked, nor cover a selected row's outline.
- **Why:** The stacked squares read as copy and the bubble as a comment, and the box covered the row it acted on.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/outline.tsx`, `apps/desktop/src/renderer/src/styles.css` (`.row-actions`).

## 2026-11-17 — The film's size and frame rate are chosen on the stage

- **What:** The film's size and rate at the stage's foot open a menu of the usual sizes — landscape 16:9 (1920×1080,
  3840×2160, 1280×720), portrait 9:16 (1080×1920), portrait 4:5 (1080×1350) and square (1080×1080), each with where it
  is used — and the rates 24, 25, 30 and 60. A size and a rate chosen there change nothing until Change the film
  confirms them, under a line saying what will change and what the agent will do; then they go to the agent as one
  exact request: it changes
  `export const film` in film.tsx, keeps the scenes' lengths in seconds, scales a frame of the same shape and lays every
  scene out again for a new one. The menu waits while the agent is not ready or is working.
- **Why:** A film made for one platform often needs another's frame; the size was shown but could only be changed by
  describing it. The Studio still does not write film.tsx: a new shape needs the scenes laid out again,
  which is the agent's work.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/preview.tsx` (`SpecMenu`, `specRequest`).

## 2026-11-17 — The agent is chosen at the composer's foot

- **What:** The chip that chooses the project's agent and model moves from the assistant's head to the composer's foot,
  left of Send. Its menu opens upward, as wide as the composer. The project's tokens stay in the head, before History
  and New conversation.
- **Why:** Which agent a message goes to belongs beside the button that sends it.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/assistant.tsx` (`AgentChip`), `apps/desktop/src/renderer/src/styles.css`.

## 2026-11-17 — The editor's bar has no Settings button

- **What:** The gear at the end of the editor's top bar is removed. OpenMotionStudio's settings open from Ctrl/⌘ , or
  from the Open Settings row of the keyboard shortcuts dialog, which is now a button; Home keeps its gear, and a model
  or a voice is still set up from the assistant's model menu and the Voice panel.
- **Why:** The settings it opened are the app's (theme, language, launch at login), not the film's; in the editor's bar
  it competed with Voice and Export MP4 for what the bar is about.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx` (`Shortcuts`).

## 2026-11-17 — A picked element's properties are changed on the picture; the Inspector is gone

- **What:** Picking an element on the picture opens its properties in the mark's sheet: its words (when it holds
  nothing else), size, weight, colour, fill and opacity. Each change shows on the picture at once; Apply sends it to the
  agent as exact changes to make in film.tsx (Add to message keeps it for the next message, Cancel puts the picture
  back). A mark carries the changes (`Mark.changes`), checked in the main process against the properties a mark can
  change. The Inspector tab, which only showed the element last picked, is removed; the project tools are Outline,
  Assets and Motions.
- **Why:** The Inspector showed what an element was but changed nothing, away from the picture. Trying a size or a
  colour where it is seen, then having the agent write it at its source, is the shorter way to the change.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/preview/pick.ts` (`oms:tweak`), `apps/desktop/src/renderer/src/preview.tsx` (`Stage`),
  `apps/desktop/src/main/agent/marks.ts`, `apps/desktop/src/shared/preview.ts` (`TWEAKABLE`).

## 2026-11-17 — Export MP4 is one split button

- **What:** The top bar's Export reads Export MP4 and is joined with the chevron beside it into one split button: the
  MP4 on its left, the other ways to export (a Remotion project) behind the chevron on its right.
- **Why:** The chevron sat apart in another style, so it did not read as part of exporting, and Export did not say what
  it makes.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx`, `apps/desktop/src/renderer/src/styles.css` (`.export`).

## 2026-11-17 — Keyboard shortcuts open from a question mark, in a wide dialog

- **What:** The top bar's keyboard shortcuts button is a question mark, the key that opens them, and the dialog is wide
  with its groups side by side in up to three columns instead of one tall list.
- **Why:** The keyboard icon did not say what it opened, and the tall list scrolled on a short window.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx` (`Shortcuts`), `apps/desktop/src/renderer/src/styles.css`.

## 2026-11-17 — Voice is a panel with every line

- **What:** Voice opens a panel in the project tools instead of a dialog. It shows the film's voice, its provider and
  how its captions show, with Voice settings and, when another voice is selected, a way to have the agent use it; every
  line by scene, voiced (with its length) or waiting, each played in place in the film; and, at its foot, voicing the
  lines waiting with how many characters that speaks, its progress and what it did. The setup steps (a provider, the
  film's voice) are the same, and the panel stays open while Settings sets a provider up.
- **Why:** The dialog said how many lines were spoken but not which, and could not play one; a modal dialog also hid
  the film while voicing it.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/voice-panel.tsx`, `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-17 — The title menu is about the project alone

- **What:** The editor's title menu no longer lists other projects, Home or the film's size, rate and length; Show in
  folder moves to its foot with the folder's path written out, and every row has its icon (rename, duplicate, the
  window move, the folder).
- **Why:** Switching projects and going Home already have their place (the Home icon beside the title, and Home's
  library); in the project's own menu they made it long and mixed what is this project's with what is not.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx` (`ProjectMenu`), `apps/desktop/src/renderer/src/styles.css`.

## 2026-11-17 — The project's title menu holds what can be done to the project

- **What:** The editor's title menu now renames the project (also a double-click on the title), shows its folder,
  duplicates it as a new project beside it, and moves it to a window of its own or back to the main window, whichever
  applies; it shows the film's size, rate and length, the projects with a task running, the five opened last, and
  Home. The top bar's separate "Open in editor window" button is gone into that menu. The gear says it is
  OpenMotionStudio's settings and sits apart at the bar's end.
- **Why:** The pop-out icon read as a browser window, the menu offered both window moves at once, and a gear in a
  project's bar read as that project's settings.
- **Breaking:** Renaming a project renames its folder on disk.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx` (`ProjectMenu`), `apps/desktop/src/main/project.ts`
  (`renameProject`, `duplicateProject`, `folderName`), `apps/desktop/src/main/index.ts` (`renameKnown`).

## 2026-11-17 — Every timeline lane is drawn

- **What:** A film with more layers than the timeline is tall now draws every lane when the timeline is scrolled down.
  The tracks and the names column take the height of their lanes, at least the timeline's.
- **Why:** The tracks were as tall as the timeline's visible part, so scrolling down showed the names of the lower layers
  beside empty space.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/styles.css` (`.timeline .tracks`, `.timeline .names`).

## 2026-11-17 — A hidden panel leaves a rail

- **What:** Hiding the assistant or the project tools leaves a narrow rail in its place, its icon and name written down
  it, as the folded timeline leaves its head; clicking anywhere on the rail brings the panel back, and the whole folded
  timeline head unfolds it too. The assistant's rail shows a pulsing dot while the agent works. The top bar's buttons
  for hidden panels are gone; [ and ] still toggle them.
- **Why:** A hidden panel was only findable from two small icons in the top bar, far from where it had been.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx`, `apps/desktop/src/renderer/src/styles.css`.

## 2026-11-17 — A step's long command wraps inside the assistant

- **What:** A step of the agent's work that names a long path or command (a coding agent running
  `"C:\WINDOWS\System32\…\powershell.exe" -Command …`, say) wraps inside the assistant instead of running past its
  edge, and its icon stays by the first line. A step's output, the agent's words between its steps and its Markdown
  replies wrap an unbroken token the same way.
- **Why:** A path with no break in it set the step's width, and the assistant cut it off.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/styles.css` (`.tool summary`, `.markdown`).

## 2026-11-17 — Long names stay inside the workspace's panels

- **What:** Names that are longer than their place no longer run out of it or break badly. The chips under a finished
  turn end in an ellipsis inside the assistant, with the whole name on hover. A timeline lane named by a long layer
  id ends in an ellipsis instead of being cut mid-word. The stage's Pick, Region and Guides keep their words on one
  line instead of breaking a Chinese word per character. A reference card shows its scene's id as written rather than
  in capitals, and wraps a long path. The inspector's note flows as one sentence around its key.
- **Why:** A scene named by a long line pushed the turn's card past the assistant's edge, and the other panels had the
  same kind of break with long names or in Chinese.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/styles.css`, `apps/desktop/src/renderer/src/assistant.tsx`,
  `apps/desktop/src/renderer/src/inspector.tsx`.

## 2026-11-17 — A motion taken during a coding agent's turn is kept

- **What:** When Codex or Claude Code took a motion from motionhub through the Studio's tools during a turn, the end of
  the turn treated the new motion as the agent's edit and "put it back" to absent, deleting its files while the film
  still imported them (`Could not resolve "../motions/@…"`). The motion is now kept as taken; an agent's edits to any
  motion still go back.
- **Why:** It deleted a motion's files from the person's project and broke the film's build.
- **Breaking:** None.
- **Upgrade:** A project hit by it keeps the motion's empty folders and its `motions.lock.json` entry: delete the empty
  `motions/@<scope>/<slug>/` folder and take the motion again from the Motions panel, or ask the agent to.
- **Refs:** `apps/desktop/src/main/workspace.ts` (`outsideTurn`), `apps/desktop/src/main/__tests__/outside-turn.test.ts`.

## 2026-11-17 — Templates draw in their own face

- **What:** The templates set their type in Inter instead of the system's face: a template copy gets `media/Inter.woff2`
  and its licence (`media/Inter-OFL.txt`), and its film imports and declares the face. The preview and the export
  now load the faces a film declares itself before drawing any frame, not only its motions'. Home's template videos
  were rendered again in Inter.
- **Why:** A template looked different on every computer, and its preview video showed the face of the computer that
  rendered it.
- **Breaking:** None.
- **Upgrade:** Nothing. Template copies made before keep the system's face.
- **Refs:** `apps/desktop/src/main/examples.ts`, `apps/desktop/resources/fonts/`, `apps/desktop/src/preview/core.tsx`.

## 2026-11-16 — Templates play as the Studio renders them

- **What:** Home's template cards and template preview play a video of each template exported by the Studio itself,
  with its poster frame, instead of an HTML redrawing of it. `pnpm templates` renders them again after a template
  changes; a test fails until it has. The renderer's content policy allows media from the app itself.
- **Why:** The redrawing could drift from what the engine draws, so the preview could promise a film the template does
  not make.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/scripts/render-templates.mjs`, `apps/desktop/src/renderer/src/templates/`,
  `apps/desktop/src/main/__tests__/examples.test.ts`.

## 2026-11-16 — Home moves, and shows the tasks that need you

- **What:** Home's pages, an opened template, Settings and the editor come in with a short rise; cards lift and their
  covers lean in under the pointer; Home draws its shape while the library loads. A task over a project's cover shows
  a progress ring and a progress line while it runs, and a pulsing dot when it needs the person. The tray says how
  many tasks need the person and run, lists each project that needs them, and shows the count on the dock and beside
  the tray icon on a Mac; the tray is now in the interface's language. Reduced motion turns all of it off.
- **Why:** A visual tool should feel alive without moving the film, and a task waiting on the person in the
  background was easy to miss.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/home.tsx`, `apps/desktop/src/renderer/src/styles.css`,
  `apps/desktop/src/main/index.ts` (`showTasksInTray`).

## 2026-11-16 — Home starts a film from a description

- **What:** Home opens on a prompt: describe the film, and Start creating makes a project named from the description
  and sends it to the agent as the first message once the agent and the film are ready (it waits in the composer
  without an assistant). The project opened last is a large card with Continue editing, the next four beside it.
  The rail has icons and lists the shortcuts under Help: Ctrl/⌘+N a new film, Ctrl/⌘+O open a project, Ctrl/⌘+,
  Settings, and / to the prompt or the project search. Launch at login is a switch, and every settings section's
  heading sits at the same place.
- **Why:** Starting a film took a blank project, the editor and the assistant before the person could say what they
  wanted; a creative tool should start from the idea.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/home.tsx`, `apps/desktop/src/main/project.ts` (`filmName`),
  `apps/desktop/src/main/index.ts` (`takeBrief`).

## 2026-11-16 — Settings is a page, with General preferences and launch at login

- **What:** Settings opens as a page over Home or the editor (its film paused) with sections for General, Model
  Providers, Coding Agents, Voice Services, Workspace and Diagnostics. General holds the theme (system, light, dark),
  the language and launch at login (installed Windows and macOS builds). Leaving a provider form with edits asks to
  save or discard; a change made in another window is announced instead of overwriting the form. Every pick list is
  one shared select. Open logs folder moved from Workspace to Diagnostics.
- **Why:** The models dialog had grown into the place for every app setting, and preferences had nowhere to live.
- **Breaking:** `settings.json` gains a `preferences` object (`theme`, `language`, `onboardingComplete`,
  `backgroundNoticeSeen`).
- **Upgrade:** Nothing: a settings file without it uses the system's theme and language.
- **Refs:** `apps/desktop/src/renderer/src/settings.tsx`, `apps/desktop/src/renderer/src/select.tsx`,
  `apps/desktop/src/main/providers.ts`.

## 2026-11-16 — The interface is in English or Chinese

- **What:** Every label, message and native dialog the Studio writes is translated to Chinese when the system's
  language is Chinese or Chinese is chosen in Settings → General; the switch is live in every window. A film's words,
  project and motion names, model replies and identifiers are never translated. In Chinese, an English error the
  Studio has no translation for is summarized, with its exact text one click away.
- **Why:** Many of the creators the Studio is for work in Chinese.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/shared/i18n.ts`, `apps/desktop/src/shared/translations.ts`,
  `apps/desktop/src/renderer/src/preferences.tsx`.

## 2026-11-16 — Home replaces the launcher, with a project library

- **What:** Home has Home, My projects and Templates. The project library keeps every project opened, with its cover
  (a still of its film), when it was last opened and modified, search, sort and a grid or list; a project can be
  removed from the list (its files stay) or, when its folder is gone, located again. A template card shows its
  film and plays it on hover; opened, it plays on the stage as the editor does before a copy is made. A first run walks through appearance, the workspace and an assistant. The first close of the main window
  explains that tasks keep running in the tray. Home refreshes when the person returns from an editor, and reopening
  a project moves it to the top.
- **Why:** The launcher showed ten recent paths and no picture of the work; a visual tool's home should show the films.
- **Breaking:** The recent list (`recent-projects.json` in userData) is replaced by the library (`projects.json`); the
  `recentProjects` IPC call is gone. A project's cover is `.motion-studio/cover.jpg` inside it.
- **Upgrade:** Projects opened before do not carry over: open each once (Open project) to add it to the library.
  `recent-projects.json` can be deleted.
- **Refs:** `apps/desktop/src/renderer/src/home.tsx`, `apps/desktop/src/main/project.ts`, `apps/desktop/src/main/index.ts`,
  `docs/design.md`.

## 2026-11-15 — Runtime diagnostics stay in a fixed local log folder

- **What:** Write structured startup, task, build, IPC failure and process-crash diagnostics to main.log in the
  operating system's app log directory. Settings → Workspace offers Open logs folder. Keep one rotated previous
  log, with each file capped at 5 MiB. Record technical context without IPC arguments or conversation payloads,
  and redact credential fields and common secret patterns. Logging failures do not block normal app work.
- **Why:** Packaged applications otherwise lose the terminal output needed to diagnose startup and spawn failures.
- **Breaking:** None.
- **Upgrade:** Nothing. On macOS the folder is ~/Library/Logs/OpenMotionStudio; Windows and Linux use logs/ under
  Electron's userData folder. Logs stay on the computer and are not uploaded.
- **Refs:** `apps/desktop/src/main/log.ts`, `apps/desktop/src/main/logging-startup.ts`.

## 2026-11-15 — Packaged apps can start the film bundler

- **What:** Load esbuild's JavaScript API from app.asar.unpacked so its native executable resolves beside it.
  The desktop driver can now target an installed executable with OMS_EXECUTABLE, using an isolated profile.
- **Why:** Installed builds tried to spawn esbuild inside the virtual app.asar archive when opening a new film or
  template, despite the executable already being unpacked: ENOENT on Windows and ENOTDIR on macOS.
- **Breaking:** None.
- **Upgrade:** Reinstall the rebuilt app; project files and settings need no changes.
- **Refs:** `apps/desktop/src/main/film/film.ts`, `.claude/skills/run-desktop/drive.mjs`.

## 2026-11-15 — The app name is consistently OpenMotionStudio

- **What:** Use OpenMotionStudio in application and installer metadata, UI, notifications, template branding,
  agent prompts and client titles, exported project text, the website and documentation.
- **Why:** The installer and several other surfaces still displayed the spaced form of the product name.
- **Breaking:** The packaged product name changes, including its executable, application bundle, shortcuts and
  Electron's default userData directory. Package identifiers, appId and repository URLs stay the same.
- **Upgrade:** Existing project folders are unchanged. Development profiles under the previous product name can be
  moved to the new userData location while the app is closed to keep their settings and recents.
- **Refs:** `apps/desktop/package.json`, `apps/desktop/electron-builder.yml`, `site/index.html`.

## 2026-11-15 — New films and template copies use a configurable workspace

- **What:** New film creates a fresh project directory without a folder picker. Every template click makes a new
  copy. Both use Documents/OpenMotionStudio by default; Home shows the workspace path and opens Settings → Workspace
  to change it. Existing names get numeric suffixes, including simultaneous creations.
- **Why:** Starting a film should not require choosing an empty folder, and template clicks should preserve prior work.
- **Breaking:** Clicking a template creates a new project instead of reopening its userData/Examples copy.
- **Upgrade:** Existing projects stay in place and can be reopened from Recent or Open folder. A chosen workspace is
  saved in settings.json's optional `workspace` field and applies to future projects only.
- **Refs:** ADR 0015, `apps/desktop/src/main/project.ts`, `apps/desktop/src/main/examples.ts`,
  `apps/desktop/src/renderer/src/settings.tsx`.

## 2026-11-15 — Projects keep working behind Home and dedicated editor windows

- **What:** One main window switches between Home and retained project sessions; closing it hides it to the tray.
  Home shows tasks, waits and progress, with Open here and Open in editor window. A project's existing editor view
  moves into a dedicated window with Ctrl/Cmd+Shift+N, or back to the main window. Closing an editor or switching
  projects keeps its agent and export running, while hidden previews pause playback. Explicit Quit ends background
  tasks. Projects have isolated preview/render sessions; shared settings and recents use serialized atomic saves.
- **Why:** The person should be able to leave an agent working, close its editor and return to its progress from Home.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** ADR 0014, `apps/desktop/src/main/workspace.ts`, `apps/desktop/src/main/index.ts`,
  `apps/desktop/src/main/film/capture.ts`.

## 2026-11-15 — The home screen uses the Studio icon and OpenMotionStudio name

- **What:** The launcher shows the same icon as the packaged app and writes its heading as OpenMotionStudio.
- **Why:** The home screen should identify the Studio with its own icon and joined name.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/app.tsx`, `apps/desktop/src/renderer/src/logo.tsx`.

## 2026-11-15 — The editor has a Home button beside the project's name

- **What:** The editor's top bar starts with a Home icon, a chevron and the project's name. Home returns to the launcher.
- **Why:** The brand mark did not make the way back to the home screen clear.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/project-view.tsx`.

## 2026-11-15 — Saving a voice returns to narration, and local agent tools bypass proxies

- **What:** Save in voice settings keeps the selected voice id and closes Models, returning to Voice when opened
  there. Generation uses that selection. External agents bypass proxies for the Studio's loopback MCP server;
  Codex must discover the Studio tools before a turn starts, with connection failures reported before a model call.
- **Why:** The selected voice was only used for a sample, saving left the dialog open, and a system proxy could
  send local tool discovery through a proxy that returned HTTP 502, leaving the agent without film or voice tools.
- **Breaking:** None.
- **Upgrade:** Select and save the voice once; earlier selections were not stored. Reopen the app for existing agent
  processes to pick up the local proxy bypass.
- **Refs:** `apps/desktop/src/renderer/src/settings.tsx`, `apps/desktop/src/main/agent/harness.ts`,
  `apps/desktop/src/main/agent/codex.ts`.

## 2026-11-15 — A film without a voice offers settings and generation with the agent

- **What:** Voice offers Voice settings and Generate with agent when the film has no voice selected. Settings opens
  the configured voice provider in Models; generation opens the assistant and asks the current agent to choose a
  suitable voice, generate the narration and check it. Generation is available when the agent is connected and idle.
- **Why:** The dialog explained how to ask for a voice but offered no way to act on it.
- **Breaking:** None.
- **Upgrade:** Nothing.
- **Refs:** `apps/desktop/src/renderer/src/voice-dialog.tsx`, `apps/desktop/src/renderer/src/project-view.tsx`,
  `apps/desktop/src/renderer/src/assistant.tsx`.

## 2026-11-15 — MiniMax's group id is optional

- **What:** MiniMax's voice settings can be saved and sampled without a group id. The form labels it optional, and
  speech requests include `GroupId` only when it is set; clearing it also clears it for a sample using a stored key.
- **Why:** Requiring a group id blocked accounts that authenticate with their API key alone.
- **Breaking:** None.
- **Upgrade:** Nothing; an existing group id is still used when set.
- **Refs:** `apps/desktop/src/main/providers.ts`, `apps/desktop/src/main/voice.ts`,
  `apps/desktop/src/renderer/src/settings.tsx`.

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
