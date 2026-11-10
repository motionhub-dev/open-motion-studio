# Positioning

> **Status:** Plan · **Updated:** 2026-11-10

What Open Motion Studio is, who it is for, what it is instead of, what it will not do, and the smallest version worth shipping.

## What it is, and for whom

**Open Motion Studio is an open-source desktop IDE for making motion video with an agent.** A person opens a folder, picks a
motion from [motionhub.dev](https://motionhub.dev) (or starts from none), talks to an agent running on the model and provider
of their choice, watches the result play live, points at what is wrong on the picture, and exports an MP4.

It is engine-neutral. A project is written for one of three engines, chosen when it is created:

| Engine | What a project is | Why someone picks it |
| --- | --- | --- |
| **Remotion** | A Remotion project (React compositions) | They already know Remotion, or need its ecosystem |
| **HyperFrames** | A HyperFrames project (HTML + GSAP) | They want HTML compositions and an Apache-2.0 stack |
| **Native** | React compositions drawn with `@motionhub/runtime` alone, played and exported by the Studio | They want nothing else to install or license |

A motion is the unit of look: its rules for the agent (`MOTION.md`), its tokens and its React components. The motionhub
format is engine-neutral already (`@motionhub/remotion`, `@motionhub/hyperframes`, `@motionhub/runtime`), so the same motion
can be used in any of the three engines, and the Studio is where that format is made useful.

It is for people who make short explainers, product clips, social video and motion graphics and who want an agent to do
the drawing, but who do not want to wire a terminal agent, a preview server and a render script together by hand, and who
want to choose (and pay for) their own model.

## What it is instead of

- **Remotion Studio**: a preview and render UI with no agent, tied to one engine, under a licence that companies pay for.
- **HyperFrames Studio**: a preview and editor tied to HTML compositions; its agent lives outside it, in a terminal.
- **A terminal agent beside a browser tab**: Claude Code or Codex writing files while a dev server reloads. It works, and
  it is what the Studio replaces: the agent cannot see what the person points at, the person cannot see what the agent
  looked at, and the model is the agent vendor's.
- **A hosted AI video service**: the Studio has no account, no credits and no server. The files stay on the person's disk
  and the model calls go from their machine to their provider.

## Non-goals

- **No hosting**: no accounts, no billing, no cloud render, no sharing links, no collaboration.
- **No hand editing of a component**: no keyframe editor, no property sliders on a component's internals. What a component
  draws is code, changed by asking the agent. The person edits text, order and timing only where an engine exposes them as
  data.
- **No image, video or music generation** in the first versions. Media the person brings is used as it is.
- **No NLE work**: no colour grading, masks or multi-track audio editing. Export and finish elsewhere.
- **No plugin marketplace.** Engines are built in; motions come from motionhub.
- **No new motion format.** The Studio reads and writes the motionhub format as it is specified in `motionhub-dev/motions`;
  a change to the format is made there first.
- **No agent vendor lock-in**, and no proxy of ours between a person and their model.

## The smallest useful version

One path, end to end, on macOS, Windows and Linux:

1. Install the desktop app, open or create a project folder, and choose its engine.
2. Search motionhub, watch a motion's reel, and use it in the project.
3. Add a provider and a key (any server that speaks the Anthropic Messages or the OpenAI Chat Completions protocol).
4. Ask the agent for a video. It writes the composition with the motion's components, looks at stills of its own work,
   and fixes what it sees.
5. Watch it play; mark a region or an element on the picture and ask for a change.
6. Export an MP4.

Left out of it: narration and text-to-speech, version history beyond git, a timeline that edits, more than one
composition per project, and auto-update. Whether narration ever belongs in the Studio is an open question in
[the architecture](../tech/architecture.md#open-questions).
