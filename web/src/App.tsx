import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { ProtectedLayout, RequireRole } from "./components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/admin/Users";
import Employees from "./pages/Employees";
import Departments from "./pages/admin/Departments";
import Schedules from "./pages/admin/Schedules";
import Attendance from "./pages/Attendance";
import MyAttendance from "./pages/employee/MyAttendance";
import Corrections from "./pages/Corrections";
import Reports from "./pages/Reports";
import AuditLog from "./pages/admin/AuditLog";
import SettingsPage from "./pages/admin/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/users" element={<RequireRole roles={["admin"]}><Users /></RequireRole>} />
              <Route path="/employees" element={<RequireRole roles={["admin", "hr"]}><Employees /></RequireRole>} />
              <Route path="/departments" element={<RequireRole roles={["admin"]}><Departments /></RequireRole>} />
              <Route path="/schedules" element={<RequireRole roles={["admin"]}><Schedules /></RequireRole>} />
              <Route path="/attendance" element={<RequireRole roles={["admin", "hr"]}><Attendance /></RequireRole>} />
              <Route path="/my-attendance" element={<RequireRole roles={["employee"]}><MyAttendance /></RequireRole>} />
              <Route path="/corrections" element={<Corrections />} />
              <Route path="/reports" element={<RequireRole roles={["admin", "hr"]}><Reports /></RequireRole>} />
              <Route path="/audit-log" element={<RequireRole roles={["admin"]}><AuditLog /></RequireRole>} />
              <Route path="/settings" element={<RequireRole roles={["admin"]}><SettingsPage /></RequireRole>} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
