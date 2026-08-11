export type UserRole = "employee" | "admin";
export type BreakStatus = "active" | "within_limit" | "exceeded";
export type SyncStatus = "pending" | "synced" | "failed" | "not_applicable";
export type BreakType = "breakfast" | "coffee" | "lunch";

export interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  department: string;
  allowed_break_minutes: number;
  role: UserRole;
  is_active: boolean;
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
  google_sheet_id: string | null;
  google_sheet_name: string;
  created_at: string;
  updated_at: string;
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
          allowed_break_minutes: number;
          role: UserRole;
          is_active: boolean;
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
          allowed_break_minutes?: number;
          role?: UserRole;
          is_active?: boolean;
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
          allowed_break_minutes?: number;
          role?: UserRole;
          is_active?: boolean;
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
          google_sheet_id?: string | null;
          google_sheet_name?: string;
          created_at?: string;
          updated_at?: string;
        };
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
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_active_employee: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      break_status: BreakStatus;
      sync_status: SyncStatus;
      break_type: BreakType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
