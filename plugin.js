const DEFAULTS = {
  instructions: 'This is a UI design mockup or screenshot. It is being organized in a UI design inspiration library.',
  optName: true,
  optTags: true,
  optReplaceTags: false,
  optAnnotation: true,
  optReplaceAnnotation: false,
  optFolder: true,
  optSkipDone: true,
  devinPath: `${require('os').homedir()}/.local/bin/devin`,
  model: 'claude-opus-5-5-low',
  concurrency: 2,
  markerTag: 'Tagged by Devin',
};
const SETTINGS_KEY = 'devin-autotagger-settings';
const MAX_CONCURRENCY = 2;
const VOCAB_SIZE = 150;
const VOCAB_EXCLUDE = /^Processed with AI Autotagger/;
const SOURCE_TAG = /^@|\.[a-z]{2,}$/i;
const FOLDER_EXCLUDE = /^Inbox$/i;

const $ = id => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
let selected = [];
let controller = null;
let hasRun = false;
let lastFailed = [];

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const s = { ...DEFAULTS, ...saved };
  s.concurrency = Math.min(s.concurrency, MAX_CONCURRENCY);
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
  const marker = $('markerTag').value.trim();
  const tagged = $('optSkipDone').checked && marker ? selected.filter(i => (i.tags || []).includes(marker)).length : 0;
  $('selection').textContent = !n ? 'No items selected' : `${plural(n, 'item')} selected${tagged ? ` · ${tagged} already tagged` : ''}`;
  $('runBtn').textContent = n ? `Analyze ${plural(n, 'Item')}` : 'Analyze';
  $('runBtn').disabled = !n;
  if (!hasRun) showEmpty(n ? `Ready to analyze ${plural(n, 'item')}. Results will show up here.` : 'Select one or more images or videos in Eagle to get started.');
}

function showEmpty(text) {
  $('log').innerHTML = '';
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  $('log').appendChild(li);
}

function setRunning(running) {
  document.body.classList.toggle('running', running);
  document.querySelectorAll('main input, main textarea').forEach(el => { el.disabled = running; });
  $('runBtn').disabled = running;
  if (running) $('runBtn').textContent = 'Analyzing…';
  $('stopBtn').hidden = !running;
  $('stopBtn').disabled = false;
  $('stopBtn').textContent = 'Stop';
}

function showSummary(kind, text, canRetry = false) {
  $('summary').className = kind;
  $('summaryText').textContent = text;
  $('retryBtn').hidden = !canRetry;
  $('summary').hidden = false;
}

async function loadVocabulary(markerTag) {
  const tags = await eagle.tag.get();
  return tags
    .filter(t => t.name !== markerTag && !VOCAB_EXCLUDE.test(t.name))
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, VOCAB_SIZE)
    .map(t => t.name);
}

async function loadSmartFolderTags(markerTag) {
  const tags = new Set();
  for (const folder of (await eagle.smartFolder?.getAll()) || []) {
    for (const group of folder.conditions || []) {
      if (group.boolean === 'FALSE') continue;
      for (const rule of group.rules || []) if (rule.property === 'tags' && Array.isArray(rule.value)) rule.value.forEach(t => tags.add(t));
    }
  }
  return [...tags].filter(t => t !== markerTag && !SOURCE_TAG.test(t));
}

async function loadFolders() {
  return (await eagle.folder.getAll())
    .filter(f => !FOLDER_EXCLUDE.test(f.name))
    .map(f => ({ id: f.id, name: f.name, description: f.description || '' }));
}

function addLogRow(item) {
  const li = document.createElement('li');
  li.innerHTML = `<img><div class="body"><div class="name"></div><div class="status"><i class="icon"></i><span class="text"></span></div><div class="meta"></div></div>`;
  li.querySelector('img').src = `file://${item.thumbnailPath}`;
  li.querySelector('.name').textContent = item.name;
  $('log').appendChild(li);
  const text = li.querySelector('.text');
  let timer = null;
  const set = (state, status, title = '') => {
    clearInterval(timer);
    li.className = state;
    text.textContent = status;
    text.title = title;
  };
  set('queued', 'Queued');
  return {
    start() {
      set('running', 'Analyzing…');
      const startedAt = Date.now();
      timer = setInterval(() => { text.textContent = `Analyzing… ${Math.round((Date.now() - startedAt) / 1000)}s`; }, 1000);
      li.scrollIntoView({ block: 'nearest' });
    },
    done(item, result) {
      set('ok', 'Done');
      li.querySelector('.name').textContent = item.name;
      li.querySelector('.meta').textContent = [result.folder && `→ ${result.folder}`, (result.tags || []).join(', ')].filter(Boolean).join(' · ');
    },
    fail(message) { set('err', message, message); },
    skip(reason) { set('skipped', reason); },
  };
}

