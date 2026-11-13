# The creator's workflow

> **Status:** Current · **Updated:** 2026-11-13

How a creator explores a film, points at a change, checks the result and returns to earlier source.

## Start and explore

The outline marks the scene under the playhead and, while the film plays, keeps it in view unless the person moved
the list in the last few seconds. A scene's layer can play alone over its scene, every other layer hidden, until the
person plays, seeks or steps. The stage's guides show the action-safe (90%) and title-safe (80%) areas. The timeline
zooms about the pointer with Ctrl and the wheel, turns a page as the playhead nears its edge while the film plays (the
person scrolling it takes it over), and shows the last check's issues on its ruler, each one click from the assistant.

The launcher offers three bundled starting points. Each opens an ordinary local project under the app's userData
`Examples/` folder; reopening keeps changes. No provider is needed to play, inspect, check or export one. A new film
can instead start in a folder the person chooses. The assistant's brief prepares a message with the subject, audience,
length and aspect ratio; it never sends a message or edits the film by itself.

The Outline lists global layers, scenes, their layers and script lines. Picking one pauses and locates the preview;
its message action attaches an explicit reference and focuses the composer. A layer's dashed box is its declared
layout, not a measured claim about its rendered contents. Script lines are read-only. The timeline shows scenes,
marks and declared layer spans, with fit and zoom controls; no keyframes or timings are edited there. A scene's Play
control plays only its span, with the endpoint enforced inside the player. Manual seeking and normal playback leave
that scoped playback. F focuses the film and restores the previous panel visibility; panel widths are retained.

The Motions panel can preview a catalogue reel before adding it. The main process caches same-host MP4 reels and HTML-player resources under
`.motion-studio/reels/`, capped at 50 MB, and the renderer plays the local preview URL. HTML players use an opaque sandbox and a separate catalogue host/CSP
that cannot fetch project files; all remote asset requests remain in the main process. A film reaches only the film
host, by fetch or by navigation, so it can never have the main process fetch a URL it wrote. A missing reel is explained.
The Assets panel lists images and fonts under `media/`, imports through the native file picker, and attaches their
project-relative paths to messages. Imports keep originals, avoid overwriting names, and are capped at 50 MB per file.
A font is listed, not installed into the operating system. Audio, video playback and media generation are outside
this slice; exported films remain picture-only.

## Make a precise request

A message carries up to five marks and eight structural references. A mark is an element picked or a region dragged
on the picture, or a stretch dragged along the timeline's Marks lane. A pick or region asks what should change there
in a box beside it (Enter adds the mark, Esc lets it go); a pick steps out to the element around it and back in. The
marks wait in the composer, each with its number, what and when it is, and its note, which can still be changed;
hovering one lights it on the picture and the timeline. Once sent, the conversation shows each with the frame the
model saw. References name a scene, layer, script line, local asset or check finding; they remain separate from the
creator's words in the composer and transcript. What was last selected in the outline or the timeline goes with the
next message as a reference, marked Selected, unless it is put aside. A scene, layer or line, marked or referenced,
tells the agent where film.tsx writes it.
Structural references and marks belong to the current build. A changed preview clears pending references with a
notice when the agent is not working, and the main process refuses stale picture references. The inspector still
shows actual computed styles of a picked element. The composer keeps its words and marks when a request is rejected.

The assistant reports thinking, editing, checking and reviewing from actual model/tool events, with elapsed time and
a stop action. These phases are activities, not a claim of percentage completion or that the model checked every frame.
Stopping keeps completed source edits and their checkpoints. Each run of tool calls reads as one line (`Edited
film.tsx · Checked ×2 · Looked`, or `Now: Checking the film…` while it runs), its steps folded under it and the stills
it took beside it; when the same tool fails three times in a row, the progress card says so. The stage says the agent
is working, and Export waits for the turn.

While the agent works, Enter keeps a message until the turn ends and then sends it; Ctrl+Enter stops the turn and sends
it at once. Marks and references wait for the turn, since the preview they belong to is changing. When the agent needs
a choice only the person can make, it asks with a card of up to four answers; clicking one sends it, or the person
writes their own. When the film does not build or stops drawing, the stage's error offers to hand it to the agent as
an issue reference.

Where a turn ends, a card says what it changed in the film's structure (`+1 scene · ~2 layers`), each item clickable to
select and find it, and the outline and the timeline light those items for a moment. The last turn's card can undo it:
its files go back, the turn leaves the conversation, and the message returns to the composer to change and send again.
The structure compared is scenes, their spans, layers' boxes and lines; what a layer draws inside its box is not.

## Return to earlier source

History records the original and resulting bytes of files written by `write_file` and `edit_file`, grouped by agent
turn. A list entry shows the request and paths changed. Restore returns to before that turn, including later agent
source changes, and starts a fresh conversation. Restoration itself creates an inverse checkpoint.

History does not snapshot the entire folder, installed Motion libraries or imported media. Unrelated files are never
removed. New files created by the agent are removed only when restoring their creation, and can be brought back by
restoring the inverse checkpoint. Every affected file is checked against its last recorded contents before
restoration; an external edit since then, or a symlink, stops restoration rather than get overwritten. A hand edit made
between two restored turns leaves the file, but the later turn's checkpoint keeps it: undoing the restoration and
restoring that turn brings it back. Source writes
use sibling temporary files and rename. A failed multi-file restoration rolls back completed writes when their
contents still match; recovery information is retained if another writer prevents rollback. This is not a filesystem
transaction across a crash or concurrent external writers.

Checkpoint storage and rationale are in [ADR 0007](../adr/0007-local-checkpoints-track-agent-source-writes.md).

## Check and export

Checks use an immutable numbered JavaScript bundle: the first frame, each scene's midpoint and the last frame are
sampled. Runtime errors and missing image decoding are reported; out-of-frame declared scene layers are warnings
because overflow can be intentional. Even whole-pixel dimensions are required for the H.264 output. These checks do
not prove text legibility, pixel visibility, every-frame correctness, or complete media support. Findings can be
located and attached to a repair request, including build failures with no playable preview.

A compile failure leaves the last compiled preview mounted and visibly labels it as such. It cannot be exported or
marked as the current film. Runtime errors are shown on the preview. Export reviews the fixed bundle, blocks errors,
then asks for a destination. If the build changes before the save dialog returns, the export is refused so the creator
can review the new version. Cancellation and failed exports leave an existing destination untouched.

All disk and network operations stay in the main process. The preview scheme refuses project state, Git metadata,
dependencies and symlinks escaping the permitted root. New modal dialogs use native focus containment and Escape;
film shortcuts do not run while a dialog is open. Colour meanings stay paper/ink, vermilion for Export, cobalt for
picture annotations, in both system themes.
