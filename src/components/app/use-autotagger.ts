import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  loadFolders, loadSettings, loadSmartFolderTags, loadVocabulary, MAX_CONCURRENCY,
  normalizeSettings, plural, saveSettings, type Settings,
} from '@/lib/autotagger';

export type RowState = 'queued' | 'running' | 'ok' | 'err' | 'skipped';
export type Row = {id: string; name: string; thumb: string; state: RowState; text: string; meta: string; startedAt?: number};
export type Summary = {kind: 'ok' | 'warn' | 'fail' | 'neutral'; title?: string; text: string; canRetry: boolean};
export type Progress = {finished: number; total: number; failed: number};

const rowFor = (item: any, state: RowState, text: string): Row => ({
  id: item.id, name: item.name, thumb: `file://${item.thumbnailPath}`, state, text, meta: '',
});

function summarize({total, done, failed, stopped, skipped}: {total: number; done: number; failed: {message: string}[]; stopped: number; skipped: number}): Summary {
  const skippedNote = skipped ? ` ${plural(skipped, 'item')} skipped (already tagged).` : '';
  const canRetry = failed.length > 0;
  let kind: Summary['kind'], title: string | undefined, body: string;
  if (stopped) {
    kind = 'neutral';
    body = `stopped. ${done} analyzed${failed.length ? `, ${failed.length} failed` : ''}, ${stopped} not finished.`;
  } else if (!failed.length) {
    kind = 'ok';
    title = 'analysis complete';
    body = total === 1 ? 'your item was analyzed.' : `all ${total} items were analyzed.`;
  } else if (!done) {
    kind = 'fail';
    title = 'analysis failed';
    body = `${total === 1 ? 'the item' : `all ${total} items`} failed. ${failed[0].message}`;
  } else {
    kind = 'warn';
    title = 'analysis finished with errors';
    body = `${done} of ${total} analyzed, ${failed.length} failed.`;
  }
  return {kind, title, text: body + skippedNote, canRetry};
}

