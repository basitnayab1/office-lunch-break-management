-- =============================================================================
-- 009_remove_security_definer_helpers.sql
-- =============================================================================
-- Goal: clear Security Advisor warnings for:
--   - public.list_active_employees_for_login (anon/authenticated + SECURITY DEFINER)
--   - public.is_admin / public.is_active_employee (authenticated + SECURITY DEFINER)
--
-- Strategy (no HIBP changes; no RLS weakening):
--   1) private.employee_claims  — own-row readable role/active flags (no RLS recursion)
--   2) public.employee_login_directory — non-sensitive login picker rows only
--   3) RLS policies use EXISTS on private.employee_claims (no public SECURITY DEFINER helpers)
--   4) list_active_employees_for_login becomes SECURITY INVOKER over the directory table
--   5) Drop public is_admin / is_active_employee (no longer needed via RPC or policies)
--
-- Idempotent. Does not delete employees/auth users/break data.
-- Paste this ENTIRE file into the Supabase SQL Editor and run once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Private claims mirror (role / is_active only)
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.employee_claims (
  user_id UUID PRIMARY KEY REFERENCES public.employees (id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private.employee_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_claims_select_own ON private.employee_claims;
CREATE POLICY employee_claims_select_own
  ON private.employee_claims
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE private.employee_claims FROM PUBLIC;
REVOKE ALL ON TABLE private.employee_claims FROM anon;
GRANT SELECT ON TABLE private.employee_claims TO authenticated;
GRANT ALL ON TABLE private.employee_claims TO service_role;
GRANT ALL ON TABLE private.employee_claims TO postgres;

-- -----------------------------------------------------------------------------
-- 2) Public login directory (safe columns only — never email/PIN/secrets)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_login_directory (
  id UUID PRIMARY KEY REFERENCES public.employees (id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  role public.user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT employee_login_directory_employee_role_chk CHECK (role = 'employee')
);

ALTER TABLE public.employee_login_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_login_directory_select ON public.employee_login_directory;
CREATE POLICY employee_login_directory_select
  ON public.employee_login_directory
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND role = 'employee');

REVOKE ALL ON TABLE public.employee_login_directory FROM PUBLIC;
GRANT SELECT ON TABLE public.employee_login_directory TO anon, authenticated;
GRANT ALL ON TABLE public.employee_login_directory TO service_role;
GRANT ALL ON TABLE public.employee_login_directory TO postgres;

-- -----------------------------------------------------------------------------
-- 3) Sync mirrors from public.employees (trigger-only; not exposed via RPC)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sync_employee_mirrors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM private.employee_claims WHERE user_id = OLD.id;
    DELETE FROM public.employee_login_directory WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO private.employee_claims AS c (user_id, role, is_active, updated_at)
  VALUES (NEW.id, NEW.role, NEW.is_active, now())
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = now();

  IF NEW.is_active = true AND NEW.role = 'employee' THEN
    INSERT INTO public.employee_login_directory AS d (
      id,
      employee_id,
      full_name,
      department,
      role,
      is_active
    ) VALUES (
      NEW.id,
      NEW.employee_id,
      NEW.full_name,
      NEW.department,
      NEW.role,
      NEW.is_active
    )
    ON CONFLICT (id) DO UPDATE
      SET employee_id = EXCLUDED.employee_id,
          full_name = EXCLUDED.full_name,
          department = EXCLUDED.department,
          role = EXCLUDED.role,
          is_active = EXCLUDED.is_active;
  ELSE
    DELETE FROM public.employee_login_directory WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_employee_mirrors() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_employee_mirrors() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_employee_mirrors ON public.employees;
CREATE TRIGGER trg_sync_employee_mirrors
  AFTER INSERT OR DELETE OR UPDATE OF employee_id, full_name, department, role, is_active
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_employee_mirrors();

