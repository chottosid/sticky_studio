import { redirect } from 'next/navigation';
import Header from '@/components/layout/header';
import { ProfileAssessmentControls } from '@/components/opportunities/profile-priorities';
import { toProfileSummary } from '@/domain/opportunity/assessment';
import { isAuthenticated } from '@/lib/actions';
import { getCandidateProfiles } from '@/lib/profiles';

export const maxDuration = 300;

export default async function SettingsPage() {
  if (!(await isAuthenticated())) redirect('/login');
  const profiles = (await getCandidateProfiles()).map(toProfileSummary);
  return <>
    <Header />
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Settings</h1>
      <ProfileAssessmentControls profiles={profiles} />
    </main>
  </>;
}
