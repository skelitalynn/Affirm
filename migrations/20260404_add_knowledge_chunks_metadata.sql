ALTER TABLE knowledge_chunks
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE knowledge_chunks
SET metadata = jsonb_strip_nulls(
    jsonb_build_object(
        'user_id', user_id,
        'source', source,
        'scope', CASE WHEN user_id IS NULL THEN 'global' ELSE 'user' END
    )
)
WHERE metadata = '{}'::jsonb
   OR metadata IS NULL;
