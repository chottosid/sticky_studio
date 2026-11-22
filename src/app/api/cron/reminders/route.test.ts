import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { query } from '@/lib/db';
import { reminderChatId, sendTelegramReminder } from '@/lib/telegram/api';
import { GET } from './route';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/telegram/api', () => ({ reminderChatId: vi.fn(), sendTelegramReminder: vi.fn() }));

const request = () => new Request('https://example.test/api/cron/reminders', { headers: { authorization: 'Bearer test-secret' } });
const row = { id: 4, name: 'Application', deadline: '2026-11-24', days_left: 3, reminder_3_sent: false };
const result = (rows: Record<string, unknown>[]) => ({ rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.test');
  vi.mocked(reminderChatId).mockReturnValue(123);
});
afterEach(() => vi.unstubAllEnvs());

it('only sends one private reminder when cron invocations overlap', async () => {
  let claimed = false;
  vi.mocked(query).mockImplementation(async (sql) => {
    if (sql.trim().startsWith('SELECT')) return result([row]);
    if (claimed) return result([]);
    claimed = true;
    return result([{ id: row.id }]);
  });

  const responses = await Promise.all([GET(request()), GET(request())]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(sendTelegramReminder).toHaveBeenCalledExactlyOnceWith(123, expect.stringContaining('https://example.test/opportunity/4'));
});

it('checks cron authorization and releases a failed claim for retry', async () => {
  expect((await GET(new Request(request().url))).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
  vi.mocked(query).mockResolvedValueOnce(result([row])).mockResolvedValueOnce(result([{ id: row.id }])).mockResolvedValueOnce(result([]));
  vi.mocked(sendTelegramReminder).mockRejectedValueOnce(new Error('Telegram unavailable'));

  const response = await GET(request());
  expect(await response.json()).toMatchObject({ sent: 0, failed: 1 });
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining('reminder_3_sent = false'), [row.id, row.deadline]);
});
