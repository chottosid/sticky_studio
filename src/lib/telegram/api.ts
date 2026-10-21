import 'server-only';

import type { DownloadFile } from './message';

const API = 'https://api.telegram.org';

function token(): string {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  return value;
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json() as { ok: boolean; result?: T; description?: string };
  // Never include the URL in errors: it contains the bot token.
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? response.status}`);
  return data.result as T;
}

export async function leaveChat(chatId: number): Promise<void> {
  await call('leaveChat', { chat_id: chatId });
}

export const downloadFileAsDataUri: DownloadFile = async (fileId, mimeType) => {
  const file = await call<{ file_path?: string }>('getFile', { file_id: fileId });
  if (!file.file_path) throw new Error('Telegram did not return a file path.');
  const response = await fetch(`${API}/file/bot${token()}/${file.file_path}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Telegram file download failed with ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
};
