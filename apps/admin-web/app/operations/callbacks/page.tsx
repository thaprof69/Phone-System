import { WorkQueue } from '../work-queue';
import type { SearchParams } from '../../../lib/list-view';

export const dynamic = 'force-dynamic';

export default async function CallbacksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <WorkQueue
      kind="callbacks"
      pathname="/operations/callbacks"
      params={await searchParams}
      title="Callbacks"
      description="Customers the receptionist promised a call back to. Overdue items appear first because a missed callback is a broken commitment."
      emptyTitle="No callbacks outstanding"
      emptyDetail="Every callback the receptionist created has been completed or cancelled."
    />
  );
}
