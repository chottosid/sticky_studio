import { notFound, redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import OpportunityDetailView from '@/components/opportunities/opportunity-detail-view';
import { getOpportunityById } from '@/lib/data';
import { isAuthenticated } from '@/lib/actions';

type OpportunityPageProps = {
  params: {
    id: string;
  };
};

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    redirect('/login');
  }

  const { id } = await params;
  const opportunity = await getOpportunityById(id);

  if (!opportunity) {
    notFound();
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex-1 p-4 md:p-8">
        <OpportunityDetailView opportunity={opportunity} />
      </main>
    </div>
  );
}
