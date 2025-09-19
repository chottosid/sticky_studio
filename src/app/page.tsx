import Header from '@/components/layout/header';
import PaginatedOpportunityList from '@/components/opportunities/paginated-opportunity-list';
import { getOpportunities } from '@/lib/data';
import { isAuthenticated } from '@/lib/actions';
import { redirect } from 'next/navigation';

export default async function Home() {
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    redirect('/login');
  }

  // Load only the first page initially
  const { opportunities, total } = await getOpportunities(1, 6);

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Header />
      <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-bold text-primary">Your Opportunities</h1>
          <p className="text-muted-foreground">Manage your scholarships, PhD positions, and competitions</p>
        </div>
        <PaginatedOpportunityList 
          initialOpportunities={opportunities} 
          initialTotal={total}
        />
      </main>
    </div>
  );
}
