-- =============================================================================
-- Office Lunch Break Management System
-- Initial schema, indexes, RLS policies, and triggers
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('employee', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE break_status AS ENUM ('active', 'within_limit', 'exceeded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('pending', 'synced', 'failed', 'not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE break_type AS ENUM ('breakfast', 'coffee', 'lunch');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- employees
-- Linked to auth.users via id (auth user UUID)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  department TEXT NOT NULL DEFAULT 'General',
  allowed_break_minutes INTEGER NOT NULL DEFAULT 60 CHECK (allowed_break_minutes > 0),
  role user_role NOT NULL DEFAULT 'employee',
  is_active BOOLEAN NOT NULL DEFAULT true,
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON public.employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON public.employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);

-- -----------------------------------------------------------------------------
-- office_settings (single-row config)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.office_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  office_name TEXT NOT NULL DEFAULT 'Office',
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  default_break_minutes INTEGER NOT NULL DEFAULT 60 CHECK (default_break_minutes > 0),
  google_sheet_id TEXT,
  google_sheet_name TEXT NOT NULL DEFAULT 'Break Records',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.office_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- break_sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.break_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  break_date DATE NOT NULL,
  break_type break_type NOT NULL DEFAULT 'lunch',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  allowed_minutes INTEGER NOT NULL CHECK (allowed_minutes > 0),
  actual_minutes NUMERIC(10, 2),
  actual_seconds INTEGER,
  extra_minutes NUMERIC(10, 2),
  extra_seconds INTEGER,
  status break_status NOT NULL DEFAULT 'active',
  google_sheet_sync_status sync_status NOT NULL DEFAULT 'not_applicable',
  google_sheet_row_id INTEGER,
  google_sheet_synced_at TIMESTAMPTZ,
  google_sheet_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT break_sessions_ended_after_start CHECK (
    ended_at IS NULL OR ended_at >= started_at
  ),
  CONSTRAINT break_sessions_completed_fields CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status <> 'active' AND ended_at IS NOT NULL)
  ),
  CONSTRAINT break_sessions_allowed_matches_type CHECK (
    (break_type = 'breakfast' AND allowed_minutes = 15)
    OR (break_type = 'coffee' AND allowed_minutes = 15)
    OR (break_type = 'lunch' AND allowed_minutes = 60)
  )
);

-- Only one active break per employee
CREATE UNIQUE INDEX IF NOT EXISTS idx_break_sessions_one_active
  ON public.break_sessions(employee_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_break_sessions_employee_id ON public.break_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_break_sessions_break_date ON public.break_sessions(break_date);
CREATE INDEX IF NOT EXISTS idx_break_sessions_break_type ON public.break_sessions(break_type);
CREATE INDEX IF NOT EXISTS idx_break_sessions_status ON public.break_sessions(status);
CREATE INDEX IF NOT EXISTS idx_break_sessions_started_at ON public.break_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_break_sessions_sync_status ON public.break_sessions(google_sheet_sync_status);
CREATE INDEX IF NOT EXISTS idx_break_sessions_employee_date ON public.break_sessions(employee_id, break_date);

-- Always derive allowed_minutes from break_type (server source of truth)
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

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_office_settings_updated_at ON public.office_settings;
CREATE TRIGGER trg_office_settings_updated_at
  BEFORE UPDATE ON public.office_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_break_sessions_updated_at ON public.break_sessions;
CREATE TRIGGER trg_break_sessions_updated_at
  BEFORE UPDATE ON public.break_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helper: current employee profile
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_employee()
RETURNS public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.employees WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = auth.uid() AND is_active = true
  );
$$;

-- -----------------------------------------------------------------------------
-- Server-side break duration calc (uses DB clock)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_break_metrics(
  p_started_at TIMESTAMPTZ,
  p_ended_at TIMESTAMPTZ,
  p_allowed_minutes INTEGER
)
RETURNS TABLE (
  actual_seconds INTEGER,
  actual_minutes NUMERIC,
  extra_seconds INTEGER,
  extra_minutes NUMERIC,
  result_status break_status
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_actual_seconds INTEGER;
  v_allowed_seconds INTEGER;
  v_extra_seconds INTEGER;
BEGIN
  v_actual_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_ended_at - p_started_at)))::INTEGER);
  v_allowed_seconds := p_allowed_minutes * 60;
  v_extra_seconds := GREATEST(0, v_actual_seconds - v_allowed_seconds);

  actual_seconds := v_actual_seconds;
  actual_minutes := ROUND((v_actual_seconds::NUMERIC / 60), 2);
  extra_seconds := v_extra_seconds;
  extra_minutes := ROUND((v_extra_seconds::NUMERIC / 60), 2);
  result_status := CASE WHEN v_extra_seconds > 0 THEN 'exceeded'::break_status ELSE 'within_limit'::break_status END;
  RETURN NEXT;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

-- employees policies
DROP POLICY IF EXISTS employees_select_own_or_admin ON public.employees;
CREATE POLICY employees_select_own_or_admin ON public.employees
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- Active employees can be listed for login picker via anon function below;
-- authenticated employees cannot browse others unless admin.
DROP POLICY IF EXISTS employees_insert_admin ON public.employees;
CREATE POLICY employees_insert_admin ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS employees_update_admin ON public.employees;
CREATE POLICY employees_update_admin ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS employees_delete_admin ON public.employees;
CREATE POLICY employees_delete_admin ON public.employees
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- break_sessions policies
DROP POLICY IF EXISTS breaks_select_own_or_admin ON public.break_sessions;
CREATE POLICY breaks_select_own_or_admin ON public.break_sessions
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS breaks_insert_own ON public.break_sessions;
CREATE POLICY breaks_insert_own ON public.break_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND public.is_active_employee()
    AND status = 'active'
    AND ended_at IS NULL
  );

-- Employees may only end their own active break (set completion fields).
-- They cannot update completed records (no editing history).
DROP POLICY IF EXISTS breaks_update_end_own_or_admin ON public.break_sessions;
CREATE POLICY breaks_update_end_own_or_admin ON public.break_sessions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      employee_id = auth.uid()
      AND status = 'active'
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      employee_id = auth.uid()
      AND status IN ('within_limit', 'exceeded')
      AND ended_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS breaks_delete_admin ON public.break_sessions;
CREATE POLICY breaks_delete_admin ON public.break_sessions
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- office_settings policies
DROP POLICY IF EXISTS settings_select_authenticated ON public.office_settings;
CREATE POLICY settings_select_authenticated ON public.office_settings
  FOR SELECT TO authenticated
  USING (public.is_active_employee());

DROP POLICY IF EXISTS settings_update_admin ON public.office_settings;
CREATE POLICY settings_update_admin ON public.office_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- Public login helper: list active employees (id, name, department) for picker
-- Does not expose emails or PINs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_active_employees_for_login()
RETURNS TABLE (
  id UUID,
  employee_id TEXT,
  full_name TEXT,
  department TEXT,
  role user_role
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.employee_id, e.full_name, e.department, e.role
  FROM public.employees e
  WHERE e.is_active = true
    AND e.role = 'employee'
  ORDER BY e.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_employees_for_login() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_break_metrics(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;

-- Realtime for admin live dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.break_sessions;
