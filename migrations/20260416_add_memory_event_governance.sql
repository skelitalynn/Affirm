ALTER TABLE memory_events
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS merged_into_event_id UUID REFERENCES memory_events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

UPDATE memory_events
SET status = COALESCE(NULLIF(status, ''), 'active'),
    review_status = COALESCE(NULLIF(review_status, ''), 'pending')
WHERE status IS NULL
   OR review_status IS NULL
   OR status = ''
   OR review_status = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_memory_events_status'
    ) THEN
        ALTER TABLE memory_events
            ADD CONSTRAINT chk_memory_events_status
                CHECK (status IN ('active', 'suppressed', 'merged', 'archived'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_memory_events_review_status'
    ) THEN
        ALTER TABLE memory_events
            ADD CONSTRAINT chk_memory_events_review_status
                CHECK (review_status IN ('pending', 'verified', 'edited', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memory_events_user_status_created
    ON memory_events(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_review_status
    ON memory_events(review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_merged_into
    ON memory_events(merged_into_event_id);
