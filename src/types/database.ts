export type UserRole = "employee" | "admin";
export type BreakStatus =
  | "active"
  | "within_limit"
  | "exceeded";
export type SyncStatus = "pending" | "synced" | "failed" | "not_applicable";
export type BreakType = "breakfast" | "coffee" | "lunch";
export type BookingStatus = "scheduled" | "waiting" | "cancelled" | "completed" | "missed";

export interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  department: string;
  designation: string;
  shift: string;
  allowed_break_minutes: number;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  joining_date: string | null;
  break_access_blocked_until: string | null;
  break_access_block_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeLoginOption {
  id: string;
  employee_id: string;
  full_name: string;
  department: string;
  role: UserRole;
}

export interface OfficeSettings {
  id: number;
  office_name: string;
  timezone: string;
  default_break_minutes: number;
  break_warning_minutes: number;
  break_test_mode: boolean;
  break_test_minutes: number;
  grace_period_minutes: number;
  daily_max_breaks: number;
  min_work_minutes_before_break: number;
  max_simultaneous_breaks: number;
  office_start_time: string;
  office_end_time: string;
  allow_weekend_breaks: boolean;
  auto_end_breaks: boolean;
  google_sheet_id: string | null;
  google_sheet_name: string;
  created_at: string;
  updated_at: string;
}

