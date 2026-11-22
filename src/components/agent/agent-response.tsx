'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowUpRight, Check, Copy, ExternalLink } from 'lucide-react';
import type { AgentResult, ResearchProposal } from '@/domain/opportunity/agent';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { ActionBadge } from '@/components/workflow/action-badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function AgentResponse({ result }: { result: AgentResult }) {
  if (result.kind === 'week') {
    if (!result.tasks.length) return <p className="text-sm">There are no upcoming tasks for this applicant.</p>;
    return (
      <section aria-label="Weekly priorities" className="space-y-2.5">
        <p className="text-sm">Here’s what to focus on this week.</p>
        <ol className="divide-y overflow-hidden rounded-2xl border bg-background/50">
          {result.tasks.map((task) => (
            <li key={task.id} className="px-3.5 py-3 sm:px-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
                <Link href={`/opportunity/${task.id}?candidate=${task.candidate}`} className="break-words text-sm font-semibold underline-offset-4 hover:text-primary hover:underline">
                  {task.name} <ArrowUpRight size={13} aria-hidden className="inline text-muted-foreground" />
                </Link>
                <span className="text-xs text-muted-foreground">{task.deadline ? `Due ${format(parseISO(task.deadline), 'd MMM')}` : 'No deadline'}</span>
              </div>
              <p className="mb-2 mt-1 break-words text-sm text-muted-foreground">{task.action.text}</p>
              <ActionBadge action={task.action} />
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (result.kind === 'research') {
    if (!result.proposals.length) return <p className="text-sm">I couldn’t find a match with a usable source. Try a narrower search.</p>;
    return (
      <section aria-label="Research results" className="space-y-2.5">
        <p className="text-sm">I found {result.proposals.length === 1 ? 'one opportunity' : `${result.proposals.length} opportunities`} with source links.</p>
        {result.proposals.map((proposal, index) => <ResearchCard key={`${proposal.sourceUrl}-${index}`} proposal={proposal} />)}
      </section>
    );
  }

  return <OutreachCard subject={result.subject} body={result.body} contact={result.contact} />;
}

function ResearchCard({ proposal }: { proposal: ResearchProposal }) {
  const [saved, setSaved] = useState(false);
  const item = proposal.draft.opportunities[0].opportunity;
  return (
    <article className="space-y-2.5 rounded-2xl border bg-background/50 px-3.5 py-3.5 sm:p-4">
      <div>
        <h3 className="break-words text-sm font-semibold sm:text-base">{item.name}</h3>
        {item.organizationName && <p className="mt-0.5 break-words text-xs text-muted-foreground">{item.organizationName}</p>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.details}</p>
      {item.deadline && <p className="text-xs text-muted-foreground">Deadline {format(parseISO(item.deadline), 'd MMM yyyy')}</p>}
      {item.contactEmail && <p className="break-all text-xs text-muted-foreground">Contact {item.contactEmail}</p>}
      {proposal.draft.warnings.map((warning) => <p key={warning} className="break-words text-xs text-muted-foreground">{warning}</p>)}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={proposal.sourceUrl} target="_blank" rel="noreferrer">Open source <ExternalLink aria-hidden /></a>
        </Button>
        {proposal.existing ? (
          <Button asChild variant="ghost" size="sm"><Link title={proposal.existing.name} href={`/opportunity/${proposal.existing.id}`}>Open saved match</Link></Button>
        ) : saved ? (
          <span role="status" className="inline-flex items-center gap-1.5 px-2 text-sm font-medium text-primary"><Check size={15} aria-hidden /> Saved</span>
        ) : (
          <AddOpportunityDialog reviewDraft={proposal.draft} trigger={<Button size="sm">Review and save</Button>} onSaved={() => setSaved(true)} />
        )}
      </div>
    </article>
  );
}

function OutreachCard({ subject, body, contact }: { subject: string; body: string; contact: string | null }) {
  const { toast } = useToast();

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast({ title: 'Draft copied' });
    } catch {
      toast({ title: 'Select and copy the draft text', variant: 'destructive' });
    }
  }

  return (
    <section aria-label="Outreach draft" className="overflow-hidden rounded-2xl border bg-background/50">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3.5 py-3 sm:px-4">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold">{subject}</h3>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">{contact ? `Saved contact ${contact}` : 'Verify the recipient before sending.'}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyDraft()}><Copy aria-hidden /> Copy draft</Button>
      </div>
      <p className="whitespace-pre-wrap break-words px-3.5 py-4 text-sm leading-relaxed sm:px-4">{body}</p>
    </section>
  );
}
