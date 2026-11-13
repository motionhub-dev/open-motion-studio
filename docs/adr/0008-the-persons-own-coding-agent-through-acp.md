# 8. The person's own coding agent, through ACP

> **Status:** Accepted · **Date:** 2026-11-13

Whether, and how, the Studio's agent can be the Claude Code or Codex the person already uses.

## Context

[ADR 0003](0003-a-built-in-agent-on-the-persons-own-model.md) gave the Studio its own agent loop on the person's own
model, and left driving an outside agent open "as a second way in beside this one". Many of the people the Studio is
for already pay for Claude Code or Codex through a subscription, are signed in to it, and trust its long-task work more
than a loop of ours on an API key. Asking them for a key, and for per-token spend on top of the subscription, is the
largest step between installing the Studio and a first film.

The Agent Client Protocol (ACP, agentclientprotocol.com) connects an editor to an agent over stdio. Adapters published
by its organisation drive Claude Code (`claude-agent-acp`, Apache-2.0, on the Claude Agent SDK, with standalone
executables that need no Node and can run the person's own `claude` through `CLAUDE_CODE_EXECUTABLE`) and Codex
(`codex-acp`). Both take MCP servers from the client, report tool calls with permission requests, and accept images;
Claude's takes a system prompt to append to its own.

The Studio's rules stand in the way as written: it "runs no program the person installed".

## Decision

- **A second way in, beside the built-in agent.** A project's agent is the built-in one on a provider (ADR 0003, the
  default, which works on first launch) or the person's Claude Code or Codex. The choice sits where the model is chosen
  today, in the composer, and is kept per project.
- **One protocol: the Studio is an ACP client.** It starts the agent's ACP adapter as a child process in the project
  folder and speaks ACP over its stdio. No vendor SDK is linked into the Studio, so a third agent that speaks ACP is a
  preset, not an integration.
- **What runs is the adapter and the person's own agent CLI.** The adapter is fetched on first connect, a version the
  Studio pins and checks against its SHA-256 (as a motion is checked against the catalogue's), and kept in userData; it
  is never taken from a project or from PATH. It drives the CLI the person installed and signed in to, with their
  sign-in: the Studio never holds, reads or forwards their credentials for it, and installs no CLI itself (it shows the
  vendor's install command instead). This amends the rule in `CLAUDE.md`: the Studio still starts no npm, Node or project CLI.
- **The Studio's tools reach the agent as an MCP server** that the main process serves to that session alone on
  127.0.0.1, behind a secret path: `check`, `still`, `search_motions`, `use_motion` and `ask_person`. Marks and
  references go in the person's message as they do today. The skill (`film.md`) is the appended system prompt where
  the adapter takes one, and the first message's preamble where it does not.
- **The agent writes with its own tools; the Studio keeps History by the turn.** Before a turn, the Studio notes the
  project's files the built-in agent may write (everything but `.motion-studio/`, `motions/@*/`, `node_modules/` and
  `.git/`); after it, every file that changed becomes that turn's checkpoint, so History,
  the change summary and Undo this turn work as they do for the built-in agent, Undo restoring the files while the
  agent's memory of the turn stays unless its adapter can take the session back. A write the agent asks permission for
  in a protected path is refused; one that lands there anyway is put back and reported.
- **Permissions are the person's, asked in the assistant.** An edit inside the project's writable files is allowed
  without asking, as for the built-in agent. A shell command, a network fetch or anything outside the project is a card
  with the adapter's own choices (allow once, allow for this session, deny), and nothing is allowed by default.
- **The conversation is the agent's.** The Studio keeps the agent's session id in `.motion-studio/` and draws the
  transcript from the session's updates, in the same panel; it resumes the session where the adapter can.
- **Each agent shows its state** in Models: not installed, not signed in, ready, or the adapter needs fetching, each
  with the one action that fixes it.

## Consequences

- Easier: a person with a Claude or ChatGPT subscription makes a film without a key or per-token spend, with the agent
  they already trust; a new ACP agent costs a preset.
- Harder: the Studio depends on adapters it does not write, and on their release pace and ACP's draft parts; it keeps a
  pinned version per platform and its checksums. The agent's own tools can write a file before the Studio sees it, so
  recovery is per turn, not per write, and a write outside the project that the agent does not ask about cannot be
  stopped by the Studio, only by the agent's own permission settings. Quality, limits and cost are the vendor's, not
  ours to explain.
- Rules out: nothing of ADR 0003. It does not make the Studio an editor for the agent's other work: a session is one
  project's, started in its folder.

See [the architecture](../tech/architecture.md#external-agents) for the plan and its open questions.
