import nodemailer from 'nodemailer';
import 'dotenv/config';

async function testEmail() {
  console.log('Testing email configuration...\n');

  // Log configuration (without showing full password)
  console.log('Configuration:');
  console.log(`  SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`  SMTP Port: ${process.env.SMTP_PORT || '587'}`);
  console.log(`  SMTP User: ${process.env.SMTP_USER}`);
  console.log(`  SMTP Pass: ${process.env.SMTP_PASS ? '****' + process.env.SMTP_PASS.slice(-4) : 'NOT SET'}`);
  console.log(`  Recipients: ${process.env.RECIPIENT_EMAILS}\n`);

  const recipientsRaw = process.env.RECIPIENT_EMAILS || '';
  const recipients = recipientsRaw.split(',').map(email => email.trim()).filter(Boolean);

  if (recipients.length === 0) {
    console.error('❌ No recipient emails configured!');
    process.exit(1);
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ SMTP credentials not configured!');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  console.log('Verifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified!\n');
  } catch (error) {
    console.error('❌ SMTP verification failed:', error);
    process.exit(1);
  }

  console.log('Sending test email...');
  try {
    const info = await transporter.sendMail({
      from: `"Sticky Studio Test" <${process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      subject: '🧪 Sticky Studio - Email Test Successful!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
          <h1 style="color: #4CAF50; text-align: center;">✅ Email Test Successful!</h1>
          <p style="font-size: 16px;">Great news! Your Sticky Studio email configuration is working correctly.</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Test Details:</h3>
            <ul style="margin-bottom: 0;">
              <li><strong>Sent at:</strong> ${new Date().toLocaleString()}</li>
              <li><strong>From:</strong> ${process.env.SMTP_USER}</li>
              <li><strong>To:</strong> ${recipients.join(', ')}</li>
            </ul>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center;">
            This email was sent from Sticky Studio email test script.
          </p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Recipients: ${recipients.join(', ')}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    process.exit(1);
  }

  transporter.close();
  console.log('\n🎉 Email test completed!');
}

testEmail().catch(console.error);