export interface CoverageRule {
  id: string;
  department: string;
  minimum_available: number;
  max_on_break: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCoverage {
  department: string;
  totalEmployees: number;
  activeBreaks: number;
  availableEmployees: number;
  minimumAvailable: number;
  maxOnBreak: number | null;
  status: "healthy" | "tight" | "low";
}

export interface BreakBooking {
  id: string;
  employee_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: BookingStatus;
  position: number;
  approved_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee | null;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  target_type: string;
  target_id: string | null;
  old_data: Json | null;
  new_data: Json | null;
  ip_address: string | null;
  created_at: string;
  actor?: Employee | null;
}

export interface LoginAttempt {
  id: string;
  employee_id: string | null;
  identifier: string;
  succeeded: boolean;
  reason: string | null;
  created_at: string;
}

export interface BreakSession {
  id: string;
  employee_id: string;
  break_date: string;
  break_type: BreakType;
  started_at: string;
  ended_at: string | null;
  allowed_minutes: number;
  actual_minutes: number | null;
  actual_seconds: number | null;
  extra_minutes: number | null;
  extra_seconds: number | null;
  status: BreakStatus;
  google_sheet_sync_status: SyncStatus;
  google_sheet_row_id: number | null;
  google_sheet_synced_at: string | null;
  google_sheet_error: string | null;
  approved_overtime_minutes?: number | null;
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
  employee?: Employee | null;
}

export interface BreakMetrics {
  actualSeconds: number;
  actualMinutes: number;
  extraSeconds: number;
  extraMinutes: number;
  status: "within_limit" | "exceeded";
  remainingSeconds: number;
  isOvertime: boolean;
}

export interface TodayStats {
  totalEmployees: number;
  currentlyOnBreak: number;
  completedBreaks: number;
  employeesOverTime: number;
  totalExtraMinutes: number;
  breakfastCount: number;
  coffeeCount: number;
  lunchCount: number;
}

export interface DashboardAnalytics {
  range: "today" | "this_week" | "last_7_days" | "this_month";
  title: string;
  weekActivity: Array<{
    date: string;
    label: string;
    completedBreaks: number;
  }>;
  breakTypeDistribution: Record<BreakType, number>;
  todayByBreakType: Record<BreakType, number>;
  weeklyTotalBreaks: number;
}

export interface DailyReport {
  date: string;
  totalBreaks: number;
  averageBreakMinutes: number;
  totalOvertimeMinutes: number;
  byBreakType: Record<
    BreakType,
    { count: number; totalMinutes: number; overtimeMinutes: number }
  >;
  employeesWithOvertime: Array<{
    employee_id: string;
    full_name: string;
    department: string;
    extra_minutes: number;
  }>;
}

export interface MonthlyReportRow {
  employee_id: string;
  full_name: string;
  department: string;
  totalBreakMinutes: number;
  totalOvertimeMinutes: number;
  exceededCount: number;
  breakCount: number;
  averageBreakMinutes: number;
  breakfastCount: number;
  coffeeCount: number;
  lunchCount: number;
  breakfastMinutes: number;
  coffeeMinutes: number;
  lunchMinutes: number;
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          employee_id: string;
          full_name: string;
          email: string | null;
          department: string;
          designation: string;
          shift: string;
          allowed_break_minutes: number;
          role: UserRole;
          is_active: boolean;
          joining_date: string | null;
          break_access_blocked_until: string | null;
          break_access_block_reason: string | null;
          pin_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          employee_id: string;
          full_name: string;
          email?: string | null;
          department?: string;
          designation?: string;
          shift?: string;
          allowed_break_minutes?: number;
          role?: UserRole;
          is_active?: boolean;
          joining_date?: string | null;
          break_access_blocked_until?: string | null;
          break_access_block_reason?: string | null;
          pin_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          full_name?: string;
          email?: string | null;
          department?: string;
          designation?: string;
          shift?: string;
          allowed_break_minutes?: number;
          role?: UserRole;
          is_active?: boolean;
          joining_date?: string | null;
          break_access_blocked_until?: string | null;
          break_access_block_reason?: string | null;
          pin_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      break_sessions: {
        Row: {
          id: string;
          employee_id: string;
          break_date: string;
          break_type: BreakType;
          started_at: string;
          ended_at: string | null;
          allowed_minutes: number;
          actual_minutes: number | null;
          actual_seconds: number | null;
          extra_minutes: number | null;
          extra_seconds: number | null;
          status: BreakStatus;
          google_sheet_sync_status: SyncStatus;
          google_sheet_row_id: number | null;
          google_sheet_synced_at: string | null;
          google_sheet_error: string | null;
          approved_overtime_minutes: number | null;
          admin_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          break_date: string;
          break_type: BreakType;
          started_at?: string;
          ended_at?: string | null;
          allowed_minutes: number;
          actual_minutes?: number | null;
          actual_seconds?: number | null;
          extra_minutes?: number | null;
          extra_seconds?: number | null;
          status?: BreakStatus;
          google_sheet_sync_status?: SyncStatus;
          google_sheet_row_id?: number | null;
          google_sheet_synced_at?: string | null;
          google_sheet_error?: string | null;
          approved_overtime_minutes?: number | null;
          admin_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          break_date?: string;
          break_type?: BreakType;
          started_at?: string;
          ended_at?: string | null;
          allowed_minutes?: number;
          actual_minutes?: number | null;
          actual_seconds?: number | null;
          extra_minutes?: number | null;
          extra_seconds?: number | null;
          status?: BreakStatus;
          google_sheet_sync_status?: SyncStatus;
          google_sheet_row_id?: number | null;
          google_sheet_synced_at?: string | null;
          google_sheet_error?: string | null;
          approved_overtime_minutes?: number | null;
          admin_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "break_sessions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      office_settings: {
        Row: {
          id: number;
          office_name: string;
          timezone: string;
          default_break_minutes: number;
          break_warning_minutes: number;
          break_test_mode: boolean;
          break_test_minutes: number;
          grace_period_minutes: number;
          daily_max_breaks: number;
          min_work_minutes_before_break: number;
          max_simultaneous_breaks: number;
          office_start_time: string;
          office_end_time: string;
          allow_weekend_breaks: boolean;
          auto_end_breaks: boolean;
          google_sheet_id: string | null;
          google_sheet_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          office_name?: string;
          timezone?: string;
          default_break_minutes?: number;
          break_warning_minutes?: number;
          break_test_mode?: boolean;
          break_test_minutes?: number;
          grace_period_minutes?: number;
          daily_max_breaks?: number;
          min_work_minutes_before_break?: number;
          max_simultaneous_breaks?: number;
          office_start_time?: string;
          office_end_time?: string;
          allow_weekend_breaks?: boolean;
          auto_end_breaks?: boolean;
          google_sheet_id?: string | null;
          google_sheet_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          office_name?: string;
          timezone?: string;
          default_break_minutes?: number;
          break_warning_minutes?: number;
          break_test_mode?: boolean;
          break_test_minutes?: number;
          grace_period_minutes?: number;
          daily_max_breaks?: number;
          min_work_minutes_before_break?: number;
          max_simultaneous_breaks?: number;
          office_start_time?: string;
          office_end_time?: string;
          allow_weekend_breaks?: boolean;
          auto_end_breaks?: boolean;
          google_sheet_id?: string | null;
          google_sheet_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      coverage_rules: {
        Row: CoverageRule;
        Insert: {
          id?: string;
          department: string;
          minimum_available?: number;
          max_on_break?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<CoverageRule>;
        Relationships: [];
      };
      break_bookings: {
        Row: {
          id: string;
          employee_id: string;
          scheduled_start: string;
          scheduled_end: string;
          status: BookingStatus;
          position: number;
          approved_by: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          scheduled_start: string;
          scheduled_end: string;
          status?: BookingStatus;
          position?: number;
          approved_by?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          scheduled_start?: string;
          scheduled_end?: string;
          status?: BookingStatus;
          position?: number;
          approved_by?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "break_bookings_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_type?: string;
          action: string;
          target_type: string;
          target_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: Partial<AuditLog>;
        Relationships: [];
      };
      login_attempts: {
        Row: LoginAttempt;
        Insert: {
          id?: string;
          employee_id?: string | null;
          identifier: string;
          succeeded?: boolean;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<LoginAttempt>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      list_active_employees_for_login: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          employee_id: string;
          full_name: string;
          department: string;
          role: UserRole;
        }[];
      };
      promote_user_to_admin: {
        Args: {
          p_email: string;
          p_full_name?: string | null;
          p_employee_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["employees"]["Row"];
      };
    };
    Enums: {
      user_role: UserRole;
      break_status: BreakStatus;
      sync_status: SyncStatus;
      break_type: BreakType;
      booking_status: BookingStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
