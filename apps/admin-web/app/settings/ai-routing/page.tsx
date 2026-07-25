import { SettingsPage } from '../settings-page';
import { apiGet } from '../../../lib/api';
import { AIIntelligenceConsole, type AIWorkspace } from './ai-console';

export const dynamic = 'force-dynamic';

type Readiness = { state: string };
type VoiceStatus = { status: string };

export default async function AiRoutingOverviewPage() {
  const [workspace, readiness, voice] = await Promise.all([
    apiGet<AIWorkspace>('/admin/ai/workspace', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<Readiness>('/readiness', { purpose: 'RELEASE_MANAGEMENT' }),
    apiGet<VoiceStatus>('/admin/integrations/elevenlabs/status', {
      purpose: 'RELEASE_MANAGEMENT',
    }),
  ]);

  return (
    <SettingsPage
      eyebrow="AI Routing"
      title="Overview"
      description="What performs each business capability, and what it is allowed to cost."
    >
      <AIIntelligenceConsole
        initialWorkspace={workspace.ok ? workspace.data : null}
        unavailableReason={workspace.ok ? null : workspace.reason}
        voiceRuntimeStatus={voice.ok ? voice.data.status : 'UNAVAILABLE'}
        platformStatus={readiness.ok ? readiness.data.state : 'UNAVAILABLE'}
      />
    </SettingsPage>
  );
}
