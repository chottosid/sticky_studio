'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import {
  assessmentIsCurrent, candidates, priorityLabels,
  type ProfileSummary, type PriorityTier,
} from '@/domain/opportunity/assessment';
import type { Opportunity } from '@/lib/types';
import {
  assessOpportunitiesAction, getAssessmentQueueAction, refreshProfilesAction, updateProfileContextAction,
} from '@/lib/assessment-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const tierColors: Record<PriorityTier, string> = {
  P1: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  P2: 'border-sky-600/30 bg-sky-600/10 text-sky-800 dark:text-sky-300',
  P3: 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300',
  P4: 'border-border bg-secondary text-muted-foreground',
  ineligible: 'border-red-600/20 bg-red-600/5 text-red-800 dark:text-red-300',
  review: 'border-border bg-card text-muted-foreground',
};

export function PriorityBadge({ tier, name, stale }: { tier: PriorityTier; name?: string; stale?: boolean }) {
  return <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-xs font-medium', tierColors[tier])}>
    {name && `${name}: `}{stale ? 'Needs reassessment' : priorityLabels[tier]}
  </span>;
}

export function OpportunityPriorityBadges({ opportunity, profiles }: { opportunity: Opportunity; profiles: ProfileSummary[] }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">
    {candidates.map((candidate) => {
      const assessment = opportunity.profileAssessments?.[candidate.id];
      const current = assessmentIsCurrent(assessment, opportunity.contentRevision || 1,
        profiles.find((profile) => profile.id === candidate.id)?.contentHash);
      return <PriorityBadge key={candidate.id} name={candidate.name}
        tier={current ? assessment!.tier : 'review'} stale={Boolean(assessment && !current)} />;
    })}
  </div>;
}

export function ProfileAssessmentControls({ profiles }: { profiles: ProfileSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const stop = useRef(false);

  async function run(refresh: boolean) {
    setBusy(true); stop.current = false; setMessage(refresh ? 'Reading both portfolios…' : 'Checking pending assessments…');
    try {
      if (refresh) {
        const result = await refreshProfilesAction();
        if (!result.success) throw new Error(result.message);
        if (result.profiles.some((profile) => profile.fetchError)) {
          setMessage('Some portfolios could not refresh. The last saved snapshots will be used.');
        }
      }
      const queue = await getAssessmentQueueAction();
      if (!queue.success) throw new Error(queue.message);
      let done = 0;
      let skipped = 0;
      for (let offset = 0; offset < queue.ids.length && !stop.current; offset += 3) {
        setMessage(`Assessing both profiles: ${done} of ${queue.ids.length} opportunities complete…`);
        const result = await assessOpportunitiesAction(queue.ids.slice(offset, offset + 3));
        if (!result.success) throw new Error(result.message);
        done += result.assessed;
        skipped += result.skipped;
        router.refresh();
      }
      setMessage(stop.current ? `Stopped after ${done} opportunities. Saved assessments are retained.`
        : queue.ids.length ? `Assessed ${done} opportunities for both profiles.${skipped ? ` ${skipped} changed or were already being assessed; retry pending.` : ''}`
          : 'Both profiles’ assessments are up to date.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Assessment failed. Try again.'); }
    finally { setBusy(false); router.refresh(); }
  }

  return <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="profiles-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="profiles-heading" className="font-semibold">Your priorities, separately</h2>
        <p className="mt-1 text-sm text-muted-foreground">Portfolio-based fit and eligibility for Swarup and Archita. Tiers guide effort; they are not acceptance odds.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(false)}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Assess pending
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(true)}>Refresh portfolios & assess</Button>
        {busy && <Button size="sm" variant="ghost" onClick={() => { stop.current = true; setMessage('Stopping after the current batch…'); }}>Stop</Button>}
      </div>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {profiles.map((profile) => <ProfileNotes key={profile.id} profile={profile} disabled={busy} />)}
    </div>
    {message && <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>}
  </section>;
}

