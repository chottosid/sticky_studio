# Telegram group ingestion — design

Date: 2026-10-21
Status: approved in conversation, pending written-spec review

## Goal

A Telegram bot that the owner adds to groups. It watches new messages, extracts opportunities with the existing pipeline, and places drafts in a review inbox in Sticky Studio. Nothing is saved without the owner's review, which preserves the README guarantee that extraction never saves automatically.

## Decisions

| Topic | Decision |
|-------|----------|
| History before the bot joined | Out of scope. The Bot API cannot read past messages; only new messages are processed. |
| Save mode | Review inbox. Drafts are approved, edited or dismissed through the existing review dialog and duplicate flow. |
| Authorization | The bot works only in groups that `TELEGRAM_OWNER_ID` added it to. Otherwise it leaves immediately. |
| Transport | Webhook on the existing Vercel deployment, with processing in Next.js `after()`. |

## Setup

1. Create the bot in BotFather and disable privacy mode (`/setprivacy` → Disable) so it receives all group messages.
2. New env vars (add to `.env.example` and `DEPLOYMENT.md`):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`: random, 1–256 chars of `A-Za-z0-9_-`
   - `TELEGRAM_OWNER_ID`: the owner's numeric Telegram user ID
3. `npm run telegram:setup` (`scripts/setup-telegram.js`) calls `setWebhook` with `${NEXT_PUBLIC_BASE_URL}/api/telegram/webhook`, `secret_token`, and `allowed_updates: ["message", "my_chat_member"]`.

## Data model — `db/migrations/004_telegram.sql`

```sql
CREATE TABLE IF NOT EXISTS telegram_chats (
  chat_id BIGINT PRIMARY KEY,
  title TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  message JSONB NOT NULL,          -- raw Telegram message, used for retry
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ignored','ready','failed','saved','dismissed')),
  draft JSONB,                     -- ExtractionDraft
  sources JSONB,                   -- ExtractionSource[]; nulled on saved/dismissed
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_status ON telegram_messages(status);
```

## Webhook — `src/app/api/telegram/webhook/route.ts`

`POST`, `maxDuration = 60`.

1. If the `X-Telegram-Bot-Api-Secret-Token` header doesn't match `TELEGRAM_WEBHOOK_SECRET` (constant-time compare), return 401. If the secret is unset, also return 401, in every environment.
2. **`my_chat_member` update:** decided by the pure `membershipAction(update, ownerId)`:
   - Bot became `member`/`administrator` and `from.id === ownerId`: return `allow`. Upsert into `telegram_chats`.
   - Bot became `member`/`administrator` and someone else added it: return `leave`. Call `leaveChat` and store nothing.
   - Bot became `left`/`kicked`: return `remove`. Delete from `telegram_chats`.
3. **`message` update:**
   - Ignore it if the chat isn't in `telegram_chats`.
   - If the message has `migrate_to_chat_id`, update the allowlisted `chat_id` to the new ID and stop.
   - Ignore messages from bots.
   - Ignore it if `shouldProcess(message)` is false.
   - Otherwise `INSERT ... ON CONFLICT (chat_id, message_id) DO NOTHING` with status `pending`. If a row was inserted, schedule `after(() => processTelegramMessage(id))`.
4. Return 200 for every authenticated request, so Telegram doesn't retry.

`edited_message`, channel posts and all other update types are not subscribed to.

## Pure helpers — `src/lib/telegram/filter.ts`

- `shouldProcess(message)`: true if the message has a photo, a PDF document (`mime_type === 'application/pdf'`, `file_size <= 20 MB`), a URL in its text, caption or entities, or at least 80 characters of text or caption.
- `membershipAction(update, ownerId)`: returns `'allow' | 'leave' | 'remove' | 'none'`.
- `messageLink(chat, messageId)`: `https://t.me/<username>/<id>` for public chats; `https://t.me/c/<chat_id without -100>/<id>` for private supergroups; `null` for basic groups.

## Processing — `src/lib/telegram/process.ts`

`processTelegramMessage(rowId)`:

1. Load the row and build `ExtractionSource[]`:
   - Text or caption becomes a `text` source. The message link, when there is one, is appended to the text so the existing URL handling sees it.
   - The largest `photo` size is downloaded via `getFile` and becomes an `image` data URI.
   - A PDF `document` is downloaded the same way and becomes a `pdf` data URI.
2. Call `extractOpportunityDetails({ sources })`.
3. If there are zero opportunities, set status `ignored` and null out `sources`. Otherwise set status `ready` and store `draft` and `sources`.
4. On any error, set status `failed` and record `error` (the message only, no stack trace).

Telegram API calls (`getFile`, file download, `leaveChat`) live in `src/lib/telegram/api.ts` as thin `fetch` wrappers. There is no SDK dependency.

## Inbox

- **Server actions** (`src/lib/telegram-actions.ts`, all requiring `isAuthenticated()`):
  - `getTelegramInbox()`: rows with status `ready` or `failed`, plus `pending` rows older than 10 minutes. Returns draft, sources, chat title and error.
  - `retryTelegramMessage(id)`: sets status `pending`, then runs `processTelegramMessage`.
  - `dismissTelegramMessage(id)`: sets status `dismissed` and nulls `sources`.
- **`addOpportunity`:** accepts an optional `telegramMessageId`. After a successful save, the row is set to `saved` and `sources` is nulled.
- **UI:** a `TelegramInbox` component on the home page, hidden when empty, shows "Telegram inbox (N)". Each entry shows the chat title, the first opportunity name and the date:
  - **Review** opens `AddOpportunityDialog` at the review step with `initialDraft`, `initialSources` and `telegramMessageId`.
  - **Dismiss** removes the entry.
  - Failed or stuck entries also show the error and **Retry**.

## Known limits (accepted)

- No history before the bot joined.
- Albums are processed one photo at a time. The caption goes only with the photo that carries it.
- Files over the 20 MB Bot API download limit are skipped. If the message has no text, it is not queued.
- One LLM extraction per message that passes the filter. Cost scales with how busy the group is.
- A group admin cannot add the bot; only the owner can.

## Testing

- **Vitest:**
  - `shouldProcess` (chatter vs link vs photo vs PDF vs long text)
  - `membershipAction` (owner adds → allow, other adds → leave, kicked → remove)
  - `messageLink`
  - Telegram message to sources mapping, with `getFile` mocked
  - The webhook returns 401 when the secret is missing or wrong
- **Manual:**
  - Add the bot from the owner account: the chat appears in `telegram_chats`.
  - Add it from another account: the bot leaves and no row is created.
  - Post a job announcement: it appears in the inbox, saves through review, and the row becomes `saved`.
  - Post "thanks!": no row is created.
