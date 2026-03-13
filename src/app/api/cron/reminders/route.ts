import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { addDays, format } from 'date-fns';

export async function GET(request: Request) {
    // Verify authorization in production
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === 'production') {
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }
    }

    try {
        const today = new Date();

        // Reminders for: 7 days, 3 days, 1 day before
        const reminderConfigs = [
            { days: 7, column: 'reminder_7_sent' },
            { days: 3, column: 'reminder_3_sent' },
            { days: 1, column: 'reminder_1_sent' },
        ];

        const results = await Promise.all(reminderConfigs.map(async (config) => {
            const targetDate = addDays(today, config.days);
            const dateString = format(targetDate, 'yyyy-MM-dd');

            // Get opportunities that are due AND haven't had this reminder sent yet
            const result = await query(`
                SELECT id, name, details, deadline
                FROM opportunities
                WHERE deadline = $1
                AND COALESCE(${config.column}, false) = false
            `, [dateString]);

            const opportunities = result.rows;
            let sent = 0;
            let failed = 0;

            for (const opp of opportunities) {
                try {
                    await sendReminderEmail(opp, config.days);
                    // Mark reminder as sent
                    await query(`
                        UPDATE opportunities SET ${config.column} = true WHERE id = $1
                    `, [opp.id]);
                    sent++;
                } catch (emailError) {
                    console.error(`Failed to send reminder for opp ${opp.id}:`, emailError);
                    failed++;
                }
            }

            return { days: config.days, sent, failed, found: opportunities.length };
        }));

        return NextResponse.json({ success: true, processed: results });
    } catch (error) {
        console.error('Reminder cron failed:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

async function sendReminderEmail(opportunity: any, daysLeft: number) {
    const subject = `Reminder: "${opportunity.name}" due in ${daysLeft} days`;
    const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #e63946;">Deadline Reminder</h2>
      <p>This is a reminder that the following opportunity is due in <strong>${daysLeft} days</strong>.</p>

      <p><strong>Name:</strong> ${opportunity.name}</p>
      <p><strong>Deadline:</strong> ${opportunity.deadline}</p>
      <p><strong>Details:</strong></p>
      <div style="background: #f9f9f9; padding: 10px; border-radius: 4px;">
        ${opportunity.details}
      </div>
      <br/>
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/opportunity/${opportunity.id}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Opportunity</a>
    </div>
  `;

    await sendEmail(subject, html);
}
