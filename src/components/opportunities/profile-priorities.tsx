'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import type { ProfileSummary } from '@/domain/opportunity/assessment';
import { refreshProfilesAction, updateProfileContextAction } from '@/lib/assessment-actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ProfileAssessmentControls({ profiles }: { profiles: ProfileSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function refresh() {
    setBusy(true);
    setMessage('Reading both portfolios…');
    try {
      const result = await refreshProfilesAction();
      if (!result.success) throw new Error(result.message);
      const issue = result.profiles.some((profile) => profile.fetchError);
      setMessage(issue ? 'A portfolio could not refresh. Saved evidence is still available.'
        : result.queued ? `Portfolios refreshed. Queued ${result.queued} assessments.` : 'Portfolios refreshed.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh portfolios.'); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="profiles-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="profiles-heading" className="font-display text-lg font-semibold tracking-tight">Applicant profiles</h2>
        <p className="mt-1 text-sm text-muted-foreground">Portfolio evidence and preferences used to assess fit.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh portfolios
        </Button>
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
          setMessage(result.success ? 'Saved. Assessments using changed evidence will refresh.' : result.message || 'Could not save.');
          router.refresh();
        } catch { setMessage('Could not save profile notes.'); }
        finally { setSaving(false); }
      }}>{saving ? 'Saving…' : 'Save facts'}</Button>
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    </details>
  </div>;
}
