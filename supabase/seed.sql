-- =============================================================================
-- Seed data for development / demo
-- Run AFTER creating auth users (see README) OR use the seed script via service role.
--
-- Demo PIN for all seed users: 1234
-- Demo admin email: admin@office.local / PIN: 1234
-- =============================================================================

-- NOTE: Auth users must exist first. Prefer the application seed API or
-- supabase/seed-via-service.ts after configuring SUPABASE_SERVICE_ROLE_KEY.
--
-- This SQL assumes auth user UUIDs are inserted by the seed script.
-- Placeholder comments document the intended demo employees:

-- Ali    EMP001  Development  employee
-- Ahmed  EMP002  Development  employee
-- Usman  EMP003  Design       employee
-- Bilal  EMP004  Operations   employee
-- Hassan EMP005  HR           employee
-- Admin  ADMIN01 Administration admin

SELECT 1; -- no-op; real seed is applied by scripts/seed.ts
