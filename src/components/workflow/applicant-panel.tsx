'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { candidates, type CandidateId, type ProfileAssessments } from '@/domain/opportunity/assessment';
import { stageLabels, type ApplicantProgress, type ApplicationStage } from '@/domain/opportunity/workflow';
import { ActionBadge } from './action-badge';
import type { ApplicantDetail } from '@/lib/applicant-workflow';
import { applicantAssessmentStatus, requestApplicantAssessment, saveApplicantProgress } from '@/lib/workflow-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function ApplicantPanel({ items, initialCandidate, legacy }: {
  items: ApplicantDetail[]; initialCandidate: CandidateId; legacy?: ProfileAssessments;
}) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const item = items.find((option) => option.candidate === candidate);
  return <section aria-labelledby="applicant-heading" className="mt-7 rounded-2xl border bg-background/50 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="applicant-heading" className="font-display text-lg font-semibold">Applicant plan</h2>
      <div className="flex gap-1 rounded-xl border bg-card p-1" role="group" aria-label="Applicant">
        {candidates.map((person) => <button key={person.id} type="button" aria-pressed={person.id === candidate}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground', person.id === candidate && 'bg-accent text-accent-foreground')}
          onClick={() => setCandidate(person.id)}>{person.name}</button>)}
      </div>
    </div>
    {item && <ApplicantCard key={item.candidate} item={item} legacy={legacy?.[candidate]} />}
  </section>;
}

function ApplicantCard({ item, legacy }: { item: ApplicantDetail; legacy?: ProfileAssessments[CandidateId] }) {
  const router = useRouter();
  const { id, candidate, summary, assessment, history } = item;
  const [progress, setProgress] = useState<ApplicantProgress>(summary.progress);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [pending, setPending] = useState(summary.jobState === 'pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let checks = 0;
    async function poll() {
      try {
        const result = await applicantAssessmentStatus({ id, candidate });
        if (cancelled) return;
        if (result.status !== 'pending') {
          setPending(false);
          setMessage(result.status === 'finished' ? 'Assessment updated.' : result.status === 'failed'
            ? 'Assessment failed. You can try again.' : 'Sign in to check the assessment.');
          router.refresh();
          return;
        }
      } catch {
        if (cancelled) return;
      }
      checks += 1;
      if (checks < 16) timer = setTimeout(poll, 8_000);
      else {
        setPending(false);
        setMessage('Assessment is still queued. It will continue in the background.');
      }
    }
    timer = setTimeout(poll, 4_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pending, candidate, id, router]);

  async function save() {
    setSaving(true);
    try {
      const result = await saveApplicantProgress({ id, candidate, ...progress });
      setMessage(result.message);
      if (result.success) router.refresh();
    } catch { setMessage('Could not save changes. Try again.'); }
    finally { setSaving(false); }
  }

  async function assess() {
    setRequesting(true);
    try {
      const result = await requestApplicantAssessment({ id, candidate });
      setMessage(result.message);
      if (result.success) setPending(true);
    } catch { setMessage('Could not start the assessment. Try again.'); }
    finally { setRequesting(false); }
  }

  return <>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <ActionBadge action={summary.action} />
        <p className="mt-1.5 text-sm text-muted-foreground">{summary.action.text}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={requesting || pending} onClick={() => void assess()}>
          {requesting || pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {pending ? 'Assessment queued' : summary.jobState === 'failed' ? 'Retry assessment' : assessment ? 'Reassess' : 'Assess applicant'}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link prefetch={false} href={`/agent?opportunity=${id}&candidate=${candidate}`}><Sparkles aria-hidden /> Draft outreach</Link>
        </Button>
      </div>
    </div>
    <form className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="space-y-1 text-sm font-medium">Application stage
        <select value={progress.stage} onChange={(event) => setProgress({ ...progress, stage: event.target.value as ApplicationStage })}
          className="block h-10 w-full rounded-md border border-input bg-card px-3 text-sm font-normal">
          {(Object.keys(stageLabels) as ApplicationStage[]).map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium">Follow-up date
        <Input type="date" className="block font-normal" value={progress.followUpOn ?? ''}
          onChange={(event) => setProgress({ ...progress, followUpOn: event.target.value || null })} />
      </label>
      <label className="space-y-1 text-sm font-medium sm:col-span-2">Follow-up note
        <Input className="font-normal" value={progress.note} maxLength={500} placeholder="Ask about funding, check status, or send a draft"
          onChange={(event) => setProgress({ ...progress, note: event.target.value })} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save progress'}</Button>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
    {assessment ? <div className="mt-5 border-t pt-4">
      <h3 className="font-semibold">Fit and requirements</h3>
      {summary.assessmentState === 'previous' && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Previous assessment · opportunity or profile evidence changed</p>}
      <p className="mt-2 text-sm"><span className="font-semibold capitalize">{assessment.fit} fit.</span> {assessment.explanation}</p>
      {assessment.checks.length > 0 && <ul className="mt-3 space-y-2 text-sm">
        {assessment.checks.map((check, index) => <li key={`${check.requirement}-${index}`} className="rounded-lg border bg-card px-3 py-2">
          <details>
            <summary className="cursor-pointer font-medium">{check.requirement} <span className="ml-1 text-xs font-normal capitalize text-muted-foreground">{check.status}</span></summary>
            {check.sourceExcerpt && <p className="mt-2 text-xs"><span className="font-medium">Opportunity evidence</span> “{check.sourceExcerpt}”</p>}
            {check.applicantExcerpt && <p className="mt-1 text-xs"><span className="font-medium">Applicant evidence</span> “{check.applicantExcerpt}”</p>}
            {!check.sourceExcerpt && !check.applicantExcerpt && <p className="mt-2 text-xs text-muted-foreground">Evidence is missing or inconclusive.</p>}
          </details>
        </li>)}
      </ul>}
      <p className="mt-3 text-xs text-muted-foreground">{item.assessedAt?.slice(0, 10)} · {item.model}</p>
    </div> : <p className="mt-4 text-sm text-muted-foreground">
      {legacy ? 'A prior fit assessment is available in history.' : 'Request an assessment to review fit and eligibility.'}
    </p>}
    {(legacy || Boolean(history?.length)) && <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium">Assessment history</summary>
      <ul className="mt-2 space-y-2 text-muted-foreground">
        {history?.map((entry) => <li key={entry.assessedAt}>{entry.assessedAt.slice(0, 10)} · {entry.result.fit} fit. {entry.result.explanation}</li>)}
        {legacy && <li>Earlier assessment · {legacy.assessedAt.slice(0, 10)}. {legacy.summary}</li>}
      </ul>
    </details>}
  </>;
}
