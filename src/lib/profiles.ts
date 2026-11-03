import 'server-only';
import { createHash } from 'node:crypto';
import { fetchPage } from '@/ai/enrichment';
import { CandidateIdSchema, type CandidateId, type CandidateProfile } from '@/domain/opportunity/assessment';
import { query } from './db';

const PROFILE_TTL = 24 * 60 * 60 * 1_000;
export const profileHash = (text: string, context: string) => createHash('sha256').update(JSON.stringify([text, context])).digest('hex');

export async function getCandidateProfiles(): Promise<CandidateProfile[]> {
  const { rows } = await query('SELECT * FROM candidate_profiles ORDER BY id DESC');
  return rows.map((row) => ({
    id: CandidateIdSchema.parse(row.id), name: row.name, website: row.website,
    text: row.profile_text, additionalContext: row.additional_context, contentHash: row.content_hash,
    fetchedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : null,
    fetchError: row.fetch_error,
  }));
}

export async function refreshProfiles(force = false) {
  const profiles = await getCandidateProfiles();
  if (profiles.length !== 2) throw new Error('Apply migration 007 to configure both candidate profiles.');
  await Promise.all(profiles.map(async (profile) => {
    if (!force && profile.fetchedAt && Date.now() - Date.parse(profile.fetchedAt) < PROFILE_TTL) return;
    try {
      const page = await fetchPage(profile.website, `profile-${profile.id}`);
      const text = (page.text || '').trim().slice(0, 35_000);
      if (text.length < 250 || !text.toLowerCase().includes(profile.id === 'swarup' ? 'swarup' : 'archita')) {
        throw new Error('The portfolio page did not contain a usable profile.');
      }
      await query(`UPDATE candidate_profiles SET profile_text=$2,
        content_hash=$3, fetched_at=now(), fetch_error=NULL, updated_at=now() WHERE id=$1 AND additional_context=$4`,
      [profile.id, text, profileHash(text, profile.additionalContext), profile.additionalContext]);
    } catch (error) {
      await query('UPDATE candidate_profiles SET fetch_error=$2 WHERE id=$1',
        [profile.id, error instanceof Error ? error.message.slice(0, 500) : 'Profile refresh failed.']);
    }
  }));
  return getCandidateProfiles();
}

export async function updateProfileContext(id: CandidateId, context: string) {
  // A simultaneous portfolio refresh must not leave a hash of an older snapshot.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const profile = (await getCandidateProfiles()).find((item) => item.id === id);
    if (!profile) throw new Error('Profile not found.');
    const result = await query(`UPDATE candidate_profiles SET additional_context=$2, content_hash=$3, updated_at=now()
      WHERE id=$1 AND profile_text=$4`, [id, context, profileHash(profile.text, context), profile.text]);
    if (result.rowCount) return;
  }
  throw new Error('The portfolio changed while saving. Try saving the notes again.');
}
