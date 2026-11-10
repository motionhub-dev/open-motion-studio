# Design

> **Status:** Current · **Updated:** 2026-11-10

The Studio's visual system: its identity, colour, type, shape, icons, the workspace's layout and the rules components follow.

## Identity

The Studio is motionhub's workbench, so it wears motionhub's brand (`brand/BRAND.md` in `motionhub-dev/motions`):
paper and ink, one ordinary type family, and the mark, a ball in flight rising up and to the right (`logo.tsx`). The
interface stays quiet so the film is loud: no colour on screen but the film's, the film sits on ink, and two colours
have one job each.

- **Vermilion (`--accent`)** is Export, and nothing else: the one action a screen asks for.
- **Cobalt (`--annotate`)** is what the person marks on the picture (a box, its number, its flag on the timeline, its
  chip by the message). It is not vermilion, which is the brand's.
- Buttons, links, focus and the playhead are ink (`--text`), never a colour.

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

- **Top bar**: the mark (it closes the project), the project's name (its path on hover), its engine and whether it
  builds, then the model in use (which opens Models) and Export, which shows its progress and cancels while it runs.
- **Assistant** down the left, the **stage** in the middle, **Motions** on the right, the **transport and timeline**
  along the bottom under the stage and the right panel.
- The assistant's and the right panel's widths and the timeline's height are dragged at their edges (or set with the
  arrow keys on the handle), and the timeline folds to its transport; `layout.tsx` keeps them in the app's local storage.
- The stage draws the film's frame contained and centred with room around it, on ink with a shadow; the marking tools
  float over its top right corner.
- Keys: Space plays, ← → step a frame (Shift, a second), C cycles Pick, Region and off, Esc puts a tool down.
- An export's result is a toast, with Show in folder.

The launcher (`app.tsx`) is the mark and the title, Open folder, a card for each engine (what it is, what it needs, the
Remotion licence in a line), the recent projects with their engine and path (`~` for the home folder), and a banner
while no model is set up.

## The panels and the models dialog

- **Assistant** (`assistant.tsx`): the person's words in a bubble, the agent's as Markdown (`markdown.tsx`: drawn as React
  elements, never as HTML), each tool call a line with its state. A still is a thumbnail; clicking it seeks the stage
  to its moment and opens it large on a dimmed ground (Esc closes). The composer grows with its text up to 180px; Enter
  sends, Shift+Enter breaks the line.
- **Motions** (`motion-panel.tsx`): the project's motions as poster cards (initials when a motion has no poster); one
  opened is its page — poster, name, line, its colour tokens as swatches, its components with their previews, and its
  MOTION.md. The catalogue search answers as cards with Use.
- **Models** (`settings.tsx`): two panes. The providers down the left, an initial for each, the active one badged; the
  selected one, or a new one, as a form on the right. A new one starts from a service card (each with its protocol);
  the address and model are in mono, the key field says it is sealed in the keychain and never shown again. **Test
  connection** makes one call as the form stands (the typed key, else the stored one) and says whether the model
  answered and called a tool, and how fast.