function ProfileNotes({ profile, disabled }: { profile: ProfileSummary; disabled: boolean }) {
  const [context, setContext] = useState(profile.additionalContext);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  return <div className="min-w-0">
    <a href={profile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
      {profile.name} <ExternalLink className="h-3 w-3" />
    </a>
    <p className="mt-1 text-xs text-muted-foreground">{profile.fetchedAt ? `Portfolio read ${new Date(profile.fetchedAt).toLocaleDateString()}` : 'Portfolio not read yet'}</p>
    {profile.fetchError && <p className="mt-1 text-xs text-destructive">Latest refresh failed; {profile.fetchedAt ? 'using saved portfolio.' : 'assessment needs a portfolio.'}</p>}
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Additional facts & preferences</summary>
      <p className="my-2 text-xs text-muted-foreground">Add test scores, goals or constraints absent from the website. Changing these makes old assessments due for review.</p>
      <Textarea aria-label={`${profile.name} additional facts`} value={context} maxLength={6000} rows={4} onChange={(event) => setContext(event.target.value)} />
      <Button size="sm" variant="outline" className="mt-2" disabled={disabled || saving || context === profile.additionalContext} onClick={async () => {
        setSaving(true);
        try {
          const result = await updateProfileContextAction({ id: profile.id, context });
          setMessage(result.success ? 'Saved. Use Assess pending to update priorities.' : result.message || 'Could not save.');
          router.refresh();
        } catch { setMessage('Could not save profile notes.'); }
        finally { setSaving(false); }
      }}>{saving ? 'Saving…' : 'Save facts'}</Button>
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    </details>
  </div>;
}

export function OpportunityProfileAssessments({ opportunity, profiles }: { opportunity: Opportunity; profiles: ProfileSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="mt-8 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="fit-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="fit-heading" className="font-semibold">Fit & priority for each of you</h2>
      <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try {
          const result = await assessOpportunitiesAction([opportunity.id], true);
          if (!result.success) setError(result.message);
          else if (!result.assessed) setError('Already being assessed, or changed during assessment. Try again shortly.');
          router.refresh();
        } catch { setError('Assessment could not finish. Existing results are retained.'); }
        finally { setBusy(false); }
      }}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {busy ? 'Assessing…' : 'Reassess both'}</Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">AI assessments based on the saved portfolio snapshots and this opportunity’s evidence. Priorities are not admission probabilities.</p>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-5 grid gap-6 sm:grid-cols-2">
      {candidates.map((candidate) => {
        const assessment = opportunity.profileAssessments?.[candidate.id];
        const profile = profiles.find((item) => item.id === candidate.id);
        const current = assessmentIsCurrent(assessment, opportunity.contentRevision || 1, profile?.contentHash);
        return <div key={candidate.id}>
          <a href={candidate.website} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary">{candidate.name}</a>
          <div className="mt-2"><PriorityBadge tier={current ? assessment!.tier : 'review'} stale={Boolean(assessment && !current)} /></div>
          {!assessment ? <p className="mt-3 text-sm text-muted-foreground">Not assessed yet. Use Reassess both.</p> : <>
            {!current && <p className="mt-3 text-xs text-amber-700">Previous assessment below. The opportunity, portfolio or assessment date needs a fresh review.</p>}
            <p className="mt-3 text-sm leading-relaxed">{assessment.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">Fit: {assessment.fit} · Eligibility: {assessment.eligibility} · Confidence: {assessment.confidence}</p>
            {[{ label: 'Why it fits', items: assessment.strengths }, { label: 'Gaps & checks', items: assessment.gaps }].map(({ label, items }) => items.length > 0 &&
              <div key={label} className="mt-4"><h3 className="text-xs font-semibold">{label}</h3><ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
            <div className="mt-4"><h3 className="text-xs font-semibold">Next step</h3><p className="mt-1 text-sm">{assessment.nextStep}</p></div>
            <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Profile evidence</summary><ul className="mt-2 list-disc space-y-1 pl-4">{assessment.profileEvidence.map((item) => <li key={item}>{item}</li>)}</ul></details>
            <p className="mt-3 text-xs text-muted-foreground">Assessed {new Date(assessment.assessedAt).toLocaleDateString()} · {assessment.model}</p>
          </>}
        </div>;
      })}
    </div>
  </section>;
}
