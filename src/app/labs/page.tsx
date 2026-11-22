import Link from 'next/link';
import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Search } from 'lucide-react';
import Header from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isAuthenticated } from '@/lib/actions';
import { listOrganizations } from '@/lib/labs';

export const maxDuration = 300;

export default async function LabsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAuthenticated())) redirect('/login');
  const { q } = await searchParams;
  const search = typeof q === 'string' ? q.slice(0, 200) : '';
  const organizations = await listOrganizations(search);
  return <>
    <Header active="labs" />
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Labs</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {organizations.length} {organizations.length === 1 ? 'university' : 'universities'} with professors or higher-study openings
          </p>
        </div>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={search} aria-label="Search universities, professors or research areas" placeholder="University, professor or area" className="bg-card pl-9" />
          </div>
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </div>
      {organizations.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          {search ? 'No university matches that search.' : 'Nothing here yet. Universities appear once an opening or a professor is saved for them.'}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {organizations.map((org) => (
            <li key={org.id}>
              <Link href={`/labs/${org.id}`} prefetch={false}
                className="grid gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
                <div className="min-w-0">
                  <p className="break-words font-semibold leading-snug">{org.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[org.country, `${org.professors} ${org.professors === 1 ? 'professor' : 'professors'}`, org.taking > 0 && `${org.taking} taking students`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground sm:text-right">
                  {org.openings} {org.openings === 1 ? 'opening' : 'openings'}
                  {org.nextDeadline && <span className="block font-medium text-foreground">Next deadline {format(parseISO(org.nextDeadline), 'd MMM yyyy')}</span>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  </>;
}
