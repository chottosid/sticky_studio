import { notFound } from 'next/navigation';
import Header from '@/components/layout/header';
import OpportunityDetailView from '@/components/opportunities/opportunity-detail-view';
import { getOpportunityById } from '@/lib/data';

type OpportunityPageProps = {
  params: {
    id: string;
  };
};

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  const opportunity = await getOpportunityById(params.id);

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
