CREATE TABLE IF NOT EXISTS memory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    source_message_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    importance NUMERIC(4, 3) NOT NULL DEFAULT 0.500 CHECK (importance >= 0 AND importance <= 1),
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
    happened_at TIMESTAMPTZ,
    last_recalled_at TIMESTAMPTZ,
    recall_count INTEGER NOT NULL DEFAULT 0 CHECK (recall_count >= 0),
    embedding VECTOR(768),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_created
    ON memory_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_type_created
    ON memory_events(user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_happened_at
    ON memory_events(happened_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_importance_created
    ON memory_events(importance DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_embedding
    ON memory_events USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_memory_events_keywords_gin
    ON memory_events USING gin (keywords);

DROP TRIGGER IF EXISTS update_memory_events_updated_at ON memory_events;
CREATE TRIGGER update_memory_events_updated_at
    BEFORE UPDATE ON memory_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
