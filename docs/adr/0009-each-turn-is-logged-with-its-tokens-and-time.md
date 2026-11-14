# Each turn is logged with its tokens and time

> **Status:** Accepted · **Date:** 2026-11-14

Why every turn of every agent is written down with what it took, in which shape, and where.

## Decision

At the end of each turn, the Studio appends one JSON line to the project's `.motion-studio/usage.jsonl`:

```json
{"at":"2026-11-14T06:00:00.000Z","agent":"claude","outcome":"done","seconds":72.4,"calls":4,
 "input":1000,"cacheRead":20000,"cacheWrite":500,"output":800,"reasoning":0,
 "model":"claude-sonnet-5-5","tools":9,"costUsd":0.21,"checkpoint":"entry-1"}
```

- `agent` is `built-in`, `codex` or `claude`; `outcome` is `done`, `failed` or `stopped`.
- `seconds` is the main process's, from the message to the turn's end, for every agent alike.
- The tokens are on one footing for every agent, as the Messages API counts them: `input` excludes what the prompt
  cache read (`cacheRead`) or wrote (`cacheWrite`); `reasoning` is the part of `output` spent thinking. Each agent's
  own counts are read into this shape in `src/main/usage.ts`: the built-in agent's `usage` on each model reply (Chat
  Completions' cached prompt and reasoning tokens taken apart), Claude Code's `result` events (more than one when a
  message sent mid-turn ran as a turn of its own), and Codex's `thread/tokenUsage/updated` `last` breakdowns under the
  turn's id.
- `calls` counts the model calls; `tools` the tool calls the panel showed.
- `model` where the agent says it; `costUsd` only where the agent reports a cost (Claude Code). The Studio never prices
  tokens itself, and the panel shows tokens, not money.
- `checkpoint` is the turn's History entry, where it wrote files.

A line is appended and never rewritten. A line that does not read, as one cut short by a crash, is left out of the
totals and said in the log; the rest still count. The panel shows each turn's time and tokens on its card and the
project's totals in its head.

## Reason

The developer wants to track and tune the agents, which needs every turn's cost and time on record, and the person
should see what a turn took. One line a turn, in the project, keeps the record with the work it describes, readable by
any tool, and appending cannot lose what was written before. One footing for every agent makes their turns comparable;
without it, Codex's cached input would count twice beside Claude Code's.

## Cost

The log grows with the project's turns, a few hundred bytes each, and is never pruned. A cost appears for one agent
only, so money cannot be compared across agents. A turn whose agent reports nothing (a provider that leaves `usage`
out) is logged with zero tokens and its time. The shape is a format: changing a field later means reading both.
