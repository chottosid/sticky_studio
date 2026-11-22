import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queueReminders, deliverReminders } from '@/lib/reminder-jobs';
import { reminderChatId } from '@/lib/telegram/api';
import { GET } from './route';

vi.mock('@/lib/reminder-jobs', () => ({ queueReminders: vi.fn(), deliverReminders: vi.fn() }));
vi.mock('@/lib/telegram/api', () => ({ reminderChatId: vi.fn() }));

const request = () => new Request('https://example.test/api/cron/reminders', {
  headers: { authorization: 'Bearer test-secret' },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.mocked(reminderChatId).mockReturnValue(123);
});
afterEach(() => vi.unstubAllEnvs());

it('rejects unauthorized requests before queueing any work', async () => {
  expect((await GET(new Request(request().url))).status).toBe(401);
  expect(queueReminders).not.toHaveBeenCalled();
  expect(deliverReminders).not.toHaveBeenCalled();
});

it('schedules and drains durable reminders for the configured chat', async () => {
  vi.mocked(deliverReminders).mockResolvedValueOnce({ completed: 2, failed: 1 });
  expect(await (await GET(request())).json()).toMatchObject({ success: true, completed: 2, failed: 1 });
  expect(queueReminders).toHaveBeenCalledOnce();
  expect(deliverReminders).toHaveBeenCalledOnce();
  expect(deliverReminders).toHaveBeenCalledWith(123);
});
