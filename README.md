# Open Motion Studio

An open-source desktop IDE for making motion video with an agent: pick a motion from [motionhub.dev](https://motionhub.dev),
talk to an agent on the model and provider of your choice, watch it play, point at what to change, and export an MP4.
Projects are written for Remotion, HyperFrames, or the Studio's own native engine.

**Status: building.** A native film, a Remotion project or a HyperFrames project can be made with an agent in a motion from motionhub, on any model that speaks the Anthropic Messages or OpenAI Chat Completions protocol, pointed at on the picture, and exported; a read-only timeline comes next. Start with [the documentation](docs/README.md).

Licensed under the [Apache License 2.0](LICENSE).

## Development

```bash
corepack enable
pnpm install
pnpm dev
```
