import { proxyActivities } from '@temporalio/workflow';

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
  deriveOutcome(input: { conversationId: string }): Promise<void>;
  linkAndFollowUp(input: { conversationId: string }): Promise<void>;
  aggregateConversation(input: { conversationId: string }): Promise<void>;
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

export async function postCallWorkflow(input: {
  inboxId: string;
  conversationId: string;
}): Promise<{ state: 'COMPLETED' | 'PARTIAL' }> {
  const normalized = await activities.normalizeAndRedact(input);
  const enrichment = await activities.enrichConversation({
    conversationId: normalized.conversationId,
    transcriptRevisionId: normalized.transcriptRevisionId,
  });
  await activities.deriveOutcome({ conversationId: normalized.conversationId });
  await activities.linkAndFollowUp({ conversationId: normalized.conversationId });
  await activities.aggregateConversation({ conversationId: normalized.conversationId });
  await activities.completeProcessing({
    inboxId: input.inboxId,
    conversationId: normalized.conversationId,
    partial: enrichment.state === 'PARTIAL',
  });
  return { state: enrichment.state };
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
