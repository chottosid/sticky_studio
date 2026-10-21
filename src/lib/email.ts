import nodemailer from 'nodemailer';
import { escapeHtml } from './utils';
import type { Opportunity } from './types';

export async function sendEmail(subject: string, html: string) {
  const port = Number(process.env.SMTP_PORT || '587');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // implicit TLS on 465, STARTTLS otherwise
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const recipients = (process.env.RECIPIENT_EMAILS || '').split(',').map((email) => email.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('No recipient emails configured (RECIPIENT_EMAILS). Email will not be sent.');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Sticky Studio" <${process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      subject,
      html,
    });
    return info;
  } catch (error) {
    // Email failure shouldn't crash the app logic; callers that must know check the result.
    console.error('Error sending email:', error);
  }
}

export async function sendNewOpportunityEmail(opportunity: Opportunity) {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #333;">${escapeHtml(opportunity.name)}</h2>
      <p><strong>Deadline:</strong> ${escapeHtml(opportunity.deadline || 'No deadline')}</p>
      <div style="background: #f9f9f9; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(opportunity.details)}</div>
      <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/opportunity/${opportunity.id}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Open opportunity</a></p>
    </div>
  `;
  await sendEmail(`New opportunity: ${opportunity.name}`, html);
}
