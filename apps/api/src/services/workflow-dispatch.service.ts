import { Injectable } from '@nestjs/common';
import { Connection, Client } from '@temporalio/client';
import {
  agentPublicationWorkflow,
  agentTestStagingWorkflow,
  knowledgePublicationWorkflow,
  postCallWorkflow,
  providerReconciliationWorkflow,
} from '@quantum-parks/workflows';

@Injectable()
export class WorkflowDispatchService {
  private connection?: Connection;

  async dispatchPostCall(input: {
    inboxId?: string;
    conversationId: string;
    workflowId: string;
  }): Promise<boolean> {
    try {
      this.connection ??= await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
      });
      const client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      });
      await client.workflow.start(postCallWorkflow, {
        workflowId: input.workflowId,
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'quantum-parks-post-call',
        args: [
          {
            ...(input.inboxId ? { inboxId: input.inboxId } : {}),
            conversationId: input.conversationId,
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

  async dispatchAgentPublication(
    releaseId: string,
  ): Promise<{ queued: boolean; workflowId: string }> {
    const workflowId = `publish-agent-${releaseId}`;
    try {
      this.connection ??= await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
      });
      const client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      });
      await client.workflow.start(agentPublicationWorkflow, {
        workflowId,
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'quantum-parks-post-call',
        args: [{ releaseId }],
      });
      return { queued: true, workflowId };
    } catch {
      return { queued: false, workflowId };
    }
  }

  async dispatchAgentTestStaging(
    releaseId: string,
  ): Promise<{ queued: boolean; workflowId: string }> {
    const workflowId = `stage-agent-test-${releaseId}`;
    try {
      this.connection ??= await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
      });
      const client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      });
      await client.workflow.start(agentTestStagingWorkflow, {
        workflowId,
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'quantum-parks-post-call',
        args: [{ releaseId }],
      });
      return { queued: true, workflowId };
    } catch {
      return { queued: false, workflowId };
    }
  }

  async dispatchReconciliation(
    workspaceId: string,
  ): Promise<{ queued: boolean; workflowId: string }> {
    const workflowId = `reconcile-${workspaceId}-${Date.now()}`;
    try {
      this.connection ??= await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
      });
      const client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      });
      await client.workflow.start(providerReconciliationWorkflow, {
        workflowId,
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'quantum-parks-post-call',
        args: [{ workspaceId }],
      });
      return { queued: true, workflowId };
    } catch {
      return { queued: false, workflowId };
    }
  }

  async dispatchKnowledgePublication(
    releaseId: string,
  ): Promise<{ queued: boolean; workflowId: string }> {
    const workflowId = `publish-knowledge-${releaseId}`;
    try {
      this.connection ??= await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
      });
      const client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      });
      await client.workflow.start(knowledgePublicationWorkflow, {
        workflowId,
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'quantum-parks-post-call',
        args: [{ releaseId }],
      });
      return { queued: true, workflowId };
    } catch {
      return { queued: false, workflowId };
    }
  }
}
