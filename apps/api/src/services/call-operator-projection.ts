const OPEN_WORK_STATES = new Set(['OPEN', 'ASSIGNED', 'IN_PROGRESS']);

export type OperatorWorkItem = {
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  reason: string;
  createdAt: Date;
};

export function buildCallOperatorProjection(input: {
  callbacks: OperatorWorkItem[];
  tasks: OperatorWorkItem[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const allWork = [...input.callbacks, ...input.tasks].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const openWork = allWork.filter((item) => OPEN_WORK_STATES.has(item.status));
  const overdue = openWork.filter((item) => item.dueAt && item.dueAt < now);
  const failed = allWork.filter((item) => item.status === 'FAILED');
  const dueItems = openWork
    .filter((item): item is OperatorWorkItem & { dueAt: Date } => item.dueAt !== null)
    .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime());
  const callback = input.callbacks[0] ?? null;
  const assigned =
    openWork.find((item) => item.ownerId && item.ownerName) ??
    allWork.find((item) => item.ownerId && item.ownerName) ??
    null;

  const slaStatus =
    overdue.length > 0 || failed.length > 0
      ? ('BREACHED' as const)
      : dueItems.length > 0
        ? ('ON_TRACK' as const)
        : openWork.length > 0
          ? ('NOT_SET' as const)
          : allWork.length > 0
            ? ('MET' as const)
            : ('NOT_REQUIRED' as const);

  return {
    caseStatus: openWork.length > 0 ? ('OPEN' as const) : ('CLOSED' as const),
    sla: {
      status: slaStatus,
      dueAt: dueItems[0]?.dueAt ?? null,
    },
    callback: callback
      ? {
          status: callback.status,
          reason: callback.reason,
          dueAt: callback.dueAt,
          completedAt: callback.completedAt,
          returned: callback.status === 'COMPLETED' && callback.completedAt !== null,
        }
      : null,
    assignedOperator: assigned
      ? { id: assigned.ownerId as string, name: assigned.ownerName as string }
      : null,
  };
}
