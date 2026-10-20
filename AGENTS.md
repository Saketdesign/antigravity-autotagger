# Antigravity Autotagger (Eagle plugin)

Eagle plugin that names, tags and describes selected items by running the Antigravity CLI (`agy -p`, default model `gemini-3.8-flash-medium`) once per image. It used Devin until the Devin subscription ended; the repo name is historical.

- `plugin.js`: UI, settings, run queue (max 2 at once; higher selections previously ran the Mac out of memory). Settings saved under the old Devin key are migrated once (Devin path, model and old marker tag dropped).
- `agent.js`: prompt, spawning `agy`, parsing JSON, saving to the item, deleting each run's Antigravity conversation afterwards.
- Runs use `--output-format json` plus `--json-schema` built from the wanted fields (folder is an enum of folder names); the answer comes back in `structured_output`, with `response` text as a fallback. `--mode auto` isn't available on this account, and print mode reads files in the cwd without a permission prompt.
- Antigravity's config lives in `~/.gemini` and can't be redirected. The configured MCP servers don't start in print mode (checked with `ps`), so runs use the normal config.
- Each run leaves `~/.gemini/antigravity-cli/conversations/<id>.db` and `brain/<id>/`; only the `conversation_id` from that run's JSON output is deleted. A run killed by Stop or the timeout prints no id, so its conversation stays behind.
- Each run's cwd is the item's `.info` folder in the Eagle library.
- Tags used by smart-folder rules (read from `eagle.smartFolder` at run start, skipping exclude groups and source tags like `vibrant.design`/`@handle`) are sent to the model as preferred exact spellings, so new items land in smart folders.
- Folders: the model picks one of the library's regular folders (name + description, `Inbox` excluded since it's for manual imports). Only applied to items with no folder; existing folders are never changed.
- Marker tag is `Auto-tagged` (renamed library-wide from `tagged by Devin` on 2026-10-20).
- Design Scrapper imports land with no folder; the `To Tag` smart folder (source tags, minus `Auto-tagged`) is where to select them for a run. Edit it through Eagle's web API (`POST localhost:41595/api/v2/smartFolder/update` with `id` + `conditions`), because the Eagle skill drops the exclude flag and its smart-folder tools are disabled.
- Videos: ffmpeg (Homebrew) builds one downscaled contact sheet (6-12 frames, 360px, scene changes plus evenly spaced frames, in reading order) in a temp folder, which becomes the run's cwd and is deleted afterwards. The original video is never modified. The prompt asks about the interaction (gesture, motion, moment). This ffmpeg build has no `drawtext`, so frames aren't numbered.

## Related setup

- Antigravity CLI: `~/.local/bin/agy` (`agy models` lists model ids).
- Eagle skill: `~/.config/devin/skills/eagle` (talks to Eagle's local server on port 41596; Eagle must be open with the MCP plugin enabled).
- Eagle library: `~/Design/Inspiration/UI Patterns-Mobile+web/Inspirations/Inspirations.library`.

## Testing

No test suite. To check a change without Eagle, require `agent.js` from node and call `analyzeItem` with a fake item pointing at an image in the library (don't call `save`). Check: a JSON result comes back, no MCP processes appear under the `agy` process, and no new entry is left in `~/.gemini/antigravity-cli/conversations` or `brain`. Reopen the plugin window in Eagle to load changes.
