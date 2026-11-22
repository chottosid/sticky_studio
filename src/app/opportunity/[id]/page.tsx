import { notFound, redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import OpportunityDetailView from '@/components/opportunities/opportunity-detail-view';
import { isAuthenticated } from '@/lib/actions';
import { getOpportunityById } from '@/lib/data';
import { appToday } from '@/lib/deadlines';
import { CandidateIdSchema } from '@/domain/opportunity/assessment';
import { applicantOpportunities, assessmentHistory } from '@/lib/applicant-workflow';

export const maxDuration = 300;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ candidate?: string | string[] }> };

export default async function OpportunityPage({ params, searchParams }: Props) {
  if (!(await isAuthenticated())) redirect('/login');

  const opportunity = await getOpportunityById((await params).id);
  if (!opportunity) notFound();
  const candidate = CandidateIdSchema.catch('swarup').parse((await searchParams).candidate);
  const items = await applicantOpportunities({ ids: [opportunity.id], includeEvidence: true });
  const applicants = await Promise.all(items.map(async (item) => ({
    ...item, history: await assessmentHistory(opportunity.id, item.candidate),
  })));

  return (
    <>
      <Header />
      <main className="px-4 pb-16 pt-6 sm:px-6">
        <OpportunityDetailView opportunity={opportunity} today={appToday()} applicants={applicants} candidate={candidate} />
      </main>
    </>
  );
}
