import { notFound, redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import OpportunityDetailView from '@/components/opportunities/opportunity-detail-view';
import { isAuthenticated } from '@/lib/actions';
import { getOpportunityById } from '@/lib/data';
import { appToday } from '@/lib/deadlines';

type Props = { params: Promise<{ id: string }> };

export default async function OpportunityPage({ params }: Props) {
  if (!(await isAuthenticated())) redirect('/login');

  const opportunity = await getOpportunityById((await params).id);
  if (!opportunity) notFound();

  return (
    <>
      <Header />
      <main className="px-4 pb-16 pt-6 sm:px-6">
        <OpportunityDetailView opportunity={opportunity} today={appToday()} />
      </main>
    </>
  );
}
