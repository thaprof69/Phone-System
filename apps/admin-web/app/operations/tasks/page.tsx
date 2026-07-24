import { WorkQueue } from '../work-queue';
import type { SearchParams } from '../../../lib/list-view';

export const dynamic = 'force-dynamic';

export default async function StaffTasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <WorkQueue
      kind="tasks"
      pathname="/operations/tasks"
      params={await searchParams}
      title="Staff tasks"
      description="Work a call raised for a team to complete, such as a complaint for guest relations or a technical issue for the digital team."
      emptyTitle="No open staff tasks"
      emptyDetail="No call has raised work that is still outstanding."
    />
  );
}
