require('dotenv').config();

const API = 'https://api.telegram.org';

async function telegram(token, method, body) {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.description}`);
  return data.result;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const baseUrl = (process.argv[2] || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!token || !secret) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required.');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and - (max 256).');
  }
  if (!baseUrl.startsWith('https://')) {
    throw new Error('Telegram requires an https URL. Pass one: npm run telegram:setup -- https://your-domain');
  }

  const url = `${baseUrl}/api/telegram/webhook`;
  await telegram(token, 'setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'my_chat_member'],
    drop_pending_updates: true,
  });
  console.log(`Webhook set to ${url}`);

  const me = await telegram(token, 'getMe');
  if (!me.can_read_all_group_messages) {
    console.warn(`Privacy mode is ON for @${me.username}: send /setprivacy to @BotFather, choose Disable, then remove and re-add the bot to each group.`);
  }
}

main().catch((error) => {
  console.error('Telegram setup failed:', error.message);
  process.exitCode = 1;
});
