# The assistant panel

> **Status:** Plan · **Updated:** 2026-11-14

How the assistant panel is rebuilt around turns: what each turn did, what it cost and how long it took, a composer that gathers what the next message carries, and the settings of the person's own coding agent, in five slices.

The mock agreed with the developer is the
[Assistant redesign artifact](https://claude.ai/artifact/1HkW2zkafeyP94Jco5KCXF) (five states: a finished turn, a
working turn, a question, an error, an empty conversation). It borrows from HyperFrames' desktop Studio (its docs in
`references/hyperframes/docs/studio-app/`) and VisoTalk's assistant (`references/visotalk/apps/web/src/components/studio/
assistant.tsx`, `timeline.tsx`, `run-progress.tsx`, `ref-chip.tsx`). Not borrowed: a mascot, a storyboard to approve
before building (a feature, not the panel), pause (no agent the Studio drives can), and time estimates from past runs.

## What each agent reports

Every turn records its tokens and time; where the agent says what it cost, that too. What each one gives, checked on
2026-11-14:

| Agent | Tokens | Time | Cost | Model and effort |
| --- | --- | --- | --- | --- |
| Built-in | `usage` on every model reply (Messages; Chat Completions with `stream_options.include_usage`) | the Studio's clock | not reported; none is guessed | the provider's model, in Models |
| Claude Code 2.1 | the `result` event's `usage` and `modelUsage` (input, output, cache read and write) | `duration_ms`, `duration_api_ms` | `total_cost_usd` | `--model`, `--effort`, `--fallback-model`, `--max-budget-usd`, fixed when the process starts |
| Codex 0.167 | `thread/tokenUsage/updated` (`last` and `total`: input, cached input, cache write, output, reasoning; `modelContextWindow`) | the Studio's clock | not reported | `model` and `effort` on each `turn/start`; `model/list` names the choices |

## Slice 1: every turn's tokens and time

*Built.* As planned, but for a reopened project: its turns' cards are drawn only for turns run while it is open, and
the head shows the project's totals from the log. Codex's accounts were checked on Codex 0.167.0: one
`thread/tokenUsage/updated` per model call, its `last` that call's and its `total` the thread's.

The ground the rest stands on, and what the developer asked for first: to track and tune the agents, and so the person
sees what a turn cost.

- **The turn's account**: the `end` event carries `usage: { seconds, calls, model?, input, cacheRead, cacheWrite,
  output, reasoning }`, summed over the turn's calls (built-in `loop.ts`), over the turn's `result`s (Claude Code, more
  than one when a message sent mid-turn ran as a turn of its own) or over the `last` of each
  `thread/tokenUsage/updated` under the turn's id (Codex). The built-in turn's seconds are its loop's; an outside
  agent's, the main process's from the message to the turn's end.
- **On disk**: each turn's account is appended to `.motion-studio/usage.jsonl`, one JSON line: the time, the agent, the
  model, the account, whether the turn finished, failed or was stopped, its checkpoint id, the number of tool calls,
  and Claude Code's reported cost. A line is never rewritten; a project's log is the project's (git ignores it with the
  rest of `.motion-studio/`). ADR 0009 fixes the line's format.
- **Shown**: tokens, never money (the developer's choice): the turn's card reads `Worked for 1m 12s · 18.4k tokens`,
  its parts on hover (model, calls, input, cached, cache written, output, reasoning); the project's total sits beside
  the assistant's title. A reopened project's earlier turns keep no card (they are not rows of the transcript).
- **Tests**: what reaches `usage.jsonl` and where, for each agent's events (the stand-in Claude Code process, a Codex
  notification fixture, the built-in loop with scripted replies); a Claude Code turn that ran on after its `result`.

## Slice 2: a turn as one block, and its outcome

The mock's "finished turn" and "working turn". *Built*, as below; an outside agent's file paths are made the
project's in the main process (`history.ts inProject`), and the `end` event carries the files the turn changed. The
work block is red only when its last call failed, since a turn that fixed what failed on the way ended well.

- **One block**: a turn's tool calls fold into one line ("How it got there · read 2 files · edited 3 · checked twice ·
  looked at 6 frames"), open while the turn runs and folded when it ends, in the same place so nothing jumps; its steps
  name files by their path in the project, never an absolute path. The stills row stays under it, the agent's words
  after.
- **The outcome card**: done, failed or stopped; time and account (slice 1); files changed (the checkpoint's count); the
  check's last result (from the turn's `check` calls); the film's length before and after; the changes as chips that
  select and seek (as today). Actions: Go back to before this (today's Undo this turn) and Copy (the agent's words).
- **Earlier turns** fold to "Show N earlier turns" beyond the last three.
- **While it works**: the phases as one row of steps (Thinking, Editing, Checking, Looking; done ticked, current
  inked), what it is doing now and the clock; Send becomes Stop.
- **Tests**: the work line's words and the relative paths (`activity.ts`), the outcome line from a turn's rows.

## Slice 3: the person's own agent, its settings and the header

*Built*, as below; the details are in `architecture.md` (step 7.4). Beyond the plan: Codex is sent its model and
effort on every turn, the default said outright (its own configuration's, else its default model), since Codex keeps
a turn's choice for the thread's later turns; a Claude Code turn stopped at its cap says so, and its tokens are read
from `model_usage_since_last_result`, its `usage` being zero on an error. New conversation became an icon to leave the
chip room.

- **Settings**, kept in the app's `settings.json` (userData) per agent and shown in Models under Your coding agents:
  - Claude Code: model (Default, Sonnet, Opus, Haiku, or a full model name), effort (the CLI's levels), fallback model,
    and a spending cap per turn (`--max-budget-usd`). They are start flags, so a change ends the running process and
    the next message resumes the session with them.
  - Codex: model (from `model/list`) and effort, sent on each `turn/start`.
  - The built-in agent keeps its provider's model.
- **The header** carries the project's agent and model as a chip with a state dot (ready, signing in needed, missing),
  opening the same menu the composer's picker opens today, with the model and effort to switch; the composer's picker
  goes.
- **Tests**: the start arguments for each Claude Code setting, the `turn/start` fields for Codex, the settings' shape on
  disk.

## Slice 4: the composer gathers what the next message carries

*Built*, as below, with a motion as a new kind of reference; a reference keeps its card (a reference has no note, so
the tray holds the two kinds of card as before, under one head), and Send reads "Send 3".

- **One tray** above the box for marks, stretches and references (scenes, layers, lines, issues, assets), each a row
  with its number or kind, its moment and its note, removable; Send reads "Send 3 edits" when the tray holds any.
- **@** opens a picker over the film's scenes, layers and lines and the project's assets and motions, grouped, typed to
  filter; a pick joins the tray.
- **+** imports images or fonts (today's Assets import) and puts them in the tray as references.
- **Tests**: the picker's matching and grouping; a reference the tray sends is the one the IPC validates (as today).

## Slice 5: questions, errors and the empty conversation

- **A question** from the agent takes the composer's place, the conversation behind it dimmed: its options, the
  recommended one marked, "Something else…" back to the box; answered, it stays in the conversation as a dashed card
  with the answer.
- **Errors** become cards with what to do: sign in, use another agent, try again (the same message), open Models; the
  message stays in the box and the card says so. The header's dot shows a signed-out agent before a message is sent.
- **An empty conversation**: a title, four starts (explain an idea, introduce something, start from a look, write a
  brief, which takes today's Brief), and how to point at the picture (C, a stretch on the timeline).

## Order and what each slice changes

1 first, since 2's card and 3's header show its account; then 2, 3, 4, 5, each its own pull request, driven in the app
with the run-desktop skill (a turn's card from a recorded session; a real turn on each agent for 1 and 3).

| Slice | Main | Shared / IPC | Renderer | Docs |
| --- | --- | --- | --- | --- |
| 1 | `agent/loop.ts`, `claude.ts`, `codex.ts`, `index.ts`; new `usage.ts` | `end` gains `usage`; `conversation` returns turns' accounts | `assistant.tsx` turn card | ADR 0009, `architecture.md`, CHANGELOG |
| 2 | `index.ts` (files, check result on `end`) | `end` gains `files`, `check` | `assistant.tsx`, `activity.ts`, `styles.css` | `design.md`, CHANGELOG |
| 3 | `claude.ts`, `codex.ts`, `providers.ts` or a new settings module | agent settings in `StudioApi` | `settings.tsx`, `assistant.tsx` header | `architecture.md`, ADR 0008 note, CHANGELOG |
| 4 | none (assets import as today) | none | `assistant.tsx`, new picker | `design.md`, CHANGELOG |
| 5 | `index.ts` (error kinds) | `notice` gains a kind | `assistant.tsx` | `design.md`, CHANGELOG |

When the slices land, this document is rewritten to describe what was built, or folded into `architecture.md` and
`design.md` and deleted.
