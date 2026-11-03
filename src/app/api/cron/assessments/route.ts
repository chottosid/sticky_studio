import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { assessmentQueue, assessOpportunities } from '@/lib/assessments';

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const ids = await assessmentQueue();
    const started = Date.now();
    const result = { assessed: 0, skipped: 0 };
    // Bound runtime and cost. Another run (or Assess pending in the UI) continues the queue.
    for (let offset = 0; offset < Math.min(ids.length, 30) && Date.now() - started < 170_000; offset += 3) {
      const batch = await assessOpportunities(ids.slice(offset, offset + 3));
      result.assessed += batch.assessed;
      result.skipped += batch.skipped;
    }
    revalidatePath('/');
    return NextResponse.json({ success: true, ...result, pending: Math.max(0, ids.length - result.assessed) });
  } catch {
    return NextResponse.json({ success: false, message: 'Assessment refresh failed; existing records retained.' }, { status: 500 });
  }
}
