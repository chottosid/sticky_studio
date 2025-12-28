import { NextResponse } from 'next/server';
import { getOpportunitiesDueOn } from '@/lib/data';
import { sendEmail } from '@/lib/email';
import { addDays, format } from 'date-fns';

export async function GET() {
    try {
        const today = new Date();

        // Reminders for: 7 days, 3 days, 1 day before
        const offsets = [7, 3, 1];

        const results = await Promise.all(offsets.map(async (days) => {
            const targetDate = addDays(today, days);
            const dateString = format(targetDate, 'yyyy-MM-dd');

            const opportunities = await getOpportunitiesDueOn(dateString);

            for (const opp of opportunities) {
                await sendReminderEmail(opp, days);
            }

            return { days, count: opportunities.length };
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