-- Backfill mirrors from existing employees (no data loss)
INSERT INTO private.employee_claims (user_id, role, is_active, updated_at)
SELECT e.id, e.role, e.is_active, now()
FROM public.employees e
ON CONFLICT (user_id) DO UPDATE
  SET role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      updated_at = now();

INSERT INTO public.employee_login_directory (
  id,
  employee_id,
  full_name,
  department,
  role,
  is_active
)
SELECT
  e.id,
  e.employee_id,
  e.full_name,
  e.department,
  e.role,
  e.is_active
FROM public.employees e
WHERE e.is_active = true
  AND e.role = 'employee'
ON CONFLICT (id) DO UPDATE
  SET employee_id = EXCLUDED.employee_id,
      full_name = EXCLUDED.full_name,
      department = EXCLUDED.department,
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active;

DELETE FROM public.employee_login_directory d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.employees e
  WHERE e.id = d.id
    AND e.is_active = true
    AND e.role = 'employee'
);

-- -----------------------------------------------------------------------------
-- 4) Role-change guard: check private claims (no public.is_admin dependency)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_role_change_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
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

  IF EXISTS (
    SELECT 1
    FROM private.employee_claims c
    WHERE c.user_id = auth.uid()
      AND c.role = 'admin'
      AND c.is_active = true
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only admins can assign or change roles'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_role_change_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_role_change_security() FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5) Rewrite RLS policies to use private.employee_claims (no DEFINER helpers)
-- -----------------------------------------------------------------------------

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_select_own_or_admin ON public.employees;
CREATE POLICY employees_select_own_or_admin
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS employees_insert_admin ON public.employees;
CREATE POLICY employees_insert_admin
  ON public.employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS employees_update_admin ON public.employees;
CREATE POLICY employees_update_admin
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS employees_delete_admin ON public.employees;
CREATE POLICY employees_delete_admin
  ON public.employees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS breaks_select_own_or_admin ON public.break_sessions;
CREATE POLICY breaks_select_own_or_admin
  ON public.break_sessions
  FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS breaks_insert_own ON public.break_sessions;
CREATE POLICY breaks_insert_own
  ON public.break_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.is_active = true
    )
    AND status = 'active'
    AND ended_at IS NULL
  );

DROP POLICY IF EXISTS breaks_update_end_own_or_admin ON public.break_sessions;
CREATE POLICY breaks_update_end_own_or_admin
  ON public.break_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
    OR (
      employee_id = auth.uid()
      AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
    OR (
      employee_id = auth.uid()
      AND status IN ('within_limit', 'exceeded')
      AND ended_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS breaks_delete_admin ON public.break_sessions;
CREATE POLICY breaks_delete_admin
  ON public.break_sessions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS settings_select_authenticated ON public.office_settings;
CREATE POLICY settings_select_authenticated
  ON public.office_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS settings_update_admin ON public.office_settings;
CREATE POLICY settings_update_admin
  ON public.office_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 6) Login picker RPC: SECURITY INVOKER over directory table (no DEFINER)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_active_employees_for_login()
RETURNS TABLE (
  id UUID,
  employee_id TEXT,
  full_name TEXT,
  department TEXT,
  role public.user_role
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id,
    d.employee_id,
    d.full_name,
    d.department,
    d.role
  FROM public.employee_login_directory d
  WHERE d.is_active = true
    AND d.role = 'employee'
  ORDER BY d.full_name;
$$;

REVOKE ALL ON FUNCTION public.list_active_employees_for_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_employees_for_login() TO anon, authenticated;

COMMENT ON FUNCTION public.list_active_employees_for_login() IS
  'SECURITY INVOKER login picker over employee_login_directory (no email/PIN).';

-- -----------------------------------------------------------------------------
-- 7) Remove public SECURITY DEFINER auth helpers from the API surface
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_active_employee();

-- -----------------------------------------------------------------------------
-- 8) Keep remaining intentional DEFINER functions locked down
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_role_change_security() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_role_change_security() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) TO postgres;
