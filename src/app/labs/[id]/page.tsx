import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Header from '@/components/layout/header';
import { OrganizationDialog } from '@/components/labs/organization-dialog';
import { ProfessorList } from '@/components/labs/professor-list';
import { DeadlineMark } from '@/components/opportunities/deadline-mark';
import { opportunityCategoryLabels } from '@/domain/opportunity/config';
import { isAuthenticated } from '@/lib/actions';
import { appToday } from '@/lib/deadlines';
import { getOrganization } from '@/lib/labs';

export const maxDuration = 300;

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect('/login');
  const org = await getOrganization((await params).id);
  if (!org) notFound();
  const today = appToday();
  const openings = org.opportunities;
  return <>
    <Header active="labs" />
    <main className="mx-auto max-w-6xl space-y-10 px-4 pb-16 pt-6 sm:px-6">
      <div>
        <Link href="/labs" className="-ml-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} aria-hidden /> All universities</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{org.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {[org.country, `${org.professors} ${org.professors === 1 ? 'professor' : 'professors'}`, org.taking > 0 && `${org.taking} taking students`,
                org.nextDeadline && `next deadline ${format(parseISO(org.nextDeadline), 'd MMM yyyy')}`].filter(Boolean).join(' · ')}
            </p>
            {org.website && <a href={org.website} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"><ExternalLink size={14} aria-hidden /> Website</a>}
          </div>
          <OrganizationDialog organizationId={org.id} initial={{ name: org.name, country: org.country, website: org.website, notes: org.notes }} />
        </div>
        {org.notes && <p className="mt-4 max-w-prose whitespace-pre-wrap text-sm">{org.notes}</p>}
      </div>

      <ProfessorList organizationId={org.id} professors={org.professorList} openings={openings.map(({ id, name }) => ({ id, name }))} />

      <section aria-labelledby="openings-heading" className="space-y-4">
        <h2 id="openings-heading" className="font-display text-2xl font-semibold">Openings <span className="text-base font-normal text-muted-foreground">({openings.length})</span></h2>
        {openings.length === 0 ? <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">No openings are saved for this university.</p> : (
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {openings.map((item) => (
              <li key={item.id}>
                <Link href={`/opportunity/${item.id}`} prefetch={false} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 px-4 py-4 transition-colors hover:bg-accent/60 sm:px-5">
                  <div className="pt-0.5">
                    {item.postingStatus === 'closed' ? <span className="text-xs text-muted-foreground">Closed</span>
                      : item.postingStatus === 'rolling' ? <span className="text-xs font-medium text-primary">Rolling</span>
                        : <DeadlineMark deadline={item.deadline} today={today} />}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-semibold leading-snug">{item.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{opportunityCategoryLabels[item.category as keyof typeof opportunityCategoryLabels] ?? item.category}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  </>;
}
