const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 180000;

function pickImagePath(item) {
  const useOriginal = IMAGE_EXTS.has((item.ext || '').toLowerCase()) && item.size && item.size <= MAX_ORIGINAL_BYTES;
  return useOriginal || !item.thumbnailPath ? item.filePath : item.thumbnailPath;
}

function buildPrompt({ fileName, instructions, vocabulary, want, currentName, currentTags }) {
  const fields = [];
  if (want.name) fields.push('"name": short Title Case name, 3-6 words, that says what this is (include the product or brand name if visible)');
  if (want.tags) fields.push('"tags": array of 8-15 tags covering platform (Mobile/Desktop), Full Screen or Partial Screen, Light Mode or Dark Mode, screen or page type, the main UI components, and visual style or mood');
  if (want.annotation) fields.push('"annotation": 2-4 sentence description of what is shown and how it is designed');

  return [
    `Use your read tool to open the image file "${fileName}" in the current directory and look at it carefully.`,
    instructions && `Context: ${instructions}`,
    currentName && `Current item name: ${currentName}`,
    currentTags && currentTags.length && `Current tags: ${currentTags.join(', ')}`,
    vocabulary && vocabulary.length && `This library already uses these tags. Reuse the exact spelling when one fits, but you decide the final set and may add new tags when nothing fits: ${vocabulary.join(', ')}`,
    `Reply with ONLY a JSON object (no prose, no code fences) with these keys:\n- ${fields.join('\n- ')}`,
  ].filter(Boolean).join('\n\n');
}

function parseResult(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Devin did not return JSON');
  const data = JSON.parse(text.slice(start, end + 1));
  const out = {};
  if (typeof data.name === 'string' && data.name.trim()) out.name = data.name.trim();
  if (Array.isArray(data.tags)) out.tags = [...new Set(data.tags.map(t => String(t).trim()).filter(Boolean))];
  if (typeof data.annotation === 'string' && data.annotation.trim()) out.annotation = data.annotation.trim();
  return out;
}

function runDevin({ devinPath, model, imagePath, prompt, signal }) {
  const args = ['--respect-workspace-trust', 'false', '--permission-mode', 'auto'];
  if (model) args.push('--model', model);
  args.push('-p', prompt);

  const home = os.homedir();
  const env = {
    ...process.env,
    HOME: home,
    PATH: [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH].filter(Boolean).join(':'),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(devinPath, args, { cwd: path.dirname(imagePath), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const kill = () => child.kill('SIGTERM');
    const timer = setTimeout(kill, TIMEOUT_MS);
    signal?.addEventListener('abort', kill);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) return reject(new Error('Stopped'));
      if (code !== 0) return reject(new Error((stderr || stdout).trim().split('\n').pop() || `Devin exited with code ${code}`));
      resolve(stdout);
    });
  });
}

function applyResult(item, result, opts) {
  if (opts.name && result.name) item.name = result.name;
  if (opts.tags && result.tags) {
    const base = opts.replaceTags ? [] : item.tags || [];
    item.tags = [...new Set([...base, ...result.tags])];
  }
  if (opts.annotation && result.annotation && (opts.replaceAnnotation || !item.annotation)) item.annotation = result.annotation;
  if (opts.markerTag && !(item.tags || []).includes(opts.markerTag)) item.tags = [...(item.tags || []), opts.markerTag];
}

async function analyzeItem(item, opts, signal) {
  const imagePath = pickImagePath(item);
  if (!imagePath) throw new Error('No image file');
  const prompt = buildPrompt({
    fileName: path.basename(imagePath),
    instructions: opts.instructions,
    vocabulary: opts.vocabulary,
    want: { name: opts.name, tags: opts.tags, annotation: opts.annotation },
    currentName: item.name,
    currentTags: (item.tags || []).filter(t => t !== opts.markerTag),
  });
  const output = await runDevin({ devinPath: opts.devinPath, model: opts.model, imagePath, prompt, signal });
  const result = parseResult(output);
  if (opts.tags && !result.tags?.length) throw new Error('Devin could not read the image');
  applyResult(item, result, opts);
  return result;
}

if (typeof module !== 'undefined') module.exports = { pickImagePath, buildPrompt, parseResult, runDevin, applyResult, analyzeItem };
