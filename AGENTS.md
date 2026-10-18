# Devin Autotagger (Eagle plugin)

Eagle plugin that names, tags and describes selected items by running `devin -p` once per image.

- `plugin.js`: UI, settings, run queue (max 2 at once; higher selections previously ran the Mac out of memory).
- `devin.js`: prompt, spawning Devin, parsing JSON, saving to the item, deleting each run's Devin session afterwards.
- Runs use `XDG_CONFIG_HOME=$TMPDIR/devin-autotagger-config` with a minimal config (org id only, no MCP servers, no imports, no permission allow-list). Do not redirect `XDG_DATA_HOME`: Devin's login lives there.
- Each run's cwd is the item's `.info` folder in the Eagle library; session cleanup only touches sessions in that folder.
- Tags used by smart-folder rules (read from `eagle.smartFolder` at run start, skipping exclude groups and source tags like `vibrant.design`/`@handle`) are sent to Devin as preferred exact spellings, so new items land in smart folders.
- Folders: Devin picks one of the library's regular folders (name + description, `Inbox` excluded since it's for manual imports). Only applied to items with no folder; existing folders are never changed.
- Design Scrapper imports land with no folder; the `To Tag` smart folder (source tags, minus `Tagged by Devin`, set via Eagle's web API because the skill drops the exclude flag) is where to select them for a run.
- Videos: ffmpeg (Homebrew) builds one downscaled contact sheet (6-12 frames, 360px, scene changes plus evenly spaced frames, in reading order) in a temp folder, which becomes the run's cwd and is deleted afterwards. The original video is never modified. The prompt asks about the interaction (gesture, motion, moment). This ffmpeg build has no `drawtext`, so frames aren't numbered.

## Related setup

- Eagle skill: `~/.config/devin/skills/eagle` (talks to Eagle's local server on port 41596; Eagle must be open with the MCP plugin enabled). The Eagle MCP server was removed from Devin's config in favour of the skill.
- Eagle library: `~/Design/Inspiration/UI Patterns-Mobile+web/Inspirations/Inspirations.library`.

## Testing

No test suite. To check a change without Eagle, require `devin.js` from node and call `analyzeItem` with a fake item pointing at an image in the library (don't call `save`). Check: a JSON result comes back, no MCP processes (firebase, figma-console) appear under the run, and no session is left in that `.info` folder. Reopen the plugin window in Eagle to load changes.
