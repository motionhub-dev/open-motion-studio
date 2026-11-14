# Design

> **Status:** Current · **Updated:** 2026-11-14

The Studio's visual system: its identity, colour, type, shape, icons, the workspace's layout and the rules components follow.

## Identity

The Studio is motionhub's workbench, so it wears motionhub's brand (`brand/BRAND.md` in `motionhub-dev/motions`):
paper and ink, one ordinary type family, and the mark, a ball in flight rising up and to the right (`logo.tsx`, the
brand's `logo/mark.svg`). The interface stays quiet so the film is loud: no colour on screen but the film's, the film
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

The window has no menu bar on Windows and Linux; on a Mac the system's menu bar keeps the app's menu, Edit and
Window, for their keys (Quit, copy and paste in text, minimise).

## Colour

Every colour is a custom property on `:root` in `apps/desktop/src/renderer/src/styles.css`, light and dark (the system's
choice); nothing else in the stylesheet or a component names a colour.

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
  launcher's title). Times are always `mm:ss.cc` in mono (`timecode()`).
- Radius: 6 controls, 8 buttons, 12 panels, 16 dialogs. Spacing steps by 4: 4, 8, 12, 16, 24, 32.
- Panels sit 8 px apart on the ground, separated by a line, not a shadow; only the dialog and toasts float. The film's
  frame carries the one other shadow, on the ink.

## Icons

Lucide (`lucide-react`), 2 px stroke, at 13 to 18 px. An icon-only button has an `aria-label` and a `title` naming its
key where it has one.

## The workspace

A top bar over a grid of panels (`project-view.tsx`):

- **Top bar**: the mark (it closes the project), the project's name (its path on hover) and whether its film
  builds, then the panel controls, keyboard shortcuts and Export, which shows progress and cancels while running,
  with a menu beside it for a Remotion project. On a Mac the window has no title bar (`hiddenInset`): its buttons sit over the top bar, which
  leaves them room and moves the window; the launcher keeps a strip at its top to move it by.
- **Assistant** down the left, the **stage** in the middle, **Outline**, **Motions**, **Assets**, **Inspector**, **History** and **Checks** behind a narrow tool rail on the right, the
  **transport and timeline** along the bottom under the stage and the right panel.
- The assistant's and the right panel's widths and the timeline's height are dragged at their edges (or set with the
  arrow keys on the handle), and the timeline folds to its transport; `layout.tsx` keeps them in the app's local storage.
- The timeline (`timeline.tsx`) is a ruler, a Scenes lane for a film of scenes (each scene a block named by its id, the
  one under the playhead inked, its lines on hover), the Marks lane (a flag for each mark, a cobalt band for a stretch,
  dragged out along the lane) and the playhead through them. The check's issues are small triangles on the ruler
  (`--bad` for an error, muted for a warning), and the moment under the pointer is an ink label on it
  with its scene. Ctrl and the wheel zoom about the pointer (1× to 32×); a playhead out of view is a chip at the edge
  it went past.
- A mark being made is a dashed cobalt box with its number, and beside it a floating sheet that asks what should change
  there: below the mark, else above, right or left, kept inside the stage. A mark in hand in the composer is drawn lit
  (thicker, with a soft cobalt halo) on the picture and the timeline.
- The stage draws the film's frame contained and centred with room around it, on ink with a shadow; the marking tools
  float over its top right corner.
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

The launcher (`app.tsx`) is the mark and the title, Open folder and New film (which starts one in an empty folder), the
recent projects with their path (`~` for the home folder), and a banner while no model is set up.

## The panels and the models dialog

