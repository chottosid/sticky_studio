import { Opportunity } from '@/lib/types';
import OpportunityCard from './opportunity-card';

type OpportunityListProps = {
  opportunities: Opportunity[];
};

export default function OpportunityList({ opportunities }: OpportunityListProps) {
  if (opportunities.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
        <h3 className="font-headline text-xl font-semibold text-gray-700">No Opportunities Yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">Click "Add Opportunity" to get started.</p>
      </div>
    );
  }

  return (
    <>
      {opportunities.map((opportunity) => (
        <OpportunityCard key={opportunity.id} opportunity={opportunity} />
      ))}
    </>
  );
}
