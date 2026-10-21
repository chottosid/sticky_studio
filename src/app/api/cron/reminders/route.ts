import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { dueLabel, pendingReminder, type ReminderThreshold } from '@/lib/reminders';
import { dateInTimezone, escapeHtml } from '@/lib/utils';

type ReminderRow = {
  id: number;
  name: string;
  details: string;
  deadline: string;
  days_left: number;
  reminder_7_sent: boolean | null;
  reminder_3_sent: boolean | null;
  reminder_1_sent: boolean | null;
};

const flagColumn = (threshold: ReminderThreshold) => `reminder_${threshold}_sent`;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production'
    && (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Days are counted in the app's timezone; the database's CURRENT_DATE is UTC.
    const today = dateInTimezone(new Date(), process.env.APP_TIMEZONE || 'Asia/Dhaka');
    const { rows } = await query<ReminderRow>(`
      SELECT id, name, details, deadline::text AS deadline, (deadline - $1::date) AS days_left,
             reminder_7_sent, reminder_3_sent, reminder_1_sent
      FROM opportunities
      WHERE deadline BETWEEN $1::date AND $1::date + 7
    `, [today]);

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      const reminder = pendingReminder(row.days_left, {
        7: Boolean(row.reminder_7_sent), 3: Boolean(row.reminder_3_sent), 1: Boolean(row.reminder_1_sent),
      });
      if (!reminder) continue;

      // Claim before sending, so an overlapping run (retry, manual trigger) cannot send it twice.
      const columns = reminder.thresholds.map(flagColumn);
      const claim = await query(
        `UPDATE opportunities SET ${columns.map((column) => `${column} = true`).join(', ')}
         WHERE id = $1 AND ${columns.map((column) => `COALESCE(${column}, false) = false`).join(' AND ')}
         RETURNING id`,
        [row.id],
      );
      if (!claim.rowCount) continue;

      try {
        await sendReminderEmail(row);
        sent += 1;
      } catch (error) {
        console.error(`Reminder for opportunity ${row.id} failed:`, error);
        await query(
          `UPDATE opportunities SET ${columns.map((column) => `${column} = false`).join(', ')} WHERE id = $1`,
          [row.id],
        );
        failed += 1;
      }
    }

    return NextResponse.json({ success: true, today, considered: rows.length, sent, failed });
  } catch (error) {
    console.error('Reminder cron failed:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

async function sendReminderEmail(opportunity: ReminderRow) {
  const due = dueLabel(opportunity.days_left);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #b42318;">${escapeHtml(opportunity.name)} is ${due}</h2>
      <p><strong>Deadline:</strong> ${escapeHtml(opportunity.deadline)}</p>
      <div style="background: #f9f9f9; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(opportunity.details)}</div>
      <p><a href="${baseUrl}/opportunity/${opportunity.id}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Open opportunity</a></p>
    </div>
  `;
  const info = await sendEmail(`Reminder: ${opportunity.name} is ${due}`, html);
  if (!info) throw new Error('Reminder email was not sent.');
}
