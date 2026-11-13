# 8. The person's own coding agent, through its own headless protocol

> **Status:** Accepted · **Date:** 2026-11-13

Whether, and how, the Studio's agent can be the Claude Code or Codex the person already uses.

## Context

[ADR 0003](0003-a-built-in-agent-on-the-persons-own-model.md) gave the Studio its own agent loop on the person's own
model, and left driving an outside agent open "as a second way in beside this one". Many of the people the Studio is
for already use Claude Code or Codex, are signed in to it, and trust its long-task work more than a loop of ours on an
API key. Asking them for a key, and for per-token spend beside what they already pay, is the largest step between
installing the Studio and a first film.

Each of these agents has a headless mode made for a program to drive it, maintained by its vendor:

- **Claude Code**: `claude -p` with `--input-format stream-json --output-format stream-json`, one long-lived process
  whose messages are JSON lines on stdin and whose events (text, tool calls, results) are JSON lines on stdout, with
  `--mcp-config` and `--strict-mcp-config` for the tools it gets, `--append-system-prompt`, `--allowedTools` and
  `--disallowedTools`, `--permission-mode`, `--setting-sources`, and `--session-id` / `--resume` to go on.
- **Codex**: `codex app-server`, JSON-RPC over stdio: `thread/start` and `thread/resume`, `turn/start` and
  `turn/interrupt`, streamed `item/*` events, approval requests for commands and file changes, tools the client
  declares (`item/tool/call`), a question to the person (`item/tool/requestUserInput`), and the ChatGPT sign-in
  (`account/login/start`). Its own help marks it experimental.

The Agent Client Protocol (ACP) was the first candidate. It needs an adapter per agent; Claude's is about 210 MB per
platform (it bundles a Claude CLI the person already has) or an npm package on the Claude Agent SDK, whose licence is
Anthropic's commercial terms; Codex's adapter names no licence. The HyperFrames desktop app, which does what this
decision wants, drives both agents through the headless modes above, with no adapter.

Anthropic's Agent SDK documentation says that, unless approved, third-party developers may not offer claude.ai login
or its rate limits in their products, including agents built on the Agent SDK. Driving the person's own `claude`,
signed in by the person in Claude Code, is not building on the SDK nor offering a login, but it is close to that line.

The Studio's rules stand in the way as written: it "runs no program the person installed".

## Decision

- **A second way in, beside the built-in agent.** A project's agent is the built-in one on a provider (ADR 0003, the
  default, which works on first launch) or the person's Claude Code or Codex. The choice sits where the model is chosen
  today, in the composer, and is kept per project.
- **Each agent through its own headless protocol, no adapter.** The Studio starts the person's own `claude` or
  `codex` as a child process in the project folder and speaks its protocol: stream-json for Claude Code, the
  app-server's JSON-RPC for Codex. One module each translates it into the panel's events; nothing is fetched,
  bundled or linked for them.
- **What runs is the CLI the person installed and signed in to.** The Studio finds it where its vendor's installer
  puts it, never in a project; it never holds, reads or forwards the person's credentials, and installs no CLI itself
  (it shows the vendor's install command instead). Codex's sign-in is started through the app-server, so the person
  signs in with OpenAI in their browser; Claude Code's is the person's own `claude auth login`. This amends the rule in
  `CLAUDE.md`: the Studio still starts no npm, Node or project CLI.
- **Only the Studio's settings reach the agent.** Claude Code runs with `--strict-mcp-config` and no setting sources,
  so the person's other MCP servers, hooks and project settings are not in play; Codex gets its configuration from
  `-c` overrides for the session. The person's provider keys never enter the child's environment.
- **The Studio's tools reach the agent as an MCP server** that the main process serves to that session alone on
  127.0.0.1, behind a secret path: `check`, `still`, `search_motions`, `use_motion` and `ask_person`. Marks and
  references go in the person's message as they do today, with each marked frame as an image. The skill (`film.md`)
  is the appended system prompt for Claude Code and the developer instructions for Codex, which keep each agent's
  own base prompt.
- **The agent writes with its own tools; the Studio keeps History by the turn.** Before a turn, the Studio notes the
  project's files the built-in agent may write (everything but `.motion-studio/`, `motions/@*/`, `node_modules/` and
  `.git/`); after it, every file that changed becomes that turn's checkpoint, so History, the change summary and Undo
  this turn work as they do for the built-in agent, Undo restoring the files while the agent's memory of the turn stays
  unless it can take the session back. A protected file that changed anyway is put back and reported.
- **What the agent may do is fixed by the Studio, and the rest is asked.** Claude Code gets reading, searching,
  editing and writing in the project and the Studio's tools as its allowed tools, edits to the protected paths
  disallowed, and no shell or web tool in its first version (a headless Claude Code cannot stop to ask). Codex runs in
  its workspace sandbox, and each approval it asks for (a command, a file change outside the project, more permissions)
  is a card in the assistant with allow once, allow for this session and deny; nothing beyond the project is allowed by
  default.
- **The conversation is the agent's.** The Studio keeps the agent's session or thread id in `.motion-studio/` and
  draws the transcript from the session's events, in the same panel; it resumes the session when the project reopens.
- **Each agent shows its state** in Models: not installed, not signed in, too old for the protocol the Studio speaks,
  or ready, each with the one action that fixes it.

## Consequences

- Easier: a person who already uses Claude Code or Codex makes a film with it, without a key or spend beyond their
  plan; nothing is downloaded or bundled for it; a turn can be steered (Claude Code takes a message mid-turn) and
  interrupted.
- Harder: two protocols the vendors change, one of them marked experimental, so the Studio checks each CLI's version
  and says when it is too old or too new; two translations into the panel's events, besides the built-in agent's. The
  agent's own tools can write a file before the Studio sees it, so recovery is per turn, not per write. Claude Code has
  no shell in the Studio until a permission route for it is settled. Quality, limits and cost are the vendor's.
- Settled (2026-11-13): the Studio ships its Claude Code way in beside Codex's. It drives the `claude` the person
  installed and signed in to themselves, through the headless mode Anthropic documents for programs; it neither
  builds on the Agent SDK nor offers a claude.ai login of its own.
- Rules out: nothing of ADR 0003. A session is one project's, started in its folder; the Studio is not an editor for
  the agent's other work.

See [the architecture](../tech/architecture.md#external-agents) for the plan and its open questions.
