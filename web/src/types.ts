export type Role = "admin" | "hr" | "employee";
export type UserStatus = "active" | "inactive";
export type EmploymentStatus = "active" | "inactive" | "on_leave" | "separated";
export type AttendanceStatus = "present" | "late" | "absent" | "on_leave" | "undertime" | "overtime" | "incomplete";
export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  company_id: string;
  username: string;
  employee_code: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  role: Role;
  status: UserStatus;
  employment_status: EmploymentStatus;
  department_id: string | null;
  position: string | null;
  date_hired: string | null;
  schedule_id: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  departments?: { name: string } | null;
  work_schedules?: { name: string; start_time: string; end_time: string } | null;
}

export interface Department {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface WorkSchedule {
  id: string;
  company_id: string;
  name: string;
  work_days: number[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_active: boolean;
}

export interface Attendance {
  id: string;
  employee_id: string;
  company_id: string;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  time_in_lat: number | null;
  time_in_lng: number | null;
  time_out_lat: number | null;
  time_out_lng: number | null;
  hours_worked: number | null;
  status: AttendanceStatus;
  created_at: string;
  updated_at: string;
  profiles?: { first_name: string; last_name: string; employee_code: string | null; department_id: string | null } | null;
}

export interface AttendanceCorrection {
  id: string;
  employee_id: string;
  attendance_id: string | null;
  work_date: string;
  requested_time_in: string | null;
  requested_time_out: string | null;
  reason: string;
  notes: string | null;
  status: CorrectionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  profiles?: { first_name: string; last_name: string; employee_code: string | null } | null;
}

export interface CompanySettings {
  id: string;
  company_id: string;
  workplace_lat: number | null;
  workplace_lng: number | null;
  geofence_radius_m: number;
  geofence_enabled: boolean;
  late_threshold_minutes: number;
  overtime_after_minutes: number;
}

export interface AuditLog {
  id: string;
  company_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  module: string;
  target: string | null;
  details: unknown;
  created_at: string;
}