- **Assistant** (`assistant.tsx`, `activity.ts`): the person's words in a bubble, the agent's as Markdown (`markdown.tsx`:
  drawn as React elements, never as HTML), each run of tool calls one muted line with its state, its steps folded under
  it. Stills sit beside it as a grid of thumbnails; clicking one seeks the stage to its moment and opens it large on a
  dimmed ground (Esc closes). A turn's end is a paper card with a green (`--good`) edge listing what changed as small
  pills (a removed one struck through) and Undo this turn; a question the agent asks is a sheet card with an ink edge
  and its answers as buttons, the recommended one primary. What an outside agent asks leave to do is a sheet card with
  a `--bad` edge: its title, the command or paths in mono, its reason, and Allow once, Allow for this session and Deny,
  Deny primary; once answered, the answer in muted words. A message waiting for the turn sits above the composer on a
  dashed outline; on Claude Code, Enter adds a message of words to the turn instead, as a bubble in the conversation
  where it was sent. Items the last turn changed are ringed in green in the outline and the timeline for four seconds, and
  the stage says the agent is working in a dark pill over its top left. The composer grows with its text up to 180px; Enter
  sends, Shift+Enter breaks the line. The agent picker sits inside the composer below the text, opposite Send;
  it shows the built-in agent's model, or Codex when the project talks to the person's own (ADR 0008), keeps the full
  name on hover, and opens a menu upward: the built-in agent on its provider, Codex with its version or what it needs
  (installing, updating, signing in), and Models. Until the project's agent is known it says so, and nothing sends.
- **Motions** (`motion-panel.tsx`): the project's motions as poster cards (initials when a motion has no poster); one
  opened is its page — poster, name, line, its colour tokens as swatches, its components with their previews, and its
  MOTION.md. The catalogue search answers as cards with Use.
- **Inspector** (`inspector.tsx`): the element last picked, which the panel switches to — its name and path, the
  moment (clicked, the stage goes there), the scene and layer it is in, its position and size in the film's pixels, its words, its look (font, size,
  weight, colour with a swatch, and background, opacity and transform where set) and its attributes. It stays after its
  mark is sent.
- **Models** (`settings.tsx`): two panes. The providers down the left, an initial for each, the active one badged; the
  selected one, or a new one, as a form on the right. A new one starts from a service card (each with its protocol);
  the address and model are in mono, the key field says it is sealed in the keychain and never shown again. **Test
  connection** makes one call as the form stands (the typed key, else the stored one) and says whether the model
  answered and called a tool, and how fast. Under the providers, **Your coding agents** lists the person's own (ADR
  0008), each with its state in words and a dot (green ready, `--bad` not signed in or too old, hollow not installed);
  one opened says what it is and offers the one action that fixes its state (Install or Update, a link to the
  vendor's page; Sign in, through the agent itself) beside Check again.


## Exploration and recovery

The tool rail selects one panel, keeping the picture large as capabilities grow. Outline rows show a human-readable
scene line before its id; their message action appears on hover and keyboard focus. A selected layer has a cobalt
dashed declared-bounds box, distinct from solid picture marks. References are small paper cards with a cobalt edge,
a type label and a time where applicable; clicking locates without sending. The selection's card is dashed and labelled
Selected. Marks wait above the composer as the same cards, each with its number, what and when, and a field for its
note; a sent message shows each mark with a thumbnail of the frame the model saw. The timeline adds quiet dashed layer
spans and fit/zoom controls. Panel visibility can be toggled in the top bar, and F enters or leaves focus mode. On compact windows the project tools start folded, can be reopened explicitly,
and return to their saved visibility on a wider window.

History uses a vertical stack of request labels, timestamps and changed paths. Restore is an ink action, followed by
a native modal explaining its scope and inverse checkpoint. Checks distinguish blockers from structural warnings;
no passing sample is labelled as proof of complete visual correctness. Export's native modal shows the real film
specification, the picture-only format and check outcome before the vermilion save action.

The launcher introduces three starting-point cards in the same paper/ink palette. The assistant's brief is a compact
optional form that prepares a message. Asset cards show real local images or a font icon, with an explicit message
action. Empty, loading, missing-media and error states use explanatory text and a next action. Motion-reel dialogs
play locally cached MP4 footage or a sandboxed catalogue HTML player. New modal workflows contain keyboard focus and restore it to the invoking control;
reduced-motion preferences disable decorative card movement.
