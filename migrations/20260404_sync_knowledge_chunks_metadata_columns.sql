CREATE OR REPLACE FUNCTION sync_knowledge_chunks_metadata_columns()
RETURNS TRIGGER AS $$
DECLARE
    normalized_metadata JSONB := COALESCE(NEW.metadata, '{}'::jsonb);
    metadata_source TEXT := normalized_metadata->>'source';
    metadata_user_id TEXT := normalized_metadata->>'user_id';
    metadata_source_changed BOOLEAN := FALSE;
    metadata_user_id_changed BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        metadata_source_changed := normalized_metadata ? 'source';
        metadata_user_id_changed := normalized_metadata ? 'user_id';
    ELSE
        metadata_source_changed := (NEW.metadata->>'source') IS DISTINCT FROM (OLD.metadata->>'source');
        metadata_user_id_changed := (NEW.metadata->>'user_id') IS DISTINCT FROM (OLD.metadata->>'user_id');
    END IF;

    IF metadata_source_changed OR (NEW.source IS NULL AND metadata_source IS NOT NULL) THEN
        NEW.source := metadata_source;
    END IF;

    IF metadata_user_id_changed OR (NEW.user_id IS NULL AND metadata_user_id IS NOT NULL) THEN
        IF metadata_user_id IS NULL OR metadata_user_id = '' THEN
            NEW.user_id := NULL;
        ELSIF metadata_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            NEW.user_id := metadata_user_id::uuid;
        ELSE
            RAISE EXCEPTION 'knowledge_chunks.metadata.user_id must be a valid UUID, got: %', metadata_user_id;
        END IF;
    END IF;

    normalized_metadata := normalized_metadata - 'source' - 'user_id' - 'scope';

    IF NEW.source IS NOT NULL THEN
        normalized_metadata := jsonb_set(normalized_metadata, '{source}', to_jsonb(NEW.source), true);
    END IF;

    IF NEW.user_id IS NOT NULL THEN
        normalized_metadata := jsonb_set(normalized_metadata, '{user_id}', to_jsonb(NEW.user_id::text), true);
    END IF;

    normalized_metadata := jsonb_set(
        normalized_metadata,
        '{scope}',
        to_jsonb(CASE WHEN NEW.user_id IS NULL THEN 'global' ELSE 'user' END),
        true
    );

    NEW.metadata := jsonb_strip_nulls(normalized_metadata);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_knowledge_chunks_metadata_columns ON knowledge_chunks;

CREATE TRIGGER trg_sync_knowledge_chunks_metadata_columns
    BEFORE INSERT OR UPDATE ON knowledge_chunks
    FOR EACH ROW
    EXECUTE FUNCTION sync_knowledge_chunks_metadata_columns();

UPDATE knowledge_chunks
SET metadata = COALESCE(metadata, '{}'::jsonb);
