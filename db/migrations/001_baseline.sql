CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  deadline DATE,
  document_uri TEXT,
  document_type VARCHAR(50),
  category VARCHAR(50) NOT NULL DEFAULT 'job',
  reminder_7_sent BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_3_sent BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_1_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'job';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS reminder_7_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS reminder_3_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS reminder_1_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ALTER COLUMN name TYPE VARCHAR(500);
ALTER TABLE opportunities ALTER COLUMN details SET DEFAULT '';

UPDATE opportunities
SET category = 'job'
WHERE category IS NULL OR category NOT IN ('job', 'internship', 'contest', 'higher-study');

UPDATE opportunities SET reminder_7_sent = FALSE WHERE reminder_7_sent IS NULL;
UPDATE opportunities SET reminder_3_sent = FALSE WHERE reminder_3_sent IS NULL;
UPDATE opportunities SET reminder_1_sent = FALSE WHERE reminder_1_sent IS NULL;

ALTER TABLE opportunities ALTER COLUMN category SET DEFAULT 'job';
ALTER TABLE opportunities ALTER COLUMN category SET NOT NULL;
ALTER TABLE opportunities ALTER COLUMN reminder_7_sent SET DEFAULT FALSE;
ALTER TABLE opportunities ALTER COLUMN reminder_7_sent SET NOT NULL;
ALTER TABLE opportunities ALTER COLUMN reminder_3_sent SET DEFAULT FALSE;
ALTER TABLE opportunities ALTER COLUMN reminder_3_sent SET NOT NULL;
ALTER TABLE opportunities ALTER COLUMN reminder_1_sent SET DEFAULT FALSE;
ALTER TABLE opportunities ALTER COLUMN reminder_1_sent SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opportunities_category_check'
      AND conrelid = 'opportunities'::regclass
  ) THEN
    ALTER TABLE opportunities
      ADD CONSTRAINT opportunities_category_check
      CHECK (category IN ('job', 'internship', 'contest', 'higher-study'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
