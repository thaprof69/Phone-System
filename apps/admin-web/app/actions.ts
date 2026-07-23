'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiMutation } from '../lib/api';

type ApiStatus = { status?: string; blockers?: string[]; message?: string };

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function jsonObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new Error('Expected a JSON object');
  return parsed as Record<string, unknown>;
}

async function submit(section: string, path: string, body: unknown = {}) {
  const response = await apiMutation<ApiStatus>(path, body);
  const status = response.ok ? (response.data.status ?? 'SUCCESS') : 'TEMPORARILY_UNAVAILABLE';
  const detail = response.ok
    ? (response.data.blockers?.join('; ') ?? response.data.message ?? '')
    : response.reason;
  revalidatePath(`/${section}`);
  redirect(`/${section}?result=${encodeURIComponent(status)}&detail=${encodeURIComponent(detail)}`);
}

export async function createAgent(form: FormData) {
  const prompt = value(form, 'prompt');
  return submit('agent-studio', '/agents', {
    name: value(form, 'name'),
    purpose: value(form, 'purpose'),
    changeReason: value(form, 'changeReason'),
    configuration: {
      conversation_config: {
        agent: {
          prompt: { prompt },
          first_message: value(form, 'firstMessage'),
        },
      },
    },
  });
}

export async function reviewAgent(form: FormData) {
  const id = value(form, 'id');
  return submit('agent-studio', `/agent-releases/${id}/decision`, {
    decision: value(form, 'decision'),
    reason: value(form, 'reason'),
  });
}

export async function stageAgentForTest(form: FormData) {
  return submit('agent-studio', `/agent-releases/${value(form, 'id')}/stage-for-test`);
}

export async function promoteAgent(form: FormData) {
  return submit('agent-studio', `/agent-releases/${value(form, 'id')}/promote`);
}

export async function publishAgent(form: FormData) {
  return submit('agent-studio', `/agent-releases/${value(form, 'id')}/publish`);
}

export async function createKnowledge(form: FormData) {
  return submit('knowledge', '/knowledge', {
    title: value(form, 'title'),
    category: value(form, 'category'),
    language: value(form, 'language'),
    riskClass: value(form, 'riskClass'),
    content: value(form, 'content'),
    ...(value(form, 'park') ? { park: value(form, 'park') } : {}),
  });
}

export async function reviewKnowledge(form: FormData) {
  const id = value(form, 'id');
  return submit('knowledge', `/knowledge-versions/${id}/decision`, {
    decision: value(form, 'decision'),
    reason: value(form, 'reason'),
  });
}

export async function publishKnowledge(form: FormData) {
  return submit('knowledge', `/knowledge-versions/${value(form, 'id')}/publish`);
}

export async function refreshVoices() {
  return submit('voices', '/voices/refresh');
}

export async function approveVoice(form: FormData) {
  return submit('voices', `/voices/${value(form, 'id')}/approve`);
}

export async function createTest(form: FormData) {
  let definition: Record<string, unknown>;
  try {
    definition = jsonObject(value(form, 'definition'));
  } catch {
    redirect('/tests?result=VALIDATION_FAILED&detail=Definition+must+be+a+JSON+object');
  }
  return submit('tests', '/test-suites', {
    name: value(form, 'name'),
    testType: value(form, 'testType'),
    riskLevel: value(form, 'riskLevel'),
    definition,
  });
}

export async function runTests(form: FormData) {
  return submit('tests', '/test-runs', {
    agentVersionId: value(form, 'agentVersionId'),
    testVersionIds: value(form, 'testVersionIds')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    repeatCount: Number(value(form, 'repeatCount')),
  });
}

export async function syncTestRun(form: FormData) {
  return submit('tests', `/test-runs/${value(form, 'id')}/sync`);
}

export async function reconcileCalls() {
  return submit('calls', '/provider-connections/reconcile');
}

export async function createStaffTask(form: FormData) {
  return submit('operations', '/operations/tasks', {
    conversationId: value(form, 'conversationId'),
    reason: value(form, 'reason'),
    priority: value(form, 'priority'),
    ...(value(form, 'dueAt') ? { dueAt: new Date(value(form, 'dueAt')).toISOString() } : {}),
  });
}

export async function updateStaffTask(form: FormData) {
  return submit('operations', `/operations/tasks/${value(form, 'id')}/status`, {
    status: value(form, 'status'),
  });
}

export async function createReport(form: FormData) {
  let configuration: Record<string, unknown>;
  try {
    configuration = jsonObject(value(form, 'configuration'));
  } catch {
    redirect('/reports?result=VALIDATION_FAILED&detail=Configuration+must+be+a+JSON+object');
  }
  return submit('reports', '/reports', {
    key: value(form, 'key'),
    schedule: value(form, 'schedule'),
    classification: value(form, 'classification'),
    configuration,
  });
}
