# Devin Autotagger (Eagle plugin)

Eagle plugin that names, tags and describes selected items by running `devin -p` once per image.

- `plugin.js`: UI, settings, run queue (max 2 at once; higher selections previously ran the Mac out of memory).
- `devin.js`: prompt, spawning Devin, parsing JSON, saving to the item, deleting each run's Devin session afterwards.
- Runs use `XDG_CONFIG_HOME=$TMPDIR/devin-autotagger-config` with a minimal config (org id only, no MCP servers, no imports, no permission allow-list). Do not redirect `XDG_DATA_HOME`: Devin's login lives there.
- Each run's cwd is the item's `.info` folder in the Eagle library; session cleanup only touches sessions in that folder.

## Related setup

- Eagle skill: `~/.config/devin/skills/eagle` (talks to Eagle's local server on port 41596; Eagle must be open with the MCP plugin enabled). The Eagle MCP server was removed from Devin's config in favour of the skill.
- Eagle library: `~/Design/Inspiration/UI Patterns-Mobile+web/Inspirations/Inspirations.library`.

## Testing

No test suite. To check a change without Eagle, require `devin.js` from node and call `analyzeItem` with a fake item pointing at an image in the library (don't call `save`). Check: a JSON result comes back, no MCP processes (firebase, figma-console) appear under the run, and no session is left in that `.info` folder. Reopen the plugin window in Eagle to load changes.
