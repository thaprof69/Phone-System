import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { signWebhook } from '@quantum-parks/elevenlabs';

interface SimulatorAgent {
  agent_id: string;
  branch_id: string;
  version_id: string;
  conversation_config: Record<string, unknown>;
  platform_settings?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  deployments: Array<{ branch_id: string; percentage: number }>;
}
interface SimulatorKnowledge {
  id: string;
  name: string;
  text: string;
  checksum: string;
}
interface SimulatorConversation {
  conversation_id: string;
  agent_id: string;
  branch_id: string;
  version_id: string;
  status: string;
  transcript: unknown[];
  metadata: Record<string, unknown>;
  analysis: Record<string, unknown>;
  has_audio: boolean;
  has_user_audio: boolean;
  has_response_audio: boolean;
}
interface SimulatorTestInvocation {
  id: string;
  agent_id: string;
  branch_id: string | null;
  repeat_count: number;
  test_runs: Array<{
    test_run_id: string;
    test_invocation_id: string;
    test_id: string;
    status: string;
    condition_result: { result: string; rationale: { summary: string } };
  }>;
}

const app = Fastify({
  logger: true,
  bodyLimit: 21 * 1024 * 1024,
  requestIdHeader: 'x-correlation-id',
});
const agents = new Map<string, SimulatorAgent>();
const knowledge = new Map<string, SimulatorKnowledge>();
const conversations = new Map<string, SimulatorConversation>();
const tests = new Map<string, Record<string, unknown>>();
const testInvocations = new Map<string, SimulatorTestInvocation>();
const voices = [
  {
    voice_id: 'voice_pt_synthetic',
    name: 'Inês Synthetic',
    category: 'premade',
    labels: { language: 'pt', accent: 'European' },
    preview_url: '/__fixtures/voice_pt.mp3',
    is_owner: false,
  },
  {
    voice_id: 'voice_en_synthetic',
    name: 'Alex Synthetic',
    category: 'premade',
    labels: { language: 'en', accent: 'Neutral' },
    preview_url: '/__fixtures/voice_en.mp3',
    is_owner: false,
  },
];
let failureMode: 'none' | 'rate_limit' | 'timeout' | 'capability_denied' = 'none';

app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health' || request.url.startsWith('/__')) return;
  if (!request.headers['xi-api-key']) return reply.code(401).send({ detail: 'Missing API key' });
  if (failureMode === 'rate_limit') return reply.code(429).send({ detail: 'Synthetic rate limit' });
  if (failureMode === 'capability_denied' && request.method !== 'GET')
    return reply.code(403).send({ detail: 'Synthetic account restriction' });
  if (failureMode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 15_000));
});

app.get('/health', async () => ({ status: 'ok', synthetic: true }));
app.get('/v1/user', async () => ({
  workspaceId: 'workspace_synthetic',
  subscription: 'synthetic-enterprise',
  is_new_user: false,
}));
app.get('/v1/workspace/webhooks', async () => ({
  webhooks: [
    {
      webhook_id: 'webhook_synthetic',
      name: 'Quantum Parks post-call',
      webhook_url: 'http://api:4000/v1/webhooks/elevenlabs/post-call',
      is_disabled: false,
      is_auto_disabled: false,
      auth_type: 'hmac',
      usage: [{ usage_type: 'ConvAI Settings' }],
    },
  ],
}));

app.get('/v1/convai/agents', async () => ({
  agents: [...agents.values()].map((agent) => ({
    agent_id: agent.agent_id,
    name: `Synthetic agent ${agent.agent_id.slice(-8)}`,
    archived: false,
  })),
  has_more: false,
  next_cursor: null,
}));

app.post<{ Body: Record<string, unknown> }>('/v1/convai/agents/create', async (request) => {
  const agentId = `agent_${randomUUID()}`;
  const branchId = `agtbrch_${randomUUID()}`;
  const versionId = `agtvrsn_${randomUUID()}`;
  const agent: SimulatorAgent = {
    agent_id: agentId,
    branch_id: branchId,
    version_id: versionId,
    conversation_config:
      (request.body.conversation_config as Record<string, unknown> | undefined) ?? {},
    deployments: [{ branch_id: branchId, percentage: 100 }],
  };
  agents.set(agentId, agent);
  return { agent_id: agentId, branch_id: branchId, version_id: versionId };
});

