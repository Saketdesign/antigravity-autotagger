const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 180000;
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ogv']);
const FRAME_SIZE = 360;
const SCENE_THRESHOLD = 0.12;

const isVideo = item => VIDEO_EXTS.has((item.ext || '').toLowerCase());

function pickImagePath(item) {
  const useOriginal = IMAGE_EXTS.has((item.ext || '').toLowerCase()) && item.size && item.size <= MAX_ORIGINAL_BYTES;
  return useOriginal || !item.thumbnailPath ? item.filePath : item.thumbnailPath;
}

function runTool(name, args, signal) {
  return new Promise((resolve, reject) => execFile(name, args, { env: devinEnv(), timeout: 60000, maxBuffer: 32 * 1024 * 1024, signal }, (err, stdout, stderr) => {
    if (!err) return resolve({ stdout, stderr });
    if (err.code === 'ENOENT') return reject(new Error(`${name} not found. Install it with: brew install ffmpeg`));
    reject(new Error(`${name} failed: ${(stderr || err.message).trim().split('\n').pop()}`));
  }));
}

async function probeVideo(file, signal) {
  const { stdout } = await runTool('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration:stream_side_data=rotation:format=duration', '-of', 'json', file], signal);
  const info = JSON.parse(stdout);
  const stream = info.streams?.[0];
  if (!stream) throw new Error('No video stream');
  const rotated = Math.abs(stream.side_data_list?.find(d => 'rotation' in d)?.rotation || 0) % 180 === 90;
  return {
    width: rotated ? stream.height : stream.width,
    height: rotated ? stream.width : stream.height,
    duration: Number(info.format?.duration) || Number(stream.duration) || 0,
  };
}

async function sceneChanges(file, signal) {
  const { stderr } = await runTool('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', `scale=160:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-'], signal);
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map(m => Number(m[1]));
}

const spread = (list, k) => k <= 0 ? [] : list.length <= k ? list : Array.from({ length: k }, (_, i) => list[Math.floor((i + 0.5) * list.length / k)]);

function pickFrameTimes(duration, scenes) {
  const n = Math.min(12, Math.max(6, Math.round(4 + duration * 0.4)));
  const evenCount = Math.max(Math.ceil(n / 2), n - scenes.length);
  const evens = Array.from({ length: evenCount }, (_, i) => (i + 0.5) * duration / evenCount);
  const times = [...evens, ...spread(scenes, n - evenCount)].sort((a, b) => a - b);
  return times.filter((t, i) => i === 0 || t - times[i - 1] > 0.15);
}

async function buildContactSheet(file, outDir, signal) {
  const { width, height, duration } = await probeVideo(file, signal);
  const times = pickFrameTimes(duration || 10, await sceneChanges(file, signal));
  const landscape = width >= height;
  const [fw, fh] = landscape ? [FRAME_SIZE, FRAME_SIZE * height / width] : [FRAME_SIZE * width / height, FRAME_SIZE];
  const cols = Math.min(6, Math.max(2, Math.round(Math.sqrt(times.length * fh / fw))));
  const rows = Math.ceil(times.length / cols);
  const select = times.map(t => `gte(t,${t.toFixed(3)})*lt(prev_t,${t.toFixed(3)})`).join('+');
  const sheetPath = path.join(outDir, 'frames.jpg');
  await runTool('ffmpeg', ['-hide_banner', '-y', '-i', file, '-an', '-vf',
    `select='${select}',scale=${landscape ? `${FRAME_SIZE}:-2` : `-2:${FRAME_SIZE}`},tile=${cols}x${rows}:padding=6:margin=6:color=white`,
    '-frames:v', '1', '-q:v', '3', sheetPath], signal);
  if (!fs.existsSync(sheetPath)) throw new Error('Could not extract frames from video');
  return { sheetPath, frames: times.length, duration };
}

function buildPrompt({ fileName, instructions, vocabulary, preferredTags, folders, want, currentName, currentTags, video }) {
  const fields = [];
  if (want.name) fields.push(`"name": short Title Case name, 3-6 words, that says what this ${video ? 'interaction ' : ''}is (include the product or brand name if visible)`);
  if (want.tags) fields.push('"tags": array of 8-15 tags covering platform (Mobile/Desktop), Full Screen or Partial Screen, Light Mode or Dark Mode, screen or page type, the main UI components, and visual style or mood' +
    (video ? ', plus 2-5 tags for the interaction: the gesture or trigger (e.g. Tap, Swipe, Drag, Scroll, Long Press), the motion (e.g. Transition, Expand, Slide, Morph, Fade, Parallax) and the kind of moment (e.g. Micro-interaction, Onboarding Flow, Loading, Success State)' : ''));
  if (want.annotation) fields.push(video
    ? '"annotation": 2-4 sentence description of the interaction: what the user does, what moves or changes on screen, and how it is designed'
    : '"annotation": 2-4 sentence description of what is shown and how it is designed');
  if (want.folder) fields.push(`"folder": the one folder this item belongs in, using the exact name from this list:\n${folders.map(f => `  - ${f.name}${f.description ? `: ${f.description}` : ''}`).join('\n')}`);

  return [
    `Use your read tool to open the image file "${fileName}" in the current directory and look at it carefully.`,
    video && `It is a contact sheet of ${video.frames} frames taken in order from a ${video.duration ? `${Math.round(video.duration)}-second ` : ''}screen recording of a UI interaction. Read the frames left to right, top to bottom, and work out what the user does and how the interface responds from frame to frame. Describe the recording, not the sheet.`,
    instructions && `Context: ${instructions}`,
    currentName && `Current item name: ${currentName}`,
    currentTags && currentTags.length && `Current tags: ${currentTags.join(', ')}`,
    want.tags && preferredTags && preferredTags.length && `These tags drive the library's smart folders. Whenever one of them accurately describes what is shown, include it with this exact spelling instead of a variant: ${preferredTags.join(', ')}`,
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
  if (typeof data.folder === 'string' && data.folder.trim()) out.folder = data.folder.trim();
  return out;
}

function leanConfigHome() {
  const root = path.join(os.tmpdir(), 'devin-autotagger-config');
  const dir = path.join(root, 'devin');
  fs.mkdirSync(dir, { recursive: true });
  let user = {};
  try { user = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/devin/config.json'), 'utf8')); } catch {}
  const config = {
    ...(user.devin && { devin: user.devin }),
    read_config_from: { agents_standard: false, cursor: false, windsurf: false, claude: false },
  };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dir, 'mcp_config.json'), JSON.stringify({ mcpServers: {} }));
  return root;
}

