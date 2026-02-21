-- Event media album support
-- Enables creators/collaborators to organize event photos into folders/albums.

CREATE TABLE IF NOT EXISTS public.event_photo_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  photo_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_photo_albums_event_name
  ON public.event_photo_albums(event_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_event_photo_albums_event
  ON public.event_photo_albums(event_id);

DO $$
BEGIN
  IF to_regclass('public.media') IS NOT NULL THEN
    ALTER TABLE public.media
      ADD COLUMN IF NOT EXISTS album_id UUID;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'media'
        AND constraint_name = 'fk_media_event_album'
    ) THEN
      ALTER TABLE public.media
        ADD CONSTRAINT fk_media_event_album
        FOREIGN KEY (album_id)
        REFERENCES public.event_photo_albums(id)
        ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_media_event_album
      ON public.media(event_id, album_id)
      WHERE deleted_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_event_album_photo_count(p_album_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_album_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.event_photo_albums a
  SET
    photo_count = COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.media m
      WHERE m.album_id = a.id
        AND m.deleted_at IS NULL
    ), 0),
    updated_at = NOW()
  WHERE a.id = p_album_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.event_album_media_count_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_event_album_photo_count(NEW.album_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.album_id IS DISTINCT FROM NEW.album_id OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
      PERFORM public.sync_event_album_photo_count(OLD.album_id);
      PERFORM public.sync_event_album_photo_count(NEW.album_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_event_album_photo_count(OLD.album_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_album_media_count ON public.media;
CREATE TRIGGER trg_event_album_media_count
AFTER INSERT OR UPDATE OR DELETE ON public.media
FOR EACH ROW
EXECUTE FUNCTION public.event_album_media_count_trigger();

ALTER TABLE public.event_photo_albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event albums select access" ON public.event_photo_albums;
CREATE POLICY "Event albums select access"
  ON public.event_photo_albums FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_photo_albums.event_id
        AND e.photographer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.event_collaborators c
      WHERE c.event_id = event_photo_albums.event_id
        AND c.photographer_id = auth.uid()
        AND c.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Event albums manage access" ON public.event_photo_albums;
CREATE POLICY "Event albums manage access"
  ON public.event_photo_albums FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_photo_albums.event_id
        AND e.photographer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.event_collaborators c
      WHERE c.event_id = event_photo_albums.event_id
        AND c.photographer_id = auth.uid()
        AND c.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_photo_albums.event_id
        AND e.photographer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.event_collaborators c
      WHERE c.event_id = event_photo_albums.event_id
        AND c.photographer_id = auth.uid()
        AND c.status = 'active'
    )
  );
