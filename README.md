<div align="center">

<a href="https://openmotion.studio/"><img src="apps/desktop/resources/icon.svg" width="88" height="88" alt="OpenMotionStudio" /></a>

# OpenMotionStudio

**You have the eye. Now you have the hands.**

An open-source desktop studio for making motion video with an AI agent.<br />
Describe the film, point at what to change on the picture, and export an MP4.

[![Release](https://img.shields.io/github/v/release/motionhubdev/openmotionstudio?color=EE6348&label=release)](https://github.com/motionhubdev/openmotionstudio/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/motionhubdev/openmotionstudio/build.yml?branch=main&label=build)](https://github.com/motionhubdev/openmotionstudio/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-8A3021)](LICENSE)
![Platforms](https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-desktop-555)

[**Download**](https://openmotion.studio/#get) ·
[Website](https://openmotion.studio/) ·
[90-second tour](https://openmotion.studio/#tour) ·
[Documentation](docs/README.md) ·
[Changelog](CHANGELOG.md)

<br />

<a href="https://openmotion.studio/#tour"><img src="site/media/workspace-tour.webp" width="900" alt="The OpenMotionStudio workspace: the agent's conversation on the left, the film playing in the middle, its outline on the right and the timeline below" /></a>

</div>

## How it works

1. **Pick a look.** Start from a motion on [motionhub.dev](https://motionhub.dev): a designer's rules, type, colour and
   components, which the agent draws with. Or start from nothing.
2. **Say what you want.** An agent on the model you choose writes the film, plays it and checks its own frames.
3. **Point at the picture.** Pick an element or draw a region on a frame, say what should change, and the change lands
   as one edit, kept as a version on your disk.
4. **Export an MP4.** The Studio bundles, plays and renders the film itself. There is nothing else to install.

## One brief, three looks

<table>
  <tr>
    <td align="center" width="33%">
      <a href="https://motionhub.dev/@iamsuosi/riso-pop/"><img src="site/media/look-editorial.webp" alt="A study in motion, in Riso Pop" /></a>
      <br /><sub><b>Riso Pop</b> · print</sub>
    </td>
    <td align="center" width="33%">
      <a href="https://motionhub.dev/@iamsuosi/stage-light/"><img src="site/media/look-product.webp" alt="A study in motion, in Stage Light" /></a>
      <br /><sub><b>Stage Light</b> · product</sub>
    </td>
    <td align="center" width="33%">
      <a href="https://motionhub.dev/@iamsuosi/night-diagram/"><img src="site/media/look-data.webp" alt="A study in motion, in Night Diagram" /></a>
      <br /><sub><b>Night Diagram</b> · data</sub>
    </td>
  </tr>
</table>

<sub>The same brief, “A study in motion,” made in the Studio with three looks by SuoSi on MotionHub.</sub>

## Yours

No account, no credits, no server of ours between you and your film.

|                      |                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **Directed by**      | You                                                                                                |
| **Animated by**      | An agent on the model you choose: Anthropic, OpenAI-compatible, a local model, or the Claude Code or Codex you already use |
| **Looks by**         | Designers on [MotionHub](https://motionhub.dev)                                                    |
| **Footage**          | Yours, including clips you generated elsewhere                                                     |
| **Voice**            | The voice provider you pick, with captions timed to every line                                     |
| **Filed in**         | A folder on your disk                                                                              |
| **Keys kept in**     | Your system's keychain                                                                             |
| **Engine & export**  | Included. Nothing else to install                                                                  |
| **Licence**          | Apache-2.0                                                                                         |

## For developers

A film is `film.tsx`: scenes, layers and media drawn over time with `@motionhub/runtime`, which the Studio plays and
exports itself. Read [positioning](docs/prd/positioning.md) and [the architecture](docs/tech/architecture.md) first; the
decisions are in [`docs/adr/`](docs/adr/).

```bash
corepack enable
pnpm install
pnpm dev
```

Use the Node version in `.nvmrc`. Before a push, run the gate CI runs on all three platforms:
`pnpm typecheck && pnpm test && pnpm build`.

## License

Licensed under the [Apache License 2.0](LICENSE). Windows releases are signed under our
[code signing policy](docs/ops/code-signing.md): free code signing provided by SignPath.io, certificate by SignPath Foundation.
