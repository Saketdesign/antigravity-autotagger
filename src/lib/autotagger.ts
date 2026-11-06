// Settings and the Eagle lookups the run needs. The model call itself lives in public/agent.js (analyzeItem).

export const DEFAULTS = {
  instructions: 'This is a UI design mockup or screenshot. It is being organized in a UI design inspiration library.',
  optName: true,
  optTags: true,
  optReplaceTags: false,
  optAnnotation: true,
  optReplaceAnnotation: false,
  optFolder: true,
  optSkipDone: true,
  agyPath: `${(window as any).require('os').homedir()}/.local/bin/agy`,
  model: 'gemini-3.8-flash-medium',
  concurrency: 2,
  markerTag: 'Auto-tagged',
};
export type Settings = typeof DEFAULTS;

export const MAX_CONCURRENCY = 2;
const SETTINGS_KEY = 'autotagger-settings';
const OLD_SETTINGS_KEY = 'devin-autotagger-settings';
const OLD_MARKER_TAG = 'Tagged by Devin';
const VOCAB_SIZE = 150;
const VOCAB_EXCLUDE = /^Processed with AI Autotagger/;
const SOURCE_TAG = /^@|\.[a-z]{2,}$/i;
const FOLDER_EXCLUDE = /^Inbox$/i;

// Settings saved while the plugin ran Devin: keep everything except the Devin path, model and marker tag.
function migrateSettings() {
  const old = localStorage.getItem(OLD_SETTINGS_KEY);
  if (!old || localStorage.getItem(SETTINGS_KEY)) return;
  const { devinPath, model, markerTag, ...rest } = JSON.parse(old);
  if (markerTag && markerTag !== OLD_MARKER_TAG) rest.markerTag = markerTag;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  localStorage.removeItem(OLD_SETTINGS_KEY);
}

export function loadSettings(): Settings {
  migrateSettings();
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const s = { ...DEFAULTS, ...saved };
  s.concurrency = Math.min(s.concurrency, MAX_CONCURRENCY);
  return s;
}

// What the run reads: text fields trimmed, a blank or zero concurrency back to the default.
export function normalizeSettings(s: Settings): Settings {
  return {
    ...s,
    instructions: s.instructions.trim(),
    agyPath: s.agyPath.trim(),
    model: s.model.trim(),
    markerTag: s.markerTag.trim(),
    concurrency: Number(s.concurrency) || DEFAULTS.concurrency,
  };
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(s)));
}

export async function loadVocabulary(markerTag: string): Promise<string[]> {
  const tags = await eagle.tag.get();
  return tags
    .filter((t: any) => t.name !== markerTag && !VOCAB_EXCLUDE.test(t.name))
    .sort((a: any, b: any) => (b.count || 0) - (a.count || 0))
    .slice(0, VOCAB_SIZE)
    .map((t: any) => t.name);
}

export async function loadSmartFolderTags(markerTag: string): Promise<string[]> {
  const tags = new Set<string>();
  for (const folder of (await eagle.smartFolder?.getAll()) || []) {
    for (const group of folder.conditions || []) {
      if (group.boolean === 'FALSE') continue;
      for (const rule of group.rules || []) if (rule.property === 'tags' && Array.isArray(rule.value)) rule.value.forEach((t: string) => tags.add(t));
    }
  }
  return [...tags].filter(t => t !== markerTag && !SOURCE_TAG.test(t));
}

export async function loadFolders() {
  return (await eagle.folder.getAll())
    .filter((f: any) => !FOLDER_EXCLUDE.test(f.name))
    .map((f: any) => ({ id: f.id, name: f.name, description: f.description || '' }));
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
