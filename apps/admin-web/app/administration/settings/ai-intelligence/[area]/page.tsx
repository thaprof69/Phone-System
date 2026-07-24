import { notFound } from 'next/navigation';
import { apiGet } from '../../../../../lib/api';
import { AdministrationShell } from '../../../admin-shell';
import {
  AIIntelligenceConsole,
  type AISection,
  type AIWorkspace,
} from '../ai-intelligence-console';

const allowed: AISection[] = ['providers', 'capabilities', 'execution', 'governance', 'monitoring'];

export default async function AIIntelligenceAreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area } = await params;
  if (!allowed.includes(area as AISection)) notFound();
  const [workspace, voice, platform] = await Promise.all([
    apiGet<AIWorkspace>('/admin/ai/workspace'),
    apiGet<{ status: string }>('/admin/integrations/elevenlabs/status'),
    apiGet<{ state: string }>('/readiness'),
  ]);
  return (
    <AdministrationShell
      area="Settings"
      setting="AI Intelligence"
      eyebrow="Quantum Parks AIOS"
      title="AI Intelligence"
      description="Operate governed business capabilities while provider and model choices remain implementation details."
    >
      <AIIntelligenceConsole
        initialWorkspace={workspace.ok ? workspace.data : null}
        active={area as AISection}
        unavailableReason={workspace.ok ? null : workspace.reason}
        voiceRuntimeStatus={voice.ok ? voice.data.status : 'UNAVAILABLE'}
        platformStatus={platform.ok ? platform.data.state : 'UNAVAILABLE'}
      />
    </AdministrationShell>
  );
}
