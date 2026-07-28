import { describe, expect, it } from 'vitest';
import { buildCallOperatorProjection, type OperatorWorkItem } from './call-operator-projection.js';

const now = new Date('2026-07-27T15:00:00Z');

function item(overrides: Partial<OperatorWorkItem> = {}): OperatorWorkItem {
  return {
    status: 'OPEN',
    ownerId: null,
    ownerName: null,
    dueAt: new Date('2026-07-27T16:00:00Z'),
    completedAt: null,
    reason: 'Return the customer call',
    createdAt: new Date('2026-07-27T14:00:00Z'),
    ...overrides,
  };
}

describe('buildCallOperatorProjection', () => {
  it('reports a closed call with no follow-up as not requiring an SLA or callback', () => {
    expect(buildCallOperatorProjection({ callbacks: [], tasks: [], now })).toEqual({
      caseStatus: 'CLOSED',
      sla: { status: 'NOT_REQUIRED', dueAt: null },
      callback: null,
      assignedOperator: null,
    });
  });

  it('reports open assigned callback work and whether it has been returned', () => {
    const projection = buildCallOperatorProjection({
      callbacks: [item({ status: 'ASSIGNED', ownerId: 'user-1', ownerName: 'Elena Rocha' })],
      tasks: [],
      now,
    });
    expect(projection.caseStatus).toBe('OPEN');
    expect(projection.sla.status).toBe('ON_TRACK');
    expect(projection.callback?.returned).toBe(false);
    expect(projection.assignedOperator).toEqual({ id: 'user-1', name: 'Elena Rocha' });
  });

  it('marks overdue work as breached', () => {
    const projection = buildCallOperatorProjection({
      callbacks: [item({ dueAt: new Date('2026-07-27T14:30:00Z') })],
      tasks: [],
      now,
    });
    expect(projection.sla.status).toBe('BREACHED');
  });

  it('reports an open item without a due time as having no SLA set', () => {
    const projection = buildCallOperatorProjection({
      callbacks: [],
      tasks: [item({ dueAt: null })],
      now,
    });
    expect(projection.sla.status).toBe('NOT_SET');
  });

  it('marks a completed callback as returned, closed, and SLA met', () => {
    const completedAt = new Date('2026-07-27T14:45:00Z');
    const projection = buildCallOperatorProjection({
      callbacks: [item({ status: 'COMPLETED', completedAt })],
      tasks: [],
      now,
    });
    expect(projection.caseStatus).toBe('CLOSED');
    expect(projection.sla.status).toBe('MET');
    expect(projection.callback?.returned).toBe(true);
    expect(projection.callback?.completedAt).toEqual(completedAt);
  });
});
