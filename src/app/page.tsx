import Header from '@/components/layout/header';
import PaginatedOpportunityList from '@/components/opportunities/paginated-opportunity-list';
import { getOpportunities } from '@/lib/data';
import { isAuthenticated } from '@/lib/actions';
import { redirect } from 'next/navigation';
import { OpportunityCategory } from '@/lib/types';

const categoryLabels: Record<OpportunityCategory, string> = {
  'job': 'Jobs',
  'internship': 'Internships',
  'contest': 'Contests',
  'higher-study': 'Higher Study',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect('/login');
  }

  const params = await searchParams;
  const category = params.category as OpportunityCategory | undefined;

  // Validate category
  const validCategories: OpportunityCategory[] = ['job', 'internship', 'contest', 'higher-study'];
  const validCategory = category && validCategories.includes(category) ? category : undefined;

  // Load only the first page initially
  const { opportunities, total } = await getOpportunities(
    1,
    6,
    'created_at',
    'DESC',
    undefined,
    'upcoming',
    validCategory
  );

  const pageTitle = validCategory ? categoryLabels[validCategory] : 'Your Opportunities';
  const pageDescription = validCategory
    ? `Manage your ${pageTitle.toLowerCase()}`
    : 'Manage your scholarships, PhD positions, and competitions';

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Header />
      <main className="flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-bold text-primary">{pageTitle}</h1>
          <p className="text-muted-foreground">{pageDescription}</p>
        </div>
        <PaginatedOpportunityList
          initialOpportunities={opportunities}
          initialTotal={total}
          initialStatus="upcoming"
          initialCategory={validCategory}
        />
      </main>
    </div>
  );
}
