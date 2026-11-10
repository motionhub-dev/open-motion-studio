# 3. A built-in agent on the person's own model

> **Status:** Accepted · **Date:** 2026-11-10

## Context

The Studio's agent can be either one of its own or an outside agent (Claude Code, Codex, opencode) driven over a protocol
such as ACP. An outside agent is mature, but each one is tied to its vendor's models or configuration, has to be installed
and signed in separately, and does not know the Studio's tools (stills, marks, motions) unless they are exposed to it. The
Studio's promise is that a person chooses the model and the provider, and that it works on first launch.

## Decision

- **The Studio runs its own agent loop** in the main process, with its own tools (project files, `still`, `check`,
  `render`, the motion catalogue, and a `shell` that asks first).
- **The person brings their own model**: a provider is a base URL, a protocol and a key. Two protocols are spoken,
  Anthropic Messages and OpenAI Chat Completions, which between them reach the hosted providers and local servers
  (Ollama, LM Studio). There is no proxy of ours: calls go from the person's machine to their provider.
- **Models that cannot call tools are refused for the agent**; models that cannot read images get the measured layout of
  a still instead of its picture.
- The agent's craft lives in skill files (a core skill and one per engine) and in each project's motion, not in code.

## Consequences

- Easier: works on first launch with any key; the model can change from one message to the next; the agent knows the
  Studio's tools; no account and no cost of ours per call.
- Harder: we maintain an agent loop, two protocol translations, streaming and tool-call quirks per server, and a
  permission model; quality varies with the model the person picks, and the skills have to carry weaker models.
- Rules out: billing for model use, and a server-side agent. Driving an outside agent (ACP) is not ruled out later, as a
  second way in beside this one.
