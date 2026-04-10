UPDATE profiles
SET status = 'active'
WHERE status IS NULL OR btrim(status) = '';

UPDATE profiles
SET preferences = '{}'::jsonb
WHERE preferences IS NULL;

WITH ranked_profiles AS (
    SELECT
        id,
        user_id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS row_num
    FROM profiles
    WHERE user_id IS NOT NULL
)
DELETE FROM profiles
WHERE id IN (
    SELECT id
    FROM ranked_profiles
    WHERE row_num > 1
);

ALTER TABLE profiles
    ALTER COLUMN status SET DEFAULT 'active',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN preferences SET DEFAULT '{}'::jsonb,
    ALTER COLUMN preferences SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id_unique
    ON profiles(user_id)
    WHERE user_id IS NOT NULL;

UPDATE sync_jobs
SET details = '{}'::jsonb
WHERE details IS NULL;

UPDATE sync_jobs
SET status = 'pending'
WHERE status IS NULL OR btrim(status) = '';

ALTER TABLE sync_jobs
    ALTER COLUMN job_type SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'pending',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN details SET DEFAULT '{}'::jsonb,
    ALTER COLUMN details SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_created
    ON sync_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_job_type_created
    ON sync_jobs(job_type, created_at DESC);
