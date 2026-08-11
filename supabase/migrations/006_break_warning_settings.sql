-- =============================================================================
-- Break warning settings + optional short-duration test mode
-- Production break types remain: Breakfast 15, Coffee 15, Lunch 60
-- =============================================================================

ALTER TABLE public.office_settings
  ADD COLUMN IF NOT EXISTS break_warning_minutes INTEGER NOT NULL DEFAULT 2
    CHECK (break_warning_minutes > 0 AND break_warning_minutes <= 30);

ALTER TABLE public.office_settings
  ADD COLUMN IF NOT EXISTS break_test_mode BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.office_settings
  ADD COLUMN IF NOT EXISTS break_test_minutes INTEGER NOT NULL DEFAULT 3
    CHECK (break_test_minutes > 0 AND break_test_minutes <= 10);

COMMENT ON COLUMN public.office_settings.break_warning_minutes IS
  'Minutes before allowed break end when the employee warning alarm fires.';
COMMENT ON COLUMN public.office_settings.break_test_mode IS
  'When true, new breaks use break_test_minutes instead of production durations (testing only).';
COMMENT ON COLUMN public.office_settings.break_test_minutes IS
  'Short allowed duration used only while break_test_mode is enabled.';

-- Allow short test durations (1–10) without changing production defaults.
ALTER TABLE public.break_sessions
  DROP CONSTRAINT IF EXISTS break_sessions_allowed_matches_type;

ALTER TABLE public.break_sessions
  ADD CONSTRAINT break_sessions_allowed_matches_type CHECK (
    (
      break_type = 'breakfast'
      AND (allowed_minutes = 15 OR (allowed_minutes BETWEEN 1 AND 10))
    )
    OR (
      break_type = 'coffee'
      AND (allowed_minutes = 15 OR (allowed_minutes BETWEEN 1 AND 10))
    )
    OR (
      break_type = 'lunch'
      AND (allowed_minutes = 60 OR (allowed_minutes BETWEEN 1 AND 10))
    )
  );

-- Keep production auto-fill, but do not overwrite short test durations.
CREATE OR REPLACE FUNCTION public.set_allowed_minutes_from_break_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Preserve admin test-mode short durations (1–10 minutes).
  IF NEW.allowed_minutes IS NOT NULL
     AND NEW.allowed_minutes BETWEEN 1 AND 10 THEN
    RETURN NEW;
  END IF;

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

UPDATE public.office_settings
SET
  break_warning_minutes = COALESCE(break_warning_minutes, 2),
  break_test_mode = COALESCE(break_test_mode, false),
  break_test_minutes = COALESCE(break_test_minutes, 3)
WHERE id = 1;
