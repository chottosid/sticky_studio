import { redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import { OpportunityLedger } from '@/components/opportunities/opportunity-ledger';
import { isAuthenticated } from '@/lib/actions';
import { getOpportunities } from '@/lib/data';
import { appToday } from '@/lib/deadlines';
import { LIST_PAGE_SIZE, listHref, listOrder, parseListParams } from '@/lib/list-params';

export const maxDuration = 300;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAuthenticated())) redirect('/login');
  const params = parseListParams(await searchParams);
  const { sortBy, sortOrder } = listOrder(params);
  const { opportunities, total } = await getOpportunities(0, LIST_PAGE_SIZE, sortBy, sortOrder, params.q, params.status, params.category, params.candidate);
  return <>
    <Header active="ledger" />
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <OpportunityLedger key={listHref({ ...params, q: '' })} params={params} initialItems={opportunities} total={total} today={appToday()} />
    </main>
  </>;
}
