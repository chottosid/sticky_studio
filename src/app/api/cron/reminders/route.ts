import { NextResponse } from 'next/server';
import { appToday } from '@/lib/deadlines';
import { deliverReminders, queueReminders } from '@/lib/reminder-jobs';
import { reminderChatId } from '@/lib/telegram/api';

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const chatId = reminderChatId();
  if (chatId === null) {
    return NextResponse.json({ success: false, message: 'Telegram reminders are not configured.' }, { status: 503 });
  }

  try {
    const today = appToday();
    await queueReminders(today);
    return NextResponse.json({ success: true, today, ...await deliverReminders(chatId) });
  } catch {
    console.error('Reminder worker failed');
    return NextResponse.json({ success: false, message: 'Reminder worker failed.' }, { status: 500 });
  }
}
