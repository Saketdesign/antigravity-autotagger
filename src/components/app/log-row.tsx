import {useEffect, useRef, useState} from 'react';
import {Item, ItemContent, ItemDescription, ItemMedia, ItemTitle} from '@/components/glaze/ui/item';
import {Status, type StatusValue} from '@/components/glaze/ui/status';
import type {Row} from './use-autotagger';

const statusOf: Record<Row['state'], StatusValue> = {queued: 'queued', running: 'running', ok: 'ok', err: 'fail', skipped: 'idle'};

// Counts the seconds a row has been running, once a second.
function useElapsed(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt ? Math.round((now - startedAt) / 1000) : 0;
}

export function LogRow({row}: {row: Row}) {
  const seconds = useElapsed(row.state === 'running' ? row.startedAt : undefined);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (row.state === 'running') ref.current?.scrollIntoView({block: 'nearest'});
  }, [row.state]);

  const word = row.state === 'running' ? `analyzing… ${seconds}s` : row.text;
  return (
    <Item ref={ref} role="listitem">
      <ItemMedia variant="image"><img src={row.thumb} alt=""/></ItemMedia>
      <ItemContent>
        <ItemTitle><span title={row.name}>{row.name}</span></ItemTitle>
        <Status status={statusOf[row.state]} size="sm" title={row.state === 'err' ? row.text : undefined} className="[&>[data-slot=status-word]]:line-clamp-2">{word}</Status>
        {row.meta && <ItemDescription>{row.meta}</ItemDescription>}
      </ItemContent>
    </Item>
  );
}