function devinEnv() {
  const home = os.homedir();
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: leanConfigHome(),
    PATH: [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', process.env.PATH].filter(Boolean).join(':'),
  };
}

function devinCommand(devinPath, args, cwd) {
  return new Promise(resolve => execFile(devinPath, args, { cwd, env: devinEnv(), timeout: 30000 }, (err, stdout) => resolve(err ? '' : stdout)));
}

async function deleteSessions(devinPath, cwd) {
  let sessions = [];
  try { sessions = JSON.parse(await devinCommand(devinPath, ['list', '--format', 'json'], cwd)); } catch {}
  for (const s of sessions) await devinCommand(devinPath, ['rm', '--force', s.id], cwd);
}

function runDevin({ devinPath, model, imagePath, prompt, signal }) {
  const args = ['--respect-workspace-trust', 'false', '--permission-mode', 'auto'];
  if (model) args.push('--model', model);
  args.push('-p', prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(devinPath, args, { cwd: path.dirname(imagePath), env: devinEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
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

const wantsFolder = (item, opts) => !!(opts.folder && opts.folders?.length && !(item.folders || []).length);

function applyResult(item, result, opts) {
  const folder = wantsFolder(item, opts) && result.folder && opts.folders.find(f => f.name.toLowerCase() === result.folder.toLowerCase());
  if (folder) {
    item.folders = [folder.id];
    result.folder = folder.name;
  } else delete result.folder;
  if (opts.name && result.name) item.name = result.name;
  if (opts.tags && result.tags) {
    const base = opts.replaceTags ? [] : item.tags || [];
    item.tags = [...new Set([...base, ...result.tags])];
  }
  if (opts.annotation && result.annotation && (opts.replaceAnnotation || !item.annotation)) item.annotation = result.annotation;
  if (opts.markerTag && !(item.tags || []).includes(opts.markerTag)) item.tags = [...(item.tags || []), opts.markerTag];
}

async function analyzeItem(item, opts, signal) {
  const workDir = isVideo(item) ? fs.mkdtempSync(path.join(os.tmpdir(), 'devin-autotagger-')) : null;
  let output;
  try {
    const sheet = workDir && await buildContactSheet(item.filePath, workDir, signal);
    const imagePath = sheet ? sheet.sheetPath : pickImagePath(item);
    if (!imagePath) throw new Error('No image file');
    const prompt = buildPrompt({
      fileName: path.basename(imagePath),
      instructions: opts.instructions,
      vocabulary: opts.vocabulary,
      preferredTags: opts.preferredTags,
      folders: opts.folders,
      want: { name: opts.name, tags: opts.tags, annotation: opts.annotation, folder: wantsFolder(item, opts) },
      currentName: item.name,
      currentTags: (item.tags || []).filter(t => t !== opts.markerTag),
      video: sheet && { frames: sheet.frames, duration: sheet.duration },
    });
    try {
      output = await runDevin({ devinPath: opts.devinPath, model: opts.model, imagePath, prompt, signal });
    } finally {
      await deleteSessions(opts.devinPath, path.dirname(imagePath));
    }
  } finally {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
  const result = parseResult(output);
  if (opts.tags && !result.tags?.length) throw new Error('Devin could not read the image');
  applyResult(item, result, opts);
  return result;
}

if (typeof module !== 'undefined') module.exports = { isVideo, buildContactSheet, pickImagePath, buildPrompt, parseResult, runDevin, applyResult, analyzeItem, deleteSessions };
