-- =============================================================================
-- Admin authentication / profile roles
-- =============================================================================
-- IMPORTANT: Do NOT create a separate `profiles` table.
-- `public.employees` already serves as the Auth profile:
--   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
--   full_name, role ('employee' | 'admin'), created_at, updated_at, ...
-- Creating `profiles` would duplicate identity and break the employee PIN system.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auto-create an employees profile when a Supabase Auth user is created.
-- Default role is ALWAYS 'employee' — never auto-promote to admin.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Stable unique employee_id derived from auth user id (can be updated later)
  v_employee_id := 'USR-' || UPPER(REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', ''));

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Role escalation guard: only service_role, postgres, or an existing admin
-- may set or change role to/from admin. Passwords are NEVER stored here —
-- they live only in Supabase Auth (hashed).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_role_change_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT;
  v_db_user TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- INSERT with default employee role is always fine (including auth trigger)
  IF TG_OP = 'INSERT' AND NEW.role = 'employee' THEN
    RETURN NEW;
  END IF;

  v_db_user := current_user;
  v_jwt_role := COALESCE(auth.role(), '');

  -- Supabase SQL editor / migrations / service role
  IF v_db_user IN ('postgres', 'supabase_admin') OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Existing active admin may assign roles via authenticated client
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only admins can assign or change roles'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_role_security ON public.employees;
CREATE TRIGGER trg_employees_role_security
  BEFORE INSERT OR UPDATE OF role
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_role_change_security();

-- -----------------------------------------------------------------------------
-- Secure helper to promote an Auth user to admin by email (service_role / SQL).
-- Usage (SQL editor, after creating the Auth user):
--   SELECT public.promote_user_to_admin('admin@yourcompany.com', 'Office Admin', 'ADMIN01');
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(
  p_email TEXT,
  p_full_name TEXT DEFAULT NULL,
  p_employee_id TEXT DEFAULT NULL
)
RETURNS public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.employees;
  v_email TEXT := LOWER(TRIM(p_email));
BEGIN
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

-- Only callable by service role / postgres (not anon or authenticated end users)
REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(TEXT, TEXT, TEXT) TO postgres;

-- -----------------------------------------------------------------------------
-- Backfill: Auth users missing an employees profile get a default employee row
-- -----------------------------------------------------------------------------
INSERT INTO public.employees (
  id,
  employee_id,
  full_name,
  email,
  department,
  allowed_break_minutes,
  role,
  is_active
)
SELECT
  u.id,
  'USR-' || UPPER(REPLACE(SUBSTRING(u.id::text, 1, 8), '-', '')),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(u.email, ''), '@', 1), ''),
    'User'
  ),
  u.email,
  'General',
  60,
  'employee',
  true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.employees e WHERE e.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- RLS: reaffirm admin-only management (no password columns on employees)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read their own profile (needed for role checks)
DROP POLICY IF EXISTS employees_select_own_or_admin ON public.employees;
CREATE POLICY employees_select_own_or_admin ON public.employees
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

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

-- Employees must not grant themselves admin via direct updates (policy above).
-- is_admin() remains the single source of truth for admin RLS checks.
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_employee() TO authenticated;
