import { proxyActivities } from '@temporalio/workflow';
import { CONVERSATION_FINALISATION_PIPELINE } from './finalisation-pipeline.js';

export interface PostCallActivities {
  normalizeAndRedact(input: { inboxId: string; conversationId: string }): Promise<{
    conversationId: string;
    transcriptRevisionId: string;
    paymentDataDetected: boolean;
  }>;
  enrichConversation(input: {
    conversationId: string;
    transcriptRevisionId: string;
  }): Promise<{ state: 'COMPLETED' | 'PARTIAL' }>;
  classifyInteraction(input: {
    conversationId: string;
    transcriptRevisionId: string;
  }): Promise<{ state: 'COMPLETED' | 'PARTIAL' }>;
  deriveOutcome(input: {
    conversationId: string;
    transcriptRevisionId: string;
  }): Promise<{ state: 'COMPLETED' | 'PARTIAL' }>;
  linkAndFollowUp(input: {
    conversationId: string;
    transcriptRevisionId: string;
  }): Promise<{ state: 'COMPLETED' | 'PARTIAL' }>;
  aggregateConversation(input: {
    conversationId: string;
    transcriptRevisionId: string;
    partialSoFar: boolean;
  }): Promise<{ state: 'COMPLETED' | 'PARTIAL' }>;
  completeProcessing(input: {
    inboxId: string;
    conversationId: string;
    partial: boolean;
  }): Promise<void>;
  publishAgent(input: {
    releaseId: string;
    purpose: 'TEST' | 'PUBLISH';
  }): Promise<{ providerAgentId: string; checksum: string }>;
  readBackAgent(input: {
    releaseId: string;
    providerAgentId: string;
    expectedChecksum: string;
    nextState: 'TESTING' | 'PUBLISHED';
  }): Promise<{ synchronized: boolean }>;
  publishKnowledge(input: {
    releaseId: string;
  }): Promise<{ providerDocumentId: string; checksum: string }>;
  readBackKnowledge(input: {
    releaseId: string;
    providerDocumentId: string;
    expectedChecksum: string;
  }): Promise<{ synchronized: boolean }>;
  reconcileWorkspace(input: {
    workspaceId: string;
  }): Promise<{ driftCount: number; missingConversationCount: number }>;
}

const activities = proxyActivities<PostCallActivities>({
  startToCloseTimeout: '2 minutes',
  scheduleToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 5,
    initialInterval: '1 second',
    maximumInterval: '30 seconds',
    backoffCoefficient: 2,
  },
});

// One proxy per pipeline stage, each carrying that stage's own retry policy — built once from
// the static registry at module load (deterministic; no I/O, no randomness), so a future stage
// with a different retry policy is a registry-array edit, not a workflow-code edit.
const stageActivities = new Map(
  CONVERSATION_FINALISATION_PIPELINE.map((stage) => [
    stage.activityName,
    proxyActivities<PostCallActivities>({
      startToCloseTimeout: '2 minutes',
      scheduleToCloseTimeout: '10 minutes',
      retry: {
        maximumAttempts: stage.retryPolicy.maximumAttempts,
        initialInterval: '1 second',
        maximumInterval: '30 seconds',
        backoffCoefficient: 2,
      },
    }),
  ]),
);

/**
 * The one bit of real control-flow logic in the pipeline loop, named and exported so it is
 * independently testable without a Temporal workflow runtime: a failing blocking stage halts
 * the pipeline; a failing non-blocking stage marks the run partial and continues.
 */
export function shouldHaltPipeline(stageBlocking: boolean, stageFailed: boolean): boolean {
  return stageBlocking && stageFailed;
}

export async function postCallWorkflow(input: {
  inboxId: string;
  conversationId: string;
}): Promise<{ state: 'COMPLETED' | 'PARTIAL' }> {
  const [firstStage, ...remainingStages] = CONVERSATION_FINALISATION_PIPELINE;
  if (!firstStage || firstStage.activityName !== 'normalizeAndRedact')
    throw new Error('The finalisation pipeline must begin with NORMALIZE_AND_REDACT');

  const normalized = await activities.normalizeAndRedact(input);
  const transcriptRevisionId = normalized.transcriptRevisionId;
  let partial = false;

  for (const stage of remainingStages) {
    const proxy = stageActivities.get(stage.activityName);
    if (!proxy) throw new Error(`No activity proxy registered for stage ${stage.key}`);
    const activity = proxy[stage.activityName] as (input: {
      conversationId: string;
      transcriptRevisionId: string;
      partialSoFar: boolean;
    }) => Promise<{ state: 'COMPLETED' | 'PARTIAL' }>;
    try {
      const result = await activity({
        conversationId: normalized.conversationId,
        transcriptRevisionId,
        partialSoFar: partial,
      });
      if (result.state !== 'COMPLETED') partial = true;
    } catch (error) {
      partial = true;
      if (shouldHaltPipeline(stage.blocking, true)) throw error;
    }
  }

  await activities.completeProcessing({
    inboxId: input.inboxId,
    conversationId: normalized.conversationId,
    partial,
  });
  return { state: partial ? 'PARTIAL' : 'COMPLETED' };
}

export async function agentPublicationWorkflow(input: {
  releaseId: string;
}): Promise<{ providerAgentId: string; synchronized: boolean }> {
  const published = await activities.publishAgent({ ...input, purpose: 'PUBLISH' });
  const readBack = await activities.readBackAgent({
    releaseId: input.releaseId,
    providerAgentId: published.providerAgentId,
    expectedChecksum: published.checksum,
    nextState: 'PUBLISHED',
  });
  if (!readBack.synchronized)
    throw new Error('Provider read-back does not match the approved local release');
  return { providerAgentId: published.providerAgentId, synchronized: true };
}

export async function agentTestStagingWorkflow(input: {
  releaseId: string;
}): Promise<{ providerAgentId: string; synchronized: boolean }> {
  const published = await activities.publishAgent({ ...input, purpose: 'TEST' });
  const readBack = await activities.readBackAgent({
    releaseId: input.releaseId,
    providerAgentId: published.providerAgentId,
    expectedChecksum: published.checksum,
    nextState: 'TESTING',
  });
  if (!readBack.synchronized)
    throw new Error('Provider test copy does not match the approved local release');
  return { providerAgentId: published.providerAgentId, synchronized: true };
}

export async function knowledgePublicationWorkflow(input: {
  releaseId: string;
}): Promise<{ providerDocumentId: string; synchronized: boolean }> {
  const published = await activities.publishKnowledge(input);
  const readBack = await activities.readBackKnowledge({
    releaseId: input.releaseId,
    providerDocumentId: published.providerDocumentId,
    expectedChecksum: published.checksum,
  });
  if (!readBack.synchronized)
    throw new Error('Provider knowledge read-back does not match the approved local release');
  return { providerDocumentId: published.providerDocumentId, synchronized: true };
}

export async function providerReconciliationWorkflow(input: { workspaceId: string }) {
  return activities.reconcileWorkspace(input);
}
