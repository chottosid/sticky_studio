import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function verifyEmailConfig() {
    console.log('Verifying Email Configuration...');

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        console.error('❌ Missing SMTP configuration in .env');
        console.error('Required: SMTP_HOST, SMTP_USER, SMTP_PASS');
        return;
    }

    const transporter = nodemailer.createTransport({
        host: host,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: { user, pass },
    });

    try {
        await transporter.verify();
        console.log('✅ SMTP Connection Successful!');

        // Check recipients
        const recipients = process.env.RECIPIENT_EMAILS;
        if (!recipients) {
            console.warn('⚠️ No RECIPIENT_EMAILS configured.');
        } else {
            console.log(`✅ Recipients configured: ${recipients}`);
        }

    } catch (error) {
        console.error('❌ SMTP Connection Failed:', error);
    }
}

verifyEmailConfig();
