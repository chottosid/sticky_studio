import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { dueLabel, pendingReminder, type ReminderThreshold } from '@/lib/reminders';
import { reminderChatId, sendTelegramReminder } from '@/lib/telegram/api';
import { appToday } from '@/lib/deadlines';

export const maxDuration = 300;

type ReminderRow = {
  id: number;
  name: string;
  deadline: string;
  days_left: number;
  reminder_7_sent: boolean | null;
  reminder_3_sent: boolean | null;
  reminder_1_sent: boolean | null;
};

const flagColumn = (threshold: ReminderThreshold) => `reminder_${threshold}_sent`;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const chatId = reminderChatId();
  if (chatId === null) {
    return NextResponse.json({ success: false, message: 'Telegram reminders are not configured.' }, { status: 503 });
  }

  try {
    // Days are counted in the app's timezone; the database's CURRENT_DATE is UTC.
    const today = appToday();
    const { rows } = await query<ReminderRow>(`
      SELECT id, name, deadline::text AS deadline, (deadline - $1::date) AS days_left,
             reminder_7_sent, reminder_3_sent, reminder_1_sent
      FROM opportunities
      WHERE deadline BETWEEN $1::date AND $1::date + 7
      ORDER BY deadline, id
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
         WHERE id = $1 AND deadline = $2::date
           AND ${columns.map((column) => `COALESCE(${column}, false) = false`).join(' AND ')}
         RETURNING id`,
        [row.id, row.deadline],
      );
      if (!claim.rowCount) continue;

      try {
        await sendTelegramReminder(chatId, reminderMessage(row));
        sent += 1;
      } catch (error) {
        console.error(`Reminder for opportunity ${row.id} failed:`, error);
        await query(
          `UPDATE opportunities SET ${columns.map((column) => `${column} = false`).join(', ')}
           WHERE id = $1 AND deadline = $2::date`,
          [row.id, row.deadline],
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

function reminderMessage(opportunity: ReminderRow) {
  const due = dueLabel(opportunity.days_left);
  const deployedHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (deployedHost ? `https://${deployedHost}` : 'http://localhost:9002');
  const href = new URL(`/opportunity/${opportunity.id}`, baseUrl);
  return `${opportunity.name} is ${due}\nDeadline ${opportunity.deadline}\n${href}`;
}