app.get<{ Params: { agentId: string } }>('/v1/convai/agents/:agentId', async (request, reply) => {
  const agent = agents.get(request.params.agentId);
  return agent ?? reply.code(404).send({ detail: 'Agent not found' });
});

app.patch<{ Params: { agentId: string }; Body: Record<string, unknown> }>(
  '/v1/convai/agents/:agentId',
  async (request, reply) => {
    const current = agents.get(request.params.agentId);
    if (!current) return reply.code(404).send({ detail: 'Agent not found' });
    const updated = {
      ...current,
      ...request.body,
      version_id: `agtvrsn_${randomUUID()}`,
    } as SimulatorAgent;
    agents.set(current.agent_id, updated);
    return {
      agent_id: current.agent_id,
      branch_id: updated.branch_id,
      version_id: updated.version_id,
    };
  },
);

app.post<{
  Params: { agentId: string };
  Body: { deployments: Array<{ branch_id: string; percentage: number }> };
}>('/v1/convai/agents/:agentId/deployments', async (request, reply) => {
  const agent = agents.get(request.params.agentId);
  if (!agent) return reply.code(404).send({ detail: 'Agent not found' });
  if (request.body.deployments.reduce((sum, item) => sum + item.percentage, 0) !== 100)
    return reply.code(422).send({ detail: 'Percentages must total 100' });
  agent.deployments = request.body.deployments;
  return { deploymentId: `deployment_${randomUUID()}` };
});

app.get<{ Querystring: { agent_id?: string } }>(
  '/v1/convai/conversation/get-signed-url',
  async (request, reply) => {
    const agentId = request.query.agent_id;
    if (!agentId || !agents.has(agentId))
      return reply.code(404).send({ detail: 'Agent not found' });
    return {
      signed_url: `wss://simulator.local/v1/convai/conversation?agent_id=${encodeURIComponent(agentId)}&synthetic_session=${randomUUID()}`,
    };
  },
);

app.post<{ Body: { name: string; text: string } }>(
  '/v1/convai/knowledge-base/text',
  async (request) => {
    const id = `knowledge_${randomUUID()}`;
    const checksum = createHash('sha256').update(request.body.text).digest('hex');
    knowledge.set(id, { id, name: request.body.name, text: request.body.text, checksum });
    return { id, name: request.body.name, folder_path: [] };
  },
);
app.get<{ Params: { id: string } }>(
  '/v1/convai/knowledge-base/:id',
  async (request, reply) =>
    knowledge.get(request.params.id) ?? reply.code(404).send({ detail: 'Knowledge not found' }),
);
app.get('/v2/voices', async () => ({ voices, has_more: false, total_count: voices.length }));

app.post<{ Body: Record<string, unknown> }>('/v1/convai/agent-testing/create', async (request) => {
  const id = `test_${randomUUID()}`;
  tests.set(id, { id, ...request.body });
  return { id };
});
app.get<{ Params: { id: string } }>(
  '/v1/convai/agent-testing/:id',
  async (request, reply) =>
    tests.get(request.params.id) ?? reply.code(404).send({ detail: 'Test not found' }),
);

app.post<{
  Params: { agentId: string };
  Body: { tests: unknown[]; repeat_count?: number; branch_id?: string | null };
}>('/v1/convai/agents/:agentId/run-tests', async (request, reply) => {
  if (!agents.has(request.params.agentId))
    return reply.code(404).send({ detail: 'Agent not found' });
  const repeatCount = request.body.repeat_count ?? 1;
  if (repeatCount < 1 || repeatCount > 50)
    return reply.code(422).send({ detail: 'repeat_count must be 1-50' });
  const invalidTest = request.body.tests.find(
    (test) =>
      typeof test !== 'object' ||
      test === null ||
      !tests.has(String((test as { test_id?: unknown }).test_id ?? '')),
  );
  if (invalidTest) return reply.code(422).send({ detail: 'Unknown test_id' });
  const id = `testinvocation_${randomUUID()}`;
  const invocation: SimulatorTestInvocation = {
    id,
    agent_id: request.params.agentId,
    branch_id: request.body.branch_id ?? null,
    repeat_count: repeatCount,
    test_runs: request.body.tests.flatMap((test) =>
      Array.from({ length: repeatCount }, () => ({
        test_run_id: `testrun_${randomUUID()}`,
        test_invocation_id: id,
        test_id: String((test as { test_id: string }).test_id),
        status: 'completed',
        condition_result: {
          result: 'success',
          rationale: { summary: 'Deterministic simulator success' },
        },
      })),
    ),
  };
  testInvocations.set(id, invocation);
  return {
    ...invocation,
    bucketing_status: repeatCount > 1 ? 'completed' : null,
  };
});

