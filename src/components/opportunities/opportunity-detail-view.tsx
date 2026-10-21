'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ExternalLink, Mail, Pencil, Trash2 } from 'lucide-react';
import type { Opportunity } from '@/lib/types';
import { opportunityCategoryLabels } from '@/domain/opportunity/config';
import { Button } from '@/components/ui/button';
import { DeadlineMark } from './deadline-mark';
import { EditOpportunityDialog } from './edit-opportunity-dialog';
import { DeleteOpportunityDialog } from './delete-opportunity-dialog';

type Props = { opportunity: Opportunity; today: string };

type Fact = { label: string; value: string | string[] | null | undefined };

function facts(opportunity: Opportunity): Fact[] {
  const common: Fact[] = [
    { label: 'Organization type', value: opportunity.organizationType },
    { label: 'Eligibility', value: opportunity.eligibility },
    { label: 'Requirements', value: opportunity.requirements },
  ];
  if (opportunity.category === 'higher-study') {
    const a = opportunity.attributes;
    return [
      { label: 'Program or position', value: a.programName },
      { label: 'Degree', value: a.degreeLevel },
      { label: 'Department', value: a.department },
      { label: 'Professors', value: a.professorNames },
      { label: 'Lab or group', value: a.labName },
      { label: 'Research areas', value: a.researchAreas },
      { label: 'Funding', value: a.funding },
      { label: 'Starts', value: a.startTerm },
      ...common,
    ];
  }
  if (opportunity.category === 'contest') {
    const a = opportunity.attributes;
    return [
      { label: 'Theme', value: a.theme },
      { label: 'Prize', value: a.prize },
      { label: 'Event date', value: a.eventDate },
      ...common,
    ];
  }
  const a = opportunity.attributes;
  return [
    { label: 'Role', value: a.roleTitle },
    { label: 'Employment', value: a.employmentType },
    { label: 'Workplace', value: a.workplaceMode },
    { label: 'Compensation', value: a.compensation },
    { label: 'Duration', value: opportunity.category === 'internship' ? a.duration : null },
    { label: 'Skills', value: a.skills },
    ...common,
  ];
}

const hasValue = (value: Fact['value']) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

/** "lnkd.in/eC7wE9vd" rather than the full URL; host alone can't tell two links apart. */
function shortUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}`;
  } catch {
    return url;
  }
}

export default function OpportunityDetailView({ opportunity, today }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();

  const goBack = () => {
    // Return to the filtered list the user came from; a fresh tab has nothing to go back to.
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push('/');
  };

  const place = [opportunity.organizationName, opportunity.location].filter(Boolean).join(', ');
  const shownFacts = facts(opportunity).filter((fact) => hasValue(fact.value));
  const sources = opportunity.sources.length
    ? opportunity.sources.map((source) => ({
      id: source.id,
      label: source.storagePath ? source.originalName || 'Saved file' : shortUrl(source.sourceUrl || ''),
      href: source.storagePath ? `/api/sources/${source.id}` : source.sourceUrl,
    }))
    : opportunity.documentUri
      ? [{ id: 'legacy', label: 'Original document', href: opportunity.documentUri }]
      : [];

  return (
    <article className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" onClick={goBack} className="-ml-3 text-muted-foreground">
        <ArrowLeft aria-hidden />
        All opportunities
      </Button>

      <header className="mt-6 space-y-3">
        <p className="text-sm text-muted-foreground">{opportunityCategoryLabels[opportunity.category]}</p>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{opportunity.name}</h1>
        {place && <p className="text-lg text-muted-foreground">{place}</p>}
      </header>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-y py-5">
        <div className="flex items-end gap-4">
          <DeadlineMark deadline={opportunity.deadline} today={today} size="lg" />
          <p className="pb-1 text-sm text-muted-foreground">
            {opportunity.deadline
              ? `Deadline ${format(parseISO(opportunity.deadline), 'EEEE, d MMMM yyyy')}`
              : 'No deadline given'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {opportunity.applicationUrl && (
            <Button asChild>
              <a href={opportunity.applicationUrl} target="_blank" rel="noreferrer">
                Apply <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
          {opportunity.contactEmail && (
            <Button asChild variant="outline">
              <a href={`mailto:${opportunity.contactEmail}`}>
                <Mail aria-hidden /> {opportunity.contactEmail}
              </a>
            </Button>
          )}
        </div>
      </div>

      {opportunity.details && (
        <p className="mt-8 max-w-prose whitespace-pre-wrap text-[1.0625rem] leading-relaxed">{opportunity.details}</p>
      )}

      {shownFacts.length > 0 && (
        <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {shownFacts.map((fact) => (
            <div key={fact.label} className={Array.isArray(fact.value) || (fact.value?.length ?? 0) > 120 ? 'sm:col-span-2' : undefined}>
              <dt className="text-sm text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1">
                {Array.isArray(fact.value) ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {fact.value.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                ) : (
                  <span className="whitespace-pre-wrap">{fact.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section className="mt-10" aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="text-sm text-muted-foreground">Sources</h2>
        {sources.length ? (
          <ul className="mt-2 space-y-1">
            {sources.map((source) => source.href && (
              <li key={source.id} className="min-w-0">
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-2 text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{source.label}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm">No source is attached.</p>
        )}
      </section>

      <footer className="mt-12 flex gap-2 border-t pt-6">
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden /> Edit
        </Button>
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 aria-hidden /> Delete
        </Button>
      </footer>

      <EditOpportunityDialog
        opportunity={opportunity}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => router.refresh()}
      />
      <DeleteOpportunityDialog
        opportunity={opportunity}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onSuccess={() => router.push('/')}
      />
    </article>
  );
}
