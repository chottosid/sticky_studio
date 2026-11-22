import { NextResponse } from 'next/server';
import { runAssessmentJobs, scheduleAssessments } from '@/lib/applicant-assessments';
import { refreshProfiles } from '@/lib/profiles';
import { recoverTelegramInbox } from '@/lib/telegram/process';

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const [assessments, inbox] = await Promise.allSettled([
    (async () => {
      await refreshProfiles();
      const keys = await scheduleAssessments();
      const result = await runAssessmentJobs(8);
      return { queued: keys.length, ...result };
    })(),
    recoverTelegramInbox(),
  ]);
  const success = assessments.status === 'fulfilled' && inbox.status === 'fulfilled';
  return NextResponse.json({
    success,
    assessments: assessments.status === 'fulfilled' ? assessments.value : { error: 'Assessment worker failed' },
    inbox: inbox.status === 'fulfilled' ? inbox.value : { error: 'Inbox worker failed' },
  }, { status: success ? 200 : 500 });
}
