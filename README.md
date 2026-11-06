# antigravity autotagger

> eagle plugin to name, tag, describe, and organize images and videos with antigravity.

[![ci](https://github.com/Saketdesign/antigravity-autotagger/actions/workflows/ci.yml/badge.svg)](https://github.com/Saketdesign/antigravity-autotagger/actions/workflows/ci.yml)
[![license: mit](https://img.shields.io/badge/license-mit-yellow.svg)](LICENSE)

![antigravity autotagger demo](assets/demo.gif)

## quick install

1. clone the repository:
   ```bash
   git clone https://github.com/Saketdesign/antigravity-autotagger.git
   ```
2. build the plugin:
   ```bash
   cd antigravity-autotagger && npm install && npm run build
   ```
3. in [eagle](https://eagle.cool): open `plugins` → `developer options` → `import local project...` → select the `antigravity-autotagger` directory.
4. open the plugin from the eagle toolbar or context menu.

## how it works

- runs the local antigravity cli (`agy -p`) once per item to inspect visual content with gemini.
- returns structured output for title, tags, description/annotation, and folder destination.
- renames items, assigns tags while respecting your existing library vocabulary and smart-folder rules, and files them into matching folders.
- for videos, generates a downscaled contact sheet of key frames using ffmpeg to tag motion, gestures, and interaction states without editing the original video.
- cleans up conversation databases after each run to keep your disk clean.

## prerequisites

- [eagle](https://eagle.cool) 4.0 or newer
- antigravity cli installed at `~/.local/bin/agy` (or configure your custom path in settings)
- ffmpeg (required for video contact sheets):
  ```bash
  brew install ffmpeg
  ```

## development

```bash
# install dependencies
npm install

# build once
npm run build

# watch mode during development
npm run dev

# lint with glaze rules
npm run lint
```

## contributing

pull requests and bug reports are welcome. see [CONTRIBUTING.md](CONTRIBUTING.md).

## community & support

- bug reports and questions are triaged within 24 hours.
- general feedback and suggestions live in [discussions](https://github.com/Saketdesign/antigravity-autotagger/discussions).

## license

[mit](LICENSE) © 2026 saket joshi
