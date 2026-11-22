'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import type { AgentResult } from '@/domain/opportunity/agent';
import { candidates, priorityLabels, type CandidateId } from '@/domain/opportunity/assessment';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { runAgent } from '@/lib/agent-actions';

const actions = {
  week: { tab: 'Plan my week', submit: 'Show priorities' },
  research: { tab: 'Research', submit: 'Find opportunities' },
  outreach: { tab: 'Draft outreach', submit: 'Write draft' },
} as const;

type Mode = keyof typeof actions;

export function AgentWorkspace({ opportunities }: { opportunities: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<Mode>('week');
  const [candidate, setCandidate] = useState<CandidateId>('swarup');
  const [search, setSearch] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState('');
  const { toast } = useToast();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await runAgent({ kind: mode, candidate, query: search, opportunityId });
      if (response.success) setResult(response.result);
      else setError(response.message);
    } catch {
      setError('Could not reach Sticky Studio. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft(subject: string, body: string) {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast({ title: 'Draft copied' });
    } catch {
      toast({ title: 'Select and copy the draft text', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(value) => {
        setMode(value as Mode);
        setResult(null);
        setError('');
      }}>
        <TabsList className="grid w-full grid-cols-3 sm:w-fit">
          {(Object.keys(actions) as Mode[]).map((value) => (
            <TabsTrigger key={value} value={value} disabled={busy}>{actions[value].tab}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={mode}>
          <form className="space-y-4 rounded-lg border bg-card p-4 sm:p-6" onSubmit={submit}>
            <div className="space-y-2 sm:max-w-xs">
              <Label htmlFor="agent-applicant">Applicant</Label>
              <Select value={candidate} onValueChange={(value) => {
                setCandidate(value as CandidateId);
                setResult(null);
              }} disabled={busy}>
                <SelectTrigger id="agent-applicant"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {candidates.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {mode === 'research' && (
              <div className="space-y-2">
                <Label htmlFor="agent-research">What are you looking for?</Label>
                <Textarea id="agent-research" value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder="Funded PhD openings in geometric deep learning" minLength={3} maxLength={500} required disabled={busy} />
              </div>
            )}
            {mode === 'outreach' && (
              <div className="space-y-2">
                <Label htmlFor="agent-opportunity">Opportunity</Label>
                <Select value={opportunityId} onValueChange={(value) => {
                  setOpportunityId(value);
                  setResult(null);
                }} disabled={busy || !opportunities.length}>
                  <SelectTrigger id="agent-opportunity"><SelectValue placeholder={opportunities.length ? 'Select a saved opportunity' : 'Save an opportunity first'} /></SelectTrigger>
                  <SelectContent>
                    {opportunities.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={busy || (mode === 'outreach' && !opportunityId)}>
              {busy && <Loader2 aria-hidden className="animate-spin" />}
              {busy ? 'Working…' : actions[mode].submit}
            </Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </form>
        </TabsContent>
      </Tabs>

      {result?.kind === 'week' && (
        <section aria-label="Weekly priorities" aria-live="polite" className="space-y-3">
          {result.tasks.length === 0 && <p className="text-sm text-muted-foreground">No upcoming tasks for this applicant.</p>}
          {result.tasks.map((task) => (
            <article key={task.id} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link className="font-semibold underline-offset-4 hover:underline" href={`/opportunity/${task.id}`}>{task.name}</Link>
                <Badge variant="secondary">{priorityLabels[task.tier]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{task.deadline ? `Due ${task.deadline}` : 'No deadline listed'}</p>
              <p className="text-sm">{task.nextStep}</p>
            </article>
          ))}
        </section>
      )}

      {result?.kind === 'research' && (
        <section aria-label="Research results" aria-live="polite" className="space-y-3">
          {result.proposals.length === 0 && <p className="text-sm text-muted-foreground">No matching opportunities had a usable source. Try a narrower search.</p>}
          {result.proposals.map((proposal) => {
            const item = proposal.draft.opportunities[0].opportunity;
            return (
              <article key={`${proposal.sourceUrl}-${item.name}`} className="space-y-3 rounded-lg border bg-card p-4">
                <h2 className="font-semibold">{item.name}</h2>
                <p className="whitespace-pre-wrap text-sm">{item.details}</p>
                {item.deadline && <p className="text-sm text-muted-foreground">Deadline {item.deadline}</p>}
                {item.contactEmail && <p className="text-sm text-muted-foreground">Contact {item.contactEmail}</p>}
                {proposal.draft.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={proposal.sourceUrl} target="_blank" rel="noreferrer">Open source <ExternalLink aria-hidden /></a>
                  </Button>
                  {proposal.existing ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link title={proposal.existing.name} href={`/opportunity/${proposal.existing.id}`}>Open saved match</Link>
                    </Button>
                  ) : (
                    <AddOpportunityDialog reviewDraft={proposal.draft} trigger={<Button size="sm">Review and save</Button>}
                      onSaved={() => setResult((current) => {
                        if (current?.kind !== 'research') return current;
                        const proposals = current.proposals.filter((entry) => entry !== proposal);
                        return proposals.length ? { ...current, proposals } : null;
                      })} />
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {result?.kind === 'outreach' && (
        <section aria-label="Outreach draft" aria-live="polite" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
          <div className="space-y-1">
            <h2 className="font-semibold">{result.subject}</h2>
            <p className="text-sm text-muted-foreground">{result.contact ? `Saved contact ${result.contact}` : 'Verify the recipient before sending.'}</p>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{result.body}</p>
          <Button variant="outline" size="sm" onClick={() => void copyDraft(result.subject, result.body)}>
            <Copy aria-hidden /> Copy draft
          </Button>
        </section>
      )}
    </div>
  );
}
