import Header from '@/components/layout/header';
import OpportunityList from '@/components/opportunities/opportunity-list';
import { getOpportunities } from '@/lib/data';

export default async function Home() {
  const opportunities = await getOpportunities();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3 xl:grid-cols-4">
          <OpportunityList opportunities={opportunities} />
        </div>
      </main>
    </div>
  );
}
