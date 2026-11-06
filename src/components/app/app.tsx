import {Alert, AlertAction, AlertDescription, AlertTitle} from '@/components/glaze/ui/alert';
import {Button} from '@/components/glaze/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/glaze/ui/card';
import {Checkbox} from '@/components/glaze/ui/checkbox';
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/glaze/ui/collapsible';
import {Empty, EmptyDescription, EmptyHeader} from '@/components/glaze/ui/empty-state';
import {Field, FieldGroup, FieldLabel} from '@/components/glaze/ui/field';
import {Input} from '@/components/glaze/ui/input';
import {ItemGroup} from '@/components/glaze/ui/item';
import {NumberInput} from '@/components/glaze/ui/number-input';
import {Progress, ProgressLabel, ProgressValue} from '@/components/glaze/ui/progress';
import {Textarea} from '@/components/glaze/ui/textarea';
import {cn} from '@/lib/glaze/utils';
import {MAX_CONCURRENCY, plural, type Settings} from '@/lib/autotagger';
import {LogRow} from './log-row';
import {useAutotagger} from './use-autotagger';

// A whole option row is the target, not just the 16px box: it takes the wash under a fine pointer and squeezes a little
// while held, both from Glaze's tokens. While a run locks the options, the wash and the squeeze go.
const optionRow = 'flex cursor-pointer items-center gap-3 rounded-pill py-1.5 pe-3 type-label transition-[background-color,scale] duration-(--dur-press) ease-out pointer-fine:hover:bg-hover-row active:bg-pressed active:scale-(--scale-press-flat) has-disabled:cursor-default has-disabled:bg-transparent has-disabled:scale-100';

type BooleanKey = {[K in keyof Settings]: Settings[K] extends boolean ? K : never}[keyof Settings];

export function App() {
  const {settings, update, selected, running, stopping, rows, progress, summary, selectionText, run, retryFailed, stop} = useAutotagger();

  const option = (key: BooleanKey, label: string, sub = false) => (
    <label className={cn(optionRow, sub ? 'ps-9 text-text-2' : 'ps-2')}>
      <Checkbox checked={settings[key]} onCheckedChange={checked => update(key, checked)} disabled={running}/>
      {label}
    </label>
  );

  const count = selected.length;
  const alertStatus = summary?.kind === 'fail' ? 'fail' : summary?.kind ?? 'neutral';

  return (
    <div className="flex h-dvh flex-col bg-page text-text-1">
      <h1 className="sr-only">antigravity autotagger</h1>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <Card>
          <CardHeader><CardTitle>instructions</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              aria-label="instructions"
              autoGrow
              minRows={3}
              value={settings.instructions}
              onChange={event => update('instructions', event.target.value)}
              disabled={running}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>what to update</CardTitle></CardHeader>
          <CardContent className="gap-0.5 px-1">
            {option('optName', 'rename item')}
            {option('optTags', 'add tags')}
            {option('optReplaceTags', 'replace existing tags instead of adding', true)}
            {option('optAnnotation', 'write description')}
            {option('optReplaceAnnotation', 'replace existing description', true)}
            {option('optFolder', 'put in a folder (only items not in one yet)')}
            {option('optSkipDone', 'skip items already processed')}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Collapsible>
              <CollapsibleTrigger className="transition-[background-color,color,scale] duration-(--dur-press) ease-out active:scale-(--scale-press)">advanced</CollapsibleTrigger>
              <CollapsibleContent>
                <FieldGroup className="pt-3">
                  <Field>
                    <FieldLabel>antigravity cli path</FieldLabel>
                    <Input value={settings.agyPath} onChange={event => update('agyPath', event.target.value)} disabled={running} autoComplete="off"/>
                  </Field>
                  <Field>
                    <FieldLabel>model (blank = default)</FieldLabel>
                    <Input value={settings.model} onChange={event => update('model', event.target.value)} placeholder="e.g. gemini-3.8-flash-medium" disabled={running} autoComplete="off"/>
                  </Field>
                  <Field>
                    <FieldLabel>run at once</FieldLabel>
                    <NumberInput value={settings.concurrency} min={1} max={MAX_CONCURRENCY} onValueChange={value => update('concurrency', value ?? 1)} disabled={running}/>
                  </Field>
                  <Field>
                    <FieldLabel>marker tag</FieldLabel>
                    <Input value={settings.markerTag} onChange={event => update('markerTag', event.target.value)} disabled={running} autoComplete="off"/>
                  </Field>
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>progress</CardTitle></CardHeader>
          <CardContent>
            {progress && (
              <Progress value={progress.finished} max={progress.total}>
                <ProgressLabel>analyzed</ProgressLabel>
                <ProgressValue>{() => `${progress.finished} of ${progress.total}${progress.failed ? ` · ${progress.failed} failed` : ''}`}</ProgressValue>
              </Progress>
            )}

            {summary && (
              <Alert status={alertStatus}>
                {summary.title && <AlertTitle>{summary.title}</AlertTitle>}
                <AlertDescription>{summary.text}</AlertDescription>
                {summary.canRetry && (
                  <AlertAction><Button size="sm" variant="secondary" onClick={retryFailed}>retry failed</Button></AlertAction>
                )}
              </Alert>
            )}

            {rows.length ? (
              <ItemGroup aria-label="items">
                {rows.map(row => <LogRow key={row.id} row={row}/>)}
              </ItemGroup>
            ) : (
              <Empty variant="plain">
                <EmptyHeader>
                  <EmptyDescription>
                    {count ? `ready to analyze ${plural(count, 'item')}. results will show up here.` : 'select one or more images or videos in eagle to get started.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-line-faint px-4 py-3">
        <span className="min-w-0 truncate type-body-sm text-text-2" aria-live="polite">{selectionText}</span>
        <div className="flex shrink-0 gap-2">
          {running && <Button variant="secondary" onClick={stop} disabled={stopping}>{stopping ? 'stopping…' : 'stop'}</Button>}
          <Button onClick={() => run()} disabled={running || !count} pending={running} pendingLabel="analyzing…">
            {count ? `analyze ${plural(count, 'item')}` : 'analyze'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
