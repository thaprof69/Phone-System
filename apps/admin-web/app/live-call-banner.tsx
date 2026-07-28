'use client';

import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type LiveCall = {
  providerConversationId: string;
  agentName: string;
  status: 'INITIATED' | 'IN_PROGRESS';
  startedAt: string;
  direction: string;
  source: string;
};

type LiveCallResponse = {
  status: 'IDLE' | 'ACTIVE' | 'NOT_CONFIGURED' | 'DEGRADED';
  activeCalls: LiveCall[];
};

function elapsedLabel(startedAt: string, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function LiveCallBanner() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/live-calls', { cache: 'no-store' });
        const payload = (await response.json()) as LiveCallResponse;
        if (!disposed) setCalls(Array.isArray(payload.activeCalls) ? payload.activeCalls : []);
      } catch {
        if (!disposed) setCalls([]);
      }
    };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 3_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const oldestCall = useMemo(
    () =>
      calls.reduce<LiveCall | null>(
        (oldest, call) => (!oldest || call.startedAt < oldest.startedAt ? call : oldest),
        null,
      ),
    [calls],
  );
  if (!oldestCall) return null;

  const countLabel = calls.length === 1 ? 'Live call in progress' : `${calls.length} live calls`;
  return (
    <Link className="live-call-banner" href="/calls/live" aria-live="polite">
      <span className="live-call-signal" aria-hidden="true">
        <PhoneCall size={17} />
      </span>
      <span className="live-call-copy">
        <strong>{countLabel}</strong>
        <span>
          {oldestCall.agentName} · {oldestCall.source} · {elapsedLabel(oldestCall.startedAt, now)}
        </span>
      </span>
      <span className="live-call-action">Open live activity</span>
    </Link>
  );
}