app.get<{ Params: { id: string } }>('/v1/convai/test-invocations/:id', async (request, reply) => {
  const invocation = testInvocations.get(request.params.id);
  return invocation
    ? {
        ...invocation,
        bucketing_status: invocation.repeat_count > 1 ? 'completed' : null,
      }
    : reply.code(404).send({ detail: 'Test invocation not found' });
});

app.get('/v1/convai/conversations', async () => ({
  conversations: [...conversations.values()].map((conversation) => ({
    conversation_id: conversation.conversation_id,
    agent_id: conversation.agent_id,
    status: conversation.status,
    branch_id: conversation.branch_id,
    version_id: conversation.version_id,
  })),
  has_more: false,
  next_cursor: null,
}));

app.get<{ Params: { conversationId: string } }>(
  '/v1/convai/conversations/:conversationId',
  async (request, reply) =>
    conversations.get(request.params.conversationId) ??
    reply.code(404).send({ detail: 'Conversation not found' }),
);

app.post<{ Body: { mode: typeof failureMode } }>('/__control/failure-mode', async (request) => {
  failureMode = request.body.mode;
  return { failureMode };
});
app.post<{ Params: { agentId: string }; Body: Record<string, unknown> }>(
  '/__control/drift/:agentId',
  async (request, reply) => {
    const agent = agents.get(request.params.agentId);
    if (!agent) return reply.code(404).send({ detail: 'Agent not found' });
    agent.conversation_config = {
      ...agent.conversation_config,
      ...request.body,
      remote_unapproved_edit: true,
    };
    return agent;
  },
);

app.post<{
  Body: {
    targetUrl: string;
    secret?: string;
    duplicate?: boolean;
    outOfOrder?: boolean;
    cardData?: boolean;
  };
}>('/__simulate/post-call', async (request, reply) => {
  const agent = [...agents.values()][0];
  if (!agent) return reply.code(409).send({ detail: 'Create an agent first' });
  const conversationId = `conversation_${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const conversation: SimulatorConversation = {
    conversation_id: conversationId,
    agent_id: agent.agent_id,
    branch_id: agent.branch_id,
    version_id: agent.version_id,
    status: 'done',
    transcript: [
      {
        role: 'user',
        time_in_call_secs: 0,
        message: request.body.cardData
          ? 'My card is 4111 1111 1111 1111'
          : 'What time does the park open?',
      },
      {
        role: 'agent',
        time_in_call_secs: 1,
        message: request.body.cardData
          ? 'Please do not share card details. Use the secure payment link.'
          : 'I will check the approved opening hours.',
      },
    ],
    metadata: {
      start_time_unix_secs: timestamp - 10,
      call_duration_secs: 10,
      cost: 1,
      phone_call: { direction: 'inbound', external_number: '+351910000001' },
    },
    analysis: { transcript_summary: 'Provider metadata only', call_successful: 'unknown' },
    has_audio: false,
    has_user_audio: false,
    has_response_audio: false,
  };
  conversations.set(conversationId, conversation);
  const payload = {
    type: 'post_call_transcription',
    event_timestamp: request.body.outOfOrder ? timestamp - 20 : timestamp,
    data: conversation,
  };
  const body = JSON.stringify(payload);
  const signature = signWebhook(body, request.body.secret ?? 'synthetic-webhook-secret');
  const deliver = () =>
    fetch(request.body.targetUrl, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'elevenlabs-signature': signature,
        'x-elevenlabs-workspace-id': 'workspace_synthetic',
      },
    });
  const first = await deliver();
  if (request.body.duplicate) await deliver();
  return {
    conversationId,
    deliveryStatus: first.status,
    duplicate: request.body.duplicate ?? false,
  };
});

const port = Number(process.env.PORT ?? 4100);
await app.listen({ host: '0.0.0.0', port });
