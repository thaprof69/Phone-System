'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@quantum-parks/ui';

/**
 * Converts a detected gap into a knowledge draft.
 *
 * The draft it creates is deliberately unpublished placeholder text, never a generated
 * answer — generated knowledge is never auto-published. Navigating to the new asset is
 * the whole point: the button exists to get an author to the editor, not to finish the
 * job for them.
 */
export function ConvertGapButton({ gapId }: { gapId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'refused'>('idle');
  const [message, setMessage] = useState('');

  async function convert() {
    setState('working');
    const response = await fetch(`/api/admin/knowledge/gaps/${gapId}/convert`, { method: 'POST' });
    const data = (await response.json().catch(() => ({}))) as {
      status?: string;
      assetId?: string;
      currentState?: string;
      message?: string;
    };
    if (data.status === 'CREATED' && data.assetId) {
      router.push(`/knowledge/${data.assetId}`);
      return;
    }
    setState('refused');
    setMessage(
      data.status === 'CONFLICT'
        ? `This is already ${String(data.currentState ?? 'in progress').toLowerCase()}.`
        : (data.message ?? 'Could not convert this gap.'),
    );
  }

  return (
    <div>
      <Button variant="secondary" onClick={() => void convert()} disabled={state === 'working'}>
        {state === 'working' ? 'Creating draft…' : 'Convert to draft'}
      </Button>
      {state === 'refused' ? <p className="field-hint">{message}</p> : null}
    </div>
  );
}
