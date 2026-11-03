import { redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import { OpportunityLedger } from '@/components/opportunities/opportunity-ledger';
import { TelegramInbox } from '@/components/telegram/telegram-inbox';
import { isAuthenticated } from '@/lib/actions';
import { getOpportunities } from '@/lib/data';
import { appToday } from '@/lib/deadlines';
import { LIST_PAGE_SIZE, listHref, listOrder, parseListParams } from '@/lib/list-params';
import { getInboxItems } from '@/lib/telegram/store';
import { getCandidateProfiles } from '@/lib/profiles';
import { ProfileAssessmentControls } from '@/components/opportunities/profile-priorities';
import { toProfileSummary } from '@/domain/opportunity/assessment';

export const maxDuration = 300;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: Props) {
  if (!(await isAuthenticated())) redirect('/login');

  const params = parseListParams(await searchParams);
  const { sortBy, sortOrder } = listOrder(params);
  const [{ opportunities, total }, inbox, profileRows] = await Promise.all([
    getOpportunities(0, LIST_PAGE_SIZE, sortBy, sortOrder, params.q || undefined, params.status, params.category, params.candidate, params.priority),
    getInboxItems(),
    getCandidateProfiles(),
  ]);
  const profiles = profileRows.map(toProfileSummary);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-16 pt-8 sm:px-6">
        <TelegramInbox items={inbox} />
        <ProfileAssessmentControls profiles={profiles} />
        <OpportunityLedger
          // Not keyed on the search text: typing must not remount the search box.
          key={listHref({ ...params, q: '' })}
          params={params}
          initialItems={opportunities}
          total={total}
          today={appToday()}
          profiles={profiles}
        />
      </main>
    </>
  );
}
