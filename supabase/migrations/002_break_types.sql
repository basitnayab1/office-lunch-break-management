-- =============================================================================
-- Add break_type support (breakfast / coffee / lunch)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE break_type AS ENUM ('breakfast', 'coffee', 'lunch');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.break_sessions
  ADD COLUMN IF NOT EXISTS break_type break_type;

-- Backfill existing rows as lunch (previous default behavior)
UPDATE public.break_sessions
SET break_type = 'lunch'
WHERE break_type IS NULL;

ALTER TABLE public.break_sessions
  ALTER COLUMN break_type SET NOT NULL;

ALTER TABLE public.break_sessions
  ALTER COLUMN break_type SET DEFAULT 'lunch';

-- Enforce server-side allowed minutes by break type
ALTER TABLE public.break_sessions
  DROP CONSTRAINT IF EXISTS break_sessions_allowed_matches_type;

ALTER TABLE public.break_sessions
  ADD CONSTRAINT break_sessions_allowed_matches_type CHECK (
    (break_type = 'breakfast' AND allowed_minutes = 15)
    OR (break_type = 'coffee' AND allowed_minutes = 15)
    OR (break_type = 'lunch' AND allowed_minutes = 60)
  );

CREATE INDEX IF NOT EXISTS idx_break_sessions_break_type
  ON public.break_sessions(break_type);

-- Trigger: always set allowed_minutes from break_type (never trust client)
CREATE OR REPLACE FUNCTION public.set_allowed_minutes_from_break_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.allowed_minutes := CASE NEW.break_type
    WHEN 'breakfast' THEN 15
    WHEN 'coffee' THEN 15
    WHEN 'lunch' THEN 60
    ELSE NULL
  END;

  IF NEW.allowed_minutes IS NULL THEN
    RAISE EXCEPTION 'Invalid break_type: %', NEW.break_type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_break_sessions_allowed_minutes ON public.break_sessions;
CREATE TRIGGER trg_break_sessions_allowed_minutes
  BEFORE INSERT OR UPDATE OF break_type, allowed_minutes
  ON public.break_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_allowed_minutes_from_break_type();