async function run(retryItems) {
  const s = readSettings();
  const opts = {
    instructions: s.instructions,
    name: s.optName,
    tags: s.optTags,
    replaceTags: s.optReplaceTags,
    annotation: s.optAnnotation,
    replaceAnnotation: s.optReplaceAnnotation,
    folder: s.optFolder,
    devinPath: s.devinPath,
    model: s.model,
    markerTag: s.markerTag,
  };
  if (!opts.name && !opts.tags && !opts.annotation && !opts.folder) return alert('Pick at least one thing to update.');

  const source = retryItems || selected;
  const isDone = i => !retryItems && s.optSkipDone && opts.markerTag && (i.tags || []).includes(opts.markerTag);
  const items = source.filter(i => !isDone(i));
  const skippedItems = source.filter(isDone);

  hasRun = true;
  lastFailed = [];
  $('log').innerHTML = '';
  $('summary').hidden = true;
  $('progress').textContent = '';
  $('bar').hidden = true;
  skippedItems.forEach(item => addLogRow(item).skip('Skipped · already tagged'));

  if (!items.length) {
    showSummary('info', `Nothing to do. ${skippedItems.length === 1 ? 'This item was' : `All ${skippedItems.length} items were`} already tagged. Turn off “Skip items already processed” to redo them.`);
    return;
  }

  controller = new AbortController();
  const { signal } = controller;
  setRunning(true);

  const queue = items.map(item => ({ item, row: addLogRow(item) }));
  let done = 0, stopped = 0;
  const failed = [];
  const progress = () => {
    const finished = done + failed.length;
    $('progress').textContent = `${finished} of ${items.length}${failed.length ? ` · ${failed.length} failed` : ''}`;
    $('barFill').style.width = `${(finished / items.length) * 100}%`;
    $('selection').textContent = signal.aborted ? 'Stopping…' : `Analyzing… ${finished} of ${items.length} done`;
  };
  $('bar').hidden = false;
  progress();

  const safe = promise => promise.catch(() => []);
  [opts.vocabulary, opts.preferredTags, opts.folders] = await Promise.all([
    opts.tags ? safe(loadVocabulary(opts.markerTag)) : [],
    opts.tags ? safe(loadSmartFolderTags(opts.markerTag)) : [],
    opts.folder ? safe(loadFolders()) : [],
  ]);
  opts.vocabulary = opts.vocabulary.filter(t => !opts.preferredTags.includes(t));

  const worker = async () => {
    while (queue.length && !signal.aborted) {
      const { item: queued, row } = queue.shift();
      row.start();
      try {
        const item = (await eagle.item.getById(queued.id)) || queued;
        const result = await analyzeItem(item, opts, signal);
        await item.save();
        row.done(item, result);
        done++;
      } catch (err) {
        if (signal.aborted) {
          row.skip('Stopped');
          stopped++;
        } else {
          row.fail(err.message);
          failed.push({ item: queued, message: err.message });
        }
      }
      progress();
    }
  };
  await Promise.all(Array.from({ length: Math.min(s.concurrency, MAX_CONCURRENCY, items.length) }, worker));
  queue.forEach(({ row }) => { row.skip('Not started'); stopped++; });

  controller = null;
  lastFailed = failed.map(f => f.item);
  setRunning(false);
  finish({ total: items.length, done, failed, stopped, skipped: skippedItems.length });
  await refreshSelection();
}

function finish({ total, done, failed, stopped, skipped }) {
  const skippedNote = skipped ? ` ${plural(skipped, 'item')} skipped (already tagged).` : '';
  const canRetry = failed.length > 0;
  let kind, title, body;
  if (stopped) {
    kind = 'info';
    body = `Stopped. ${done} analyzed${failed.length ? `, ${failed.length} failed` : ''}, ${stopped} not finished.`;
  } else if (!failed.length) {
    kind = 'ok';
    title = 'Analysis complete';
    body = total === 1 ? 'Your item was analyzed.' : `All ${total} items were analyzed.`;
  } else if (!done) {
    kind = 'err';
    title = 'Analysis failed';
    body = `${total === 1 ? 'The item' : `All ${total} items`} failed. ${failed[0].message}`;
  } else {
    kind = 'warn';
    title = 'Analysis finished with errors';
    body = `${done} of ${total} analyzed, ${failed.length} failed.`;
  }
  showSummary(kind, body + skippedNote, canRetry);
  if (title) eagle.notification?.show({ title, body: body + skippedNote, icon: new URL('logo.png', location.href).href, mute: false }).catch(() => {});
}

eagle.onPluginCreate(() => {
  updateTheme();
  loadSettings();
  document.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', readSettings));
  $('runBtn').addEventListener('click', () => run());
  $('retryBtn').addEventListener('click', () => lastFailed.length && run(lastFailed));
  $('stopBtn').addEventListener('click', () => {
    if (!controller) return;
    controller.abort();
    $('stopBtn').disabled = true;
    $('stopBtn').textContent = 'Stopping…';
    $('selection').textContent = 'Stopping…';
  });
  window.addEventListener('beforeunload', () => controller?.abort());
  refreshSelection();
  window.addEventListener('focus', refreshSelection);
  setInterval(refreshSelection, 1500);
});

eagle.onThemeChanged(updateTheme);