export function useAutotagger() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [selected, setSelected] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastFailed = useRef<any[]>([]);

  useEffect(() => saveSettings(settings), [settings]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(s => ({...s, [key]: value}));
  }, []);

  const refreshSelection = useCallback(async () => {
    if (controller.current) return;
    setSelected(await eagle.item.getSelected());
  }, []);

  // Eagle's API only exists once the plugin is created.
  useEffect(() => {
    const applyTheme = () => {
      const theme = String(eagle.app.theme || 'dark').toLowerCase();
      document.documentElement.setAttribute('data-theme', theme === 'light' || theme === 'lightgray' ? 'light' : 'dark');
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    const onFocus = () => { refreshSelection(); };
    const onUnload = () => controller.current?.abort();
    eagle.onPluginCreate(() => {
      applyTheme();
      refreshSelection();
      window.addEventListener('focus', onFocus);
      timer = setInterval(refreshSelection, 1500);
    });
    eagle.onThemeChanged(applyTheme);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [refreshSelection]);

  const patchRow = useCallback((id: string, patch: Partial<Row>) => {
    setRows(rs => rs.map(r => (r.id === id ? {...r, ...patch} : r)));
  }, []);

  const run = useCallback(async (retryItems?: any[]) => {
    const s = normalizeSettings(settings);
    const opts: any = {
      instructions: s.instructions,
      name: s.optName,
      tags: s.optTags,
      replaceTags: s.optReplaceTags,
      annotation: s.optAnnotation,
      replaceAnnotation: s.optReplaceAnnotation,
      folder: s.optFolder,
      agyPath: s.agyPath,
      model: s.model,
      markerTag: s.markerTag,
    };
    if (!opts.name && !opts.tags && !opts.annotation && !opts.folder) {
      setSummary({kind: 'warn', text: 'pick at least one thing to update.', canRetry: false});
      return;
    }

    const source = retryItems || selected;
    const isTagged = (i: any) => !retryItems && s.optSkipDone && opts.markerTag && (i.tags || []).includes(opts.markerTag);
    const needsFolder = (i: any) => opts.folder && !(i.folders || []).length;
    const isDone = (i: any) => isTagged(i) && !needsFolder(i);
    const folderOnlyOpts = {...opts, name: false, tags: false, annotation: false};
    const items = source.filter((i: any) => !isDone(i));
    const skippedItems = source.filter(isDone);

    lastFailed.current = [];
    setSummary(null);
    setProgress(null);
    const skippedRows = skippedItems.map((item: any) => rowFor(item, 'skipped', 'skipped · already done'));

    if (!items.length) {
      setRows(skippedRows);
      setSummary({
        kind: 'neutral',
        text: `nothing to do. ${skippedItems.length === 1 ? 'this item was' : `all ${skippedItems.length} items were`} already tagged. turn off “skip items already processed” to redo them.`,
        canRetry: false,
      });
      return;
    }

    const ctl = new AbortController();
    controller.current = ctl;
    const {signal} = ctl;
    setRunning(true);
    setStopping(false);
    setRows([...skippedRows, ...items.map((item: any) => rowFor(item, 'queued', 'queued'))]);

    const queue = [...items];
    let done = 0, stopped = 0;
    const failed: {item: any; message: string}[] = [];
    const report = () => setProgress({finished: done + failed.length, total: items.length, failed: failed.length});
    report();

    const safe = (promise: Promise<any>) => promise.catch(() => []);
    [opts.vocabulary, opts.preferredTags, opts.folders] = await Promise.all([
      opts.tags ? safe(loadVocabulary(opts.markerTag)) : [],
      opts.tags ? safe(loadSmartFolderTags(opts.markerTag)) : [],
      opts.folder ? safe(loadFolders()) : [],
    ]);
    opts.vocabulary = opts.vocabulary.filter((t: string) => !opts.preferredTags.includes(t));
    folderOnlyOpts.folders = opts.folders;

    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const queued = queue.shift();
        patchRow(queued.id, {state: 'running', text: 'analyzing…', startedAt: Date.now()});
        try {
          const item = (await eagle.item.getById(queued.id)) || queued;
          const result = await analyzeItem(item, isTagged(queued) ? folderOnlyOpts : opts, signal);
          if (isTagged(queued) && !result.folder) throw new Error('antigravity did not pick a folder');
          await item.save();
          patchRow(queued.id, {
            state: 'ok', text: 'done', name: item.name, startedAt: undefined,
            meta: [result.folder && `→ ${result.folder}`, (result.tags || []).join(', ')].filter(Boolean).join(' · '),
          });
          done++;
        } catch (err: any) {
          if (signal.aborted) {
            patchRow(queued.id, {state: 'skipped', text: 'stopped', startedAt: undefined});
            stopped++;
          } else {
            patchRow(queued.id, {state: 'err', text: err.message, startedAt: undefined});
            failed.push({item: queued, message: err.message});
          }
        }
        report();
      }
    };
    await Promise.all(Array.from({length: Math.min(s.concurrency, MAX_CONCURRENCY, items.length)}, worker));
    queue.forEach(q => { patchRow(q.id, {state: 'skipped', text: 'not started'}); stopped++; });

    controller.current = null;
    lastFailed.current = failed.map(f => f.item);
    setRunning(false);
    setStopping(false);
    const result = summarize({total: items.length, done, failed, stopped, skipped: skippedItems.length});
    setSummary(result);
    if (result.title) {
      eagle.notification?.show({title: result.title, body: result.text, icon: new URL('../logo.png', location.href).href, mute: false}).catch(() => {});
    }
    await refreshSelection();
  }, [settings, selected, patchRow, refreshSelection]);

  const retryFailed = useCallback(() => { if (lastFailed.current.length) run(lastFailed.current); }, [run]);

  const stop = useCallback(() => {
    if (!controller.current) return;
    controller.current.abort();
    setStopping(true);
  }, []);

  // The footer line: what is selected, or how far a run has got.
  const selectionText = useMemo(() => {
    if (running) return stopping ? 'stopping…' : `analyzing… ${progress?.finished ?? 0} of ${progress?.total ?? 0} done`;
    const n = selected.length;
    if (!n) return 'no items selected';
    const marker = settings.markerTag.trim();
    const tagged = settings.optSkipDone && marker ? selected.filter(i => (i.tags || []).includes(marker)) : [];
    const folderOnly = settings.optFolder ? tagged.filter(i => !(i.folders || []).length).length : 0;
    const skipped = tagged.length - folderOnly;
    return `${plural(n, 'item')} selected${skipped ? ` · ${skipped} already done` : ''}${folderOnly ? ` · ${folderOnly} only need a folder` : ''}`;
  }, [running, stopping, progress, selected, settings.markerTag, settings.optSkipDone, settings.optFolder]);

  return {settings, update, selected, running, stopping, rows, progress, summary, selectionText, run, retryFailed, stop};
}
