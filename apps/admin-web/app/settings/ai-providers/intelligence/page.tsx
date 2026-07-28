import { redirect } from 'next/navigation';

/**
 * The old "Intelligence providers" page is gone: its adapter registry and
 * "not installed" catalogue were not part of the working configuration UI.
 * Both this path and /models now resolve to the single Intelligence Models page.
 */
export default function IntelligenceProvidersPage() {
  redirect('/settings/ai-providers/models');
}
