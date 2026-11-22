import 'server-only';
import { candidates, type CandidateId } from '@/domain/opportunity/assessment';
import { applicantOpportunities } from './applicant-workflow';
import { query } from './db';
import { appToday, daysUntil } from './deadlines';
import { runJobs } from './jobs';
import { dueLabel, pendingReminder, type ReminderThreshold } from './reminders';
import { sendTelegramReminder } from './telegram/api';

type DeadlineJob = { kind: 'deadline'; id: string; date: string; threshold: ReminderThreshold };
type FollowUpJob = { kind: 'follow-up'; id: string; date: string; candidate: CandidateId };
type Reminder = DeadlineJob | FollowUpJob;
type DeadlineFlags = { reminder_7_sent: boolean; reminder_3_sent: boolean; reminder_1_sent: boolean };
const flags = (row: DeadlineFlags) => ({ 7: row.reminder_7_sent, 3: row.reminder_3_sent, 1: row.reminder_1_sent });

async function enqueue(key: string, payload: Reminder) {
  await query(`
    INSERT INTO studio_jobs (kind, dedupe_key, payload) VALUES ('reminder', $1, $2::jsonb)
    ON CONFLICT (kind, dedupe_key) DO NOTHING
  `, [key, JSON.stringify(payload)]);
}

function eligibleForDeadline(action: string) {
  return action === 'prepare' || action === 'verify' || action === 'follow-up';
}

export async function queueReminders(today: string) {
  const { rows } = await query<DeadlineFlags & { id: string; date: string }>(`
    SELECT id::text, deadline::text AS date, reminder_7_sent, reminder_3_sent, reminder_1_sent
    FROM opportunities WHERE posting_status = 'unknown' AND deadline BETWEEN $1::date AND $1::date + 7
    ORDER BY deadline, id
  `, [today]);
  const items = await applicantOpportunities();
  for (const row of rows) {
    const threshold = pendingReminder(daysUntil(row.date, today), flags(row))?.thresholds[0];
    if (!threshold || !items.some((item) => item.id === row.id && item.summary.progress.stage !== 'applied'
      && eligibleForDeadline(item.summary.action.kind))) continue;
    await enqueue(`deadline:${row.id}:${row.date}:${threshold}`, { kind: 'deadline', id: row.id, date: row.date, threshold });
  }
  for (const item of items) {
    const date = item.summary.progress.followUpOn;
    if (item.summary.action.kind === 'follow-up' && date && date <= today) {
      await enqueue(`follow-up:${item.id}:${item.candidate}:${date}`, { kind: 'follow-up', id: item.id, date, candidate: item.candidate });
    }
  }
}

function link(id: string, candidate?: CandidateId) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.NEXT_PUBLIC_BASE_URL || (host ? `https://${host}` : 'http://localhost:9002');
  return new URL(`/opportunity/${id}${candidate ? `?candidate=${candidate}` : ''}`, base);
}

const candidateName = (id: CandidateId) => candidates.find((person) => person.id === id)?.name || id;

export function deliverReminders(chatId: number) {
  return runJobs<Reminder>('reminder', 35, async ({ payload }) => {
    const today = appToday();
    const items = await applicantOpportunities({ ids: [payload.id] });
    if (payload.kind === 'follow-up') {
      const item = items.find((value) => value.candidate === payload.candidate);
      if (!item || item.summary.action.kind !== 'follow-up' || item.summary.progress.followUpOn !== payload.date || payload.date > today) return;
      await sendTelegramReminder(chatId, `${candidateName(payload.candidate)} · Follow up on ${item.name}\n${item.summary.action.text}\n${link(item.id, payload.candidate)}`);
      return;
    }
    const active = items.filter((item) => item.postingStatus === 'unknown' && item.deadline === payload.date
      && item.summary.progress.stage !== 'applied' && eligibleForDeadline(item.summary.action.kind));
    if (!active.length) return;
    const { rows: [row] } = await query<DeadlineFlags>(
      'SELECT reminder_7_sent, reminder_3_sent, reminder_1_sent FROM opportunities WHERE id = $1 AND deadline = $2::date',
      [payload.id, payload.date],
    );
    if (!row) return;
    const days = daysUntil(payload.date, today);
    const reminder = pendingReminder(days, flags(row));
    if (reminder?.thresholds[0] !== payload.threshold) return;
    const people = active.map((item) => `${candidateName(item.candidate)} · ${item.summary.action.label}`).join('\n');
    await sendTelegramReminder(chatId, `${active[0].name} is ${dueLabel(days)}\nDeadline ${payload.date}\n${people}\n${link(payload.id)}`);
    const columns = reminder.thresholds.map((value) => `reminder_${value}_sent = true`);
    await query(`UPDATE opportunities SET ${columns.join(', ')} WHERE id = $1 AND deadline = $2::date`, [payload.id, payload.date]);
  }, { budgetMs: 160_000 });
}
