-- =============================================================================
-- 007_security_hardening.sql
-- Complete, idempotent security hardening for Supabase Security Advisor.
-- Paste this ENTIRE file into the Supabase SQL Editor and run once.
-- Does NOT delete tables, users, employees, admin accounts, or data.
-- Does NOT change break/auth business logic.
-- Auth leaked-password protection is Auth-service config (not SQL).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FIX 1: Explicit search_path = public, pg_temp
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_allowed_minutes_from_break_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Preserve admin test-mode short durations (1-10 minutes).
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
SET search_path = public, pg_temp
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
  result_status := CASE
    WHEN v_extra_seconds > 0 THEN 'exceeded'::break_status
    ELSE 'within_limit'::break_status
  END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_employee()
RETURNS public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.employees
  WHERE id = auth.uid();
$$;

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
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.employee_id,
    e.full_name,
    e.department,
    e.role
  FROM public.employees e
  WHERE e.is_active = true
    AND e.role = 'employee'
  ORDER BY e.full_name;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_employee_id TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );

  v_employee_id := 'USR-' || UPPER(REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', ''));

  BEGIN
    INSERT INTO public.employees (
      id,
      employee_id,
      full_name,
      email,
      department,
      allowed_break_minutes,
      role,
      is_active
    ) VALUES (
      NEW.id,
      v_employee_id,
      v_name,
      NEW.email,
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'department'), ''), 'General'),
      60,
      'employee',
      true
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_role_change_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jwt_role TEXT;
  v_db_user TEXT;
  v_claims TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'employee' THEN
    RETURN NEW;
  END IF;

  v_db_user := current_user;
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  v_jwt_role := COALESCE(
    NULLIF(auth.role(), ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN v_claims IS NOT NULL THEN (v_claims::jsonb ->> 'role')
      ELSE NULL
    END,
    ''
  );

  IF v_db_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only admins can assign or change roles'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_user_to_admin(
  p_email TEXT,
  p_full_name TEXT DEFAULT NULL,
  p_employee_id TEXT DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.employees;
  v_email TEXT := LOWER(TRIM(p_email));
  v_jwt_role TEXT;
  v_claims TEXT;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  v_jwt_role := COALESCE(
    NULLIF(auth.role(), ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN v_claims IS NOT NULL THEN (v_claims::jsonb ->> 'role')
      ELSE NULL
    END,
    ''
  );

  IF current_user NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'promote_user_to_admin is restricted to service role'
      USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' OR POSITION('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  UPDATE public.employees
  SET
    role = 'admin',
    is_active = true,
    full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
    employee_id = COALESCE(NULLIF(TRIM(p_employee_id), ''), employee_id),
    email = v_email,
    updated_at = now()
  WHERE LOWER(email) = v_email
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No employees profile found for email %. Create the Auth user first.', p_email;
  END IF;

  RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------------------
-- FIX 2: Least-privilege EXECUTE grants
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.set_allowed_minutes_from_break_type() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_allowed_minutes_from_break_type() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_role_change_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_role_change_security() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.calculate_break_metrics(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_break_metrics(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.current_employee() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_employee() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_employee() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_employee() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;

REVOKE ALL ON FUNCTION public.list_active_employees_for_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_employees_for_login() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) TO postgres;

-- -----------------------------------------------------------------------------
-- RLS remains enabled
-- -----------------------------------------------------------------------------

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.list_active_employees_for_login() IS
  'Public employee login picker. Returns id/name/department/role for active employees only. No email/PIN.';

COMMENT ON FUNCTION public.is_admin() IS
  'RLS helper. True only for the authenticated active admin (auth.uid()).';

COMMENT ON FUNCTION public.is_active_employee() IS
  'RLS helper. True only for the authenticated active employee/admin (auth.uid()).';
