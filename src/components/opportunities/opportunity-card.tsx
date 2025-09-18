import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Opportunity } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Newspaper, Image as ImageIcon, FileText, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';

type OpportunityCardProps = {
  opportunity: Opportunity;
};

const iconMap: Record<Opportunity['documentType'], React.ElementType> = {
  image: ImageIcon,
  pdf: Newspaper,
  text: FileText,
  unknown: BrainCircuit,
};

export default function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const Icon = iconMap[opportunity.documentType] || BrainCircuit;

  const formattedDeadline = opportunity.deadline
    ? format(parseISO(opportunity.deadline), 'MMM dd, yyyy')
    : null;
    
  const isPastDeadline = opportunity.deadline ? new Date(opportunity.deadline) < new Date() : false;

  return (
    <Link href={`/opportunity/${opportunity.id}`} className="block transition-transform duration-200 hover:scale-105">
      <Card className="flex h-full flex-col overflow-hidden shadow-md hover:shadow-xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="font-headline text-lg leading-tight">{opportunity.name}</CardTitle>
            <Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
          </div>
          <CardDescription className="line-clamp-3 pt-2 text-sm">{opportunity.details}</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow" />
        <CardFooter>
          {formattedDeadline ? (
            <Badge variant={isPastDeadline ? 'destructive' : 'secondary'} className={cn(!isPastDeadline && 'bg-accent/20 text-accent-foreground')}>
              <CalendarDays className="mr-2 h-4 w-4" />
              {isPastDeadline ? 'Deadline Passed' : `Apply by ${formattedDeadline}`}
            </Badge>
          ) : (
            <Badge variant="outline">No Deadline</Badge>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
