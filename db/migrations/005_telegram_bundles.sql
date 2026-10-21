-- A post split over several messages (screenshot, then its text) is extracted once as a bundle.
ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS sender_key TEXT;
ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS bundle_id INTEGER REFERENCES telegram_messages(id) ON DELETE SET NULL;

UPDATE telegram_messages
SET sender_key = COALESCE(message->'sender_chat'->>'id', message->'from'->>'id', chat_id::text)
WHERE sender_key IS NULL;

ALTER TABLE telegram_messages DROP CONSTRAINT IF EXISTS telegram_messages_status_check;
ALTER TABLE telegram_messages ADD CONSTRAINT telegram_messages_status_check
  CHECK (status IN ('pending', 'processing', 'ignored', 'ready', 'failed', 'saved', 'dismissed', 'merged'));

CREATE INDEX IF NOT EXISTS idx_telegram_messages_bundle_lookup
  ON telegram_messages(chat_id, sender_key, status);
