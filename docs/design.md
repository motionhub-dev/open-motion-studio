# Design

> **Status:** Current · **Updated:** 2026-11-18

The Studio's visual system: its identity, colour, type, shape, icons, the workspace's layout and the rules components follow.

## Identity

The Studio is motionhub's workbench, so it wears motionhub's brand (`brand/BRAND.md` in `motionhub-dev/motions`):
paper and ink, one ordinary type family, and the mark, a ball in flight rising up and to the right (the
brand's `logo/mark.svg`). Home uses the Studio's application icon (`logo.tsx`). The interface stays quiet so the film is loud: no colour on screen but the film's, the film
sits on ink, and each colour has one job.

- **Vermilion (`--accent`)** is Export, and nothing else: the one action a screen asks for.
- **The mark's vermilion (`--mark`)** is the mark, and nothing else, as the brand's `mark` token.
- **Cobalt (`--annotate`)** is what the person marks on the picture (a box, its number, its flag on the timeline, its
  chip by the message). It is not vermilion, which is the brand's.
- Buttons, links, focus and the playhead are ink (`--text`), never a colour.

The mark and the app's icon are motionhub's (`brand/logo/` in `motionhub-dev/motions`) and change there first. The
icon is two vermilion balls on an ink tile: `apps/desktop/resources/icon.png` is `icon.svg` at 1024 px, from which
electron-builder makes the Mac's and Linux's icons; `icon.ico` is Windows', its 16 px the one-ball `icon-16.svg` and
its larger sizes `icon.svg`. The window takes the same files on Windows and Linux.

The window has no menu bar on Windows and Linux; on a Mac the system's menu bar keeps the app's menu, File, Edit and
Window, for their keys (Quit, New Window, copy and paste in text, minimise).

## Colour

Every colour is a custom property on `:root` in `apps/desktop/src/renderer/src/styles.css`, light and dark (the system's
choice, or the one chosen in Settings → General, set as `data-theme` on `<html>`); nothing else in the stylesheet or a component names a colour.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#F3EEE4` | `#1A1714` | the ground the panels sit on |
| `--sheet` | `#FBF8F2` | `#221E1A` | panels, cards, the dialog |
| `--s2` | `#EAE2D4` | `#2C2722` | selected, hover, the person's message, clips |
| `--line` | `#DDD3C3` | `#3B342D` | every border and rule |
| `--text` | `#2A2622` | `#F1EBE0` | headings, primary buttons, the playhead |
| `--text2` | `#4A453E` | `#D3CABC` | body copy |
| `--muted` | `#6B645A` | `#A89E90` | labels, times, counts |
| `--stage` | `#2A2622` | `#0F0D0B` | the ink under the film |
| `--accent` | `#C4381F` | `#FF6A4D` | Export |
| `--mark` | `#E2442B` | `#FF6A4D` | the mark (`logo.tsx`), and nothing else: the brand's `mark` |
| `--annotate` | `#2B59C3` | `#8FA8FF` | marks on the picture |
| `--good` | `#2E7D4F` | `#6CC08B` | built, done |
| `--bad` | `#A1301B` | `#FF8A73` | does not build, failed |

## Type and shape

- **Inter** (variable) for everything a person reads and **JetBrains Mono** for time, paths, ids and code, both OFL and
  shipped with the app (Fontsource, imported in `main.tsx`); the system's CJK faces follow for Chinese and Japanese.
- Sizes: 11 and 12 (labels, tool steps), 13 (body), 14 (project name), 16 (card and dialog titles), 20, 26 (the
  title on Home). Times are always `mm:ss.cc` in mono (`timecode()`).
- Radius: 6 controls, 8 buttons, 12 panels, 16 dialogs. Spacing steps by 4: 4, 8, 12, 16, 24, 32.
- Panels sit 8 px apart on the ground, separated by a line, not a shadow; only the dialog and toasts float. The film's
  frame carries the one other shadow, on the ink.

## Icons

Lucide (`lucide-react`), 2 px stroke, at 13 to 18 px. An icon-only button has an `aria-label` and a `title` naming its
key where it has one.

## The workspace

A top bar over a grid of panels (`project-view.tsx`):

- **Top bar**: on the left where the person is and what it is: a Home icon (it returns to Home; the project keeps
  running), a chevron, the project's name (its path on hover; a double-click renames it in place) with its menu, and its
  status (building, built with the last check's issue count, or does not build), which opens Checks. On the right what
  to do with it: keyboard shortcuts (a question mark, the key that opens them, in a wide dialog with its groups side by side), the motion library (Motions, with how many the project holds), Voice (when the film has lines or a voice) and Export MP4, one vermilion split
  button whose chevron holds the other ways to export (a Remotion project), and which shows progress and cancels while
  running. The bar has no Settings button: OpenMotionStudio's settings are the app's, not the film's, and open from
  Ctrl/⌘ , or from their row in the shortcuts dialog (on Home they are in its sidebar); a model and a voice are set up where they
  are used, from the assistant's model menu and the Voice panel. Voice opens the Voice panel in the project
  tools (a back arrow and its title, as History and Checks): with no voice provider set up, the four as cards, each
  opening it in Settings; with no `<Film voice>`, Voice settings and Generate with agent; then a card with the film's
  voice, its provider and how its captions show, with Voice settings and, when another voice is selected, Use that
  voice instead (through the agent); the lines by scene, each with ▶ to play it in place in the film and its length,
  or Waiting in cobalt; and at the panel's foot, which stays in reach, Voice N lines with the characters it will
  speak, its progress line by line and what it did. On a Mac the window has no title bar (`hiddenInset`): its buttons sit over the top bar, which
  leaves them room and moves the window; Home keeps a strip at its top to move it by.
- **Assistant** down the whole left, the **stage** in the middle, the **project tools** on the right, the **timeline**
  along the bottom under the stage and the project tools. A shown panel hides from its own head (the assistant's left
  corner, the tools' right corner, the timeline's chevron) and leaves a 40 px rail in its place (the timeline its head),
  its icon and name written down it; the whole rail, or head, brings it back, and a pulsing cobalt dot on the
  assistant's rail says the agent is working.
- The **stage** is the film's height where there is room: its picture takes the film's shape with 16 px of ink around
  the frame, and its foot is the controls (previous frame, play, next frame, the time, loop, and sound on or off for a
  film with sounds; then Pick, Region and
  Guides as one labelled group, the film's size and rate, and full screen). A narrow stage keeps the group's icons and
  drops the size. The size and rate open, upward over the picture, the usual sizes by shape with where each is used
  (landscape 16:9 at 1920×1080, 3840×2160 and 1280×720; portrait 9:16 at 1080×1920; portrait 4:5 at 1080×1350; square
  1:1 at 1080×1080) as tiles two to a row, and the rates 24, 25, 30 and 60, the film's own marked with a dot. Choosing
  changes nothing yet: a size and a rate can both be chosen, and the menu's foot says what will change (from → to) and
  what the agent will do, with Cancel and Change the film, which alone asks the agent. The agent writes it in film.tsx: a new rate keeps everything else, a frame of the same shape is scaled, and a new shape lays
  every scene out again; the scenes keep their lengths in seconds. It waits while the agent is not ready or is working.
  Full screen is the stage alone, picture and foot, with no corners; Esc or the button leaves it.
- The **project tools** are three tabs, Outline, Assets (with how many it holds) and Code. The motion library opens
  from the top bar across the workspace, in place of the stage, the timeline and the project tools. Files from the computer dropped anywhere on the workspace (dashed while they are over it) are imported and go
  with the next message; Start from a look, on an empty conversation, opens the motion library. History opens from the assistant's head
  and Checks from the status; either shows its title with a way back to the tabs.
- The assistant's and the right panel's widths are dragged at their edges, and the timeline's height is the least it
  has: it takes whatever the stage leaves (handles take the arrow keys too). The timeline folds to its head, and the
  stage then takes the rest; `layout.tsx` keeps the sizes in that window's session-local storage.
- The timeline (`timeline.tsx`) is a head (its zoom, fit, follow and fold), a ruler, a Scenes lane for a film of scenes (each scene a block named by its title over a strip of its frames, as many
  40 px frames as its width holds, each the nearest in time; until they are made, the title alone; a triangle by the
  lane's name, its reason on hover, when they could not be made; the
  one under the playhead inked, its lines on hover; a selected scene ringed in cobalt, the scene of a selected layer
  ringed thinly), the Marks lane (a flag for each mark, a cobalt band for a stretch, dragged out along the lane; empty,
  it says so in muted words, and it tints on hover), for a film with sounds a Sound row (each sound a cobalt-tinted
  band from where it starts for as long as it plays, its file's name in mono over its waveform, filled cobalt on a
  decibel scale through its volume and fades; overlapping sounds on rows of their own, named once; a file that will
  not read dashed in `--bad`; a click seeks to it), a Lines row for a film that says anything (each line a sheet band
  while it is said, its words in it; the one being said inked, a selected one cobalt; a click selects it and seeks),
  a dashed span for each layer (selected, solid cobalt on a cobalt
  tint; changed by the last turn, a green ring on a green tint) and the playhead through them. The check's issues are small triangles on the ruler
  (`--bad` for an error, muted for a warning), and the moment under the pointer is an ink label on it
  with its scene. Ctrl and the wheel zoom about the pointer (1× to 32×); a playhead out of view is a chip at the edge
  it went past.
- A mark being made is a dashed cobalt box with its number, and beside it a floating sheet that asks what should change
  there: below the mark, else above, right or left, kept inside the stage, and where no side has room, wherever it
  covers least of the mark. For a picked element the sheet also holds its properties — its words when it holds nothing
  else, size, weight and colour when it has words, its fill where one is drawn, and its opacity — each change shown on the
  picture at once. With a change made, its actions are Add to message and Apply, which sends it to the agent now;
  Cancel puts the picture back. A mark's row in the composer counts its changes. A mark in hand in the composer is drawn lit
  (thicker, with a soft cobalt halo) on the picture and the timeline.
- The stage draws the film's frame contained and centred on ink with a shadow.
- Keys, grouped in one table (`SHORTCUTS` in `project-view.tsx`) that ? lists in a dialog: Space or K plays, ← → step
  a frame (Shift, a second), ↑ ↓ go to the previous or next scene, Home and End to the start and end; C cycles Pick,
  Region and off, G shows the safe-area guides, Esc lets a mark go, then puts the tool down, then clears the selection;
  + − zoom the timeline and Shift+Z fits it; [ and ] show or hide the assistant and the project tools, `\` folds the
  timeline, F focuses the film. No key acts while the person types or a dialog is open.
- The safe-area guides are two dashed frames over the picture, action at 90% and titles at 80%. A layer played alone
  is said in a dark pill over the stage's top, with a way back to every layer.
- A control's tip is its `data-tip`, with its key in `data-key`: one layer over everything (`tooltip.tsx`) shows it
  after a short rest, below the control or above where there is no room. Native `title` is kept for text that is cut
  short (a path, a mark's moment).
- An export's result is a toast, with Show in folder.

## Home

Home (`home.tsx`) is a header (the icon and **OpenMotionStudio**, the language as 中文 or EN that switches to the
other, and the theme as one icon that turns it over — a moon in light, a sun in dark; Settings keeps Follow system
for both; Open project sits in the prompt beside Start creating, the two ways to begin; a new film is made from the prompt below, a template, or Ctrl/⌘ N), a 176 px navigation rail (Home, My projects, Templates, each with
its icon; at its foot, apart from them, Settings' sections under a small Settings heading, each with its icon, and
Help, which lists the
shortcuts) and the content.

- **Settings on Home** are Home's pages: a section chosen in the sidebar shows in Home's content under its own
  heading, lined up with Home's other pages, with no page or back button of its own. Opened from something the
  person was doing (a setup step, Connect an assistant, Ctrl/⌘ ,), it has a back arrow to it, and the page beneath
  keeps its state. Leaving with unsaved edits, by Home's sidebar or header, asks first, as Settings' own sidebar
  does in the editor, where Settings is still a page of its own over the project.
- **Home** asks what the person wants to make next, over a prompt: a field for the film in their own words, three
  starts to finish (a launch teaser, an explainer, kinetic type) and **Start creating**. Enter sends it, Shift+Enter
  is a new line, `/` goes to it. It creates a project named from the words' first line and opens it, and the words
  are the assistant's first message, sent as soon as the agent and the film are ready; with no assistant connected,
  the prompt says so and the words wait in the composer. The field keeps them until the project exists. Below it, while
  tasks run in the background, a line counts those that need the person and those running and opens to a row per task.
  Then Continue creating: the project opened last as a large card (its cover beside its name and **Continue
  editing**), the next four in a row, and Start from a template.
- **My projects** is every project in the library with search (`/` goes to it), a sort (recently opened, recently modified, name) and a
  grid or a list. A card is the project's cover (a still of its film from `.motion-studio/cover.jpg`, drawn whole
  on the stage's dark, so a portrait or square film is not cropped; else its initials), its name and when it was last opened. A task over it is a badge: a ring filling with its progress (turning
  while it has none) and Working, or a pulsing cobalt dot and Needs you; a running task with progress also draws a
  line along the cover's foot. Home's task line takes the same cobalt dot while anything needs the person. Its ⋯ menu opens it in an editor
  window, shows its folder, or removes it from the list, saying that the files stay. A project whose folder is gone
  stays in the list, marked, with Locate project folder.
- **Templates** are cards showing the film's poster frame, played from its start while the card is hovered or focused
  (not with reduced motion). The picture is the template's film as the Studio's own export drew it, never a redrawing; a template sets its type in
  Inter, which its copy carries in `media/`, so the copy looks as its video did. One opened plays on the stage as the editor's does (on ink, play, a seek, `mm:ss.cc`)
  beside its description and **Use this template**, which copies it into a fresh workspace project; repeated names
  get numeric suffixes. A template's film words are the film's and are
  not translated.
- **The first run**, with nothing in the library, is three steps (appearance, where films are saved, and a creative
  assistant), with Explore templates first always beside Continue.

While the library is read, Home draws its blocks (the title, the prompt, four cards) as quiet shimmering shapes, so
nothing jumps when it arrives.

The main window is the single home and project-switching surface. Its close button hides it to the tray; the first
time, a native dialog says active tasks keep running and offers to keep the window open. The tray's tooltip counts the
tasks that need the person and those running, its menu opens each project that needs them, and on a Mac the count is
beside the tray icon and on the dock; the tray opens the window, returns Home, or quits the app and its background
tasks, all in the interface's language.

## Motion

Motion says where something came from and stays out of the film's way: a Home page, a template opened, Settings and
an editor come in with a 0.2 s rise (6 px, fading in); a card lifts 2 px with a soft shadow (`--lift-shadow`) under the
pointer and its cover leans in to 103 %; a template card plays its film while hovered or focused. Nothing moves on
the film's own picture, and with reduced motion nothing animates or plays by itself.

## Settings

Settings (`settings.tsx`) is a page over Home or the editor, which stays mounted under it (its film paused): a back
arrow and **Settings**, then a rail of sections (General, Model Providers, Coding Agents, Voice Services, Workspace,
Diagnostics) beside the open one. General's choices (theme, language, launch at login) save as they are made and reach
every window; a choice that applies at once is a switch, ink when on. A provider's form is saved explicitly; leaving it with edits holds the click and offers Save and continue,
Discard changes or Keep editing. A change made in another window is announced, never applied over the person's input.
Workspace shows the default folder (the operating system's Documents folder plus `OpenMotionStudio`); Change folder
saves a new location for future projects without moving existing ones. Diagnostics opens the app's local logs folder.

Every pick list is the shared `Select` (`select.tsx`): a combobox whose popup is portalled to the body so no panel
clips it, with a native select's keys, or an input with suggestions where any value is allowed (a model, a voice).

## Language

The interface is English or Chinese (Settings → General, following the system by default). English is the source:
each message is looked up by its English text in `src/shared/translations.ts`. A film, a project's or a motion's
names, a model's reply and every identifier (a model, a path, a key's name) are never translated. In Chinese, an
English error the Studio has no translation for is summarized, with its exact text one click away.

The Chinese keeps one word for each thing: a project (a folder) is 项目, a film (`film.tsx`) is 视频, the workspace is
工作空间, a template is 模板, a motion is 动效, and an agent stays Agent.

The project's menu is about this project alone, each row led by its icon: Rename… (the folder, refused while a task
runs; the editor comes back on the renamed folder where it was), Duplicate as a new project (a copy beside it without
the Studio's state, which opens), and Open in its own window (also Ctrl/Cmd+Shift+N), which moves its existing view
into a dedicated window, or Move back to the main window when it is in one. Below a rule, Show in folder over the folder's path, written out and wrapping. Home and
the other projects are reached from the Home icon beside the title. Closing a dedicated window only detaches the view; reopening restores the same conversation, draft and
pending requests. A project appears in one editing surface at a time. Hidden views pause preview playback while
agents and exports continue. Sessions are retained for this app run; explicit Quit ends them.

## The panels

- **Assistant** (`assistant.tsx`, `activity.ts`): the person's words in a bubble, the agent's as Markdown (`markdown.tsx`:
  drawn as React elements, never as HTML). A turn's work is one framed block: one muted line at 11 px ("How it got
  there · read 2 files · edited 1 file · checked twice · 1 failed", or "Now: …" with a spinner while it runs), red only
  when its last call failed, and its steps under it: each tool call (files named in the project) and, in italics, what
  the agent said between them. It is open while the turn runs and folds when it ends, unless the person opened or folded
  it. What the agent said after its last call is its answer, under the block. Stills sit under the work as one row of
  four small thumbnails; more than four show three and a count of the rest, which opens them all (and Fewer folds them
  again); clicking one seeks the stage to its moment and opens it large on a dimmed ground (Esc closes). The last three
  turns are drawn whole; earlier ones wait behind "Show N earlier turns". A turn's end is a paper card with an edge
  green for done, `--bad` for failed and muted for stopped: one line (Done, Stopped or Failed; its time and tokens, the
  parts on hover; the files it changed; its last check's result; the film's new length), what changed as small pills
  (a removed one struck through), and Go back to before this (the last turn's) and Copy (its answer); for turns run
  while the project is open. While a turn runs, the progress card shows its phases as a row (Thinking, Editing,
  Checking, Looking; those passed ticked, the current inked), what it is doing and the clock, and Send is a red Stop. A question the agent asks with
  answers takes the composer's place as a floating sheet with an ink edge, the conversation dimmed to 45% behind it:
  the question, each answer as a row (the first marked Recommended in green), and a dashed "Something else…" that
  brings the composer back; in the conversation it is a dashed card, "Answer below" until answered, then "Answered:"
  and the answer. A failed turn is a sheet card with a `--bad` edge: what went wrong and, on the last turn only, what to
  do (Open Models, or Sign in, or Change the cap, primary; Use another agent; Try again while the message is back in
  the box, which the card says). An empty conversation is "What should this film do?", four start cards in two
  columns (Explain an idea, Introduce something, Start from a look, each putting the start of a message in the box;
  Write a brief, which opens the brief under them), and a line on pointing at the picture (C, a drag on the Marks
  row, @). What an outside agent asks leave to do is a sheet card with
  a `--bad` edge: its title, the command or paths in mono, its reason, and Allow once, Allow for this session and Deny,
  Deny primary; once answered, the answer in muted words. A message waiting for the turn sits above the composer on a
  dashed outline; on Claude Code, Enter adds a message of words to the turn instead, as a bubble in the conversation
  where it was sent. Items the last turn changed are ringed in green in the outline and the timeline for four seconds, and
  the stage says the agent is working in a dark pill over its top left. The composer grows with its text up to 180px; Enter
  sends, Shift+Enter breaks the line, + and @ at its start (+ opens, upward, Import files…, From the assets and From
  the motion library, each with a line saying what it does), and at its end its agent as a quiet chip and Send (or
  Stop): what the message goes to sits beside the button that sends it. The assistant's head is hide, then the project's
  tokens, History and New conversation as icons. The chip has a dot (green
  ready, `--bad` signed out or too old, hollow not installed or no model) and the built-in agent's model, or the
  person's own agent with the model chosen for it ("Claude Code · opus"; ADR 0008), the rest on hover. It opens a menu
  upward, as wide as the composer, as @ does: the built-in agent on its provider, Codex and Claude Code with their versions or what they need
  (installing, updating, signing in), for the person's own agent its Model and Effort as two selects that take at
  once, and Models. Until the project's agent is known it says so, and nothing sends.
- **Outline** (`outline.tsx`): the scene count and length with Collapse all / Expand all; the film's own layers folded
  in a dashed group; then each scene as one row on the playhead's rail (a frame from the timeline's stills, its first
  line, its number, start and length; a fold at its end), its layers under it topmost first by name, and the rest of
  its lines as quotes. The rail's node is hollow before a scene, filled after, filled and ringed while it plays, and the
  line fills as far into the scene as the playhead is. The scene the playhead enters opens and the one it leaves closes,
  unless the person folded or opened it; selecting something elsewhere opens its scene. Actions sit on a row's end
  on hover or focus, in the row's own colour with its text fading under them and muted until pointed at: Play (▷)
  and Ask on a scene, Solo (▷ in a square, playing the layer alone) and Ask on a layer, Ask on a line, and on each
  Show its code (</>), which opens film.tsx across the stage at the lines that write it; Ask is @, as in the composer,
  since it adds the row to the message. A layer hovered here or on the
  timeline is lit in both, and its declared box drawn dashed on a cobalt tint on the picture while its scene is on screen.
- **Motions** (`motion-library.tsx`, 动效库 in Chinese): a view of its own across the workspace beside the assistant,
  in place of the stage, the timeline and the project tools (the film stays loaded out of sight); the top bar's
  button, pressed while it is open, Picture or Esc go back. Its head holds the way back, its title, a search and a line
  on what a motion is; under it the tags more than one motion shares, as chips (All, and one at a time). Then a grid
  of large posters, at least 220 px each: the project's motions first, marked In use or In this project, then
  motionhub's whole catalogue with how many the words and the tag leave; a poster pointed at for a moment plays its
  reel when the reel is a video. A motion opened shows in a drawer at the right (Esc closes it first): its reel, its
  id and version, what it is and what it is for, its tags, and for one the project holds its colour tokens as
  swatches, its components with their previews and its MOTION.md; at its foot Apply to the video, Add only for one
  the project does not hold, and Remove for one from the hub the film does not use (asked first; its folder and its
  line in the lock go). Apply asks first, then takes the motion if the project does not hold it, goes back to the
  picture and asks the agent to restyle the film with it (`applyRequest`), keeping its words, scenes, order and timing.
- **Code** (`code-view.tsx`): the project's files as a tree (folders first; motions/, media/ and voice/ start folded),
  each code file opening across the stage in place of the picture, which keeps its film loaded out of sight; anything
  else opens in its own program. The code is read-only, on the panels' paper rather than the stage's ink: its path and
  line count, Picture (or Esc) back, Add lines (the lines selected, as a reference `film.tsx:3-5` with their text),
  Copy, and Open in your editor; a line under the head says the assistant writes the code. Line numbers stay at the
  left; syntax is coloured by sugar-high in the Studio's own few colours (cobalt keywords, green strings, muted signs
  and comments), and the lines asked for from the outline are lit in cobalt and brought to the middle. What is shown
  is read again when the film is rebuilt or the window comes back.
- **Assets** (`assets-panel.tsx`): images, fonts and sounds under `media/`, each a card dragged onto the picture (a
  mark where it falls, Put it here, with the asset as a reference) or onto the composer (a reference); @ on its corner
  adds it to the message. A sound plays in place with its length, a typeface shows itself (Aa 永), and a file the
  film's code names is marked In use. When some are not used, a line says how many, with Show only these. A file
  opened shows large; one the video does not use can be renamed there (its extension kept beside the field) or moved
  to the system's trash, and one it uses says why it cannot be. The list is read again when the window comes back
  into focus or the film is rebuilt; there is no refresh button.
- **Model Providers** (Settings): two panes. The providers down the left, an initial for each, the active one badged; the
  selected one, or a new one, as a form on the right. A new one starts from a service card (each with its protocol);
  the address and model are in mono, the key field says it is sealed in the keychain and never shown again. **Test
  connection** makes one call as the form stands (the typed key, else the stored one) and says whether the model
  answered and called a tool, and how fast. Under the providers, **Your coding agents** lists the person's own (ADR
  0008), each with its state in words and a dot (green ready, `--bad` not signed in or too old, hollow not installed);
  one opened says what it is and offers the one action that fixes its state (Install or Update, a link to the
  vendor's page; Sign in, through the agent itself) beside Check again. Under them, **Voices** lists the four voice
  providers (ADR 0012), a filled dot for one set up; one opened gives its steps to a key and a link to the page, the
  key and its settings (Azure's region, MiniMax's site and optional group id, a model), its voices to search once listed,
  and Hear it, which speaks a sentence in the voice chosen. Save keeps that voice id with the provider and closes
  Settings; the Voice panel, which stays open under it, reads the providers again and shows the saved choice.
  When Voice is opened for a film with no voice selected but a provider set up, the panel offers **Voice settings**
  to open that provider in Models and **Generate with agent** to apply the saved voice (or choose a suitable one when
  none was selected) and synthesize the narration through the project's current agent. Generation requires a connected,
  idle agent and opens the assistant.


## Exploration and recovery

The tabs select one panel, keeping the picture large as capabilities grow. A selected layer has a cobalt
dashed declared-bounds box, distinct from solid picture marks. References are small paper cards with a cobalt edge,
a type label and a time where applicable; clicking locates without sending. The selection's card is dashed and labelled
Selected. Marks wait as the same cards, each with its number, what and when, and a field for its note; references
and marks share one tray over the composer, headed "With the next message" and their count, and Send then reads
"Send 3". The composer's foot has + (import images or fonts into the project, each joining the tray) and @ (the
picker; typing @ at a word's start opens it too): a sheet over the composer, its picks in groups (Scenes, Layers,
Lines, Assets, Motions) with where each is in muted mono, the first five of each until something is typed, then
every pick whose words or place hold what was typed; ↑↓ move, Enter or Tab adds, Esc closes, and the @ and what
followed it leave the draft. A sent message shows each mark with a thumbnail of the frame the model saw. The timeline adds quiet dashed layer
spans and fit/zoom controls. A panel hides from its head and comes back from its rail, and F enters or leaves focus mode. On compact windows the project tools start folded, can be reopened explicitly,
and return to their saved visibility on a wider window.

History uses a vertical stack of request labels, timestamps and changed paths. Restore is an ink action, followed by
a native modal explaining its scope and inverse checkpoint. Checks distinguish blockers from structural warnings;
no passing sample is labelled as proof of complete visual correctness. Export's native modal shows the real film
specification, its sound (the sounds mixed, or picture only), its subtitles (captions in the picture where the film
draws them; the lines as a track and an .srt beside it) and check outcome before the vermilion save action.

Home introduces three starting-point cards in the same paper/ink palette. The assistant's brief is a compact
optional form that prepares a message. Asset cards show real local images or a font icon, with an explicit message
action. Empty, loading, missing-media and error states use explanatory text and a next action. Motion-reel dialogs
play locally cached MP4 footage or a sandboxed catalogue HTML player. New modal workflows contain keyboard focus and restore it to the invoking control;
reduced-motion preferences disable decorative card movement.
