import nodemailer from 'nodemailer';
import { Opportunity } from './types';

export async function sendEmail(subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const recipientsRaw = process.env.RECIPIENT_EMAILS || '';
  const recipients = recipientsRaw.split(',').map(email => email.trim()).filter(Boolean);

  if (recipients.length === 0) {
    console.warn('No recipient emails configured (RECIPIENT_EMAILS in .env). Email will not be sent.');
    return;
  }

  console.log(`Attempting to send email to: ${recipients.join(', ')}`);
  console.log(`SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`SMTP User: ${process.env.SMTP_USER}`);


  try {
    const info = await transporter.sendMail({
      from: `"Sticky Studio" <${process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      subject: subject,
      html: html,
    });
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw, just log. Email failure shouldn't crash the app logic.
  }
}

export async function sendNewOpportunityEmail(opportunity: Opportunity) {
  const subject = `New Opportunity: ${opportunity.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #333;">New Opportunity Added!</h2>
      <p><strong>Name:</strong> ${opportunity.name}</p>
      <p><strong>Deadline:</strong> ${opportunity.deadline || 'No deadline specified'}</p>
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

export async function sendTestEmail() {
  const subject = 'Sticky Studio: Test Email';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Test Email Successful!</h2>
      <p>This email was sent to verify your SMTP configuration.</p>
      <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Configured Recipients:</strong> ${process.env.RECIPIENT_EMAILS}</p>
    </div>
  `;
  return await sendEmail(subject, html);
}
