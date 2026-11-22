import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, CalendarClock, ClipboardList, CornerDownRight } from 'lucide-react';
import Header from '@/components/layout/header';
import { opportunityCategoryLabels } from '@/domain/opportunity/config';
import { CandidateIdSchema, candidates } from '@/domain/opportunity/assessment';
import { ActionBadge } from '@/components/workflow/action-badge';
import { isAuthenticated } from '@/lib/actions';
import { applicantOpportunities, groupApplicantWork, type ApplicantOpportunity } from '@/lib/applicant-workflow';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

export const maxDuration = 300;

export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAuthenticated())) redirect('/login');
  const params = await searchParams;
  if (['q', 'sort', 'status', 'category', 'priority'].some((key) => key in params)) {
    const entries = Object.entries(params).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []);
    redirect(`/ledger?${new URLSearchParams(entries)}`);
  }
  const candidate = CandidateIdSchema.catch('swarup').parse(params.candidate);
  const groups = groupApplicantWork(await applicantOpportunities({ candidate }));
  const sections = [
    { key: 'follow-ups', title: 'Follow-ups', icon: CornerDownRight, items: groups['follow-ups'], empty: 'No follow-ups due in the next seven days.' },
    { key: 'due', title: 'Due soon', icon: CalendarClock, items: groups.due, empty: 'No ready applications due in the next seven days.' },
    { key: 'prepare', title: 'Prepare next', icon: ClipboardList, items: groups.prepare, empty: 'No other applications ready to prepare.' },
  ];
  const expanded = sections.find((section) => section.key === params.view);
  return <>
    <Header active="today" />
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">Applications and follow-ups for {candidates.find((person) => person.id === candidate)?.name}.</p>
        </div>
        <nav aria-label="Applicant" className="flex gap-1 rounded-xl border bg-card p-1">
          {candidates.map((person) => <Link key={person.id} href={`/?candidate=${person.id}`} aria-current={person.id === candidate ? 'page' : undefined}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground', person.id === candidate && 'bg-accent text-accent-foreground')}>{person.name}</Link>)}
        </nav>
      </div>
      {expanded && <Link href={`/?candidate=${candidate}`} className="mb-4 inline-block text-sm font-medium text-primary">Back to Today</Link>}
      <div className={cn('grid items-start gap-4', expanded ? 'max-w-2xl' : 'sm:grid-cols-2')}>
        {(expanded ? [expanded] : sections).map(({ key, title, icon: Icon, items, empty }) => <section key={title} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Icon size={17} aria-hidden className="text-primary" />{title}</h2>
          {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{empty}</p> : <>
            <WorkItems items={expanded ? items : items.slice(0, 5)} />
            {!expanded && items.length > 5 && <Link href={`/?candidate=${candidate}&view=${key}`}
              className="mt-3 block border-t pt-3 text-sm font-medium text-primary hover:underline">See all {items.length}</Link>}
          </>}
        </section>)}
      </div>
    </main>
  </>;
}

function WorkItems({ items }: { items: ApplicantOpportunity[] }) {
  return <ul className="mt-2 divide-y">
    {items.map((item) => {
      const date = item.summary.action.kind === 'follow-up' ? item.summary.progress.followUpOn : item.deadline;
      return <li key={item.id} className="py-3">
        <Link href={`/opportunity/${item.id}?candidate=${item.candidate}`} prefetch={false}
          className="text-sm font-semibold underline-offset-4 hover:text-primary hover:underline">{item.name} <ArrowUpRight size={13} className="inline text-muted-foreground" aria-hidden /></Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {[item.organization || opportunityCategoryLabels[item.category], date && format(parseISO(date), 'd MMM'), item.postingStatus === 'rolling' && !date && 'Rolling'].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-2"><ActionBadge action={item.summary.action} /></div>
        <p className="mt-1 break-words text-sm text-muted-foreground">{item.summary.action.text}</p>
      </li>;
    })}
  </ul>;
}
