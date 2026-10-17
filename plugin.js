const DEFAULTS = {
  instructions: 'This is a UI design mockup or screenshot. It is being organized in a UI design inspiration library.',
  optName: true,
  optTags: true,
  optReplaceTags: false,
  optAnnotation: true,
  optReplaceAnnotation: false,
  optSkipDone: true,
  devinPath: `${require('os').homedir()}/.local/bin/devin`,
  model: '',
  concurrency: 3,
  markerTag: 'Tagged by Devin',
};
const SETTINGS_KEY = 'devin-autotagger-settings';
const VOCAB_SIZE = 150;
const VOCAB_EXCLUDE = /^Processed with AI Autotagger/;

const $ = id => document.getElementById(id);
let selected = [];
let controller = null;

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const s = { ...DEFAULTS, ...saved };
  for (const [key, value] of Object.entries(s)) {
    const el = $(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
  }
}

function readSettings() {
  const s = {};
  for (const key of Object.keys(DEFAULTS)) {
    const el = $(key);
    s[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) || DEFAULTS[key] : el.value.trim();
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  return s;
}

function updateTheme() {
  document.documentElement.setAttribute('theme', (eagle.app.theme || 'dark').toLowerCase());
}

async function refreshSelection() {
  if (controller) return;
  selected = await eagle.item.getSelected();
  const n = selected.length;
  $('selection').textContent = n ? `${n} item${n > 1 ? 's' : ''} selected` : 'No items selected';
  $('runBtn').textContent = n ? `Analyze ${n} Item${n > 1 ? 's' : ''}` : 'Analyze';
  $('runBtn').disabled = !n;
}

async function loadVocabulary(markerTag) {
  const tags = await eagle.tag.get();
  return tags
    .filter(t => t.name !== markerTag && !VOCAB_EXCLUDE.test(t.name))
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, VOCAB_SIZE)
    .map(t => t.name);
}

function addLogRow(item) {
  const li = document.createElement('li');
  li.innerHTML = `<img><div><div class="name"></div><div class="meta"></div><div class="meta status">Waiting…</div></div>`;
  li.querySelector('img').src = `file://${item.thumbnailPath}`;
  li.querySelector('.name').textContent = item.name;
  $('log').appendChild(li);
  return {
    set(status, cls) { li.querySelector('.status').textContent = status; if (cls) li.className = cls; },
    done(item, result) {
      li.querySelector('.name').textContent = item.name;
      li.querySelector('.meta').textContent = (result.tags || []).join(', ');
    },
  };
}

async function run() {
  const s = readSettings();
  const opts = {
    instructions: s.instructions,
    name: s.optName,
    tags: s.optTags,
    replaceTags: s.optReplaceTags,
    annotation: s.optAnnotation,
    replaceAnnotation: s.optReplaceAnnotation,
    devinPath: s.devinPath,
    model: s.model,
    markerTag: s.markerTag,
  };
  if (!opts.name && !opts.tags && !opts.annotation) return alert('Pick at least one thing to update.');

  const items = selected.filter(i => !(s.optSkipDone && opts.markerTag && (i.tags || []).includes(opts.markerTag)));
  const skipped = selected.length - items.length;

  controller = new AbortController();
  $('runBtn').disabled = true;
  $('stopBtn').hidden = false;
  $('log').innerHTML = '';

  opts.vocabulary = opts.tags ? await loadVocabulary(opts.markerTag) : [];

  let done = 0, failed = 0;
  const progress = () => { $('progress').textContent = `${done + failed}/${items.length}${failed ? ` · ${failed} failed` : ''}${skipped ? ` · ${skipped} skipped` : ''}`; };
  progress();

  const queue = items.map(item => ({ item, row: addLogRow(item) }));
  const worker = async () => {
    while (queue.length && !controller.signal.aborted) {
      const { item, row } = queue.shift();
      row.set('Asking Devin…');
      try {
        const result = await analyzeItem(item, opts, controller.signal);
        await item.save();
        row.done(item, result);
        row.set('Done', 'ok');
        done++;
      } catch (err) {
        row.set(err.message, 'err');
        failed++;
      }
      progress();
    }
  };
  await Promise.all(Array.from({ length: Math.min(s.concurrency, items.length) }, worker));

  controller = null;
  $('stopBtn').hidden = true;
  await refreshSelection();
}

eagle.onPluginCreate(() => {
  updateTheme();
  loadSettings();
  document.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', readSettings));
  $('runBtn').addEventListener('click', run);
  $('stopBtn').addEventListener('click', () => controller?.abort());
  refreshSelection();
  window.addEventListener('focus', refreshSelection);
  setInterval(refreshSelection, 1500);
});

eagle.onThemeChanged(updateTheme);
