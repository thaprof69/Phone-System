'use client';

import Link from 'next/link';
import { MessageSquareText, PhoneCall } from 'lucide-react';
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
  activeChats?: LiveCall[];
};

function elapsedLabel(startedAt: string, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function LiveCallBanner() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [chats, setChats] = useState<LiveCall[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/live-calls', { cache: 'no-store' });
        const payload = (await response.json()) as LiveCallResponse;
        if (!disposed) {
          setCalls(Array.isArray(payload.activeCalls) ? payload.activeCalls : []);
          setChats(Array.isArray(payload.activeChats) ? payload.activeChats : []);
        }
      } catch {
        if (!disposed) {
          setCalls([]);
          setChats([]);
        }
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
  const oldestChat = useMemo(
    () =>
      chats.reduce<LiveCall | null>(
        (oldest, chat) => (!oldest || chat.startedAt < oldest.startedAt ? chat : oldest),
        null,
      ),
    [chats],
  );
  if (!oldestCall && !oldestChat) return null;

  return (
    <div className="live-activity-notices" aria-live="polite">
      {oldestCall ? (
        <Link className="live-call-banner" href="/calls/live">
          <span className="live-call-signal" aria-hidden="true">
            <PhoneCall size={17} />
          </span>
          <span className="live-call-copy">
            <strong>
              {calls.length === 1 ? 'Live call in progress' : `${calls.length} live calls`}
            </strong>
            <span>
              {oldestCall.agentName} · {oldestCall.source} ·{' '}
              {elapsedLabel(oldestCall.startedAt, now)}
            </span>
          </span>
          <span className="live-call-action">Open live calls</span>
        </Link>
      ) : null}
      {oldestChat ? (
        <Link className="live-call-banner live-chat-banner" href="/chat">
          <span className="live-call-signal live-chat-signal" aria-hidden="true">
            <MessageSquareText size={18} />
          </span>
          <span className="live-call-copy">
            <strong>
              {chats.length === 1 ? 'Live chat in progress' : `${chats.length} live chats`}
            </strong>
            <span>
              {oldestChat.agentName} · Website/app · {elapsedLabel(oldestChat.startedAt, now)}
            </span>
          </span>
          <span className="live-call-action">Open live chats</span>
        </Link>
      ) : null}
    </div>
  );
}
