import { NextResponse } from 'next/server';
import { deleteOldOpportunities } from '@/lib/data';

/**
 * Cron endpoint to clean up old opportunities
 * Deletes opportunities that are:
 * - 30 days past their deadline, OR
 * - 30 days past creation if no deadline is set
 *
 * Configure this endpoint in your cron service (Vercel Cron, etc.)
 * Recommended schedule: once daily
 */
export async function GET(request: Request) {
  try {
    // Verify authorization header for security
    // In production, use a secure token from environment variable
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Allow requests without auth in development, or with valid secret in production
    if (process.env.NODE_ENV === 'production') {
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const result = await deleteOldOpportunities();

    return NextResponse.json({
      success: true,
      message: `Cleanup completed. Deleted ${result.deleted} old opportunities.`,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error('Cleanup cron job failed:', error);
    return NextResponse.json(
      { success: false, message: 'Cleanup failed' },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: Request) {
  return GET(request);
}
